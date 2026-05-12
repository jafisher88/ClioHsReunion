-- Per-recipient tracking of automated reminder sends.
-- UNIQUE(ReminderKind, Email) gives us idempotency: if the cron fires
-- twice on the same day for the same kind, the second insert is a no-op
-- and we skip the actual email.
CREATE TABLE ReminderSends (
  Id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ReminderKind TEXT NOT NULL,     -- e.g. '30day', '7day', 'dayof'
  Email        TEXT NOT NULL,
  SentAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ReminderKind, Email)
);
CREATE INDEX idx_reminders_kind ON ReminderSends(ReminderKind);
