const assert = require("node:assert/strict");
const test = require("node:test");
const { createProbeJobLeaseService } = require("../src/modules/probe-agent/probe-job-lease.service");

const secret = "test-secret-with-at-least-thirty-two-bytes";

test("probe job leases bind a job to probe and monitor", () => {
  const service = createProbeJobLeaseService({ secret, defaultTtlMs: 60000, clockSkewMs: 0 });
  const issued = service.issueLease({ probeId: "community-de-1", monitorId: 42 }, 100000);
  const verified = service.verifyLease(
    issued.leaseToken,
    { probeId: "community-de-1", monitorId: 42, jobId: issued.jobId },
    120000
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.monitorId, 42);
});

test("probe job leases bind the monitor configuration version", () => {
  const service = createProbeJobLeaseService({ secret: "0123456789abcdef0123456789abcdef", defaultTtlMs: 60000 });
  const lease = service.issueLease({ probeId: "community-de", monitorId: 42, configVersion: 7 }, 1_700_000_000_000);

  assert.equal(
    service.verifyLease(lease.leaseToken, { probeId: "community-de", monitorId: 42, configVersion: 7 }, 1_700_000_001_000).ok,
    true
  );
  assert.equal(
    service.verifyLease(lease.leaseToken, { probeId: "community-de", monitorId: 42, configVersion: 8 }, 1_700_000_001_000).reason,
    "config_version_mismatch"
  );
});

test("probe job leases bind server-generated report results", () => {
  const service = createProbeJobLeaseService({ secret, defaultTtlMs: 60000, clockSkewMs: 0 });
  const lease = service.issueLease(
    { probeId: "community-de", monitorId: 42, action: "report", reportCode: "target_blocked:private_ip" },
    100000
  );
  const verified = service.verifyLease(lease.leaseToken, {}, 100001);
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.action, "report");
  assert.equal(verified.claims.reportCode, "target_blocked:private_ip");
});

test("probe job leases reject tampering, wrong probes and expired jobs", () => {
  const service = createProbeJobLeaseService({ secret, defaultTtlMs: 15000, clockSkewMs: 0 });
  const issued = service.issueLease({ probeId: "probe-a", monitorId: 7 }, 100000);
  assert.equal(service.verifyLease(`${issued.leaseToken}x`, {}, 100001).ok, false);
  assert.equal(service.verifyLease(issued.leaseToken, { probeId: "probe-b" }, 100001).reason, "probe_mismatch");
  assert.equal(service.verifyLease(issued.leaseToken, {}, 116000).reason, "expired");
});
