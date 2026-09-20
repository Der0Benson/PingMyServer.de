"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

const TRUST_POLICY = Object.freeze({
  initialScore: 25,
  trustedScore: 70,
  trustedAudits: 50,
  trustedMinimumAgeMs: DAY_MS,
  maximumTrustedMismatchRate: 0.1,
  quarantineScore: 10,
  quarantineMinimumAudits: 8,
  quarantineMismatchCount: 5,
  quarantineMismatchRate: 0.5,
  quarantineSuspiciousCount: 3,
  quarantineDurationMs: DAY_MS,
  matchDelta: 1,
  mismatchDelta: -7,
  suspiciousDelta: -12,
});

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.trunc(Number(value) || 0)));
}

function normalizeTrustState(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["probation", "trusted", "quarantined"].includes(normalized) ? normalized : "probation";
}

function assessProbeResult(payload, claims = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, reason: "invalid_payload" };
  }
  if (typeof payload.ok !== "boolean") {
    return { valid: false, reason: "invalid_ok" };
  }

  const responseMs = Number(payload.responseMs ?? payload.elapsedMs);
  if (!Number.isFinite(responseMs) || responseMs < 0 || responseMs > 600000) {
    return { valid: false, reason: "invalid_response_ms" };
  }

  let statusCode = null;
  if (payload.statusCode !== null && payload.statusCode !== undefined && payload.statusCode !== "") {
    statusCode = Number(payload.statusCode);
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      return { valid: false, reason: "invalid_status_code" };
    }
  }

  const errorMessage = String(payload.errorMessage || "").trim().slice(0, 255) || null;
  if (payload.ok && errorMessage) {
    return { valid: false, reason: "success_with_error" };
  }

  const action = String(claims.action || "http").trim().toLowerCase();
  if (action === "report") {
    const expectedCode = String(claims.reportCode || "").trim();
    if (payload.ok || statusCode !== null || Math.round(responseMs) !== 0 || errorMessage !== expectedCode) {
      return { valid: false, reason: "report_result_mismatch" };
    }
  }

  return {
    valid: true,
    reason: "valid",
    result: {
      ok: payload.ok,
      responseMs: Math.round(responseMs),
      statusCode,
      errorMessage,
    },
  };
}

function observationForResult(result, referenceStatus) {
  if (!result) return { verdict: "suspicious", reason: "invalid_result" };
  const reference = String(referenceStatus || "").trim().toLowerCase();
  if (reference !== "online" && reference !== "offline") {
    return { verdict: "unverified", reason: "no_authoritative_reference" };
  }
  const reported = result.ok ? "online" : "offline";
  return reported === reference
    ? { verdict: "match", reason: "authoritative_match" }
    : { verdict: "mismatch", reason: "authoritative_mismatch" };
}

function calculateTrustUpdate(current = {}, observation = {}, now = Date.now()) {
  const verdict = String(observation.verdict || "unverified");
  const acceptedResults = Math.max(0, Number(current.accepted_results || 0)) + (verdict === "suspicious" ? 0 : 1);
  const auditedResults = Math.max(0, Number(current.audited_results || 0)) + (verdict === "match" || verdict === "mismatch" ? 1 : 0);
  const matchingAudits = Math.max(0, Number(current.matching_audits || 0)) + (verdict === "match" ? 1 : 0);
  const mismatchingAudits = Math.max(0, Number(current.mismatching_audits || 0)) + (verdict === "mismatch" ? 1 : 0);
  const suspiciousResults = Math.max(0, Number(current.suspicious_results || 0)) + (verdict === "suspicious" ? 1 : 0);
  const delta = verdict === "match"
    ? TRUST_POLICY.matchDelta
    : verdict === "mismatch"
      ? TRUST_POLICY.mismatchDelta
      : verdict === "suspicious"
        ? TRUST_POLICY.suspiciousDelta
        : 0;
  const currentScore = current.trust_score === null || current.trust_score === undefined
    ? TRUST_POLICY.initialScore
    : Number(current.trust_score);
  const score = clampScore(currentScore + delta);
  const mismatchRate = auditedResults > 0 ? mismatchingAudits / auditedResults : 0;
  const createdAtMs = new Date(current.created_at || 0).getTime();
  const oldQuarantineUntilMs = new Date(current.quarantined_until || 0).getTime();

  const adverseVerdict = verdict === "mismatch" || verdict === "suspicious";
  const shouldQuarantine =
    (verdict === "suspicious" && suspiciousResults >= TRUST_POLICY.quarantineSuspiciousCount) ||
    (adverseVerdict && auditedResults >= TRUST_POLICY.quarantineMinimumAudits && score <= TRUST_POLICY.quarantineScore) ||
    (verdict === "mismatch" && mismatchingAudits >= TRUST_POLICY.quarantineMismatchCount && mismatchRate >= TRUST_POLICY.quarantineMismatchRate);

  let trustState = "probation";
  let quarantinedUntil = null;
  let quarantineReason = null;
  if (shouldQuarantine) {
    trustState = "quarantined";
    quarantinedUntil = new Date(now + TRUST_POLICY.quarantineDurationMs);
    quarantineReason = String(observation.reason || verdict).slice(0, 128);
  } else if (normalizeTrustState(current.trust_state) === "quarantined" && oldQuarantineUntilMs > now) {
    trustState = "quarantined";
    quarantinedUntil = new Date(oldQuarantineUntilMs);
    quarantineReason = String(current.quarantine_reason || "automatic_quarantine").slice(0, 128);
  } else if (
    score >= TRUST_POLICY.trustedScore &&
    auditedResults >= TRUST_POLICY.trustedAudits &&
    mismatchRate <= TRUST_POLICY.maximumTrustedMismatchRate &&
    Number.isFinite(createdAtMs) && now - createdAtMs >= TRUST_POLICY.trustedMinimumAgeMs
  ) {
    trustState = "trusted";
  }

  return {
    score,
    trustState,
    delta,
    acceptedResults,
    auditedResults,
    matchingAudits,
    mismatchingAudits,
    suspiciousResults,
    mismatchRate,
    quarantinedUntil,
    quarantineReason,
    benefitEligible: trustState === "trusted",
  };
}

function isAgentTrusted(agent, now = Date.now()) {
  const state = normalizeTrustState(agent?.trust_state ?? agent?.trustState);
  const score = Number((agent?.trust_score ?? agent?.trustScore) || 0);
  const quarantineUntilMs = new Date((agent?.quarantined_until ?? agent?.quarantinedUntil) || 0).getTime();
  return state === "trusted" && score >= TRUST_POLICY.trustedScore && !(quarantineUntilMs > now);
}

module.exports = {
  TRUST_POLICY,
  assessProbeResult,
  calculateTrustUpdate,
  clampScore,
  isAgentTrusted,
  normalizeTrustState,
  observationForResult,
};
