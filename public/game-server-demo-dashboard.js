const data = {
  serverName: "mc-survival-01.eu.pingmyserver.cloud",
  status: "degraded",
  lastUpdate: "21.02.2026 21:42",
  health: {
    score: 92,
    max: 100,
    description: "Berechnet aus TPS, Crashes, Latenz und Speicherauslastung",
  },
  kpis: [
    { title: "Current TPS", value: "19.87", trend: "+1.9% vs 24h", trendType: "up" },
    { title: "Online Players", value: "87 / 150", trend: "+12 vs Tagesmittel", trendType: "up" },
    { title: "Average Ping", value: "46 ms", trend: "-4 ms vs 24h", trendType: "up" },
    { title: "CPU Usage", value: "68%", trend: "+7% in Peak-Phase", trendType: "down" },
    { title: "Memory Usage", value: "11.2 / 16 GB", trend: "+0.8 GB vs Basis", trendType: "neutral" },
    { title: "Uptime (24h)", value: "99.93%", trend: "1 kurzer Restart", trendType: "neutral" },
  ],
  charts: {
    tps: [19.9, 19.8, 19.7, 19.6, 19.9, 20.0, 19.8, 19.4, 18.8, 19.2, 19.7, 19.9, 19.87],
    players: [42, 45, 52, 58, 61, 65, 72, 88, 97, 92, 86, 84, 87],
  },
  liveMetrics: [
    { label: "TPS", value: "19.87", extra: "Min/Max 1h: 18.72 / 20.00" },
    { label: "Tick Lag", value: "8.6 ms", extra: "P95: 12.1 ms" },
    { label: "CPU Usage", value: "68%", extra: "Node Avg: 54%" },
    { label: "Memory Usage", value: "11.2 / 16 GB", extra: "JVM Heap: 9.1 GB" },
    { label: "World Chunks Loaded", value: "3,482", extra: "3 aktive Dimensionen" },
    { label: "Average Ping", value: "46 ms", extra: "P95: 102 ms" },
    { label: "Packet Loss", value: "0.4%", extra: "Spike 19:06 - resolved" },
  ],
  events: [
    { time: "03:14", type: "Crash", description: "Crash erkannt, Auto-Restart nach 38 Sekunden erfolgreich." },
    { time: "12:37", type: "Restart", description: "Manueller Restart für Plugin-Deployment." },
    { time: "18:05", type: "Warning", description: "TPS-Drop auf 18.1 während World-Save-Burst." },
    { time: "19:46", type: "Warning", description: "Plugin-Fehler im Economy-Modul (selbst recovered)." },
  ],
  plugins: [
    { name: "EssentialsX", version: "2.20.1", status: "OK", lastCheck: "21:40" },
    { name: "LuckPerms", version: "5.4.104", status: "OK", lastCheck: "21:40" },
    { name: "Dynmap", version: "3.7-beta-4", status: "Outdated", lastCheck: "21:39" },
    { name: "CoreProtect", version: "22.5", status: "OK", lastCheck: "21:39" },
    { name: "CustomTeleport", version: "1.8.0", status: "Error", lastCheck: "21:38" },
  ],
  latency: [
    { region: "EU Central", ping: 32 },
    { region: "US East", ping: 85 },
    { region: "US West", ping: 120 },
    { region: "Asia", ping: 210 },
  ],
  discord: {
    connected: true,
    lastNotification: "21.02.2026 21:39",
  },
  insights: [
    "Die Instanz bleibt trotz kurzer Lastspitzen stabil, die Recovery-Zeit nach Events ist niedrig.",
    "Speicher steigt kontinuierlich, ein geplanter Restart vor der Prime-Time reduziert Risiko.",
  ],
};

const serverNameEl = document.getElementById("server-name");
const topStatusBadgeEl = document.getElementById("top-status-badge");
const topLastUpdateEl = document.getElementById("top-last-update");
const summaryGridEl = document.getElementById("summary-grid");

const tpsChartEl = document.getElementById("tps-chart");
const playersChartEl = document.getElementById("players-chart");
const tpsMinEl = document.getElementById("tps-min");
const tpsMaxEl = document.getElementById("tps-max");
const tpsCurrentEl = document.getElementById("tps-current");
const playersPeakEl = document.getElementById("players-peak");
const playersAvgEl = document.getElementById("players-avg");
const playersCurrentEl = document.getElementById("players-current");

const metricsBodyEl = document.getElementById("metrics-body");
const eventsListEl = document.getElementById("events-list");
const pluginBodyEl = document.getElementById("plugin-body");
const latencyListEl = document.getElementById("latency-list");
const discordStatusEl = document.getElementById("discord-status");
const discordLastEl = document.getElementById("discord-last");
const discordTestEl = document.getElementById("discord-test");
const discordNoteEl = document.getElementById("discord-note");
const insightLine1El = document.getElementById("insight-line-1");
const insightLine2El = document.getElementById("insight-line-2");

function getTrendClass(type) {
  if (type === "up") return "up";
  if (type === "down") return "down";
  return "neutral";
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "online") return "online";
  if (value === "down") return "offline";
  if (value === "degraded") return "loading";
  return "loading";
}

function setTopbar() {
  if (serverNameEl) serverNameEl.textContent = data.serverName;
  if (topLastUpdateEl) topLastUpdateEl.textContent = `Letztes Update: ${data.lastUpdate}`;
  if (topStatusBadgeEl) {
    topStatusBadgeEl.textContent = data.status;
    topStatusBadgeEl.classList.remove("online", "offline", "loading");
    topStatusBadgeEl.classList.add(getStatusClass(data.status));
  }
}

function renderSummary() {
  if (!summaryGridEl) return;

  const healthMarkup = `
    <article class="summary-card health">
      <div class="card-title">Overall Health</div>
      <div class="summary-health-value">${data.health.score} <small>/ ${data.health.max}</small></div>
      <div class="muted">${data.health.description}</div>
    </article>
  `;

  const kpisMarkup = data.kpis
    .map(
      (kpi) => `
        <article class="summary-card">
          <div class="card-title">${kpi.title}</div>
          <div class="metric">${kpi.value}</div>
          <div class="muted summary-trend ${getTrendClass(kpi.trendType)}">${kpi.trend}</div>
        </article>
      `
    )
    .join("");

  summaryGridEl.innerHTML = healthMarkup + kpisMarkup;
}

function buildLinePath(points, width, height, padding, min, max) {
  const xSpan = width - padding.left - padding.right;
  const ySpan = height - padding.top - padding.bottom;
  const stepX = xSpan / Math.max(points.length - 1, 1);
  const range = Math.max(max - min, 0.0001);

  return points
    .map((value, index) => {
      const x = padding.left + stepX * index;
      const y = padding.top + ((max - value) / range) * ySpan;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChart(svgEl, points, options) {
  if (!svgEl || !Array.isArray(points) || points.length < 2) return;
  const width = 960;
  const height = 240;
  const padding = { top: 18, right: 16, bottom: 18, left: 14 };
  const min = Number.isFinite(options.min) ? options.min : Math.min(...points);
  const max = Number.isFinite(options.max) ? options.max : Math.max(...points);
  const path = buildLinePath(points, width, height, padding, min, max);

  const yTarget =
    Number.isFinite(options.target) && max !== min
      ? padding.top + ((max - options.target) / (max - min)) * (height - padding.top - padding.bottom)
      : null;

  svgEl.innerHTML = `
    <defs>
      <linearGradient id="${options.id}-stroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${options.colorA}" />
        <stop offset="100%" stop-color="${options.colorB}" />
      </linearGradient>
      <linearGradient id="${options.id}-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${options.colorA}" stop-opacity="0.35" />
        <stop offset="100%" stop-color="${options.colorA}" stop-opacity="0.02" />
      </linearGradient>
    </defs>
    ${
      Number.isFinite(yTarget)
        ? `<line x1="${padding.left}" y1="${yTarget}" x2="${width - padding.right}" y2="${yTarget}" stroke="rgba(185,242,124,0.55)" stroke-dasharray="7 6" />`
        : ""
    }
    <path d="${path} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z" fill="url(#${
      options.id
    }-fill)" />
    <path d="${path}" fill="none" stroke="url(#${options.id}-stroke)" stroke-width="4" stroke-linecap="round" />
  `;
}

function setChartStats() {
  const tpsValues = data.charts.tps;
  const playerValues = data.charts.players;

  if (tpsMinEl) tpsMinEl.textContent = `${Math.min(...tpsValues).toFixed(2)} TPS`;
  if (tpsMaxEl) tpsMaxEl.textContent = `${Math.max(...tpsValues).toFixed(2)} TPS`;
  if (tpsCurrentEl) tpsCurrentEl.textContent = `${tpsValues[tpsValues.length - 1].toFixed(2)} TPS`;

  const peakPlayers = Math.max(...playerValues);
  const avgPlayers = playerValues.reduce((sum, value) => sum + value, 0) / playerValues.length;
  const currentPlayers = playerValues[playerValues.length - 1];

  if (playersPeakEl) playersPeakEl.textContent = `${peakPlayers}`;
  if (playersAvgEl) playersAvgEl.textContent = `${Math.round(avgPlayers)}`;
  if (playersCurrentEl) playersCurrentEl.textContent = `${currentPlayers}`;
}

function renderMetrics() {
  if (!metricsBodyEl) return;
  metricsBodyEl.innerHTML = data.liveMetrics
    .map(
      (item) => `
      <tr>
        <td>${item.label}</td>
        <td>${item.value}</td>
        <td>${item.extra}</td>
      </tr>
    `
    )
    .join("");
}

function getEventClass(type) {
  const value = String(type || "").toLowerCase();
  if (value === "crash") return "crash";
  if (value === "restart") return "restart";
  return "warning";
}

function renderEvents() {
  if (!eventsListEl) return;
  eventsListEl.innerHTML = data.events
    .map(
      (event) => `
      <article class="event-item">
        <div class="event-meta">
          <span class="event-time">${event.time}</span>
          <span class="event-type ${getEventClass(event.type)}">${event.type}</span>
        </div>
        <div class="event-desc">${event.description}</div>
      </article>
    `
    )
    .join("");
}

function getPluginStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "ok") return { dot: "ok", label: "OK" };
  if (value === "outdated") return { dot: "warn", label: "Outdated" };
  return { dot: "error", label: "Error" };
}

function renderPlugins() {
  if (!pluginBodyEl) return;
  pluginBodyEl.innerHTML = data.plugins
    .map((plugin) => {
      const status = getPluginStatus(plugin.status);
      return `
        <tr>
          <td>${plugin.name}</td>
          <td>${plugin.version}</td>
          <td>
            <span class="plugin-status">
              <span class="plugin-dot ${status.dot}"></span>
              <span>${status.label}</span>
            </span>
          </td>
          <td>${plugin.lastCheck}</td>
        </tr>
      `;
    })
    .join("");
}

function getLatencyWidthClass(ping) {
  if (ping <= 45) return "w20";
  if (ping <= 85) return "w35";
  if (ping <= 120) return "w50";
  if (ping <= 160) return "w65";
  if (ping <= 200) return "w80";
  return "w100";
}

function renderLatency() {
  if (!latencyListEl) return;
  latencyListEl.innerHTML = data.latency
    .map(
      (entry) => `
      <div class="latency-row">
        <span class="latency-label">${entry.region}</span>
        <div class="latency-track">
          <div class="latency-bar ${getLatencyWidthClass(entry.ping)}"></div>
        </div>
        <span class="latency-value">${entry.ping} ms</span>
      </div>
    `
    )
    .join("");
}

function renderDiscord() {
  if (!discordStatusEl || !discordLastEl || !discordNoteEl || !discordTestEl) return;

  discordStatusEl.textContent = data.discord.connected ? "Connected" : "Not connected";
  discordStatusEl.classList.remove("online", "offline", "loading");
  discordStatusEl.classList.add(data.discord.connected ? "online" : "offline");
  discordLastEl.textContent = data.discord.lastNotification;

  discordTestEl.addEventListener("click", () => {
    discordNoteEl.textContent = "Test Alert wurde simuliert und in #server-status vorgemerkt.";
    discordLastEl.textContent = "21.02.2026 21:42 (simuliert)";
  });
}

function renderInsights() {
  if (insightLine1El) insightLine1El.textContent = data.insights[0] || "";
  if (insightLine2El) insightLine2El.textContent = data.insights[1] || "";
}

function setupActions() {
  const refreshButton = document.getElementById("refresh-btn");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      topLastUpdateEl.textContent = `Letztes Update: ${data.lastUpdate} · aktualisiert`;
    });
  }

  const logoutButton = document.getElementById("logout-btn");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      window.location.href = "/login";
    });
  }
}

function init() {
  setTopbar();
  renderSummary();
  renderChart(tpsChartEl, data.charts.tps, {
    id: "tps",
    min: 18,
    max: 20.2,
    target: 20,
    colorA: "rgba(76, 201, 240, 1)",
    colorB: "rgba(185, 242, 124, 1)",
  });
  renderChart(playersChartEl, data.charts.players, {
    id: "players",
    min: 0,
    max: 150,
    target: 100,
    colorA: "rgba(185, 242, 124, 1)",
    colorB: "rgba(76, 201, 240, 1)",
  });
  setChartStats();
  renderMetrics();
  renderEvents();
  renderPlugins();
  renderLatency();
  renderDiscord();
  renderInsights();
  setupActions();
}

init();
