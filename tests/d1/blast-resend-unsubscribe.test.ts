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
  seedUnsubscribe,
} from '../fixtures/blast-test-helpers';

// Race / suppression coverage. The preview endpoint runs the diff once;
// the POST endpoint re-runs it at send time. If someone unsubscribes
// between preview and POST, the at-send-time diff must catch them and
// the POST must refuse with 409 — not send to a now-empty audience and
// leave a no-op audit row behind.

let resend: ResendMock;

describe('POST /api/admin/blast/:id/resend (unsubscribes + race)', () => {
  beforeEach(async () => {
    await clearAllBlastState();
    await seedAdmin();
    resend = installResendMock();
  });

  afterEach(async () => {
    resend.restore();
    await clearAllBlastState();
  });

  it('blast-resend-unsubscribe.empty-after-race: returns 409 when the only new recipient unsubscribes before POST', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');
    // Simulate the race window: preview would have returned new=1, but
    // by the time POST runs the only new recipient has opted out.
    await seedUnsubscribe('new@example.com');

    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(res.status).toBe(409);
  });

  it('blast-resend-unsubscribe.empty-after-race.reason: race-409 carries reason=no-new-recipients', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');
    await seedUnsubscribe('new@example.com');

    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(((await res.json()) as { reason: string }).reason).toBe('no-new-recipients');
  });

  it('blast-resend-unsubscribe.empty-after-race.no-audit: refused race leaves zero new EmailBlasts rows', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');
    await seedUnsubscribe('new@example.com');

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM EmailBlasts WHERE ParentBlastId = ?1`)
      .bind(rootId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('blast-resend-unsubscribe.empty-after-race.no-send: refused race triggers zero Resend batch calls', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');
    await seedUnsubscribe('new@example.com');

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    expect(resend.calls.batch.length).toBe(0);
  });

  it('blast-resend-unsubscribe.mixed: previously-sent recipient unsubscribing does not re-include them, and a fresh-but-unsubscribed addr is filtered', async () => {
    // sent@ got the root and has now unsubscribed → must stay excluded.
    // unsub-new@ is a fresh RSVP that's already unsubscribed → excluded.
    // new@ is a fresh RSVP, not unsubscribed → the only valid recipient.
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('unsub-new@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');
    await seedUnsubscribe('sent@example.com');
    await seedUnsubscribe('unsub-new@example.com');

    await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );

    const sent = await env.DB
      .prepare(
        `SELECT s.Email FROM EmailBlastSends s
           JOIN EmailBlasts b ON b.Id = s.BlastId
          WHERE b.ParentBlastId = ?1`,
      )
      .bind(rootId)
      .all<{ Email: string }>();

    expect((sent.results ?? []).map((r: { Email: string }) => r.Email).sort()).toEqual([
      'new@example.com',
    ]);
  });
});
