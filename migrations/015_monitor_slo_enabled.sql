ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS slo_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER slo_target_percent;

UPDATE monitors
SET slo_enabled = 0
WHERE slo_enabled IS NULL
   OR slo_enabled NOT IN (0, 1);
