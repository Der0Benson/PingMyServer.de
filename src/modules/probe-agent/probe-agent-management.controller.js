const DEFAULT_MAX_ACTIVE_AGENTS = 5;

function normalizeAgentName(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2 || normalized.length > 80) return null;
  return normalized;
}

function serializeAgent(row, toTimestampMs, now = Date.now()) {
  const lastHeartbeatAt = toTimestampMs(row?.last_heartbeat_at);
  const revokedAt = toTimestampMs(row?.revoked_at);
  const createdAt = toTimestampMs(row?.created_at);
  const active = !Number.isFinite(revokedAt);
  const online = active && Number.isFinite(lastHeartbeatAt) && now - lastHeartbeatAt <= 60000;
  const quarantinedUntil = toTimestampMs(row?.quarantined_until);
  const trustState = ["probation", "trusted", "quarantined"].includes(String(row?.trust_state || ""))
    ? String(row.trust_state)
    : "probation";
  const auditedResults = Math.max(0, Number(row?.audited_results || 0));
  const mismatchingAudits = Math.max(0, Number(row?.mismatching_audits || 0));

  return {
    probeId: String(row?.probe_id || ""),
    name: String(row?.name || ""),
    tokenPrefix: String(row?.token_prefix || ""),
    active,
    online,
    lastHeartbeatAt: Number.isFinite(lastHeartbeatAt) ? lastHeartbeatAt : null,
    revokedAt: Number.isFinite(revokedAt) ? revokedAt : null,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
    checks24h: Number(row?.checks_24h || 0),
    checks7d: Number(row?.checks_7d || 0),
    checks30d: Number(row?.checks_30d || 0),
    activeDays30d: Number(row?.active_days_30d || 0),
    trustScore: Math.max(0, Math.min(100, Number(row?.trust_score || 0))),
    trustState,
    trusted: trustState === "trusted" && !(Number.isFinite(quarantinedUntil) && quarantinedUntil > now),
    benefitEligible: trustState === "trusted" && online && !(Number.isFinite(quarantinedUntil) && quarantinedUntil > now),
    acceptedResults: Math.max(0, Number(row?.accepted_results || 0)),
    auditedResults,
    matchingAudits: Math.max(0, Number(row?.matching_audits || 0)),
    mismatchingAudits,
    mismatchRate: auditedResults > 0 ? mismatchingAudits / auditedResults : 0,
    suspiciousResults: Math.max(0, Number(row?.suspicious_results || 0)),
    lastTrustAuditAt: toTimestampMs(row?.last_trust_audit_at) || null,
    quarantinedUntil: Number.isFinite(quarantinedUntil) ? quarantinedUntil : null,
    quarantineReason: String(row?.quarantine_reason || "") || null,
    summaryEmailEnabled: Number(row?.summary_email_enabled || 0) === 1,
    summaryEmailFrequency: String(row?.summary_email_frequency || "weekly") === "monthly" ? "monthly" : "weekly",
  };
}

function createProbeAgentManagementController(dependencies = {}) {
  const {
    requireAuth,
    sendJson,
    readJsonBody,
    repository,
    crypto,
    hashProbeAgentApiToken,
    toTimestampMs,
    maxActiveAgents = DEFAULT_MAX_ACTIVE_AGENTS,
    logger,
  } = dependencies;

  const logError = (event, error) => {
    if (logger && typeof logger.error === "function") logger.error(event, error);
  };

  async function handleList(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const rows = await repository.listByUserId(user.id);
      sendJson(res, 200, { ok: true, data: rows.map((row) => serializeAgent(row, toTimestampMs)) });
    } catch (error) {
      logError("probe_agent_management_list_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleCreate(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body;
    try {
      body = await readJsonBody(req, 8192);
    } catch (error) {
      const statusCode = Number(error?.statusCode) === 413 ? 413 : 400;
      sendJson(res, statusCode, { ok: false, error: statusCode === 413 ? "payload too large" : "invalid input" });
      return;
    }

    const name = normalizeAgentName(body?.name);
    if (!name) {
      sendJson(res, 400, { ok: false, error: "invalid name" });
      return;
    }

    const probeId = `pa_${crypto.randomBytes(12).toString("hex")}`;
    const token = `pms_pa_${crypto.randomBytes(32).toString("base64url")}`;
    const record = {
      probeId,
      name,
      tokenHash: hashProbeAgentApiToken(token),
      tokenPrefix: `${token.slice(0, 14)}…`,
    };

    try {
      await repository.createForUser(user.id, record, maxActiveAgents);
      sendJson(res, 201, {
        ok: true,
        data: {
          probeId,
          name,
          token,
          tokenPrefix: record.tokenPrefix,
          active: true,
          online: false,
          trustScore: 25,
          trustState: "probation",
          trusted: false,
          benefitEligible: false,
          lastHeartbeatAt: null,
          revokedAt: null,
          createdAt: Date.now(),
        },
      });
    } catch (error) {
      if (error?.code === "AGENT_LIMIT") {
        sendJson(res, 409, { ok: false, error: "agent limit reached", limit: maxActiveAgents });
        return;
      }
      logError("probe_agent_management_create_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleRevoke(req, res, probeId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const revoked = await repository.revokeForUser(user.id, probeId);
      if (!revoked) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      logError("probe_agent_management_revoke_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleSummaryEmailUpdate(req, res, probeId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body;
    try {
      body = await readJsonBody(req, 8192);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    const enabled = body?.enabled;
    const frequency = String(body?.frequency || "weekly").trim().toLowerCase();
    if (typeof enabled !== "boolean" || (frequency !== "weekly" && frequency !== "monthly")) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      const updated = await repository.updateSummaryEmailForUser(user.id, probeId, { enabled, frequency });
      if (!updated) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }
      sendJson(res, 200, { ok: true, data: { enabled, frequency } });
    } catch (error) {
      logError("probe_agent_management_summary_email_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  return { handleList, handleCreate, handleRevoke, handleSummaryEmailUpdate };
}

module.exports = {
  DEFAULT_MAX_ACTIVE_AGENTS,
  normalizeAgentName,
  serializeAgent,
  createProbeAgentManagementController,
};
