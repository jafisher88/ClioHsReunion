import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export const DELETE: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.PHOTOS) return jsonError('Photo storage not configured.', 503);

  const url = new URL(request.url);
  let idRaw = url.searchParams.get('id');
  if (!idRaw) {
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && 'id' in (body as Record<string, unknown>)) {
        idRaw = String((body as Record<string, unknown>).id);
      }
    } catch {
      // ignore
    }
  }
  const id = idRaw ? Number.parseInt(idRaw, 10) : NaN;
  if (!Number.isInteger(id) || id <= 0) return jsonError('Missing or invalid id.', 400);

  const row = await env.DB
    .prepare('SELECT R2Key FROM PhotoSubmissions WHERE Id = ?1')
    .bind(id)
    .first<{ R2Key: string }>();
  if (!row) return jsonError('Photo not found.', 404);

  try { await env.PHOTOS.delete(row.R2Key); } catch (err) {
    console.error('[admin/photos DELETE] R2 delete failed', err);
  }
  await env.DB.prepare('DELETE FROM PhotoSubmissions WHERE Id = ?1').bind(id).run();
  return Response.json({ ok: true });
};
