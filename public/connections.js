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
  const optionalPlaceholder = "Optional bei App-Login";

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
      ? "Aktuelles Passwort ist erforderlich."
      : "Bei verbundener App-Connection ist das aktuelle Passwort optional (frische Anmeldung erforderlich).";
  }

  if (deleteModeHintEl) {
    deleteModeHintEl.textContent = requireCurrentPassword
      ? "Aktuelles Passwort ist erforderlich."
      : "Bei verbundener App-Connection kannst du auch ohne Passwort löschen (frische Anmeldung erforderlich).";
  }
}

function syncCredentialModeFromConnections() {
  const list = Array.isArray(appConnections) ? appConnections : [];
  canUsePasswordlessAccountActions = list.some((entry) => !!entry?.connected);
  applyCredentialModeUi();
}

function formatDateTime(ts) {
  if (!Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatRelative(ts) {
  if (!Number.isFinite(ts)) return "unbekannt";
  const diffMs = Math.max(0, Date.now() - ts);
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `vor ${totalSeconds} Sek.`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `vor ${totalMinutes} Min.`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `vor ${totalHours} Std.`;

  const totalDays = Math.floor(totalHours / 24);
  return `vor ${totalDays} Tag${totalDays === 1 ? "" : "en"}`;
}

function formatExpiresIn(seconds) {
  if (!Number.isFinite(seconds)) return "unbekannt";
  if (seconds <= 0) return "läuft ab";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `in ${totalMinutes} Min.`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `in ${totalHours} Std.`;
  const totalDays = Math.floor(totalHours / 24);
  return `in ${totalDays} Tag${totalDays === 1 ? "" : "en"}`;
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
    return `Verifiziert am ${formatDateTime(verifiedAt)}.`;
  }

  const lastCheckedAt = Number(item?.lastCheckedAt);
  const lastError = String(item?.lastCheckError || "").trim();
  if (Number.isFinite(lastCheckedAt) && lastCheckedAt > 0) {
    const base = `Letzter Check: ${formatDateTime(lastCheckedAt)} (${formatRelative(lastCheckedAt)})`;
    return lastError ? `${base} · ${lastError}` : `${base}.`;
  }

  return "TXT Record setzen und dann verifizieren.";
}

function renderDomains() {
  if (!domainsListEl) return;
  const list = Array.isArray(domains) ? domains : [];

  if (!list.length) {
    renderEmptyDomains("Keine Domains.", "Wenn du eine Domain hinzufügst, erscheint sie hier.");
    setDomainsSummary("0 Domains");
    return;
  }

  domainsListEl.innerHTML = "";
  const verifiedCount = list.filter((entry) => Number.isFinite(Number(entry?.verifiedAt)) && Number(entry.verifiedAt) > 0).length;
  setDomainsSummary(`${verifiedCount} von ${list.length} Domains verifiziert`);

  for (const item of list) {
    const id = Number(item?.id);
    const domain = String(item?.domain || "").trim();
    if (!Number.isFinite(id) || id <= 0 || !domain) continue;

    const verified = Number.isFinite(Number(item?.verifiedAt)) && Number(item.verifiedAt) > 0;
    const badgeClass = verified ? " verified" : " pending";
    const badgeText = verified ? "Verifiziert" : "Ausstehend";

    const recordName = String(item?.recordName || "").trim() || `_pingmyserver-challenge.${domain}`;
    const recordValue = String(item?.recordValue || "").trim();

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
          <div class="domain-record-key">Name/Host</div>
          <div class="domain-code">${escapeHtml(recordName)}</div>
        </div>
        <div class="domain-record-row">
          <div class="domain-record-key">TXT Wert</div>
          <div class="domain-code">${escapeHtml(recordValue || "(Token wird geladen...)")}</div>
        </div>
        <div class="muted domain-hint">Je nach DNS-Provider reicht als Host auch nur <span class="domain-code">${escapeHtml(
          "_pingmyserver-challenge"
        )}</span>.</div>
      </div>

      <div class="domain-actions">
        <button class="btn ghost" type="button" data-domain-verify-id="${escapeHtml(String(id))}" ${
      verified ? "disabled" : ""
    }>${verified ? "Verifiziert" : "Verifizieren"}</button>
        <button class="btn ghost" type="button" data-domain-reset-domain="${escapeHtml(domain)}" ${
      verified ? "disabled" : ""
    }>Token neu erstellen</button>
        <button class="btn ghost danger-btn" type="button" data-domain-delete-id="${escapeHtml(String(id))}">Entfernen</button>
      </div>
    `;

    domainsListEl.appendChild(row);
  }
}

function renderAppConnections() {
  if (!appConnectionsListEl) return;
  const list = Array.isArray(appConnections) ? appConnections : [];

  if (!list.length) {
    renderEmptyAppConnections("Keine App Connections.", "Sobald Provider aktiv sind, erscheinen sie hier.");
    setAppConnectionsSummary("0 App Connections");
    return;
  }

  appConnectionsListEl.innerHTML = "";
  const connected = list.filter((entry) => !!entry.connected).length;
  setAppConnectionsSummary(`${connected} von ${list.length} App Connections verbunden`);

  for (const item of list) {
    const provider = String(item.provider || "").trim().toLowerCase();
    const label = String(item.label || provider || "Provider");
    const connectedState = !!item.connected;
    const status = String(item.status || "").trim() || (connectedState ? "verbunden" : "nicht verbunden");
    const account = String(item.account || "").trim();
    const available = !!item.available;

    const row = document.createElement("article");
    row.className = "app-connection-item";

    const badgeClass = connectedState ? " connected" : available ? "" : " pending";
    const subtitle = account
      ? `Verbunden als @${account}`
      : connectedState
      ? "Verbunden"
      : available
      ? "Noch nicht verbunden"
      : "Bald verfügbar";

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
            ? "Google Login (Gmail) kann über die Login-Seite verbunden werden."
            : "Google Login (Gmail) ist derzeit deaktiviert."
          : provider === "discord"
          ? available
            ? "Discord Login kann über die Login-Seite verbunden werden."
            : "Discord Login ist derzeit deaktiviert."
          : "Provider-Status wird über dein Konto verwaltet."
      )}</div>
    `;

    appConnectionsListEl.appendChild(row);
  }
}

function renderSessions() {
  if (!sessionsListEl) return;
  const list = Array.isArray(sessions) ? sessions : [];

  if (!list.length) {
    renderEmptySessions("Keine aktiven Sitzungen.", "Sobald du dich anmeldest, erscheinen Sitzungen hier.");
    setSessionsSummary("0 aktive Sitzungen");
    if (revokeOthersButton) revokeOthersButton.disabled = true;
    return;
  }

  sessionsListEl.innerHTML = "";
  const otherCount = list.filter((entry) => !entry.current).length;
  if (revokeOthersButton) {
    revokeOthersButton.disabled = otherCount <= 0;
  }
  setSessionsSummary(`${list.length} aktive Sitzungen, ${otherCount} weitere Sitzung${otherCount === 1 ? "" : "en"}`);

  for (const session of list) {
    const createdAt = Number(session.createdAt);
    const expiresAt = Number(session.expiresAt);
    const expiresInSeconds = Number(session.expiresInSeconds);
    const isCurrent = !!session.current;

    const row = document.createElement("article");
    row.className = "session-item";
    row.innerHTML = `
      <div class="session-head">
        <div>
          <div class="session-title">Session ${escapeHtml(session.shortId || String(session.id || "").slice(0, 12))}</div>
          <div class="session-subtitle">${isCurrent ? "Diese Sitzung" : "Weitere Sitzung"}</div>
        </div>
        <span class="session-badge${isCurrent ? " current" : ""}">${isCurrent ? "Aktuell" : "Aktiv"}</span>
      </div>
      <div class="session-meta">
        <div class="session-meta-item">
          <div class="session-meta-key">Erstellt</div>
          <div class="session-meta-value">${escapeHtml(formatDateTime(createdAt))} (${escapeHtml(
      formatRelative(createdAt)
    )})</div>
        </div>
        <div class="session-meta-item">
          <div class="session-meta-key">Läuft ab</div>
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
      actionButton.textContent = "Diese Sitzung";
      actionButton.disabled = true;
    } else {
      actionButton.textContent = "Entbinden";
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
      currentUserEmail.textContent = user.email || "eingeloggt";
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function loadSessions() {
  if (loadingSessions) return;
  loadingSessions = true;
  setSessionsSummary("Lade aktive Sitzungen...");
  setPanelMessage(sessionsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/sessions");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      sessions = [];
      renderEmptySessions("Fehler beim Laden.", "Bitte später erneut versuchen.");
      setSessionsSummary("Fehler beim Laden");
      return;
    }

    sessions = Array.isArray(payload.data) ? payload.data : [];
    renderSessions();
  } catch (error) {
    sessions = [];
    renderEmptySessions("Verbindung fehlgeschlagen.", "Bitte später erneut versuchen.");
    setSessionsSummary("Verbindung fehlgeschlagen");
  } finally {
    loadingSessions = false;
  }
}

async function loadAppConnections() {
  if (loadingAppConnections) return;
  loadingAppConnections = true;
  setAppConnectionsSummary("Lade App Connections...");
  setPanelMessage(appConnectionsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/connections");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      appConnections = [];
      renderEmptyAppConnections("Fehler beim Laden.", "Bitte später erneut versuchen.");
      setAppConnectionsSummary("Fehler beim Laden");
      return;
    }

    appConnections = Array.isArray(payload.data) ? payload.data : [];
    renderAppConnections();
  } catch (error) {
    appConnections = [];
    renderEmptyAppConnections("Verbindung fehlgeschlagen.", "Bitte später erneut versuchen.");
    setAppConnectionsSummary("Verbindung fehlgeschlagen");
  } finally {
    syncCredentialModeFromConnections();
    loadingAppConnections = false;
  }
}

async function loadDomains() {
  if (loadingDomains) return;
  loadingDomains = true;
  setDomainsSummary("Lade Domains...");
  setPanelMessage(domainsMessageEl, "");

  try {
    const { response, payload } = await fetchJson("/api/account/domains");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      domains = [];
      renderEmptyDomains("Fehler beim Laden.", "Bitte später erneut versuchen.");
      setDomainsSummary("Fehler beim Laden");
      return;
    }

    domains = Array.isArray(payload.data) ? payload.data : [];
    renderDomains();
  } catch (error) {
    domains = [];
    renderEmptyDomains("Verbindung fehlgeschlagen.", "Bitte später erneut versuchen.");
    setDomainsSummary("Verbindung fehlgeschlagen");
  } finally {
    loadingDomains = false;
  }
}

async function createDomainChallenge(domain, options = {}) {
  const rawDomain = String(domain || "").trim();
  if (!rawDomain) return;

  const force = options.force === true;
  setPanelMessage(domainsMessageEl, "DNS-Challenge wird erstellt...");

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
      setPanelMessage(domainsMessageEl, "Diese Domain ist bereits in einem anderen Konto verifiziert.", "error");
      return;
    }

    if (!response.ok || !payload?.ok) {
      setPanelMessage(domainsMessageEl, "Challenge konnte nicht erstellt werden. Bitte Eingabe prüfen.", "error");
      return;
    }

    const alreadyVerified = !!payload?.alreadyVerified;
    if (alreadyVerified) {
      setPanelMessage(domainsMessageEl, "Domain ist bereits verifiziert.", "success");
    } else {
      setPanelMessage(domainsMessageEl, "Challenge erstellt. TXT Record setzen und danach verifizieren.", "success");
    }

    if (domainInputEl) domainInputEl.value = "";
    await loadDomains();
  } catch (error) {
    setPanelMessage(domainsMessageEl, "Challenge konnte nicht erstellt werden.", "error");
  } finally {
    if (domainInputEl) domainInputEl.disabled = false;
  }
}

async function verifyDomain(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  setPanelMessage(domainsMessageEl, "DNS wird geprüft...");

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
      setPanelMessage(domainsMessageEl, payload?.alreadyVerified ? "Domain ist bereits verifiziert." : "Domain verifiziert.", "success");
      await loadDomains();
      return;
    }

    const errorCode = String(payload?.error || "").toLowerCase();
    if (errorCode === "dns not ready") {
      setPanelMessage(
        domainsMessageEl,
        "TXT Record noch nicht gefunden. Bitte 1-5 Minuten warten (oder länger) und erneut verifizieren.",
        "error"
      );
      await loadDomains();
      return;
    }

    if (errorCode === "dns lookup failed") {
      setPanelMessage(domainsMessageEl, "DNS Lookup fehlgeschlagen. Bitte später erneut versuchen.", "error");
      return;
    }

    if (response.status === 404) {
      setPanelMessage(domainsMessageEl, "Domain nicht gefunden.", "error");
      await loadDomains();
      return;
    }

    setPanelMessage(domainsMessageEl, "Verifizierung fehlgeschlagen.", "error");
  } catch (error) {
    setPanelMessage(domainsMessageEl, "Verifizierung fehlgeschlagen.", "error");
  }
}

async function deleteDomain(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  const confirmed = window.confirm("Domain-Verifizierung wirklich entfernen?");
  if (!confirmed) return;

  setPanelMessage(domainsMessageEl, "Domain wird entfernt...");

  try {
    const { response, payload } = await fetchJson(`/api/account/domains/${encodeURIComponent(String(numericId))}`, {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !payload?.ok) {
      setPanelMessage(domainsMessageEl, "Domain konnte nicht entfernt werden.", "error");
      return;
    }

    setPanelMessage(domainsMessageEl, "Domain entfernt.", "success");
    await loadDomains();
  } catch (error) {
    setPanelMessage(domainsMessageEl, "Domain konnte nicht entfernt werden.", "error");
  }
}

async function disconnectSession(sessionId) {
  const id = String(sessionId || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(id)) return;

  setPanelMessage(sessionsMessageEl, "Sitzung wird getrennt...");

  try {
    const { response, payload } = await fetchJson(`/api/account/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok || !payload?.ok) {
      setPanelMessage(sessionsMessageEl, "Sitzung konnte nicht getrennt werden.", "error");
      return;
    }

    if (payload.currentTerminated) {
      window.location.href = "/login";
      return;
    }

    setPanelMessage(sessionsMessageEl, "Sitzung wurde getrennt.", "success");
    await loadSessions();
  } catch (error) {
    setPanelMessage(sessionsMessageEl, "Sitzung konnte nicht getrennt werden.", "error");
  }
}

async function revokeOtherSessions() {
  setPanelMessage(sessionsMessageEl, "Andere Sitzungen werden getrennt...");
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
      setPanelMessage(sessionsMessageEl, "Andere Sitzungen konnten nicht getrennt werden.", "error");
      return;
    }

    const revoked = Number(payload.revoked || 0);
    setPanelMessage(
      sessionsMessageEl,
      `${revoked} Sitzung${revoked === 1 ? "" : "en"} getrennt. Aktuelle Sitzung bleibt aktiv.`,
      "success"
    );
    await loadSessions();
  } catch (error) {
    setPanelMessage(sessionsMessageEl, "Andere Sitzungen konnten nicht getrennt werden.", "error");
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
    setPanelMessage(domainsMessageEl, "Bitte Domain eingeben.", "error");
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
    setPanelMessage(passwordMessageEl, "Bitte aktuelles Passwort eingeben.", "error");
    return;
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    setPanelMessage(
      passwordMessageEl,
      `Neues Passwort muss ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
      "error"
    );
    return;
  }
  if (newPassword !== repeatPassword) {
    setPanelMessage(passwordMessageEl, "Neue Passwörter stimmen nicht überein.", "error");
    return;
  }
  if (currentPassword && newPassword === currentPassword) {
    setPanelMessage(passwordMessageEl, "Neues Passwort muss sich unterscheiden.", "error");
    return;
  }

  setPanelMessage(passwordMessageEl, "Passwort wird gespeichert...");

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
        setPanelMessage(passwordMessageEl, "Aktuelles Passwort ist falsch.", "error");
      } else if (payload?.error === "reauth required") {
        setPanelMessage(passwordMessageEl, "Bitte neu anmelden und den Vorgang direkt wiederholen.", "error");
      } else {
        window.location.href = "/login";
      }
      return;
    }

    if (!response.ok || !payload?.ok) {
      if (payload?.error === "same password") {
        setPanelMessage(passwordMessageEl, "Neues Passwort darf nicht identisch sein.", "error");
      } else if (payload?.error === "current password required") {
        setPanelMessage(passwordMessageEl, "Aktuelles Passwort ist erforderlich.", "error");
      } else if (payload?.error === "invalid input") {
        setPanelMessage(passwordMessageEl, "Bitte Eingaben prüfen.", "error");
      } else {
        setPanelMessage(passwordMessageEl, "Passwort konnte nicht geändert werden.", "error");
      }
      return;
    }

    const revoked = Number(payload.revoked || 0);
    setPanelMessage(
      passwordMessageEl,
      `${currentPassword ? "Passwort gespeichert." : "Passwort gesetzt."} ${revoked} weitere Session${
        revoked === 1 ? "" : "s"
      } getrennt.`,
      "success"
    );

    if (currentPasswordEl) currentPasswordEl.value = "";
    if (newPasswordEl) newPasswordEl.value = "";
    if (repeatPasswordEl) repeatPasswordEl.value = "";
    await loadSessions();
  } catch (error) {
    setPanelMessage(passwordMessageEl, "Passwort konnte nicht geändert werden.", "error");
  }
}

async function handleDeleteAccountSubmit(event) {
  event.preventDefault();

  const currentPassword = deleteAccountPasswordEl?.value || "";
  if (!currentPassword && !canUsePasswordlessAccountActions) {
    setPanelMessage(deleteAccountMessageEl, "Bitte aktuelles Passwort eingeben.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Willst du dein Konto wirklich dauerhaft löschen? Alle Monitore und Sessions werden entfernt."
  );
  if (!confirmed) return;

  setPanelMessage(deleteAccountMessageEl, "Konto wird gelöscht...");
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
        setPanelMessage(deleteAccountMessageEl, "Aktuelles Passwort ist falsch.", "error");
      } else if (payload?.error === "reauth required") {
        setPanelMessage(deleteAccountMessageEl, "Bitte neu anmelden und den Vorgang direkt wiederholen.", "error");
      } else {
        window.location.href = "/login";
      }
      return;
    }

    if (!response.ok || !payload?.ok) {
      if (payload?.error === "invalid input" || payload?.error === "current password required") {
        setPanelMessage(deleteAccountMessageEl, "Bitte Eingaben prüfen.", "error");
      } else {
        setPanelMessage(deleteAccountMessageEl, "Konto konnte nicht gelöscht werden.", "error");
      }
      return;
    }

    setPanelMessage(deleteAccountMessageEl, "Konto gelöscht. Weiterleitung ...", "success");
    window.location.href = "/login";
  } catch (error) {
    setPanelMessage(deleteAccountMessageEl, "Konto konnte nicht gelöscht werden.", "error");
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
  bindEvents();
  await Promise.all([loadAppConnections(), loadDomains(), loadSessions()]);
}

init();

