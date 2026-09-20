const crypto = require("crypto");

const TOKEN_VERSION = 1;

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeProbeId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : "";
}

function normalizeMonitorId(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function createProbeJobLeaseService(options = {}) {
  const secret = String(options.secret || "");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("probe job lease secret must contain at least 32 bytes");
  }

  const defaultTtlCandidate = options.defaultTtlMs === undefined ? 120 * 1000 : Number(options.defaultTtlMs);
  const clockSkewCandidate = options.clockSkewMs === undefined ? 10 * 1000 : Number(options.clockSkewMs);
  if (!Number.isFinite(defaultTtlCandidate) || !Number.isFinite(clockSkewCandidate)) {
    throw new TypeError("invalid probe job lease timing options");
  }
  const defaultTtlMs = Math.min(10 * 60 * 1000, Math.max(15 * 1000, defaultTtlCandidate));
  const clockSkewMs = Math.min(60 * 1000, Math.max(0, clockSkewCandidate));

  function sign(encodedPayload) {
    return crypto.createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
  }

  function issueLease(input = {}, now = Date.now()) {
    const probeId = normalizeProbeId(input.probeId);
    const monitorId = normalizeMonitorId(input.monitorId);
    const configVersion = Math.max(1, Math.trunc(Number(input.configVersion) || 1));
    const action = String(input.action || "http").trim().toLowerCase() === "report" ? "report" : "http";
    const reportCode = action === "report" ? String(input.reportCode || "").trim().slice(0, 255) : "";
    if (!probeId || !monitorId) throw new TypeError("invalid probe job lease claims");

    const issuedAt = Math.trunc(Number(now));
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new TypeError("invalid probe job lease timestamp");
    const expiresAt = issuedAt + defaultTtlMs;
    const claims = {
      v: TOKEN_VERSION,
      j: crypto.randomUUID(),
      p: probeId,
      m: monitorId,
      c: configVersion,
      a: action,
      ...(reportCode ? { r: reportCode } : {}),
      iat: issuedAt,
      exp: expiresAt,
    };
    const encodedPayload = encodeJson(claims);
    return {
      jobId: claims.j,
      expiresAt,
      leaseToken: `${encodedPayload}.${sign(encodedPayload)}`,
    };
  }

  function verifyLease(token, expected = {}, now = Date.now()) {
    const raw = String(token || "");
    const parts = raw.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1] || !safeEqual(sign(parts[0]), parts[1])) {
      return { ok: false, reason: "invalid_signature" };
    }

    let claims;
    try {
      claims = decodeJson(parts[0]);
    } catch (error) {
      return { ok: false, reason: "invalid_payload" };
    }

    const probeId = normalizeProbeId(claims?.p);
    const monitorId = normalizeMonitorId(claims?.m);
    const configVersion = Math.max(1, Math.trunc(Number(claims?.c) || 1));
    const action = String(claims?.a || "http").trim().toLowerCase() === "report" ? "report" : "http";
    const reportCode = action === "report" ? String(claims?.r || "").trim().slice(0, 255) : "";
    const jobId = String(claims?.j || "");
    const issuedAt = Number(claims?.iat);
    const expiresAt = Number(claims?.exp);
    if (
      claims?.v !== TOKEN_VERSION ||
      !probeId ||
      !monitorId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId) ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt
    ) {
      return { ok: false, reason: "invalid_claims" };
    }

    const timestamp = Number(now);
    if (!Number.isFinite(timestamp)) return { ok: false, reason: "invalid_time" };
    if (issuedAt > timestamp + clockSkewMs) return { ok: false, reason: "not_yet_valid" };
    if (expiresAt < timestamp - clockSkewMs) return { ok: false, reason: "expired" };
    if (expected.probeId && probeId !== normalizeProbeId(expected.probeId)) {
      return { ok: false, reason: "probe_mismatch" };
    }
    if (expected.monitorId && monitorId !== normalizeMonitorId(expected.monitorId)) {
      return { ok: false, reason: "monitor_mismatch" };
    }
    if (expected.jobId && jobId !== String(expected.jobId)) {
      return { ok: false, reason: "job_mismatch" };
    }
    if (expected.configVersion && configVersion !== Math.max(1, Math.trunc(Number(expected.configVersion)))) {
      return { ok: false, reason: "config_version_mismatch" };
    }

    return { ok: true, claims: { jobId, probeId, monitorId, configVersion, action, reportCode, issuedAt, expiresAt } };
  }

  return { issueLease, verifyLease };
}

module.exports = { createProbeJobLeaseService };
