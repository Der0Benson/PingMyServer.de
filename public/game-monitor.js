const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const refreshButton = document.getElementById("refresh-btn");
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const minecraftServerForm = document.getElementById("minecraft-server-form");
const minecraftServerNameEl = document.getElementById("minecraft-server-name");
const minecraftServerHostEl = document.getElementById("minecraft-server-host");
const minecraftServersListEl = document.getElementById("minecraft-servers-list");
const minecraftMessageEl = document.getElementById("minecraft-message");

const modCreatePairingButton = document.getElementById("mod-create-pairing-btn");
const modPairingBoxEl = document.getElementById("mod-pairing-box");
const modPairingCodeEl = document.getElementById("mod-pairing-code");
const modPairingExpiryEl = document.getElementById("mod-pairing-expiry");
const modMessageEl = document.getElementById("mod-message");
const modSessionsListEl = document.getElementById("mod-sessions-list");

const MINECRAFT_STORAGE_KEY = "pms.gameMonitor.minecraftServers";
const MINECRAFT_DEFAULT_PORT = 25565;
const MINECRAFT_REFRESH_INTERVAL_MS = 30000;
const MINECRAFT_MAX_TRACKED_SERVERS = 40;
const GAME_AGENT_GAME = "minecraft";

let user = null;
let minecraftServers = [];
const minecraftStatusById = new Map();
const minecraftPendingById = new Set();
let refreshIntervalHandle = null;

let activeModPairing = null;
let modSessions = [];

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

function setPanelMessage(text, type = "") {
  if (!minecraftMessageEl) return;
  minecraftMessageEl.textContent = text || "";
  minecraftMessageEl.classList.remove("error", "success");
  if (type) minecraftMessageEl.classList.add(type);
}

function setModMessage(text, type = "") {
  if (!modMessageEl) return;
  modMessageEl.textContent = text || "";
  modMessageEl.classList.remove("error", "success");
  if (type) modMessageEl.classList.add(type);
}

function syncOwnerLinks() {
  const isOwner = !!user?.isOwner;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
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

function createServerId() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeMinecraftHost(input) {
  const host = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!host || host.length > 253) return "";
  if (host.includes(":")) return "";
  if (!/^[a-z0-9.-]+$/.test(host)) return "";
  if (host.includes("..")) return "";

  const labels = host.split(".");
  for (const label of labels) {
    if (!label || label.length > 63) return "";
    if (label.startsWith("-") || label.endsWith("-")) return "";
  }

  return host;
}

function normalizeMinecraftPort(input, fallback = MINECRAFT_DEFAULT_PORT) {
  const raw = String(input || "").trim();
  if (!raw) return fallback;
  if (!/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function parseMinecraftAddress(rawInput) {
  let raw = String(rawInput || "").trim();
  if (!raw) return null;

  raw = raw.replace(/^minecraft:\/\//i, "").trim();
  raw = raw.replace(/^tcp:\/\//i, "").trim();

  if (/^[a-z]+:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      raw = parsed.host || "";
    } catch (error) {
      return null;
    }
  }

  raw = raw.replace(/\s+/g, "");
  if (!raw || raw.startsWith("[")) return null;

  let hostRaw = raw;
  let port = MINECRAFT_DEFAULT_PORT;
  const lastColon = raw.lastIndexOf(":");
  if (lastColon > 0 && raw.indexOf(":") === lastColon) {
    const hostPart = raw.slice(0, lastColon).trim();
    const portPart = raw.slice(lastColon + 1).trim();
    const parsedPort = normalizeMinecraftPort(portPart, null);
    if (!parsedPort) return null;
    hostRaw = hostPart;
    port = parsedPort;
  }

  const host = normalizeMinecraftHost(hostRaw);
  if (!host) return null;
  return { host, port };
}

function normalizeServerName(input, fallbackHost) {
  const cleaned = String(input || "").trim().replace(/\s+/g, " ");
  if (cleaned) return cleaned.slice(0, 80);
  return String(fallbackHost || "").slice(0, 80);
}

function readStoredMinecraftServers() {
  let parsed = [];
  try {
    const raw = window.localStorage.getItem(MINECRAFT_STORAGE_KEY);
    parsed = JSON.parse(raw || "[]");
  } catch (error) {
    parsed = [];
  }

  if (!Array.isArray(parsed)) return [];
  const unique = new Set();
  const result = [];

  for (const entry of parsed) {
    const host = normalizeMinecraftHost(entry?.host);
    const port = normalizeMinecraftPort(entry?.port, null);
    if (!host || !port) continue;

    const dedupeKey = `${host}:${port}`;
    if (unique.has(dedupeKey)) continue;
    unique.add(dedupeKey);

    result.push({
      id: String(entry?.id || createServerId()),
      name: normalizeServerName(entry?.name, host),
      host,
      port,
      createdAt: Number.isFinite(Number(entry?.createdAt)) ? Number(entry.createdAt) : Date.now(),
    });
  }

  return result;
}

function persistMinecraftServers() {
  try {
    window.localStorage.setItem(MINECRAFT_STORAGE_KEY, JSON.stringify(minecraftServers));
  } catch (error) {
    // ignore
  }
}

function formatDateTime(value) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}

function getErrorLabel(code) {
  const normalized = String(code || "").trim();
  if (!normalized) return "";
  return t(`game_monitor.error_codes.${normalized}`, null, normalized.replaceAll("_", " "));
}

function buildOfflineStatus(errorCode = "probe_failed") {
  return {
    online: false,
    pingMs: null,
    tps: null,
    players: { online: null, max: null, sample: [] },
    version: null,
    protocol: null,
    motd: null,
    checkedAt: Date.now(),
    errorCode,
  };
}

function renderEmptyMinecraftState() {
  if (!minecraftServersListEl) return;
  minecraftServersListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(t("game_monitor.empty.title", null, "Noch keine Server hinterlegt."))}</div>
      <div class="muted">${escapeHtml(t("game_monitor.empty.body", null, "Füge deinen ersten Minecraft Server hinzu."))}</div>
    </div>
  `;
}

function renderMinecraftServers() {
  if (!minecraftServersListEl) return;

  if (!minecraftServers.length) {
    renderEmptyMinecraftState();
    return;
  }

  const cards = minecraftServers.map((server) => {
    const status = minecraftStatusById.get(server.id);
    const isLoading = minecraftPendingById.has(server.id);
    const isOnline = !isLoading && status?.online === true;
    const stateClass = isLoading ? "loading" : isOnline ? "online" : "offline";
    const stateLabel = isLoading
      ? t("game_monitor.state.loading", null, "Wird aktualisiert")
      : isOnline
      ? t("game_monitor.state.online", null, "Online")
      : t("game_monitor.state.offline", null, "Offline");

    const pingText = Number.isFinite(Number(status?.pingMs)) ? `${Math.round(Number(status.pingMs))} ms` : "--";
    const tpsValue = Number(status?.tps);
    const tpsText = Number.isFinite(tpsValue) ? String(tpsValue) : t("game_monitor.metrics.tps_na", null, "n/a");
    const playersOnline = Number(status?.players?.online);
    const playersMax = Number(status?.players?.max);
    const playersText =
      Number.isFinite(playersOnline) && Number.isFinite(playersMax)
        ? `${playersOnline} / ${playersMax}`
        : Number.isFinite(playersOnline)
        ? String(playersOnline)
        : "--";
    const motd = status?.motd ? String(status.motd) : t("game_monitor.metrics.motd_empty", null, "Keine MOTD verfügbar.");
    const version = String(status?.version || "").trim() || "--";
    const updatedAt = formatDateTime(status?.checkedAt);
    const errorLabel = getErrorLabel(status?.errorCode);
    const sample = Array.isArray(status?.players?.sample) ? status.players.sample.slice(0, 10).join(", ") : "";

    return `
      <article class="minecraft-server-card" data-server-id="${escapeHtml(server.id)}">
        <header class="server-card-head">
          <div class="server-title-wrap">
            <h3 class="server-title">${escapeHtml(server.name || server.host)}</h3>
            <div class="server-target">${escapeHtml(`${server.host}:${server.port}`)}</div>
          </div>
          <div class="server-head-actions">
            <span class="status-pill ${stateClass}">${escapeHtml(stateLabel)}</span>
            <button class="btn ghost server-delete" type="button" data-remove-server="${escapeHtml(server.id)}">
              ${escapeHtml(t("common.delete", null, "Löschen"))}
            </button>
          </div>
        </header>

        <div class="server-metrics">
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.ping", null, "Ping"))}</span>
            <span class="metric-chip-value">${escapeHtml(pingText)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.tps", null, "TPS"))}</span>
            <span class="metric-chip-value">${escapeHtml(tpsText)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.players", null, "Spieler"))}</span>
            <span class="metric-chip-value">${escapeHtml(playersText)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.version", null, "Version"))}</span>
            <span class="metric-chip-value">${escapeHtml(version)}</span>
          </div>
        </div>

        <p class="server-motd">${escapeHtml(motd)}</p>
        <div class="server-extra">
          <span>${escapeHtml(t("game_monitor.metrics.updated", null, "Aktualisiert"))}: ${escapeHtml(updatedAt)}</span>
          ${
            sample
              ? `<span>${escapeHtml(t("game_monitor.metrics.sample", null, "Beispielspieler"))}: ${escapeHtml(sample)}</span>`
              : ""
          }
        </div>
        ${errorLabel ? `<p class="server-error">${escapeHtml(errorLabel)}</p>` : ""}
      </article>
    `;
  });

  minecraftServersListEl.innerHTML = cards.join("");
  const removeButtons = minecraftServersListEl.querySelectorAll("[data-remove-server]");
  for (const button of removeButtons) {
    button.addEventListener("click", () => {
      const serverId = String(button.getAttribute("data-remove-server") || "");
      removeMinecraftServer(serverId);
    });
  }
}

async function fetchMinecraftStatus(server) {
  const params = new URLSearchParams();
  params.set("host", server.host);
  params.set("port", String(server.port));

  try {
    const response = await fetch(`/api/game-monitor/minecraft/status?${params.toString()}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return buildOfflineStatus("unauthorized");
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const errorToken = String(payload?.error || "").trim().toLowerCase();
      if (errorToken.includes("target blocked")) return buildOfflineStatus("target_blocked");
      if (errorToken.includes("invalid input")) return buildOfflineStatus("invalid_input");
      return buildOfflineStatus("request_failed");
    }

    if (!payload?.ok || !payload?.data) {
      return buildOfflineStatus("request_failed");
    }

    const data = payload.data;
    return {
      online: data.online === true,
      pingMs: Number.isFinite(Number(data.pingMs)) ? Number(data.pingMs) : null,
      tps: Number.isFinite(Number(data.tps)) ? Number(data.tps) : null,
      players: {
        online: Number.isFinite(Number(data?.players?.online)) ? Number(data.players.online) : null,
        max: Number.isFinite(Number(data?.players?.max)) ? Number(data.players.max) : null,
        sample: Array.isArray(data?.players?.sample) ? data.players.sample.slice(0, 20).map((x) => String(x)) : [],
      },
      version: String(data.version || "").trim() || null,
      protocol: Number.isFinite(Number(data.protocol)) ? Number(data.protocol) : null,
      motd: String(data.motd || "").trim() || null,
      checkedAt: Number.isFinite(Number(data.checkedAt)) ? Number(data.checkedAt) : Date.now(),
      errorCode: String(data.errorCode || "").trim(),
    };
  } catch (error) {
    return buildOfflineStatus("connection_failed");
  }
}

async function refreshMinecraftServers() {
  if (!minecraftServers.length) {
    renderMinecraftServers();
    return;
  }

  for (const server of minecraftServers) {
    minecraftPendingById.add(server.id);
  }
  renderMinecraftServers();

  await Promise.all(
    minecraftServers.map(async (server) => {
      const nextStatus = await fetchMinecraftStatus(server);
      minecraftStatusById.set(server.id, nextStatus);
      minecraftPendingById.delete(server.id);
    })
  );

  renderMinecraftServers();
}

async function addMinecraftServer(event) {
  event.preventDefault();

  if (!minecraftServerHostEl) return;
  const parsed = parseMinecraftAddress(minecraftServerHostEl.value);
  if (!parsed) {
    setPanelMessage(t("game_monitor.messages.invalid_address", null, "Bitte gib einen gültigen Host ein."), "error");
    return;
  }

  const duplicate = minecraftServers.some((entry) => entry.host === parsed.host && entry.port === parsed.port);
  if (duplicate) {
    setPanelMessage(t("game_monitor.messages.duplicate", null, "Server ist bereits in der Liste."), "error");
    return;
  }

  if (minecraftServers.length >= MINECRAFT_MAX_TRACKED_SERVERS) {
    setPanelMessage(
      t(
        "game_monitor.messages.limit",
        { count: MINECRAFT_MAX_TRACKED_SERVERS },
        `Maximal ${MINECRAFT_MAX_TRACKED_SERVERS} Server möglich.`
      ),
      "error"
    );
    return;
  }

  const server = {
    id: createServerId(),
    name: normalizeServerName(minecraftServerNameEl?.value, parsed.host),
    host: parsed.host,
    port: parsed.port,
    createdAt: Date.now(),
  };

  minecraftServers.unshift(server);
  persistMinecraftServers();
  if (minecraftServerNameEl) minecraftServerNameEl.value = "";
  minecraftServerHostEl.value = "";
  setPanelMessage(t("game_monitor.messages.added", null, "Server hinzugefügt."), "success");
  await refreshMinecraftServers();
}

function removeMinecraftServer(serverId) {
  const normalizedId = String(serverId || "").trim();
  if (!normalizedId) return;

  minecraftServers = minecraftServers.filter((entry) => entry.id !== normalizedId);
  minecraftStatusById.delete(normalizedId);
  minecraftPendingById.delete(normalizedId);
  persistMinecraftServers();
  renderMinecraftServers();
  setPanelMessage(t("game_monitor.messages.removed", null, "Server entfernt."), "success");
}

function getModStatusLabel(session) {
  if (session?.revokedAt) {
    return {
      css: "revoked",
      label: t("game_monitor.mod.status_revoked", null, "Revoked"),
    };
  }
  if (session?.online) {
    return {
      css: "online",
      label: t("game_monitor.mod.status_online", null, "Online"),
    };
  }
  if (session?.disconnectedAt) {
    return {
      css: "offline",
      label: t("game_monitor.mod.status_disconnected", null, "Disconnected"),
    };
  }
  return {
    css: "offline",
    label: t("game_monitor.mod.status_offline", null, "Offline"),
  };
}

function renderModPairing() {
  if (!modPairingBoxEl || !modPairingCodeEl || !modPairingExpiryEl) return;

  if (!activeModPairing || !activeModPairing.code) {
    modPairingBoxEl.hidden = true;
    return;
  }

  modPairingCodeEl.textContent = String(activeModPairing.code || "").trim() || "------";
  modPairingExpiryEl.textContent = formatDateTime(activeModPairing.expiresAt);
  modPairingBoxEl.hidden = false;
}

function renderEmptyModSessions() {
  if (!modSessionsListEl) return;
  modSessionsListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(t("game_monitor.mod.sessions_empty_title", null, "Keine Mod Session verbunden."))}</div>
      <div class="muted">${escapeHtml(
        t("game_monitor.mod.sessions_empty_body", null, "Erzeuge einen Pairing-Code und verbinde deinen Minecraft Mod.")
      )}</div>
    </div>
  `;
}

function renderModSessions() {
  if (!modSessionsListEl) return;

  if (!modSessions.length) {
    renderEmptyModSessions();
    return;
  }

  const items = modSessions.map((session) => {
    const status = getModStatusLabel(session);
    const tps = Number.isFinite(Number(session?.metrics?.tps))
      ? String(session.metrics.tps)
      : t("game_monitor.metrics.tps_na", null, "n/a");
    const ping = Number.isFinite(Number(session?.metrics?.pingMs)) ? `${Math.round(Number(session.metrics.pingMs))} ms` : "--";
    const playersOnline = Number(session?.metrics?.playersOnline);
    const playersMax = Number(session?.metrics?.playersMax);
    const players =
      Number.isFinite(playersOnline) && Number.isFinite(playersMax)
        ? `${playersOnline} / ${playersMax}`
        : Number.isFinite(playersOnline)
        ? String(playersOnline)
        : "--";
    const version = String(session?.metrics?.version || session?.gameVersion || "").trim() || "--";
    const revokeButton = session?.revokedAt
      ? ""
      : `
            <button class="btn ghost server-delete" type="button" data-revoke-session="${escapeHtml(session.id || "")}">
              ${escapeHtml(t("game_monitor.mod.revoke", null, "Session trennen"))}
            </button>
          `;

    return `
      <article class="mod-session-card">
        <header class="mod-session-head">
          <h3 class="mod-session-title">${escapeHtml(session.serverName || session.serverHost || session.instanceId || "Minecraft")}</h3>
          <div class="server-head-actions">
            <span class="status-pill ${escapeHtml(status.css)}">${escapeHtml(status.label)}</span>
            ${revokeButton}
          </div>
        </header>

        <div class="server-metrics">
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.tps", null, "TPS"))}</span>
            <span class="metric-chip-value">${escapeHtml(tps)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.ping", null, "Ping"))}</span>
            <span class="metric-chip-value">${escapeHtml(ping)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.players", null, "Spieler"))}</span>
            <span class="metric-chip-value">${escapeHtml(players)}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-chip-label">${escapeHtml(t("game_monitor.metrics.version", null, "Version"))}</span>
            <span class="metric-chip-value">${escapeHtml(version)}</span>
          </div>
        </div>

        <div class="mod-session-meta">
          <span>${escapeHtml(t("game_monitor.mod.instance_label", null, "Instanz"))}: ${escapeHtml(session.instanceId || "-")}</span>
          <span>${escapeHtml(t("game_monitor.mod.heartbeat_label", null, "Letzter Heartbeat"))}: ${escapeHtml(formatDateTime(session.lastHeartbeatAt))}</span>
          ${
            session.modVersion
              ? `<span>${escapeHtml(t("game_monitor.mod.mod_version_label", null, "Mod Version"))}: ${escapeHtml(session.modVersion)}</span>`
              : ""
          }
        </div>
      </article>
    `;
  });

  modSessionsListEl.innerHTML = items.join("");

  const revokeButtons = modSessionsListEl.querySelectorAll("[data-revoke-session]");
  for (const button of revokeButtons) {
    button.addEventListener("click", () => {
      const sessionId = String(button.getAttribute("data-revoke-session") || "").trim();
      if (!sessionId) return;
      revokeModSession(sessionId).catch(() => {
        setModMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
      });
    });
  }
}

async function fetchModPairings() {
  const response = await fetch(`/api/game-agent/pairings?game=${encodeURIComponent(GAME_AGENT_GAME)}`, { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!response.ok) {
    activeModPairing = null;
    renderModPairing();
    return;
  }
  const payload = await response.json().catch(() => null);
  const list = Array.isArray(payload?.data) ? payload.data : [];
  activeModPairing = list[0] || null;
  renderModPairing();
}

async function fetchModSessions() {
  const response = await fetch(`/api/game-agent/sessions?game=${encodeURIComponent(GAME_AGENT_GAME)}`, { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!response.ok) {
    modSessions = [];
    renderModSessions();
    return;
  }
  const payload = await response.json().catch(() => null);
  modSessions = Array.isArray(payload?.data?.sessions) ? payload.data.sessions : [];
  renderModSessions();
}

async function refreshModState() {
  await Promise.all([fetchModPairings(), fetchModSessions()]);
}

async function createModPairing() {
  const response = await fetch("/api/game-agent/pairings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: GAME_AGENT_GAME }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.data) {
    setModMessage(t("game_monitor.messages.pairing_failed", null, "Code konnte nicht erstellt werden."), "error");
    return;
  }

  activeModPairing = payload.data;
  renderModPairing();
  setModMessage(t("game_monitor.messages.pairing_created", null, "Pairing-Code erstellt."), "success");
}

async function revokeModSession(sessionId) {
  const response = await fetch(`/api/game-agent/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok) {
    setModMessage(t("game_monitor.messages.session_revoke_failed", null, "Session konnte nicht getrennt werden."), "error");
    return;
  }

  setModMessage(t("game_monitor.messages.session_revoked", null, "Session getrennt."), "success");
  await fetchModSessions();
}

async function refreshAllData() {
  await Promise.all([refreshMinecraftServers(), refreshModState()]);
}

function startRefreshLoop() {
  if (refreshIntervalHandle) {
    clearInterval(refreshIntervalHandle);
  }

  refreshIntervalHandle = setInterval(() => {
    refreshAllData().catch(() => {
      // ignore loop errors
    });
  }, MINECRAFT_REFRESH_INTERVAL_MS);
}

function stopRefreshLoop() {
  if (!refreshIntervalHandle) return;
  clearInterval(refreshIntervalHandle);
  refreshIntervalHandle = null;
}

async function ensureAuthenticated() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!response.ok) {
      window.location.href = "/login";
      return false;
    }

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

  minecraftServers = readStoredMinecraftServers();
  renderMinecraftServers();
  renderModPairing();
  renderModSessions();

  if (minecraftServerForm) {
    minecraftServerForm.addEventListener("submit", (event) => {
      addMinecraftServer(event).catch(() => {
        setPanelMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
      });
    });
  }

  if (modCreatePairingButton) {
    modCreatePairingButton.addEventListener("click", () => {
      createModPairing().catch(() => {
        setModMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
      });
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshAllData()
        .then(() => {
          setPanelMessage(t("game_monitor.messages.refreshed", null, "Live-Daten aktualisiert."), "success");
          setModMessage(t("game_monitor.messages.refreshed", null, "Live-Daten aktualisiert."), "success");
        })
        .catch(() => {
          setPanelMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
          setModMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
        });
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  window.addEventListener("beforeunload", stopRefreshLoop);
  startRefreshLoop();
  await refreshAllData();
}

init();
