ALTER TABLE users
  ADD COLUMN IF NOT EXISTS github_id VARCHAR(64) NULL AFTER password_hash,
  ADD COLUMN IF NOT EXISTS github_login VARCHAR(255) NULL AFTER github_id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_github_id ON users(github_id);
