/**
 * Shared D1 seed + context helpers for the RSVP ↔ Classmate match tests.
 *
 * Used by:
 *   tests/d1/rsvp-classmate-match.test.ts
 *   tests/d1/rsvp-classmate-migration.test.ts
 *
 * Pattern mirrors tests/fixtures/blast-test-helpers.ts (direct handler
 * import + partial APIContext via type cast + admin-cookie helper).
 */
import { env } from 'cloudflare:test';
import { createSessionToken } from '../../src/lib/session';
import type { POST as MATCH_POST } from '../../src/pages/api/admin/rsvps/[id]/match';

export const TEST_ADMIN_EMAIL = 'rsvp-match-test-admin@example.com';

export type MatchCtx = Parameters<typeof MATCH_POST>[0];

/** Build a partial APIContext for direct handler invocation. */
export function buildMatchCtx(args: {
  id: string;
  cookie?: string;
  body?: unknown;
  method?: 'POST' | 'DELETE';
}): MatchCtx {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.cookie !== undefined) headers.cookie = args.cookie;
  const request = new Request(`http://test.local/api/admin/rsvps/${args.id}/match`, {
    method: args.method ?? 'POST',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });
  return {
    request,
    params: { id: args.id },
  } as MatchCtx;
}

/** Build a partial APIContext for invoking POST /api/admin/classmates directly. */
export function buildClassmatesPostCtx(args: {
  cookie?: string;
  body?: unknown;
}): MatchCtx {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.cookie !== undefined) headers.cookie = args.cookie;
  const request = new Request('http://test.local/api/admin/classmates', {
    method: 'POST',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });
  return { request, params: {} } as MatchCtx;
}

/** Build a partial APIContext for invoking POST /api/admin/classmates/merge. */
export function buildMergeCtx(args: {
  cookie?: string;
  body?: unknown;
}): MatchCtx {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.cookie !== undefined) headers.cookie = args.cookie;
  const request = new Request('http://test.local/api/admin/classmates/merge', {
    method: 'POST',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });
  return { request, params: {} } as MatchCtx;
}

/** Signed-cookie string for the test admin. Email matches the seeded Admins row. */
export async function adminCookie(): Promise<string> {
  const token = await createSessionToken(TEST_ADMIN_EMAIL, env.SESSION_SECRET as string);
  return `admin_session=${encodeURIComponent(token)}`;
}

export async function seedAdmin(): Promise<void> {
  await env.DB
    .prepare(`INSERT OR IGNORE INTO Admins (Email, AddedBy) VALUES (?1, 'test')`)
    .bind(TEST_ADMIN_EMAIL)
    .run();
}

/** Truncate everything this feature's tests touch, FK-safe order. */
export async function clearAllRsvpMatchState(): Promise<void> {
  // EmailBlastSends → EmailBlasts (children of EmailBlasts) before
  // anything else, then Rsvps before Classmates (ClassmateId FK).
  await env.DB.prepare(`DELETE FROM EmailBlastSends`).run();
  await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  await env.DB.prepare(`DELETE FROM Rsvps`).run();
  await env.DB.prepare(`DELETE FROM Classmates`).run();
  await env.DB.prepare(`DELETE FROM Admins WHERE Email = ?1`).bind(TEST_ADMIN_EMAIL).run();
  await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
}

export async function seedRsvp(args: {
  fullName: string;
  email: string;
  attending?: 'yes' | 'maybe' | 'no';
  graduationName?: string;
}): Promise<number> {
  const row = await env.DB
    .prepare(
      `INSERT INTO Rsvps (FullName, Email, Attending, GuestCount, GraduationName)
       VALUES (?1, ?2, ?3, ?4, ?5)
       RETURNING Id`,
    )
    .bind(
      args.fullName,
      args.email,
      args.attending ?? 'yes',
      1,
      args.graduationName ?? null,
    )
    .first<{ Id: number }>();
  return row!.Id;
}

export async function seedClassmate(args: {
  fullName: string;
  email?: string | null;
  maidenName?: string | null;
}): Promise<number> {
  const row = await env.DB
    .prepare(
      `INSERT INTO Classmates (FullName, MaidenName, Email, CreatedBy)
       VALUES (?1, ?2, ?3, 'test')
       RETURNING Id`,
    )
    .bind(args.fullName, args.maidenName ?? null, args.email ?? null)
    .first<{ Id: number }>();
  return row!.Id;
}

/** Helper to read all three audit columns + linked classmate id in one call. */
export async function readRsvpAudit(rsvpId: number): Promise<{
  ClassmateId: number | null;
  MatchedBy: string | null;
  MatchedAt: string | null;
}> {
  const row = await env.DB
    .prepare(`SELECT ClassmateId, MatchedBy, MatchedAt FROM Rsvps WHERE Id = ?1`)
    .bind(rsvpId)
    .first<{ ClassmateId: number | null; MatchedBy: string | null; MatchedAt: string | null }>();
  return row ?? { ClassmateId: null, MatchedBy: null, MatchedAt: null };
}
