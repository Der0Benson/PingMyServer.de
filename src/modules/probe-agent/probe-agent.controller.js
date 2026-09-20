function createProbeAgentController(dependencies = {}) {
  const {
    sendJson,
    readJsonBody,
    authenticateProbeAgentRequest,
    getProbeAgentJobs,
    persistProbeAgentResults,
    recordProbeAgentHeartbeat,
    probeAgentPayloadMaxBytes = 262144,
    probeAgentDefaultBatchLimit = 10,
    probeAgentMaxBatchLimit = 50,
    logger,
  } = dependencies;

  const logError = (event, error) => {
    if (logger && typeof logger.error === "function") {
      logger.error(event, error);
      return;
    }
    console.error(event, error);
  };

  function clampBatchLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return probeAgentDefaultBatchLimit;

    const rounded = Math.trunc(numeric);
    if (rounded < 1) return 1;
    if (rounded > probeAgentMaxBatchLimit) return probeAgentMaxBatchLimit;
    return rounded;
  }

  async function requireProbeAgent(req, res) {
    const agent = typeof authenticateProbeAgentRequest === "function" ? await authenticateProbeAgentRequest(req) : null;
    if (agent && agent.probeId) return agent;

    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return null;
  }

  async function handleProbeAgentJobs(req, res, url) {
    const agent = await requireProbeAgent(req, res);
    if (!agent) return;

    const limit = clampBatchLimit(url?.searchParams?.get("limit"));

    try {
      const quarantineUntilMs = new Date(agent.quarantinedUntil || 0).getTime();
      const quarantined = agent.trustState === "quarantined" && quarantineUntilMs > Date.now();
      const jobs = quarantined ? [] : await getProbeAgentJobs(agent.probeId, limit);
      sendJson(res, 200, {
        ok: true,
        data: {
          probeId: agent.probeId,
          jobs,
          trust: {
            score: Number(agent.trustScore || 0),
            state: String(agent.trustState || "probation"),
            quarantinedUntil: Number.isFinite(quarantineUntilMs) && quarantineUntilMs > 0 ? quarantineUntilMs : null,
          },
        },
      });
    } catch (error) {
      logError("probe_agent_jobs_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleProbeAgentResults(req, res) {
    const agent = await requireProbeAgent(req, res);
    if (!agent) return;

    let body = {};
    try {
      body = await readJsonBody(req, probeAgentPayloadMaxBytes);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 400);
      sendJson(res, statusCode, { ok: false, error: statusCode === 413 ? "payload too large" : "invalid input" });
      return;
    }

    const results = Array.isArray(body?.results) ? body.results : [];

    try {
      const summary = await persistProbeAgentResults(agent.probeId, results);
      sendJson(res, 200, {
        ok: true,
        data: {
          probeId: agent.probeId,
          ...summary,
        },
      });
    } catch (error) {
      logError("probe_agent_results_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleProbeAgentHeartbeat(req, res) {
    const agent = await requireProbeAgent(req, res);
    if (!agent) return;

    try {
      if (typeof recordProbeAgentHeartbeat === "function") {
        await recordProbeAgentHeartbeat(agent.probeId);
      }
      sendJson(res, 200, {
        ok: true,
        data: {
          probeId: agent.probeId,
          serverTime: Date.now(),
          trust: {
            score: Number(agent.trustScore || 0),
            state: String(agent.trustState || "probation"),
            quarantinedUntil: agent.quarantinedUntil || null,
          },
        },
      });
    } catch (error) {
      logError("probe_agent_heartbeat_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  return {
    handleProbeAgentJobs,
    handleProbeAgentResults,
    handleProbeAgentHeartbeat,
  };
}

module.exports = {
  createProbeAgentController,
};
