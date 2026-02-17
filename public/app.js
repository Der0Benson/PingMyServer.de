const pollIntervalMs = 5000;
const monitorsRefreshIntervalMs = 30000;

const barsContainer = document.getElementById("uptime-bars");
const chart = document.getElementById("response-chart");

const statusState = document.getElementById("status-state");
const statusDuration = document.getElementById("status-duration");
const lastCheck = document.getElementById("last-check");
const checkInterval = document.getElementById("check-interval");

const statAvg = document.getElementById("stat-avg");
const statMin = document.getElementById("stat-min");
const statMax = document.getElementById("stat-max");
const uptimeIncidents = document.getElementById("uptime-incidents");
const uptimePercent = document.getElementById("uptime-percent");

const mapEl = document.querySelector(".map");
const mapLocation = document.getElementById("map-location");
const mapCoords = document.getElementById("map-coords");
const domainExpiry = document.getElementById("domain-expiry");
const domainSource = document.getElementById("domain-source");
const sslExpiry = document.getElementById("ssl-expiry");
const sslIssuer = document.getElementById("ssl-issuer");
const incidentsList = document.getElementById("incidents-list");

const heatmapMonths = document.getElementById("heatmap-months");
const heatmapCells = document.getElementById("heatmap-cells");
const monitorNameEl = document.getElementById("monitor-name");
const monitorTargetEl = document.getElementById("monitor-target");
const monitorIconEl = document.getElementById("monitor-icon");
const range7Uptime = document.getElementById("range-7-uptime");
const range7Meta = document.getElementById("range-7-meta");
const range30Uptime = document.getElementById("range-30-uptime");
const range30Meta = document.getElementById("range-30-meta");
const range365Uptime = document.getElementById("range-365-uptime");
const range365Meta = document.getElementById("range-365-meta");
const rangePickerLabel = document.getElementById("range-picker-label");

const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const publicStatusButton = document.getElementById("public-status-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));
const newMonitorButton = document.getElementById("new-monitor-btn");
const monitorSelect = document.getElementById("monitor-select");
const intervalSelect = document.getElementById("interval-select");
const monitorList = document.getElementById("monitor-list");
const responseCard = document.querySelector(".response-card");
const incidentsCard = document.querySelector(".incidents-side-card");

const assertionsForm = document.getElementById("assertions-form");
const assertionsEnabledInput = document.getElementById("assertions-enabled");
const assertionsStatusCodesInput = document.getElementById("assertions-status-codes");
const assertionsFollowRedirectsInput = document.getElementById("assertions-follow-redirects");
const assertionsMaxRedirectsInput = document.getElementById("assertions-max-redirects");
const assertionsContentTypeInput = document.getElementById("assertions-content-type");
const assertionsBodyInput = document.getElementById("assertions-body");
const assertionsTimeoutInput = document.getElementById("assertions-timeout");
const assertionsMessageEl = document.getElementById("assertions-message");

const maintenanceForm = document.getElementById("maintenance-form");
const maintenanceTitleInput = document.getElementById("maintenance-title");
const maintenanceStartInput = document.getElementById("maintenance-start");
const maintenanceEndInput = document.getElementById("maintenance-end");
const maintenanceNoteInput = document.getElementById("maintenance-note");
const maintenanceFormMessageEl = document.getElementById("maintenance-form-message");
const maintenanceListEl = document.getElementById("maintenance-list");
const maintenanceCreateButton = document.getElementById("maintenance-create");
const maintenanceVerifyLinkEl = document.getElementById("maintenance-verify-link");

let user = null;
let monitors = [];
let activeMonitorId = null;
let latestMetrics = null;
let statusSince = Date.now();
let lastCheckTime = null;
const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
const DEFAULT_MONITOR_ICON = "/assets/pingmyserverlogo.png";
let monitorIconKey = "";
let assertionsDirty = false;
let assertionsBoundMonitorId = null;
let maintenanceBoundMonitorId = null;

function setAssertionsMessage(message, variant = "") {
  if (!assertionsMessageEl) return;
  assertionsMessageEl.textContent = String(message || "");
  assertionsMessageEl.classList.toggle("success", variant === "success");
  assertionsMessageEl.classList.toggle("error", variant === "error");
}

function setMaintenanceMessage(message, variant = "") {
  if (!maintenanceFormMessageEl) return;
  maintenanceFormMessageEl.textContent = String(message || "");
  maintenanceFormMessageEl.classList.toggle("success", variant === "success");
  maintenanceFormMessageEl.classList.toggle("error", variant === "error");
}

function hideMaintenanceVerifyLink() {
  if (!maintenanceVerifyLinkEl) return;
  maintenanceVerifyLinkEl.hidden = true;
  maintenanceVerifyLinkEl.removeAttribute("data-hostname");
  maintenanceVerifyLinkEl.href = "/connections#domain-verification";
}

function showMaintenanceVerifyLink(hostname) {
  if (!maintenanceVerifyLinkEl) return;
  const clean = String(hostname || "").trim();
  maintenanceVerifyLinkEl.href = clean
    ? `/connections?domain=${encodeURIComponent(clean)}#domain-verification`
    : "/connections#domain-verification";
  maintenanceVerifyLinkEl.hidden = false;
  if (clean) maintenanceVerifyLinkEl.dataset.hostname = clean;
}

function markAssertionsDirty() {
  assertionsDirty = true;
  setAssertionsMessage("");
}

function applyAssertionsEnabledState() {
  if (!assertionsForm || !assertionsEnabledInput) return;

  const enabled = !!assertionsEnabledInput.checked;
  assertionsForm.classList.toggle("is-disabled", !enabled);

  const fields = [
    assertionsStatusCodesInput,
    assertionsFollowRedirectsInput,
    assertionsMaxRedirectsInput,
    assertionsContentTypeInput,
    assertionsBodyInput,
    assertionsTimeoutInput,
  ].filter(Boolean);

  for (const field of fields) {
    field.disabled = !enabled;
  }

  if (assertionsMaxRedirectsInput) {
    const redirectsEnabled = !!assertionsFollowRedirectsInput?.checked;
    assertionsMaxRedirectsInput.disabled = !enabled || !redirectsEnabled;
  }
}

function syncAssertionsPanel(assertions, options = {}) {
  const { force = false } = options;
  if (!assertionsForm) return;
  if (!force && assertionsDirty) return;

  const normalized = assertions && typeof assertions === "object" ? assertions : null;

  assertionsBoundMonitorId = activeMonitorId;

  if (!normalized) {
    if (assertionsEnabledInput) assertionsEnabledInput.checked = false;
    if (assertionsStatusCodesInput) assertionsStatusCodesInput.value = "";
    if (assertionsFollowRedirectsInput) assertionsFollowRedirectsInput.checked = true;
    if (assertionsMaxRedirectsInput) assertionsMaxRedirectsInput.value = "5";
    if (assertionsContentTypeInput) assertionsContentTypeInput.value = "";
    if (assertionsBodyInput) assertionsBodyInput.value = "";
    if (assertionsTimeoutInput) assertionsTimeoutInput.value = "0";
    applyAssertionsEnabledState();
    return;
  }

  if (assertionsEnabledInput) assertionsEnabledInput.checked = !!normalized.enabled;
  if (assertionsStatusCodesInput) assertionsStatusCodesInput.value = String(normalized.expectedStatusCodes || "");
  if (assertionsFollowRedirectsInput) assertionsFollowRedirectsInput.checked = normalized.followRedirects !== false;
  if (assertionsMaxRedirectsInput) {
    const maxRedirects = Number.isFinite(Number(normalized.maxRedirects)) ? Number(normalized.maxRedirects) : 5;
    assertionsMaxRedirectsInput.value = String(maxRedirects);
  }
  if (assertionsContentTypeInput) assertionsContentTypeInput.value = String(normalized.contentTypeContains || "");
  if (assertionsBodyInput) assertionsBodyInput.value = String(normalized.bodyContains || "");
  if (assertionsTimeoutInput) {
    const timeoutMs = Number.isFinite(Number(normalized.timeoutMs)) ? Number(normalized.timeoutMs) : 0;
    assertionsTimeoutInput.value = String(timeoutMs);
  }

  applyAssertionsEnabledState();
}

function readAssertionsPayload() {
  return {
    enabled: !!assertionsEnabledInput?.checked,
    expectedStatusCodes: String(assertionsStatusCodesInput?.value || "").trim(),
    contentTypeContains: String(assertionsContentTypeInput?.value || "").trim(),
    bodyContains: String(assertionsBodyInput?.value || "").trim(),
    followRedirects: !!assertionsFollowRedirectsInput?.checked,
    maxRedirects: Number(assertionsMaxRedirectsInput?.value),
    timeoutMs: Number(assertionsTimeoutInput?.value),
  };
}

function parseDateTimeLocalInput(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (![year, month, day, hour, minute].every((v) => Number.isFinite(v))) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toDateTimeLocalValue(timestampMs) {
  const ms = Number(timestampMs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatDateTime(ts) {
  if (!Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function getMaintenanceStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return { label: "läuft", cls: "active" };
  if (normalized === "scheduled") return { label: "geplant", cls: "scheduled" };
  if (normalized === "completed") return { label: "beendet", cls: "completed" };
  if (normalized === "cancelled") return { label: "abgebrochen", cls: "cancelled" };
  return { label: "unbekannt", cls: "" };
}

function renderMaintenances(maintenances) {
  if (!maintenanceListEl) return;

  if (!maintenances || typeof maintenances !== "object") {
    maintenanceListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">Wartungen sind noch nicht aktiv.</div>
        <div class="muted">Dein Server liefert noch keine Wartungs-Daten (Backend-Update/Restart fehlt).</div>
      </div>
    `;
    return;
  }

  const payload = maintenances;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!items.length) {
    maintenanceListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">Keine Wartungen.</div>
        <div class="muted">Sobald du eine Wartung planst, erscheint sie hier.</div>
      </div>
    `;
    return;
  }

  const prio = (entry) => {
    const status = String(entry?.status || "").toLowerCase();
    if (status === "active") return 0;
    if (status === "scheduled") return 1;
    if (status === "completed") return 2;
    if (status === "cancelled") return 3;
    return 4;
  };

  const ordered = items.slice().sort((a, b) => {
    const pa = prio(a);
    const pb = prio(b);
    if (pa !== pb) return pa - pb;
    return Number(a?.startsAt || 0) - Number(b?.startsAt || 0);
  });

  maintenanceListEl.innerHTML = "";

  for (const entry of ordered) {
    const id = Number(entry?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const status = String(entry?.status || "").toLowerCase();
    const startsAt = Number(entry?.startsAt);
    const endsAt = Number(entry?.endsAt);
    const title = String(entry?.title || "Wartung").trim() || "Wartung";
    const note = String(entry?.message || "").trim();
    const badge = getMaintenanceStatusBadge(status);

    const range = `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
    const metaSuffix =
      status === "scheduled" && Number.isFinite(startsAt)
        ? ` (startet in ${formatRelative(Math.max(0, startsAt - Date.now()))})`
        : status === "active" && Number.isFinite(endsAt)
        ? ` (endet in ${formatRelative(Math.max(0, endsAt - Date.now()))})`
        : "";

    const canCancel = status === "scheduled" || status === "active";

    const card = document.createElement("article");
    card.className = "maintenance-item";
    card.innerHTML = `
      <div class="maintenance-item-head">
        <div>
          <div class="maintenance-item-title">${escapeHtml(title)}</div>
          <div class="maintenance-item-subtitle">${escapeHtml(range + metaSuffix)}</div>
        </div>
        <span class="maintenance-item-badge ${escapeHtml(badge.cls)}">${escapeHtml(badge.label)}</span>
      </div>
      ${note ? `<div class="maintenance-item-note">${escapeHtml(note)}</div>` : ""}
      <div class="maintenance-item-actions">
        ${
          canCancel
            ? `<button class="btn ghost" type="button" data-maintenance-cancel-id="${escapeHtml(
                String(id)
              )}">Abbrechen</button>`
            : ""
        }
      </div>
    `;

    maintenanceListEl.appendChild(card);
  }
}

function resetMaintenanceForm(shouldFillDefaults = false) {
  setMaintenanceMessage("");
  hideMaintenanceVerifyLink();
  if (maintenanceTitleInput) maintenanceTitleInput.value = "";
  if (maintenanceNoteInput) maintenanceNoteInput.value = "";

  if (!shouldFillDefaults) return;
  if (maintenanceStartInput) maintenanceStartInput.value = "";
  if (maintenanceEndInput) maintenanceEndInput.value = "";
  if (!maintenanceStartInput || !maintenanceEndInput) return;

  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const start = Math.ceil((now + 10 * 60 * 1000) / fiveMin) * fiveMin;
  const end = start + 30 * 60 * 1000;
  maintenanceStartInput.value = toDateTimeLocalValue(start);
  maintenanceEndInput.value = toDateTimeLocalValue(end);
}

function syncMaintenancePanel(maintenances) {
  if (maintenanceBoundMonitorId !== activeMonitorId) {
    maintenanceBoundMonitorId = activeMonitorId;
    resetMaintenanceForm(true);
  }
  renderMaintenances(maintenances);
}

function setMaintenanceFormDisabled(disabled) {
  const state = !!disabled;
  for (const el of [maintenanceTitleInput, maintenanceStartInput, maintenanceEndInput, maintenanceNoteInput].filter(Boolean)) {
    el.disabled = state;
  }
  if (maintenanceCreateButton) {
    maintenanceCreateButton.disabled = state;
  }
}

async function createMaintenance() {
  if (!activeMonitorId) return;
  if (!maintenanceForm) return;

  hideMaintenanceVerifyLink();
  const startsAtMs = parseDateTimeLocalInput(maintenanceStartInput?.value);
  const endsAtMs = parseDateTimeLocalInput(maintenanceEndInput?.value);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    setMaintenanceMessage("Bitte Start und Ende setzen.", "error");
    return;
  }
  if (endsAtMs <= startsAtMs) {
    setMaintenanceMessage("Ende muss nach dem Start liegen.", "error");
    return;
  }

  const title = String(maintenanceTitleInput?.value || "").trim();
  const message = String(maintenanceNoteInput?.value || "").trim();

  setMaintenanceMessage("Wartung wird geplant ...");
  setMaintenanceFormDisabled(true);

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/maintenances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, startsAt: startsAtMs, endsAt: endsAtMs }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const errorCode = String(payload?.error || "").toLowerCase();
        if (response.status === 403 && errorCode === "domain not verified") {
          const hostname = String(payload?.hostname || "").trim();
          setMaintenanceMessage(
            `Domain${hostname ? ` (${hostname})` : ""} ist nicht verifiziert. Bitte verifizieren, um Wartungen planen zu können.`,
            "error"
          );
          showMaintenanceVerifyLink(hostname);
        } else if (response.status === 403 && errorCode === "forbidden") {
          setMaintenanceMessage(
            "Request wurde blockiert (Origin/Referer). Bitte die Seite direkt über pingmyserver.de aufrufen und Proxy/CSP prüfen.",
            "error"
          );
       } else if (response.status === 400 && errorCode === "invalid target") {
         setMaintenanceMessage(
           "Monitor-Ziel ist ungültig (z.B. IP/localhost) und kann nicht per Domain-Verifizierung freigeschaltet werden.",
           "error"
         );
       } else if (response.status === 400 && errorCode === "starts in past") {
         setMaintenanceMessage(
           "Startzeit liegt in der Vergangenheit. Bitte eine zukünftige Zeit wählen (oder bei laufender Wartung: Ende in die Zukunft setzen).",
           "error"
         );
      } else if (response.status === 400 && errorCode === "starts too far") {
        setMaintenanceMessage("Startzeit liegt zu weit in der Zukunft. Bitte einen näheren Zeitpunkt wählen.", "error");
      } else if (response.status === 400 && errorCode === "duration too short") {
        setMaintenanceMessage("Wartung ist zu kurz. Mindestdauer sind 5 Minuten.", "error");
      } else if (response.status === 400 && errorCode === "duration too long") {
        setMaintenanceMessage("Wartung ist zu lang. Maximal sind 30 Tage erlaubt.", "error");
      } else if (response.status === 400 && (errorCode === "ends before start" || errorCode === "invalid input")) {
        setMaintenanceMessage("Bitte Eingaben prüfen: Ende muss nach dem Start liegen.", "error");
      } else if (response.status === 400 && (errorCode === "invalid start" || errorCode === "invalid startsat")) {
        setMaintenanceMessage("Start ist ungültig. Bitte Datum/Uhrzeit neu setzen.", "error");
      } else if (response.status === 400 && (errorCode === "invalid end" || errorCode === "invalid endsat")) {
        setMaintenanceMessage("Ende ist ungültig. Bitte Datum/Uhrzeit neu setzen.", "error");
      } else if (response.status === 404 && !payload) {
        setMaintenanceMessage(
          "Endpoint nicht gefunden (HTTP 404). Das Feature ist auf dem Server vermutlich noch nicht deployed oder der Node-Prozess läuft noch mit altem Code.",
          "error"
        );
      } else if (!payload) {
        setMaintenanceMessage(`Wartung konnte nicht geplant werden. (HTTP ${response.status})`, "error");
      } else {
        setMaintenanceMessage(
          `Wartung konnte nicht geplant werden. (${payload?.error || `HTTP ${response.status}`})`,
          "error"
        );
      }
      return;
    }

    setMaintenanceMessage("Wartung geplant.", "success");
    if (maintenanceTitleInput) maintenanceTitleInput.value = "";
    if (maintenanceNoteInput) maintenanceNoteInput.value = "";
    await loadMetrics();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "").trim();
    setMaintenanceMessage(
      `Wartung konnte nicht geplant werden.${detail ? ` (Netzwerkfehler: ${detail})` : ""}`,
      "error"
    );
    console.error("maintenance_create_request_failed", error);
  } finally {
    setMaintenanceFormDisabled(false);
  }
}

async function cancelMaintenance(id) {
  if (!activeMonitorId) return;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  hideMaintenanceVerifyLink();
  setMaintenanceMessage("Wartung wird abgebrochen ...");

  try {
    const response = await fetch(
      `/api/monitors/${encodeURIComponent(activeMonitorId)}/maintenances/${encodeURIComponent(String(numericId))}/cancel`,
      { method: "POST" }
    );

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setMaintenanceMessage("Wartung konnte nicht abgebrochen werden.", "error");
      return;
    }

    setMaintenanceMessage("Wartung abgebrochen.", "success");
    await loadMetrics();
  } catch (error) {
    setMaintenanceMessage("Wartung konnte nicht abgebrochen werden.", "error");
  }
}

const INTERVAL_OPTIONS_MS = [30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
let intervalPickerValue = null;
let intervalPickerSuppressChange = false;

function renderIntervalPicker(selectedMs) {
  if (!intervalSelect) return;

  const selected = Number.isFinite(Number(selectedMs)) ? Math.round(Number(selectedMs)) : null;
  intervalSelect.innerHTML = "";

  const base = INTERVAL_OPTIONS_MS.slice();
  const needsCustom = selected !== null && !base.includes(selected);
  const options = needsCustom ? [selected, ...base] : base;

  options.forEach((ms, index) => {
    const option = document.createElement("option");
    option.value = String(ms);
    option.textContent = needsCustom && index === 0 ? `Custom (${formatInterval(ms)})` : formatInterval(ms);
    intervalSelect.appendChild(option);
  });

  const fallback = base.includes(60000) ? 60000 : base[0];
  intervalPickerSuppressChange = true;
  intervalSelect.value = String(selected !== null ? selected : fallback);
  intervalPickerSuppressChange = false;
}

function syncIntervalPicker(intervalMs) {
  if (!intervalSelect) return;

  const numeric = Number(intervalMs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    if (intervalPickerValue !== null) {
      intervalPickerValue = null;
      renderIntervalPicker(null);
    }
    intervalSelect.disabled = true;
    return;
  }

  const next = Math.round(numeric);
  intervalSelect.disabled = false;
  if (intervalPickerValue === next && intervalSelect.value === String(next)) return;

  intervalPickerValue = next;
  renderIntervalPicker(next);
}

async function updateMonitorInterval(nextIntervalMs) {
  if (!intervalSelect) return;
  if (!activeMonitorId) return;

  const desired = Math.round(Number(nextIntervalMs));
  if (!Number.isFinite(desired) || desired <= 0) return;

  intervalSelect.disabled = true;

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/interval`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervalMs: desired }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      syncIntervalPicker(latestMetrics?.intervalMs);
      return;
    }

    const stored = Number(payload?.data?.intervalMs);
    const intervalMs = Number.isFinite(stored) && stored > 0 ? stored : desired;
    if (latestMetrics) {
      latestMetrics.intervalMs = intervalMs;
      updateStatus(latestMetrics);
    }
    syncIntervalPicker(intervalMs);
  } catch (error) {
    syncIntervalPicker(latestMetrics?.intervalMs);
  } finally {
    if (intervalSelect && activeMonitorId) {
      intervalSelect.disabled = false;
    }
  }
}

function parseMonitorIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/app\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/);
  if (!match) return null;
  return match[1];
}

function readStoredMonitorId() {
  try {
    const value = String(window.localStorage.getItem(ACTIVE_MONITOR_STORAGE_KEY) || "").trim();
    return value || null;
  } catch (error) {
    return null;
  }
}

function writeStoredMonitorId(monitorId) {
  const value = String(monitorId || "").trim();
  if (!value) return;
  try {
    window.localStorage.setItem(ACTIVE_MONITOR_STORAGE_KEY, value);
  } catch (error) {
    // ignore
  }
}

function monitorPath(monitorId) {
  return `/app/monitors/${encodeURIComponent(String(monitorId))}`;
}

function findMonitor(monitorId) {
  const target = String(monitorId || "");
  return monitors.find((monitor) => String(monitor.id) === target) || null;
}

function getMonitorDisplayName(monitor) {
  if (!monitor) return "Monitor";
  return monitor.name || monitor.url || `Monitor ${monitor.id}`;
}

function getMonitorTargetUrl(monitor) {
  if (!monitor) return "";
  return String(monitor.url || "").trim();
}

function setMonitorIcon(monitorId, targetUrl = "") {
  if (!monitorIconEl) return;

  const normalizedId = String(monitorId || "").trim();
  if (!normalizedId) {
    monitorIconKey = "";
    monitorIconEl.src = DEFAULT_MONITOR_ICON;
    return;
  }

  const nextKey = `${normalizedId}|${String(targetUrl || "").trim()}`;
  if (nextKey === monitorIconKey) return;

  monitorIconKey = nextKey;
  monitorIconEl.dataset.fallback = "0";
  monitorIconEl.src = `/api/monitors/${encodeURIComponent(normalizedId)}/favicon`;
}

function setCurrentUserLabel() {
  if (currentUserEmail && user?.email) {
    currentUserEmail.textContent = user.email;
  }
}

function syncOwnerLinks() {
  const isOwner = !!user?.isOwner;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
  }
}

function syncCardHeights() {
  if (!responseCard || !incidentsCard) return;
  if (window.innerWidth <= 980) {
    incidentsCard.style.height = "";
    return;
  }

  incidentsCard.style.height = "auto";
  const targetHeight = Math.round(responseCard.getBoundingClientRect().height);
  if (targetHeight > 0) {
    incidentsCard.style.height = `${targetHeight}px`;
  }
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
    setCurrentUserLabel();
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
  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const list = Array.isArray(payload?.data) ? payload.data : [];

  return list.map((monitor) => ({
    ...monitor,
    id: String(monitor.id),
  }));
}

function renderMonitorPicker() {
  if (!monitorSelect) return;

  monitorSelect.innerHTML = "";
  monitors.forEach((monitor) => {
    const option = document.createElement("option");
    option.value = String(monitor.id);
    option.textContent = getMonitorDisplayName(monitor);
    monitorSelect.appendChild(option);
  });

  if (activeMonitorId !== null) {
    monitorSelect.value = String(activeMonitorId);
  }
}

function monitorStatusLabel(status) {
  return status === "offline" ? "Offline" : "Online";
}

function renderMonitorList() {
  if (!monitorList) return;

  monitorList.innerHTML = "";
  monitors.forEach((monitor) => {
    const row = document.createElement("div");
    row.className = "monitor-nav-row";

    const item = document.createElement("button");
    item.type = "button";
    item.className = "monitor-nav-item";
    if (monitor.id === activeMonitorId) {
      item.classList.add("active");
    }

    const head = document.createElement("span");
    head.className = "monitor-nav-item-head";

    const icon = document.createElement("img");
    icon.className = "monitor-nav-item-icon";
    icon.alt = "";
    icon.decoding = "async";
    icon.loading = "lazy";
    icon.dataset.fallback = "0";
    icon.src = `/api/monitors/${encodeURIComponent(String(monitor.id))}/favicon`;
    icon.addEventListener("error", () => {
      if (icon.dataset.fallback === "1") return;
      icon.dataset.fallback = "1";
      icon.src = DEFAULT_MONITOR_ICON;
    });

    const title = document.createElement("span");
    title.className = "monitor-nav-item-title";
    title.textContent = getMonitorDisplayName(monitor);

    head.appendChild(icon);
    head.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "monitor-nav-item-meta";
    const lastCheckLabel = monitor.last_checked_at
      ? `vor ${formatRelative(Date.now() - monitor.last_checked_at)}`
      : "noch kein Check";
    meta.textContent = `${monitorStatusLabel(monitor.last_status)} · ${lastCheckLabel}`;

    item.appendChild(head);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      setActiveMonitor(monitor.id, { pushHistory: true }).catch(() => {
        // ignore
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "monitor-nav-delete";
    deleteButton.textContent = "L\u00f6schen";
    deleteButton.title = "L\u00f6scht den Monitor inklusive aller Daten";
    deleteButton.setAttribute("aria-label", `Monitor ${getMonitorDisplayName(monitor)} l\u00f6schen`);
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMonitor(monitor).catch(() => {
        // ignore
      });
    });

    row.appendChild(item);
    row.appendChild(deleteButton);
    monitorList.appendChild(row);
  });
}

function renderMonitorControls() {
  renderMonitorPicker();
  renderMonitorList();
  syncPublicStatusLinks();
}

async function deleteMonitor(monitor) {
  const monitorId = String(monitor?.id || "").trim();
  if (!monitorId) return;

  const monitorName = getMonitorDisplayName(monitor);
  const confirmed = window.confirm(
    `Monitor "${monitorName}" wirklich l\u00f6schen?\n\nDabei werden alle Daten dieses Monitors dauerhaft entfernt:\n- Checks\n- Uptime-Historie\n- Vorf\u00e4lle\n- Tagesstatistiken\n\nDieser Vorgang kann nicht r\u00fcckg\u00e4ngig gemacht werden.`
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(monitorId)}`, {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok && response.status !== 404) {
      window.alert("Monitor konnte nicht gel\u00f6scht werden. Bitte sp\u00e4ter erneut versuchen.");
      return;
    }

    await refreshMonitors();
    if (!monitors.length) return;
    await loadMetrics();
  } catch (error) {
    window.alert("Monitor konnte nicht gel\u00f6scht werden. Bitte sp\u00e4ter erneut versuchen.");
  }
}

function getPublicStatusPath() {
  if (!activeMonitorId) return "/status";
  return `/status/${encodeURIComponent(String(activeMonitorId))}`;
}

function syncPublicStatusLinks() {
  const statusPath = getPublicStatusPath();
  publicStatusLinks.forEach((link) => {
    link.setAttribute("href", statusPath);
  });
}

function updateMonitorCacheFromMetrics(data) {
  const monitor = findMonitor(activeMonitorId);
  if (!monitor || !data) return;

  monitor.name = data.name || monitor.name;
  monitor.url = data.target || monitor.url;
  monitor.last_status = data.status || monitor.last_status;
  monitor.last_checked_at = Number.isFinite(data.lastCheckAt) ? data.lastCheckAt : monitor.last_checked_at;
}

function navigateToMonitor(monitorId, replace = false) {
  const nextPath = monitorPath(monitorId);
  if (window.location.pathname === nextPath) return;
  if (replace) {
    window.history.replaceState({}, "", nextPath);
  } else {
    window.history.pushState({}, "", nextPath);
  }
}

async function setActiveMonitor(monitorId, options = {}) {
  const { pushHistory = false, replaceHistory = false } = options;
  const monitor = findMonitor(monitorId);
  if (!monitor) return;

  activeMonitorId = String(monitor.id);
  assertionsDirty = false;
  assertionsBoundMonitorId = null;
  setAssertionsMessage("");
  intervalPickerValue = null;
  if (intervalSelect) {
    intervalSelect.disabled = true;
  }
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(monitor));
  writeStoredMonitorId(activeMonitorId);
  renderMonitorControls();

  if (pushHistory) {
    navigateToMonitor(activeMonitorId, replaceHistory);
  }

  await loadMetrics();
}

async function refreshMonitors() {
  const previousActiveId = activeMonitorId;
  monitors = await fetchMonitors();

  if (!monitors.length) {
    window.location.href = "/onboarding";
    return;
  }

  const stillExists = findMonitor(previousActiveId);
  if (!stillExists) {
    const storedMonitorId = readStoredMonitorId();
    const preferred = storedMonitorId ? findMonitor(storedMonitorId) : null;
    activeMonitorId = preferred ? preferred.id : monitors[0].id;
    writeStoredMonitorId(activeMonitorId);
    navigateToMonitor(activeMonitorId, true);
  }

  const activeMonitor = findMonitor(activeMonitorId);
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(activeMonitor));
  renderMonitorControls();
}

async function bootstrapMonitor() {
  monitors = await fetchMonitors();

  if (!monitors.length) {
    window.location.href = "/onboarding";
    return false;
  }

  const requestedMonitorId = parseMonitorIdFromPath();
  const storedMonitorId = readStoredMonitorId();
  if (requestedMonitorId && findMonitor(requestedMonitorId)) {
    activeMonitorId = requestedMonitorId;
  } else if (storedMonitorId && findMonitor(storedMonitorId)) {
    activeMonitorId = storedMonitorId;
    navigateToMonitor(activeMonitorId, true);
  } else {
    activeMonitorId = monitors[0].id;
    navigateToMonitor(activeMonitorId, true);
  }

  writeStoredMonitorId(activeMonitorId);
  const activeMonitor = findMonitor(activeMonitorId);
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(activeMonitor));
  renderMonitorControls();
  return true;
}

async function loadMetrics() {
  if (!activeMonitorId) return;

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/metrics`, {
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 404) {
      await refreshMonitors();
      return;
    }

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload?.ok || !payload.data) {
      return;
    }

    const data = payload.data;
    latestMetrics = data;

    if (data.statusSince) statusSince = data.statusSince;
    if (data.lastCheckAt) lastCheckTime = data.lastCheckAt;

    updateMonitorCacheFromMetrics(data);
    renderMonitorControls();

    updateMonitorInfo(data);
    updateStatus(data);
    updateStats(data.stats);
    updateUptimeBars(data.last24h);
    renderChart(chart, (data.series || []).map((point) => point.ms));
    renderHeatmap(data.heatmap);
    updateRangeSummaries(data.ranges);
    updateMap(data.location, data.network);
    updateDomainSslCard(data.domainSsl);
    updateIncidents(data.incidents);
    syncIntervalPicker(data.intervalMs);
    syncAssertionsPanel(data.assertions);
    syncMaintenancePanel(data.maintenances);
  } catch (error) {
    // ignore
  }
}

function updateMonitorInfo(data) {
  if (!data) return;
  if (monitorNameEl && data.name) {
    monitorNameEl.textContent = data.name;
  }
  if (monitorTargetEl && data.target) {
    monitorTargetEl.textContent = `HTTPS Monitor für ${data.target}`;
  }
  if (activeMonitorId) {
    setMonitorIcon(activeMonitorId, data.target || "");
  }
}

function updateStatus(data) {
  if (!data) return;
  if (statusState) {
    const online = data.status === "online";
    statusState.textContent = online ? "Online" : "Offline";
    statusState.classList.toggle("offline", !online);
  }
  if (statusDuration) {
    const prefix = data.status === "online" ? "Aktiv seit" : "Offline seit";
    const since = data.statusSince || statusSince;
    statusDuration.textContent = `${prefix} ${formatDuration(Date.now() - since)}`;
  }
  if (lastCheck) {
    const stamp = data.lastCheckAt || lastCheckTime;
    lastCheck.textContent = stamp
      ? `vor ${formatRelative(Date.now() - stamp)}`
      : "warte auf ersten Check";
  }
  if (checkInterval) {
    checkInterval.textContent = data.intervalMs
      ? `Prüfintervall: ${formatInterval(data.intervalMs)}`
      : "";
  }
}

function updateStats(stats) {
  if (!stats) return;
  if (statAvg) statAvg.textContent = formatMs(stats.avg);
  if (statMin) statMin.textContent = formatMs(stats.min);
  if (statMax) statMax.textContent = formatMs(stats.max);
}

function updateUptimeBars(last24h) {
  if (!barsContainer || !last24h?.bars) return;
  barsContainer.innerHTML = "";
  last24h.bars.forEach((bar) => {
    const el = document.createElement("span");
    if (bar.status) {
      el.classList.add(bar.status);
    }
    if (Number.isFinite(bar.uptime)) {
      el.title = `Uptime: ${bar.uptime.toFixed(2)}%`;
    }
    barsContainer.appendChild(el);
  });

  if (uptimeIncidents) {
    const incidents = Number.isFinite(last24h.incidents) ? last24h.incidents : 0;
    const downMinutes = Number.isFinite(last24h.downMinutes) ? last24h.downMinutes : 0;
    uptimeIncidents.textContent = `${incidents} Vorfälle, ${downMinutes} Min. Ausfall`;
  }
  if (uptimePercent) {
    uptimePercent.textContent = Number.isFinite(last24h.uptime)
      ? `${last24h.uptime.toFixed(2)}%`
      : "--%";
  }
}

function updateRangeSummaries(ranges) {
  if (!ranges) return;
  updateRangeCell(ranges.range7, range7Uptime, range7Meta);
  updateRangeCell(ranges.range30, range30Uptime, range30Meta);
  updateRangeCell(ranges.range365, range365Uptime, range365Meta);

  if (rangePickerLabel && ranges.range30?.days) {
    rangePickerLabel.textContent = `Letzte ${ranges.range30.days} Tage`;
  }
}

function updateRangeCell(summary, uptimeEl, metaEl) {
  if (!uptimeEl || !metaEl) return;
  if (!summary || !Number.isFinite(summary.uptime)) {
    uptimeEl.textContent = "--.--%";
    metaEl.textContent = "Keine Daten";
    return;
  }
  uptimeEl.textContent = `${summary.uptime.toFixed(2)}%`;
  const incidents = Number.isFinite(summary.incidents) ? summary.incidents : 0;
  const downMinutes = Number.isFinite(summary.downMinutes) ? summary.downMinutes : 0;
  metaEl.textContent = `${incidents} Vorfälle, ${downMinutes} Min. Ausfall`;
}

function renderChart(svg, series) {
  if (!svg) return;

  if (!series.length) {
    svg.innerHTML = "";
    return;
  }

  const width = 960;
  const height = 240;
  const padding = 32;
  const minVal = Math.min(...series);
  const maxVal = Math.max(...series);
  const paddingVal = Math.max(30, (maxVal - minVal) * 0.2);
  const min = Math.max(0, minVal - paddingVal);
  const max = maxVal + paddingVal;

  const points = series.map((value, i) => {
    const x = padding + (i / (series.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / (max - min)) * (height - padding * 2);
    return [x, y];
  });

  const path = smoothPath(points);
  const ticks = 4;
  const grid = [];
  for (let i = 0; i < ticks; i += 1) {
    const t = i / (ticks - 1);
    const value = max - (max - min) * t;
    const y = padding + (height - padding * 2) * t;
    grid.push(`<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.07)" />`);
    grid.push(`<text x="6" y="${y + 4}" fill="rgba(255,255,255,0.45)" font-size="11">${Math.round(value)} ms</text>`);
  }

  const lastPoint = points[points.length - 1];

  svg.innerHTML = `
    <defs>
      <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4cc9f0" />
        <stop offset="100%" stop-color="#b9f27c" />
      </linearGradient>
    </defs>
    ${grid.join("\n")}
    <path
      d="${path}"
      fill="none"
      stroke="url(#lineGradient)"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4.5" fill="#b9f27c" />
  `;
}

function smoothPath(points) {
  if (points.length < 2) {
    return "";
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function renderHeatmap(heatmap) {
  if (!heatmapMonths || !heatmapCells || !heatmap) return;

  const year = heatmap.year || new Date().getFullYear();
  const dayMap = new Map((heatmap.days || []).map((day) => [day.date, day]));

  const start = new Date(year, 0, 1);
  const startOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - startOffset);

  const end = new Date(year, 11, 31);
  const endOffset = 6 - ((end.getDay() + 6) % 7);
  end.setDate(end.getDate() + endOffset);

  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const weekCount = Math.ceil(days.length / 7);
  heatmapMonths.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;
  heatmapCells.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;

  heatmapMonths.innerHTML = "";
  heatmapCells.innerHTML = "";

  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  monthNames.forEach((name, month) => {
    const firstDay = new Date(year, month, 1);
    const index = Math.floor((firstDay - start) / 86400000);
    const weekIndex = Math.floor(index / 7) + 1;
    const label = document.createElement("span");
    label.textContent = name;
    label.style.gridColumn = `${weekIndex}`;
    heatmapMonths.appendChild(label);
  });

  const formatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  days.forEach((day, index) => {
    const cell = document.createElement("span");
    const key = formatDateKey(day);
    const data = dayMap.get(key);
    const status = data?.status || "empty";
    const weekday = (day.getDay() + 6) % 7;
    const weekIndex = Math.floor(index / 7) + 1;

    cell.className = `heatmap-cell ${status}`;
    cell.style.gridColumn = `${weekIndex}`;
    cell.style.gridRow = `${weekday + 1}`;

    if (data && data.uptime !== null && data.uptime !== undefined) {
      const dateLabel = formatter.format(day);
      const statusLabel =
        status === "ok" ? "Keine Fehler" : status === "warn" ? "Kleine Fehler" : "Ausfall";
      cell.dataset.uptime = `Uptime: ${Number(data.uptime).toFixed(2)}%`;
      cell.title = `${dateLabel}: ${statusLabel}`;
    }

    heatmapCells.appendChild(cell);
  });
}

function updateMap(location, network) {
  if (!mapEl || !mapLocation || !mapCoords) return;
  if (!location) {
    mapLocation.textContent = "Standort nicht verfügbar";
    mapCoords.textContent = "";
    return;
  }

  const scopeLabel =
    network?.scope === "edge"
      ? `Edge-Standort${network?.provider ? ` (${network.provider})` : ""}`
      : network?.scope === "origin"
      ? "Server-Standort"
      : "Standort";

  const hasCoords = Number.isFinite(location.lat) && Number.isFinite(location.lon);
  if (!hasCoords) {
    mapLocation.textContent = `${scopeLabel}: Geodaten nicht verfügbar`;
    mapCoords.textContent = [location.host, location.ip ? `IP: ${location.ip}` : ""]
      .filter(Boolean)
      .join(" · ");
    return;
  }

  const x = ((location.lon + 180) / 360) * 100;
  const y = ((90 - location.lat) / 180) * 100;

  mapEl.style.setProperty("--marker-x", `${x}%`);
  mapEl.style.setProperty("--marker-y", `${y}%`);

  const place = [location.city, location.region, location.country].filter(Boolean).join(", ");
  mapLocation.textContent = place ? `${scopeLabel}: ${place}` : `${scopeLabel}: ${location.host || "IP-Standort"}`;
  mapCoords.textContent = [
    `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`,
    location.ip || "",
    location.org ? `ASN/Org: ${location.org}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function updateDomainSslCard(domainSsl) {
  if (!domainExpiry || !sslExpiry || !domainSource || !sslIssuer) return;
  if (!domainSsl) {
    domainExpiry.textContent = "Nicht verfügbar";
    domainSource.textContent = "";
    sslExpiry.textContent = "Nicht verfügbar";
    sslIssuer.textContent = "";
    return;
  }

  if (Number.isFinite(domainSsl.domainExpiresAt)) {
    domainExpiry.textContent = formatDateWithRemaining(domainSsl.domainExpiresAt);
    domainSource.textContent = domainSsl.domainSource ? "Quelle: RDAP" : "";
  } else if (domainSsl.domainNote === "ip_target" || (domainSsl.host && isIpAddress(domainSsl.host))) {
    domainExpiry.textContent = "IP-Monitor (keine Domain)";
    domainSource.textContent = "";
  } else if (domainSsl.domainNote === "public_unavailable") {
    domainExpiry.textContent = "Öffentlich nicht verfügbar";
    domainSource.textContent = "Registry veröffentlicht kein Ablaufdatum";
  } else {
    domainExpiry.textContent = "Nicht verfügbar";
    domainSource.textContent = "";
  }

  if (!domainSsl.sslAvailable) {
    sslExpiry.textContent = "Kein HTTPS-Ziel";
    sslIssuer.textContent = "";
    return;
  }

  if (Number.isFinite(domainSsl.sslExpiresAt)) {
    sslExpiry.textContent = formatDateWithRemaining(domainSsl.sslExpiresAt);
    sslIssuer.textContent = domainSsl.sslIssuer ? `Aussteller: ${domainSsl.sslIssuer}` : "";
    return;
  }

  sslExpiry.textContent = "Nicht verfügbar";
  sslIssuer.textContent = "";
}

function updateIncidents(incidents) {
  if (!incidentsList) return;
  const items = Array.isArray(incidents?.items) ? incidents.items.slice(0, 2) : [];

  if (!items.length) {
    incidentsList.innerHTML = `
      <div class="incidents-inner">
        <div class="incidents-title">👍 Gute Arbeit, keine Vorfälle.</div>
        <div class="muted">Bisher gab es keine Vorfälle. Weiter so!</div>
      </div>
    `;
    syncCardHeights();
    return;
  }

  incidentsList.innerHTML = "";
  const list = document.createElement("div");
  list.className = "incidents-list";

  items.forEach((incident) => {
    const item = document.createElement("div");
    item.className = "incident-item";

    if (incident.aggregated) {
      const dateLabel = formatIncidentDay(incident.dateKey || incident.startTs);
      const duration = formatDuration(incident.durationMs || 0);
      const codeLabel = formatErrorCodeSummary(incident.errorCodes);
      const sampleCount = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

      item.innerHTML = `
        <div class="incident-title-row">
          <span>Tagesvorfall</span>
          <span class="incident-badge">aggregiert</span>
        </div>
        <div class="incident-meta">
          <span>${escapeHtml(dateLabel)}</span>
          <span>⏱ ${escapeHtml(duration)}</span>
          <span class="incident-code">${escapeHtml(codeLabel)}</span>
        </div>
        <div class="incident-note">Fehlchecks: ${sampleCount}</div>
      `;
    } else {
      const range = formatIncidentRange(incident.startTs, incident.endTs, incident.ongoing);
      const duration = formatDuration(incident.durationMs || 0);
      const codes = (incident.statusCodes || []).filter((code) => Number.isFinite(code));
      const codeLabel = codes.length
        ? `Fehlercode${codes.length > 1 ? "s" : ""}: ${codes.join(", ")}`
        : "Fehlercode: keine Antwort";
      const sampleCount = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

      item.innerHTML = `
        <div class="incident-title-row">
          <span>Ausfall</span>
          <span class="incident-badge">${incident.ongoing ? "laufend" : "beendet"}</span>
        </div>
        <div class="incident-meta">
          <span>${escapeHtml(range)}</span>
          <span>⏱ ${escapeHtml(duration)}</span>
          <span class="incident-code">${escapeHtml(codeLabel)}</span>
        </div>
        <div class="incident-note">Checks: ${sampleCount}</div>
      `;
    }

    list.appendChild(item);
  });

  incidentsList.appendChild(list);

  if (Number.isFinite(incidents.lookbackDays)) {
    const note = document.createElement("div");
    note.className = "incident-note incident-footnote";
    note.textContent = `Zeigt die letzten 2 Vorfälle (Fenster: ${incidents.lookbackDays} Tage).`;
    incidentsList.appendChild(note);
  }

  syncCardHeights();
}

function formatInterval(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} Sek.`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} Min.`;
  return `${Math.round(ms / 3600000)} Std.`;
}

function formatIncidentRange(startTs, endTs, ongoing) {
  const start = new Date(startTs);
  const end = endTs ? new Date(endTs) : null;
  const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
  const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  if (!end) {
    return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${ongoing ? "läuft noch" : "offen"}`;
  }

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${dateFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }

  return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${dateFmt.format(end)} ${timeFmt.format(end)}`;
}

function formatIncidentDay(value) {
  if (!value) return "Tag unbekannt";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tag unbekannt";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatErrorCodeSummary(errorCodes) {
  const items = Array.isArray(errorCodes) ? errorCodes : [];
  if (!items.length) return "Fehlercode: keine Antwort";
  const parts = items
    .slice(0, 5)
    .map((item) => {
      const code = String(item.code || "NO_RESPONSE");
      const hits = Number(item.hits || 0);
      const label = code === "NO_RESPONSE" ? "keine Antwort" : code;
      return hits > 0 ? `${label} (${hits}x)` : label;
    });
  return `Fehlercodes: ${parts.join(", ")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelative(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0 Sek.";
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} Sek.`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} Min.`;
  return `${Math.round(ms / 3600000)} Std.`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours} Std. ${minutes} Min.`;
  }
  if (minutes > 0) {
    return `${minutes} Min. ${seconds} Sek.`;
  }
  return `${seconds} Sek.`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "-- ms";
  return `${Math.round(value)} ms`;
}

function formatDateWithRemaining(timestamp) {
  const date = new Date(timestamp);
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const days = Math.ceil((timestamp - Date.now()) / 86400000);
  if (days >= 0) {
    return `${dateLabel} (in ${days} Tagen)`;
  }
  return `${dateLabel} (vor ${Math.abs(days)} Tagen)`;
}

function isIpAddress(value) {
  if (!value) return false;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

async function handlePopState() {
  const monitorId = parseMonitorIdFromPath();
  if (!monitorId) return;
  if (!findMonitor(monitorId)) return;
  if (monitorId === activeMonitorId) return;

  await setActiveMonitor(monitorId, { pushHistory: false });
}

async function init() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;

  if (assertionsEnabledInput) {
    assertionsEnabledInput.addEventListener("change", () => {
      markAssertionsDirty();
      applyAssertionsEnabledState();
    });
  }

  if (assertionsFollowRedirectsInput) {
    assertionsFollowRedirectsInput.addEventListener("change", () => {
      markAssertionsDirty();
      applyAssertionsEnabledState();
    });
  }

  for (const el of [
    assertionsStatusCodesInput,
    assertionsMaxRedirectsInput,
    assertionsContentTypeInput,
    assertionsBodyInput,
    assertionsTimeoutInput,
  ].filter(Boolean)) {
    el.addEventListener("input", () => {
      markAssertionsDirty();
    });
  }

  if (assertionsForm) {
    assertionsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeMonitorId) return;

      setAssertionsMessage("Speichern ...");
      try {
        const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/assertions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(readAssertionsPayload()),
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          setAssertionsMessage("Speichern fehlgeschlagen.", "error");
          return;
        }

        assertionsDirty = false;
        setAssertionsMessage("Gespeichert.", "success");
        syncAssertionsPanel(payload.data, { force: true });
      } catch (error) {
        setAssertionsMessage("Speichern fehlgeschlagen.", "error");
      }
    });
  }

  for (const el of [maintenanceTitleInput, maintenanceStartInput, maintenanceEndInput, maintenanceNoteInput].filter(Boolean)) {
    el.addEventListener("input", () => {
      setMaintenanceMessage("");
      hideMaintenanceVerifyLink();
    });
  }

  if (maintenanceForm) {
    maintenanceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await createMaintenance();
    });
  }

  if (maintenanceListEl) {
    maintenanceListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("button[data-maintenance-cancel-id]");
      if (!button) return;
      const id = button.getAttribute("data-maintenance-cancel-id") || "";
      cancelMaintenance(id).catch(() => {
        // ignore
      });
    });
  }

  applyAssertionsEnabledState();

  if (monitorIconEl) {
    monitorIconEl.addEventListener("error", () => {
      if (monitorIconEl.dataset.fallback === "1") return;
      monitorIconEl.dataset.fallback = "1";
      monitorIconEl.src = DEFAULT_MONITOR_ICON;
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }
  if (publicStatusButton) {
    publicStatusButton.addEventListener("click", () => {
      window.location.href = getPublicStatusPath();
    });
  }
  if (newMonitorButton) {
    newMonitorButton.addEventListener("click", () => {
      window.location.href = "/onboarding?new=1";
    });
  }
  if (monitorSelect) {
    monitorSelect.addEventListener("change", () => {
      const selected = String(monitorSelect.value || "").trim();
      if (!selected) return;
      setActiveMonitor(selected, { pushHistory: true }).catch(() => {
        // ignore
      });
    });
  }
  if (intervalSelect) {
    renderIntervalPicker(60000);
    intervalSelect.disabled = true;
    intervalSelect.addEventListener("change", () => {
      if (intervalPickerSuppressChange) return;
      const selected = Number(intervalSelect.value);
      if (!Number.isFinite(selected)) return;
      updateMonitorInterval(selected).catch(() => {
        // ignore
      });
    });
  }

  const hasMonitor = await bootstrapMonitor();
  if (!hasMonitor) return;

  await loadMetrics();
  syncCardHeights();

  setInterval(loadMetrics, pollIntervalMs);
  setInterval(refreshMonitors, monitorsRefreshIntervalMs);
  setInterval(() => {
    if (latestMetrics) {
      updateStatus(latestMetrics);
    }
  }, 1000);

  window.addEventListener("popstate", () => {
    handlePopState().catch(() => {
      // ignore
    });
  });

  window.addEventListener("resize", () => {
    syncCardHeights();
  });
}

init();
