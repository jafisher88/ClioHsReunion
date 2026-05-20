import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';
import { recipientsForFollowUp } from '../../../../../lib/blast-resend';
import { getAudienceId, listUnsubscribeHeaders } from '../../../../../lib/audience';
import { personalize, resolveFirstNames } from '../../../../../lib/personalization';
import {
  renderHtmlEmail,
  resendBatch,
  resendUpsertContacts,
  type ResendEmail,
} from '../../../../../lib/resend';

/**
 * POST /api/admin/blast/:id/resend
 *
 * Sends the parent blast to anyone in its original audience who hasn't
 * already received it (across the root + every direct follow-up). Each
 * call creates a new EmailBlasts row with ParentBlastId = root.Id so
 * future resends keep diffing against the full chain.
 *
 * Safety rails baked into the contract:
 *  - 30-second idempotency guard: a second POST against the same root
 *    inside 30s returns 409 without sending — catches double-clicks and
 *    accidental browser-history re-submits.
 *  - At-send-time diff: if the only "new" recipient unsubscribed between
 *    preview and POST, the diff is recomputed and we return 409 instead
 *    of inserting a zero-recipient audit row.
 *  - Custom-audience refusal: custom recipient lists aren't re-evaluable
 *    (the original was an admin-typed snapshot), so the endpoint refuses
 *    with 409 / reason='custom-audience'.
 *
 * Partial Resend failure semantics match the existing POST in
 * src/pages/api/admin/blast.ts: if batch N+1 fails after batch N
 * succeeded, the audit row IS inserted with whatever EmailBlastSends
 * rows we already wrote, and the response is 502. Network failure
 * BEFORE any batch starts leaves no rows behind.
 */

const IDEMPOTENCY_WINDOW_SECONDS = 30;
// Resend pipeline rarely takes more than a few seconds end-to-end; a 5
// minute stale-lock TTL leaves room for slow batches AND auto-recovers
// from a worker crash mid-send.
const STALE_LOCK_AGE = '-5 minutes';

interface ResendPayload {
  subject: string;
  body: string;
}

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

function validate(body: unknown): { ok: true; value: ResendPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (subject.length > 200) return { ok: false, error: 'Subject is too long (max 200 chars).' };

  const bodyText = typeof b.body === 'string' ? b.body.trim() : '';
  if (!bodyText) return { ok: false, error: 'Message body is required.' };
  if (bodyText.length > 20000) return { ok: false, error: 'Message body is too long (max 20,000 chars).' };

  return { ok: true, value: { subject, body: bodyText } };
}

export const POST: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.RESEND_API_KEY) return jsonError('Resend not configured. Set RESEND_API_KEY secret.', 503);

  const rootBlastId = Number.parseInt(String(params.id ?? ''), 10);
  if (!Number.isInteger(rootBlastId) || rootBlastId <= 0) {
    return jsonError('Bad blast id.', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);

  // 404 short-circuit so non-existent ids don't burn an idempotency
  // window slot or trigger downstream throws.
  const exists = await env.DB
    .prepare('SELECT Id FROM EmailBlasts WHERE Id = ?1')
    .bind(rootBlastId)
    .first<{ Id: number }>();
  if (!exists) return jsonError('Blast not found.', 404);

  // Idempotency, sequential: bail if another resend for this root was
  // AUDITED in the last 30s. Catches the "first POST succeeded, user
  // clicked again 10s later" scenario. Cheap pre-check; the lock below
  // is the authoritative guard for concurrent in-flight POSTs.
  const recent = await env.DB
    .prepare(
      `SELECT Id FROM EmailBlasts
        WHERE ParentBlastId = ?1
          AND SentAt > datetime('now', ?2)
        ORDER BY SentAt DESC
        LIMIT 1`,
    )
    .bind(rootBlastId, `-${IDEMPOTENCY_WINDOW_SECONDS} seconds`)
    .first<{ Id: number }>();
  if (recent) {
    return jsonError('A resend for this campaign was sent in the last 30 seconds.', 409, {
      reason: 'recent-resend',
      retryAfterSeconds: IDEMPOTENCY_WINDOW_SECONDS,
    });
  }

  // Idempotency, concurrent: take an atomic D1-serialized lock so two
  // simultaneous POSTs can't both pass the SentAt check and both send.
  // INSERT on a PRIMARY KEY collision throws; we catch and 409. Stale
  // locks (>5 min — well past any successful pipeline run) are swept
  // first so a crashed worker doesn't deadlock the campaign forever.
  await env.DB
    .prepare(`DELETE FROM ResendLocks WHERE AcquiredAt < datetime('now', ?1)`)
    .bind(STALE_LOCK_AGE)
    .run();
  try {
    await env.DB
      .prepare(`INSERT INTO ResendLocks (ParentBlastId) VALUES (?1)`)
      .bind(rootBlastId)
      .run();
  } catch {
    return jsonError('A resend is already in progress for this campaign.', 409, {
      reason: 'concurrent-resend',
    });
  }

  try {
    return await resendImpl(rootBlastId, result.value, admin.email, env);
  } finally {
    // Always release. The send-and-audit block has its own error
    // handling; this just keeps the lock from outliving the request.
    await env.DB
      .prepare(`DELETE FROM ResendLocks WHERE ParentBlastId = ?1`)
      .bind(rootBlastId)
      .run();
  }
};

async function resendImpl(
  rootBlastId: number,
  payload: ResendPayload,
  adminEmail: string,
  env: { DB: D1Database; RESEND_API_KEY?: string },
): Promise<Response> {
  // Compute the at-send-time diff. If the preview said 1 person was
  // new but they unsubscribed in the meantime, the diff is empty and
  // we refuse instead of writing a no-op audit row.
  const preview = await recipientsForFollowUp(rootBlastId, env.DB);
  if (preview.reason !== null) {
    const message =
      preview.reason === 'custom-audience'
        ? "Custom-audience blasts can't be resent."
        : preview.reason === 'no-audience'
          ? 'No one currently matches the original audience.'
          : 'No new audience members to send to.';
    return jsonError(message, 409, { reason: preview.reason });
  }

  const recipients = preview.recipients;
  const subjectTpl = payload.subject;
  const bodyTpl = payload.body;

  // ---- Send pipeline. Mirrors src/pages/api/admin/blast.ts:153-217. ----

  const { byEmail, fallback } = await resolveFirstNames(env.DB, recipients);

  let audienceId: string | undefined;
  try {
    audienceId = await getAudienceId(env.DB, env.RESEND_API_KEY!);
  } catch (err) {
    console.error('[blast-resend] could not resolve Resend audience', err);
    // Non-fatal — send still proceeds without the audience hook.
  }

  if (audienceId) {
    const contacts = recipients.map((email) => ({
      email,
      firstName: byEmail.get(email.toLowerCase().trim()),
    }));
    await resendUpsertContacts(
      env.RESEND_API_KEY!,
      audienceId,
      contacts,
      (email, err) => console.error('[blast-resend] upsert contact failed', email, err),
    );
  }

  const batches: string[][] = [];
  for (let i = 0; i < recipients.length; i += 100) {
    batches.push(recipients.slice(i, i + 100));
  }

  const headers = audienceId ? listUnsubscribeHeaders() : undefined;
  const sentRows: Array<{ email: string; resendId: string | null }> = [];
  let batchError: { afterSent: number; message: string } | null = null;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const msgs: ResendEmail[] = batch.map((to) => {
      const firstName = byEmail.get(to.toLowerCase().trim()) || fallback;
      const subject = personalize(subjectTpl, firstName);
      const text = personalize(bodyTpl, firstName);
      const html = renderHtmlEmail({ subject, bodyText: text });
      return { to, subject, html, text, replyTo: adminEmail, audienceId, headers };
    });
    try {
      const res = await resendBatch(env.RESEND_API_KEY!, msgs);
      const ids = res.data ?? [];
      batch.forEach((email, i) => {
        sentRows.push({ email, resendId: ids[i]?.id ?? null });
      });
    } catch (err) {
      console.error('[blast-resend] Resend batch failed', err);
      batchError = {
        afterSent: batchIndex * 100,
        message: (err as Error).message,
      };
      break;
    }
  }

  // No batch ever succeeded → nothing to audit. Tell the caller and
  // bail before writing anything.
  if (sentRows.length === 0 && batchError) {
    return jsonError(`Send failed before any batch completed. ${batchError.message}`, 502);
  }

  // ---- Audit insert. ParentBlastId = root so the chain stays flat. ----

  const firstBatchId = sentRows.find((r) => r.resendId)?.resendId ?? null;
  let newBlastId: number | null = null;
  try {
    const inserted = await env.DB
      .prepare(
        `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy, ResendId, ParentBlastId)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         RETURNING Id`,
      )
      .bind(
        payload.subject,
        payload.body,
        preview.rootRow.Audience,
        sentRows.length,
        adminEmail,
        firstBatchId,
        rootBlastId,
      )
      .first<{ Id: number }>();

    newBlastId = inserted?.Id ?? null;
    if (newBlastId && sentRows.length > 0) {
      // D1 caps bound params at 100/query. 30 rows × 3 binds = 90 — safe.
      const chunkSize = 30;
      for (let i = 0; i < sentRows.length; i += chunkSize) {
        const chunk = sentRows.slice(i, i + chunkSize);
        const placeholders = chunk
          .map((_, j) => `(?${j * 3 + 1}, ?${j * 3 + 2}, ?${j * 3 + 3})`)
          .join(', ');
        const binds: unknown[] = [];
        for (const row of chunk) {
          binds.push(newBlastId, row.email, row.resendId);
        }
        await env.DB
          .prepare(`INSERT INTO EmailBlastSends (BlastId, Email, ResendId) VALUES ${placeholders}`)
          .bind(...binds)
          .run();
      }
    }
  } catch (err) {
    console.error('[blast-resend] audit log insert failed', err);
  }

  // Partial-failure path: some emails went out, then a later batch
  // failed. Tell the caller with 502 but keep the partial audit row.
  if (batchError) {
    return jsonError(
      `Send failed after ${batchError.afterSent} of ${recipients.length}. ${batchError.message}`,
      502,
      { blastId: newBlastId, recipientCount: sentRows.length },
    );
  }

  return Response.json({
    ok: true,
    blastId: newBlastId,
    recipientCount: sentRows.length,
  });
};
