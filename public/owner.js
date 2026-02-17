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

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return number.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString("de-DE");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${formatNumber(number, 2)}%`;
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${formatNumber(number, 2)} ms`;
}

function formatDateTime(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return "n/a";
  return new Intl.DateTimeFormat("de-DE", {
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
    currentUserEmail.textContent = payload.user.email || "eingeloggt";
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
    ownerUserBadge.textContent = `Owner #${formatInt(data?.ownerUserId)}`;
  }

  renderStats(processStatsEl, [
    { label: "CPU Ø", value: processData.cpuPercentAvg !== null ? formatPercent(processData.cpuPercentAvg) : "n/a" },
    { label: "CPU p95", value: processData.cpuPercentP95 !== null ? formatPercent(processData.cpuPercentP95) : "n/a" },
    {
      label: "Event Loop p95",
      value: processData.eventLoopLagMsP95 !== null ? formatMs(processData.eventLoopLagMsP95) : "n/a",
    },
    { label: "RSS", value: processData.rssMb !== null ? `${formatNumber(processData.rssMb, 2)} MB` : "n/a" },
    { label: "Heap genutzt", value: processData.heapUsedMb !== null ? `${formatNumber(processData.heapUsedMb, 2)} MB` : "n/a" },
    { label: "Uptime", value: `${formatInt(processData.uptimeSeconds || 0)} Sek.` },
  ]);

  renderStats(checksStatsEl, [
    { label: "Monitore (aktiv)", value: `${formatInt(monitorSummary.active || 0)} / ${formatInt(monitorSummary.total || 0)}` },
    { label: "Checks 10 Min.", value: formatInt(recentChecks.checks10m || 0) },
    { label: "Fehlerrate 10 Min.", value: formatPercent(recentChecks.failureRate10mPercent || 0) },
    { label: "Check p95 Dauer", value: checksData.p95DurationMs !== null ? formatMs(checksData.p95DurationMs) : "n/a" },
    { label: "In Flight", value: `${formatInt(checksData.inFlight || 0)} (max ${formatInt(checksData.maxInFlight || 0)})` },
    { label: "Scheduler Drift p95", value: schedulerData.driftMsP95 !== null ? formatMs(schedulerData.driftMsP95) : "n/a" },
  ]);

  renderStats(dbStatsEl, [
    { label: "Queries gesamt", value: formatInt(dbData.queryCount || 0) },
    { label: "Slow Queries", value: formatInt(dbData.slowQueryCount || 0) },
    { label: "DB Query p95", value: dbData.p95QueryMs !== null ? formatMs(dbData.p95QueryMs) : "n/a" },
    { label: "DB Ops aktiv", value: formatInt(dbData.activeOperations || 0) },
    { label: "Acquire Wait p95", value: dbData.p95AcquireWaitMs !== null ? formatMs(dbData.p95AcquireWaitMs) : "n/a" },
    { label: "Pool busy", value: dbPoolData.busy === null ? "n/a" : formatInt(dbPoolData.busy) },
    { label: "Pool free", value: dbPoolData.free === null ? "n/a" : formatInt(dbPoolData.free) },
    { label: "Pool queue", value: dbPoolData.queue === null ? "n/a" : formatInt(dbPoolData.queue) },
    { label: "Pool max busy", value: dbPoolData.maxBusy === null ? "n/a" : formatInt(dbPoolData.maxBusy) },
  ]);
}

function appendListItems(listEl, items, formatter) {
  if (!listEl) return;
  listEl.textContent = "";
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "Keine Daten verfügbar.";
    listEl.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = formatter(item);
    listEl.appendChild(row);
  }
}

function renderMonitorCosts(items) {
  if (!monitorCostsBody) return;
  monitorCostsBody.textContent = "";

  if (!Array.isArray(items) || !items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "muted";
    cell.textContent = "Keine Monitor-Daten verfügbar.";
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
    status.textContent = monitor.paused ? "pausiert" : monitor.lastStatus || "unbekannt";
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
    `Invalid-Origin blockiert: ${formatInt(data?.runtimeSecurity?.invalidOriginBlocked || 0)}`,
    `Rate-Limit geblockt: ${formatInt(data?.runtimeSecurity?.authRateLimited || 0)}`,
    `OAuth-State abgewiesen: ${formatInt(data?.runtimeSecurity?.oauthStateRejected || 0)}`,
    `Target-Blockierungen: ${formatInt(data?.runtimeSecurity?.monitorTargetBlocked || 0)}`,
  ];
  const blockReasonItems = Array.isArray(data?.runtimeSecurity?.monitorTargetBlockReasons)
    ? data.runtimeSecurity.monitorTargetBlockReasons
    : [];
  for (const reason of blockReasonItems) {
    runtimeLines.push(`Blockgrund ${reason.key}: ${formatInt(reason.count)}`);
  }
  appendListItems(runtimeSecurityList, runtimeLines);

  appendListItems(
    topErrorsList,
    data?.topErrors || [],
    (item) => `${item.message || "unbekannt"} (${formatInt(item.hits || 0)})`
  );

  appendListItems(
    failingMonitorsList,
    data?.failingMonitors || [],
    (item) =>
      `${item.name || item.publicId || item.monitorId} · User ${formatInt(item.userId)} · ${formatPercent(
        item.failureRatePercent || 0
      )} (${formatInt(item.failedChecks || 0)}/${formatInt(item.totalChecks || 0)})`
  );

  appendListItems(authSecurityList, [
    `Aktive Lockouts: ${formatInt(data?.auth?.lockedAccounts || 0)}`,
    `Auth-Fehler (24h): ${formatInt(data?.auth?.recentAuthFailures24h || 0)}`,
    `Verfolgte Failure-Records: ${formatInt(data?.auth?.trackedAuthFailures || 0)}`,
  ]);
}

async function loadDashboard() {
  const [{ response: overviewResponse, payload: overviewPayload }, { response: monitorsResponse, payload: monitorsPayload }, { response: securityResponse, payload: securityPayload }] =
    await Promise.all([
      fetchJson("/api/owner/overview"),
      fetchJson("/api/owner/monitors"),
      fetchJson("/api/owner/security"),
    ]);

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
