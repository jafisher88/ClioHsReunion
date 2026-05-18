import { afterEach, describe, expect, it, vi } from 'vitest';
import { resendUpsertContacts } from '../src/lib/resend';

// Covers the throttled bulk-upsert helper. The bug it exists to prevent
// is real: a naive Promise.all(map(upsert)) over >5 recipients blew
// Resend's 5 req/sec ceiling and 429'd the email batch that followed.

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[] = [];

function stubFetch(responder: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, method: init?.method ?? 'GET' });
      return responder();
    }),
  );
}

afterEach(() => {
  calls = [];
  vi.unstubAllGlobals();
});

describe('resendUpsertContacts (throttled bulk upsert)', () => {
  it('resend-upsert-contacts.call-per-contact: makes one POST per contact', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    const contacts = Array.from({ length: 9 }, (_, i) => ({ email: `u${i}@example.com` }));

    await resendUpsertContacts('PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey', 'aud_x', contacts, undefined, { delayMs: 0 });

    expect(calls.length).toBe(9);
  });

  it('resend-upsert-contacts.targets-audience-endpoint: every POST hits /audiences/:id/contacts', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    await resendUpsertContacts(
      'PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey',
      'aud_x',
      [{ email: 'a@example.com' }],
      undefined,
      { delayMs: 0 },
    );

    expect(calls[0]?.url.endsWith('/audiences/aud_x/contacts')).toBe(true);
  });

  it('resend-upsert-contacts.swallows-per-contact-errors: 5xx on one contact does not throw', async () => {
    stubFetch(() => new Response('boom', { status: 500 }));
    const failed: string[] = [];

    await resendUpsertContacts(
      'PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey',
      'aud_x',
      [{ email: 'a@example.com' }, { email: 'b@example.com' }],
      (email) => failed.push(email),
      { delayMs: 0 },
    );

    expect(failed.sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('resend-upsert-contacts.409-not-an-error: existing-contact responses do not fire onError', async () => {
    stubFetch(() => new Response('{"error":"already exists"}', { status: 409 }));
    let errorFires = 0;

    await resendUpsertContacts(
      'PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey',
      'aud_x',
      [{ email: 'a@example.com' }],
      () => { errorFires++; },
      { delayMs: 0 },
    );

    expect(errorFires).toBe(0);
  });

  it('resend-upsert-contacts.chunked-within-limit: with chunkSize=4, 9 contacts emit 9 calls regardless of pacing', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));

    await resendUpsertContacts(
      'PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey',
      'aud_x',
      Array.from({ length: 9 }, (_, i) => ({ email: `u${i}@example.com` })),
      undefined,
      { chunkSize: 4, delayMs: 0 },
    );

    // chunkSize doesn't drop calls — every contact still gets one POST.
    expect(calls.length).toBe(9);
  });

  it('resend-upsert-contacts.delay-respected: with delayMs>0 between chunks, a 5-contact call waits at least delayMs', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    const start = Date.now();

    await resendUpsertContacts(
      'PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey',
      'aud_x',
      Array.from({ length: 5 }, (_, i) => ({ email: `u${i}@example.com` })),
      undefined,
      { chunkSize: 4, delayMs: 50 },
    );

    expect(Date.now() - start >= 50).toBe(true);
  });

  it('resend-upsert-contacts.empty-list: zero contacts performs zero fetches', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));

    await resendUpsertContacts('PUBLIC_TEST_VALUE_NOT_A_SECRET_apikey', 'aud_x', [], undefined, { delayMs: 0 });

    expect(calls.length).toBe(0);
  });
});
