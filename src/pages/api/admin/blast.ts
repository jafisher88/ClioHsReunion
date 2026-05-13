import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';
import { renderHtmlEmail, resendBatch, resendUpsertContact, type ResendEmail } from '../../../lib/resend';
import { personalize, resolveFirstNames } from '../../../lib/personalization';
import { getAudienceId, listUnsubscribeHeaders } from '../../../lib/audience';

const VALID_AUDIENCES = new Set([
  'rsvp-yes',
  'rsvp-maybe',
  'rsvp-all',
  'volunteers',
  'everyone',
  'roster-no-rsvp',
  'custom',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function unsubscribedSet(db: D1Database): Promise<Set<string>> {
  const res = await db.prepare(`SELECT Email FROM Unsubscribes`).all<{ Email: string }>();
  return new Set((res.results ?? []).map((r) => r.Email.toLowerCase().trim()));
}

async function recipientsFor(audience: string, db: D1Database, customEmails: string[] = []): Promise<string[]> {
  let raw: string[];
  if (audience === 'custom') {
    raw = Array.from(
      new Set(
        customEmails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => EMAIL_RE.test(e) && e.length <= 320),
      ),
    );
  } else {
    let sql: string;
    switch (audience) {
      case 'rsvp-yes':   sql = `SELECT DISTINCT LOWER(Email) AS email FROM Rsvps WHERE Attending = 'yes'`; break;
      case 'rsvp-maybe': sql = `SELECT DISTINCT LOWER(Email) AS email FROM Rsvps WHERE Attending = 'maybe'`; break;
      case 'rsvp-all':   sql = `SELECT DISTINCT LOWER(Email) AS email FROM Rsvps`; break;
      case 'volunteers': sql = `SELECT DISTINCT LOWER(Email) AS email FROM Volunteers`; break;
      case 'everyone':
        sql = `SELECT email FROM (
                 SELECT DISTINCT LOWER(Email) AS email FROM Rsvps
                 UNION
                 SELECT DISTINCT LOWER(Email) AS email FROM Volunteers
               )`;
        break;
      case 'roster-no-rsvp':
        sql = `SELECT DISTINCT LOWER(Email) AS email FROM Classmates
                WHERE IsDeceased = 0
                  AND Email IS NOT NULL AND TRIM(Email) <> ''
                  AND LOWER(Email) NOT IN (SELECT LOWER(Email) FROM Rsvps WHERE Email IS NOT NULL)`;
        break;
      default:
        return [];
    }
    const res = await db.prepare(sql).all<{ email: string }>();
    raw = (res.results ?? []).map((r) => r.email).filter((e) => e && EMAIL_RE.test(e));
  }

  // Always exclude anyone on the local unsubscribe list. Resend will also
  // suppress on its side via the audience, but filtering here keeps counts
  // honest in the UI and avoids paying for ignored sends.
  const blocked = await unsubscribedSet(db);
  return raw.filter((e) => !blocked.has(e));
}

/** GET /api/admin/blast/recipients?audience=rsvp-yes → { count: N, emails?: […] } */
export const GET: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const url = new URL(request.url);
  const audience = url.searchParams.get('audience') ?? '';
  if (!VALID_AUDIENCES.has(audience) || audience === 'custom') {
    return jsonError('Invalid audience.', 400);
  }
  const emails = await recipientsFor(audience, env.DB);
  return Response.json({ count: emails.length, emails });
};

interface BlastPayload {
  subject: string;
  body: string;
  audience: string;
  customEmails?: string[];
  testMode?: boolean;
}

function validate(body: unknown): { ok: true; value: BlastPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (subject.length > 200) return { ok: false, error: 'Subject is too long (max 200 chars).' };

  const bodyText = typeof b.body === 'string' ? b.body.trim() : '';
  if (!bodyText) return { ok: false, error: 'Message body is required.' };
  if (bodyText.length > 20000) return { ok: false, error: 'Message body is too long (max 20,000 chars).' };

  const audience = typeof b.audience === 'string' ? b.audience : '';
  if (!VALID_AUDIENCES.has(audience)) return { ok: false, error: 'Pick a valid audience.' };

  let customEmails: string[] = [];
  if (audience === 'custom') {
    const raw = b.customEmails;
    if (!Array.isArray(raw)) return { ok: false, error: 'Custom audience needs an email list.' };
    customEmails = raw.filter((e): e is string => typeof e === 'string');
    if (customEmails.length === 0) return { ok: false, error: 'Add at least one email for a custom send.' };
  }

  const testMode = b.testMode === true;

  return { ok: true, value: { subject, body: bodyText, audience, customEmails, testMode } };
}

export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.RESEND_API_KEY) return jsonError('Resend not configured. Set RESEND_API_KEY secret.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);

  // Test mode: send only to the requesting admin so they can preview deliverability.
  const recipients = result.value.testMode
    ? [admin.email]
    : await recipientsFor(result.value.audience, env.DB, result.value.customEmails);

  if (recipients.length === 0) {
    return jsonError('No recipients matched that audience.', 400);
  }

  // Personalize per recipient: anywhere the admin typed {firstName} in the
  // subject or body gets replaced with the recipient's preferred name (with
  // a graceful chain of fallbacks → eventually "Mustang").
  const { byEmail, fallback } = await resolveFirstNames(env.DB, recipients);

  const subjectTpl = result.value.subject;
  const bodyTpl = result.value.body;

  // Resolve/cache the Resend audience id so the unsubscribe link in the
  // email footer routes back into a known audience.
  let audienceId: string | undefined;
  try {
    audienceId = await getAudienceId(env.DB, env.RESEND_API_KEY!);
  } catch (err) {
    console.error('[blast] could not resolve Resend audience', err);
    // Non-fatal: send still goes through, just without the audience hook.
  }

  // Upsert every recipient into the audience first so unsubscribes flow back.
  // Best-effort; we don't want a single contact failure to block the blast.
  if (audienceId) {
    await Promise.all(recipients.map(async (email) => {
      const firstName = byEmail.get(email.toLowerCase().trim());
      try {
        await resendUpsertContact(env.RESEND_API_KEY!, audienceId!, { email, firstName });
      } catch (err) {
        console.error('[blast] upsert contact failed', email, err);
      }
    }));
  }

  // Send in batches of 100 (Resend's batch endpoint limit).
  const batches: string[][] = [];
  for (let i = 0; i < recipients.length; i += 100) {
    batches.push(recipients.slice(i, i + 100));
  }

  const headers = audienceId ? listUnsubscribeHeaders() : undefined;

  let firstBatchId: string | undefined;
  for (const batch of batches) {
    const msgs: ResendEmail[] = batch.map((to) => {
      const firstName = byEmail.get(to.toLowerCase().trim()) || fallback;
      const subject = personalize(subjectTpl, firstName);
      const text = personalize(bodyTpl, firstName);
      const html = renderHtmlEmail({ subject, bodyText: text });
      return { to, subject, html, text, replyTo: admin.email, audienceId, headers };
    });
    try {
      const res = await resendBatch(env.RESEND_API_KEY!, msgs);
      if (!firstBatchId && res.data && res.data[0]?.id) {
        firstBatchId = res.data[0].id;
      }
    } catch (err) {
      console.error('[blast] Resend batch failed', err);
      return jsonError(
        `Send failed after ${batches.indexOf(batch) * 100} of ${recipients.length}. ${(err as Error).message}`,
        502,
      );
    }
  }

  // Log to audit only on actual broadcasts (not test sends).
  if (!result.value.testMode) {
    try {
      await env.DB
        .prepare(
          `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy, ResendId)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(
          result.value.subject,
          result.value.body,
          result.value.audience,
          recipients.length,
          admin.email,
          firstBatchId ?? null,
        )
        .run();
    } catch (err) {
      console.error('[blast] audit log insert failed', err);
    }
  }

  return Response.json({
    ok: true,
    recipientCount: recipients.length,
    testMode: !!result.value.testMode,
  });
};
