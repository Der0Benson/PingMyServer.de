function createOwnerController(dependencies = {}) {
  const {
    runtimeTelemetry,
    roundTo,
    getAverage,
    getPercentile,
    cpuCoreCount,
    getDbPoolSnapshot,
    FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED,
    FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT,
    FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES,
    allMonitorsOfflineConsecutiveCount,
    allMonitorsOfflineShutdownTriggered,
    mapToSortedCounterList,
    pool,
    fs,
    toTimestampMs,
    OWNER_DB_STORAGE_HISTORY_MAX_POINTS,
    OWNER_DB_STORAGE_HISTORY_HOURS,
    OWNER_DB_STORAGE_SNAPSHOT_INTERVAL_MS,
    OWNER_DB_STORAGE_RETENTION_DAYS,
    DAY_MS,
    OWNER_TOP_MONITOR_LIMIT,
    isValidMonitorPublicId,
    requireOwner,
    sendJson,
    countActiveSessions,
    getOwnerSmtpPublicConfig,
    isOwnerSmtpConfigured,
    readJsonBody,
    normalizeEmail,
    isValidEmail,
    buildOwnerVerificationDesignEmail,
    buildEmailNotificationUnsubscribeUrl,
    buildMonitorStatusNotificationEmail,
    EMAIL_NOTIFICATION_COOLDOWN_MINUTES_DEFAULT,
    sendOwnerSmtpTestEmail,
    OWNER_SMTP_FROM,
    OWNER_SMTP_HOST,
    OWNER_SMTP_PORT,
    runtimeLogger,
  } = dependencies;

  let ownerDbStorageDataDirCache = dependencies.ownerDbStorageDataDirCache || { value: '', fetchedAt: 0 };
  let ownerDbStorageLastCleanupAt = Number(dependencies.ownerDbStorageLastCleanupAt || 0);

  function buildOwnerRuntimeSnapshot() {
    const memoryUsage = process.memoryUsage();
    const checksTotal = Number(runtimeTelemetry.checks.total || 0);
    const checksFailed = Number(runtimeTelemetry.checks.failed || 0);
    const checksOk = Number(runtimeTelemetry.checks.ok || 0);
    const failureRate = checksTotal > 0 ? (checksFailed / checksTotal) * 100 : 0;
  
    return {
      process: {
        uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
        rssMb: roundTo(memoryUsage.rss / 1024 / 1024, 2),
        heapUsedMb: roundTo(memoryUsage.heapUsed / 1024 / 1024, 2),
        heapTotalMb: roundTo(memoryUsage.heapTotal / 1024 / 1024, 2),
        cpuPercentAvg: roundTo(getAverage(runtimeTelemetry.process.cpuPercentSamples), 2),
        cpuPercentP95: roundTo(getPercentile(runtimeTelemetry.process.cpuPercentSamples, 95), 2),
        eventLoopLagMsAvg: roundTo(getAverage(runtimeTelemetry.process.eventLoopLagMsSamples), 2),
        eventLoopLagMsP95: roundTo(getPercentile(runtimeTelemetry.process.eventLoopLagMsSamples, 95), 2),
        cpuCoreCount,
      },
      scheduler: {
        runs: Number(runtimeTelemetry.scheduler.runs || 0),
        skippedDueToOverlap: Number(runtimeTelemetry.scheduler.skippedDueToOverlap || 0),
        lastStartedAt: runtimeTelemetry.scheduler.lastStartedAt || null,
        lastFinishedAt: runtimeTelemetry.scheduler.lastFinishedAt || null,
        lastDurationMs: roundTo(runtimeTelemetry.scheduler.lastDurationMs, 2),
        lastDueMonitors: Number(runtimeTelemetry.scheduler.lastDueMonitors || 0),
        driftMsP95: roundTo(getPercentile(runtimeTelemetry.scheduler.driftMsSamples, 95), 2),
        allOfflineFailsafeEnabled: FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED,
        allOfflineFailsafeTriggerPercent: roundTo(FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT, 2),
        allOfflineFailsafeConsecutiveCycles: FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES,
        allOfflineFailsafeCurrentStreak: allMonitorsOfflineConsecutiveCount,
        allOfflineFailsafeTriggered: allMonitorsOfflineShutdownTriggered,
      },
      checks: {
        inFlight: Number(runtimeTelemetry.checks.inFlight || 0),
        maxInFlight: Number(runtimeTelemetry.checks.maxInFlight || 0),
        total: checksTotal,
        ok: checksOk,
        failed: checksFailed,
        timedOut: Number(runtimeTelemetry.checks.timedOut || 0),
        blocked: Number(runtimeTelemetry.checks.blocked || 0),
        avgDurationMs: roundTo(getAverage(runtimeTelemetry.checks.durationMsSamples), 2),
        p95DurationMs: roundTo(getPercentile(runtimeTelemetry.checks.durationMsSamples, 95), 2),
        failureRatePercent: roundTo(failureRate, 2),
      },
      db: {
        queryCount: Number(runtimeTelemetry.db.queryCount || 0),
        slowQueryCount: Number(runtimeTelemetry.db.slowQueryCount || 0),
        maxQueryMs: roundTo(runtimeTelemetry.db.maxQueryMs, 2),
        avgQueryMs: roundTo(getAverage(runtimeTelemetry.db.queryDurationMsSamples), 2),
        p95QueryMs: roundTo(getPercentile(runtimeTelemetry.db.queryDurationMsSamples, 95), 2),
        activeOperations: Number(runtimeTelemetry.db.activeOperations || 0),
        maxActiveOperations: Number(runtimeTelemetry.db.maxActiveOperations || 0),
        maxQueuedOperations: Number(runtimeTelemetry.db.maxQueuedOperations || 0),
        acquiredConnections: Number(runtimeTelemetry.db.acquiredConnections || 0),
        releasedConnections: Number(runtimeTelemetry.db.releasedConnections || 0),
        avgAcquireWaitMs: roundTo(getAverage(runtimeTelemetry.db.connectionAcquireWaitMsSamples), 2),
        p95AcquireWaitMs: roundTo(getPercentile(runtimeTelemetry.db.connectionAcquireWaitMsSamples, 95), 2),
        pool: getDbPoolSnapshot(),
      },
      security: {
        invalidOriginBlocked: Number(runtimeTelemetry.security.invalidOriginBlocked || 0),
        authRateLimited: Number(runtimeTelemetry.security.authRateLimited || 0),
        oauthStateRejected: Number(runtimeTelemetry.security.oauthStateRejected || 0),
        monitorTargetBlocked: Number(runtimeTelemetry.security.monitorTargetBlocked || 0),
        monitorTargetBlockReasons: mapToSortedCounterList(runtimeTelemetry.security.monitorTargetBlockReasons, 10),
      },
      startedAt: runtimeTelemetry.startedAt,
    };
  }
  
  function toNonNegativeInteger(value, fallback = 0) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) return fallback;
    return Math.round(normalized);
  }
  
  function toNullablePercent(part, total) {
    const numerator = Number(part);
    const denominator = Number(total);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
    return roundTo((numerator / denominator) * 100, 2);
  }
  
  async function getOwnerDbDataDir() {
    const now = Date.now();
    if (ownerDbStorageDataDirCache.value && now - ownerDbStorageDataDirCache.fetchedAt < 10 * 60 * 1000) {
      return ownerDbStorageDataDirCache.value;
    }
  
    try {
      const [rows] = await pool.query("SELECT @@datadir AS datadir");
      const dataDir = String(rows?.[0]?.datadir || "").trim();
      ownerDbStorageDataDirCache = { value: dataDir, fetchedAt: now };
      return dataDir;
    } catch (error) {
      ownerDbStorageDataDirCache = { value: ownerDbStorageDataDirCache.value || "", fetchedAt: now };
      return ownerDbStorageDataDirCache.value;
    }
  }
  
  async function readFilesystemUsageForPath(targetPath) {
    const statfsFn = fs?.promises && typeof fs.promises.statfs === "function" ? fs.promises.statfs.bind(fs.promises) : null;
    if (!statfsFn) return null;
  
    const candidatePath = String(targetPath || "").trim() || process.cwd();
  
    try {
      const stats = await statfsFn(candidatePath);
      const blockSize = Number(stats?.bsize || 0);
      const blocks = Number(stats?.blocks || 0);
      const availableBlocks = Number(stats?.bavail ?? stats?.bfree ?? 0);
  
      if (!Number.isFinite(blockSize) || !Number.isFinite(blocks) || blockSize <= 0 || blocks <= 0) {
        return null;
      }
  
      const totalBytes = Math.max(0, Math.round(blockSize * blocks));
      const freeBytes = Math.max(0, Math.round(blockSize * Math.max(0, availableBlocks)));
      return { totalBytes, freeBytes };
    } catch (error) {
      return null;
    }
  }
  
  async function collectOwnerDbStorageSnapshot() {
    const [rows] = await pool.query(
      `
        SELECT
          COALESCE(SUM(data_length + index_length), 0) AS used_bytes,
          COALESCE(SUM(data_free), 0) AS table_free_bytes
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
      `
    );
  
    const info = rows?.[0] || {};
    const usedBytes = toNonNegativeInteger(info.used_bytes, 0);
    const tableFreeBytes = toNonNegativeInteger(info.table_free_bytes, 0);
  
    const dataDir = await getOwnerDbDataDir();
    const fsUsage = await readFilesystemUsageForPath(dataDir);
    const serverTotalBytes = fsUsage ? toNonNegativeInteger(fsUsage.totalBytes, 0) : null;
    const serverFreeBytes = fsUsage ? toNonNegativeInteger(fsUsage.freeBytes, 0) : null;
    const serverUsedBytes =
      serverTotalBytes !== null && serverFreeBytes !== null ? Math.max(0, serverTotalBytes - serverFreeBytes) : null;
  
    return {
      sampledAt: Date.now(),
      usedBytes,
      tableFreeBytes,
      serverTotalBytes,
      serverFreeBytes,
      serverUsedBytes,
      serverFreePercent: toNullablePercent(serverFreeBytes, serverTotalBytes),
      serverUsedPercent: toNullablePercent(serverUsedBytes, serverTotalBytes),
    };
  }
  
  function serializeOwnerDbStorageSnapshotRow(row) {
    const sampledAt = toTimestampMs(row?.sampled_at);
    const usedBytes = toNonNegativeInteger(row?.used_bytes, 0);
    const tableFreeBytes = toNonNegativeInteger(row?.table_free_bytes, 0);
    const serverTotalBytes = row?.fs_total_bytes === null || row?.fs_total_bytes === undefined ? null : toNonNegativeInteger(row.fs_total_bytes, 0);
    const serverFreeBytes = row?.fs_free_bytes === null || row?.fs_free_bytes === undefined ? null : toNonNegativeInteger(row.fs_free_bytes, 0);
    const serverUsedBytes =
      serverTotalBytes !== null && serverFreeBytes !== null ? Math.max(0, serverTotalBytes - serverFreeBytes) : null;
  
    return {
      sampledAt,
      usedBytes,
      tableFreeBytes,
      serverTotalBytes,
      serverFreeBytes,
      serverUsedBytes,
      serverFreePercent: toNullablePercent(serverFreeBytes, serverTotalBytes),
      serverUsedPercent: toNullablePercent(serverUsedBytes, serverTotalBytes),
    };
  }
  
  function downsampleOwnerDbStorageHistory(points, maxPoints) {
    if (!Array.isArray(points) || points.length <= maxPoints) return Array.isArray(points) ? points : [];
    const limit = Math.max(2, toNonNegativeInteger(maxPoints, OWNER_DB_STORAGE_HISTORY_MAX_POINTS));
    const step = (points.length - 1) / (limit - 1);
    const sampled = [];
  
    for (let index = 0; index < limit; index += 1) {
      sampled.push(points[Math.round(index * step)]);
    }
  
    const deduped = [];
    let lastTs = -1;
    for (const point of sampled) {
      const ts = toNonNegativeInteger(point?.sampledAt, 0);
      if (ts <= 0 || ts === lastTs) continue;
      deduped.push(point);
      lastTs = ts;
    }
  
    return deduped.length ? deduped : [points[0], points[points.length - 1]].filter(Boolean);
  }
  
  async function listOwnerDbStorageSnapshotHistory(options = {}) {
    const requestedHours = Number(options.hours);
    const requestedMaxPoints = Number(options.maxPoints);
    const hours = Math.max(1, Math.min(24 * 90, Number.isFinite(requestedHours) ? Math.round(requestedHours) : OWNER_DB_STORAGE_HISTORY_HOURS));
    const maxPoints = Math.max(
      20,
      Math.min(5000, Number.isFinite(requestedMaxPoints) ? Math.round(requestedMaxPoints) : OWNER_DB_STORAGE_HISTORY_MAX_POINTS)
    );
  
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [rows] = await pool.query(
      `
        SELECT sampled_at, used_bytes, table_free_bytes, fs_total_bytes, fs_free_bytes
        FROM owner_db_storage_snapshots
        WHERE sampled_at >= ?
        ORDER BY sampled_at ASC
      `,
      [since]
    );
  
    const history = rows.map((row) => serializeOwnerDbStorageSnapshotRow(row)).filter((entry) => Number(entry.sampledAt) > 0);
    return downsampleOwnerDbStorageHistory(history, maxPoints);
  }
  
  async function persistOwnerDbStorageSnapshot(snapshot) {
    const now = Date.now();
    const [latestRows] = await pool.query(
      `
        SELECT sampled_at
        FROM owner_db_storage_snapshots
        ORDER BY sampled_at DESC
        LIMIT 1
      `
    );
    const latestTs = toTimestampMs(latestRows?.[0]?.sampled_at);
    if (latestTs > 0 && now - latestTs < OWNER_DB_STORAGE_SNAPSHOT_INTERVAL_MS) {
      return;
    }
  
    await pool.query(
      `
        INSERT INTO owner_db_storage_snapshots (sampled_at, used_bytes, table_free_bytes, fs_total_bytes, fs_free_bytes)
        VALUES (UTC_TIMESTAMP(3), ?, ?, ?, ?)
      `,
      [
        toNonNegativeInteger(snapshot?.usedBytes, 0),
        toNonNegativeInteger(snapshot?.tableFreeBytes, 0),
        snapshot?.serverTotalBytes === null || snapshot?.serverTotalBytes === undefined
          ? null
          : toNonNegativeInteger(snapshot.serverTotalBytes, 0),
        snapshot?.serverFreeBytes === null || snapshot?.serverFreeBytes === undefined
          ? null
          : toNonNegativeInteger(snapshot.serverFreeBytes, 0),
      ]
    );
  
    if (now - ownerDbStorageLastCleanupAt >= 6 * 60 * 60 * 1000) {
      ownerDbStorageLastCleanupAt = now;
      const cutoff = new Date(Date.now() - OWNER_DB_STORAGE_RETENTION_DAYS * DAY_MS);
      await pool.query(
        `
          DELETE FROM owner_db_storage_snapshots
          WHERE sampled_at < ?
        `,
        [cutoff]
      );
    }
  }
  
  function toOwnerMonitorCostRow(row) {
    const checks24h = Number(row.checks_24h || 0);
    const fail24h = Number(row.fail_24h || 0);
    const ok24h = Number(row.ok_24h || 0);
    const timeout24h = Number(row.timeout_24h || 0);
    const blocked24h = Number(row.blocked_24h || 0);
    const avgResponseMs = Number(row.avg_ms_24h || 0);
    const maxResponseMs = Number(row.max_ms_24h || 0);
    const checksPerMinute = checks24h / (24 * 60);
    const failRatePercent = checks24h > 0 ? (fail24h / checks24h) * 100 : 0;
  
    const costScoreRaw = checksPerMinute * Math.max(avgResponseMs, 1) + fail24h * 1.5 + timeout24h * 3 + blocked24h * 4;
  
    return {
      monitorId: Number(row.id),
      publicId: isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null,
      userId: Number(row.user_id),
      name: String(row.name || ""),
      target: String(row.target_url || row.url || ""),
      intervalMs: Number(row.interval_ms || 0),
      paused: !!row.is_paused,
      lastStatus: String(row.last_status || "unknown"),
      lastCheckedAt: toTimestampMs(row.last_checked_at),
      lastResponseMs: Number(row.last_response_ms || 0) || null,
      checks24h,
      ok24h,
      fail24h,
      timeout24h,
      blocked24h,
      avgResponseMs: roundTo(avgResponseMs, 2),
      maxResponseMs: roundTo(maxResponseMs, 2),
      checksPerMinute: roundTo(checksPerMinute, 4),
      failRatePercent: roundTo(failRatePercent, 2),
      costScore: roundTo(costScoreRaw, 2),
    };
  }
  
  async function fetchOwnerMonitorCostRows(limit = OWNER_TOP_MONITOR_LIMIT) {
    const [rows] = await pool.query(
      `
        SELECT
          m.id,
          m.public_id,
          m.user_id,
          m.name,
          m.url,
          m.target_url,
          m.interval_ms,
          m.is_paused,
          m.last_status,
          m.last_checked_at,
          m.last_response_ms,
          COUNT(c.id) AS checks_24h,
          SUM(CASE WHEN c.ok = 1 THEN 1 ELSE 0 END) AS ok_24h,
          SUM(CASE WHEN c.ok = 0 THEN 1 ELSE 0 END) AS fail_24h,
          AVG(c.response_ms) AS avg_ms_24h,
          MAX(c.response_ms) AS max_ms_24h,
          SUM(CASE WHEN c.error_message LIKE 'Target blocked by security policy%' THEN 1 ELSE 0 END) AS blocked_24h,
          SUM(
            CASE
              WHEN LOWER(COALESCE(c.error_message, '')) LIKE '%abort%'
                OR LOWER(COALESCE(c.error_message, '')) LIKE '%timed out%'
              THEN 1
              ELSE 0
            END
          ) AS timeout_24h
        FROM monitors m
        LEFT JOIN monitor_checks c
          ON c.monitor_id = m.id
         AND c.checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
        WHERE m.user_id IS NOT NULL
        GROUP BY
          m.id,
          m.public_id,
          m.user_id,
          m.name,
          m.url,
          m.target_url,
          m.interval_ms,
          m.is_paused,
          m.last_status,
          m.last_checked_at,
          m.last_response_ms
      `
    );
  
    return rows
      .map((row) => toOwnerMonitorCostRow(row))
      .sort((left, right) => right.costScore - left.costScore)
      .slice(0, Math.max(1, Math.min(OWNER_TOP_MONITOR_LIMIT, Number(limit) || OWNER_TOP_MONITOR_LIMIT)));
  }
  
  async function handleOwnerOverview(req, res) {
    const owner = await requireOwner(req, res);
    if (!owner) return;
  
    try {
      const runtime = buildOwnerRuntimeSnapshot();
      const [monitorRows] = await pool.query(
        `
          SELECT
            COUNT(*) AS total_monitors,
            SUM(CASE WHEN is_paused = 0 THEN 1 ELSE 0 END) AS active_monitors,
            SUM(CASE WHEN is_paused = 1 THEN 1 ELSE 0 END) AS paused_monitors
          FROM monitors
          WHERE user_id IS NOT NULL
        `
      );
      const [recentRows] = await pool.query(
        `
          SELECT
            COUNT(*) AS checks_10m,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed_10m,
            AVG(response_ms) AS avg_response_ms_10m,
            MAX(response_ms) AS max_response_ms_10m
          FROM monitor_checks
          WHERE checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE)
        `
      );
      const activeSessions = await countActiveSessions();
  
      const monitorSummary = monitorRows[0] || {};
      const recentSummary = recentRows[0] || {};
      const checks10m = Number(recentSummary.checks_10m || 0);
      const failed10m = Number(recentSummary.failed_10m || 0);
      const failureRate10m = checks10m > 0 ? (failed10m / checks10m) * 100 : 0;
  
      sendJson(res, 200, {
        ok: true,
        data: {
          ownerUserId: Number(owner.id),
          monitorSummary: {
            total: Number(monitorSummary.total_monitors || 0),
            active: Number(monitorSummary.active_monitors || 0),
            paused: Number(monitorSummary.paused_monitors || 0),
          },
          recentChecks: {
            checks10m,
            failed10m,
            failureRate10mPercent: roundTo(failureRate10m, 2),
            avgResponseMs10m: roundTo(recentSummary.avg_response_ms_10m, 2),
            maxResponseMs10m: roundTo(recentSummary.max_response_ms_10m, 2),
          },
          activeSessions,
          emailTest: getOwnerSmtpPublicConfig(),
          runtime,
        },
      });
    } catch (error) {
      runtimeLogger.error("owner_overview_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  async function handleOwnerMonitors(req, res, url) {
    const owner = await requireOwner(req, res);
    if (!owner) return;
  
    const requestedLimit = Number(url?.searchParams?.get("limit") || OWNER_TOP_MONITOR_LIMIT);
    const limit = Math.max(10, Math.min(OWNER_TOP_MONITOR_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : 50));
  
    try {
      const items = await fetchOwnerMonitorCostRows(limit);
      sendJson(res, 200, {
        ok: true,
        data: {
          ownerUserId: Number(owner.id),
          limit,
          items,
        },
      });
    } catch (error) {
      runtimeLogger.error("owner_monitors_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  async function handleOwnerSecurity(req, res) {
    const owner = await requireOwner(req, res);
    if (!owner) return;
  
    try {
      const [errorRows] = await pool.query(
        `
          SELECT
            COALESCE(NULLIF(TRIM(error_message), ''), 'keine Fehlermeldung') AS error_message,
            COUNT(*) AS hits
          FROM monitor_checks
          WHERE ok = 0
            AND checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
          GROUP BY COALESCE(NULLIF(TRIM(error_message), ''), 'keine Fehlermeldung')
          ORDER BY hits DESC
          LIMIT 20
        `
      );
      const [failingMonitorRows] = await pool.query(
        `
          SELECT
            m.id,
            m.public_id,
            m.user_id,
            m.name,
            COUNT(c.id) AS total_checks,
            SUM(CASE WHEN c.ok = 0 THEN 1 ELSE 0 END) AS failed_checks
          FROM monitors m
          JOIN monitor_checks c
            ON c.monitor_id = m.id
           AND c.checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
          WHERE m.user_id IS NOT NULL
          GROUP BY m.id, m.public_id, m.user_id, m.name
          HAVING COUNT(c.id) > 0
          ORDER BY failed_checks DESC, total_checks DESC
          LIMIT 20
        `
      );
      const [authFailureRows] = await pool.query(
        `
          SELECT
            COUNT(*) AS tracked_auth_failures,
            SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END) AS locked_accounts,
            SUM(CASE WHEN last_fail >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS recent_auth_failures
          FROM auth_failures
        `
      );
  
      const topErrors = errorRows.map((row) => ({
        message: String(row.error_message || "keine Fehlermeldung"),
        hits: Number(row.hits || 0),
      }));
      const failingMonitors = failingMonitorRows.map((row) => {
        const totalChecks = Number(row.total_checks || 0);
        const failedChecks = Number(row.failed_checks || 0);
        const failureRatePercent = totalChecks > 0 ? (failedChecks / totalChecks) * 100 : 0;
        return {
          monitorId: Number(row.id),
          publicId: isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null,
          userId: Number(row.user_id),
          name: String(row.name || ""),
          totalChecks,
          failedChecks,
          failureRatePercent: roundTo(failureRatePercent, 2),
        };
      });
      const authSummary = authFailureRows[0] || {};
  
      sendJson(res, 200, {
        ok: true,
        data: {
          ownerUserId: Number(owner.id),
          runtimeSecurity: buildOwnerRuntimeSnapshot().security,
          topErrors,
          failingMonitors,
          auth: {
            trackedAuthFailures: Number(authSummary.tracked_auth_failures || 0),
            lockedAccounts: Number(authSummary.locked_accounts || 0),
            recentAuthFailures24h: Number(authSummary.recent_auth_failures || 0),
          },
        },
      });
    } catch (error) {
      runtimeLogger.error("owner_security_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  async function handleOwnerDbStorage(req, res, url) {
    const owner = await requireOwner(req, res);
    if (!owner) return;
  
    const requestedHours = Number(url?.searchParams?.get("hours") || OWNER_DB_STORAGE_HISTORY_HOURS);
    const requestedPoints = Number(url?.searchParams?.get("points") || OWNER_DB_STORAGE_HISTORY_MAX_POINTS);
    const hours = Math.max(1, Math.min(24 * 90, Number.isFinite(requestedHours) ? Math.round(requestedHours) : OWNER_DB_STORAGE_HISTORY_HOURS));
    const points = Math.max(
      20,
      Math.min(5000, Number.isFinite(requestedPoints) ? Math.round(requestedPoints) : OWNER_DB_STORAGE_HISTORY_MAX_POINTS)
    );
  
    try {
      const snapshot = await collectOwnerDbStorageSnapshot();
      await persistOwnerDbStorageSnapshot(snapshot);
  
      let history = await listOwnerDbStorageSnapshotHistory({ hours, maxPoints: points });
      const currentSnapshot = {
        sampledAt: Number(snapshot.sampledAt || Date.now()),
        usedBytes: toNonNegativeInteger(snapshot.usedBytes, 0),
        tableFreeBytes: toNonNegativeInteger(snapshot.tableFreeBytes, 0),
        serverTotalBytes:
          snapshot.serverTotalBytes === null || snapshot.serverTotalBytes === undefined
            ? null
            : toNonNegativeInteger(snapshot.serverTotalBytes, 0),
        serverFreeBytes:
          snapshot.serverFreeBytes === null || snapshot.serverFreeBytes === undefined
            ? null
            : toNonNegativeInteger(snapshot.serverFreeBytes, 0),
        serverUsedBytes:
          snapshot.serverUsedBytes === null || snapshot.serverUsedBytes === undefined
            ? null
            : toNonNegativeInteger(snapshot.serverUsedBytes, 0),
        serverFreePercent:
          snapshot.serverFreePercent === null || snapshot.serverFreePercent === undefined
            ? null
            : roundTo(snapshot.serverFreePercent, 2),
        serverUsedPercent:
          snapshot.serverUsedPercent === null || snapshot.serverUsedPercent === undefined
            ? null
            : roundTo(snapshot.serverUsedPercent, 2),
      };
  
      const lastHistoryEntry = history.length ? history[history.length - 1] : null;
      if (!lastHistoryEntry || Math.abs(Number(lastHistoryEntry.sampledAt || 0) - currentSnapshot.sampledAt) > 1000) {
        history = [...history, currentSnapshot];
        history = downsampleOwnerDbStorageHistory(history, points);
      }
  
      const baselineEntry = history.length ? history[0] : currentSnapshot;
      const latestEntry = history.length ? history[history.length - 1] : currentSnapshot;
      const growthBytes = toNonNegativeInteger(latestEntry.usedBytes, 0) - toNonNegativeInteger(baselineEntry.usedBytes, 0);
      const growthPercent =
        Number(baselineEntry.usedBytes || 0) > 0 ? roundTo((growthBytes / Number(baselineEntry.usedBytes || 1)) * 100, 2) : null;
  
      sendJson(res, 200, {
        ok: true,
        data: {
          ownerUserId: Number(owner.id),
          windowHours: hours,
          points: history.length,
          sampledAt: currentSnapshot.sampledAt,
          usedBytes: currentSnapshot.usedBytes,
          tableFreeBytes: currentSnapshot.tableFreeBytes,
          serverTotalBytes: currentSnapshot.serverTotalBytes,
          serverFreeBytes: currentSnapshot.serverFreeBytes,
          serverUsedBytes: currentSnapshot.serverUsedBytes,
          serverFreePercent: currentSnapshot.serverFreePercent,
          serverUsedPercent: currentSnapshot.serverUsedPercent,
          growthBytes,
          growthPercent,
          history,
        },
      });
    } catch (error) {
      runtimeLogger.error("owner_db_storage_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  const OWNER_EMAIL_TEST_TEMPLATE_TYPES = new Set(["verification", "alert_started", "alert_resolved"]);
  
  function normalizeOwnerEmailTestTemplateType(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return OWNER_EMAIL_TEST_TEMPLATE_TYPES.has(normalized) ? normalized : null;
  }
  
  function buildOwnerEmailTestTemplatePayload({ templateType, owner }) {
    const normalizedTemplateType = normalizeOwnerEmailTestTemplateType(templateType);
    if (!normalizedTemplateType) return null;
  
    const ownerLabel = String(owner?.email || owner?.id || "").trim() || "owner";
    if (normalizedTemplateType === "verification") {
      const message = buildOwnerVerificationDesignEmail({ ownerEmail: ownerLabel });
      return {
        templateType: normalizedTemplateType,
        subject: message.subject,
        textBody: message.textBody,
        htmlBody: message.htmlBody,
        extraHeaders: {
          "X-PMS-Notification-Type": "owner_email_test_verification",
        },
      };
    }
  
    const ownerId = Number(owner?.id);
    const unsubscribeUrl =
      Number.isInteger(ownerId) && ownerId > 0 ? buildEmailNotificationUnsubscribeUrl(ownerId) : "";
    const isAlertResolved = normalizedTemplateType === "alert_resolved";
    const message = buildMonitorStatusNotificationEmail({
      monitorName: "Demo API Health",
      monitorUrl: "https://demo-api.pingmyserver.com/health",
      previousStatus: isAlertResolved ? "offline" : "online",
      nextStatus: isAlertResolved ? "online" : "offline",
      elapsedMs: isAlertResolved ? 184 : 10000,
      statusCode: isAlertResolved ? 200 : 503,
      errorMessage: isAlertResolved ? "" : "connect ECONNREFUSED 203.0.113.42:443",
      checkedAt: new Date(),
      recoveryDurationMs: isAlertResolved ? 17 * 60 * 1000 + 24 * 1000 : null,
      cooldownMinutes: EMAIL_NOTIFICATION_COOLDOWN_MINUTES_DEFAULT,
      unsubscribeUrl,
    });
  
    const extraHeaders = {
      "X-PMS-Notification-Type": isAlertResolved
        ? "owner_email_test_alert_resolved"
        : "owner_email_test_alert_started",
    };
    if (unsubscribeUrl) {
      extraHeaders["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
      extraHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  
    return {
      templateType: normalizedTemplateType,
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      extraHeaders,
    };
  }
  
  async function handleOwnerEmailTest(req, res) {
    const owner = await requireOwner(req, res);
    if (!owner) return;
  
    if (!isOwnerSmtpConfigured()) {
      sendJson(res, 400, {
        ok: false,
        error: "smtp not configured",
        data: { config: getOwnerSmtpPublicConfig() },
      });
      return;
    }
  
    let body = null;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
  
    const to = normalizeEmail(body?.to);
    if (!isValidEmail(to)) {
      sendJson(res, 400, { ok: false, error: "invalid recipient" });
      return;
    }
  
    const templateType = normalizeOwnerEmailTestTemplateType(body?.templateType || body?.template || "verification");
    if (!templateType) {
      sendJson(res, 400, { ok: false, error: "invalid template" });
      return;
    }
  
    const subject = String(body?.subject || "").trim().slice(0, 160);
  
    try {
      const templatePayload = buildOwnerEmailTestTemplatePayload({
        templateType,
        owner,
      });
      if (!templatePayload) {
        sendJson(res, 400, { ok: false, error: "invalid template" });
        return;
      }
  
      await sendOwnerSmtpTestEmail({
        to,
        subject: subject || templatePayload.subject,
        textBody: templatePayload.textBody,
        htmlBody: templatePayload.htmlBody,
        extraHeaders: {
          ...(templatePayload.extraHeaders || {}),
          "X-PMS-Template-Type": templateType,
        },
      });
  
      sendJson(res, 200, {
        ok: true,
        data: {
          to,
          from: OWNER_SMTP_FROM,
          host: OWNER_SMTP_HOST,
          port: OWNER_SMTP_PORT,
          templateType,
          sentAt: Date.now(),
        },
      });
    } catch (error) {
      runtimeLogger.error("owner_email_test_failed", error?.code || error?.message || error);
      sendJson(res, 500, {
        ok: false,
        error: "email send failed",
      });
    }
  }

  return {
    handleOwnerOverview,
    handleOwnerMonitors,
    handleOwnerSecurity,
    handleOwnerDbStorage,
    handleOwnerEmailTest,
  };
}

module.exports = {
  createOwnerController,
};
