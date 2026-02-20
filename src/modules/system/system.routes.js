async function handleSystemRoutes(context) {
  const { method, pathname, req, res, url, handlers, utilities } = context;

  if (method === "GET" && pathname === "/favicon.ico") {
    await utilities.serveStaticFile(res, "pingmyserverlogo.png");
    return true;
  }

  if (method === "GET" && pathname === "/api/health") {
    utilities.sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/stripe/webhook") {
    await handlers.handleStripeWebhook(req, res);
    return true;
  }

  if ((method === "GET" || method === "POST") && pathname === "/api/account/notifications/email/unsubscribe") {
    await handlers.handleAccountEmailNotificationUnsubscribe(req, res, url);
    return true;
  }

  return false;
}

module.exports = {
  handleSystemRoutes,
};
