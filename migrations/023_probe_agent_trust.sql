ALTER TABLE community_probe_agents
  ADD COLUMN IF NOT EXISTS trust_score TINYINT UNSIGNED NOT NULL DEFAULT 25 AFTER token_prefix,
  ADD COLUMN IF NOT EXISTS trust_state ENUM('probation','trusted','quarantined') NOT NULL DEFAULT 'probation' AFTER trust_score,
  ADD COLUMN IF NOT EXISTS accepted_results BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER trust_state,
  ADD COLUMN IF NOT EXISTS audited_results BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER accepted_results,
  ADD COLUMN IF NOT EXISTS matching_audits BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER audited_results,
  ADD COLUMN IF NOT EXISTS mismatching_audits BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER matching_audits,
  ADD COLUMN IF NOT EXISTS suspicious_results BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER mismatching_audits,
  ADD COLUMN IF NOT EXISTS last_trust_audit_at DATETIME(3) NULL AFTER suspicious_results,
  ADD COLUMN IF NOT EXISTS quarantined_until DATETIME(3) NULL AFTER last_trust_audit_at,
  ADD COLUMN IF NOT EXISTS quarantine_reason VARCHAR(128) NULL AFTER quarantined_until,
  ADD INDEX idx_community_probe_agents_trust (trust_state, trust_score, revoked_at);

CREATE TABLE IF NOT EXISTS probe_agent_trust_audits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  probe_id VARCHAR(64) NOT NULL,
  monitor_id BIGINT NOT NULL,
  verdict ENUM('match','mismatch','unverified','suspicious') NOT NULL,
  reason VARCHAR(128) NOT NULL,
  reported_status ENUM('online','offline') NULL,
  reference_status ENUM('online','offline') NULL,
  score_delta SMALLINT NOT NULL DEFAULT 0,
  score_after TINYINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_probe_agent_trust_audit_job (job_id),
  INDEX idx_probe_agent_trust_audit_probe_time (probe_id, created_at),
  INDEX idx_probe_agent_trust_audit_monitor_time (monitor_id, created_at)
);
