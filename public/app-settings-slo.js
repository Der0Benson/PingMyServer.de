(function attachSloSettingsController(globalScope) {
  "use strict";

  function createSloSettingsController(options = {}) {
    const t = typeof options.t === "function" ? options.t : (_k, _v, fallback) => String(fallback || "");
    const elements = options.elements || {};

    const state = {
      dirty: false,
      enabled: false,
    };

    function setMessage(message, variant = "") {
      const messageEl = elements.messageEl || null;
      if (!messageEl) return;
      messageEl.textContent = String(message || "");
      messageEl.classList.toggle("success", variant === "success");
      messageEl.classList.toggle("error", variant === "error");
    }

    function setStateBadge(element, enabled) {
      if (!element) return;
      const active = !!enabled;
      element.classList.toggle("is-on", active);
      element.classList.toggle("is-off", !active);
      element.textContent = active
        ? t("app.slo.state_active", null, "Aktiv")
        : t("app.slo.state_inactive", null, "Nicht aktiviert");
    }

    function applyEnabledState(enabled) {
      const active = !!enabled;
      state.enabled = active;

      if (elements.cardEl) {
        elements.cardEl.hidden = !active;
      }

      if (elements.formEl) {
        elements.formEl.classList.toggle("is-disabled", !active);
      }
      if (elements.targetInput) {
        elements.targetInput.disabled = !active;
      }
      if (elements.saveButton) {
        elements.saveButton.disabled = !active;
      }
      if (elements.activateButton) {
        elements.activateButton.hidden = false;
        elements.activateButton.disabled = false;
        elements.activateButton.classList.toggle("is-deactivate", active);
        elements.activateButton.textContent = active
          ? t("app.slo.deactivate_button", null, "SLO deaktivieren")
          : t("app.slo.activate_button", null, "SLO aktivieren");
      }
      if (elements.activationHint) {
        elements.activationHint.textContent = active
          ? t("app.slo.settings_activation_hint_on", null, "Du kannst SLO jederzeit wieder deaktivieren.")
          : t(
              "app.slo.settings_activation_hint_off",
              null,
              "Aktiviere SLO zuerst, damit Error-Budget und Burn-Rate berechnet werden."
            );
      }

      setStateBadge(elements.stateBadge, active);
    }

    function syncSettingsBounds(slo) {
      if (!elements.targetInput || !slo || typeof slo !== "object") return;
      if (Number.isFinite(Number(slo.minTargetPercent))) {
        elements.targetInput.min = String(Number(slo.minTargetPercent));
      }
      if (Number.isFinite(Number(slo.maxTargetPercent))) {
        elements.targetInput.max = String(Number(slo.maxTargetPercent));
      }
    }

    function syncPanel(slo, options = {}) {
      const { force = false } = options;
      if (!elements.formEl || !elements.targetInput) return;

      const normalized = slo && typeof slo === "object" ? slo : null;
      if (!normalized) {
        applyEnabledState(false);
        elements.targetInput.value = "";
        return;
      }

      syncSettingsBounds(normalized);
      const enabled = Object.prototype.hasOwnProperty.call(normalized, "enabled") ? !!normalized.enabled : true;
      applyEnabledState(enabled);

      if (!force && state.dirty) return;

      const targetPercent = Number(normalized.targetPercent);
      if (Number.isFinite(targetPercent)) {
        elements.targetInput.value = targetPercent.toFixed(3);
      } else if (elements.targetInput.value === "") {
        const fallbackTarget = Number(normalized.defaultTargetPercent);
        if (Number.isFinite(fallbackTarget)) {
          elements.targetInput.value = fallbackTarget.toFixed(3);
        }
      }
    }

    function readPayload() {
      return {
        targetPercent: Number(elements.targetInput?.value),
      };
    }

    function markDirty() {
      state.dirty = true;
      setMessage("");
    }

    function resetForMonitor() {
      state.dirty = false;
      setMessage("");
      applyEnabledState(false);
    }

    return {
      setMessage,
      setStateBadge,
      applyEnabledState,
      syncSettingsBounds,
      syncPanel,
      readPayload,
      markDirty,
      resetForMonitor,
      isDirty: () => state.dirty,
      setDirty: (value) => {
        state.dirty = !!value;
      },
      isEnabled: () => state.enabled,
      setEnabled: (value) => applyEnabledState(!!value),
    };
  }

  globalScope.PMSSettingsSlo = {
    createSloSettingsController,
  };
})(window);
