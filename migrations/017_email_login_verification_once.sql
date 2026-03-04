ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_login_verified_at DATETIME NULL AFTER password_hash;
