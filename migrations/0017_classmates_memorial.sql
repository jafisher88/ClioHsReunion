-- Consolidate the in-memoriam fields onto Classmates so marking a roster
-- row as deceased is the ONE place memorial details live. The standalone
-- MemoriamEntries table is no longer read or written by the app; we keep
-- it for now as an audit trail of what existed before this migration.
ALTER TABLE Classmates ADD COLUMN BirthYear   INTEGER;
ALTER TABLE Classmates ADD COLUMN PassingYear INTEGER;
ALTER TABLE Classmates ADD COLUMN Tribute     TEXT;
ALTER TABLE Classmates ADD COLUMN PhotoUrl    TEXT;
ALTER TABLE Classmates ADD COLUMN ObituaryUrl TEXT;

-- Fold any existing MemoriamEntries rows onto their matching classmate
-- (case-insensitive full-name match). Sets IsDeceased=1 along the way.
UPDATE Classmates
   SET IsDeceased  = 1,
       BirthYear   = (SELECT m.BirthYear   FROM MemoriamEntries m
                       WHERE LOWER(TRIM(m.FullName)) = LOWER(TRIM(Classmates.FullName)) LIMIT 1),
       PassingYear = (SELECT m.PassingYear FROM MemoriamEntries m
                       WHERE LOWER(TRIM(m.FullName)) = LOWER(TRIM(Classmates.FullName)) LIMIT 1),
       Tribute     = COALESCE(Classmates.Tribute,
                              (SELECT m.Tribute  FROM MemoriamEntries m
                                WHERE LOWER(TRIM(m.FullName)) = LOWER(TRIM(Classmates.FullName)) LIMIT 1)),
       PhotoUrl    = COALESCE(Classmates.PhotoUrl,
                              (SELECT m.PhotoUrl FROM MemoriamEntries m
                                WHERE LOWER(TRIM(m.FullName)) = LOWER(TRIM(Classmates.FullName)) LIMIT 1))
 WHERE LOWER(TRIM(Classmates.FullName)) IN (SELECT LOWER(TRIM(FullName)) FROM MemoriamEntries);
