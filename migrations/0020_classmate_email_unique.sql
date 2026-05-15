-- Enforce uniqueness on Classmates.Email so the bulk roster import + single-
-- add path can't create silent duplicates that would double-count in the
-- "roster · not RSVP'd" audience or split outreach across two rows.
--
-- Partial unique index (rows where Email is non-null and non-empty) so the
-- bulk roster path can still insert classmates with no email on file.
-- Match casing/whitespace the way the app normalizes elsewhere so e.g.
-- "Jane@x.com" and "jane@x.com " collide.
--
-- Production already had at least one collision (two siblings/spouses
-- sharing the same gmail address). Resolve in-migration: keep the email
-- on the older row (smaller Id — that's the one most likely owned by the
-- person who registered the address) and null it out on the younger row
-- with an audit note so admins can verify + reach out at /admin/classmates.
UPDATE Classmates
   SET Email = NULL,
       Notes = TRIM(COALESCE(Notes || char(10), '')
                    || '[email cleared by migration 0020 — duplicate of an older roster row]')
 WHERE Id IN (
   SELECT c.Id
     FROM Classmates c
    WHERE c.Email IS NOT NULL
      AND TRIM(c.Email) <> ''
      AND c.Id <> (
        SELECT MIN(c2.Id)
          FROM Classmates c2
         WHERE LOWER(TRIM(c2.Email)) = LOWER(TRIM(c.Email))
      )
 );

DROP INDEX IF EXISTS idx_classmates_email;
-- IF NOT EXISTS makes the migration safe to re-apply on a fresh local DB
-- whose `d1_migrations` tracking is reset (the existing production DB has
-- this migration tracked, so wrangler skips it there). Caught by the
-- idempotency test in tests/d1/migrations-idempotent.test.ts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_classmates_email_unique
  ON Classmates (LOWER(TRIM(Email)))
  WHERE Email IS NOT NULL AND TRIM(Email) <> '';
