-- Photo submissions from classmates. The actual image bytes live in R2
-- under PHOTOS binding at the key in R2Key; this table is the metadata
-- index plus the caption + names that classmates supplied.
--
-- Submissions are admin-only by design (no public gallery) — Jason and
-- Jamie will build something with the collection for the event.
CREATE TABLE PhotoSubmissions (
  Id             INTEGER PRIMARY KEY AUTOINCREMENT,
  R2Key          TEXT NOT NULL UNIQUE,
  OriginalName   TEXT,
  ContentType    TEXT NOT NULL,
  Bytes          INTEGER NOT NULL,
  Caption        TEXT,
  PeopleInPhoto  TEXT,
  SubmitterName  TEXT,
  SubmitterEmail TEXT,
  CreatedAt      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_photos_created ON PhotoSubmissions(CreatedAt);
