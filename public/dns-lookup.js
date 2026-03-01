(() => {
  const I18N = window.PMS_I18N || null;
  const ALLOWED_TYPES = new Set(["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SRV", "SOA"]);

  const t = (key, vars, fallback) =>
    I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";

  const locale = () => (I18N && typeof I18N.locale === "function" ? I18N.locale() : "de-DE");

  const form = document.getElementById("dns-lookup-form");
  const hostInput = document.getElementById("dns-lookup-host");
  const typeSelect = document.getElementById("dns-lookup-type");
  const submitButton = document.getElementById("dns-lookup-submit");
  const statusNote = document.getElementById("dns-lookup-status");
  const errorNote = document.getElementById("dns-lookup-error");
  const resultsList = document.getElementById("dns-lookup-results");
  const metaChips = document.getElementById("dns-lookup-meta");
  const exampleButtons = Array.from(document.querySelectorAll("[data-example-host]"));

  let isSubmitting = false;

  if (!form || !hostInput || !typeSelect || !submitButton || !statusNote || !errorNote || !resultsList || !metaChips) return;

  function setSubmitState(nextState) {
    isSubmitting = !!nextState;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting
      ? t("dns_lookup.form.submitting", null, "Lookup läuft ...")
      : t("dns_lookup.form.submit", null, "DNS prüfen");
  }

  function setIdleMessage(key, fallback) {
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
    resultsList.hidden = true;
    resultsList.replaceChildren();
    metaChips.hidden = true;
    metaChips.replaceChildren();
  }

  function escapeQueryValue(value) {
    return String(value || "").trim();
  }

  function updateUrl(host, type) {
    try {
      const nextUrl = new URL(window.location.href);
      const safeHost = escapeQueryValue(host);
      if (safeHost) {
        nextUrl.searchParams.set("host", safeHost);
      } else {
        nextUrl.searchParams.delete("host");
      }
      nextUrl.searchParams.set("type", type);
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

  function createPlainChip(text) {
    const chip = document.createElement("span");
    chip.className = "dns-meta-chip";
    chip.textContent = text;
    return chip;
  }

  function addRecordRow(container, label, value) {
    if (value === undefined || value === null || value === "") return;

    const row = document.createElement("div");
    row.className = "dns-result-row";

    const key = document.createElement("div");
    key.className = "dns-result-key";
    key.textContent = label;

    const val = document.createElement("div");
    val.className = "dns-result-value";
    val.textContent = typeof value === "string" ? value : String(value);

    row.appendChild(key);
    row.appendChild(val);
    container.appendChild(row);
  }

  function renderRecord(record, index) {
    const item = document.createElement("article");
    item.className = "dns-result-item";

    const head = document.createElement("div");
    head.className = "dns-result-head";

    const indexLabel = document.createElement("div");
    indexLabel.className = "dns-result-index";
    indexLabel.textContent = `#${index + 1}`;

    const accent = document.createElement("div");
    accent.className = "dns-result-accent";

    head.appendChild(indexLabel);
    head.appendChild(accent);

    const fields = document.createElement("div");
    fields.className = "dns-result-fields";

    addRecordRow(fields, t("dns_lookup.results.value", null, "Wert"), record?.value);
    addRecordRow(fields, t("dns_lookup.results.priority", null, "Priorität"), record?.priority);
    addRecordRow(fields, t("dns_lookup.results.exchange", null, "Mailserver"), record?.exchange);
    addRecordRow(fields, t("dns_lookup.results.weight", null, "Gewicht"), record?.weight);
    addRecordRow(fields, t("dns_lookup.results.port", null, "Port"), record?.port);
    addRecordRow(fields, t("dns_lookup.results.target", null, "Ziel"), record?.name);
    addRecordRow(fields, t("dns_lookup.results.nsname", null, "Primary NS"), record?.nsname);
    addRecordRow(fields, t("dns_lookup.results.hostmaster", null, "Hostmaster"), record?.hostmaster);
    addRecordRow(fields, t("dns_lookup.results.serial", null, "Serial"), record?.serial);
    addRecordRow(fields, t("dns_lookup.results.refresh", null, "Refresh"), record?.refresh);
    addRecordRow(fields, t("dns_lookup.results.retry", null, "Retry"), record?.retry);
    addRecordRow(fields, t("dns_lookup.results.expire", null, "Expire"), record?.expire);
    addRecordRow(fields, t("dns_lookup.results.minttl", null, "Min TTL"), record?.minttl);

    if (Array.isArray(record?.chunks) && record.chunks.length > 1) {
      addRecordRow(fields, t("dns_lookup.results.segments", null, "Segmente"), record.chunks.join(" | "));
    }

    if (!fields.childElementCount) {
      addRecordRow(fields, t("dns_lookup.results.value", null, "Wert"), t("dns_lookup.results.empty", null, "Kein Wert"));
    }

    item.appendChild(head);
    item.appendChild(fields);
    return item;
  }

  function renderResults(payload) {
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const count = records.length;
    const numberFormat = new Intl.NumberFormat(locale());

    clearError();
    metaChips.replaceChildren(
      createMetaChip(t("dns_lookup.results.host", null, "Host"), String(payload?.host || "")),
      createMetaChip(t("dns_lookup.results.type", null, "Typ"), String(payload?.type || "")),
      createMetaChip(
        t("dns_lookup.results.duration", null, "Antwortzeit"),
        `${numberFormat.format(Math.max(0, Number(payload?.durationMs) || 0))} ms`
      ),
      createPlainChip(
        count === 1
          ? t("dns_lookup.results.records_one", { n: count }, "1 Record gefunden")
          : t("dns_lookup.results.records_many", { n: count }, `${count} Records gefunden`),
      )
    );
    metaChips.hidden = false;

    resultsList.replaceChildren();

    if (!count) {
      resultsList.hidden = true;
      setIdleMessage("dns_lookup.results.no_records", "Keine passenden Records gefunden.");
      return;
    }

    statusNote.hidden = true;
    records.forEach((record, index) => {
      resultsList.appendChild(renderRecord(record, index));
    });
    resultsList.hidden = false;
  }

  function getErrorMessage(payload) {
    const error = String(payload?.error || "").toLowerCase();

    if (error === "invalid host") {
      return t("dns_lookup.results.invalid_host", null, "Bitte eine gültige Domain oder einen Hostnamen eingeben.");
    }

    if (error === "invalid type") {
      return t("dns_lookup.results.invalid_type", null, "Der gewählte Record-Typ wird nicht unterstützt.");
    }

    if (error === "lookup timeout") {
      return t("dns_lookup.results.timeout", null, "Der DNS-Lookup hat zu lange gebraucht. Bitte erneut versuchen.");
    }

    return t("dns_lookup.results.lookup_failed", null, "DNS-Lookup fehlgeschlagen. Bitte später erneut versuchen.");
  }

  async function runLookup() {
    if (isSubmitting) return;

    const host = escapeQueryValue(hostInput.value);
    const type = String(typeSelect.value || "A").toUpperCase();

    if (!host) {
      showError(t("dns_lookup.results.invalid_host", null, "Bitte eine gültige Domain oder einen Hostnamen eingeben."));
      return;
    }

    if (!ALLOWED_TYPES.has(type)) {
      showError(t("dns_lookup.results.invalid_type", null, "Der gewählte Record-Typ wird nicht unterstützt."));
      return;
    }

    updateUrl(host, type);
    clearError();
    resultsList.hidden = true;
    resultsList.replaceChildren();
    metaChips.hidden = true;
    metaChips.replaceChildren();
    setIdleMessage("dns_lookup.results.loading", "DNS wird abgefragt ...");
    setSubmitState(true);

    try {
      const response = await fetch(`/api/tools/dns-lookup?host=${encodeURIComponent(host)}&type=${encodeURIComponent(type)}`, {
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
        showError(getErrorMessage(payload));
        if (payload && payload.code) {
          const codeText = `${t("dns_lookup.results.code", null, "Code")}: ${String(payload.code)}`;
          const extra = document.createElement("div");
          extra.className = "dns-status-note";
          extra.textContent = codeText;
          resultsList.replaceChildren(extra);
          resultsList.hidden = false;
        } else {
          resultsList.hidden = true;
          resultsList.replaceChildren();
        }
        return;
      }

      renderResults(payload);
    } catch {
      showError(t("dns_lookup.results.lookup_failed", null, "DNS-Lookup fehlgeschlagen. Bitte später erneut versuchen."));
    } finally {
      setSubmitState(false);
    }
  }

  function syncFromUrl() {
    try {
      const url = new URL(window.location.href);
      const host = escapeQueryValue(url.searchParams.get("host"));
      const type = String(url.searchParams.get("type") || "A").toUpperCase();

      if (host) hostInput.value = host;
      if (ALLOWED_TYPES.has(type)) typeSelect.value = type;

      return host;
    } catch {
      return "";
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runLookup();
  });

  exampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const exampleHost = escapeQueryValue(button.getAttribute("data-example-host"));
      const exampleType = String(button.getAttribute("data-example-type") || "A").toUpperCase();
      hostInput.value = exampleHost;
      if (ALLOWED_TYPES.has(exampleType)) typeSelect.value = exampleType;
      runLookup();
    });
  });

  const initialHost = syncFromUrl();
  setSubmitState(false);
  setIdleMessage("dns_lookup.results.idle", "Starte einen Lookup, um deine DNS-Records zu sehen.");

  if (initialHost) {
    runLookup();
  }
})();
