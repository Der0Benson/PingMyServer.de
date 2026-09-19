CREATE TABLE IF NOT EXISTS community_probe_agents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  probe_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  token_prefix VARCHAR(20) NOT NULL,
  last_heartbeat_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_community_probe_agents_probe_id (probe_id),
  INDEX idx_community_probe_agents_user (user_id, revoked_at, created_at),
  INDEX idx_community_probe_agents_heartbeat (last_heartbeat_at),
  CONSTRAINT fk_community_probe_agents_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);
