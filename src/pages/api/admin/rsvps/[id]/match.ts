import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';

/**
 * POST /api/admin/rsvps/:id/match
 *   body: { classmateId: number }
 *   Persists a manual RSVP ↔ Classmate link. Sets Rsvps.ClassmateId +
 *   MatchedBy = admin.email + MatchedAt = CURRENT_TIMESTAMP. Overwrites
 *   any prior link (last-write-wins; documented behavior, no optimistic
 *   lock — the admin tool is two-to-five people total).
 *
 * DELETE /api/admin/rsvps/:id/match
 *   Clears all three audit columns to NULL. Idempotent — calling it on
 *   a never-matched RSVP returns 200 (the simplest UI contract).
 *
 * Both handlers follow the established admin-endpoint pattern from
 * src/pages/api/admin/blast/[id]/refresh.ts (auth → DB → id parse →
 * existence check → mutate → return JSON).
 */

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const POST: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const rsvpId = parseId(params.id);
  if (rsvpId === null) return jsonError('Missing or invalid id.', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  if (!body || typeof body !== 'object') {
    return jsonError('Missing or invalid classmateId.', 400);
  }
  const rawClassmateId = (body as Record<string, unknown>).classmateId;
  const classmateId = typeof rawClassmateId === 'number'
    ? rawClassmateId
    : Number.parseInt(String(rawClassmateId ?? ''), 10);
  if (!Number.isInteger(classmateId) || classmateId <= 0) {
    return jsonError('Missing or invalid classmateId.', 400);
  }

  // Existence checks split so the error message tells the UI which side
  // is missing (RSVP vs Classmate). A future "the row was deleted while
  // I had the picker open" race surfaces with a clean 404, not a raw
  // FOREIGN KEY 500 from the UPDATE.
  const rsvpExists = await env.DB
    .prepare('SELECT Id FROM Rsvps WHERE Id = ?1')
    .bind(rsvpId)
    .first<{ Id: number }>();
  if (!rsvpExists) return jsonError('RSVP not found.', 404);

  const classmateExists = await env.DB
    .prepare('SELECT Id FROM Classmates WHERE Id = ?1')
    .bind(classmateId)
    .first<{ Id: number }>();
  if (!classmateExists) return jsonError('Classmate not found.', 404);

  await env.DB
    .prepare(
      `UPDATE Rsvps
          SET ClassmateId = ?1,
              MatchedBy   = ?2,
              MatchedAt   = CURRENT_TIMESTAMP
        WHERE Id = ?3`,
    )
    .bind(classmateId, admin.email, rsvpId)
    .run();

  return Response.json({
    ok: true,
    rsvpId,
    classmateId,
    matchedBy: admin.email,
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const rsvpId = parseId(params.id);
  if (rsvpId === null) return jsonError('Missing or invalid id.', 400);

  const rsvpExists = await env.DB
    .prepare('SELECT Id FROM Rsvps WHERE Id = ?1')
    .bind(rsvpId)
    .first<{ Id: number }>();
  if (!rsvpExists) return jsonError('RSVP not found.', 404);

  // Idempotent — the UPDATE is a no-op when the audit columns are
  // already NULL. We return 200 regardless. Simpler UI contract than
  // "404 if there was nothing to clear."
  await env.DB
    .prepare(
      `UPDATE Rsvps
          SET ClassmateId = NULL,
              MatchedBy   = NULL,
              MatchedAt   = NULL
        WHERE Id = ?1`,
    )
    .bind(rsvpId)
    .run();

  return Response.json({ ok: true, rsvpId });
};
