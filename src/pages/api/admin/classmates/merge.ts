import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../lib/admin-auth';

interface Row {
  Id: number;
  FullName: string;
  MaidenName: string | null;
  PreferredFirstName: string | null;
  Notes: string | null;
  IsDeceased: number;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Merge `mergeId` INTO `primaryId`.
 * - primary's FullName is preserved (yearbook name is the canonical identity).
 * - For each other field: primary wins if non-null; otherwise the merged row's
 *   value is taken.
 * - IsDeceased becomes the logical OR of both (someone marked deceased on
 *   either record stays deceased).
 * - Notes are concatenated when both have content.
 * - The `mergeId` row is deleted after the update.
 */
export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('Could not parse JSON.', 400); }
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);

  const b = body as Record<string, unknown>;
  const primaryId = typeof b.primaryId === 'number' ? b.primaryId : Number.parseInt(String(b.primaryId), 10);
  const mergeId = typeof b.mergeId === 'number' ? b.mergeId : Number.parseInt(String(b.mergeId), 10);

  if (!Number.isInteger(primaryId) || primaryId <= 0) return jsonError('Bad primaryId.', 400);
  if (!Number.isInteger(mergeId) || mergeId <= 0)     return jsonError('Bad mergeId.', 400);
  if (primaryId === mergeId) return jsonError('Cannot merge a row into itself.', 400);

  const rows = await env.DB
    .prepare(
      `SELECT Id, FullName, MaidenName, PreferredFirstName, Notes, IsDeceased
         FROM Classmates WHERE Id IN (?1, ?2)`
    )
    .bind(primaryId, mergeId)
    .all<Row>();
  const list = rows.results ?? [];
  const primary = list.find((r) => r.Id === primaryId);
  const merging = list.find((r) => r.Id === mergeId);
  if (!primary || !merging) return jsonError('One or both rows not found.', 404);

  // Compute merged values — primary wins on conflict; pull missing fields
  // from `merging`.
  const mergedMaiden = primary.MaidenName ?? merging.MaidenName;
  const mergedPreferred = primary.PreferredFirstName ?? merging.PreferredFirstName;
  const mergedDeceased = (primary.IsDeceased === 1 || merging.IsDeceased === 1) ? 1 : 0;
  const mergedNotes = (() => {
    const a = (primary.Notes ?? '').trim();
    const b = (merging.Notes ?? '').trim();
    if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a}\n\n— merged from ${merging.FullName} —\n${b}`;
    return a || b || null;
  })();

  try {
    await env.DB.batch([
      env.DB
        .prepare(
          `UPDATE Classmates
              SET MaidenName = ?1, PreferredFirstName = ?2,
                  Notes = ?3, IsDeceased = ?4,
                  UpdatedAt = CURRENT_TIMESTAMP
            WHERE Id = ?5`
        )
        .bind(mergedMaiden, mergedPreferred, mergedNotes, mergedDeceased, primaryId),
      env.DB.prepare(`DELETE FROM Classmates WHERE Id = ?1`).bind(mergeId),
    ]);
  } catch (err) {
    console.error('[classmates/merge] failed', err);
    return jsonError('Merge failed.', 500);
  }

  return Response.json({ ok: true, keptId: primaryId, removedId: mergeId });
};
