const pollIntervalMs = 5000;
const monitorsRefreshIntervalMs = 30000;

const barsContainer = document.getElementById("uptime-bars");
const chart = document.getElementById("response-chart");

const statusState = document.getElementById("status-state");
const statusDuration = document.getElementById("status-duration");
const lastCheck = document.getElementById("last-check");
const checkInterval = document.getElementById("check-interval");

const statAvg = document.getElementById("stat-avg");
const statP50 = document.getElementById("stat-p50");
const statP95 = document.getElementById("stat-p95");
const uptimeIncidents = document.getElementById("uptime-incidents");
const uptimePercent = document.getElementById("uptime-percent");
const sloTargetDisplay = document.getElementById("slo-target-display");
const sloWindowUptime = document.getElementById("slo-window-uptime");
const sloWindowMeta = document.getElementById("slo-window-meta");
const sloBudgetRemaining = document.getElementById("slo-budget-remaining");
const sloBudgetRemainingTime = document.getElementById("slo-budget-remaining-time");
const sloBudgetConsumed = document.getElementById("slo-budget-consumed");
const sloBudgetConsumedTime = document.getElementById("slo-budget-consumed-time");
const sloBurn1h = document.getElementById("slo-burn-1h");
const sloBurn6h = document.getElementById("slo-burn-6h");
const sloBurn24h = document.getElementById("slo-burn-24h");
const sloCardEl = document.querySelector(".slo-card");
const sloCardStateBadge = document.getElementById("slo-card-state-badge");
const sloCardNote = document.getElementById("slo-card-note");

const mapEl = document.querySelector(".map");
const mapLocation = document.getElementById("map-location");
const mapCoords = document.getElementById("map-coords");
const domainExpiry = document.getElementById("domain-expiry");
const domainSource = document.getElementById("domain-source");
const sslExpiry = document.getElementById("ssl-expiry");
const sslIssuer = document.getElementById("ssl-issuer");
const incidentsList = document.getElementById("incidents-list");

const heatmapMonths = document.getElementById("heatmap-months");
const heatmapCells = document.getElementById("heatmap-cells");
const monitorNameEl = document.getElementById("monitor-name");
const monitorTargetEl = document.getElementById("monitor-target");
const monitorIconEl = document.getElementById("monitor-icon");
const range7Uptime = document.getElementById("range-7-uptime");
const range7Meta = document.getElementById("range-7-meta");
const range30Uptime = document.getElementById("range-30-uptime");
const range30Meta = document.getElementById("range-30-meta");
const range365Uptime = document.getElementById("range-365-uptime");
const range365Meta = document.getElementById("range-365-meta");
const rangePickerLabel = document.getElementById("range-picker-label");

const currentUserEmail = document.getElementById("current-user-email");
const logoutButton = document.getElementById("logout-btn");
const publicStatusButton = document.getElementById("public-status-btn");
const publicStatusLinks = Array.from(document.querySelectorAll('a[href="/status"]'));
const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));
const newMonitorButton = document.getElementById("new-monitor-btn");
const monitorSelect = document.getElementById("monitor-select");
const locationSelect = document.getElementById("location-select");
const intervalSelect = document.getElementById("interval-select");
const monitorList = document.getElementById("monitor-list");
const responseCard = document.querySelector(".response-card");
const responseHelpButton = document.getElementById("response-help-btn");
const responseHelpPopover = document.getElementById("response-help-popover");
let responseHelpModal = document.getElementById("response-help-modal");
let responseHelpModalCloseButton = document.getElementById("response-help-modal-close");
const incidentsCard = document.querySelector(".incidents-side-card");
const sidebarEl = document.getElementById("dashboard-sidebar");
const mobileNavToggle = document.getElementById("mobile-nav-toggle");
const mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");
const mobileNavQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 900px)")
  : null;

const assertionsForm = document.getElementById("assertions-form");
const assertionsEnabledInput = document.getElementById("assertions-enabled");
const assertionsStatusCodesInput = document.getElementById("assertions-status-codes");
const assertionsFollowRedirectsInput = document.getElementById("assertions-follow-redirects");
const assertionsMaxRedirectsInput = document.getElementById("assertions-max-redirects");
const assertionsContentTypeInput = document.getElementById("assertions-content-type");
const assertionsBodyInput = document.getElementById("assertions-body");
const assertionsTimeoutInput = document.getElementById("assertions-timeout");
const assertionsMessageEl = document.getElementById("assertions-message");

const maintenanceForm = document.getElementById("maintenance-form");
const maintenanceTitleInput = document.getElementById("maintenance-title");
const maintenanceStartInput = document.getElementById("maintenance-start");
const maintenanceEndInput = document.getElementById("maintenance-end");
const maintenanceNoteInput = document.getElementById("maintenance-note");
const maintenanceFormMessageEl = document.getElementById("maintenance-form-message");
const maintenanceListEl = document.getElementById("maintenance-list");
const maintenanceCreateButton = document.getElementById("maintenance-create");
const maintenanceVerifyLinkEl = document.getElementById("maintenance-verify-link");
const sloForm = document.getElementById("slo-form");
const sloTargetInput = document.getElementById("slo-target-input");
const sloSaveButton = document.getElementById("slo-save");
const sloActivateButton = document.getElementById("slo-activate-btn");
const sloStateBadge = document.getElementById("slo-state-badge");
const sloActivationHint = document.getElementById("slo-activation-hint");
const sloMessageEl = document.getElementById("slo-message");

let user = null;
let monitors = [];
let activeMonitorId = null;
let activeLocation = "aggregate";
let availableProbes = [];
let latestMetrics = null;
let statusSince = Date.now();
  let lastCheckTime = null;
  const ACTIVE_MONITOR_STORAGE_KEY = "pms.activeMonitorId";
  const LOCATION_STORAGE_KEY = "pms.location";
  const MONITOR_GROUP_COLLAPSED_STORAGE_KEY = "pms.monitorGroupsCollapsed";
  const RECENT_MONITOR_STORAGE_KEY = "pms.recentMonitorIds";
  const MAX_RECENT_MONITORS = 3;
  const DEFAULT_MONITOR_ICON = "/assets/pingmyserverlogo.png";
  let monitorIconKey = "";

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
const i18nLang = () => (I18N && typeof I18N.getLang === "function" ? I18N.getLang() : "de");
const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
const rtf = () =>
  I18N && typeof I18N.rtf === "function"
    ? I18N.rtf()
    : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });
let assertionsDirty = false;
let assertionsBoundMonitorId = null;
let maintenanceBoundMonitorId = null;
let sloDirty = false;
let sloEnabled = false;

function isMobileSidebarViewport() {
  return !!mobileNavQuery && !!mobileNavQuery.matches;
}

function setMobileSidebarOpen(open) {
  const shouldOpen = !!open && isMobileSidebarViewport();
  document.body.classList.toggle("mobile-sidebar-open", shouldOpen);

  if (mobileNavToggle) {
    mobileNavToggle.classList.toggle("is-open", shouldOpen);
    mobileNavToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  if (!mobileNavBackdrop) return;
  if (shouldOpen) {
    mobileNavBackdrop.removeAttribute("hidden");
  } else {
    mobileNavBackdrop.setAttribute("hidden", "");
  }
}

function closeMobileSidebar() {
  setMobileSidebarOpen(false);
}

function setupMobileSidebar() {
  if (!sidebarEl || !mobileNavToggle || !mobileNavBackdrop) return;

  setMobileSidebarOpen(false);

  mobileNavToggle.addEventListener("click", () => {
    const isOpen = mobileNavToggle.classList.contains("is-open");
    setMobileSidebarOpen(!isOpen);
  });

  mobileNavBackdrop.addEventListener("click", () => {
    closeMobileSidebar();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMobileSidebar();
  });

  const sideNavLinks = Array.from(sidebarEl.querySelectorAll(".side-nav a"));
  sideNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      closeMobileSidebar();
    });
  });

  if (monitorList) {
    monitorList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".monitor-nav-item")) return;
      closeMobileSidebar();
    });
  }

  if (mobileNavQuery && typeof mobileNavQuery.addEventListener === "function") {
    mobileNavQuery.addEventListener("change", () => {
      if (!isMobileSidebarViewport()) closeMobileSidebar();
    });
  } else {
    window.addEventListener("resize", () => {
      if (!isMobileSidebarViewport()) closeMobileSidebar();
    });
  }
}

function setResponseHelpOpen(open) {
  if (!responseHelpButton) return;
  const shouldOpen = !!open;
  const modalEl = ensureResponseHelpModal();

  if (modalEl) {
    if (shouldOpen) {
      if (typeof modalEl.showModal === "function") {
        if (!modalEl.open) modalEl.showModal();
      } else {
        modalEl.setAttribute("open", "");
      }
    } else if (typeof modalEl.close === "function") {
      if (modalEl.open) modalEl.close();
    } else {
      modalEl.removeAttribute("open");
    }
  } else if (responseHelpPopover) {
    responseHelpPopover.hidden = !shouldOpen;
  }

  responseHelpButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  responseHelpButton.classList.toggle("is-open", shouldOpen);
}

function setupResponseHelp() {
  if (!responseHelpButton) return;

  setResponseHelpOpen(false);

  responseHelpButton.addEventListener("click", (event) => {
    event.preventDefault();
    const isOpen = responseHelpButton.getAttribute("aria-expanded") === "true";
    setResponseHelpOpen(!isOpen);
  });

  const modalEl = ensureResponseHelpModal();
  if (modalEl) {
    if (responseHelpModalCloseButton) {
      responseHelpModalCloseButton.addEventListener("click", () => {
        setResponseHelpOpen(false);
      });
    }

    modalEl.addEventListener("click", (event) => {
      if (event.target !== modalEl) return;
      setResponseHelpOpen(false);
    });

    modalEl.addEventListener("close", () => {
      responseHelpButton.setAttribute("aria-expanded", "false");
      responseHelpButton.classList.remove("is-open");
      responseHelpButton.focus();
    });
    return;
  }

  if (!responseHelpPopover) return;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (responseHelpButton.contains(target) || responseHelpPopover.contains(target)) return;
    setResponseHelpOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setResponseHelpOpen(false);
  });
}

function ensureResponseHelpModal() {
  if (responseHelpModal) return responseHelpModal;
  if (!responseHelpPopover || !responseHelpButton) return null;

  const titleSource = responseHelpPopover.querySelector(".response-help-title");
  const listSource = responseHelpPopover.querySelector(".response-help-list");
  const titleText =
    String(titleSource?.textContent || "").trim() ||
    t("app.response.help_title", null, i18nLang() === "de" ? "So liest du den Chart" : "How to read this chart");
  const closeText = t("app.response.help_close", null, i18nLang() === "de" ? "Schliessen" : "Close");
  const fallbackList = `
      <ul class="response-help-list">
        <li>${escapeHtml(t("app.response.help_p50", null, "P50 (Median): 50% aller Checks sind schneller als dieser Wert."))}</li>
        <li>${escapeHtml(
          t("app.response.help_p95", null, "P95: 95% aller Checks sind schneller. Das zeigt Lastspitzen besser als der Durchschnitt.")
        )}</li>
        <li>${escapeHtml(
          t("app.response.help_chart", null, "Linie = Antwortzeit pro Check. Farbbereiche: gruen < 100 ms, gelb 100-250 ms, rot > 250 ms.")
        )}</li>
        <li>${escapeHtml(
          t("app.response.help_tooltip", null, "Mit der Maus ueber die Linie fahren fuer Zeitstempel, Statuscode und Fehler je Messpunkt.")
        )}</li>
      </ul>
  `;
  const listMarkup = listSource?.outerHTML || fallbackList;

  responseHelpModal = document.createElement("dialog");
  responseHelpModal.id = "response-help-modal";
  responseHelpModal.className = "response-help-modal";
  responseHelpModal.setAttribute("aria-labelledby", "response-help-modal-title");
  responseHelpModal.innerHTML = `
    <div class="response-help-modal-card">
      <div class="response-help-modal-head">
        <h3 id="response-help-modal-title" class="response-help-title">${escapeHtml(titleText)}</h3>
        <button id="response-help-modal-close" class="btn ghost response-help-modal-close" type="button">${escapeHtml(closeText)}</button>
      </div>
      ${listMarkup}
    </div>
  `;

  document.body.appendChild(responseHelpModal);
  responseHelpModalCloseButton = responseHelpModal.querySelector("#response-help-modal-close");

  responseHelpPopover.hidden = true;
  responseHelpPopover.setAttribute("aria-hidden", "true");
  responseHelpButton.setAttribute("aria-controls", "response-help-modal");
  responseHelpButton.setAttribute("aria-haspopup", "dialog");

  return responseHelpModal;
}

function setAssertionsMessage(message, variant = "") {
  if (!assertionsMessageEl) return;
  assertionsMessageEl.textContent = String(message || "");
  assertionsMessageEl.classList.toggle("success", variant === "success");
  assertionsMessageEl.classList.toggle("error", variant === "error");
}

function setMaintenanceMessage(message, variant = "") {
  if (!maintenanceFormMessageEl) return;
  maintenanceFormMessageEl.textContent = String(message || "");
  maintenanceFormMessageEl.classList.toggle("success", variant === "success");
  maintenanceFormMessageEl.classList.toggle("error", variant === "error");
}

function setSloMessage(message, variant = "") {
  if (!sloMessageEl) return;
  sloMessageEl.textContent = String(message || "");
  sloMessageEl.classList.toggle("success", variant === "success");
  sloMessageEl.classList.toggle("error", variant === "error");
}

function markSloDirty() {
  sloDirty = true;
  setSloMessage("");
}

function setSloStateBadge(element, enabled) {
  if (!element) return;
  const active = !!enabled;
  element.classList.toggle("is-on", active);
  element.classList.toggle("is-off", !active);
  element.textContent = active
    ? t("app.slo.state_active", null, "Aktiv")
    : t("app.slo.state_inactive", null, "Nicht aktiviert");
}

function applySloEnabledState(enabled) {
  const active = !!enabled;
  sloEnabled = active;

  if (sloCardEl) {
    sloCardEl.hidden = !active;
  }

  if (sloForm) {
    sloForm.classList.toggle("is-disabled", !active);
  }
  if (sloTargetInput) {
    sloTargetInput.disabled = !active;
  }
  if (sloSaveButton) {
    sloSaveButton.disabled = !active;
  }
  if (sloActivateButton) {
    sloActivateButton.hidden = false;
    sloActivateButton.disabled = false;
    sloActivateButton.classList.toggle("is-deactivate", active);
    sloActivateButton.textContent = active
      ? t("app.slo.deactivate_button", null, "SLO deaktivieren")
      : t("app.slo.activate_button", null, "SLO aktivieren");
  }
  if (sloActivationHint) {
    sloActivationHint.textContent = active
      ? t("app.slo.settings_activation_hint_on", null, "Du kannst SLO jederzeit wieder deaktivieren.")
      : t("app.slo.settings_activation_hint_off", null, "Aktiviere SLO zuerst, damit Error-Budget und Burn-Rate berechnet werden.");
  }

  setSloStateBadge(sloStateBadge, active);
}

function syncSloSettingsBounds(slo) {
  if (!sloTargetInput || !slo || typeof slo !== "object") return;
  if (Number.isFinite(Number(slo.minTargetPercent))) {
    sloTargetInput.min = String(Number(slo.minTargetPercent));
  }
  if (Number.isFinite(Number(slo.maxTargetPercent))) {
    sloTargetInput.max = String(Number(slo.maxTargetPercent));
  }
}

function syncSloPanel(slo, options = {}) {
  const { force = false } = options;
  if (!sloForm || !sloTargetInput) return;

  const normalized = slo && typeof slo === "object" ? slo : null;
  if (!normalized) {
    applySloEnabledState(false);
    sloTargetInput.value = "";
    return;
  }

  syncSloSettingsBounds(normalized);
  const enabled = Object.prototype.hasOwnProperty.call(normalized, "enabled") ? !!normalized.enabled : true;
  applySloEnabledState(enabled);

  if (!force && sloDirty) return;

  const targetPercent = Number(normalized.targetPercent);
  if (Number.isFinite(targetPercent)) {
    sloTargetInput.value = targetPercent.toFixed(3);
  } else if (sloTargetInput.value === "") {
    const fallbackTarget = Number(normalized.defaultTargetPercent);
    if (Number.isFinite(fallbackTarget)) {
      sloTargetInput.value = fallbackTarget.toFixed(3);
    }
  }
}

function readSloPayload() {
  return {
    targetPercent: Number(sloTargetInput?.value),
  };
}

async function toggleSloForActiveMonitor() {
  if (!activeMonitorId || !sloActivateButton) return;
  const nextEnabled = !sloEnabled;

  sloActivateButton.disabled = true;
  setSloMessage(
    nextEnabled
      ? t("app.slo.msg_activating", null, "SLO wird aktiviert ...")
      : t("app.slo.msg_deactivating", null, "SLO wird deaktiviert ...")
  );

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/slo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setSloMessage(t("app.slo.msg_failed", null, "Speichern fehlgeschlagen."), "error");
      return;
    }

    sloDirty = false;
    setSloMessage(
      nextEnabled
        ? t("app.slo.msg_activated", null, "SLO aktiviert.")
        : t("app.slo.msg_deactivated", null, "SLO deaktiviert."),
      "success"
    );
    syncSloPanel(payload.data, { force: true });
    await loadMetrics();
  } catch (error) {
    setSloMessage(t("app.slo.msg_failed", null, "Speichern fehlgeschlagen."), "error");
  } finally {
    sloActivateButton.disabled = false;
  }
}

function hideMaintenanceVerifyLink() {
  if (!maintenanceVerifyLinkEl) return;
  maintenanceVerifyLinkEl.hidden = true;
  maintenanceVerifyLinkEl.removeAttribute("data-hostname");
  maintenanceVerifyLinkEl.href = "/connections#domain-verification";
}

function showMaintenanceVerifyLink(hostname) {
  if (!maintenanceVerifyLinkEl) return;
  const clean = String(hostname || "").trim();
  maintenanceVerifyLinkEl.href = clean
    ? `/connections?domain=${encodeURIComponent(clean)}#domain-verification`
    : "/connections#domain-verification";
  maintenanceVerifyLinkEl.hidden = false;
  if (clean) maintenanceVerifyLinkEl.dataset.hostname = clean;
}

function extractHostname(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return String(parsed.hostname || "").trim();
  } catch (error) {
    const withoutProto = raw.replace(/^https?:\/\//i, "");
    const host = withoutProto.split(/[/?#]/)[0] || "";
    return host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").trim();
  }
}

function getActiveMonitorHostnameHint() {
  const fromMetrics = String(latestMetrics?.target || "").trim();
  if (fromMetrics) {
    const host = extractHostname(fromMetrics);
    if (host) return host;
  }
  const monitor = findMonitor(activeMonitorId);
  const fromMonitor = getMonitorTargetUrl(monitor);
  return extractHostname(fromMonitor);
}

function markAssertionsDirty() {
  assertionsDirty = true;
  setAssertionsMessage("");
}

function applyAssertionsEnabledState() {
  if (!assertionsForm || !assertionsEnabledInput) return;

  const enabled = !!assertionsEnabledInput.checked;
  assertionsForm.classList.toggle("is-disabled", !enabled);

  const fields = [
    assertionsStatusCodesInput,
    assertionsFollowRedirectsInput,
    assertionsMaxRedirectsInput,
    assertionsContentTypeInput,
    assertionsBodyInput,
    assertionsTimeoutInput,
  ].filter(Boolean);

  for (const field of fields) {
    field.disabled = !enabled;
  }

  if (assertionsMaxRedirectsInput) {
    const redirectsEnabled = !!assertionsFollowRedirectsInput?.checked;
    assertionsMaxRedirectsInput.disabled = !enabled || !redirectsEnabled;
  }
}

function syncAssertionsPanel(assertions, options = {}) {
  const { force = false } = options;
  if (!assertionsForm) return;
  if (!force && assertionsDirty) return;

  const normalized = assertions && typeof assertions === "object" ? assertions : null;

  assertionsBoundMonitorId = activeMonitorId;

  if (!normalized) {
    if (assertionsEnabledInput) assertionsEnabledInput.checked = false;
    if (assertionsStatusCodesInput) assertionsStatusCodesInput.value = "";
    if (assertionsFollowRedirectsInput) assertionsFollowRedirectsInput.checked = true;
    if (assertionsMaxRedirectsInput) assertionsMaxRedirectsInput.value = "5";
    if (assertionsContentTypeInput) assertionsContentTypeInput.value = "";
    if (assertionsBodyInput) assertionsBodyInput.value = "";
    if (assertionsTimeoutInput) assertionsTimeoutInput.value = "0";
    applyAssertionsEnabledState();
    return;
  }

  if (assertionsEnabledInput) assertionsEnabledInput.checked = !!normalized.enabled;
  if (assertionsStatusCodesInput) assertionsStatusCodesInput.value = String(normalized.expectedStatusCodes || "");
  if (assertionsFollowRedirectsInput) assertionsFollowRedirectsInput.checked = normalized.followRedirects !== false;
  if (assertionsMaxRedirectsInput) {
    const maxRedirects = Number.isFinite(Number(normalized.maxRedirects)) ? Number(normalized.maxRedirects) : 5;
    assertionsMaxRedirectsInput.value = String(maxRedirects);
  }
  if (assertionsContentTypeInput) assertionsContentTypeInput.value = String(normalized.contentTypeContains || "");
  if (assertionsBodyInput) assertionsBodyInput.value = String(normalized.bodyContains || "");
  if (assertionsTimeoutInput) {
    const timeoutMs = Number.isFinite(Number(normalized.timeoutMs)) ? Number(normalized.timeoutMs) : 0;
    assertionsTimeoutInput.value = String(timeoutMs);
  }

  applyAssertionsEnabledState();
}

function readAssertionsPayload() {
  return {
    enabled: !!assertionsEnabledInput?.checked,
    expectedStatusCodes: String(assertionsStatusCodesInput?.value || "").trim(),
    contentTypeContains: String(assertionsContentTypeInput?.value || "").trim(),
    bodyContains: String(assertionsBodyInput?.value || "").trim(),
    followRedirects: !!assertionsFollowRedirectsInput?.checked,
    maxRedirects: Number(assertionsMaxRedirectsInput?.value),
    timeoutMs: Number(assertionsTimeoutInput?.value),
  };
}

function parseDateTimeLocalInput(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (![year, month, day, hour, minute].every((v) => Number.isFinite(v))) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toDateTimeLocalValue(timestampMs) {
  const ms = Number(timestampMs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
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

function getMaintenanceStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return { label: t("app.maintenance.badge.active", null, "active"), cls: "active" };
  if (normalized === "scheduled")
    return { label: t("app.maintenance.badge.scheduled", null, "scheduled"), cls: "scheduled" };
  if (normalized === "completed")
    return { label: t("app.maintenance.badge.completed", null, "completed"), cls: "completed" };
  if (normalized === "cancelled")
    return { label: t("app.maintenance.badge.cancelled", null, "cancelled"), cls: "cancelled" };
  return { label: t("common.unknown", null, "unknown"), cls: "" };
}

function renderMaintenances(maintenances) {
  if (!maintenanceListEl) return;

  if (!maintenances || typeof maintenances !== "object") {
    const title = escapeHtml(t("app.maintenance.disabled_title", null, "Maintenances are not active yet."));
    const body = escapeHtml(
      t(
        "app.maintenance.disabled_body",
        null,
        "Your server is not providing maintenance data yet (backend update/restart is missing)."
      )
    );
    maintenanceListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">${title}</div>
        <div class="muted">${body}</div>
      </div>
    `;
    return;
  }

  const payload = maintenances;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!items.length) {
    const title = escapeHtml(t("app.maintenance.empty_title", null, "No maintenances."));
    const body = escapeHtml(t("app.maintenance.empty_body", null, "Once you schedule a maintenance, it will show up here."));
    maintenanceListEl.innerHTML = `
      <div class="empty-state">
        <div class="title">${title}</div>
        <div class="muted">${body}</div>
      </div>
    `;
    return;
  }

  const prio = (entry) => {
    const status = String(entry?.status || "").toLowerCase();
    if (status === "active") return 0;
    if (status === "scheduled") return 1;
    if (status === "completed") return 2;
    if (status === "cancelled") return 3;
    return 4;
  };

  const ordered = items.slice().sort((a, b) => {
    const pa = prio(a);
    const pb = prio(b);
    if (pa !== pb) return pa - pb;
    return Number(a?.startsAt || 0) - Number(b?.startsAt || 0);
  });

  maintenanceListEl.innerHTML = "";

  for (const entry of ordered) {
    const id = Number(entry?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const status = String(entry?.status || "").toLowerCase();
    const startsAt = Number(entry?.startsAt);
    const endsAt = Number(entry?.endsAt);
    const title = String(entry?.title || t("app.maintenance.default_title", null, "Maintenance")).trim() || t("app.maintenance.default_title", null, "Maintenance");
    const note = String(entry?.message || "").trim();
    const badge = getMaintenanceStatusBadge(status);

    const range = `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
    const metaSuffix =
      status === "scheduled" && Number.isFinite(startsAt)
        ? t(
            "app.maintenance.meta.starts",
            { remaining: formatTimeIn(Math.max(0, startsAt - Date.now())) },
            ` (starts ${formatTimeIn(Math.max(0, startsAt - Date.now()))})`
          )
        : status === "active" && Number.isFinite(endsAt)
        ? t(
            "app.maintenance.meta.ends",
            { remaining: formatTimeIn(Math.max(0, endsAt - Date.now())) },
            ` (ends ${formatTimeIn(Math.max(0, endsAt - Date.now()))})`
          )
        : "";

    const canCancel = status === "scheduled" || status === "active";

    const card = document.createElement("article");
    card.className = "maintenance-item";
    card.innerHTML = `
      <div class="maintenance-item-head">
        <div>
          <div class="maintenance-item-title">${escapeHtml(title)}</div>
          <div class="maintenance-item-subtitle">${escapeHtml(range + metaSuffix)}</div>
        </div>
        <span class="maintenance-item-badge ${escapeHtml(badge.cls)}">${escapeHtml(badge.label)}</span>
      </div>
      ${note ? `<div class="maintenance-item-note">${escapeHtml(note)}</div>` : ""}
      <div class="maintenance-item-actions">
        ${
          canCancel
            ? `<button class="btn ghost" type="button" data-maintenance-cancel-id="${escapeHtml(
                String(id)
              )}">${escapeHtml(t("common.cancel", null, "Cancel"))}</button>`
            : ""
        }
      </div>
    `;

    maintenanceListEl.appendChild(card);
  }
}

function resetMaintenanceForm(shouldFillDefaults = false) {
  setMaintenanceMessage("");
  hideMaintenanceVerifyLink();
  if (maintenanceTitleInput) maintenanceTitleInput.value = "";
  if (maintenanceNoteInput) maintenanceNoteInput.value = "";

  if (!shouldFillDefaults) return;
  if (maintenanceStartInput) maintenanceStartInput.value = "";
  if (maintenanceEndInput) maintenanceEndInput.value = "";
  if (!maintenanceStartInput || !maintenanceEndInput) return;

  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const start = Math.ceil((now + 10 * 60 * 1000) / fiveMin) * fiveMin;
  const end = start + 30 * 60 * 1000;
  maintenanceStartInput.value = toDateTimeLocalValue(start);
  maintenanceEndInput.value = toDateTimeLocalValue(end);
}

function syncMaintenancePanel(maintenances) {
  if (maintenanceBoundMonitorId !== activeMonitorId) {
    maintenanceBoundMonitorId = activeMonitorId;
    resetMaintenanceForm(true);
  }
  renderMaintenances(maintenances);
}

function setMaintenanceFormDisabled(disabled) {
  const state = !!disabled;
  for (const el of [maintenanceTitleInput, maintenanceStartInput, maintenanceEndInput, maintenanceNoteInput].filter(Boolean)) {
    el.disabled = state;
  }
  if (maintenanceCreateButton) {
    maintenanceCreateButton.disabled = state;
  }
}

async function createMaintenance() {
  if (!activeMonitorId) return;
  if (!maintenanceForm) return;

  hideMaintenanceVerifyLink();
  const startsAtMs = parseDateTimeLocalInput(maintenanceStartInput?.value);
  const endsAtMs = parseDateTimeLocalInput(maintenanceEndInput?.value);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    setMaintenanceMessage(t("app.maintenance.msg_set_start_end", null, "Bitte Start und Ende setzen."), "error");
    return;
  }
  if (endsAtMs <= startsAtMs) {
    setMaintenanceMessage(
      t("app.maintenance.msg_end_after_start", null, "Ende muss nach dem Start liegen."),
      "error"
    );
    return;
  }

  const title = String(maintenanceTitleInput?.value || "").trim();
  const message = String(maintenanceNoteInput?.value || "").trim();

  setMaintenanceMessage(t("app.maintenance.msg_scheduling", null, "Wartung wird geplant ..."));
  setMaintenanceFormDisabled(true);

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/maintenances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, startsAt: startsAtMs, endsAt: endsAtMs }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const errorCode = String(payload?.error || "").toLowerCase();
         if (response.status === 403 && errorCode === "domain not verified") {
           const hostname = String(payload?.hostname || "").trim();
           const host = hostname ? ` (${hostname})` : "";
           setMaintenanceMessage(
             t(
               "app.maintenance.msg_domain_not_verified",
               { host },
               `Domain${host} ist nicht verifiziert. Bitte verifizieren, um Wartungen planen zu können.`
             ),
             "error"
           );
           showMaintenanceVerifyLink(hostname);
         } else if (response.status === 403 && errorCode === "forbidden") {
           setMaintenanceMessage(
             t(
               "app.maintenance.msg_request_blocked",
               null,
               "Request wurde blockiert (Origin/Referer). Bitte die Seite direkt über pingmyserver.de aufrufen und Proxy/CSP prüfen."
             ),
             "error"
           );
         } else if (response.status === 400 && errorCode === "invalid target") {
          setMaintenanceMessage(
            t(
              "app.maintenance.msg_invalid_target",
              null,
              "Monitor-Ziel ist ungültig (z.B. IP/localhost) und kann nicht per Domain-Verifizierung freigeschaltet werden."
            ),
            "error"
          );
        } else if (response.status === 400 && errorCode === "starts in past") {
          setMaintenanceMessage(
            t(
              "app.maintenance.msg_starts_past",
              null,
              "Startzeit liegt in der Vergangenheit. Bitte eine zukünftige Zeit wählen (oder bei laufender Wartung: Ende in die Zukunft setzen)."
            ),
            "error"
          );
       } else if (response.status === 400 && errorCode === "starts too far") {
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_starts_too_far",
             null,
             "Startzeit liegt zu weit in der Zukunft. Bitte einen näheren Zeitpunkt wählen."
           ),
           "error"
         );
       } else if (response.status === 400 && errorCode === "duration too short") {
         setMaintenanceMessage(
           t("app.maintenance.msg_duration_too_short", null, "Wartung ist zu kurz. Mindestdauer sind 5 Minuten."),
           "error"
         );
       } else if (response.status === 400 && errorCode === "duration too long") {
         setMaintenanceMessage(
           t("app.maintenance.msg_duration_too_long", null, "Wartung ist zu lang. Maximal sind 30 Tage erlaubt."),
           "error"
         );
       } else if (response.status === 400 && (errorCode === "ends before start" || errorCode === "invalid input")) {
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_invalid_input",
             null,
             "Bitte Eingaben prüfen: Ende muss nach dem Start liegen."
           ),
           "error"
         );
       } else if (response.status === 400 && (errorCode === "invalid start" || errorCode === "invalid startsat")) {
         setMaintenanceMessage(
           t("app.maintenance.msg_invalid_start", null, "Start ist ungültig. Bitte Datum/Uhrzeit neu setzen."),
           "error"
         );
       } else if (response.status === 400 && (errorCode === "invalid end" || errorCode === "invalid endsat")) {
         setMaintenanceMessage(
           t("app.maintenance.msg_invalid_end", null, "Ende ist ungültig. Bitte Datum/Uhrzeit neu setzen."),
           "error"
         );
       } else if (response.status === 403 && !payload) {
         const hostname = getActiveMonitorHostnameHint();
         const host = hostname ? ` (${hostname})` : "";
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_domain_not_verified",
             { host },
             `Domain${host} ist nicht verifiziert. Bitte verifizieren, um Wartungen planen zu können.`
           ),
           "error"
         );
         showMaintenanceVerifyLink(hostname);
       } else if (response.status === 404 && !payload) {
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_endpoint_not_found",
             null,
             "Endpoint nicht gefunden (HTTP 404). Das Feature ist auf dem Server vermutlich noch nicht deployed oder der Node-Prozess läuft noch mit altem Code."
           ),
           "error"
         );
       } else if (!payload) {
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_failed_http",
             { status: response.status },
             `Wartung konnte nicht geplant werden. (HTTP ${response.status})`
           ),
           "error"
         );
       } else {
         setMaintenanceMessage(
           t(
             "app.maintenance.msg_failed_detail",
             { detail: payload?.error || `HTTP ${response.status}` },
             `Wartung konnte nicht geplant werden. (${payload?.error || `HTTP ${response.status}`})`
           ),
           "error"
         );
       }
       return;
     }

    setMaintenanceMessage(t("app.maintenance.msg_scheduled", null, "Wartung geplant."), "success");
    if (maintenanceTitleInput) maintenanceTitleInput.value = "";
    if (maintenanceNoteInput) maintenanceNoteInput.value = "";
    await loadMetrics();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "").trim();
    setMaintenanceMessage(
      t(
        "app.maintenance.msg_failed_network",
        { detail },
        `Wartung konnte nicht geplant werden.${detail ? ` (Netzwerkfehler: ${detail})` : ""}`
      ),
      "error"
    );
    console.error("maintenance_create_request_failed", error);
  } finally {
    setMaintenanceFormDisabled(false);
  }
}

async function cancelMaintenance(id) {
  if (!activeMonitorId) return;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  hideMaintenanceVerifyLink();
  setMaintenanceMessage(t("app.maintenance.msg_cancelling", null, "Wartung wird abgebrochen ..."));

  try {
    const response = await fetch(
      `/api/monitors/${encodeURIComponent(activeMonitorId)}/maintenances/${encodeURIComponent(String(numericId))}/cancel`,
      { method: "POST" }
    );

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setMaintenanceMessage(t("app.maintenance.msg_cancel_failed", null, "Wartung konnte nicht abgebrochen werden."), "error");
      return;
    }

    setMaintenanceMessage(t("app.maintenance.msg_cancelled", null, "Wartung abgebrochen."), "success");
    await loadMetrics();
  } catch (error) {
    setMaintenanceMessage(t("app.maintenance.msg_cancel_failed", null, "Wartung konnte nicht abgebrochen werden."), "error");
  }
}

const INTERVAL_OPTIONS_MS = [30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
let intervalPickerValue = null;
let intervalPickerSuppressChange = false;

function renderIntervalPicker(selectedMs) {
  if (!intervalSelect) return;

  const selected = Number.isFinite(Number(selectedMs)) ? Math.round(Number(selectedMs)) : null;
  intervalSelect.innerHTML = "";

  const base = INTERVAL_OPTIONS_MS.slice();
  const needsCustom = selected !== null && !base.includes(selected);
  const options = needsCustom ? [selected, ...base] : base;

  options.forEach((ms, index) => {
    const option = document.createElement("option");
    option.value = String(ms);
    const label = formatInterval(ms);
    option.textContent =
      needsCustom && index === 0 ? t("app.interval.custom", { value: label }, `Custom (${label})`) : label;
    intervalSelect.appendChild(option);
  });

  const fallback = base.includes(60000) ? 60000 : base[0];
  intervalPickerSuppressChange = true;
  intervalSelect.value = String(selected !== null ? selected : fallback);
  intervalPickerSuppressChange = false;
}

function syncIntervalPicker(intervalMs) {
  if (!intervalSelect) return;

  const numeric = Number(intervalMs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    if (intervalPickerValue !== null) {
      intervalPickerValue = null;
      renderIntervalPicker(null);
    }
    intervalSelect.disabled = true;
    return;
  }

  const next = Math.round(numeric);
  intervalSelect.disabled = false;
  if (intervalPickerValue === next && intervalSelect.value === String(next)) return;

  intervalPickerValue = next;
  renderIntervalPicker(next);
}

async function updateMonitorInterval(nextIntervalMs) {
  if (!intervalSelect) return;
  if (!activeMonitorId) return;

  const desired = Math.round(Number(nextIntervalMs));
  if (!Number.isFinite(desired) || desired <= 0) return;

  intervalSelect.disabled = true;

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/interval`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervalMs: desired }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      syncIntervalPicker(latestMetrics?.intervalMs);
      return;
    }

    const stored = Number(payload?.data?.intervalMs);
    const intervalMs = Number.isFinite(stored) && stored > 0 ? stored : desired;
    if (latestMetrics) {
      latestMetrics.intervalMs = intervalMs;
      updateStatus(latestMetrics);
    }
    syncIntervalPicker(intervalMs);
  } catch (error) {
    syncIntervalPicker(latestMetrics?.intervalMs);
  } finally {
    if (intervalSelect && activeMonitorId) {
      intervalSelect.disabled = false;
    }
  }
}

function parseMonitorIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/app\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/);
  if (!match) return null;
  return match[1];
}

function readStoredMonitorId() {
  try {
    const value = String(window.localStorage.getItem(ACTIVE_MONITOR_STORAGE_KEY) || "").trim();
    return value || null;
  } catch (error) {
    return null;
  }
}

function readStoredLocation() {
  try {
    const value = String(window.localStorage.getItem(LOCATION_STORAGE_KEY) || "").trim();
    return value || "aggregate";
  } catch (error) {
    return "aggregate";
  }
}

function writeStoredLocation(location) {
  const value = String(location || "").trim() || "aggregate";
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, value);
  } catch (error) {
    // ignore
  }
}

  function writeStoredMonitorId(monitorId) {
    const value = String(monitorId || "").trim();
    if (!value) return;
    try {
      window.localStorage.setItem(ACTIVE_MONITOR_STORAGE_KEY, value);
    } catch (error) {
      // ignore
    }
    rememberRecentMonitorId(value);
  }

  function readRecentMonitorIds() {
    try {
      const raw = String(window.localStorage.getItem(RECENT_MONITOR_STORAGE_KEY) || "").trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((value) => String(value || "").trim())
        .filter((value) => Boolean(value));
    } catch (error) {
      return [];
    }
  }

  function rememberRecentMonitorId(monitorId) {
    const value = String(monitorId || "").trim();
    if (!value) return;
    try {
      const existing = readRecentMonitorIds().filter((id) => id !== value);
      existing.unshift(value);
      existing.splice(MAX_RECENT_MONITORS);
      window.localStorage.setItem(RECENT_MONITOR_STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      // ignore
    }
  }

  function monitorPath(monitorId) {
    return `/app/monitors/${encodeURIComponent(String(monitorId))}`;
  }

function findMonitor(monitorId) {
  const target = String(monitorId || "");
  return monitors.find((monitor) => String(monitor.id) === target) || null;
}

function getMonitorDisplayName(monitor) {
  if (!monitor) return t("common.monitor", null, "Monitor");
  return monitor.name || monitor.url || `Monitor ${monitor.id}`;
}

function getMonitorTargetUrl(monitor) {
  if (!monitor) return "";
  return String(monitor.url || "").trim();
}

function getMonitorGroupKey(monitor) {
  const rawUrl = String(monitor?.url || "").trim();
  if (!rawUrl) return t("common.unknown", null, "unknown");
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch (error) {
    return rawUrl.toLowerCase().slice(0, 255) || t("common.unknown", null, "unknown");
  }
}

function readCollapsedMonitorGroups() {
  try {
    const raw = String(window.localStorage.getItem(MONITOR_GROUP_COLLAPSED_STORAGE_KEY) || "").trim();
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Set();
    return new Set(Object.keys(parsed).filter((key) => parsed[key]));
  } catch (error) {
    return new Set();
  }
}

function writeCollapsedMonitorGroups(keys) {
  try {
    const obj = Object.create(null);
    for (const key of keys || []) {
      const normalized = String(key || "").trim();
      if (!normalized) continue;
      obj[normalized] = true;
    }
    window.localStorage.setItem(MONITOR_GROUP_COLLAPSED_STORAGE_KEY, JSON.stringify(obj));
  } catch (error) {
    // ignore
  }
}

function buildMonitorGroups(list) {
  const items = Array.isArray(list) ? list : [];
  const map = new Map();

  for (const monitor of items) {
    const key = getMonitorGroupKey(monitor);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        title: key,
        monitors: [],
        sortKey: 0,
      };
      map.set(key, group);
    }
    group.monitors.push(monitor);
    const createdAt = Number(monitor?.created_at || 0);
    if (Number.isFinite(createdAt) && createdAt > group.sortKey) {
      group.sortKey = createdAt;
    }
  }

  const groups = Array.from(map.values());
  for (const group of groups) {
    group.monitors.sort((a, b) => {
      const aName = getMonitorDisplayName(a);
      const bName = getMonitorDisplayName(b);
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });
  }

  groups.sort((a, b) => {
    const diff = Number(b.sortKey || 0) - Number(a.sortKey || 0);
    if (diff) return diff;
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  });

  return groups;
}

function setMonitorIcon(monitorId, targetUrl = "") {
  if (!monitorIconEl) return;

  const normalizedId = String(monitorId || "").trim();
  if (!normalizedId) {
    monitorIconKey = "";
    monitorIconEl.src = DEFAULT_MONITOR_ICON;
    return;
  }

  const nextKey = `${normalizedId}|${String(targetUrl || "").trim()}`;
  if (nextKey === monitorIconKey) return;

  monitorIconKey = nextKey;
  monitorIconEl.dataset.fallback = "0";
  monitorIconEl.src = `/api/monitors/${encodeURIComponent(normalizedId)}/favicon`;
}

function setCurrentUserLabel() {
  if (currentUserEmail && user?.email) {
    currentUserEmail.textContent = user.email;
  }
}

function syncOwnerLinks() {
  const isOwner = user?.isOwner === true;
  for (const link of ownerLinks) {
    link.hidden = !isOwner;
    link.setAttribute("aria-hidden", isOwner ? "false" : "true");
    if (isOwner) {
      link.style.removeProperty("display");
    } else {
      link.style.setProperty("display", "none", "important");
    }
  }
}

function syncCardHeights() {
  if (!responseCard || !incidentsCard) return;
  if (window.innerWidth <= 980) {
    incidentsCard.style.height = "";
    return;
  }

  incidentsCard.style.height = "auto";
  const targetHeight = Math.round(responseCard.getBoundingClientRect().height);
  if (targetHeight > 0) {
    incidentsCard.style.height = `${targetHeight}px`;
  }
}

async function ensureAuthenticated() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!response.ok) return false;

    const payload = await response.json();
    if (!payload?.ok || !payload.user) {
      window.location.href = "/login";
      return false;
    }

    user = payload.user;
    syncOwnerLinks();
    setCurrentUserLabel();
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchProbes() {
  try {
    const response = await fetch("/api/probes", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return [];
    }
    if (!response.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } catch (error) {
    return [];
  }
}

function renderLocationPicker() {
  if (!locationSelect) return;

  locationSelect.innerHTML = "";

  const aggregateOption = document.createElement("option");
  aggregateOption.value = "aggregate";
  aggregateOption.textContent = "Gesamt";
  locationSelect.appendChild(aggregateOption);

  for (const probe of availableProbes) {
    const id = String(probe?.id || "").trim();
    if (!id) continue;
    const label = String(probe?.label || "").trim();
    const option = document.createElement("option");
    option.value = `probe:${id}`;
    option.textContent = label || id;
    locationSelect.appendChild(option);
  }

  const desired = String(activeLocation || "").trim() || "aggregate";
  const values = new Set(Array.from(locationSelect.options || []).map((opt) => String(opt.value || "")));
  activeLocation = values.has(desired) ? desired : "aggregate";
  locationSelect.value = activeLocation;
}

async function fetchMonitors() {
  const location = String(activeLocation || "").trim();
  const url =
    location && location !== "aggregate"
      ? `/api/monitors?location=${encodeURIComponent(location)}`
      : "/api/monitors";

  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login";
    return [];
  }
  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const list = Array.isArray(payload?.data) ? payload.data : [];

  return list.map((monitor) => ({
    ...monitor,
    id: String(monitor.id),
  }));
}

function renderMonitorPicker() {
  if (!monitorSelect) return;

  monitorSelect.innerHTML = "";
  const groups = buildMonitorGroups(monitors);
  for (const group of groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = String(group.title || "").trim() || t("common.unknown", null, "unknown");

    for (const monitor of group.monitors || []) {
      const option = document.createElement("option");
      option.value = String(monitor.id);
      option.textContent = getMonitorDisplayName(monitor);
      optgroup.appendChild(option);
    }

    monitorSelect.appendChild(optgroup);
  }

  if (activeMonitorId !== null) {
    monitorSelect.value = String(activeMonitorId);
  }
}

function monitorStatusLabel(status) {
  return status === "offline"
    ? t("app.state.offline", null, "Offline")
    : t("app.state.online", null, "Online");
}

function renderMonitorList() {
  if (!monitorList) return;

  monitorList.innerHTML = "";

  function createMonitorNavRow(monitor) {
    const row = document.createElement("div");
    row.className = "monitor-nav-row";

    const item = document.createElement("button");
    item.type = "button";
    item.className = "monitor-nav-item";
    if (monitor.id === activeMonitorId) {
      item.classList.add("active");
    }

    const head = document.createElement("span");
    head.className = "monitor-nav-item-head";

    const icon = document.createElement("img");
    icon.className = "monitor-nav-item-icon";
    icon.alt = "";
    icon.decoding = "async";
    icon.loading = "lazy";
    icon.dataset.fallback = "0";
    icon.src = `/api/monitors/${encodeURIComponent(String(monitor.id))}/favicon`;
    icon.addEventListener("error", () => {
      if (icon.dataset.fallback === "1") return;
      icon.dataset.fallback = "1";
      icon.src = DEFAULT_MONITOR_ICON;
    });

    const title = document.createElement("span");
    title.className = "monitor-nav-item-title";
    title.textContent = getMonitorDisplayName(monitor);

    head.appendChild(icon);
    head.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "monitor-nav-item-meta";
    const lastCheckLabel = monitor.last_checked_at
      ? formatTimeAgo(Date.now() - monitor.last_checked_at)
      : t("app.monitor.no_check", null, "noch kein Check");
    meta.textContent = `${monitorStatusLabel(monitor.last_status)} \u00b7 ${lastCheckLabel}`;

    item.appendChild(head);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      setActiveMonitor(monitor.id, { pushHistory: true }).catch(() => {
        // ignore
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "monitor-nav-delete";
    deleteButton.textContent = t("common.delete", null, "Delete");
    deleteButton.title = t("app.monitor.delete_title", null, "Loescht den Monitor inklusive aller Daten");
    deleteButton.setAttribute(
      "aria-label",
      t(
        "app.monitor.delete_aria",
        { name: getMonitorDisplayName(monitor) },
        `Monitor ${getMonitorDisplayName(monitor)} loeschen`
      )
    );
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMonitor(monitor).catch(() => {
        // ignore
      });
    });

    row.appendChild(item);
    row.appendChild(deleteButton);
    return row;
  }

  const candidates = [];
  if (activeMonitorId) {
    candidates.push(String(activeMonitorId));
  }
  for (const id of readRecentMonitorIds()) {
    candidates.push(id);
  }

  const recentMonitors = [];
  const seen = new Set();
  for (const id of candidates) {
    const monitor = findMonitor(id);
    if (!monitor) continue;
    const key = String(monitor.id);
    if (seen.has(key)) continue;
    seen.add(key);
    recentMonitors.push(monitor);
    if (recentMonitors.length >= MAX_RECENT_MONITORS) break;
  }

  if (!recentMonitors.length) {
    const fallback = Array.isArray(monitors) ? [...monitors] : [];
    fallback.sort((a, b) => {
      const aLast = Number(a?.last_checked_at || 0);
      const bLast = Number(b?.last_checked_at || 0);
      const diff = bLast - aLast;
      if (diff) return diff;
      return getMonitorDisplayName(a).localeCompare(getMonitorDisplayName(b), undefined, { sensitivity: "base" });
    });
    for (const monitor of fallback) {
      if (recentMonitors.length >= MAX_RECENT_MONITORS) break;
      recentMonitors.push(monitor);
    }
  }

  for (const monitor of recentMonitors) {
    monitorList.appendChild(createMonitorNavRow(monitor));
  }
}

function renderMonitorControls() {
  renderMonitorPicker();
  renderMonitorList();
  syncPublicStatusLinks();
}

async function deleteMonitor(monitor) {
  const monitorId = String(monitor?.id || "").trim();
  if (!monitorId) return;

  const monitorName = getMonitorDisplayName(monitor);
  const confirmed = window.confirm(
    t(
      "app.monitor.delete_confirm",
      { name: monitorName },
      `Monitor "${monitorName}" wirklich l\u00f6schen?\n\nDabei werden alle Daten dieses Monitors dauerhaft entfernt:\n- Checks\n- Uptime-Historie\n- Vorf\u00e4lle\n- Tagesstatistiken\n\nDieser Vorgang kann nicht r\u00fcckg\u00e4ngig gemacht werden.`
    )
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/monitors/${encodeURIComponent(monitorId)}`, {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok && response.status !== 404) {
      window.alert(
        t(
          "app.monitor.delete_failed",
          null,
          "Monitor konnte nicht gel\u00f6scht werden. Bitte sp\u00e4ter erneut versuchen."
        )
      );
      return;
    }

    await refreshMonitors();
    if (!monitors.length) return;
    await loadMetrics();
  } catch (error) {
    window.alert(
      t(
        "app.monitor.delete_failed",
        null,
        "Monitor konnte nicht gel\u00f6scht werden. Bitte sp\u00e4ter erneut versuchen."
      )
    );
  }
}

function getPublicStatusPath() {
  if (!activeMonitorId) return "/status";
  return `/status/${encodeURIComponent(String(activeMonitorId))}`;
}

function syncPublicStatusLinks() {
  const statusPath = getPublicStatusPath();
  publicStatusLinks.forEach((link) => {
    link.setAttribute("href", statusPath);
  });
}

function updateMonitorCacheFromMetrics(data) {
  const monitor = findMonitor(activeMonitorId);
  if (!monitor || !data) return;

  monitor.name = data.name || monitor.name;
  monitor.url = data.target || monitor.url;
  monitor.last_status = data.status || monitor.last_status;
  monitor.last_checked_at = Number.isFinite(data.lastCheckAt) ? data.lastCheckAt : monitor.last_checked_at;
}

function navigateToMonitor(monitorId, replace = false) {
  const nextPath = monitorPath(monitorId);
  if (window.location.pathname === nextPath) return;
  if (replace) {
    window.history.replaceState({}, "", nextPath);
  } else {
    window.history.pushState({}, "", nextPath);
  }
}

async function setActiveMonitor(monitorId, options = {}) {
  const { pushHistory = false, replaceHistory = false } = options;
  const monitor = findMonitor(monitorId);
  if (!monitor) return;

  activeMonitorId = String(monitor.id);
  assertionsDirty = false;
  assertionsBoundMonitorId = null;
  setAssertionsMessage("");
  sloDirty = false;
  sloEnabled = false;
  setSloMessage("");
  applySloEnabledState(false);
  intervalPickerValue = null;
  if (intervalSelect) {
    intervalSelect.disabled = true;
  }
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(monitor));
  writeStoredMonitorId(activeMonitorId);
  renderMonitorControls();

  if (pushHistory) {
    navigateToMonitor(activeMonitorId, replaceHistory);
  }

  await loadMetrics();
}

async function refreshMonitors() {
  const previousActiveId = activeMonitorId;
  monitors = await fetchMonitors();

  if (!monitors.length) {
    window.location.href = "/onboarding";
    return;
  }

  const stillExists = findMonitor(previousActiveId);
  if (!stillExists) {
    const storedMonitorId = readStoredMonitorId();
    const preferred = storedMonitorId ? findMonitor(storedMonitorId) : null;
    activeMonitorId = preferred ? preferred.id : monitors[0].id;
    writeStoredMonitorId(activeMonitorId);
    navigateToMonitor(activeMonitorId, true);
  }

  const activeMonitor = findMonitor(activeMonitorId);
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(activeMonitor));
  renderMonitorControls();
}

async function bootstrapMonitor() {
  monitors = await fetchMonitors();

  if (!monitors.length) {
    window.location.href = "/onboarding";
    return false;
  }

  const requestedMonitorId = parseMonitorIdFromPath();
  const storedMonitorId = readStoredMonitorId();
  if (requestedMonitorId && findMonitor(requestedMonitorId)) {
    activeMonitorId = requestedMonitorId;
  } else if (storedMonitorId && findMonitor(storedMonitorId)) {
    activeMonitorId = storedMonitorId;
    navigateToMonitor(activeMonitorId, true);
  } else {
    activeMonitorId = monitors[0].id;
    navigateToMonitor(activeMonitorId, true);
  }

  writeStoredMonitorId(activeMonitorId);
  const activeMonitor = findMonitor(activeMonitorId);
  setMonitorIcon(activeMonitorId, getMonitorTargetUrl(activeMonitor));
  renderMonitorControls();
  return true;
}

async function loadMetrics() {
  if (!activeMonitorId) return;

  try {
    const location = String(activeLocation || "").trim();
    const metricsUrl =
      location && location !== "aggregate"
        ? `/api/monitors/${encodeURIComponent(activeMonitorId)}/metrics?location=${encodeURIComponent(location)}`
        : `/api/monitors/${encodeURIComponent(activeMonitorId)}/metrics`;

    const response = await fetch(metricsUrl, {
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 404) {
      await refreshMonitors();
      return;
    }

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload?.ok || !payload.data) {
      return;
    }

    const data = payload.data;
    latestMetrics = data;

    if (data.statusSince) statusSince = data.statusSince;
    if (data.lastCheckAt) lastCheckTime = data.lastCheckAt;

    updateMonitorCacheFromMetrics(data);
    renderMonitorControls();

    updateMonitorInfo(data);
    updateStatus(data);
    updateStats(data.stats, data.series || []);
    updateUptimeBars(data.last24h);
    renderChart(chart, data.series || []);
    renderHeatmap(data.heatmap);
    updateRangeSummaries(data.ranges);
    updateSloCard(data.slo);
    updateMap(data.location, data.network);
    updateDomainSslCard(data.domainSsl);
    updateIncidents(data.incidents);
    syncIntervalPicker(data.intervalMs);
    syncSloPanel(data.slo);
    syncAssertionsPanel(data.assertions);
    syncMaintenancePanel(data.maintenances);
  } catch (error) {
    // ignore
  }
}

function updateMonitorInfo(data) {
  if (!data) return;
  if (monitorNameEl && data.name) {
    monitorNameEl.textContent = data.name;
  }
  if (monitorTargetEl && data.target) {
    monitorTargetEl.textContent = t(
      "app.monitor.target_https",
      { target: data.target },
      `HTTPS monitor for ${data.target}`
    );
  }
  if (activeMonitorId) {
    setMonitorIcon(activeMonitorId, data.target || "");
  }
}

function updateStatus(data) {
  if (!data) return;
  if (statusState) {
    const online = data.status === "online";
    statusState.textContent = online
      ? t("app.state.online", null, "Online")
      : t("app.state.offline", null, "Offline");
    statusState.classList.toggle("offline", !online);
  }
  if (statusDuration) {
    const online = data.status === "online";
    const since = data.statusSince || statusSince;
    const duration = formatDuration(Date.now() - since);
    statusDuration.textContent = online
      ? t("app.dashboard.online_for", { duration }, `Online for ${duration}`)
      : t("app.dashboard.offline_for", { duration }, `Offline for ${duration}`);
  }
  if (lastCheck) {
    const stamp = data.lastCheckAt || lastCheckTime;
    lastCheck.textContent = stamp
      ? formatTimeAgo(Date.now() - stamp)
      : t("app.dashboard.waiting_first_check", null, "Waiting for first check");
  }
  if (checkInterval) {
    checkInterval.textContent = data.intervalMs
      ? t(
          "app.dashboard.check_interval",
          { interval: formatInterval(data.intervalMs) },
          `Check interval: ${formatInterval(data.intervalMs)}`
        )
      : "";
  }
}

function getNumericLatencyValues(series) {
  return (Array.isArray(series) ? series : [])
    .map((point) => Number(point?.ms))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function percentile(values, p) {
  const sorted = Array.isArray(values) ? [...values].sort((a, b) => a - b) : [];
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];

  const rank = (Math.max(0, Math.min(100, Number(p))) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function updateStats(stats, series = []) {
  const values = getNumericLatencyValues(series);
  const avgFallback = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const p50Fallback = percentile(values, 50);
  const p95Fallback = percentile(values, 95);

  const avg = Number.isFinite(Number(stats?.avg)) ? Number(stats.avg) : avgFallback;
  const p50 = Number.isFinite(Number(stats?.p50)) ? Number(stats.p50) : p50Fallback;
  const p95 = Number.isFinite(Number(stats?.p95)) ? Number(stats.p95) : p95Fallback;

  if (statAvg) statAvg.textContent = formatMs(avg);
  if (statP50) statP50.textContent = formatMs(p50);
  if (statP95) statP95.textContent = formatMs(p95);
}

function updateUptimeBars(last24h) {
  if (!barsContainer || !last24h?.bars) return;
  barsContainer.innerHTML = "";
  last24h.bars.forEach((bar) => {
    const el = document.createElement("span");
    if (bar.status) {
      el.classList.add(bar.status);
    }
    if (Number.isFinite(bar.uptime)) {
      el.title = t(
        "app.dashboard.uptime_title",
        { uptime: bar.uptime.toFixed(2) },
        `Uptime: ${bar.uptime.toFixed(2)}%`
      );
    }
    barsContainer.appendChild(el);
  });

  if (uptimeIncidents) {
    const incidents = Number.isFinite(last24h.incidents) ? last24h.incidents : 0;
    const downMinutes = Number.isFinite(last24h.downMinutes) ? last24h.downMinutes : 0;
    uptimeIncidents.textContent = t(
      incidents === 1 ? "app.dashboard.summary.one" : "app.dashboard.summary.many",
      { incidents, minutes: downMinutes },
      `${incidents} incidents, ${downMinutes} min downtime`
    );
  }
  if (uptimePercent) {
    uptimePercent.textContent = Number.isFinite(last24h.uptime)
      ? `${last24h.uptime.toFixed(2)}%`
      : "--%";
  }
}

function updateRangeSummaries(ranges) {
  if (!ranges) return;
  updateRangeCell(ranges.range7, range7Uptime, range7Meta);
  updateRangeCell(ranges.range30, range30Uptime, range30Meta);
  updateRangeCell(ranges.range365, range365Uptime, range365Meta);

  if (rangePickerLabel && ranges.range30?.days) {
    rangePickerLabel.textContent = t(
      "app.dashboard.range_last_days",
      { days: ranges.range30.days },
      `Last ${ranges.range30.days} days`
    );
  }
}

function formatPercent(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--.--%";
  return `${numeric.toFixed(digits)}%`;
}

function formatDowntimeCompact(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric < 0) return "--";

  const totalMinutes = Math.round(numeric / 60000);
  if (totalMinutes < 60) return `${totalMinutes} ${shortUnit("minute")}`;

  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} ${shortUnit("hour")}`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0) return `${days} ${shortUnit("day")}`;
  return `${days} ${shortUnit("day")} ${hours} ${shortUnit("hour")}`;
}

function updateSloBurnPill(element, burnSummary) {
  if (!element) return;

  element.classList.remove("is-healthy", "is-warn", "is-high", "is-critical");

  const state = String(burnSummary?.state || "unknown").toLowerCase();
  if (state === "healthy" || state === "warn" || state === "high" || state === "critical") {
    element.classList.add(`is-${state}`);
  }

  const burnRate = Number(burnSummary?.burnRate);
  if (!Number.isFinite(burnRate)) {
    element.textContent = t("app.slo.no_data_short", null, "--");
    element.title = t("common.no_data", null, "No data");
    return;
  }

  const stateLabel = t(`app.slo.state.${state}`, null, state || "unknown");
  element.textContent = `${burnRate.toFixed(2)}x`;
  element.title = t(
    "app.slo.burn_title",
    { rate: burnRate.toFixed(2), state: stateLabel },
    `Burn rate: ${burnRate.toFixed(2)}x (${stateLabel})`
  );
}

function updateSloCard(slo) {
  if (!slo) {
    if (sloCardEl) sloCardEl.classList.remove("is-disabled");
    if (sloCardEl) sloCardEl.hidden = false;
    setSloStateBadge(sloCardStateBadge, false);
    if (sloCardNote) sloCardNote.textContent = t("common.no_data", null, "No data");
    if (sloTargetDisplay) sloTargetDisplay.textContent = "--.--%";
    if (sloWindowUptime) sloWindowUptime.textContent = "--.--%";
    if (sloWindowMeta) sloWindowMeta.textContent = t("common.no_data", null, "No data");
    if (sloBudgetRemaining) sloBudgetRemaining.textContent = "--.--%";
    if (sloBudgetRemainingTime) sloBudgetRemainingTime.textContent = t("common.no_data", null, "No data");
    if (sloBudgetConsumed) sloBudgetConsumed.textContent = "--.--%";
    if (sloBudgetConsumedTime) sloBudgetConsumedTime.textContent = t("common.no_data", null, "No data");
    updateSloBurnPill(sloBurn1h, null);
    updateSloBurnPill(sloBurn6h, null);
    updateSloBurnPill(sloBurn24h, null);
    return;
  }

  const summary = slo.summary && typeof slo.summary === "object" ? slo.summary : {};
  const enabled = Object.prototype.hasOwnProperty.call(slo, "enabled") ? !!slo.enabled : true;
  const objectiveDays = Number.isFinite(Number(slo.objectiveDays)) ? Number(slo.objectiveDays) : 30;
  const checks = Number.isFinite(Number(summary.checks)) ? Number(summary.checks) : 0;
  const incidents = Number.isFinite(Number(summary.incidents)) ? Number(summary.incidents) : 0;

  if (sloCardEl) sloCardEl.classList.toggle("is-disabled", !enabled);
  if (sloCardEl) sloCardEl.hidden = !enabled;
  setSloStateBadge(sloCardStateBadge, enabled);

  if (sloTargetDisplay) {
    sloTargetDisplay.textContent = formatPercent(slo.targetPercent, 3);
  }

  if (sloCardNote) {
    sloCardNote.textContent = enabled
      ? t(
          "app.slo.card_enabled_note",
          { days: objectiveDays },
          `SLO-Auswertung basiert auf den letzten ${objectiveDays} Tagen.`
        )
      : t("app.slo.card_disabled_note", null, "SLO ist deaktiviert. Aktiviere es unter „Mehr Einstellungen“.");
  }

  if (!enabled) {
    if (sloWindowUptime) sloWindowUptime.textContent = "--.--%";
    if (sloWindowMeta) sloWindowMeta.textContent = t("app.slo.disabled_hint", null, "SLO ist derzeit deaktiviert.");
    if (sloBudgetRemaining) sloBudgetRemaining.textContent = "--.--%";
    if (sloBudgetRemainingTime) sloBudgetRemainingTime.textContent = t("app.slo.disabled_hint", null, "SLO ist derzeit deaktiviert.");
    if (sloBudgetConsumed) sloBudgetConsumed.textContent = "--.--%";
    if (sloBudgetConsumedTime) sloBudgetConsumedTime.textContent = t("app.slo.disabled_hint", null, "SLO ist derzeit deaktiviert.");
    updateSloBurnPill(sloBurn1h, null);
    updateSloBurnPill(sloBurn6h, null);
    updateSloBurnPill(sloBurn24h, null);
    return;
  }

  if (sloWindowUptime) {
    sloWindowUptime.textContent = formatPercent(summary.uptimePercent, 2);
  }

  if (sloWindowMeta) {
    if (Number.isFinite(Number(summary.uptimePercent))) {
      sloWindowMeta.textContent = t(
        "app.slo.window_meta",
        { days: objectiveDays, incidents, checks },
        `Window ${objectiveDays} days: ${incidents} incidents, ${checks} checks`
      );
    } else {
      sloWindowMeta.textContent = t("common.no_data", null, "No data");
    }
  }

  if (sloBudgetRemaining) {
    sloBudgetRemaining.textContent = formatPercent(summary.remainingBudgetPercent, 2);
  }

  if (sloBudgetRemainingTime) {
    sloBudgetRemainingTime.textContent = Number.isFinite(Number(summary.remainingDowntimeMs))
      ? t(
          "app.slo.budget_remaining_time",
          { time: formatDowntimeCompact(summary.remainingDowntimeMs) },
          `${formatDowntimeCompact(summary.remainingDowntimeMs)} remaining`
        )
      : t("common.no_data", null, "No data");
  }

  if (sloBudgetConsumed) {
    sloBudgetConsumed.textContent = formatPercent(summary.consumedBudgetPercent, 2);
  }

  if (sloBudgetConsumedTime) {
    sloBudgetConsumedTime.textContent = Number.isFinite(Number(summary.consumedDowntimeMs))
      ? t(
          "app.slo.budget_consumed_time",
          { time: formatDowntimeCompact(summary.consumedDowntimeMs) },
          `${formatDowntimeCompact(summary.consumedDowntimeMs)} consumed`
        )
      : t("common.no_data", null, "No data");
  }

  updateSloBurnPill(sloBurn1h, slo?.burnRate?.oneHour);
  updateSloBurnPill(sloBurn6h, slo?.burnRate?.sixHours);
  updateSloBurnPill(sloBurn24h, slo?.burnRate?.oneDay);
}

function updateRangeCell(summary, uptimeEl, metaEl) {
  if (!uptimeEl || !metaEl) return;
  if (!summary || !Number.isFinite(summary.uptime)) {
    uptimeEl.textContent = "--.--%";
    metaEl.textContent = t("common.no_data", null, "No data");
    return;
  }
  uptimeEl.textContent = `${summary.uptime.toFixed(2)}%`;
  const incidents = Number.isFinite(summary.incidents) ? summary.incidents : 0;
  const downMinutes = Number.isFinite(summary.downMinutes) ? summary.downMinutes : 0;
  metaEl.textContent = t(
    incidents === 1 ? "app.dashboard.summary.one" : "app.dashboard.summary.many",
    { incidents, minutes: downMinutes },
    `${incidents} incidents, ${downMinutes} min downtime`
  );
}

function renderChart(svg, series) {
  if (!svg) return;

  if (typeof svg.__chartCleanup === "function") {
    svg.__chartCleanup();
    svg.__chartCleanup = null;
  }

  const normalizedSeries = (Array.isArray(series) ? series : [])
    .map((point) => {
      const rawStatusCode = point?.statusCode;
      const parsedStatusCode = Number(rawStatusCode);
      const statusCode =
        rawStatusCode === null ||
        rawStatusCode === undefined ||
        !Number.isFinite(parsedStatusCode) ||
        parsedStatusCode < 100 ||
        parsedStatusCode > 599
          ? null
          : Math.round(parsedStatusCode);

      return {
        ts: Number(point?.ts),
        ms: Number(point?.ms),
        ok: point?.ok !== false,
        statusCode,
        errorMessage: String(point?.errorMessage || "").trim() || null,
      };
    })
    .filter((point) => Number.isFinite(point.ms) && point.ms >= 0);

  if (!normalizedSeries.length) {
    svg.innerHTML = "";
    return;
  }

  const width = 960;
  const height = 240;
  const padding = 32;
  const plotLeft = padding;
  const plotRight = width - padding;
  const plotTop = padding;
  const plotBottom = height - padding;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const values = normalizedSeries.map((point) => point.ms);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const paddingVal = Math.max(20, (maxVal - minVal) * 0.2);
  const min = Math.max(0, minVal - paddingVal);
  const max = Math.max(min + 1, maxVal + paddingVal);

  const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
  const yForValue = (value) => plotBottom - ((value - min) / (max - min)) * plotHeight;
  const xForIndex = (index) =>
    normalizedSeries.length > 1
      ? plotLeft + (index / (normalizedSeries.length - 1)) * plotWidth
      : plotLeft + plotWidth / 2;

  const points = normalizedSeries.map((point, index) => {
    const x = xForIndex(index);
    const y = yForValue(point.ms);
    return { x, y, point, index };
  });
  const path = smoothPath(points.map((point) => [point.x, point.y]));

  const ticks = 5;
  const grid = [];
  for (let i = 0; i < ticks; i += 1) {
    const t = i / (ticks - 1);
    const value = max - (max - min) * t;
    const y = plotTop + plotHeight * t;
    grid.push(`<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="rgba(255,255,255,0.07)" />`);
    grid.push(`<text x="6" y="${y + 4}" fill="rgba(255,255,255,0.45)" font-size="11">${Math.round(value)} ms</text>`);
  }

  const thresholdGoodMs = 100;
  const thresholdWarnMs = 250;
  const yGood = clamp(yForValue(thresholdGoodMs), plotTop, plotBottom);
  const yWarn = clamp(yForValue(thresholdWarnMs), plotTop, plotBottom);
  const ySlowTop = Math.min(yWarn, yGood);
  const yModerateTop = Math.max(yWarn, plotTop);
  const yModerateBottom = Math.min(yGood, plotBottom);
  const yFastTop = Math.max(yGood, plotTop);

  const thresholdBands = [
    `<rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${Math.max(0, ySlowTop - plotTop)}" fill="rgba(255, 104, 104, 0.12)" />`,
    `<rect x="${plotLeft}" y="${yModerateTop}" width="${plotWidth}" height="${Math.max(0, yModerateBottom - yModerateTop)}" fill="rgba(255, 199, 95, 0.1)" />`,
    `<rect x="${plotLeft}" y="${yFastTop}" width="${plotWidth}" height="${Math.max(0, plotBottom - yFastTop)}" fill="rgba(122, 242, 166, 0.08)" />`,
  ];

  const thresholdGuides = [
    `<line x1="${plotLeft}" y1="${yGood}" x2="${plotRight}" y2="${yGood}" stroke="rgba(122,242,166,0.35)" stroke-dasharray="5 5" />`,
    `<line x1="${plotLeft}" y1="${yWarn}" x2="${plotRight}" y2="${yWarn}" stroke="rgba(255,199,95,0.35)" stroke-dasharray="5 5" />`,
  ];

  const gradientId = "lineGradientResponse";
  const clipId = "chartPlotClip";
  const lastPoint = points[points.length - 1] || null;
  const lastCx = lastPoint ? lastPoint.x : plotLeft;
  const lastCy = lastPoint ? lastPoint.y : plotBottom;

  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4cc9f0" />
        <stop offset="100%" stop-color="#b9f27c" />
      </linearGradient>
      <clipPath id="${clipId}">
        <rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" />
      </clipPath>
    </defs>
    <g clip-path="url(#${clipId})">
      ${thresholdBands.join("\n")}
    </g>
    ${grid.join("\n")}
    ${thresholdGuides.join("\n")}
    <path
      d="${path}"
      fill="none"
      stroke="url(#${gradientId})"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      clip-path="url(#${clipId})"
    />
    <line data-chart-hover-line x1="${lastCx}" y1="${plotTop}" x2="${lastCx}" y2="${plotBottom}" stroke="rgba(255,255,255,0.4)" stroke-width="1" opacity="0" />
    <circle data-chart-hover-dot cx="${lastCx}" cy="${lastCy}" r="4.5" fill="#b9f27c" opacity="0" />
    <circle cx="${lastCx}" cy="${lastCy}" r="4.5" fill="#b9f27c" />
  `;

  const chartWrapper = svg.closest(".chart");
  if (!chartWrapper) return;

  let tooltip = chartWrapper.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    chartWrapper.appendChild(tooltip);
  }

  const hoverLine = svg.querySelector("[data-chart-hover-line]");
  const hoverDot = svg.querySelector("[data-chart-hover-dot]");
  const hideHover = () => {
    if (hoverLine) hoverLine.setAttribute("opacity", "0");
    if (hoverDot) hoverDot.setAttribute("opacity", "0");
    tooltip.hidden = true;
  };

  const formatTs = (value) => {
    if (!Number.isFinite(value)) return t("common.not_available", null, "n/a");
    return new Intl.DateTimeFormat(i18nLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  };

  const handlePointerMove = (event) => {
    const svgRect = svg.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;

    const relativeX = ((event.clientX - svgRect.left) / svgRect.width) * width;
    const ratio = clamp((relativeX - plotLeft) / Math.max(1, plotWidth), 0, 1);
    const index = Math.round(ratio * (points.length - 1));
    const selectedPoint = points[index];
    if (!selectedPoint) return;

    const statusCode = Number.isFinite(selectedPoint.point.statusCode) ? Math.round(selectedPoint.point.statusCode) : null;
    const statusLabel =
      statusCode !== null
        ? String(statusCode)
        : selectedPoint.point.ok
          ? t("app.state.online", null, "Online")
          : t("app.errors.no_response_label", null, "no response");
    const errorLabel = selectedPoint.point.errorMessage || t("common.none", null, "none");

    tooltip.innerHTML = `
      <div class="chart-tooltip-title">${escapeHtml(formatTs(selectedPoint.point.ts))}</div>
      <div class="chart-tooltip-row"><span>${escapeHtml(t("app.response.tooltip_response", null, "Response"))}</span><strong>${escapeHtml(
        formatMs(selectedPoint.point.ms)
      )}</strong></div>
      <div class="chart-tooltip-row"><span>${escapeHtml(t("app.response.tooltip_status", null, "Status"))}</span><strong>${escapeHtml(
        statusLabel
      )}</strong></div>
      <div class="chart-tooltip-row"><span>${escapeHtml(t("app.response.tooltip_error", null, "Error"))}</span><strong>${escapeHtml(
        errorLabel
      )}</strong></div>
    `;

    tooltip.hidden = false;
    if (hoverLine) {
      hoverLine.setAttribute("x1", String(selectedPoint.x));
      hoverLine.setAttribute("x2", String(selectedPoint.x));
      hoverLine.setAttribute("opacity", "1");
    }
    if (hoverDot) {
      hoverDot.setAttribute("cx", String(selectedPoint.x));
      hoverDot.setAttribute("cy", String(selectedPoint.y));
      hoverDot.setAttribute("opacity", "1");
    }

    const wrapperRect = chartWrapper.getBoundingClientRect();
    const localX = event.clientX - wrapperRect.left;
    const localY = event.clientY - wrapperRect.top;
    const tooltipWidth = tooltip.offsetWidth || 180;
    const tooltipHeight = tooltip.offsetHeight || 96;

    let tooltipX = localX + 14;
    if (tooltipX + tooltipWidth + 8 > wrapperRect.width) {
      tooltipX = localX - tooltipWidth - 14;
    }
    tooltipX = clamp(tooltipX, 8, Math.max(8, wrapperRect.width - tooltipWidth - 8));

    let tooltipY = localY - tooltipHeight - 12;
    if (tooltipY < 8) {
      tooltipY = localY + 12;
    }
    tooltipY = clamp(tooltipY, 8, Math.max(8, wrapperRect.height - tooltipHeight - 8));

    tooltip.style.left = `${Math.round(tooltipX)}px`;
    tooltip.style.top = `${Math.round(tooltipY)}px`;
  };

  svg.addEventListener("pointermove", handlePointerMove);
  svg.addEventListener("pointerdown", handlePointerMove);
  svg.addEventListener("pointerleave", hideHover);
  svg.addEventListener("pointercancel", hideHover);

  svg.__chartCleanup = () => {
    svg.removeEventListener("pointermove", handlePointerMove);
    svg.removeEventListener("pointerdown", handlePointerMove);
    svg.removeEventListener("pointerleave", hideHover);
    svg.removeEventListener("pointercancel", hideHover);
    hideHover();
  };
}

function smoothPath(points) {
  if (points.length < 2) {
    return "";
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function renderHeatmap(heatmap) {
  if (!heatmapMonths || !heatmapCells || !heatmap) return;

  const year = heatmap.year || new Date().getFullYear();
  const dayMap = new Map((heatmap.days || []).map((day) => [day.date, day]));

  const start = new Date(year, 0, 1);
  const startOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - startOffset);

  const end = new Date(year, 11, 31);
  const endOffset = 6 - ((end.getDay() + 6) % 7);
  end.setDate(end.getDate() + endOffset);

  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const weekCount = Math.ceil(days.length / 7);
  heatmapMonths.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;
  heatmapCells.style.gridTemplateColumns = `repeat(${weekCount}, minmax(0, 1fr))`;

  heatmapMonths.innerHTML = "";
  heatmapCells.innerHTML = "";

  const monthFmt = new Intl.DateTimeFormat(i18nLocale(), { month: "short" });
  for (let month = 0; month < 12; month += 1) {
    const firstDay = new Date(year, month, 1);
    const index = Math.floor((firstDay - start) / 86400000);
    const weekIndex = Math.floor(index / 7) + 1;
    const label = document.createElement("span");
    label.textContent = monthFmt.format(firstDay).replace(".", "");
    label.style.gridColumn = `${weekIndex}`;
    heatmapMonths.appendChild(label);
  }

  const formatter = new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  days.forEach((day, index) => {
    const cell = document.createElement("span");
    const key = formatDateKey(day);
    const data = dayMap.get(key);
    const status = data?.status || "empty";
    const weekday = (day.getDay() + 6) % 7;
    const weekIndex = Math.floor(index / 7) + 1;

    cell.className = `heatmap-cell ${status}`;
    cell.style.gridColumn = `${weekIndex}`;
    cell.style.gridRow = `${weekday + 1}`;

    if (data && data.uptime !== null && data.uptime !== undefined) {
      const dateLabel = formatter.format(day);
      const statusLabel =
        status === "ok"
          ? t("app.legend.ok", null, "Keine Fehler")
          : status === "warn"
            ? t("app.legend.warn", null, "Kleine Fehler")
            : t("app.legend.down", null, "Ausfall");

      const uptimeNumber = Number(data.uptime);
      const uptimeValue = Number.isFinite(uptimeNumber) ? `${uptimeNumber.toFixed(2)}%` : "--%";
      // Keep the CSS tooltip short so it doesn't get clipped in scroll containers.
      cell.dataset.uptime = uptimeValue;
      cell.title = `${dateLabel}: ${statusLabel} · ${uptimeValue}`;
    }

    heatmapCells.appendChild(cell);
  });
}

function updateMap(location, network) {
  if (!mapEl || !mapLocation || !mapCoords) return;
  if (!location) {
    mapLocation.textContent = t("app.regions.unavailable", null, "Location unavailable");
    mapCoords.textContent = "";
    return;
  }

  const providerSuffix = network?.provider ? ` (${network.provider})` : "";
  const scopeLabel =
    network?.scope === "edge"
      ? t("app.regions.scope.edge", { provider: providerSuffix }, `Edge location${providerSuffix}`)
      : network?.scope === "origin"
      ? t("app.regions.scope.origin", null, "Server location")
      : t("app.regions.scope.generic", null, "Location");

  const hasCoords = Number.isFinite(location.lat) && Number.isFinite(location.lon);
  if (!hasCoords) {
    mapLocation.textContent = t(
      "app.regions.geodata_unavailable",
      { scope: scopeLabel },
      `${scopeLabel}: Geodata unavailable`
    );
    mapCoords.textContent = [location.host, location.ip ? `IP: ${location.ip}` : ""]
      .filter(Boolean)
      .join(" · ");
    return;
  }

  const x = ((location.lon + 180) / 360) * 100;
  const y = ((90 - location.lat) / 180) * 100;

  mapEl.style.setProperty("--marker-x", `${x}%`);
  mapEl.style.setProperty("--marker-y", `${y}%`);

  const place = [location.city, location.region, location.country].filter(Boolean).join(", ");
  mapLocation.textContent = place
    ? `${scopeLabel}: ${place}`
    : `${scopeLabel}: ${location.host || t("app.regions.ip_location", null, "IP location")}`;
  mapCoords.textContent = [
    `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`,
    location.ip || "",
    location.org ? `${t("app.regions.asn_org", null, "ASN/Org")}: ${location.org}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function updateDomainSslCard(domainSsl) {
  if (!domainExpiry || !sslExpiry || !domainSource || !sslIssuer) return;
  if (!domainSsl) {
    domainExpiry.textContent = t("common.not_available", null, "Not available");
    domainSource.textContent = "";
    sslExpiry.textContent = t("common.not_available", null, "Not available");
    sslIssuer.textContent = "";
    return;
  }

  if (Number.isFinite(domainSsl.domainExpiresAt)) {
    domainExpiry.textContent = formatDateWithRemaining(domainSsl.domainExpiresAt);
    domainSource.textContent = domainSsl.domainSource ? t("app.domain_ssl.source_rdap", null, "Source: RDAP") : "";
  } else if (domainSsl.domainNote === "ip_target" || (domainSsl.host && isIpAddress(domainSsl.host))) {
    domainExpiry.textContent = t("app.domain_ssl.ip_target", null, "IP monitor (no domain)");
    domainSource.textContent = "";
  } else if (domainSsl.domainNote === "public_unavailable") {
    domainExpiry.textContent = t("app.domain_ssl.public_unavailable", null, "Publicly unavailable");
    domainSource.textContent = t(
      "app.domain_ssl.registry_no_expiry",
      null,
      "The registry does not publish an expiry date"
    );
  } else {
    domainExpiry.textContent = t("common.not_available", null, "Not available");
    domainSource.textContent = "";
  }

  if (!domainSsl.sslAvailable) {
    sslExpiry.textContent = t("app.domain_ssl.no_https_target", null, "No HTTPS target");
    sslIssuer.textContent = "";
    return;
  }

  if (Number.isFinite(domainSsl.sslExpiresAt)) {
    sslExpiry.textContent = formatDateWithRemaining(domainSsl.sslExpiresAt);
    sslIssuer.textContent = domainSsl.sslIssuer
      ? t("app.domain_ssl.issuer", { issuer: domainSsl.sslIssuer }, `Issuer: ${domainSsl.sslIssuer}`)
      : "";
    return;
  }

  sslExpiry.textContent = t("common.not_available", null, "Not available");
  sslIssuer.textContent = "";
}

function updateIncidents(incidents) {
  if (!incidentsList) return;
  const items = Array.isArray(incidents?.items) ? incidents.items.slice(0, 2) : [];

  if (!items.length) {
    const emptyTitle = escapeHtml(t("app.incidents.empty_title", null, "Good job, no incidents."));
    const emptyBody = escapeHtml(t("app.incidents.empty_body", null, "No incidents yet. Keep it up!"));
    incidentsList.innerHTML = `
      <div class="incidents-inner">
        <div class="incidents-title">${emptyTitle}</div>
        <div class="muted">${emptyBody}</div>
      </div>
    `;
    syncCardHeights();
    return;
  }

  incidentsList.innerHTML = "";
  const list = document.createElement("div");
  list.className = "incidents-list";

  items.forEach((incident) => {
    const item = document.createElement("div");
    item.className = "incident-item";

    if (incident.aggregated) {
      const dateLabel = formatIncidentDay(incident.dateKey || incident.startTs);
      const duration = formatDuration(incident.durationMs || 0);
      const codeLabel = formatErrorCodeSummary(incident.errorCodes);
      const sampleCount = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

      item.innerHTML = `
        <div class="incident-title-row">
          <span>${escapeHtml(t("app.incidents.daily", null, "Daily incident"))}</span>
          <span class="incident-badge">${escapeHtml(t("app.incidents.aggregated", null, "aggregated"))}</span>
        </div>
        <div class="incident-meta">
          <span>${escapeHtml(dateLabel)}</span>
          <span>⏱ ${escapeHtml(duration)}</span>
          <span class="incident-code">${escapeHtml(codeLabel)}</span>
        </div>
        <div class="incident-note">${escapeHtml(
          t("app.incidents.failed_checks", { n: sampleCount }, `Failed checks: ${sampleCount}`)
        )}</div>
      `;
    } else {
      const range = formatIncidentRange(incident.startTs, incident.endTs, incident.ongoing);
      const duration = formatDuration(incident.durationMs || 0);
      const codeLabel = formatErrorCodeSummary(incident.errorCodes, incident.statusCodes);
      const sampleCount = Number.isFinite(Number(incident.samples)) ? Number(incident.samples) : 0;

      item.innerHTML = `
        <div class="incident-title-row">
          <span>${escapeHtml(t("app.incidents.outage", null, "Outage"))}</span>
          <span class="incident-badge">${escapeHtml(
            incident.ongoing
              ? t("app.incidents.badge.ongoing", null, "ongoing")
              : t("app.incidents.badge.ended", null, "ended")
          )}</span>
        </div>
        <div class="incident-meta">
          <span>${escapeHtml(range)}</span>
          <span>⏱ ${escapeHtml(duration)}</span>
          <span class="incident-code">${escapeHtml(codeLabel)}</span>
        </div>
        <div class="incident-note">${escapeHtml(t("app.incidents.checks", { n: sampleCount }, `Checks: ${sampleCount}`))}</div>
      `;
    }

    list.appendChild(item);
  });

  incidentsList.appendChild(list);

  if (Number.isFinite(incidents.lookbackDays)) {
    const note = document.createElement("div");
    note.className = "incident-note incident-footnote";
    note.textContent = t(
      "app.incidents.footnote",
      { days: incidents.lookbackDays },
      `Zeigt die letzten 2 Vorfälle (Fenster: ${incidents.lookbackDays} Tage).`
    );
    incidentsList.appendChild(note);
  }

  syncCardHeights();
}

function shortUnit(unit) {
  const lang = i18nLang();
  if (lang === "en") {
    if (unit === "second") return "sec";
    if (unit === "minute") return "min";
    if (unit === "hour") return "hr";
    if (unit === "day") return "days";
  }
  if (unit === "second") return "Sek.";
  if (unit === "minute") return "Min.";
  if (unit === "hour") return "Std.";
  if (unit === "day") return "Tage";
  return unit;
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

function formatInterval(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} ${shortUnit("second")}`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} ${shortUnit("minute")}`;
  return `${Math.round(ms / 3600000)} ${shortUnit("hour")}`;
}

function formatIncidentRange(startTs, endTs, ongoing) {
  const start = new Date(startTs);
  const end = endTs ? new Date(endTs) : null;
  const timeFmt = new Intl.DateTimeFormat(i18nLocale(), { hour: "2-digit", minute: "2-digit" });
  const dateFmt = new Intl.DateTimeFormat(i18nLocale(), { day: "2-digit", month: "2-digit", year: "numeric" });

  if (!end) {
    const suffix = ongoing
      ? t("app.incidents.ongoing", null, "läuft noch")
      : t("app.incidents.open", null, "offen");
    return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${suffix}`;
  }

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${dateFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }

  return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${dateFmt.format(end)} ${timeFmt.format(end)}`;
}

function formatIncidentDay(value) {
  if (!value) return t("app.incidents.unknown_day", null, "Tag unbekannt");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return new Intl.DateTimeFormat(i18nLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("app.incidents.unknown_day", null, "Tag unbekannt");
  return new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatErrorCodeLabel(value) {
  const code = String(value || "NO_RESPONSE").trim().toUpperCase();
  if (!code || code === "NO_RESPONSE") {
    return t("app.errors.no_response_label", null, "keine Antwort");
  }
  if (/^\d{3}$/.test(code)) return code;
  return code.replaceAll("_", " ").toLowerCase();
}

function formatErrorCodeSummary(errorCodes, statusCodes = []) {
  const items = Array.isArray(errorCodes) ? errorCodes : [];
  if (!items.length) {
    const codes = (statusCodes || []).filter((code) => Number.isFinite(code));
    if (codes.length) {
      return t(
        codes.length > 1 ? "app.errors.http_codes" : "app.errors.http_code",
        { codes: codes.join(", ") },
        `HTTP-Code${codes.length > 1 ? "s" : ""}: ${codes.join(", ")}`
      );
    }
    return t("app.errors.no_response_single", null, "Fehlercode: keine Antwort");
  }
  const parts = items
    .slice(0, 5)
    .map((item) => {
      const code = String(item.code || "NO_RESPONSE");
      const hits = Number(item.hits || 0);
      const label = formatErrorCodeLabel(code);
      return hits > 0 ? `${label} (${hits}x)` : label;
    });
  return t("app.errors.codes", { codes: parts.join(", ") }, `Fehlercodes: ${parts.join(", ")}`);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelative(ms) {
  if (!Number.isFinite(ms) || ms < 0) return `0 ${shortUnit("second")}`;
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} ${shortUnit("second")}`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} ${shortUnit("minute")}`;
  return `${Math.round(ms / 3600000)} ${shortUnit("hour")}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours} ${shortUnit("hour")} ${minutes} ${shortUnit("minute")}`;
  }
  if (minutes > 0) {
    return `${minutes} ${shortUnit("minute")} ${seconds} ${shortUnit("second")}`;
  }
  return `${seconds} ${shortUnit("second")}`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "-- ms";
  return `${Math.round(value)} ms`;
}

function formatDateWithRemaining(timestamp) {
  const date = new Date(timestamp);
  const dateLabel = new Intl.DateTimeFormat(i18nLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const days = Math.ceil((timestamp - Date.now()) / 86400000);
  const rel = rtf().format(days, "day");
  return `${dateLabel} (${rel})`;
}

function isIpAddress(value) {
  if (!value) return false;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

async function handlePopState() {
  const monitorId = parseMonitorIdFromPath();
  if (!monitorId) return;
  if (!findMonitor(monitorId)) return;
  if (monitorId === activeMonitorId) return;

  await setActiveMonitor(monitorId, { pushHistory: false });
}

async function init() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;

  setupMobileSidebar();
  setupResponseHelp();
  activeLocation = readStoredLocation();
  availableProbes = await fetchProbes();
  renderLocationPicker();
  applySloEnabledState(false);

  if (sloTargetInput) {
    sloTargetInput.addEventListener("input", () => {
      markSloDirty();
    });
  }

  if (sloActivateButton) {
    sloActivateButton.addEventListener("click", () => {
      toggleSloForActiveMonitor().catch(() => {
        // ignore
      });
    });
  }

  if (sloForm) {
    sloForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeMonitorId) return;
      if (!sloEnabled) {
        setSloMessage(t("app.slo.msg_enable_first", null, "Bitte zuerst SLO aktivieren."), "error");
        return;
      }

      setSloMessage(t("app.slo.msg_saving", null, "Speichern ..."));
      try {
        const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/slo`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(readSloPayload()),
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          if (response.status === 400) {
            setSloMessage(t("app.slo.msg_invalid", null, "Bitte einen gültigen SLO-Wert eingeben."), "error");
          } else {
            setSloMessage(t("app.slo.msg_failed", null, "Speichern fehlgeschlagen."), "error");
          }
          return;
        }

        sloDirty = false;
        setSloMessage(t("app.slo.msg_saved", null, "Gespeichert."), "success");
        syncSloPanel(payload.data, { force: true });
        await loadMetrics();
      } catch (error) {
        setSloMessage(t("app.slo.msg_failed", null, "Speichern fehlgeschlagen."), "error");
      }
    });
  }

  if (assertionsEnabledInput) {
    assertionsEnabledInput.addEventListener("change", () => {
      markAssertionsDirty();
      applyAssertionsEnabledState();
    });
  }

  if (assertionsFollowRedirectsInput) {
    assertionsFollowRedirectsInput.addEventListener("change", () => {
      markAssertionsDirty();
      applyAssertionsEnabledState();
    });
  }

  for (const el of [
    assertionsStatusCodesInput,
    assertionsMaxRedirectsInput,
    assertionsContentTypeInput,
    assertionsBodyInput,
    assertionsTimeoutInput,
  ].filter(Boolean)) {
    el.addEventListener("input", () => {
      markAssertionsDirty();
    });
  }

  if (assertionsForm) {
    assertionsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeMonitorId) return;

      setAssertionsMessage(t("app.assertions.msg_saving", null, "Speichern ..."));
      try {
        const response = await fetch(`/api/monitors/${encodeURIComponent(activeMonitorId)}/assertions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(readAssertionsPayload()),
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          setAssertionsMessage(t("app.assertions.msg_failed", null, "Speichern fehlgeschlagen."), "error");
          return;
        }

        assertionsDirty = false;
        setAssertionsMessage(t("app.assertions.msg_saved", null, "Gespeichert."), "success");
        syncAssertionsPanel(payload.data, { force: true });
      } catch (error) {
        setAssertionsMessage(t("app.assertions.msg_failed", null, "Speichern fehlgeschlagen."), "error");
      }
    });
  }

  for (const el of [maintenanceTitleInput, maintenanceStartInput, maintenanceEndInput, maintenanceNoteInput].filter(Boolean)) {
    el.addEventListener("input", () => {
      setMaintenanceMessage("");
      hideMaintenanceVerifyLink();
    });
  }

  if (maintenanceForm) {
    maintenanceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await createMaintenance();
    });
  }

  if (maintenanceListEl) {
    maintenanceListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("button[data-maintenance-cancel-id]");
      if (!button) return;
      const id = button.getAttribute("data-maintenance-cancel-id") || "";
      cancelMaintenance(id).catch(() => {
        // ignore
      });
    });
  }

  applyAssertionsEnabledState();

  if (monitorIconEl) {
    monitorIconEl.addEventListener("error", () => {
      if (monitorIconEl.dataset.fallback === "1") return;
      monitorIconEl.dataset.fallback = "1";
      monitorIconEl.src = DEFAULT_MONITOR_ICON;
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }
  if (publicStatusButton) {
    publicStatusButton.addEventListener("click", () => {
      window.location.href = getPublicStatusPath();
    });
  }
  if (newMonitorButton) {
    newMonitorButton.addEventListener("click", () => {
      window.location.href = "/onboarding?new=1";
    });
  }
  if (monitorSelect) {
    monitorSelect.addEventListener("change", () => {
      const selected = String(monitorSelect.value || "").trim();
      if (!selected) return;
      setActiveMonitor(selected, { pushHistory: true }).catch(() => {
        // ignore
      });
    });
  }
  if (locationSelect) {
    locationSelect.addEventListener("change", () => {
      activeLocation = String(locationSelect.value || "").trim() || "aggregate";
      writeStoredLocation(activeLocation);

      refreshMonitors().catch(() => {
        // ignore
      });

      loadMetrics().catch(() => {
        // ignore
      });
    });
  }
  if (intervalSelect) {
    renderIntervalPicker(60000);
    intervalSelect.disabled = true;
    intervalSelect.addEventListener("change", () => {
      if (intervalPickerSuppressChange) return;
      const selected = Number(intervalSelect.value);
      if (!Number.isFinite(selected)) return;
      updateMonitorInterval(selected).catch(() => {
        // ignore
      });
    });
  }

  const hasMonitor = await bootstrapMonitor();
  if (!hasMonitor) return;

  await loadMetrics();
  syncCardHeights();

  setInterval(loadMetrics, pollIntervalMs);
  setInterval(refreshMonitors, monitorsRefreshIntervalMs);
  setInterval(() => {
    if (latestMetrics) {
      updateStatus(latestMetrics);
    }
  }, 1000);

  window.addEventListener("popstate", () => {
    handlePopState().catch(() => {
      // ignore
    });
  });

  window.addEventListener("resize", () => {
    syncCardHeights();
  });
}

init();

