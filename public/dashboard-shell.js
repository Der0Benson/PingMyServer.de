(() => {
  const sidebarEl = document.getElementById("dashboard-sidebar");
  const mobileNavToggle = document.getElementById("mobile-nav-toggle");
  const mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");

  if (!sidebarEl || !mobileNavToggle || !mobileNavBackdrop) return;

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
