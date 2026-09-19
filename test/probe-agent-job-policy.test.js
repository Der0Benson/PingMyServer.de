const assert = require("node:assert/strict");
const test = require("node:test");
const { isPublicIpAddress, parseAllowedPorts, validateProbeJob, validateTargetUrl } = require("../src/probe-agent/job-policy");

function createJob(overrides = {}) {
  return {
    monitorId: 12,
    jobId: "86ced452-b59a-4d38-9d27-236f198d23d4",
    leaseToken: "signed-token",
    expiresAt: 160000,
    action: "http",
    targetUrl: "https://example.com/health",
    connectAddress: "93.184.216.34",
    ...overrides,
  };
}

test("public address policy blocks private and documentation networks", () => {
  assert.equal(isPublicIpAddress("93.184.216.34"), true);
  assert.equal(isPublicIpAddress("127.0.0.1"), false);
  assert.equal(isPublicIpAddress("10.0.0.8"), false);
  assert.equal(isPublicIpAddress("2001:db8::1"), false);
});

test("job policy accepts a leased public HTTPS job", () => {
  const result = validateProbeJob(createJob(), { now: 100000, allowedPorts: parseAllowedPorts("80,443") });
  assert.equal(result.ok, true);
});

test("job policy blocks expired jobs, private targets and forbidden ports", () => {
  assert.equal(validateProbeJob(createJob({ expiresAt: 99999 }), { now: 100000 }).reason, "expired_job");
  assert.equal(validateProbeJob(createJob({ connectAddress: "192.168.1.10" }), { now: 100000 }).reason, "public_connect_address_required");
  assert.equal(validateProbeJob(createJob({ targetUrl: "https://example.com:9443" }), { now: 100000 }).reason, "target_port_forbidden");
});

test("target policy revalidates protocol and port after redirects", () => {
  const ports = parseAllowedPorts("80,443");
  assert.equal(validateTargetUrl("https://example.com/next", ports).ok, true);
  assert.equal(validateTargetUrl("https://example.com:8443/next", ports).reason, "target_port_forbidden");
  assert.equal(validateTargetUrl("ftp://example.com/file", ports).reason, "invalid_target_protocol");
});
