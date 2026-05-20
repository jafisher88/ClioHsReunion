import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '../../src/pages/api/admin/blast/[id]/resend-preview';
import { createSessionToken } from '../../src/lib/session';

// Covers GET /api/admin/blast/:id/resend-preview across its 4 response
// branches (401 / 400 / 404 / 200) plus the three `reason` enum values
// in the 200 case. Imports the handler directly (no SELF.fetch) — the
// repo convention, mirroring tests/d1/webhook-route.test.ts.

const ADMIN_EMAIL = 'preview-test-admin@example.com';

type RouteCtx = Parameters<typeof GET>[0];

function buildCtx(args: { id?: string; cookie?: string } = {}): RouteCtx {
  const headers: Record<string, string> = {};
  if (args.cookie !== undefined) headers.cookie = args.cookie;
  const request = new Request(`http://test.local/api/admin/blast/${args.id ?? '1'}/resend-preview`, {
    headers,
  });
  return {
    request,
    params: { id: args.id ?? '1' },
  } as RouteCtx;
}

async function adminCookie(): Promise<string> {
  const token = await createSessionToken(ADMIN_EMAIL, env.SESSION_SECRET as string);
  return `admin_session=${encodeURIComponent(token)}`;
}

async function seedAdmin() {
  await env.DB
    .prepare(`INSERT OR IGNORE INTO Admins (Email, AddedBy) VALUES (?1, 'test')`)
    .bind(ADMIN_EMAIL)
    .run();
}

async function clearAll() {
  // FK-safe order: children → parents.
  await env.DB.prepare(`DELETE FROM EmailBlastSends`).run();
  await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  await env.DB.prepare(`DELETE FROM Rsvps`).run();
  await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
  await env.DB.prepare(`DELETE FROM Admins WHERE Email = ?1`).bind(ADMIN_EMAIL).run();
}

async function seedRsvp(email: string) {
  await env.DB
    .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, 'yes')`)
    .bind('Test', email)
    .run();
}

async function seedBlast(args: { audience: string; parentId?: number | null }): Promise<number> {
  const row = await env.DB
    .prepare(
      `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy, ParentBlastId)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       RETURNING Id`,
    )
    .bind('Test Subject', 'Test body', args.audience, 0, 'admin@example.com', args.parentId ?? null)
    .first<{ Id: number }>();
  return row!.Id;
}

async function seedSend(blastId: number, email: string) {
  await env.DB
    .prepare(`INSERT INTO EmailBlastSends (BlastId, Email) VALUES (?1, ?2)`)
    .bind(blastId, email)
    .run();
}

describe('GET /api/admin/blast/:id/resend-preview', () => {
  beforeEach(async () => {
    await clearAll();
    await seedAdmin();
  });
  afterEach(clearAll);

  it('blast-resend-preview.auth.missing: returns 401 when no admin session cookie is present', async () => {
    const res = await GET(buildCtx({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('blast-resend-preview.id.non-integer: returns 400 for an id that does not parse as an integer', async () => {
    const cookie = await adminCookie();
    const res = await GET(buildCtx({ id: 'not-a-number', cookie }));
    expect(res.status).toBe(400);
  });

  it('blast-resend-preview.id.zero: returns 400 for id=0', async () => {
    const cookie = await adminCookie();
    const res = await GET(buildCtx({ id: '0', cookie }));
    expect(res.status).toBe(400);
  });

  it('blast-resend-preview.not-found: returns 404 when no blast row matches the id', async () => {
    const cookie = await adminCookie();
    const res = await GET(buildCtx({ id: '99999', cookie }));
    expect(res.status).toBe(404);
  });

  it('blast-resend-preview.has-new: returns 200 + canResend=true when a fresh audience member exists', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const blastId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(blastId, 'sent@example.com');

    const res = await GET(buildCtx({ id: String(blastId), cookie }));
    const body = await res.json();

    expect(body).toMatchObject({
      canResend: true,
      reason: null,
      blastId,
      audience: 'rsvp-yes',
      priorChainRecipientCount: 1,
      newRecipientCount: 1,
      totalAudienceNow: 2,
    });
  });

  it('blast-resend-preview.custom-audience: returns 200 + reason=custom-audience for custom blasts', async () => {
    const cookie = await adminCookie();
    const blastId = await seedBlast({ audience: 'custom' });

    const res = await GET(buildCtx({ id: String(blastId), cookie }));
    const body = await res.json();

    expect(body).toMatchObject({ canResend: false, reason: 'custom-audience' });
  });

  it('blast-resend-preview.no-new: returns 200 + reason=no-new-recipients when audience-now is fully covered', async () => {
    const cookie = await adminCookie();
    await seedRsvp('a@example.com');
    const blastId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(blastId, 'a@example.com');

    const res = await GET(buildCtx({ id: String(blastId), cookie }));
    const body = await res.json();

    expect(body).toMatchObject({ canResend: false, reason: 'no-new-recipients' });
  });

  it('blast-resend-preview.no-audience: returns 200 + reason=no-audience when audience-now is empty', async () => {
    const cookie = await adminCookie();
    const blastId = await seedBlast({ audience: 'rsvp-yes' });

    const res = await GET(buildCtx({ id: String(blastId), cookie }));
    const body = await res.json();

    expect(body).toMatchObject({ canResend: false, reason: 'no-audience' });
  });

  it('blast-resend-preview.cache-control: sets Cache-Control: private, no-store on 200 responses', async () => {
    const cookie = await adminCookie();
    const blastId = await seedBlast({ audience: 'custom' });

    const res = await GET(buildCtx({ id: String(blastId), cookie }));

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
