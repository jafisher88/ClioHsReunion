-- Volunteer sign-ups for setup (day before) and cleanup (day after).
-- A single row can register for one or both roles. CHECK at the end of
-- the table enforces that at least one role is selected.
CREATE TABLE Volunteers (
  Id           INTEGER PRIMARY KEY AUTOINCREMENT,
  FullName     TEXT NOT NULL,
  Email        TEXT NOT NULL,
  Phone        TEXT,
  RoleSetup    INTEGER NOT NULL DEFAULT 0 CHECK (RoleSetup IN (0, 1)),
  RoleCleanup  INTEGER NOT NULL DEFAULT 0 CHECK (RoleCleanup IN (0, 1)),
  Notes        TEXT,
  CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (RoleSetup = 1 OR RoleCleanup = 1)
);

CREATE INDEX idx_volunteers_email ON Volunteers(Email);
CREATE INDEX idx_volunteers_created ON Volunteers(CreatedAt);
