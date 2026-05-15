-- Enforce uniqueness on Classmates.Email so the bulk roster import + single-
-- add path can't create silent duplicates that would double-count in the
-- "roster · not RSVP'd" audience or split outreach across two rows.
--
-- Partial unique index (rows where Email is non-null and non-empty) so the
-- bulk roster path can still insert classmates with no email on file.
-- Match casing/whitespace the way the app normalizes elsewhere so e.g.
-- "Jane@x.com" and "jane@x.com " collide.
DROP INDEX IF EXISTS idx_classmates_email;
CREATE UNIQUE INDEX idx_classmates_email_unique
  ON Classmates (LOWER(TRIM(Email)))
  WHERE Email IS NOT NULL AND TRIM(Email) <> '';
