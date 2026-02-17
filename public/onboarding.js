const form = document.getElementById("onboarding-form");
const urlInput = document.getElementById("monitor-url");
const nameInput = document.getElementById("monitor-name");
const messageEl = document.getElementById("onboarding-message");

function encodeBase64UrlUtf8(input) {
  const value = String(input || "");
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function looksLikeWebserverHtmlError(status, rawText) {
  const text = String(rawText || "").toLowerCase();
  if (!text) return false;
  const htmlLike = text.includes("<html") || text.includes("<!doctype html") || text.includes("<title>");
  if (!htmlLike) return false;
  return status >= 400 && status < 600;
}

function toCreateMonitorErrorMessage(payload, fallbackText = "") {
  const error = String(payload?.error || "").trim().toLowerCase();
  const reason = String(payload?.reason || "").trim().toLowerCase();
  const fallback = String(fallbackText || "");
  const normalizedFallback = fallback.toLowerCase();
  const fallbackLooksLikeHtml =
    normalizedFallback.includes("<html") ||
    normalizedFallback.includes("<!doctype html") ||
    normalizedFallback.includes("<title>");

  if (error === "target blocked") {
    if (reason === "local_target_forbidden") {
      return "Lokale Ziele wie localhost sind aus Sicherheitsgründen nicht erlaubt.";
    }
    if (reason === "private_target_forbidden" || reason.startsWith("private_target_forbidden:")) {
      return "Private IP-Ziele sind nicht erlaubt. Bitte den Host auf die Private-Allowlist setzen.";
    }
    if (reason === "mixed_target_forbidden" || reason.startsWith("mixed_target_forbidden:")) {
      return "Domain liefert öffentliche und private DNS-Ziele. Bitte MONITOR_PRIVATE_TARGET_POLICY=all_private setzen.";
    }
    if (reason === "invalid_protocol") {
      return "Nur http:// oder https:// sind erlaubt.";
    }
    if (reason === "invalid_url") {
      return "Die URL ist ungültig. Bitte Eingabe prüfen.";
    }
    return "Ziel wurde durch die Sicherheitsrichtlinie blockiert.";
  }

  if (error === "invalid input") return "Bitte URL/Domain prüfen.";
  if (error === "monitor limit reached") return "Maximale Monitor-Anzahl erreicht. Bitte alte Monitore löschen oder Limit erhöhen.";
  if (error === "internal error") return "Interner Fehler beim Anlegen. Bitte später erneut versuchen.";
  if (error) return error;
  if (fallbackLooksLikeHtml) {
    if (normalizedFallback.includes("503 service unavailable")) {
      return "Backend derzeit nicht erreichbar (HTTP 503). Bitte Serverdienst neu starten.";
    }
    if (normalizedFallback.includes("502 bad gateway")) {
      return "Proxy-Fehler zum Backend (HTTP 502). Bitte Serverdienst und Apache-Proxy prüfen.";
    }
    if (normalizedFallback.includes("400 bad request")) {
      return "Die Anfrage wurde am Webserver als ungültig abgewiesen (HTTP 400).";
    }
    if (normalizedFallback.includes("403 forbidden")) {
      return "Die Anfrage wurde am Webserver blockiert (HTTP 403).";
    }
    if (normalizedFallback.includes("401 unauthorized")) {
      return "Sitzung nicht mehr gültig. Bitte neu anmelden.";
    }
    return "Die Anfrage wurde am Webserver abgewiesen.";
  }
  if (fallback) return fallback;
  return "Monitor konnte nicht erstellt werden.";
}

function setMessage(text, type = "") {
  if (!messageEl) return;
  messageEl.textContent = text || "";
  messageEl.classList.remove("error", "success");
  if (type) {
    messageEl.classList.add(type);
  }
}

async function readApiResponse(response) {
  const rawText = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }
  return { payload, rawText };
}

async function ensureAuthenticated() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!response.ok) return false;

    const payload = await response.json();
    if (!payload?.ok || !payload.user) {
      window.location.href = "/login";
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function redirectIfMonitorExists() {
  const createMode = new URLSearchParams(window.location.search).get("new") === "1";
  if (createMode) return;

  try {
    const response = await fetch("/api/monitors", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const monitors = Array.isArray(payload?.data) ? payload.data : [];
    if (monitors.length) {
      const firstMonitor = monitors[0];
      window.location.href = `/app/monitors/${firstMonitor.id}`;
    }
  } catch (error) {
    // ignore
  }
}

async function submitCreateRequest(encodedUrl, encodedName) {
  const response = await fetch("/api/monitors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url_b64: encodedUrl,
      name_b64: encodedName,
    }),
  });
  const parsed = await readApiResponse(response);
  return { response, ...parsed };
}

async function submitCreateQueryRequest(endpoint, encodedUrl, encodedName, options = {}) {
  const { method = "POST", headers = {} } = options;
  const params = new URLSearchParams();
  params.set("u", encodedUrl);
  if (encodedName) params.set("n", encodedName);

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method,
    headers,
  });
  const parsed = await readApiResponse(response);
  return { response, ...parsed };
}

async function submitCreatePathRequest(baseEndpoint, encodedUrl, encodedName, options = {}) {
  const { method = "POST", headers = {} } = options;
  const encodedPathUrl = encodeURIComponent(encodedUrl);
  const encodedPathName = encodedName ? `/${encodeURIComponent(encodedName)}` : "";
  const endpoint = `${baseEndpoint}/${encodedPathUrl}${encodedPathName}`;

  const response = await fetch(endpoint, {
    method,
    headers,
  });
  const parsed = await readApiResponse(response);
  return { response, ...parsed };
}

async function createMonitor(event) {
  event.preventDefault();

  const url = String(urlInput?.value || "").trim();
  const name = String(nameInput?.value || "").trim();

  if (!url) {
    setMessage("Bitte gib eine Domain oder URL ein.", "error");
    return;
  }

  setMessage("Monitor wird erstellt ...");

  try {
    const encodedUrl = encodeBase64UrlUtf8(url);
    const encodedName = name ? encodeBase64UrlUtf8(name) : "";

    let result = await submitCreateRequest(encodedUrl, encodedName);

    if (
      (!result.response.ok || !result.payload?.ok) &&
      looksLikeWebserverHtmlError(result.response.status, result.rawText)
    ) {
      const fallbackRequests = [
        { endpoint: "/api/monitor-create", method: "POST" },
        { endpoint: "/monitor-create", method: "POST" },
        { endpoint: "/api/create-monitor", method: "POST" },
        { endpoint: "/create-monitor", method: "POST" },
        { endpoint: "/api/monitors", method: "POST" },
      ];

      for (const request of fallbackRequests) {
        result = await submitCreateQueryRequest(request.endpoint, encodedUrl, encodedName, {
          method: request.method,
          headers: request.headers || {},
        });
        const stillWebserverError = looksLikeWebserverHtmlError(result.response.status, result.rawText);
        if (!stillWebserverError || result.payload?.ok) {
          break;
        }
      }

      if ((!result.response.ok || !result.payload?.ok) && looksLikeWebserverHtmlError(result.response.status, result.rawText)) {
        const pathFallbackRequests = [
          { endpoint: "/api/monitor-create", method: "POST" },
          { endpoint: "/monitor-create", method: "POST" },
          { endpoint: "/api/create-monitor", method: "POST" },
          { endpoint: "/create-monitor", method: "POST" },
        ];

        for (const request of pathFallbackRequests) {
          result = await submitCreatePathRequest(request.endpoint, encodedUrl, encodedName, {
            method: request.method,
            headers: request.headers || {},
          });
          const stillWebserverError = looksLikeWebserverHtmlError(result.response.status, result.rawText);
          if (!stillWebserverError || result.payload?.ok) {
            break;
          }
        }
      }
    }

    if (!result.response.ok || !result.payload?.ok) {
      const fallback = result.rawText && !result.payload ? result.rawText.slice(0, 180) : "";
      setMessage(toCreateMonitorErrorMessage(result.payload, fallback), "error");
      return;
    }

    setMessage("Monitor erstellt. Weiterleitung ...", "success");
    const monitorId = result.payload.id;
    window.location.href = monitorId ? `/app/monitors/${monitorId}` : "/app";
  } catch (error) {
    setMessage("Verbindung fehlgeschlagen.", "error");
  }
}

async function init() {
  const ok = await ensureAuthenticated();
  if (!ok) return;

  await redirectIfMonitorExists();

  if (form) {
    form.addEventListener("submit", createMonitor);
  }
}

init();

