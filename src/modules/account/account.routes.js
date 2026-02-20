async function handleAccountRoutes(context) {
  const { method, pathname, req, res, handlers, utilities } = context;
  const isAccountPath = pathname === "/api/me" || pathname.startsWith("/api/account/");
  if (!isAccountPath) return false;

  if (method === "GET" && pathname === "/api/me") {
    const user = await utilities.requireAuth(req, res);
    if (!user) return true;
    const next = await utilities.getNextPathForUser(user.id);
    utilities.sendJson(res, 200, { ok: true, user: utilities.userToResponse(user), next });
    return true;
  }

  if (method === "GET" && pathname === "/api/account/sessions") {
    await handlers.handleAccountSessionsList(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/account/connections") {
    await handlers.handleAccountConnectionsList(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/account/domains") {
    await handlers.handleAccountDomainsList(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/domains") {
    await handlers.handleAccountDomainChallengeCreate(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/domains/verify") {
    await handlers.handleAccountDomainVerify(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/account/notifications") {
    await handlers.handleAccountNotificationsGet(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/account/billing") {
    await handlers.handleAccountBillingGet(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/discord") {
    await handlers.handleAccountDiscordNotificationUpsert(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/email") {
    await handlers.handleAccountEmailNotificationUpsert(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/slack") {
    await handlers.handleAccountSlackNotificationUpsert(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/webhook") {
    await handlers.handleAccountWebhookNotificationUpsert(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/billing/checkout") {
    await handlers.handleAccountBillingCheckout(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/billing/portal") {
    await handlers.handleAccountBillingPortal(req, res);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/discord") {
    await handlers.handleAccountDiscordNotificationDelete(req, res);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/email") {
    await handlers.handleAccountEmailNotificationDelete(req, res);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/slack") {
    await handlers.handleAccountSlackNotificationDelete(req, res);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/webhook") {
    await handlers.handleAccountWebhookNotificationDelete(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/discord/test") {
    await handlers.handleAccountDiscordNotificationTest(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/email/test") {
    await handlers.handleAccountEmailNotificationTest(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/slack/test") {
    await handlers.handleAccountSlackNotificationTest(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/notifications/webhook/test") {
    await handlers.handleAccountWebhookNotificationTest(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/sessions/revoke-others") {
    await handlers.handleAccountRevokeOtherSessions(req, res);
    return true;
  }

  const accountSessionMatch = pathname.match(/^\/api\/account\/sessions\/([a-f0-9]{64})\/?$/);
  if (method === "DELETE" && accountSessionMatch) {
    await handlers.handleAccountSessionRevoke(req, res, accountSessionMatch[1]);
    return true;
  }

  const accountDomainMatch = pathname.match(/^\/api\/account\/domains\/(\d+)\/?$/);
  if (method === "DELETE" && accountDomainMatch) {
    await handlers.handleAccountDomainDelete(req, res, accountDomainMatch[1]);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/password") {
    await handlers.handleAccountPasswordChange(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/account/delete") {
    await handlers.handleAccountDelete(req, res);
    return true;
  }

  return false;
}

module.exports = {
  handleAccountRoutes,
};
