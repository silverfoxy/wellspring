-- Allow embedding an external image URL (e.g. GIPHY) instead of an R2 upload.
ALTER TABLE messages ADD COLUMN image_url TEXT;
