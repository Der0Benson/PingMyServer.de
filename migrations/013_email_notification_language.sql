ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_email_language VARCHAR(8) NOT NULL DEFAULT 'de' AFTER notify_email_cooldown_minutes;

UPDATE users
SET notify_email_language = 'de'
WHERE notify_email_language IS NULL
   OR LOWER(TRIM(notify_email_language)) NOT IN ('de', 'en');
