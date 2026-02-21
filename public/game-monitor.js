const byId = (id) => document.getElementById(id);

const els = {
  email: byId("current-user-email"),
  logout: byId("logout-btn"),
  refresh: byId("refresh-btn"),
  createPairing: byId("create-pairing-btn"),
  serverName: byId("server-name"),
  topStatus: byId("top-status-badge"),
  topUpdated: byId("top-last-update"),
  summary: byId("summary-grid"),
  pairingCode: byId("mod-pairing-code"),
  pairingExpiry: byId("mod-pairing-expiry"),
  message: byId("game-monitor-message"),
  tpsChart: byId("tps-chart"),
  playersChart: byId("players-chart"),
  tpsMin: byId("tps-min"),
  tpsMax: byId("tps-max"),
  tpsCurrent: byId("tps-current"),
  playersPeak: byId("players-peak"),
  playersAvg: byId("players-avg"),
  playersCurrent: byId("players-current"),
  metricsBody: byId("metrics-body"),
  events: byId("events-list"),
  sessions: byId("mod-sessions-list"),
  pluginsSummary: byId("plugins-summary"),
  pluginsList: byId("plugins-list"),
  latencySummary: byId("latency-summary"),
  latencyList: byId("latency-list"),
  discordStatusPill: byId("discord-status-pill"),
  discordStatusCopy: byId("discord-status-copy"),
  discordTestBtn: byId("discord-test-btn"),
  insight1: byId("insight-line-1"),
  insight2: byId("insight-line-2"),
};

const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));
const GAME = "minecraft";
const REFRESH_MS = 30000;
const HISTORY_MAX = 48;
const EVENTS_MAX = 14;

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const locale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

const state = {
  user: null,
  sessions: [],
  pairing: null,
  notifications: null,
  eventFeed: [],
  updatedAt: 0,
  tps: [],
  players: [],
  events: [],
  prevOnline: new Map(),
  eventsReady: false,
};

let loopHandle = null;
let discordTestPending = false;

const esc = (v) =>
  String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isNum = (v) => Number.isFinite(Number(v));

function fmtNum(v, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  try {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return n.toFixed(digits);
  }
}

function fmtDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "--";
  try {
    return new Intl.DateTimeFormat(locale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(n));
  } catch {
    return new Date(n).toLocaleString();
  }
}

function fmtTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "--";
  try {
    return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(n));
  } catch {
    return new Date(n).toLocaleTimeString();
  }
}

function fmtPercent(v, digits = 1) {
  if (!isNum(v)) return "--";
  return `${fmtNum(v, digits)}%`;
}

function fmtMemory(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  if (n >= 1024) return `${fmtNum(n / 1024, 2)} GB`;
  return `${fmtNum(n, 0)} MB`;
}

function fmtUptimeSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  const hours = n / 3600;
  if (hours >= 24) return `${fmtNum(hours / 24, 1)} d`;
  return `${fmtNum(hours, 1)} h`;
}

function setMsg(text, type = "") {
  if (!els.message) return;
  els.message.textContent = text || "";
  els.message.classList.remove("success", "error");
  if (type) els.message.classList.add(type);
}

function syncOwnerLinks() {
  const isOwner = state.user?.isOwner === true;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
    link.setAttribute("aria-hidden", isOwner ? "false" : "true");
    if (isOwner) link.style.removeProperty("display");
    else link.style.setProperty("display", "none", "important");
  }
}

async function ensureAuth() {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 401 || !res.ok) {
      window.location.href = "/login";
      return false;
    }
    const payload = await res.json().catch(() => null);
    if (!payload?.ok || !payload?.user) {
      window.location.href = "/login";
      return false;
    }
    state.user = payload.user;
    syncOwnerLinks();
    if (els.email) els.email.textContent = payload.user.email || t("common.signed_in", null, "signed in");
    return true;
  } catch {
    window.location.href = "/login";
    return false;
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore
  } finally {
    window.location.href = "/login";
  }
}

async function fetchSessions() {
  const res = await fetch(`/api/game-agent/sessions?game=${encodeURIComponent(GAME)}`, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    return false;
  }
  if (!res.ok) {
    state.sessions = [];
    return false;
  }
  const payload = await res.json().catch(() => null);
  state.sessions = Array.isArray(payload?.data?.sessions) ? payload.data.sessions : [];
  return true;
}

async function fetchPairing() {
  const res = await fetch(`/api/game-agent/pairings?game=${encodeURIComponent(GAME)}`, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    return false;
  }
  if (!res.ok) {
    state.pairing = null;
    return false;
  }
  const payload = await res.json().catch(() => null);
  const list = Array.isArray(payload?.data) ? payload.data : [];
  state.pairing = list[0] || null;
  return true;
}

async function fetchNotifications() {
  const res = await fetch("/api/account/notifications", { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    return false;
  }
  if (!res.ok) {
    state.notifications = null;
    return false;
  }
  const payload = await res.json().catch(() => null);
  state.notifications = payload?.ok && payload?.data && typeof payload.data === "object" ? payload.data : null;
  return true;
}

async function fetchEvents() {
  const res = await fetch(`/api/game-agent/events?game=${encodeURIComponent(GAME)}&limit=80`, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    return false;
  }
  if (!res.ok) {
    state.eventFeed = [];
    return false;
  }
  const payload = await res.json().catch(() => null);
  state.eventFeed = Array.isArray(payload?.data?.events) ? payload.data.events : [];
  return true;
}

async function createPairing() {
  const res = await fetch("/api/game-agent/pairings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: GAME }),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    return false;
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok || !payload?.data) {
    setMsg(t("game_monitor.messages.pairing_failed", null, "Code konnte nicht erstellt werden."), "error");
    return false;
  }
  state.pairing = payload.data;
  renderPairing();
  setMsg(t("game_monitor.messages.pairing_created", null, "Pairing-Code erstellt."), "success");
  return true;
}

async function sendDiscordTestAlert() {
  if (discordTestPending) return;
  discordTestPending = true;
  if (els.discordTestBtn) els.discordTestBtn.disabled = true;
  try {
    const res = await fetch("/api/account/notifications/discord/test", { method: "POST" });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.ok === false) {
      setMsg(t("game_monitor.dashboard.discord.test_failed", null, "Discord-Test konnte nicht gesendet werden."), "error");
      return;
    }
    setMsg(t("game_monitor.dashboard.discord.test_sent", null, "Discord-Test versendet."), "success");
  } catch {
    setMsg(t("game_monitor.dashboard.discord.test_failed", null, "Discord-Test konnte nicht gesendet werden."), "error");
  } finally {
    discordTestPending = false;
    renderDiscord();
  }
}

function sortedSessions() {
  return [...state.sessions].sort((a, b) => {
    if (Boolean(a?.online) !== Boolean(b?.online)) return a?.online ? -1 : 1;
    return Number(b?.lastHeartbeatAt || b?.connectedAt || 0) - Number(a?.lastHeartbeatAt || a?.connectedAt || 0);
  });
}

function primarySession() {
  return sortedSessions()[0] || null;
}

function activeSessions() {
  const online = state.sessions.filter((s) => s?.online);
  return online.length ? online : state.sessions;
}

function onlineCount() {
  return state.sessions.filter((s) => s?.online).length;
}

function avgMetric(field, digits = 2) {
  const values = activeSessions()
    .map((s) => Number(s?.metrics?.[field]))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Number(avg.toFixed(digits));
}

function sumMetric(field) {
  const values = activeSessions()
    .map((s) => Number(s?.metrics?.[field]))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + Math.max(0, v), 0);
}

function avgPing() {
  return avgMetric("pingMs", 1);
}

function sumPlayers(field) {
  let total = 0;
  let found = false;
  for (const s of state.sessions) {
    const value = Number(s?.metrics?.[field]);
    if (!Number.isFinite(value)) continue;
    total += Math.max(0, Math.round(value));
    found = true;
  }
  return found ? total : null;
}

function healthScore(session) {
  if (!state.sessions.length) return null;
  const scores = [];
  let totalWeight = 0;

  if (isNum(session?.metrics?.tps)) {
    scores.push(Math.max(0, Math.min(100, (Number(session.metrics.tps) / 20) * 100)) * 0.35);
    totalWeight += 0.35;
  }

  const ping = avgPing();
  if (isNum(ping)) {
    scores.push(Math.max(0, 100 - Number(ping) * 0.5) * 0.2);
    totalWeight += 0.2;
  }

  const cpu = avgMetric("cpuUsagePct", 1);
  if (isNum(cpu)) {
    scores.push(Math.max(0, 100 - Number(cpu) * 0.7) * 0.1);
    totalWeight += 0.1;
  }

  const packetLoss = avgMetric("packetLossPct", 2);
  if (isNum(packetLoss)) {
    scores.push(Math.max(0, 100 - Number(packetLoss) * 4) * 0.1);
    totalWeight += 0.1;
  }

  scores.push((state.sessions.length ? (onlineCount() / state.sessions.length) * 100 : 0) * 0.25);
  totalWeight += 0.25;

  if (totalWeight <= 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / totalWeight);
}

function statusMeta() {
  if (!state.sessions.length) return { css: "loading", label: t("game_monitor.dashboard.status.not_connected", null, "Not connected") };
  const on = onlineCount();
  if (on === state.sessions.length) return { css: "online", label: t("game_monitor.dashboard.status.online", null, "Online") };
  if (on > 0) return { css: "degraded", label: t("game_monitor.dashboard.status.degraded", null, "Degraded") };
  return { css: "offline", label: t("game_monitor.dashboard.status.offline", null, "Offline") };
}

function pushHistory(list, rawValue) {
  const n = Number(rawValue);
  const fallback = list.length ? list[list.length - 1].value : 0;
  list.push({ value: Number.isFinite(n) ? n : fallback, real: Number.isFinite(n) });
  if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX);
}

function updateHistory() {
  const s = primarySession();
  pushHistory(state.tps, Number(s?.metrics?.tps));
  pushHistory(state.players, state.sessions.length ? sumPlayers("playersOnline") : null);
}

function addEvent(type, description, sessionName = null, ts = Date.now()) {
  state.events.unshift({ type, description, sessionName, ts: Number(ts) || Date.now() });
  if (state.events.length > EVENTS_MAX * 3) state.events.splice(EVENTS_MAX * 3);
}

function updateEvents() {
  const next = new Map();
  for (const s of state.sessions) {
    if (!s?.id) continue;
    next.set(String(s.id), Boolean(s.online));
  }

  if (!state.eventsReady) {
    state.prevOnline = next;
    state.eventsReady = true;
    return;
  }

  for (const s of state.sessions) {
    const id = String(s?.id || "").trim();
    if (!id) continue;
    const sessionName = s.serverName || s.serverHost || id;
    const prev = state.prevOnline.get(id);
    if (prev === undefined) {
      addEvent("connect", t("game_monitor.dashboard.events.new_session", { session: sessionName }, `Neue Session erkannt: ${sessionName}`), sessionName);
      continue;
    }
    if (prev !== Boolean(s.online)) {
      if (s.online) addEvent("restart", t("game_monitor.dashboard.events.session_recovered", { session: sessionName }, `Session wieder online: ${sessionName}`), sessionName);
      else addEvent("disconnect", t("game_monitor.dashboard.events.session_stale", { session: sessionName }, `Heartbeat stale/offline: ${sessionName}`), sessionName);
    }
  }
  state.prevOnline = next;
}
function linePath(points, width, height, pad, min, max) {
  const xSpan = width - pad.left - pad.right;
  const ySpan = height - pad.top - pad.bottom;
  const stepX = xSpan / Math.max(points.length - 1, 1);
  const range = Math.max(max - min, 0.0001);
  return points
    .map((value, i) => {
      const x = pad.left + stepX * i;
      const y = pad.top + ((max - value) / range) * ySpan;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChart(svgEl, points, options) {
  if (!svgEl) return;
  if (!Array.isArray(points) || points.length < 2) {
    svgEl.innerHTML = "";
    return;
  }
  const width = 960;
  const height = 240;
  const pad = { top: 18, right: 16, bottom: 18, left: 14 };
  const min = Number.isFinite(options.min) ? options.min : Math.min(...points);
  const max = Number.isFinite(options.max) ? options.max : Math.max(...points);
  const path = linePath(points, width, height, pad, min, max);
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
    <path d="${path} L ${width - pad.right} ${height - pad.bottom} L ${pad.left} ${height - pad.bottom} Z" fill="url(#${options.id}-fill)" />
    <path d="${path}" fill="none" stroke="url(#${options.id}-stroke)" stroke-width="4" stroke-linecap="round" />
  `;
}

function renderTopbar(session) {
  const status = statusMeta();
  if (els.topStatus) {
    els.topStatus.textContent = status.label;
    els.topStatus.classList.remove("online", "offline", "loading", "degraded");
    els.topStatus.classList.add(status.css);
  }
  if (els.serverName) {
    els.serverName.textContent =
      session?.serverName || session?.serverHost || (session?.instanceId ? `minecraft-${session.instanceId}` : t("game_monitor.dashboard.server_name_fallback", null, "Minecraft Mod Monitor"));
  }
  if (els.topUpdated) {
    const value = state.updatedAt > 0 ? fmtDate(state.updatedAt) : "--";
    els.topUpdated.textContent = t("game_monitor.dashboard.updated_at", { time: value }, `Last update: ${value}`);
  }
}

function renderPairing() {
  if (els.pairingCode) els.pairingCode.textContent = state.pairing?.code ? String(state.pairing.code) : "------";
  if (els.pairingExpiry) {
    els.pairingExpiry.textContent = state.pairing?.expiresAt
      ? fmtDate(state.pairing.expiresAt)
      : t("game_monitor.dashboard.connection.no_code", null, "Kein aktiver Code");
  }
}

function trendText(series, digits = 1) {
  if (!Array.isArray(series) || series.length < 2) return { text: t("game_monitor.dashboard.trend.waiting", null, "Warte auf Daten"), css: "neutral" };
  const start = Number(series[Math.max(0, series.length - 12)]?.value);
  const end = Number(series[series.length - 1]?.value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(start) < 0.0001) {
    return { text: t("game_monitor.dashboard.trend.waiting", null, "Warte auf Daten"), css: "neutral" };
  }
  const pct = ((end - start) / start) * 100;
  const sign = pct > 0 ? "+" : "";
  const css = pct > 0.01 ? "up" : pct < -0.01 ? "down" : "neutral";
  return { text: `${sign}${fmtNum(pct, digits)}% ${t("game_monitor.dashboard.trend.vs_recent", null, "vs letzte Samples")}`, css };
}

function renderSummary(session) {
  if (!els.summary) return;
  const ping = avgPing();
  const playersOnline = sumPlayers("playersOnline");
  const playersMax = sumPlayers("playersMax");
  const cpu = avgMetric("cpuUsagePct", 1);
  const memoryUsed = sumMetric("memoryUsedMb");
  const memoryMax = sumMetric("memoryMaxMb");
  const uptimeSec = avgMetric("uptimeSec", 0);
  const h = healthScore(session);

  const cards = [
    {
      title: t("game_monitor.dashboard.kpis.current_tps", null, "Current TPS"),
      value: isNum(session?.metrics?.tps) ? fmtNum(session.metrics.tps, 2) : "--",
      trend: trendText(state.tps, 2),
    },
    {
      title: t("game_monitor.dashboard.kpis.online_players", null, "Online Players"),
      value:
        isNum(playersOnline) && isNum(playersMax)
          ? `${fmtNum(playersOnline)} / ${fmtNum(playersMax)}`
          : isNum(playersOnline)
          ? fmtNum(playersOnline)
          : "--",
      trend: trendText(state.players, 1),
    },
    {
      title: t("game_monitor.dashboard.kpis.average_ping", null, "Average Ping"),
      value: isNum(ping) ? `${fmtNum(ping)} ms` : "--",
      trend: { text: t("game_monitor.dashboard.trend.live_value", null, "Live aus Mod-Metriken"), css: "neutral" },
    },
    {
      title: t("game_monitor.dashboard.kpis.cpu_usage", null, "CPU Usage"),
      value: fmtPercent(cpu, 1),
      trend: { text: t("game_monitor.dashboard.trend.live_value", null, "Live aus Mod-Metriken"), css: "neutral" },
    },
    {
      title: t("game_monitor.dashboard.kpis.memory_usage", null, "Memory Usage"),
      value: isNum(memoryUsed) && isNum(memoryMax) ? `${fmtMemory(memoryUsed)} / ${fmtMemory(memoryMax)}` : fmtMemory(memoryUsed),
      trend: { text: t("game_monitor.dashboard.trend.live_value", null, "Live aus Mod-Metriken"), css: "neutral" },
    },
    {
      title: t("game_monitor.dashboard.kpis.uptime", null, "Uptime (24h)"),
      value: fmtUptimeSeconds(uptimeSec),
      trend: { text: t("game_monitor.dashboard.trend.live_value", null, "Live aus Mod-Metriken"), css: "neutral" },
    },
  ];

  const healthText = isNum(h) ? `${fmtNum(h)} <small>/ 100</small>` : `-- <small>/ 100</small>`;

  els.summary.innerHTML = `
    <article class="summary-card health">
      <div class="card-title">${esc(t("game_monitor.dashboard.health.title", null, "Overall Health"))}</div>
      <div class="summary-health-value">${healthText}</div>
      <div class="muted">${esc(
        t(
          "game_monitor.dashboard.health.description",
          { online: fmtNum(onlineCount()), total: fmtNum(state.sessions.length) },
          "Berechnet aus TPS, Session-Status und Latenz"
        )
      )}</div>
    </article>
    ${cards
      .map(
        (card) => `
      <article class="summary-card">
        <div class="card-title">${esc(card.title)}</div>
        <div class="metric">${esc(card.value)}</div>
        <div class="muted summary-trend ${esc(card.trend.css)}">${esc(card.trend.text)}</div>
      </article>
    `
      )
      .join("")}
  `;
}

function renderCharts() {
  const tpsValues = state.tps.map((x) => x.value);
  const playersValues = state.players.map((x) => x.value);

  renderChart(els.tpsChart, tpsValues, {
    id: "tps",
    min: Math.min(18, ...(tpsValues.length ? tpsValues : [18])),
    max: Math.max(20.2, ...(tpsValues.length ? tpsValues : [20.2])),
    colorA: "rgba(76, 201, 240, 1)",
    colorB: "rgba(185, 242, 124, 1)",
  });

  renderChart(els.playersChart, playersValues, {
    id: "players",
    min: 0,
    max: Math.max(100, ...(playersValues.length ? playersValues : [100])),
    colorA: "rgba(185, 242, 124, 1)",
    colorB: "rgba(76, 201, 240, 1)",
  });

  const realTps = state.tps.filter((x) => x.real).map((x) => x.value);
  const realPlayers = state.players.filter((x) => x.real).map((x) => x.value);

  if (els.tpsMin) els.tpsMin.textContent = realTps.length ? `${fmtNum(Math.min(...realTps), 2)} TPS` : "--";
  if (els.tpsMax) els.tpsMax.textContent = realTps.length ? `${fmtNum(Math.max(...realTps), 2)} TPS` : "--";
  if (els.tpsCurrent) els.tpsCurrent.textContent = realTps.length ? `${fmtNum(realTps[realTps.length - 1], 2)} TPS` : "--";

  if (els.playersPeak) els.playersPeak.textContent = realPlayers.length ? fmtNum(Math.max(...realPlayers)) : "--";
  if (els.playersAvg)
    els.playersAvg.textContent = realPlayers.length
      ? fmtNum(realPlayers.reduce((sum, v) => sum + v, 0) / realPlayers.length)
      : "--";
  if (els.playersCurrent) els.playersCurrent.textContent = realPlayers.length ? fmtNum(realPlayers[realPlayers.length - 1]) : "--";
}

function metricRow(label, value, extra) {
  return `<tr><td>${esc(label)}</td><td>${esc(value)}</td><td>${esc(extra)}</td></tr>`;
}

function renderLiveMetrics(session) {
  if (!els.metricsBody) return;
  const ping = avgPing();
  const playersOnline = sumPlayers("playersOnline");
  const playersMax = sumPlayers("playersMax");
  const cpu = avgMetric("cpuUsagePct", 1);
  const memoryUsed = sumMetric("memoryUsedMb");
  const memoryMax = sumMetric("memoryMaxMb");
  const packetLoss = avgMetric("packetLossPct", 2);

  const rows = [
    metricRow(t("game_monitor.dashboard.live_metrics.rows.tps", null, "TPS"), isNum(session?.metrics?.tps) ? `${fmtNum(session.metrics.tps, 2)} TPS` : "--", t("game_monitor.dashboard.live_metrics.rows.tps_extra", null, "Direkt aus Mod-Metriken")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.ping", null, "Average Ping"), isNum(ping) ? `${fmtNum(ping)} ms` : "--", t("game_monitor.dashboard.live_metrics.rows.ping_extra", null, "Mittelwert ueber aktive Sessions")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.players", null, "Players"), isNum(playersOnline) && isNum(playersMax) ? `${fmtNum(playersOnline)} / ${fmtNum(playersMax)}` : isNum(playersOnline) ? fmtNum(playersOnline) : "--", t("game_monitor.dashboard.live_metrics.rows.players_extra", null, "Online / Max")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.sessions", null, "Sessions"), `${fmtNum(onlineCount())} / ${fmtNum(state.sessions.length)}`, t("game_monitor.dashboard.live_metrics.rows.sessions_extra", null, "Online / Gesamt")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.version", null, "Server Version"), session?.metrics?.version || session?.gameVersion || "--", t("game_monitor.dashboard.live_metrics.rows.version_extra", null, "Version aus Mod-Heartbeat")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.world", null, "World"), session?.metrics?.world || "--", t("game_monitor.dashboard.live_metrics.rows.world_extra", null, "Falls von der Mod geliefert")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.dimension", null, "Dimension"), session?.metrics?.dimension || "--", t("game_monitor.dashboard.live_metrics.rows.dimension_extra", null, "Falls von der Mod geliefert")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.motd", null, "MOTD"), session?.metrics?.motd || "--", t("game_monitor.dashboard.live_metrics.rows.motd_extra", null, "Aktueller MOTD-Text")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.mod_version", null, "Mod Version"), session?.modVersion || "--", t("game_monitor.dashboard.live_metrics.rows.mod_version_extra", null, "Gemeldet von der verbundenen Session")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.instance", null, "Instance"), session?.instanceId || "--", t("game_monitor.dashboard.live_metrics.rows.instance_extra", null, "Eindeutige Session-ID")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.heartbeat", null, "Last Heartbeat"), fmtDate(session?.lastHeartbeatAt), t("game_monitor.dashboard.live_metrics.rows.heartbeat_extra", null, "Zeitpunkt des letzten Heartbeats")),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.cpu", null, "CPU Usage"), fmtPercent(cpu, 1), t("game_monitor.dashboard.live_metrics.rows.cpu_extra", null, "Mittelwert ueber aktive Sessions")),
    metricRow(
      t("game_monitor.dashboard.live_metrics.rows.memory", null, "Memory Usage"),
      isNum(memoryUsed) && isNum(memoryMax) ? `${fmtMemory(memoryUsed)} / ${fmtMemory(memoryMax)}` : fmtMemory(memoryUsed),
      t("game_monitor.dashboard.live_metrics.rows.memory_extra", null, "Aggregiert ueber aktive Sessions")
    ),
    metricRow(t("game_monitor.dashboard.live_metrics.rows.packet_loss", null, "Packet Loss"), fmtPercent(packetLoss, 2), t("game_monitor.dashboard.live_metrics.rows.packet_loss_extra", null, "Durchschnitt in Prozent")),
  ];

  els.metricsBody.innerHTML = rows.join("");
}

function resolveEventStyle(item) {
  const type = String(item?.type || "").toLowerCase();
  const severity = String(item?.severity || "").toLowerCase();
  if (type === "crash" || severity === "critical" || severity === "error") return "error";
  if (type === "restart") return "restart";
  if (type === "warning" || severity === "warning") return "warning";
  if (type === "disconnect") return "disconnect";
  if (type === "connect") return "connect";
  return "info";
}

function eventTypeLabel(style) {
  if (style === "restart") return t("game_monitor.dashboard.events.type_restart", null, "RESTART");
  if (style === "error") return t("game_monitor.dashboard.events.type_error", null, "ERROR");
  if (style === "disconnect") return t("game_monitor.dashboard.events.type_disconnect", null, "DISCONNECT");
  if (style === "connect") return t("game_monitor.dashboard.events.type_connect", null, "CONNECT");
  if (style === "warning") return t("game_monitor.dashboard.events.type_warning", null, "WARNING");
  return t("game_monitor.dashboard.events.type_info", null, "INFO");
}

function collectEventsForRender() {
  const merged = [];

  for (const item of state.eventFeed) {
    if (!item || typeof item !== "object") continue;
    merged.push({
      type: item.type || "info",
      severity: item.severity || "info",
      description: String(item.message || "").trim(),
      ts: Number(item.happenedAt || item.createdAt || 0) || Date.now(),
      sessionName: String(item?.session?.name || "").trim() || null,
    });
  }

  for (const s of state.sessions) {
    const sessionName = s?.serverName || s?.serverHost || s?.instanceId || null;
    const events = Array.isArray(s?.events) ? s.events : [];
    for (const item of events) {
      if (!item || typeof item !== "object") continue;
      merged.push({
        type: item.type || "info",
        severity: item.severity || "info",
        description: String(item.message || "").trim(),
        ts: Number(item.happenedAt || 0) || Date.now(),
        sessionName,
      });
    }
  }

  merged.push(...state.events);

  const dedupe = new Set();
  const list = [];
  for (const item of merged) {
    if (!item?.description) continue;
    const key = `${String(item.type || "")}|${String(item.severity || "")}|${String(item.description)}|${Number(item.ts || 0)}|${item.sessionName || ""}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    list.push(item);
  }

  list.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return list.slice(0, EVENTS_MAX);
}

function renderEvents() {
  if (!els.events) return;
  const list = collectEventsForRender();
  if (!list.length) list.push({ type: "info", severity: "info", ts: Date.now(), description: t("game_monitor.dashboard.events.no_changes", null, "Noch keine Session-Statusaenderungen erkannt."), sessionName: null });

  els.events.innerHTML = list
    .map((item) => {
      const style = resolveEventStyle(item);
      const label = eventTypeLabel(style);
      const prefix = item.sessionName ? `[${item.sessionName}] ` : "";
      return `<article class="event-item"><div class="event-meta"><span class="event-time">${esc(fmtTime(item.ts))}</span><span class="event-type ${esc(style)}">${esc(label)}</span></div><div class="event-desc">${esc(prefix)}${esc(item.description || "")}</div></article>`;
    })
    .join("");
}

function collectPlugins() {
  const map = new Map();
  for (const session of activeSessions()) {
    const plugins = Array.isArray(session?.plugins) ? session.plugins : [];
    for (const plugin of plugins) {
      const name = String(plugin?.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name,
          version: String(plugin?.version || "").trim() || null,
          enabled: plugin?.enabled !== false,
        });
        continue;
      }
      const existing = map.get(key);
      existing.enabled = existing.enabled || plugin?.enabled !== false;
      if (!existing.version && plugin?.version) existing.version = String(plugin.version).trim().slice(0, 64);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
}

function renderPlugins() {
  const plugins = collectPlugins();
  if (els.pluginsSummary) {
    els.pluginsSummary.textContent = plugins.length
      ? t("game_monitor.dashboard.plugins.summary_count", { count: fmtNum(plugins.length) }, `${fmtNum(plugins.length)} Plugins erkannt`)
      : t("game_monitor.dashboard.plugins.empty", null, "Noch keine Plugin-Daten aus der Mod erhalten.");
  }
  if (!els.pluginsList) return;
  if (!plugins.length) {
    els.pluginsList.innerHTML = "";
    return;
  }
  els.pluginsList.innerHTML = plugins
    .map((plugin) => {
      const stateLabel = plugin.enabled
        ? t("game_monitor.dashboard.plugins.enabled", null, "Aktiv")
        : t("game_monitor.dashboard.plugins.disabled", null, "Deaktiviert");
      return `
        <article class="plugin-item">
          <div class="plugin-head">
            <span class="plugin-name">${esc(plugin.name)}</span>
            <span class="plugin-state ${plugin.enabled ? "enabled" : "disabled"}">${esc(stateLabel)}</span>
          </div>
          <div class="plugin-version">${esc(plugin.version || t("game_monitor.dashboard.plugins.version_unknown", null, "Version unbekannt"))}</div>
        </article>
      `;
    })
    .join("");
}

function collectRegionalLatency() {
  const buckets = new Map();
  for (const session of activeSessions()) {
    const entries = Array.isArray(session?.regionalLatency) ? session.regionalLatency : [];
    for (const entry of entries) {
      const region = String(entry?.region || "")
        .trim()
        .toLowerCase();
      const pingMs = Number(entry?.pingMs);
      if (!region || !Number.isFinite(pingMs) || pingMs < 0) continue;
      if (!buckets.has(region)) buckets.set(region, { region, sum: 0, count: 0 });
      const bucket = buckets.get(region);
      bucket.sum += pingMs;
      bucket.count += 1;
    }
  }
  return [...buckets.values()]
    .map((bucket) => ({
      region: bucket.region,
      pingMs: bucket.count ? bucket.sum / bucket.count : null,
    }))
    .filter((entry) => Number.isFinite(entry.pingMs))
    .sort((a, b) => Number(a.pingMs) - Number(b.pingMs))
    .slice(0, 24);
}

function renderLatency() {
  const entries = collectRegionalLatency();
  if (els.latencySummary) {
    els.latencySummary.textContent = entries.length
      ? t("game_monitor.dashboard.latency.summary_count", { count: fmtNum(entries.length) }, `${fmtNum(entries.length)} Regionen`)
      : t("game_monitor.dashboard.latency.empty", null, "Noch keine regionalen Latenzwerte verfuegbar.");
  }
  if (!els.latencyList) return;
  if (!entries.length) {
    els.latencyList.innerHTML = "";
    return;
  }
  const maxPing = Math.max(...entries.map((entry) => Number(entry.pingMs || 0)), 1);
  els.latencyList.innerHTML = entries
    .map((entry) => {
      const ratio = Math.min(100, (Number(entry.pingMs || 0) / maxPing) * 100);
      return `
        <article class="latency-item">
          <div class="latency-head">
            <span class="latency-region">${esc(entry.region.toUpperCase())}</span>
            <span class="latency-value">${esc(fmtNum(entry.pingMs, 0))} ms</span>
          </div>
          <div class="latency-bar-wrap"><div class="latency-bar" style="width:${ratio.toFixed(2)}%"></div></div>
        </article>
      `;
    })
    .join("");
}

function renderDiscord() {
  const discord = state.notifications?.discord || null;
  let statusCss = "loading";
  let statusText = t("game_monitor.dashboard.discord.status_loading", null, "Wird geladen");
  let copyText = t("game_monitor.dashboard.discord.status_loading_desc", null, "Discord-Konfiguration wird geladen.");
  let canTest = false;

  if (discord) {
    const configured = discord.configured === true;
    const enabled = discord.enabled === true;
    const maskedWebhook = String(discord.webhookMasked || "").trim();

    if (!configured) {
      statusCss = "warning";
      statusText = t("game_monitor.dashboard.discord.status_not_configured", null, "Nicht konfiguriert");
      copyText = t("game_monitor.dashboard.discord.not_configured_desc", null, "Lege in den Verbindungen einen Discord-Webhook fest.");
    } else if (enabled) {
      statusCss = "online";
      statusText = t("game_monitor.dashboard.discord.status_enabled", null, "Aktiv");
      copyText = t("game_monitor.dashboard.discord.enabled_desc", { webhook: maskedWebhook || "-" }, `Alerts aktiv (${maskedWebhook || "-"})`);
      canTest = true;
    } else {
      statusCss = "warning";
      statusText = t("game_monitor.dashboard.discord.status_disabled", null, "Deaktiviert");
      copyText = t(
        "game_monitor.dashboard.discord.disabled_desc",
        { webhook: maskedWebhook || "-" },
        `Webhook hinterlegt, aber Alerts sind deaktiviert (${maskedWebhook || "-"})`
      );
      canTest = true;
    }
  }

  if (els.discordStatusPill) {
    els.discordStatusPill.textContent = statusText;
    els.discordStatusPill.classList.remove("online", "offline", "loading", "degraded", "revoked", "warning");
    els.discordStatusPill.classList.add(statusCss);
  }
  if (els.discordStatusCopy) els.discordStatusCopy.textContent = copyText;
  if (els.discordTestBtn) els.discordTestBtn.disabled = !canTest || discordTestPending;
}

function renderSessions() {
  if (!els.sessions) return;
  const sessions = sortedSessions();
  if (!sessions.length) {
    els.sessions.innerHTML = `
      <div class="empty-state">
        <div class="title">${esc(t("game_monitor.mod.sessions_empty_title", null, "Keine Mod Session verbunden."))}</div>
        <div class="muted">${esc(
          t("game_monitor.dashboard.sessions.empty_body", null, "Erzeuge einen Pairing-Code und verbinde deinen Minecraft Server mit der Mod.")
        )}</div>
      </div>
    `;
    return;
  }

  els.sessions.innerHTML = sessions
    .map((s) => {
      const statusCss = s?.revokedAt ? "revoked" : s?.online ? "online" : "offline";
      const statusLabel = s?.revokedAt
        ? t("game_monitor.mod.status_revoked", null, "Revoked")
        : s?.online
        ? t("game_monitor.mod.status_online", null, "Online")
        : s?.disconnectedAt
        ? t("game_monitor.mod.status_disconnected", null, "Disconnected")
        : t("game_monitor.mod.status_offline", null, "Offline");

      const playersOnline = Number(s?.metrics?.playersOnline);
      const playersMax = Number(s?.metrics?.playersMax);
      const players =
        Number.isFinite(playersOnline) && Number.isFinite(playersMax)
          ? `${fmtNum(playersOnline)} / ${fmtNum(playersMax)}`
          : Number.isFinite(playersOnline)
          ? fmtNum(playersOnline)
          : "--";

      return `
        <article class="mod-session-card">
          <header class="mod-session-head">
            <h3 class="mod-session-title">${esc(s.serverName || s.serverHost || s.instanceId || "Minecraft")}</h3>
            <span class="status-pill ${esc(statusCss)}">${esc(statusLabel)}</span>
          </header>
          <div class="server-metrics">
            <div class="metric-chip"><span class="metric-chip-label">${esc(t("game_monitor.metrics.tps", null, "TPS"))}</span><span class="metric-chip-value">${esc(
        isNum(s?.metrics?.tps) ? fmtNum(s.metrics.tps, 2) : "--"
      )}</span></div>
            <div class="metric-chip"><span class="metric-chip-label">${esc(t("game_monitor.metrics.ping", null, "Ping"))}</span><span class="metric-chip-value">${esc(
        isNum(s?.metrics?.pingMs) ? `${fmtNum(s.metrics.pingMs)} ms` : "--"
      )}</span></div>
            <div class="metric-chip"><span class="metric-chip-label">${esc(t("game_monitor.metrics.players", null, "Spieler"))}</span><span class="metric-chip-value">${esc(players)}</span></div>
            <div class="metric-chip"><span class="metric-chip-label">${esc(t("game_monitor.metrics.version", null, "Version"))}</span><span class="metric-chip-value">${esc(
        s?.metrics?.version || s?.gameVersion || "--"
      )}</span></div>
          </div>
          <div class="mod-session-meta">
            <span>${esc(t("game_monitor.dashboard.sessions.world", null, "World"))}: ${esc(s?.metrics?.world || "--")}</span>
            <span>${esc(t("game_monitor.mod.instance_label", null, "Instanz"))}: ${esc(s.instanceId || "-")}</span>
            <span>${esc(t("game_monitor.mod.heartbeat_label", null, "Letzter Heartbeat"))}: ${esc(fmtDate(s.lastHeartbeatAt))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderInsight(session) {
  if (!els.insight1 || !els.insight2) return;
  if (!state.sessions.length) {
    els.insight1.textContent = t("game_monitor.dashboard.insight.no_data_1", null, "Noch keine Mod Session verbunden. Erzeuge einen Pairing-Code und verbinde deinen Server.");
    els.insight2.textContent = t("game_monitor.dashboard.insight.no_data_2", null, "Sobald Heartbeats eingehen, erscheinen hier Hinweise zu TPS, Ping und Session-Stabilitaet.");
    return;
  }

  const tps = Number(session?.metrics?.tps);
  const ping = avgPing();

  if (Number.isFinite(tps) && tps >= 19.5) {
    els.insight1.textContent = t("game_monitor.dashboard.insight.stable_tps", null, "TPS liegt stabil nahe 20. Die Tick-Performance sieht gesund aus.");
  } else if (Number.isFinite(tps)) {
    els.insight1.textContent = t("game_monitor.dashboard.insight.low_tps", { tps: fmtNum(tps, 2) }, `TPS liegt bei ${fmtNum(tps, 2)}. Beobachte Lastspitzen.`);
  } else {
    els.insight1.textContent = t("game_monitor.dashboard.insight.waiting_tps", null, "Die Mod sendet aktuell noch keine TPS-Werte.");
  }

  if (Number.isFinite(ping) && ping > 120) {
    els.insight2.textContent = t("game_monitor.dashboard.insight.high_ping", { ping: fmtNum(ping) }, `Ping ist mit ${fmtNum(ping)} ms erhoeht. Netzwerkpfad und Host-Last pruefen.`);
  } else if (onlineCount() < state.sessions.length) {
    els.insight2.textContent = t("game_monitor.dashboard.insight.partial_online", { online: fmtNum(onlineCount()), total: fmtNum(state.sessions.length) }, `${fmtNum(onlineCount())} von ${fmtNum(state.sessions.length)} Sessions sind online.`);
  } else {
    els.insight2.textContent = t("game_monitor.dashboard.insight.healthy", null, "Alle verbundenen Sessions senden regelmaessig Heartbeats.");
  }
}

function renderAll() {
  const session = primarySession();
  renderTopbar(session);
  renderPairing();
  renderSummary(session);
  renderCharts();
  renderLiveMetrics(session);
  renderEvents();
  renderSessions();
  renderPlugins();
  renderLatency();
  renderDiscord();
  renderInsight(session);
}

async function refreshData({ silent = true } = {}) {
  try {
    const [sessionOk] = await Promise.all([
      fetchSessions().catch(() => false),
      fetchPairing().catch(() => false),
      fetchEvents().catch(() => false),
      fetchNotifications().catch(() => false),
    ]);
    state.updatedAt = Date.now();
    updateEvents();
    updateHistory();
    renderAll();
    if (!silent) {
      if (sessionOk) setMsg(t("game_monitor.messages.refreshed", null, "Live-Daten aktualisiert."), "success");
      else setMsg(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
    }
  } catch {
    if (!silent) setMsg(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
  }
}

function bindEvents() {
  if (els.logout) els.logout.addEventListener("click", logout);
  if (els.refresh)
    els.refresh.addEventListener("click", () => {
      refreshData({ silent: false }).catch(() => setMsg(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error"));
    });
  if (els.createPairing)
    els.createPairing.addEventListener("click", () => {
      createPairing().catch(() => setMsg(t("game_monitor.messages.pairing_failed", null, "Code konnte nicht erstellt werden."), "error"));
    });
  if (els.discordTestBtn)
    els.discordTestBtn.addEventListener("click", () => {
      sendDiscordTestAlert().catch(() =>
        setMsg(t("game_monitor.dashboard.discord.test_failed", null, "Discord-Test konnte nicht gesendet werden."), "error")
      );
    });
}

function startLoop() {
  if (loopHandle) clearInterval(loopHandle);
  loopHandle = setInterval(() => {
    refreshData({ silent: true }).catch(() => {
      // ignore refresh loop errors
    });
  }, REFRESH_MS);
}

function stopLoop() {
  if (!loopHandle) return;
  clearInterval(loopHandle);
  loopHandle = null;
}

async function init() {
  const ok = await ensureAuth();
  if (!ok) return;
  bindEvents();
  await refreshData({ silent: true });
  startLoop();
  window.addEventListener("beforeunload", stopLoop);
}

init();

