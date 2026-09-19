ALTER TABLE community_probe_agents
  ADD COLUMN IF NOT EXISTS summary_email_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER token_prefix,
  ADD COLUMN IF NOT EXISTS summary_email_frequency ENUM('weekly','monthly') NOT NULL DEFAULT 'weekly' AFTER summary_email_enabled,
  ADD COLUMN IF NOT EXISTS last_summary_sent_at DATETIME(3) NULL AFTER summary_email_frequency;
