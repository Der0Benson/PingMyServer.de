const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const emailForm = document.getElementById("email-form");
const emailRecipientEl = document.getElementById("email-recipient");
const emailCooldownMinutesEl = document.getElementById("email-cooldown-minutes");
const emailEnabledEl = document.getElementById("email-enabled");
const emailStateBadgeEl = document.getElementById("email-state-badge");
const emailRecipientMaskEl = document.getElementById("email-recipient-mask");
const emailDeliveryHintEl = document.getElementById("email-delivery-hint");
const emailMessageEl = document.getElementById("email-message");
const testEmailButton = document.getElementById("test-email-btn");
const deleteEmailButton = document.getElementById("delete-email-btn");

const discordForm = document.getElementById("discord-form");
const discordWebhookUrlEl = document.getElementById("discord-webhook-url");
const discordEnabledEl = document.getElementById("discord-enabled");
const discordStateBadgeEl = document.getElementById("discord-state-badge");
const discordWebhookMaskEl = document.getElementById("discord-webhook-mask");
const discordMessageEl = document.getElementById("discord-message");
const testDiscordButton = document.getElementById("test-discord-btn");
const deleteDiscordButton = document.getElementById("delete-discord-btn");

const slackForm = document.getElementById("slack-form");
const slackWebhookUrlEl = document.getElementById("slack-webhook-url");
const slackEnabledEl = document.getElementById("slack-enabled");
const slackStateBadgeEl = document.getElementById("slack-state-badge");
const slackWebhookMaskEl = document.getElementById("slack-webhook-mask");
const slackMessageEl = document.getElementById("slack-message");
const testSlackButton = document.getElementById("test-slack-btn");
const deleteSlackButton = document.getElementById("delete-slack-btn");

const webhookForm = document.getElementById("webhook-form");
const webhookUrlEl = document.getElementById("webhook-url");
const webhookSecretEl = document.getElementById("webhook-secret");
const webhookEnabledEl = document.getElementById("webhook-enabled");
const webhookStateBadgeEl = document.getElementById("webhook-state-badge");
const webhookUrlMaskEl = document.getElementById("webhook-url-mask");
const webhookSecretStateEl = document.getElementById("webhook-secret-state");
const webhookMessageEl = document.getElementById("webhook-message");
const testWebhookButton = document.getElementById("test-webhook-btn");
const deleteWebhookButton = document.getElementById("delete-webhook-btn");

const billingCardEl = document.getElementById("billing-card");
const billingStateBadgeEl = document.getElementById("billing-state-badge");
const billingStateTextEl = document.getElementById("billing-state-text");
const billingMessageEl = document.getElementById("billing-message");
const billingUpgradeButton = document.getElementById("billing-upgrade-btn");
const billingManageButton = document.getElementById("billing-manage-btn");

const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
const EMAIL_COOLDOWN_MIN_MINUTES = 1;
const EMAIL_COOLDOWN_MAX_MINUTES = 1440;
const EMAIL_COOLDOWN_DEFAULT_MINUTES = 15;
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

function isValidEmail(value) {
  const email = String(value || "").trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

function normalizeEmailCooldownMinutes(value, fallback = EMAIL_COOLDOWN_DEFAULT_MINUTES) {
  const fallbackNumeric = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumeric)
    ? Math.max(EMAIL_COOLDOWN_MIN_MINUTES, Math.min(EMAIL_COOLDOWN_MAX_MINUTES, Math.round(fallbackNumeric)))
    : EMAIL_COOLDOWN_DEFAULT_MINUTES;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return safeFallback;
  return Math.max(EMAIL_COOLDOWN_MIN_MINUTES, Math.min(EMAIL_COOLDOWN_MAX_MINUTES, Math.round(numeric)));
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

function renderEmailState(emailSettings) {
  const data = emailSettings || {};
  const available = !!data.available;
  const configured = !!data.configured;
  const enabled = !!data.enabled;
  const recipientMasked = String(data.recipientMasked || "").trim();
  const usingAccountEmail = !!data.usingAccountEmail;
  const cooldownMinutes = normalizeEmailCooldownMinutes(data.cooldownMinutes, EMAIL_COOLDOWN_DEFAULT_MINUTES);

  if (emailStateBadgeEl) {
    emailStateBadgeEl.classList.remove("connected", "disabled");
    if (!available) {
      emailStateBadgeEl.textContent = t("notifications.email.state_unavailable", null, "Unavailable");
      emailStateBadgeEl.classList.add("disabled");
    } else if (!configured) {
      emailStateBadgeEl.textContent = t("notifications.email.state_disconnected", null, "Not connected");
    } else if (enabled) {
      emailStateBadgeEl.textContent = t("notifications.email.state_active", null, "Active");
      emailStateBadgeEl.classList.add("connected");
    } else {
      emailStateBadgeEl.textContent = t(
        "notifications.email.state_configured_disabled",
        null,
        "Configured (disabled)"
      );
      emailStateBadgeEl.classList.add("disabled");
    }
  }

  if (emailRecipientMaskEl) {
    if (!available) {
      emailRecipientMaskEl.textContent = t("notifications.email.smtp_missing", null, "SMTP is not configured.");
    } else if (configured) {
      emailRecipientMaskEl.textContent = usingAccountEmail
        ? t("notifications.email.using_account_email", null, "Using your account email address.")
        : recipientMasked || t("notifications.email.recipient_configured", null, "Recipient configured.");
    } else {
      emailRecipientMaskEl.textContent = t("notifications.email.no_recipient", null, "No recipient configured.");
    }
  }

  if (emailDeliveryHintEl) {
    emailDeliveryHintEl.textContent = t(
      "notifications.email.cooldown_hint_value",
      { minutes: cooldownMinutes },
      `Anti-spam cooldown: ${cooldownMinutes} min per monitor`
    );
  }

  if (emailEnabledEl) {
    emailEnabledEl.checked = enabled;
    emailEnabledEl.disabled = !available || !configured;
  }

  if (emailRecipientEl) {
    emailRecipientEl.disabled = !available;
  }

  if (emailCooldownMinutesEl) {
    emailCooldownMinutesEl.disabled = !available;
    emailCooldownMinutesEl.value = String(cooldownMinutes);
  }

  if (testEmailButton) {
    testEmailButton.disabled = !available || !configured;
  }

  if (deleteEmailButton) {
    deleteEmailButton.disabled = !configured;
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

function renderSlackState(slackSettings) {
  const data = slackSettings || {};
  const configured = !!data.configured;
  const enabled = !!data.enabled;
  const masked = String(data.webhookMasked || "").trim();

  if (slackStateBadgeEl) {
    slackStateBadgeEl.classList.remove("connected", "disabled");
    if (!configured) {
      slackStateBadgeEl.textContent = t("notifications.slack.state_disconnected", null, "Not connected");
    } else if (enabled) {
      slackStateBadgeEl.textContent = t("notifications.slack.state_active", null, "Active");
      slackStateBadgeEl.classList.add("connected");
    } else {
      slackStateBadgeEl.textContent = t(
        "notifications.slack.state_configured_disabled",
        null,
        "Configured (disabled)"
      );
      slackStateBadgeEl.classList.add("disabled");
    }
  }

  if (slackWebhookMaskEl) {
    slackWebhookMaskEl.textContent = configured
      ? masked || t("notifications.slack.webhook_configured", null, "Webhook configured.")
      : t("notifications.slack.no_webhook", null, "No webhook configured.");
  }

  if (slackEnabledEl) {
    slackEnabledEl.checked = enabled;
    slackEnabledEl.disabled = !configured;
  }

  if (testSlackButton) {
    testSlackButton.disabled = !configured;
  }

  if (deleteSlackButton) {
    deleteSlackButton.disabled = !configured;
  }
}

function renderWebhookState(webhookSettings) {
  const data = webhookSettings || {};
  const configured = !!data.configured;
  const enabled = !!data.enabled;
  const masked = String(data.urlMasked || "").trim();
  const secretConfigured = !!data.secretConfigured;

  if (webhookStateBadgeEl) {
    webhookStateBadgeEl.classList.remove("connected", "disabled");
    if (!configured) {
      webhookStateBadgeEl.textContent = t("notifications.webhook.state_disconnected", null, "Not connected");
    } else if (enabled) {
      webhookStateBadgeEl.textContent = t("notifications.webhook.state_active", null, "Active");
      webhookStateBadgeEl.classList.add("connected");
    } else {
      webhookStateBadgeEl.textContent = t(
        "notifications.webhook.state_configured_disabled",
        null,
        "Configured (disabled)"
      );
      webhookStateBadgeEl.classList.add("disabled");
    }
  }

  if (webhookUrlMaskEl) {
    webhookUrlMaskEl.textContent = configured
      ? masked || t("notifications.webhook.url_configured", null, "Webhook URL configured.")
      : t("notifications.webhook.no_url", null, "No webhook URL configured.");
  }

  if (webhookSecretStateEl) {
    webhookSecretStateEl.textContent = secretConfigured
      ? t("notifications.webhook.secret_configured", null, "Secret configured.")
      : t("notifications.webhook.secret_missing", null, "No secret configured.");
  }

  if (webhookEnabledEl) {
    webhookEnabledEl.checked = enabled;
    webhookEnabledEl.disabled = !configured;
  }

  if (testWebhookButton) {
    testWebhookButton.disabled = !configured;
  }

  if (deleteWebhookButton) {
    deleteWebhookButton.disabled = !configured;
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
  setPanelMessage(emailMessageEl, t("notifications.email.msg.loading", null, "Loading notifications..."));
  setPanelMessage(discordMessageEl, t("notifications.discord.msg.loading", null, "Loading notifications..."));
  setPanelMessage(slackMessageEl, t("notifications.slack.msg.loading", null, "Loading notifications..."));
  setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.loading", null, "Loading notifications..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok || !payload.data) {
      notificationsState = null;
      renderEmailState({});
      renderDiscordState({});
      renderSlackState({});
      renderWebhookState({});
      setPanelMessage(emailMessageEl, t("notifications.email.msg.load_failed", null, "Settings could not be loaded."), "error");
      setPanelMessage(discordMessageEl, t("notifications.discord.msg.load_failed", null, "Settings could not be loaded."), "error");
      setPanelMessage(slackMessageEl, t("notifications.slack.msg.load_failed", null, "Settings could not be loaded."), "error");
      setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.load_failed", null, "Settings could not be loaded."), "error");
      return;
    }

    notificationsState = payload.data;
    renderEmailState(notificationsState.email || {});
    renderDiscordState(notificationsState.discord || {});
    renderSlackState(notificationsState.slack || {});
    renderWebhookState(notificationsState.webhook || {});
    setPanelMessage(emailMessageEl, "");
    setPanelMessage(discordMessageEl, "");
    setPanelMessage(slackMessageEl, "");
    setPanelMessage(webhookMessageEl, "");
  } catch (error) {
    notificationsState = null;
    renderEmailState({});
    renderDiscordState({});
    renderSlackState({});
    renderWebhookState({});
    setPanelMessage(emailMessageEl, t("common.connection_failed", null, "Connection failed."), "error");
    setPanelMessage(discordMessageEl, t("common.connection_failed", null, "Connection failed."), "error");
    setPanelMessage(slackMessageEl, t("common.connection_failed", null, "Connection failed."), "error");
    setPanelMessage(webhookMessageEl, t("common.connection_failed", null, "Connection failed."), "error");
  }
}

async function saveEmailSettings(event) {
  event.preventDefault();
  const available = !!notificationsState?.email?.available;
  const configured = !!notificationsState?.email?.configured;
  const enabled = !!emailEnabledEl?.checked;
  const recipient = String(emailRecipientEl?.value || "").trim();
  const cooldownMinutes = normalizeEmailCooldownMinutes(
    emailCooldownMinutesEl?.value,
    notificationsState?.email?.cooldownMinutes || EMAIL_COOLDOWN_DEFAULT_MINUTES
  );

  if (!available) {
    setPanelMessage(emailMessageEl, t("notifications.email.msg.smtp_missing", null, "SMTP is not configured."), "error");
    return;
  }

  if (recipient && !isValidEmail(recipient)) {
    setPanelMessage(
      emailMessageEl,
      t("notifications.email.msg.invalid_recipient", null, "Please enter a valid recipient email."),
      "error"
    );
    emailRecipientEl?.focus();
    return;
  }

  setPanelMessage(emailMessageEl, t("notifications.email.msg.saving", null, "Saving settings..."));
  try {
    const body = {
      email: recipient,
      cooldownMinutes,
    };
    if (configured) {
      body.enabled = enabled;
    } else {
      body.enabled = true;
    }

    const { response, payload } = await fetchJson("/api/account/notifications/email", {
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
      if (payload?.error === "invalid recipient") {
        setPanelMessage(
          emailMessageEl,
          t("notifications.email.msg.invalid_recipient", null, "Please enter a valid recipient email."),
          "error"
        );
      } else if (payload?.error === "smtp not configured") {
        setPanelMessage(emailMessageEl, t("notifications.email.msg.smtp_missing", null, "SMTP is not configured."), "error");
      } else {
        setPanelMessage(emailMessageEl, t("notifications.email.msg.save_failed", null, "Settings could not be saved."), "error");
      }
      return;
    }

    notificationsState = payload.data;
    renderEmailState(notificationsState.email || {});
    if (emailRecipientEl) emailRecipientEl.value = "";
    setPanelMessage(emailMessageEl, t("notifications.email.msg.saved", null, "Email notifications saved."), "success");
  } catch (error) {
    setPanelMessage(emailMessageEl, t("notifications.email.msg.save_failed", null, "Settings could not be saved."), "error");
  }
}

async function testEmailNotification() {
  setPanelMessage(emailMessageEl, t("notifications.email.msg.testing", null, "Sending test email..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/email/test", {
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
      if (payload?.error === "invalid recipient") {
        setPanelMessage(
          emailMessageEl,
          t("notifications.email.msg.invalid_recipient", null, "Please enter a valid recipient email."),
          "error"
        );
      } else if (payload?.error === "smtp not configured") {
        setPanelMessage(emailMessageEl, t("notifications.email.msg.smtp_missing", null, "SMTP is not configured."), "error");
      } else {
        setPanelMessage(emailMessageEl, t("notifications.email.msg.test_failed", null, "Test email could not be sent."), "error");
      }
      return;
    }

    setPanelMessage(emailMessageEl, t("notifications.email.msg.test_sent", null, "Test email sent."), "success");
  } catch (error) {
    setPanelMessage(emailMessageEl, t("notifications.email.msg.test_failed", null, "Test email could not be sent."), "error");
  }
}

async function deleteEmailNotification() {
  const confirmed = window.confirm(t("notifications.email.confirm_remove", null, "Disable email notifications?"));
  if (!confirmed) return;

  setPanelMessage(emailMessageEl, t("notifications.email.msg.removing", null, "Disabling email notifications..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/email", {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      setPanelMessage(
        emailMessageEl,
        t("notifications.email.msg.remove_failed", null, "Email settings could not be removed."),
        "error"
      );
      return;
    }

    notificationsState = payload.data;
    renderEmailState(notificationsState.email || {});
    if (emailRecipientEl) emailRecipientEl.value = "";
    setPanelMessage(emailMessageEl, t("notifications.email.msg.removed", null, "Email notifications disabled."), "success");
  } catch (error) {
    setPanelMessage(
      emailMessageEl,
      t("notifications.email.msg.remove_failed", null, "Email settings could not be removed."),
      "error"
    );
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

async function saveSlackSettings(event) {
  event.preventDefault();
  const webhookUrl = String(slackWebhookUrlEl?.value || "").trim();
  const configured = !!notificationsState?.slack?.configured;
  const enabled = !!slackEnabledEl?.checked;

  if (!configured && !webhookUrl) {
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.webhook_required", null, "Please enter a valid Slack webhook URL."), "error");
    return;
  }

  setPanelMessage(slackMessageEl, t("notifications.slack.msg.saving", null, "Saving settings..."));
  try {
    const body = {};
    if (configured) {
      body.enabled = enabled;
    } else if (webhookUrl) {
      body.enabled = true;
    }
    if (webhookUrl) body.webhookUrl = webhookUrl;

    const { response, payload } = await fetchJson("/api/account/notifications/slack", {
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
        setPanelMessage(slackMessageEl, t("notifications.slack.msg.invalid_webhook", null, "Invalid Slack webhook URL."), "error");
      } else if (payload?.error === "webhook required") {
        setPanelMessage(slackMessageEl, t("notifications.slack.msg.webhook_required_first", null, "Please add a webhook first."), "error");
      } else {
        setPanelMessage(slackMessageEl, t("notifications.slack.msg.save_failed", null, "Settings could not be saved."), "error");
      }
      return;
    }

    notificationsState = payload.data;
    renderSlackState(notificationsState.slack || {});
    if (slackWebhookUrlEl) slackWebhookUrlEl.value = "";
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.saved", null, "Slack notifications saved."), "success");
  } catch (error) {
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.save_failed", null, "Settings could not be saved."), "error");
  }
}

async function testSlackWebhook() {
  setPanelMessage(slackMessageEl, t("notifications.slack.msg.testing", null, "Sending test message..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/slack/test", {
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
      setPanelMessage(slackMessageEl, t("notifications.slack.msg.test_failed", null, "Test could not be sent."), "error");
      return;
    }

    setPanelMessage(slackMessageEl, t("notifications.slack.msg.test_sent", null, "Test message sent."), "success");
  } catch (error) {
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.test_failed", null, "Test could not be sent."), "error");
  }
}

async function deleteSlackWebhook() {
  const confirmed = window.confirm(t("notifications.slack.confirm_remove", null, "Remove Slack webhook?"));
  if (!confirmed) return;

  setPanelMessage(slackMessageEl, t("notifications.slack.msg.removing", null, "Removing webhook..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/slack", {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      setPanelMessage(slackMessageEl, t("notifications.slack.msg.remove_failed", null, "Webhook could not be removed."), "error");
      return;
    }

    notificationsState = payload.data;
    renderSlackState(notificationsState.slack || {});
    if (slackWebhookUrlEl) slackWebhookUrlEl.value = "";
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.removed", null, "Webhook removed."), "success");
  } catch (error) {
    setPanelMessage(slackMessageEl, t("notifications.slack.msg.remove_failed", null, "Webhook could not be removed."), "error");
  }
}

async function saveWebhookSettings(event) {
  event.preventDefault();
  const url = String(webhookUrlEl?.value || "").trim();
  const secret = String(webhookSecretEl?.value || "").trim();
  const configured = !!notificationsState?.webhook?.configured;
  const enabled = !!webhookEnabledEl?.checked;

  if (!configured && !url) {
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.url_required", null, "Please enter a valid webhook URL."), "error");
    return;
  }

  setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.saving", null, "Saving settings..."));
  try {
    const body = {};
    if (configured) {
      body.enabled = enabled;
    } else if (url) {
      body.enabled = true;
    }
    if (url) body.url = url;
    if (secret) body.secret = secret;

    const { response, payload } = await fetchJson("/api/account/notifications/webhook", {
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
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.invalid_url", null, "Invalid webhook URL."), "error");
      } else if (payload?.error === "webhook required") {
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.url_required_first", null, "Please add a webhook URL first."), "error");
      } else if (payload?.error === "webhook target forbidden") {
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.target_forbidden", null, "This webhook URL is not allowed."), "error");
      } else {
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.save_failed", null, "Settings could not be saved."), "error");
      }
      return;
    }

    notificationsState = payload.data;
    renderWebhookState(notificationsState.webhook || {});
    if (webhookUrlEl) webhookUrlEl.value = "";
    if (webhookSecretEl) webhookSecretEl.value = "";
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.saved", null, "Webhook notifications saved."), "success");
  } catch (error) {
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.save_failed", null, "Settings could not be saved."), "error");
  }
}

async function testWebhook() {
  setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.testing", null, "Sending test message..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/webhook/test", {
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
      if (payload?.error === "webhook target forbidden") {
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.target_forbidden", null, "This webhook URL is not allowed."), "error");
      } else {
        setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.test_failed", null, "Test could not be sent."), "error");
      }
      return;
    }

    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.test_sent", null, "Test message sent."), "success");
  } catch (error) {
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.test_failed", null, "Test could not be sent."), "error");
  }
}

async function deleteWebhook() {
  const confirmed = window.confirm(t("notifications.webhook.confirm_remove", null, "Remove webhook?"));
  if (!confirmed) return;

  setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.removing", null, "Removing webhook..."));
  try {
    const { response, payload } = await fetchJson("/api/account/notifications/webhook", {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok || !payload.data) {
      setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.remove_failed", null, "Webhook could not be removed."), "error");
      return;
    }

    notificationsState = payload.data;
    renderWebhookState(notificationsState.webhook || {});
    if (webhookUrlEl) webhookUrlEl.value = "";
    if (webhookSecretEl) webhookSecretEl.value = "";
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.removed", null, "Webhook removed."), "success");
  } catch (error) {
    setPanelMessage(webhookMessageEl, t("notifications.webhook.msg.remove_failed", null, "Webhook could not be removed."), "error");
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
  if (emailForm) {
    emailForm.addEventListener("submit", saveEmailSettings);
  }
  if (testEmailButton) {
    testEmailButton.addEventListener("click", () => {
      testEmailNotification().catch(() => {
        // ignore
      });
    });
  }
  if (deleteEmailButton) {
    deleteEmailButton.addEventListener("click", () => {
      deleteEmailNotification().catch(() => {
        // ignore
      });
    });
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
  if (slackForm) {
    slackForm.addEventListener("submit", saveSlackSettings);
  }
  if (testSlackButton) {
    testSlackButton.addEventListener("click", () => {
      testSlackWebhook().catch(() => {
        // ignore
      });
    });
  }
  if (deleteSlackButton) {
    deleteSlackButton.addEventListener("click", () => {
      deleteSlackWebhook().catch(() => {
        // ignore
      });
    });
  }
  if (webhookForm) {
    webhookForm.addEventListener("submit", saveWebhookSettings);
  }
  if (testWebhookButton) {
    testWebhookButton.addEventListener("click", () => {
      testWebhook().catch(() => {
        // ignore
      });
    });
  }
  if (deleteWebhookButton) {
    deleteWebhookButton.addEventListener("click", () => {
      deleteWebhook().catch(() => {
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
