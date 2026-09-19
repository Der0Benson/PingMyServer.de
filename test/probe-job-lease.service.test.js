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

test("probe job leases reject tampering, wrong probes and expired jobs", () => {
  const service = createProbeJobLeaseService({ secret, defaultTtlMs: 15000, clockSkewMs: 0 });
  const issued = service.issueLease({ probeId: "probe-a", monitorId: 7 }, 100000);
  assert.equal(service.verifyLease(`${issued.leaseToken}x`, {}, 100001).ok, false);
  assert.equal(service.verifyLease(issued.leaseToken, { probeId: "probe-b" }, 100001).reason, "probe_mismatch");
  assert.equal(service.verifyLease(issued.leaseToken, {}, 116000).reason, "expired");
});
