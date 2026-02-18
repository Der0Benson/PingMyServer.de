const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const modeButtons = document.querySelectorAll(".mode-btn");
const socialButtons = document.querySelectorAll(".social-btn");
const messageEl = document.getElementById("auth-message");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";

const OAUTH_MESSAGE_KEYS = {
  discord_disabled: "login.oauth.discord_disabled",
  discord_denied: "login.oauth.discord_denied",
  discord_state: "login.oauth.discord_state",
  discord_code: "login.oauth.discord_code",
  discord_token: "login.oauth.discord_token",
  discord_scope: "login.oauth.discord_scope",
  discord_profile: "login.oauth.discord_profile",
  discord_email_missing: "login.oauth.discord_email_missing",
  discord_conflict: "login.oauth.discord_conflict",
  discord_error: "login.oauth.discord_error",
  github_disabled: "login.oauth.github_disabled",
  github_denied: "login.oauth.github_denied",
  github_state: "login.oauth.github_state",
  github_code: "login.oauth.github_code",
  github_token: "login.oauth.github_token",
  github_scope: "login.oauth.github_scope",
  github_email_permission: "login.oauth.github_email_permission",
  github_profile: "login.oauth.github_profile",
  github_email_missing: "login.oauth.github_email_missing",
  github_conflict: "login.oauth.github_conflict",
  github_error: "login.oauth.github_error",
  google_disabled: "login.oauth.google_disabled",
  google_denied: "login.oauth.google_denied",
  google_state: "login.oauth.google_state",
  google_code: "login.oauth.google_code",
  google_token: "login.oauth.google_token",
  google_scope: "login.oauth.google_scope",
  google_profile: "login.oauth.google_profile",
  google_email_missing: "login.oauth.google_email_missing",
  google_conflict: "login.oauth.google_conflict",
  google_error: "login.oauth.google_error",
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

  const key = OAUTH_MESSAGE_KEYS[oauthCode] || "login.oauth.default";
  setMessage(t(key, null, "OAuth sign-in failed."), "error");

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
    setMessage(
      t(
        "login.msg.invalid_email_password",
        { min: 10, max: 72 },
        "Please enter a valid email and a password with 10-72 characters."
      ),
      "error"
    );
    return;
  }

  setMessage(t("login.msg.signing_in", null, "Signing in..."));

  try {
    const { response, payload } = await postJson("/api/auth/login", { email, password });
    if (!response.ok || !payload?.ok) {
      if (response.status === 429) {
        const retryAfterRaw = response.headers.get("Retry-After");
        const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;

        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          setMessage(
            t(
              "login.msg.too_many_attempts_retry",
              { seconds: Math.ceil(retryAfter) },
              `Too many attempts. Try again in ${Math.ceil(retryAfter)} seconds.`
            ),
            "error"
          );
          return;
        }

        setMessage(t("login.msg.too_many_attempts", null, "Too many attempts. Please try again later."), "error");
        return;
      }

      const errorCode = String(payload?.error || "").trim().toLowerCase();
      if (errorCode === "invalid credentials") {
        setMessage(t("login.msg.invalid_credentials", null, "Invalid email or password."), "error");
      } else {
        setMessage(t("login.msg.login_failed", null, "Sign in failed."), "error");
      }
      return;
    }

    setMessage(t("login.msg.login_success", null, "Signed in. Redirecting..."), "success");
    window.location.href = payload.next || "/app";
  } catch (error) {
    setMessage(t("common.connection_failed", null, "Connection failed."), "error");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("register-email")?.value);
  const password = document.getElementById("register-password")?.value || "";

  if (!isValidEmail(email) || !isValidPassword(password)) {
    setMessage(
      t(
        "login.msg.invalid_email_password",
        { min: 10, max: 72 },
        "Please enter a valid email and a password with 10-72 characters."
      ),
      "error"
    );
    return;
  }

  setMessage(t("login.msg.registering", null, "Creating account..."));

  try {
    const { response, payload } = await postJson("/api/auth/register", { email, password });
    if (!response.ok || !payload?.ok) {
      setMessage(t("login.msg.register_failed", null, "Registration failed."), "error");
      return;
    }

    setMessage(t("login.msg.register_success", null, "Account created. Redirecting..."), "success");
    window.location.href = payload.next || "/app";
  } catch (error) {
    setMessage(t("common.connection_failed", null, "Connection failed."), "error");
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

    setMessage(
      t(
        "login.msg.oauth_coming_soon",
        { provider: providerLabel },
        `${providerLabel} sign-in will be available once OAuth is enabled.`
      ),
      "error"
    );
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
