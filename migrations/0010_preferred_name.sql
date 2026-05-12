-- Add an optional preferred first name. RSVP matching now also matches
-- against {PreferredFirstName + last-name-portion-of-FullName} so
-- someone who RSVPs as "Becky Frey" still matches the yearbook
-- "Rebecca Frey" entry.
ALTER TABLE Classmates ADD COLUMN PreferredFirstName TEXT;
