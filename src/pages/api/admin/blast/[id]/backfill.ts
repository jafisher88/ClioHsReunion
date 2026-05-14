import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';
import { resendListEmails, type ResendListedEmail } from '../../../../../lib/resend';

interface BlastRow {
  Id: number;
  Subject: string;
  RecipientCount: number;
  SentAt: string;       // SQLite "YYYY-MM-DD HH:MM:SS" UTC
}

/**
 * POST /api/admin/blast/:id/backfill
 *
 * One-time recovery for blasts that were sent before per-recipient tracking
 * landed (so EmailBlastSends has zero rows for them). We walk Resend's
 * paginated GET /emails newest → oldest, stop once we're past the blast's
 * send window, and insert one EmailBlastSends row per email that matches by
 * subject + created_at window. Status comes from each row's `last_event` so
 * we don't need a follow-up poll per recipient.
 *
 * Refuses if rows already exist (use Refresh instead) unless ?force=1, which
 * blows them away first — meant for the rare "I tried to backfill, half the
 * matches were wrong" recovery case.
 */
const PAGE_SIZE        = 100;
const PAGE_LIMIT       = 25;       // hard cap so a wrong subject can't walk forever
const PRE_WINDOW_MS    =  5 * 60 * 1000;
const POST_WINDOW_MS   = 30 * 60 * 1000;

function dbToMs(s: string): number {
  // SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC.
  return Date.parse(s.replace(' ', 'T') + 'Z');
}

export const POST: APIRoute = async ({ request, params }) => {
  try {
    return await runBackfill(request, params);
  } catch (err) {
    // Surface the actual failure back to the UI so we don't get opaque 500s.
    // Resend / D1 errors land here; logged for the worker tail too.
    console.error('[blast backfill] uncaught', err);
    return Response.json({
      error: `Backfill crashed: ${(err as Error).message}`,
    }, { status: 500 });
  }
};

async function runBackfill(request: Request, params: Record<string, string | undefined>): Promise<Response> {
  const admin = await getAdmin(request, env);
  if (!admin) return Response.json({ error: 'Not authorized.' }, { status: 401 });
  if (!env.DB) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  if (!env.RESEND_API_KEY) {
    return Response.json({ error: 'Resend not configured. Set RESEND_API_KEY secret.' }, { status: 503 });
  }

  const blastId = Number.parseInt(String(params.id ?? ''), 10);
  if (!Number.isInteger(blastId) || blastId <= 0) {
    return Response.json({ error: 'Bad blast id.' }, { status: 400 });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';

  const blast = await env.DB
    .prepare('SELECT Id, Subject, RecipientCount, SentAt FROM EmailBlasts WHERE Id = ?1')
    .bind(blastId)
    .first<BlastRow>();
  if (!blast) return Response.json({ error: 'Blast not found.' }, { status: 404 });

  const sentMs = dbToMs(blast.SentAt);
  if (!Number.isFinite(sentMs)) {
    return Response.json({ error: `Could not parse SentAt: ${blast.SentAt}` }, { status: 500 });
  }
  const windowStartMs = sentMs - PRE_WINDOW_MS;
  const windowEndMs   = sentMs + POST_WINDOW_MS;

  const existing = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM EmailBlastSends WHERE BlastId = ?1')
    .bind(blastId)
    .first<{ n: number }>();
  const existingCount = existing?.n ?? 0;

  if (existingCount > 0 && !force) {
    return Response.json({
      error: `Blast already has ${existingCount} per-recipient row(s). Pass ?force=1 to wipe and re-backfill.`,
    }, { status: 409 });
  }

  // Walk Resend pages. The list endpoint orders newest first, so as soon as
  // we see a page whose oldest row is older than windowStartMs we can stop.
  const matches: ResendListedEmail[] = [];
  let after: string | undefined;
  let pagesFetched = 0;
  let stoppedReason: 'past-window' | 'exhausted' | 'page-cap' = 'exhausted';

  for (let i = 0; i < PAGE_LIMIT; i++) {
    const page = await resendListEmails(env.RESEND_API_KEY!, { limit: PAGE_SIZE, after });
    pagesFetched++;
    if (page.data.length === 0) break;

    let oldestOnPageMs = Number.POSITIVE_INFINITY;
    for (const row of page.data) {
      const t = Date.parse(row.created_at);
      if (Number.isFinite(t)) oldestOnPageMs = Math.min(oldestOnPageMs, t);
      if (
        Number.isFinite(t) &&
        t >= windowStartMs &&
        t <= windowEndMs &&
        row.subject === blast.Subject
      ) {
        matches.push(row);
      }
    }

    if (oldestOnPageMs < windowStartMs) { stoppedReason = 'past-window'; break; }
    if (!page.has_more)                 { stoppedReason = 'exhausted';   break; }
    after = page.data[page.data.length - 1].id;
    if (i === PAGE_LIMIT - 1)           { stoppedReason = 'page-cap'; }
  }

  if (matches.length === 0) {
    return Response.json({
      ok: false,
      error: 'No matching emails in Resend within the send window.',
      blastSubject: blast.Subject,
      blastSentAt: blast.SentAt,
      pagesFetched,
      stoppedReason,
    }, { status: 404 });
  }

  // If forcing, wipe existing rows for this blast first so the insert is idempotent.
  if (existingCount > 0 && force) {
    await env.DB.prepare('DELETE FROM EmailBlastSends WHERE BlastId = ?1').bind(blastId).run();
  }

  // Insert in chunks. D1 caps bound params at 100/query; we use 4 binds per
  // row (BlastId, Email, ResendId, Status) so 20 rows = 80 binds — safely
  // under the cap with headroom for future column additions.
  const tally: Record<string, number> = {};
  let inserted = 0;
  const CHUNK = 20;

  for (let i = 0; i < matches.length; i += CHUNK) {
    const chunk = matches.slice(i, i + CHUNK);
    const rowsToInsert: Array<{ email: string; resendId: string; status: string }> = [];
    for (const m of chunk) {
      const email = (m.to?.[0] ?? '').toLowerCase().trim();
      if (!email) continue;
      const status = (m.last_event ?? 'sent').toLowerCase();
      tally[status] = (tally[status] ?? 0) + 1;
      rowsToInsert.push({ email, resendId: m.id, status });
    }
    if (rowsToInsert.length === 0) continue;

    // 4 binds per row (BlastId, Email, ResendId, Status) + a literal
    // CURRENT_TIMESTAMP for LastCheckedAt so we can mark the row as "fresh
    // straight from Resend" without burning a 5th bind variable.
    const placeholders = rowsToInsert
      .map((_, j) => `(?${j * 4 + 1}, ?${j * 4 + 2}, ?${j * 4 + 3}, ?${j * 4 + 4}, CURRENT_TIMESTAMP)`)
      .join(', ');
    const binds: unknown[] = [];
    for (const r of rowsToInsert) {
      binds.push(blastId, r.email, r.resendId, r.status);
    }
    await env.DB
      .prepare(
        `INSERT INTO EmailBlastSends (BlastId, Email, ResendId, Status, LastCheckedAt)
         VALUES ${placeholders}`
      )
      .bind(...binds)
      .run();
    inserted += rowsToInsert.length;
  }

  return Response.json({
    ok: true,
    inserted,
    expected: blast.RecipientCount,
    matched: matches.length,
    pagesFetched,
    stoppedReason,
    tally,
    note: inserted < blast.RecipientCount
      ? `Inserted ${inserted} but the blast was sent to ${blast.RecipientCount} — Resend may have aged out earlier rows or the subject changed.`
      : undefined,
  });
};
