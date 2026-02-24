CREATE TABLE IF NOT EXISTS monitor_incident_hides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  monitor_id BIGINT NOT NULL,
  incident_key VARCHAR(160) NOT NULL,
  incident_kind ENUM('raw','aggregated') NOT NULL DEFAULT 'raw',
  incident_start_ts BIGINT NOT NULL,
  incident_day_key CHAR(10) NULL,
  reason VARCHAR(500) NOT NULL,
  hidden_by_user_id BIGINT NOT NULL,
  hidden_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  incident_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_monitor_incident_hides_key (incident_key),
  INDEX idx_monitor_incident_hides_user_hidden_at (user_id, hidden_at),
  INDEX idx_monitor_incident_hides_monitor_hidden_at (monitor_id, hidden_at),
  INDEX idx_monitor_incident_hides_start_ts (incident_start_ts)
);
