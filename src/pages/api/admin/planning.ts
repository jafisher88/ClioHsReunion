import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

const MAX_NOTES = 4000;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * PATCH /api/admin/planning
 * Body: { id: number, isDone?: boolean, notes?: string | null }
 *
 * Only the fields present in the body are updated. Notes are clamped to
 * MAX_NOTES characters; an empty/whitespace string clears the field.
 */
export const PATCH: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('Could not parse JSON.', 400); }
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);
  const b = body as Record<string, unknown>;

  const id = typeof b.id === 'number' ? b.id : Number.parseInt(String(b.id), 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('Bad id.', 400);

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (typeof b.isDone === 'boolean') {
    sets.push(`IsDone = ?${binds.length + 1}`);
    binds.push(b.isDone ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(b, 'notes')) {
    const raw = b.notes;
    let value: string | null;
    if (raw === null || raw === undefined) {
      value = null;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim().slice(0, MAX_NOTES);
      value = trimmed.length === 0 ? null : trimmed;
    } else {
      return jsonError('Notes must be a string.', 400);
    }
    sets.push(`Notes = ?${binds.length + 1}`);
    binds.push(value);
  }

  if (sets.length === 0) return jsonError('Nothing to update.', 400);

  sets.push(`UpdatedBy = ?${binds.length + 1}`);
  binds.push(admin.email);
  sets.push(`UpdatedAt = CURRENT_TIMESTAMP`);

  binds.push(id);
  const sql = `UPDATE PlanningItems SET ${sets.join(', ')} WHERE Id = ?${binds.length}`;

  try {
    const res = await env.DB.prepare(sql).bind(...binds).run();
    if (!res.meta?.changes) return jsonError('Item not found.', 404);
  } catch (err) {
    console.error('[planning] update failed', err);
    return jsonError('Update failed.', 500);
  }

  return Response.json({ ok: true });
};
