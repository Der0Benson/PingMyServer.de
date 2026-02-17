const pollIntervalMs = 5000;

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
const range7Uptime = document.getElementById("range-7-uptime");
const range7Meta = document.getElementById("range-7-meta");
const range30Uptime = document.getElementById("range-30-uptime");
const range30Meta = document.getElementById("range-30-meta");
const range365Uptime = document.getElementById("range-365-uptime");
const range365Meta = document.getElementById("range-365-meta");
const rangePickerLabel = document.getElementById("range-picker-label");
const loginOverlay = document.getElementById("login-overlay");
const socialLoginButtons = document.querySelectorAll(".auth-social-btn");
const emailLoginForm = document.getElementById("email-login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const authMessage = document.getElementById("auth-message");
const authSkipButton = document.getElementById("auth-skip-btn");

let statusSince = Date.now();
let lastCheckTime = null;
let latestMetrics = null;

async function loadMetrics() {
  try {
    const response = await fetch("/api/metrics", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    latestMetrics = data;

    if (data.statusSince) statusSince = data.statusSince;
    if (data.lastCheckAt) lastCheckTime = data.lastCheckAt;

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
  if (!svg || !series.length) return;

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

    item.innerHTML = `
      <div class="incident-title-row">
        <span>Ausfall</span>
        <span class="incident-badge">${incident.ongoing ? "laufend" : "beendet"}</span>
      </div>
      <div class="incident-meta">
        <span>${range}</span>
        <span>⏱ ${duration}</span>
        <span class="incident-code">${codeLabel}</span>
      </div>
      <div class="incident-note">Checks: ${incident.samples || 0}</div>
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

function unlockDashboard(message, isSuccess = false) {
  if (authMessage) {
    authMessage.textContent = message;
    authMessage.classList.toggle("success", isSuccess);
  }
  if (!loginOverlay) return;
  setTimeout(() => {
    loginOverlay.classList.add("is-hidden");
    document.body.classList.remove("auth-locked");
  }, isSuccess ? 350 : 650);
}

function setupLoginMask() {
  if (!loginOverlay) return;

  socialLoginButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.dataset.provider || "Provider";
      unlockDashboard(
        `${provider}-Login ist als UI vorbereitet und noch nicht mit Backend verbunden. Vorschau wird geöffnet.`,
        false
      );
    });
  });

  if (emailLoginForm) {
    emailLoginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = (loginEmail?.value || "").trim();
      const password = loginPassword?.value || "";

      if (!email.includes("@") || password.length < 4) {
        if (authMessage) {
          authMessage.textContent = "Bitte gib eine valide E-Mail und ein Passwort mit mindestens 4 Zeichen ein.";
          authMessage.classList.remove("success");
        }
        return;
      }

      unlockDashboard("Anmeldung simuliert. Dashboard wird geöffnet.", true);
    });
  }

  if (authSkipButton) {
    authSkipButton.addEventListener("click", () => {
      unlockDashboard("Vorschau ohne Login geöffnet.", false);
    });
  }
}

loadMetrics();
setInterval(loadMetrics, pollIntervalMs);

setInterval(() => {
  if (latestMetrics) {
    updateStatus(latestMetrics);
  }
}, 1000);

setupLoginMask();
