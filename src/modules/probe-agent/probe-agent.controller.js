function createProbeAgentController(dependencies = {}) {
  const {
    sendJson,
    readJsonBody,
    authenticateProbeAgentRequest,
    getProbeAgentJobs,
    persistProbeAgentResults,
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

  function requireProbeAgent(req, res) {
    const agent = typeof authenticateProbeAgentRequest === "function" ? authenticateProbeAgentRequest(req) : null;
    if (agent && agent.probeId) return agent;

    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return null;
  }

  async function handleProbeAgentJobs(req, res, url) {
    const agent = requireProbeAgent(req, res);
    if (!agent) return;

    const limit = clampBatchLimit(url?.searchParams?.get("limit"));

    try {
      const jobs = await getProbeAgentJobs(agent.probeId, limit);
      sendJson(res, 200, {
        ok: true,
        data: {
          probeId: agent.probeId,
          jobs,
        },
      });
    } catch (error) {
      logError("probe_agent_jobs_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleProbeAgentResults(req, res) {
    const agent = requireProbeAgent(req, res);
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
    const agent = requireProbeAgent(req, res);
    if (!agent) return;

    sendJson(res, 200, {
      ok: true,
      data: {
        probeId: agent.probeId,
        serverTime: Date.now(),
      },
    });
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
