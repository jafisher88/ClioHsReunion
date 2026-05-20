/**
 * Shared D1 seed + context helpers for the resend-POST test files.
 *
 * Used by:
 *   tests/d1/blast-resend-endpoint.test.ts
 *   tests/d1/blast-resend-idempotency.test.ts
 *   tests/d1/blast-resend-unsubscribe.test.ts
 *   tests/d1/blast-resend-failure.test.ts
 *
 * Not used by the older `blast-audience.test.ts` / `blast-resend.test.ts`
 * / `blast-resend-preview.test.ts` (their helpers were inlined before
 * this fixture existed; leave them alone to keep the slice diff focused).
 */
import { env } from 'cloudflare:test';
import { createSessionToken } from '../../src/lib/session';
import type { POST as RESEND_POST } from '../../src/pages/api/admin/blast/[id]/resend';

export const TEST_ADMIN_EMAIL = 'resend-test-admin@example.com';

export type ResendCtx = Parameters<typeof RESEND_POST>[0];

/** Build a partial APIContext for direct handler invocation. */
export function buildResendCtx(args: {
  id: string;
  cookie?: string;
  body?: unknown;
}): ResendCtx {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.cookie !== undefined) headers.cookie = args.cookie;
  const request = new Request(`http://test.local/api/admin/blast/${args.id}/resend`, {
    method: 'POST',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });
  return {
    request,
    params: { id: args.id },
  } as ResendCtx;
}

/** Signed-cookie string for the test admin. Email matches the seeded Admins row. */
export async function adminCookie(): Promise<string> {
  const token = await createSessionToken(TEST_ADMIN_EMAIL, env.SESSION_SECRET as string);
  return `admin_session=${encodeURIComponent(token)}`;
}

/** Idempotent admin row insert; safe to call from beforeEach. */
export async function seedAdmin(): Promise<void> {
  await env.DB
    .prepare(`INSERT OR IGNORE INTO Admins (Email, AddedBy) VALUES (?1, 'test')`)
    .bind(TEST_ADMIN_EMAIL)
    .run();
}

/** Truncate every table the resend endpoint touches, FK-safe order. */
export async function clearAllBlastState(): Promise<void> {
  // Children before parents — D1 enforces FKs.
  await env.DB.prepare(`DELETE FROM EmailBlastSends`).run();
  await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  await env.DB.prepare(`DELETE FROM Rsvps`).run();
  await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
  await env.DB.prepare(`DELETE FROM Admins WHERE Email = ?1`).bind(TEST_ADMIN_EMAIL).run();
}

export async function seedRsvp(
  email: string,
  attending: 'yes' | 'maybe' | 'no' = 'yes',
): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
    .bind('Test Person', email, attending)
    .run();
}

export async function seedBlast(args: {
  audience: string;
  parentId?: number | null;
  subject?: string;
  body?: string;
}): Promise<number> {
  const row = await env.DB
    .prepare(
      `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy, ParentBlastId)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       RETURNING Id`,
    )
    .bind(
      args.subject ?? 'Test Subject',
      args.body ?? 'Test body',
      args.audience,
      0,
      'admin@example.com',
      args.parentId ?? null,
    )
    .first<{ Id: number }>();
  return row!.Id;
}

export async function seedSend(blastId: number, email: string): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO EmailBlastSends (BlastId, Email) VALUES (?1, ?2)`)
    .bind(blastId, email)
    .run();
}

export async function seedUnsubscribe(email: string): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO Unsubscribes (Email, Source) VALUES (?1, 'manual')`)
    .bind(email)
    .run();
}
