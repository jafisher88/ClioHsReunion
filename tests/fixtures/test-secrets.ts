/**
 * PUBLIC TEST-ONLY VALUES — NOT SECRETS.
 *
 * These strings grant no access to anything. They exist only so the
 * vitest workers-pool's miniflare env satisfies production code's
 * `if (!env.SESSION_SECRET) ...` / `if (!env.RESEND_WEBHOOK_SECRET) ...`
 * guards, and so the F2/F3 tests can construct + verify signatures
 * locally.
 *
 * Real secrets for cliohsreunion.com live in Cloudflare Worker secrets
 * via `wrangler secret put` and never appear in this repo. The string
 * `PUBLIC_TEST_VALUE_NOT_A_SECRET_` is embedded in each value below so
 * any future grep for "secret" / "key" / "sk_" surfaces these as
 * obviously test data, not production credentials.
 *
 * The repo is intentionally public; these values are part of the
 * test suite and are meant to be readable.
 */

import { Buffer } from 'node:buffer';

/** HMAC key used by `createSessionToken` / `readSessionToken` in tests. */
export const TEST_SESSION_SECRET =
  'PUBLIC_TEST_VALUE_NOT_A_SECRET_for_session_token_hmac_only';

/**
 * Svix-format webhook secret accepted by `standardwebhooks`. The
 * library expects `whsec_<base64>`, so we base64-encode a tagged
 * label rather than ship a random-looking blob.
 */
export const TEST_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from(
  'PUBLIC_TEST_VALUE_NOT_A_SECRET_for_resend_webhook_verify_only',
).toString('base64')}`;
