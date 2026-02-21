ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS slo_target_percent DECIMAL(6,3) NOT NULL DEFAULT 99.900 AFTER interval_ms;

UPDATE monitors
SET slo_target_percent = 99.900
WHERE slo_target_percent IS NULL
   OR slo_target_percent < 90.000
   OR slo_target_percent > 99.999;
