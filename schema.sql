CREATE TABLE IF NOT EXISTS monitors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url VARCHAR(2048) NOT NULL,
  last_status ENUM('online','offline') NOT NULL DEFAULT 'online',
  status_since DATETIME(3) NULL,
  last_check_at DATETIME(3) NULL,
  last_response_ms INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  monitor_id INT NOT NULL,
  checked_at DATETIME(3) NOT NULL,
  ok TINYINT(1) NOT NULL,
  response_ms INT NOT NULL,
  status_code INT NULL,
  INDEX idx_checks_monitor_time (monitor_id, checked_at),
  INDEX idx_checks_time (checked_at),
  CONSTRAINT fk_checks_monitor
    FOREIGN KEY (monitor_id) REFERENCES monitors(id)
    ON DELETE CASCADE
);
