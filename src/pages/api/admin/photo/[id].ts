import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../lib/admin-auth';

export const GET: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return new Response('Not authorized', { status: 401 });
  if (!env.DB) return new Response('Database not configured', { status: 503 });
  if (!env.PHOTOS) return new Response('Photo storage not configured', { status: 503 });

  const id = Number.parseInt(String(params.id ?? ''), 10);
  if (!Number.isInteger(id) || id <= 0) return new Response('Bad id', { status: 400 });

  const row = await env.DB
    .prepare('SELECT R2Key, ContentType FROM PhotoSubmissions WHERE Id = ?1')
    .bind(id)
    .first<{ R2Key: string; ContentType: string }>();
  if (!row) return new Response('Not found', { status: 404 });

  const obj = await env.PHOTOS.get(row.R2Key);
  if (!obj) return new Response('Storage miss', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': row.ContentType,
      'Cache-Control': 'private, max-age=300',
    },
  });
};
