import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'resolved', 'archived']);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function parseId(url: URL): number | null {
  const raw = url.searchParams.get('id');
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const PATCH: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const url = new URL(request.url);
  const id = parseId(url);
  if (!id) return jsonError('Missing or invalid id.', 400);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON.', 400); }
  const b = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (typeof b.status === 'string') {
    const status = b.status.toLowerCase();
    if (!ALLOWED_STATUSES.has(status)) return jsonError('Invalid status.', 400);
    updates.push(`Status = ?`);
    binds.push(status);
    if (status === 'resolved') {
      updates.push(`ResolvedAt = COALESCE(ResolvedAt, CURRENT_TIMESTAMP)`);
    } else if (status === 'new' || status === 'in_progress') {
      updates.push(`ResolvedAt = NULL`);
    }
  }

  if (typeof b.adminNotes === 'string') {
    updates.push(`AdminNotes = NULLIF(?, '')`);
    binds.push(b.adminNotes.trim().slice(0, 4000));
  }

  if (updates.length === 0) return jsonError('Nothing to update.', 400);

  binds.push(id);
  const sql = `UPDATE Submissions SET ${updates.join(', ')} WHERE Id = ?`;

  try {
    const result = await env.DB.prepare(sql).bind(...binds).run();
    if (result.meta.changes === 0) return jsonError('Submission not found.', 404);
  } catch (err) {
    console.error('[admin/submissions PATCH] update failed', err);
    return jsonError('Could not update submission.', 500);
  }

  return Response.json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const url = new URL(request.url);
  const id = parseId(url);
  if (!id) return jsonError('Missing or invalid id.', 400);

  const result = await env.DB.prepare('DELETE FROM Submissions WHERE Id = ?1').bind(id).run();
  if (result.meta.changes === 0) return jsonError('Submission not found.', 404);
  return Response.json({ ok: true });
};
