(function attachSettingsModalUtilities(globalScope) {
  "use strict";

  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function findFirstFocusable(container) {
    if (!container || typeof container.querySelector !== "function") return null;
    return container.querySelector(FOCUSABLE_SELECTOR);
  }

  function createModalManager() {
    const entries = new Map();

    function setOpenButtonState(entry, isOpen) {
      if (!entry?.openButton) return;
      entry.openButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      entry.openButton.classList.toggle("is-open", !!isOpen);
    }

    function restoreFocus(entry) {
      const restoreTarget = entry?.openButton || entry?.lastFocusedElement || null;
      if (!restoreTarget || typeof restoreTarget.focus !== "function") return;
      restoreTarget.focus();
    }

    function requestClose(entry, options = {}) {
      const { force = false } = options;
      if (!entry || !entry.modal) return true;

      if (!force && typeof entry.isDirty === "function" && entry.isDirty()) {
        const unsavedMessage =
          typeof entry.getUnsavedMessage === "function"
            ? String(entry.getUnsavedMessage() || "")
            : "Unsaved changes";
        if (!globalScope.confirm(unsavedMessage)) {
          return false;
        }
      }

      if (typeof entry.modal.close === "function") {
        if (entry.modal.open) entry.modal.close();
      } else {
        entry.modal.removeAttribute("open");
        setOpenButtonState(entry, false);
        restoreFocus(entry);
      }

      return true;
    }

    function openEntry(entry) {
      if (!entry || !entry.modal) return;

      entry.lastFocusedElement =
        globalScope.document && globalScope.document.activeElement instanceof HTMLElement
          ? globalScope.document.activeElement
          : null;

      setOpenButtonState(entry, true);
      if (typeof entry.modal.showModal === "function") {
        if (!entry.modal.open) entry.modal.showModal();
      } else {
        entry.modal.setAttribute("open", "");
      }

      const focusTarget = entry.focusTarget || findFirstFocusable(entry.modal);
      globalScope.setTimeout(() => {
        if (focusTarget && typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }, 0);
    }

    function bind(config = {}) {
      const key = String(config.key || "").trim();
      if (!key) return;
      const entry = {
        key,
        openButton: config.openButton || null,
        closeButton: config.closeButton || null,
        modal: config.modal || null,
        focusTarget: config.focusTarget || null,
        statusEl: config.statusEl || null,
        isDirty: typeof config.isDirty === "function" ? config.isDirty : null,
        getUnsavedMessage: typeof config.getUnsavedMessage === "function" ? config.getUnsavedMessage : null,
        onAfterClose: typeof config.onAfterClose === "function" ? config.onAfterClose : null,
        statusTimer: null,
        lastFocusedElement: null,
      };
      if (!entry.modal) return;

      entries.set(key, entry);
      setOpenButtonState(entry, false);

      if (entry.openButton) {
        entry.openButton.addEventListener("click", (event) => {
          event.preventDefault();
          openEntry(entry);
        });
      }

      if (entry.closeButton) {
        entry.closeButton.addEventListener("click", () => {
          requestClose(entry);
        });
      }

      entry.modal.addEventListener("cancel", (event) => {
        event.preventDefault();
        requestClose(entry);
      });

      entry.modal.addEventListener("click", (event) => {
        if (event.target !== entry.modal) return;
        requestClose(entry);
      });

      entry.modal.addEventListener("close", () => {
        setOpenButtonState(entry, false);
        if (typeof entry.onAfterClose === "function") {
          entry.onAfterClose();
        }
        restoreFocus(entry);
      });
    }

    function showStatus(key, message, variant = "success", options = {}) {
      const entry = entries.get(String(key || ""));
      const statusEl = entry?.statusEl || null;
      if (!statusEl) return;

      const text = String(message || "").trim();
      if (!text) {
        clearStatus(key);
        return;
      }

      if (entry.statusTimer) {
        globalScope.clearTimeout(entry.statusTimer);
        entry.statusTimer = null;
      }

      statusEl.textContent = text;
      statusEl.hidden = false;
      statusEl.classList.toggle("success", variant === "success");
      statusEl.classList.toggle("error", variant === "error");
      statusEl.classList.toggle("warn", variant === "warn");

      const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(0, Number(options.ttlMs)) : 2200;
      if (ttlMs > 0) {
        entry.statusTimer = globalScope.setTimeout(() => {
          clearStatus(key);
        }, ttlMs);
      }
    }

    function clearStatus(key) {
      const entry = entries.get(String(key || ""));
      const statusEl = entry?.statusEl || null;
      if (!statusEl) return;

      if (entry.statusTimer) {
        globalScope.clearTimeout(entry.statusTimer);
        entry.statusTimer = null;
      }

      statusEl.textContent = "";
      statusEl.hidden = true;
      statusEl.classList.remove("success", "error", "warn");
    }

    return {
      bind,
      showStatus,
      clearStatus,
      requestClose: (key, options = {}) => requestClose(entries.get(String(key || "")), options),
    };
  }

  globalScope.PMSSettingsModals = {
    createModalManager,
  };
})(window);
