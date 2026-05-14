/**
 * Resend webhook signature verification.
 *
 * Resend signs every webhook with Svix-style headers (`svix-id`,
 * `svix-timestamp`, `svix-signature`). The `standardwebhooks` package is the
 * spec-author's own implementation and does the timing-safe HMAC-SHA256
 * compare + replay-window check. We wrap it to:
 *   - translate the `svix-*` header names Resend uses into the canonical
 *     `webhook-*` names the lib expects,
 *   - normalize the secret (Resend secrets ship with a `whsec_` prefix that
 *     standardwebhooks strips internally — but we strip ourselves first so
 *     missing/empty cases fail loud),
 *   - return a typed event payload instead of `unknown`.
 */
import { Webhook, WebhookVerificationError } from 'standardwebhooks';

export { WebhookVerificationError };

/**
 * Email-event payload shape Resend sends. Only the fields we actually use
 * are typed strictly; everything else is `unknown` so we don't have to keep
 * up with new optional fields.
 *
 * Reference: https://resend.com/docs/webhooks/emails/clicked
 */
export interface ResendEmailEvent {
  type: string;                 // e.g. "email.delivered", "email.opened"
  created_at: string;           // ISO 8601
  data: {
    email_id: string;
    broadcast_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    [key: string]: unknown;
  };
}

/** All event types we care about for blast tracking. */
export const TRACKED_EVENT_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
]);

/**
 * Verify a Resend webhook request and return the parsed event.
 * Throws `WebhookVerificationError` on bad signature / missing headers /
 * stale timestamp.
 */
export function verifyResendWebhook(
  secret: string,
  rawBody: string,
  headers: Headers,
): ResendEmailEvent {
  if (!secret) {
    throw new WebhookVerificationError('RESEND_WEBHOOK_SECRET is not configured.');
  }

  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError('Missing svix-id / svix-timestamp / svix-signature header.');
  }

  const wh = new Webhook(secret);
  const verified = wh.verify(rawBody, {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': signature,
  });
  return verified as ResendEmailEvent;
}
