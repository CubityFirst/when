-- One-off events lock a single date and close; repeatable events stay open and
-- confirm any number of sessions. vote_round lets the organiser ask everyone to
-- re-check their answers: a participant whose round is behind the event's is
-- shown as not having re-confirmed yet.
ALTER TABLE events ADD COLUMN mode TEXT NOT NULL DEFAULT 'oneoff';
ALTER TABLE events ADD COLUMN vote_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE slots ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN vote_round INTEGER NOT NULL DEFAULT 0;
