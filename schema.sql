-- when.cubityfir.st -- group availability polling
-- Full schema for a fresh database. Incremental changes live in migrations/.

CREATE TABLE IF NOT EXISTS groups (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  owner_key_hash  TEXT NOT NULL,
  chat_url        TEXT NOT NULL DEFAULT '',   -- Discord/Slack/etc. invite
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  owner_key_hash  TEXT NOT NULL,
  group_id        TEXT REFERENCES groups(id) ON DELETE CASCADE,
  access_mode     TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'token' | 'group'
  min_attendees   INTEGER NOT NULL DEFAULT 0,     -- 0 = no threshold
  max_attendees   INTEGER NOT NULL DEFAULT 0,     -- 0 = no cap; counts 'yes' only
  allow_no        INTEGER NOT NULL DEFAULT 1,     -- may voters answer "can't"?
  chat_url        TEXT NOT NULL DEFAULT '',       -- this event's own chat link
  count_maybe     INTEGER NOT NULL DEFAULT 0,     -- count 'maybe' toward quorum
  timezone        TEXT NOT NULL DEFAULT 'Europe/London',
  locked_slot_id  TEXT,
  closed          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- One row per votable option: a whole day, or a time slot within a day.
CREATE TABLE IF NOT EXISTS slots (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,            -- 'YYYY-MM-DD'
  start_time  TEXT,                     -- 'HH:MM', NULL = all day
  end_time    TEXT,                     -- 'HH:MM', optional
  label       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_slots_event ON slots(event_id, date, sort_order);

CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_value ON tokens(event_id, token);

CREATE TABLE IF NOT EXISTS participants (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  comment     TEXT NOT NULL DEFAULT '',
  token_id    TEXT REFERENCES tokens(id) ON DELETE SET NULL,
  member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
  edit_key    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_member ON participants(member_id);
CREATE INDEX IF NOT EXISTS idx_events_group ON events(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_token ON participants(token_id) WHERE token_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS votes (
  participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  slot_id         TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,        -- 'yes' | 'maybe' | 'no'
  PRIMARY KEY (participant_id, slot_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_slot ON votes(slot_id);
