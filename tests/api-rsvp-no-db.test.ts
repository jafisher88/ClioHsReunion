import { describe, expect, it, vi } from 'vitest';

// Mock the cloudflare:workers module BEFORE importing the route handler
// so its top-level `import { env } from 'cloudflare:workers'` resolves to a
// binding-free env. vi.mock is hoisted by vitest, so this runs first.
vi.mock('cloudflare:workers', () => ({ env: {} as Record<string, unknown> }));

// Import the route handler after the mock is registered.
import { POST } from '../src/pages/api/rsvp';

describe('POST /api/rsvp — env.DB undefined fallback (A11)', () => {
  it('returns {ok:true, persisted:false} HTTP 200 when DB binding missing', async () => {
    const req = new Request('http://test.local/api/rsvp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test User',
        email: 'test@example.com',
        attending: 'yes',
        guestCount: 1,
      }),
    });
    // The handler's APIContext type expects an APIContext shape, but only
    // .request is read here — cast to satisfy TypeScript without faking
    // the rest of the surface.
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    const body = await res.json();
    expect({ status: res.status, body }).toMatchObject({
      status: 200,
      body: { ok: true, persisted: false },
    });
  });

  it('still validates input even with no DB — invalid payload returns 400 before reaching the DB-missing path', async () => {
    const req = new Request('http://test.local/api/rsvp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: '', email: 'bad' }),
    });
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
