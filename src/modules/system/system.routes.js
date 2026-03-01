const dns = require("dns").promises;
const net = require("net");
const { domainToASCII } = require("url");

const DNS_LOOKUP_ALLOWED_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "NS", "SOA", "SRV", "TXT"]);
const DNS_LOOKUP_TIMEOUT_MS = 4000;
const PORT_CHECK_TIMEOUT_MS = 4000;
const PORT_CHECK_MAX_ADDRESSES = 4;

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

function normalizeIpLiteral(value) {
  return String(value || "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!normalized) return true;
  if (normalized === "localhost") return true;
  if (normalized.endsWith(".localhost")) return true;
  if (normalized === "localhost.localdomain") return true;
  if (normalized === "ip6-localhost") return true;
  if (normalized.endsWith(".local")) return true;
  return false;
}

function isPublicIpv4Address(ip) {
  const parts = String(ip || "")
    .trim()
    .split(".")
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = parts;

  if (a === 0) return false;
  if (a === 10) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;

  return true;
}

function isPublicIpv6Address(ip) {
  const normalized = normalizeIpLiteral(ip);
  if (!normalized) return false;
  if (normalized === "::1" || normalized === "::") return false;
  if (normalized.startsWith("fe80:")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("2001:db8:")) return false;

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    if (net.isIP(mappedIpv4) === 4) {
      return isPublicIpv4Address(mappedIpv4);
    }
  }

  return true;
}

function isPublicIpAddress(ip) {
  const normalized = normalizeIpLiteral(ip);
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4Address(normalized);
  if (family === 6) return isPublicIpv6Address(normalized);
  return false;
}

async function resolvePublicHostAddresses(hostname) {
  const normalizedHost = String(hostname || "").trim();
  if (!normalizedHost) {
    return { status: "invalid", addresses: [] };
  }

  if (isLocalHostname(normalizedHost)) {
    return { status: "blocked", reason: "local_target_forbidden", addresses: [] };
  }

  const hostAsIp = normalizeIpLiteral(normalizedHost);
  if (net.isIP(hostAsIp)) {
    return isPublicIpAddress(hostAsIp)
      ? { status: "ok", addresses: [hostAsIp] }
      : { status: "blocked", reason: "private_target_forbidden", addresses: [hostAsIp] };
  }

  const normalizeAddressList = (values) =>
    Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((item) => normalizeIpLiteral(item?.address || item))
          .filter((address) => net.isIP(address) > 0)
      )
    );

  let addresses = [];

  const lookupRows = await withDnsLookupTimeout(() => dns.lookup(normalizedHost, { all: true, verbatim: true })).catch(() => null);
  addresses = normalizeAddressList(lookupRows);

  if (!addresses.length) {
    const [resolve4Rows, resolve6Rows] = await Promise.all([
      withDnsLookupTimeout(() => dns.resolve4(normalizedHost)).catch(() => null),
      withDnsLookupTimeout(() => dns.resolve6(normalizedHost)).catch(() => null),
    ]);

    addresses = normalizeAddressList([
      ...(Array.isArray(resolve4Rows) ? resolve4Rows : []),
      ...(Array.isArray(resolve6Rows) ? resolve6Rows : []),
    ]);
  }

  if (!addresses.length) {
    return { status: "unresolved", addresses: [] };
  }

  const publicAddresses = addresses.filter((address) => isPublicIpAddress(address));
  const privateAddresses = addresses.filter((address) => !isPublicIpAddress(address));

  if (privateAddresses.length) {
    if (!publicAddresses.length) {
      return { status: "blocked", reason: "private_target_forbidden", addresses };
    }
    return { status: "blocked", reason: "mixed_target_forbidden", addresses };
  }

  return { status: "ok", addresses: publicAddresses };
}

function normalizePortCheckHost(value) {
  const normalized = normalizeDnsLookupHost(value);
  if (!normalized) return null;
  if (isLocalHostname(normalized)) return null;
  return normalized;
}

function normalizePortCheckPort(value) {
  const numeric = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) return null;
  return numeric;
}

function checkTcpPort(address, port) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const family = net.isIP(address);
    const socket = new net.Socket();
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        address,
        family,
        durationMs: Date.now() - startedAt,
        ...payload,
      });
    };

    socket.setTimeout(PORT_CHECK_TIMEOUT_MS);

    socket.once("connect", () => {
      finish({ status: "open", isOpen: true, reasonCode: "CONNECTED" });
    });

    socket.once("timeout", () => {
      finish({ status: "timeout", isOpen: false, reasonCode: "TIMEOUT" });
    });

    socket.once("error", (error) => {
      const code = String(error?.code || "UNKNOWN").toUpperCase();
      if (code === "ECONNREFUSED") {
        finish({ status: "closed", isOpen: false, reasonCode: code });
        return;
      }
      if (code === "ETIMEDOUT") {
        finish({ status: "timeout", isOpen: false, reasonCode: code });
        return;
      }
      if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "EHOSTDOWN") {
        finish({ status: "unreachable", isOpen: false, reasonCode: code });
        return;
      }
      finish({ status: "error", isOpen: false, reasonCode: code });
    });

    try {
      socket.connect({
        host: address,
        port,
        family: family || undefined,
      });
    } catch (error) {
      finish({ status: "error", isOpen: false, reasonCode: String(error?.code || "CONNECT_FAILED").toUpperCase() });
    }
  });
}

async function checkPortAcrossAddresses(addresses, port) {
  const candidates = (Array.isArray(addresses) ? addresses : []).slice(0, PORT_CHECK_MAX_ADDRESSES);
  const results = [];

  for (const address of candidates) {
    const result = await checkTcpPort(address, port);
    results.push(result);
    if (result.status === "open") {
      return { result, attempts: results };
    }
  }

  const statusPriority = ["closed", "timeout", "unreachable", "error"];
  for (const status of statusPriority) {
    const match = results.find((entry) => entry.status === status);
    if (match) {
      return { result: match, attempts: results };
    }
  }

  return {
    result: {
      address: candidates[0] || "",
      family: candidates[0] ? net.isIP(candidates[0]) : 0,
      durationMs: 0,
      status: "error",
      isOpen: false,
      reasonCode: "NO_ATTEMPT",
    },
    attempts: results,
  };
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

  if (method === "GET" && pathname === "/api/tools/port-check") {
    const host = normalizePortCheckHost(url.searchParams.get("host"));
    const port = normalizePortCheckPort(url.searchParams.get("port"));

    if (!host) {
      utilities.sendJson(res, 400, { ok: false, error: "invalid host" });
      return true;
    }

    if (!port) {
      utilities.sendJson(res, 400, { ok: false, error: "invalid port" });
      return true;
    }

    const startedAt = Date.now();
    const resolved = await resolvePublicHostAddresses(host);

    if (resolved.status === "blocked") {
      utilities.sendJson(res, 403, { ok: false, error: "target blocked", reason: resolved.reason || "" });
      return true;
    }

    if (resolved.status === "unresolved") {
      utilities.sendJson(res, 200, {
        ok: true,
        host,
        port,
        status: "unresolved",
        isOpen: false,
        durationMs: Date.now() - startedAt,
        checkedAddress: "",
        checkedFamily: 0,
        checkedAddresses: [],
        reasonCode: "DNS_UNRESOLVED",
      });
      return true;
    }

    if (resolved.status !== "ok" || !resolved.addresses.length) {
      utilities.sendJson(res, 502, { ok: false, error: "port check failed" });
      return true;
    }

    const { result, attempts } = await checkPortAcrossAddresses(resolved.addresses, port);
    utilities.sendJson(res, 200, {
      ok: true,
      host,
      port,
      status: result.status,
      isOpen: !!result.isOpen,
      durationMs: Date.now() - startedAt,
      checkedAddress: String(result.address || ""),
      checkedFamily: Number(result.family) || 0,
      checkedAddresses: attempts.map((entry) => String(entry.address || "")).filter(Boolean),
      reasonCode: String(result.reasonCode || ""),
      connectDurationMs: Number(result.durationMs) || 0,
    });
    return true;
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
