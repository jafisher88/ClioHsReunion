-- Email blast audit log: every admin-sent broadcast is recorded here so
-- the planning crew can see what was sent, by whom, and to whom.
CREATE TABLE EmailBlasts (
  Id              INTEGER PRIMARY KEY AUTOINCREMENT,
  Subject         TEXT NOT NULL,
  BodyText        TEXT NOT NULL,            -- the plain-text source the admin typed
  Audience        TEXT NOT NULL,            -- yes / maybe / no / all-rsvp / volunteers / everyone / custom
  RecipientCount  INTEGER NOT NULL,
  SentBy          TEXT NOT NULL,            -- admin email
  SentAt          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ResendId        TEXT,                     -- batch id returned by Resend (if any)
  Status          TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX idx_blasts_sent ON EmailBlasts(SentAt);

-- Simple key/value settings table for things like the locked-in event date.
-- Used by auto-reminders (next feature) to know when "30 days before" is.
CREATE TABLE Settings (
  Key       TEXT PRIMARY KEY,
  Value     TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedBy TEXT
);
