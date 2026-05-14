-- Per-recipient row for every email a blast generated. Lets the admin
-- click into a blast and see who it went to + each message's last_event
-- (sent / delivered / opened / clicked / bounced / complained), polled
-- on demand from Resend's GET /emails/:id endpoint.
CREATE TABLE EmailBlastSends (
  Id            INTEGER PRIMARY KEY AUTOINCREMENT,
  BlastId       INTEGER NOT NULL,
  Email         TEXT    NOT NULL,
  ResendId      TEXT,                                       -- per-message id from Resend's batch response
  Status        TEXT    NOT NULL DEFAULT 'sent',            -- last known last_event
  LastCheckedAt TEXT,                                       -- when we last polled Resend for this row
  CreatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (BlastId) REFERENCES EmailBlasts(Id) ON DELETE CASCADE
);

CREATE INDEX idx_blast_sends_blast    ON EmailBlastSends(BlastId);
CREATE INDEX idx_blast_sends_resendid ON EmailBlastSends(ResendId);
