const dns = require("dns").promises;
const net = require("net");
const { domainToASCII } = require("url");

const DNS_LOOKUP_ALLOWED_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "NS", "SOA", "SRV", "TXT"]);
const DNS_LOOKUP_TIMEOUT_MS = 4000;

function withDnsLookupTimeout(task, timeoutMs = DNS_LOOKUP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("dns_lookup_timeout");
      error.code = "ETIMEOUT";
      reject(error);
    }, timeoutMs);

    Promise.resolve()
      .then(task)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

function normalizeDnsLookupType(value) {
  const normalized = String(value || "A")
    .trim()
    .toUpperCase();
  if (!DNS_LOOKUP_ALLOWED_TYPES.has(normalized)) return null;
  return normalized;
}

function normalizeDnsLookupHost(value) {
  let raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.includes("://")) {
    try {
      raw = new URL(raw).hostname || "";
    } catch {
      return null;
    }
  }

  raw = raw.replace(/\.+$/, "").trim();
  if (!raw) return null;
  if (raw.length > 253) return null;
  if (net.isIP(raw)) return null;

  const ascii = domainToASCII(raw);
  if (!ascii) return null;

  const normalized = ascii.toLowerCase();
  const labels = normalized.split(".");
  if (labels.length < 2) return null;

  for (const label of labels) {
    if (!label || label.length > 63) return null;
    if (!/^[a-z0-9_-]+$/.test(label)) return null;
    if (label.startsWith("-") || label.endsWith("-")) return null;
  }

  return normalized;
}

function formatDnsRecords(type, records) {
  if (!Array.isArray(records)) return [];

  if (type === "TXT") {
    return records.map((entry) => {
      const chunks = Array.isArray(entry) ? entry.map((part) => String(part)) : [String(entry)];
      return {
        value: chunks.join(""),
        chunks,
      };
    });
  }

  if (type === "MX") {
    return records.map((entry) => ({
      priority: Number(entry?.priority) || 0,
      exchange: String(entry?.exchange || ""),
    }));
  }

  if (type === "SRV") {
    return records.map((entry) => ({
      priority: Number(entry?.priority) || 0,
      weight: Number(entry?.weight) || 0,
      port: Number(entry?.port) || 0,
      name: String(entry?.name || ""),
    }));
  }

  if (type === "SOA") {
    return records.map((entry) => ({
      nsname: String(entry?.nsname || ""),
      hostmaster: String(entry?.hostmaster || ""),
      serial: Number(entry?.serial) || 0,
      refresh: Number(entry?.refresh) || 0,
      retry: Number(entry?.retry) || 0,
      expire: Number(entry?.expire) || 0,
      minttl: Number(entry?.minttl) || 0,
    }));
  }

  return records.map((entry) => ({
    value: String(entry || ""),
  }));
}

async function resolveDnsLookup(host, type) {
  switch (type) {
    case "A":
      return dns.resolve4(host);
    case "AAAA":
      return dns.resolve6(host);
    case "CNAME":
      return dns.resolveCname(host);
    case "MX":
      return dns.resolveMx(host);
    case "NS":
      return dns.resolveNs(host);
    case "SOA":
      return [await dns.resolveSoa(host)];
    case "SRV":
      return dns.resolveSrv(host);
    case "TXT":
      return dns.resolveTxt(host);
    default: {
      const error = new Error("invalid_dns_type");
      error.code = "EINVAL";
      throw error;
    }
  }
}

async function handleSystemRoutes(context) {
  const { method, pathname, req, res, url, handlers, utilities } = context;

  if (method === "GET" && pathname === "/favicon.ico") {
    await utilities.serveStaticFile(res, "pingmyserverlogo.png");
    return true;
  }

  if (method === "GET" && pathname === "/api/health") {
    utilities.sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && pathname === "/api/landing/ratings") {
    await handlers.handleLandingRatingsGet(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/api/landing/ratings") {
    await handlers.handleLandingRatingsCreate(req, res, url);
    return true;
  }

  if (method === "POST" && pathname === "/stripe/webhook") {
    await handlers.handleStripeWebhook(req, res);
    return true;
  }

  if (method === "GET" && pathname === "/api/tools/dns-lookup") {
    const host = normalizeDnsLookupHost(url.searchParams.get("host"));
    const type = normalizeDnsLookupType(url.searchParams.get("type"));

    if (!host) {
      utilities.sendJson(res, 400, { ok: false, error: "invalid host" });
      return true;
    }

    if (!type) {
      utilities.sendJson(res, 400, { ok: false, error: "invalid type" });
      return true;
    }

    const startedAt = Date.now();

    try {
      const records = await withDnsLookupTimeout(() => resolveDnsLookup(host, type));
      utilities.sendJson(res, 200, {
        ok: true,
        host,
        type,
        recordCount: Array.isArray(records) ? records.length : 0,
        durationMs: Date.now() - startedAt,
        records: formatDnsRecords(type, records),
      });
      return true;
    } catch (error) {
      const code = String(error?.code || "").toUpperCase();

      if (code === "ENOTFOUND" || code === "ENODATA" || code === "ENODOMAIN" || code === "NOTFOUND") {
        utilities.sendJson(res, 200, {
          ok: true,
          host,
          type,
          recordCount: 0,
          durationMs: Date.now() - startedAt,
          records: [],
        });
        return true;
      }

      if (code === "ETIMEOUT") {
        utilities.sendJson(res, 504, { ok: false, error: "lookup timeout" });
        return true;
      }

      utilities.sendJson(res, 502, {
        ok: false,
        error: "dns lookup failed",
        code: code || "UNKNOWN",
      });
      return true;
    }
  }

  if ((method === "GET" || method === "POST") && pathname === "/api/account/notifications/email/unsubscribe") {
    await handlers.handleAccountEmailNotificationUnsubscribe(req, res, url);
    return true;
  }

  return false;
}

module.exports = {
  handleSystemRoutes,
};
