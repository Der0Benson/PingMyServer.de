"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assessProbeResult,
  calculateTrustUpdate,
  isAgentTrusted,
  observationForResult,
} = require("../src/modules/probe-agent/probe-agent-trust.service");

test("rejects structurally manipulated agent results", () => {
  assert.equal(assessProbeResult({ ok: "yes", responseMs: 10 }).reason, "invalid_ok");
  assert.equal(assessProbeResult({ ok: true, responseMs: -1 }).reason, "invalid_response_ms");
  assert.equal(assessProbeResult({ ok: true, responseMs: 10, errorMessage: "hidden" }).reason, "success_with_error");
});

test("protects signed server-report jobs from client changes", () => {
  const claims = { action: "report", reportCode: "target_blocked:private_ip" };
  assert.equal(
    assessProbeResult({ ok: false, responseMs: 0, statusCode: null, errorMessage: "target_blocked:private_ip" }, claims).valid,
    true
  );
  assert.equal(
    assessProbeResult({ ok: true, responseMs: 1, statusCode: 200 }, claims).reason,
    "report_result_mismatch"
  );
});

test("trust grows slowly and requires authoritative audits", () => {
  const now = Date.now();
  let state = { trust_score: 25, created_at: new Date(now - 2 * 86400000) };
  for (let index = 0; index < 50; index += 1) {
    const update = calculateTrustUpdate(state, { verdict: "match", reason: "authoritative_match" }, now);
    state = {
      trust_score: update.score,
      trust_state: update.trustState,
      accepted_results: update.acceptedResults,
      audited_results: update.auditedResults,
      matching_audits: update.matchingAudits,
      mismatching_audits: update.mismatchingAudits,
      suspicious_results: update.suspiciousResults,
      created_at: state.created_at,
    };
  }
  assert.equal(state.trust_state, "trusted");
  assert.equal(isAgentTrusted(state, now), true);
});

test("repeated mismatches quarantine an agent", () => {
  const now = Date.now();
  let state = { trust_score: 40, created_at: new Date(now - 2 * 86400000) };
  for (let index = 0; index < 5; index += 1) {
    const update = calculateTrustUpdate(state, { verdict: "mismatch", reason: "authoritative_mismatch" }, now);
    state = {
      ...state,
      trust_score: update.score,
      trust_state: update.trustState,
      accepted_results: update.acceptedResults,
      audited_results: update.auditedResults,
      matching_audits: update.matchingAudits,
      mismatching_audits: update.mismatchingAudits,
      suspicious_results: update.suspiciousResults,
      quarantined_until: update.quarantinedUntil,
    };
  }
  assert.equal(state.trust_state, "quarantined");
  assert.equal(isAgentTrusted(state, now), false);
});

test("reference comparison distinguishes match and mismatch", () => {
  assert.equal(observationForResult({ ok: true }, "online").verdict, "match");
  assert.equal(observationForResult({ ok: false }, "online").verdict, "mismatch");
  assert.equal(observationForResult({ ok: true }, null).verdict, "unverified");
});
