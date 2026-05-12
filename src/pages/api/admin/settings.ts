import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';
import { daysUntilEvent, getTemplateText, runReminder, type ReminderKind } from '../../../lib/reminders';

const ALLOWED_KEYS = new Set(['event_date']);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** GET /api/admin/settings → { event_date, daysUntil, ... } */
export const GET: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const rows = await env.DB
    .prepare(`SELECT Key, Value FROM Settings`)
    .all<{ Key: string; Value: string }>();
  const settings: Record<string, string> = {};
  for (const r of rows.results ?? []) settings[r.Key] = r.Value;
  const eventDate = settings.event_date ?? null;
  return Response.json({
    settings,
    daysUntil: daysUntilEvent(eventDate),
  });
};

/** POST /api/admin/settings — upsert a setting value */
export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);
  const b = body as Record<string, unknown>;

  const key = typeof b.key === 'string' ? b.key.trim() : '';
  if (!ALLOWED_KEYS.has(key)) return jsonError(`Unknown setting "${key}".`, 400);

  const value = typeof b.value === 'string' ? b.value.trim() : '';

  if (key === 'event_date') {
    if (value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return jsonError('Event date must be YYYY-MM-DD.', 400);
    }
  }

  if (value === '') {
    await env.DB.prepare(`DELETE FROM Settings WHERE Key = ?1`).bind(key).run();
  } else {
    await env.DB
      .prepare(
        `INSERT INTO Settings (Key, Value, UpdatedBy)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value,
                                        UpdatedAt = CURRENT_TIMESTAMP,
                                        UpdatedBy = excluded.UpdatedBy`
      )
      .bind(key, value, admin.email)
      .run();
  }

  return Response.json({ ok: true });
};

/**
 * POST /api/admin/settings/test-reminder?kind=30day
 * Sends a single preview email to the requesting admin. Doesn't record in
 * ReminderSends. Useful for double-checking the template before automated
 * sends fire.
 */
export const PUT: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.RESEND_API_KEY) return jsonError('Resend not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);
  const b = body as Record<string, unknown>;
  const kind = typeof b.kind === 'string' ? b.kind : '';
  if (!['30day', '7day', 'dayof'].includes(kind)) return jsonError('Bad reminder kind.', 400);

  const dateRow = await env.DB
    .prepare(`SELECT Value FROM Settings WHERE Key = 'event_date'`)
    .first<{ Value: string }>();
  if (!dateRow?.Value) return jsonError('Set the event date before previewing a reminder.', 400);

  const result = await runReminder({
    kind: kind as ReminderKind,
    eventDate: dateRow.Value,
    db: env.DB,
    resendApiKey: env.RESEND_API_KEY!,
    overrideRecipients: [admin.email],
    skipRecording: true,
    replyTo: admin.email,
  });

  return Response.json({ ok: true, result });
};
