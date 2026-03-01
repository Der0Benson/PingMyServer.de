function createMonitorWriteController(dependencies = {}) {
  const {
    requireAuth,
    countMonitorsForUser,
    monitorsPerUserMax,
    sendJson,
    readJsonBody,
    decodeBase64UrlUtf8,
    normalizeMonitorUrl,
    validateMonitorTarget,
    normalizeTargetValidationReasonForTelemetry,
    runtimeTelemetry,
    incrementCounterMap,
    getDefaultMonitorName,
    normalizeMonitorIntervalMs,
    defaultMonitorIntervalMs,
    generateUniqueMonitorPublicId,
    createMonitorForUser,
    getMonitorByIdForUser,
    pool,
    toPublicMonitorId,
    logger,
  } = dependencies;

  async function handleCreateMonitor(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitorCount = await countMonitorsForUser(user.id);
    if (monitorCount >= monitorsPerUserMax) {
      sendJson(res, 429, { ok: false, error: "monitor limit reached" });
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(req.url || "/api/monitors", "http://localhost");
    } catch (error) {
      requestUrl = new URL("/api/monitors", "http://localhost");
    }

    const pathMatch = requestUrl.pathname.match(
      /^\/(?:api\/)?(?:monitor-create|create-monitor)\/([A-Za-z0-9_-]{1,4096})(?:\/([A-Za-z0-9_-]{1,1024}))?\/?$/
    );
    const pathUrlB64 = pathMatch ? String(pathMatch[1] || "").trim() : "";
    const pathNameB64 = pathMatch ? String(pathMatch[2] || "").trim() : "";

    const queryUrlB64 = String(requestUrl.searchParams.get("u") || requestUrl.searchParams.get("url_b64") || "").trim();
    const queryUrlRaw = String(requestUrl.searchParams.get("url") || "").trim();
    const queryNameB64 = String(requestUrl.searchParams.get("n") || requestUrl.searchParams.get("name_b64") || "").trim();
    const queryNameRaw = String(requestUrl.searchParams.get("name") || "").trim();
    const queryHasMonitorInput = Boolean(queryUrlB64 || queryUrlRaw || pathUrlB64);

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (!queryHasMonitorInput) {
        sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
        return;
      }
    }

    const decodedUrl = decodeBase64UrlUtf8(body?.url_b64, 4096);
    const decodedPathUrl = decodeBase64UrlUtf8(pathUrlB64, 4096);
    const decodedQueryUrl = decodeBase64UrlUtf8(queryUrlB64, 4096);
    const bodyRawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const rawUrlInput = bodyRawUrl || decodedUrl || queryUrlRaw || decodedQueryUrl || decodedPathUrl;
    const normalizedUrl = normalizeMonitorUrl(rawUrlInput);
    if (!normalizedUrl) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const targetValidation = await validateMonitorTarget(normalizedUrl, { useCache: true });
    if (!targetValidation.allowed) {
      const normalizedReason = normalizeTargetValidationReasonForTelemetry(targetValidation.reason);

      // Do not hard-block monitor creation for temporary DNS failures.
      if (normalizedReason !== "dns_unresolved") {
        runtimeTelemetry.security.monitorTargetBlocked += 1;
        incrementCounterMap(runtimeTelemetry.security.monitorTargetBlockReasons, normalizedReason);
        sendJson(res, 400, { ok: false, error: "target blocked", reason: normalizedReason });
        return;
      }
    }

    const decodedName = decodeBase64UrlUtf8(body?.name_b64, 512);
    const decodedPathName = decodeBase64UrlUtf8(pathNameB64, 512);
    const decodedQueryName = decodeBase64UrlUtf8(queryNameB64, 512);
    const bodyRawName = typeof body?.name === "string" ? body.name.trim() : "";
    const requestedName = bodyRawName || decodedName || queryNameRaw || decodedQueryName || decodedPathName;
    const monitorName = (requestedName || getDefaultMonitorName(normalizedUrl)).slice(0, 255);
    const safeDefaultIntervalMs = normalizeMonitorIntervalMs(defaultMonitorIntervalMs);
    let intervalMs = safeDefaultIntervalMs;
    let statusPagePublic = false;

    if (Object.prototype.hasOwnProperty.call(body, "intervalMs") || Object.prototype.hasOwnProperty.call(body, "interval_ms")) {
      const rawInterval = Object.prototype.hasOwnProperty.call(body, "intervalMs") ? body.intervalMs : body.interval_ms;
      const numeric = Number(rawInterval);
      if (!Number.isFinite(numeric)) {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      intervalMs = normalizeMonitorIntervalMs(numeric, safeDefaultIntervalMs);
    }

    const hasStatusPagePublic = Object.prototype.hasOwnProperty.call(body, "statusPagePublic");
    const hasStatusPagePublicLegacy = Object.prototype.hasOwnProperty.call(body, "status_page_public");
    if (hasStatusPagePublic || hasStatusPagePublicLegacy) {
      const rawStatusPagePublic = hasStatusPagePublic ? body.statusPagePublic : body.status_page_public;
      if (typeof rawStatusPagePublic !== "boolean") {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      statusPagePublic = rawStatusPagePublic;
    }

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const publicId = await generateUniqueMonitorPublicId();

        try {
          await createMonitorForUser({
            publicId,
            userId: user.id,
            name: monitorName,
            url: normalizedUrl,
            targetUrl: normalizedUrl,
            intervalMs,
            statusPagePublic,
          });

          sendJson(res, 201, { ok: true, id: publicId });
          return;
        } catch (error) {
          if (error?.code === "ER_DUP_ENTRY") {
            continue;
          }
          throw error;
        }
      }

      throw new Error("monitor_public_id_generation_failed");
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("create_monitor_failed", error);
      } else {
        console.error("create_monitor_failed", error);
      }
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleDeleteMonitor(req, res, monitorId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    let connection = null;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Explicit cleanup keeps data consistent even when old DB instances miss some FKs.
      await connection.query("DELETE FROM monitor_daily_error_codes WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_daily_stats WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_probe_daily_error_codes WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_probe_daily_stats WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_probe_checks WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_probe_state WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_checks WHERE monitor_id = ?", [monitor.id]);
      await connection.query("DELETE FROM monitor_incident_hides WHERE monitor_id = ?", [monitor.id]);
      const [deleteMonitorResult] = await connection.query("DELETE FROM monitors WHERE id = ? AND user_id = ? LIMIT 1", [
        monitor.id,
        user.id,
      ]);
      if (!Number(deleteMonitorResult?.affectedRows || 0)) {
        await connection.rollback();
        connection.release();
        connection = null;
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }

      await connection.commit();
      connection.release();
      connection = null;

      sendJson(res, 200, { ok: true, deletedMonitorId: toPublicMonitorId(monitor) });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          // ignore rollback errors
        }
        connection.release();
      }
      if (logger && typeof logger.error === "function") {
        logger.error("delete_monitor_failed", error);
      } else {
        console.error("delete_monitor_failed", error);
      }
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  return {
    handleCreateMonitor,
    handleDeleteMonitor,
  };
}

module.exports = {
  createMonitorWriteController,
};
