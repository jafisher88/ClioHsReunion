import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';
import { recipientsForFollowUp } from '../../../../../lib/blast-resend';

/**
 * GET /api/admin/blast/:id/resend-preview
 *
 * Powers the "Resend to new audience members" card on the blast detail
 * page. Re-evaluates the original audience against the current Rsvps /
 * Volunteers / Classmates state, subtracts every email that has already
 * received this blast (or any follow-up of it), and reports how many
 * new recipients would receive a follow-up send.
 *
 * Response is always Cache-Control: private, no-store — admin-only data
 * that must always reflect live state.
 *
 * Shape:
 *   401 { error }              when getAdmin returns null
 *   400 { error }              when :id is non-integer or <= 0
 *   404 { error }              when no blast row exists for :id
 *   503 { error }              when DB binding is missing
 *   200 { canResend, reason, blastId, audience,
 *         originalRecipientCount, priorChainRecipientCount,
 *         newRecipientCount, totalAudienceNow,
 *         originalSubject, originalBody, lastSentAt }
 *
 * `reason` is a closed enum: 'custom-audience' | 'no-new-recipients'
 * | 'no-audience' | null. `canResend === (reason === null)`.
 */

function noStoreJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...(init.headers ?? {}) },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return noStoreJson({ error: 'Not authorized.' }, { status: 401 });
  if (!env.DB) return noStoreJson({ error: 'Database not configured.' }, { status: 503 });

  const blastId = Number.parseInt(String(params.id ?? ''), 10);
  if (!Number.isInteger(blastId) || blastId <= 0) {
    return noStoreJson({ error: 'Bad blast id.' }, { status: 400 });
  }

  // Cheap existence check up front so a missing row returns 404 cleanly
  // instead of letting recipientsForFollowUp throw. Mirrors the pattern
  // in refresh.ts / backfill.ts.
  const exists = await env.DB
    .prepare('SELECT Id FROM EmailBlasts WHERE Id = ?1')
    .bind(blastId)
    .first<{ Id: number }>();
  if (!exists) return noStoreJson({ error: 'Blast not found.' }, { status: 404 });

  const preview = await recipientsForFollowUp(blastId, env.DB);

  return noStoreJson({
    canResend: preview.reason === null,
    reason: preview.reason,
    blastId: preview.rootRow.Id,
    audience: preview.rootRow.Audience,
    originalRecipientCount: preview.rootRow.RecipientCount,
    priorChainRecipientCount: preview.alreadySentCount,
    newRecipientCount: preview.recipients.length,
    totalAudienceNow: preview.totalAudienceNow,
    originalSubject: preview.rootRow.Subject,
    originalBody: preview.rootRow.BodyText,
    lastSentAt: preview.rootRow.SentAt,
  });
};
