const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const refreshButton = document.getElementById("refresh-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const monitorFilterEl = document.getElementById("monitor-filter");
const sortFieldEl = document.getElementById("sort-field");
const sortOrderEl = document.getElementById("sort-order");
const lookbackDaysEl = document.getElementById("lookback-days");
const limitSelectEl = document.getElementById("limit-select");

const incidentsSummaryEl = document.getElementById("incidents-summary");
const incidentHistoryListEl = document.getElementById("incident-history-list");
const incidentHiddenHistoryListEl = document.getElementById("incident-hidden-history-list");

let user = null;
let monitors = [];
const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
const HIDDEN_HISTORY_LIMIT = 50;

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLang = () => (I18N && typeof I18N.getLang === "function" ? I18N.getLang() : "de");
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
const rtf = () =>
  I18N && typeof I18N.rtf === "function"
    ? I18N.rtf()
    : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });

function syncOwnerLinks() {
  const isOwner = user?.isOwner === true;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
    link.setAttribute("aria-hidden", isOwner ? "false" : "true");
    if (isOwner) {
      link.style.removeProperty("display");
    } else {
      link.style.setProperty("display", "none", "important");
    }
  }
}

function getPublicStatusPath(monitorId) {
  const id = String(monitorId || "").trim();
  if (!id) return "/status";
  return `/status/${encodeURIComponent(id)}`;
}

function readStoredMonitorId() {
  try {
    const value = String(window.localStorage.getItem(ACTIVE_MONITOR_STORAGE_KEY) || "").trim();
    return value || null;
  } catch (error) {
    return null;
  }
}

function pickPreferredMonitorId(monitorList) {
  const list = Array.isArray(monitorList) ? monitorList : [];
  if (!list.length) return "";

  const storedMonitorId = readStoredMonitorId();
  if (storedMonitorId) {
    const preferred = list.find((entry) => String(entry?.id || "") === storedMonitorId);
    if (preferred) return String(preferred.id);
  }

  return String(list[0].id || "");
}

function syncPublicStatusLinks() {
  if (!publicStatusLinks.length) return;
  const path = getPublicStatusPath(pickPreferredMonitorId(monitors));
  for (const link of publicStatusLinks) {
    link.setAttribute("href", path);
  }
}

function setSummary(text) {
  if (!incidentsSummaryEl) return;
  incidentsSummaryEl.textContent = text || "";
}

function getStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    monitor: params.get("monitor") || "all",
    sort: params.get("sort") || "start",
    order: params.get("order") || "desc",
    lookbackDays: params.get("lookbackDays") || "30",
    limit: params.get("limit") || "100",
  };
}

function applyStateToInputs(state) {
  if (monitorFilterEl) monitorFilterEl.value = state.monitor;
  if (sortFieldEl) sortFieldEl.value = state.sort;
  if (sortOrderEl) sortOrderEl.value = state.order;
  if (lookbackDaysEl) lookbackDaysEl.value = state.lookbackDays;
  if (limitSelectEl) limitSelectEl.value = state.limit;
}

function readStateFromInputs() {
  return {
    monitor: monitorFilterEl?.value || "all",
    sort: sortFieldEl?.value || "start",
    order: sortOrderEl?.value || "desc",
    lookbackDays: lookbackDaysEl?.value || "30",
    limit: limitSelectEl?.value || "100",
  };
}

function updateQueryFromState(state) {
  const params = new URLSearchParams();
  params.set("monitor", state.monitor);
  params.set("sort", state.sort);
  params.set("order", state.order);
  params.set("lookbackDays", state.lookbackDays);
  params.set("limit", state.limit);
  window.history.replaceState({}, "", `/incidents?${params.toString()}`);
}

function formatDateTime(ts) {
  if (!Number.isFinite(ts)) return "–";
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatDateOnly(value) {
  if (!value) return "–";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(i18nLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00.000Z`));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function shortUnit(unit) {
  const lang = i18nLang();
  if (lang === "en") {
    if (unit === "second") return "sec";
    if (unit === "minute") return "min";
    if (unit === "hour") return "hr";
  }
  if (unit === "second") return "Sek.";
  if (unit === "minute") return "Min.";
  if (unit === "hour") return "Std.";
  return unit;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return `0 ${shortUnit("second")}`;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) return `${hours} ${shortUnit("hour")} ${minutes} ${shortUnit("minute")}`;
  if (minutes > 0) return `${minutes} ${shortUnit("minute")} ${seconds} ${shortUnit("second")}`;
  return `${seconds} ${shortUnit("second")}`;
}

function formatErrorCodeLabel(value) {
  const code = String(value || "NO_RESPONSE").trim().toUpperCase();
  if (!code || code === "NO_RESPONSE") {
    return t("app.errors.no_response_label", null, "no response");
  }
  if (/^\d{3}$/.test(code)) return code;
  return code.replaceAll("_", " ").toLowerCase();
}

function causeFromStatusCode(value) {
  const code = Number(value);
  if (!Number.isFinite(code)) return null;
  if (code >= 500 && code <= 599) return "http_5xx";
  if (code >= 400 && code <= 499) return "http_4xx";
  return null;
}

function causeFromErrorCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return null;

  if (/^\d{3}$/.test(code)) {
    return causeFromStatusCode(Number(code));
  }

  if (code.includes("DNS") || code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) {
    return "dns";
  }
  if (code.includes("TLS") || code.includes("SSL") || code.includes("CERT")) {
    return "tls";
  }
  if (code.includes("TIMEOUT") || code.includes("ETIMEDOUT")) {
    return "timeout";
  }
  if (
    code.includes("ECONNREFUSED") ||
    code.includes("CONNECTION_REFUSED") ||
    code.includes("ECONNRESET") ||
    code.includes("CONNECTION_RESET") ||
    code.includes("UNREACHABLE") ||
    code.includes("EHOSTUNREACH") ||
    code.includes("ENETUNREACH") ||
    code.includes("NO_RESPONSE") ||
    code.includes("REQUEST_FAILED") ||
    code.includes("RESPONSE_ERROR")
  ) {
    return "network";
  }

  return null;
}

function causeFromMessage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("dns") || normalized.includes("enotfound") || normalized.includes("eai_again")) {
    return "dns";
  }
  if (normalized.includes("tls") || normalized.includes("ssl") || normalized.includes("certificate")) {
    return "tls";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("request_timeout")) {
    return "timeout";
  }
  if (
    normalized.includes("econnrefused") ||
    normalized.includes("connection refused") ||
    normalized.includes("econnreset") ||
    normalized.includes("socket hang up") ||
    normalized.includes("unreachable") ||
    normalized.includes("no response")
  ) {
    return "network";
  }

  const statusMatch = normalized.match(/(?:http|status|unexpected_status)[^\d]*(\d{3})/);
  if (statusMatch) {
    return causeFromStatusCode(Number(statusMatch[1]));
  }

  return null;
}

function getIncidentCauseKey(incident) {
  const errorCodes = Array.isArray(incident?.errorCodes) ? incident.errorCodes : [];
  for (const entry of errorCodes) {
    const code = typeof entry === "string" ? entry : entry?.code;
    const fromCode = causeFromErrorCode(code);
    if (fromCode) return fromCode;
  }

  const statusCodes = Array.isArray(incident?.statusCodes) ? incident.statusCodes : [];
  for (const statusCode of statusCodes) {
    const fromStatus = causeFromStatusCode(statusCode);
    if (fromStatus) return fromStatus;
  }

  const fromLastStatus = causeFromStatusCode(incident?.lastStatusCode);
  if (fromLastStatus) return fromLastStatus;

  const fromMessage = causeFromMessage(incident?.lastErrorMessage);
  if (fromMessage) return fromMessage;

  return "unknown";
}

function formatIncidentCauseHint(incident) {
  const causeKey = getIncidentCauseKey(incident);
  return t(
    `app.incidents.cause.${causeKey}`,
    null,
    t("app.incidents.cause.unknown", null, "Cause could not be identified.")
  );
}

function buildCodePills(errorCodes = [], statusCodes = []) {
  const items = [];
  if (Array.isArray(errorCodes) && errorCodes.length) {
    for (const item of errorCodes.slice(0, 8)) {
      const code = String(item.code || "NO_RESPONSE");
      const hits = Number(item.hits || 0);
      const label = formatErrorCodeLabel(code);
      items.push(`${label}${hits > 0 ? ` (${hits}x)` : ""}`);
    }
    return items;
  }

  if (Array.isArray(statusCodes) && statusCodes.length) {
    return statusCodes.slice(0, 8).map((code) => String(code));
  }

  return [t("app.errors.no_response_label", null, "no response")];
}

function buildIncidentRangeLabel(incident) {
  if (incident?.aggregated) {
    return formatDateOnly(incident.dateKey || incident.startTs);
  }
  return `${formatDateTime(incident?.startTs)} - ${
    incident?.endTs ? formatDateTime(incident.endTs) : t("app.incidents.open", null, "open")
  }`;
}

function buildIncidentHidePayload(incident, reason) {
  return {
    monitorId: String(incident?.monitorId || ""),
    reason,
    incident: {
      monitorId: String(incident?.monitorId || ""),
      monitorName: String(incident?.monitorName || ""),
      monitorUrl: String(incident?.monitorUrl || ""),
      aggregated: !!incident?.aggregated,
      dateKey: incident?.dateKey || null,
      startTs: Number(incident?.startTs || 0),
      endTs: incident?.endTs ? Number(incident.endTs) : null,
      durationMs: Number(incident?.durationMs || 0),
      statusCodes: Array.isArray(incident?.statusCodes) ? incident.statusCodes.slice(0, 20) : [],
      errorCodes: Array.isArray(incident?.errorCodes) ? incident.errorCodes.slice(0, 20) : [],
      lastStatusCode: incident?.lastStatusCode ?? null,
      lastErrorMessage: String(incident?.lastErrorMessage || ""),
      samples: Number(incident?.samples || 0),
      ongoing: !!incident?.ongoing,
    },
  };
}

function requestIncidentHideReason() {
  const promptText = t(
    "incidents.actions.hide_reason_prompt",
    null,
    "Bitte eine Begruendung eingeben, warum dieser Fehler ausgeblendet werden soll:"
  );
  const raw = window.prompt(promptText, "");
  if (raw === null) return null;
  const normalized = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    window.alert(t("incidents.actions.hide_reason_required", null, "Eine Begruendung ist erforderlich."));
    return null;
  }
  return normalized.slice(0, 500);
}

async function hideIncident(incident) {
  const reason = requestIncidentHideReason();
  if (!reason) return;

  setSummary(t("incidents.actions.hiding", null, "Fehler wird ausgeblendet..."));

  try {
    const response = await fetch("/api/incidents/hide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildIncidentHidePayload(incident, reason)),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const isReasonError = payload?.error === "reason required";
      setSummary(
        isReasonError
          ? t("incidents.actions.hide_reason_required", null, "Eine Begruendung ist erforderlich.")
          : t("incidents.actions.hide_failed", null, "Fehler konnte nicht ausgeblendet werden.")
      );
      return;
    }

    setSummary(t("incidents.actions.hide_success", null, "Fehler wurde ausgeblendet."));
    await loadIncidents();
  } catch (error) {
    setSummary(t("incidents.actions.hide_failed", null, "Fehler konnte nicht ausgeblendet werden."));
  }
}

function renderEmptyState(title, text) {
  if (!incidentHistoryListEl) return;
  incidentHistoryListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${title}</div>
      <div class="muted">${text}</div>
    </div>
  `;
}

function renderIncidents(payload) {
  if (!incidentHistoryListEl) return;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!items.length) {
    renderEmptyState(
      t("incidents.empty_title", null, "No incidents found."),
      t("incidents.empty_body", null, "Adjust filters or the time range.")
    );
    return;
  }

  incidentHistoryListEl.innerHTML = "";

  for (const incident of items) {
    const card = document.createElement("article");
    card.className = "incident-history-item";

    const typeBadge = incident.aggregated
      ? t("incidents.badge.aggregated", null, "aggregated")
      : t("incidents.badge.raw", null, "raw");
    const stateBadge = incident.ongoing
      ? t("app.incidents.badge.ongoing", null, "ongoing")
      : t("app.incidents.badge.ended", null, "ended");
    const rangeLabel = buildIncidentRangeLabel(incident);
    const codePills = buildCodePills(incident.errorCodes, incident.statusCodes);
    const causeHint = formatIncidentCauseHint(incident);
    const lastErrorMessage = String(incident.lastErrorMessage || "").trim();

    card.innerHTML = `
      <div class="incident-history-head">
        <div class="incident-history-title">
          <div class="monitor-name">${escapeHtml(incident.monitorName || t("common.monitor", null, "Monitor"))}</div>
          <div class="monitor-url">${escapeHtml(incident.monitorUrl || "-")}</div>
        </div>
        <div class="incident-head-actions">
          <div class="incident-badges">
            <span class="incident-badge">${typeBadge}</span>
            <span class="incident-badge">${stateBadge}</span>
          </div>
          <button class="btn ghost incident-hide-btn" type="button" data-action="hide-incident">
            ${escapeHtml(t("incidents.actions.hide", null, "Fehler ausblenden"))}
          </button>
        </div>
      </div>
      <div class="incident-details">
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.range", null, "Range"))}</div>
          <div class="detail-value">${escapeHtml(rangeLabel)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.duration", null, "Duration"))}</div>
          <div class="detail-value">${escapeHtml(formatDuration(Number(incident.durationMs || 0)))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.failed_checks", null, "Failed checks"))}</div>
          <div class="detail-value">${Number(incident.samples || 0)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.monitor_id", null, "Monitor ID"))}</div>
          <div class="detail-value">${escapeHtml(String(incident.monitorId || "-"))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.status_codes", null, "Status codes"))}</div>
          <div class="detail-value code-list">${(incident.statusCodes || [])
            .slice(0, 8)
            .map((code) => `<span class="code-pill">${escapeHtml(String(code))}</span>`)
            .join("") || `<span class="code-pill">${escapeHtml(t("common.none", null, "none"))}</span>`}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.error_codes", null, "Error codes"))}</div>
          <div class="detail-value code-list">${codePills
            .map((entry) => `<span class="code-pill">${escapeHtml(entry)}</span>`)
            .join("")}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.cause_hint", null, "Likely cause"))}</div>
          <div class="detail-value">${escapeHtml(causeHint)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.last_error", null, "Last error"))}</div>
          <div class="detail-value">${escapeHtml(lastErrorMessage || t("common.not_available", null, "n/a"))}</div>
        </div>
      </div>
    `;

    const hideButton = card.querySelector('[data-action="hide-incident"]');
    if (hideButton) {
      hideButton.addEventListener("click", () => {
        hideIncident(incident).catch(() => {
          setSummary(t("incidents.actions.hide_failed", null, "Fehler konnte nicht ausgeblendet werden."));
        });
      });
    }

    incidentHistoryListEl.appendChild(card);
  }
}

function renderHiddenHistory(payload) {
  if (!incidentHiddenHistoryListEl) return;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!items.length) {
    incidentHiddenHistoryListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">${escapeHtml(t("incidents.history.empty_title", null, "Keine ausgeblendeten Fehler."))}</div>
        <div class="muted">${escapeHtml(t("incidents.history.empty_body", null, "Sobald Fehler ausgeblendet werden, erscheinen sie hier."))}</div>
      </div>
    `;
    return;
  }

  incidentHiddenHistoryListEl.innerHTML = "";
  for (const entry of items) {
    const reason = String(entry?.hidden?.reason || "").trim();
    const hiddenAt = Number(entry?.hidden?.hiddenAt || 0);
    const rangeLabel = buildIncidentRangeLabel(entry);

    const card = document.createElement("article");
    card.className = "incident-hidden-item";
    card.innerHTML = `
      <div class="incident-hidden-head">
        <div class="incident-history-title">
          <div class="monitor-name">${escapeHtml(entry.monitorName || t("common.monitor", null, "Monitor"))}</div>
          <div class="monitor-url">${escapeHtml(entry.monitorUrl || "-")}</div>
        </div>
        <span class="incident-badge">${escapeHtml(t("incidents.history.badge_hidden", null, "ausgeblendet"))}</span>
      </div>
      <div class="incident-hidden-grid">
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.history.hidden_at", null, "Ausgeblendet am"))}</div>
          <div class="detail-value">${escapeHtml(hiddenAt > 0 ? formatDateTime(hiddenAt) : "-")}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.history.reason", null, "Begruendung"))}</div>
          <div class="detail-value">${escapeHtml(reason || t("common.not_available", null, "n/a"))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.range", null, "Range"))}</div>
          <div class="detail-value">${escapeHtml(rangeLabel)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">${escapeHtml(t("incidents.detail.monitor_id", null, "Monitor ID"))}</div>
          <div class="detail-value">${escapeHtml(String(entry.monitorId || "-"))}</div>
        </div>
      </div>
    `;

    incidentHiddenHistoryListEl.appendChild(card);
  }
}

async function loadHiddenHistory() {
  if (!incidentHiddenHistoryListEl) return;
  incidentHiddenHistoryListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(t("incidents.history.loading", null, "Lade ausgeblendete Fehler..."))}</div>
    </div>
  `;

  const state = readStateFromInputs();
  const params = new URLSearchParams({
    monitor: state.monitor,
    lookbackDays: state.lookbackDays,
    limit: String(HIDDEN_HISTORY_LIMIT),
  });

  try {
    const response = await fetch(`/api/incidents/hidden?${params.toString()}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) {
      incidentHiddenHistoryListEl.innerHTML = `
        <div class="empty-state">
          <div class="title">${escapeHtml(t("common.error_loading", null, "Error while loading."))}</div>
          <div class="muted">${escapeHtml(t("common.try_again", null, "Please try again."))}</div>
        </div>
      `;
      return;
    }

    const payload = await response.json();
    if (!payload?.ok || !payload.data) {
      incidentHiddenHistoryListEl.innerHTML = `
        <div class="empty-state">
          <div class="title">${escapeHtml(t("common.no_data", null, "No data."))}</div>
          <div class="muted">${escapeHtml(t("incidents.history.no_data_body", null, "History could not be loaded."))}</div>
        </div>
      `;
      return;
    }

    renderHiddenHistory(payload.data);
  } catch (error) {
    incidentHiddenHistoryListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">${escapeHtml(t("common.connection_failed", null, "Connection failed."))}</div>
        <div class="muted">${escapeHtml(t("common.try_again_later", null, "Please try again later."))}</div>
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function ensureAuthenticated() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!response.ok) return false;

    const payload = await response.json();
    if (!payload?.ok || !payload.user) {
      window.location.href = "/login";
      return false;
    }

    user = payload.user;
    syncOwnerLinks();
    if (currentUserEmail) {
      currentUserEmail.textContent = user.email || t("common.signed_in", null, "signed in");
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchMonitors() {
  const response = await fetch("/api/monitors", { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return [];
  }
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

function renderMonitorFilter(state) {
  if (!monitorFilterEl) return;
  monitorFilterEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = t("incidents.all_monitors", null, "All monitors");
  monitorFilterEl.appendChild(allOption);

  for (const monitor of monitors) {
    const option = document.createElement("option");
    option.value = String(monitor.id);
    option.textContent = monitor.name || monitor.url || String(monitor.id);
    monitorFilterEl.appendChild(option);
  }

  monitorFilterEl.value = state.monitor;
  if (monitorFilterEl.value !== state.monitor) {
    monitorFilterEl.value = "all";
  }
}

async function loadIncidents() {
  const state = readStateFromInputs();
  updateQueryFromState(state);

  setSummary(t("incidents.loading", null, "Loading incidents..."));

  const params = new URLSearchParams({
    monitor: state.monitor,
    sort: state.sort,
    order: state.order,
    lookbackDays: state.lookbackDays,
    limit: state.limit,
  });

  try {
    const response = await fetch(`/api/incidents?${params.toString()}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) {
      renderEmptyState(
        t("common.error_loading", null, "Error while loading."),
        t("common.try_again", null, "Please try again.")
      );
      setSummary(t("common.error_loading", null, "Error while loading."));
      return;
    }

    const payload = await response.json();
    if (!payload?.ok || !payload.data) {
      renderEmptyState(
        t("common.no_data", null, "No data."),
        t("incidents.no_data_body", null, "Incidents could not be loaded.")
      );
      setSummary(t("common.no_data", null, "No data."));
      return;
    }
    renderIncidents(payload.data);
    const shown = Array.isArray(payload.data.items) ? payload.data.items.length : 0;
    const total = Number(payload.data.total || shown);
    const hidden = Number(payload.data.hiddenCount || 0);
    const lookbackDays = Number(payload.data.lookbackDays || state.lookbackDays);
    setSummary(
      t(
        "incidents.summary",
        { days: lookbackDays, shown, total, hidden },
        `Range: ${lookbackDays} days | Showing: ${shown} | Total: ${total} | Hidden: ${hidden}`
      )
    );
    await loadHiddenHistory();
  } catch (error) {
    renderEmptyState(
      t("common.connection_failed", null, "Connection failed."),
      t("common.try_again_later", null, "Please try again later.")
    );
    setSummary(t("common.connection_failed", null, "Connection failed."));
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

  monitors = await fetchMonitors();
  syncPublicStatusLinks();
  const initialState = getStateFromQuery();

  renderMonitorFilter(initialState);
  applyStateToInputs(initialState);

  const controls = [monitorFilterEl, sortFieldEl, sortOrderEl, lookbackDaysEl, limitSelectEl].filter(Boolean);
  for (const control of controls) {
    control.addEventListener("change", () => {
      loadIncidents().catch(() => {
        // ignore
      });
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      loadIncidents().catch(() => {
        // ignore
      });
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  await loadIncidents();
}

init();
