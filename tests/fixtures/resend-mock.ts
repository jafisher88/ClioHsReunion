/**
 * Reusable Resend HTTP mock for tests that exercise code paths which
 * call api.resend.com via globalThis.fetch (the production code uses
 * `fetch(...)` directly — see src/lib/resend.ts — so stubbing the global
 * intercepts both batch sends and contact upserts).
 *
 * `vi.stubGlobal('fetch', ...)` is the canonical approach inside
 * `@cloudflare/vitest-pool-workers`. The reminders test (F4) already
 * uses it; this fixture generalizes the pattern so the blast-resend
 * tests can share one source of truth.
 *
 * Usage:
 *
 *   import { installResendMock } from '../fixtures/resend-mock';
 *
 *   let mock: ReturnType<typeof installResendMock>;
 *
 *   beforeEach(() => { mock = installResendMock(); });
 *   afterEach(() => mock.restore());
 *
 *   // Inside a test:
 *   mock.failBatchOnIndex(1);              // batch index 1 throws
 *   await POST(ctx);
 *   expect(mock.calls.batch).toHaveLength(2);
 *   expect(mock.calls.batch[0].body).toMatchObject({ ... });
 */
import { vi } from 'vitest';

export interface RecordedFetch {
  url: string;
  method: string;
  body: unknown;
}

export interface RecordedCalls {
  batch: RecordedFetch[];        // POST /emails/batch
  upsertContact: RecordedFetch[]; // POST /audiences/:id/contacts
  listAudiences: RecordedFetch[]; // GET  /audiences
  other: RecordedFetch[];         // anything else (helps surface stub misses)
}

export interface ResendMock {
  /** Per-endpoint recorded call log; cleared on each `installResendMock()`. */
  calls: RecordedCalls;
  /**
   * Make the Nth call to /emails/batch (0-indexed) reject before reaching
   * the recorder. Used to simulate partial-failure scenarios — earlier
   * batches still succeed and have their EmailBlastSends rows persisted.
   */
  failBatchOnIndex(index: number): void;
  /** Restore the original globalThis.fetch. Call from afterEach. */
  restore(): void;
}

const AUDIENCE_ID = 'aud_test_fixed_id';

export function installResendMock(): ResendMock {
  const calls: RecordedCalls = { batch: [], upsertContact: [], listAudiences: [], other: [] };
  const batchFailIndices = new Set<number>();

  // Bypass resendUpsertContacts' 1.1s inter-chunk throttle. The mock
  // returns instantly so the only thing time-gating the test is the
  // setTimeout in the throttle helper. With this stub, a 150-recipient
  // upsert finishes in milliseconds instead of ~40 seconds.
  vi.stubGlobal(
    'setTimeout',
    vi.fn((cb: () => void) => {
      cb();
      return 0;
    }),
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      const bodyParsed = init?.body ? safeJsonParse(init.body) : undefined;
      const record: RecordedFetch = { url, method, body: bodyParsed };

      // POST /emails/batch — return one synthetic per-message id per
      // input message, in order, matching Resend's real contract. The
      // production code expects { data: [{id}, ...] }.
      if (url.includes('/emails/batch')) {
        const batchIndex = calls.batch.length;
        calls.batch.push(record);
        if (batchFailIndices.has(batchIndex)) {
          // Surface as a non-2xx — production code throws on !res.ok.
          return new Response(
            JSON.stringify({ message: 'simulated batch failure' }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          );
        }
        const msgs = Array.isArray(bodyParsed) ? bodyParsed : [];
        const data = msgs.map((_, i) => ({ id: `em_b${batchIndex}_m${i}` }));
        return new Response(
          JSON.stringify({ data }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      // POST /audiences/:id/contacts — Resend returns the contact, but
      // production code (resendUpsertContact) ignores the body. Empty
      // 200 is fine.
      if (/\/audiences\/[^/]+\/contacts/.test(url)) {
        calls.upsertContact.push(record);
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // GET /audiences — used by resendEnsureAudience when Settings has
      // no cached id. Return one fixed audience.
      if (url.endsWith('/audiences') || url.includes('/audiences?')) {
        calls.listAudiences.push(record);
        return new Response(
          JSON.stringify({ data: [{ id: AUDIENCE_ID, name: "Clio HS '06 Reunion mailing list" }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      calls.other.push(record);
      return new Response(`Resend mock: unstubbed URL ${url}`, { status: 500 });
    }),
  );

  return {
    calls,
    failBatchOnIndex(index: number) {
      batchFailIndices.add(index);
    },
    restore() {
      vi.unstubAllGlobals();
    },
  };
}

function safeJsonParse(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
