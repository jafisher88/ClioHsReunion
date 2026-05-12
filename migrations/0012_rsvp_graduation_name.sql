-- The RSVP form now asks for "Name at graduation" + "Current name" instead of
-- the three-field "Full / Preferred / Maiden" combo. GraduationName captures
-- the yearbook entry so we can match against the Classmates roster even when
-- a classmate changed their surname.
--
-- The existing FullName column continues to hold the current name, and
-- PreferredFirstName is auto-derived from the current name's first word
-- server-side.
ALTER TABLE Rsvps ADD COLUMN GraduationName TEXT;
