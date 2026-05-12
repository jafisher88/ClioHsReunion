-- RSVPs for the Clio HS Class of 2006 reunion
CREATE TABLE Rsvps (
  Id           INTEGER PRIMARY KEY AUTOINCREMENT,
  FullName     TEXT NOT NULL,
  Email        TEXT NOT NULL,
  Attending    TEXT NOT NULL CHECK (Attending IN ('yes', 'no', 'maybe')),
  GuestCount   INTEGER NOT NULL DEFAULT 1 CHECK (GuestCount >= 0 AND GuestCount <= 10),
  MaidenName   TEXT,
  Notes        TEXT,
  CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rsvps_email ON Rsvps(Email);
CREATE INDEX idx_rsvps_created ON Rsvps(CreatedAt);
