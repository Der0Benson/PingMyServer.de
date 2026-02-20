async function handleOwnerRoutes(context) {
  const { method, pathname, req, res, url, handlers } = context;
  if (!pathname.startsWith("/api/owner/")) return false;

  if (method === "GET" && pathname === "/api/owner/overview") {
    await handlers.handleOwnerOverview(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/owner/monitors") {
    await handlers.handleOwnerMonitors(req, res, url);
    return true;
  }

  if (method === "GET" && pathname === "/api/owner/security") {
    await handlers.handleOwnerSecurity(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/owner/db-storage") {
    await handlers.handleOwnerDbStorage(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/api/owner/email-test") {
    await handlers.handleOwnerEmailTest(req, res);
    return true;
  }

  return false;
}

module.exports = {
  handleOwnerRoutes,
};
