CREATE TABLE IF NOT EXISTS auth_email_challenges (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  purpose ENUM('login') NOT NULL DEFAULT 'login',
  code_hash CHAR(64) NOT NULL,
  code_last4 CHAR(4) NOT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 6,
  send_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  last_sent_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_auth_email_challenges_user_purpose (user_id, purpose, created_at),
  INDEX idx_auth_email_challenges_expires (expires_at),
  INDEX idx_auth_email_challenges_consumed (consumed_at),
  CONSTRAINT fk_auth_email_challenges_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);
