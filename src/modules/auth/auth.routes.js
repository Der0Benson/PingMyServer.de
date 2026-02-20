async function handleAuthRoutes(context) {
  const { method, pathname, req, res, url, handlers, utilities } = context;
  if (!pathname.startsWith("/api/auth/")) return false;

  if (!utilities.enforceAuthRateLimit(req, res)) return true;

  if (method === "GET" && pathname === "/api/auth/discord") {
    await handlers.handleAuthDiscordStart(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/auth/discord/callback") {
    await handlers.handleAuthDiscordCallback(req, res, url);
    return true;
  }

  if (method === "GET" && pathname === "/api/auth/github") {
    await handlers.handleAuthGithubStart(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/auth/github/callback") {
    await handlers.handleAuthGithubCallback(req, res, url);
    return true;
  }

  if (method === "GET" && pathname === "/api/auth/google") {
    await handlers.handleAuthGoogleStart(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/auth/google/callback") {
    await handlers.handleAuthGoogleCallback(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    await handlers.handleAuthRegister(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    await handlers.handleAuthLogin(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/login/verify") {
    await handlers.handleAuthLoginVerify(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/login/verify/resend") {
    await handlers.handleAuthLoginVerifyResend(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    await handlers.handleAuthLogout(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/auth/logout-all") {
    await handlers.handleAuthLogoutAll(req, res);
    return true;
  }

  utilities.sendJson(res, 404, { ok: false, error: "not found" });
  return true;
}

module.exports = {
  handleAuthRoutes,
};
