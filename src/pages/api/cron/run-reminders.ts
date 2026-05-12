import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { daysUntilEvent, reminderKindFor, runReminder, type ReminderKind } from '../../../lib/reminders';

function unauthorized(): Response {
  return new Response('Unauthorized', { status: 401 });
}

function isAuthorized(request: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  const fromHeader = request.headers.get('x-cron-key');
  const fromQuery = url.searchParams.get('key');
  return fromHeader === expected || fromQuery === expected;
}

async function getEventDate(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT Value FROM Settings WHERE Key = 'event_date'`)
    .first<{ Value: string }>();
  return row?.Value ?? null;
}

/**
 * Internal endpoint hit by an external scheduler (cron-job.org, etc.) once a
 * day. Checks the configured event date; if today is exactly 30/7/0 days
 * before the event, sends the matching reminder.
 *
 * Idempotent: per-recipient tracking in ReminderSends prevents duplicates.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) return unauthorized();
  if (!env.DB) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  if (!env.RESEND_API_KEY) return Response.json({ error: 'Resend not configured.' }, { status: 503 });

  const eventDate = await getEventDate(env.DB);
  const daysUntil = daysUntilEvent(eventDate);
  const kind = reminderKindFor(daysUntil);

  const report: Record<string, unknown> = {
    ok: true,
    eventDate,
    daysUntil,
    kind,
  };

  if (!kind || !eventDate) {
    report.fired = false;
    report.reason = kind ? null : 'today is not a reminder day';
    return Response.json(report);
  }

  const url = new URL(request.url);
  // Allow `?force=true` to override "already-sent" tracking when the admin
  // really wants to force a send (the manual-run button uses this).
  const force = url.searchParams.get('force') === 'true';

  const result = await runReminder({
    kind: kind as ReminderKind,
    eventDate,
    db: env.DB,
    resendApiKey: env.RESEND_API_KEY!,
    skipRecording: force,
  });

  report.fired = true;
  report.result = result;
  return Response.json(report);
};

/** GET returns a status snapshot — useful for "Run Now" button to preview. */
export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) return unauthorized();
  if (!env.DB) return Response.json({ error: 'Database not configured.' }, { status: 503 });

  const eventDate = await getEventDate(env.DB);
  const daysUntil = daysUntilEvent(eventDate);
  const kind = reminderKindFor(daysUntil);
  return Response.json({ eventDate, daysUntil, kind });
};
