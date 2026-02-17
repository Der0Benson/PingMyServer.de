ALTER TABLE users
  ADD COLUMN IF NOT EXISTS discord_id VARCHAR(64) NULL AFTER google_email,
  ADD COLUMN IF NOT EXISTS discord_username VARCHAR(255) NULL AFTER discord_id,
  ADD COLUMN IF NOT EXISTS discord_email VARCHAR(255) NULL AFTER discord_username;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_discord_id ON users(discord_id);
