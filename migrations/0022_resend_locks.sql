-- Per-root concurrency lock for the resend POST endpoint.
--
-- SQLite (and therefore D1) serializes writes, so INSERT-with-PK-conflict
-- on this table gives us an atomic "claim the right to resend campaign N"
-- gate that runs BEFORE the actual Resend batch send. Without this, two
-- concurrent POSTs against the same root could both pass the 30-second
-- SentAt window check (their SELECTs see nothing recent yet) and both
-- send + audit, producing duplicate emails.
--
-- ON DELETE CASCADE: if the root blast is ever deleted, any stale lock
-- referencing it disappears with it.
CREATE TABLE ResendLocks (
  ParentBlastId INTEGER PRIMARY KEY
                REFERENCES EmailBlasts(Id) ON DELETE CASCADE,
  AcquiredAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index isn't strictly needed (PK is already indexed) but the stale-lock
-- sweep is `DELETE WHERE AcquiredAt < ...`, which scans the AcquiredAt
-- column. At 1-10 rows max this is fine without an index, but the index
-- makes the contract explicit and is cheap.
CREATE INDEX idx_resend_locks_acquired ON ResendLocks(AcquiredAt);
