-- Idempotency log for inbound Resend webhooks. Resend signs every delivery
-- with a unique svix-id; we record it here so duplicate deliveries (Svix
-- retries on any non-2xx and on network blips) become no-ops.
--
-- We also keep EventType + EmailId for cheap audit / debugging from the
-- D1 console without having to re-derive them from the Resend dashboard.
CREATE TABLE WebhookEvents (
  EventId    TEXT    PRIMARY KEY,                    -- svix-id from the request header
  EventType  TEXT    NOT NULL,                       -- e.g. email.delivered, email.opened
  EmailId    TEXT,                                   -- Resend message id (data.email_id)
  ReceivedAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_email_id ON WebhookEvents(EmailId);
CREATE INDEX idx_webhook_events_received ON WebhookEvents(ReceivedAt);
