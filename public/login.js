const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const verifyForm = document.getElementById("verify-form");
const modeButtons = document.querySelectorAll(".mode-btn");
const socialButtons = document.querySelectorAll(".social-btn");
const messageEl = document.getElementById("auth-message");
const verifyCodeInput = document.getElementById("verify-code");
const verifyResendButton = document.getElementById("verify-resend-btn");
const verifyBackButton = document.getElementById("verify-back-btn");
const verifyHintEl = document.getElementById("verify-hint");

const I18N = window.PMS_I18N || null;
const t = (key, vars, fallback) =>
  I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";

let pendingVerification = null;
let resendCooldownTimer = null;

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

const AUTH_MODE_LOGIN = "login";
const AUTH_MODE_REGISTER = "register";
const REGISTER_SUCCESS_REDIRECT = "/onboarding?new=1";

function setMessage(text, type = "") {
  if (!messageEl) return;
  messageEl.textContent = text || "";
  messageEl.classList.remove("error", "success");
  if (type) {
    messageEl.classList.add(type);
  }
}

function normalizeAuthMode(value) {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  return mode === AUTH_MODE_REGISTER ? AUTH_MODE_REGISTER : AUTH_MODE_LOGIN;
}

function readAuthModeFromUrl() {
  try {
    const url = new URL(window.location.href);
    return normalizeAuthMode(url.searchParams.get("mode"));
  } catch (error) {
    return AUTH_MODE_LOGIN;
  }
}

function getPostAuthRedirect(mode, payload) {
  const normalizedMode = normalizeAuthMode(mode);
  if (normalizedMode === AUTH_MODE_REGISTER) {
    return REGISTER_SUCCESS_REDIRECT;
  }

  const next = String(payload?.next || "").trim();
  return next || "/app";
}

function clearResendCooldown() {
  if (resendCooldownTimer) {
    window.clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
  }
}

function setResendButtonCooldown(seconds) {
  if (!verifyResendButton) return;
  clearResendCooldown();

  const totalSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Math.ceil(Number(seconds))) : 0;
  if (totalSeconds <= 0) {
    verifyResendButton.disabled = false;
    verifyResendButton.textContent = t("login.button.resend_code", null, "Code erneut senden");
    return;
  }

  let remaining = totalSeconds;
  verifyResendButton.disabled = true;
  verifyResendButton.textContent = t(
    "login.button.resend_code_wait",
    { seconds: remaining },
    `Code erneut senden (${remaining}s)`
  );

  resendCooldownTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearResendCooldown();
      verifyResendButton.disabled = false;
      verifyResendButton.textContent = t("login.button.resend_code", null, "Code erneut senden");
      return;
    }
    verifyResendButton.textContent = t(
      "login.button.resend_code_wait",
      { seconds: remaining },
      `Code erneut senden (${remaining}s)`
    );
  }, 1000);
}

function normalizeVerificationCode(value) {
  return String(value || "")
    .replace(/\D+/g, "")
    .trim();
}

function resetVerificationState() {
  pendingVerification = null;
  clearResendCooldown();
  if (verifyCodeInput) verifyCodeInput.value = "";
  if (verifyHintEl) {
    verifyHintEl.textContent = t(
      "login.verify.hint_default",
      null,
      "Wir haben dir einen Verifizierungscode per E-Mail gesendet."
    );
  }
  if (verifyResendButton) {
    verifyResendButton.disabled = false;
    verifyResendButton.textContent = t("login.button.resend_code", null, "Code erneut senden");
  }
}

function setSocialButtonsDisabled(disabled) {
  socialButtons.forEach((button) => {
    button.disabled = !!disabled;
  });
}

function showVerificationStep(payload, sourceMode = AUTH_MODE_LOGIN) {
  const challengeToken = String(payload?.challengeToken || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(challengeToken)) return false;

  const codeLengthRaw = Number(payload?.codeLength);
  const codeLength = Number.isFinite(codeLengthRaw) ? Math.max(4, Math.min(8, Math.round(codeLengthRaw))) : 6;
  const emailMasked = String(payload?.emailMasked || "").trim();
  const expiresInSecondsRaw = Number(payload?.expiresInSeconds);
  const expiresInSeconds = Number.isFinite(expiresInSecondsRaw) ? Math.max(1, Math.ceil(expiresInSecondsRaw)) : 0;
  const resendAfterSecondsRaw = Number(payload?.resendAfterSeconds);
  const resendAfterSeconds = Number.isFinite(resendAfterSecondsRaw) ? Math.max(0, Math.ceil(resendAfterSecondsRaw)) : 0;

  pendingVerification = {
    challengeToken,
    codeLength,
    emailMasked,
    sourceMode: normalizeAuthMode(sourceMode),
  };

  if (loginForm) loginForm.hidden = true;
  if (registerForm) registerForm.hidden = true;
  if (verifyForm) verifyForm.hidden = false;

  modeButtons.forEach((button) => {
    button.classList.remove("active");
    button.disabled = true;
  });
  setSocialButtonsDisabled(true);

  if (verifyCodeInput) {
    verifyCodeInput.value = "";
    verifyCodeInput.maxLength = codeLength;
    verifyCodeInput.focus();
  }

  if (verifyHintEl) {
    verifyHintEl.textContent = t(
      "login.verify.hint_sent",
      { email: emailMasked || "deine E-Mail", seconds: expiresInSeconds },
      `Wir haben einen Code an ${emailMasked || "deine E-Mail"} gesendet. Gültig für ${expiresInSeconds} Sekunden.`
    );
  }

  setResendButtonCooldown(resendAfterSeconds);
  return true;
}

function setMode(mode) {
  const normalizedMode = normalizeAuthMode(mode);
  const isLogin = normalizedMode === AUTH_MODE_LOGIN;

  resetVerificationState();

  modeButtons.forEach((button) => {
    button.disabled = false;
    button.classList.toggle("active", button.dataset.mode === normalizedMode);
  });

  setSocialButtonsDisabled(false);

  if (loginForm) {
    loginForm.hidden = !isLogin;
  }

  if (registerForm) {
    registerForm.hidden = isLogin;
  }

  if (verifyForm) {
    verifyForm.hidden = true;
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
      const errorCode = String(payload?.error || "").trim().toLowerCase();
      if (errorCode === "verification throttled") {
        setMessage(
          t("login.msg.verification_throttled", null, "Too many verification requests. Please try again later."),
          "error"
        );
        return;
      }

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

      if (errorCode === "invalid credentials") {
        setMessage(t("login.msg.invalid_credentials", null, "Invalid email or password."), "error");
      } else if (errorCode === "verification unavailable") {
        setMessage(
          t(
            "login.msg.verification_unavailable",
            null,
            "Verification is currently unavailable. Please try again in a few minutes."
          ),
          "error"
        );
      } else if (errorCode === "verification send failed") {
        setMessage(
          t("login.msg.verification_send_failed", null, "Verification email could not be sent. Please try again."),
          "error"
        );
      } else {
        setMessage(t("login.msg.login_failed", null, "Sign in failed."), "error");
      }
      return;
    }

    if (payload?.verifyRequired) {
      const switched = showVerificationStep(payload, AUTH_MODE_LOGIN);
      if (!switched) {
        setMessage(t("login.msg.login_failed", null, "Sign in failed."), "error");
        return;
      }
      setMessage(
        t("login.msg.verification_code_sent", null, "Verification code sent. Please check your inbox."),
        "success"
      );
      return;
    }

    setMessage(t("login.msg.login_success", null, "Signed in. Redirecting..."), "success");
    window.location.href = getPostAuthRedirect(AUTH_MODE_LOGIN, payload);
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
      const errorCode = String(payload?.error || "").trim().toLowerCase();
      if (errorCode === "verification unavailable") {
        setMessage(
          t(
            "login.msg.verification_unavailable",
            null,
            "Verification is currently unavailable. Please try again in a few minutes."
          ),
          "error"
        );
      } else if (errorCode === "verification send failed") {
        setMessage(
          t("login.msg.verification_send_failed", null, "Verification email could not be sent. Please try again."),
          "error"
        );
      } else if (errorCode === "verification throttled") {
        setMessage(
          t("login.msg.verification_throttled", null, "Too many verification requests. Please try again later."),
          "error"
        );
      } else {
        setMessage(t("login.msg.register_failed", null, "Registration failed."), "error");
      }
      return;
    }

    if (payload?.verifyRequired) {
      const switched = showVerificationStep(payload, AUTH_MODE_REGISTER);
      if (!switched) {
        setMessage(t("login.msg.register_failed", null, "Registration failed."), "error");
        return;
      }
      setMessage(
        t("login.msg.verification_code_sent", null, "Verification code sent. Please check your inbox."),
        "success"
      );
      return;
    }

    setMessage(t("login.msg.register_success", null, "Account created. Redirecting..."), "success");
    window.location.href = getPostAuthRedirect(AUTH_MODE_REGISTER, payload);
  } catch (error) {
    setMessage(t("common.connection_failed", null, "Connection failed."), "error");
  }
}

async function handleVerifySubmit(event) {
  event.preventDefault();
  const challengeToken = String(pendingVerification?.challengeToken || "").trim().toLowerCase();
  const sourceMode = normalizeAuthMode(pendingVerification?.sourceMode);
  const expectedLength = Math.max(4, Math.min(8, Number(pendingVerification?.codeLength || 6)));
  const code = normalizeVerificationCode(verifyCodeInput?.value);

  if (!/^[a-f0-9]{64}$/.test(challengeToken) || code.length !== expectedLength) {
    setMessage(
      t(
        "login.msg.invalid_verification_code",
        { length: expectedLength },
        `Please enter the ${expectedLength}-digit verification code.`
      ),
      "error"
    );
    verifyCodeInput?.focus();
    return;
  }

  setMessage(t("login.msg.verifying_code", null, "Verifying code..."));

  try {
    const { response, payload } = await postJson("/api/auth/login/verify", {
      challengeToken,
      code,
    });

    if (!response.ok || !payload?.ok) {
      const errorCode = String(payload?.error || "").trim().toLowerCase();

      if (errorCode === "invalid code") {
        const remaining = Number(payload?.remainingAttempts);
        if (Number.isFinite(remaining) && remaining >= 0) {
          setMessage(
            t(
              "login.msg.invalid_verification_code_with_remaining",
              { remaining },
              `Invalid code. Remaining attempts: ${remaining}.`
            ),
            "error"
          );
        } else {
          setMessage(
            t(
              "login.msg.invalid_verification_code",
              { length: expectedLength },
              `Please enter the ${expectedLength}-digit verification code.`
            ),
            "error"
          );
        }
        return;
      }

      if (errorCode === "challenge expired" || errorCode === "invalid challenge" || errorCode === "challenge used") {
        setMessage(
          t(
            "login.msg.verification_expired",
            null,
            "Verification expired. Please sign in again to request a new code."
          ),
          "error"
        );
        return;
      }

      if (errorCode === "challenge attempts exceeded") {
        setMessage(
          t(
            "login.msg.verification_attempts_exceeded",
            null,
            "Too many invalid codes. Please sign in again to request a new code."
          ),
          "error"
        );
        return;
      }

      setMessage(t("login.msg.verification_failed", null, "Verification failed."), "error");
      return;
    }

    setMessage(t("login.msg.login_success", null, "Signed in. Redirecting..."), "success");
    window.location.href = getPostAuthRedirect(sourceMode, payload);
  } catch (error) {
    setMessage(t("common.connection_failed", null, "Connection failed."), "error");
  }
}

async function handleVerifyResend() {
  const challengeToken = String(pendingVerification?.challengeToken || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(challengeToken)) {
    setMode("login");
    return;
  }

  setMessage(t("login.msg.resending_code", null, "Resending verification code..."));

  try {
    const { response, payload } = await postJson("/api/auth/login/verify/resend", { challengeToken });
    if (!response.ok || !payload?.ok) {
      const errorCode = String(payload?.error || "").trim().toLowerCase();

      if (errorCode === "resend cooldown") {
        const retryAfter = Number(payload?.retryAfterSeconds || response.headers.get("Retry-After") || 0);
        const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 5;
        setResendButtonCooldown(waitSeconds);
        setMessage(
          t(
            "login.msg.resend_cooldown",
            { seconds: waitSeconds },
            `Please wait ${waitSeconds} seconds before requesting a new code.`
          ),
          "error"
        );
        return;
      }

      if (errorCode === "resend limit reached") {
        setMessage(
          t("login.msg.resend_limit_reached", null, "Resend limit reached. Please sign in again."),
          "error"
        );
        return;
      }

      if (errorCode === "challenge expired" || errorCode === "invalid challenge" || errorCode === "challenge used") {
        setMessage(
          t(
            "login.msg.verification_expired",
            null,
            "Verification expired. Please sign in again to request a new code."
          ),
          "error"
        );
        return;
      }

      if (errorCode === "verification unavailable") {
        setMessage(
          t(
            "login.msg.verification_unavailable",
            null,
            "Verification is currently unavailable. Please try again in a few minutes."
          ),
          "error"
        );
        return;
      }

      setMessage(t("login.msg.verification_failed", null, "Verification failed."), "error");
      return;
    }

    const switched = showVerificationStep(payload, pendingVerification?.sourceMode || AUTH_MODE_LOGIN);
    if (!switched) {
      setMode("login");
      return;
    }
    setMessage(t("login.msg.verification_code_resent", null, "Verification code sent again."), "success");
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

if (verifyForm) {
  verifyForm.addEventListener("submit", handleVerifySubmit);
}

if (verifyResendButton) {
  verifyResendButton.addEventListener("click", () => {
    handleVerifyResend().catch(() => {
      setMessage(t("login.msg.verification_failed", null, "Verification failed."), "error");
    });
  });
}

if (verifyBackButton) {
  verifyBackButton.addEventListener("click", () => {
    setMode("login");
  });
}

setMode(readAuthModeFromUrl());
readOauthMessageFromUrl();
redirectWhenAlreadyLoggedIn();
