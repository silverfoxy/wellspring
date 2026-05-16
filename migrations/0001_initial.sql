-- Boards: one per "leaving colleague" card
CREATE TABLE boards (
  id            TEXT PRIMARY KEY,           -- nanoid
  title         TEXT NOT NULL,
  recipient     TEXT NOT NULL,              -- the leaver's name
  theme         TEXT NOT NULL DEFAULT 'default',
  view_token    TEXT NOT NULL UNIQUE,       -- shared with contributors
  edit_token    TEXT NOT NULL UNIQUE,       -- creator only
  locked        INTEGER NOT NULL DEFAULT 0, -- 0/1
  created_at    INTEGER NOT NULL,           -- unix seconds
  created_by    TEXT                        -- optional display name
);

CREATE INDEX idx_boards_view_token ON boards(view_token);
CREATE INDEX idx_boards_edit_token ON boards(edit_token);

-- Messages posted to a board
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,             -- nanoid
  board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#fff8c5',
  image_key   TEXT,                         -- R2 object key, nullable
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_messages_board ON messages(board_id, created_at DESC);
