(function attachAssertionsSettingsController(globalScope) {
  "use strict";

  function createAssertionsSettingsController(options = {}) {
    const elements = options.elements || {};

    const state = {
      dirty: false,
      boundMonitorId: null,
    };

    function setMessage(message, variant = "") {
      const messageEl = elements.messageEl || null;
      if (!messageEl) return;
      messageEl.textContent = String(message || "");
      messageEl.classList.toggle("success", variant === "success");
      messageEl.classList.toggle("error", variant === "error");
    }

    function markDirty() {
      state.dirty = true;
      setMessage("");
    }

    function applyEnabledState() {
      const formEl = elements.formEl || null;
      const enabledInput = elements.enabledInput || null;
      if (!formEl || !enabledInput) return;

      const enabled = !!enabledInput.checked;
      formEl.classList.toggle("is-disabled", !enabled);

      const fields = [
        elements.statusCodesInput,
        elements.followRedirectsInput,
        elements.maxRedirectsInput,
        elements.contentTypeInput,
        elements.bodyInput,
        elements.timeoutInput,
      ].filter(Boolean);

      for (const field of fields) {
        field.disabled = !enabled;
      }

      if (elements.maxRedirectsInput) {
        const redirectsEnabled = !!elements.followRedirectsInput?.checked;
        elements.maxRedirectsInput.disabled = !enabled || !redirectsEnabled;
      }
    }

    function syncPanel(assertions, options = {}) {
      const { force = false, activeMonitorId = null } = options;
      const formEl = elements.formEl || null;
      if (!formEl) return;
      if (!force && state.dirty) return;

      const normalized = assertions && typeof assertions === "object" ? assertions : null;
      state.boundMonitorId = activeMonitorId || null;

      if (!normalized) {
        if (elements.enabledInput) elements.enabledInput.checked = false;
        if (elements.statusCodesInput) elements.statusCodesInput.value = "";
        if (elements.followRedirectsInput) elements.followRedirectsInput.checked = true;
        if (elements.maxRedirectsInput) elements.maxRedirectsInput.value = "5";
        if (elements.contentTypeInput) elements.contentTypeInput.value = "";
        if (elements.bodyInput) elements.bodyInput.value = "";
        if (elements.timeoutInput) elements.timeoutInput.value = "0";
        applyEnabledState();
        return;
      }

      if (elements.enabledInput) elements.enabledInput.checked = !!normalized.enabled;
      if (elements.statusCodesInput) elements.statusCodesInput.value = String(normalized.expectedStatusCodes || "");
      if (elements.followRedirectsInput) elements.followRedirectsInput.checked = normalized.followRedirects !== false;
      if (elements.maxRedirectsInput) {
        const maxRedirects = Number.isFinite(Number(normalized.maxRedirects)) ? Number(normalized.maxRedirects) : 5;
        elements.maxRedirectsInput.value = String(maxRedirects);
      }
      if (elements.contentTypeInput) elements.contentTypeInput.value = String(normalized.contentTypeContains || "");
      if (elements.bodyInput) elements.bodyInput.value = String(normalized.bodyContains || "");
      if (elements.timeoutInput) {
        const timeoutMs = Number.isFinite(Number(normalized.timeoutMs)) ? Number(normalized.timeoutMs) : 0;
        elements.timeoutInput.value = String(timeoutMs);
      }

      applyEnabledState();
    }

    function readPayload() {
      return {
        enabled: !!elements.enabledInput?.checked,
        expectedStatusCodes: String(elements.statusCodesInput?.value || "").trim(),
        contentTypeContains: String(elements.contentTypeInput?.value || "").trim(),
        bodyContains: String(elements.bodyInput?.value || "").trim(),
        followRedirects: !!elements.followRedirectsInput?.checked,
        maxRedirects: Number(elements.maxRedirectsInput?.value),
        timeoutMs: Number(elements.timeoutInput?.value),
      };
    }

    function resetForMonitor() {
      state.dirty = false;
      state.boundMonitorId = null;
      setMessage("");
    }

    return {
      setMessage,
      markDirty,
      applyEnabledState,
      syncPanel,
      readPayload,
      resetForMonitor,
      isDirty: () => state.dirty,
      setDirty: (value) => {
        state.dirty = !!value;
      },
      getBoundMonitorId: () => state.boundMonitorId,
      setBoundMonitorId: (value) => {
        state.boundMonitorId = value || null;
      },
    };
  }

  globalScope.PMSSettingsAssertions = {
    createAssertionsSettingsController,
  };
})(window);
