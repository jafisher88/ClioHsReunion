-- In memoriam — classmates we honor and remember.
-- Years (not full dates) so the page reads as a tasteful "1988 – 2023" range
-- without exposing exact birthdays unnecessarily.
CREATE TABLE MemoriamEntries (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  FullName    TEXT NOT NULL,
  MaidenName  TEXT,
  BirthYear   INTEGER,
  PassingYear INTEGER,
  Tribute     TEXT,        -- optional short remembrance
  PhotoUrl    TEXT,        -- optional external photo URL for now
  CreatedBy   TEXT NOT NULL,
  CreatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memoriam_passing ON MemoriamEntries(PassingYear);
