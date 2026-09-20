ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS config_version BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER http_timeout_ms,
  ADD COLUMN IF NOT EXISTS retention_class ENUM('free','community','pro') NOT NULL DEFAULT 'free' AFTER config_version,
  ADD INDEX idx_monitors_due (is_paused, last_checked_at, id);

ALTER TABLE monitor_checks
  ADD COLUMN IF NOT EXISTS result_id CHAR(36) NULL AFTER error_message,
  ADD COLUMN IF NOT EXISTS config_version BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER result_id,
  ADD UNIQUE INDEX uniq_monitor_checks_result (result_id);
