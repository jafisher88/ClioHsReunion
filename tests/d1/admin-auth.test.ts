import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAdmin } from '../../src/lib/admin-auth';
import { createSessionToken } from '../../src/lib/session';

// F1: end-to-end `getAdmin` coverage. Walks the cookie parse → HMAC
// verify → exp check → Admins table lookup chain, asserting each
// failure mode in isolation. Re-uses the production `env` binding so
// `SESSION_SECRET` flows from `vitest.config.ts`'s miniflare bindings.

const ADMIN_EMAIL = 'admin-auth-test@example.com';

function request(cookieHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (cookieHeader !== undefined) headers.cookie = cookieHeader;
  return new Request('http://test.local/admin/', { headers });
}

function adminSessionCookie(token: string): string {
  return `admin_session=${encodeURIComponent(token)}`;
}

describe('getAdmin (D1 + cookie)', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM Admins WHERE Email = ?1`).bind(ADMIN_EMAIL).run();
  });
  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM Admins WHERE Email = ?1`).bind(ADMIN_EMAIL).run();
  });

  it('admin-auth.cookie.missing: returns null when no Cookie header is present', async () => {
    const result = await getAdmin(request(), env);
    expect(result).toBe(null);
  });

  it('admin-auth.cookie.malformed: returns null when cookie header lacks admin_session', async () => {
    const result = await getAdmin(request('other_cookie=foo; bar=baz'), env);
    expect(result).toBe(null);
  });

  it('admin-auth.signature.tampered: returns null when the session signature byte is flipped', async () => {
    const token = await createSessionToken(ADMIN_EMAIL, env.SESSION_SECRET as string);
    const dot = token.indexOf('.');
    const sig = token.slice(dot + 1);
    const tampered = `${token.slice(0, dot)}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    const result = await getAdmin(request(adminSessionCookie(tampered)), env);
    expect(result).toBe(null);
  });

  it('admin-auth.session.expired: returns null for a token with exp in the past', async () => {
    // negative TTL → exp is already in the past at construction time
    const expired = await createSessionToken(ADMIN_EMAIL, env.SESSION_SECRET as string, -10);
    // Seed the admin row to prove that exp-check fires BEFORE the D1 lookup —
    // an expired token must reject even when the email is otherwise valid.
    await env.DB.prepare(`INSERT INTO Admins (Email, AddedBy) VALUES (?1, 'test')`).bind(ADMIN_EMAIL).run();
    const result = await getAdmin(request(adminSessionCookie(expired)), env);
    expect(result).toBe(null);
  });

  it('admin-auth.admins.missing: returns null for a valid session whose email is not in Admins', async () => {
    // Token valid, but no Admins row → revocation behavior: instant deny.
    const token = await createSessionToken(ADMIN_EMAIL, env.SESSION_SECRET as string);
    const result = await getAdmin(request(adminSessionCookie(token)), env);
    expect(result).toBe(null);
  });

  it('admin-auth.happy: returns AdminContext for valid session + matching Admins row', async () => {
    await env.DB.prepare(`INSERT INTO Admins (Email, AddedBy) VALUES (?1, 'test')`).bind(ADMIN_EMAIL).run();
    const token = await createSessionToken(ADMIN_EMAIL, env.SESSION_SECRET as string);
    const result = await getAdmin(request(adminSessionCookie(token)), env);
    expect(result).toEqual({ email: ADMIN_EMAIL });
  });
});
