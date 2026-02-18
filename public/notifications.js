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
const billingCardEl = document.getElementById("billing-card");
const billingStateBadgeEl = document.getElementById("billing-state-badge");
const billingStateTextEl = document.getElementById("billing-state-text");
const billingMessageEl = document.getElementById("billing-message");
const billingUpgradeButton = document.getElementById("billing-upgrade-btn");
const billingManageButton = document.getElementById("billing-manage-btn");

const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
let user = null;
let notificationsState = null;
let billingState = null;

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

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
      currentUserEmail.textContent = user.email || t("common.signed_in", null, "signed in");
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
      discordStateBadgeEl.textContent = t("notifications.discord.state_disconnected", null, "Not connected");
    } else if (enabled) {
      discordStateBadgeEl.textContent = t("notifications.discord.state_active", null, "Active");
      discordStateBadgeEl.classList.add("connected");
    } else {
      discordStateBadgeEl.textContent = t(
        "notifications.discord.state_configured_disabled",
        null,
        "Configured (disabled)"
      );
      discordStateBadgeEl.classList.add("disabled");
    }
  }

  if (discordWebhookMaskEl) {
    discordWebhookMaskEl.textContent = configured
      ? masked || t("notifications.discord.webhook_configured", null, "Webhook configured.")
      : t("notifications.discord.no_webhook", null, "No webhook configured.");
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

function formatBillingDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(i18nLocale(), { dateStyle: "medium" }).format(date);
  } catch (error) {
    return date.toISOString().slice(0, 10);
  }
}

function renderBillingState(data) {
  const billing = data || {};
  const available = !!billing.available;
  const checkoutEnabled = !!billing.checkoutEnabled;
  const active = !!billing.active;
  const status = String(billing.status || "none").trim().toLowerCase();
  const periodEndLabel = formatBillingDate(billing.currentPeriodEnd);

  if (billingCardEl) {
    billingCardEl.hidden = false;
  }

  if (billingStateBadgeEl) {
    billingStateBadgeEl.classList.remove("connected", "disabled", "error");

    if (!available || !checkoutEnabled) {
      billingStateBadgeEl.textContent = t("notifications.billing.badge.unavailable", null, "Unavailable");
      billingStateBadgeEl.classList.add("disabled");
    } else if (active) {
      billingStateBadgeEl.textContent = t("notifications.billing.badge.active", null, "Active");
      billingStateBadgeEl.classList.add("connected");
    } else if (status === "past_due" || status === "unpaid") {
      billingStateBadgeEl.textContent = t("notifications.billing.badge.action_needed", null, "Action needed");
      billingStateBadgeEl.classList.add("error");
    } else {
      billingStateBadgeEl.textContent = t("notifications.billing.badge.free", null, "Free");
      billingStateBadgeEl.classList.add("disabled");
    }
  }

  if (billingStateTextEl) {
    if (!available || !checkoutEnabled) {
      billingStateTextEl.textContent = t("notifications.billing.text.unavailable", null, "Stripe billing is currently not enabled.");
    } else if (active) {
      const suffix = periodEndLabel
        ? t("notifications.billing.text.renewal", { date: periodEndLabel }, ` Next renewal: ${periodEndLabel}.`)
        : "";
      billingStateTextEl.textContent = t(
        "notifications.billing.text.active",
        { status, suffix },
        `Subscription status: ${status}.${suffix}`
      );
    } else if (status === "past_due" || status === "unpaid") {
      billingStateTextEl.textContent = t(
        "notifications.billing.text.action_needed",
        null,
        "A payment is past due. Please update it in the portal."
      );
    } else {
      billingStateTextEl.textContent = t("notifications.billing.text.free", null, "You are currently on the free plan.");
    }
  }

  if (billingUpgradeButton) {
    billingUpgradeButton.disabled = !available || !checkoutEnabled || active;
  }

  if (billingManageButton) {
    billingManageButton.disabled = !available;
  }
}

async function loadBilling() {
  setPanelMessage(billingMessageEl, t("notifications.billing.msg.loading", null, "Loading billing..."));
  try {
    const { response, payload } = await fetchJson("/api/account/billing");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok || !payload.data) {
      billingState = null;
      renderBillingState({});
      setPanelMessage(billingMessageEl, t("notifications.billing.msg.load_failed", null, "Billing could not be loaded."), "error");
      return;
    }

    billingState = payload.data;
    renderBillingState(billingState);
    setPanelMessage(billingMessageEl, "");
  } catch (error) {
    billingState = null;
    renderBillingState({});
    setPanelMessage(billingMessageEl, t("notifications.billing.msg.load_failed", null, "Billing could not be loaded."), "error");
  }
}

async function startBillingCheckout() {
  setPanelMessage(billingMessageEl, t("notifications.billing.msg.checkout_preparing", null, "Preparing Stripe Checkout..."));
  try {
    const { response, payload } = await fetchJson("/api/account/billing/checkout", {
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

    if (!response.ok || !payload?.ok || !payload.url) {
      if (payload?.error === "already subscribed") {
        setPanelMessage(
          billingMessageEl,
          t("notifications.billing.msg.already_subscribed", null, "Subscription is already active. Please manage it in the portal."),
          "error"
        );
      } else if (payload?.error === "stripe disabled" || payload?.error === "stripe not configured") {
        setPanelMessage(billingMessageEl, t("notifications.billing.msg.stripe_disabled", null, "Stripe is currently disabled."), "error");
      } else {
        setPanelMessage(billingMessageEl, t("notifications.billing.msg.checkout_failed", null, "Checkout could not be started."), "error");
      }
      return;
    }

    window.location.href = payload.url;
  } catch (error) {
    setPanelMessage(billingMessageEl, t("notifications.billing.msg.checkout_failed", null, "Checkout could not be started."), "error");
  }
}

async function openBillingPortal() {
  setPanelMessage(billingMessageEl, t("notifications.billing.msg.portal_opening", null, "Opening Stripe portal..."));
  try {
    const { response, payload } = await fetchJson("/api/account/billing/portal", {
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

    if (!response.ok || !payload?.ok || !payload.url) {
      if (payload?.error === "stripe disabled" || payload?.error === "stripe not configured") {
        setPanelMessage(billingMessageEl, t("notifications.billing.msg.stripe_disabled", null, "Stripe is currently disabled."), "error");
      } else {
        setPanelMessage(billingMessageEl, t("notifications.billing.msg.portal_failed", null, "Portal could not be opened."), "error");
      }
      return;
    }

    window.location.href = payload.url;
  } catch (error) {
    setPanelMessage(billingMessageEl, t("notifications.billing.msg.portal_failed", null, "Portal could not be opened."), "error");
  }
}

function applyBillingQueryMessage() {
  const params = new URLSearchParams(window.location.search || "");
  const billingStateParam = String(params.get("billing") || "").trim().toLowerCase();
  if (!billingStateParam) return;

  if (billingStateParam === "success") {
    setPanelMessage(billingMessageEl, t("notifications.billing.msg.checkout_success", null, "Checkout completed. Subscription will be updated."), "success");
    return;
  }
  if (billingStateParam === "cancel") {
    setPanelMessage(billingMessageEl, t("notifications.billing.msg.checkout_cancelled", null, "Checkout was cancelled."), "error");
  }
}

async function loadNotifications() {
  setPanelMessage(discordMessageEl, t("notifications.discord.msg.loading", null, "Loading notifications..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok || !payload.data) {
      notificationsState = null;
      renderDiscordState({});
      setPanelMessage(discordMessageEl, t("notifications.discord.msg.load_failed", null, "Settings could not be loaded."), "error");
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    setPanelMessage(discordMessageEl, "");
  } catch (error) {
    notificationsState = null;
    renderDiscordState({});
    setPanelMessage(discordMessageEl, t("common.connection_failed", null, "Connection failed."), "error");
  }
}

async function saveDiscordSettings(event) {
  event.preventDefault();
  const webhookUrl = String(discordWebhookUrlEl?.value || "").trim();
  const configured = !!notificationsState?.discord?.configured;
  const enabled = !!discordEnabledEl?.checked;

  if (!configured && !webhookUrl) {
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.webhook_required", null, "Please enter a valid Discord webhook URL."), "error");
    return;
  }

  setPanelMessage(discordMessageEl, t("notifications.discord.msg.saving", null, "Saving settings..."));
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
        setPanelMessage(discordMessageEl, t("notifications.discord.msg.invalid_webhook", null, "Invalid Discord webhook URL."), "error");
      } else if (payload?.error === "webhook required") {
        setPanelMessage(discordMessageEl, t("notifications.discord.msg.webhook_required_first", null, "Please add a webhook first."), "error");
      } else {
        setPanelMessage(discordMessageEl, t("notifications.discord.msg.save_failed", null, "Settings could not be saved."), "error");
      }
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    if (discordWebhookUrlEl) discordWebhookUrlEl.value = "";
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.saved", null, "Discord notifications saved."), "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.save_failed", null, "Settings could not be saved."), "error");
  }
}

async function testDiscordWebhook() {
  setPanelMessage(discordMessageEl, t("notifications.discord.msg.testing", null, "Sending test message..."));
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
      setPanelMessage(discordMessageEl, t("notifications.discord.msg.test_failed", null, "Test could not be sent."), "error");
      return;
    }

    setPanelMessage(discordMessageEl, t("notifications.discord.msg.test_sent", null, "Test message sent."), "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.test_failed", null, "Test could not be sent."), "error");
  }
}

async function deleteDiscordWebhook() {
  const confirmed = window.confirm(t("notifications.discord.confirm_remove", null, "Remove Discord webhook?"));
  if (!confirmed) return;

  setPanelMessage(discordMessageEl, t("notifications.discord.msg.removing", null, "Removing webhook..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/discord", {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      setPanelMessage(discordMessageEl, t("notifications.discord.msg.remove_failed", null, "Webhook could not be removed."), "error");
      return;
    }

    notificationsState = payload.data;
    renderDiscordState(notificationsState.discord || {});
    if (discordWebhookUrlEl) discordWebhookUrlEl.value = "";
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.removed", null, "Webhook removed."), "success");
  } catch (error) {
    setPanelMessage(discordMessageEl, t("notifications.discord.msg.remove_failed", null, "Webhook could not be removed."), "error");
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
  if (billingUpgradeButton) {
    billingUpgradeButton.addEventListener("click", () => {
      startBillingCheckout().catch(() => {
        // ignore
      });
    });
  }
  if (billingManageButton) {
    billingManageButton.addEventListener("click", () => {
      openBillingPortal().catch(() => {
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
  await loadBilling();
  applyBillingQueryMessage();
}

init();
