async function handleWebRoutes(context) {
  const { method, pathname, req, res, utilities } = context;

  if (method === "GET" && pathname === "/") {
    await utilities.serveStaticFile(res, "landing.html");
    return true;
  }

  if (method === "GET" && (pathname === "/login" || pathname === "/login/")) {
    await utilities.serveStaticFile(res, "login.html");
    return true;
  }

  if (
    method === "GET" &&
    (pathname === "/dns-lookup" || pathname === "/dns-lookup/" || pathname === "/tools/dns-lookup" || pathname === "/tools/dns-lookup/")
  ) {
    await utilities.serveStaticFile(res, "dns-lookup.html");
    return true;
  }

  if (
    method === "GET" &&
    (pathname === "/port-checker" || pathname === "/port-checker/" || pathname === "/tools/port-checker" || pathname === "/tools/port-checker/")
  ) {
    await utilities.serveStaticFile(res, "port-checker.html");
    return true;
  }

  if (method === "GET" && (pathname === "/onboarding" || pathname === "/onboarding/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "onboarding.html");
    return true;
  }

  if (method === "GET" && (pathname === "/app" || pathname === "/app/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "app.html");
    return true;
  }

  if (method === "GET" && (pathname === "/monitors" || pathname === "/monitors/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "monitors.html");
    return true;
  }

  if (method === "GET" && /^\/app\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/.test(pathname)) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "app.html");
    return true;
  }

  if (method === "GET" && (pathname === "/incidents" || pathname === "/incidents/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "incidents.html");
    return true;
  }

  if (method === "GET" && (pathname === "/connections" || pathname === "/connections/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "connections.html");
    return true;
  }

  if (method === "GET" && (pathname === "/notifications" || pathname === "/notifications/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "notifications.html");
    return true;
  }

  if (method === "GET" && (pathname === "/game-monitor" || pathname === "/game-monitor/")) {
    const user = await utilities.requireAuth(req, res, { redirectToLogin: true });
    if (!user) return true;
    await utilities.serveStaticFile(res, "game-monitor.html");
    return true;
  }

  if (method === "GET" && (pathname === "/owner" || pathname === "/owner/")) {
    const owner = await utilities.requireOwner(req, res, { auth: { redirectToLogin: true }, redirectToApp: true });
    if (!owner) return true;
    await utilities.serveStaticFile(res, "owner.html");
    return true;
  }

  if (method === "GET" && (pathname === "/nutzungsbedingungen" || pathname === "/nutzungsbedingungen/")) {
    await utilities.serveStaticFile(res, "nutzungsbedingungen.html");
    return true;
  }

  if (method === "GET" && (pathname === "/datenschutz" || pathname === "/datenschutz/")) {
    await utilities.serveStaticFile(res, "datenschutz.html");
    return true;
  }

  if (method === "GET" && (pathname === "/impressum" || pathname === "/impressum/")) {
    await utilities.serveStaticFile(res, "impressum.html");
    return true;
  }

  if (method === "GET" && pathname === "/robots.txt") {
    await utilities.serveStaticFile(res, "robots.txt");
    return true;
  }

  if (method === "GET" && pathname === "/sitemap.xml") {
    await utilities.serveStaticFile(res, "sitemap.xml");
    return true;
  }

  if (method === "GET" && pathname === "/site.webmanifest") {
    await utilities.serveStaticFile(res, "site.webmanifest");
    return true;
  }

  if (method === "GET" && pathname === "/index.html") {
    utilities.sendRedirect(res, "/", 301);
    return true;
  }

  if (method === "GET" && pathname.startsWith("/assets/")) {
    let filePath = "";
    try {
      filePath = decodeURIComponent(pathname.slice("/assets/".length));
    } catch (error) {
      utilities.sendJson(res, 400, { ok: false, error: "bad request" });
      return true;
    }
    await utilities.serveStaticFile(res, filePath);
    return true;
  }

  return false;
}

module.exports = {
  handleWebRoutes,
};
