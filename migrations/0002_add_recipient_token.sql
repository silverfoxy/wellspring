-- Add a separate token used for the recipient (read-only) share link.
-- Existing boards get the column populated with a value derived from their id
-- so the column stays NOT NULL UNIQUE; creators can regenerate via the dashboard later.
ALTER TABLE boards ADD COLUMN recipient_token TEXT;
UPDATE boards SET recipient_token = 'r-' || id WHERE recipient_token IS NULL;
CREATE UNIQUE INDEX idx_boards_recipient_token ON boards(recipient_token);
