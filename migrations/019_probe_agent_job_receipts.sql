CREATE TABLE IF NOT EXISTS probe_agent_job_assignments (
  job_id CHAR(36) PRIMARY KEY,
  probe_id VARCHAR(64) NOT NULL,
  monitor_id BIGINT NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_probe_job_assignment (probe_id, monitor_id),
  UNIQUE KEY uniq_probe_job_slot (probe_id, slot),
  INDEX idx_probe_job_assignments_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS probe_agent_job_receipts (
  job_id CHAR(36) PRIMARY KEY,
  probe_id VARCHAR(64) NOT NULL,
  monitor_id BIGINT NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_probe_job_receipts_received (received_at),
  INDEX idx_probe_job_receipts_probe_time (probe_id, received_at)
);
