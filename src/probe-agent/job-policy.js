const net = require("net");

const NON_PUBLIC_IP_BLOCKLIST = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) {
  NON_PUBLIC_IP_BLOCKLIST.addSubnet(address, prefix, "ipv4");
}
NON_PUBLIC_IP_BLOCKLIST.addAddress("::", "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addAddress("::1", "ipv6");
for (const [address, prefix] of [
  ["64:ff9b:1::", 48], ["100::", 64], ["2001:2::", 48],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) {
  NON_PUBLIC_IP_BLOCKLIST.addSubnet(address, prefix, "ipv6");
}

function normalizeIpLiteral(value) {
  let normalized = String(value || "").trim();
  if (normalized.startsWith("[") && normalized.endsWith("]")) normalized = normalized.slice(1, -1);
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) normalized = normalized.slice(0, zoneIndex);
  if (normalized.toLowerCase().startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return normalized;
}

function isPublicIpAddress(value) {
  const normalized = normalizeIpLiteral(value);
  const family = net.isIP(normalized);
  if (!family) return false;
  return !NON_PUBLIC_IP_BLOCKLIST.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function parseAllowedPorts(value) {
  const source = Array.isArray(value) ? value : String(value || "80,443").split(",");
  const ports = new Set(
    source.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 65535)
  );
  if (!ports.size) throw new TypeError("at least one probe target port must be allowed");
  return ports;
}

function validateTargetUrl(value, allowedPorts) {
  const ports = allowedPorts instanceof Set ? allowedPorts : parseAllowedPorts(allowedPorts);
  let target;
  try {
    target = new URL(String(value || ""));
  } catch (error) {
    return { ok: false, reason: "invalid_target_url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, reason: "invalid_target_protocol" };
  }
  if (target.username || target.password) return { ok: false, reason: "target_credentials_forbidden" };
  const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  if (!ports.has(port)) return { ok: false, reason: "target_port_forbidden" };
  return { ok: true, target, port };
}

function validateProbeJob(job, options = {}) {
  const now = Number(options.now ?? Date.now());
  const allowedPorts = options.allowedPorts instanceof Set ? options.allowedPorts : parseAllowedPorts(options.allowedPorts);
  const monitorId = Number(job?.monitorId);
  const jobId = String(job?.jobId || "").trim();
  const leaseToken = String(job?.leaseToken || "").trim();
  const expiresAt = Number(job?.expiresAt);
  const action = String(job?.action || "").trim();

  if (!Number.isSafeInteger(monitorId) || monitorId <= 0) return { ok: false, reason: "invalid_monitor_id" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return { ok: false, reason: "invalid_job_id" };
  }
  if (!leaseToken || leaseToken.length > 2048) return { ok: false, reason: "invalid_lease" };
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return { ok: false, reason: "expired_job" };
  if (expiresAt > now + 15 * 60 * 1000) return { ok: false, reason: "invalid_expiry" };
  if (action === "report") return { ok: true, job };
  if (action !== "http") return { ok: false, reason: "unsupported_action" };

  const targetValidation = validateTargetUrl(job?.targetUrl, allowedPorts);
  if (!targetValidation.ok) return targetValidation;
  if (!isPublicIpAddress(job?.connectAddress)) return { ok: false, reason: "public_connect_address_required" };

  return { ok: true, job };
}

module.exports = { isPublicIpAddress, normalizeIpLiteral, parseAllowedPorts, validateProbeJob, validateTargetUrl };
