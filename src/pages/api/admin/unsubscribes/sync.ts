import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../lib/admin-auth';
import { resendListContacts } from '../../../../lib/resend';
import { getAudienceId } from '../../../../lib/audience';

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * POST /api/admin/unsubscribes/sync
 *
 * Pulls every contact in our Resend audience and mirrors the unsubscribed
 * flag into the local Unsubscribes table. Idempotent — re-running just
 * refreshes timestamps and adds/removes rows as state changes upstream.
 */
export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.RESEND_API_KEY) return jsonError('Resend not configured.', 503);

  let audienceId: string;
  try {
    audienceId = await getAudienceId(env.DB, env.RESEND_API_KEY);
  } catch (err) {
    return jsonError(`Could not resolve Resend audience: ${(err as Error).message}`, 502);
  }

  let contacts;
  try {
    contacts = await resendListContacts(env.RESEND_API_KEY, audienceId);
  } catch (err) {
    return jsonError(`Resend list failed: ${(err as Error).message}`, 502);
  }

  const optedOut = contacts.filter((c) => c.unsubscribed === true);
  const subscribed = contacts.filter((c) => c.unsubscribed !== true);

  // Upsert unsubscribed contacts.
  let upserted = 0;
  for (const c of optedOut) {
    const email = c.email.toLowerCase().trim();
    if (!email) continue;
    try {
      await env.DB
        .prepare(
          `INSERT INTO Unsubscribes (Email, Source, UnsubscribedAt, SyncedAt)
           VALUES (?1, 'resend', ?2, CURRENT_TIMESTAMP)
           ON CONFLICT(Email) DO UPDATE SET
             Source = 'resend',
             UnsubscribedAt = COALESCE(excluded.UnsubscribedAt, Unsubscribes.UnsubscribedAt),
             SyncedAt = CURRENT_TIMESTAMP`,
        )
        .bind(email, c.created_at ?? null)
        .run();
      upserted += 1;
    } catch (err) {
      console.error('[unsubscribes/sync] upsert failed', email, err);
    }
  }

  // Anyone Resend now reports as subscribed-again: clear from local list,
  // but only if it was sourced from Resend (don't clobber manual opt-outs).
  let cleared = 0;
  for (const c of subscribed) {
    const email = c.email.toLowerCase().trim();
    if (!email) continue;
    try {
      const res = await env.DB
        .prepare(`DELETE FROM Unsubscribes WHERE Email = ?1 AND Source = 'resend'`)
        .bind(email)
        .run();
      cleared += res.meta?.changes ?? 0;
    } catch (err) {
      console.error('[unsubscribes/sync] re-subscribe clear failed', email, err);
    }
  }

  const total = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM Unsubscribes`)
    .first<{ n: number }>();

  return Response.json({
    ok: true,
    audienceId,
    fetched: contacts.length,
    unsubscribedFromResend: optedOut.length,
    upserted,
    cleared,
    totalLocal: total?.n ?? 0,
  });
};
