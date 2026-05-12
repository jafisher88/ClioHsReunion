-- Single-table ledger for tracking reunion finances.
-- Amounts are stored as integer cents to avoid floating-point rounding.
-- Direction is 'in' (money received) or 'out' (money spent).
-- Category is free-text so we can add new buckets without schema changes;
-- the UI suggests common values via a datalist.
CREATE TABLE LedgerEntries (
  Id           INTEGER PRIMARY KEY AUTOINCREMENT,
  EntryDate    TEXT NOT NULL,                                 -- YYYY-MM-DD
  Direction    TEXT NOT NULL CHECK (Direction IN ('in', 'out')),
  AmountCents  INTEGER NOT NULL CHECK (AmountCents > 0),
  Category     TEXT NOT NULL,
  Counterparty TEXT,                                          -- who paid / who was paid
  Description  TEXT,
  Method       TEXT,                                          -- Venmo / Cash / Check / etc.
  Notes        TEXT,
  CreatedBy    TEXT NOT NULL,                                 -- admin email
  CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_date ON LedgerEntries(EntryDate);
CREATE INDEX idx_ledger_direction ON LedgerEntries(Direction);
