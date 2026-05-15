import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runReminder, getTemplateText } from '../../src/lib/reminders';

// F4: runReminder orchestration. Uses miniflare D1 for the recipient
// query / idempotency / Settings tables, and stubs global fetch so no
// real Resend HTTP traffic leaves the test process.

const FAKE_API_KEY = 'PUBLIC_TEST_VALUE_NOT_A_SECRET_resend_api_key';
const EVENT_DATE = '2026-11-07';
const AUDIENCE_ID = 'aud_test_fixed_id';

interface FetchCall {
  url: string;
  method: string;
}

let fetchCalls: FetchCall[] = [];

function installFetchStub() {
  // Canned responses keyed by endpoint shape. Resend's API surface used
  // here: POST /emails/batch (send), POST /audiences/:id/contacts (upsert),
  // GET /audiences (list) — though list only fires if Settings doesn't have
  // an audience id seeded (we seed it, so list is skipped).
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      fetchCalls.push({ url, method });

      if (url.includes('/emails/batch')) {
        // resendBatch expects { data: [{id}, ...] } — synthesize one id per message.
        const body = init?.body ? JSON.parse(init.body as string) : [];
        const ids = (Array.isArray(body) ? body : []).map((_, i) => ({
          id: `em_${fetchCalls.length}_${i}`,
        }));
        return new Response(JSON.stringify({ data: ids }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/audiences/') && url.includes('/contacts')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/audiences')) {
        return new Response(JSON.stringify({ data: [{ id: AUDIENCE_ID, name: 'test' }] }), {
          status: 200,
        });
      }
      return new Response('not stubbed: ' + url, { status: 500 });
    }),
  );
}

async function seedAudienceId() {
  await env.DB
    .prepare(
      `INSERT INTO Settings (Key, Value, UpdatedBy)
       VALUES ('resend_audience_id', ?1, 'test')
       ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value`,
    )
    .bind(AUDIENCE_ID)
    .run();
}

describe('runReminder (F4)', () => {
  beforeEach(async () => {
    fetchCalls = [];
    installFetchStub();
    await seedAudienceId();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await env.DB.prepare(`DELETE FROM Rsvps`).run();
    await env.DB.prepare(`DELETE FROM Volunteers`).run();
    await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
    await env.DB.prepare(`DELETE FROM ReminderSends`).run();
    await env.DB.prepare(`DELETE FROM Settings WHERE Key NOT IN ('event_date')`).run();
  });

  it('reminders.unsubscribe-filter: excludes recipients on the Unsubscribes list', async () => {
    await env.DB
      .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
      .bind('Yes Person', 'yes@example.com', 'yes')
      .run();
    await env.DB
      .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
      .bind('Opted Out', 'opted@example.com', 'yes')
      .run();
    await env.DB
      .prepare(`INSERT INTO Unsubscribes (Email, Source) VALUES (?1, 'manual')`)
      .bind('opted@example.com')
      .run();

    const result = await runReminder({
      kind: '30day',
      eventDate: EVENT_DATE,
      db: env.DB,
      resendApiKey: FAKE_API_KEY,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1 });
  });

  it('reminders.idempotency: skips recipients already in ReminderSends for the same kind', async () => {
    await env.DB
      .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
      .bind('Already Sent', 'already@example.com', 'yes')
      .run();
    await env.DB
      .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
      .bind('Fresh', 'fresh@example.com', 'yes')
      .run();
    await env.DB
      .prepare(`INSERT INTO ReminderSends (ReminderKind, Email) VALUES (?1, ?2)`)
      .bind('30day', 'already@example.com')
      .run();

    const result = await runReminder({
      kind: '30day',
      eventDate: EVENT_DATE,
      db: env.DB,
      resendApiKey: FAKE_API_KEY,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1 });
  });

  it('reminders.batch-boundary: sends 105 recipients in exactly 2 Resend batch calls', async () => {
    const recipients: string[] = [];
    for (let i = 0; i < 105; i++) recipients.push(`u${i}@example.com`);

    const result = await runReminder({
      kind: '30day',
      eventDate: EVENT_DATE,
      db: env.DB,
      resendApiKey: FAKE_API_KEY,
      overrideRecipients: recipients,
      skipRecording: true, // keeps the per-row Insert noise out of fetchCalls
    });

    const batchCalls = fetchCalls.filter(
      (c) => c.url.includes('/emails/batch') && c.method === 'POST',
    );
    expect({
      attempted: result.attempted,
      sent: result.sent,
      batchCalls: batchCalls.length,
    }).toEqual({ attempted: 105, sent: 105, batchCalls: 2 });
  });

  it('reminders.skipRecording: with skipRecording=true, ReminderSends receives no inserts', async () => {
    await runReminder({
      kind: '30day',
      eventDate: EVENT_DATE,
      db: env.DB,
      resendApiKey: FAKE_API_KEY,
      overrideRecipients: ['nobody@example.com'],
      skipRecording: true,
    });

    const row = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM ReminderSends WHERE Email = ?1`)
      .bind('nobody@example.com')
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('reminders.template-selection: 30day subject contains the formatted event date', () => {
    const tpl = getTemplateText('30day', EVENT_DATE);
    expect(tpl.subject).toContain('November 7, 2026');
  });

  it('reminders.template-selection: 7day subject differs from 30day for the same date', () => {
    const t30 = getTemplateText('30day', EVENT_DATE);
    const t7 = getTemplateText('7day', EVENT_DATE);
    expect(t30.subject === t7.subject).toBe(false);
  });

  it('reminders.no-live-resend: every fetch call goes to api.resend.com (catches accidental real-URL hits)', async () => {
    await runReminder({
      kind: '30day',
      eventDate: EVENT_DATE,
      db: env.DB,
      resendApiKey: FAKE_API_KEY,
      overrideRecipients: ['probe@example.com'],
      skipRecording: true,
    });
    // Every recorded fetch url should be under api.resend.com — if a future
    // refactor introduces a different external call we want it to surface.
    const offRoute = fetchCalls.filter((c) => !c.url.startsWith('https://api.resend.com'));
    expect(offRoute).toEqual([]);
  });
});
