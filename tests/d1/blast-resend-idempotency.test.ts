import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '../../src/pages/api/admin/blast/[id]/resend';
import { installResendMock, type ResendMock } from '../fixtures/resend-mock';
import {
  adminCookie,
  buildResendCtx,
  clearAllBlastState,
  seedAdmin,
  seedBlast,
  seedRsvp,
  seedSend,
} from '../fixtures/blast-test-helpers';

// Critical safety check (M1 from the criteria review): two rapid POSTs
// against the same parent must result in exactly ONE follow-up — never
// two. Server-side 30s cooldown guard + client-side button-disable are
// belt-and-suspenders. This file covers the server-side belt.

let resend: ResendMock;

async function setupFreshAudience(): Promise<number> {
  await seedRsvp('a@example.com');
  await seedRsvp('b@example.com');
  await seedRsvp('c@example.com');
  const rootId = await seedBlast({ audience: 'rsvp-yes' });
  await seedSend(rootId, 'a@example.com');
  // Two recipients remain in the diff: b@ and c@. Each idempotency test
  // sends to all of them in batch 1, so a successful second send would
  // produce a second EmailBlasts row.
  return rootId;
}

describe('POST /api/admin/blast/:id/resend (idempotency)', () => {
  beforeEach(async () => {
    await clearAllBlastState();
    await seedAdmin();
    resend = installResendMock();
  });

  afterEach(async () => {
    resend.restore();
    await clearAllBlastState();
  });

  it('blast-resend-idempotency.sequential-double-post: second call within 30s returns 409', async () => {
    const cookie = await adminCookie();
    const rootId = await setupFreshAudience();

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );
    const second = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(second.status).toBe(409);
  });

  it('blast-resend-idempotency.sequential-double-post.reason: second call body carries reason=recent-resend', async () => {
    const cookie = await adminCookie();
    const rootId = await setupFreshAudience();

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );
    const second = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(((await second.json()) as { reason: string }).reason).toBe('recent-resend');
  });

  it('blast-resend-idempotency.sequential-double-post.one-row: exactly one follow-up EmailBlasts row exists', async () => {
    const cookie = await adminCookie();
    const rootId = await setupFreshAudience();

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );
    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM EmailBlasts WHERE ParentBlastId = ?1`)
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('blast-resend-idempotency.concurrent-double-post.one-row: parallel POSTs still result in one follow-up row', async () => {
    // Two Promise.all'd POSTs racing for the same root. The 30s window
    // is wide enough that whichever insert lands first wins; the other
    // sees the recent row and bails with 409. Verified by counting
    // EmailBlasts rows — must be exactly one, not two.
    const cookie = await adminCookie();
    const rootId = await setupFreshAudience();

    await Promise.all([
      POST(buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } })),
      POST(buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } })),
    ]);

    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM EmailBlasts WHERE ParentBlastId = ?1`)
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});
