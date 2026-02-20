async function handleGameAgentRoutes(context) {
  const { method, pathname, req, res, url, handlers } = context;
  if (!pathname.startsWith("/api/game-agent/")) return false;

  if (method === "GET" && pathname === "/api/game-agent/pairings") {
    await handlers.handleGameAgentPairingsList(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/api/game-agent/pairings") {
    await handlers.handleGameAgentPairingCreate(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/game-agent/sessions") {
    await handlers.handleGameAgentSessionsList(req, res, url);
    return true;
  }

  const gameAgentSessionMatch = pathname.match(/^\/api\/game-agent\/sessions\/([A-Za-z0-9]{10,64})\/?$/);
  if (method === "DELETE" && gameAgentSessionMatch) {
    await handlers.handleGameAgentSessionRevoke(req, res, gameAgentSessionMatch[1]);
    return true;
  }

  if (method === "POST" && pathname === "/api/game-agent/link") {
    await handlers.handleGameAgentLink(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/game-agent/heartbeat") {
    await handlers.handleGameAgentHeartbeat(req, res);
    return true;
  }

  if (method === "POST" && pathname === "/api/game-agent/disconnect") {
    await handlers.handleGameAgentDisconnect(req, res);
    return true;
  }

  return false;
}

module.exports = {
  handleGameAgentRoutes,
};
