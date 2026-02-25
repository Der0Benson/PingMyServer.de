function createAuthController(dependencies = {}) {
  const {
    GITHUB_AUTH_ENABLED,
    GITHUB_CLIENT_ID,
    GITHUB_CALLBACK_URL,
    GITHUB_SCOPE,
    GOOGLE_AUTH_ENABLED,
    GOOGLE_CLIENT_ID,
    GOOGLE_CALLBACK_URL,
    GOOGLE_SCOPE,
    DISCORD_AUTH_ENABLED,
    DISCORD_CLIENT_ID,
    DISCORD_CALLBACK_URL,
    DISCORD_SCOPE,
    sendRedirect,
    createOauthState,
    consumeOauthState,
    clearOauthStateCookie,
    runtimeTelemetry,
    fetchGitHubAccessToken,
    fetchGitHubUser,
    fetchGitHubEmails,
    getPreferredGitHubEmail,
    findUserByGithubId,
    linkGithubToUser,
    findUserByEmail,
    createUserFromGithub,
    clearAuthFailures,
    cleanupExpiredSessions,
    deleteSessionsByUserId,
    createSession,
    setSessionCookie,
    getNextPathForUser,
    fetchGoogleAccessToken,
    fetchGoogleUser,
    getPreferredGoogleEmail,
    findUserByGoogleSub,
    linkGoogleToUser,
    createUserFromGoogle,
    fetchDiscordAccessToken,
    fetchDiscordUser,
    getPreferredDiscordLogin,
    getPreferredDiscordEmail,
    findUserByDiscordId,
    linkDiscordToUser,
    createUserFromDiscord,
    readJsonBody,
    normalizeEmail,
    isValidEmail,
    validatePassword,
    pool,
    bcrypt,
    BCRYPT_COST,
    DUMMY_PASSWORD_HASH,
    getAuthFailure,
    isAccountLocked,
    registerAuthFailure,
    AUTH_EMAIL_VERIFICATION_ENABLED,
    isOwnerSmtpConfigured,
    cleanupExpiredAuthEmailChallenges,
    createAuthEmailChallenge,
    sendAuthEmailChallenge,
    resendAuthEmailChallenge,
    deleteAuthEmailChallengeByToken,
    AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN,
    buildAuthVerificationChallengeResponse,
    sendJson,
    findAuthEmailChallengeByToken,
    normalizeAuthEmailVerificationCode,
    hashAuthEmailVerificationCode,
    timingSafeEqualHex,
    authEmailChallengeRepository,
    AUTH_EMAIL_VERIFICATION_MAX_ATTEMPTS,
    AUTH_EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS,
    parseCookies,
    SESSION_COOKIE_NAME,
    isValidSessionToken,
    deleteSessionById,
    hashSessionToken,
    clearSessionCookie,
    requireAuth,
    runtimeLogger,
  } = dependencies;

  function isDuplicateEntryError(error) {
    return String(error?.code || "").trim() === "ER_DUP_ENTRY";
  }

  async function recoverGithubUserAfterCreateConflict(email, githubId, githubLogin) {
    const userByGithub = await findUserByGithubId(githubId);
    if (userByGithub) {
      const userId = Number(userByGithub.id);
      if (Number.isFinite(userId) && userId > 0) {
        await linkGithubToUser(userId, githubId, githubLogin);
        return { userId };
      }
    }

    const userByEmail = await findUserByEmail(email);
    if (!userByEmail) {
      return { userId: null, conflict: false };
    }

    const existingGithubId = String(userByEmail.github_id || "").trim();
    if (existingGithubId && existingGithubId !== githubId) {
      return { userId: null, conflict: true };
    }

    const userId = Number(userByEmail.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return { userId: null, conflict: false };
    }

    await linkGithubToUser(userId, githubId, githubLogin);
    return { userId, conflict: false };
  }

  async function recoverGoogleUserAfterCreateConflict(email, googleSub) {
    const userByGoogle = await findUserByGoogleSub(googleSub);
    if (userByGoogle) {
      const userId = Number(userByGoogle.id);
      if (Number.isFinite(userId) && userId > 0) {
        await linkGoogleToUser(userId, googleSub, email);
        return { userId };
      }
    }

    const userByEmail = await findUserByEmail(email);
    if (!userByEmail) {
      return { userId: null, conflict: false };
    }

    const existingGoogleSub = String(userByEmail.google_sub || "").trim();
    if (existingGoogleSub && existingGoogleSub !== googleSub) {
      return { userId: null, conflict: true };
    }

    const userId = Number(userByEmail.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return { userId: null, conflict: false };
    }

    await linkGoogleToUser(userId, googleSub, email);
    return { userId, conflict: false };
  }

  async function recoverDiscordUserAfterCreateConflict(email, discordId, discordLogin) {
    const userByDiscord = await findUserByDiscordId(discordId);
    if (userByDiscord) {
      const userId = Number(userByDiscord.id);
      if (Number.isFinite(userId) && userId > 0) {
        await linkDiscordToUser(userId, discordId, discordLogin, email);
        return { userId };
      }
    }

    const userByEmail = await findUserByEmail(email);
    if (!userByEmail) {
      return { userId: null, conflict: false };
    }

    const existingDiscordId = String(userByEmail.discord_id || "").trim();
    if (existingDiscordId && existingDiscordId !== discordId) {
      return { userId: null, conflict: true };
    }

    const userId = Number(userByEmail.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return { userId: null, conflict: false };
    }

    await linkDiscordToUser(userId, discordId, discordLogin, email);
    return { userId, conflict: false };
  }

  async function handleAuthGithubStart(req, res) {
    if (!GITHUB_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=github_disabled");
      return;
    }
  
    const state = createOauthState("github", res);
    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GITHUB_CALLBACK_URL);
    authUrl.searchParams.set("scope", GITHUB_SCOPE);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("allow_signup", "true");
  
    sendRedirect(res, authUrl.toString());
  }
  
  async function handleAuthGithubCallback(req, res, url) {
    if (!GITHUB_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=github_disabled");
      return;
    }
  
    const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
    if (oauthError) {
      clearOauthStateCookie(res);
      sendRedirect(res, "/login?oauth=github_denied");
      return;
    }
  
    const state = String(url.searchParams.get("state") || "").trim();
    const code = String(url.searchParams.get("code") || "").trim();
    const githubStateValid = consumeOauthState("github", state, req);
    clearOauthStateCookie(res);
    if (!githubStateValid) {
      runtimeTelemetry.security.oauthStateRejected += 1;
      sendRedirect(res, "/login?oauth=github_state");
      return;
    }
    if (!code) {
      sendRedirect(res, "/login?oauth=github_code");
      return;
    }
  
    const tokenResult = await fetchGitHubAccessToken(code);
    if (!tokenResult?.accessToken) {
      sendRedirect(res, "/login?oauth=github_token");
      return;
    }
    const accessToken = tokenResult.accessToken;
  
    const githubUserResult = await fetchGitHubUser(accessToken);
    const githubUser = githubUserResult?.payload || null;
    const githubId = String(githubUser?.id || "").trim();
    const githubLoginRaw = String(githubUser?.login || "").trim();
    const githubLogin = githubLoginRaw ? githubLoginRaw.slice(0, 255) : null;
    if (!githubId) {
      sendRedirect(res, "/login?oauth=github_profile");
      return;
    }
  
    const githubEmailsResult = await fetchGitHubEmails(accessToken);
    if (Number(githubEmailsResult?.statusCode) === 403) {
      sendRedirect(res, "/login?oauth=github_email_permission");
      return;
    }
    const githubEmails = Array.isArray(githubEmailsResult?.emails) ? githubEmailsResult.emails : [];
    const grantedScopes = new Set([
      ...Array.from(tokenResult.grantedScopes || []),
      ...Array.from(githubUserResult?.grantedScopes || []),
      ...Array.from(githubEmailsResult?.grantedScopes || []),
    ]);
    const email = getPreferredGitHubEmail(githubUser, githubEmails);
    if (!email) {
      if (grantedScopes.size > 0 && !grantedScopes.has("user:email")) {
        sendRedirect(res, "/login?oauth=github_scope");
        return;
      }
      sendRedirect(res, "/login?oauth=github_email_missing");
      return;
    }
  
    try {
      let userId = null;
      const userByGithub = await findUserByGithubId(githubId);
      if (userByGithub) {
        userId = Number(userByGithub.id);
        await linkGithubToUser(userId, githubId, githubLogin);
      } else {
        const userByEmail = await findUserByEmail(email);
        if (userByEmail) {
          const existingGithubId = String(userByEmail.github_id || "").trim();
          if (existingGithubId && existingGithubId !== githubId) {
            sendRedirect(res, "/login?oauth=github_conflict");
            return;
          }
          userId = Number(userByEmail.id);
          await linkGithubToUser(userId, githubId, githubLogin);
        } else {
          try {
            userId = await createUserFromGithub(email, githubId, githubLogin);
          } catch (error) {
            if (!isDuplicateEntryError(error)) {
              throw error;
            }

            const recovered = await recoverGithubUserAfterCreateConflict(email, githubId, githubLogin);
            if (recovered.conflict) {
              sendRedirect(res, "/login?oauth=github_conflict");
              return;
            }
            userId = recovered.userId;
          }
        }
      }
  
      if (!userId) {
        sendRedirect(res, "/login?oauth=github_error");
        return;
      }
  
      await clearAuthFailures(email);
      await cleanupExpiredSessions();
  
      // Session fixation protection.
      await deleteSessionsByUserId(userId);
  
      const sessionToken = await createSession(userId);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(userId);
      sendRedirect(res, next || "/app");
    } catch (error) {
      runtimeLogger.error("github_oauth_failed", error);
      sendRedirect(res, "/login?oauth=github_error");
    }
  }
  
  async function handleAuthGoogleStart(req, res) {
    if (!GOOGLE_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=google_disabled");
      return;
    }
  
    const state = createOauthState("google", res);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_CALLBACK_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_SCOPE);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "select_account");
  
    sendRedirect(res, authUrl.toString());
  }
  
  async function handleAuthGoogleCallback(req, res, url) {
    if (!GOOGLE_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=google_disabled");
      return;
    }
  
    const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
    if (oauthError) {
      clearOauthStateCookie(res);
      sendRedirect(res, "/login?oauth=google_denied");
      return;
    }
  
    const state = String(url.searchParams.get("state") || "").trim();
    const code = String(url.searchParams.get("code") || "").trim();
    const googleStateValid = consumeOauthState("google", state, req);
    clearOauthStateCookie(res);
    if (!googleStateValid) {
      runtimeTelemetry.security.oauthStateRejected += 1;
      sendRedirect(res, "/login?oauth=google_state");
      return;
    }
    if (!code) {
      sendRedirect(res, "/login?oauth=google_code");
      return;
    }
  
    const tokenResult = await fetchGoogleAccessToken(code);
    if (!tokenResult?.accessToken) {
      sendRedirect(res, "/login?oauth=google_token");
      return;
    }
  
    const googleUser = await fetchGoogleUser(tokenResult.accessToken);
    const googleSub = String(googleUser?.sub || "").trim();
    if (!googleSub) {
      sendRedirect(res, "/login?oauth=google_profile");
      return;
    }
  
    const email = getPreferredGoogleEmail(googleUser);
    if (!email) {
      if (tokenResult.grantedScopes.size > 0 && !tokenResult.grantedScopes.has("email")) {
        sendRedirect(res, "/login?oauth=google_scope");
        return;
      }
      sendRedirect(res, "/login?oauth=google_email_missing");
      return;
    }
  
    try {
      let userId = null;
      const userByGoogle = await findUserByGoogleSub(googleSub);
      if (userByGoogle) {
        userId = Number(userByGoogle.id);
        await linkGoogleToUser(userId, googleSub, email);
      } else {
        const userByEmail = await findUserByEmail(email);
        if (userByEmail) {
          const existingGoogleSub = String(userByEmail.google_sub || "").trim();
          if (existingGoogleSub && existingGoogleSub !== googleSub) {
            sendRedirect(res, "/login?oauth=google_conflict");
            return;
          }
          userId = Number(userByEmail.id);
          await linkGoogleToUser(userId, googleSub, email);
        } else {
          try {
            userId = await createUserFromGoogle(email, googleSub, email);
          } catch (error) {
            if (!isDuplicateEntryError(error)) {
              throw error;
            }

            const recovered = await recoverGoogleUserAfterCreateConflict(email, googleSub);
            if (recovered.conflict) {
              sendRedirect(res, "/login?oauth=google_conflict");
              return;
            }
            userId = recovered.userId;
          }
        }
      }
  
      if (!userId) {
        sendRedirect(res, "/login?oauth=google_error");
        return;
      }
  
      await clearAuthFailures(email);
      await cleanupExpiredSessions();
  
      // Session fixation protection.
      await deleteSessionsByUserId(userId);
  
      const sessionToken = await createSession(userId);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(userId);
      sendRedirect(res, next || "/app");
    } catch (error) {
      runtimeLogger.error("google_oauth_failed", error);
      sendRedirect(res, "/login?oauth=google_error");
    }
  }
  
  async function handleAuthDiscordStart(req, res) {
    if (!DISCORD_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=discord_disabled");
      return;
    }
  
    const state = createOauthState("discord", res);
    const authUrl = new URL("https://discord.com/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", DISCORD_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", DISCORD_CALLBACK_URL);
    authUrl.searchParams.set("scope", DISCORD_SCOPE);
    authUrl.searchParams.set("state", state);
  
    sendRedirect(res, authUrl.toString());
  }
  
  async function handleAuthDiscordCallback(req, res, url) {
    if (!DISCORD_AUTH_ENABLED) {
      sendRedirect(res, "/login?oauth=discord_disabled");
      return;
    }
  
    const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
    if (oauthError) {
      clearOauthStateCookie(res);
      sendRedirect(res, "/login?oauth=discord_denied");
      return;
    }
  
    const state = String(url.searchParams.get("state") || "").trim();
    const code = String(url.searchParams.get("code") || "").trim();
    const discordStateValid = consumeOauthState("discord", state, req);
    clearOauthStateCookie(res);
    if (!discordStateValid) {
      runtimeTelemetry.security.oauthStateRejected += 1;
      sendRedirect(res, "/login?oauth=discord_state");
      return;
    }
    if (!code) {
      sendRedirect(res, "/login?oauth=discord_code");
      return;
    }
  
    const tokenResult = await fetchDiscordAccessToken(code);
    if (!tokenResult?.accessToken) {
      sendRedirect(res, "/login?oauth=discord_token");
      return;
    }
  
    const discordUser = await fetchDiscordUser(tokenResult.accessToken);
    const discordId = String(discordUser?.id || "").trim();
    const discordLogin = getPreferredDiscordLogin(discordUser);
    if (!discordId) {
      sendRedirect(res, "/login?oauth=discord_profile");
      return;
    }
  
    const email = getPreferredDiscordEmail(discordUser);
    if (!email) {
      if (tokenResult.grantedScopes.size > 0 && !tokenResult.grantedScopes.has("email")) {
        sendRedirect(res, "/login?oauth=discord_scope");
        return;
      }
      sendRedirect(res, "/login?oauth=discord_email_missing");
      return;
    }
  
    try {
      let userId = null;
      const userByDiscord = await findUserByDiscordId(discordId);
      if (userByDiscord) {
        userId = Number(userByDiscord.id);
        await linkDiscordToUser(userId, discordId, discordLogin, email);
      } else {
        const userByEmail = await findUserByEmail(email);
        if (userByEmail) {
          const existingDiscordId = String(userByEmail.discord_id || "").trim();
          if (existingDiscordId && existingDiscordId !== discordId) {
            sendRedirect(res, "/login?oauth=discord_conflict");
            return;
          }
          userId = Number(userByEmail.id);
          await linkDiscordToUser(userId, discordId, discordLogin, email);
        } else {
          try {
            userId = await createUserFromDiscord(email, discordId, discordLogin, email);
          } catch (error) {
            if (!isDuplicateEntryError(error)) {
              throw error;
            }

            const recovered = await recoverDiscordUserAfterCreateConflict(email, discordId, discordLogin);
            if (recovered.conflict) {
              sendRedirect(res, "/login?oauth=discord_conflict");
              return;
            }
            userId = recovered.userId;
          }
        }
      }
  
      if (!userId) {
        sendRedirect(res, "/login?oauth=discord_error");
        return;
      }
  
      await clearAuthFailures(email);
      await cleanupExpiredSessions();
  
      // Session fixation protection.
      await deleteSessionsByUserId(userId);
  
      const sessionToken = await createSession(userId);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(userId);
      sendRedirect(res, next || "/app");
    } catch (error) {
      runtimeLogger.error("discord_oauth_failed", error);
      sendRedirect(res, "/login?oauth=discord_error");
    }
  }
  
  async function handleAuthRegister(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid credentials" });
      return;
    }
  
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
  
    if (!isValidEmail(email) || !validatePassword(password)) {
      sendJson(res, 400, { ok: false, error: "invalid credentials" });
      return;
    }
  
    try {
      const [existingRows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if (existingRows.length) {
        sendJson(res, 400, { ok: false, error: "invalid credentials" });
        return;
      }
  
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const [result] = await pool.query(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        [email, passwordHash]
      );
  
      await cleanupExpiredSessions();
      if (AUTH_EMAIL_VERIFICATION_ENABLED) {
        if (!isOwnerSmtpConfigured()) {
          sendJson(res, 503, { ok: false, error: "verification unavailable" });
          return;
        }
  
        await cleanupExpiredAuthEmailChallenges();
        let challenge = null;
        try {
          challenge = await createAuthEmailChallenge({
            userId: result.insertId,
            email,
            purpose: AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN,
          });
          await sendAuthEmailChallenge(challenge, {
            email,
            id: result.insertId,
            language: String(req?.headers?.["accept-language"] || "").trim(),
          });
        } catch (error) {
          if (challenge?.token) {
            await deleteAuthEmailChallengeByToken(challenge.token, AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN).catch(() => {
              // ignore cleanup errors
            });
          }
  
          if (error?.code === "too_many_challenges") {
            sendJson(
              res,
              429,
              { ok: false, error: "verification throttled" },
              { "Retry-After": "3600" }
            );
            return;
          }
  
          runtimeLogger.error("register_verification_send_failed", Number(result.insertId), error?.code || error?.message || error);
          sendJson(res, 500, { ok: false, error: "verification send failed" });
          return;
        }
  
        sendJson(res, 201, {
          ok: true,
          ...buildAuthVerificationChallengeResponse(challenge),
        });
        return;
      }
  
      const sessionToken = await createSession(result.insertId);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(result.insertId);
      sendJson(res, 201, { ok: true, next });
    } catch (error) {
      runtimeLogger.error("register_failed", error);
      sendJson(res, 500, { ok: false, error: "invalid credentials" });
    }
  }
  
  async function handleAuthLogin(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid credentials" });
      return;
    }
  
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
  
    if (!isValidEmail(email) || !validatePassword(password)) {
      sendJson(res, 400, { ok: false, error: "invalid credentials" });
      return;
    }
  
    try {
      const failure = await getAuthFailure(email);
      const [rows] = await pool.query(
        "SELECT id, email, password_hash, notify_email_language FROM users WHERE email = ? LIMIT 1",
        [email]
      );
  
      const user = rows[0] || null;
      const hashToCompare = user?.password_hash || DUMMY_PASSWORD_HASH;
      const passwordMatches = await bcrypt.compare(password, hashToCompare);
  
      if (isAccountLocked(failure)) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((new Date(failure.locked_until).getTime() - Date.now()) / 1000)
        );
        sendJson(
          res,
          429,
          { ok: false, error: "invalid credentials" },
          { "Retry-After": String(retryAfterSeconds) }
        );
        return;
      }
  
      if (!user || !passwordMatches) {
        const nextFailure = await registerAuthFailure(email, failure);
        if (nextFailure.lockedUntil) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((nextFailure.lockedUntil.getTime() - Date.now()) / 1000)
          );
          sendJson(
            res,
            429,
            { ok: false, error: "invalid credentials" },
            { "Retry-After": String(retryAfterSeconds) }
          );
          return;
        }
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
  
      await clearAuthFailures(email);
      await cleanupExpiredSessions();
  
      if (AUTH_EMAIL_VERIFICATION_ENABLED) {
        if (!isOwnerSmtpConfigured()) {
          sendJson(res, 503, { ok: false, error: "verification unavailable" });
          return;
        }
  
        await cleanupExpiredAuthEmailChallenges();
        let challenge = null;
        try {
          challenge = await createAuthEmailChallenge({
            userId: user.id,
            email: user.email,
            purpose: AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN,
          });
          await sendAuthEmailChallenge(challenge, user);
        } catch (error) {
          if (challenge?.token) {
            await deleteAuthEmailChallengeByToken(challenge.token, AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN).catch(() => {
              // ignore cleanup errors
            });
          }
  
          if (error?.code === "too_many_challenges") {
            sendJson(
              res,
              429,
              { ok: false, error: "verification throttled" },
              { "Retry-After": "3600" }
            );
            return;
          }
  
          runtimeLogger.error("auth_email_verification_send_failed", Number(user.id), error?.code || error?.message || error);
          sendJson(res, 500, { ok: false, error: "verification send failed" });
          return;
        }
  
        sendJson(res, 200, {
          ok: true,
          ...buildAuthVerificationChallengeResponse(challenge),
        });
        return;
      }
  
      // Session fixation protection.
      await deleteSessionsByUserId(user.id);
  
      const sessionToken = await createSession(user.id);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(user.id);
      sendJson(res, 200, { ok: true, next });
    } catch (error) {
      runtimeLogger.error("login_failed", error);
      sendJson(res, 500, { ok: false, error: "invalid credentials" });
    }
  }
  
  async function handleAuthLoginVerify(req, res) {
    if (!AUTH_EMAIL_VERIFICATION_ENABLED) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
  
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
  
    const challengeToken = String(body?.challengeToken || body?.challenge_token || "").trim().toLowerCase();
    const code = normalizeAuthEmailVerificationCode(body?.code);
    if (!/^[a-f0-9]{64}$/.test(challengeToken) || !code) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
  
    try {
      await cleanupExpiredAuthEmailChallenges();
      const challenge = await findAuthEmailChallengeByToken(challengeToken, AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN);
      if (!challenge) {
        sendJson(res, 404, { ok: false, error: "invalid challenge" });
        return;
      }
      if (Number(challenge.consumedAtMs || 0) > 0) {
        sendJson(res, 409, { ok: false, error: "challenge used" });
        return;
      }
      if (!Number.isFinite(Number(challenge.expiresAtMs)) || Number(challenge.expiresAtMs) <= Date.now()) {
        sendJson(res, 410, { ok: false, error: "challenge expired" });
        return;
      }
  
      const maxAttempts = Math.max(1, Number(challenge.maxAttempts || AUTH_EMAIL_VERIFICATION_MAX_ATTEMPTS));
      const attempts = Math.max(0, Number(challenge.attempts || 0));
      if (attempts >= maxAttempts) {
        sendJson(res, 429, { ok: false, error: "challenge attempts exceeded" });
        return;
      }
  
      const expectedCodeHash = String(challenge.codeHash || "").trim();
      const providedCodeHash = hashAuthEmailVerificationCode(challengeToken, code);
      if (!timingSafeEqualHex(expectedCodeHash, providedCodeHash)) {
        const didIncrement = (await authEmailChallengeRepository.incrementAuthEmailChallengeAttempts(challenge.id)) === 1;
        const nextAttempts = didIncrement ? attempts + 1 : attempts;
        const remaining = Math.max(0, maxAttempts - nextAttempts);
        const nextError = remaining > 0 ? "invalid code" : "challenge attempts exceeded";
        sendJson(res, remaining > 0 ? 401 : 429, {
          ok: false,
          error: nextError,
          remainingAttempts: remaining,
        });
        return;
      }
  
      if ((await authEmailChallengeRepository.consumeAuthEmailChallenge(challenge.id)) !== 1) {
        sendJson(res, 409, { ok: false, error: "challenge used" });
        return;
      }
  
      await cleanupExpiredSessions();
      await deleteSessionsByUserId(challenge.userId);
  
      const sessionToken = await createSession(challenge.userId);
      setSessionCookie(res, sessionToken);
  
      const next = await getNextPathForUser(challenge.userId);
      sendJson(res, 200, { ok: true, next });
    } catch (error) {
      runtimeLogger.error("auth_login_verify_failed", error?.code || error?.message || error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  async function handleAuthLoginVerifyResend(req, res) {
    if (!AUTH_EMAIL_VERIFICATION_ENABLED) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    if (!isOwnerSmtpConfigured()) {
      sendJson(res, 503, { ok: false, error: "verification unavailable" });
      return;
    }
  
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
  
    const challengeToken = String(body?.challengeToken || body?.challenge_token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(challengeToken)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
  
    try {
      await cleanupExpiredAuthEmailChallenges();
      const challenge = await findAuthEmailChallengeByToken(challengeToken, AUTH_EMAIL_VERIFICATION_PURPOSE_LOGIN);
      if (!challenge) {
        sendJson(res, 404, { ok: false, error: "invalid challenge" });
        return;
      }
      if (Number(challenge.consumedAtMs || 0) > 0) {
        sendJson(res, 409, { ok: false, error: "challenge used" });
        return;
      }
      if (!Number.isFinite(Number(challenge.expiresAtMs)) || Number(challenge.expiresAtMs) <= Date.now()) {
        sendJson(res, 410, { ok: false, error: "challenge expired" });
        return;
      }
  
      let resent;
      try {
        resent = await resendAuthEmailChallenge(challenge, challengeToken);
      } catch (error) {
        if (error?.code === "challenge_resend_wait") {
          const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds || AUTH_EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS));
          sendJson(
            res,
            429,
            { ok: false, error: "resend cooldown", retryAfterSeconds },
            { "Retry-After": String(retryAfterSeconds) }
          );
          return;
        }
        if (error?.code === "challenge_send_limit") {
          sendJson(res, 429, { ok: false, error: "resend limit reached" });
          return;
        }
        throw error;
      }
  
      await sendAuthEmailChallenge(resent, {
        email: resent.email,
        id: resent.userId,
        language: String(req?.headers?.["accept-language"] || "").trim(),
      });
  
      sendJson(res, 200, {
        ok: true,
        ...buildAuthVerificationChallengeResponse({
          ...resent,
          token: challengeToken,
        }),
      });
    } catch (error) {
      runtimeLogger.error("auth_login_verify_resend_failed", error?.code || error?.message || error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }
  
  async function handleAuthLogout(req, res) {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[SESSION_COOKIE_NAME];
  
    try {
      if (isValidSessionToken(token)) {
        await deleteSessionById(hashSessionToken(token));
      }
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      runtimeLogger.error("logout_failed", error);
      sendJson(res, 500, { ok: false, error: "invalid credentials" });
    }
  }
  
  async function handleAuthLogoutAll(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return;
  
    try {
      await deleteSessionsByUserId(user.id);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      runtimeLogger.error("logout_all_failed", error);
      sendJson(res, 500, { ok: false, error: "invalid credentials" });
    }
  }

  return {
    handleAuthGithubStart,
    handleAuthGithubCallback,
    handleAuthGoogleStart,
    handleAuthGoogleCallback,
    handleAuthDiscordStart,
    handleAuthDiscordCallback,
    handleAuthRegister,
    handleAuthLogin,
    handleAuthLoginVerify,
    handleAuthLoginVerifyResend,
    handleAuthLogout,
    handleAuthLogoutAll,
  };
}

module.exports = {
  createAuthController,
};
