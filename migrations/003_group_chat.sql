-- Somewhere for a group to hold longer-form discussion off-platform.
ALTER TABLE groups ADD COLUMN chat_url TEXT NOT NULL DEFAULT '';
