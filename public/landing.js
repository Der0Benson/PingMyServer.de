(() => {
  const previewPollIntervalMs = 30000;
  const previewBarCount = 8;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const I18N = window.PMS_I18N || null;
  const t = (key, vars, fallback) =>
    I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
  const i18nLang = () => (I18N && typeof I18N.getLang === "function" ? I18N.getLang() : "de");
  const i18nLocale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");
  const rtf = () =>
    I18N && typeof I18N.rtf === "function"
      ? I18N.rtf()
      : new Intl.RelativeTimeFormat(i18nLocale(), { numeric: "auto" });

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
  const navLoginLinks = Array.from(document.querySelectorAll("[data-landing-login]"));
  const navPrimaryCtas = Array.from(document.querySelectorAll("[data-landing-primary-cta]"));
  const mobileMenuToggle = document.getElementById("landing-mobile-menu-toggle");
  const mobileMenu = document.getElementById("landing-mobile-menu");
  const mobileMenuLinks = document.querySelectorAll("[data-landing-mobile-link]");

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

  function setMobileMenuOpen(isOpen) {
    if (!mobileMenu || !mobileMenuToggle) return;
    mobileMenuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mobileMenuToggle.classList.toggle("is-open", isOpen);
    if (isOpen) {
      mobileMenu.removeAttribute("hidden");
      return;
    }
    mobileMenu.setAttribute("hidden", "");
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  if (mobileMenu && mobileMenuToggle) {
    setMobileMenuOpen(false);

    mobileMenuToggle.addEventListener("click", () => {
      const isOpen = mobileMenuToggle.getAttribute("aria-expanded") === "true";
      setMobileMenuOpen(!isOpen);
    });

    mobileMenuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        closeMobileMenu();
      });
    });

    document.addEventListener("click", (event) => {
      if (mobileMenu.hasAttribute("hidden")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileMenu.contains(target) || mobileMenuToggle.contains(target)) return;
      closeMobileMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeMobileMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) closeMobileMenu();
    });
  }

  function initRevealAnimations() {
    if (prefersReducedMotion) return;
    if (!(document.body instanceof HTMLElement)) return;

    const revealTargets = [];
    const seenTargets = new Set();

    function registerTargets(selector, options = {}) {
      const nodes = document.querySelectorAll(selector);
      const step = Number.isFinite(options.step) ? options.step : 70;
      const baseDelay = Number.isFinite(options.baseDelay) ? options.baseDelay : 0;
      const variant = typeof options.variant === "string" ? options.variant : "";

      nodes.forEach((node, index) => {
        if (!(node instanceof HTMLElement)) return;
        if (seenTargets.has(node)) return;
        seenTargets.add(node);
        node.classList.add("reveal-item");
        if (variant) node.classList.add(variant);
        node.style.setProperty("--reveal-delay", `${baseDelay + index * step}ms`);
        revealTargets.push(node);
      });
    }

    registerTargets(".landing-nav-main > *", { step: 45, baseDelay: 20, variant: "reveal-slide-down" });
    registerTargets(".landing-hero .max-w-7xl > .grid > div:first-child > *", { step: 75, baseDelay: 60 });
    registerTargets(".landing-hero .floating > .glass-effect", { baseDelay: 250, variant: "reveal-pop" });
    registerTargets(".landing-social-proof .text-center", { baseDelay: 30, variant: "reveal-pop" });
    registerTargets(".landing-social-proof .grid > div", { step: 85, baseDelay: 60, variant: "reveal-pop" });
    registerTargets(".landing-features .text-center", { baseDelay: 20 });
    registerTargets(".landing-features .feature-card", { step: 75, baseDelay: 60, variant: "reveal-pop" });
    registerTargets(".landing-about .text-center", { baseDelay: 20 });
    registerTargets(".landing-about .glass-effect", { baseDelay: 70 });
    registerTargets(".landing-about .mt-12 > *", { step: 75, baseDelay: 70, variant: "reveal-pop" });
    registerTargets(".landing-pricing .text-center", { baseDelay: 20 });
    registerTargets(".landing-pricing .grid > .glass-effect", { step: 80, baseDelay: 60, variant: "reveal-pop" });
    registerTargets(".landing-faq .text-center", { baseDelay: 20 });
    registerTargets(".landing-faq .faq-item", { step: 65, baseDelay: 60 });
    registerTargets(".landing-final-cta .max-w-4xl > *", { step: 80, baseDelay: 45 });
    registerTargets(".landing-footer .grid > div", { step: 85, baseDelay: 30 });
    registerTargets(".landing-footer .border-t", { baseDelay: 80 });

    if (!revealTargets.length) return;
    document.body.classList.add("landing-motion-enabled");

    if (typeof window.IntersectionObserver !== "function") {
      revealTargets.forEach((target) => target.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { root: null, threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );

    revealTargets.forEach((target) => observer.observe(target));
  }

  function initInteractiveSurfaces() {
    if (prefersReducedMotion || !supportsFinePointer) return;

    const surfaces = document.querySelectorAll(
      ".landing-features .feature-card, .landing-pricing .grid > .glass-effect, .landing-about .glass-effect"
    );

    surfaces.forEach((surface) => {
      if (!(surface instanceof HTMLElement)) return;
      surface.classList.add("interactive-surface");

      let frame = null;
      let pointerEvent = null;

      const renderSurface = () => {
        frame = null;
        if (!pointerEvent) return;

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const localX = pointerEvent.clientX - rect.left;
        const localY = pointerEvent.clientY - rect.top;
        const normalizedX = Math.min(Math.max(localX / rect.width, 0), 1);
        const normalizedY = Math.min(Math.max(localY / rect.height, 0), 1);
        const rotateX = (0.5 - normalizedY) * 8;
        const rotateY = (normalizedX - 0.5) * 10;

        surface.style.setProperty("--mx", `${Math.round(normalizedX * 100)}%`);
        surface.style.setProperty("--my", `${Math.round(normalizedY * 100)}%`);
        surface.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
        surface.classList.add("is-pointer-active");
      };

      function scheduleRender(event) {
        pointerEvent = event;
        if (frame !== null) return;
        frame = window.requestAnimationFrame(renderSurface);
      }

      function resetSurface() {
        pointerEvent = null;
        if (frame !== null) {
          window.cancelAnimationFrame(frame);
          frame = null;
        }
        surface.style.removeProperty("transform");
        surface.style.setProperty("--mx", "50%");
        surface.style.setProperty("--my", "50%");
        surface.classList.remove("is-pointer-active");
      }

      surface.addEventListener("pointermove", scheduleRender);
      surface.addEventListener("pointerleave", resetSurface);
      surface.addEventListener("pointercancel", resetSurface);
      surface.addEventListener("blur", resetSurface);
    });
  }

  function asFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function shortUnit(unit) {
    const lang = i18nLang();
    if (lang === "en") {
      if (unit === "second") return "sec";
      if (unit === "minute") return "min";
      if (unit === "hour") return "hr";
    }
    if (unit === "second") return "Sek.";
    if (unit === "minute") return "Min.";
    if (unit === "hour") return "Std.";
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
    return rtf().format(-hours, "hour");
  }

  function formatRelative(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (safeMs < 60000) return `${Math.max(1, Math.round(safeMs / 1000))} ${shortUnit("second")}`;
    if (safeMs < 3600000) return `${Math.round(safeMs / 60000)} ${shortUnit("minute")}`;
    return `${Math.round(safeMs / 3600000)} ${shortUnit("hour")}`;
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
    return target || t("common.monitor", null, "Monitor");
  }

  function monitorStatusIsOnline(metrics) {
    return String(metrics?.status || "").toLowerCase() === "online";
  }

  function monitorResponseText(metrics) {
    const response = asFiniteNumber(metrics?.lastResponseMs);
    return response === null
      ? t("landing.live.response_placeholder", null, "Response: --")
      : t("landing.live.response_value", { ms: Math.round(response) }, `Response: ${Math.round(response)}ms`);
  }

  function monitorUptimeText(metrics) {
    const uptime = asFiniteNumber(metrics?.last24h?.uptime);
    return uptime === null
      ? t("landing.live.uptime_placeholder", null, "--% Uptime")
      : t("landing.live.uptime_value", { uptime: uptime.toFixed(2) }, `${uptime.toFixed(2)}% Uptime`);
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
      liveOverall.textContent = t("landing.live.overall.no_data", null, "No monitor data available");
      setStateColorClass(liveOverall, "unknown");
      setDotColorClass("unknown");
      return;
    }

    const offlineCount = metricsList.filter((metrics) => !monitorStatusIsOnline(metrics)).length;
    if (offlineCount === 0) {
      liveOverall.textContent = t("landing.live.overall.operational", null, "All systems operational");
      setStateColorClass(liveOverall, "online");
      setDotColorClass("online");
      return;
    }

    liveOverall.textContent = t(
      offlineCount === 1 ? "landing.live.overall.offline.one" : "landing.live.overall.offline.many",
      { n: offlineCount },
      `${offlineCount} monitors offline`
    );
    setStateColorClass(liveOverall, "offline");
    setDotColorClass("offline");
  }

  function renderPrimaryMonitor(metrics) {
    if (!metrics) {
      if (monitor1Name) monitor1Name.textContent = t("landing.live.no_monitor", null, "No monitor available");
      if (monitor1Status) {
        monitor1Status.textContent = t("common.no_data", null, "No data");
        setStateColorClass(monitor1Status, "unknown");
      }
      if (monitor1Response) monitor1Response.textContent = t("landing.live.response_placeholder", null, "Response: --");
      if (monitor1Uptime) monitor1Uptime.textContent = t("landing.live.uptime_placeholder", null, "--% Uptime");
      renderBars(null);
      return;
    }

    if (monitor1Name) monitor1Name.textContent = monitorDisplayName(metrics);
    if (monitor1Status) {
      const online = monitorStatusIsOnline(metrics);
      monitor1Status.textContent = online
        ? t("app.state.online", null, "Online")
        : t("app.state.offline", null, "Offline");
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
      monitor2Status.textContent = online
        ? t("app.state.online", null, "Online")
        : t("app.state.offline", null, "Offline");
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
    return first === "NO_RESPONSE" ? t("app.errors.no_response_label", null, "no response") : first;
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
      alertTime.textContent = t("landing.live.alert_now", null, "just now");
      alertText.textContent = t("landing.live.alert.none_full", null, "No recent incidents found.");
      return;
    }

    const age = Math.max(0, Date.now() - latest.timestamp);
    const label = monitorDisplayName(latestMetrics);
    const codeLabel = incidentCodeLabel(latest.incident);
    const codeSuffix = codeLabel ? ` (${codeLabel})` : "";
    const ongoing = !!latest.incident?.ongoing;

    alertTime.textContent = formatTimeAgo(age);
    alertText.textContent = ongoing
      ? t(
          "landing.live.alert.offline",
          { label, code: codeSuffix },
          `${label} is currently offline${codeSuffix}`
        )
      : t("landing.live.alert.outage", { label, code: codeSuffix }, `${label} had an outage${codeSuffix}`);
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

  async function hasAuthenticatedSession() {
    const payload = await fetchJsonPayload("/api/me");
    return !!payload?.ok && !!payload?.user;
  }

  function renderNavigationAuthState(isAuthenticated) {
    navLoginLinks.forEach((link) => {
      link.classList.toggle("hidden", isAuthenticated);
      link.setAttribute("aria-hidden", isAuthenticated ? "true" : "false");
      if (isAuthenticated) {
        link.setAttribute("hidden", "");
      } else {
        link.removeAttribute("hidden");
      }
    });

    navPrimaryCtas.forEach((cta) => {
      cta.setAttribute("href", isAuthenticated ? "/app" : "/login?mode=register");
      cta.textContent = isAuthenticated
        ? t("landing.nav.dashboard", null, "Go to dashboard")
        : t("landing.nav.cta", null, "Start for free");
    });

    if (isAuthenticated) closeMobileMenu();
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
    let metricsList = [];
    const isAuthenticated = await hasAuthenticatedSession();
    renderNavigationAuthState(isAuthenticated);

    if (isAuthenticated) {
      metricsList = await loadAuthenticatedPreviewMetrics();
    } else {
      const publicMetric = await loadPublicPreviewMetric();
      metricsList = publicMetric ? [publicMetric] : [];
    }

    const normalizedMetrics = uniqueMetrics(metricsList).slice(0, 2);

    renderOverallStatus(normalizedMetrics);
    renderPrimaryMonitor(normalizedMetrics[0] || null);
    renderSecondaryMonitor(normalizedMetrics[1] || null);
    renderLatestAlert(normalizedMetrics);
  }

  initRevealAnimations();
  initInteractiveSurfaces();
  loadPreviewData();
  setInterval(loadPreviewData, previewPollIntervalMs);
})();
