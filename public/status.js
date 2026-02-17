const pollIntervalMs = 30000;

const statusName = document.getElementById("status-name");
const statusTarget = document.getElementById("status-target");
const statusPill = document.getElementById("status-pill");
const statusLabel = document.getElementById("status-label");
const statusState = document.getElementById("status-state");
const statusDuration = document.getElementById("status-duration");
const lastCheck = document.getElementById("last-check");
const checkInterval = document.getElementById("check-interval");
const uptimeBars = document.getElementById("uptime-bars");
const uptimeIncidents = document.getElementById("uptime-incidents");
const uptimePercent = document.getElementById("uptime-percent");
const incidentsList = document.getElementById("incidents-list");
const updatedAt = document.getElementById("updated-at");

const range7Uptime = document.getElementById("range-7-uptime");
const range7Meta = document.getElementById("range-7-meta");
const range30Uptime = document.getElementById("range-30-uptime");
const range30Meta = document.getElementById("range-30-meta");
const range365Uptime = document.getElementById("range-365-uptime");
const range365Meta = document.getElementById("range-365-meta");
const rangePickerLabel = document.getElementById("range-picker-label");

let statusSince = Date.now();
let lastCheckTime = null;
let latestMetrics = null;

function parseMonitorIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/status\/([A-Za-z0-9]{6,64})\/?$/);
  if (!match) return "";
  return String(match[1] || "").trim();
}

function getStatusDataUrl() {
  const monitorFromPath = parseMonitorIdFromPath();
  const monitorFromQuery = String(new URLSearchParams(window.location.search).get("monitor") || "").trim();
  const monitorId = monitorFromPath || monitorFromQuery;
  if (!monitorId) return "/status/data";
  return `/status/data?monitor=${encodeURIComponent(monitorId)}`;
}

function renderUnavailableState() {
  if (statusName) statusName.textContent = "Statusseite";
  if (statusTarget) statusTarget.textContent = "Kein Monitor ausgewaehlt";
  if (statusPill) statusPill.classList.add("offline");
  if (statusLabel) statusLabel.textContent = "Kein Monitor verfuegbar";
  if (statusState) {
    statusState.textContent = "Nicht verfuegbar";
    statusState.classList.add("offline");
  }
  if (statusDuration) statusDuration.textContent = "Bitte oeffne die Statusseite ueber dein Dashboard.";
  if (lastCheck) lastCheck.textContent = "-";
  if (checkInterval) checkInterval.textContent = "";
  if (uptimeBars) uptimeBars.innerHTML = "";
  if (uptimeIncidents) uptimeIncidents.textContent = "Keine Daten";
  if (uptimePercent) uptimePercent.textContent = "--%";
}

async function loadMetrics() {
  try {
    const response = await fetch(getStatusDataUrl(), { cache: "no-store" });
    if (response.status === 404) {
      renderUnavailableState();
      return;
    }
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload?.ok || !payload.data) return;
    const data = payload.data;
    latestMetrics = data;

    if (data.statusSince) statusSince = data.statusSince;
    if (data.lastCheckAt) lastCheckTime = data.lastCheckAt;

    updateHeader(data);
    updateStatus(data);
    updateUptimeBars(data.last24h);
    updateRangeSummaries(data.ranges);
    updateIncidents(data.incidents);
    updateUpdatedAt();
  } catch (error) {
    // ignore
  }
}

function updateHeader(data) {
  if (statusName && data?.name) statusName.textContent = data.name;
  if (statusTarget && data?.target) statusTarget.textContent = data.target;
}

function updateStatus(data) {
  if (!data) return;
  const online = data.status === "online";

  if (statusPill) {
    statusPill.classList.toggle("offline", !online);
  }
  if (statusLabel) {
    statusLabel.textContent = online ? "Alle Systeme funktionsfähig" : "Störung erkannt";
  }
  if (statusState) {
    statusState.textContent = online ? "Online" : "Offline";
    statusState.classList.toggle("offline", !online);
  }
  if (statusDuration) {
    const prefix = online ? "Aktiv seit" : "Offline seit";
    const since = data.statusSince || statusSince;
    statusDuration.textContent = `${prefix} ${formatDuration(Date.now() - since)}`;
  }
  if (lastCheck) {
    const stamp = data.lastCheckAt || lastCheckTime;
    lastCheck.textContent = stamp ? `vor ${formatRelative(Date.now() - stamp)}` : "warte auf ersten Check";
  }
  if (checkInterval) {
    checkInterval.textContent = data.intervalMs
      ? `Prüfintervall: ${formatInterval(data.intervalMs)}`
      : "";
  }
}

function updateUptimeBars(last24h) {
  if (!uptimeBars || !last24h?.bars) return;
  uptimeBars.innerHTML = "";

  last24h.bars.forEach((bar) => {
    const el = document.createElement("span");
    if (bar.status) el.classList.add(bar.status);
    uptimeBars.appendChild(el);
  });

  if (uptimeIncidents) {
    const incidents = Number.isFinite(last24h.incidents) ? last24h.incidents : 0;
    const downMinutes = Number.isFinite(last24h.downMinutes) ? last24h.downMinutes : 0;
    uptimeIncidents.textContent = `${incidents} Vorfälle, ${downMinutes} Min. Ausfall`;
  }
  if (uptimePercent) {
    uptimePercent.textContent = Number.isFinite(last24h.uptime) ? `${last24h.uptime.toFixed(2)}%` : "--%";
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

function updateIncidents(incidents) {
  if (!incidentsList) return;
  const items = incidents?.items || [];

  if (!items.length) {
    incidentsList.innerHTML = `
      <div class="incidents-inner">
        <div class="incidents-title">👍 Gute Arbeit, keine Vorfälle.</div>
        <div class="muted">Bisher gab es keine Vorfälle. Weiter so!</div>
      </div>
    `;
    return;
  }

  incidentsList.innerHTML = "";
  const list = document.createElement("div");
  list.className = "incidents-list";

  items.forEach((incident) => {
    const item = document.createElement("div");
    item.className = "incident-item";

    const range = formatIncidentRange(incident.startTs, incident.endTs, incident.ongoing);
    const duration = formatDuration(incident.durationMs || 0);
    const codes = (incident.statusCodes || []).filter((code) => Number.isFinite(code));
    const codeLabel = codes.length
      ? `Fehlercode${codes.length > 1 ? "s" : ""}: ${codes.join(", ")}`
      : "Fehlercode: keine Antwort";
    const checks = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

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
      <div class="incident-note">Checks: ${checks}</div>
    `;

    list.appendChild(item);
  });

  incidentsList.appendChild(list);

  if (Number.isFinite(incidents.lookbackDays)) {
    const note = document.createElement("div");
    note.className = "incident-note incident-footnote";
    note.textContent = `Zeigt Vorfälle der letzten ${incidents.lookbackDays} Tage.`;
    incidentsList.appendChild(note);
  }
}

function updateUpdatedAt() {
  if (!updatedAt) return;
  updatedAt.textContent = `Zuletzt aktualisiert: ${new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date())}`;
}

function formatInterval(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} Sek.`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} Min.`;
  return `${Math.round(ms / 3600000)} Std.`;
}

function formatRelative(ms) {
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadMetrics();
setInterval(loadMetrics, pollIntervalMs);
setInterval(() => {
  if (latestMetrics) {
    updateStatus(latestMetrics);
  }
}, 1000);
