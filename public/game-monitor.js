const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const refreshButton = document.getElementById("refresh-btn");
const addGameButton = document.getElementById("add-game-btn");
const addDirectServerButton = document.getElementById("add-direct-server-btn");
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const gameListEl = document.getElementById("game-list");
const overviewGameLabelEl = document.getElementById("overview-game-label");
const overviewTitleEl = document.getElementById("overview-title");
const overviewSubEl = document.getElementById("overview-sub");
const overviewStatusPillEl = document.getElementById("overview-status-pill");
const kpiHealthEl = document.getElementById("kpi-health");
const kpiHealthSubEl = document.getElementById("kpi-health-sub");
const kpiOnlineEl = document.getElementById("kpi-online");
const kpiTotalEl = document.getElementById("kpi-total");
const kpiUpdatedEl = document.getElementById("kpi-updated");

const minecraftServersListEl = document.getElementById("minecraft-servers-list");
const minecraftMessageEl = document.getElementById("minecraft-message");
const directProbePanelEl = document.getElementById("direct-probe-panel");
const directProbeUnavailableEl = document.getElementById("direct-probe-unavailable");

const modCreatePairingButton = document.getElementById("mod-create-pairing-btn");
const modPairingBoxEl = document.getElementById("mod-pairing-box");
const modPairingCodeEl = document.getElementById("mod-pairing-code");
const modPairingExpiryEl = document.getElementById("mod-pairing-expiry");
const modMessageEl = document.getElementById("mod-message");
const modSessionsListEl = document.getElementById("mod-sessions-list");

const gameModalEl = document.getElementById("game-modal");
const gameModalForm = document.getElementById("game-modal-form");
const gameModalCloseButton = document.getElementById("game-modal-close");
const gameModalCancelButton = document.getElementById("game-modal-cancel");
const gameModalSubmitButton = document.getElementById("game-modal-submit");
const gameModalNameEl = document.getElementById("game-modal-name");
const gameModalKeyEl = document.getElementById("game-modal-key");
const gameModalServerNameEl = document.getElementById("game-modal-server-name");
const gameModalHostEl = document.getElementById("game-modal-host");
const gameModalMessageEl = document.getElementById("game-modal-message");
const gameModalModeInputs = Array.from(document.querySelectorAll("input[name='game-connection-mode']"));
const gameModalIpFieldsEl = document.getElementById("game-modal-ip-fields");
const gameModalKeyFieldsEl = document.getElementById("game-modal-key-fields");
const gameModalPairingBoxEl = document.getElementById("game-modal-pairing-box");
const gameModalPairingCodeEl = document.getElementById("game-modal-pairing-code");
const gameModalPairingExpiryEl = document.getElementById("game-modal-pairing-expiry");

const GAME_STORAGE_KEY = "pms.gameMonitor.games";
const MINECRAFT_STORAGE_KEY = "pms.gameMonitor.minecraftServers";
const MINECRAFT_DEFAULT_PORT = 25565;
const MINECRAFT_REFRESH_INTERVAL_MS = 30000;
const MINECRAFT_MAX_TRACKED_SERVERS = 40;
const GAME_AGENT_DEFAULT_GAME = "minecraft";

let user = null;
let games = [];
let activeGame = GAME_AGENT_DEFAULT_GAME;
let minecraftServers = [];
const minecraftStatusById = new Map();
const minecraftPendingById = new Set();
let refreshIntervalHandle = null;

const modStateByGame = new Map();
let gameModalKeyTouched = false;

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

function setModalMessage(text, type = "") {
  if (!gameModalMessageEl) return;
  gameModalMessageEl.textContent = text || "";
  gameModalMessageEl.classList.remove("error", "success");
  if (type) gameModalMessageEl.classList.add(type);
}

function normalizeGameKey(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (normalized.length < 2 || normalized.length > 24) return fallback;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) return fallback;
  return normalized;
}

function slugifyGameKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalizeGameKey(raw, "");
}

function toReadableGameName(game) {
  return String(game || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function sanitizeGameName(value, fallback = "") {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.slice(0, 60);
}

function normalizeConnectionMode(value) {
  return String(value || "").toLowerCase() === "ip" ? "ip" : "key";
}

function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function getDefaultGameEntries() {
  return [
    {
      id: "game_minecraft",
      key: GAME_AGENT_DEFAULT_GAME,
      name: "Minecraft",
      connectionMode: "ip",
      createdAt: 0,
      system: true,
    },
  ];
}

function normalizeStoredGame(entry) {
  const key = normalizeGameKey(entry?.key || entry?.game, "");
  if (!key) return null;
  const name = sanitizeGameName(entry?.name, toReadableGameName(key));
  const connectionMode = normalizeConnectionMode(entry?.connectionMode || entry?.mode);
  const createdAtRaw = Number(entry?.createdAt);
  const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();
  const id = String(entry?.id || createId("game")).trim() || createId("game");
  return {
    id,
    key,
    name,
    connectionMode,
    createdAt,
    system: false,
  };
}

function readStoredGames() {
  let parsed = [];
  try {
    const raw = window.localStorage.getItem(GAME_STORAGE_KEY);
    parsed = JSON.parse(raw || "[]");
  } catch (error) {
    parsed = [];
  }

  const byKey = new Map();
  for (const base of getDefaultGameEntries()) {
    byKey.set(base.key, { ...base });
  }

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const normalized = normalizeStoredGame(entry);
      if (!normalized) continue;
      const existing = byKey.get(normalized.key);
      if (existing) {
        byKey.set(normalized.key, {
          ...existing,
          name: normalized.name || existing.name,
          connectionMode: normalized.connectionMode || existing.connectionMode,
          createdAt: Math.min(Number(existing.createdAt || 0), Number(normalized.createdAt || Date.now())),
        });
      } else {
        byKey.set(normalized.key, normalized);
      }
    }
  }

  const result = [...byKey.values()];
  result.sort((a, b) => {
    const systemRankA = a.system ? 0 : 1;
    const systemRankB = b.system ? 0 : 1;
    if (systemRankA !== systemRankB) return systemRankA - systemRankB;
    const timeA = Number(a.createdAt || 0);
    const timeB = Number(b.createdAt || 0);
    if (timeA !== timeB) return timeA - timeB;
    return String(a.name || "").localeCompare(String(b.name || ""), "de");
  });

  return result;
}

function persistGames() {
  try {
    const payload = games.map((game) => ({
      id: game.id,
      key: game.key,
      name: game.name,
      connectionMode: game.connectionMode,
      createdAt: game.createdAt,
    }));
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // ignore
  }
}

function getGameByKey(gameKey) {
  const normalizedKey = normalizeGameKey(gameKey, "");
  if (!normalizedKey) return null;
  return games.find((entry) => entry.key === normalizedKey) || null;
}

function getActiveGameEntry() {
  return getGameByKey(activeGame) || getGameByKey(GAME_AGENT_DEFAULT_GAME) || null;
}

function getActiveGameDisplayName() {
  const game = getActiveGameEntry();
  if (game && game.name) return game.name;
  return toReadableGameName(activeGame) || "Game";
}

function upsertGame(partial) {
  const key = normalizeGameKey(partial?.key, "");
  if (!key) return null;
  const fallbackName = toReadableGameName(key) || "Game";
  const name = sanitizeGameName(partial?.name, fallbackName);
  const connectionMode = normalizeConnectionMode(partial?.connectionMode);

  const existingIndex = games.findIndex((entry) => entry.key === key);
  if (existingIndex >= 0) {
    const existing = games[existingIndex];
    games[existingIndex] = {
      ...existing,
      name,
      connectionMode,
    };
  } else {
    games.push({
      id: createId("game"),
      key,
      name,
      connectionMode,
      createdAt: Date.now(),
      system: false,
    });
  }

  games.sort((a, b) => {
    const systemRankA = a.system ? 0 : 1;
    const systemRankB = b.system ? 0 : 1;
    if (systemRankA !== systemRankB) return systemRankA - systemRankB;
    const timeA = Number(a.createdAt || 0);
    const timeB = Number(b.createdAt || 0);
    if (timeA !== timeB) return timeA - timeB;
    return String(a.name || "").localeCompare(String(b.name || ""), "de");
  });

  persistGames();
  return getGameByKey(key);
}

function getModState(game = activeGame) {
  const normalizedGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  const existing = modStateByGame.get(normalizedGame);
  if (existing) return existing;
  const state = { pairing: null, sessions: [] };
  modStateByGame.set(normalizedGame, state);
  return state;
}

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

function setOverviewStatusPill(text, statusClass) {
  if (!overviewStatusPillEl) return;
  overviewStatusPillEl.textContent = String(text || "-");
  overviewStatusPillEl.classList.remove("online", "offline", "loading");
  overviewStatusPillEl.classList.add(statusClass || "loading");
}

function updateOverviewHeader() {
  const game = getActiveGameEntry();
  const gameName = game?.name || toReadableGameName(activeGame) || "Game";
  const gameKey = game?.key || activeGame;

  if (overviewGameLabelEl) {
    overviewGameLabelEl.textContent = `Game: ${String(gameKey || "").toUpperCase()}`;
  }
  if (overviewTitleEl) {
    overviewTitleEl.textContent = gameName;
  }
  if (overviewSubEl) {
    overviewSubEl.textContent =
      gameKey === GAME_AGENT_DEFAULT_GAME
        ? "Direkte Server + Agent Sessions in einer Übersicht."
        : "Agent Sessions und Connection Keys für dieses Spiel.";
  }
}

function updateDirectProbeVisibility() {
  const showDirectProbe = activeGame === GAME_AGENT_DEFAULT_GAME;
  if (directProbePanelEl) {
    directProbePanelEl.hidden = !showDirectProbe;
  }
  if (directProbeUnavailableEl) {
    directProbeUnavailableEl.hidden = showDirectProbe;
    if (!showDirectProbe) {
      const gameLabel = getActiveGameDisplayName();
      directProbeUnavailableEl.textContent = t(
        "game_monitor.messages.direct_probe_unavailable",
        { game: gameLabel },
        `Direkte Server-Abfrage ist aktuell nur für Minecraft verfügbar. Nutze für ${gameLabel} die Agent-Verbindung.`
      );
    } else {
      directProbeUnavailableEl.textContent = "";
    }
  }
}

function updateOverviewStats() {
  const modState = getModState(activeGame);
  const sessions = Array.isArray(modState.sessions) ? modState.sessions : [];
  const onlineSessions = sessions.filter((session) => session?.online).length;

  let directTotal = 0;
  let directOnline = 0;
  let latestTs = 0;

  if (activeGame === GAME_AGENT_DEFAULT_GAME) {
    directTotal = minecraftServers.length;
    for (const server of minecraftServers) {
      const status = minecraftStatusById.get(server.id);
      if (status?.online) directOnline += 1;
      const checkedAt = Number(status?.checkedAt || 0);
      if (Number.isFinite(checkedAt) && checkedAt > latestTs) latestTs = checkedAt;
    }
  }

  for (const session of sessions) {
    const heartbeat = Number(session?.lastHeartbeatAt || session?.connectedAt || 0);
    if (Number.isFinite(heartbeat) && heartbeat > latestTs) latestTs = heartbeat;
  }

  const total = directTotal + sessions.length;
  const online = directOnline + onlineSessions;

  let healthLabel = "Keine Verbindung";
  let healthSub = "Noch keine Targets oder Sessions";
  let pillClass = "loading";

  if (total > 0 && online > 0) {
    healthLabel = "Online";
    healthSub = `${online} von ${total} aktiv`;
    pillClass = "online";
  } else if (total > 0) {
    healthLabel = "Offline";
    healthSub = `0 von ${total} aktiv`;
    pillClass = "offline";
  }

  if (kpiHealthEl) kpiHealthEl.textContent = healthLabel;
  if (kpiHealthSubEl) kpiHealthSubEl.textContent = healthSub;
  if (kpiOnlineEl) kpiOnlineEl.textContent = String(online);
  if (kpiTotalEl) kpiTotalEl.textContent = String(total);
  if (kpiUpdatedEl) kpiUpdatedEl.textContent = latestTs > 0 ? formatDateTime(latestTs) : "-";
  setOverviewStatusPill(healthLabel, pillClass);
}

function setActiveGameInUrl(gameKey) {
  try {
    const nextUrl = new URL(window.location.href);
    if (gameKey === GAME_AGENT_DEFAULT_GAME) {
      nextUrl.searchParams.delete("game");
    } else {
      nextUrl.searchParams.set("game", gameKey);
    }
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  } catch (error) {
    // ignore
  }
}

function renderGameList() {
  if (!gameListEl) return;

  if (!games.length) {
    gameListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">Keine Spiele konfiguriert.</div>
        <div class="muted">Starte mit "Neues Spiel hinzufügen".</div>
      </div>
    `;
    return;
  }

  const html = games
    .map((game) => {
      const isActive = game.key === activeGame;
      const note =
        game.key === GAME_AGENT_DEFAULT_GAME
          ? "Direkt via IP und Agent/Key"
          : game.connectionMode === "ip"
          ? "Direkt via IP"
          : "Agent/Mod mit Connection Key";

      return `
        <button class="game-item ${isActive ? "active" : ""}" type="button" data-game="${escapeHtml(game.key)}" ${
        isActive ? 'aria-current="page"' : ""
      }>
          <span class="game-item-name">${escapeHtml(game.name || toReadableGameName(game.key))}</span>
          <span class="game-item-note">${escapeHtml(note)}</span>
        </button>
      `;
    })
    .join("");

  gameListEl.innerHTML = html;

  const buttons = gameListEl.querySelectorAll("[data-game]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const nextGame = normalizeGameKey(button.getAttribute("data-game"), "");
      if (!nextGame || nextGame === activeGame) return;
      setActiveGame(nextGame).catch(() => {
        setModMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
      });
    });
  }
}

async function setActiveGame(gameKey, options = {}) {
  const nextGame = normalizeGameKey(gameKey, GAME_AGENT_DEFAULT_GAME);
  const availableGame = getGameByKey(nextGame) ? nextGame : GAME_AGENT_DEFAULT_GAME;
  const shouldRefresh = options.refresh !== false;

  activeGame = availableGame;
  setActiveGameInUrl(availableGame);

  renderGameList();
  updateOverviewHeader();
  updateDirectProbeVisibility();
  renderMinecraftServers();
  renderModPairing();
  renderModSessions();
  updateOverviewStats();
  setPanelMessage("");
  setModMessage("");

  if (!shouldRefresh) return;
  await refreshAllData();
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
  return createId("gm");
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
    updateOverviewStats();
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
  updateOverviewStats();
}

function addMinecraftServerEntry(input) {
  const host = normalizeMinecraftHost(input?.host);
  const port = normalizeMinecraftPort(input?.port, null);
  if (!host || !port) return { ok: false, error: "invalid" };

  const duplicate = minecraftServers.some((entry) => entry.host === host && entry.port === port);
  if (duplicate) return { ok: false, error: "duplicate" };

  if (minecraftServers.length >= MINECRAFT_MAX_TRACKED_SERVERS) {
    return { ok: false, error: "limit" };
  }

  const server = {
    id: createServerId(),
    name: normalizeServerName(input?.name, host),
    host,
    port,
    createdAt: Date.now(),
  };

  minecraftServers.unshift(server);
  persistMinecraftServers();
  renderMinecraftServers();
  return { ok: true, server };
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
  updateOverviewStats();
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
  const state = getModState(activeGame);
  const activeModPairing = state.pairing;

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
  const gameLabel = getActiveGameDisplayName();
  modSessionsListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(t("game_monitor.mod.sessions_empty_title", null, "Keine Mod Session verbunden."))}</div>
      <div class="muted">${escapeHtml(
        t("game_monitor.mod.sessions_empty_body", { game: gameLabel }, `Verbinde deinen ${gameLabel} Agent/Mod.`)
      )}</div>
    </div>
  `;
}

function renderModSessions() {
  if (!modSessionsListEl) return;
  const state = getModState(activeGame);
  const modSessions = Array.isArray(state.sessions) ? state.sessions : [];

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
          <h3 class="mod-session-title">${escapeHtml(
            session.serverName || session.serverHost || session.instanceId || getActiveGameDisplayName()
          )}</h3>
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
      revokeModSession(sessionId, activeGame).catch(() => {
        setModMessage(t("common.connection_failed", null, "Verbindung fehlgeschlagen."), "error");
      });
    });
  }
}

async function fetchModPairings(game = activeGame) {
  const targetGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  const response = await fetch(`/api/game-agent/pairings?game=${encodeURIComponent(targetGame)}`, { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const state = getModState(targetGame);
  if (!response.ok) {
    state.pairing = null;
    if (targetGame === activeGame) renderModPairing();
    return;
  }
  const payload = await response.json().catch(() => null);
  const list = Array.isArray(payload?.data) ? payload.data : [];
  state.pairing = list[0] || null;
  if (targetGame === activeGame) renderModPairing();
}

async function fetchModSessions(game = activeGame) {
  const targetGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  const response = await fetch(`/api/game-agent/sessions?game=${encodeURIComponent(targetGame)}`, { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const state = getModState(targetGame);
  if (!response.ok) {
    state.sessions = [];
    if (targetGame === activeGame) renderModSessions();
    return;
  }
  const payload = await response.json().catch(() => null);
  state.sessions = Array.isArray(payload?.data?.sessions) ? payload.data.sessions : [];
  if (targetGame === activeGame) renderModSessions();
}

async function refreshModState(game = activeGame) {
  const targetGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  await Promise.all([fetchModPairings(targetGame), fetchModSessions(targetGame)]);
  if (targetGame === activeGame) updateOverviewStats();
}

async function createModPairing(game = activeGame, options = {}) {
  const targetGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  const notify = options.notify !== false;
  const gameLabel = getGameByKey(targetGame)?.name || toReadableGameName(targetGame) || "Game";
  const response = await fetch("/api/game-agent/pairings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: targetGame }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.data) {
    if (notify) {
      setModMessage(
        t("game_monitor.messages.pairing_failed", { game: gameLabel }, "Code konnte nicht erstellt werden."),
        "error"
      );
    }
    return null;
  }

  const state = getModState(targetGame);
  state.pairing = payload.data;
  if (targetGame === activeGame) {
    renderModPairing();
    updateOverviewStats();
  }
  if (notify) {
    setModMessage(
      t("game_monitor.messages.pairing_created", { game: gameLabel }, "Pairing-Code erstellt."),
      "success"
    );
  }
  return payload.data;
}

async function revokeModSession(sessionId, game = activeGame) {
  const targetGame = normalizeGameKey(game, GAME_AGENT_DEFAULT_GAME);
  const gameLabel = getGameByKey(targetGame)?.name || toReadableGameName(targetGame) || "Game";
  const response = await fetch(`/api/game-agent/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok) {
    setModMessage(
      t("game_monitor.messages.session_revoke_failed", { game: gameLabel }, "Session konnte nicht getrennt werden."),
      "error"
    );
    return;
  }

  setModMessage(
    t("game_monitor.messages.session_revoked", { game: gameLabel }, "Session getrennt."),
    "success"
  );
  await fetchModSessions(targetGame);
  updateOverviewStats();
}

async function refreshAllData() {
  const tasks = [refreshModState(activeGame)];
  if (activeGame === GAME_AGENT_DEFAULT_GAME) {
    tasks.unshift(refreshMinecraftServers());
  }
  await Promise.all(tasks);
  updateOverviewStats();
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

function getModalConnectionMode() {
  const checked = gameModalModeInputs.find((input) => input.checked);
  return checked?.value === "ip" ? "ip" : "key";
}

function resetGameModalPairingPreview() {
  if (gameModalPairingBoxEl) gameModalPairingBoxEl.hidden = true;
  if (gameModalPairingCodeEl) gameModalPairingCodeEl.textContent = "------";
  if (gameModalPairingExpiryEl) gameModalPairingExpiryEl.textContent = "-";
}

function renderGameModalPairingPreview(pairing) {
  if (!gameModalPairingBoxEl || !gameModalPairingCodeEl || !gameModalPairingExpiryEl) return;
  if (!pairing?.code) {
    resetGameModalPairingPreview();
    return;
  }
  gameModalPairingCodeEl.textContent = String(pairing.code || "").trim() || "------";
  gameModalPairingExpiryEl.textContent = formatDateTime(pairing.expiresAt);
  gameModalPairingBoxEl.hidden = false;
}

function syncGameModalMode() {
  const mode = getModalConnectionMode();
  if (gameModalIpFieldsEl) gameModalIpFieldsEl.hidden = mode !== "ip";
  if (gameModalKeyFieldsEl) gameModalKeyFieldsEl.hidden = mode !== "key";
  if (gameModalSubmitButton) {
    gameModalSubmitButton.textContent = mode === "ip" ? "Spiel hinzufügen" : "Connection Key erzeugen";
  }
  if (mode === "ip") {
    resetGameModalPairingPreview();
  }
}

function openGameModal(options = {}) {
  if (!gameModalEl) return;

  const useBlankPreset = options.blank === true;
  const hasProvidedName = Object.prototype.hasOwnProperty.call(options, "gameName");
  const hasProvidedKey = Object.prototype.hasOwnProperty.call(options, "gameKey");
  const baseGame = useBlankPreset
    ? null
    : getGameByKey(options.gameKey) || getActiveGameEntry() || getGameByKey(GAME_AGENT_DEFAULT_GAME);
  const gameName = sanitizeGameName(hasProvidedName ? options.gameName : baseGame?.name || "", "");
  const keyFallback = useBlankPreset ? "" : GAME_AGENT_DEFAULT_GAME;
  const gameKey = normalizeGameKey(hasProvidedKey ? options.gameKey : baseGame?.key || GAME_AGENT_DEFAULT_GAME, keyFallback);
  const mode = options.mode === "key" ? "key" : options.mode === "ip" ? "ip" : baseGame?.connectionMode || "key";

  if (gameModalNameEl) gameModalNameEl.value = gameName;
  if (gameModalKeyEl) gameModalKeyEl.value = gameKey || (useBlankPreset ? "" : GAME_AGENT_DEFAULT_GAME);
  if (gameModalServerNameEl) gameModalServerNameEl.value = "";
  if (gameModalHostEl) gameModalHostEl.value = "";
  gameModalKeyTouched = false;
  setModalMessage("");
  resetGameModalPairingPreview();

  for (const input of gameModalModeInputs) {
    input.checked = input.value === mode;
  }
  syncGameModalMode();

  gameModalEl.hidden = false;
  document.body.classList.add("auth-locked");
  if (gameModalNameEl) gameModalNameEl.focus();
}

function closeGameModal() {
  if (!gameModalEl) return;
  gameModalEl.hidden = true;
  document.body.classList.remove("auth-locked");
  setModalMessage("");
  resetGameModalPairingPreview();
}

function deriveGameFromModalInputs() {
  const rawName = sanitizeGameName(gameModalNameEl?.value, "");
  const typedKey = normalizeGameKey(gameModalKeyEl?.value, "");
  const derivedKey = typedKey || slugifyGameKey(rawName);
  const key = normalizeGameKey(derivedKey, "");
  if (!key) return null;

  const existing = getGameByKey(key);
  const name = rawName || existing?.name || toReadableGameName(key) || "Game";
  return { key, name };
}

async function handleGameModalSubmit(event) {
  event.preventDefault();
  setModalMessage("");

  const mode = getModalConnectionMode();
  const derived = deriveGameFromModalInputs();
  if (!derived) {
    setModalMessage("Bitte gib einen gültigen Spielnamen oder Key an.", "error");
    return;
  }

  if (mode === "ip") {
    if (derived.key !== GAME_AGENT_DEFAULT_GAME) {
      setModalMessage("Direkte IP-Verbindungen sind aktuell nur für Minecraft verfügbar.", "error");
      return;
    }

    const parsed = parseMinecraftAddress(gameModalHostEl?.value);
    if (!parsed) {
      setModalMessage("Bitte gib eine gültige Host-Adresse ein.", "error");
      return;
    }

    const gameEntry = upsertGame({
      key: derived.key,
      name: derived.name,
      connectionMode: "ip",
    });
    if (!gameEntry) {
      setModalMessage("Spiel konnte nicht gespeichert werden.", "error");
      return;
    }

    renderGameList();
    const addResult = addMinecraftServerEntry({
      name: gameModalServerNameEl?.value || gameEntry.name,
      host: parsed.host,
      port: parsed.port,
    });
    if (!addResult.ok) {
      if (addResult.error === "duplicate") {
        setModalMessage("Server ist bereits in der Liste.", "error");
        return;
      }
      if (addResult.error === "limit") {
        setModalMessage(`Maximal ${MINECRAFT_MAX_TRACKED_SERVERS} Server möglich.`, "error");
        return;
      }
      setModalMessage("Server konnte nicht hinzugefügt werden.", "error");
      return;
    }

    await setActiveGame(GAME_AGENT_DEFAULT_GAME, { refresh: false });
    closeGameModal();
    setPanelMessage("Server hinzugefügt.", "success");
    await refreshAllData();
    return;
  }

  const gameEntry = upsertGame({
    key: derived.key,
    name: derived.name,
    connectionMode: "key",
  });
  if (!gameEntry) {
    setModalMessage("Spiel konnte nicht gespeichert werden.", "error");
    return;
  }

  renderGameList();
  await setActiveGame(gameEntry.key, { refresh: false });
  const pairing = await createModPairing(gameEntry.key, { notify: false });
  if (!pairing) {
    setModalMessage("Connection Key konnte nicht erstellt werden.", "error");
    return;
  }

  renderGameModalPairingPreview(pairing);
  closeGameModal();
  setModMessage(`Connection Key für ${gameEntry.name} erstellt.`, "success");
  await refreshModState(gameEntry.key);
  updateOverviewStats();
}

function bindGameModalEvents() {
  if (!gameModalEl) return;

  if (gameModalForm) {
    gameModalForm.addEventListener("submit", (event) => {
      handleGameModalSubmit(event).catch(() => {
        setModalMessage("Verbindung fehlgeschlagen.", "error");
      });
    });
  }

  for (const input of gameModalModeInputs) {
    input.addEventListener("change", syncGameModalMode);
  }

  if (gameModalNameEl) {
    gameModalNameEl.addEventListener("input", () => {
      if (!gameModalKeyEl || gameModalKeyTouched) return;
      gameModalKeyEl.value = slugifyGameKey(gameModalNameEl.value);
    });
  }

  if (gameModalKeyEl) {
    gameModalKeyEl.addEventListener("input", () => {
      gameModalKeyTouched = String(gameModalKeyEl.value || "").trim().length > 0;
    });
  }

  if (gameModalCloseButton) gameModalCloseButton.addEventListener("click", closeGameModal);
  if (gameModalCancelButton) gameModalCancelButton.addEventListener("click", closeGameModal);

  gameModalEl.addEventListener("click", (event) => {
    if (event.target === gameModalEl) closeGameModal();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!gameModalEl.hidden) closeGameModal();
  });
}

function readInitialGameFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const queryGame = normalizeGameKey(params.get("game"), "");
    if (queryGame && getGameByKey(queryGame)) return queryGame;
  } catch (error) {
    // ignore
  }
  return GAME_AGENT_DEFAULT_GAME;
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

  games = readStoredGames();
  minecraftServers = readStoredMinecraftServers();
  renderGameList();
  updateOverviewHeader();
  updateDirectProbeVisibility();
  renderMinecraftServers();
  renderModPairing();
  renderModSessions();
  updateOverviewStats();
  bindGameModalEvents();

  if (addGameButton) {
    addGameButton.addEventListener("click", () => {
      openGameModal({ mode: "key", blank: true });
    });
  }

  if (addDirectServerButton) {
    addDirectServerButton.addEventListener("click", () => {
      const minecraftGame = getGameByKey(GAME_AGENT_DEFAULT_GAME);
      openGameModal({
        gameKey: GAME_AGENT_DEFAULT_GAME,
        gameName: minecraftGame?.name || "Minecraft",
        mode: "ip",
      });
    });
  }

  if (modCreatePairingButton) {
    modCreatePairingButton.addEventListener("click", () => {
      createModPairing(activeGame, { notify: true }).catch(() => {
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

  const initialGame = readInitialGameFromUrl();
  await setActiveGame(initialGame, { refresh: false });

  window.addEventListener("beforeunload", stopRefreshLoop);
  startRefreshLoop();
  await refreshAllData();
}

init();

