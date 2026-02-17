ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) NULL AFTER notify_discord_enabled,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id,
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255) NULL AFTER stripe_subscription_id,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status VARCHAR(64) NULL AFTER stripe_price_id,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end DATETIME NULL AFTER stripe_subscription_status;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_stripe_customer_id ON users(stripe_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_stripe_subscription_id ON users(stripe_subscription_id);
