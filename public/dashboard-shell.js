(() => {
  const sidebarEl = document.getElementById("dashboard-sidebar");
  const mobileNavToggle = document.getElementById("mobile-nav-toggle");
  const mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");

  if (!sidebarEl || !mobileNavToggle || !mobileNavBackdrop) return;

  function decorateNavigation() {
    const english = String(document.documentElement.lang || "").toLowerCase().startsWith("en");
    const navDescriptions = english
      ? {
          "/app": "Status and measurements",
          "/monitors": "Manage targets",
          "/incidents": "Review outages",
          "/notifications": "Email, Discord and webhooks",
          "/connections": "Logins, agents and security",
          "/owner": "Operations and diagnostics",
          "/status": "Public view",
        }
      : {
          "/app": "Status und Messwerte",
          "/monitors": "Ziele verwalten",
          "/incidents": "Ausfälle nachvollziehen",
          "/notifications": "E-Mail, Discord und Webhooks",
          "/connections": "Logins, Agenten und Sicherheit",
          "/owner": "Betrieb und Diagnose",
          "/status": "Öffentliche Ansicht",
        };

    for (const link of sidebarEl.querySelectorAll(".side-nav a")) {
      const href = link.getAttribute("href") || "";
      const description = navDescriptions[href];
      if (!description || link.querySelector(".side-nav-description")) continue;
      const label = document.createElement("span");
      label.className = "side-nav-label";
      label.textContent = link.textContent.trim();
      const hint = document.createElement("small");
      hint.className = "side-nav-description";
      hint.textContent = description;
      link.textContent = "";
      link.append(label, hint);
      if (href === "/connections") {
        link.setAttribute("title", english ? "Manage account and connections" : "Konto und Verbindungen verwalten");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", decorateNavigation, { once: true });
  } else {
    decorateNavigation();
  }

  const mobileNavQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)")
      : null;

  function isMobileViewport() {
    return !!mobileNavQuery && !!mobileNavQuery.matches;
  }

  function setMobileSidebarOpen(open) {
    const shouldOpen = !!open && isMobileViewport();
    document.body.classList.toggle("mobile-sidebar-open", shouldOpen);

    mobileNavToggle.classList.toggle("is-open", shouldOpen);
    mobileNavToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");

    if (shouldOpen) {
      mobileNavBackdrop.removeAttribute("hidden");
      return;
    }
    mobileNavBackdrop.setAttribute("hidden", "");
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
  }

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

  if (mobileNavQuery && typeof mobileNavQuery.addEventListener === "function") {
    mobileNavQuery.addEventListener("change", () => {
      if (!isMobileViewport()) closeMobileSidebar();
    });
  } else {
    window.addEventListener("resize", () => {
      if (!isMobileViewport()) closeMobileSidebar();
    });
  }
})();
