const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  normalizeAgentName,
  serializeAgent,
  createProbeAgentManagementController,
} = require("../src/modules/probe-agent/probe-agent-management.controller");
const { createProbeAgentController } = require("../src/modules/probe-agent/probe-agent.controller");

function timestamp(value) {
  if (value === null || value === undefined) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

test("agent names are normalized and bounded", () => {
  assert.equal(normalizeAgentName("  Docker   Celle  "), "Docker Celle");
  assert.equal(normalizeAgentName("x"), null);
  assert.equal(normalizeAgentName("x".repeat(81)), null);
});

test("agent serialization derives active and online status", () => {
  const now = Date.parse("2026-09-19T20:00:00.000Z");
  const online = serializeAgent(
    {
      probe_id: "pa_test",
      name: "Test",
      token_prefix: "pms_pa_test…",
      last_heartbeat_at: "2026-09-19T19:59:30.000Z",
      revoked_at: null,
      created_at: "2026-09-19T18:00:00.000Z",
      checks_24h: 12,
      checks_7d: 80,
      checks_30d: 320,
      active_days_30d: 8,
      summary_email_enabled: 1,
      summary_email_frequency: "monthly",
    },
    timestamp,
    now
  );
  assert.equal(online.active, true);
  assert.equal(online.online, true);
  assert.equal(online.checks30d, 320);
  assert.equal(online.summaryEmailEnabled, true);
  assert.equal(online.summaryEmailFrequency, "monthly");

  const revoked = serializeAgent(
    {
      ...online,
      probe_id: "pa_revoked",
      revoked_at: "2026-09-19T19:59:50.000Z",
      last_heartbeat_at: "2026-09-19T19:59:55.000Z",
    },
    timestamp,
    now
  );
  assert.equal(revoked.active, false);
  assert.equal(revoked.online, false);
});

test("agent creation returns the token once and stores only its hash", async () => {
  const responses = [];
  let stored = null;
  const controller = createProbeAgentManagementController({
    requireAuth: async () => ({ id: 42 }),
    sendJson: (_res, status, body) => responses.push({ status, body }),
    readJsonBody: async () => ({ name: "Docker Celle" }),
    repository: {
      createForUser: async (userId, record, limit) => {
        stored = { userId, record, limit };
      },
    },
    crypto,
    hashProbeAgentApiToken: (token) => crypto.createHash("sha256").update(token).digest("hex"),
    toTimestampMs: timestamp,
    maxActiveAgents: 5,
  });

  await controller.handleCreate({}, {});

  assert.equal(responses[0].status, 201);
  assert.match(responses[0].body.data.probeId, /^pa_[a-f0-9]{24}$/);
  assert.match(responses[0].body.data.token, /^pms_pa_[A-Za-z0-9_-]{43}$/);
  assert.equal(stored.userId, 42);
  assert.equal(stored.limit, 5);
  assert.equal(stored.record.tokenHash.length, 64);
  assert.equal(Object.hasOwn(stored.record, "token"), false);
  assert.notEqual(stored.record.tokenHash, responses[0].body.data.token);
});

test("probe endpoints await database authentication and record heartbeats", async () => {
  const responses = [];
  let heartbeatProbeId = null;
  const controller = createProbeAgentController({
    sendJson: (_res, status, body) => responses.push({ status, body }),
    authenticateProbeAgentRequest: async () => {
      await Promise.resolve();
      return { probeId: "pa_database" };
    },
    recordProbeAgentHeartbeat: async (probeId) => {
      heartbeatProbeId = probeId;
    },
  });

  await controller.handleProbeAgentHeartbeat({}, {});

  assert.equal(heartbeatProbeId, "pa_database");
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.data.probeId, "pa_database");
});

test("users can enable a weekly summary only for their own agent", async () => {
  const responses = [];
  let update = null;
  const controller = createProbeAgentManagementController({
    requireAuth: async () => ({ id: 42 }),
    sendJson: (_res, status, body) => responses.push({ status, body }),
    readJsonBody: async () => ({ enabled: true, frequency: "weekly" }),
    repository: {
      updateSummaryEmailForUser: async (userId, probeId, settings) => {
        update = { userId, probeId, settings };
        return true;
      },
    },
  });

  await controller.handleSummaryEmailUpdate({}, {}, "pa_owned");

  assert.deepEqual(update, {
    userId: 42,
    probeId: "pa_owned",
    settings: { enabled: true, frequency: "weekly" },
  });
  assert.equal(responses[0].status, 200);
});
