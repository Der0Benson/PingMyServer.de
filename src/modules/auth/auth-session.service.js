function createAuthSessionService(dependencies = {}) {
  const {
    parseCookies,
    sessionCookieName,
    isValidSessionToken,
    cleanupExpiredSessions,
    hashSessionToken,
    findSessionByHash,
    findUserById,
    deleteSessionById,
    clearSessionCookie,
    sendRedirect,
    sendJson,
    toTimestampMs,
    isOwnerUserId,
    countMonitorsForUser,
    accountSensitiveActionMaxSessionAgeMs,
  } = dependencies;

  async function getNextPathForUser(userId) {
    const total = await countMonitorsForUser(userId);
    return total > 0 ? "/app" : "/onboarding";
  }

  async function requireAuth(req, res, options = {}) {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[sessionCookieName];
    const rejectUnauthorized = () => {
      if (options.silent) return;
      if (options.redirectToLogin) {
        sendRedirect(res, "/login");
      } else {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
    };

    if (!isValidSessionToken(token)) {
      rejectUnauthorized();
      return null;
    }

    await cleanupExpiredSessions();

    const sessionId = hashSessionToken(token);
    const session = await findSessionByHash(sessionId);
    if (!session) {
      clearSessionCookie(res);
      rejectUnauthorized();
      return null;
    }

    const expiresAtMs = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await deleteSessionById(sessionId);
      clearSessionCookie(res);
      rejectUnauthorized();
      return null;
    }

    const user = await findUserById(session.user_id);
    if (!user) {
      await deleteSessionById(sessionId);
      clearSessionCookie(res);
      rejectUnauthorized();
      return null;
    }

    req.user = user;
    req.userId = Number(user.id);
    req.sessionId = sessionId;
    req.sessionCreatedAt = toTimestampMs(session.created_at);
    return user;
  }

  async function requireOwner(req, res, options = {}) {
    const authOptions = options?.auth || {};
    const user = await requireAuth(req, res, authOptions);
    if (!user) return null;

    if (isOwnerUserId(user.id)) {
      return user;
    }

    if (options.redirectToApp) {
      sendRedirect(res, "/app");
    } else if (!options.silent) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
    }
    return null;
  }

  function isSessionFreshEnough(req, maxAgeMs = accountSensitiveActionMaxSessionAgeMs) {
    const createdAtMs = Number(req?.sessionCreatedAt || 0);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
    return Date.now() - createdAtMs <= maxAgeMs;
  }

  return {
    getNextPathForUser,
    requireAuth,
    requireOwner,
    isSessionFreshEnough,
  };
}

module.exports = {
  createAuthSessionService,
};
