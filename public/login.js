const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const modeButtons = document.querySelectorAll(".mode-btn");
const socialButtons = document.querySelectorAll(".social-btn");
const messageEl = document.getElementById("auth-message");

const OAUTH_MESSAGE_MAP = {
  discord_disabled: "Discord-Login ist aktuell deaktiviert.",
  discord_denied: "Discord-Anmeldung wurde abgebrochen.",
  discord_state: "Discord-Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  discord_code: "Discord-Anmeldung fehlgeschlagen (kein Code erhalten).",
  discord_token: "Discord-Token konnte nicht abgerufen werden.",
  discord_scope: "Discord hat den E-Mail-Scope nicht freigegeben. Bitte erneut autorisieren.",
  discord_profile: "Discord-Profil konnte nicht gelesen werden.",
  discord_email_missing: "Keine verifizierte E-Mail bei Discord gefunden.",
  discord_conflict: "Diese E-Mail ist bereits mit einem anderen Discord-Konto verknüpft.",
  discord_error: "Discord-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.",
  github_disabled: "GitHub-Login ist aktuell deaktiviert.",
  github_denied: "GitHub-Anmeldung wurde abgebrochen.",
  github_state: "GitHub-Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  github_code: "GitHub-Anmeldung fehlgeschlagen (kein Code erhalten).",
  github_token: "GitHub-Token konnte nicht abgerufen werden.",
  github_scope: "GitHub hat den E-Mail-Scope nicht freigegeben. Bitte App-Berechtigung entfernen und erneut anmelden.",
  github_email_permission:
    "GitHub App braucht die Berechtigung 'Email addresses: Read-only'. Bitte in GitHub App setzen und neu autorisieren.",
  github_profile: "GitHub-Profil konnte nicht gelesen werden.",
  github_email_missing: "Keine verifizierte E-Mail bei GitHub gefunden.",
  github_conflict: "Diese E-Mail ist bereits mit einem anderen GitHub-Konto verknüpft.",
  github_error: "GitHub-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.",
  google_disabled: "Google-Login ist aktuell deaktiviert.",
  google_denied: "Google-Anmeldung wurde abgebrochen.",
  google_state: "Google-Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  google_code: "Google-Anmeldung fehlgeschlagen (kein Code erhalten).",
  google_token: "Google-Token konnte nicht abgerufen werden.",
  google_scope: "Google hat den E-Mail-Scope nicht freigegeben. Bitte erneut autorisieren.",
  google_profile: "Google-Profil konnte nicht gelesen werden.",
  google_email_missing: "Keine verifizierte E-Mail bei Google gefunden.",
  google_conflict: "Diese E-Mail ist bereits mit einem anderen Google-Konto verknüpft.",
  google_error: "Google-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.",
};

function setMessage(text, type = "") {
  if (!messageEl) return;
  messageEl.textContent = text || "";
  messageEl.classList.remove("error", "success");
  if (type) {
    messageEl.classList.add(type);
  }
}

function setMode(mode) {
  const isLogin = mode === "login";

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  if (loginForm) {
    loginForm.hidden = !isLogin;
  }

  if (registerForm) {
    registerForm.hidden = isLogin;
  }

  setMessage("");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 72;
}

function readOauthMessageFromUrl() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch (error) {
    return;
  }

  const oauthCode = String(url.searchParams.get("oauth") || "")
    .trim()
    .toLowerCase();
  if (!oauthCode) return;

  const text = OAUTH_MESSAGE_MAP[oauthCode] || "OAuth-Anmeldung fehlgeschlagen.";
  setMessage(text, "error");

  url.searchParams.delete("oauth");
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  return { response, payload };
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("login-email")?.value);
  const password = document.getElementById("login-password")?.value || "";

  if (!isValidEmail(email) || !isValidPassword(password)) {
    setMessage("Bitte gib eine gültige E-Mail und ein Passwort mit 10-72 Zeichen ein.", "error");
    return;
  }

  setMessage("Einloggen …");

  try {
    const { response, payload } = await postJson("/api/auth/login", { email, password });
    if (!response.ok || !payload?.ok) {
      const errorText = payload?.error || "Login fehlgeschlagen";
      setMessage(errorText, "error");
      return;
    }

    setMessage("Login erfolgreich. Weiterleitung …", "success");
    window.location.href = payload.next || "/app";
  } catch (error) {
    setMessage("Verbindung fehlgeschlagen.", "error");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("register-email")?.value);
  const password = document.getElementById("register-password")?.value || "";

  if (!isValidEmail(email) || !isValidPassword(password)) {
    setMessage("Bitte gib eine gültige E-Mail und ein Passwort mit 10-72 Zeichen ein.", "error");
    return;
  }

  setMessage("Registrierung …");

  try {
    const { response, payload } = await postJson("/api/auth/register", { email, password });
    if (!response.ok || !payload?.ok) {
      const errorText = payload?.error || "Registrierung fehlgeschlagen";
      setMessage(errorText, "error");
      return;
    }

    setMessage("Konto erstellt. Weiterleitung …", "success");
    window.location.href = payload.next || "/app";
  } catch (error) {
    setMessage("Verbindung fehlgeschlagen.", "error");
  }
}

async function redirectWhenAlreadyLoggedIn() {
  try {
    const meResponse = await fetch("/api/me", { cache: "no-store" });
    if (!meResponse.ok) return;

    const mePayload = await meResponse.json();
    if (!mePayload?.ok || !mePayload.user) return;

    if (typeof mePayload.next === "string" && mePayload.next) {
      window.location.href = mePayload.next;
      return;
    }

    const monitorsResponse = await fetch("/api/monitors", { cache: "no-store" });
    if (!monitorsResponse.ok) {
      window.location.href = "/app";
      return;
    }
    const monitorsPayload = await monitorsResponse.json();
    const monitors = Array.isArray(monitorsPayload?.data) ? monitorsPayload.data : [];
    window.location.href = monitors.length ? "/app" : "/onboarding";
  } catch (error) {
    // ignore
  }
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode || "login");
  });
});

socialButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const providerLabel = String(button.dataset.provider || "Provider").trim();
    const provider = providerLabel.toLowerCase();

    if (provider === "github") {
      window.location.href = "/api/auth/github";
      return;
    }

    if (provider === "google") {
      window.location.href = "/api/auth/google";
      return;
    }

    if (provider === "discord") {
      window.location.href = "/api/auth/discord";
      return;
    }

    setMessage(`${providerLabel}-Login folgt als OAuth-Integration.`, "error");
  });
});

if (loginForm) {
  loginForm.addEventListener("submit", handleLoginSubmit);
}

if (registerForm) {
  registerForm.addEventListener("submit", handleRegisterSubmit);
}

setMode("login");
readOauthMessageFromUrl();
redirectWhenAlreadyLoggedIn();
