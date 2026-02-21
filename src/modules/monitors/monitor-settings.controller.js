function createMonitorSettingsController(dependencies = {}) {
  const {
    requireAuth,
    getMonitorByIdForUser,
    sendJson,
    serializeMonitorHttpAssertionsConfig,
    readJsonBody,
    getMonitorHttpAssertionsConfig,
    clampMonitorHttpAssertionNumber,
    normalizeMonitorHttpAssertionStatusCodes,
    normalizeMonitorHttpAssertionString,
    pool,
    normalizeMonitorIntervalMs,
    defaultMonitorIntervalMs,
    normalizeMonitorSloTargetPercent,
    dayMs,
    toTimestampMs,
    getMonitorUrl,
    normalizeDomainForVerification,
    logger,
  } = dependencies;

  const dayDurationMs = Number.isFinite(Number(dayMs)) ? Math.max(1000, Math.round(Number(dayMs))) : 24 * 60 * 60 * 1000;

  const maintenanceLookbackDays = Number.isFinite(Number(dependencies.maintenanceLookbackDays))
    ? Math.max(1, Math.round(Number(dependencies.maintenanceLookbackDays)))
    : 60;
  const maintenanceLookaheadDays = Number.isFinite(Number(dependencies.maintenanceLookaheadDays))
    ? Math.max(1, Math.round(Number(dependencies.maintenanceLookaheadDays)))
    : 365;
  const maintenanceMinDurationMs = Number.isFinite(Number(dependencies.maintenanceMinDurationMs))
    ? Math.max(1000, Math.round(Number(dependencies.maintenanceMinDurationMs)))
    : 5 * 60 * 1000;
  const maintenanceMaxDurationMs = Number.isFinite(Number(dependencies.maintenanceMaxDurationMs))
    ? Math.max(maintenanceMinDurationMs, Math.round(Number(dependencies.maintenanceMaxDurationMs)))
    : 30 * dayDurationMs;
  const maintenanceMaxPastStartMs = Number.isFinite(Number(dependencies.maintenanceMaxPastStartMs))
    ? Math.max(60 * 1000, Math.round(Number(dependencies.maintenanceMaxPastStartMs)))
    : 24 * 60 * 60 * 1000;
  const monitorSloTargetDefaultPercent = Number.isFinite(Number(dependencies.monitorSloTargetDefaultPercent))
    ? Number(dependencies.monitorSloTargetDefaultPercent)
    : 99.9;
  const monitorSloTargetMinPercent = Number.isFinite(Number(dependencies.monitorSloTargetMinPercent))
    ? Number(dependencies.monitorSloTargetMinPercent)
    : 90;
  const monitorSloTargetMaxPercent = Number.isFinite(Number(dependencies.monitorSloTargetMaxPercent))
    ? Math.max(monitorSloTargetMinPercent, Number(dependencies.monitorSloTargetMaxPercent))
    : 99.999;

  const logError = (event, error) => {
    if (logger && typeof logger.error === "function") {
      logger.error(event, error);
      return;
    }
    console.error(event, error);
  };

  async function handleMonitorHttpAssertionsGet(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    sendJson(res, 200, { ok: true, data: serializeMonitorHttpAssertionsConfig(monitor) });
  }

  async function handleMonitorHttpAssertionsUpdate(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const current = getMonitorHttpAssertionsConfig(monitor);

    let enabled = current.enabled;
    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
      if (typeof body.enabled !== "boolean") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      enabled = body.enabled;
    }

    let followRedirects = current.followRedirects;
    if (Object.prototype.hasOwnProperty.call(body, "followRedirects")) {
      if (typeof body.followRedirects !== "boolean") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      followRedirects = body.followRedirects;
    }

    let maxRedirects = current.maxRedirects;
    if (Object.prototype.hasOwnProperty.call(body, "maxRedirects")) {
      maxRedirects = clampMonitorHttpAssertionNumber(body.maxRedirects, { min: 0, max: 10, fallback: current.maxRedirects });
    }

    let timeoutMs = current.timeoutMs;
    if (Object.prototype.hasOwnProperty.call(body, "timeoutMs")) {
      timeoutMs = clampMonitorHttpAssertionNumber(body.timeoutMs, { min: 0, max: 120000, fallback: current.timeoutMs });
    }

    let expectedStatusCodes = current.expectedStatusCodesRaw;
    if (Object.prototype.hasOwnProperty.call(body, "expectedStatusCodes")) {
      if (typeof body.expectedStatusCodes !== "string") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      const normalized = normalizeMonitorHttpAssertionStatusCodes(body.expectedStatusCodes);
      if (normalized === null) {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      expectedStatusCodes = normalized;
    }

    let contentTypeContains = current.contentTypeContains;
    if (Object.prototype.hasOwnProperty.call(body, "contentTypeContains")) {
      if (typeof body.contentTypeContains !== "string") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      contentTypeContains = normalizeMonitorHttpAssertionString(body.contentTypeContains, 128);
    }

    let bodyContains = current.bodyContains;
    if (Object.prototype.hasOwnProperty.call(body, "bodyContains")) {
      if (typeof body.bodyContains !== "string") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      bodyContains = normalizeMonitorHttpAssertionString(body.bodyContains, 512);
    }

    await pool.query(
      `
        UPDATE monitors
        SET
          http_assertions_enabled = ?,
          http_expected_status_codes = ?,
          http_content_type_contains = ?,
          http_body_contains = ?,
          http_follow_redirects = ?,
          http_max_redirects = ?,
          http_timeout_ms = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `,
      [
        enabled ? 1 : 0,
        expectedStatusCodes || null,
        contentTypeContains || null,
        bodyContains || null,
        followRedirects ? 1 : 0,
        maxRedirects,
        timeoutMs,
        monitor.id,
        user.id,
      ]
    );

    const updatedMonitor = {
      ...monitor,
      http_assertions_enabled: enabled ? 1 : 0,
      http_expected_status_codes: expectedStatusCodes || null,
      http_content_type_contains: contentTypeContains || null,
      http_body_contains: bodyContains || null,
      http_follow_redirects: followRedirects ? 1 : 0,
      http_max_redirects: maxRedirects,
      http_timeout_ms: timeoutMs,
    };

    sendJson(res, 200, { ok: true, data: serializeMonitorHttpAssertionsConfig(updatedMonitor) });
  }

  async function handleMonitorIntervalUpdate(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const hasIntervalMs = Object.prototype.hasOwnProperty.call(body, "intervalMs");
    const hasIntervalMsLegacy = Object.prototype.hasOwnProperty.call(body, "interval_ms");
    if (!hasIntervalMs && !hasIntervalMsLegacy) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const rawInterval = hasIntervalMs ? body.intervalMs : body.interval_ms;
    const numericInterval = Number(rawInterval);
    if (!Number.isFinite(numericInterval)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const intervalMs = normalizeMonitorIntervalMs(numericInterval, monitor.interval_ms || defaultMonitorIntervalMs);
    await pool.query("UPDATE monitors SET interval_ms = ? WHERE id = ? AND user_id = ? LIMIT 1", [
      intervalMs,
      monitor.id,
      user.id,
    ]);

    sendJson(res, 200, { ok: true, data: { intervalMs } });
  }

  function serializeMonitorSloConfig(monitor) {
    const targetPercent = normalizeMonitorSloTargetPercent
      ? normalizeMonitorSloTargetPercent(monitor?.slo_target_percent, monitorSloTargetDefaultPercent)
      : monitorSloTargetDefaultPercent;
    return {
      targetPercent,
      minTargetPercent: monitorSloTargetMinPercent,
      maxTargetPercent: monitorSloTargetMaxPercent,
      defaultTargetPercent: monitorSloTargetDefaultPercent,
    };
  }

  async function handleMonitorSloGet(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    sendJson(res, 200, { ok: true, data: serializeMonitorSloConfig(monitor) });
  }

  async function handleMonitorSloUpdate(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const hasTargetPercent = Object.prototype.hasOwnProperty.call(body, "targetPercent");
    const hasTargetPercentLegacy = Object.prototype.hasOwnProperty.call(body, "target_percent");
    if (!hasTargetPercent && !hasTargetPercentLegacy) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const rawTargetPercent = hasTargetPercent ? body.targetPercent : body.target_percent;
    const numericTarget = Number(rawTargetPercent);
    if (!Number.isFinite(numericTarget)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const targetPercent = normalizeMonitorSloTargetPercent
      ? normalizeMonitorSloTargetPercent(numericTarget, monitorSloTargetDefaultPercent)
      : monitorSloTargetDefaultPercent;

    await pool.query("UPDATE monitors SET slo_target_percent = ? WHERE id = ? AND user_id = ? LIMIT 1", [
      targetPercent,
      monitor.id,
      user.id,
    ]);

    sendJson(res, 200, {
      ok: true,
      data: {
        targetPercent,
        minTargetPercent: monitorSloTargetMinPercent,
        maxTargetPercent: monitorSloTargetMaxPercent,
        defaultTargetPercent: monitorSloTargetDefaultPercent,
      },
    });
  }

  function normalizeMaintenanceTitle(value) {
    const text = String(value || "").trim();
    if (!text) return "Wartung";
    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
  }

  function normalizeMaintenanceMessage(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
  }

  function parseTimestampInput(value) {
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.round(value) : null;
    }

    const raw = String(value || "").trim();
    if (!raw) return null;

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return Math.round(numeric);

    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function computeMaintenanceStatus(window, nowMs = Date.now()) {
    if (!window) return "unknown";
    const cancelledAt = toTimestampMs(window.cancelled_at ?? window.cancelledAt);
    if (Number.isFinite(cancelledAt) && cancelledAt > 0) return "cancelled";
    const startsAt = toTimestampMs(window.starts_at ?? window.startsAt);
    const endsAt = toTimestampMs(window.ends_at ?? window.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "unknown";
    if (nowMs < startsAt) return "scheduled";
    if (nowMs >= startsAt && nowMs < endsAt) return "active";
    return "completed";
  }

  function serializeMaintenanceRow(row, nowMs = Date.now()) {
    if (!row) return null;
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const startsAt = toTimestampMs(row.starts_at);
    const endsAt = toTimestampMs(row.ends_at);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;

    return {
      id,
      monitorId: Number(row.monitor_id),
      title: String(row.title || "").trim() || "Wartung",
      message: String(row.message || "").trim() || "",
      startsAt,
      endsAt,
      cancelledAt: toTimestampMs(row.cancelled_at),
      createdAt: toTimestampMs(row.created_at),
      updatedAt: toTimestampMs(row.updated_at),
      status: computeMaintenanceStatus(row, nowMs),
    };
  }

  async function listMaintenancesForMonitorId(monitorId, options = {}) {
    const limit = Math.max(1, Math.min(50, Number(options.limit || 20) || 20));
    const numericId = Number(monitorId);
    if (!Number.isFinite(numericId) || numericId <= 0) return [];

    const nowMs = Date.now();
    const lookbackStart = new Date(nowMs - maintenanceLookbackDays * dayDurationMs);
    const lookaheadEnd = new Date(nowMs + maintenanceLookaheadDays * dayDurationMs);

    const [rows] = await pool.query(
      `
        SELECT
          id,
          user_id,
          monitor_id,
          title,
          message,
          starts_at,
          ends_at,
          cancelled_at,
          created_at,
          updated_at
        FROM maintenances
        WHERE monitor_id = ?
          AND starts_at >= ?
          AND starts_at <= ?
        ORDER BY starts_at ASC, id ASC
        LIMIT ?
      `,
      [numericId, lookbackStart, lookaheadEnd, limit]
    );

    return rows.map((row) => serializeMaintenanceRow(row, nowMs)).filter(Boolean);
  }

  function buildMaintenancePayload(items) {
    const list = Array.isArray(items) ? items : [];
    const active = list.find((entry) => entry.status === "active") || null;
    const upcoming = list.filter((entry) => entry.status === "scheduled").slice(0, 3);
    return {
      active,
      upcoming,
      items: list,
    };
  }

  function isHostnameCoveredByDomain(hostname, domain) {
    const host = String(hostname || "").trim().toLowerCase();
    const verified = String(domain || "").trim().toLowerCase();
    if (!host || !verified) return false;
    if (host === verified) return true;
    return host.endsWith(`.${verified}`);
  }

  async function getVerifiedDomainForHostname(userId, hostname) {
    const normalizedHost = String(hostname || "").trim().toLowerCase();
    if (!normalizedHost) return null;

    const [rows] = await pool.query(
      "SELECT domain FROM domain_verifications WHERE user_id = ? AND verified_at IS NOT NULL ORDER BY verified_at DESC",
      [userId]
    );
    for (const row of rows) {
      const domain = String(row?.domain || "").trim().toLowerCase();
      if (!domain) continue;
      if (isHostnameCoveredByDomain(normalizedHost, domain)) {
        return domain;
      }
    }
    return null;
  }

  async function requireVerifiedDomainForMonitor(userId, monitor) {
    const targetUrl = getMonitorUrl(monitor);
    const hostname = normalizeDomainForVerification(targetUrl);
    if (!hostname) {
      const error = new Error("invalid_target");
      error.statusCode = 400;
      throw error;
    }

    const verifiedDomain = await getVerifiedDomainForHostname(userId, hostname);
    if (!verifiedDomain) {
      const error = new Error("domain_not_verified");
      error.statusCode = 403;
      error.details = { hostname };
      throw error;
    }

    return { hostname, verifiedDomain };
  }

  async function handleMonitorMaintenancesList(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    try {
      const items = await listMaintenancesForMonitorId(monitor.id, { limit: 50 });
      sendJson(res, 200, { ok: true, data: buildMaintenancePayload(items) });
    } catch (error) {
      logError("monitor_maintenances_list_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleMonitorMaintenanceCreate(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    try {
      await requireVerifiedDomainForMonitor(user.id, monitor);
    } catch (error) {
      if (error?.message === "domain_not_verified") {
        sendJson(res, 403, { ok: false, error: "domain not verified", hostname: error?.details?.hostname || "" });
        return;
      }
      if (error?.message === "invalid_target") {
        sendJson(res, 400, { ok: false, error: "invalid target" });
        return;
      }
      logError("maintenance_domain_check_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
      return;
    }

    const startsAtRaw = Object.prototype.hasOwnProperty.call(body, "startsAt")
      ? body.startsAt
      : Object.prototype.hasOwnProperty.call(body, "starts_at")
      ? body.starts_at
      : null;
    const endsAtRaw = Object.prototype.hasOwnProperty.call(body, "endsAt")
      ? body.endsAt
      : Object.prototype.hasOwnProperty.call(body, "ends_at")
      ? body.ends_at
      : null;

    const startsAtMs = parseTimestampInput(startsAtRaw);
    const endsAtMs = parseTimestampInput(endsAtRaw);
    if (!Number.isFinite(startsAtMs)) {
      sendJson(res, 400, { ok: false, error: "invalid startsAt" });
      return;
    }
    if (!Number.isFinite(endsAtMs)) {
      sendJson(res, 400, { ok: false, error: "invalid endsAt" });
      return;
    }

    const nowMs = Date.now();
    const durationMs = endsAtMs - startsAtMs;
    if (durationMs <= 0) {
      sendJson(res, 400, { ok: false, error: "ends before start" });
      return;
    }
    if (durationMs < maintenanceMinDurationMs) {
      sendJson(res, 400, { ok: false, error: "duration too short", minMs: maintenanceMinDurationMs });
      return;
    }
    if (durationMs > maintenanceMaxDurationMs) {
      sendJson(res, 400, { ok: false, error: "duration too long", maxMs: maintenanceMaxDurationMs });
      return;
    }
    if (startsAtMs < nowMs - 5 * 60 * 1000) {
      const isActive = endsAtMs > nowMs;
      const withinMaxPast = startsAtMs >= nowMs - maintenanceMaxPastStartMs;
      if (!(isActive && withinMaxPast)) {
        sendJson(res, 400, { ok: false, error: "starts in past" });
        return;
      }
    }
    if (startsAtMs > nowMs + maintenanceLookaheadDays * dayDurationMs) {
      sendJson(res, 400, { ok: false, error: "starts too far" });
      return;
    }

    const title = normalizeMaintenanceTitle(body.title);
    const message = Object.prototype.hasOwnProperty.call(body, "message")
      ? normalizeMaintenanceMessage(body.message)
      : Object.prototype.hasOwnProperty.call(body, "note")
      ? normalizeMaintenanceMessage(body.note)
      : "";

    try {
      const [result] = await pool.query(
        "INSERT INTO maintenances (user_id, monitor_id, title, message, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)",
        [user.id, monitor.id, title, message || null, new Date(startsAtMs), new Date(endsAtMs)]
      );

      const maintenanceId = result?.insertId;
      const [rows] = await pool.query(
        `
          SELECT
            id,
            monitor_id,
            title,
            message,
            starts_at,
            ends_at,
            cancelled_at,
            created_at,
            updated_at
          FROM maintenances
          WHERE id = ?
            AND user_id = ?
            AND monitor_id = ?
          LIMIT 1
        `,
        [maintenanceId, user.id, monitor.id]
      );

      const payload = serializeMaintenanceRow(rows[0], Date.now());
      if (!payload) {
        sendJson(res, 500, { ok: false, error: "internal error" });
        return;
      }

      sendJson(res, 201, { ok: true, data: payload });
    } catch (error) {
      logError("maintenance_create_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleMonitorMaintenanceCancel(req, res, monitorId, maintenanceId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const numericId = Number(maintenanceId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      const [result] = await pool.query(
        `
          UPDATE maintenances
          SET cancelled_at = UTC_TIMESTAMP()
          WHERE id = ?
            AND user_id = ?
            AND monitor_id = ?
            AND cancelled_at IS NULL
          LIMIT 1
        `,
        [numericId, user.id, monitor.id]
      );

      if (!result?.affectedRows) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      logError("maintenance_cancel_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  return {
    handleMonitorHttpAssertionsGet,
    handleMonitorHttpAssertionsUpdate,
    handleMonitorIntervalUpdate,
    handleMonitorSloGet,
    handleMonitorSloUpdate,
    listMaintenancesForMonitorId,
    buildMaintenancePayload,
    handleMonitorMaintenancesList,
    handleMonitorMaintenanceCreate,
    handleMonitorMaintenanceCancel,
  };
}

module.exports = {
  createMonitorSettingsController,
};
