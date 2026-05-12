import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildGoogleAuthUrl } from '../../lib/oauth';
import { base64urlEncode } from '../../lib/base64url';

export const GET: APIRoute = async ({ request }) => {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(
      'Google OAuth is not configured yet. Set the GOOGLE_CLIENT_ID, ' +
        'GOOGLE_CLIENT_SECRET, and SESSION_SECRET secrets on the Worker.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const url = new URL(request.url);
  const next = url.searchParams.get('next') ?? '/admin/';
  const redirectUri = new URL('/admin/auth/callback', url).href;

  // Random state to defend against CSRF on the callback.
  const state = crypto.randomUUID();
  const stateCookie = base64urlEncode(JSON.stringify({ state, next }));

  const authUrl = buildGoogleAuthUrl({ clientId, redirectUri, state });

  const headers = new Headers({ Location: authUrl });
  headers.append(
    'Set-Cookie',
    `admin_oauth_state=${stateCookie}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=600`,
  );
  return new Response(null, { status: 302, headers });
};
