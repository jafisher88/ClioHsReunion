-- Let RSVP submitters specify their own preferred first name (e.g. "Becky"
-- when the yearbook lists "Rebecca"). Personalization picks this up first
-- because it's the most authoritative — the person told us themselves.
ALTER TABLE Rsvps ADD COLUMN PreferredFirstName TEXT;
