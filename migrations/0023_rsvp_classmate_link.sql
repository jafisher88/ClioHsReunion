-- Manually persist the RSVP ↔ Classmate match the heuristic JOIN in
-- /admin/classmates can't always figure out (typos, blank GraduationName,
-- married-name combos with first-name changes, etc.).
--
-- ClassmateId: nullable FK. When set, /admin/classmates.astro's roster
-- JOIN treats it as authoritative and skips the heuristic OR-paths for
-- that row. ON DELETE SET NULL so deleting a Classmate cleanly orphans
-- the link rather than cascade-wiping the RSVP itself. The classmates
-- merge endpoint (src/pages/api/admin/classmates/merge.ts) takes
-- explicit care to re-point Rsvps.ClassmateId before deleting a merge
-- loser so the link follows the merge instead of going null.
--
-- MatchedBy / MatchedAt: audit columns. Set together with ClassmateId
-- on every match POST; cleared together on DELETE. They deliberately
-- PERSIST when ON DELETE SET NULL fires from a Classmate delete —
-- the orphan audit trail is the design choice ("here's who linked this
-- RSVP to a classmate that no longer exists, and when").
--
-- DEFAULT NULL is required when ALTER-adding a FK column to a table
-- with foreign_keys enabled (SQLite docs); without it the FK constraint
-- is silently weakened.
ALTER TABLE Rsvps ADD COLUMN ClassmateId INTEGER DEFAULT NULL
  REFERENCES Classmates(Id) ON DELETE SET NULL;
ALTER TABLE Rsvps ADD COLUMN MatchedBy   TEXT    DEFAULT NULL;
ALTER TABLE Rsvps ADD COLUMN MatchedAt   TEXT    DEFAULT NULL;

CREATE INDEX idx_rsvps_classmate ON Rsvps(ClassmateId);
