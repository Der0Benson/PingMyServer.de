DELIMITER //

CREATE PROCEDURE migrate_003_multitenant_monitors()
BEGIN
  CREATE TABLE IF NOT EXISTS monitors (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    target_url VARCHAR(2048) NULL,
    interval_ms INT NOT NULL DEFAULT 60000,
    is_paused TINYINT(1) NOT NULL DEFAULT 0,
    last_status ENUM('online','offline') NOT NULL DEFAULT 'online',
    status_since DATETIME(3) NULL,
    last_checked_at DATETIME(3) NULL,
    last_check_at DATETIME(3) NULL,
    last_response_ms INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS monitor_checks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    monitor_id BIGINT NOT NULL,
    checked_at DATETIME(3) NOT NULL,
    ok TINYINT(1) NOT NULL,
    response_ms INT NOT NULL,
    status_code INT NULL,
    error_message VARCHAR(255) NULL,
    INDEX idx_checks_monitor_time (monitor_id, checked_at),
    INDEX idx_checks_time (checked_at)
  );

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE monitors ADD COLUMN user_id BIGINT NULL AFTER id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'url'
  ) THEN
    ALTER TABLE monitors ADD COLUMN url VARCHAR(2048) NULL AFTER name;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'target_url'
  ) THEN
    ALTER TABLE monitors ADD COLUMN target_url VARCHAR(2048) NULL AFTER url;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'interval_ms'
  ) THEN
    ALTER TABLE monitors ADD COLUMN interval_ms INT NOT NULL DEFAULT 60000 AFTER target_url;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'is_paused'
  ) THEN
    ALTER TABLE monitors ADD COLUMN is_paused TINYINT(1) NOT NULL DEFAULT 0 AFTER interval_ms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND column_name = 'last_checked_at'
  ) THEN
    ALTER TABLE monitors ADD COLUMN last_checked_at DATETIME(3) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'monitor_checks' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE monitor_checks ADD COLUMN error_message VARCHAR(255) NULL AFTER status_code;
  END IF;

  UPDATE monitors
  SET url = target_url
  WHERE (url IS NULL OR url = '')
    AND target_url IS NOT NULL;

  UPDATE monitors
  SET target_url = url
  WHERE (target_url IS NULL OR target_url = '')
    AND url IS NOT NULL;

  UPDATE monitors
  SET interval_ms = 60000
  WHERE interval_ms IS NULL OR interval_ms <= 0;

  UPDATE monitors
  SET is_paused = 0
  WHERE is_paused IS NULL;

  SET @default_user_id := (SELECT id FROM users ORDER BY id ASC LIMIT 1);
  IF @default_user_id IS NOT NULL THEN
    UPDATE monitors
    SET user_id = @default_user_id
    WHERE user_id IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'monitors' AND index_name = 'idx_monitors_user_id'
  ) THEN
    ALTER TABLE monitors ADD INDEX idx_monitors_user_id (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'monitors'
      AND constraint_name = 'fk_monitors_user'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    IF (SELECT COUNT(*) FROM monitors WHERE user_id IS NULL) = 0 THEN
      ALTER TABLE monitors MODIFY COLUMN user_id BIGINT NOT NULL;
      ALTER TABLE monitors
        ADD CONSTRAINT fk_monitors_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END//

CALL migrate_003_multitenant_monitors()//
DROP PROCEDURE migrate_003_multitenant_monitors//

DELIMITER ;
