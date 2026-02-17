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

let user = null;
let monitors = [];
const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";

function syncOwnerLinks() {
  const isOwner = !!user?.isOwner;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
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
  return new Intl.DateTimeFormat("de-DE", {
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
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00.000Z`));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0 Sek.";
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;
  return `${seconds} Sek.`;
}

function buildCodePills(errorCodes = [], statusCodes = []) {
  const items = [];
  if (Array.isArray(errorCodes) && errorCodes.length) {
    for (const item of errorCodes.slice(0, 8)) {
      const code = String(item.code || "NO_RESPONSE");
      const hits = Number(item.hits || 0);
      const label = code === "NO_RESPONSE" ? "keine Antwort" : code;
      items.push(`${label}${hits > 0 ? ` (${hits}x)` : ""}`);
    }
    return items;
  }

  if (Array.isArray(statusCodes) && statusCodes.length) {
    return statusCodes.slice(0, 8).map((code) => String(code));
  }

  return ["keine Antwort"];
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
    renderEmptyState("Keine Vorfälle gefunden.", "Passe Filter oder Zeitraum an.");
    return;
  }

  incidentHistoryListEl.innerHTML = "";

  for (const incident of items) {
    const card = document.createElement("article");
    card.className = "incident-history-item";

    const typeBadge = incident.aggregated ? "aggregiert" : "raw";
    const stateBadge = incident.ongoing ? "laufend" : "beendet";
    const rangeLabel = incident.aggregated
      ? formatDateOnly(incident.dateKey || incident.startTs)
      : `${formatDateTime(incident.startTs)} – ${incident.endTs ? formatDateTime(incident.endTs) : "offen"}`;
    const codePills = buildCodePills(incident.errorCodes, incident.statusCodes);

    card.innerHTML = `
      <div class="incident-history-head">
        <div class="incident-history-title">
          <div class="monitor-name">${escapeHtml(incident.monitorName || "Monitor")}</div>
          <div class="monitor-url">${escapeHtml(incident.monitorUrl || "–")}</div>
        </div>
        <div class="incident-badges">
          <span class="incident-badge">${typeBadge}</span>
          <span class="incident-badge">${stateBadge}</span>
        </div>
      </div>
      <div class="incident-details">
        <div class="detail-item">
          <div class="detail-key">Zeitraum</div>
          <div class="detail-value">${escapeHtml(rangeLabel)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Dauer</div>
          <div class="detail-value">${escapeHtml(formatDuration(Number(incident.durationMs || 0)))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Fehlchecks</div>
          <div class="detail-value">${Number(incident.samples || 0)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Monitor-ID</div>
          <div class="detail-value">${escapeHtml(String(incident.monitorId || "–"))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Statuscodes</div>
          <div class="detail-value code-list">${(incident.statusCodes || [])
            .slice(0, 8)
            .map((code) => `<span class="code-pill">${escapeHtml(String(code))}</span>`)
            .join("") || '<span class="code-pill">keine</span>'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Fehlercodes</div>
          <div class="detail-value code-list">${codePills
            .map((entry) => `<span class="code-pill">${escapeHtml(entry)}</span>`)
            .join("")}</div>
        </div>
      </div>
    `;

    incidentHistoryListEl.appendChild(card);
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
      currentUserEmail.textContent = user.email || "eingeloggt";
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
  allOption.textContent = "Alle Monitore";
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

  setSummary("Lade Vorfälle…");

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
      renderEmptyState("Fehler beim Laden.", "Bitte erneut versuchen.");
      setSummary("Fehler beim Laden.");
      return;
    }

    const payload = await response.json();
    if (!payload?.ok || !payload.data) {
      renderEmptyState("Keine Daten.", "Es konnten keine Vorfälle geladen werden.");
      setSummary("Keine Daten.");
      return;
    }

    renderIncidents(payload.data);
    const shown = Array.isArray(payload.data.items) ? payload.data.items.length : 0;
    const total = Number(payload.data.total || shown);
    const lookbackDays = Number(payload.data.lookbackDays || state.lookbackDays);
    setSummary(`Zeitraum: ${lookbackDays} Tage · Angezeigt: ${shown} · Gesamt: ${total}`);
  } catch (error) {
    renderEmptyState("Verbindung fehlgeschlagen.", "Bitte später erneut versuchen.");
    setSummary("Verbindung fehlgeschlagen.");
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
