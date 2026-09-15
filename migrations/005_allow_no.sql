-- Whether voters may say they can't make a date. Off suits "just gathering
-- numbers"; on suits events where everyone has to attend.
ALTER TABLE events ADD COLUMN allow_no INTEGER NOT NULL DEFAULT 1;
