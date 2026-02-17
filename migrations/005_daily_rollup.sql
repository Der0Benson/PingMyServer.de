CREATE TABLE IF NOT EXISTS monitor_daily_stats (
  monitor_id BIGINT NOT NULL,
  day_date DATE NOT NULL,
  checks_total INT NOT NULL DEFAULT 0,
  checks_ok INT NOT NULL DEFAULT 0,
  checks_error INT NOT NULL DEFAULT 0,
  response_min_ms INT NULL,
  response_max_ms INT NULL,
  response_avg_ms DECIMAL(10,2) NULL,
  uptime_percent DECIMAL(7,4) NULL,
  down_minutes INT NOT NULL DEFAULT 0,
  incidents INT NOT NULL DEFAULT 0,
  start_ok TINYINT(1) NULL,
  end_ok TINYINT(1) NULL,
  first_checked_at DATETIME(3) NULL,
  last_checked_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (monitor_id, day_date),
  INDEX idx_daily_day_date (day_date),
  CONSTRAINT fk_daily_monitor
    FOREIGN KEY (monitor_id) REFERENCES monitors(id)
    ON DELETE CASCADE
);
