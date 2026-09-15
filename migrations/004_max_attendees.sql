-- Optional capacity cap. 0 = unlimited. Only 'yes' votes count against it.
ALTER TABLE events ADD COLUMN max_attendees INTEGER NOT NULL DEFAULT 0;
