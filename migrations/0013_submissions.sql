-- Free-form submissions sent from the public /contact form.
-- Classmates can submit news, suggestions, corrections, or questions
-- without bouncing out to Facebook. Admins triage from /admin/submissions.
--
-- Status lifecycle: 'new' -> 'in_progress' -> 'resolved'  (or 'archived').
-- AdminNotes is private to organizers and never shown publicly.
CREATE TABLE Submissions (
  Id             INTEGER PRIMARY KEY AUTOINCREMENT,
  Category       TEXT NOT NULL DEFAULT 'general',
  SubmitterName  TEXT,
  SubmitterEmail TEXT,
  Subject        TEXT,
  Message        TEXT NOT NULL,
  Status         TEXT NOT NULL DEFAULT 'new',
  AdminNotes     TEXT,
  CreatedAt      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ResolvedAt     TEXT
);

CREATE INDEX idx_submissions_status_created ON Submissions(Status, CreatedAt DESC);
CREATE INDEX idx_submissions_created ON Submissions(CreatedAt DESC);
