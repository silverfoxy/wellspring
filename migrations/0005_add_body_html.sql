-- Rich-text body stored as sanitized HTML. `body` keeps the plaintext fallback.
ALTER TABLE messages ADD COLUMN body_html TEXT;
