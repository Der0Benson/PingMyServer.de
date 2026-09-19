const assert = require("node:assert/strict");
const test = require("node:test");

const { createMonitorWriteController } = require("../src/modules/monitors/monitor-write.controller");

function createController(overrides = {}) {
  return createMonitorWriteController({
    requireAuth: async () => ({ id: 7 }),
    countMonitorsForUser: async () => 0,
    monitorsPerUserMax: 1000,
    resolveAccountEntitlements: async () => ({ tier: "free", monitorLimit: 1, minimumIntervalMs: 60000 }),
    sendJson: () => {},
    readJsonBody: async () => ({}),
    decodeBase64UrlUtf8: () => "",
    normalizeMonitorUrl: (value) => String(value || "").trim() || null,
    validateMonitorTarget: async () => ({ allowed: true }),
    normalizeTargetValidationReasonForTelemetry: (value) => value,
    runtimeTelemetry: { security: { monitorTargetBlocked: 0, monitorTargetBlockReasons: new Map() } },
    incrementCounterMap: () => {},
    getDefaultMonitorName: () => "Monitor",
    normalizeMonitorIntervalMs: (value) => Math.round(Number(value)),
    defaultMonitorIntervalMs: 60000,
    generateUniqueMonitorPublicId: async () => "abcdef",
    createMonitorForUser: async () => {},
    getMonitorByIdForUser: async () => null,
    pool: {},
    toPublicMonitorId: (value) => value,
    ...overrides,
  });
}

test("monitor creation enforces the community monitor limit", async () => {
  const responses = [];
  const controller = createController({
    countMonitorsForUser: async () => 3,
    resolveAccountEntitlements: async () => ({ tier: "community", monitorLimit: 3, minimumIntervalMs: 60000 }),
    sendJson: (_res, status, body) => responses.push({ status, body }),
  });

  await controller.handleCreateMonitor({ url: "/api/monitors" }, {});

  assert.equal(responses[0].status, 429);
  assert.equal(responses[0].body.limit, 3);
  assert.equal(responses[0].body.tier, "community");
});

test("free accounts cannot request 30-second checks through the API", async () => {
  const responses = [];
  let created = false;
  const controller = createController({
    readJsonBody: async () => ({ url: "https://example.com", intervalMs: 30000 }),
    sendJson: (_res, status, body) => responses.push({ status, body }),
    createMonitorForUser: async () => {
      created = true;
    },
  });

  await controller.handleCreateMonitor({ url: "/api/monitors" }, {});

  assert.equal(created, false);
  assert.equal(responses[0].status, 403);
  assert.equal(responses[0].body.error, "interval not available");
  assert.equal(responses[0].body.minimumIntervalMs, 60000);
});
