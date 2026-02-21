const data = {
  serverName: "mc-survival-01.eu.pingmyserver.cloud",
  status: "degraded",
  updated: "2026-02-21 20:14 UTC",

  // Health Score
  health: {
    score: 92,
    max: 100,
    label: "Overall Health",
    description: "Calculated from TPS, crashes, latency, memory usage",
  },

  kpis: [
    { title: "Current TPS", value: "19.87", trend: "+1.9% vs last 24h", cls: "up", featured: true },
    { title: "Online Players", value: "87 / 150", trend: "+12 players vs avg", cls: "up" },
    { title: "Average Ping", value: "46 ms", trend: "-4 ms vs last 24h", cls: "up" },
    { title: "CPU Usage", value: "68%", trend: "+7% peak in raid hour", cls: "downtrend" },
    { title: "Memory Usage", value: "11.2 / 16 GB", trend: "+0.8 GB vs baseline", cls: "neutral" },
    { title: "Uptime (24h)", value: "99.93%", trend: "One short restart window", cls: "neutral" },
  ],

  charts: {
    tps: [19.9, 19.8, 19.7, 19.6, 19.9, 20.0, 19.8, 19.4, 18.8, 19.2, 19.7, 19.9, 19.87],
    players: [42, 45, 52, 58, 61, 65, 72, 88, 97, 92, 86, 84, 87],
  },

  // AI Insight
  aiInsight: [
    "Server load is stable despite a brief TPS dip around 18:05; the node recovered without manual action.",
    "Memory trend is rising slowly, so consider a scheduled restart window before peak evening traffic.",
  ],

  metrics: [
    { name: "TPS", value: "19.87", extra: "min/max last 1h: 18.72 / 20.00" },
    { name: "Tick Lag", value: "8.6 ms", extra: "95th percentile: 12.1 ms" },
    { name: "CPU Usage", value: "68%", extra: "node avg: 54%" },
    { name: "Memory Usage", value: "11.2 / 16 GB", extra: "JVM heap: 9.1 GB used" },
    { name: "World Chunks Loaded", value: "3,482", extra: "active dimensions: 3" },
    { name: "Average Ping", value: "46 ms", extra: "95th percentile: 102 ms" },
    { name: "Packet Loss", value: "0.4%", extra: "spike at 19:06 resolved" },
  ],

  events: [
    { ts: "03:14", type: "Crash", text: "Crash detected, auto-restart successful after 38s." },
    { ts: "12:37", type: "Restart", text: "Manual restart for plugin deployment." },
    { ts: "18:05", type: "Warning", text: "High TPS drop to 18.1 during world-save burst." },
    { ts: "19:46", type: "Warning", text: "Plugin error detected in economy module (self-recovered)." },
  ],

  plugins: [
    { name: "EssentialsX", version: "2.20.1", status: "OK", check: "20:12" },
    { name: "LuckPerms", version: "5.4.104", status: "OK", check: "20:12" },
    { name: "Dynmap", version: "3.7-beta-4", status: "Outdated", check: "20:11" },
    { name: "CoreProtect", version: "22.5", status: "OK", check: "20:11" },
    { name: "CustomTeleport", version: "1.8.0", status: "Error", check: "20:10" },
  ],

  regions: [
    { name: "EU Central", ping: 32 },
    { name: "US East", ping: 85 },
    { name: "US West", ping: 120 },
    { name: "Asia", ping: 210 },
  ],

  discord: {
    connected: true,
    channel: "#server-status",
    last: "2026-02-21 20:10 UTC",
  },
};

function renderTopbar() {
  document.getElementById("serverName").textContent = data.serverName;
  document.getElementById("updatedAt").textContent = `Last update: ${data.updated}`;
  const badge = document.getElementById("statusBadge");
  badge.textContent = data.status;
  badge.classList.remove("online", "degraded", "down");
  badge.classList.add(String(data.status).toLowerCase());
}

// Health Score
function renderHealthScore(container) {
  const health = data.health;
  const card = document.createElement("article");
  card.className = "card kpi health-score";
  card.innerHTML = `
    <p class="health-label">${health.label}</p>
    <p class="health-value">${health.score} <span>/ ${health.max}</span></p>
    <p class="health-desc">${health.description}</p>
  `;
  container.appendChild(card);
}

function renderKpis() {
  const el = document.getElementById("kpis");
  el.innerHTML = "";

  renderHealthScore(el);

  data.kpis.forEach((kpi) => {
    const node = document.createElement("article");
    node.className = `card kpi${kpi.featured ? " kpi-primary" : ""}`;
    node.innerHTML = `<h3>${kpi.title}</h3><p class="v">${kpi.value}</p><div class="t ${kpi.cls}">${kpi.trend}</div>`;
    el.appendChild(node);
  });
}

function drawChart(svgId, points, cfg) {
  const svg = document.getElementById(svgId);
  if (!svg || !points.length) return;

  const w = 600;
  const h = 250;
  const p = { t: 20, r: 20, b: 26, l: 36 };
  const iw = w - p.l - p.r;
  const ih = h - p.t - p.b;

  const min = typeof cfg.min === "number" ? cfg.min : Math.min(...points);
  const max = typeof cfg.max === "number" ? cfg.max : Math.max(...points);
  const range = Math.max(max - min, 0.0001);

  const xStep = iw / Math.max(points.length - 1, 1);
  const x = (i) => p.l + i * xStep;
  const y = (v) => p.t + (max - v) * (ih / range);

  const coords = points.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const poly = coords.join(" ");
  const area = [`M ${x(0)} ${h - p.b}`, ...coords.map((c) => `L ${c}`), `L ${x(points.length - 1)} ${h - p.b}`, "Z"].join(
    " "
  );

  const grid = Array.from({ length: 5 })
    .map((_, i) => {
      const gy = p.t + (ih / 4) * i;
      return `<line x1="${p.l}" y1="${gy}" x2="${w - p.r}" y2="${gy}" stroke="rgba(155,181,240,0.18)" stroke-width="1" />`;
    })
    .join("");

  const target =
    typeof cfg.target === "number"
      ? `<line x1="${p.l}" y1="${y(cfg.target)}" x2="${w - p.r}" y2="${y(cfg.target)}" stroke="rgba(90,241,195,0.65)" stroke-width="1.2" stroke-dasharray="5 5" />`
      : "";

  const lx = x(points.length - 1);
  const ly = y(points[points.length - 1]);

  svg.innerHTML = `
    <defs>
      <linearGradient id="${svgId}Fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.35"></stop>
        <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.02"></stop>
      </linearGradient>
    </defs>
    ${grid}
    ${target}
    <path d="${area}" fill="url(#${svgId}Fill)"></path>
    <polyline points="${poly}" fill="none" stroke="${cfg.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${lx}" cy="${ly}" r="4.5" fill="${cfg.color}" />
    <text x="${w - 12}" y="16" fill="rgba(196,214,255,0.78)" font-size="11" text-anchor="end">${cfg.label}</text>
  `;
}

// AI Insight
function renderAiInsight() {
  document.getElementById("aiInsightLine1").textContent = data.aiInsight[0] || "";
  document.getElementById("aiInsightLine2").textContent = data.aiInsight[1] || "";
}

function renderMetrics() {
  const el = document.getElementById("liveMetrics");
  el.innerHTML = "";
  data.metrics.forEach((m) => {
    const row = document.createElement("li");
    row.innerHTML = `<span class="mname">${m.name}</span><span class="mval">${m.value}</span><span class="mextra">${m.extra}</span>`;
    el.appendChild(row);
  });
}

// Improved Events
function renderEvents() {
  const el = document.getElementById("events");
  el.innerHTML = "";
  data.events.forEach((e) => {
    const cls = e.type === "Crash" ? "crash" : e.type === "Restart" ? "restart" : "warn";
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="event-card">
        <div class="time">${e.ts}</div>
        <div class="ev"><span class="tag ${cls}">${e.type}</span><span>${e.text}</span></div>
      </div>
    `;
    el.appendChild(item);
  });
}

function renderPlugins() {
  const el = document.getElementById("plugins");
  el.innerHTML = "";
  data.plugins.forEach((p) => {
    const dot = p.status === "OK" ? "ok" : p.status === "Outdated" ? "outdated" : "error";
    const row = document.createElement("tr");
    row.innerHTML = `<td>${p.name}</td><td>${p.version}</td><td><span class="pill"><span class="dot ${dot}"></span><span>${p.status}</span></span></td><td>${p.check}</td>`;
    el.appendChild(row);
  });
}

function renderRegions() {
  const el = document.getElementById("regions");
  el.innerHTML = "";
  const max = Math.max(...data.regions.map((r) => r.ping), 1);
  data.regions.forEach((r) => {
    const width = Math.max(6, Math.round((r.ping / max) * 100));
    const row = document.createElement("div");
    row.className = "rrow";
    row.innerHTML = `<span class="rname">${r.name}</span><div class="rbg"><div class="rfill" style="width:${width}%"></div></div><span class="rms">${r.ping} ms</span>`;
    el.appendChild(row);
  });
}

// Discord Improvements
function renderDiscord() {
  const statusEl = document.getElementById("discordStatus");
  statusEl.textContent = data.discord.connected ? "Connected" : "Not connected";
  statusEl.classList.remove("connected", "disconnected");
  statusEl.classList.add(data.discord.connected ? "connected" : "disconnected");

  document.getElementById("discordChannel").textContent = data.discord.channel;
  document.getElementById("discordLast").textContent = data.discord.last;

  const btn = document.getElementById("testAlert");
  const hint = document.getElementById("testHint");
  btn.addEventListener("click", () => {
    hint.textContent = "Test alert simulated: payload queued to #server-status.";
    document.getElementById("discordLast").textContent = "2026-02-21 20:14 UTC (simulated)";
  });
}

function init() {
  renderTopbar();
  renderKpis();
  renderAiInsight();
  drawChart("tpsChart", data.charts.tps, { label: "TPS", color: "#43d1ff", min: 18, max: 20.2, target: 20 });
  drawChart("playersChart", data.charts.players, { label: "Players", color: "#5df4c3", min: 0, max: 150, target: 100 });
  renderMetrics();
  renderEvents();
  renderPlugins();
  renderRegions();
  renderDiscord();
}

init();
