-- Event planning checklist. One row per logistics item that needs handling
-- before the reunion. Admins toggle IsDone and capture the "how it's
-- solved" detail in Notes.
CREATE TABLE PlanningItems (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  Sort        INTEGER NOT NULL,
  Label       TEXT NOT NULL,
  IsDone      INTEGER NOT NULL DEFAULT 0 CHECK (IsDone IN (0, 1)),
  Notes       TEXT,
  UpdatedBy   TEXT,
  UpdatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CreatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_planning_sort ON PlanningItems(Sort);

INSERT INTO PlanningItems (Sort, Label) VALUES
  ( 10, 'Food'),
  ( 20, 'Drinks'),
  ( 30, 'DJ'),
  ( 40, 'Photobooth'),
  ( 50, 'Venue'),
  ( 60, 'Bartender'),
  ( 70, 'Poker Table Items'),
  ( 80, 'Euchre Table and Cards'),
  ( 90, 'Silver Decorations'),
  (100, 'Plates'),
  (110, 'Plastic Ware'),
  (120, 'Cups'),
  (130, 'Napkins'),
  (140, '10 Volunteers to Set Up and Decorate'),
  (150, '10 Volunteers to Clean Up the Next Day'),
  (160, 'Name Tags'),
  (170, 'Event Insurance');
