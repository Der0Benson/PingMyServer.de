async function handleMonitorApiRoutes(context) {
  const { method, pathname, req, res, url, handlers, utilities, constants } = context;

  if (method === "GET" && pathname === "/api/probes") {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const probes = await utilities.listProbesForUser(user.id);
    utilities.sendJson(res, 200, { ok: true, data: probes });
    return true;
  }

  if (method === "GET" && pathname === "/api/monitors") {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const location = utilities.parseMonitorLocationParam(url.searchParams.get("location"));
    const monitors =
      location.type === "probe"
        ? await utilities.listMonitorsForUserAtProbe(user.id, location.probeId)
        : await utilities.listMonitorsForUser(user.id);
    utilities.sendJson(res, 200, { ok: true, data: monitors });
    return true;
  }

  if (method === "POST" && pathname === "/api/monitors") {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/monitor-create") {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/monitor-create") {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/create-monitor") {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/create-monitor") {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/game-monitor/minecraft/status") {
    await handlers.handleGameMonitorMinecraftStatus(req, res, url);
    return true;
  }

  const createMonitorPathMatch = pathname.match(
    /^\/(?:api\/)?(?:monitor-create|create-monitor)\/[A-Za-z0-9_-]{1,4096}(?:\/[A-Za-z0-9_-]{1,1024})?\/?$/
  );
  if (method === "POST" && createMonitorPathMatch) {
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  const isLegacyCreateGetRoute =
    method === "GET" &&
    (pathname === "/api/monitor-create" ||
      pathname === "/monitor-create" ||
      pathname === "/api/create-monitor" ||
      pathname === "/create-monitor" ||
      !!createMonitorPathMatch);
  if (isLegacyCreateGetRoute) {
    if (!constants.MONITOR_CREATE_GET_ENABLED) {
      utilities.sendJson(res, 405, { ok: false, error: "method not allowed" });
      return true;
    }

    const hasCreateMarker = utilities.hasMonitorCreateRequestHeader(req);
    const sameOrigin = utilities.isValidOrigin(req);
    if (!hasCreateMarker && !sameOrigin) {
      utilities.sendJson(res, 403, { ok: false, error: "forbidden" });
      return true;
    }
    await handlers.handleCreateMonitor(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/incidents") {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const incidents = await utilities.getIncidentsForUser(user.id, {
      monitor: url.searchParams.get("monitor") || "all",
      sort: url.searchParams.get("sort") || "start",
      order: url.searchParams.get("order") || "desc",
      lookbackDays: Number(url.searchParams.get("lookbackDays") || constants.INCIDENT_LOOKBACK_DAYS),
      limit: Number(url.searchParams.get("limit") || 200),
    });

    utilities.sendJson(res, 200, { ok: true, data: incidents });
    return true;
  }

  const monitorMetricsMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/metrics\/?$/);
  if (method === "GET" && monitorMetricsMatch) {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const monitorId = monitorMetricsMatch[1];
    const monitor = await utilities.getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }

    const location = utilities.parseMonitorLocationParam(url.searchParams.get("location"));
    const metrics = await utilities.getMetricsForMonitorAtLocation(monitor, location);
    utilities.sendJson(res, 200, { ok: true, data: metrics });
    return true;
  }

  const monitorFaviconMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/favicon\/?$/);
  if (method === "GET" && monitorFaviconMatch) {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const monitorId = monitorFaviconMatch[1];
    const monitor = await utilities.getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }

    await handlers.handleMonitorFavicon(req, res, monitor);
    return true;
  }

  const monitorAssertionsMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/assertions\/?$/);
  if (monitorAssertionsMatch) {
    const monitorId = monitorAssertionsMatch[1];
    if (method === "GET") {
      await handlers.handleMonitorHttpAssertionsGet(req, res, monitorId);
      return true;
    }
    if (method === "PUT" || method === "PATCH") {
      await handlers.handleMonitorHttpAssertionsUpdate(req, res, monitorId);
      return true;
    }
  }

  const monitorIntervalMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/interval\/?$/);
  if (monitorIntervalMatch) {
    const monitorId = monitorIntervalMatch[1];
    if (method === "PUT" || method === "PATCH") {
      await handlers.handleMonitorIntervalUpdate(req, res, monitorId);
      return true;
    }
  }

  const monitorEmailNotificationsMatch = pathname.match(
    /^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/email-notifications\/?$/
  );
  if (monitorEmailNotificationsMatch) {
    const monitorId = monitorEmailNotificationsMatch[1];
    if (method === "PUT" || method === "PATCH") {
      await handlers.handleMonitorEmailNotificationUpdate(req, res, monitorId);
      return true;
    }
  }

  const monitorSloMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/slo\/?$/);
  if (monitorSloMatch) {
    const monitorId = monitorSloMatch[1];
    if (method === "GET") {
      await handlers.handleMonitorSloGet(req, res, monitorId);
      return true;
    }
    if (method === "PUT" || method === "PATCH") {
      await handlers.handleMonitorSloUpdate(req, res, monitorId);
      return true;
    }
  }

  const monitorMaintenancesMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/maintenances\/?$/);
  if (monitorMaintenancesMatch) {
    const monitorId = monitorMaintenancesMatch[1];
    if (method === "GET") {
      await handlers.handleMonitorMaintenancesList(req, res, monitorId);
      return true;
    }
    if (method === "POST") {
      await handlers.handleMonitorMaintenanceCreate(req, res, monitorId);
      return true;
    }
  }

  const monitorMaintenanceCancelMatch = pathname.match(
    /^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/maintenances\/(\d+)\/cancel\/?$/
  );
  if (method === "POST" && monitorMaintenanceCancelMatch) {
    await handlers.handleMonitorMaintenanceCancel(req, res, monitorMaintenanceCancelMatch[1], monitorMaintenanceCancelMatch[2]);
    return true;
  }

  const monitorDetailMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/);
  if (method === "DELETE" && monitorDetailMatch) {
    await handlers.handleDeleteMonitor(req, res, monitorDetailMatch[1]);
    return true;
  }

  if (method === "GET" && monitorDetailMatch) {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const monitorId = monitorDetailMatch[1];
    const monitor = await utilities.getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }

    utilities.sendJson(res, 200, {
      ok: true,
      data: utilities.serializeMonitorRow(monitor),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/metrics") {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;

    const monitors = await utilities.listMonitorsForUser(user.id);
    if (!monitors.length) {
      utilities.sendJson(res, 404, { ok: false, error: "not found" });
      return true;
    }

    const monitor = await utilities.getMonitorByIdForUser(user.id, monitors[0].id);
    const metrics = await utilities.getMetricsForMonitor(monitor);
    utilities.sendJson(res, 200, { ok: true, data: metrics });
    return true;
  }

  return false;
}

module.exports = {
  handleMonitorApiRoutes,
};
