-- Removing a date from an event hides its slot instead of deleting it, so the
-- votes cast on it survive and come back if the date is re-added.
ALTER TABLE slots ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
