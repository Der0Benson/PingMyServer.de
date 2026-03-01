ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS status_page_public TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_email_enabled;

UPDATE monitors
SET status_page_public = 0
WHERE status_page_public IS NULL
   OR status_page_public NOT IN (0, 1);
