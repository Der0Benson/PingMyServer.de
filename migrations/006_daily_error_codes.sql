CREATE TABLE IF NOT EXISTS monitor_daily_error_codes (
  monitor_id BIGINT NOT NULL,
  day_date DATE NOT NULL,
  error_code VARCHAR(32) NOT NULL,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (monitor_id, day_date, error_code),
  INDEX idx_daily_error_day (day_date)
);
