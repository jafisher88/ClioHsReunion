-- Canonical roster of Class of 2006 graduates. The planning crew maintains
-- this from the yearbook; RSVPs are matched against it on display (case-
-- insensitive full-name match) so admins can see "who's signed up and
-- who hasn't" at a glance.
CREATE TABLE Classmates (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  FullName    TEXT NOT NULL,         -- yearbook name (e.g. "Jane Doe")
  MaidenName  TEXT,                  -- post-marriage surname if known, otherwise null
  Notes       TEXT,                  -- "lives in CA", "lost contact", etc.
  IsDeceased  INTEGER NOT NULL DEFAULT 0 CHECK (IsDeceased IN (0, 1)),
  CreatedBy   TEXT NOT NULL,
  CreatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_classmates_name     ON Classmates(FullName);
CREATE INDEX idx_classmates_deceased ON Classmates(IsDeceased);
