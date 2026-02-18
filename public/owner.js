const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const refreshButton = document.getElementById("refresh-btn");
const ownerUserBadge = document.getElementById("owner-user-badge");

const processStatsEl = document.getElementById("process-stats");
const checksStatsEl = document.getElementById("checks-stats");
const dbStatsEl = document.getElementById("db-stats");
const monitorCostsBody = document.getElementById("monitor-costs-body");
const runtimeSecurityList = document.getElementById("runtime-security-list");
const topErrorsList = document.getElementById("top-errors-list");
const failingMonitorsList = document.getElementById("failing-monitors-list");
const authSecurityList = document.getElementById("auth-security-list");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return t("common.not_available", null, "n/a");
  return number.toLocaleString(i18nLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString(i18nLocale());
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return t("common.not_available", null, "n/a");
  return `${formatNumber(number, 2)}%`;
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return t("common.not_available", null, "n/a");
  return `${formatNumber(number, 2)} ms`;
}

function formatSeconds(value) {
  const seconds = Number(value);
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return t("owner.value.seconds", { value: formatInt(safe) }, `${formatInt(safe)} s`);
}

function formatDateTime(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return t("common.not_available", null, "n/a");
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}

function createStatItem(label, value) {
  const item = document.createElement("article");
  item.className = "stat-item";

  const statLabel = document.createElement("div");
  statLabel.className = "stat-label";
  statLabel.textContent = label;

  const statValue = document.createElement("div");
  statValue.className = "stat-value";
  statValue.textContent = value;

  item.appendChild(statLabel);
  item.appendChild(statValue);
  return item;
}

function renderStats(container, entries) {
  if (!container) return;
  container.textContent = "";
  for (const entry of entries) {
    container.appendChild(createStatItem(entry.label, entry.value));
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  return { response, payload };
}

async function ensureAuthenticated() {
  const { response, payload } = await fetchJson("/api/me");
  if (response.status === 401) {
    window.location.href = "/login";
    return false;
  }
  if (!response.ok || !payload?.ok || !payload.user) {
    window.location.href = "/login";
    return false;
  }
  if (currentUserEmail) {
    currentUserEmail.textContent = payload.user.email || t("common.signed_in", null, "signed in");
  }
  return true;
}

function renderOverview(data) {
  const runtime = data?.runtime || {};
  const processData = runtime.process || {};
  const checksData = runtime.checks || {};
  const schedulerData = runtime.scheduler || {};
  const dbData = runtime.db || {};
  const dbPoolData = dbData.pool || {};
  const monitorSummary = data?.monitorSummary || {};
  const recentChecks = data?.recentChecks || {};

  if (ownerUserBadge) {
    ownerUserBadge.textContent = t(
      "owner.badge_id",
      { id: formatInt(data?.ownerUserId) },
      `Owner #${formatInt(data?.ownerUserId)}`
    );
  }

  renderStats(processStatsEl, [
    {
      label: t("owner.stats.cpu_avg", null, "CPU avg"),
      value: processData.cpuPercentAvg !== null ? formatPercent(processData.cpuPercentAvg) : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.cpu_p95", null, "CPU p95"),
      value: processData.cpuPercentP95 !== null ? formatPercent(processData.cpuPercentP95) : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.event_loop_p95", null, "Event loop p95"),
      value: processData.eventLoopLagMsP95 !== null ? formatMs(processData.eventLoopLagMsP95) : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.rss", null, "RSS"),
      value: processData.rssMb !== null ? `${formatNumber(processData.rssMb, 2)} MB` : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.heap_used", null, "Heap used"),
      value: processData.heapUsedMb !== null ? `${formatNumber(processData.heapUsedMb, 2)} MB` : t("common.not_available", null, "n/a"),
    },
    { label: t("owner.stats.uptime", null, "Uptime"), value: formatSeconds(processData.uptimeSeconds || 0) },
  ]);

  renderStats(checksStatsEl, [
    {
      label: t("owner.stats.monitors_active", null, "Monitors (active)"),
      value: `${formatInt(monitorSummary.active || 0)} / ${formatInt(monitorSummary.total || 0)}`,
    },
    { label: t("owner.stats.checks_10m", null, "Checks (10m)"), value: formatInt(recentChecks.checks10m || 0) },
    {
      label: t("owner.stats.failure_rate_10m", null, "Failure rate (10m)"),
      value: formatPercent(recentChecks.failureRate10mPercent || 0),
    },
    {
      label: t("owner.stats.check_p95_duration", null, "Check p95 duration"),
      value: checksData.p95DurationMs !== null ? formatMs(checksData.p95DurationMs) : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.in_flight", null, "In flight"),
      value: t(
        "owner.value.in_flight",
        { current: formatInt(checksData.inFlight || 0), max: formatInt(checksData.maxInFlight || 0) },
        `${formatInt(checksData.inFlight || 0)} (max ${formatInt(checksData.maxInFlight || 0)})`
      ),
    },
    {
      label: t("owner.stats.scheduler_drift_p95", null, "Scheduler drift p95"),
      value: schedulerData.driftMsP95 !== null ? formatMs(schedulerData.driftMsP95) : t("common.not_available", null, "n/a"),
    },
  ]);

  renderStats(dbStatsEl, [
    { label: t("owner.stats.queries_total", null, "Total queries"), value: formatInt(dbData.queryCount || 0) },
    { label: t("owner.stats.slow_queries", null, "Slow queries"), value: formatInt(dbData.slowQueryCount || 0) },
    {
      label: t("owner.stats.db_query_p95", null, "DB query p95"),
      value: dbData.p95QueryMs !== null ? formatMs(dbData.p95QueryMs) : t("common.not_available", null, "n/a"),
    },
    { label: t("owner.stats.db_ops_active", null, "Active DB ops"), value: formatInt(dbData.activeOperations || 0) },
    {
      label: t("owner.stats.acquire_wait_p95", null, "Acquire wait p95"),
      value: dbData.p95AcquireWaitMs !== null ? formatMs(dbData.p95AcquireWaitMs) : t("common.not_available", null, "n/a"),
    },
    {
      label: t("owner.stats.pool_busy", null, "Pool busy"),
      value: dbPoolData.busy === null ? t("common.not_available", null, "n/a") : formatInt(dbPoolData.busy),
    },
    {
      label: t("owner.stats.pool_free", null, "Pool free"),
      value: dbPoolData.free === null ? t("common.not_available", null, "n/a") : formatInt(dbPoolData.free),
    },
    {
      label: t("owner.stats.pool_queue", null, "Pool queue"),
      value: dbPoolData.queue === null ? t("common.not_available", null, "n/a") : formatInt(dbPoolData.queue),
    },
    {
      label: t("owner.stats.pool_max_busy", null, "Pool max busy"),
      value: dbPoolData.maxBusy === null ? t("common.not_available", null, "n/a") : formatInt(dbPoolData.maxBusy),
    },
  ]);
}

function appendListItems(listEl, items, formatter = (value) => String(value)) {
  if (!listEl) return;
  listEl.textContent = "";
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = t("common.no_data_available", null, "No data available.");
    listEl.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = formatter(item);
    listEl.appendChild(row);
  }
}

function monitorStatusText(monitor) {
  if (monitor?.paused) return t("owner.status.paused", null, "paused");
  const status = String(monitor?.lastStatus || "").trim().toLowerCase();
  if (status === "online") return t("app.state.online", null, "Online");
  if (status === "offline") return t("app.state.offline", null, "Offline");
  return t("common.unknown", null, "unknown");
}

function renderMonitorCosts(items) {
  if (!monitorCostsBody) return;
  monitorCostsBody.textContent = "";

  if (!Array.isArray(items) || !items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "muted";
    cell.textContent = t("owner.table.no_monitor_data", null, "No monitor data available.");
    row.appendChild(cell);
    monitorCostsBody.appendChild(row);
    return;
  }

  for (const monitor of items) {
    const row = document.createElement("tr");

    const monitorCell = document.createElement("td");
    const title = document.createElement("div");
    title.textContent = monitor.name || monitor.publicId || `Monitor ${monitor.monitorId}`;
    const subtitle = document.createElement("div");
    subtitle.className = "muted";
    subtitle.textContent = `${monitor.publicId || monitor.monitorId} · ${monitor.target || "-"}`;
    monitorCell.appendChild(title);
    monitorCell.appendChild(subtitle);

    const userCell = document.createElement("td");
    userCell.textContent = formatInt(monitor.userId);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    const statusClass = monitor.paused ? "paused" : monitor.lastStatus === "online" ? "online" : "offline";
    status.className = `status-pill ${statusClass}`;
    status.textContent = monitorStatusText(monitor);
    statusCell.appendChild(status);

    const checksCell = document.createElement("td");
    checksCell.textContent = formatInt(monitor.checks24h || 0);

    const failCell = document.createElement("td");
    failCell.textContent = formatPercent(monitor.failRatePercent || 0);

    const avgMsCell = document.createElement("td");
    avgMsCell.textContent = formatMs(monitor.avgResponseMs);

    const timeoutCell = document.createElement("td");
    timeoutCell.textContent = formatInt(monitor.timeout24h || 0);

    const scoreCell = document.createElement("td");
    scoreCell.textContent = formatNumber(monitor.costScore || 0, 2);

    row.appendChild(monitorCell);
    row.appendChild(userCell);
    row.appendChild(statusCell);
    row.appendChild(checksCell);
    row.appendChild(failCell);
    row.appendChild(avgMsCell);
    row.appendChild(timeoutCell);
    row.appendChild(scoreCell);
    monitorCostsBody.appendChild(row);
  }
}

function renderSecurity(data) {
  const runtimeLines = [
    t(
      "owner.security.invalid_origin_blocked",
      { value: formatInt(data?.runtimeSecurity?.invalidOriginBlocked || 0) },
      `Invalid origin blocked: ${formatInt(data?.runtimeSecurity?.invalidOriginBlocked || 0)}`
    ),
    t(
      "owner.security.rate_limited_blocked",
      { value: formatInt(data?.runtimeSecurity?.authRateLimited || 0) },
      `Rate limited: ${formatInt(data?.runtimeSecurity?.authRateLimited || 0)}`
    ),
    t(
      "owner.security.oauth_state_rejected",
      { value: formatInt(data?.runtimeSecurity?.oauthStateRejected || 0) },
      `OAuth state rejected: ${formatInt(data?.runtimeSecurity?.oauthStateRejected || 0)}`
    ),
    t(
      "owner.security.target_blocked",
      { value: formatInt(data?.runtimeSecurity?.monitorTargetBlocked || 0) },
      `Target blocks: ${formatInt(data?.runtimeSecurity?.monitorTargetBlocked || 0)}`
    ),
  ];

  const blockReasonItems = Array.isArray(data?.runtimeSecurity?.monitorTargetBlockReasons)
    ? data.runtimeSecurity.monitorTargetBlockReasons
    : [];
  for (const reason of blockReasonItems) {
    runtimeLines.push(
      t(
        "owner.security.block_reason",
        { key: reason.key, value: formatInt(reason.count) },
        `Block reason ${reason.key}: ${formatInt(reason.count)}`
      )
    );
  }
  appendListItems(runtimeSecurityList, runtimeLines);

  appendListItems(topErrorsList, data?.topErrors || [], (item) => {
    const message = String(item?.message || "").trim() || t("common.unknown", null, "unknown");
    return `${message} (${formatInt(item?.hits || 0)})`;
  });

  appendListItems(failingMonitorsList, data?.failingMonitors || [], (item) =>
    t(
      "owner.security.failing_monitor_line",
      {
        name: item.name || item.publicId || item.monitorId,
        user: formatInt(item.userId),
        rate: formatPercent(item.failureRatePercent || 0),
        failed: formatInt(item.failedChecks || 0),
        total: formatInt(item.totalChecks || 0),
      },
      `${item.name || item.publicId || item.monitorId} · User ${formatInt(item.userId)} · ${formatPercent(
        item.failureRatePercent || 0
      )} (${formatInt(item.failedChecks || 0)}/${formatInt(item.totalChecks || 0)})`
    )
  );

  appendListItems(authSecurityList, [
    t(
      "owner.security.auth_lockouts",
      { value: formatInt(data?.auth?.lockedAccounts || 0) },
      `Active lockouts: ${formatInt(data?.auth?.lockedAccounts || 0)}`
    ),
    t(
      "owner.security.auth_failures_24h",
      { value: formatInt(data?.auth?.recentAuthFailures24h || 0) },
      `Auth failures (24h): ${formatInt(data?.auth?.recentAuthFailures24h || 0)}`
    ),
    t(
      "owner.security.auth_tracked_failures",
      { value: formatInt(data?.auth?.trackedAuthFailures || 0) },
      `Tracked failure records: ${formatInt(data?.auth?.trackedAuthFailures || 0)}`
    ),
  ]);
}

async function loadDashboard() {
  const [
    { response: overviewResponse, payload: overviewPayload },
    { response: monitorsResponse, payload: monitorsPayload },
    { response: securityResponse, payload: securityPayload },
  ] = await Promise.all([fetchJson("/api/owner/overview"), fetchJson("/api/owner/monitors"), fetchJson("/api/owner/security")]);

  if (overviewResponse.status === 401 || monitorsResponse.status === 401 || securityResponse.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (overviewResponse.status === 403 || monitorsResponse.status === 403 || securityResponse.status === 403) {
    window.location.href = "/app";
    return;
  }

  if (overviewPayload?.ok && overviewPayload.data) {
    renderOverview(overviewPayload.data);
  }
  if (monitorsPayload?.ok && monitorsPayload.data) {
    renderMonitorCosts(monitorsPayload.data.items || []);
  } else {
    renderMonitorCosts([]);
  }
  if (securityPayload?.ok && securityPayload.data) {
    renderSecurity(securityPayload.data);
  } else {
    renderSecurity({});
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // ignore
  } finally {
    window.location.href = "/login";
  }
}

async function init() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      loadDashboard().catch(() => {
        // ignore
      });
    });
  }

  await loadDashboard();
  setInterval(() => {
    loadDashboard().catch(() => {
      // ignore
    });
  }, 15000);
}

init();

