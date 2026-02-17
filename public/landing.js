(() => {
  const previewPollIntervalMs = 30000;
  const previewBarCount = 8;

  const faqButtons = document.querySelectorAll("[data-faq-toggle]");
  const liveDot = document.getElementById("landing-live-dot");
  const liveOverall = document.getElementById("landing-live-overall");
  const monitor1Name = document.getElementById("landing-monitor-1-name");
  const monitor1Status = document.getElementById("landing-monitor-1-status");
  const monitor1Response = document.getElementById("landing-monitor-1-response");
  const monitor1Uptime = document.getElementById("landing-monitor-1-uptime");
  const monitor1Bars = document.getElementById("landing-monitor-1-bars");
  const monitor2Card = document.getElementById("landing-monitor-2-card");
  const monitor2Name = document.getElementById("landing-monitor-2-name");
  const monitor2Status = document.getElementById("landing-monitor-2-status");
  const monitor2Response = document.getElementById("landing-monitor-2-response");
  const monitor2Uptime = document.getElementById("landing-monitor-2-uptime");
  const alertTime = document.getElementById("landing-alert-time");
  const alertText = document.getElementById("landing-alert-text");

  const stateTextClasses = ["text-green-400", "text-orange-400", "text-slate-400"];
  const liveDotClasses = ["bg-green-400", "bg-yellow-500", "bg-slate-700"];

  faqButtons.forEach((button) => {
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", () => {
      const faqItem = button.closest(".faq-item");
      if (!faqItem) return;

      const willOpen = !faqItem.classList.contains("is-open");
      faqItem.classList.toggle("is-open", willOpen);
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  });

  function asFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function formatRelative(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (safeMs < 60000) return `${Math.max(1, Math.round(safeMs / 1000))} Sek.`;
    if (safeMs < 3600000) return `${Math.round(safeMs / 60000)} Min.`;
    return `${Math.round(safeMs / 3600000)} Std.`;
  }

  function extractHostname(target) {
    try {
      const parsed = new URL(String(target || ""));
      return String(parsed.hostname || "").trim();
    } catch (error) {
      return "";
    }
  }

  function monitorDisplayName(metrics) {
    const host = extractHostname(metrics?.target);
    if (host) return host;
    const name = String(metrics?.name || "").trim();
    if (name) return name;
    const target = String(metrics?.target || "").trim();
    return target || "Monitor";
  }

  function monitorStatusIsOnline(metrics) {
    return String(metrics?.status || "").toLowerCase() === "online";
  }

  function monitorResponseText(metrics) {
    const response = asFiniteNumber(metrics?.lastResponseMs);
    return response === null ? "Response: --" : `Response: ${Math.round(response)}ms`;
  }

  function monitorUptimeText(metrics) {
    const uptime = asFiniteNumber(metrics?.last24h?.uptime);
    return uptime === null ? "--% Uptime" : `${uptime.toFixed(2)}% Uptime`;
  }

  function setStateColorClass(element, mode) {
    if (!element) return;
    element.classList.remove(...stateTextClasses);
    if (mode === "online") {
      element.classList.add("text-green-400");
      return;
    }
    if (mode === "offline") {
      element.classList.add("text-orange-400");
      return;
    }
    element.classList.add("text-slate-400");
  }

  function setDotColorClass(mode) {
    if (!liveDot) return;
    liveDot.classList.remove(...liveDotClasses);
    if (mode === "online") {
      liveDot.classList.add("bg-green-400");
      return;
    }
    if (mode === "offline") {
      liveDot.classList.add("bg-yellow-500");
      return;
    }
    liveDot.classList.add("bg-slate-700");
  }

  function barClassForStatus(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "ok") return "bg-green-500";
    if (normalized === "warn") return "bg-yellow-500";
    if (normalized === "down") return "bg-cyan-400";
    return "bg-slate-700";
  }

  function renderBars(metrics) {
    if (!monitor1Bars) return;
    monitor1Bars.innerHTML = "";

    const bars = Array.isArray(metrics?.last24h?.bars) ? metrics.last24h.bars : [];
    const compactBars = bars.length > previewBarCount ? bars.slice(-previewBarCount) : bars;
    const normalizedBars = compactBars.length ? compactBars : Array.from({ length: previewBarCount }, () => ({ status: "empty" }));

    normalizedBars.forEach((bar) => {
      const segment = document.createElement("div");
      segment.className = `h-8 w-1 rounded ${barClassForStatus(bar?.status)}`;
      monitor1Bars.appendChild(segment);
    });

    while (monitor1Bars.children.length < previewBarCount) {
      const segment = document.createElement("div");
      segment.className = "h-8 w-1 bg-slate-700 rounded";
      monitor1Bars.appendChild(segment);
    }
  }

  function renderOverallStatus(metricsList) {
    if (!liveOverall) return;
    if (!metricsList.length) {
      liveOverall.textContent = "Keine Monitor-Daten verfügbar";
      setStateColorClass(liveOverall, "unknown");
      setDotColorClass("unknown");
      return;
    }

    const offlineCount = metricsList.filter((metrics) => !monitorStatusIsOnline(metrics)).length;
    if (offlineCount === 0) {
      liveOverall.textContent = "All Systems Operational";
      setStateColorClass(liveOverall, "online");
      setDotColorClass("online");
      return;
    }

    const suffix = offlineCount === 1 ? "" : "e";
    liveOverall.textContent = `${offlineCount} Monitor${suffix} offline`;
    setStateColorClass(liveOverall, "offline");
    setDotColorClass("offline");
  }

  function renderPrimaryMonitor(metrics) {
    if (!metrics) {
      if (monitor1Name) monitor1Name.textContent = "Kein Monitor verfügbar";
      if (monitor1Status) {
        monitor1Status.textContent = "Keine Daten";
        setStateColorClass(monitor1Status, "unknown");
      }
      if (monitor1Response) monitor1Response.textContent = "Response: --";
      if (monitor1Uptime) monitor1Uptime.textContent = "--% Uptime";
      renderBars(null);
      return;
    }

    if (monitor1Name) monitor1Name.textContent = monitorDisplayName(metrics);
    if (monitor1Status) {
      const online = monitorStatusIsOnline(metrics);
      monitor1Status.textContent = online ? "Online" : "Offline";
      setStateColorClass(monitor1Status, online ? "online" : "offline");
    }
    if (monitor1Response) monitor1Response.textContent = monitorResponseText(metrics);
    if (monitor1Uptime) monitor1Uptime.textContent = monitorUptimeText(metrics);
    renderBars(metrics);
  }

  function renderSecondaryMonitor(metrics) {
    if (!monitor2Card) return;
    if (!metrics) {
      monitor2Card.classList.add("hidden");
      return;
    }

    monitor2Card.classList.remove("hidden");
    if (monitor2Name) monitor2Name.textContent = monitorDisplayName(metrics);
    if (monitor2Status) {
      const online = monitorStatusIsOnline(metrics);
      monitor2Status.textContent = online ? "Online" : "Offline";
      setStateColorClass(monitor2Status, online ? "online" : "offline");
    }
    if (monitor2Response) monitor2Response.textContent = monitorResponseText(metrics);
    if (monitor2Uptime) monitor2Uptime.textContent = monitorUptimeText(metrics);
  }

  function incidentTimestamp(incident) {
    const startTs = asFiniteNumber(incident?.startTs);
    if (startTs !== null) return startTs;
    const endTs = asFiniteNumber(incident?.endTs);
    if (endTs !== null) return endTs;
    if (typeof incident?.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(incident.dateKey)) {
      const parsed = Date.parse(`${incident.dateKey}T00:00:00.000Z`);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function incidentCodeLabel(incident) {
    const statusCodes = Array.isArray(incident?.statusCodes)
      ? incident.statusCodes.filter((code) => Number.isFinite(Number(code))).map((code) => Number(code))
      : [];
    if (statusCodes.length) return statusCodes.join(", ");

    const errorCodes = Array.isArray(incident?.errorCodes) ? incident.errorCodes : [];
    if (!errorCodes.length) return "";

    const first = String(errorCodes[0]?.code || "").trim();
    if (!first) return "";
    return first === "NO_RESPONSE" ? "keine Antwort" : first;
  }

  function renderLatestAlert(metricsList) {
    if (!alertTime || !alertText) return;

    let latest = null;
    let latestMetrics = null;

    metricsList.forEach((metrics) => {
      const items = Array.isArray(metrics?.incidents?.items) ? metrics.incidents.items : [];
      items.forEach((incident) => {
        const ts = incidentTimestamp(incident);
        if (!latest || ts > latest.timestamp) {
          latest = { timestamp: ts, incident };
          latestMetrics = metrics;
        }
      });
    });

    if (!latest) {
      alertTime.textContent = "gerade eben";
      alertText.textContent = "Keine aktuellen Vorfälle gefunden.";
      return;
    }

    const age = Math.max(0, Date.now() - latest.timestamp);
    const label = monitorDisplayName(latestMetrics);
    const codeLabel = incidentCodeLabel(latest.incident);
    const codeSuffix = codeLabel ? ` (${codeLabel})` : "";
    const ongoing = !!latest.incident?.ongoing;

    alertTime.textContent = `vor ${formatRelative(age)}`;
    alertText.textContent = ongoing
      ? `${label} ist aktuell offline${codeSuffix}`
      : `${label} hatte einen Ausfall${codeSuffix}`;
  }

  async function fetchJsonPayload(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function loadMetricsForMonitorId(monitorId) {
    const payload = await fetchJsonPayload(`/api/monitors/${encodeURIComponent(monitorId)}/metrics`);
    if (!payload?.ok || !payload.data) return null;
    return payload.data;
  }

  async function loadAuthenticatedPreviewMetrics() {
    const monitorsPayload = await fetchJsonPayload("/api/monitors");
    const monitors = Array.isArray(monitorsPayload?.data) ? monitorsPayload.data : [];
    if (!monitors.length) return [];

    const monitorIds = monitors
      .map((monitor) => String(monitor?.id || "").trim())
      .filter(Boolean)
      .slice(0, 2);

    const metricResults = await Promise.all(monitorIds.map((monitorId) => loadMetricsForMonitorId(monitorId)));
    return metricResults.filter(Boolean);
  }

  async function loadPublicPreviewMetric() {
    const payload = await fetchJsonPayload("/status/data");
    if (!payload?.ok || !payload.data) return null;
    return payload.data;
  }

  function uniqueMetrics(metricsList) {
    const unique = [];
    const seenIds = new Set();

    metricsList.forEach((metrics) => {
      if (!metrics) return;
      const monitorId = String(metrics.monitorId || "").trim();
      const key = monitorId || monitorDisplayName(metrics);
      if (seenIds.has(key)) return;
      seenIds.add(key);
      unique.push(metrics);
    });

    return unique;
  }

  async function loadPreviewData() {
    let metricsList = await loadAuthenticatedPreviewMetrics();

    if (!metricsList.length) {
      const publicMetric = await loadPublicPreviewMetric();
      metricsList = publicMetric ? [publicMetric] : [];
    } else if (metricsList.length === 1) {
      const publicMetric = await loadPublicPreviewMetric();
      if (publicMetric) {
        metricsList.push(publicMetric);
      }
    }

    const normalizedMetrics = uniqueMetrics(metricsList).slice(0, 2);

    renderOverallStatus(normalizedMetrics);
    renderPrimaryMonitor(normalizedMetrics[0] || null);
    renderSecondaryMonitor(normalizedMetrics[1] || null);
    renderLatestAlert(normalizedMetrics);
  }

  loadPreviewData();
  setInterval(loadPreviewData, previewPollIntervalMs);
})();
