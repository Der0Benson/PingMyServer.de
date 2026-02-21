(function attachMaintenanceSettingsController(globalScope) {
  "use strict";

  function createMaintenanceSettingsController(options = {}) {
    const elements = options.elements || {};

    const state = {
      boundMonitorId: null,
      dirty: false,
    };

    function setMessage(message, variant = "") {
      const messageEl = elements.messageEl || null;
      if (!messageEl) return;
      messageEl.textContent = String(message || "");
      messageEl.classList.toggle("success", variant === "success");
      messageEl.classList.toggle("error", variant === "error");
    }

    function hideVerifyLink() {
      const verifyLinkEl = elements.verifyLinkEl || null;
      if (!verifyLinkEl) return;
      verifyLinkEl.hidden = true;
      verifyLinkEl.removeAttribute("data-hostname");
      verifyLinkEl.href = "/connections#domain-verification";
    }

    function showVerifyLink(hostname) {
      const verifyLinkEl = elements.verifyLinkEl || null;
      if (!verifyLinkEl) return;
      const clean = String(hostname || "").trim();
      verifyLinkEl.href = clean
        ? `/connections?domain=${encodeURIComponent(clean)}#domain-verification`
        : "/connections#domain-verification";
      verifyLinkEl.hidden = false;
      if (clean) verifyLinkEl.dataset.hostname = clean;
    }

    function hasDraft() {
      return !!state.dirty;
    }

    function markDirty() {
      state.dirty = true;
    }

    function resetForMonitor() {
      state.boundMonitorId = null;
      state.dirty = false;
      setMessage("");
      hideVerifyLink();
    }

    function syncPanel(maintenances, options = {}) {
      const activeMonitorId = options.activeMonitorId || null;
      const resetForm = typeof options.resetForm === "function" ? options.resetForm : null;
      const renderMaintenances = typeof options.renderMaintenances === "function" ? options.renderMaintenances : null;

      if (state.boundMonitorId !== activeMonitorId) {
        state.boundMonitorId = activeMonitorId;
        state.dirty = false;
        if (resetForm) resetForm(true);
      }
      if (renderMaintenances) renderMaintenances(maintenances);
    }

    return {
      setMessage,
      hideVerifyLink,
      showVerifyLink,
      hasDraft,
      markDirty,
      resetForMonitor,
      syncPanel,
      setDirty: (value) => {
        state.dirty = !!value;
      },
      isDirty: () => state.dirty,
      getBoundMonitorId: () => state.boundMonitorId,
      setBoundMonitorId: (value) => {
        state.boundMonitorId = value || null;
      },
    };
  }

  globalScope.PMSSettingsMaintenance = {
    createMaintenanceSettingsController,
  };
})(window);
