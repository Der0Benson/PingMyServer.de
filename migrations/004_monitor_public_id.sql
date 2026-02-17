ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS public_id CHAR(12) NULL AFTER id;

UPDATE monitors
SET public_id = UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))
WHERE public_id IS NULL
   OR CHAR_LENGTH(public_id) <> 12
   OR public_id REGEXP '[^A-Za-z0-9]';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_monitors_public_id ON monitors(public_id);

ALTER TABLE monitors
  MODIFY COLUMN public_id CHAR(12) NOT NULL;
