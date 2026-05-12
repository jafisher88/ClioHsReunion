import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  decodeIdToken,
  exchangeCodeForTokens,
  isValidGoogleIdToken,
} from '../../../lib/oauth';
import { base64urlDecodeToString } from '../../../lib/base64url';
import { createSessionToken } from '../../../lib/session';

function plainText(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return plainText(400, `Google returned an error: ${oauthError}`);
  if (!code || !state) return plainText(400, 'Missing code or state.');

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) {
    return plainText(503, 'OAuth not configured (missing client / session secrets).');
  }
  if (!env.DB) return plainText(503, 'Database binding missing.');

  // State validation
  const rawStateCookie = parseCookie(request.headers.get('cookie'), 'admin_oauth_state');
  if (!rawStateCookie) return plainText(400, 'Missing state cookie. Try logging in again.');
  let savedState: { state: string; next: string };
  try {
    savedState = JSON.parse(base64urlDecodeToString(rawStateCookie));
  } catch {
    return plainText(400, 'Bad state cookie.');
  }
  if (savedState.state !== state) return plainText(400, 'State mismatch.');

  const redirectUri = new URL('/admin/auth/callback', url).href;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (err) {
    console.error('[admin/auth/callback] token exchange', err);
    return plainText(500, 'Could not exchange code with Google.');
  }

  let payload;
  try {
    payload = decodeIdToken(tokens.id_token);
  } catch (err) {
    console.error('[admin/auth/callback] id_token decode', err);
    return plainText(500, 'Could not decode Google id_token.');
  }
  if (!isValidGoogleIdToken(payload, clientId)) {
    return plainText(401, 'Google id_token failed validation.');
  }
  if (!payload.email || !payload.email_verified) {
    return plainText(401, 'Google did not return a verified email.');
  }

  const email = payload.email.toLowerCase();

  const adminRow = await env.DB
    .prepare('SELECT Id FROM Admins WHERE Email = ?1')
    .bind(email)
    .first();
  if (!adminRow) {
    // Not in allowlist. Clear state cookie and tell them.
    const h = new Headers({ 'Content-Type': 'text/plain; charset=utf-8' });
    h.append(
      'Set-Cookie',
      'admin_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0',
    );
    return new Response(
      `Not authorized: ${email} is not on the admin list. Ask an existing admin to add you.`,
      { status: 403, headers: h },
    );
  }

  // Record last-login
  await env.DB
    .prepare('UPDATE Admins SET LastLoginAt = CURRENT_TIMESTAMP WHERE Email = ?1')
    .bind(email)
    .run();

  const sessionToken = await createSessionToken(email, sessionSecret);
  const next = savedState.next || '/admin/';

  const headers = new Headers({ Location: next.startsWith('/admin') ? next : '/admin/' });
  headers.append(
    'Set-Cookie',
    `admin_session=${encodeURIComponent(sessionToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`,
  );
  headers.append(
    'Set-Cookie',
    'admin_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0',
  );
  return new Response(null, { status: 302, headers });
};
