ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_email_address VARCHAR(255) NULL AFTER discord_email,
  ADD COLUMN IF NOT EXISTS notify_email_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_email_address,
  ADD COLUMN IF NOT EXISTS notify_email_cooldown_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15 AFTER notify_email_enabled;

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS notify_email_last_sent_at DATETIME(3) NULL AFTER last_response_ms,
  ADD COLUMN IF NOT EXISTS notify_email_last_sent_status ENUM('online','offline') NULL AFTER notify_email_last_sent_at;

UPDATE users
SET notify_email_enabled = 0
WHERE notify_email_enabled IS NULL OR notify_email_enabled NOT IN (0, 1);

UPDATE users
SET notify_email_cooldown_minutes = 15
WHERE notify_email_cooldown_minutes IS NULL
   OR notify_email_cooldown_minutes < 1
   OR notify_email_cooldown_minutes > 1440;
