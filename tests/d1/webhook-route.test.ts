import { env } from 'cloudflare:test';
import { Webhook } from 'standardwebhooks';
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '../../src/pages/api/webhooks/resend';
import { TEST_RESEND_WEBHOOK_SECRET } from '../fixtures/test-secrets';

// F3: end-to-end coverage of /api/webhooks/resend's POST handler.
// Uses miniflare D1 (WebhookEvents + EmailBlastSends) and the
// production secret (PUBLIC test value from the fixture) so the
// signature verification, dedupe, and status-update side effects all
// fire against real bindings — no module mocking.

function signedRequest(
  body: string,
  opts: { id?: string; timestamp?: Date } = {},
): Request {
  const wh = new Webhook(TEST_RESEND_WEBHOOK_SECRET);
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = opts.timestamp ?? new Date();
  const signature = wh.sign(id, timestamp, body);
  return new Request('http://test.local/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'svix-signature': signature,
    },
    body,
  });
}

// Astro APIRoute handlers read `.request`; ignoring the rest of APIContext.
type RouteCtx = Parameters<typeof POST>[0];

describe('POST /api/webhooks/resend (F3)', () => {
  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM WebhookEvents`).run();
    await env.DB.prepare(`DELETE FROM EmailBlastSends`).run();
  });

  it('webhook-route.bad-sig: returns 401 when svix-signature is forged', async () => {
    const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'x' } });
    const req = new Request('http://test.local/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_forged',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,bm90LWEtcmVhbC1zaWduYXR1cmU=',
      },
      body,
    });
    const res = await POST({ request: req } as RouteCtx);
    expect(res.status).toBe(401);
  });

  it('webhook-route.dedupe: posting the same svix-id twice returns deduped on second call', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-05-15T12:00:00Z',
      data: { email_id: 'em_dedupe_test' },
    });
    const id = 'msg_dedupe_001';
    const ts = new Date();

    await POST({ request: signedRequest(body, { id, timestamp: ts }) } as RouteCtx);
    const res2 = await POST({ request: signedRequest(body, { id, timestamp: ts }) } as RouteCtx);
    const body2 = await res2.json();
    expect(body2).toMatchObject({ ok: true, deduped: true });
  });

  it('webhook-route.untracked-type: unknown event type returns 200 with ignored flag', async () => {
    const body = JSON.stringify({
      type: 'email.unknown_future_event',
      data: { email_id: 'em_unknown' },
    });
    const res = await POST({ request: signedRequest(body) } as RouteCtx);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, ignored: 'email.unknown_future_event' });
  });

  it('webhook-route.status-update: opened event upgrades a matching EmailBlastSends row to "opened"', async () => {
    // Seed: a blast with a sends row in 'delivered' state and the matching ResendId.
    await env.DB
      .prepare(
        `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy)
         VALUES ('Test', 'Test body', 'rsvp-yes', 1, 'admin@example.com')`,
      )
      .run();
    const blast = await env.DB
      .prepare(`SELECT Id FROM EmailBlasts ORDER BY Id DESC LIMIT 1`)
      .first<{ Id: number }>();
    await env.DB
      .prepare(
        `INSERT INTO EmailBlastSends (BlastId, Email, ResendId, Status)
         VALUES (?1, ?2, ?3, 'delivered')`,
      )
      .bind(blast!.Id, 'recipient@example.com', 'em_opened_test')
      .run();

    const body = JSON.stringify({
      type: 'email.opened',
      data: { email_id: 'em_opened_test' },
    });
    await POST({ request: signedRequest(body) } as RouteCtx);

    const updated = await env.DB
      .prepare(`SELECT Status FROM EmailBlastSends WHERE ResendId = ?1`)
      .bind('em_opened_test')
      .first<{ Status: string }>();
    expect(updated?.Status).toBe('opened');

    // Cleanup the seed blast (afterEach handles EmailBlastSends).
    await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  });

  it('webhook-route.status-precedence: opened does NOT overwrite a row already at clicked', async () => {
    // Seed a row already in terminal positive state.
    await env.DB
      .prepare(
        `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy)
         VALUES ('Test', 'Test body', 'rsvp-yes', 1, 'admin@example.com')`,
      )
      .run();
    const blast = await env.DB
      .prepare(`SELECT Id FROM EmailBlasts ORDER BY Id DESC LIMIT 1`)
      .first<{ Id: number }>();
    await env.DB
      .prepare(
        `INSERT INTO EmailBlastSends (BlastId, Email, ResendId, Status)
         VALUES (?1, ?2, ?3, 'clicked')`,
      )
      .bind(blast!.Id, 'recipient@example.com', 'em_precedence_test')
      .run();

    const body = JSON.stringify({
      type: 'email.opened',
      data: { email_id: 'em_precedence_test' },
    });
    await POST({ request: signedRequest(body) } as RouteCtx);

    const after = await env.DB
      .prepare(`SELECT Status FROM EmailBlastSends WHERE ResendId = ?1`)
      .bind('em_precedence_test')
      .first<{ Status: string }>();
    expect(after?.Status).toBe('clicked');

    await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  });
});
