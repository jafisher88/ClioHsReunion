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
} from '../fixtures/blast-test-helpers';

// Resend batch failure semantics. The contract (per plan.md, criterion
// 7) matches the existing /api/admin/blast POST:
//   - Total failure (batch 0 throws): no rows inserted, 502 returned.
//   - Partial failure (batch N throws after batch < N succeeded): the
//     audit row IS inserted with EmailBlastSends rows for the successful
//     batches, and the response is 502 with "Send failed after N of M".
//
// These tests use the mock's failBatchOnIndex() to inject failures at
// deterministic points. The resend endpoint chunks at 100 recipients/
// batch; tests use small audiences so the chunk count is predictable.

let resend: ResendMock;

async function seedManyRsvps(count: number): Promise<void> {
  // Sequential awaits — D1's prepared statements queue across awaits in
  // tests too, so this is fine for small counts.
  for (let i = 0; i < count; i++) {
    await seedRsvp(`r${i.toString().padStart(3, '0')}@example.com`);
  }
}

describe('POST /api/admin/blast/:id/resend (Resend failure handling)', () => {
  beforeEach(async () => {
    await clearAllBlastState();
    await seedAdmin();
    resend = installResendMock();
  });

  afterEach(async () => {
    resend.restore();
    await clearAllBlastState();
  });

  it('blast-resend-failure.first-batch-throws.status: returns 502 when Resend rejects the very first batch', async () => {
    const cookie = await adminCookie();
    await seedRsvp('only@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    resend.failBatchOnIndex(0);

    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(res.status).toBe(502);
  });

  it('blast-resend-failure.first-batch-throws.no-audit: total failure inserts no follow-up EmailBlasts row', async () => {
    const cookie = await adminCookie();
    await seedRsvp('only@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    resend.failBatchOnIndex(0);

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM EmailBlasts WHERE ParentBlastId = ?1`)
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('blast-resend-failure.partial.status: returns 502 when a later batch fails after an earlier one succeeded', async () => {
    // 150 recipients → 2 batches (100 + 50). Fail batch index 1; batch 0
    // succeeds and persists rows.
    const cookie = await adminCookie();
    await seedManyRsvps(150);
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    resend.failBatchOnIndex(1);

    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(res.status).toBe(502);
  });

  it('blast-resend-failure.partial.audit-row: partial failure still inserts the follow-up EmailBlasts row', async () => {
    const cookie = await adminCookie();
    await seedManyRsvps(150);
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    resend.failBatchOnIndex(1);

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM EmailBlasts WHERE ParentBlastId = ?1`)
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('blast-resend-failure.partial.partial-sends: partial failure persists EmailBlastSends only for the successful batch', async () => {
    // After batch 0 succeeds and batch 1 fails: 100 sends rows, not 150.
    // (Mirrors the existing POST endpoint's behavior — the audit shows
    // partial truth rather than rolling back batch 0's traffic.)
    const cookie = await adminCookie();
    await seedManyRsvps(150);
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    resend.failBatchOnIndex(1);

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM EmailBlastSends s
           JOIN EmailBlasts b ON b.Id = s.BlastId
          WHERE b.ParentBlastId = ?1`,
      )
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(100);
  });
});
