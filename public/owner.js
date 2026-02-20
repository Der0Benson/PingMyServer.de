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
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));
const dbStorageStatsEl = document.getElementById("db-storage-stats");
const dbStorageChartEl = document.getElementById("db-storage-chart");
const dbStorageFootnoteEl = document.getElementById("db-storage-footnote");
const ownerEmailTestForm = document.getElementById("owner-email-test-form");
const ownerEmailTestFromEl = document.getElementById("owner-email-test-from");
const ownerEmailTestToEl = document.getElementById("owner-email-test-to");
const ownerEmailTestTemplateEl = document.getElementById("owner-email-test-template");
const ownerEmailTestSubjectEl = document.getElementById("owner-email-test-subject");
const ownerEmailTestSendButton = document.getElementById("owner-email-test-send");
const ownerEmailTestConfigEl = document.getElementById("owner-email-test-config");
const ownerEmailTestMessageEl = document.getElementById("owner-email-test-message");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

let ownerSmtpConfigured = false;
const OWNER_EMAIL_TEST_TEMPLATE_TYPES = new Set(["verification", "alert_started", "alert_resolved"]);

function normalizeOwnerEmailTestTemplateType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return OWNER_EMAIL_TEST_TEMPLATE_TYPES.has(normalized) ? normalized : null;
}

function getOwnerEmailTestTemplateLabel(templateType) {
  const normalized = normalizeOwnerEmailTestTemplateType(templateType) || "verification";
  if (normalized === "alert_started") {
    return t("owner.email_test.template_label_alert_started", null, "Alert eingeleitet");
  }
  if (normalized === "alert_resolved") {
    return t("owner.email_test.template_label_alert_resolved", null, "Alert aufgehoben");
  }
  return t("owner.email_test.template_label_verification", null, "Verifikations-Mail");
}

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

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return t("common.not_available", null, "n/a");
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let scaled = number;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : scaled >= 100 ? 1 : 2;
  return `${formatNumber(scaled, digits)} ${units[unitIndex]}`;
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

function setPanelMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text || "";
  element.classList.remove("success", "error");
  if (type) element.classList.add(type);
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

function buildOwnerSmtpConfigLabel(config) {
  if (!config?.configured) return t("owner.email_test.smtp_missing", null, "SMTP ist nicht konfiguriert.");

  const host = String(config.host || "").trim() || t("common.not_available", null, "n/a");
  const portNumber = Number(config.port);
  const port = Number.isFinite(portNumber) && portNumber > 0 ? String(Math.round(portNumber)) : t("common.not_available", null, "n/a");
  const security = config.secure
    ? t("owner.email_test.config_security_secure", null, "SMTPS")
    : config.requireTls
      ? t("owner.email_test.config_security_starttls", null, "STARTTLS")
      : t("owner.email_test.config_security_plain", null, "Unverschlüsselt");
  const auth = config.user
    ? t("owner.email_test.config_auth_user", { user: String(config.user || "").trim() }, `Login ${String(config.user || "").trim()}`)
    : t("owner.email_test.config_auth_none", null, "ohne Login");

  return t("owner.email_test.config", { host, port, security, auth }, `SMTP: ${host}:${port} · ${security} · ${auth}`);
}

function renderOwnerEmailTest(config) {
  const resolved = config && typeof config === "object" ? config : {};
  ownerSmtpConfigured = !!resolved.configured;

  if (ownerEmailTestFromEl) {
    ownerEmailTestFromEl.value =
      String(resolved.from || "").trim() || t("owner.email_test.from_missing", null, "Nicht konfiguriert");
  }
  if (ownerEmailTestConfigEl) {
    ownerEmailTestConfigEl.textContent = buildOwnerSmtpConfigLabel(resolved);
  }
  if (ownerEmailTestToEl) {
    ownerEmailTestToEl.disabled = !ownerSmtpConfigured;
  }
  if (ownerEmailTestTemplateEl) {
    const templateType = normalizeOwnerEmailTestTemplateType(ownerEmailTestTemplateEl.value) || "verification";
    ownerEmailTestTemplateEl.value = templateType;
    ownerEmailTestTemplateEl.disabled = !ownerSmtpConfigured;
  }
  if (ownerEmailTestSubjectEl) {
    ownerEmailTestSubjectEl.disabled = !ownerSmtpConfigured;
  }
  if (ownerEmailTestSendButton) {
    ownerEmailTestSendButton.disabled = !ownerSmtpConfigured;
  }

  if (!ownerSmtpConfigured) {
    setPanelMessage(
      ownerEmailTestMessageEl,
      t("owner.email_test.msg.not_configured", null, "SMTP ist nicht vollständig konfiguriert."),
      "error"
    );
  } else if (ownerEmailTestMessageEl?.classList.contains("error")) {
    setPanelMessage(ownerEmailTestMessageEl, "");
  }
}

async function submitOwnerEmailTest(event) {
  event.preventDefault();

  const recipient = normalizeEmail(ownerEmailTestToEl?.value);
  if (!isValidEmail(recipient)) {
    setPanelMessage(
      ownerEmailTestMessageEl,
      t("owner.email_test.msg.enter_recipient", null, "Bitte eine gültige Empfänger-E-Mail eingeben."),
      "error"
    );
    ownerEmailTestToEl?.focus();
    return;
  }

  const templateType = normalizeOwnerEmailTestTemplateType(ownerEmailTestTemplateEl?.value || "verification");
  if (!templateType) {
    setPanelMessage(
      ownerEmailTestMessageEl,
      t("owner.email_test.msg.invalid_template", null, "Bitte einen gültigen E-Mail-Typ auswählen."),
      "error"
    );
    ownerEmailTestTemplateEl?.focus();
    return;
  }

  const subject = String(ownerEmailTestSubjectEl?.value || "")
    .trim()
    .slice(0, 160);
  const idleLabel = t("owner.email_test.send", null, "Test-E-Mail senden");

  if (ownerEmailTestSendButton) {
    ownerEmailTestSendButton.disabled = true;
    ownerEmailTestSendButton.textContent = t("owner.email_test.send_loading", null, "Sende...");
  }
  setPanelMessage(ownerEmailTestMessageEl, t("owner.email_test.msg.sending", null, "Test-E-Mail wird gesendet..."));

  try {
    const { response, payload } = await fetchJson("/api/owner/email-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipient,
        templateType,
        subject,
      }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (response.status === 403) {
      window.location.href = "/app";
      return;
    }

    if (!response.ok || !payload?.ok) {
      if (payload?.error === "smtp not configured") {
        if (payload?.data?.config) {
          renderOwnerEmailTest(payload.data.config);
        }
        setPanelMessage(
          ownerEmailTestMessageEl,
          t("owner.email_test.msg.not_configured", null, "SMTP ist nicht vollständig konfiguriert."),
          "error"
        );
        return;
      }

      const errorMessage =
        payload?.error === "invalid recipient"
          ? t("owner.email_test.msg.invalid_recipient", null, "Empfänger-Adresse ist ungültig.")
          : payload?.error === "invalid template"
            ? t("owner.email_test.msg.invalid_template", null, "Bitte einen gültigen E-Mail-Typ auswählen.")
          : t("owner.email_test.msg.failed", null, "E-Mail konnte nicht versendet werden.");
      setPanelMessage(ownerEmailTestMessageEl, errorMessage, "error");
      return;
    }

    const sentAt = formatDateTime(payload?.data?.sentAt || Date.now());
    const sentTemplateType = normalizeOwnerEmailTestTemplateType(payload?.data?.templateType) || templateType;
    const templateLabel = getOwnerEmailTestTemplateLabel(sentTemplateType);
    const successMessage = t(
      "owner.email_test.msg.sent",
      { template: templateLabel, to: payload?.data?.to || recipient, time: sentAt },
      `Test-E-Mail (${templateLabel}) gesendet an ${payload?.data?.to || recipient} (${sentAt}).`
    );
    setPanelMessage(ownerEmailTestMessageEl, successMessage, "success");
  } catch (error) {
    setPanelMessage(ownerEmailTestMessageEl, t("owner.email_test.msg.failed", null, "E-Mail konnte nicht versendet werden."), "error");
  } finally {
    if (ownerEmailTestSendButton) {
      ownerEmailTestSendButton.textContent = idleLabel;
      ownerEmailTestSendButton.disabled = !ownerSmtpConfigured;
    }
  }
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

function syncOwnerLinks(user) {
  const isOwner = !!user?.isOwner;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
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
  syncOwnerLinks(payload.user);
  if (currentUserEmail) {
    currentUserEmail.textContent = payload.user.email || t("common.signed_in", null, "signed in");
  }
  if (ownerEmailTestToEl && !String(ownerEmailTestToEl.value || "").trim()) {
    ownerEmailTestToEl.value = String(payload.user.email || "").trim();
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

  renderOwnerEmailTest(data?.emailTest || null);
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

function downsampleHistoryPoints(history, maxPoints = 220) {
  if (!Array.isArray(history) || history.length <= maxPoints) return Array.isArray(history) ? history : [];
  const limit = Math.max(2, Math.round(maxPoints));
  const step = (history.length - 1) / (limit - 1);
  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(history[Math.round(index * step)]);
  }
  return sampled;
}

function formatSignedBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return t("common.not_available", null, "n/a");
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${formatBytes(Math.abs(number))}`;
}

function formatSignedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(number), 2)}%`;
}

function renderDbStorageStats(data) {
  if (!dbStorageStatsEl) return;
  const growthBytes = Number(data?.growthBytes);
  const growthPercent = Number(data?.growthPercent);
  const growthLabel = Number.isFinite(growthPercent)
    ? `${formatSignedBytes(growthBytes)} (${formatSignedPercent(growthPercent)})`
    : formatSignedBytes(growthBytes);

  const freePercent = Number(data?.serverFreePercent);
  const freeBytes = Number(data?.serverFreeBytes);
  const freeLabel =
    Number.isFinite(freePercent) && Number.isFinite(freeBytes)
      ? `${formatPercent(freePercent)} (${formatBytes(freeBytes)})`
      : t("common.not_available", null, "n/a");

  renderStats(dbStorageStatsEl, [
    {
      label: t("owner.stats.db_storage_used", null, "DB belegt"),
      value: formatBytes(data?.usedBytes),
    },
    {
      label: t("owner.stats.db_storage_growth", null, "Wachstum"),
      value: growthLabel,
    },
    {
      label: t("owner.stats.db_storage_server_free", null, "Server frei"),
      value: freeLabel,
    },
    {
      label: t("owner.stats.db_storage_sampled_at", null, "Letzte Messung"),
      value: formatDateTime(data?.sampledAt),
    },
  ]);
}

function renderDbStorageChart(data) {
  if (!dbStorageChartEl) return;
  const historyRaw = Array.isArray(data?.history) ? data.history : [];
  const normalized = historyRaw
    .map((item) => ({
      sampledAt: Number(item?.sampledAt),
      usedBytes: Number(item?.usedBytes),
    }))
    .filter((item) => Number.isFinite(item.sampledAt) && item.sampledAt > 0 && Number.isFinite(item.usedBytes) && item.usedBytes >= 0)
    .sort((left, right) => left.sampledAt - right.sampledAt);

  if (!normalized.length) {
    dbStorageChartEl.innerHTML = `
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="db-storage-chart-empty">
        ${t("owner.db_storage.no_data", null, "Noch keine DB-Speicherdaten verfügbar.")}
      </text>
    `;
    if (dbStorageFootnoteEl) {
      dbStorageFootnoteEl.textContent = t("owner.db_storage.waiting", null, "Warte auf erste Messpunkte...");
    }
    return;
  }

  const points = downsampleHistoryPoints(normalized, 220);
  const width = 960;
  const height = 320;
  const padLeft = 76;
  const padRight = 18;
  const padTop = 24;
  const padBottom = 44;
  const graphWidth = width - padLeft - padRight;
  const graphHeight = height - padTop - padBottom;

  const minUsed = Math.min(...points.map((point) => point.usedBytes));
  const maxUsed = Math.max(...points.map((point) => point.usedBytes));
  const valueRange = Math.max(1, maxUsed - minUsed);

  const graphPoints = points.map((point, index) => {
    const ratioX = points.length > 1 ? index / (points.length - 1) : 0;
    const ratioY = valueRange > 0 ? (point.usedBytes - minUsed) / valueRange : 0;
    const x = padLeft + ratioX * graphWidth;
    const y = padTop + (1 - ratioY) * graphHeight;
    return { ...point, x, y };
  });

  const linePath = graphPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${graphPoints[graphPoints.length - 1].x.toFixed(2)} ${(height - padBottom).toFixed(2)} L ${graphPoints[0].x.toFixed(2)} ${(height - padBottom).toFixed(2)} Z`;

  const horizontalTicks = 4;
  const gridLines = [];
  for (let tick = 0; tick <= horizontalTicks; tick += 1) {
    const ratio = tick / horizontalTicks;
    const y = padTop + ratio * graphHeight;
    const valueAtTick = maxUsed - ratio * valueRange;
    gridLines.push(`
      <line x1="${padLeft}" y1="${y.toFixed(2)}" x2="${(width - padRight).toFixed(2)}" y2="${y.toFixed(2)}" class="db-storage-chart-grid-line"></line>
      <text x="${(padLeft - 10).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="db-storage-chart-grid-label">${formatBytes(valueAtTick)}</text>
    `);
  }

  const first = graphPoints[0];
  const last = graphPoints[graphPoints.length - 1];
  const labelPoints = [];

  labelPoints.push({ point: first, anchor: "start" });

  if (graphPoints.length > 2) {
    const middleIndex = Math.floor((graphPoints.length - 1) / 2);
    if (middleIndex > 0 && middleIndex < graphPoints.length - 1) {
      const middle = graphPoints[middleIndex];
      const minSpacingPx = 120;
      if (Math.abs(middle.x - first.x) >= minSpacingPx && Math.abs(last.x - middle.x) >= minSpacingPx) {
        labelPoints.push({ point: middle, anchor: "middle" });
      }
    }
  }

  if (last !== first) {
    labelPoints.push({ point: last, anchor: "end" });
  }

  const xAxisLabels = labelPoints
    .map(
      ({ point, anchor }) =>
        `<text x="${point.x.toFixed(2)}" y="${(height - 14).toFixed(2)}" text-anchor="${anchor}" class="db-storage-chart-axis-label">${formatDateTime(
          point.sampledAt
        )}</text>`
    )
    .join("");

  dbStorageChartEl.innerHTML = `
    <defs>
      <linearGradient id="db-storage-area-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(103, 212, 255, 0.36)"></stop>
        <stop offset="100%" stop-color="rgba(103, 212, 255, 0.02)"></stop>
      </linearGradient>
    </defs>
    ${gridLines.join("")}
    <path d="${areaPath}" class="db-storage-chart-area"></path>
    <path d="${linePath}" class="db-storage-chart-line"></path>
    <circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="5.5" class="db-storage-chart-point"></circle>
    ${xAxisLabels}
  `;

  if (dbStorageFootnoteEl) {
    const growthText = formatSignedBytes(data?.growthBytes);
    dbStorageFootnoteEl.textContent = t(
      "owner.db_storage.footnote",
      {
        hours: formatInt(data?.windowHours || 0),
        points: formatInt(points.length),
        growth: growthText,
      },
      `Zeitraum: ${formatInt(data?.windowHours || 0)}h · Punkte: ${formatInt(points.length)} · Wachstum: ${growthText}`
    );
  }
}

function renderDbStorage(data) {
  renderDbStorageStats(data);
  renderDbStorageChart(data);
}

async function loadDashboard() {
  const [
    { response: overviewResponse, payload: overviewPayload },
    { response: monitorsResponse, payload: monitorsPayload },
    { response: securityResponse, payload: securityPayload },
    { response: storageResponse, payload: storagePayload },
  ] = await Promise.all([
    fetchJson("/api/owner/overview"),
    fetchJson("/api/owner/monitors"),
    fetchJson("/api/owner/security"),
    fetchJson("/api/owner/db-storage"),
  ]);

  if (overviewResponse.status === 401 || monitorsResponse.status === 401 || securityResponse.status === 401 || storageResponse.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (overviewResponse.status === 403 || monitorsResponse.status === 403 || securityResponse.status === 403 || storageResponse.status === 403) {
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
  if (storagePayload?.ok && storagePayload.data) {
    renderDbStorage(storagePayload.data);
  } else {
    renderDbStorage({});
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
  if (ownerEmailTestForm) {
    ownerEmailTestForm.addEventListener("submit", (event) => {
      submitOwnerEmailTest(event).catch(() => {
        setPanelMessage(ownerEmailTestMessageEl, t("owner.email_test.msg.failed", null, "E-Mail konnte nicht versendet werden."), "error");
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
