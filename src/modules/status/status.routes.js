async function handleStatusRoutes(context) {
  const { method, pathname, req, res, url, utilities, constants } = context;

  if (method === "GET" && pathname === "/status/data") {
    const monitorFilter = String(url.searchParams.get("monitor") || "").trim();
    let monitor = null;
    let user = null;

    if (monitorFilter) {
      monitor = await utilities.getPublicMonitorByIdentifier(monitorFilter);
    } else {
      user = await utilities.requireAuth(req, res, { silent: true });
      if (user) {
        monitor = await utilities.getLatestMonitorForUser(user.id);
      }
      if (!monitor) {
        monitor = await utilities.getDefaultPublicMonitor();
      }
      if (!monitor && !user) {
        monitor = await utilities.getLatestPublicMonitor();
      }
    }

    if (!monitor) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }

    const metrics = await utilities.getMetricsForMonitor(monitor);
    utilities.sendJson(res, 200, { ok: true, data: metrics });
    return true;
  }

  if (method === "GET" && (pathname === "/status" || pathname === "/status/")) {
    const user = await utilities.requireAuth(req, res, { silent: true });
    if (user) {
      const userMonitor = await utilities.getLatestMonitorForUser(user.id);
      if (userMonitor) {
        const publicId = utilities.toPublicMonitorId(userMonitor);
        if (utilities.isAllowedPublicStatusIdentifier(publicId)) {
          utilities.sendRedirect(res, `/status/${encodeURIComponent(publicId)}`);
          return true;
        }
      }
    }

    const defaultMonitor = await utilities.getDefaultPublicMonitor();
    if (defaultMonitor) {
      const publicId = utilities.toPublicMonitorId(defaultMonitor);
      if (utilities.isAllowedPublicStatusIdentifier(publicId)) {
        utilities.sendRedirect(res, `/status/${encodeURIComponent(publicId)}`);
        return true;
      }
    }

    await utilities.serveStaticFile(res, "status.html");
    return true;
  }

  const publicStatusRouteRegex = constants.PUBLIC_STATUS_ALLOW_NUMERIC_ID
    ? /^\/status\/([A-Za-z0-9]{6,64}|\d+)\/?$/
    : /^\/status\/([A-Za-z0-9]{6,64})\/?$/;
  const publicStatusRouteMatch = pathname.match(publicStatusRouteRegex);
  if (method === "GET" && publicStatusRouteMatch) {
    const monitor = await utilities.getPublicMonitorByIdentifier(publicStatusRouteMatch[1]);
    if (!monitor) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }
    await utilities.serveStaticFile(res, "status.html");
    return true;
  }

  return false;
}

module.exports = {
  handleStatusRoutes,
};
