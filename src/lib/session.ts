import { base64urlEncode, base64urlDecodeToString } from './base64url';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionPayload {
  email: string;
  exp: number; // unix seconds
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function constantTimeEqualsB64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  email: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64urlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function readSessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const key = await hmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const expectedB64 = base64urlEncode(new Uint8Array(expectedSig));

  if (!constantTimeEqualsB64(sigB64, expectedB64)) return null;

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(base64urlDecodeToString(payloadB64));
  } catch {
    return null;
  }
  if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}
