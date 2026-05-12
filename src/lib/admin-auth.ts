import { readSessionToken } from './session';

export interface AdminContext {
  email: string;
}

type AdminEnv = {
  DB?: D1Database;
  SESSION_SECRET?: string;
};

const SESSION_COOKIE = 'admin_session';

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Return the logged-in admin (email) or null.
 *
 * Reads the signed session cookie, verifies HMAC + expiration, then confirms
 * the email is still in the Admins table (so revocation is immediate even
 * with a long-lived cookie).
 */
export async function getAdmin(request: Request, env: AdminEnv): Promise<AdminContext | null> {
  if (!env.SESSION_SECRET || !env.DB) return null;
  const token = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  const session = await readSessionToken(token, env.SESSION_SECRET);
  if (!session) return null;

  const row = await env.DB
    .prepare('SELECT Id FROM Admins WHERE Email = ?1')
    .bind(session.email)
    .first();
  if (!row) return null;
  return { email: session.email };
}

/**
 * Build the URL path string to send an unauthenticated visitor to,
 * preserving the original path as `?next=…` so they land back where they
 * were after authenticating. Pass to `Astro.redirect(...)` from a page.
 */
export function loginUrlFor(request: Request): string {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  return `/admin/login?next=${encodeURIComponent(next)}`;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
