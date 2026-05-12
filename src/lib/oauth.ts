import { base64urlDecodeToString } from './base64url';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleIdTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp?: number;
}

export function buildGoogleAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: args.state,
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'true',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ id_token: string; access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Decode (without verifying signature) the Google id_token. Safe here because:
 * - We obtained the id_token directly from Google's token endpoint over HTTPS
 *   in response to a request we initiated (the user did not supply this token).
 * - We additionally validate `iss` and `aud` below before trusting any fields.
 */
export function decodeIdToken(idToken: string): GoogleIdTokenPayload {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed id_token.');
  try {
    return JSON.parse(base64urlDecodeToString(parts[1]));
  } catch {
    throw new Error('Could not decode id_token payload.');
  }
}

export function isValidGoogleIdToken(
  payload: GoogleIdTokenPayload,
  expectedAud: string,
): boolean {
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    return false;
  }
  if (payload.aud !== expectedAud) return false;
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  return true;
}
