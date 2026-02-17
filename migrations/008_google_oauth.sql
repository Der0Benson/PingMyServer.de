ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128) NULL AFTER github_login,
  ADD COLUMN IF NOT EXISTS google_email VARCHAR(255) NULL AFTER google_sub;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_google_sub ON users(google_sub);
