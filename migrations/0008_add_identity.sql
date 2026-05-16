-- Tie boards and messages to authenticated Cloudflare Access identities.
-- Both columns are nullable to keep backward compatibility with legacy
-- token-only records.
ALTER TABLE boards   ADD COLUMN created_by_email TEXT;
ALTER TABLE messages ADD COLUMN author_email     TEXT;

CREATE INDEX idx_boards_created_by   ON boards   (created_by_email);
CREATE INDEX idx_messages_author_eml ON messages (author_email);
