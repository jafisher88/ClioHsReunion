import { describe, expect, it } from 'vitest';
import { Webhook } from 'standardwebhooks';
import {
  verifyResendWebhook,
  WebhookVerificationError,
} from '../src/lib/resend-webhook';
import { TEST_RESEND_WEBHOOK_SECRET } from './fixtures/test-secrets';

// F2: end-to-end signature verification for the Resend webhook. Uses
// the standardwebhooks library's own signer to mint valid signatures,
// then asserts each documented failure mode rejects. Secret is imported
// from tests/fixtures/test-secrets.ts (PUBLIC_TEST_VALUE_NOT_A_SECRET_*).

const TEST_SECRET = TEST_RESEND_WEBHOOK_SECRET;

function sign(secret: string, body: string, opts: { id?: string; timestamp?: Date } = {}) {
  const wh = new Webhook(secret);
  const id = opts.id ?? 'msg_test_001';
  const timestamp = opts.timestamp ?? new Date();
  const signature = wh.sign(id, timestamp, body);
  const headers = new Headers({
    'svix-id': id,
    'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
    'svix-signature': signature,
  });
  return { id, timestamp, signature, headers };
}

const samplePayload = JSON.stringify({
  type: 'email.opened',
  created_at: '2026-05-15T12:00:00Z',
  data: { email_id: 'abc-123' },
});

describe('verifyResendWebhook (F2)', () => {
  it('webhook-sig.valid: returns the parsed event when secret + headers + body all match', () => {
    const { headers } = sign(TEST_SECRET, samplePayload);
    const event = verifyResendWebhook(TEST_SECRET, samplePayload, headers);
    expect(event).toMatchObject({
      type: 'email.opened',
      data: { email_id: 'abc-123' },
    });
  });

  it('webhook-sig.wrong-secret: throws WebhookVerificationError when verifying with a different secret', () => {
    const { headers } = sign(TEST_SECRET, samplePayload);
    expect(() =>
      verifyResendWebhook('whsec_d3Jvbmctc2VjcmV0LWZvci10ZXN0aW5n', samplePayload, headers),
    ).toThrow(WebhookVerificationError);
  });

  it('webhook-sig.tampered-body: throws when body bytes differ from what was signed', () => {
    const { headers } = sign(TEST_SECRET, samplePayload);
    const tampered = samplePayload.replace('abc-123', 'attacker-injected');
    expect(() => verifyResendWebhook(TEST_SECRET, tampered, headers)).toThrow(
      WebhookVerificationError,
    );
  });

  it('webhook-sig.stale-timestamp: throws when timestamp is outside the replay window', () => {
    // standardwebhooks' default tolerance is 5 minutes. 10 minutes in the past
    // is well past that.
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const { headers } = sign(TEST_SECRET, samplePayload, { timestamp: stale });
    expect(() => verifyResendWebhook(TEST_SECRET, samplePayload, headers)).toThrow(
      WebhookVerificationError,
    );
  });

  it('webhook-sig.missing-headers: throws when any svix-* header is absent', () => {
    const { headers } = sign(TEST_SECRET, samplePayload);
    headers.delete('svix-signature');
    expect(() => verifyResendWebhook(TEST_SECRET, samplePayload, headers)).toThrow(
      WebhookVerificationError,
    );
  });

  it('webhook-sig.empty-secret: throws when the secret is empty (mis-configured)', () => {
    const { headers } = sign(TEST_SECRET, samplePayload);
    expect(() => verifyResendWebhook('', samplePayload, headers)).toThrow(
      WebhookVerificationError,
    );
  });
});
