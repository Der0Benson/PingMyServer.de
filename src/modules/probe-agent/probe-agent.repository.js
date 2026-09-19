function createProbeAgentRepository(dependencies = {}) {
  const { pool } = dependencies;

  async function findActiveByProbeId(probeId) {
    const [rows] = await pool.query(
      `
        SELECT id, user_id, probe_id, name, token_hash, last_heartbeat_at, created_at
        FROM community_probe_agents
        WHERE probe_id = ? AND revoked_at IS NULL
        LIMIT 1
      `,
      [probeId]
    );
    return rows[0] || null;
  }

  async function listByUserId(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          a.probe_id,
          a.name,
          a.token_prefix,
          a.summary_email_enabled,
          a.summary_email_frequency,
          a.last_heartbeat_at,
          a.revoked_at,
          a.created_at,
          COUNT(CASE WHEN r.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) THEN 1 END) AS checks_24h,
          COUNT(CASE WHEN r.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) THEN 1 END) AS checks_7d,
          COUNT(CASE WHEN r.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN 1 END) AS checks_30d,
          COUNT(DISTINCT CASE WHEN r.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN DATE(r.received_at) END) AS active_days_30d
        FROM community_probe_agents a
        LEFT JOIN probe_agent_job_receipts r ON r.probe_id = a.probe_id
        WHERE a.user_id = ?
        GROUP BY
          a.probe_id,
          a.name,
          a.token_prefix,
          a.summary_email_enabled,
          a.summary_email_frequency,
          a.last_heartbeat_at,
          a.revoked_at,
          a.created_at
        ORDER BY a.created_at DESC
      `,
      [userId]
    );
    return rows;
  }

  async function createForUser(userId, agent, maxActiveAgents) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [userRows] = await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!userRows.length) {
        const error = new Error("user not found");
        error.code = "USER_NOT_FOUND";
        throw error;
      }

      const [countRows] = await connection.query(
        "SELECT COUNT(*) AS total FROM community_probe_agents WHERE user_id = ? AND revoked_at IS NULL",
        [userId]
      );
      if (Number(countRows[0]?.total || 0) >= maxActiveAgents) {
        const error = new Error("active agent limit reached");
        error.code = "AGENT_LIMIT";
        throw error;
      }

      await connection.query(
        `
          INSERT INTO community_probe_agents (user_id, probe_id, name, token_hash, token_prefix)
          VALUES (?, ?, ?, ?, ?)
        `,
        [userId, agent.probeId, agent.name, agent.tokenHash, agent.tokenPrefix]
      );
      await connection.commit();
      return agent;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        // Preserve the original error.
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function revokeForUser(userId, probeId) {
    const [result] = await pool.query(
      `
        UPDATE community_probe_agents
        SET revoked_at = UTC_TIMESTAMP(3)
        WHERE user_id = ? AND probe_id = ? AND revoked_at IS NULL
        LIMIT 1
      `,
      [userId, probeId]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  async function recordHeartbeat(probeId) {
    const [result] = await pool.query(
      `
        UPDATE community_probe_agents
        SET last_heartbeat_at = UTC_TIMESTAMP(3)
        WHERE probe_id = ? AND revoked_at IS NULL
        LIMIT 1
      `,
      [probeId]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  async function updateSummaryEmailForUser(userId, probeId, settings) {
    const [result] = await pool.query(
      `
        UPDATE community_probe_agents
        SET summary_email_enabled = ?, summary_email_frequency = ?
        WHERE user_id = ? AND probe_id = ? AND revoked_at IS NULL
        LIMIT 1
      `,
      [settings.enabled ? 1 : 0, settings.frequency, userId, probeId]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  async function getEntitlementSummaryForUser(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          EXISTS(
            SELECT 1
            FROM community_probe_agents
            WHERE user_id = ?
              AND revoked_at IS NULL
              AND last_heartbeat_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 60 SECOND)
          ) AS has_live_agent,
          COALESCE((
            SELECT COUNT(*)
            FROM probe_agent_job_receipts r
            INNER JOIN community_probe_agents a ON a.probe_id = r.probe_id
            WHERE a.user_id = ?
              AND a.revoked_at IS NULL
              AND r.received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
          ), 0) AS checks_30d
      `,
      [userId, userId]
    );
    return {
      hasLiveAgent: Number(rows[0]?.has_live_agent || 0) === 1,
      checks30d: Number(rows[0]?.checks_30d || 0),
    };
  }

  return {
    findActiveByProbeId,
    listByUserId,
    createForUser,
    revokeForUser,
    recordHeartbeat,
    updateSummaryEmailForUser,
    getEntitlementSummaryForUser,
  };
}

module.exports = {
  createProbeAgentRepository,
};
