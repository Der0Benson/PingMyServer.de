(() => {
  "use strict";

  const currentUserEmail = document.getElementById("current-user-email");
  const logoutButton = document.getElementById("logout-btn");
  const refreshButton = document.getElementById("refresh-btn");
  const locationSelect = document.getElementById("location-select");
  const monitorsListEl = document.getElementById("monitors-list");
  const messageEl = document.getElementById("monitors-message");
  const ownerLinks = Array.from(document.querySelectorAll("[data-owner-link]"));

  const DEFAULT_MONITOR_ICON = "/assets/pingmyserverlogo.png";
  const LOCATION_STORAGE_KEY = "pms.location";

  const I18N = window.PMS_I18N || null;
  const t = (key, vars, fallback) =>
    I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
  const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
  const rtf = () =>
    I18N && typeof I18N.rtf === "function"
      ? I18N.rtf()
      : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });

  let user = null;
  let monitors = [];
  let activeLocation = "aggregate";
  let availableProbes = [];

  function setMessage(text) {
    if (!messageEl) return;
    messageEl.textContent = String(text || "");
    messageEl.hidden = !messageEl.textContent;
  }

  function syncOwnerLinks() {
    const isOwner = !!user?.isOwner;
    for (const link of ownerLinks) {
      link.hidden = !isOwner;
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
      if (currentUserEmail) {
        currentUserEmail.textContent = user.email || t("common.signed_in", null, "signed in");
      }
      return true;
    } catch (error) {
      return false;
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
    if (!response.ok) return [];
    const payload = await response.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list.map((monitor) => ({
      ...monitor,
      id: String(monitor.id),
    }));
  }

  function getMonitorDisplayName(monitor) {
    if (!monitor) return t("common.monitor", null, "Monitor");
    return monitor.name || monitor.url || `Monitor ${monitor.id}`;
  }

  function getMonitorUrl(monitor) {
    return String(monitor?.url || "").trim();
  }

  function getHostname(value) {
    const raw = getMonitorUrl({ url: value });
    if (!raw) return "";
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function endpointLabel(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      const path = parsed.pathname || "/";
      return `${path}${parsed.search || ""}`;
    } catch (error) {
      return raw;
    }
  }

  function monitorStatusLabel(status) {
    return status === "offline"
      ? t("app.state.offline", null, "Offline")
      : t("app.state.online", null, "Online");
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

  function buildGroups(list) {
    const items = Array.isArray(list) ? list : [];
    const map = new Map();

    for (const monitor of items) {
      const host = getHostname(monitor?.url);
      const key = host || t("common.unknown", null, "unknown");
      let group = map.get(key);
      if (!group) {
        group = { key, title: key, monitors: [], sortKey: 0 };
        map.set(key, group);
      }
      group.monitors.push(monitor);
      const createdAt = Number(monitor?.created_at || 0);
      if (Number.isFinite(createdAt) && createdAt > group.sortKey) group.sortKey = createdAt;
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

  async function deleteMonitor(monitor) {
    const monitorId = String(monitor?.id || "").trim();
    if (!monitorId) return;

    const monitorName = getMonitorDisplayName(monitor);
    const confirmed = window.confirm(
      t(
        "app.monitor.delete_confirm",
        { name: monitorName },
        `Delete monitor \"${monitorName}\"?\n\nThis will permanently remove all data for this monitor.`
      )
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/monitors/${encodeURIComponent(monitorId)}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok && response.status !== 404) {
        window.alert(t("app.monitor.delete_failed", null, "Monitor could not be deleted. Please try again later."));
        return;
      }

      await loadAndRender();
    } catch (error) {
      window.alert(t("app.monitor.delete_failed", null, "Monitor could not be deleted. Please try again later."));
    }
  }

  function createMonitorRow(monitor) {
    const row = document.createElement("div");
    row.className = "monitor-nav-row";

    const item = document.createElement("button");
    item.type = "button";
    item.className = "monitor-nav-item";

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
      : t("app.monitor.no_check", null, "no check yet");
    const ep = endpointLabel(getMonitorUrl(monitor));
    meta.textContent = `${monitorStatusLabel(monitor.last_status)} \u00b7 ${ep} \u00b7 ${lastCheckLabel}`;

    item.appendChild(head);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      window.location.href = `/app/monitors/${encodeURIComponent(String(monitor.id))}`;
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "monitor-nav-delete";
    deleteButton.textContent = t("common.delete", null, "Delete");
    deleteButton.title = t("app.monitor.delete_title", null, "Delete monitor");
    deleteButton.setAttribute(
      "aria-label",
      t("app.monitor.delete_aria", { name: getMonitorDisplayName(monitor) }, `Delete monitor ${getMonitorDisplayName(monitor)}`)
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

  function createGroupCard(group) {
    const details = document.createElement("details");
    details.className = "monitor-group-card";
    details.open = true;

    const summary = document.createElement("summary");
    summary.className = "monitor-group-summary";

    const row = document.createElement("div");
    row.className = "monitor-group-summary-row";

    const icon = document.createElement("img");
    icon.className = "monitor-group-icon";
    icon.alt = "";
    icon.decoding = "async";
    icon.loading = "lazy";
    icon.dataset.fallback = "0";
    const firstMonitorId = group?.monitors?.[0]?.id;
    icon.src = firstMonitorId ? `/api/monitors/${encodeURIComponent(String(firstMonitorId))}/favicon` : DEFAULT_MONITOR_ICON;
    icon.addEventListener("error", () => {
      if (icon.dataset.fallback === "1") return;
      icon.dataset.fallback = "1";
      icon.src = DEFAULT_MONITOR_ICON;
    });

    const host = document.createElement("div");
    host.className = "monitor-group-host";
    host.textContent = String(group.title || "").trim() || t("common.unknown", null, "unknown");

    const count = document.createElement("div");
    count.className = "monitor-group-count";
    count.textContent = String(Array.isArray(group.monitors) ? group.monitors.length : 0);

    row.appendChild(icon);
    row.appendChild(host);
    row.appendChild(count);

    const meta = document.createElement("div");
    meta.className = "monitor-group-meta";

    const monitorsInGroup = Array.isArray(group.monitors) ? group.monitors : [];
    const total = monitorsInGroup.length;
    const offlineCount = monitorsInGroup.filter((m) => String(m?.last_status) === "offline").length;
    const lastCheckedAt = monitorsInGroup.reduce((acc, m) => {
      const value = Number(m?.last_checked_at || 0);
      if (!Number.isFinite(value) || value <= 0) return acc;
      return Math.max(acc, value);
    }, 0);
    const lastCheckLabel = lastCheckedAt
      ? formatTimeAgo(Date.now() - lastCheckedAt)
      : t("app.monitor.no_check", null, "no check yet");

    const endpointsWord =
      total === 1 ? t("app.groups.endpoint_one", null, "endpoint") : t("app.groups.endpoint_many", null, "endpoints");
    const offlineSuffix = offlineCount
      ? ` \u00b7 ${t("app.groups.offline_suffix", { count: offlineCount }, `${offlineCount} offline`)}`
      : "";
    const groupStatus = offlineCount ? "offline" : "online";
    meta.textContent = `${monitorStatusLabel(groupStatus)} \u00b7 ${total} ${endpointsWord}${offlineSuffix} \u00b7 ${lastCheckLabel}`;

    summary.appendChild(row);
    summary.appendChild(meta);

    const body = document.createElement("div");
    body.className = "monitor-group-body";
    for (const monitor of monitorsInGroup) {
      body.appendChild(createMonitorRow(monitor));
    }

    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function render() {
    if (!monitorsListEl) return;
    monitorsListEl.innerHTML = "";

    const groups = buildGroups(monitors);
    if (!groups.length) {
      setMessage(t("monitors.empty", null, "No monitors found."));
      return;
    }

    setMessage("");
    for (const group of groups) {
      monitorsListEl.appendChild(createGroupCard(group));
    }
  }

  async function loadAndRender() {
    setMessage(t("common.loading", null, "Loading..."));
    monitors = await fetchMonitors();
    render();
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
    const ok = await ensureAuthenticated();
    if (!ok) return;

    activeLocation = readStoredLocation();
    availableProbes = await fetchProbes();
    renderLocationPicker();

    if (logoutButton) {
      logoutButton.addEventListener("click", logout);
    }
    if (locationSelect) {
      locationSelect.addEventListener("change", () => {
        activeLocation = String(locationSelect.value || "").trim() || "aggregate";
        writeStoredLocation(activeLocation);
        loadAndRender().catch(() => {
          // ignore
        });
      });
    }
    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        loadAndRender().catch(() => {
          // ignore
        });
      });
    }

    await loadAndRender();
  }

  init();
})();
