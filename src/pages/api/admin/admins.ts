import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function readEmailFromBody(request: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).email;
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) return null;
  return email;
}

export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const email = await readEmailFromBody(request);
  if (!email) return jsonError('Please provide a valid email.', 400);

  try {
    await env.DB
      .prepare('INSERT INTO Admins (Email, AddedBy) VALUES (?1, ?2)')
      .bind(email, admin.email)
      .run();
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      return jsonError(`${email} is already an admin.`, 409);
    }
    console.error('[admin/admins POST] insert failed', err);
    return jsonError('Could not add admin.', 500);
  }

  return Response.json({ ok: true, email });
};

export const DELETE: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const email = await readEmailFromBody(request);
  if (!email) return jsonError('Please provide a valid email.', 400);

  if (email === admin.email) {
    return jsonError("You can't remove yourself.", 400);
  }

  // Prevent removing the last admin
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM Admins')
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) <= 1) {
    return jsonError("Can't remove the last admin.", 400);
  }

  const res = await env.DB
    .prepare('DELETE FROM Admins WHERE Email = ?1')
    .bind(email)
    .run();

  if ((res.meta?.changes ?? 0) === 0) {
    return jsonError(`${email} is not an admin.`, 404);
  }

  return Response.json({ ok: true, email });
};
