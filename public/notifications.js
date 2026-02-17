const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const discordForm = document.getElementById("discord-form");
const discordWebhookUrlEl = document.getElementById("discord-webhook-url");
const discordEnabledEl = document.getElementById("discord-enabled");
const discordStateBadgeEl = document.getElementById("discord-state-badge");
const discordWebhookMaskEl = document.getElementById("discord-webhook-mask");
const discordMessageEl = document.getElementById("discord-message");
const testDiscordButton = document.getElementById("test-discord-btn");
const deleteDiscordButton = document.getElementById("delete-discord-btn");

const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
let user = null;
let notificationsState = null;

function setPanelMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text || "";
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}

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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  return { response, payload };
}

async function syncPublicStatusLinks() {
  if (!publicStatusLinks.length) return;
  try {
    const { response, payload } = await fetchJson("/api/monitors");
    if (response.status === 401) return;
    if (!response.ok || !payload?.ok) return;

    const monitorList = Array.isArray(payload.data) ? payload.data : [];
    const path = getPublicStatusPath(pickPreferredMonitorId(monitorList));
    for (const link of publicStatusLinks) {
      link.setAttribute("href", path);
    }
  } catch (error) {
    // ignore
  }
}

async function ensureAuthenticated() {
  try {
    const { response, payload } = await fetchJson("/api/me");
    if (response.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!response.ok || !payload?.ok || !payload.user) {
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

function renderDiscordState(discordSettings) {
  const data = discordSettings || {};
  const configured = !!data.configured;
  const enabled = !!data.enabled;
  const masked = String(data.webhookMasked || "").trim();

  if (discordStateBadgeEl) {
    discordStateBadgeEl.classList.remove("connected", "disabled");
    if (!configured) {
      discordStateBadgeEl.textContent = "Nicht verbunden";
    } else if (enabled) {
      discordStateBadgeEl.textContent = "Aktiv";
      discordStateBadgeEl.classList.add("connected");
    } else {
      discordStateBadgeEl.textContent = "Konfiguriert (deaktiviert)";
      discordStateBadgeEl.classList.add("disabled");
    }
  }

  if (discordWebhookMaskEl) {
    discordWebhookMaskEl.textContent = configured
      ? masked || "Webhook hinterlegt."
      : "Kein Webhook hinterlegt.";
  }

  if (discordEnabledEl) {
    discordEnabledEl.checked = enabled;
    discordEnabledEl.disabled = !configured;
  }

  if (testDiscordButton) {
    testDiscordButton.disabled = !configured;
  }

  if (deleteDiscordButton) {
    deleteDiscordButton.disabled = !configured;
  }
}

async function loadNotifications() {
  setPanelMessage(discordMessageEl, "Lade Benachrichtigungen...");
  try {
    const { response, payload } = await fetchJson("/api/account/notifications");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok || !payload.data) {
      notificationsState = null;
      renderDiscordState({});
      setPanelMessage(discordMessageEl, "Einstellungen konnten nicht geladen werden.", "error");
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    setPanelMessage(discordMessageEl, "");
  } catch (error) {
    notificationsState = null;
    renderDiscordState({});
    setPanelMessage(discordMessageEl, "Verbindung fehlgeschlagen.", "error");
  }
}

async function saveDiscordSettings(event) {
  event.preventDefault();
  const webhookUrl = String(discordWebhookUrlEl?.value || "").trim();
  const configured = !!notificationsState?.discord?.configured;
  const enabled = !!discordEnabledEl?.checked;

  if (!configured && !webhookUrl) {
    setPanelMessage(discordMessageEl, "Bitte eine gültige Discord Webhook URL eintragen.", "error");
    return;
  }

  setPanelMessage(discordMessageEl, "Speichere Einstellungen...");
  try {
    const body = {};
    if (configured) {
      body.enabled = enabled;
    } else if (webhookUrl) {
      body.enabled = true;
    }
    if (webhookUrl) body.webhookUrl = webhookUrl;
    const { response, payload } = await fetchJson("/api/account/notifications/discord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      if (payload?.error === "invalid webhook url") {
        setPanelMessage(discordMessageEl, "Ungültige Discord Webhook URL.", "error");
      } else if (payload?.error === "webhook required") {
        setPanelMessage(discordMessageEl, "Bitte zuerst einen Webhook hinterlegen.", "error");
      } else {
        setPanelMessage(discordMessageEl, "Einstellungen konnten nicht gespeichert werden.", "error");
      }
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    if (discordWebhookUrlEl) discordWebhookUrlEl.value = "";
    setPanelMessage(discordMessageEl, "Discord Benachrichtigungen gespeichert.", "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, "Einstellungen konnten nicht gespeichert werden.", "error");
  }
}

async function testDiscordWebhook() {
  setPanelMessage(discordMessageEl, "Sende Testnachricht...");
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/discord/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok) {
      setPanelMessage(discordMessageEl, "Test konnte nicht gesendet werden.", "error");
      return;
    }

    setPanelMessage(discordMessageEl, "Testnachricht wurde gesendet.", "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, "Test konnte nicht gesendet werden.", "error");
  }
}

async function deleteDiscordWebhook() {
  const confirmed = window.confirm("Discord Webhook wirklich entfernen?");
  if (!confirmed) return;

  setPanelMessage(discordMessageEl, "Webhook wird entfernt...");
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/discord", {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      setPanelMessage(discordMessageEl, "Webhook konnte nicht entfernt werden.", "error");
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    if (discordWebhookUrlEl) discordWebhookUrlEl.value = "";
    setPanelMessage(discordMessageEl, "Webhook wurde entfernt.", "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, "Webhook konnte nicht entfernt werden.", "error");
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

function bindEvents() {
  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }
  if (discordForm) {
    discordForm.addEventListener("submit", saveDiscordSettings);
  }
  if (testDiscordButton) {
    testDiscordButton.addEventListener("click", () => {
      testDiscordWebhook().catch(() => {
        // ignore
      });
    });
  }
  if (deleteDiscordButton) {
    deleteDiscordButton.addEventListener("click", () => {
      deleteDiscordWebhook().catch(() => {
        // ignore
      });
    });
  }
}

async function init() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;
  await syncPublicStatusLinks();
  bindEvents();
  await loadNotifications();
}

init();
