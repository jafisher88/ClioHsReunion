import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { TRACKED_EVENT_TYPES, verifyResendWebhook, WebhookVerificationError } from '../../../lib/resend-webhook';
import { shouldUpdate } from '../../../lib/webhook-status';

/**
 * Public webhook receiver for Resend events.
 *
 * Resend → POST /api/webhooks/resend
 *   svix-id, svix-timestamp, svix-signature headers + JSON body.
 *
 * Flow:
 *   1. Verify the Svix signature with our shared secret. Bad sig → 401, which
 *      tells Resend to stop blasting us with retries against a wrong key.
 *   2. Insert (svix-id) into WebhookEvents — PRIMARY KEY collision means
 *      this is a duplicate delivery, return 200 immediately.
 *   3. Map data.email_id → EmailBlastSends row(s) and update Status using
 *      the precedence rules (negative events always win; positive events
 *      only upgrade the funnel).
 *   4. Always return 200 on anything beyond signature failure — Svix retries
 *      with backoff on non-2xx, and we don't want a transient DB blip to
 *      trigger a retry storm. Errors get logged and the next event self-heals.
 */

export const POST: APIRoute = async ({ request }) => {
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.error('[resend webhook] RESEND_WEBHOOK_SECRET not configured');
    return new Response('Webhook secret not configured', { status: 503 });
  }
  if (!env.DB) return new Response('Database not configured', { status: 503 });

  // Read the raw body — Svix verification requires the exact bytes Resend
  // hashed, so do NOT JSON-parse first.
  const rawBody = await request.text();

  let event;
  try {
    event = verifyResendWebhook(env.RESEND_WEBHOOK_SECRET, rawBody, request.headers);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn('[resend webhook] verification failed', err.message);
      return new Response('Invalid signature', { status: 401 });
    }
    console.error('[resend webhook] unexpected verify error', err);
    return new Response('Verification error', { status: 401 });
  }

  // Past this point we ALWAYS return 200 — anything else makes Svix retry,
  // and we'd rather log + skip than receive the same event four times.
  const svixId = request.headers.get('svix-id') ?? '';
  const eventType = typeof event?.type === 'string' ? event.type : '';
  const emailId = typeof event?.data?.email_id === 'string' ? event.data.email_id : null;

  // Dedupe on svix-id. INSERT OR IGNORE → 0 rows changed = already seen.
  try {
    const insert = await env.DB
      .prepare(
        `INSERT OR IGNORE INTO WebhookEvents (EventId, EventType, EmailId)
         VALUES (?1, ?2, ?3)`
      )
      .bind(svixId, eventType, emailId)
      .run();
    const meta = insert.meta as { changes?: number } | undefined;
    if (meta && meta.changes === 0) {
      return Response.json({ ok: true, deduped: true });
    }
  } catch (err) {
    // Even dedupe failure shouldn't block — log and keep going so the status
    // update still has a chance to land.
    console.error('[resend webhook] dedupe insert failed', err);
  }

  if (!TRACKED_EVENT_TYPES.has(eventType) || !emailId) {
    return Response.json({ ok: true, ignored: eventType || 'unknown' });
  }

  // Strip the "email." prefix to match the Status values used in the
  // EmailBlastSends table (we store "delivered", not "email.delivered").
  const newStatus = eventType.replace(/^email\./, '');

  try {
    const matches = await env.DB
      .prepare(`SELECT Id, Status FROM EmailBlastSends WHERE ResendId = ?1`)
      .bind(emailId)
      .all<{ Id: number; Status: string }>();
    const rows = matches.results ?? [];

    let updatedCount = 0;
    for (const row of rows) {
      if (!shouldUpdate(row.Status, newStatus)) continue;
      await env.DB
        .prepare(
          `UPDATE EmailBlastSends
              SET Status = ?1,
                  LastCheckedAt = CURRENT_TIMESTAMP
            WHERE Id = ?2`
        )
        .bind(newStatus, row.Id)
        .run();
      updatedCount++;
    }

    return Response.json({
      ok: true,
      eventType,
      emailId,
      matched: rows.length,
      updated: updatedCount,
    });
  } catch (err) {
    console.error('[resend webhook] status update failed', err);
    // Still 200 — Svix will not retry, but we have the event in WebhookEvents
    // for offline replay if needed.
    return Response.json({ ok: true, error: 'status update failed' });
  }
};
