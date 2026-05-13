import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

const MAX_LABEL = 200;
const MAX_NOTES = 4000;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function clampLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, MAX_LABEL);
  return t.length === 0 ? null : t;
}

/**
 * POST /api/admin/planning
 * Body: { label: string }
 * Inserts a new item at the end of the checklist (Sort = max + 10).
 */
export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('Could not parse JSON.', 400); }
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);

  const label = clampLabel((body as Record<string, unknown>).label);
  if (!label) return jsonError('Label is required.', 400);

  try {
    const maxRow = await env.DB
      .prepare(`SELECT COALESCE(MAX(Sort), 0) AS maxSort FROM PlanningItems`)
      .first<{ maxSort: number }>();
    const nextSort = (maxRow?.maxSort ?? 0) + 10;

    const res = await env.DB
      .prepare(`INSERT INTO PlanningItems (Sort, Label, UpdatedBy) VALUES (?1, ?2, ?3)`)
      .bind(nextSort, label, admin.email)
      .run();

    return Response.json({ ok: true, id: res.meta?.last_row_id ?? null, sort: nextSort });
  } catch (err) {
    console.error('[planning] insert failed', err);
    return jsonError('Could not save item.', 500);
  }
};

/**
 * PATCH /api/admin/planning
 * Body: { id: number, label?: string, isDone?: boolean, notes?: string | null }
 *
 * Only the fields present in the body are updated.
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

  if (Object.prototype.hasOwnProperty.call(b, 'label')) {
    const label = clampLabel(b.label);
    if (!label) return jsonError('Label cannot be empty.', 400);
    sets.push(`Label = ?${binds.length + 1}`);
    binds.push(label);
  }
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

/**
 * DELETE /api/admin/planning?id=N
 */
export const DELETE: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get('id') ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('Missing or invalid id.', 400);

  try {
    const res = await env.DB.prepare(`DELETE FROM PlanningItems WHERE Id = ?1`).bind(id).run();
    if (!res.meta?.changes) return jsonError('Item not found.', 404);
  } catch (err) {
    console.error('[planning] delete failed', err);
    return jsonError('Delete failed.', 500);
  }

  return Response.json({ ok: true });
};
