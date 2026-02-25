CREATE TABLE IF NOT EXISTS team_memberships (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT NOT NULL,
  member_user_id BIGINT NOT NULL,
  role ENUM('owner','member') NOT NULL DEFAULT 'member',
  invited_by_user_id BIGINT NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_team_membership_owner_member (owner_user_id, member_user_id),
  INDEX idx_team_memberships_member_user (member_user_id, joined_at),
  INDEX idx_team_memberships_owner_role (owner_user_id, role, joined_at),
  CONSTRAINT fk_team_memberships_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_team_memberships_member_user
    FOREIGN KEY (member_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_team_memberships_invited_by_user
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS team_invitations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT NOT NULL,
  invited_by_user_id BIGINT NOT NULL,
  invite_email VARCHAR(255) NOT NULL,
  invite_token_hash CHAR(64) NOT NULL UNIQUE,
  verification_code_hash CHAR(64) NOT NULL,
  verification_code_last4 CHAR(4) NOT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 6,
  send_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  last_sent_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  accepted_at DATETIME(3) NULL,
  accepted_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_invitations_owner_status (owner_user_id, status, created_at),
  INDEX idx_team_invitations_email_status (invite_email, status, expires_at),
  INDEX idx_team_invitations_expires (expires_at),
  CONSTRAINT fk_team_invitations_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_team_invitations_invited_by_user
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_team_invitations_accepted_by_user
    FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
);
