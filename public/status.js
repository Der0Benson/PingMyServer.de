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

const maintenanceBanner = document.getElementById("maintenance-banner");
const maintenanceBannerTitle = document.getElementById("maintenance-banner-title");
const maintenanceBadge = document.getElementById("maintenance-badge");
const maintenanceBannerMeta = document.getElementById("maintenance-banner-meta");
const maintenanceBannerNote = document.getElementById("maintenance-banner-note");

const range7Uptime = document.getElementById("range-7-uptime");
const range7Meta = document.getElementById("range-7-meta");
const range30Uptime = document.getElementById("range-30-uptime");
const range30Meta = document.getElementById("range-30-meta");
const range365Uptime = document.getElementById("range-365-uptime");
const range365Meta = document.getElementById("range-365-meta");
const rangePickerLabel = document.getElementById("range-picker-label");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLang = () => (I18N && typeof I18N.getLang === "function" ? I18N.getLang() : "de");
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
const rtf = () =>
  I18N && typeof I18N.rtf === "function"
    ? I18N.rtf()
    : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });

let statusSince = Date.now();
let lastCheckTime = null;
let latestMetrics = null;

function parseMonitorIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/status\/([A-Za-z0-9]{6,64}|\d+)\/?$/);
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
  if (statusName) statusName.textContent = t("status.brand.title", null, "Status page");
  if (statusTarget) statusTarget.textContent = t("status.unavailable.target", null, "No monitor selected");
  if (statusPill) statusPill.classList.add("offline");
  if (statusLabel) statusLabel.textContent = t("status.unavailable.label", null, "No monitor available");
  if (statusState) {
    statusState.textContent = t("status.unavailable.state", null, "Unavailable");
    statusState.classList.add("offline");
  }
  if (statusDuration) {
    statusDuration.textContent = t(
      "status.unavailable.hint",
      null,
      "Please open the status page from your dashboard."
    );
  }
  if (lastCheck) lastCheck.textContent = "-";
  if (checkInterval) checkInterval.textContent = "";
  if (uptimeBars) uptimeBars.innerHTML = "";
  if (uptimeIncidents) uptimeIncidents.textContent = t("common.no_data", null, "No data");
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
    updateMaintenance(data.maintenances);
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
  const maintenanceActive = data?.maintenances?.active;
  const maintenance = maintenanceActive && typeof maintenanceActive === "object" ? maintenanceActive : null;
  const online = data.status === "online";

  if (statusPill) {
    statusPill.classList.toggle("offline", !maintenance && !online);
    statusPill.classList.toggle("maintenance", !!maintenance);
  }
  if (statusLabel) {
    statusLabel.textContent = maintenance
      ? t("status.state.maintenance_running", null, "Maintenance ongoing")
      : online
        ? t("status.state.operational", null, "All systems operational")
        : t("status.state.outage_detected", null, "Outage detected");
  }
  if (statusState) {
    statusState.textContent = maintenance
      ? t("status.maintenance.title", null, "Maintenance")
      : online
        ? t("app.state.online", null, "Online")
        : t("app.state.offline", null, "Offline");
    statusState.classList.toggle("offline", !maintenance && !online);
    statusState.classList.toggle("maintenance", !!maintenance);
  }
  if (statusDuration) {
    if (maintenance && Number.isFinite(maintenance.endsAt)) {
      const endsInMs = Math.max(0, Number(maintenance.endsAt) - Date.now());
      statusDuration.textContent = t(
        "status.duration.maintenance_until",
        { until: formatDateTime(maintenance.endsAt), remaining: formatRelative(endsInMs) },
        `Maintenance until ${formatDateTime(maintenance.endsAt)} (ends in ${formatRelative(endsInMs)})`
      );
    } else {
      const since = data.statusSince || statusSince;
      const duration = formatDuration(Date.now() - since);
      statusDuration.textContent = online
        ? t("status.duration.online_for", { duration }, `Online for ${duration}`)
        : t("status.duration.offline_for", { duration }, `Offline for ${duration}`);
    }
  }
  if (lastCheck) {
    const stamp = data.lastCheckAt || lastCheckTime;
    lastCheck.textContent = stamp
      ? formatTimeAgo(Date.now() - stamp)
      : t("status.waiting_first_check", null, "Waiting for first check");
  }
  if (checkInterval) {
    checkInterval.textContent = data.intervalMs
      ? t(
          "status.check_interval",
          { interval: formatInterval(data.intervalMs) },
          `Check interval: ${formatInterval(data.intervalMs)}`
        )
      : "";
  }
}

function updateMaintenance(maintenances) {
  if (!maintenanceBanner) return;

  const active = maintenances?.active && typeof maintenances.active === "object" ? maintenances.active : null;
  const upcomingList = Array.isArray(maintenances?.upcoming) ? maintenances.upcoming : [];
  const upcoming = upcomingList.length && typeof upcomingList[0] === "object" ? upcomingList[0] : null;

  const entry = active || upcoming;
  if (!entry) {
    maintenanceBanner.hidden = true;
    return;
  }

  const isActive = !!active;
  if (maintenanceBannerTitle) {
    maintenanceBannerTitle.textContent = String(entry.title || t("status.maintenance.title", null, "Maintenance"));
  }
  if (maintenanceBadge) {
    maintenanceBadge.textContent = isActive
      ? t("status.maintenance.active", null, "Active")
      : t("status.maintenance.planned", null, "Planned");
    maintenanceBadge.classList.toggle("active", isActive);
  }

  const startsAt = Number(entry.startsAt);
  const endsAt = Number(entry.endsAt);
  const startLabel = Number.isFinite(startsAt) ? formatDateTime(startsAt) : "-";
  const endLabel = Number.isFinite(endsAt) ? formatDateTime(endsAt) : "-";

  if (maintenanceBannerMeta) {
    if (isActive && Number.isFinite(endsAt)) {
      const endsInMs = Math.max(0, endsAt - Date.now());
      maintenanceBannerMeta.textContent = t(
        "status.maintenance.meta.ends",
        { start: startLabel, end: endLabel, remaining: formatRelative(endsInMs) },
        `${startLabel} – ${endLabel} · ends in ${formatRelative(endsInMs)}`
      );
    } else if (!isActive && Number.isFinite(startsAt)) {
      const startsInMs = Math.max(0, startsAt - Date.now());
      maintenanceBannerMeta.textContent = t(
        "status.maintenance.meta.starts",
        { start: startLabel, end: endLabel, remaining: formatRelative(startsInMs) },
        `${startLabel} – ${endLabel} · starts in ${formatRelative(startsInMs)}`
      );
    } else {
      maintenanceBannerMeta.textContent = `${startLabel} – ${endLabel}`;
    }
  }

  const note = String(entry.message || "").trim();
  if (maintenanceBannerNote) {
    maintenanceBannerNote.textContent = note;
    maintenanceBannerNote.hidden = !note;
  }

  maintenanceBanner.hidden = false;
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
    uptimeIncidents.textContent = t(
      incidents === 1 ? "app.dashboard.summary.one" : "app.dashboard.summary.many",
      { incidents, minutes: downMinutes },
      `${incidents} incidents, ${downMinutes} min downtime`
    );
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
    rangePickerLabel.textContent = t(
      "status.range.last_days",
      { days: ranges.range30.days },
      `Last ${ranges.range30.days} days`
    );
  }
}

function updateRangeCell(summary, uptimeEl, metaEl) {
  if (!uptimeEl || !metaEl) return;
  if (!summary || !Number.isFinite(summary.uptime)) {
    uptimeEl.textContent = "--.--%";
    metaEl.textContent = t("common.no_data", null, "No data");
    return;
  }
  uptimeEl.textContent = `${summary.uptime.toFixed(2)}%`;
  const incidents = Number.isFinite(summary.incidents) ? summary.incidents : 0;
  const downMinutes = Number.isFinite(summary.downMinutes) ? summary.downMinutes : 0;
  metaEl.textContent = t(
    incidents === 1 ? "app.dashboard.summary.one" : "app.dashboard.summary.many",
    { incidents, minutes: downMinutes },
    `${incidents} incidents, ${downMinutes} min downtime`
  );
}

function updateIncidents(incidents) {
  if (!incidentsList) return;
  const items = incidents?.items || [];

  if (!items.length) {
    const emptyTitle = escapeHtml(
      t("status.incidents.empty_title", null, "This status page has not recorded any incidents yet.")
    );
    const emptyBody = escapeHtml(
      t("status.incidents.empty_body", null, "Incidents will appear here once one is detected.")
    );
    incidentsList.innerHTML = `
      <div class="incidents-inner">
        <div class="incidents-title">${emptyTitle}</div>
        <div class="muted">${emptyBody}</div>
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
    const codeLabel = formatErrorCodeSummary(incident.errorCodes, incident.statusCodes);
    const checks = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

    item.innerHTML = `
      <div class="incident-title-row">
        <span>${escapeHtml(t("app.incidents.outage", null, "Outage"))}</span>
        <span class="incident-badge">${escapeHtml(
          incident.ongoing
            ? t("app.incidents.badge.ongoing", null, "ongoing")
            : t("app.incidents.badge.ended", null, "ended")
        )}</span>
      </div>
      <div class="incident-meta">
        <span>${escapeHtml(range)}</span>
        <span>⏱ ${escapeHtml(duration)}</span>
        <span class="incident-code">${escapeHtml(codeLabel)}</span>
      </div>
      <div class="incident-note">${escapeHtml(t("app.incidents.checks", { n: checks }, `Checks: ${checks}`))}</div>
    `;

    list.appendChild(item);
  });

  incidentsList.appendChild(list);

  if (Number.isFinite(incidents.lookbackDays)) {
    const note = document.createElement("div");
    note.className = "incident-note incident-footnote";
    note.textContent = t(
      "status.incidents.footnote",
      { days: incidents.lookbackDays },
      `Shows incidents from the last ${incidents.lookbackDays} days.`
    );
    incidentsList.appendChild(note);
  }
}

function formatErrorCodeLabel(value) {
  const code = String(value || "NO_RESPONSE").trim().toUpperCase();
  if (!code || code === "NO_RESPONSE") {
    return t("app.errors.no_response_label", null, "no response");
  }
  if (/^\d{3}$/.test(code)) return code;
  return code.replaceAll("_", " ").toLowerCase();
}

function formatErrorCodeSummary(errorCodes, statusCodes = []) {
  const items = Array.isArray(errorCodes) ? errorCodes : [];
  if (!items.length) {
    const codes = (statusCodes || []).filter((code) => Number.isFinite(code));
    if (codes.length) {
      return t(
        codes.length > 1 ? "app.errors.http_codes" : "app.errors.http_code",
        { codes: codes.join(", ") },
        `HTTP code${codes.length > 1 ? "s" : ""}: ${codes.join(", ")}`
      );
    }
    return t("app.errors.no_response_single", null, "Error code: no response");
  }
  const parts = items.slice(0, 5).map((item) => {
    const label = formatErrorCodeLabel(item?.code);
    const hits = Number(item?.hits || 0);
    return hits > 0 ? `${label} (${hits}x)` : label;
  });
  return t("app.errors.codes", { codes: parts.join(", ") }, `Error codes: ${parts.join(", ")}`);
}

function updateUpdatedAt() {
  if (!updatedAt) return;
  const time = new Intl.DateTimeFormat(i18nLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
  updatedAt.textContent = t("status.updated_at_with_time", { time }, `Last updated: ${time}`);
}

function shortUnit(unit) {
  const lang = i18nLang();
  if (lang === "en") {
    if (unit === "second") return "sec";
    if (unit === "minute") return "min";
    if (unit === "hour") return "hr";
    if (unit === "day") return "days";
  }
  if (unit === "second") return "Sek.";
  if (unit === "minute") return "Min.";
  if (unit === "hour") return "Std.";
  if (unit === "day") return "Tage";
  return unit;
}

function formatTimeAgo(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return rtf().format(0, "second");
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return rtf().format(-seconds, "second");

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf().format(-minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf().format(-hours, "hour");

  const days = Math.round(hours / 24);
  return rtf().format(-days, "day");
}

function formatInterval(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} ${shortUnit("second")}`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} ${shortUnit("minute")}`;
  return `${Math.round(ms / 3600000)} ${shortUnit("hour")}`;
}

function formatDateTime(ts) {
  if (!Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatRelative(ms) {
  if (!Number.isFinite(ms) || ms < 0) return `0 ${shortUnit("second")}`;
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} ${shortUnit("second")}`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} ${shortUnit("minute")}`;
  return `${Math.round(ms / 3600000)} ${shortUnit("hour")}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return `0 ${shortUnit("second")}`;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours} ${shortUnit("hour")} ${minutes} ${shortUnit("minute")}`;
  }
  if (minutes > 0) {
    return `${minutes} ${shortUnit("minute")} ${seconds} ${shortUnit("second")}`;
  }
  return `${seconds} ${shortUnit("second")}`;
}

function formatIncidentRange(startTs, endTs, ongoing) {
  const start = new Date(startTs);
  const end = endTs ? new Date(endTs) : null;
  const timeFmt = new Intl.DateTimeFormat(i18nLocale(), { hour: "2-digit", minute: "2-digit" });
  const dateFmt = new Intl.DateTimeFormat(i18nLocale(), { day: "2-digit", month: "2-digit", year: "numeric" });

  if (!end) {
    const suffix = ongoing
      ? t("app.incidents.ongoing", null, "ongoing")
      : t("app.incidents.open", null, "open");
    return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${suffix}`;
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
    updateMaintenance(latestMetrics.maintenances);
  }
}, 1000);
