function createMonitorsRepository(dependencies = {}) {
  const {
    pool,
    parseProbeIdParam,
    probeLabelMap,
    toMs,
    isValidMonitorPublicId,
    getMonitorUrl,
    defaultPublicStatusMonitorId,
    publicStatusAllowNumericId,
  } = dependencies;

  function serializeMonitorRow(row) {
    const publicId = isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null;
    if (!publicId) return null;
    return {
      id: publicId,
      name: row.name,
      url: getMonitorUrl(row),
      is_paused: !!row.is_paused,
      last_status: row.last_status || "online",
      last_checked_at: toMs(row.last_checked_at) || toMs(row.last_check_at),
      created_at: toMs(row.created_at),
    };
  }

  async function listMonitorsForUser(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          name,
          url,
          target_url,
          is_paused,
          last_status,
          last_checked_at,
          last_check_at,
          created_at
        FROM monitors
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [userId]
    );
    return rows.map(serializeMonitorRow).filter(Boolean);
  }

  async function countMonitorsForUser(userId) {
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM monitors WHERE user_id = ?", [userId]);
    return Number(rows?.[0]?.total || 0);
  }

  async function createMonitorForUser(payload = {}) {
    const publicId = String(payload.publicId || "").trim();
    const userId = Number(payload.userId || 0);
    const name = String(payload.name || "").trim();
    const url = String(payload.url || "").trim();
    const targetUrl = String(payload.targetUrl || "").trim();
    const intervalMs = Number(payload.intervalMs || 0);

    await pool.query(
      `
        INSERT INTO monitors (
          public_id,
          user_id,
          name,
          url,
          target_url,
          interval_ms,
          is_paused,
          last_status,
          status_since
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 'online', UTC_TIMESTAMP(3))
      `,
      [publicId, userId, name, url, targetUrl, intervalMs]
    );
  }

  async function listMonitorsForUserAtProbe(userId, probeId) {
    const probe = parseProbeIdParam(probeId);
    if (!probe) return listMonitorsForUser(userId);

    const [rows] = await pool.query(
      `
        SELECT
          m.id,
          m.public_id,
          m.name,
          m.url,
          m.target_url,
          m.is_paused,
          COALESCE(ps.last_status, 'online') AS last_status,
          ps.last_checked_at AS last_checked_at,
          NULL AS last_check_at,
          m.created_at
        FROM monitors m
        LEFT JOIN monitor_probe_state ps
          ON ps.monitor_id = m.id
          AND ps.probe_id = ?
        WHERE m.user_id = ?
        ORDER BY m.created_at DESC, m.id DESC
      `,
      [probe, userId]
    );

    return rows.map(serializeMonitorRow).filter(Boolean);
  }

  async function listProbesForUser(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          ps.probe_id,
          MAX(ps.last_checked_at) AS last_seen_at,
          COUNT(DISTINCT ps.monitor_id) AS monitors
        FROM monitor_probe_state ps
        JOIN monitors m ON m.id = ps.monitor_id
        WHERE m.user_id = ?
        GROUP BY ps.probe_id
        ORDER BY ps.probe_id ASC
      `,
      [userId]
    );

    return rows
      .map((row) => ({
        id: String(row.probe_id || "").trim(),
        label: probeLabelMap.get(String(row.probe_id || "").trim()) || null,
        lastSeenAt: toMs(row.last_seen_at),
        monitors: Math.max(0, Number(row.monitors || 0)),
      }))
      .filter((row) => !!parseProbeIdParam(row.id));
  }

  async function getLatestMonitorForUser(userId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          name,
          url,
          target_url,
          interval_ms,
          slo_target_percent,
          http_assertions_enabled,
          http_expected_status_codes,
          http_content_type_contains,
          http_body_contains,
          http_follow_redirects,
          http_max_redirects,
          http_timeout_ms,
          is_paused,
          last_status,
          status_since,
          last_checked_at,
          last_check_at,
          last_response_ms,
          created_at
        FROM monitors
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function getMonitorByIdForUser(userId, monitorId) {
    const monitorIdentifier = String(monitorId || "").trim();
    if (!monitorIdentifier) return null;
    const publicId = isValidMonitorPublicId(monitorIdentifier) ? monitorIdentifier : null;
    const numericId = /^\d+$/.test(monitorIdentifier) ? Number(monitorIdentifier) : -1;

    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          name,
          url,
          target_url,
          interval_ms,
          slo_target_percent,
          http_assertions_enabled,
          http_expected_status_codes,
          http_content_type_contains,
          http_body_contains,
          http_follow_redirects,
          http_max_redirects,
          http_timeout_ms,
          is_paused,
          last_status,
          status_since,
          last_checked_at,
          last_check_at,
          last_response_ms,
          created_at
        FROM monitors
        WHERE user_id = ?
          AND (public_id = ? OR id = ?)
        LIMIT 1
      `,
      [userId, publicId, numericId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function getPublicMonitorByIdentifier(monitorId) {
    const monitorIdentifier = String(monitorId || "").trim();
    if (!monitorIdentifier) return null;
    const publicId = isValidMonitorPublicId(monitorIdentifier) ? monitorIdentifier : null;
    const allowNumericId = !!publicStatusAllowNumericId;
    const numericId = allowNumericId && /^\d+$/.test(monitorIdentifier) ? Number(monitorIdentifier) : -1;
    const whereClause = allowNumericId ? "(public_id = ? OR id = ?)" : "public_id = ?";
    const queryParams = allowNumericId ? [publicId, numericId] : [publicId];

    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          name,
          url,
          target_url,
          interval_ms,
          slo_target_percent,
          http_assertions_enabled,
          http_expected_status_codes,
          http_content_type_contains,
          http_body_contains,
          http_follow_redirects,
          http_max_redirects,
          http_timeout_ms,
          is_paused,
          last_status,
          status_since,
          last_checked_at,
          last_check_at,
          last_response_ms,
          created_at
        FROM monitors
        WHERE user_id IS NOT NULL
          AND ${whereClause}
        LIMIT 1
      `,
      queryParams
    );

    if (!rows.length) return null;
    return rows[0];
  }

  async function getDefaultPublicMonitor() {
    if (!defaultPublicStatusMonitorId) return null;
    return getPublicMonitorByIdentifier(defaultPublicStatusMonitorId);
  }

  async function getLatestPublicMonitor() {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          name,
          url,
          target_url,
          interval_ms,
          slo_target_percent,
          http_assertions_enabled,
          http_expected_status_codes,
          http_content_type_contains,
          http_body_contains,
          http_follow_redirects,
          http_max_redirects,
          http_timeout_ms,
          is_paused,
          last_status,
          status_since,
          last_checked_at,
          last_check_at,
          last_response_ms,
          created_at
        FROM monitors
        WHERE user_id IS NOT NULL
        ORDER BY COALESCE(last_check_at, last_checked_at, created_at) DESC, id DESC
        LIMIT 1
      `
    );

    if (!rows.length) return null;
    return rows[0];
  }

  return {
    serializeMonitorRow,
    countMonitorsForUser,
    createMonitorForUser,
    listMonitorsForUser,
    listMonitorsForUserAtProbe,
    listProbesForUser,
    getLatestMonitorForUser,
    getMonitorByIdForUser,
    getDefaultPublicMonitor,
    getLatestPublicMonitor,
    getPublicMonitorByIdentifier,
  };
}

module.exports = {
  createMonitorsRepository,
};
