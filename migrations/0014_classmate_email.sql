-- Add email to the classmate roster so we can capture contact info from
-- the Google sheet (or anywhere else) independently of whether the
-- classmate has RSVP'd yet. The dashboard still prefers RSVP.Email when
-- present (newer + self-reported) and falls back to Classmates.Email
-- for those who haven't replied.
ALTER TABLE Classmates ADD COLUMN Email TEXT;
CREATE INDEX idx_classmates_email ON Classmates(Email);
