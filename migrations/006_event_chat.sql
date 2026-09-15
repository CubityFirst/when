-- An event can carry its own discussion link, independent of its group's.
ALTER TABLE events ADD COLUMN chat_url TEXT NOT NULL DEFAULT '';
