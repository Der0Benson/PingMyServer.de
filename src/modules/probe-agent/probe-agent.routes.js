async function handleProbeAgentRoutes(context) {
  const { method, pathname, req, res, url, handlers } = context;
  if (!pathname.startsWith("/api/probe-agent/")) return false;

  if (method === "GET" && pathname === "/api/probe-agent/jobs") {
    await handlers.handleProbeAgentJobs(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/api/probe-agent/results") {
    await handlers.handleProbeAgentResults(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/probe-agent/heartbeat") {
    await handlers.handleProbeAgentHeartbeat(req, res);
    return true;
  }

  return false;
}

module.exports = {
  handleProbeAgentRoutes,
};
