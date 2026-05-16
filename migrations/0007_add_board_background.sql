-- Per-board decorative background pattern (separate from the gradient `theme`).
-- NULL means "no pattern".
ALTER TABLE boards ADD COLUMN background TEXT;
