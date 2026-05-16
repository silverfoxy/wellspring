-- Optional manual ordering set by the board creator on the edit dashboard.
-- NULL means "use default chronological order".
ALTER TABLE messages ADD COLUMN position REAL;
CREATE INDEX idx_messages_board_position ON messages(board_id, position);
