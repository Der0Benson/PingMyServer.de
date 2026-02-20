const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const refreshSessionsButton = document.getElementById("refresh-sessions-btn");
const revokeOthersButton = document.getElementById("revoke-others-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

const sessionsSummaryEl = document.getElementById("sessions-summary");
const sessionsMessageEl = document.getElementById("sessions-message");
const sessionsListEl = document.getElementById("sessions-list");
const appConnectionsSummaryEl = document.getElementById("app-connections-summary");
const appConnectionsMessageEl = document.getElementById("app-connections-message");
const appConnectionsListEl = document.getElementById("app-connections-list");
const domainsSummaryEl = document.getElementById("domains-summary");
const domainsMessageEl = document.getElementById("domains-message");
const domainsListEl = document.getElementById("domain-list");
const domainForm = document.getElementById("domain-form");
const domainInputEl = document.getElementById("domain-input");

const passwordForm = document.getElementById("password-form");
const currentPasswordEl = document.getElementById("current-password");
const newPasswordEl = document.getElementById("new-password");
const repeatPasswordEl = document.getElementById("repeat-password");
const passwordMessageEl = document.getElementById("password-message");
const passwordModeHintEl = document.getElementById("password-mode-hint");
const deleteAccountForm = document.getElementById("delete-account-form");
const deleteAccountPasswordEl = document.getElementById("delete-account-password");
const deleteAccountButton = document.getElementById("delete-account-btn");
const deleteAccountMessageEl = document.getElementById("delete-account-message");
const deleteModeHintEl = document.getElementById("delete-mode-hint");

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 72;

let sessions = [];
let appConnections = [];
let domains = [];
let user = null;
let loadingSessions = false;
let loadingAppConnections = false;
let loadingDomains = false;
let canUsePasswordlessAccountActions = false;
const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
const rtf = () =>
  I18N && typeof I18N.rtf === "function"
    ? I18N.rtf()
    : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });

function syncOwnerLinks() {
  const isOwner = user?.isOwner === true;
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

function setPanelMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text || "";
  element.classList.remove("error", "success");
  if (type) {
    element.classList.add(type);
  }
}

function setSessionsSummary(text) {
  if (!sessionsSummaryEl) return;
  sessionsSummaryEl.textContent = text || "";
}

function setAppConnectionsSummary(text) {
  if (!appConnectionsSummaryEl) return;
  appConnectionsSummaryEl.textContent = text || "";
}

function setDomainsSummary(text) {
  if (!domainsSummaryEl) return;
  domainsSummaryEl.textContent = text || "";
}

function applyCredentialModeUi() {
  const requireCurrentPassword = !canUsePasswordlessAccountActions;
  const optionalPlaceholder = t("connections.password.placeholder_optional", null, "Optional with app login");

  if (currentPasswordEl) {
    currentPasswordEl.required = requireCurrentPassword;
    currentPasswordEl.placeholder = requireCurrentPassword ? "" : optionalPlaceholder;
  }

  if (deleteAccountPasswordEl) {
    deleteAccountPasswordEl.required = requireCurrentPassword;
    deleteAccountPasswordEl.placeholder = requireCurrentPassword ? "" : optionalPlaceholder;
  }

  if (passwordModeHintEl) {
    passwordModeHintEl.textContent = requireCurrentPassword
      ? t("connections.password.hint_required", null, "Current password is required.")
      : t(
          "connections.password.hint_optional",
          null,
          "When an app connection is linked, the current password is optional (fresh sign-in required)."
        );
  }

  if (deleteModeHintEl) {
    deleteModeHintEl.textContent = requireCurrentPassword
      ? t("connections.password.hint_required", null, "Current password is required.")
      : t(
          "connections.delete.hint_optional",
          null,
          "When an app connection is linked, you can also delete without a password (fresh sign-in required)."
        );
  }
}

function syncCredentialModeFromConnections() {
  const list = Array.isArray(appConnections) ? appConnections : [];
  canUsePasswordlessAccountActions = list.some((entry) => !!entry?.connected);
  applyCredentialModeUi();
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

function formatTimeIn(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return rtf().format(0, "second");
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return rtf().format(seconds, "second");

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf().format(minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf().format(hours, "hour");

  const days = Math.round(hours / 24);
  return rtf().format(days, "day");
}

function formatRelative(ts) {
  if (!Number.isFinite(ts)) return t("common.unknown", null, "unknown");
  const diffMs = Math.max(0, Date.now() - ts);
  return formatTimeAgo(diffMs);
}

function formatExpiresIn(seconds) {
  if (!Number.isFinite(seconds)) return t("common.unknown", null, "unknown");
  if (seconds <= 0) return t("connections.sessions.expires_now", null, "expiring");
  return formatTimeIn(seconds * 1000);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmptySessions(title, text) {
  if (!sessionsListEl) return;
  sessionsListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(title)}</div>
      <div class="muted">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderEmptyAppConnections(title, text) {
  if (!appConnectionsListEl) return;
  appConnectionsListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(title)}</div>
      <div class="muted">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderEmptyDomains(title, text) {
  if (!domainsListEl) return;
  domainsListEl.innerHTML = `
    <div class="empty-state">
      <div class="title">${escapeHtml(title)}</div>
      <div class="muted">${escapeHtml(text)}</div>
    </div>
  `;
}

function formatDomainSubtitle(item) {
  const verifiedAt = Number(item?.verifiedAt);
  if (Number.isFinite(verifiedAt) && verifiedAt > 0) {
    return t(
      "connections.domains.subtitle.verified_at",
      { date: formatDateTime(verifiedAt) },
      `Verified on ${formatDateTime(verifiedAt)}.`
    );
  }

  const lastCheckedAt = Number(item?.lastCheckedAt);
  const lastError = String(item?.lastCheckError || "").trim();
  if (Number.isFinite(lastCheckedAt) && lastCheckedAt > 0) {
    const base = t(
      "connections.domains.subtitle.last_check",
      { date: formatDateTime(lastCheckedAt), relative: formatRelative(lastCheckedAt) },
      `Last check: ${formatDateTime(lastCheckedAt)} (${formatRelative(lastCheckedAt)})`
    );
    return lastError ? `${base} · ${lastError}` : `${base}.`;
  }

  return t("connections.domains.subtitle.set_txt", null, "Set the TXT record and then verify.");
}

function renderDomains() {
  if (!domainsListEl) return;
  const list = Array.isArray(domains) ? domains : [];

  if (!list.length) {
    renderEmptyDomains(
      t("connections.domains.empty_title", null, "No domains."),
      t("connections.domains.empty_body", null, "Once you add a domain, it will show up here.")
    );
    setDomainsSummary(t("connections.domains.summary.zero", null, "0 domains"));
    return;
  }

  domainsListEl.innerHTML = "";
  const verifiedCount = list.filter((entry) => Number.isFinite(Number(entry?.verifiedAt)) && Number(entry.verifiedAt) > 0).length;
  setDomainsSummary(
    t(
      "connections.domains.summary.verified",
      { verified: verifiedCount, total: list.length },
      `${verifiedCount}/${list.length} domains verified`
    )
  );

  for (const item of list) {
    const id = Number(item?.id);
    const domain = String(item?.domain || "").trim();
    if (!Number.isFinite(id) || id <= 0 || !domain) continue;

    const verified = Number.isFinite(Number(item?.verifiedAt)) && Number(item.verifiedAt) > 0;
    const badgeClass = verified ? " verified" : " pending";
    const badgeText = verified
      ? t("connections.domains.badge.verified", null, "Verified")
      : t("connections.domains.badge.pending", null, "Pending");

    const recordName = String(item?.recordName || "").trim() || `_pingmyserver-challenge.${domain}`;
    const recordValue = String(item?.recordValue || "").trim();
    const hintHtml = t(
      "connections.domains.record.hint_html",
      { host: `<span class="domain-code">${escapeHtml("_pingmyserver-challenge")}</span>` },
      `Depending on your DNS provider, the host can be just <span class="domain-code">${escapeHtml(
        "_pingmyserver-challenge"
      )}</span>.`
    );

    const row = document.createElement("article");
    row.className = "domain-item";
    row.innerHTML = `
      <div class="domain-head">
        <div>
          <div class="domain-title">${escapeHtml(domain)}</div>
          <div class="domain-subtitle">${escapeHtml(formatDomainSubtitle(item))}</div>
        </div>
        <span class="domain-badge${badgeClass}">${escapeHtml(badgeText)}</span>
      </div>

      <div class="domain-record">
        <div class="domain-record-row">
          <div class="domain-record-key">${escapeHtml(t("connections.domains.record.name_host", null, "Name/Host"))}</div>
          <div class="domain-code">${escapeHtml(recordName)}</div>
        </div>
        <div class="domain-record-row">
          <div class="domain-record-key">${escapeHtml(t("connections.domains.record.txt_value", null, "TXT value"))}</div>
          <div class="domain-code">${escapeHtml(
            recordValue || t("connections.domains.record.token_loading", null, "(token loading...)")
          )}</div>
        </div>
        <div class="muted domain-hint">${hintHtml}</div>
      </div>

      <div class="domain-actions">
        <button class="btn ghost" type="button" data-domain-verify-id="${escapeHtml(String(id))}" ${
      verified ? "disabled" : ""
    }>${escapeHtml(
      verified
        ? t("connections.domains.button.verified", null, "Verified")
        : t("connections.domains.button.verify", null, "Verify")
    )}</button>
        <button class="btn ghost" type="button" data-domain-reset-domain="${escapeHtml(domain)}" ${
      verified ? "disabled" : ""
    }>${escapeHtml(t("connections.domains.button.reset_token", null, "Regenerate token"))}</button>
        <button class="btn ghost danger-btn" type="button" data-domain-delete-id="${escapeHtml(String(id))}">${escapeHtml(
          t("connections.domains.button.remove", null, "Remove")
        )}</button>
      </div>
    `;

    domainsListEl.appendChild(row);
  }
}

function renderAppConnections() {
  if (!appConnectionsListEl) return;
  const list = Array.isArray(appConnections) ? appConnections : [];

  if (!list.length) {
    renderEmptyAppConnections(
      t("connections.app_connections.empty_title", null, "No app connections."),
      t("connections.app_connections.empty_body", null, "Once providers are enabled, they will show up here.")
    );
    setAppConnectionsSummary(t("connections.app_connections.summary.zero", null, "0 app connections"));
    return;
  }

  appConnectionsListEl.innerHTML = "";
  const connected = list.filter((entry) => !!entry.connected).length;
  setAppConnectionsSummary(
    t(
      "connections.app_connections.summary.connected",
      { connected, total: list.length },
      `${connected}/${list.length} connected`
    )
  );

  for (const item of list) {
    const provider = String(item.provider || "").trim().toLowerCase();
    const label = String(item.label || provider || "Provider");
    const connectedState = !!item.connected;
    const status =
      String(item.status || "").trim() ||
      (connectedState
        ? t("connections.app_connections.status.connected", null, "connected")
        : t("connections.app_connections.status.disconnected", null, "not connected"));
    const account = String(item.account || "").trim();
    const available = !!item.available;

    const row = document.createElement("article");
    row.className = "app-connection-item";

    const badgeClass = connectedState ? " connected" : available ? "" : " pending";
    const subtitle = account
      ? t("connections.app_connections.subtitle.connected_as", { account }, `Connected as @${account}`)
      : connectedState
      ? t("connections.app_connections.subtitle.connected", null, "Connected")
      : available
      ? t("connections.app_connections.subtitle.not_connected", null, "Not connected yet")
      : t("connections.app_connections.subtitle.coming_soon", null, "Coming soon");

    row.innerHTML = `
      <div class="app-connection-head">
        <div>
          <div class="app-connection-title">${escapeHtml(label)}</div>
          <div class="app-connection-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <span class="app-connection-badge${badgeClass}">${escapeHtml(status)}</span>
      </div>
      <div class="app-connection-meta">${escapeHtml(
        provider === "google"
          ? available
            ? t(
                "connections.app_connections.meta.google_enabled",
                null,
                "Google login (Gmail) can be linked via the login page."
              )
            : t("connections.app_connections.meta.google_disabled", null, "Google login (Gmail) is currently disabled.")
          : provider === "discord"
          ? available
            ? t("connections.app_connections.meta.discord_enabled", null, "Discord login can be linked via the login page.")
            : t("connections.app_connections.meta.discord_disabled", null, "Discord login is currently disabled.")
          : t("connections.app_connections.meta.generic", null, "Provider status is managed via your account.")
      )}</div>
    `;

    appConnectionsListEl.appendChild(row);
  }
}

function renderSessions() {
  if (!sessionsListEl) return;
  const list = Array.isArray(sessions) ? sessions : [];

  if (!list.length) {
    renderEmptySessions(
      t("connections.sessions.empty_title", null, "No active sessions."),
      t("connections.sessions.empty_body", null, "Once you sign in, sessions will appear here.")
    );
    setSessionsSummary(t("connections.sessions.summary.zero", null, "0 active sessions"));
    if (revokeOthersButton) revokeOthersButton.disabled = true;
    return;
  }

  sessionsListEl.innerHTML = "";
  const otherCount = list.filter((entry) => !entry.current).length;
  if (revokeOthersButton) {
    revokeOthersButton.disabled = otherCount <= 0;
  }
  setSessionsSummary(
    t(
      otherCount === 1 ? "connections.sessions.summary.one_other" : "connections.sessions.summary.many_other",
      { total: list.length, others: otherCount },
      `${list.length} active sessions, ${otherCount} other`
    )
  );

  for (const session of list) {
    const createdAt = Number(session.createdAt);
    const expiresAt = Number(session.expiresAt);
    const expiresInSeconds = Number(session.expiresInSeconds);
    const isCurrent = !!session.current;
    const shortId = session.shortId || String(session.id || "").slice(0, 12);
    const sessionTitle = t("connections.sessions.row.title", { id: shortId }, `Session ${shortId}`);
    const sessionSubtitle = isCurrent
      ? t("connections.sessions.row.subtitle.current", null, "This session")
      : t("connections.sessions.row.subtitle.other", null, "Other session");
    const sessionBadge = isCurrent
      ? t("connections.sessions.row.badge.current", null, "Current")
      : t("connections.sessions.row.badge.active", null, "Active");

    const row = document.createElement("article");
    row.className = "session-item";
    row.innerHTML = `
      <div class="session-head">
        <div>
          <div class="session-title">${escapeHtml(sessionTitle)}</div>
          <div class="session-subtitle">${escapeHtml(sessionSubtitle)}</div>
        </div>
        <span class="session-badge${isCurrent ? " current" : ""}">${escapeHtml(sessionBadge)}</span>
      </div>
      <div class="session-meta">
        <div class="session-meta-item">
          <div class="session-meta-key">${escapeHtml(t("connections.sessions.row.created", null, "Created"))}</div>
          <div class="session-meta-value">${escapeHtml(formatDateTime(createdAt))} (${escapeHtml(
      formatRelative(createdAt)
    )})</div>
        </div>
        <div class="session-meta-item">
          <div class="session-meta-key">${escapeHtml(t("connections.sessions.row.expires", null, "Expires"))}</div>
          <div class="session-meta-value">${escapeHtml(formatDateTime(expiresAt))} (${escapeHtml(
      formatExpiresIn(expiresInSeconds)
    )})</div>
        </div>
      </div>
    `;

    const actionWrap = document.createElement("div");
    actionWrap.className = "session-actions";
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "btn ghost";

    if (isCurrent) {
      actionButton.textContent = t("connections.sessions.row.action.current", null, "This session");
      actionButton.disabled = true;
    } else {
      actionButton.textContent = t("connections.sessions.row.action.disconnect", null, "Disconnect");
      actionButton.dataset.disconnectSessionId = String(session.id || "");
    }

    actionWrap.appendChild(actionButton);
    row.appendChild(actionWrap);
    sessionsListEl.appendChild(row);
  }
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

async function loadSessions() {
  if (loadingSessions) return;
  loadingSessions = true;
  setSessionsSummary(t("connections.sessions.loading", null, "Loading active sessions..."));
  setPanelMessage(sessionsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/sessions");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      sessions = [];
      renderEmptySessions(
        t("common.error_loading", null, "Error while loading."),
        t("common.try_again_later", null, "Please try again later.")
      );
      setSessionsSummary(t("common.error_loading", null, "Error while loading."));
      return;
    }

    sessions = Array.isArray(payload.data) ? payload.data : [];
    renderSessions();
  } catch (error) {
    sessions = [];
    renderEmptySessions(
      t("common.connection_failed", null, "Connection failed."),
      t("common.try_again_later", null, "Please try again later.")
    );
    setSessionsSummary(t("common.connection_failed", null, "Connection failed."));
  } finally {
    loadingSessions = false;
  }
}

async function loadAppConnections() {
  if (loadingAppConnections) return;
  loadingAppConnections = true;
  setAppConnectionsSummary(t("connections.app_connections.loading", null, "Loading app connections..."));
  setPanelMessage(appConnectionsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/connections");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      appConnections = [];
      renderEmptyAppConnections(
        t("common.error_loading", null, "Error while loading."),
        t("common.try_again_later", null, "Please try again later.")
      );
      setAppConnectionsSummary(t("common.error_loading", null, "Error while loading."));
      return;
    }

    appConnections = Array.isArray(payload.data) ? payload.data : [];
    renderAppConnections();
  } catch (error) {
    appConnections = [];
    renderEmptyAppConnections(
      t("common.connection_failed", null, "Connection failed."),
      t("common.try_again_later", null, "Please try again later.")
    );
    setAppConnectionsSummary(t("common.connection_failed", null, "Connection failed."));
  } finally {
    syncCredentialModeFromConnections();
    loadingAppConnections = false;
  }
}

async function loadDomains() {
  if (loadingDomains) return;
  loadingDomains = true;
  setDomainsSummary(t("connections.domains.loading", null, "Loading domains..."));
  setPanelMessage(domainsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/domains");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      domains = [];
      renderEmptyDomains(
        t("common.error_loading", null, "Error while loading."),
        t("common.try_again_later", null, "Please try again later.")
      );
      setDomainsSummary(t("common.error_loading", null, "Error while loading."));
      return;
    }

    domains = Array.isArray(payload.data) ? payload.data : [];
    renderDomains();
  } catch (error) {
    domains = [];
    renderEmptyDomains(
      t("common.connection_failed", null, "Connection failed."),
      t("common.try_again_later", null, "Please try again later.")
    );
    setDomainsSummary(t("common.connection_failed", null, "Connection failed."));
  } finally {
    loadingDomains = false;
  }
}

async function createDomainChallenge(domain, options = {}) {
  const rawDomain = String(domain || "").trim();
  if (!rawDomain) return;

  const force = options.force === true;
  setPanelMessage(domainsMessageEl, t("connections.domains.msg.creating_challenge", null, "Creating DNS challenge..."));

  if (domainInputEl) domainInputEl.disabled = true;

  try {
    const { response, payload } = await fetchJson("/api/account/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: rawDomain, force }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 409) {
      setPanelMessage(
        domainsMessageEl,
        t(
          "connections.domains.msg.conflict",
          null,
          "This domain is already verified in another account."
        ),
        "error"
      );
      return;
    }

    if (!response.ok || !payload?.ok) {
      setPanelMessage(
        domainsMessageEl,
        t(
          "connections.domains.msg.create_failed_input",
          null,
          "Challenge could not be created. Please check your input."
        ),
        "error"
      );
      return;
    }

    const alreadyVerified = !!payload?.alreadyVerified;
    if (alreadyVerified) {
      setPanelMessage(domainsMessageEl, t("connections.domains.msg.already_verified", null, "Domain is already verified."), "success");
    } else {
      setPanelMessage(
        domainsMessageEl,
        t(
          "connections.domains.msg.challenge_created",
          null,
          "Challenge created. Set the TXT record and then verify."
        ),
        "success"
      );
    }

    if (domainInputEl) domainInputEl.value = "";
    await loadDomains();
  } catch (error) {
    setPanelMessage(domainsMessageEl, t("connections.domains.msg.create_failed", null, "Challenge could not be created."), "error");
  } finally {
    if (domainInputEl) domainInputEl.disabled = false;
  }
}

async function verifyDomain(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  setPanelMessage(domainsMessageEl, t("connections.domains.msg.verifying_dns", null, "Checking DNS..."));

  try {
    const { response, payload } = await fetchJson("/api/account/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: numericId }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.ok && payload?.ok) {
      setPanelMessage(
        domainsMessageEl,
        payload?.alreadyVerified
          ? t("connections.domains.msg.already_verified", null, "Domain is already verified.")
          : t("connections.domains.msg.verified", null, "Domain verified."),
        "success"
      );
      await loadDomains();
      return;
    }

    const errorCode = String(payload?.error || "").toLowerCase();
    if (errorCode === "dns not ready") {
      setPanelMessage(
        domainsMessageEl,
        t(
          "connections.domains.msg.dns_not_ready",
          null,
          "TXT record not found yet. Please wait a few minutes and try verifying again."
        ),
        "error"
      );
      await loadDomains();
      return;
    }

    if (errorCode === "dns lookup failed") {
      setPanelMessage(
        domainsMessageEl,
        t("connections.domains.msg.dns_lookup_failed", null, "DNS lookup failed. Please try again later."),
        "error"
      );
      return;
    }

    if (response.status === 404) {
      setPanelMessage(domainsMessageEl, t("connections.domains.msg.not_found", null, "Domain not found."), "error");
      await loadDomains();
      return;
    }

    setPanelMessage(domainsMessageEl, t("connections.domains.msg.verify_failed", null, "Verification failed."), "error");
  } catch (error) {
    setPanelMessage(domainsMessageEl, t("connections.domains.msg.verify_failed", null, "Verification failed."), "error");
  }
}

async function deleteDomain(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  const confirmed = window.confirm(
    t("connections.domains.confirm_remove", null, "Remove domain verification?")
  );
  if (!confirmed) return;

  setPanelMessage(domainsMessageEl, t("connections.domains.msg.removing", null, "Removing domain..."));

  try {
    const { response, payload } = await fetchJson(`/api/account/domains/${encodeURIComponent(String(numericId))}`, {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok) {
      setPanelMessage(domainsMessageEl, t("connections.domains.msg.remove_failed", null, "Domain could not be removed."), "error");
      return;
    }

    setPanelMessage(domainsMessageEl, t("connections.domains.msg.removed", null, "Domain removed."), "success");
    await loadDomains();
  } catch (error) {
    setPanelMessage(domainsMessageEl, t("connections.domains.msg.remove_failed", null, "Domain could not be removed."), "error");
  }
}

async function disconnectSession(sessionId) {
  const id = String(sessionId || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(id)) return;

  setPanelMessage(sessionsMessageEl, t("connections.sessions.msg.disconnecting", null, "Disconnecting session..."));

  try {
    const { response, payload } = await fetchJson(`/api/account/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      setPanelMessage(
        sessionsMessageEl,
        t("connections.sessions.msg.disconnect_failed", null, "Session could not be disconnected."),
        "error"
      );
      return;
    }

    if (payload.currentTerminated) {
      window.location.href = "/login";
      return;
    }

    setPanelMessage(sessionsMessageEl, t("connections.sessions.msg.disconnected", null, "Session disconnected."), "success");
    await loadSessions();
  } catch (error) {
    setPanelMessage(
      sessionsMessageEl,
      t("connections.sessions.msg.disconnect_failed", null, "Session could not be disconnected."),
      "error"
    );
  }
}

async function revokeOtherSessions() {
  setPanelMessage(sessionsMessageEl, t("connections.sessions.msg.revoking_others", null, "Disconnecting other sessions..."));
  if (revokeOthersButton) revokeOthersButton.disabled = true;

  try {
    const { response, payload } = await fetchJson("/api/account/sessions/revoke-others", {
      method: "POST",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      setPanelMessage(
        sessionsMessageEl,
        t("connections.sessions.msg.revoke_failed", null, "Other sessions could not be disconnected."),
        "error"
      );
      return;
    }

    const revoked = Number(payload.revoked || 0);
    setPanelMessage(
      sessionsMessageEl,
      t(
        revoked === 1 ? "connections.sessions.msg.revoked_one" : "connections.sessions.msg.revoked_many",
        { n: revoked },
        `${revoked} session(s) disconnected. Current session stays active.`
      ),
      "success"
    );
    await loadSessions();
  } catch (error) {
    setPanelMessage(
      sessionsMessageEl,
      t("connections.sessions.msg.revoke_failed", null, "Other sessions could not be disconnected."),
      "error"
    );
  } finally {
    if (revokeOthersButton) {
      const otherCount = (Array.isArray(sessions) ? sessions : []).filter((entry) => !entry.current).length;
      revokeOthersButton.disabled = otherCount <= 0;
    }
  }
}

async function handleDomainSubmit(event) {
  event.preventDefault();

  const domain = String(domainInputEl?.value || "").trim();
  if (!domain) {
    setPanelMessage(domainsMessageEl, t("connections.domains.msg.enter_domain", null, "Please enter a domain."), "error");
    return;
  }

  await createDomainChallenge(domain);
}

async function handlePasswordSubmit(event) {
  event.preventDefault();

  const currentPassword = currentPasswordEl?.value || "";
  const newPassword = newPasswordEl?.value || "";
  const repeatPassword = repeatPasswordEl?.value || "";

  if (!currentPassword && !canUsePasswordlessAccountActions) {
    setPanelMessage(passwordMessageEl, t("connections.password.msg.enter_current", null, "Please enter your current password."), "error");
    return;
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    setPanelMessage(
      passwordMessageEl,
      t(
        "connections.password.msg.invalid_length",
        { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH },
        `New password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long.`
      ),
      "error"
    );
    return;
  }
  if (newPassword !== repeatPassword) {
    setPanelMessage(passwordMessageEl, t("connections.password.msg.mismatch", null, "New passwords do not match."), "error");
    return;
  }
  if (currentPassword && newPassword === currentPassword) {
    setPanelMessage(passwordMessageEl, t("connections.password.msg.must_differ", null, "New password must be different."), "error");
    return;
  }

  setPanelMessage(passwordMessageEl, t("connections.password.msg.saving", null, "Saving password..."));

  try {
    const { response, payload } = await fetchJson("/api/account/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (response.status === 401) {
      if (payload?.error === "invalid credentials") {
        setPanelMessage(passwordMessageEl, t("connections.password.msg.current_wrong", null, "Current password is incorrect."), "error");
      } else if (payload?.error === "reauth required") {
        setPanelMessage(
          passwordMessageEl,
          t("connections.password.msg.reauth_required", null, "Please sign in again and retry the action."),
          "error"
        );
      } else {
        window.location.href = "/login";
      }
      return;
    }

    if (!response.ok || !payload?.ok) {
      if (payload?.error === "same password") {
        setPanelMessage(passwordMessageEl, t("connections.password.msg.same_password", null, "New password must not be the same."), "error");
      } else if (payload?.error === "current password required") {
        setPanelMessage(passwordMessageEl, t("connections.password.msg.current_required", null, "Current password is required."), "error");
      } else if (payload?.error === "invalid input") {
        setPanelMessage(passwordMessageEl, t("connections.password.msg.invalid_input", null, "Please check your input."), "error");
      } else {
        setPanelMessage(passwordMessageEl, t("connections.password.msg.change_failed", null, "Password could not be changed."), "error");
      }
      return;
    }

    const revoked = Number(payload.revoked || 0);
    const base = currentPassword
      ? t("connections.password.msg.saved", null, "Password saved.")
      : t("connections.password.msg.set", null, "Password set.");
    const suffix =
      revoked <= 0
        ? ""
        : t(
            revoked === 1 ? "connections.password.msg.revoked_one" : "connections.password.msg.revoked_many",
            { n: revoked },
            `${revoked} other session(s) disconnected.`
          );
    setPanelMessage(passwordMessageEl, suffix ? `${base} ${suffix}` : base, "success");

    if (currentPasswordEl) currentPasswordEl.value = "";
    if (newPasswordEl) newPasswordEl.value = "";
    if (repeatPasswordEl) repeatPasswordEl.value = "";
    await loadSessions();
  } catch (error) {
    setPanelMessage(passwordMessageEl, t("connections.password.msg.change_failed", null, "Password could not be changed."), "error");
  }
}

async function handleDeleteAccountSubmit(event) {
  event.preventDefault();

  const currentPassword = deleteAccountPasswordEl?.value || "";
  if (!currentPassword && !canUsePasswordlessAccountActions) {
    setPanelMessage(
      deleteAccountMessageEl,
      t("connections.delete.msg.enter_current", null, "Please enter your current password."),
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    t(
      "connections.delete.confirm",
      null,
      "Do you really want to permanently delete your account? All monitors and sessions will be removed."
    )
  );
  if (!confirmed) return;

  setPanelMessage(deleteAccountMessageEl, t("connections.delete.msg.deleting", null, "Deleting account..."));
  if (deleteAccountButton) deleteAccountButton.disabled = true;

  try {
    const { response, payload } = await fetchJson("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        oauthConfirm: canUsePasswordlessAccountActions && !currentPassword,
      }),
    });

    if (response.status === 401) {
      if (payload?.error === "invalid credentials") {
        setPanelMessage(
          deleteAccountMessageEl,
          t("connections.delete.msg.current_wrong", null, "Current password is incorrect."),
          "error"
        );
      } else if (payload?.error === "reauth required") {
        setPanelMessage(
          deleteAccountMessageEl,
          t("connections.password.msg.reauth_required", null, "Please sign in again and retry the action."),
          "error"
        );
      } else {
        window.location.href = "/login";
      }
      return;
    }

    if (!response.ok || !payload?.ok) {
      if (payload?.error === "invalid input" || payload?.error === "current password required") {
        setPanelMessage(
          deleteAccountMessageEl,
          t("connections.password.msg.invalid_input", null, "Please check your input."),
          "error"
        );
      } else {
        setPanelMessage(
          deleteAccountMessageEl,
          t("connections.delete.msg.delete_failed", null, "Account could not be deleted."),
          "error"
        );
      }
      return;
    }

    setPanelMessage(deleteAccountMessageEl, t("connections.delete.msg.deleted", null, "Account deleted. Redirecting..."), "success");
    window.location.href = "/login";
  } catch (error) {
    setPanelMessage(
      deleteAccountMessageEl,
      t("connections.delete.msg.delete_failed", null, "Account could not be deleted."),
      "error"
    );
  } finally {
    if (deleteAccountButton) deleteAccountButton.disabled = false;
    if (deleteAccountPasswordEl) deleteAccountPasswordEl.value = "";
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

  if (refreshSessionsButton) {
    refreshSessionsButton.addEventListener("click", () => {
      Promise.all([loadAppConnections(), loadDomains(), loadSessions()]).catch(() => {
        // ignore
      });
    });
  }

  if (revokeOthersButton) {
    revokeOthersButton.addEventListener("click", () => {
      revokeOtherSessions().catch(() => {
        // ignore
      });
    });
  }

  if (sessionsListEl) {
    sessionsListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("button[data-disconnect-session-id]");
      if (!button) return;
      const sessionId = button.getAttribute("data-disconnect-session-id") || "";
      disconnectSession(sessionId).catch(() => {
        // ignore
      });
    });
  }

  if (domainForm) {
    domainForm.addEventListener("submit", handleDomainSubmit);
  }

  if (domainsListEl) {
    domainsListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const verifyButton = target.closest("button[data-domain-verify-id]");
      if (verifyButton) {
        const id = verifyButton.getAttribute("data-domain-verify-id") || "";
        verifyDomain(id).catch(() => {
          // ignore
        });
        return;
      }

      const resetButton = target.closest("button[data-domain-reset-domain]");
      if (resetButton) {
        const domain = resetButton.getAttribute("data-domain-reset-domain") || "";
        createDomainChallenge(domain, { force: true }).catch(() => {
          // ignore
        });
        return;
      }

      const deleteButton = target.closest("button[data-domain-delete-id]");
      if (deleteButton) {
        const id = deleteButton.getAttribute("data-domain-delete-id") || "";
        deleteDomain(id).catch(() => {
          // ignore
        });
      }
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", handlePasswordSubmit);
  }

  if (deleteAccountForm) {
    deleteAccountForm.addEventListener("submit", handleDeleteAccountSubmit);
  }
}

async function init() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;
  applyCredentialModeUi();
  await syncPublicStatusLinks();

  const prefillDomain = String(new URLSearchParams(window.location.search).get("domain") || "").trim();
  if (prefillDomain && domainInputEl) {
    domainInputEl.value = prefillDomain;
    domainInputEl.focus();
  }
  if (prefillDomain || window.location.hash === "#domain-verification") {
    const section = document.getElementById("domain-verification");
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ block: "start" });
    }
  }

  bindEvents();
  await Promise.all([loadAppConnections(), loadDomains(), loadSessions()]);
}

init();

