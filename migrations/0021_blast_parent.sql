-- Link follow-up blasts back to their campaign root. ParentBlastId always
-- points to the ROOT of the chain (never the immediate predecessor), so
-- a resend-of-a-resend still resolves with a single-hop lookup — no
-- recursive CTE needed in the diff query.
--
-- ON DELETE SET NULL: if the root is ever deleted, children orphan
-- safely rather than cascade-wiping the audit trail.
ALTER TABLE EmailBlasts ADD COLUMN ParentBlastId INTEGER NULL
  REFERENCES EmailBlasts(Id) ON DELETE SET NULL;

CREATE INDEX idx_blasts_parent ON EmailBlasts(ParentBlastId);
