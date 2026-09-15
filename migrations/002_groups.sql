-- Groups own the first path segment and carry a persistent member roster.

CREATE TABLE IF NOT EXISTS groups (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,      -- single segment: 'bnh'
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  owner_key_hash  TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- A member's token works across every event in the group, now and in future.
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token       TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_token ON members(group_id, token);
CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);

ALTER TABLE events ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_events_group ON events(group_id);

-- Binds a vote to a group member rather than a per-event token.
ALTER TABLE participants ADD COLUMN member_id TEXT REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_participants_member ON participants(member_id);
