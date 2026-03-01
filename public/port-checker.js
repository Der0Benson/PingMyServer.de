(() => {
  const I18N = window.PMS_I18N || null;
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const t = (key, vars, fallback) =>
    I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";

  const locale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

  const navLoginLinks = Array.from(document.querySelectorAll("[data-landing-login]"));
  const navPrimaryCtas = Array.from(document.querySelectorAll("[data-landing-primary-cta]"));
  const companyMenu = document.querySelector("[data-landing-product-menu]");
  const companyMenuLinks = document.querySelectorAll("[data-landing-product-link]");
  const mobileMenuToggle = document.getElementById("landing-mobile-menu-toggle");
  const mobileMenu = document.getElementById("landing-mobile-menu");
  const mobileCompanyMenu = document.querySelector("[data-landing-mobile-product]");
  const mobileMenuLinks = document.querySelectorAll("[data-landing-mobile-link]");

  const form = document.getElementById("port-checker-form");
  const hostInput = document.getElementById("port-checker-host");
  const portInput = document.getElementById("port-checker-port");
  const submitButton = document.getElementById("port-checker-submit");
  const statusNote = document.getElementById("port-checker-status");
  const errorNote = document.getElementById("port-checker-error");
  const resultsList = document.getElementById("port-checker-results");
  const metaChips = document.getElementById("port-checker-meta");
  const exampleButtons = Array.from(document.querySelectorAll("[data-example-port]"));

  let isSubmitting = false;

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
    if (mobileCompanyMenu) mobileCompanyMenu.removeAttribute("open");
  }

  function closeCompanyMenu() {
    if (!companyMenu) return;
    companyMenu.removeAttribute("open");
  }

  async function fetchJsonPayload(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
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
        ? t("landing.nav.dashboard", null, "Dashboard")
        : t("landing.nav.cta", null, "Kostenlos starten");
    });

    if (isAuthenticated) closeMobileMenu();
  }

  function initNavigation() {
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
        closeCompanyMenu();
        closeMobileMenu();
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth >= 768) closeMobileMenu();
      });
    }

    if (companyMenu) {
      const companySummary = companyMenu.querySelector("summary");
      let closeCompanyMenuTimer = 0;

      const shouldUseHoverMenu = () => supportsFinePointer && window.innerWidth >= 768;
      const clearCompanyMenuTimer = () => {
        if (!closeCompanyMenuTimer) return;
        window.clearTimeout(closeCompanyMenuTimer);
        closeCompanyMenuTimer = 0;
      };
      const openCompanyMenuOnHover = () => {
        clearCompanyMenuTimer();
        companyMenu.setAttribute("open", "");
      };
      const scheduleCompanyMenuClose = (delayMs = 170) => {
        clearCompanyMenuTimer();
        closeCompanyMenuTimer = window.setTimeout(() => {
          closeCompanyMenuTimer = 0;
          closeCompanyMenu();
        }, delayMs);
      };

      if (supportsFinePointer) {
        companyMenu.addEventListener("pointerenter", () => {
          if (!shouldUseHoverMenu()) return;
          openCompanyMenuOnHover();
        });

        companyMenu.addEventListener("pointerleave", (event) => {
          if (!shouldUseHoverMenu()) return;
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && companyMenu.contains(nextTarget)) return;
          scheduleCompanyMenuClose();
        });

        companyMenu.addEventListener("focusin", () => {
          if (!shouldUseHoverMenu()) return;
          openCompanyMenuOnHover();
        });

        companyMenu.addEventListener("focusout", (event) => {
          if (!shouldUseHoverMenu()) return;
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && companyMenu.contains(nextTarget)) return;
          scheduleCompanyMenuClose(120);
        });
      }

      if (companySummary) {
        companySummary.addEventListener("click", (event) => {
          if (!shouldUseHoverMenu()) return;
          event.preventDefault();
          clearCompanyMenuTimer();
          if (companyMenu.hasAttribute("open")) {
            closeCompanyMenu();
            return;
          }
          companyMenu.setAttribute("open", "");
        });
      }

      companyMenuLinks.forEach((link) => {
        link.addEventListener("click", () => {
          clearCompanyMenuTimer();
          closeCompanyMenu();
        });
      });

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (companyMenu.contains(target)) return;
        clearCompanyMenuTimer();
        closeCompanyMenu();
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth >= 768) return;
        clearCompanyMenuTimer();
        closeCompanyMenu();
      });
    }

    hasAuthenticatedSession().then((isAuthenticated) => {
      renderNavigationAuthState(isAuthenticated);
    });
  }

  initNavigation();

  if (!form || !hostInput || !portInput || !submitButton || !statusNote || !errorNote || !resultsList || !metaChips) return;

  function setSubmitState(nextState) {
    isSubmitting = !!nextState;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting
      ? t("port_checker.form.submitting", null, "Prüfung läuft ...")
      : t("port_checker.form.submit", null, "Port prüfen");
  }

  function setStatusMessage(key, fallback) {
    statusNote.hidden = false;
    statusNote.textContent = t(key, null, fallback);
  }

  function clearError() {
    errorNote.hidden = true;
    errorNote.textContent = "";
  }

  function showError(message) {
    statusNote.hidden = true;
    errorNote.hidden = false;
    errorNote.textContent = message;
    metaChips.hidden = true;
    metaChips.replaceChildren();
    resultsList.hidden = true;
    resultsList.replaceChildren();
  }

  function readHostValue(value) {
    return String(value || "").trim();
  }

  function readPortValue(value) {
    return String(value || "").trim();
  }

  function updateUrl(host, port) {
    try {
      const nextUrl = new URL(window.location.href);
      if (host) {
        nextUrl.searchParams.set("host", host);
      } else {
        nextUrl.searchParams.delete("host");
      }
      if (port) {
        nextUrl.searchParams.set("port", port);
      } else {
        nextUrl.searchParams.delete("port");
      }
      window.history.replaceState(null, "", nextUrl.toString());
    } catch {
      // ignore
    }
  }

  function createMetaChip(label, value) {
    const chip = document.createElement("span");
    chip.className = "dns-meta-chip";
    chip.textContent = label;

    const strong = document.createElement("strong");
    strong.textContent = value;
    chip.appendChild(strong);
    return chip;
  }

  function addResultRow(container, label, value) {
    if (value === undefined || value === null || value === "") return;

    const row = document.createElement("div");
    row.className = "dns-result-row";

    const key = document.createElement("div");
    key.className = "dns-result-key";
    key.textContent = label;

    const val = document.createElement("div");
    val.className = "dns-result-value";
    val.textContent = String(value);

    row.appendChild(key);
    row.appendChild(val);
    container.appendChild(row);
  }

  function resultLabelForStatus(status) {
    if (status === "open") return t("port_checker.results.open", null, "Port ist offen");
    if (status === "closed") return t("port_checker.results.closed", null, "Port ist geschlossen");
    if (status === "timeout") return t("port_checker.results.timeout", null, "Port antwortet nicht rechtzeitig");
    if (status === "unreachable") return t("port_checker.results.unreachable", null, "Ziel ist nicht erreichbar");
    if (status === "unresolved") return t("port_checker.results.unresolved", null, "Domain konnte nicht aufgelöst werden");
    return t("port_checker.results.failed", null, "Port-Prüfung fehlgeschlagen. Bitte später erneut versuchen.");
  }

  function renderResult(payload) {
    const totalDuration = Math.max(0, Number(payload?.durationMs) || 0);
    const connectDuration = Math.max(0, Number(payload?.connectDurationMs) || 0);
    const numberFormat = new Intl.NumberFormat(locale());
    const status = String(payload?.status || "");

    clearError();
    metaChips.replaceChildren(
      createMetaChip(t("port_checker.results.host", null, "Host"), String(payload?.host || "")),
      createMetaChip(t("port_checker.results.port", null, "Port"), String(payload?.port || "")),
      createMetaChip(t("port_checker.results.duration", null, "Antwortzeit"), `${numberFormat.format(totalDuration)} ms`)
    );
    metaChips.hidden = false;

    const article = document.createElement("article");
    article.className = "dns-result-item";

    const head = document.createElement("div");
    head.className = "dns-result-head";

    const headline = document.createElement("div");
    headline.className = "dns-result-index";
    headline.textContent = resultLabelForStatus(status);

    const accent = document.createElement("div");
    accent.className = "dns-result-accent";
    if (status !== "open") {
      accent.style.background = "radial-gradient(circle, #ffd479 0%, rgba(255, 212, 121, 0.18) 100%)";
      accent.style.boxShadow = "0 0 18px rgba(255, 212, 121, 0.22)";
    }

    head.appendChild(headline);
    head.appendChild(accent);

    const fields = document.createElement("div");
    fields.className = "dns-result-fields";

    addResultRow(fields, t("port_checker.results.status_label", null, "Status"), status.toUpperCase() || "-");
    addResultRow(fields, t("port_checker.results.address", null, "Geprüfte IP"), payload?.checkedAddress);
    addResultRow(fields, t("port_checker.results.family", null, "IP-Version"), payload?.checkedFamily ? `IPv${payload.checkedFamily}` : "");
    addResultRow(fields, t("port_checker.results.reason", null, "Code"), payload?.reasonCode);
    addResultRow(fields, t("port_checker.results.duration", null, "Antwortzeit"), connectDuration ? `${numberFormat.format(connectDuration)} ms` : "");

    article.appendChild(head);
    article.appendChild(fields);

    resultsList.replaceChildren(article);
    resultsList.hidden = false;
    statusNote.hidden = true;
  }

  function errorMessageFromPayload(payload) {
    const error = String(payload?.error || "").toLowerCase();
    if (error === "invalid host") {
      return t("port_checker.results.invalid_host", null, "Bitte eine gültige Domain oder einen Hostnamen eingeben.");
    }
    if (error === "invalid port") {
      return t("port_checker.results.invalid_port", null, "Bitte einen gültigen Port zwischen 1 und 65535 eingeben.");
    }
    if (error === "target blocked") {
      return t("port_checker.results.blocked", null, "Private oder lokale Ziele sind für dieses Tool gesperrt.");
    }
    return t("port_checker.results.failed", null, "Port-Prüfung fehlgeschlagen. Bitte später erneut versuchen.");
  }

  async function runCheck() {
    if (isSubmitting) return;

    const host = readHostValue(hostInput.value);
    const port = readPortValue(portInput.value);

    if (!host) {
      showError(t("port_checker.results.invalid_host", null, "Bitte eine gültige Domain oder einen Hostnamen eingeben."));
      return;
    }

    const numericPort = Number.parseInt(port, 10);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      showError(t("port_checker.results.invalid_port", null, "Bitte einen gültigen Port zwischen 1 und 65535 eingeben."));
      return;
    }

    updateUrl(host, String(numericPort));
    clearError();
    metaChips.hidden = true;
    metaChips.replaceChildren();
    resultsList.hidden = true;
    resultsList.replaceChildren();
    setStatusMessage("port_checker.results.loading", "Port wird geprüft ...");
    setSubmitState(true);

    try {
      const response = await fetch(`/api/tools/port-check?host=${encodeURIComponent(host)}&port=${encodeURIComponent(String(numericPort))}`, {
        headers: {
          Accept: "application/json",
        },
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || payload.ok !== true) {
        showError(errorMessageFromPayload(payload));
        return;
      }

      renderResult(payload);
    } catch {
      showError(t("port_checker.results.failed", null, "Port-Prüfung fehlgeschlagen. Bitte später erneut versuchen."));
    } finally {
      setSubmitState(false);
    }
  }

  function syncFromUrl() {
    try {
      const url = new URL(window.location.href);
      const host = readHostValue(url.searchParams.get("host"));
      const port = readPortValue(url.searchParams.get("port"));

      if (host) hostInput.value = host;
      if (port) portInput.value = port;

      return host && port;
    } catch {
      return false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runCheck();
  });

  exampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      hostInput.value = readHostValue(button.getAttribute("data-example-host"));
      portInput.value = readPortValue(button.getAttribute("data-example-port"));
      runCheck();
    });
  });

  setSubmitState(false);
  setStatusMessage("port_checker.results.idle", "Starte einen Check, um den Port-Status zu sehen.");

  if (syncFromUrl()) {
    runCheck();
  }
})();
