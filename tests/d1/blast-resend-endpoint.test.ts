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
  TEST_ADMIN_EMAIL,
} from '../fixtures/blast-test-helpers';

// Happy-path + structural-error coverage for POST /api/admin/blast/:id/resend.
// Race / idempotency / Resend-failure scenarios live in sibling files
// so each can isolate its own setup without describe-level branching.

let resend: ResendMock;

describe('POST /api/admin/blast/:id/resend (happy path + structural errors)', () => {
  beforeEach(async () => {
    await clearAllBlastState();
    await seedAdmin();
    resend = installResendMock();
  });

  afterEach(async () => {
    resend.restore();
    await clearAllBlastState();
  });

  it('blast-resend-endpoint.auth.missing: returns 401 when no admin cookie is present', async () => {
    const res = await POST(buildResendCtx({ id: '1', body: { subject: 'x', body: 'y' } }));
    expect(res.status).toBe(401);
  });

  it('blast-resend-endpoint.id.bad: returns 400 when id parses to NaN', async () => {
    const cookie = await adminCookie();
    const res = await POST(buildResendCtx({ id: 'abc', cookie, body: { subject: 'x', body: 'y' } }));
    expect(res.status).toBe(400);
  });

  it('blast-resend-endpoint.body.missing-subject: returns 400 when subject is blank', async () => {
    const cookie = await adminCookie();
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: '', body: 'y' } }),
    );
    expect(res.status).toBe(400);
  });

  it('blast-resend-endpoint.not-found: returns 404 for an id with no EmailBlasts row', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      buildResendCtx({ id: '99999', cookie, body: { subject: 'x', body: 'y' } }),
    );
    expect(res.status).toBe(404);
  });

  it('blast-resend-endpoint.refused.custom-audience: returns 409 with reason=custom-audience', async () => {
    const cookie = await adminCookie();
    const rootId = await seedBlast({ audience: 'custom' });
    const res = await POST(
      buildResendCtx({ id: String(rootId), cookie, body: { subject: 'x', body: 'y' } }),
    );
    const json = (await res.json()) as { reason: string };
    expect({ status: res.status, reason: json.reason }).toEqual({
      status: 409,
      reason: 'custom-audience',
    });
  });

  it('blast-resend-endpoint.happy.sends-only-diff: mock sees exactly one batch with the one new recipient', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');

    const res = await POST(
      buildResendCtx({
        id: String(rootId),
        cookie,
        body: { subject: 'Follow-up', body: 'Quick note.' },
      }),
    );

    // Single batch call, single recipient. The body is Resend's batch
    // array shape — Array<{ to: [email], ... }>. We assert the recipient
    // is the one new email, not the already-sent one.
    expect({
      status: res.status,
      batchCount: resend.calls.batch.length,
      sentTo: (resend.calls.batch[0]?.body as Array<{ to: string[] }>)?.[0]?.to,
    }).toEqual({ status: 200, batchCount: 1, sentTo: ['new@example.com'] });
  });

  it('blast-resend-endpoint.happy.inserts-followup-row: creates EmailBlasts row with ParentBlastId=root', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');

    await POST(
      buildResendCtx({
        id: String(rootId),
        cookie,
        body: { subject: 'Edited Subject', body: 'Edited body.' },
      }),
    );

    const followUp = await env.DB
      .prepare(
        `SELECT Subject, BodyText, Audience, RecipientCount, SentBy, ParentBlastId
           FROM EmailBlasts WHERE ParentBlastId = ?1`,
      )
      .bind(rootId)
      .first<{
        Subject: string;
        BodyText: string;
        Audience: string;
        RecipientCount: number;
        SentBy: string;
        ParentBlastId: number;
      }>();

    expect(followUp).toMatchObject({
      Subject: 'Edited Subject',
      BodyText: 'Edited body.',
      Audience: 'rsvp-yes',
      RecipientCount: 1,
      SentBy: TEST_ADMIN_EMAIL,
      ParentBlastId: rootId,
    });
  });

  it('blast-resend-endpoint.happy.inserts-sends-row: writes EmailBlastSends row for the new recipient', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'sent@example.com');

    await POST(
      buildResendCtx({
        id: String(rootId),
        cookie,
        body: { subject: 'x', body: 'y' },
      }),
    );

    // The follow-up's EmailBlastSends should have exactly one row, for
    // the new recipient, with a non-null ResendId from the mock.
    const sends = await env.DB
      .prepare(
        `SELECT s.Email, s.ResendId
           FROM EmailBlastSends s
           JOIN EmailBlasts b ON b.Id = s.BlastId
          WHERE b.ParentBlastId = ?1`,
      )
      .bind(rootId)
      .all<{ Email: string; ResendId: string | null }>();
    const rows = sends.results ?? [];

    expect({
      count: rows.length,
      email: rows[0]?.Email,
      hasResendId: typeof rows[0]?.ResendId === 'string' && rows[0]!.ResendId!.length > 0,
    }).toEqual({ count: 1, email: 'new@example.com', hasResendId: true });
  });

  it('blast-resend-endpoint.happy.parent-untouched: original blast row is byte-identical pre/post resend', async () => {
    const cookie = await adminCookie();
    await seedRsvp('sent@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({
      audience: 'rsvp-yes',
      subject: 'Original Subject',
      body: 'Original body.',
    });
    await seedSend(rootId, 'sent@example.com');

    const before = await env.DB
      .prepare('SELECT * FROM EmailBlasts WHERE Id = ?1')
      .bind(rootId)
      .first();

    await POST(
      buildResendCtx({
        id: String(rootId),
        cookie,
        body: { subject: 'Edited', body: 'Edited body.' },
      }),
    );

    const after = await env.DB
      .prepare('SELECT * FROM EmailBlasts WHERE Id = ?1')
      .bind(rootId)
      .first();

    expect(after).toEqual(before);
  });
});
