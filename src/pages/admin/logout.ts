import type { APIRoute } from 'astro';

function clearAndRedirect(): Response {
  const headers = new Headers({ Location: '/admin/login' });
  headers.append(
    'Set-Cookie',
    'admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );
  return new Response(null, { status: 302, headers });
}

export const GET: APIRoute = () => clearAndRedirect();
export const POST: APIRoute = () => clearAndRedirect();
