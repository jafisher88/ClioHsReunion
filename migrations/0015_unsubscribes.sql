-- Local mirror of Resend audience opt-outs. Resend remains the source of
-- truth (CAN-SPAM requires that we honor unsubscribes the moment the
-- recipient clicks the link in their inbox), but mirroring into D1 lets
-- the blast composer pre-filter recipients without a round-trip and
-- shows admins "X opted out" counts at a glance.
--
-- Source: 'resend' (synced from audience), 'manual' (admin marked here).
CREATE TABLE Unsubscribes (
  Email          TEXT PRIMARY KEY,         -- lowercase, trimmed
  Source         TEXT NOT NULL,
  UnsubscribedAt TEXT,                     -- when Resend recorded the opt-out (may be null)
  SyncedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_unsubscribes_synced ON Unsubscribes(SyncedAt);
