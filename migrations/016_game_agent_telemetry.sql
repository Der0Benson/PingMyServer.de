CREATE TABLE IF NOT EXISTS game_agent_session_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  game VARCHAR(24) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  event_type VARCHAR(24) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  message VARCHAR(512) NOT NULL,
  event_code VARCHAR(64) NULL,
  happened_at DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_game_agent_event_hash (session_id, event_hash),
  INDEX idx_game_agent_events_user_game_time (user_id, game, happened_at),
  INDEX idx_game_agent_events_session_time (session_id, happened_at),
  CONSTRAINT fk_game_agent_events_session
    FOREIGN KEY (session_id) REFERENCES game_agent_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_agent_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_agent_session_plugins (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  game VARCHAR(24) NOT NULL,
  plugin_name VARCHAR(80) NOT NULL,
  plugin_version VARCHAR(64) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  detected_at DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_game_agent_plugin_session_name (session_id, plugin_name),
  INDEX idx_game_agent_plugins_user_game (user_id, game, detected_at),
  CONSTRAINT fk_game_agent_plugins_session
    FOREIGN KEY (session_id) REFERENCES game_agent_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_agent_plugins_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_agent_session_region_latency (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  game VARCHAR(24) NOT NULL,
  region_key VARCHAR(32) NOT NULL,
  ping_ms INT UNSIGNED NOT NULL,
  sampled_at DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_game_agent_region_session_key (session_id, region_key),
  INDEX idx_game_agent_region_user_game (user_id, game, sampled_at),
  CONSTRAINT fk_game_agent_region_session
    FOREIGN KEY (session_id) REFERENCES game_agent_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_agent_region_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);
