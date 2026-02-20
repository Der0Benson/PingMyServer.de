function createAccountRepository(dependencies = {}) {
  const { pool } = dependencies;

  async function getUserNotificationSettingsById(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          email,
          notify_email_enabled,
          notify_email_address,
          notify_email_cooldown_minutes,
          notify_discord_enabled,
          notify_discord_webhook_url,
          notify_slack_enabled,
          notify_slack_webhook_url,
          notify_webhook_enabled,
          notify_webhook_url,
          notify_webhook_secret
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function getUserBillingSettingsById(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          email,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_price_id,
          stripe_subscription_status,
          stripe_current_period_end,
          created_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function findUserByStripeCustomerId(customerId) {
    const normalized = String(customerId || "").trim();
    if (!normalized) return null;
    const [rows] = await pool.query(
      `
        SELECT
          id,
          email,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_price_id,
          stripe_subscription_status,
          stripe_current_period_end,
          created_at
        FROM users
        WHERE stripe_customer_id = ?
        LIMIT 1
      `,
      [normalized]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function updateUserStripeCustomerId(userId, customerId) {
    const normalizedCustomerId = String(customerId || "").trim();
    if (!normalizedCustomerId) return 0;
    try {
      const [result] = await pool.query("UPDATE users SET stripe_customer_id = ? WHERE id = ? LIMIT 1", [
        normalizedCustomerId,
        userId,
      ]);
      return Number(result?.affectedRows || 0);
    } catch (error) {
      if (String(error?.code || "") === "ER_DUP_ENTRY") {
        return 0;
      }
      throw error;
    }
  }

  async function updateUserStripeSubscriptionByUserId(userId, payload = {}) {
    const normalizedCustomerId = String(payload.customerId || "").trim() || null;
    const normalizedSubscriptionId = String(payload.subscriptionId || "").trim() || null;
    const normalizedPriceId = String(payload.priceId || "").trim() || null;
    const normalizedStatus = String(payload.status || "").trim().toLowerCase() || null;
    const periodEndDate = payload.periodEnd instanceof Date ? payload.periodEnd : null;

    try {
      const [result] = await pool.query(
        `
          UPDATE users
          SET
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            stripe_subscription_id = ?,
            stripe_price_id = ?,
            stripe_subscription_status = ?,
            stripe_current_period_end = ?
          WHERE id = ?
          LIMIT 1
        `,
        [normalizedCustomerId, normalizedSubscriptionId, normalizedPriceId, normalizedStatus, periodEndDate, userId]
      );
      return Number(result?.affectedRows || 0);
    } catch (error) {
      if (String(error?.code || "") === "ER_DUP_ENTRY") {
        return 0;
      }
      throw error;
    }
  }

  async function updateUserStripeSubscriptionByCustomerId(customerId, payload = {}) {
    const normalizedCustomerId = String(customerId || "").trim();
    if (!normalizedCustomerId) return 0;
    const normalizedSubscriptionId = String(payload.subscriptionId || "").trim() || null;
    const normalizedPriceId = String(payload.priceId || "").trim() || null;
    const normalizedStatus = String(payload.status || "").trim().toLowerCase() || null;
    const periodEndDate = payload.periodEnd instanceof Date ? payload.periodEnd : null;

    try {
      const [result] = await pool.query(
        `
          UPDATE users
          SET
            stripe_subscription_id = ?,
            stripe_price_id = ?,
            stripe_subscription_status = ?,
            stripe_current_period_end = ?
          WHERE stripe_customer_id = ?
          LIMIT 1
        `,
        [normalizedSubscriptionId, normalizedPriceId, normalizedStatus, periodEndDate, normalizedCustomerId]
      );
      return Number(result?.affectedRows || 0);
    } catch (error) {
      if (String(error?.code || "") === "ER_DUP_ENTRY") {
        return 0;
      }
      throw error;
    }
  }

  return {
    getUserNotificationSettingsById,
    getUserBillingSettingsById,
    findUserByStripeCustomerId,
    updateUserStripeCustomerId,
    updateUserStripeSubscriptionByUserId,
    updateUserStripeSubscriptionByCustomerId,
  };
}

module.exports = {
  createAccountRepository,
};
