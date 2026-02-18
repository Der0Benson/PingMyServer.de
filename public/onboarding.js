const form = document.getElementById("onboarding-form");
const urlInput = document.getElementById("monitor-url");
const nameInput = document.getElementById("monitor-name");
const messageEl = document.getElementById("onboarding-message");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";

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
      return t(
        "onboarding.error.local_target_forbidden",
        null,
        "Local targets like localhost are not allowed for security reasons."
      );
    }
    if (reason === "private_target_forbidden" || reason.startsWith("private_target_forbidden:")) {
      return t(
        "onboarding.error.private_target_forbidden",
        null,
        "Private IP targets are not allowed. Please add the host to the private allowlist."
      );
    }
    if (reason === "mixed_target_forbidden" || reason.startsWith("mixed_target_forbidden:")) {
      return t(
        "onboarding.error.mixed_target_forbidden",
        null,
        "The domain resolves to both public and private DNS targets. Please set MONITOR_PRIVATE_TARGET_POLICY=all_private."
      );
    }
    if (reason === "invalid_protocol") {
      return t("onboarding.error.invalid_protocol", null, "Only http:// or https:// are allowed.");
    }
    if (reason === "invalid_url") {
      return t("onboarding.error.invalid_url", null, "The URL is invalid. Please check your input.");
    }
    return t("onboarding.error.target_blocked", null, "The target was blocked by the security policy.");
  }

  if (error === "invalid input") return t("onboarding.error.invalid_input", null, "Please check the URL/domain.");
  if (error === "monitor limit reached") {
    return t(
      "onboarding.error.monitor_limit_reached",
      null,
      "Monitor limit reached. Please delete old monitors or increase your limit."
    );
  }
  if (error === "internal error") {
    return t(
      "onboarding.error.internal_error",
      null,
      "Internal error while creating the monitor. Please try again later."
    );
  }
  if (error) return error;
  if (fallbackLooksLikeHtml) {
    if (normalizedFallback.includes("503 service unavailable")) {
      return t(
        "onboarding.error.backend_503",
        null,
        "Backend is currently unavailable (HTTP 503). Please restart the server service."
      );
    }
    if (normalizedFallback.includes("502 bad gateway")) {
      return t(
        "onboarding.error.proxy_502",
        null,
        "Proxy error to backend (HTTP 502). Please check the server service and Apache proxy."
      );
    }
    if (normalizedFallback.includes("400 bad request")) {
      return t(
        "onboarding.error.bad_request_400",
        null,
        "The web server rejected the request as invalid (HTTP 400)."
      );
    }
    if (normalizedFallback.includes("403 forbidden")) {
      return t("onboarding.error.forbidden_403", null, "The web server blocked the request (HTTP 403).");
    }
    if (normalizedFallback.includes("401 unauthorized")) {
      return t("onboarding.error.unauthorized_401", null, "Session is no longer valid. Please sign in again.");
    }
    return t("onboarding.error.webserver_rejected", null, "The request was rejected by the web server.");
  }
  if (fallback) return fallback;
  return t("onboarding.error.create_failed", null, "Monitor could not be created.");
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
    setMessage(t("onboarding.msg.enter_url", null, "Please enter a domain or URL."), "error");
    return;
  }

  setMessage(t("onboarding.msg.creating", null, "Creating monitor..."));

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

    setMessage(t("onboarding.msg.created_redirect", null, "Monitor created. Redirecting..."), "success");
    const monitorId = result.payload.id;
    window.location.href = monitorId ? `/app/monitors/${monitorId}` : "/app";
  } catch (error) {
    setMessage(t("common.connection_failed", null, "Connection failed."), "error");
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

