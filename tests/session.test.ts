import { describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken } from '../src/lib/session';

const SECRET = 'test-secret-must-be-long-enough-for-hmac-sha256';

describe('session token round-trip', () => {
  it('encodes and decodes the email', async () => {
    const token = await createSessionToken('jane@example.com', SECRET);
    const payload = await readSessionToken(token, SECRET);
    expect(payload?.email).toBe('jane@example.com');
  });

  it('lowercases the email on encode', async () => {
    const token = await createSessionToken('Jane@Example.COM', SECRET);
    const payload = await readSessionToken(token, SECRET);
    expect(payload?.email).toBe('jane@example.com');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken('jane@example.com', SECRET);
    const payload = await readSessionToken(token, 'different-secret-value');
    expect(payload).toBe(null);
  });

  it('rejects a token whose signature byte was flipped', async () => {
    const token = await createSessionToken('jane@example.com', SECRET);
    const dot = token.indexOf('.');
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    // Flip the last character to a different one — any tamper should fail.
    const flipped = sigB64.slice(0, -1) + (sigB64.endsWith('A') ? 'B' : 'A');
    const payload = await readSessionToken(`${payloadB64}.${flipped}`, SECRET);
    expect(payload).toBe(null);
  });

  it('rejects a token whose payload was tampered', async () => {
    const tokenA = await createSessionToken('alice@example.com', SECRET);
    const tokenB = await createSessionToken('bob@example.com', SECRET);
    // Splice tokenB's payload onto tokenA's signature — neither should validate.
    const dotA = tokenA.indexOf('.');
    const sigA = tokenA.slice(dotA + 1);
    const dotB = tokenB.indexOf('.');
    const payloadB = tokenB.slice(0, dotB);
    const payload = await readSessionToken(`${payloadB}.${sigA}`, SECRET);
    expect(payload).toBe(null);
  });

  it('rejects an expired token', async () => {
    const token = await createSessionToken('jane@example.com', SECRET, -10);
    const payload = await readSessionToken(token, SECRET);
    expect(payload).toBe(null);
  });

  it('rejects malformed tokens', async () => {
    expect(await readSessionToken('', SECRET)).toBe(null);
    expect(await readSessionToken('no-dot-here', SECRET)).toBe(null);
    expect(await readSessionToken('.', SECRET)).toBe(null);
    expect(await readSessionToken('only.', SECRET)).toBe(null);
    expect(await readSessionToken('.only', SECRET)).toBe(null);
  });

  it('roundtrip preserves the configured TTL', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken('jane@example.com', SECRET, 3600);
    const payload = await readSessionToken(token, SECRET);
    expect(payload).not.toBe(null);
    expect(payload!.exp).toBeGreaterThanOrEqual(before + 3600 - 2);
    expect(payload!.exp).toBeLessThanOrEqual(before + 3600 + 2);
  });
});
