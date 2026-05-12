-- Whitelist of Google accounts permitted to access /admin.
-- Email is stored lowercase; uniqueness is enforced case-insensitively
-- by always normalizing before insert/lookup.
CREATE TABLE Admins (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  Email       TEXT NOT NULL UNIQUE,
  AddedBy     TEXT,
  AddedAt     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  LastLoginAt TEXT
);

CREATE INDEX idx_admins_added ON Admins(AddedAt);
