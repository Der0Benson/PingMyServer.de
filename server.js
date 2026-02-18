const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const dns = require("dns").promises;
const net = require("net");
const tls = require("tls");
const { URL, domainToASCII } = require("url");
const { performance } = require("perf_hooks");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const initialProcessEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(filePath) {
  let fileContent = "";
  try {
    fileContent = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("env_file_read_failed", filePath, error.code || error.message);
    }
    return;
  }

  const lines = fileContent.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;

    const preparedLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = preparedLine.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = preparedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (initialProcessEnvKeys.has(key)) continue;

    let value = preparedLine.slice(separatorIndex + 1).trim();
    const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
    const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
    if (hasSingleQuotes || hasDoubleQuotes) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n");
    process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env.local"));

function failConfig(message) {
  console.error("env_config_error", message);
  process.exit(1);
}

const envRawValueCache = new Map();

function readEnvRawValue(name) {
  const fileKey = `${name}_FILE`;
  const filePathRaw = process.env[fileKey];
  const filePath = String(filePathRaw || "").trim();
  if (filePath) {
    const cacheKey = `${fileKey}:${filePath}`;
    if (envRawValueCache.has(cacheKey)) {
      return envRawValueCache.get(cacheKey);
    }
    let fileValue = "";
    try {
      fileValue = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      failConfig(`Unable to read ${fileKey}: ${filePath}`);
    }
    const normalized = fileValue.replace(/\r?\n$/, "");
    envRawValueCache.set(cacheKey, normalized);
    return normalized;
  }
  return process.env[name];
}

function requireEnvString(name, options = {}) {
  const { trim = true, allowEmpty = false } = options;
  const raw = readEnvRawValue(name);
  if (raw === undefined) {
    failConfig(`Missing env var: ${name}`);
  }
  const value = trim ? String(raw).trim() : String(raw);
  if (!allowEmpty && !value) {
    failConfig(`Empty env var: ${name}`);
  }
  return value;
}

function requireEnvNumber(name, options = {}) {
  const { integer = false, min = -Infinity, max = Infinity } = options;
  const value = Number(requireEnvString(name));
  if (!Number.isFinite(value)) {
    failConfig(`Invalid number for ${name}`);
  }
  if (integer && !Number.isInteger(value)) {
    failConfig(`Expected integer for ${name}`);
  }
  if (value < min || value > max) {
    failConfig(`Out of range for ${name}: ${value}`);
  }
  return value;
}

function requireEnvBoolean(name) {
  const value = requireEnvString(name).toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  failConfig(`Invalid boolean for ${name}`);
}

function parseBooleanString(value, name) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  failConfig(`Invalid boolean for ${name}`);
}

function readEnvBoolean(name, defaultValue) {
  const raw = readEnvRawValue(name);
  if (raw === undefined) return !!defaultValue;
  return parseBooleanString(raw, name);
}

function readEnvNumber(name, defaultValue, options = {}) {
  const { integer = false, min = -Infinity, max = Infinity } = options;
  const raw = readEnvRawValue(name);
  if (raw === undefined || String(raw).trim() === "") return defaultValue;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    failConfig(`Invalid number for ${name}`);
  }
  if (integer && !Number.isInteger(value)) {
    failConfig(`Expected integer for ${name}`);
  }
  if (value < min || value > max) {
    failConfig(`Out of range for ${name}: ${value}`);
  }
  return value;
}

function readEnvString(name, defaultValue, options = {}) {
  const { trim = true } = options;
  const raw = readEnvRawValue(name);
  if (raw === undefined) return defaultValue;
  const value = trim ? String(raw).trim() : String(raw);
  return value || defaultValue;
}

function parsePositiveIntegerSet(rawValue, name) {
  const set = new Set();
  const text = String(rawValue || "").trim();
  if (!text) return set;

  for (const part of text.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (!/^\d+$/.test(token)) {
      failConfig(`Invalid positive integer in ${name}: ${token}`);
    }
    const value = Number(token);
    if (!Number.isInteger(value) || value <= 0) {
      failConfig(`Invalid positive integer in ${name}: ${token}`);
    }
    set.add(value);
  }

  return set;
}

function parseHostnameSet(rawValue, name) {
  const set = new Set();
  const text = String(rawValue || "").trim();
  if (!text) return set;

  for (const part of text.split(",")) {
    const token = part
      .trim()
      .toLowerCase()
      .replace(/\.+$/, "");
    if (!token) continue;
    if (!/^[a-z0-9.-]+$/.test(token) || token.includes("..")) {
      failConfig(`Invalid hostname in ${name}: ${part.trim()}`);
    }
    set.add(token);
  }

  return set;
}

function findHostnameSetMatch(hostname, hostnameSet) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!normalized || !(hostnameSet instanceof Set) || !hostnameSet.size) return "";

  for (const rawEntry of hostnameSet) {
    const entry = String(rawEntry || "")
      .trim()
      .toLowerCase()
      .replace(/\.+$/, "");
    if (!entry) continue;
    if (normalized === entry || normalized.endsWith(`.${entry}`)) {
      return entry;
    }
  }

  return "";
}

function parseIpOrCidrList(rawValue, name) {
  const list = [];
  const text = String(rawValue || "").trim();
  if (!text) return list;

  for (const part of text.split(",")) {
    const token = String(part || "").trim();
    if (!token) continue;

    const slashIndex = token.indexOf("/");
    if (slashIndex >= 0) {
      const addressRaw = token.slice(0, slashIndex).trim();
      const prefixRaw = token.slice(slashIndex + 1).trim();
      const address = normalizeIpLiteral(addressRaw);
      const family = net.isIP(address);
      if (!family) {
        failConfig(`Invalid IP in ${name}: ${token}`);
      }
      if (!/^\d+$/.test(prefixRaw)) {
        failConfig(`Invalid CIDR prefix in ${name}: ${token}`);
      }
      const prefix = Number(prefixRaw);
      const maxPrefix = family === 4 ? 32 : 128;
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
        failConfig(`Invalid CIDR prefix in ${name}: ${token}`);
      }
      list.push({ type: "subnet", address, prefix, family });
      continue;
    }

    const address = normalizeIpLiteral(token);
    const family = net.isIP(address);
    if (!family) {
      failConfig(`Invalid IP in ${name}: ${token}`);
    }
    list.push({ type: "address", address, family });
  }

  return list;
}

function parseSameSiteValue(value, name) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "lax") return "Lax";
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  failConfig(`${name} must be one of: Lax, Strict, None`);
}

function parsePrivateTargetPolicyValue(value, name) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "strict") return "strict";
  if (normalized === "all_private") return "all_private";
  failConfig(`${name} must be one of: strict, all_private`);
}

function requireEnvStatusCodeList(name) {
  const value = requireEnvString(name);
  const parsed = parseStatusCodes(value);
  if (!parsed || !parsed.length) {
    failConfig(`Invalid status code list for ${name}`);
  }
  return parsed;
}

const PORT = requireEnvNumber("PORT", { integer: true, min: 1, max: 65535 });
const DEFAULT_MONITOR_INTERVAL_MS = requireEnvNumber("CHECK_INTERVAL_MS", { integer: true, min: 1000 });
const MONITOR_INTERVAL_MIN_MS = readEnvNumber("MONITOR_INTERVAL_MIN_MS", 30000, { integer: true, min: 1000 });
const MONITOR_INTERVAL_MAX_MS = readEnvNumber("MONITOR_INTERVAL_MAX_MS", 3600000, {
  integer: true,
  min: MONITOR_INTERVAL_MIN_MS,
});
const CHECK_TIMEOUT_MS = requireEnvNumber("TIMEOUT_MS", { integer: true, min: 100, max: 120000 });
const CHECK_CONCURRENCY = requireEnvNumber("CHECK_CONCURRENCY", { integer: true, min: 1, max: 1000 });
const CHECK_SCHEDULER_MS = requireEnvNumber("CHECK_SCHEDULER_MS", { integer: true, min: 100 });
const RETENTION_DAYS = requireEnvNumber("RETENTION_DAYS", { integer: true, min: 1 });
const SERIES_LIMIT = requireEnvNumber("SERIES_LIMIT", { integer: true, min: 1, max: 10000 });
const INCIDENT_LOOKBACK_DAYS = requireEnvNumber("INCIDENT_LOOKBACK_DAYS", { integer: true, min: 1 });
const INCIDENT_LOOKBACK_DAYS_MAX = requireEnvNumber("INCIDENT_LOOKBACK_DAYS_MAX", {
  integer: true,
  min: INCIDENT_LOOKBACK_DAYS,
});
const INCIDENT_LIMIT = requireEnvNumber("INCIDENT_LIMIT", { integer: true, min: 1 });
const INCIDENT_LIMIT_MAX = requireEnvNumber("INCIDENT_LIMIT_MAX", { integer: true, min: INCIDENT_LIMIT });
const TARGET_META_REFRESH_MS = requireEnvNumber("TARGET_META_REFRESH_MS", { integer: true, min: 1000 });
const GEO_LOOKUP_TIMEOUT_MS = requireEnvNumber("GEO_LOOKUP_TIMEOUT_MS", { integer: true, min: 100 });
const RDAP_LOOKUP_TIMEOUT_MS = requireEnvNumber("RDAP_LOOKUP_TIMEOUT_MS", { integer: true, min: 100 });
const TARGET_META_CACHE_MAX = requireEnvNumber("TARGET_META_CACHE_MAX", { integer: true, min: 1 });
const DAILY_COMPACTION_INTERVAL_MS = requireEnvNumber("DAILY_COMPACTION_INTERVAL_MS", { integer: true, min: 1000 });
const MAINTENANCE_INTERVAL_MS = requireEnvNumber("MAINTENANCE_INTERVAL_MS", { integer: true, min: 1000 });
const STATIC_CACHE_MAX_AGE_SECONDS = requireEnvNumber("STATIC_CACHE_MAX_AGE_SECONDS", {
  integer: true,
  min: 0,
});
const UP_HTTP_CODES = requireEnvStatusCodeList("UP_HTTP_CODES");

const SESSION_COOKIE_NAME = requireEnvString("SESSION_COOKIE_NAME");
const SESSION_COOKIE_HTTP_ONLY = requireEnvBoolean("SESSION_COOKIE_HTTP_ONLY");
const SESSION_COOKIE_SECURE = requireEnvBoolean("SESSION_COOKIE_SECURE");
const SESSION_COOKIE_SAME_SITE = parseSameSiteValue(requireEnvString("SESSION_COOKIE_SAME_SITE"), "SESSION_COOKIE_SAME_SITE");
const SESSION_COOKIE_PATH = requireEnvString("SESSION_COOKIE_PATH");
const SESSION_TTL_SECONDS = requireEnvNumber("SESSION_TTL_SECONDS", { integer: true, min: 1 });
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const OAUTH_STATE_COOKIE_NAME = readEnvString("OAUTH_STATE_COOKIE_NAME", "oauth_state");
const OAUTH_STATE_COOKIE_HTTP_ONLY = readEnvBoolean("OAUTH_STATE_COOKIE_HTTP_ONLY", true);
const OAUTH_STATE_COOKIE_SECURE = readEnvBoolean("OAUTH_STATE_COOKIE_SECURE", SESSION_COOKIE_SECURE);
const OAUTH_STATE_COOKIE_SAME_SITE = parseSameSiteValue(
  readEnvString("OAUTH_STATE_COOKIE_SAME_SITE", "Lax"),
  "OAUTH_STATE_COOKIE_SAME_SITE"
);
const OAUTH_STATE_COOKIE_PATH = readEnvString("OAUTH_STATE_COOKIE_PATH", "/api/auth");
const OAUTH_STATE_MAX_ENTRIES = readEnvNumber("OAUTH_STATE_MAX_ENTRIES", 10000, {
  integer: true,
  min: 100,
  max: 1000000,
});
const BCRYPT_COST = requireEnvNumber("BCRYPT_COST", { integer: true, min: 4, max: 31 });
const PASSWORD_MIN_LENGTH = requireEnvNumber("PASSWORD_MIN_LENGTH", { integer: true, min: 1 });
const PASSWORD_MAX_LENGTH = requireEnvNumber("PASSWORD_MAX_LENGTH", {
  integer: true,
  min: PASSWORD_MIN_LENGTH,
});
const AUTH_RATE_LIMIT_MAX = requireEnvNumber("AUTH_RATE_LIMIT_MAX", { integer: true, min: 1 });
const AUTH_RATE_LIMIT_WINDOW_MS = requireEnvNumber("AUTH_RATE_LIMIT_WINDOW_MS", { integer: true, min: 1000 });
const AUTH_RATE_LIMIT_MAX_ENTRIES = requireEnvNumber("AUTH_RATE_LIMIT_MAX_ENTRIES", {
  integer: true,
  min: 1,
});
const AUTH_RATE_LIMIT_HARD_CAP = readEnvNumber(
  "AUTH_RATE_LIMIT_HARD_CAP",
  Math.max(AUTH_RATE_LIMIT_MAX_ENTRIES * 2, AUTH_RATE_LIMIT_MAX_ENTRIES + 1000),
  {
    integer: true,
    min: AUTH_RATE_LIMIT_MAX_ENTRIES,
    max: 10000000,
  }
);
const AUTH_LOCK_MAX_FAILS = requireEnvNumber("AUTH_LOCK_MAX_FAILS", { integer: true, min: 1 });
const AUTH_LOCK_DURATION_MS = requireEnvNumber("AUTH_LOCK_DURATION_MS", { integer: true, min: 1000 });
const REQUEST_BODY_LIMIT_BYTES = requireEnvNumber("REQUEST_BODY_LIMIT_BYTES", { integer: true, min: 1024 });
const MONITOR_PUBLIC_ID_LENGTH = requireEnvNumber("MONITOR_PUBLIC_ID_LENGTH", { integer: true, min: 6, max: 64 });
const MONITORS_PER_USER_MAX = readEnvNumber("MONITORS_PER_USER_MAX", 1000, {
  integer: true,
  min: 1,
  max: 1000000,
});
const DEFAULT_PUBLIC_STATUS_MONITOR_ID = String(process.env.DEFAULT_PUBLIC_STATUS_MONITOR_ID || "").trim();
const TRUST_PROXY = readEnvBoolean("TRUST_PROXY", false);
const TRUST_PROXY_SOURCE_ALLOWLIST = parseIpOrCidrList(
  readEnvString("TRUST_PROXY_SOURCE_ALLOWLIST", ""),
  "TRUST_PROXY_SOURCE_ALLOWLIST"
);
const MONITOR_BLOCK_PRIVATE_TARGETS = readEnvBoolean("MONITOR_BLOCK_PRIVATE_TARGETS", true);
const MONITOR_PRIVATE_TARGET_POLICY = parsePrivateTargetPolicyValue(
  readEnvString("MONITOR_PRIVATE_TARGET_POLICY", "strict"),
  "MONITOR_PRIVATE_TARGET_POLICY"
);
const MONITOR_CREATE_GET_ENABLED = readEnvBoolean("MONITOR_CREATE_GET_ENABLED", false);
const MONITOR_PRIVATE_TARGET_ALLOWLIST = parseHostnameSet(
  readEnvString("MONITOR_PRIVATE_TARGET_ALLOWLIST", ""),
  "MONITOR_PRIVATE_TARGET_ALLOWLIST"
);
const MONITOR_TARGET_DOMAIN_BLACKLIST = parseHostnameSet(
  readEnvString("MONITOR_TARGET_DOMAIN_BLACKLIST", ""),
  "MONITOR_TARGET_DOMAIN_BLACKLIST"
);
const FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED = readEnvBoolean(
  "FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED",
  false
);
const FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT = readEnvNumber(
  "FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT",
  100,
  {
    min: 0,
    max: 100,
  }
);
const FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES = readEnvNumber(
  "FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES",
  2,
  {
    integer: true,
    min: 1,
    max: 1000,
  }
);
const MONITOR_TARGET_RESOLVE_TIMEOUT_MS = readEnvNumber("MONITOR_TARGET_RESOLVE_TIMEOUT_MS", 4000, {
  integer: true,
  min: 250,
  max: 30000,
});
const MONITOR_TARGET_VALIDATE_CACHE_MS = readEnvNumber("MONITOR_TARGET_VALIDATE_CACHE_MS", 60000, {
  integer: true,
  min: 1000,
  max: 86400000,
});
const MONITOR_TARGET_VALIDATE_CACHE_MAX = readEnvNumber("MONITOR_TARGET_VALIDATE_CACHE_MAX", 5000, {
  integer: true,
  min: 10,
  max: 500000,
});
const PUBLIC_STATUS_ALLOW_NUMERIC_ID = readEnvBoolean("PUBLIC_STATUS_ALLOW_NUMERIC_ID", false);
const OWNER_USER_IDS = parsePositiveIntegerSet(readEnvString("OWNER_USER_IDS", ""), "OWNER_USER_IDS");
const OWNER_RUNTIME_SAMPLE_MAX = readEnvNumber("OWNER_RUNTIME_SAMPLE_MAX", 600, {
  integer: true,
  min: 60,
  max: 20000,
});
const OWNER_DB_SLOW_QUERY_MS = readEnvNumber("OWNER_DB_SLOW_QUERY_MS", 250, {
  integer: true,
  min: 10,
  max: 120000,
});
const OWNER_TOP_MONITOR_LIMIT = readEnvNumber("OWNER_TOP_MONITOR_LIMIT", 100, {
  integer: true,
  min: 10,
  max: 1000,
});
const ACCOUNT_SENSITIVE_ACTION_MAX_SESSION_AGE_MS = readEnvNumber(
  "ACCOUNT_SENSITIVE_ACTION_MAX_SESSION_AGE_MS",
  900000,
  {
    integer: true,
    min: 60000,
    max: SESSION_TTL_MS,
  }
);
const TRUSTED_ORIGINS = new Set(
  requireEnvString("TRUSTED_ORIGIN_PREFIXES")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean)
);
if (!TRUSTED_ORIGINS.size) {
  failConfig("TRUSTED_ORIGIN_PREFIXES must contain at least one origin");
}

function getDefaultTrustedOrigin() {
  const first = TRUSTED_ORIGINS.values().next().value;
  if (typeof first === "string" && first) return first;
  return "http://localhost";
}

function resolveStripeRedirectUrl(rawValue, fallbackPath) {
  const configured = String(rawValue || "").trim();
  if (configured) return configured;
  const origin = getDefaultTrustedOrigin();
  return `${origin}${fallbackPath}`;
}

if (SESSION_COOKIE_SAME_SITE === "None" && !SESSION_COOKIE_SECURE) {
  failConfig("SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_SAME_SITE=None");
}
if (OAUTH_STATE_COOKIE_SAME_SITE === "None" && !OAUTH_STATE_COOKIE_SECURE) {
  failConfig("OAUTH_STATE_COOKIE_SECURE must be true when OAUTH_STATE_COOKIE_SAME_SITE=None");
}
const DUMMY_PASSWORD_HASH = requireEnvString("DUMMY_PASSWORD_HASH");
const SECURITY_STRICT_TRANSPORT_SECURITY = readEnvString(
  "SECURITY_STRICT_TRANSPORT_SECURITY",
  "max-age=31536000; includeSubDomains",
  { trim: true }
);

const SECURITY_HEADERS = {
  "Content-Security-Policy": requireEnvString("SECURITY_CONTENT_SECURITY_POLICY", { trim: false }),
  "X-Content-Type-Options": requireEnvString("SECURITY_X_CONTENT_TYPE_OPTIONS"),
  "X-Frame-Options": requireEnvString("SECURITY_X_FRAME_OPTIONS"),
  "Referrer-Policy": requireEnvString("SECURITY_REFERRER_POLICY"),
  ...(SECURITY_STRICT_TRANSPORT_SECURITY
    ? { "Strict-Transport-Security": SECURITY_STRICT_TRANSPORT_SECURITY }
    : {}),
};

const MYSQL_HOST = requireEnvString("MYSQL_HOST");
const MYSQL_PORT = requireEnvNumber("MYSQL_PORT", { integer: true, min: 1, max: 65535 });
const MYSQL_USER = requireEnvString("MYSQL_USER");
const MYSQL_PASSWORD = requireEnvString("MYSQL_PASSWORD", { trim: false });
const MYSQL_DATABASE = requireEnvString("MYSQL_DATABASE");
const MYSQL_CONNECTION_LIMIT = requireEnvNumber("MYSQL_CONNECTION_LIMIT", { integer: true, min: 1 });
const MYSQL_TIMEZONE = requireEnvString("MYSQL_TIMEZONE");
const GITHUB_AUTH_ENABLED = requireEnvBoolean("GITHUB_AUTH_ENABLED");
const GITHUB_CLIENT_ID = GITHUB_AUTH_ENABLED
  ? requireEnvString("GITHUB_CLIENT_ID")
  : requireEnvString("GITHUB_CLIENT_ID", { allowEmpty: true });
const GITHUB_CLIENT_SECRET = GITHUB_AUTH_ENABLED
  ? requireEnvString("GITHUB_CLIENT_SECRET", { trim: false })
  : requireEnvString("GITHUB_CLIENT_SECRET", { allowEmpty: true, trim: false });
const GITHUB_CALLBACK_URL = GITHUB_AUTH_ENABLED
  ? requireEnvString("GITHUB_CALLBACK_URL")
  : requireEnvString("GITHUB_CALLBACK_URL", { allowEmpty: true });
const GITHUB_SCOPE = (() => {
  const rawScope = GITHUB_AUTH_ENABLED
    ? requireEnvString("GITHUB_SCOPE")
    : requireEnvString("GITHUB_SCOPE", { allowEmpty: true });
  const scopes = new Set(
    String(rawScope || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  if (GITHUB_AUTH_ENABLED) {
    scopes.add("read:user");
    scopes.add("user:email");
  }
  return Array.from(scopes).join(" ");
})();
const GITHUB_OAUTH_TIMEOUT_MS = requireEnvNumber("GITHUB_OAUTH_TIMEOUT_MS", { integer: true, min: 1000, max: 60000 });
const GITHUB_OAUTH_STATE_TTL_SECONDS = requireEnvNumber("GITHUB_OAUTH_STATE_TTL_SECONDS", {
  integer: true,
  min: 60,
  max: 3600,
});
const GOOGLE_AUTH_ENABLED = requireEnvBoolean("GOOGLE_AUTH_ENABLED");
const GOOGLE_CLIENT_ID = GOOGLE_AUTH_ENABLED
  ? requireEnvString("GOOGLE_CLIENT_ID")
  : requireEnvString("GOOGLE_CLIENT_ID", { allowEmpty: true });
const GOOGLE_CLIENT_SECRET = GOOGLE_AUTH_ENABLED
  ? requireEnvString("GOOGLE_CLIENT_SECRET", { trim: false })
  : requireEnvString("GOOGLE_CLIENT_SECRET", { allowEmpty: true, trim: false });
const GOOGLE_CALLBACK_URL = GOOGLE_AUTH_ENABLED
  ? requireEnvString("GOOGLE_CALLBACK_URL")
  : requireEnvString("GOOGLE_CALLBACK_URL", { allowEmpty: true });
const GOOGLE_SCOPE = (() => {
  const rawScope = GOOGLE_AUTH_ENABLED
    ? requireEnvString("GOOGLE_SCOPE")
    : requireEnvString("GOOGLE_SCOPE", { allowEmpty: true });
  const scopes = new Set(
    String(rawScope || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  if (GOOGLE_AUTH_ENABLED) {
    scopes.add("openid");
    scopes.add("email");
    scopes.add("profile");
  }
  return Array.from(scopes).join(" ");
})();
const DISCORD_AUTH_ENABLED = requireEnvBoolean("DISCORD_AUTH_ENABLED");
const DISCORD_CLIENT_ID = DISCORD_AUTH_ENABLED
  ? requireEnvString("DISCORD_CLIENT_ID")
  : requireEnvString("DISCORD_CLIENT_ID", { allowEmpty: true });
const DISCORD_CLIENT_SECRET = DISCORD_AUTH_ENABLED
  ? requireEnvString("DISCORD_CLIENT_SECRET", { trim: false })
  : requireEnvString("DISCORD_CLIENT_SECRET", { allowEmpty: true, trim: false });
const DISCORD_CALLBACK_URL = DISCORD_AUTH_ENABLED
  ? requireEnvString("DISCORD_CALLBACK_URL")
  : requireEnvString("DISCORD_CALLBACK_URL", { allowEmpty: true });
const DISCORD_SCOPE = (() => {
  const rawScope = DISCORD_AUTH_ENABLED
    ? requireEnvString("DISCORD_SCOPE")
    : requireEnvString("DISCORD_SCOPE", { allowEmpty: true });
  const scopes = new Set(
    String(rawScope || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  if (DISCORD_AUTH_ENABLED) {
    scopes.add("identify");
    scopes.add("email");
  }
  return Array.from(scopes).join(" ");
})();
const DISCORD_WEBHOOK_TIMEOUT_MS = readEnvNumber("DISCORD_WEBHOOK_TIMEOUT_MS", 8000, {
  integer: true,
  min: 1000,
  max: 60000,
});
const STRIPE_ENABLED = readEnvBoolean("STRIPE_ENABLED", false);
const STRIPE_SECRET_KEY = STRIPE_ENABLED
  ? requireEnvString("STRIPE_SECRET_KEY", { trim: false })
  : readEnvString("STRIPE_SECRET_KEY", "", { trim: false });
const STRIPE_PRICE_ID = readEnvString("STRIPE_PRICE_ID", "");
const STRIPE_PRICE_LOOKUP_KEY = readEnvString("STRIPE_PRICE_LOOKUP_KEY", "");
const STRIPE_WEBHOOK_SECRET = STRIPE_ENABLED
  ? requireEnvString("STRIPE_WEBHOOK_SECRET", { trim: false })
  : readEnvString("STRIPE_WEBHOOK_SECRET", "", { trim: false });
const STRIPE_SUCCESS_URL = resolveStripeRedirectUrl(
  readEnvString("STRIPE_SUCCESS_URL", ""),
  "/notifications?billing=success"
);
const STRIPE_CANCEL_URL = resolveStripeRedirectUrl(
  readEnvString("STRIPE_CANCEL_URL", ""),
  "/notifications?billing=cancel"
);
const STRIPE_PORTAL_RETURN_URL = resolveStripeRedirectUrl(
  readEnvString("STRIPE_PORTAL_RETURN_URL", ""),
  "/notifications"
);
const STRIPE_API_BASE = readEnvString("STRIPE_API_BASE", "https://api.stripe.com/v1");
const STRIPE_REQUEST_TIMEOUT_MS = readEnvNumber("STRIPE_REQUEST_TIMEOUT_MS", 15000, {
  integer: true,
  min: 1000,
  max: 120000,
});
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = readEnvNumber("STRIPE_WEBHOOK_TOLERANCE_SECONDS", 300, {
  integer: true,
  min: 30,
  max: 3600,
});
const STRIPE_WEBHOOK_BODY_LIMIT_BYTES = readEnvNumber("STRIPE_WEBHOOK_BODY_LIMIT_BYTES", 1048576, {
  integer: true,
  min: 1024,
  max: 5242880,
});
const STRIPE_TRIAL_PERIOD_DAYS = readEnvNumber("STRIPE_TRIAL_PERIOD_DAYS", 0, {
  integer: true,
  min: 0,
  max: 365,
});
const STRIPE_BILLING_CYCLE_ANCHOR_UNIX = readEnvNumber("STRIPE_BILLING_CYCLE_ANCHOR_UNIX", 0, {
  integer: true,
  min: 0,
});
const STRIPE_AUTOMATIC_TAX_ENABLED = readEnvBoolean("STRIPE_AUTOMATIC_TAX_ENABLED", false);
if (GITHUB_AUTH_ENABLED) {
  try {
    const callbackUrl = new URL(GITHUB_CALLBACK_URL);
    if (callbackUrl.protocol !== "https:" && callbackUrl.hostname !== "localhost") {
      failConfig("GITHUB_CALLBACK_URL must use https unless hostname is localhost");
    }
  } catch (error) {
    failConfig("GITHUB_CALLBACK_URL must be a valid absolute URL");
  }
}
if (GOOGLE_AUTH_ENABLED) {
  try {
    const callbackUrl = new URL(GOOGLE_CALLBACK_URL);
    if (callbackUrl.protocol !== "https:" && callbackUrl.hostname !== "localhost") {
      failConfig("GOOGLE_CALLBACK_URL must use https unless hostname is localhost");
    }
  } catch (error) {
    failConfig("GOOGLE_CALLBACK_URL must be a valid absolute URL");
  }
}
if (DISCORD_AUTH_ENABLED) {
  try {
    const callbackUrl = new URL(DISCORD_CALLBACK_URL);
    if (callbackUrl.protocol !== "https:" && callbackUrl.hostname !== "localhost") {
      failConfig("DISCORD_CALLBACK_URL must use https unless hostname is localhost");
    }
  } catch (error) {
    failConfig("DISCORD_CALLBACK_URL must be a valid absolute URL");
  }
}
if (STRIPE_ENABLED) {
  const validateStripeUrl = (value, name) => {
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "::1"
      ) {
        failConfig(`${name} must use https unless hostname is localhost`);
      }
    } catch (error) {
      failConfig(`${name} must be a valid absolute URL`);
    }
  };

  validateStripeUrl(STRIPE_SUCCESS_URL, "STRIPE_SUCCESS_URL");
  validateStripeUrl(STRIPE_CANCEL_URL, "STRIPE_CANCEL_URL");
  validateStripeUrl(STRIPE_PORTAL_RETURN_URL, "STRIPE_PORTAL_RETURN_URL");

  try {
    const apiBase = new URL(STRIPE_API_BASE);
    if (apiBase.protocol !== "https:") {
      failConfig("STRIPE_API_BASE must use https");
    }
  } catch (error) {
    failConfig("STRIPE_API_BASE must be a valid absolute URL");
  }

  if (!String(STRIPE_PRICE_ID || "").trim() && !String(STRIPE_PRICE_LOOKUP_KEY || "").trim()) {
    failConfig("STRIPE_PRICE_ID or STRIPE_PRICE_LOOKUP_KEY must be set when STRIPE_ENABLED=true");
  }
}

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: MYSQL_CONNECTION_LIMIT,
  timezone: MYSQL_TIMEZONE,
});

const authRateLimiter = new Map();
const oauthStateStore = new Map();
const targetMetaCache = new Map();
const monitorTargetValidationCache = new Map();
const monitorFaviconCache = new Map();
let monitorChecksInFlight = false;
let allMonitorsOfflineConsecutiveCount = 0;
let allMonitorsOfflineShutdownTriggered = false;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONITOR_FAVICON_CACHE_MAX = 300;
const MONITOR_FAVICON_CACHE_MS = 30 * 60 * 1000;
const MONITOR_FAVICON_NEGATIVE_CACHE_MS = 5 * 60 * 1000;
const MONITOR_FAVICON_FETCH_TIMEOUT_MS = 4500;
const MONITOR_FAVICON_MAX_BYTES = 64 * 1024;
const STRIPE_ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const cpuCoreCount = Math.max(1, Number(os.cpus()?.length || 1));
const poolInstrumentationMarker = Symbol("instrumented_pool");
const connectionInstrumentationMarker = Symbol("instrumented_connection");
const connectionReleaseInstrumentationMarker = Symbol("instrumented_connection_release");
let cpuSampleState = { usage: process.cpuUsage(), time: process.hrtime.bigint() };
let monitorSchedulerExpectedAt = Date.now() + CHECK_SCHEDULER_MS;
const runtimeTelemetry = {
  startedAt: Date.now(),
  scheduler: {
    runs: 0,
    skippedDueToOverlap: 0,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastDueMonitors: 0,
    driftMsSamples: [],
  },
  checks: {
    inFlight: 0,
    maxInFlight: 0,
    total: 0,
    ok: 0,
    failed: 0,
    timedOut: 0,
    blocked: 0,
    durationMsSamples: [],
  },
  security: {
    invalidOriginBlocked: 0,
    authRateLimited: 0,
    oauthStateRejected: 0,
    monitorTargetBlocked: 0,
    monitorTargetBlockReasons: new Map(),
  },
  db: {
    queryCount: 0,
    slowQueryCount: 0,
    maxQueryMs: 0,
    queryDurationMsSamples: [],
    activeOperations: 0,
    maxActiveOperations: 0,
    maxQueuedOperations: 0,
    acquiredConnections: 0,
    releasedConnections: 0,
    connectionAcquireWaitMsSamples: [],
  },
  process: {
    eventLoopLagMsSamples: [],
    cpuPercentSamples: [],
  },
};

function pushNumericSample(list, value, max = OWNER_RUNTIME_SAMPLE_MAX) {
  if (!Array.isArray(list)) return;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return;
  list.push(normalized);
  if (list.length > max) {
    list.splice(0, list.length - max);
  }
}

function getAverage(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return sum / values.length;
}

function getPercentile(values, percentile) {
  if (!Array.isArray(values) || !values.length) return null;
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[rank];
}

function roundTo(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function incrementCounterMap(counterMap, key, increment = 1) {
  if (!(counterMap instanceof Map)) return;
  const normalizedKey = String(key || "unknown");
  const current = Number(counterMap.get(normalizedKey) || 0);
  counterMap.set(normalizedKey, current + increment);
}

function normalizeTargetValidationReasonForTelemetry(reason) {
  const raw = String(reason || "").trim().toLowerCase();
  if (!raw) return "unknown";
  const [baseReason] = raw.split(":", 1);
  return baseReason || "unknown";
}

function mapToSortedCounterList(counterMap, limit = 10) {
  if (!(counterMap instanceof Map)) return [];
  return [...counterMap.entries()]
    .map(([key, count]) => ({ key: String(key), count: Number(count || 0) }))
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.max(1, limit));
}

function getCollectionSize(value) {
  if (!value) return null;
  if (typeof value.length === "number" && Number.isFinite(value.length)) return value.length;
  if (typeof value.size === "number" && Number.isFinite(value.size)) return value.size;
  return null;
}

function beginDbOperationTelemetry() {
  runtimeTelemetry.db.activeOperations += 1;
  runtimeTelemetry.db.maxActiveOperations = Math.max(
    runtimeTelemetry.db.maxActiveOperations,
    runtimeTelemetry.db.activeOperations
  );
  const queued = Math.max(0, runtimeTelemetry.db.activeOperations - MYSQL_CONNECTION_LIMIT);
  runtimeTelemetry.db.maxQueuedOperations = Math.max(runtimeTelemetry.db.maxQueuedOperations, queued);
}

function endDbOperationTelemetry() {
  runtimeTelemetry.db.activeOperations = Math.max(0, runtimeTelemetry.db.activeOperations - 1);
}

function getDbPoolSnapshot() {
  const internalPool = pool?.pool || pool?._pool || pool;
  const totalFromPool = getCollectionSize(internalPool?._allConnections);
  const freeFromPool = getCollectionSize(internalPool?._freeConnections);
  const queueFromPool = getCollectionSize(internalPool?._connectionQueue);

  const activeOps = Number(runtimeTelemetry.db.activeOperations || 0);
  const total = Number.isFinite(totalFromPool) ? totalFromPool : MYSQL_CONNECTION_LIMIT;
  const free = Number.isFinite(freeFromPool) ? freeFromPool : Math.max(0, total - activeOps);
  const busy = Number.isFinite(totalFromPool) && Number.isFinite(freeFromPool) ? Math.max(0, totalFromPool - freeFromPool) : activeOps;
  const queue = Number.isFinite(queueFromPool) ? queueFromPool : Math.max(0, activeOps - total);

  return {
    total,
    free,
    busy,
    queue,
    maxBusy: Number(runtimeTelemetry.db.maxActiveOperations || 0),
    maxQueue: Number(runtimeTelemetry.db.maxQueuedOperations || 0),
  };
}

function recordDbQueryTelemetry(durationMs) {
  const normalized = Number(durationMs);
  if (!Number.isFinite(normalized) || normalized < 0) return;
  runtimeTelemetry.db.queryCount += 1;
  pushNumericSample(runtimeTelemetry.db.queryDurationMsSamples, normalized);
  runtimeTelemetry.db.maxQueryMs = Math.max(runtimeTelemetry.db.maxQueryMs, normalized);
  if (normalized >= OWNER_DB_SLOW_QUERY_MS) {
    runtimeTelemetry.db.slowQueryCount += 1;
  }
}

function instrumentDbConnection(connection) {
  if (!connection || connection[connectionInstrumentationMarker]) return connection;
  const rawQuery = typeof connection.query === "function" ? connection.query.bind(connection) : null;
  if (!rawQuery) {
    connection[connectionInstrumentationMarker] = true;
    return connection;
  }

  connection.query = async (...args) => {
    beginDbOperationTelemetry();
    const startedAt = performance.now();
    try {
      return await rawQuery(...args);
    } finally {
      recordDbQueryTelemetry(performance.now() - startedAt);
      endDbOperationTelemetry();
    }
  };

  const rawRelease = typeof connection.release === "function" ? connection.release.bind(connection) : null;
  if (rawRelease && !connection[connectionReleaseInstrumentationMarker]) {
    connection.release = (...args) => {
      runtimeTelemetry.db.releasedConnections += 1;
      return rawRelease(...args);
    };
    connection[connectionReleaseInstrumentationMarker] = true;
  }

  connection[connectionInstrumentationMarker] = true;
  return connection;
}

function instrumentDatabasePool() {
  if (!pool || pool[poolInstrumentationMarker]) return;

  const rawPoolQuery = typeof pool.query === "function" ? pool.query.bind(pool) : null;
  if (rawPoolQuery) {
    pool.query = async (...args) => {
      beginDbOperationTelemetry();
      const startedAt = performance.now();
      try {
        return await rawPoolQuery(...args);
      } finally {
        recordDbQueryTelemetry(performance.now() - startedAt);
        endDbOperationTelemetry();
      }
    };
  }

  const rawGetConnection = typeof pool.getConnection === "function" ? pool.getConnection.bind(pool) : null;
  if (rawGetConnection) {
    pool.getConnection = async (...args) => {
      const startedAt = performance.now();
      const connection = await rawGetConnection(...args);
      runtimeTelemetry.db.acquiredConnections += 1;
      pushNumericSample(runtimeTelemetry.db.connectionAcquireWaitMsSamples, performance.now() - startedAt);
      return instrumentDbConnection(connection);
    };
  }

  pool[poolInstrumentationMarker] = true;
}

function startRuntimeSampling() {
  let eventLoopExpectedAt = performance.now() + 1000;
  const eventLoopTimer = setInterval(() => {
    const now = performance.now();
    const lagMs = Math.max(0, now - eventLoopExpectedAt);
    pushNumericSample(runtimeTelemetry.process.eventLoopLagMsSamples, lagMs);
    eventLoopExpectedAt = now + 1000;
  }, 1000);
  if (typeof eventLoopTimer.unref === "function") eventLoopTimer.unref();

  const cpuTimer = setInterval(() => {
    const nowTime = process.hrtime.bigint();
    const elapsedUs = Number(nowTime - cpuSampleState.time) / 1000;
    if (elapsedUs <= 0) {
      cpuSampleState = { usage: process.cpuUsage(), time: nowTime };
      return;
    }

    const cpuDelta = process.cpuUsage(cpuSampleState.usage);
    const usedUs = Number(cpuDelta.user + cpuDelta.system);
    const normalizedCpuPercent = (usedUs / (elapsedUs * cpuCoreCount)) * 100;
    pushNumericSample(runtimeTelemetry.process.cpuPercentSamples, Math.max(0, normalizedCpuPercent));
    cpuSampleState = { usage: process.cpuUsage(), time: nowTime };
  }, 5000);
  if (typeof cpuTimer.unref === "function") cpuTimer.unref();
}

function isOwnerUserId(userId) {
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) return false;
  return OWNER_USER_IDS.has(numericUserId);
}

instrumentDatabasePool();
startRuntimeSampling();

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendRedirect(res, location, statusCode = 302) {
  res.writeHead(statusCode, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

function contentTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".xml") return "application/xml; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".webmanifest") return "application/manifest+json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

async function serveStaticFile(res, relativeFilePath) {
  const normalized = relativeFilePath.replace(/^\/+/, "");
  if (!normalized) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const absolutePath = path.resolve(PUBLIC_DIR, normalized);
  if (!absolutePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }

  try {
    const data = await fs.promises.readFile(absolutePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFromPath(absolutePath),
      "Cache-Control": `public, max-age=${STATIC_CACHE_MAX_AGE_SECONDS}`,
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    throw error;
  }
}

function parseCookies(headerValue) {
  const cookies = Object.create(null);
  if (!headerValue) return cookies;

  const parts = headerValue.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");
    if (!rawKey) continue;
    if (rawKey === "__proto__" || rawKey === "constructor" || rawKey === "prototype") continue;
    const rawValue = rawValueParts.join("=") || "";
    try {
      cookies[rawKey] = decodeURIComponent(rawValue);
    } catch (error) {
      cookies[rawKey] = rawValue;
    }
  }
  return cookies;
}

const BlockList = net.BlockList;
if (typeof BlockList !== "function") {
  failConfig("Node runtime must support net.BlockList");
}

const LOOPBACK_IP_BLOCKLIST = new BlockList();
LOOPBACK_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_IP_BLOCKLIST.addAddress("::1", "ipv6");

const TRUST_PROXY_SOURCE_BLOCKLIST = new BlockList();
for (const rule of TRUST_PROXY_SOURCE_ALLOWLIST) {
  if (!rule || !rule.family || !rule.address) continue;
  const familyName = rule.family === 4 ? "ipv4" : "ipv6";
  if (rule.type === "subnet") {
    TRUST_PROXY_SOURCE_BLOCKLIST.addSubnet(rule.address, Number(rule.prefix), familyName);
    continue;
  }
  TRUST_PROXY_SOURCE_BLOCKLIST.addAddress(rule.address, familyName);
}

const NON_PUBLIC_IP_BLOCKLIST = new BlockList();
NON_PUBLIC_IP_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("192.0.0.0", 24, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("192.0.2.0", 24, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("192.88.99.0", 24, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("198.51.100.0", 24, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("203.0.113.0", 24, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("240.0.0.0", 4, "ipv4");
NON_PUBLIC_IP_BLOCKLIST.addAddress("::", "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addAddress("::1", "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("::ffff:0:0", 96, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("64:ff9b:1::", 48, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("100::", 64, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("2001:2::", 48, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("2001:db8::", 32, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("fec0::", 10, "ipv6");
NON_PUBLIC_IP_BLOCKLIST.addSubnet("ff00::", 8, "ipv6");

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin.toLowerCase();
  } catch (error) {
    return null;
  }
}

function normalizeIpLiteral(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("[") && raw.endsWith("]")) {
    raw = raw.slice(1, -1);
  }

  const zoneSeparator = raw.indexOf("%");
  if (zoneSeparator >= 0) {
    raw = raw.slice(0, zoneSeparator);
  }

  const lower = raw.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const mapped = raw.slice(7);
    if (net.isIP(mapped) === 4) {
      return mapped;
    }
  }

  return raw;
}

function isLoopbackIpAddress(ip) {
  const normalized = normalizeIpLiteral(ip);
  const family = net.isIP(normalized);
  if (!family) return false;
  return LOOPBACK_IP_BLOCKLIST.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function isPublicIpAddress(ip) {
  const normalized = normalizeIpLiteral(ip);
  const family = net.isIP(normalized);
  if (!family) return false;
  return !NON_PUBLIC_IP_BLOCKLIST.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function isTrustedProxySourceAddress(ip) {
  const normalized = normalizeIpLiteral(ip);
  const family = net.isIP(normalized);
  if (!family) return false;
  if (isLoopbackIpAddress(normalized)) return true;
  if (TRUST_PROXY_SOURCE_ALLOWLIST.length) {
    return TRUST_PROXY_SOURCE_BLOCKLIST.check(normalized, family === 4 ? "ipv4" : "ipv6");
  }
  return !isPublicIpAddress(normalized);
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
  return false;
}

function getMonitorTargetValidationCacheKey(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return `${parsed.protocol}//${hostname}:${port}`;
  } catch (error) {
    return String(targetUrl || "");
  }
}

function pruneMonitorTargetValidationCache() {
  if (monitorTargetValidationCache.size <= MONITOR_TARGET_VALIDATE_CACHE_MAX) return;
  const keys = [...monitorTargetValidationCache.keys()];
  while (monitorTargetValidationCache.size > MONITOR_TARGET_VALIDATE_CACHE_MAX && keys.length) {
    monitorTargetValidationCache.delete(keys.shift());
  }
}

async function resolveMonitorTargetAddresses(hostname) {
  const normalizedHost = String(hostname || "").trim();
  if (!normalizedHost) return [];

  const hostAsIp = normalizeIpLiteral(normalizedHost);
  if (net.isIP(hostAsIp)) {
    return [hostAsIp];
  }

  const normalizeAddressList = (values) =>
    Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((item) => normalizeIpLiteral(item))
          .filter((address) => net.isIP(address) > 0)
      )
    );

  const withDnsTimeout = async (task) => {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("dns_lookup_timeout"));
      }, MONITOR_TARGET_RESOLVE_TIMEOUT_MS);
    });

    try {
      return await Promise.race([task(), timeoutPromise]);
    } catch (error) {
      return null;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  try {
    // Primary resolver path (respects local host resolution).
    const lookupRows = await withDnsTimeout(() => dns.lookup(normalizedHost, { all: true, verbatim: true }));
    const lookupAddresses = normalizeAddressList((Array.isArray(lookupRows) ? lookupRows : []).map((row) => row?.address));
    if (lookupAddresses.length) {
      return lookupAddresses;
    }

    // Fallback to explicit DNS queries to reduce false dns_unresolved results.
    const [resolve4Rows, resolve6Rows] = await Promise.all([
      withDnsTimeout(() => dns.resolve4(normalizedHost)),
      withDnsTimeout(() => dns.resolve6(normalizedHost)),
    ]);

    return normalizeAddressList([
      ...(Array.isArray(resolve4Rows) ? resolve4Rows : []),
      ...(Array.isArray(resolve6Rows) ? resolve6Rows : []),
    ]);
  } catch (error) {
    return [];
  }
}

async function validateMonitorTarget(targetUrl, options = {}) {
  const { useCache = true } = options;

  let parsed;
  try {
    parsed = new URL(String(targetUrl || ""));
  } catch (error) {
    return { allowed: false, reason: "invalid_url", addresses: [] };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "invalid_protocol", addresses: [] };
  }

  const hostname = String(parsed.hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  const blockedDomainMatch = findHostnameSetMatch(hostname, MONITOR_TARGET_DOMAIN_BLACKLIST);
  if (blockedDomainMatch) {
    return { allowed: false, reason: `domain_blacklisted:${blockedDomainMatch}`, addresses: [] };
  }

  if (!MONITOR_BLOCK_PRIVATE_TARGETS) {
    return { allowed: true, reason: "ok", addresses: [] };
  }

  if (!hostname || isLocalHostname(hostname)) {
    return { allowed: false, reason: "local_target_forbidden", addresses: [] };
  }

  const cacheKey = getMonitorTargetValidationCacheKey(targetUrl);
  const now = Date.now();
  const cachedEntry = monitorTargetValidationCache.get(cacheKey);
  if (useCache) {
    if (cachedEntry && Number.isFinite(cachedEntry.expiresAt) && cachedEntry.expiresAt > now && cachedEntry.result) {
      return cachedEntry.result;
    }
  }

  const addresses = await resolveMonitorTargetAddresses(hostname);
  let result = { allowed: false, reason: "dns_unresolved", addresses: [] };
  if (addresses.length) {
    const publicAddresses = addresses.filter((address) => isPublicIpAddress(address));
    const privateAddresses = addresses.filter((address) => !isPublicIpAddress(address));

    if (!privateAddresses.length) {
      result = { allowed: true, reason: "ok", addresses };
    } else if (MONITOR_PRIVATE_TARGET_ALLOWLIST.has(hostname)) {
      result = { allowed: true, reason: "allowed_private_target", addresses };
    } else if (!publicAddresses.length) {
      result = { allowed: false, reason: `private_target_forbidden:${privateAddresses[0]}`, addresses };
    } else if (MONITOR_PRIVATE_TARGET_POLICY === "all_private") {
      result = { allowed: true, reason: "mixed_target_allowed", addresses };
    } else {
      result = { allowed: false, reason: `mixed_target_forbidden:${privateAddresses[0]}`, addresses };
    }
  } else if (useCache) {
    // DNS can flap temporarily. If we have a recent successful validation result,
    // reuse its addresses so checks do not immediately flip to offline.
    const cachedAddresses = Array.isArray(cachedEntry?.result?.addresses) ? cachedEntry.result.addresses : [];
    if (cachedEntry?.result?.allowed && cachedAddresses.length) {
      result = { allowed: true, reason: "ok_stale_dns_cache", addresses: cachedAddresses };
    }
  }

  let ttlMs = MONITOR_TARGET_VALIDATE_CACHE_MS;
  const normalizedReason = normalizeTargetValidationReasonForTelemetry(result.reason);
  if (normalizedReason === "dns_unresolved") {
    // Keep unresolved cache entries short to avoid long false-offline streaks.
    ttlMs = Math.min(MONITOR_TARGET_VALIDATE_CACHE_MS, 15000);
  } else if (normalizedReason === "ok_stale_dns_cache") {
    // Revalidate stale fallback results more frequently than regular entries.
    ttlMs = Math.min(MONITOR_TARGET_VALIDATE_CACHE_MS, 60000);
  }

  monitorTargetValidationCache.set(cacheKey, {
    result,
    expiresAt: now + ttlMs,
  });
  pruneMonitorTargetValidationCache();

  return result;
}

function getClientIp(req) {
  const remoteAddress = normalizeIpLiteral(req.socket?.remoteAddress || "");
  const trustProxyHeaders = isLoopbackIpAddress(remoteAddress) || (TRUST_PROXY && isTrustedProxySourceAddress(remoteAddress));

  if (trustProxyHeaders) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
      const forwardedIp = normalizeIpLiteral(forwardedFor.split(",")[0].trim());
      if (net.isIP(forwardedIp)) {
        return forwardedIp;
      }
    }
  }

  if (net.isIP(remoteAddress)) {
    return remoteAddress;
  }
  return remoteAddress || "unknown";
}

function isStateChangingMethod(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function hasMonitorCreateRequestHeader(req) {
  return String(req?.headers?.["x-pingmyserver-create"] || "").trim() === "1";
}

function isValidOrigin(req) {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin) {
    return TRUSTED_ORIGINS.has(origin);
  }

  const refererOrigin = normalizeOrigin(req.headers.referer);
  if (refererOrigin) {
    return TRUSTED_ORIGINS.has(refererOrigin);
  }

  return false;
}

function pruneOauthStateStore(now = Date.now()) {
  for (const [state, record] of oauthStateStore.entries()) {
    if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
  while (oauthStateStore.size > OAUTH_STATE_MAX_ENTRIES) {
    const oldestState = oauthStateStore.keys().next().value;
    if (!oldestState) break;
    oauthStateStore.delete(oldestState);
  }
}

function readOauthStateBindingFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const binding = String(cookies[OAUTH_STATE_COOKIE_NAME] || "").trim();
  return binding;
}

function createOauthState(provider, res) {
  const now = Date.now();
  pruneOauthStateStore(now);
  const state = crypto.randomBytes(24).toString("hex");
  const binding = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    provider: String(provider || ""),
    expiresAt: now + GITHUB_OAUTH_STATE_TTL_SECONDS * 1000,
    bindingHash: hashSessionToken(binding),
  });
  setOauthStateCookie(res, binding);
  return state;
}

function consumeOauthState(provider, state, req) {
  const key = String(state || "");
  if (!key) return false;
  const now = Date.now();
  const record = oauthStateStore.get(key);
  oauthStateStore.delete(key);
  if (!record || record.provider !== provider) return false;
  if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now) return false;
  if (typeof record.bindingHash !== "string" || !record.bindingHash) return false;
  const binding = readOauthStateBindingFromRequest(req);
  if (!binding) return false;
  const bindingHash = hashSessionToken(binding);
  return timingSafeEqualHex(record.bindingHash, bindingHash);
}

function parseGithubScopes(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parseGoogleScopes(rawValue) {
  const normalized = new Set();
  for (const scope of String(rawValue || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    normalized.add(scope);
    if (scope === "https://www.googleapis.com/auth/userinfo.email") normalized.add("email");
    if (scope === "https://www.googleapis.com/auth/userinfo.profile") normalized.add("profile");
  }
  return normalized;
}

function parseDiscordScopes(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function fetchGitHubAccessToken(code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_CALLBACK_URL,
    }).toString();

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PingMyServer/1.0",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.error) return null;
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) return null;
    const grantedScopes = parseGithubScopes(payload?.scope);
    return { accessToken, grantedScopes };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleAccessToken(code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code",
    }).toString();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) return null;
    const grantedScopes = parseGoogleScopes(payload?.scope);
    return { accessToken, grantedScopes };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscordAccessToken(code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_CALLBACK_URL,
    }).toString();

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) return null;
    const grantedScopes = parseDiscordScopes(payload?.scope);
    return { accessToken, grantedScopes };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleUser(accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscordUser(accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "PingMyServer/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getPreferredGoogleEmail(googleUser) {
  const email = normalizeEmail(googleUser?.email);
  const emailVerifiedRaw = googleUser?.email_verified;
  const verified = emailVerifiedRaw === true || emailVerifiedRaw === "true" || emailVerifiedRaw === 1;
  if (!verified) return null;
  return isValidEmail(email) ? email : null;
}

function getPreferredDiscordEmail(discordUser) {
  const email = normalizeEmail(discordUser?.email);
  const verifiedRaw = discordUser?.verified;
  const verified = verifiedRaw === true || verifiedRaw === "true" || verifiedRaw === 1;
  if (!verified) return null;
  return isValidEmail(email) ? email : null;
}

function getPreferredDiscordLogin(discordUser) {
  const username = String(discordUser?.username || "").trim();
  const globalName = String(discordUser?.global_name || "").trim();
  const discriminator = String(discordUser?.discriminator || "").trim();
  const combined = globalName || (username ? (discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username) : "");
  return combined ? combined.slice(0, 255) : null;
}

async function fetchGitHubUser(accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "PingMyServer/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const grantedScopes = parseGithubScopes(response.headers.get("x-oauth-scopes"));
    return { payload, grantedScopes };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGitHubEmails(accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_OAUTH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "PingMyServer/1.0",
      },
      signal: controller.signal,
    });
    const grantedScopes = parseGithubScopes(response.headers.get("x-oauth-scopes"));
    if (!response.ok) {
      return { emails: [], grantedScopes, statusCode: response.status };
    }
    const payload = await response.json();
    return { emails: Array.isArray(payload) ? payload : [], grantedScopes, statusCode: response.status };
  } catch (error) {
    return { emails: [], grantedScopes: new Set(), statusCode: null };
  } finally {
    clearTimeout(timeout);
  }
}

function getPreferredGitHubEmail(userPayload, emailsPayload) {
  const fallbackUserEmail = normalizeEmail(userPayload?.email);
  const candidates = Array.isArray(emailsPayload) ? emailsPayload : [];

  for (const entry of candidates) {
    if (!entry?.verified) continue;
    if (!entry?.primary) continue;
    const email = normalizeEmail(entry.email);
    if (isValidEmail(email)) return email;
  }

  for (const entry of candidates) {
    if (!entry?.verified) continue;
    const email = normalizeEmail(entry.email);
    if (isValidEmail(email)) return email;
  }

  return isValidEmail(fallbackUserEmail) ? fallbackUserEmail : null;
}

function pruneAuthRateLimiter(now = Date.now(), preserveKey = "") {
  if (!authRateLimiter.size) return;

  for (const [ip, value] of authRateLimiter.entries()) {
    if (!value || !Number.isFinite(value.resetAt) || value.resetAt <= now) {
      authRateLimiter.delete(ip);
    }
  }

  if (authRateLimiter.size <= AUTH_RATE_LIMIT_MAX_ENTRIES) return;

  const evictionCandidates = [...authRateLimiter.entries()]
    .filter(([ip]) => ip !== preserveKey)
    .sort((left, right) => {
      const leftResetAt = Number(left[1]?.resetAt || 0);
      const rightResetAt = Number(right[1]?.resetAt || 0);
      return leftResetAt - rightResetAt;
    });

  let toEvict = authRateLimiter.size - AUTH_RATE_LIMIT_MAX_ENTRIES;
  for (const [ip] of evictionCandidates) {
    if (toEvict <= 0) break;
    authRateLimiter.delete(ip);
    toEvict -= 1;
  }

  if (authRateLimiter.size <= AUTH_RATE_LIMIT_HARD_CAP) return;
  const orderedKeys = [...authRateLimiter.keys()].filter((ip) => ip !== preserveKey);
  for (const ip of orderedKeys) {
    if (authRateLimiter.size <= AUTH_RATE_LIMIT_HARD_CAP) break;
    authRateLimiter.delete(ip);
  }
}

function enforceAuthRateLimit(req, res) {
  const now = Date.now();
  const key = getClientIp(req);
  pruneAuthRateLimiter(now, key);
  let entry = authRateLimiter.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS };
  }

  entry.count += 1;
  authRateLimiter.delete(key);
  authRateLimiter.set(key, entry);
  pruneAuthRateLimiter(now, key);

  if (entry.count > AUTH_RATE_LIMIT_MAX) {
    runtimeTelemetry.security.authRateLimited += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    sendJson(
      res,
      429,
      { ok: false, error: "too many requests" },
      { "Retry-After": String(retryAfterSeconds) }
    );
    return false;
  }

  return true;
}

async function readRawBody(req, limitBytes = REQUEST_BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        const error = new Error("payload_too_large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function readJsonBody(req, limitBytes = REQUEST_BODY_LIMIT_BYTES) {
  const rawBody = await readRawBody(req, limitBytes);
  if (!rawBody.length) {
    return {};
  }

  try {
    const text = rawBody.toString("utf8");
    return JSON.parse(text);
  } catch (error) {
    const parseError = new Error("invalid_json");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqualHex(leftHex, rightHex) {
  const left = String(leftHex || "");
  const right = String(rightHex || "");
  if (left.length !== right.length || !left.length) return false;
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    if (leftBuffer.length !== rightBuffer.length || !leftBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch (error) {
    return false;
  }
}

function isValidSessionToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

function appendSetCookieHeader(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [String(existing), cookieValue]);
}

function buildCookie(name, value, options = {}) {
  const {
    httpOnly = true,
    secure = false,
    sameSite = "Lax",
    path: cookiePath = "/",
    maxAge = null,
  } = options;
  const encodedName = String(name || "").trim();
  if (!encodedName) {
    failConfig("Cookie name must not be empty");
  }

  const encodedValue = encodeURIComponent(String(value ?? ""));
  const parts = [`${encodedName}=${encodedValue}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  parts.push(`SameSite=${sameSite}`);
  parts.push(`Path=${cookiePath}`);
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join("; ");
}

function buildSessionCookie(value, maxAgeSeconds) {
  return buildCookie(SESSION_COOKIE_NAME, value, {
    httpOnly: SESSION_COOKIE_HTTP_ONLY,
    secure: SESSION_COOKIE_SECURE,
    sameSite: SESSION_COOKIE_SAME_SITE,
    path: SESSION_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  });
}

function setSessionCookie(res, token) {
  const cookie = buildSessionCookie(token, SESSION_TTL_SECONDS);
  appendSetCookieHeader(res, cookie);
}

function clearSessionCookie(res) {
  const cookie = buildSessionCookie("", 0);
  appendSetCookieHeader(res, cookie);
}

function buildOauthStateCookie(value, maxAgeSeconds) {
  return buildCookie(OAUTH_STATE_COOKIE_NAME, value, {
    httpOnly: OAUTH_STATE_COOKIE_HTTP_ONLY,
    secure: OAUTH_STATE_COOKIE_SECURE,
    sameSite: OAUTH_STATE_COOKIE_SAME_SITE,
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  });
}

function setOauthStateCookie(res, token) {
  appendSetCookieHeader(res, buildOauthStateCookie(token, GITHUB_OAUTH_STATE_TTL_SECONDS));
}

function clearOauthStateCookie(res) {
  appendSetCookieHeader(res, buildOauthStateCookie("", 0));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== "string") return false;
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

function userToResponse(user) {
  return {
    id: Number(user.id),
    email: user.email,
    isOwner: isOwnerUserId(user.id),
    createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
  };
}

function toMs(value) {
  if (!(value instanceof Date)) return null;
  return value.getTime();
}

function toTimestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function parseStatusCodes(value) {
  if (!value) return null;
  const set = new Set();
  const entries = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!entries.length) return null;

  for (const entry of entries) {
    const rangeMatch = entry.match(/^(\d{3})-(\d{3})$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (from > to) return null;
      for (let code = from; code <= to; code += 1) {
        set.add(code);
      }
      continue;
    }

    if (!/^\d{3}$/.test(entry)) return null;
    set.add(Number(entry));
  }

  return Array.from(set).sort((a, b) => a - b);
}

function isStatusUp(statusCode) {
  if (!Number.isFinite(statusCode)) return false;
  return UP_HTTP_CODES.includes(statusCode);
}

function ratioToStatus(ratio) {
  if (ratio >= 0.999) return "ok";
  if (ratio >= 0.97) return "warn";
  return "down";
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUtcDayStartMs(input = Date.now()) {
  const date = input instanceof Date ? input : new Date(input);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatUtcDateKey(input = Date.now()) {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonitorUrl(monitor) {
  return String(monitor.url || monitor.target_url || "").trim();
}

function normalizeMonitorIntervalMs(value, fallback = DEFAULT_MONITOR_INTERVAL_MS) {
  const fallbackValue = Number(fallback);
  let fallbackMs = Number.isFinite(fallbackValue) ? Math.round(fallbackValue) : 60000;
  if (fallbackMs < MONITOR_INTERVAL_MIN_MS) fallbackMs = MONITOR_INTERVAL_MIN_MS;
  if (fallbackMs > MONITOR_INTERVAL_MAX_MS) fallbackMs = MONITOR_INTERVAL_MAX_MS;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackMs;
  const rounded = Math.round(numeric);
  if (rounded < MONITOR_INTERVAL_MIN_MS) return MONITOR_INTERVAL_MIN_MS;
  if (rounded > MONITOR_INTERVAL_MAX_MS) return MONITOR_INTERVAL_MAX_MS;
  return rounded;
}

function getMonitorIntervalMs(monitor) {
  const value = Number(monitor.interval_ms);
  if (!Number.isFinite(value) || value <= 0) return normalizeMonitorIntervalMs(DEFAULT_MONITOR_INTERVAL_MS);
  return normalizeMonitorIntervalMs(value, DEFAULT_MONITOR_INTERVAL_MS);
}

function normalizeMonitorHttpAssertionString(value, maxLen) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ");
  if (normalized.length <= maxLen) return normalized;
  return normalized.slice(0, maxLen);
}

function normalizeMonitorHttpAssertionStatusCodes(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .join(",");
  if (!normalized) return "";
  const parsed = parseStatusCodes(normalized);
  if (!parsed || !parsed.length) return null;
  return normalized;
}

function clampMonitorHttpAssertionNumber(value, options = {}) {
  const { min = 0, max = 120000, fallback = 0 } = options;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function getMonitorHttpAssertionsConfig(monitor) {
  const enabled = !!monitor?.http_assertions_enabled;
  const expectedStatusCodesRaw = String(monitor?.http_expected_status_codes || "").trim();
  const expectedStatusCodesParsed = expectedStatusCodesRaw ? parseStatusCodes(expectedStatusCodesRaw) : null;

  const followRedirects = monitor?.http_follow_redirects === undefined ? true : !!monitor.http_follow_redirects;
  const maxRedirects = clampMonitorHttpAssertionNumber(monitor?.http_max_redirects, { min: 0, max: 10, fallback: 5 });
  const timeoutMs = clampMonitorHttpAssertionNumber(monitor?.http_timeout_ms, { min: 0, max: 120000, fallback: 0 });

  const contentTypeContains = normalizeMonitorHttpAssertionString(monitor?.http_content_type_contains, 128);
  const bodyContains = normalizeMonitorHttpAssertionString(monitor?.http_body_contains, 512);

  return {
    enabled,
    expectedStatusCodesRaw: expectedStatusCodesRaw || "",
    expectedStatusCodes: Array.isArray(expectedStatusCodesParsed) ? expectedStatusCodesParsed : [],
    contentTypeContains,
    bodyContains,
    followRedirects,
    maxRedirects,
    timeoutMs,
  };
}

function serializeMonitorHttpAssertionsConfig(monitor) {
  const config = getMonitorHttpAssertionsConfig(monitor);
  return {
    enabled: config.enabled,
    expectedStatusCodes: config.expectedStatusCodesRaw,
    contentTypeContains: config.contentTypeContains,
    bodyContains: config.bodyContains,
    followRedirects: config.followRedirects,
    maxRedirects: config.maxRedirects,
    timeoutMs: config.timeoutMs,
  };
}

function getMonitorLastCheckMs(monitor) {
  if (monitor.last_checked_at instanceof Date) return monitor.last_checked_at.getTime();
  if (monitor.last_check_at instanceof Date) return monitor.last_check_at.getTime();
  return 0;
}

function decodeBase64UrlUtf8(input, maxBytes = 4096) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) return "";

  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);

  try {
    const decoded = Buffer.from(padded, "base64");
    if (!decoded.length) return "";
    if (decoded.length > maxBytes) return "";
    return decoded.toString("utf8").trim();
  } catch (error) {
    return "";
  }
}

function normalizeMonitorUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return null;

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
    raw = `https://${raw}`;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname) {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  parsed.hash = "";
  const normalized = parsed.toString();
  if (normalized.length > 2048) {
    return null;
  }
  return normalized;
}

const DISCORD_WEBHOOK_ALLOWED_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "ptb.discordapp.com",
  "canary.discord.com",
  "canary.discordapp.com",
]);

function normalizeDiscordWebhookUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  const hostname = String(parsed.hostname || "").trim().toLowerCase();
  if (!DISCORD_WEBHOOK_ALLOWED_HOSTS.has(hostname)) return null;

  const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
  const match = pathname.match(/^\/api\/webhooks\/(\d+)\/([A-Za-z0-9._-]+)$/);
  if (!match) return null;

  return `https://${hostname}/api/webhooks/${match[1]}/${match[2]}`;
}

function maskDiscordWebhookUrl(input) {
  const normalized = normalizeDiscordWebhookUrl(input);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const pathParts = parsed.pathname.split("/");
    const webhookId = String(pathParts[3] || "").trim();
    const token = String(pathParts[4] || "").trim();
    const maskedToken = token.length <= 8 ? "***" : `${token.slice(0, 4)}...${token.slice(-4)}`;
    return `https://${parsed.hostname}/api/webhooks/${webhookId}/${maskedToken}`;
  } catch (error) {
    return null;
  }
}

const SLACK_WEBHOOK_ALLOWED_HOSTS = new Set(["hooks.slack.com"]);

function normalizeSlackWebhookUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  const hostname = String(parsed.hostname || "").trim().toLowerCase();
  if (!SLACK_WEBHOOK_ALLOWED_HOSTS.has(hostname)) return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;

  const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
  const match = pathname.match(/^\/services\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/);
  if (!match) return null;

  return `https://${hostname}/services/${match[1]}/${match[2]}/${match[3]}`;
}

function maskSlackWebhookUrl(input) {
  const normalized = normalizeSlackWebhookUrl(input);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const pathParts = parsed.pathname.split("/");
    const token = String(pathParts[4] || "").trim();
    const maskedToken = token.length <= 8 ? "***" : `${token.slice(0, 4)}...${token.slice(-4)}`;
    return `https://${parsed.hostname}/services/${pathParts[2]}/${pathParts[3]}/${maskedToken}`;
  } catch (error) {
    return null;
  }
}

function normalizeGenericWebhookUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;

  parsed.hash = "";
  const normalized = parsed.toString();
  if (normalized.length > 2048) {
    return null;
  }
  return normalized;
}

function maskGenericWebhookUrl(input) {
  const normalized = normalizeGenericWebhookUrl(input);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const base = `${parsed.origin}${parsed.pathname}`;
    return parsed.search ? `${base}?***` : base;
  } catch (error) {
    return null;
  }
}

const WEBHOOK_SECRET_MAX_LENGTH = 255;

function normalizeWebhookSecret(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  return raw.slice(0, WEBHOOK_SECRET_MAX_LENGTH);
}

async function validateOutboundWebhookTarget(targetUrl) {
  let parsed;
  try {
    parsed = new URL(String(targetUrl || ""));
  } catch (error) {
    return { allowed: false, reason: "invalid_url", addresses: [] };
  }

  if (parsed.protocol !== "https:") {
    return { allowed: false, reason: "invalid_protocol", addresses: [] };
  }

  const hostname = String(parsed.hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!hostname || isLocalHostname(hostname)) {
    return { allowed: false, reason: "local_target_forbidden", addresses: [] };
  }

  const addresses = await resolveMonitorTargetAddresses(hostname);
  if (!addresses.length) {
    return { allowed: false, reason: "dns_unresolved", addresses: [] };
  }

  const publicAddresses = addresses.filter((address) => isPublicIpAddress(address));
  const privateAddresses = addresses.filter((address) => !isPublicIpAddress(address));
  if (privateAddresses.length) {
    if (!publicAddresses.length) {
      return { allowed: false, reason: "private_target_forbidden", addresses };
    }
    return { allowed: false, reason: "mixed_target_forbidden", addresses };
  }

  return { allowed: true, reason: "ok", addresses };
}

function getDefaultMonitorName(urlValue) {
  try {
    return new URL(urlValue).hostname;
  } catch (error) {
    return urlValue.slice(0, 255);
  }
}

function isValidMonitorPublicId(value) {
  if (typeof value !== "string") return false;
  const regex = new RegExp(`^[A-Za-z0-9]{${MONITOR_PUBLIC_ID_LENGTH}}$`);
  return regex.test(value);
}

function createMonitorPublicId() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let output = "";
  for (let i = 0; i < MONITOR_PUBLIC_ID_LENGTH; i += 1) {
    output += alphabet[crypto.randomInt(alphabet.length)];
  }
  return output;
}

async function generateUniqueMonitorPublicId(maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = createMonitorPublicId();
    const [rows] = await pool.query("SELECT id FROM monitors WHERE public_id = ? LIMIT 1", [candidate]);
    if (!rows.length) return candidate;
  }
  throw new Error("monitor_public_id_generation_failed");
}

function createDefaultTargetMeta(hostname = null, protocol = "https:") {
  return {
    location: hostname
      ? { host: hostname, ip: null, lat: null, lon: null, city: "", region: "", country: "", org: "" }
      : null,
    network: { scope: "unknown", provider: null },
    domainSsl: {
      host: hostname,
      domainExpiresAt: null,
      domainSource: null,
      domainNote: null,
      sslExpiresAt: null,
      sslIssuer: null,
      sslAvailable: protocol === "https:",
      checkedAt: Date.now(),
    },
  };
}

function getTargetMetaCacheKey(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return `${parsed.protocol}//${parsed.hostname}:${port}`;
  } catch (error) {
    return String(targetUrl || "");
  }
}

function pruneTargetMetaCache() {
  if (targetMetaCache.size <= TARGET_META_CACHE_MAX) return;
  const keys = [...targetMetaCache.keys()];
  while (targetMetaCache.size > TARGET_META_CACHE_MAX && keys.length) {
    targetMetaCache.delete(keys.shift());
  }
}

async function fetchJson(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/rdap+json, application/json;q=0.9, */*;q=0.8",
        "User-Agent": "PingMyServer/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseExpiryTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function extractDomainExpiryFromRdap(payload) {
  if (!payload || typeof payload !== "object") return null;

  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const event of events) {
    const action = String(event.eventAction || "").toLowerCase();
    if (!action.includes("expir")) continue;
    const timestamp = parseExpiryTimestamp(event.eventDate);
    if (timestamp) return timestamp;
  }

  const fallbackCandidates = [
    payload.expirationDate,
    payload.expiryDate,
    payload.expires,
    payload.expiresAt,
    payload.registryExpiryDate,
  ];

  for (const value of fallbackCandidates) {
    const timestamp = parseExpiryTimestamp(value);
    if (timestamp) return timestamp;
  }

  return null;
}

function rdapEndpointsForDomain(domain) {
  const encoded = encodeURIComponent(domain);
  const tld = domain.split(".").pop()?.toLowerCase() || "";
  const endpoints = [`https://rdap.org/domain/${encoded}`];
  if (tld === "de") {
    endpoints.unshift(`https://rdap.denic.de/domain/${encoded}`);
  }
  return endpoints;
}

async function fetchDomainExpiry(domain) {
  const endpoints = rdapEndpointsForDomain(domain);
  let hasPayload = false;
  let lastSource = null;

  for (const endpoint of endpoints) {
    const payload = await fetchJson(endpoint, RDAP_LOOKUP_TIMEOUT_MS);
    if (!payload) continue;

    hasPayload = true;
    lastSource = endpoint;
    const expiresAt = extractDomainExpiryFromRdap(payload);
    if (expiresAt) {
      return { expiresAt, source: endpoint, note: null };
    }
  }

  if (hasPayload) {
    return { expiresAt: null, source: lastSource, note: "public_unavailable" };
  }

  return { expiresAt: null, source: null, note: "lookup_failed" };
}

async function resolveTargetIp(hostname) {
  try {
    const lookup = await dns.lookup(hostname);
    if (lookup?.address) return lookup.address;
  } catch (error) {
    // continue with resolver fallbacks
  }

  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length) return addresses[0];
  } catch (error) {
    // fallback to IPv6
  }

  try {
    const addresses = await dns.resolve6(hostname);
    if (addresses.length) return addresses[0];
  } catch (error) {
    // ignore
  }

  return null;
}

function normalizeLocationFromIpapi(data, fallbackIp, host) {
  if (!data || data.error) return null;
  const lat = Number(data.latitude ?? data.lat);
  const lon = Number(data.longitude ?? data.lon);
  return {
    host,
    ip: data.ip || fallbackIp,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    city: data.city || "",
    region: data.region || data.region_code || "",
    country: data.country_name || data.country || "",
    org: data.org || data.asn || data.network || "",
  };
}

function normalizeLocationFromIpwhois(data, fallbackIp, host) {
  if (!data || data.success === false) return null;
  const lat = Number(data.latitude ?? data.lat);
  const lon = Number(data.longitude ?? data.lon);
  return {
    host,
    ip: data.ip || fallbackIp,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    city: data.city || "",
    region: data.region || data.region_code || "",
    country: data.country || data.country_name || "",
    org: data.connection?.org || data.connection?.isp || data.asn_org || data.org || "",
  };
}

function detectNetworkByOrg(org) {
  if (!org) return null;
  const text = String(org).toLowerCase();
  if (text.includes("cloudflare")) return { scope: "edge", provider: "Cloudflare" };
  if (text.includes("amazon") || text.includes("cloudfront")) return { scope: "edge", provider: "CloudFront" };
  if (text.includes("fastly")) return { scope: "edge", provider: "Fastly" };
  if (text.includes("akamai")) return { scope: "edge", provider: "Akamai" };
  if (text.includes("vercel")) return { scope: "edge", provider: "Vercel Edge" };
  return null;
}

async function fetchSslInfo(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: CHECK_TIMEOUT_MS,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const expiresAt = parseExpiryTimestamp(cert?.valid_to);
          const issuer = cert?.issuer?.O || cert?.issuer?.CN || null;
          socket.end();
          resolve({ expiresAt, issuer });
        } catch (error) {
          socket.destroy();
          resolve({ expiresAt: null, issuer: null });
        }
      }
    );

    socket.on("error", () => {
      resolve({ expiresAt: null, issuer: null });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ expiresAt: null, issuer: null });
    });
  });
}

async function loadTargetMeta(targetUrl) {
  let target;
  try {
    target = new URL(targetUrl);
  } catch (error) {
    return createDefaultTargetMeta();
  }

  const targetValidation = await validateMonitorTarget(target.toString(), { useCache: false });
  if (!targetValidation.allowed) {
    return createDefaultTargetMeta(target.hostname, target.protocol);
  }

  const hostname = target.hostname;
  const fallback = createDefaultTargetMeta(hostname, target.protocol);
  const isIpTarget = net.isIP(hostname) !== 0;

  let ip = null;
  if (isIpTarget) {
    ip = hostname;
  } else {
    ip = await resolveTargetIp(hostname);
  }

  const locationFallback = {
    host: hostname,
    ip,
    lat: null,
    lon: null,
    city: "",
    region: "",
    country: "",
    org: "",
  };

  let location = locationFallback;
  if (ip) {
    const encodedIp = encodeURIComponent(ip);
    const locationFromIpapi = normalizeLocationFromIpapi(
      await fetchJson(`https://ipapi.co/${encodedIp}/json/`, GEO_LOOKUP_TIMEOUT_MS),
      ip,
      hostname
    );
    if (locationFromIpapi) {
      location = locationFromIpapi;
    } else {
      const locationFromIpwhois = normalizeLocationFromIpwhois(
        await fetchJson(`https://ipwho.is/${encodedIp}`, GEO_LOOKUP_TIMEOUT_MS),
        ip,
        hostname
      );
      if (locationFromIpwhois) {
        location = locationFromIpwhois;
      }
    }
  }

  const inferredNetwork = detectNetworkByOrg(location.org);
  const network = inferredNetwork || { scope: "origin", provider: null };

  let domainExpiresAt = null;
  let domainSource = null;
  let domainNote = null;
  if (isIpTarget) {
    domainNote = "ip_target";
  } else {
    const domainInfo = await fetchDomainExpiry(hostname);
    domainExpiresAt = domainInfo.expiresAt;
    domainSource = domainInfo.source;
    domainNote = domainInfo.note;
  }

  let sslExpiresAt = null;
  let sslIssuer = null;
  const sslAvailable = target.protocol === "https:";
  if (sslAvailable) {
    const sslPort = target.port ? Number(target.port) : 443;
    const sslInfo = await fetchSslInfo(hostname, sslPort);
    sslExpiresAt = sslInfo.expiresAt;
    sslIssuer = sslInfo.issuer;
  }

  return {
    location,
    network,
    domainSsl: {
      host: hostname,
      domainExpiresAt,
      domainSource,
      domainNote,
      sslExpiresAt,
      sslIssuer,
      sslAvailable,
      checkedAt: Date.now(),
    },
  };
}

async function getTargetMeta(targetUrl) {
  const key = getTargetMetaCacheKey(targetUrl);
  const now = Date.now();
  const cached = targetMetaCache.get(key);

  if (cached?.data && cached.expiresAt > now) {
    return cached.data;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const fallbackData = cached?.data || createDefaultTargetMeta();
  const promise = loadTargetMeta(targetUrl)
    .then((data) => {
      targetMetaCache.set(key, {
        data,
        expiresAt: Date.now() + Math.max(60000, TARGET_META_REFRESH_MS),
        promise: null,
      });
      pruneTargetMetaCache();
      return data;
    })
    .catch((error) => {
      console.error("target_meta_failed", key, error?.message || error);
      targetMetaCache.set(key, {
        data: fallbackData,
        expiresAt: Date.now() + 60000,
        promise: null,
      });
      return fallbackData;
    });

  targetMetaCache.set(key, {
    data: cached?.data || null,
    expiresAt: cached?.expiresAt || 0,
    promise,
  });
  pruneTargetMetaCache();
  return promise;
}

function getMonitorFaviconCacheKey(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return `${parsed.protocol}//${hostname}:${port}`;
  } catch (error) {
    return String(targetUrl || "");
  }
}

function pruneMonitorFaviconCache() {
  if (monitorFaviconCache.size <= MONITOR_FAVICON_CACHE_MAX) return;
  const keys = [...monitorFaviconCache.keys()];
  while (monitorFaviconCache.size > MONITOR_FAVICON_CACHE_MAX && keys.length) {
    monitorFaviconCache.delete(keys.shift());
  }
}

function normalizeImageContentType(rawValue, sourceUrl = "") {
  const value = String(rawValue || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const allowed = new Set([
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/png",
    "image/svg+xml",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ]);
  if (allowed.has(value)) {
    return value;
  }

  const lowerSource = String(sourceUrl || "").toLowerCase();
  if (lowerSource.endsWith(".ico")) return "image/x-icon";
  if (lowerSource.endsWith(".png")) return "image/png";
  if (lowerSource.endsWith(".svg")) return "image/svg+xml";
  if (lowerSource.endsWith(".jpg") || lowerSource.endsWith(".jpeg")) return "image/jpeg";
  if (lowerSource.endsWith(".webp")) return "image/webp";
  if (lowerSource.endsWith(".gif")) return "image/gif";
  return null;
}

async function fetchImageAsset(url, timeoutMs = MONITOR_FAVICON_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "PingMyServer/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MONITOR_FAVICON_MAX_BYTES) {
      return null;
    }

    const contentType = normalizeImageContentType(response.headers.get("content-type"), url);
    if (!contentType) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MONITOR_FAVICON_MAX_BYTES) return null;

    return {
      buffer,
      contentType,
    };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMonitorFaviconCandidates(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (error) {
    return [];
  }

  const hostname = String(parsed.hostname || "").trim().toLowerCase();
  if (!hostname) return [];

  const host = parsed.host;
  const baseUrls = [`${parsed.protocol}//${host}/favicon.ico`, `${parsed.protocol}//${host}/favicon.png`];
  if (parsed.protocol === "http:") {
    baseUrls.push(`https://${host}/favicon.ico`);
  }

  if (net.isIP(hostname) === 0 && !isLocalHostname(hostname)) {
    baseUrls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`);
  }

  return Array.from(new Set(baseUrls));
}

async function loadMonitorFavicon(targetUrl) {
  const candidates = buildMonitorFaviconCandidates(targetUrl);
  for (const candidateUrl of candidates) {
    const icon = await fetchImageAsset(candidateUrl);
    if (icon?.buffer?.length) {
      return icon;
    }
  }
  return null;
}

async function getMonitorFavicon(targetUrl) {
  const key = getMonitorFaviconCacheKey(targetUrl);
  const now = Date.now();
  const cached = monitorFaviconCache.get(key);

  if (cached?.icon && cached.expiresAt > now) {
    return cached.icon;
  }
  if (cached?.missing && cached.expiresAt > now) {
    return null;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const fallbackIcon = cached?.icon || null;
  const promise = loadMonitorFavicon(targetUrl)
    .then((icon) => {
      monitorFaviconCache.set(key, {
        icon: icon || null,
        missing: !icon,
        expiresAt: Date.now() + (icon ? MONITOR_FAVICON_CACHE_MS : MONITOR_FAVICON_NEGATIVE_CACHE_MS),
        promise: null,
      });
      pruneMonitorFaviconCache();
      return icon;
    })
    .catch((error) => {
      console.error("monitor_favicon_failed", key, error?.message || error);
      monitorFaviconCache.set(key, {
        icon: fallbackIcon,
        missing: !fallbackIcon,
        expiresAt: Date.now() + (fallbackIcon ? 60000 : MONITOR_FAVICON_NEGATIVE_CACHE_MS),
        promise: null,
      });
      pruneMonitorFaviconCache();
      return fallbackIcon;
    });

  monitorFaviconCache.set(key, {
    icon: cached?.icon || null,
    missing: !!cached?.missing,
    expiresAt: cached?.expiresAt || 0,
    promise,
  });
  pruneMonitorFaviconCache();
  return promise;
}

async function handleMonitorFavicon(req, res, monitor) {
  const targetUrl = getMonitorUrl(monitor);
  if (!targetUrl) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const icon = await getMonitorFavicon(targetUrl);
  if (!icon?.buffer?.length) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": icon.contentType || "image/x-icon",
    "Cache-Control": "public, max-age=1800",
  });
  res.end(icon.buffer);
}

function truncateErrorMessage(error) {
  if (!error) return null;
  const source = [error.name || "Error", error.message || ""]
    .filter(Boolean)
    .join(": ")
    .trim();
  if (!source) return null;
  return source.slice(0, 255);
}

async function hasColumn(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function hasIndex(tableName, indexName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function hasUniqueIndexOnColumn(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND non_unique = 0
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function hasForeignKey(tableName, constraintName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
    `,
    [tableName, constraintName]
  );
  return rows.length > 0;
}

async function hasForeignKeyReference(tableName, columnName, referencedTableName, referencedColumnName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND referenced_table_name = ?
        AND referenced_column_name = ?
      LIMIT 1
    `,
    [tableName, columnName, referencedTableName, referencedColumnName]
  );
  return rows.length > 0;
}

async function getColumnMetadata(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT
        column_name,
        column_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows[0] || null;
}

function normalizeColumnType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function ensureMonitorReferenceColumnType(tableName, columnName, monitorIdColumnType) {
  const column = await getColumnMetadata(tableName, columnName);
  if (!column) return;

  const currentType = normalizeColumnType(column.column_type);
  const targetType = normalizeColumnType(monitorIdColumnType);
  const isNullable = String(column.is_nullable || "").toUpperCase() === "YES";
  if (currentType === targetType && !isNullable) return;

  await pool.query(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${monitorIdColumnType} NOT NULL`);
}

async function ensureSchemaCompatibility() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_daily_stats (
      monitor_id BIGINT NOT NULL,
      day_date DATE NOT NULL,
      checks_total INT NOT NULL DEFAULT 0,
      checks_ok INT NOT NULL DEFAULT 0,
      checks_error INT NOT NULL DEFAULT 0,
      response_min_ms INT NULL,
      response_max_ms INT NULL,
      response_avg_ms DECIMAL(10,2) NULL,
      uptime_percent DECIMAL(7,4) NULL,
      down_minutes INT NOT NULL DEFAULT 0,
      incidents INT NOT NULL DEFAULT 0,
      start_ok TINYINT(1) NULL,
      end_ok TINYINT(1) NULL,
      first_checked_at DATETIME(3) NULL,
      last_checked_at DATETIME(3) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (monitor_id, day_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_daily_error_codes (
      monitor_id BIGINT NOT NULL,
      day_date DATE NOT NULL,
      error_code VARCHAR(32) NOT NULL,
      hits INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (monitor_id, day_date, error_code),
      INDEX idx_daily_error_day (day_date)
    )
  `);

  if (!(await hasColumn("users", "github_id"))) {
    await pool.query("ALTER TABLE users ADD COLUMN github_id VARCHAR(64) NULL AFTER password_hash");
  }
  if (!(await hasColumn("users", "github_login"))) {
    await pool.query("ALTER TABLE users ADD COLUMN github_login VARCHAR(255) NULL AFTER github_id");
  }
  if (!(await hasUniqueIndexOnColumn("users", "github_id"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_users_github_id ON users(github_id)");
  }
  if (!(await hasColumn("users", "google_sub"))) {
    await pool.query("ALTER TABLE users ADD COLUMN google_sub VARCHAR(128) NULL AFTER github_login");
  }
  if (!(await hasColumn("users", "google_email"))) {
    await pool.query("ALTER TABLE users ADD COLUMN google_email VARCHAR(255) NULL AFTER google_sub");
  }
  if (!(await hasUniqueIndexOnColumn("users", "google_sub"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_users_google_sub ON users(google_sub)");
  }
  if (!(await hasColumn("users", "discord_id"))) {
    await pool.query("ALTER TABLE users ADD COLUMN discord_id VARCHAR(64) NULL AFTER google_email");
  }
  if (!(await hasColumn("users", "discord_username"))) {
    await pool.query("ALTER TABLE users ADD COLUMN discord_username VARCHAR(255) NULL AFTER discord_id");
  }
  if (!(await hasColumn("users", "discord_email"))) {
    await pool.query("ALTER TABLE users ADD COLUMN discord_email VARCHAR(255) NULL AFTER discord_username");
  }
  if (!(await hasColumn("users", "notify_discord_webhook_url"))) {
    await pool.query("ALTER TABLE users ADD COLUMN notify_discord_webhook_url VARCHAR(2048) NULL AFTER discord_email");
  }
  if (!(await hasColumn("users", "notify_discord_enabled"))) {
    await pool.query("ALTER TABLE users ADD COLUMN notify_discord_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_discord_webhook_url");
  }
  if (!(await hasColumn("users", "notify_slack_webhook_url"))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN notify_slack_webhook_url VARCHAR(2048) NULL AFTER notify_discord_enabled"
    );
  }
  if (!(await hasColumn("users", "notify_slack_enabled"))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN notify_slack_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_slack_webhook_url"
    );
  }
  if (!(await hasColumn("users", "notify_webhook_url"))) {
    await pool.query("ALTER TABLE users ADD COLUMN notify_webhook_url VARCHAR(2048) NULL AFTER notify_slack_enabled");
  }
  if (!(await hasColumn("users", "notify_webhook_enabled"))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN notify_webhook_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_webhook_url"
    );
  }
  if (!(await hasColumn("users", "notify_webhook_secret"))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN notify_webhook_secret VARCHAR(255) NULL AFTER notify_webhook_enabled"
    );
  }
  if (!(await hasColumn("users", "stripe_customer_id"))) {
    await pool.query("ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER notify_webhook_secret");
  }
  if (!(await hasColumn("users", "stripe_subscription_id"))) {
    await pool.query("ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id");
  }
  if (!(await hasColumn("users", "stripe_price_id"))) {
    await pool.query("ALTER TABLE users ADD COLUMN stripe_price_id VARCHAR(255) NULL AFTER stripe_subscription_id");
  }
  if (!(await hasColumn("users", "stripe_subscription_status"))) {
    await pool.query("ALTER TABLE users ADD COLUMN stripe_subscription_status VARCHAR(64) NULL AFTER stripe_price_id");
  }
  if (!(await hasColumn("users", "stripe_current_period_end"))) {
    await pool.query("ALTER TABLE users ADD COLUMN stripe_current_period_end DATETIME NULL AFTER stripe_subscription_status");
  }
  await pool.query(
    "UPDATE users SET notify_discord_enabled = 0 WHERE notify_discord_enabled IS NULL OR notify_discord_enabled NOT IN (0, 1)"
  );
  await pool.query(
    "UPDATE users SET notify_slack_enabled = 0 WHERE notify_slack_enabled IS NULL OR notify_slack_enabled NOT IN (0, 1)"
  );
  await pool.query(
    "UPDATE users SET notify_webhook_enabled = 0 WHERE notify_webhook_enabled IS NULL OR notify_webhook_enabled NOT IN (0, 1)"
  );
  if (!(await hasUniqueIndexOnColumn("users", "discord_id"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_users_discord_id ON users(discord_id)");
  }
  if (!(await hasUniqueIndexOnColumn("users", "stripe_customer_id"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_users_stripe_customer_id ON users(stripe_customer_id)");
  }
  if (!(await hasUniqueIndexOnColumn("users", "stripe_subscription_id"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_users_stripe_subscription_id ON users(stripe_subscription_id)");
  }

  if (!(await hasColumn("monitors", "public_id"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN public_id CHAR(12) NULL AFTER id");
  }
  if (!(await hasColumn("monitors", "user_id"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN user_id BIGINT NULL AFTER id");
  }
  if (!(await hasColumn("monitors", "url"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN url VARCHAR(2048) NULL AFTER name");
  }
  if (!(await hasColumn("monitors", "target_url"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN target_url VARCHAR(2048) NULL AFTER url");
  }
  if (!(await hasColumn("monitors", "interval_ms"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN interval_ms INT NOT NULL DEFAULT 60000 AFTER target_url"
    );
  }
  if (!(await hasColumn("monitors", "http_assertions_enabled"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_assertions_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER interval_ms"
    );
  }
  if (!(await hasColumn("monitors", "http_expected_status_codes"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_expected_status_codes VARCHAR(128) NULL AFTER http_assertions_enabled"
    );
  }
  if (!(await hasColumn("monitors", "http_content_type_contains"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_content_type_contains VARCHAR(128) NULL AFTER http_expected_status_codes"
    );
  }
  if (!(await hasColumn("monitors", "http_body_contains"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_body_contains VARCHAR(512) NULL AFTER http_content_type_contains"
    );
  }
  if (!(await hasColumn("monitors", "http_follow_redirects"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_follow_redirects TINYINT(1) NOT NULL DEFAULT 1 AFTER http_body_contains"
    );
  }
  if (!(await hasColumn("monitors", "http_max_redirects"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_max_redirects INT NOT NULL DEFAULT 5 AFTER http_follow_redirects"
    );
  }
  if (!(await hasColumn("monitors", "http_timeout_ms"))) {
    await pool.query(
      "ALTER TABLE monitors ADD COLUMN http_timeout_ms INT NOT NULL DEFAULT 0 AFTER http_max_redirects"
    );
  }
  if (!(await hasColumn("monitors", "is_paused"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN is_paused TINYINT(1) NOT NULL DEFAULT 0 AFTER interval_ms");
  }
  if (!(await hasColumn("monitors", "last_checked_at"))) {
    await pool.query("ALTER TABLE monitors ADD COLUMN last_checked_at DATETIME(3) NULL AFTER last_check_at");
  }

  if (!(await hasColumn("monitor_checks", "error_message"))) {
    await pool.query("ALTER TABLE monitor_checks ADD COLUMN error_message VARCHAR(255) NULL AFTER status_code");
  }

  if (!(await hasColumn("monitor_daily_stats", "incidents"))) {
    await pool.query("ALTER TABLE monitor_daily_stats ADD COLUMN incidents INT NOT NULL DEFAULT 0 AFTER down_minutes");
  }
  if (!(await hasColumn("monitor_daily_stats", "start_ok"))) {
    await pool.query("ALTER TABLE monitor_daily_stats ADD COLUMN start_ok TINYINT(1) NULL AFTER incidents");
  }
  if (!(await hasColumn("monitor_daily_stats", "end_ok"))) {
    await pool.query("ALTER TABLE monitor_daily_stats ADD COLUMN end_ok TINYINT(1) NULL AFTER start_ok");
  }
  if (!(await hasColumn("monitor_daily_stats", "first_checked_at"))) {
    await pool.query(
      "ALTER TABLE monitor_daily_stats ADD COLUMN first_checked_at DATETIME(3) NULL AFTER end_ok"
    );
  }
  if (!(await hasColumn("monitor_daily_stats", "last_checked_at"))) {
    await pool.query(
      "ALTER TABLE monitor_daily_stats ADD COLUMN last_checked_at DATETIME(3) NULL AFTER first_checked_at"
    );
  }

  if (!(await hasIndex("monitor_daily_stats", "idx_daily_day_date"))) {
    await pool.query("CREATE INDEX idx_daily_day_date ON monitor_daily_stats(day_date)");
  }
  if (!(await hasIndex("monitor_daily_error_codes", "idx_daily_error_day"))) {
    await pool.query("CREATE INDEX idx_daily_error_day ON monitor_daily_error_codes(day_date)");
  }

  await pool.query(
    "UPDATE monitors SET url = target_url WHERE (url IS NULL OR url = '') AND target_url IS NOT NULL"
  );
  await pool.query(
    "UPDATE monitors SET target_url = url WHERE (target_url IS NULL OR target_url = '') AND url IS NOT NULL"
  );
  const safeDefaultIntervalMs = normalizeMonitorIntervalMs(DEFAULT_MONITOR_INTERVAL_MS);
  await pool.query(
    "UPDATE monitors SET interval_ms = ? WHERE interval_ms IS NULL OR interval_ms <= 0",
    [safeDefaultIntervalMs]
  );
  await pool.query("UPDATE monitors SET interval_ms = ? WHERE interval_ms < ?", [
    MONITOR_INTERVAL_MIN_MS,
    MONITOR_INTERVAL_MIN_MS,
  ]);
  await pool.query("UPDATE monitors SET interval_ms = ? WHERE interval_ms > ?", [
    MONITOR_INTERVAL_MAX_MS,
    MONITOR_INTERVAL_MAX_MS,
  ]);
  await pool.query("UPDATE monitors SET is_paused = 0 WHERE is_paused IS NULL");
  await pool.query(
    "UPDATE monitors SET name = LEFT(COALESCE(url, target_url, CONCAT('Monitor-', id)), 255) WHERE name IS NULL OR name = ''"
  );

  const [missingPublicIds] = await pool.query(
    `
      SELECT id
      FROM monitors
      WHERE public_id IS NULL
         OR CHAR_LENGTH(public_id) <> ?
         OR public_id REGEXP '[^A-Za-z0-9]'
      ORDER BY id ASC
    `,
    [MONITOR_PUBLIC_ID_LENGTH]
  );

  for (const row of missingPublicIds) {
    const publicId = await generateUniqueMonitorPublicId();
    await pool.query("UPDATE monitors SET public_id = ? WHERE id = ? LIMIT 1", [publicId, row.id]);
  }

  if (!(await hasUniqueIndexOnColumn("monitors", "public_id"))) {
    await pool.query("CREATE UNIQUE INDEX uniq_monitors_public_id ON monitors(public_id)");
  }

  try {
    await pool.query("ALTER TABLE monitors MODIFY COLUMN public_id CHAR(12) NOT NULL");
  } catch (error) {
    console.warn("Could not enforce monitors.public_id NOT NULL automatically:", error.code || error.message);
  }

  if (!(await hasIndex("monitors", "idx_monitors_user_id"))) {
    await pool.query("CREATE INDEX idx_monitors_user_id ON monitors(user_id)");
  }

  // Remove orphan monitor records from legacy data so FK creation can succeed.
  await pool.query(`
    DELETE m
    FROM monitors m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.user_id IS NOT NULL
      AND u.id IS NULL
  `);

  if (!(await hasForeignKey("monitors", "fk_monitors_user"))) {
    try {
      await pool.query(
        "ALTER TABLE monitors ADD CONSTRAINT fk_monitors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_monitors_user automatically:", error.code || error.message);
    }
  }

  const monitorIdColumn = await getColumnMetadata("monitors", "id");
  if (monitorIdColumn?.column_type) {
    const targetMonitorIdColumnType = String(monitorIdColumn.column_type).trim();

    try {
      await ensureMonitorReferenceColumnType("monitor_checks", "monitor_id", targetMonitorIdColumnType);
      await ensureMonitorReferenceColumnType("monitor_daily_stats", "monitor_id", targetMonitorIdColumnType);
      await ensureMonitorReferenceColumnType("monitor_daily_error_codes", "monitor_id", targetMonitorIdColumnType);
      await ensureMonitorReferenceColumnType("maintenances", "monitor_id", targetMonitorIdColumnType);
    } catch (error) {
      console.warn("Could not align monitor reference column types automatically:", error.code || error.message);
    }
  }

  const userIdColumn = await getColumnMetadata("users", "id");
  if (userIdColumn?.column_type) {
    const targetUserIdColumnType = String(userIdColumn.column_type).trim();
    try {
      await ensureMonitorReferenceColumnType("maintenances", "user_id", targetUserIdColumnType);
    } catch (error) {
      console.warn("Could not align user reference column types automatically:", error.code || error.message);
    }
  }

  // Remove orphan monitor rows from legacy data before creating missing FKs.
  await pool.query(`
    DELETE c
    FROM monitor_checks c
    LEFT JOIN monitors m ON m.id = c.monitor_id
    WHERE m.id IS NULL
  `);
  await pool.query(`
    DELETE ds
    FROM monitor_daily_stats ds
    LEFT JOIN monitors m ON m.id = ds.monitor_id
    WHERE m.id IS NULL
  `);
  await pool.query(`
    DELETE de
    FROM monitor_daily_error_codes de
    LEFT JOIN monitors m ON m.id = de.monitor_id
    WHERE m.id IS NULL
  `);

  await pool.query(`
    DELETE mt
    FROM maintenances mt
    LEFT JOIN monitors m ON m.id = mt.monitor_id
    WHERE m.id IS NULL
  `);
  await pool.query(`
    DELETE mt
    FROM maintenances mt
    LEFT JOIN users u ON u.id = mt.user_id
    WHERE u.id IS NULL
  `);

  if (!(await hasForeignKeyReference("monitor_checks", "monitor_id", "monitors", "id"))) {
    try {
      await pool.query(
        "ALTER TABLE monitor_checks ADD CONSTRAINT fk_checks_monitor FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_checks_monitor automatically:", error.code || error.message);
    }
  }

  if (!(await hasForeignKeyReference("monitor_daily_stats", "monitor_id", "monitors", "id"))) {
    try {
      await pool.query(
        "ALTER TABLE monitor_daily_stats ADD CONSTRAINT fk_daily_monitor FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_daily_monitor automatically:", error.code || error.message);
    }
  }

  if (!(await hasForeignKeyReference("monitor_daily_error_codes", "monitor_id", "monitors", "id"))) {
    try {
      await pool.query(
        "ALTER TABLE monitor_daily_error_codes ADD CONSTRAINT fk_daily_error_monitor FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_daily_error_monitor automatically:", error.code || error.message);
    }
  }

  if (!(await hasForeignKeyReference("maintenances", "user_id", "users", "id"))) {
    try {
      await pool.query(
        "ALTER TABLE maintenances ADD CONSTRAINT fk_maint_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_maint_user automatically:", error.code || error.message);
    }
  }

  if (!(await hasForeignKeyReference("maintenances", "monitor_id", "monitors", "id"))) {
    try {
      await pool.query(
        "ALTER TABLE maintenances ADD CONSTRAINT fk_maint_monitor FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE"
      );
    } catch (error) {
      console.warn("Could not add fk_maint_monitor automatically:", error.code || error.message);
    }
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      github_id VARCHAR(64) NULL UNIQUE,
      github_login VARCHAR(255) NULL,
      google_sub VARCHAR(128) NULL UNIQUE,
      google_email VARCHAR(255) NULL,
      discord_id VARCHAR(64) NULL UNIQUE,
      discord_username VARCHAR(255) NULL,
      discord_email VARCHAR(255) NULL,
      notify_discord_webhook_url VARCHAR(2048) NULL,
      notify_discord_enabled TINYINT(1) NOT NULL DEFAULT 0,
      notify_slack_webhook_url VARCHAR(2048) NULL,
      notify_slack_enabled TINYINT(1) NOT NULL DEFAULT 0,
      notify_webhook_url VARCHAR(2048) NULL,
      notify_webhook_enabled TINYINT(1) NOT NULL DEFAULT 0,
      notify_webhook_secret VARCHAR(255) NULL,
      stripe_customer_id VARCHAR(255) NULL UNIQUE,
      stripe_subscription_id VARCHAR(255) NULL UNIQUE,
      stripe_price_id VARCHAR(255) NULL,
      stripe_subscription_status VARCHAR(64) NULL,
      stripe_current_period_end DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sessions_user_id (user_id),
      INDEX idx_sessions_expires_at (expires_at),
      CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_failures (
      email VARCHAR(255) PRIMARY KEY,
      fails INT NOT NULL DEFAULT 0,
      last_fail TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_until TIMESTAMP NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS domain_verifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      domain VARCHAR(253) NOT NULL UNIQUE,
      token CHAR(32) NOT NULL,
      verified_at DATETIME NULL,
      last_checked_at DATETIME NULL,
      last_check_error VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_domain_user_id (user_id),
      CONSTRAINT fk_domain_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitors (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      public_id CHAR(12) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(2048) NOT NULL,
      target_url VARCHAR(2048) NULL,
      interval_ms INT NOT NULL DEFAULT 60000,
      http_assertions_enabled TINYINT(1) NOT NULL DEFAULT 0,
      http_expected_status_codes VARCHAR(128) NULL,
      http_content_type_contains VARCHAR(128) NULL,
      http_body_contains VARCHAR(512) NULL,
      http_follow_redirects TINYINT(1) NOT NULL DEFAULT 1,
      http_max_redirects INT NOT NULL DEFAULT 5,
      http_timeout_ms INT NOT NULL DEFAULT 0,
      is_paused TINYINT(1) NOT NULL DEFAULT 0,
      last_status ENUM('online','offline') NOT NULL DEFAULT 'online',
      status_since DATETIME(3) NULL,
      last_checked_at DATETIME(3) NULL,
      last_check_at DATETIME(3) NULL,
      last_response_ms INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_monitors_user_id (user_id),
      CONSTRAINT fk_monitors_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      monitor_id BIGINT NOT NULL,
      title VARCHAR(120) NOT NULL,
      message VARCHAR(500) NULL,
      starts_at DATETIME(3) NOT NULL,
      ends_at DATETIME(3) NOT NULL,
      cancelled_at DATETIME(3) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_maint_monitor_time (monitor_id, starts_at),
      INDEX idx_maint_user_time (user_id, starts_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_checks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      monitor_id BIGINT NOT NULL,
      checked_at DATETIME(3) NOT NULL,
      ok TINYINT(1) NOT NULL,
      response_ms INT NOT NULL,
      status_code INT NULL,
      error_message VARCHAR(255) NULL,
      INDEX idx_checks_monitor_time (monitor_id, checked_at),
      INDEX idx_checks_time (checked_at),
      CONSTRAINT fk_checks_monitor
        FOREIGN KEY (monitor_id) REFERENCES monitors(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_daily_stats (
      monitor_id BIGINT NOT NULL,
      day_date DATE NOT NULL,
      checks_total INT NOT NULL DEFAULT 0,
      checks_ok INT NOT NULL DEFAULT 0,
      checks_error INT NOT NULL DEFAULT 0,
      response_min_ms INT NULL,
      response_max_ms INT NULL,
      response_avg_ms DECIMAL(10,2) NULL,
      uptime_percent DECIMAL(7,4) NULL,
      down_minutes INT NOT NULL DEFAULT 0,
      incidents INT NOT NULL DEFAULT 0,
      start_ok TINYINT(1) NULL,
      end_ok TINYINT(1) NULL,
      first_checked_at DATETIME(3) NULL,
      last_checked_at DATETIME(3) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (monitor_id, day_date),
      INDEX idx_daily_day_date (day_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_daily_error_codes (
      monitor_id BIGINT NOT NULL,
      day_date DATE NOT NULL,
      error_code VARCHAR(32) NOT NULL,
      hits INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (monitor_id, day_date, error_code),
      INDEX idx_daily_error_day (day_date)
    )
  `);

  await ensureSchemaCompatibility();
}

async function cleanupExpiredSessions() {
  await pool.query("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()");
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [
    sessionId,
    userId,
    expiresAt,
  ]);
  return token;
}

async function findSessionByHash(sessionId) {
  const [rows] = await pool.query(
    "SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ? LIMIT 1",
    [sessionId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findUserById(userId) {
  const [rows] = await pool.query(
    "SELECT id, email, created_at FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function getUserNotificationSettingsById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        email,
        notify_discord_enabled,
        notify_discord_webhook_url,
        notify_slack_enabled,
        notify_slack_webhook_url,
        notify_webhook_enabled,
        notify_webhook_url,
        notify_webhook_secret
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function getUserBillingSettingsById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        email,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        stripe_subscription_status,
        stripe_current_period_end,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findUserByStripeCustomerId(customerId) {
  const normalized = String(customerId || "").trim();
  if (!normalized) return null;
  const [rows] = await pool.query(
    `
      SELECT
        id,
        email,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        stripe_subscription_status,
        stripe_current_period_end,
        created_at
      FROM users
      WHERE stripe_customer_id = ?
      LIMIT 1
    `,
    [normalized]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function updateUserStripeCustomerId(userId, customerId) {
  const normalizedCustomerId = String(customerId || "").trim();
  if (!normalizedCustomerId) return 0;
  try {
    const [result] = await pool.query(
      "UPDATE users SET stripe_customer_id = ? WHERE id = ? LIMIT 1",
      [normalizedCustomerId, userId]
    );
    return Number(result?.affectedRows || 0);
  } catch (error) {
    if (String(error?.code || "") === "ER_DUP_ENTRY") {
      return 0;
    }
    throw error;
  }
}

async function updateUserStripeSubscriptionByUserId(userId, payload = {}) {
  const normalizedCustomerId = String(payload.customerId || "").trim() || null;
  const normalizedSubscriptionId = String(payload.subscriptionId || "").trim() || null;
  const normalizedPriceId = String(payload.priceId || "").trim() || null;
  const normalizedStatus = String(payload.status || "").trim().toLowerCase() || null;
  const periodEndDate = payload.periodEnd instanceof Date ? payload.periodEnd : null;

  try {
    const [result] = await pool.query(
      `
        UPDATE users
        SET
          stripe_customer_id = COALESCE(?, stripe_customer_id),
          stripe_subscription_id = ?,
          stripe_price_id = ?,
          stripe_subscription_status = ?,
          stripe_current_period_end = ?
        WHERE id = ?
        LIMIT 1
      `,
      [normalizedCustomerId, normalizedSubscriptionId, normalizedPriceId, normalizedStatus, periodEndDate, userId]
    );
    return Number(result?.affectedRows || 0);
  } catch (error) {
    if (String(error?.code || "") === "ER_DUP_ENTRY") {
      return 0;
    }
    throw error;
  }
}

async function updateUserStripeSubscriptionByCustomerId(customerId, payload = {}) {
  const normalizedCustomerId = String(customerId || "").trim();
  if (!normalizedCustomerId) return 0;
  const normalizedSubscriptionId = String(payload.subscriptionId || "").trim() || null;
  const normalizedPriceId = String(payload.priceId || "").trim() || null;
  const normalizedStatus = String(payload.status || "").trim().toLowerCase() || null;
  const periodEndDate = payload.periodEnd instanceof Date ? payload.periodEnd : null;

  try {
    const [result] = await pool.query(
      `
        UPDATE users
        SET
          stripe_subscription_id = ?,
          stripe_price_id = ?,
          stripe_subscription_status = ?,
          stripe_current_period_end = ?
        WHERE stripe_customer_id = ?
        LIMIT 1
      `,
      [normalizedSubscriptionId, normalizedPriceId, normalizedStatus, periodEndDate, normalizedCustomerId]
    );
    return Number(result?.affectedRows || 0);
  } catch (error) {
    if (String(error?.code || "") === "ER_DUP_ENTRY") {
      return 0;
    }
    throw error;
  }
}

async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `
      SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findUserByGithubId(githubId) {
  const [rows] = await pool.query(
    `
      SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
      FROM users
      WHERE github_id = ?
      LIMIT 1
    `,
    [githubId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findUserByGoogleSub(googleSub) {
  const [rows] = await pool.query(
    `
      SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
      FROM users
      WHERE google_sub = ?
      LIMIT 1
    `,
    [googleSub]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function linkGithubToUser(userId, githubId, githubLogin) {
  await pool.query(
    "UPDATE users SET github_id = ?, github_login = ? WHERE id = ? LIMIT 1",
    [githubId, githubLogin, userId]
  );
}

async function createUserFromGithub(email, githubId, githubLogin) {
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_COST);
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash, github_id, github_login) VALUES (?, ?, ?, ?)",
    [email, passwordHash, githubId, githubLogin]
  );
  return Number(result.insertId);
}

async function linkGoogleToUser(userId, googleSub, googleEmail) {
  await pool.query("UPDATE users SET google_sub = ?, google_email = ? WHERE id = ? LIMIT 1", [
    googleSub,
    googleEmail,
    userId,
  ]);
}

async function createUserFromGoogle(email, googleSub, googleEmail) {
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_COST);
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash, google_sub, google_email) VALUES (?, ?, ?, ?)",
    [email, passwordHash, googleSub, googleEmail]
  );
  return Number(result.insertId);
}

async function findUserByDiscordId(discordId) {
  const [rows] = await pool.query(
    `
      SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
      FROM users
      WHERE discord_id = ?
      LIMIT 1
    `,
    [discordId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function linkDiscordToUser(userId, discordId, discordUsername, discordEmail) {
  await pool.query(
    "UPDATE users SET discord_id = ?, discord_username = ?, discord_email = ? WHERE id = ? LIMIT 1",
    [discordId, discordUsername, discordEmail, userId]
  );
}

async function createUserFromDiscord(email, discordId, discordUsername, discordEmail) {
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_COST);
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash, discord_id, discord_username, discord_email) VALUES (?, ?, ?, ?, ?)",
    [email, passwordHash, discordId, discordUsername, discordEmail]
  );
  return Number(result.insertId);
}

async function getAuthFailure(email) {
  const [rows] = await pool.query(
    "SELECT email, fails, last_fail, locked_until FROM auth_failures WHERE email = ? LIMIT 1",
    [email]
  );
  if (!rows.length) return null;
  return rows[0];
}

function isAccountLocked(failure) {
  if (!failure || !failure.locked_until) return false;
  const lockedUntilMs = new Date(failure.locked_until).getTime();
  return Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now();
}

async function registerAuthFailure(email, failure) {
  const nextFails = (failure?.fails || 0) + 1;
  const nextLockedUntil = nextFails >= AUTH_LOCK_MAX_FAILS ? new Date(Date.now() + AUTH_LOCK_DURATION_MS) : null;

  await pool.query(
    `
      INSERT INTO auth_failures (email, fails, last_fail, locked_until)
      VALUES (?, ?, UTC_TIMESTAMP(), ?)
      ON DUPLICATE KEY UPDATE
        fails = VALUES(fails),
        last_fail = VALUES(last_fail),
        locked_until = VALUES(locked_until)
    `,
    [email, nextFails, nextLockedUntil]
  );

  return { fails: nextFails, lockedUntil: nextLockedUntil };
}

async function clearAuthFailures(email) {
  await pool.query("DELETE FROM auth_failures WHERE email = ?", [email]);
}

async function getNextPathForUser(userId) {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM monitors WHERE user_id = ?", [userId]);
  const total = Number(rows[0]?.total || 0);
  return total > 0 ? "/app" : "/onboarding";
}

async function requireAuth(req, res, options = {}) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  const rejectUnauthorized = () => {
    if (options.silent) return;
    if (options.redirectToLogin) {
      sendRedirect(res, "/login");
    } else {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
    }
  };

  if (!isValidSessionToken(token)) {
    rejectUnauthorized();
    return null;
  }

  await cleanupExpiredSessions();

  const sessionId = hashSessionToken(token);
  const session = await findSessionByHash(sessionId);
  if (!session) {
    clearSessionCookie(res);
    rejectUnauthorized();
    return null;
  }

  const expiresAtMs = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await pool.query("DELETE FROM sessions WHERE id = ?", [sessionId]);
    clearSessionCookie(res);
    rejectUnauthorized();
    return null;
  }

  const user = await findUserById(session.user_id);
  if (!user) {
    await pool.query("DELETE FROM sessions WHERE id = ?", [sessionId]);
    clearSessionCookie(res);
    rejectUnauthorized();
    return null;
  }

  req.user = user;
  req.userId = Number(user.id);
  req.sessionId = sessionId;
  req.sessionCreatedAt = toTimestampMs(session.created_at);
  return user;
}

async function requireOwner(req, res, options = {}) {
  const authOptions = options?.auth || {};
  const user = await requireAuth(req, res, authOptions);
  if (!user) return null;

  if (isOwnerUserId(user.id)) {
    return user;
  }

  if (options.redirectToApp) {
    sendRedirect(res, "/app");
  } else if (!options.silent) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
  }
  return null;
}

function isSessionFreshEnough(req, maxAgeMs = ACCOUNT_SENSITIVE_ACTION_MAX_SESSION_AGE_MS) {
  const createdAtMs = Number(req?.sessionCreatedAt || 0);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return Date.now() - createdAtMs <= maxAgeMs;
}

function serializeMonitorRow(row) {
  const publicId = isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null;
  if (!publicId) return null;
  return {
    id: publicId,
    name: row.name,
    url: getMonitorUrl(row),
    is_paused: !!row.is_paused,
    last_status: row.last_status || "online",
    last_checked_at: toMs(row.last_checked_at) || toMs(row.last_check_at),
    created_at: toMs(row.created_at),
  };
}

async function listMonitorsForUser(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        name,
        url,
        target_url,
        is_paused,
        last_status,
        last_checked_at,
        last_check_at,
        created_at
      FROM monitors
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );
  return rows.map(serializeMonitorRow).filter(Boolean);
}

async function getLatestMonitorForUser(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        user_id,
        name,
        url,
        target_url,
        interval_ms,
        http_assertions_enabled,
        http_expected_status_codes,
        http_content_type_contains,
        http_body_contains,
        http_follow_redirects,
        http_max_redirects,
        http_timeout_ms,
        is_paused,
        last_status,
        status_since,
        last_checked_at,
        last_check_at,
        last_response_ms,
        created_at
      FROM monitors
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function getMonitorByIdForUser(userId, monitorId) {
  const monitorIdentifier = String(monitorId || "").trim();
  if (!monitorIdentifier) return null;
  const publicId = isValidMonitorPublicId(monitorIdentifier) ? monitorIdentifier : null;
  const numericId = /^\d+$/.test(monitorIdentifier) ? Number(monitorIdentifier) : -1;

  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        user_id,
        name,
        url,
        target_url,
        interval_ms,
        http_assertions_enabled,
        http_expected_status_codes,
        http_content_type_contains,
        http_body_contains,
        http_follow_redirects,
        http_max_redirects,
        http_timeout_ms,
        is_paused,
        last_status,
        status_since,
        last_checked_at,
        last_check_at,
        last_response_ms,
        created_at
      FROM monitors
      WHERE user_id = ?
        AND (public_id = ? OR id = ?)
      LIMIT 1
    `,
    [userId, publicId, numericId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function getDefaultPublicMonitor() {
  if (!DEFAULT_PUBLIC_STATUS_MONITOR_ID) return null;
  return getPublicMonitorByIdentifier(DEFAULT_PUBLIC_STATUS_MONITOR_ID);
}

async function getLatestPublicMonitor() {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        user_id,
        name,
        url,
        target_url,
        interval_ms,
        http_assertions_enabled,
        http_expected_status_codes,
        http_content_type_contains,
        http_body_contains,
        http_follow_redirects,
        http_max_redirects,
        http_timeout_ms,
        is_paused,
        last_status,
        status_since,
        last_checked_at,
        last_check_at,
        last_response_ms,
        created_at
      FROM monitors
      WHERE user_id IS NOT NULL
      ORDER BY COALESCE(last_check_at, last_checked_at, created_at) DESC, id DESC
      LIMIT 1
    `
  );

  if (!rows.length) return null;
  return rows[0];
}

async function getPublicMonitorByIdentifier(monitorId) {
  const monitorIdentifier = String(monitorId || "").trim();
  if (!monitorIdentifier) return null;
  const publicId = isValidMonitorPublicId(monitorIdentifier) ? monitorIdentifier : null;
  const allowNumericId = PUBLIC_STATUS_ALLOW_NUMERIC_ID;
  const numericId = allowNumericId && /^\d+$/.test(monitorIdentifier) ? Number(monitorIdentifier) : -1;
  const whereClause = allowNumericId ? "(public_id = ? OR id = ?)" : "public_id = ?";
  const queryParams = allowNumericId ? [publicId, numericId] : [publicId];

  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        user_id,
        name,
        url,
        target_url,
        interval_ms,
        http_assertions_enabled,
        http_expected_status_codes,
        http_content_type_contains,
        http_body_contains,
        http_follow_redirects,
        http_max_redirects,
        http_timeout_ms,
        is_paused,
        last_status,
        status_since,
        last_checked_at,
        last_check_at,
        last_response_ms,
        created_at
      FROM monitors
      WHERE user_id IS NOT NULL
        AND ${whereClause}
      LIMIT 1
    `,
    queryParams
  );

  if (!rows.length) return null;
  return rows[0];
}

async function handleAuthGithubStart(req, res) {
  if (!GITHUB_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=github_disabled");
    return;
  }

  const state = createOauthState("github", res);
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GITHUB_CALLBACK_URL);
  authUrl.searchParams.set("scope", GITHUB_SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("allow_signup", "true");

  sendRedirect(res, authUrl.toString());
}

async function handleAuthGithubCallback(req, res, url) {
  if (!GITHUB_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=github_disabled");
    return;
  }

  const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
  if (oauthError) {
    clearOauthStateCookie(res);
    sendRedirect(res, "/login?oauth=github_denied");
    return;
  }

  const state = String(url.searchParams.get("state") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  const githubStateValid = consumeOauthState("github", state, req);
  clearOauthStateCookie(res);
  if (!githubStateValid) {
    runtimeTelemetry.security.oauthStateRejected += 1;
    sendRedirect(res, "/login?oauth=github_state");
    return;
  }
  if (!code) {
    sendRedirect(res, "/login?oauth=github_code");
    return;
  }

  const tokenResult = await fetchGitHubAccessToken(code);
  if (!tokenResult?.accessToken) {
    sendRedirect(res, "/login?oauth=github_token");
    return;
  }
  const accessToken = tokenResult.accessToken;

  const githubUserResult = await fetchGitHubUser(accessToken);
  const githubUser = githubUserResult?.payload || null;
  const githubId = String(githubUser?.id || "").trim();
  const githubLoginRaw = String(githubUser?.login || "").trim();
  const githubLogin = githubLoginRaw ? githubLoginRaw.slice(0, 255) : null;
  if (!githubId) {
    sendRedirect(res, "/login?oauth=github_profile");
    return;
  }

  const githubEmailsResult = await fetchGitHubEmails(accessToken);
  if (Number(githubEmailsResult?.statusCode) === 403) {
    sendRedirect(res, "/login?oauth=github_email_permission");
    return;
  }
  const githubEmails = Array.isArray(githubEmailsResult?.emails) ? githubEmailsResult.emails : [];
  const grantedScopes = new Set([
    ...Array.from(tokenResult.grantedScopes || []),
    ...Array.from(githubUserResult?.grantedScopes || []),
    ...Array.from(githubEmailsResult?.grantedScopes || []),
  ]);
  const email = getPreferredGitHubEmail(githubUser, githubEmails);
  if (!email) {
    if (grantedScopes.size > 0 && !grantedScopes.has("user:email")) {
      sendRedirect(res, "/login?oauth=github_scope");
      return;
    }
    sendRedirect(res, "/login?oauth=github_email_missing");
    return;
  }

  try {
    let userId = null;
    const userByGithub = await findUserByGithubId(githubId);
    if (userByGithub) {
      userId = Number(userByGithub.id);
      await linkGithubToUser(userId, githubId, githubLogin);
    } else {
      const userByEmail = await findUserByEmail(email);
      if (userByEmail) {
        const existingGithubId = String(userByEmail.github_id || "").trim();
        if (existingGithubId && existingGithubId !== githubId) {
          sendRedirect(res, "/login?oauth=github_conflict");
          return;
        }
        userId = Number(userByEmail.id);
        await linkGithubToUser(userId, githubId, githubLogin);
      } else {
        userId = await createUserFromGithub(email, githubId, githubLogin);
      }
    }

    if (!userId) {
      sendRedirect(res, "/login?oauth=github_error");
      return;
    }

    await clearAuthFailures(email);
    await cleanupExpiredSessions();

    // Session fixation protection.
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);

    const sessionToken = await createSession(userId);
    setSessionCookie(res, sessionToken);

    const next = await getNextPathForUser(userId);
    sendRedirect(res, next || "/app");
  } catch (error) {
    console.error("github_oauth_failed", error);
    sendRedirect(res, "/login?oauth=github_error");
  }
}

async function handleAuthGoogleStart(req, res) {
  if (!GOOGLE_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=google_disabled");
    return;
  }

  const state = createOauthState("google", res);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_CALLBACK_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");

  sendRedirect(res, authUrl.toString());
}

async function handleAuthGoogleCallback(req, res, url) {
  if (!GOOGLE_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=google_disabled");
    return;
  }

  const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
  if (oauthError) {
    clearOauthStateCookie(res);
    sendRedirect(res, "/login?oauth=google_denied");
    return;
  }

  const state = String(url.searchParams.get("state") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  const googleStateValid = consumeOauthState("google", state, req);
  clearOauthStateCookie(res);
  if (!googleStateValid) {
    runtimeTelemetry.security.oauthStateRejected += 1;
    sendRedirect(res, "/login?oauth=google_state");
    return;
  }
  if (!code) {
    sendRedirect(res, "/login?oauth=google_code");
    return;
  }

  const tokenResult = await fetchGoogleAccessToken(code);
  if (!tokenResult?.accessToken) {
    sendRedirect(res, "/login?oauth=google_token");
    return;
  }

  const googleUser = await fetchGoogleUser(tokenResult.accessToken);
  const googleSub = String(googleUser?.sub || "").trim();
  if (!googleSub) {
    sendRedirect(res, "/login?oauth=google_profile");
    return;
  }

  const email = getPreferredGoogleEmail(googleUser);
  if (!email) {
    if (tokenResult.grantedScopes.size > 0 && !tokenResult.grantedScopes.has("email")) {
      sendRedirect(res, "/login?oauth=google_scope");
      return;
    }
    sendRedirect(res, "/login?oauth=google_email_missing");
    return;
  }

  try {
    let userId = null;
    const userByGoogle = await findUserByGoogleSub(googleSub);
    if (userByGoogle) {
      userId = Number(userByGoogle.id);
      await linkGoogleToUser(userId, googleSub, email);
    } else {
      const userByEmail = await findUserByEmail(email);
      if (userByEmail) {
        const existingGoogleSub = String(userByEmail.google_sub || "").trim();
        if (existingGoogleSub && existingGoogleSub !== googleSub) {
          sendRedirect(res, "/login?oauth=google_conflict");
          return;
        }
        userId = Number(userByEmail.id);
        await linkGoogleToUser(userId, googleSub, email);
      } else {
        userId = await createUserFromGoogle(email, googleSub, email);
      }
    }

    if (!userId) {
      sendRedirect(res, "/login?oauth=google_error");
      return;
    }

    await clearAuthFailures(email);
    await cleanupExpiredSessions();

    // Session fixation protection.
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);

    const sessionToken = await createSession(userId);
    setSessionCookie(res, sessionToken);

    const next = await getNextPathForUser(userId);
    sendRedirect(res, next || "/app");
  } catch (error) {
    console.error("google_oauth_failed", error);
    sendRedirect(res, "/login?oauth=google_error");
  }
}

async function handleAuthDiscordStart(req, res) {
  if (!DISCORD_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=discord_disabled");
    return;
  }

  const state = createOauthState("discord", res);
  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", DISCORD_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", DISCORD_CALLBACK_URL);
  authUrl.searchParams.set("scope", DISCORD_SCOPE);
  authUrl.searchParams.set("state", state);

  sendRedirect(res, authUrl.toString());
}

async function handleAuthDiscordCallback(req, res, url) {
  if (!DISCORD_AUTH_ENABLED) {
    sendRedirect(res, "/login?oauth=discord_disabled");
    return;
  }

  const oauthError = String(url.searchParams.get("error") || "").trim().toLowerCase();
  if (oauthError) {
    clearOauthStateCookie(res);
    sendRedirect(res, "/login?oauth=discord_denied");
    return;
  }

  const state = String(url.searchParams.get("state") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  const discordStateValid = consumeOauthState("discord", state, req);
  clearOauthStateCookie(res);
  if (!discordStateValid) {
    runtimeTelemetry.security.oauthStateRejected += 1;
    sendRedirect(res, "/login?oauth=discord_state");
    return;
  }
  if (!code) {
    sendRedirect(res, "/login?oauth=discord_code");
    return;
  }

  const tokenResult = await fetchDiscordAccessToken(code);
  if (!tokenResult?.accessToken) {
    sendRedirect(res, "/login?oauth=discord_token");
    return;
  }

  const discordUser = await fetchDiscordUser(tokenResult.accessToken);
  const discordId = String(discordUser?.id || "").trim();
  const discordLogin = getPreferredDiscordLogin(discordUser);
  if (!discordId) {
    sendRedirect(res, "/login?oauth=discord_profile");
    return;
  }

  const email = getPreferredDiscordEmail(discordUser);
  if (!email) {
    if (tokenResult.grantedScopes.size > 0 && !tokenResult.grantedScopes.has("email")) {
      sendRedirect(res, "/login?oauth=discord_scope");
      return;
    }
    sendRedirect(res, "/login?oauth=discord_email_missing");
    return;
  }

  try {
    let userId = null;
    const userByDiscord = await findUserByDiscordId(discordId);
    if (userByDiscord) {
      userId = Number(userByDiscord.id);
      await linkDiscordToUser(userId, discordId, discordLogin, email);
    } else {
      const userByEmail = await findUserByEmail(email);
      if (userByEmail) {
        const existingDiscordId = String(userByEmail.discord_id || "").trim();
        if (existingDiscordId && existingDiscordId !== discordId) {
          sendRedirect(res, "/login?oauth=discord_conflict");
          return;
        }
        userId = Number(userByEmail.id);
        await linkDiscordToUser(userId, discordId, discordLogin, email);
      } else {
        userId = await createUserFromDiscord(email, discordId, discordLogin, email);
      }
    }

    if (!userId) {
      sendRedirect(res, "/login?oauth=discord_error");
      return;
    }

    await clearAuthFailures(email);
    await cleanupExpiredSessions();

    // Session fixation protection.
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);

    const sessionToken = await createSession(userId);
    setSessionCookie(res, sessionToken);

    const next = await getNextPathForUser(userId);
    sendRedirect(res, next || "/app");
  } catch (error) {
    console.error("discord_oauth_failed", error);
    sendRedirect(res, "/login?oauth=discord_error");
  }
}

async function handleAuthRegister(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid credentials" });
    return;
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email) || !validatePassword(password)) {
    sendJson(res, 400, { ok: false, error: "invalid credentials" });
    return;
  }

  try {
    const [existingRows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existingRows.length) {
      sendJson(res, 400, { ok: false, error: "invalid credentials" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [email, passwordHash]
    );

    await cleanupExpiredSessions();
    const sessionToken = await createSession(result.insertId);
    setSessionCookie(res, sessionToken);

    const next = await getNextPathForUser(result.insertId);
    sendJson(res, 201, { ok: true, next });
  } catch (error) {
    console.error("register_failed", error);
    sendJson(res, 500, { ok: false, error: "invalid credentials" });
  }
}

async function handleAuthLogin(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid credentials" });
    return;
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email) || !validatePassword(password)) {
    sendJson(res, 400, { ok: false, error: "invalid credentials" });
    return;
  }

  try {
    const failure = await getAuthFailure(email);
    const [rows] = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    const user = rows[0] || null;
    const hashToCompare = user?.password_hash || DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (isAccountLocked(failure)) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((new Date(failure.locked_until).getTime() - Date.now()) / 1000)
      );
      sendJson(
        res,
        429,
        { ok: false, error: "invalid credentials" },
        { "Retry-After": String(retryAfterSeconds) }
      );
      return;
    }

    if (!user || !passwordMatches) {
      const nextFailure = await registerAuthFailure(email, failure);
      if (nextFailure.lockedUntil) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((nextFailure.lockedUntil.getTime() - Date.now()) / 1000)
        );
        sendJson(
          res,
          429,
          { ok: false, error: "invalid credentials" },
          { "Retry-After": String(retryAfterSeconds) }
        );
        return;
      }
      sendJson(res, 401, { ok: false, error: "invalid credentials" });
      return;
    }

    await clearAuthFailures(email);
    await cleanupExpiredSessions();

    // Session fixation protection.
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [user.id]);

    const sessionToken = await createSession(user.id);
    setSessionCookie(res, sessionToken);

    const next = await getNextPathForUser(user.id);
    sendJson(res, 200, { ok: true, next });
  } catch (error) {
    console.error("login_failed", error);
    sendJson(res, 500, { ok: false, error: "invalid credentials" });
  }
}

async function handleAuthLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];

  try {
    if (isValidSessionToken(token)) {
      await pool.query("DELETE FROM sessions WHERE id = ?", [hashSessionToken(token)]);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("logout_failed", error);
    sendJson(res, 500, { ok: false, error: "invalid credentials" });
  }
}

async function handleAuthLogoutAll(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("logout_all_failed", error);
    sendJson(res, 500, { ok: false, error: "invalid credentials" });
  }
}

function serializeAccountSessionRow(row, currentSessionId) {
  const sessionId = String(row.id || "");
  const createdAt = toTimestampMs(row.created_at);
  const expiresAt = toTimestampMs(row.expires_at);
  const now = Date.now();
  const expiresInSeconds = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;

  return {
    id: sessionId,
    shortId: sessionId.slice(0, 12),
    current: sessionId === currentSessionId,
    createdAt,
    expiresAt,
    expiresInSeconds,
  };
}

async function listAccountSessionsForUser(userId, currentSessionId) {
  const [rows] = await pool.query(
    `
      SELECT id, created_at, expires_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    [userId]
  );

  const mapped = rows.map((row) => serializeAccountSessionRow(row, currentSessionId));
  mapped.sort((left, right) => {
    if (left.current === right.current) {
      return Number(right.createdAt || 0) - Number(left.createdAt || 0);
    }
    return left.current ? -1 : 1;
  });
  return mapped;
}

async function handleAccountSessionsList(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const sessions = await listAccountSessionsForUser(user.id, req.sessionId);
    sendJson(res, 200, { ok: true, data: sessions });
  } catch (error) {
    console.error("account_sessions_list_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountConnectionsList(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const [rows] = await pool.query(
      "SELECT id, email, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email FROM users WHERE id = ? LIMIT 1",
      [user.id]
    );
    const account = rows[0] || null;
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const githubId = String(account.github_id || "").trim();
    const githubLogin = String(account.github_login || "").trim();
    const githubConnected = !!githubId;
    const googleSub = String(account.google_sub || "").trim();
    const googleEmail = String(account.google_email || "").trim();
    const googleConnected = !!googleSub;
    const discordId = String(account.discord_id || "").trim();
    const discordUsername = String(account.discord_username || "").trim();
    const discordEmail = String(account.discord_email || "").trim();
    const discordConnected = !!discordId;

    const providers = [
      {
        provider: "github",
        label: "GitHub",
        connected: githubConnected,
        account: githubConnected ? githubLogin || null : null,
        status: GITHUB_AUTH_ENABLED ? (githubConnected ? "verbunden" : "nicht verbunden") : "deaktiviert",
        available: GITHUB_AUTH_ENABLED,
      },
      {
        provider: "google",
        label: "Google (Gmail)",
        connected: googleConnected,
        account: googleConnected ? googleEmail || account.email || null : null,
        status: GOOGLE_AUTH_ENABLED ? (googleConnected ? "verbunden" : "nicht verbunden") : "deaktiviert",
        available: GOOGLE_AUTH_ENABLED,
      },
      {
        provider: "discord",
        label: "Discord",
        connected: discordConnected,
        account: discordConnected ? discordUsername || discordEmail || account.email || null : null,
        status: DISCORD_AUTH_ENABLED ? (discordConnected ? "verbunden" : "nicht verbunden") : "deaktiviert",
        available: DISCORD_AUTH_ENABLED,
      },
    ];

    sendJson(res, 200, { ok: true, data: providers });
  } catch (error) {
    console.error("account_connections_list_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

const DOMAIN_VERIFICATION_DNS_PREFIX = "_pingmyserver-challenge";
const DOMAIN_VERIFICATION_TXT_PREFIX = "pingmyserver-verification=";

function normalizeDomainForVerification(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) return null;

  let hostname = input;

  const tryParseAsUrl = (value) => {
    try {
      return new URL(value).hostname;
    } catch (error) {
      return "";
    }
  };

  if (input.includes("://")) {
    hostname = tryParseAsUrl(input);
  } else if (/[\/?#]/.test(input)) {
    hostname = tryParseAsUrl(`https://${input}`);
  }

  hostname = String(hostname || "").trim();
  if (!hostname) return null;

  hostname = hostname.replace(/^\[|\]$/g, "");
  hostname = hostname.replace(/\.+$/, "");

  if (hostname.includes(":")) {
    const match = hostname.match(/^(.+):(\d{1,5})$/);
    if (match) hostname = match[1];
  }

  const lowered = hostname.toLowerCase();
  if (!lowered || lowered.length > 253) return null;
  if (lowered === "localhost") return null;
  if (net.isIP(lowered)) return null;

  const ascii = domainToASCII(lowered);
  if (!ascii) return null;

  const normalized = String(ascii || "").trim().toLowerCase();
  if (!normalized || normalized.length > 253) return null;
  if (normalized === "localhost") return null;
  if (net.isIP(normalized)) return null;

  const labels = normalized.split(".");
  if (labels.length < 2) return null;
  const labelRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of labels) {
    if (!label || label.length > 63) return null;
    if (!labelRegex.test(label)) return null;
  }

  return normalized;
}

function createDomainVerificationToken() {
  return crypto.randomBytes(16).toString("hex");
}

function getDomainVerificationDnsName(domain) {
  return `${DOMAIN_VERIFICATION_DNS_PREFIX}.${domain}`;
}

function getDomainVerificationTxtValue(token) {
  return `${DOMAIN_VERIFICATION_TXT_PREFIX}${token}`;
}

function serializeDomainVerificationRow(row) {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const domain = String(row.domain || "").trim();
  const token = String(row.token || "").trim();
  if (!domain || !token) return null;

  return {
    id,
    domain,
    token,
    recordName: getDomainVerificationDnsName(domain),
    recordValue: getDomainVerificationTxtValue(token),
    verifiedAt: toTimestampMs(row.verified_at),
    lastCheckedAt: toTimestampMs(row.last_checked_at),
    lastCheckError: String(row.last_check_error || "").trim() || null,
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
  };
}

async function listDomainVerificationsForUser(userId) {
  const [rows] = await pool.query(
    `
      SELECT id, user_id, domain, token, verified_at, last_checked_at, last_check_error, created_at, updated_at
      FROM domain_verifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );
  return rows.map(serializeDomainVerificationRow).filter(Boolean);
}

async function getDomainVerificationById(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  const [rows] = await pool.query(
    `
      SELECT id, user_id, domain, token, verified_at, last_checked_at, last_check_error, created_at, updated_at
      FROM domain_verifications
      WHERE id = ?
      LIMIT 1
    `,
    [numericId]
  );
  return rows[0] || null;
}

async function upsertDomainVerificationChallenge(userId, domain, options = {}) {
  const { force = false } = options;
  const token = createDomainVerificationToken();

  const [rows] = await pool.query(
    "SELECT id, user_id, verified_at FROM domain_verifications WHERE domain = ? LIMIT 1",
    [domain]
  );
  const existing = rows[0] || null;

  if (existing && Number(existing.user_id) !== Number(userId)) {
    const error = new Error("domain_taken");
    error.statusCode = 409;
    throw error;
  }

  if (existing) {
    const alreadyVerified = !!existing.verified_at;
    if (alreadyVerified && !force) {
      return { row: await getDomainVerificationById(existing.id), created: false, reset: false, alreadyVerified: true };
    }

    await pool.query(
      `
        UPDATE domain_verifications
        SET token = ?, verified_at = NULL, last_checked_at = NULL, last_check_error = NULL
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [token, existing.id, userId]
    );

    return { row: await getDomainVerificationById(existing.id), created: false, reset: true, alreadyVerified: false };
  }

  const [result] = await pool.query("INSERT INTO domain_verifications (user_id, domain, token) VALUES (?, ?, ?)", [
    userId,
    domain,
    token,
  ]);

  return { row: await getDomainVerificationById(result.insertId), created: true, reset: false, alreadyVerified: false };
}

function normalizeTxtLookupResult(records) {
  const list = Array.isArray(records) ? records : [];
  return list
    .map((entry) => {
      if (Array.isArray(entry)) return entry.join("");
      return String(entry || "");
    })
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

async function lookupDomainVerificationTxt(domain) {
  const recordName = getDomainVerificationDnsName(domain);
  let timeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("dns_lookup_timeout")), MONITOR_TARGET_RESOLVE_TIMEOUT_MS);
  });

  try {
    const resolved = await Promise.race([dns.resolveTxt(recordName), timeoutPromise]);
    return normalizeTxtLookupResult(resolved);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function verifyDomainVerification(userId, id) {
  const row = await getDomainVerificationById(id);
  if (!row || Number(row.user_id) !== Number(userId)) {
    const error = new Error("not_found");
    error.statusCode = 404;
    throw error;
  }

  if (row.verified_at) {
    return { row, matched: true, alreadyVerified: true, records: [] };
  }

  const domain = String(row.domain || "").trim();
  const token = String(row.token || "").trim();
  const expected = getDomainVerificationTxtValue(token).toLowerCase();

  let records = [];
  let lookupErrorCode = "";

  try {
    records = await lookupDomainVerificationTxt(domain);
  } catch (error) {
    const code = String(error?.code || "").trim().toUpperCase();
    if (code === "ENOTFOUND" || code === "ENODATA") {
      records = [];
    } else {
      lookupErrorCode = String(error?.code || error?.message || "dns_lookup_failed").slice(0, 64);
    }
  }

  if (!records.length && lookupErrorCode) {
    await pool.query(
      `
        UPDATE domain_verifications
        SET last_checked_at = UTC_TIMESTAMP(), last_check_error = ?
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [lookupErrorCode, row.id, userId]
    );

    const error = new Error("dns_lookup_failed");
    error.statusCode = 502;
    error.details = { code: lookupErrorCode };
    throw error;
  }

  const normalizedRecords = records.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
  const matched = normalizedRecords.some(
    (entry) => entry === expected || entry === token.toLowerCase() || entry.includes(expected)
  );

  if (!matched) {
    await pool.query(
      `
        UPDATE domain_verifications
        SET last_checked_at = UTC_TIMESTAMP(), last_check_error = ?
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `,
      [records.length ? "dns_no_match" : "dns_no_records", row.id, userId]
    );
    return { row, matched: false, alreadyVerified: false, records: records.slice(0, 12) };
  }

  await pool.query(
    `
      UPDATE domain_verifications
      SET verified_at = UTC_TIMESTAMP(), last_checked_at = UTC_TIMESTAMP(), last_check_error = NULL
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    [row.id, userId]
  );

  return { row: await getDomainVerificationById(row.id), matched: true, alreadyVerified: false, records: [] };
}

async function handleAccountDomainsList(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const domains = await listDomainVerificationsForUser(user.id);
    sendJson(res, 200, { ok: true, data: domains });
  } catch (error) {
    console.error("account_domains_list_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDomainChallengeCreate(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const domain = normalizeDomainForVerification(body?.domain);
  const force = body?.force === true;
  if (!domain) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const result = await upsertDomainVerificationChallenge(user.id, domain, { force });
    const payload = serializeDomainVerificationRow(result.row);
    if (!payload) {
      sendJson(res, 500, { ok: false, error: "internal error" });
      return;
    }
    sendJson(res, 200, { ok: true, data: payload, created: result.created, reset: result.reset, alreadyVerified: result.alreadyVerified });
  } catch (error) {
    if (error?.message === "domain_taken" || error?.code === "ER_DUP_ENTRY") {
      sendJson(res, 409, { ok: false, error: "domain taken" });
      return;
    }
    console.error("account_domain_challenge_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDomainVerify(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const result = await verifyDomainVerification(user.id, id);
    const payload = serializeDomainVerificationRow(result.row);
    if (!payload) {
      sendJson(res, 500, { ok: false, error: "internal error" });
      return;
    }
    if (!result.matched) {
      sendJson(res, 400, { ok: false, error: "dns not ready", data: payload, records: result.records });
      return;
    }
    sendJson(res, 200, { ok: true, data: payload, alreadyVerified: result.alreadyVerified });
  } catch (error) {
    if (error?.message === "not_found") {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    if (error?.message === "dns_lookup_failed") {
      sendJson(res, 502, { ok: false, error: "dns lookup failed", code: error?.details?.code || "" });
      return;
    }
    console.error("account_domain_verify_failed", error);
    sendJson(res, error.statusCode || 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDomainDelete(req, res, id) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const [result] = await pool.query("DELETE FROM domain_verifications WHERE id = ? AND user_id = ? LIMIT 1", [
      numericId,
      user.id,
    ]);
    if (!result?.affectedRows) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("account_domain_delete_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

function hasLinkedOauthConnection(account) {
  if (!account) return false;
  const githubId = String(account.github_id || "").trim();
  const googleSub = String(account.google_sub || "").trim();
  const discordId = String(account.discord_id || "").trim();
  return !!(githubId || googleSub || discordId);
}

function toAccountNotificationsPayload(account) {
  const normalizedWebhook = normalizeDiscordWebhookUrl(account?.notify_discord_webhook_url);
  const configured = !!normalizedWebhook;
  const enabled = configured && Number(account?.notify_discord_enabled || 0) === 1;

  const normalizedSlack = normalizeSlackWebhookUrl(account?.notify_slack_webhook_url);
  const slackConfigured = !!normalizedSlack;
  const slackEnabled = slackConfigured && Number(account?.notify_slack_enabled || 0) === 1;

  const normalizedGeneric = normalizeGenericWebhookUrl(account?.notify_webhook_url);
  const genericConfigured = !!normalizedGeneric;
  const genericEnabled = genericConfigured && Number(account?.notify_webhook_enabled || 0) === 1;
  const genericSecretConfigured = !!normalizeWebhookSecret(account?.notify_webhook_secret);

  return {
    discord: {
      available: true,
      configured,
      enabled,
      webhookMasked: configured ? maskDiscordWebhookUrl(normalizedWebhook) : null,
    },
    slack: {
      available: true,
      configured: slackConfigured,
      enabled: slackEnabled,
      webhookMasked: slackConfigured ? maskSlackWebhookUrl(normalizedSlack) : null,
    },
    webhook: {
      available: true,
      configured: genericConfigured,
      enabled: genericEnabled,
      urlMasked: genericConfigured ? maskGenericWebhookUrl(normalizedGeneric) : null,
      secretConfigured: genericSecretConfigured,
    },
  };
}

function toIsoStringOrNull(value) {
  const timestampMs = toTimestampMs(value);
  if (!Number.isFinite(timestampMs)) return null;
  return new Date(timestampMs).toISOString();
}

function normalizeStripeSubscriptionStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return normalized.slice(0, 64);
}

function normalizeStripePriceId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.slice(0, 255);
}

function normalizeStripeLookupKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.slice(0, 255);
}

function hasStripeCheckoutPriceConfig() {
  return !!(normalizeStripePriceId(STRIPE_PRICE_ID) || normalizeStripeLookupKey(STRIPE_PRICE_LOOKUP_KEY));
}

function isStripeSubscriptionActive(status) {
  const normalized = normalizeStripeSubscriptionStatus(status);
  if (!normalized) return false;
  return STRIPE_ACTIVE_SUBSCRIPTION_STATUSES.has(normalized);
}

function toAccountBillingPayload(account) {
  const normalizedStatus = normalizeStripeSubscriptionStatus(account?.stripe_subscription_status) || "none";
  const customerId = String(account?.stripe_customer_id || "").trim();
  const subscriptionId = String(account?.stripe_subscription_id || "").trim();
  const priceId = String(account?.stripe_price_id || "").trim();

  return {
    available: STRIPE_ENABLED,
    checkoutEnabled: STRIPE_ENABLED && hasStripeCheckoutPriceConfig(),
    status: normalizedStatus,
    active: isStripeSubscriptionActive(normalizedStatus),
    hasCustomer: !!customerId,
    subscriptionId: subscriptionId || null,
    priceId: priceId || null,
    currentPeriodEnd: toIsoStringOrNull(account?.stripe_current_period_end),
  };
}

function toStripeFormBody(payload) {
  const params = new URLSearchParams();
  const source = payload && typeof payload === "object" ? payload : {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      params.append(key, value ? "true" : "false");
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}

async function stripeApiRequest(method, apiPath, payload = null) {
  if (!STRIPE_ENABLED) {
    return { ok: false, statusCode: 503, errorCode: "stripe_disabled", errorMessage: "stripe disabled", payload: null };
  }

  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  const normalizedPath = String(apiPath || "").startsWith("/") ? String(apiPath || "") : `/${apiPath || ""}`;
  const requestUrl = `${STRIPE_API_BASE}${normalizedPath}`;
  const headers = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    Accept: "application/json",
  };
  const options = {
    method: normalizedMethod,
    headers,
  };

  if (normalizedMethod !== "GET" && payload && typeof payload === "object") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = toStripeFormBody(payload);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STRIPE_REQUEST_TIMEOUT_MS);
  options.signal = controller.signal;

  try {
    const response = await fetch(requestUrl, options);
    const responseText = await response.text();
    let responsePayload = null;
    try {
      responsePayload = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      responsePayload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        statusCode: Number(response.status || 0),
        errorCode: String(responsePayload?.error?.code || "").trim() || `http_${response.status || "error"}`,
        errorMessage: String(responsePayload?.error?.message || responseText || "stripe request failed").slice(0, 300),
        payload: responsePayload,
      };
    }

    return {
      ok: true,
      statusCode: Number(response.status || 200),
      errorCode: "",
      errorMessage: "",
      payload: responsePayload,
    };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return {
      ok: false,
      statusCode: 0,
      errorCode: timedOut ? "timeout" : "request_failed",
      errorMessage: String(error?.message || "stripe request failed").slice(0, 300),
      payload: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStripePriceIdByLookupKey(lookupKey) {
  const normalizedLookupKey = normalizeStripeLookupKey(lookupKey);
  if (!normalizedLookupKey) {
    return { ok: false, priceId: "", errorCode: "invalid_lookup_key", errorMessage: "invalid lookup key" };
  }

  const query = new URLSearchParams();
  query.set("active", "true");
  query.set("type", "recurring");
  query.set("limit", "1");
  query.set("lookup_keys[0]", normalizedLookupKey);
  query.append("expand[]", "data.product");

  const result = await stripeApiRequest("GET", `/prices?${query.toString()}`);
  if (!result.ok) {
    return {
      ok: false,
      priceId: "",
      errorCode: result.errorCode || "lookup_failed",
      errorMessage: result.errorMessage || "stripe price lookup failed",
    };
  }

  const priceRows = Array.isArray(result.payload?.data) ? result.payload.data : [];
  const priceId = normalizeStripePriceId(priceRows[0]?.id);
  if (!priceId) {
    return {
      ok: false,
      priceId: "",
      errorCode: "lookup_not_found",
      errorMessage: "no recurring price found for lookup key",
    };
  }

  return { ok: true, priceId, errorCode: "", errorMessage: "" };
}

async function resolveStripeCheckoutPriceId(preferredLookupKey = "") {
  const lookupKeys = [];
  const preferred = normalizeStripeLookupKey(preferredLookupKey);
  const configuredLookup = normalizeStripeLookupKey(STRIPE_PRICE_LOOKUP_KEY);
  if (preferred) lookupKeys.push(preferred);
  if (configuredLookup && configuredLookup !== preferred) lookupKeys.push(configuredLookup);

  let lastLookupError = "";
  for (const key of lookupKeys) {
    const lookupResult = await fetchStripePriceIdByLookupKey(key);
    if (lookupResult.ok && lookupResult.priceId) {
      return { ok: true, priceId: lookupResult.priceId, source: `lookup_key:${key}`, errorCode: "", errorMessage: "" };
    }
    lastLookupError = lookupResult.errorCode || lastLookupError;
  }

  const configuredPriceId = normalizeStripePriceId(STRIPE_PRICE_ID);
  if (configuredPriceId) {
    return { ok: true, priceId: configuredPriceId, source: "price_id", errorCode: "", errorMessage: "" };
  }

  return {
    ok: false,
    priceId: "",
    source: "",
    errorCode: lastLookupError || "price_not_configured",
    errorMessage: "stripe checkout price not configured",
  };
}

async function createStripeCustomerForUser(account) {
  const userId = Number(account?.id || 0);
  const email = String(account?.email || "").trim().toLowerCase();
  if (!Number.isInteger(userId) || userId <= 0 || !email) {
    return { ok: false, customerId: "", errorCode: "invalid_user", errorMessage: "invalid user" };
  }

  const result = await stripeApiRequest("POST", "/customers", {
    email,
    "metadata[user_id]": String(userId),
  });
  const customerId = String(result?.payload?.id || "").trim();
  if (!result.ok || !customerId) {
    return {
      ok: false,
      customerId: "",
      errorCode: result.errorCode || "customer_create_failed",
      errorMessage: result.errorMessage || "stripe customer create failed",
    };
  }

  return { ok: true, customerId, errorCode: "", errorMessage: "" };
}

async function ensureStripeCustomerForUser(account) {
  const existingCustomerId = String(account?.stripe_customer_id || "").trim();
  if (existingCustomerId) {
    return { ok: true, customerId: existingCustomerId, errorCode: "", errorMessage: "" };
  }

  const created = await createStripeCustomerForUser(account);
  if (!created.ok || !created.customerId) {
    return created;
  }

  const affected = await updateUserStripeCustomerId(account.id, created.customerId);
  if (affected <= 0) {
    const refreshed = await getUserBillingSettingsById(account.id);
    const storedCustomerId = String(refreshed?.stripe_customer_id || "").trim();
    if (storedCustomerId !== created.customerId) {
      return {
        ok: false,
        customerId: "",
        errorCode: "customer_store_failed",
        errorMessage: "stripe customer could not be linked",
      };
    }
  }
  return { ok: true, customerId: created.customerId, errorCode: "", errorMessage: "" };
}

async function createStripeCheckoutSession(customerId, userId, options = {}) {
  const normalizedCustomerId = String(customerId || "").trim();
  const numericUserId = Number(userId || 0);
  if (!normalizedCustomerId || !Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { ok: false, url: "", errorCode: "invalid_input", errorMessage: "invalid input" };
  }

  const lookupKey = normalizeStripeLookupKey(options.lookupKey || "");
  const priceResolution = await resolveStripeCheckoutPriceId(lookupKey);
  if (!priceResolution.ok || !priceResolution.priceId) {
    return {
      ok: false,
      url: "",
      errorCode: priceResolution.errorCode || "checkout_price_failed",
      errorMessage: priceResolution.errorMessage || "stripe checkout price resolution failed",
    };
  }

  const trialPeriodDaysInput = Number(options.trialPeriodDays);
  const hasTrialOverride = options.trialPeriodDays !== undefined;
  const trialPeriodDays = hasTrialOverride
    ? Number.isInteger(trialPeriodDaysInput) && trialPeriodDaysInput >= 0
      ? trialPeriodDaysInput
      : STRIPE_TRIAL_PERIOD_DAYS
    : STRIPE_TRIAL_PERIOD_DAYS;

  const billingCycleAnchorInput = Number(options.billingCycleAnchorUnix);
  const hasAnchorOverride = options.billingCycleAnchorUnix !== undefined;
  const billingCycleAnchorUnix = hasAnchorOverride
    ? Number.isInteger(billingCycleAnchorInput) && billingCycleAnchorInput >= 0
      ? billingCycleAnchorInput
      : STRIPE_BILLING_CYCLE_ANCHOR_UNIX
    : STRIPE_BILLING_CYCLE_ANCHOR_UNIX;

  const automaticTaxEnabled =
    typeof options.automaticTaxEnabled === "boolean" ? options.automaticTaxEnabled : STRIPE_AUTOMATIC_TAX_ENABLED;

  const checkoutPayload = {
    mode: "subscription",
    customer: normalizedCustomerId,
    "line_items[0][price]": priceResolution.priceId,
    "line_items[0][quantity]": 1,
    success_url: STRIPE_SUCCESS_URL,
    cancel_url: STRIPE_CANCEL_URL,
    "metadata[user_id]": String(numericUserId),
    "metadata[price_source]": priceResolution.source,
    client_reference_id: String(numericUserId),
    "subscription_data[metadata][user_id]": String(numericUserId),
    allow_promotion_codes: true,
    "automatic_tax[enabled]": automaticTaxEnabled,
  };
  if (trialPeriodDays > 0) {
    checkoutPayload["subscription_data[trial_period_days]"] = trialPeriodDays;
  }
  if (billingCycleAnchorUnix > 0) {
    checkoutPayload["subscription_data[billing_cycle_anchor]"] = billingCycleAnchorUnix;
  }

  const result = await stripeApiRequest("POST", "/checkout/sessions", checkoutPayload);
  const checkoutUrl = String(result?.payload?.url || "").trim();
  if (!result.ok || !checkoutUrl) {
    return {
      ok: false,
      url: "",
      errorCode: result.errorCode || "checkout_create_failed",
      errorMessage: result.errorMessage || "stripe checkout create failed",
    };
  }

  return { ok: true, url: checkoutUrl, errorCode: "", errorMessage: "" };
}

async function createStripePortalSession(customerId) {
  const normalizedCustomerId = String(customerId || "").trim();
  if (!normalizedCustomerId) {
    return { ok: false, url: "", errorCode: "invalid_input", errorMessage: "invalid input" };
  }

  const result = await stripeApiRequest("POST", "/billing_portal/sessions", {
    customer: normalizedCustomerId,
    return_url: STRIPE_PORTAL_RETURN_URL,
  });
  const portalUrl = String(result?.payload?.url || "").trim();
  if (!result.ok || !portalUrl) {
    return {
      ok: false,
      url: "",
      errorCode: result.errorCode || "portal_create_failed",
      errorMessage: result.errorMessage || "stripe portal create failed",
    };
  }

  return { ok: true, url: portalUrl, errorCode: "", errorMessage: "" };
}

function parseStripeSignatureHeader(headerValue) {
  const parsed = {
    timestamp: 0,
    signatures: [],
  };
  const raw = String(headerValue || "").trim();
  if (!raw) return parsed;

  for (const part of raw.split(",")) {
    const token = String(part || "").trim();
    if (!token) continue;
    const separatorIndex = token.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;

    if (key === "t" && /^\d+$/.test(value)) {
      parsed.timestamp = Number(value);
      continue;
    }
    if (key === "v1" && /^[a-f0-9]+$/i.test(value)) {
      parsed.signatures.push(value.toLowerCase());
    }
  }

  return parsed;
}

function verifyStripeWebhookSignature(rawBodyBuffer, signatureHeader) {
  if (!Buffer.isBuffer(rawBodyBuffer) || !rawBodyBuffer.length) return false;
  if (!STRIPE_WEBHOOK_SECRET) return false;

  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed.timestamp || !parsed.signatures.length) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${rawBodyBuffer.toString("utf8")}`;
  const expectedSignature = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");

  return parsed.signatures.some((candidate) => timingSafeEqualHex(expectedSignature, candidate));
}

function toDateFromUnixSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000);
}

function readStripeObjectId(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const nestedId = String(value.id || "").trim();
    if (nestedId) return nestedId;
  }
  return "";
}

function extractStripeSubscriptionSnapshot(subscriptionObject) {
  if (!subscriptionObject || typeof subscriptionObject !== "object") return null;

  const customerId = readStripeObjectId(subscriptionObject.customer);
  const subscriptionId = readStripeObjectId(subscriptionObject.id);
  const priceId = String(subscriptionObject?.items?.data?.[0]?.price?.id || "").trim() || null;
  const status = normalizeStripeSubscriptionStatus(subscriptionObject.status);
  const periodEnd = toDateFromUnixSeconds(subscriptionObject.current_period_end);
  const metadataUserIdRaw = Number(subscriptionObject?.metadata?.user_id || 0);
  const metadataUserId = Number.isInteger(metadataUserIdRaw) && metadataUserIdRaw > 0 ? metadataUserIdRaw : null;

  if (!customerId && !subscriptionId) return null;

  return {
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    priceId,
    status,
    periodEnd,
    metadataUserId,
  };
}

async function fetchStripeSubscriptionSnapshot(subscriptionId) {
  const normalizedSubscriptionId = String(subscriptionId || "").trim();
  if (!normalizedSubscriptionId) return null;

  const result = await stripeApiRequest("GET", `/subscriptions/${encodeURIComponent(normalizedSubscriptionId)}`);
  if (!result.ok || !result.payload) return null;
  return extractStripeSubscriptionSnapshot(result.payload);
}

async function applyStripeSubscriptionSnapshot(snapshot) {
  if (!snapshot) return 0;

  if (snapshot.metadataUserId) {
    return updateUserStripeSubscriptionByUserId(snapshot.metadataUserId, {
      customerId: snapshot.customerId,
      subscriptionId: snapshot.subscriptionId,
      priceId: snapshot.priceId,
      status: snapshot.status,
      periodEnd: snapshot.periodEnd,
    });
  }

  if (snapshot.customerId) {
    return updateUserStripeSubscriptionByCustomerId(snapshot.customerId, {
      subscriptionId: snapshot.subscriptionId,
      priceId: snapshot.priceId,
      status: snapshot.status,
      periodEnd: snapshot.periodEnd,
    });
  }

  return 0;
}

async function handleStripeWebhookEvent(eventPayload) {
  const eventType = String(eventPayload?.type || "").trim();
  if (!eventType) return;

  if (eventType === "checkout.session.completed") {
    const session = eventPayload?.data?.object || {};
    const mode = String(session?.mode || "").trim().toLowerCase();
    if (mode !== "subscription") return;

    const customerId = readStripeObjectId(session?.customer);
    const subscriptionId = readStripeObjectId(session?.subscription);
    const userIdRaw = Number(session?.client_reference_id || session?.metadata?.user_id || 0);
    const userId = Number.isInteger(userIdRaw) && userIdRaw > 0 ? userIdRaw : null;

    if (userId && customerId) {
      await updateUserStripeCustomerId(userId, customerId);
    }

    if (subscriptionId) {
      const snapshot = await fetchStripeSubscriptionSnapshot(subscriptionId);
      if (snapshot) {
        if (!snapshot.metadataUserId && userId) {
          snapshot.metadataUserId = userId;
        }
        await applyStripeSubscriptionSnapshot(snapshot);
        return;
      }
    }

    if (userId) {
      await updateUserStripeSubscriptionByUserId(userId, {
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: STRIPE_PRICE_ID || null,
        status: "incomplete",
        periodEnd: null,
      });
      return;
    }

    if (customerId) {
      await updateUserStripeSubscriptionByCustomerId(customerId, {
        subscriptionId: subscriptionId || null,
        priceId: STRIPE_PRICE_ID || null,
        status: "incomplete",
        periodEnd: null,
      });
    }
    return;
  }

  if (eventType.startsWith("customer.subscription.")) {
    const snapshot = extractStripeSubscriptionSnapshot(eventPayload?.data?.object);
    if (!snapshot) return;
    await applyStripeSubscriptionSnapshot(snapshot);
  }
}

async function handleStripeWebhook(req, res) {
  if (!STRIPE_ENABLED) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    sendJson(res, 503, { ok: false, error: "stripe not configured" });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req, STRIPE_WEBHOOK_BODY_LIMIT_BYTES);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid payload" });
    return;
  }

  const signatureHeader = req.headers["stripe-signature"];
  if (!verifyStripeWebhookSignature(rawBody, signatureHeader)) {
    sendJson(res, 400, { ok: false, error: "invalid signature" });
    return;
  }

  let eventPayload = null;
  try {
    eventPayload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : null;
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "invalid payload" });
    return;
  }

  if (!eventPayload || typeof eventPayload !== "object") {
    sendJson(res, 400, { ok: false, error: "invalid payload" });
    return;
  }

  try {
    await handleStripeWebhookEvent(eventPayload);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("stripe_webhook_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountBillingGet(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const account = await getUserBillingSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    sendJson(res, 200, { ok: true, data: toAccountBillingPayload(account) });
  } catch (error) {
    console.error("account_billing_get_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountBillingCheckout(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!STRIPE_ENABLED) {
    sendJson(res, 503, { ok: false, error: "stripe disabled" });
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasLookupKeyField =
    Object.prototype.hasOwnProperty.call(body, "lookup_key") || Object.prototype.hasOwnProperty.call(body, "lookupKey");
  const lookupKeyRaw =
    typeof body?.lookup_key === "string" ? body.lookup_key : typeof body?.lookupKey === "string" ? body.lookupKey : "";
  const lookupKey = normalizeStripeLookupKey(lookupKeyRaw);
  if (hasLookupKeyField && !lookupKey) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasTrialDaysField =
    Object.prototype.hasOwnProperty.call(body, "trial_period_days") ||
    Object.prototype.hasOwnProperty.call(body, "trialPeriodDays");
  const trialDaysRaw = hasTrialDaysField ? Number(body?.trial_period_days ?? body?.trialPeriodDays) : NaN;
  const trialDays =
    hasTrialDaysField && Number.isInteger(trialDaysRaw) && trialDaysRaw >= 0 && trialDaysRaw <= 365
      ? trialDaysRaw
      : undefined;
  if (hasTrialDaysField && trialDays === undefined) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasBillingAnchorField =
    Object.prototype.hasOwnProperty.call(body, "billing_cycle_anchor") ||
    Object.prototype.hasOwnProperty.call(body, "billingCycleAnchor");
  const billingAnchorRaw = hasBillingAnchorField ? Number(body?.billing_cycle_anchor ?? body?.billingCycleAnchor) : NaN;
  const billingAnchor =
    hasBillingAnchorField && Number.isInteger(billingAnchorRaw) && billingAnchorRaw >= 0 ? billingAnchorRaw : undefined;
  if (hasBillingAnchorField && billingAnchor === undefined) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasAutomaticTaxField =
    Object.prototype.hasOwnProperty.call(body, "automatic_tax") ||
    Object.prototype.hasOwnProperty.call(body, "automaticTax");
  const automaticTaxRaw = hasAutomaticTaxField ? body?.automatic_tax ?? body?.automaticTax : undefined;
  const automaticTax = typeof automaticTaxRaw === "boolean" ? automaticTaxRaw : undefined;
  if (hasAutomaticTaxField && automaticTax === undefined) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  if (!hasStripeCheckoutPriceConfig() && !lookupKey) {
    sendJson(res, 503, { ok: false, error: "stripe not configured" });
    return;
  }

  try {
    const account = await getUserBillingSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const currentStatus = normalizeStripeSubscriptionStatus(account.stripe_subscription_status);
    if (isStripeSubscriptionActive(currentStatus)) {
      sendJson(res, 409, { ok: false, error: "already subscribed" });
      return;
    }

    let customerResult = await ensureStripeCustomerForUser(account);
    if (!customerResult.ok || !customerResult.customerId) {
      sendJson(res, 502, { ok: false, error: "stripe customer failed" });
      return;
    }

    const checkoutOptions = {
      ...(lookupKey ? { lookupKey } : {}),
      ...(trialDays !== undefined ? { trialPeriodDays: trialDays } : {}),
      ...(billingAnchor !== undefined ? { billingCycleAnchorUnix: billingAnchor } : {}),
      ...(automaticTax !== undefined ? { automaticTaxEnabled: automaticTax } : {}),
    };

    let checkoutResult = await createStripeCheckoutSession(customerResult.customerId, user.id, checkoutOptions);
    if (!checkoutResult.ok && checkoutResult.errorCode === "resource_missing") {
      const recreated = await createStripeCustomerForUser(account);
      if (recreated.ok && recreated.customerId) {
        await updateUserStripeCustomerId(user.id, recreated.customerId);
        customerResult = { ok: true, customerId: recreated.customerId, errorCode: "", errorMessage: "" };
        checkoutResult = await createStripeCheckoutSession(customerResult.customerId, user.id, checkoutOptions);
      }
    }

    if (!checkoutResult.ok || !checkoutResult.url) {
      sendJson(res, 502, { ok: false, error: "checkout failed" });
      return;
    }

    sendJson(res, 200, { ok: true, url: checkoutResult.url });
  } catch (error) {
    console.error("account_billing_checkout_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountBillingPortal(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!STRIPE_ENABLED) {
    sendJson(res, 503, { ok: false, error: "stripe disabled" });
    return;
  }

  try {
    const account = await getUserBillingSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    let customerResult = await ensureStripeCustomerForUser(account);
    if (!customerResult.ok || !customerResult.customerId) {
      sendJson(res, 502, { ok: false, error: "stripe customer failed" });
      return;
    }

    let portalResult = await createStripePortalSession(customerResult.customerId);
    if (!portalResult.ok && portalResult.errorCode === "resource_missing") {
      const recreated = await createStripeCustomerForUser(account);
      if (recreated.ok && recreated.customerId) {
        await updateUserStripeCustomerId(user.id, recreated.customerId);
        customerResult = { ok: true, customerId: recreated.customerId, errorCode: "", errorMessage: "" };
        portalResult = await createStripePortalSession(customerResult.customerId);
      }
    }

    if (!portalResult.ok || !portalResult.url) {
      sendJson(res, 502, { ok: false, error: "portal failed" });
      return;
    }

    sendJson(res, 200, { ok: true, url: portalResult.url });
  } catch (error) {
    console.error("account_billing_portal_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function postDiscordWebhook(webhookUrl, payload) {
  const normalizedWebhook = normalizeDiscordWebhookUrl(webhookUrl);
  if (!normalizedWebhook) {
    return { ok: false, statusCode: 0, error: "invalid webhook url" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (error) {
        errorText = "";
      }
      return {
        ok: false,
        statusCode: Number(response.status || 0),
        error: String(errorText || `http_${response.status || "error"}`).slice(0, 300),
      };
    }

    return { ok: true, statusCode: Number(response.status || 204), error: null };
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return {
      ok: false,
      statusCode: 0,
      error: isTimeout ? "timeout" : String(error?.message || "request failed").slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postSlackWebhook(webhookUrl, payload) {
  const normalizedWebhook = normalizeSlackWebhookUrl(webhookUrl);
  if (!normalizedWebhook) {
    return { ok: false, statusCode: 0, error: "invalid webhook url" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PingMyServer",
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (error) {
        errorText = "";
      }
      return {
        ok: false,
        statusCode: Number(response.status || 0),
        error: String(errorText || `http_${response.status || "error"}`).slice(0, 300),
      };
    }

    return { ok: true, statusCode: Number(response.status || 200), error: null };
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return {
      ok: false,
      statusCode: 0,
      error: isTimeout ? "timeout" : String(error?.message || "request failed").slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createWebhookHmacSignature(secret, timestamp, rawBody) {
  const normalizedSecret = normalizeWebhookSecret(secret);
  if (!normalizedSecret) return null;
  const normalizedTimestamp = String(timestamp || "").trim();
  if (!normalizedTimestamp) return null;
  const payload = `${normalizedTimestamp}.${rawBody || ""}`;
  try {
    return crypto.createHmac("sha256", normalizedSecret).update(payload).digest("hex");
  } catch (error) {
    return null;
  }
}

async function postGenericWebhook(webhookUrl, payload, options = {}) {
  const normalizedWebhook = normalizeGenericWebhookUrl(webhookUrl);
  if (!normalizedWebhook) {
    return { ok: false, statusCode: 0, error: "invalid webhook url" };
  }

  const validation = await validateOutboundWebhookTarget(normalizedWebhook);
  if (!validation.allowed) {
    return { ok: false, statusCode: 0, error: "target forbidden", code: validation.reason };
  }

  const eventName = String(options.event || "test").trim().slice(0, 64) || "test";
  const secret = normalizeWebhookSecret(options.secret);
  const rawBody = JSON.stringify(payload || {});
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "PingMyServer",
    "X-PMS-Event": eventName,
    "X-PMS-Timestamp": String(timestamp),
  };
  if (secret) {
    const signature = createWebhookHmacSignature(secret, timestamp, rawBody);
    if (signature) {
      headers["X-PMS-Signature"] = `sha256=${signature}`;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedWebhook, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (error) {
        errorText = "";
      }
      return {
        ok: false,
        statusCode: Number(response.status || 0),
        error: String(errorText || `http_${response.status || "error"}`).slice(0, 300),
      };
    }

    return { ok: true, statusCode: Number(response.status || 200), error: null };
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return {
      ok: false,
      statusCode: 0,
      error: isTimeout ? "timeout" : String(error?.message || "request failed").slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendDiscordStatusNotificationForMonitorChange({
  userId,
  monitor,
  previousStatus,
  nextStatus,
  elapsedMs,
  statusCode,
  errorMessage,
}) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) return;
  if (!monitor) return;

  const account = await getUserNotificationSettingsById(numericUserId);
  if (!account) return;

  const enabled = Number(account.notify_discord_enabled || 0) === 1;
  if (!enabled) return;

  const webhookUrl = normalizeDiscordWebhookUrl(account.notify_discord_webhook_url);
  if (!webhookUrl) return;

  const targetUrl = getMonitorUrl(monitor);
  const targetForMessage = String(targetUrl || "-").slice(0, 500);
  const monitorName = String(monitor.name || getDefaultMonitorName(targetUrl)).slice(0, 255);
  const previous = String(previousStatus || "unknown");
  const next = String(nextStatus || "unknown");
  const isOffline = next === "offline";
  const statusLabel = isOffline ? "OFFLINE" : "ONLINE";
  const color = isOffline ? 0xed4245 : 0x57f287;
  const checkedAtIso = new Date().toISOString();
  const sanitizedError = String(errorMessage || "").slice(0, 220);

  const payload = {
    username: "PingMyServer",
    embeds: [
      {
        title: `Monitor ${statusLabel}`,
        color,
        timestamp: checkedAtIso,
        fields: [
          { name: "Monitor", value: monitorName || "-", inline: true },
          { name: "Status", value: `${previous} → ${next}`, inline: true },
          { name: "Antwortzeit", value: `${Math.max(0, Number(elapsedMs || 0))} ms`, inline: true },
          { name: "URL", value: targetForMessage, inline: false },
          { name: "HTTP Status", value: Number.isFinite(Number(statusCode)) ? String(statusCode) : "-", inline: true },
          { name: "Fehler", value: sanitizedError || "-", inline: true },
        ],
        footer: {
          text: "PingMyServer Benachrichtigung",
        },
      },
    ],
  };

  const deliveryResult = await postDiscordWebhook(webhookUrl, payload);
  if (!deliveryResult.ok) {
    console.error("discord_monitor_notification_failed", numericUserId, deliveryResult.statusCode, deliveryResult.error);
  }
}

async function sendSlackStatusNotificationForMonitorChange({
  userId,
  monitor,
  previousStatus,
  nextStatus,
  elapsedMs,
  statusCode,
  errorMessage,
}) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) return;
  if (!monitor) return;

  const account = await getUserNotificationSettingsById(numericUserId);
  if (!account) return;

  const enabled = Number(account.notify_slack_enabled || 0) === 1;
  if (!enabled) return;

  const webhookUrl = normalizeSlackWebhookUrl(account.notify_slack_webhook_url);
  if (!webhookUrl) return;

  const targetUrl = getMonitorUrl(monitor);
  const targetForMessage = String(targetUrl || "-").slice(0, 500);
  const monitorName = String(monitor.name || getDefaultMonitorName(targetUrl)).slice(0, 255);
  const previous = String(previousStatus || "unknown");
  const next = String(nextStatus || "unknown");
  const isOffline = next === "offline";
  const statusLabel = isOffline ? "OFFLINE" : "ONLINE";
  const checkedAtIso = new Date().toISOString();
  const sanitizedError = String(errorMessage || "").slice(0, 220);

  const payload = {
    text: `Monitor ${statusLabel}: ${monitorName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Monitor ${statusLabel}`, emoji: false },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Monitor:*\n${monitorName || "-"}` },
          { type: "mrkdwn", text: `*Status:*\n${previous} -> ${next}` },
          { type: "mrkdwn", text: `*Response:*\n${Math.max(0, Number(elapsedMs || 0))} ms` },
          {
            type: "mrkdwn",
            text: `*HTTP Status:*\n${Number.isFinite(Number(statusCode)) ? String(statusCode) : "-"}`,
          },
          { type: "mrkdwn", text: `*URL:*\n${targetForMessage}` },
          { type: "mrkdwn", text: `*Error:*\n${sanitizedError || "-"}` },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `PingMyServer notification · ${checkedAtIso}` }],
      },
    ],
  };

  const deliveryResult = await postSlackWebhook(webhookUrl, payload);
  if (!deliveryResult.ok) {
    console.error("slack_monitor_notification_failed", numericUserId, deliveryResult.statusCode, deliveryResult.error);
  }
}

async function sendWebhookStatusNotificationForMonitorChange({
  userId,
  monitor,
  previousStatus,
  nextStatus,
  elapsedMs,
  statusCode,
  errorMessage,
}) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) return;
  if (!monitor) return;

  const account = await getUserNotificationSettingsById(numericUserId);
  if (!account) return;

  const enabled = Number(account.notify_webhook_enabled || 0) === 1;
  if (!enabled) return;

  const webhookUrl = normalizeGenericWebhookUrl(account.notify_webhook_url);
  if (!webhookUrl) return;

  const secret = normalizeWebhookSecret(account.notify_webhook_secret);
  const targetUrl = getMonitorUrl(monitor);
  const monitorName = String(monitor.name || getDefaultMonitorName(targetUrl)).slice(0, 255);

  const payload = {
    version: 1,
    event: "monitor.status_changed",
    sent_at: new Date().toISOString(),
    data: {
      monitor: {
        id: String(monitor.public_id || monitor.id || ""),
        name: monitorName || "",
        url: String(targetUrl || ""),
      },
      previous_status: String(previousStatus || "unknown"),
      next_status: String(nextStatus || "unknown"),
      response_ms: Math.max(0, Number(elapsedMs || 0)),
      status_code: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
      error_message: String(errorMessage || "") || null,
    },
  };

  const deliveryResult = await postGenericWebhook(webhookUrl, payload, {
    event: "monitor.status_changed",
    secret,
  });
  if (!deliveryResult.ok) {
    console.error(
      "generic_webhook_monitor_notification_failed",
      numericUserId,
      deliveryResult.statusCode,
      deliveryResult.code || "",
      deliveryResult.error
    );
  }
}

async function handleAccountNotificationsGet(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(account) });
  } catch (error) {
    console.error("account_notifications_get_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDiscordNotificationUpsert(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasEnabledField = Object.prototype.hasOwnProperty.call(body || {}, "enabled");
  const enabledInput = body?.enabled;
  if (hasEnabledField && typeof enabledInput !== "boolean") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasWebhookField = Object.prototype.hasOwnProperty.call(body || {}, "webhookUrl");
  const webhookInput = hasWebhookField && typeof body?.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (hasWebhookField && typeof body?.webhookUrl !== "string") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const currentWebhook = normalizeDiscordWebhookUrl(account.notify_discord_webhook_url);
    let nextWebhook = currentWebhook;
    if (hasWebhookField) {
      const normalized = normalizeDiscordWebhookUrl(webhookInput);
      if (!normalized) {
        sendJson(res, 400, { ok: false, error: "invalid webhook url" });
        return;
      }
      nextWebhook = normalized;
    }

    if (!nextWebhook) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const nextEnabled = hasEnabledField ? enabledInput === true : true;
    await pool.query(
      "UPDATE users SET notify_discord_webhook_url = ?, notify_discord_enabled = ? WHERE id = ? LIMIT 1",
      [nextWebhook, nextEnabled ? 1 : 0, user.id]
    );

    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || account) });
  } catch (error) {
    console.error("account_discord_notification_upsert_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDiscordNotificationDelete(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    await pool.query(
      "UPDATE users SET notify_discord_webhook_url = NULL, notify_discord_enabled = 0 WHERE id = ? LIMIT 1",
      [user.id]
    );
    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || {}) });
  } catch (error) {
    console.error("account_discord_notification_delete_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDiscordNotificationTest(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const webhookUrl = normalizeDiscordWebhookUrl(account.notify_discord_webhook_url);
    if (!webhookUrl) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const payload = {
      username: "PingMyServer",
      embeds: [
        {
          title: "Discord Webhook Test",
          color: 0x4cc9f0,
          timestamp: new Date().toISOString(),
          description: "Die Benachrichtigung ist aktiv und einsatzbereit.",
          fields: [{ name: "Konto", value: String(account.email || user.email || "eingeloggt"), inline: false }],
          footer: { text: "PingMyServer Benachrichtigung" },
        },
      ],
    };

    const deliveryResult = await postDiscordWebhook(webhookUrl, payload);
    if (!deliveryResult.ok) {
      sendJson(res, 502, { ok: false, error: "delivery failed" });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("account_discord_notification_test_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountSlackNotificationUpsert(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasEnabledField = Object.prototype.hasOwnProperty.call(body || {}, "enabled");
  const enabledInput = body?.enabled;
  if (hasEnabledField && typeof enabledInput !== "boolean") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasWebhookField = Object.prototype.hasOwnProperty.call(body || {}, "webhookUrl");
  const webhookInput = hasWebhookField && typeof body?.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (hasWebhookField && typeof body?.webhookUrl !== "string") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const currentWebhook = normalizeSlackWebhookUrl(account.notify_slack_webhook_url);
    let nextWebhook = currentWebhook;
    if (hasWebhookField) {
      const normalized = normalizeSlackWebhookUrl(webhookInput);
      if (!normalized) {
        sendJson(res, 400, { ok: false, error: "invalid webhook url" });
        return;
      }
      nextWebhook = normalized;
    }

    if (!nextWebhook) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const nextEnabled = hasEnabledField ? enabledInput === true : true;
    await pool.query(
      "UPDATE users SET notify_slack_webhook_url = ?, notify_slack_enabled = ? WHERE id = ? LIMIT 1",
      [nextWebhook, nextEnabled ? 1 : 0, user.id]
    );

    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || account) });
  } catch (error) {
    console.error("account_slack_notification_upsert_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountSlackNotificationDelete(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    await pool.query("UPDATE users SET notify_slack_webhook_url = NULL, notify_slack_enabled = 0 WHERE id = ? LIMIT 1", [
      user.id,
    ]);
    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || {}) });
  } catch (error) {
    console.error("account_slack_notification_delete_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountSlackNotificationTest(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const webhookUrl = normalizeSlackWebhookUrl(account.notify_slack_webhook_url);
    if (!webhookUrl) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const payload = {
      text: "PingMyServer Slack Webhook Test",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Slack Webhook Test", emoji: false } },
        {
          type: "section",
          text: { type: "mrkdwn", text: "Notifications are enabled and ready to send monitor status changes." },
        },
      ],
    };

    const deliveryResult = await postSlackWebhook(webhookUrl, payload);
    if (!deliveryResult.ok) {
      sendJson(res, 502, { ok: false, error: "delivery failed" });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("account_slack_notification_test_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountWebhookNotificationUpsert(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasEnabledField = Object.prototype.hasOwnProperty.call(body || {}, "enabled");
  const enabledInput = body?.enabled;
  if (hasEnabledField && typeof enabledInput !== "boolean") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasUrlField = Object.prototype.hasOwnProperty.call(body || {}, "url");
  const urlInput = hasUrlField && typeof body?.url === "string" ? body.url.trim() : "";
  if (hasUrlField && typeof body?.url !== "string") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasSecretField = Object.prototype.hasOwnProperty.call(body || {}, "secret");
  const secretInput = hasSecretField && typeof body?.secret === "string" ? body.secret : "";
  if (hasSecretField && typeof body?.secret !== "string") {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const currentUrl = normalizeGenericWebhookUrl(account.notify_webhook_url);
    let nextUrl = currentUrl;
    if (hasUrlField) {
      const normalized = normalizeGenericWebhookUrl(urlInput);
      if (!normalized) {
        sendJson(res, 400, { ok: false, error: "invalid webhook url" });
        return;
      }

      const validation = await validateOutboundWebhookTarget(normalized);
      if (!validation.allowed) {
        sendJson(res, 400, { ok: false, error: "webhook target forbidden", code: validation.reason });
        return;
      }
      nextUrl = normalized;
    }

    if (!nextUrl) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const currentSecret = normalizeWebhookSecret(account.notify_webhook_secret);
    let nextSecret = currentSecret;
    if (hasSecretField) {
      nextSecret = normalizeWebhookSecret(secretInput);
    }

    const nextEnabled = hasEnabledField ? enabledInput === true : true;
    await pool.query(
      "UPDATE users SET notify_webhook_url = ?, notify_webhook_secret = ?, notify_webhook_enabled = ? WHERE id = ? LIMIT 1",
      [nextUrl, nextSecret, nextEnabled ? 1 : 0, user.id]
    );

    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || account) });
  } catch (error) {
    console.error("account_webhook_notification_upsert_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountWebhookNotificationDelete(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    await pool.query(
      "UPDATE users SET notify_webhook_url = NULL, notify_webhook_secret = NULL, notify_webhook_enabled = 0 WHERE id = ? LIMIT 1",
      [user.id]
    );
    const updated = await getUserNotificationSettingsById(user.id);
    sendJson(res, 200, { ok: true, data: toAccountNotificationsPayload(updated || {}) });
  } catch (error) {
    console.error("account_webhook_notification_delete_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountWebhookNotificationTest(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const account = await getUserNotificationSettingsById(user.id);
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const webhookUrl = normalizeGenericWebhookUrl(account.notify_webhook_url);
    if (!webhookUrl) {
      sendJson(res, 400, { ok: false, error: "webhook required" });
      return;
    }

    const secret = normalizeWebhookSecret(account.notify_webhook_secret);
    const payload = {
      version: 1,
      event: "test",
      sent_at: new Date().toISOString(),
      data: {
        account: { id: String(account.id || user.id || ""), email: String(account.email || user.email || "") },
        message: "PingMyServer webhook delivery test.",
      },
    };

    const deliveryResult = await postGenericWebhook(webhookUrl, payload, { event: "test", secret });
    if (!deliveryResult.ok) {
      if (deliveryResult.error === "target forbidden") {
        sendJson(res, 400, { ok: false, error: "webhook target forbidden", code: deliveryResult.code || "" });
        return;
      }
      sendJson(res, 502, { ok: false, error: "delivery failed" });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("account_webhook_notification_test_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountSessionRevoke(req, res, sessionId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const normalizedSessionId = String(sessionId || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedSessionId)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const [result] = await pool.query("DELETE FROM sessions WHERE user_id = ? AND id = ? LIMIT 1", [
      user.id,
      normalizedSessionId,
    ]);
    if (!Number(result?.affectedRows || 0)) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const currentTerminated = normalizedSessionId === req.sessionId;
    if (currentTerminated) {
      clearSessionCookie(res);
    }

    sendJson(res, 200, { ok: true, currentTerminated });
  } catch (error) {
    console.error("account_session_revoke_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountRevokeOtherSessions(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const [result] = await pool.query("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, req.sessionId]);
    sendJson(res, 200, { ok: true, revoked: Number(result?.affectedRows || 0) });
  } catch (error) {
    console.error("account_revoke_other_sessions_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountPasswordChange(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!validatePassword(newPassword)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, email, password_hash, github_id, google_sub, discord_id FROM users WHERE id = ? LIMIT 1",
      [user.id]
    );
    const account = rows[0] || null;
    if (!account) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const allowPasswordlessChange = hasLinkedOauthConnection(account);
    if (currentPassword) {
      const currentMatches = await bcrypt.compare(currentPassword, account.password_hash);
      if (!currentMatches) {
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
    } else if (!allowPasswordlessChange) {
      sendJson(res, 400, { ok: false, error: "current password required" });
      return;
    } else if (!isSessionFreshEnough(req)) {
      sendJson(res, 401, { ok: false, error: "reauth required" });
      return;
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, account.password_hash);
    if (sameAsCurrent) {
      sendJson(res, 400, { ok: false, error: "same password" });
      return;
    }

    const nextHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1", [nextHash, user.id]);

    const [revokeResult] = await pool.query("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, req.sessionId]);
    sendJson(res, 200, { ok: true, revoked: Number(revokeResult?.affectedRows || 0) });
  } catch (error) {
    console.error("account_password_change_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleAccountDelete(req, res) {
  if (!enforceAuthRateLimit(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }

  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const oauthConfirm = body?.oauthConfirm === true;

  let connection = null;
  try {
    const [rows] = await pool.query(
      "SELECT id, email, password_hash, github_id, google_sub, discord_id FROM users WHERE id = ? LIMIT 1",
      [user.id]
    );
    const account = rows[0] || null;
    if (!account) {
      clearSessionCookie(res);
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const allowPasswordlessDelete = hasLinkedOauthConnection(account);
    if (currentPassword) {
      const currentMatches = await bcrypt.compare(currentPassword, account.password_hash);
      if (!currentMatches) {
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
    } else if (!(allowPasswordlessDelete && oauthConfirm)) {
      sendJson(res, 400, { ok: false, error: "current password required" });
      return;
    } else if (!isSessionFreshEnough(req)) {
      sendJson(res, 401, { ok: false, error: "reauth required" });
      return;
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Explicit cleanup keeps data consistent even when old DB instances miss some FKs.
    await connection.query(
      "DELETE FROM monitor_daily_error_codes WHERE monitor_id IN (SELECT id FROM monitors WHERE user_id = ?)",
      [user.id]
    );
    await connection.query(
      "DELETE FROM monitor_daily_stats WHERE monitor_id IN (SELECT id FROM monitors WHERE user_id = ?)",
      [user.id]
    );
    await connection.query(
      "DELETE FROM monitor_checks WHERE monitor_id IN (SELECT id FROM monitors WHERE user_id = ?)",
      [user.id]
    );
    await connection.query("DELETE FROM monitors WHERE user_id = ?", [user.id]);
    await connection.query("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    await connection.query("DELETE FROM auth_failures WHERE email = ?", [account.email]);

    const [deleteUserResult] = await connection.query("DELETE FROM users WHERE id = ? LIMIT 1", [user.id]);
    if (!Number(deleteUserResult?.affectedRows || 0)) {
      await connection.rollback();
      connection.release();
      connection = null;
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    await connection.commit();
    connection.release();
    connection = null;

    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        // ignore rollback errors
      }
      connection.release();
    }
    console.error("account_delete_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

function buildOwnerRuntimeSnapshot() {
  const memoryUsage = process.memoryUsage();
  const checksTotal = Number(runtimeTelemetry.checks.total || 0);
  const checksFailed = Number(runtimeTelemetry.checks.failed || 0);
  const checksOk = Number(runtimeTelemetry.checks.ok || 0);
  const failureRate = checksTotal > 0 ? (checksFailed / checksTotal) * 100 : 0;

  return {
    process: {
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      rssMb: roundTo(memoryUsage.rss / 1024 / 1024, 2),
      heapUsedMb: roundTo(memoryUsage.heapUsed / 1024 / 1024, 2),
      heapTotalMb: roundTo(memoryUsage.heapTotal / 1024 / 1024, 2),
      cpuPercentAvg: roundTo(getAverage(runtimeTelemetry.process.cpuPercentSamples), 2),
      cpuPercentP95: roundTo(getPercentile(runtimeTelemetry.process.cpuPercentSamples, 95), 2),
      eventLoopLagMsAvg: roundTo(getAverage(runtimeTelemetry.process.eventLoopLagMsSamples), 2),
      eventLoopLagMsP95: roundTo(getPercentile(runtimeTelemetry.process.eventLoopLagMsSamples, 95), 2),
      cpuCoreCount,
    },
    scheduler: {
      runs: Number(runtimeTelemetry.scheduler.runs || 0),
      skippedDueToOverlap: Number(runtimeTelemetry.scheduler.skippedDueToOverlap || 0),
      lastStartedAt: runtimeTelemetry.scheduler.lastStartedAt || null,
      lastFinishedAt: runtimeTelemetry.scheduler.lastFinishedAt || null,
      lastDurationMs: roundTo(runtimeTelemetry.scheduler.lastDurationMs, 2),
      lastDueMonitors: Number(runtimeTelemetry.scheduler.lastDueMonitors || 0),
      driftMsP95: roundTo(getPercentile(runtimeTelemetry.scheduler.driftMsSamples, 95), 2),
      allOfflineFailsafeEnabled: FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED,
      allOfflineFailsafeTriggerPercent: roundTo(FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT, 2),
      allOfflineFailsafeConsecutiveCycles: FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES,
      allOfflineFailsafeCurrentStreak: allMonitorsOfflineConsecutiveCount,
      allOfflineFailsafeTriggered: allMonitorsOfflineShutdownTriggered,
    },
    checks: {
      inFlight: Number(runtimeTelemetry.checks.inFlight || 0),
      maxInFlight: Number(runtimeTelemetry.checks.maxInFlight || 0),
      total: checksTotal,
      ok: checksOk,
      failed: checksFailed,
      timedOut: Number(runtimeTelemetry.checks.timedOut || 0),
      blocked: Number(runtimeTelemetry.checks.blocked || 0),
      avgDurationMs: roundTo(getAverage(runtimeTelemetry.checks.durationMsSamples), 2),
      p95DurationMs: roundTo(getPercentile(runtimeTelemetry.checks.durationMsSamples, 95), 2),
      failureRatePercent: roundTo(failureRate, 2),
    },
    db: {
      queryCount: Number(runtimeTelemetry.db.queryCount || 0),
      slowQueryCount: Number(runtimeTelemetry.db.slowQueryCount || 0),
      maxQueryMs: roundTo(runtimeTelemetry.db.maxQueryMs, 2),
      avgQueryMs: roundTo(getAverage(runtimeTelemetry.db.queryDurationMsSamples), 2),
      p95QueryMs: roundTo(getPercentile(runtimeTelemetry.db.queryDurationMsSamples, 95), 2),
      activeOperations: Number(runtimeTelemetry.db.activeOperations || 0),
      maxActiveOperations: Number(runtimeTelemetry.db.maxActiveOperations || 0),
      maxQueuedOperations: Number(runtimeTelemetry.db.maxQueuedOperations || 0),
      acquiredConnections: Number(runtimeTelemetry.db.acquiredConnections || 0),
      releasedConnections: Number(runtimeTelemetry.db.releasedConnections || 0),
      avgAcquireWaitMs: roundTo(getAverage(runtimeTelemetry.db.connectionAcquireWaitMsSamples), 2),
      p95AcquireWaitMs: roundTo(getPercentile(runtimeTelemetry.db.connectionAcquireWaitMsSamples, 95), 2),
      pool: getDbPoolSnapshot(),
    },
    security: {
      invalidOriginBlocked: Number(runtimeTelemetry.security.invalidOriginBlocked || 0),
      authRateLimited: Number(runtimeTelemetry.security.authRateLimited || 0),
      oauthStateRejected: Number(runtimeTelemetry.security.oauthStateRejected || 0),
      monitorTargetBlocked: Number(runtimeTelemetry.security.monitorTargetBlocked || 0),
      monitorTargetBlockReasons: mapToSortedCounterList(runtimeTelemetry.security.monitorTargetBlockReasons, 10),
    },
    startedAt: runtimeTelemetry.startedAt,
  };
}

function toOwnerMonitorCostRow(row) {
  const checks24h = Number(row.checks_24h || 0);
  const fail24h = Number(row.fail_24h || 0);
  const ok24h = Number(row.ok_24h || 0);
  const timeout24h = Number(row.timeout_24h || 0);
  const blocked24h = Number(row.blocked_24h || 0);
  const avgResponseMs = Number(row.avg_ms_24h || 0);
  const maxResponseMs = Number(row.max_ms_24h || 0);
  const checksPerMinute = checks24h / (24 * 60);
  const failRatePercent = checks24h > 0 ? (fail24h / checks24h) * 100 : 0;

  const costScoreRaw = checksPerMinute * Math.max(avgResponseMs, 1) + fail24h * 1.5 + timeout24h * 3 + blocked24h * 4;

  return {
    monitorId: Number(row.id),
    publicId: isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null,
    userId: Number(row.user_id),
    name: String(row.name || ""),
    target: String(row.target_url || row.url || ""),
    intervalMs: Number(row.interval_ms || 0),
    paused: !!row.is_paused,
    lastStatus: String(row.last_status || "unknown"),
    lastCheckedAt: toTimestampMs(row.last_checked_at),
    lastResponseMs: Number(row.last_response_ms || 0) || null,
    checks24h,
    ok24h,
    fail24h,
    timeout24h,
    blocked24h,
    avgResponseMs: roundTo(avgResponseMs, 2),
    maxResponseMs: roundTo(maxResponseMs, 2),
    checksPerMinute: roundTo(checksPerMinute, 4),
    failRatePercent: roundTo(failRatePercent, 2),
    costScore: roundTo(costScoreRaw, 2),
  };
}

async function fetchOwnerMonitorCostRows(limit = OWNER_TOP_MONITOR_LIMIT) {
  const [rows] = await pool.query(
    `
      SELECT
        m.id,
        m.public_id,
        m.user_id,
        m.name,
        m.url,
        m.target_url,
        m.interval_ms,
        m.is_paused,
        m.last_status,
        m.last_checked_at,
        m.last_response_ms,
        COUNT(c.id) AS checks_24h,
        SUM(CASE WHEN c.ok = 1 THEN 1 ELSE 0 END) AS ok_24h,
        SUM(CASE WHEN c.ok = 0 THEN 1 ELSE 0 END) AS fail_24h,
        AVG(c.response_ms) AS avg_ms_24h,
        MAX(c.response_ms) AS max_ms_24h,
        SUM(CASE WHEN c.error_message LIKE 'Target blocked by security policy%' THEN 1 ELSE 0 END) AS blocked_24h,
        SUM(
          CASE
            WHEN LOWER(COALESCE(c.error_message, '')) LIKE '%abort%'
              OR LOWER(COALESCE(c.error_message, '')) LIKE '%timed out%'
            THEN 1
            ELSE 0
          END
        ) AS timeout_24h
      FROM monitors m
      LEFT JOIN monitor_checks c
        ON c.monitor_id = m.id
       AND c.checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
      WHERE m.user_id IS NOT NULL
      GROUP BY
        m.id,
        m.public_id,
        m.user_id,
        m.name,
        m.url,
        m.target_url,
        m.interval_ms,
        m.is_paused,
        m.last_status,
        m.last_checked_at,
        m.last_response_ms
    `
  );

  return rows
    .map((row) => toOwnerMonitorCostRow(row))
    .sort((left, right) => right.costScore - left.costScore)
    .slice(0, Math.max(1, Math.min(OWNER_TOP_MONITOR_LIMIT, Number(limit) || OWNER_TOP_MONITOR_LIMIT)));
}

async function handleOwnerOverview(req, res) {
  const owner = await requireOwner(req, res);
  if (!owner) return;

  try {
    const runtime = buildOwnerRuntimeSnapshot();
    const [monitorRows] = await pool.query(
      `
        SELECT
          COUNT(*) AS total_monitors,
          SUM(CASE WHEN is_paused = 0 THEN 1 ELSE 0 END) AS active_monitors,
          SUM(CASE WHEN is_paused = 1 THEN 1 ELSE 0 END) AS paused_monitors
        FROM monitors
        WHERE user_id IS NOT NULL
      `
    );
    const [recentRows] = await pool.query(
      `
        SELECT
          COUNT(*) AS checks_10m,
          SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed_10m,
          AVG(response_ms) AS avg_response_ms_10m,
          MAX(response_ms) AS max_response_ms_10m
        FROM monitor_checks
        WHERE checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE)
      `
    );
    const [sessionRows] = await pool.query("SELECT COUNT(*) AS active_sessions FROM sessions");

    const monitorSummary = monitorRows[0] || {};
    const recentSummary = recentRows[0] || {};
    const checks10m = Number(recentSummary.checks_10m || 0);
    const failed10m = Number(recentSummary.failed_10m || 0);
    const failureRate10m = checks10m > 0 ? (failed10m / checks10m) * 100 : 0;

    sendJson(res, 200, {
      ok: true,
      data: {
        ownerUserId: Number(owner.id),
        monitorSummary: {
          total: Number(monitorSummary.total_monitors || 0),
          active: Number(monitorSummary.active_monitors || 0),
          paused: Number(monitorSummary.paused_monitors || 0),
        },
        recentChecks: {
          checks10m,
          failed10m,
          failureRate10mPercent: roundTo(failureRate10m, 2),
          avgResponseMs10m: roundTo(recentSummary.avg_response_ms_10m, 2),
          maxResponseMs10m: roundTo(recentSummary.max_response_ms_10m, 2),
        },
        activeSessions: Number(sessionRows[0]?.active_sessions || 0),
        runtime,
      },
    });
  } catch (error) {
    console.error("owner_overview_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleOwnerMonitors(req, res, url) {
  const owner = await requireOwner(req, res);
  if (!owner) return;

  const requestedLimit = Number(url?.searchParams?.get("limit") || OWNER_TOP_MONITOR_LIMIT);
  const limit = Math.max(10, Math.min(OWNER_TOP_MONITOR_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : 50));

  try {
    const items = await fetchOwnerMonitorCostRows(limit);
    sendJson(res, 200, {
      ok: true,
      data: {
        ownerUserId: Number(owner.id),
        limit,
        items,
      },
    });
  } catch (error) {
    console.error("owner_monitors_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleOwnerSecurity(req, res) {
  const owner = await requireOwner(req, res);
  if (!owner) return;

  try {
    const [errorRows] = await pool.query(
      `
        SELECT
          COALESCE(NULLIF(TRIM(error_message), ''), 'keine Fehlermeldung') AS error_message,
          COUNT(*) AS hits
        FROM monitor_checks
        WHERE ok = 0
          AND checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
        GROUP BY COALESCE(NULLIF(TRIM(error_message), ''), 'keine Fehlermeldung')
        ORDER BY hits DESC
        LIMIT 20
      `
    );
    const [failingMonitorRows] = await pool.query(
      `
        SELECT
          m.id,
          m.public_id,
          m.user_id,
          m.name,
          COUNT(c.id) AS total_checks,
          SUM(CASE WHEN c.ok = 0 THEN 1 ELSE 0 END) AS failed_checks
        FROM monitors m
        JOIN monitor_checks c
          ON c.monitor_id = m.id
         AND c.checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
        WHERE m.user_id IS NOT NULL
        GROUP BY m.id, m.public_id, m.user_id, m.name
        HAVING COUNT(c.id) > 0
        ORDER BY failed_checks DESC, total_checks DESC
        LIMIT 20
      `
    );
    const [authFailureRows] = await pool.query(
      `
        SELECT
          COUNT(*) AS tracked_auth_failures,
          SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END) AS locked_accounts,
          SUM(CASE WHEN last_fail >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS recent_auth_failures
        FROM auth_failures
      `
    );

    const topErrors = errorRows.map((row) => ({
      message: String(row.error_message || "keine Fehlermeldung"),
      hits: Number(row.hits || 0),
    }));
    const failingMonitors = failingMonitorRows.map((row) => {
      const totalChecks = Number(row.total_checks || 0);
      const failedChecks = Number(row.failed_checks || 0);
      const failureRatePercent = totalChecks > 0 ? (failedChecks / totalChecks) * 100 : 0;
      return {
        monitorId: Number(row.id),
        publicId: isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : null,
        userId: Number(row.user_id),
        name: String(row.name || ""),
        totalChecks,
        failedChecks,
        failureRatePercent: roundTo(failureRatePercent, 2),
      };
    });
    const authSummary = authFailureRows[0] || {};

    sendJson(res, 200, {
      ok: true,
      data: {
        ownerUserId: Number(owner.id),
        runtimeSecurity: buildOwnerRuntimeSnapshot().security,
        topErrors,
        failingMonitors,
        auth: {
          trackedAuthFailures: Number(authSummary.tracked_auth_failures || 0),
          lockedAccounts: Number(authSummary.locked_accounts || 0),
          recentAuthFailures24h: Number(authSummary.recent_auth_failures || 0),
        },
      },
    });
  } catch (error) {
    console.error("owner_security_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleCreateMonitor(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const [monitorCountRows] = await pool.query("SELECT COUNT(*) AS total FROM monitors WHERE user_id = ?", [user.id]);
  const monitorCount = Number(monitorCountRows[0]?.total || 0);
  if (monitorCount >= MONITORS_PER_USER_MAX) {
    sendJson(res, 429, { ok: false, error: "monitor limit reached" });
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url || "/api/monitors", "http://localhost");
  } catch (error) {
    requestUrl = new URL("/api/monitors", "http://localhost");
  }

  const pathMatch = requestUrl.pathname.match(
    /^\/(?:api\/)?(?:monitor-create|create-monitor)\/([A-Za-z0-9_-]{1,4096})(?:\/([A-Za-z0-9_-]{1,1024}))?\/?$/
  );
  const pathUrlB64 = pathMatch ? String(pathMatch[1] || "").trim() : "";
  const pathNameB64 = pathMatch ? String(pathMatch[2] || "").trim() : "";

  const queryUrlB64 = String(requestUrl.searchParams.get("u") || requestUrl.searchParams.get("url_b64") || "").trim();
  const queryUrlRaw = String(requestUrl.searchParams.get("url") || "").trim();
  const queryNameB64 = String(requestUrl.searchParams.get("n") || requestUrl.searchParams.get("name_b64") || "").trim();
  const queryNameRaw = String(requestUrl.searchParams.get("name") || "").trim();
  const queryHasMonitorInput = Boolean(queryUrlB64 || queryUrlRaw || pathUrlB64);

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (!queryHasMonitorInput) {
      sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
      return;
    }
  }

  const decodedUrl = decodeBase64UrlUtf8(body?.url_b64, 4096);
  const decodedPathUrl = decodeBase64UrlUtf8(pathUrlB64, 4096);
  const decodedQueryUrl = decodeBase64UrlUtf8(queryUrlB64, 4096);
  const bodyRawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const rawUrlInput = bodyRawUrl || decodedUrl || queryUrlRaw || decodedQueryUrl || decodedPathUrl;
  const normalizedUrl = normalizeMonitorUrl(rawUrlInput);
  if (!normalizedUrl) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const targetValidation = await validateMonitorTarget(normalizedUrl, { useCache: true });
  if (!targetValidation.allowed) {
    const normalizedReason = normalizeTargetValidationReasonForTelemetry(targetValidation.reason);

    // DNS-Aussetzer beim Anlegen sollen nicht hart blockieren.
    // Laufende Checks bleiben trotzdem durch die Policy abgesichert.
    if (normalizedReason !== "dns_unresolved") {
      runtimeTelemetry.security.monitorTargetBlocked += 1;
      incrementCounterMap(runtimeTelemetry.security.monitorTargetBlockReasons, normalizedReason);
      sendJson(res, 400, { ok: false, error: "target blocked", reason: normalizedReason });
      return;
    }
  }

  const decodedName = decodeBase64UrlUtf8(body?.name_b64, 512);
  const decodedPathName = decodeBase64UrlUtf8(pathNameB64, 512);
  const decodedQueryName = decodeBase64UrlUtf8(queryNameB64, 512);
  const bodyRawName = typeof body?.name === "string" ? body.name.trim() : "";
  const requestedName = bodyRawName || decodedName || queryNameRaw || decodedQueryName || decodedPathName;
  const monitorName = (requestedName || getDefaultMonitorName(normalizedUrl)).slice(0, 255);
  const safeDefaultIntervalMs = normalizeMonitorIntervalMs(DEFAULT_MONITOR_INTERVAL_MS);
  let intervalMs = safeDefaultIntervalMs;

  if (Object.prototype.hasOwnProperty.call(body, "intervalMs") || Object.prototype.hasOwnProperty.call(body, "interval_ms")) {
    const rawInterval = Object.prototype.hasOwnProperty.call(body, "intervalMs") ? body.intervalMs : body.interval_ms;
    const numeric = Number(rawInterval);
    if (!Number.isFinite(numeric)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    intervalMs = normalizeMonitorIntervalMs(numeric, safeDefaultIntervalMs);
  }

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicId = await generateUniqueMonitorPublicId();

      try {
        await pool.query(
          `
            INSERT INTO monitors (
              public_id,
              user_id,
              name,
              url,
              target_url,
              interval_ms,
              is_paused,
              last_status,
              status_since
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 'online', UTC_TIMESTAMP(3))
          `,
          [publicId, user.id, monitorName, normalizedUrl, normalizedUrl, intervalMs]
        );

        sendJson(res, 201, { ok: true, id: publicId });
        return;
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") {
          continue;
        }
        throw error;
      }
    }

    throw new Error("monitor_public_id_generation_failed");
  } catch (error) {
    console.error("create_monitor_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleDeleteMonitor(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  let connection = null;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Explicit cleanup keeps data consistent even when old DB instances miss some FKs.
    await connection.query("DELETE FROM monitor_daily_error_codes WHERE monitor_id = ?", [monitor.id]);
    await connection.query("DELETE FROM monitor_daily_stats WHERE monitor_id = ?", [monitor.id]);
    await connection.query("DELETE FROM monitor_checks WHERE monitor_id = ?", [monitor.id]);
    const [deleteMonitorResult] = await connection.query("DELETE FROM monitors WHERE id = ? AND user_id = ? LIMIT 1", [
      monitor.id,
      user.id,
    ]);
    if (!Number(deleteMonitorResult?.affectedRows || 0)) {
      await connection.rollback();
      connection.release();
      connection = null;
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    await connection.commit();
    connection.release();
    connection = null;

    sendJson(res, 200, { ok: true, deletedMonitorId: toPublicMonitorId(monitor) });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        // ignore rollback errors
      }
      connection.release();
    }
    console.error("delete_monitor_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleMonitorHttpAssertionsGet(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  sendJson(res, 200, { ok: true, data: serializeMonitorHttpAssertionsConfig(monitor) });
}

async function handleMonitorHttpAssertionsUpdate(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const current = getMonitorHttpAssertionsConfig(monitor);

  let enabled = current.enabled;
  if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
    if (typeof body.enabled !== "boolean") {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    enabled = body.enabled;
  }

  let followRedirects = current.followRedirects;
  if (Object.prototype.hasOwnProperty.call(body, "followRedirects")) {
    if (typeof body.followRedirects !== "boolean") {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    followRedirects = body.followRedirects;
  }

  let maxRedirects = current.maxRedirects;
  if (Object.prototype.hasOwnProperty.call(body, "maxRedirects")) {
    maxRedirects = clampMonitorHttpAssertionNumber(body.maxRedirects, { min: 0, max: 10, fallback: current.maxRedirects });
  }

  let timeoutMs = current.timeoutMs;
  if (Object.prototype.hasOwnProperty.call(body, "timeoutMs")) {
    timeoutMs = clampMonitorHttpAssertionNumber(body.timeoutMs, { min: 0, max: 120000, fallback: current.timeoutMs });
  }

  let expectedStatusCodes = current.expectedStatusCodesRaw;
  if (Object.prototype.hasOwnProperty.call(body, "expectedStatusCodes")) {
    if (typeof body.expectedStatusCodes !== "string") {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    const normalized = normalizeMonitorHttpAssertionStatusCodes(body.expectedStatusCodes);
    if (normalized === null) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    expectedStatusCodes = normalized;
  }

  let contentTypeContains = current.contentTypeContains;
  if (Object.prototype.hasOwnProperty.call(body, "contentTypeContains")) {
    if (typeof body.contentTypeContains !== "string") {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    contentTypeContains = normalizeMonitorHttpAssertionString(body.contentTypeContains, 128);
  }

  let bodyContains = current.bodyContains;
  if (Object.prototype.hasOwnProperty.call(body, "bodyContains")) {
    if (typeof body.bodyContains !== "string") {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }
    bodyContains = normalizeMonitorHttpAssertionString(body.bodyContains, 512);
  }

  await pool.query(
    `
      UPDATE monitors
      SET
        http_assertions_enabled = ?,
        http_expected_status_codes = ?,
        http_content_type_contains = ?,
        http_body_contains = ?,
        http_follow_redirects = ?,
        http_max_redirects = ?,
        http_timeout_ms = ?
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [
      enabled ? 1 : 0,
      expectedStatusCodes || null,
      contentTypeContains || null,
      bodyContains || null,
      followRedirects ? 1 : 0,
      maxRedirects,
      timeoutMs,
      monitor.id,
      user.id,
    ]
  );

  const updatedMonitor = {
    ...monitor,
    http_assertions_enabled: enabled ? 1 : 0,
    http_expected_status_codes: expectedStatusCodes || null,
    http_content_type_contains: contentTypeContains || null,
    http_body_contains: bodyContains || null,
    http_follow_redirects: followRedirects ? 1 : 0,
    http_max_redirects: maxRedirects,
    http_timeout_ms: timeoutMs,
  };

  sendJson(res, 200, { ok: true, data: serializeMonitorHttpAssertionsConfig(updatedMonitor) });
}

async function handleMonitorIntervalUpdate(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const hasIntervalMs = Object.prototype.hasOwnProperty.call(body, "intervalMs");
  const hasIntervalMsLegacy = Object.prototype.hasOwnProperty.call(body, "interval_ms");
  if (!hasIntervalMs && !hasIntervalMsLegacy) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const rawInterval = hasIntervalMs ? body.intervalMs : body.interval_ms;
  const numericInterval = Number(rawInterval);
  if (!Number.isFinite(numericInterval)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const intervalMs = normalizeMonitorIntervalMs(numericInterval, monitor.interval_ms || DEFAULT_MONITOR_INTERVAL_MS);
  await pool.query("UPDATE monitors SET interval_ms = ? WHERE id = ? AND user_id = ? LIMIT 1", [
    intervalMs,
    monitor.id,
    user.id,
  ]);

  sendJson(res, 200, { ok: true, data: { intervalMs } });
}

const MAINTENANCE_LOOKBACK_DAYS = 60;
const MAINTENANCE_LOOKAHEAD_DAYS = 365;
const MAINTENANCE_MIN_DURATION_MS = 5 * 60 * 1000;
const MAINTENANCE_MAX_DURATION_MS = 30 * DAY_MS;
const MAINTENANCE_MAX_PAST_START_MS = 24 * 60 * 60 * 1000;

function normalizeMaintenanceTitle(value) {
  const text = String(value || "").trim();
  if (!text) return "Wartung";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
}

function normalizeMaintenanceMessage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
}

function parseTimestampInput(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const raw = String(value || "").trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.round(numeric);

  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function computeMaintenanceStatus(window, nowMs = Date.now()) {
  if (!window) return "unknown";
  const cancelledAt = toTimestampMs(window.cancelled_at ?? window.cancelledAt);
  if (Number.isFinite(cancelledAt) && cancelledAt > 0) return "cancelled";
  const startsAt = toTimestampMs(window.starts_at ?? window.startsAt);
  const endsAt = toTimestampMs(window.ends_at ?? window.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "unknown";
  if (nowMs < startsAt) return "scheduled";
  if (nowMs >= startsAt && nowMs < endsAt) return "active";
  return "completed";
}

function serializeMaintenanceRow(row, nowMs = Date.now()) {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const startsAt = toTimestampMs(row.starts_at);
  const endsAt = toTimestampMs(row.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;

  return {
    id,
    monitorId: Number(row.monitor_id),
    title: String(row.title || "").trim() || "Wartung",
    message: String(row.message || "").trim() || "",
    startsAt,
    endsAt,
    cancelledAt: toTimestampMs(row.cancelled_at),
    createdAt: toTimestampMs(row.created_at),
    updatedAt: toTimestampMs(row.updated_at),
    status: computeMaintenanceStatus(row, nowMs),
  };
}

async function listMaintenancesForMonitorId(monitorId, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit || 20) || 20));
  const numericId = Number(monitorId);
  if (!Number.isFinite(numericId) || numericId <= 0) return [];

  const nowMs = Date.now();
  const lookbackStart = new Date(nowMs - MAINTENANCE_LOOKBACK_DAYS * DAY_MS);
  const lookaheadEnd = new Date(nowMs + MAINTENANCE_LOOKAHEAD_DAYS * DAY_MS);

  const [rows] = await pool.query(
    `
      SELECT
        id,
        user_id,
        monitor_id,
        title,
        message,
        starts_at,
        ends_at,
        cancelled_at,
        created_at,
        updated_at
      FROM maintenances
      WHERE monitor_id = ?
        AND starts_at >= ?
        AND starts_at <= ?
      ORDER BY starts_at ASC, id ASC
      LIMIT ?
    `,
    [numericId, lookbackStart, lookaheadEnd, limit]
  );

  return rows.map((row) => serializeMaintenanceRow(row, nowMs)).filter(Boolean);
}

function buildMaintenancePayload(items, nowMs = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  const active = list.find((entry) => entry.status === "active") || null;
  const upcoming = list.filter((entry) => entry.status === "scheduled").slice(0, 3);
  return {
    active,
    upcoming,
    items: list,
  };
}

function isHostnameCoveredByDomain(hostname, domain) {
  const host = String(hostname || "").trim().toLowerCase();
  const verified = String(domain || "").trim().toLowerCase();
  if (!host || !verified) return false;
  if (host === verified) return true;
  return host.endsWith(`.${verified}`);
}

async function getVerifiedDomainForHostname(userId, hostname) {
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  if (!normalizedHost) return null;

  const [rows] = await pool.query(
    "SELECT domain FROM domain_verifications WHERE user_id = ? AND verified_at IS NOT NULL ORDER BY verified_at DESC",
    [userId]
  );
  for (const row of rows) {
    const domain = String(row?.domain || "").trim().toLowerCase();
    if (!domain) continue;
    if (isHostnameCoveredByDomain(normalizedHost, domain)) {
      return domain;
    }
  }
  return null;
}

async function requireVerifiedDomainForMonitor(userId, monitor) {
  const targetUrl = getMonitorUrl(monitor);
  const hostname = normalizeDomainForVerification(targetUrl);
  if (!hostname) {
    const error = new Error("invalid_target");
    error.statusCode = 400;
    throw error;
  }

  const verifiedDomain = await getVerifiedDomainForHostname(userId, hostname);
  if (!verifiedDomain) {
    const error = new Error("domain_not_verified");
    error.statusCode = 403;
    error.details = { hostname };
    throw error;
  }

  return { hostname, verifiedDomain };
}

async function handleMonitorMaintenancesList(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  try {
    const items = await listMaintenancesForMonitorId(monitor.id, { limit: 50 });
    sendJson(res, 200, { ok: true, data: buildMaintenancePayload(items) });
  } catch (error) {
    console.error("monitor_maintenances_list_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleMonitorMaintenanceCreate(req, res, monitorId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: "invalid input" });
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  try {
    await requireVerifiedDomainForMonitor(user.id, monitor);
  } catch (error) {
    if (error?.message === "domain_not_verified") {
      sendJson(res, 403, { ok: false, error: "domain not verified", hostname: error?.details?.hostname || "" });
      return;
    }
    if (error?.message === "invalid_target") {
      sendJson(res, 400, { ok: false, error: "invalid target" });
      return;
    }
    console.error("maintenance_domain_check_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
    return;
  }

  const startsAtRaw = Object.prototype.hasOwnProperty.call(body, "startsAt")
    ? body.startsAt
    : Object.prototype.hasOwnProperty.call(body, "starts_at")
    ? body.starts_at
    : null;
  const endsAtRaw = Object.prototype.hasOwnProperty.call(body, "endsAt")
    ? body.endsAt
    : Object.prototype.hasOwnProperty.call(body, "ends_at")
    ? body.ends_at
    : null;

  const startsAtMs = parseTimestampInput(startsAtRaw);
  const endsAtMs = parseTimestampInput(endsAtRaw);
  if (!Number.isFinite(startsAtMs)) {
    sendJson(res, 400, { ok: false, error: "invalid startsAt" });
    return;
  }
  if (!Number.isFinite(endsAtMs)) {
    sendJson(res, 400, { ok: false, error: "invalid endsAt" });
    return;
  }

  const nowMs = Date.now();
  const durationMs = endsAtMs - startsAtMs;
  if (durationMs <= 0) {
    sendJson(res, 400, { ok: false, error: "ends before start" });
    return;
  }
  if (durationMs < MAINTENANCE_MIN_DURATION_MS) {
    sendJson(res, 400, { ok: false, error: "duration too short", minMs: MAINTENANCE_MIN_DURATION_MS });
    return;
  }
  if (durationMs > MAINTENANCE_MAX_DURATION_MS) {
    sendJson(res, 400, { ok: false, error: "duration too long", maxMs: MAINTENANCE_MAX_DURATION_MS });
    return;
  }
  if (startsAtMs < nowMs - 5 * 60 * 1000) {
    const isActive = endsAtMs > nowMs;
    const withinMaxPast = startsAtMs >= nowMs - MAINTENANCE_MAX_PAST_START_MS;
    if (!(isActive && withinMaxPast)) {
      sendJson(res, 400, { ok: false, error: "starts in past" });
      return;
    }
  }
  if (startsAtMs > nowMs + MAINTENANCE_LOOKAHEAD_DAYS * DAY_MS) {
    sendJson(res, 400, { ok: false, error: "starts too far" });
    return;
  }

  const title = normalizeMaintenanceTitle(body.title);
  const message = Object.prototype.hasOwnProperty.call(body, "message")
    ? normalizeMaintenanceMessage(body.message)
    : Object.prototype.hasOwnProperty.call(body, "note")
    ? normalizeMaintenanceMessage(body.note)
    : "";

  try {
    const [result] = await pool.query(
      "INSERT INTO maintenances (user_id, monitor_id, title, message, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)",
      [user.id, monitor.id, title, message || null, new Date(startsAtMs), new Date(endsAtMs)]
    );

    const maintenanceId = result?.insertId;
    const [rows] = await pool.query(
      `
        SELECT
          id,
          monitor_id,
          title,
          message,
          starts_at,
          ends_at,
          cancelled_at,
          created_at,
          updated_at
        FROM maintenances
        WHERE id = ?
          AND user_id = ?
          AND monitor_id = ?
        LIMIT 1
      `,
      [maintenanceId, user.id, monitor.id]
    );

    const payload = serializeMaintenanceRow(rows[0], Date.now());
    if (!payload) {
      sendJson(res, 500, { ok: false, error: "internal error" });
      return;
    }

    sendJson(res, 201, { ok: true, data: payload });
  } catch (error) {
    console.error("maintenance_create_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function handleMonitorMaintenanceCancel(req, res, monitorId, maintenanceId) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const monitor = await getMonitorByIdForUser(user.id, monitorId);
  if (!monitor) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const numericId = Number(maintenanceId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    sendJson(res, 400, { ok: false, error: "invalid input" });
    return;
  }

  try {
    const [result] = await pool.query(
      `
        UPDATE maintenances
        SET cancelled_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND user_id = ?
          AND monitor_id = ?
          AND cancelled_at IS NULL
        LIMIT 1
      `,
      [numericId, user.id, monitor.id]
    );

    if (!result?.affectedRows) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("maintenance_cancel_failed", error);
    sendJson(res, 500, { ok: false, error: "internal error" });
  }
}

async function cleanupOldChecks() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query("DELETE FROM monitor_checks WHERE checked_at < ?", [cutoff]);
}

async function compactMonitorDay(monitorId, dayKey) {
  const dayStartMs = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(dayStartMs)) return false;
  const dayEndMs = dayStartMs + DAY_MS;

  const dayStart = new Date(dayStartMs);
  const dayEnd = new Date(dayEndMs);
  const [rows] = await pool.query(
    `
      SELECT checked_at, ok, response_ms, status_code
      FROM monitor_checks
      WHERE monitor_id = ?
        AND checked_at >= ?
        AND checked_at < ?
      ORDER BY checked_at ASC
    `,
    [monitorId, dayStart, dayEnd]
  );

  if (!rows.length) return false;

  const checksTotal = rows.length;
  let checksOk = 0;
  let checksError = 0;
  let minResponseMs = null;
  let maxResponseMs = null;
  let totalResponseMs = 0;
  const errorCodeCounts = new Map();

  for (const row of rows) {
    if (row.ok) checksOk += 1;
    else {
      checksError += 1;
      const codeNumber = Number(row.status_code);
      const codeKey = Number.isFinite(codeNumber) ? String(codeNumber) : "NO_RESPONSE";
      errorCodeCounts.set(codeKey, (errorCodeCounts.get(codeKey) || 0) + 1);
    }

    const responseMs = Number(row.response_ms);
    if (!Number.isFinite(responseMs)) continue;
    totalResponseMs += responseMs;
    minResponseMs = minResponseMs === null ? responseMs : Math.min(minResponseMs, responseMs);
    maxResponseMs = maxResponseMs === null ? responseMs : Math.max(maxResponseMs, responseMs);
  }

  const lastBefore = await getLastCheckBefore(monitorId, dayStartMs);
  const { downMs } = computeDowntime(rows, dayStartMs, dayEndMs, lastBefore?.ok ?? null);
  const incidentStarts = computeIncidentStarts(rows, lastBefore?.ok ?? null);
  const uptimePercent = ((DAY_MS - downMs) / DAY_MS) * 100;

  const avgResponseMs = checksTotal ? totalResponseMs / checksTotal : null;
  const startOk = lastBefore?.ok === null || lastBefore?.ok === undefined ? null : lastBefore.ok ? 1 : 0;
  const endOk = rows[rows.length - 1].ok ? 1 : 0;
  const firstCheckedAt = rows[0].checked_at;
  const lastCheckedAt = rows[rows.length - 1].checked_at;
  const downMinutes = Math.round(downMs / 60000);

  await pool.query(
    `
      INSERT INTO monitor_daily_stats (
        monitor_id,
        day_date,
        checks_total,
        checks_ok,
        checks_error,
        response_min_ms,
        response_max_ms,
        response_avg_ms,
        uptime_percent,
        down_minutes,
        incidents,
        start_ok,
        end_ok,
        first_checked_at,
        last_checked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checks_total = VALUES(checks_total),
        checks_ok = VALUES(checks_ok),
        checks_error = VALUES(checks_error),
        response_min_ms = VALUES(response_min_ms),
        response_max_ms = VALUES(response_max_ms),
        response_avg_ms = VALUES(response_avg_ms),
        uptime_percent = VALUES(uptime_percent),
        down_minutes = VALUES(down_minutes),
        incidents = VALUES(incidents),
        start_ok = VALUES(start_ok),
        end_ok = VALUES(end_ok),
        first_checked_at = VALUES(first_checked_at),
        last_checked_at = VALUES(last_checked_at)
    `,
    [
      monitorId,
      dayKey,
      checksTotal,
      checksOk,
      checksError,
      minResponseMs,
      maxResponseMs,
      avgResponseMs,
      uptimePercent,
      downMinutes,
      incidentStarts,
      startOk,
      endOk,
      firstCheckedAt,
      lastCheckedAt,
    ]
  );

  await pool.query(
    "DELETE FROM monitor_daily_error_codes WHERE monitor_id = ? AND day_date = ?",
    [monitorId, dayKey]
  );

  if (errorCodeCounts.size) {
    const placeholders = [];
    const params = [];
    for (const [errorCode, hits] of errorCodeCounts.entries()) {
      placeholders.push("(?, ?, ?, ?)");
      params.push(monitorId, dayKey, errorCode, hits);
    }
    await pool.query(
      `
        INSERT INTO monitor_daily_error_codes (
          monitor_id,
          day_date,
          error_code,
          hits
        )
        VALUES ${placeholders.join(", ")}
      `,
      params
    );
  }

  await pool.query(
    "DELETE FROM monitor_checks WHERE monitor_id = ? AND checked_at >= ? AND checked_at < ?",
    [monitorId, dayStart, dayEnd]
  );

  return true;
}

async function compactClosedDays() {
  const [candidateRows] = await pool.query(
    `
      SELECT monitor_id, DATE_FORMAT(checked_at, '%Y-%m-%d') AS day_key
      FROM monitor_checks
      WHERE checked_at < UTC_DATE()
      GROUP BY monitor_id, day_key
      ORDER BY day_key ASC
    `
  );

  for (const row of candidateRows) {
    const monitorId = Number(row.monitor_id);
    const dayKey = String(row.day_key || "");
    if (!Number.isFinite(monitorId) || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      continue;
    }

    try {
      await compactMonitorDay(monitorId, dayKey);
    } catch (error) {
      console.error("daily_compaction_failed", monitorId, dayKey, error);
    }
  }
}

async function getDueMonitors() {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        user_id,
        name,
        url,
        target_url,
        interval_ms,
        http_assertions_enabled,
        http_expected_status_codes,
        http_content_type_contains,
        http_body_contains,
        http_follow_redirects,
        http_max_redirects,
        http_timeout_ms,
        is_paused,
        last_status,
        status_since,
        last_checked_at,
        last_check_at
      FROM monitors
      WHERE user_id IS NOT NULL
        AND is_paused = 0
        AND (
          COALESCE(last_checked_at, last_check_at) IS NULL
          OR TIMESTAMPDIFF(
            MICROSECOND,
            COALESCE(last_checked_at, last_check_at),
            UTC_TIMESTAMP(3)
          ) >= interval_ms * 1000
        )
    `
  );
  return rows.filter((monitor) => !!getMonitorUrl(monitor));
}

function getMonitorConnectAddress(targetValidation) {
  const addresses = Array.isArray(targetValidation?.addresses) ? targetValidation.addresses : [];
  if (!addresses.length) return null;
  const publicAddresses = addresses.filter((address) => isPublicIpAddress(address));
  const candidates = publicAddresses.length ? publicAddresses : addresses;
  const ipv4Candidates = candidates.filter((address) => net.isIP(address) === 4);
  if (ipv4Candidates.length) return ipv4Candidates[0];
  return candidates[0] || null;
}

async function requestMonitorStatus(targetUrl, options = {}) {
  const { connectAddress = null } = options;

  let parsed;
  try {
    parsed = new URL(String(targetUrl || ""));
  } catch (error) {
    return { statusCode: null, timedOut: false, error: truncateErrorMessage(error) || "invalid_url" };
  }

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  const requestPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
  const hostHeader = parsed.host || parsed.hostname;
  const connectHost = net.isIP(String(connectAddress || "").trim()) ? String(connectAddress).trim() : parsed.hostname;
  const requestModule = parsed.protocol === "https:" ? https : http;

  const requestOptions = {
    protocol: parsed.protocol,
    hostname: connectHost,
    port,
    method: "GET",
    path: requestPath,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Host: hostHeader,
    },
    timeout: CHECK_TIMEOUT_MS,
    agent: false,
  };
  if (parsed.protocol === "https:") {
    requestOptions.servername = parsed.hostname;
  }

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const request = requestModule.request(requestOptions, (response) => {
      const statusCode = Number(response.statusCode || 0) || null;
      response.resume();
      response.on("end", () => {
        finish({ statusCode, timedOut: false, error: null });
      });
      response.on("error", (error) => {
        finish({
          statusCode,
          timedOut: false,
          error: truncateErrorMessage(error) || "response_error",
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("request_timeout"));
    });

    request.on("error", (error) => {
      const code = String(error?.code || "").trim().toUpperCase();
      const message = String(error?.message || "").toLowerCase();
      const timedOut = code === "ETIMEDOUT" || message.includes("request_timeout");
      finish({
        statusCode: null,
        timedOut,
        error: truncateErrorMessage(error) || (timedOut ? "timeout" : "request failed"),
      });
    });

    request.end();
  });
}

const HTTP_ASSERTION_MAX_BODY_BYTES = 64 * 1024;

function isRedirectStatusCode(statusCode) {
  if (!Number.isFinite(statusCode)) return false;
  return statusCode >= 300 && statusCode < 400;
}

function normalizeHttpHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

async function requestMonitorDetails(targetUrl, options = {}) {
  const {
    connectAddress = null,
    timeoutMs = CHECK_TIMEOUT_MS,
    collectBody = false,
    maxBodyBytes = HTTP_ASSERTION_MAX_BODY_BYTES,
  } = options;

  let parsed;
  try {
    parsed = new URL(String(targetUrl || ""));
  } catch (error) {
    return {
      statusCode: null,
      headers: null,
      bodyText: "",
      bodyTruncated: false,
      timedOut: false,
      error: truncateErrorMessage(error) || "invalid_url",
    };
  }

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  const requestPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
  const hostHeader = parsed.host || parsed.hostname;
  const connectHost = net.isIP(String(connectAddress || "").trim()) ? String(connectAddress).trim() : parsed.hostname;
  const requestModule = parsed.protocol === "https:" ? https : http;

  const safeTimeoutMs = clampMonitorHttpAssertionNumber(timeoutMs, {
    min: 100,
    max: 120000,
    fallback: CHECK_TIMEOUT_MS,
  });

  const requestOptions = {
    protocol: parsed.protocol,
    hostname: connectHost,
    port,
    method: "GET",
    path: requestPath,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Encoding": "identity",
      Host: hostHeader,
    },
    timeout: safeTimeoutMs,
    agent: false,
  };
  if (parsed.protocol === "https:") {
    requestOptions.servername = parsed.hostname;
  }

  const safeMaxBodyBytes = clampMonitorHttpAssertionNumber(maxBodyBytes, {
    min: 0,
    max: HTTP_ASSERTION_MAX_BODY_BYTES,
    fallback: HTTP_ASSERTION_MAX_BODY_BYTES,
  });

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const request = requestModule.request(requestOptions, (response) => {
      const statusCode = Number(response.statusCode || 0) || null;
      const headers = response.headers || null;

      if (!collectBody || safeMaxBodyBytes <= 0) {
        response.resume();
        response.on("end", () => {
          finish({ statusCode, headers, bodyText: "", bodyTruncated: false, timedOut: false, error: null });
        });
        response.on("error", (error) => {
          finish({
            statusCode,
            headers,
            bodyText: "",
            bodyTruncated: false,
            timedOut: false,
            error: truncateErrorMessage(error) || "response_error",
          });
        });
        return;
      }

      let size = 0;
      let truncated = false;
      const chunks = [];

      response.on("data", (chunk) => {
        if (resolved) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (!buffer.length) return;

        const nextSize = size + buffer.length;
        if (nextSize <= safeMaxBodyBytes) {
          chunks.push(buffer);
          size = nextSize;
          return;
        }

        const remaining = safeMaxBodyBytes - size;
        if (remaining > 0) {
          chunks.push(buffer.slice(0, remaining));
          size += remaining;
        }
        truncated = true;
        response.destroy();
      });

      const finalizeBody = () => {
        const bodyText = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
        return { bodyText, bodyTruncated: truncated };
      };

      response.on("end", () => {
        const body = finalizeBody();
        finish({
          statusCode,
          headers,
          ...body,
          timedOut: false,
          error: null,
        });
      });

      response.on("close", () => {
        if (!truncated || resolved) return;
        const body = finalizeBody();
        finish({
          statusCode,
          headers,
          ...body,
          timedOut: false,
          error: null,
        });
      });

      response.on("error", (error) => {
        const body = finalizeBody();
        finish({
          statusCode,
          headers,
          ...body,
          timedOut: false,
          error: truncateErrorMessage(error) || "response_error",
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("request_timeout"));
    });

    request.on("error", (error) => {
      const code = String(error?.code || "").trim().toUpperCase();
      const message = String(error?.message || "").toLowerCase();
      const timedOut = code === "ETIMEDOUT" || message.includes("request_timeout");
      finish({
        statusCode: null,
        headers: null,
        bodyText: "",
        bodyTruncated: false,
        timedOut,
        error: truncateErrorMessage(error) || (timedOut ? "timeout" : "request failed"),
      });
    });

    request.end();
  });
}

async function requestMonitorWithHttpAssertions(targetUrl, initialValidation, assertions) {
  const followRedirects = !!assertions.followRedirects;
  const maxRedirects = followRedirects ? assertions.maxRedirects : 0;
  const timeoutMs = assertions.timeoutMs > 0 ? assertions.timeoutMs : CHECK_TIMEOUT_MS;
  const needsBody = !!assertions.bodyContains;
  const visited = new Set();

  let currentUrl = targetUrl;
  let validation = initialValidation;
  let lastResult = null;

  for (let step = 0; step <= maxRedirects; step += 1) {
    if (visited.has(currentUrl)) {
      return {
        statusCode: lastResult?.statusCode ?? null,
        headers: lastResult?.headers ?? null,
        bodyText: lastResult?.bodyText ?? "",
        bodyTruncated: !!lastResult?.bodyTruncated,
        timedOut: false,
        error: "redirect_loop",
        blockedReason: "",
        finalUrl: currentUrl,
      };
    }
    visited.add(currentUrl);

    if (!validation || step > 0) {
      validation = await validateMonitorTarget(currentUrl, { useCache: true });
    }

    const normalizedReason = normalizeTargetValidationReasonForTelemetry(validation.reason);
    const isDnsUnresolved = normalizedReason === "dns_unresolved";
    if (!validation.allowed && !isDnsUnresolved) {
      return {
        statusCode: null,
        headers: null,
        bodyText: "",
        bodyTruncated: false,
        timedOut: false,
        error: "target_blocked",
        blockedReason: normalizedReason,
        finalUrl: currentUrl,
      };
    }

    let requestResult = await requestMonitorDetails(currentUrl, { timeoutMs, collectBody: needsBody });

    if (!Number.isFinite(requestResult.statusCode)) {
      const connectAddress = getMonitorConnectAddress(validation);
      if (connectAddress) {
        const fallbackResult = await requestMonitorDetails(currentUrl, {
          connectAddress,
          timeoutMs,
          collectBody: needsBody,
        });
        if (Number.isFinite(fallbackResult.statusCode) || !Number.isFinite(requestResult.statusCode)) {
          requestResult = fallbackResult;
        }
      }
    }

    lastResult = requestResult;

    if (!followRedirects) {
      break;
    }

    if (!isRedirectStatusCode(requestResult.statusCode)) {
      break;
    }

    const locationHeader = normalizeHttpHeaderValue(requestResult.headers?.location);
    if (!locationHeader) {
      break;
    }

    let nextUrl = "";
    try {
      nextUrl = new URL(locationHeader, currentUrl).toString();
    } catch (error) {
      break;
    }

    if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
      break;
    }

    currentUrl = nextUrl;
    validation = null;
  }

  if (!lastResult) {
    return {
      statusCode: null,
      headers: null,
      bodyText: "",
      bodyTruncated: false,
      timedOut: false,
      error: "request_failed",
      blockedReason: "",
      finalUrl: currentUrl,
    };
  }

  return { ...lastResult, blockedReason: "", finalUrl: currentUrl };
}

function evaluateHttpAssertionsResult(requestResult, assertions) {
  const statusCode = requestResult?.statusCode;
  const headers = requestResult?.headers || {};
  const bodyText = String(requestResult?.bodyText || "");

  const requestError = String(requestResult?.error || "").trim();
  if (requestError === "redirect_loop") {
    return { ok: false, errorMessage: requestError };
  }

  if (!Number.isFinite(statusCode)) {
    return { ok: false, errorMessage: requestResult?.error || "no_response" };
  }

  const expected = Array.isArray(assertions?.expectedStatusCodes) ? assertions.expectedStatusCodes : [];
  const statusOk = expected.length ? expected.includes(statusCode) : isStatusUp(statusCode);
  if (!statusOk) {
    return { ok: false, errorMessage: `unexpected_status:${statusCode}` };
  }

  const expectedContentType = String(assertions?.contentTypeContains || "").trim();
  if (expectedContentType) {
    const responseContentType = normalizeHttpHeaderValue(headers?.["content-type"]).toLowerCase();
    if (!responseContentType.includes(expectedContentType.toLowerCase())) {
      return { ok: false, errorMessage: "content_type_mismatch" };
    }
  }

  const expectedBody = String(assertions?.bodyContains || "").trim();
  if (expectedBody) {
    if (!bodyText.toLowerCase().includes(expectedBody.toLowerCase())) {
      return { ok: false, errorMessage: "body_mismatch" };
    }
  }

  return { ok: true, errorMessage: null };
}

async function checkSingleMonitor(monitor) {
  const targetUrl = getMonitorUrl(monitor);
  const monitorId = Number(monitor.id);

  runtimeTelemetry.checks.inFlight += 1;
  runtimeTelemetry.checks.maxInFlight = Math.max(runtimeTelemetry.checks.maxInFlight, runtimeTelemetry.checks.inFlight);

  let ok = false;
  let statusCode = null;
  let errorMessage = null;
  let timedOut = false;
  let blockedByPolicy = false;

  try {
    const startedAt = performance.now();
    const targetValidation = await validateMonitorTarget(targetUrl, { useCache: true });
    const normalizedReason = normalizeTargetValidationReasonForTelemetry(targetValidation.reason);
    const shouldBlockByPolicy = !targetValidation.allowed;
    const isDnsUnresolved = normalizedReason === "dns_unresolved";

    if (shouldBlockByPolicy && !isDnsUnresolved) {
      ok = false;
      blockedByPolicy = true;
      runtimeTelemetry.security.monitorTargetBlocked += 1;
      incrementCounterMap(
        runtimeTelemetry.security.monitorTargetBlockReasons,
        normalizedReason
      );
      const reason = String(targetValidation.reason || "unknown").trim() || "unknown";
      errorMessage = truncateErrorMessage(new Error(`Target blocked by security policy (${reason})`));
    } else {
      const httpAssertions = getMonitorHttpAssertionsConfig(monitor);

      // Use normal hostname request first. The security decision is already enforced
      // by validateMonitorTarget, and this avoids false negatives from direct-IP probing.
      if (httpAssertions.enabled) {
        const requestResult = await requestMonitorWithHttpAssertions(targetUrl, targetValidation, httpAssertions);

        if (requestResult.blockedReason) {
          blockedByPolicy = true;
          runtimeTelemetry.security.monitorTargetBlocked += 1;
          incrementCounterMap(runtimeTelemetry.security.monitorTargetBlockReasons, requestResult.blockedReason);
          ok = false;
          statusCode = null;
          timedOut = false;
          errorMessage = truncateErrorMessage(
            new Error(`Target blocked by security policy (${requestResult.blockedReason})`)
          );
        } else {
          statusCode = requestResult.statusCode;
          timedOut = !!requestResult.timedOut;
          errorMessage = requestResult.error;

          const evaluation = evaluateHttpAssertionsResult(requestResult, httpAssertions);
          ok = !!evaluation.ok;
          if (!ok && !errorMessage && evaluation.errorMessage) {
            errorMessage = evaluation.errorMessage;
          }
        }
      } else {
        let requestResult = await requestMonitorStatus(targetUrl);

        // Optional fallback: if hostname probing fails without an HTTP status, retry once
        // with a validated address (prefer IPv4) to reduce transient resolver issues.
        if (!Number.isFinite(requestResult.statusCode)) {
          const connectAddress = getMonitorConnectAddress(targetValidation);
          if (connectAddress) {
            const fallbackResult = await requestMonitorStatus(targetUrl, { connectAddress });
            if (Number.isFinite(fallbackResult.statusCode) || !Number.isFinite(requestResult.statusCode)) {
              requestResult = fallbackResult;
            }
          }
        }

        statusCode = requestResult.statusCode;
        timedOut = !!requestResult.timedOut;
        errorMessage = requestResult.error;
        ok = Number.isFinite(statusCode) ? isStatusUp(statusCode) : false;
      }

      if (isDnsUnresolved && !ok && !errorMessage) {
        errorMessage = "dns_unresolved";
      }
    }

    const elapsed = Math.round(performance.now() - startedAt);
    runtimeTelemetry.checks.total += 1;
    if (ok) runtimeTelemetry.checks.ok += 1;
    else runtimeTelemetry.checks.failed += 1;
    if (timedOut) runtimeTelemetry.checks.timedOut += 1;
    if (blockedByPolicy) runtimeTelemetry.checks.blocked += 1;
    pushNumericSample(runtimeTelemetry.checks.durationMsSamples, elapsed);

    const nextStatus = ok ? "online" : "offline";
    const previousStatus = String(monitor.last_status || "online");
    const statusChanged = previousStatus !== nextStatus;
    const now = new Date();

    let statusSince = monitor.status_since instanceof Date ? monitor.status_since : now;
    if (!monitor.status_since || statusChanged) {
      statusSince = now;
    }

    await pool.query(
      `
        INSERT INTO monitor_checks (
          monitor_id,
          checked_at,
          ok,
          response_ms,
          status_code,
          error_message
        )
        VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?, ?)
      `,
      [monitorId, ok ? 1 : 0, elapsed, statusCode, errorMessage]
    );

    await pool.query(
      `
        UPDATE monitors
        SET
          last_status = ?,
          status_since = ?,
          last_checked_at = UTC_TIMESTAMP(3),
          last_check_at = UTC_TIMESTAMP(3),
          last_response_ms = ?,
          url = ?,
          target_url = ?,
          interval_ms = ?
        WHERE id = ?
      `,
      [nextStatus, statusSince, elapsed, targetUrl, targetUrl, getMonitorIntervalMs(monitor), monitorId]
    );

    if (statusChanged) {
      Promise.allSettled([
        sendDiscordStatusNotificationForMonitorChange({
          userId: monitor.user_id,
          monitor,
          previousStatus,
          nextStatus,
          elapsedMs: elapsed,
          statusCode,
          errorMessage,
        }),
        sendSlackStatusNotificationForMonitorChange({
          userId: monitor.user_id,
          monitor,
          previousStatus,
          nextStatus,
          elapsedMs: elapsed,
          statusCode,
          errorMessage,
        }),
        sendWebhookStatusNotificationForMonitorChange({
          userId: monitor.user_id,
          monitor,
          previousStatus,
          nextStatus,
          elapsedMs: elapsed,
          statusCode,
          errorMessage,
        }),
      ]).catch(() => {});
    }
  } finally {
    runtimeTelemetry.checks.inFlight = Math.max(0, runtimeTelemetry.checks.inFlight - 1);
  }
}

async function runWithConcurrency(items, concurrency, workerFn) {
  if (!items.length) return;
  const maxConcurrency = Math.max(1, Math.min(concurrency, items.length));
  let index = 0;

  const workers = Array.from({ length: maxConcurrency }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        await workerFn(items[current]);
      } catch (error) {
        console.error("monitor_check_failed", error);
      }
    }
  });

  await Promise.all(workers);
}

async function evaluateAllMonitorsOfflineFailsafe(options = {}) {
  const { hadDueMonitors = false } = options;
  if (!FAILSAFE_ALL_MONITORS_OFFLINE_SHUTDOWN_ENABLED) return;
  if (allMonitorsOfflineShutdownTriggered) return;
  if (!hadDueMonitors) return;

  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_active,
        SUM(CASE WHEN last_status = 'offline' THEN 1 ELSE 0 END) AS total_offline
      FROM monitors
      WHERE user_id IS NOT NULL
        AND is_paused = 0
    `
  );
  const row = rows[0] || {};
  const totalActive = Number(row.total_active || 0);
  const totalOffline = Number(row.total_offline || 0);

  if (totalActive <= 0) {
    allMonitorsOfflineConsecutiveCount = 0;
    return;
  }

  const offlinePercent = (totalOffline / totalActive) * 100;
  if (offlinePercent < FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT) {
    allMonitorsOfflineConsecutiveCount = 0;
    return;
  }

  allMonitorsOfflineConsecutiveCount += 1;
  if (allMonitorsOfflineConsecutiveCount < FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES) {
    return;
  }

  allMonitorsOfflineShutdownTriggered = true;
  const exitCode = 78;
  console.error("failsafe_all_monitors_offline_shutdown", {
    totalActive,
    totalOffline,
    offlinePercent: roundTo(offlinePercent, 2),
    triggerPercent: roundTo(FAILSAFE_ALL_MONITORS_OFFLINE_TRIGGER_PERCENT, 2),
    consecutiveCycles: allMonitorsOfflineConsecutiveCount,
    threshold: FAILSAFE_ALL_MONITORS_OFFLINE_CONSECUTIVE_CYCLES,
  });

  const forceExitTimer = setTimeout(() => {
    process.exit(exitCode);
  }, 5000);
  if (typeof forceExitTimer.unref === "function") {
    forceExitTimer.unref();
  }

  if (server && typeof server.close === "function" && server.listening) {
    server.close(() => {
      process.exit(exitCode);
    });
    return;
  }

  process.exit(exitCode);
}

async function runMonitorChecks() {
  if (monitorChecksInFlight) {
    runtimeTelemetry.scheduler.skippedDueToOverlap += 1;
    return;
  }
  monitorChecksInFlight = true;
  const startedAt = Date.now();
  runtimeTelemetry.scheduler.runs += 1;
  runtimeTelemetry.scheduler.lastStartedAt = startedAt;

  try {
    const dueMonitors = await getDueMonitors();
    runtimeTelemetry.scheduler.lastDueMonitors = dueMonitors.length;
    if (!dueMonitors.length) return;
    await runWithConcurrency(dueMonitors, CHECK_CONCURRENCY, checkSingleMonitor);
    try {
      await evaluateAllMonitorsOfflineFailsafe({ hadDueMonitors: true });
    } catch (error) {
      console.error("failsafe_all_monitors_offline_check_failed", error);
    }
  } finally {
    const finishedAt = Date.now();
    runtimeTelemetry.scheduler.lastFinishedAt = finishedAt;
    runtimeTelemetry.scheduler.lastDurationMs = Math.max(0, finishedAt - startedAt);
    monitorChecksInFlight = false;
  }
}

function getStats(series) {
  if (!series.length) return { avg: null, min: null, max: null };
  const values = series.map((point) => point.ms);
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

async function getSeries(monitorId) {
  const [rows] = await pool.query(
    "SELECT checked_at, response_ms, ok FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?",
    [monitorId, SERIES_LIMIT]
  );

  return rows
    .reverse()
    .map((row) => ({
      ts: row.checked_at.getTime(),
      ms: row.response_ms,
      ok: !!row.ok,
    }));
}

async function getLastCheckBefore(monitorId, cutoffMs) {
  const cutoff = new Date(cutoffMs);
  const [rows] = await pool.query(
    "SELECT checked_at, ok FROM monitor_checks WHERE monitor_id = ? AND checked_at < ? ORDER BY checked_at DESC LIMIT 1",
    [monitorId, cutoff]
  );
  if (rows.length) {
    return { ts: rows[0].checked_at.getTime(), ok: !!rows[0].ok };
  }

  const cutoffDay = formatUtcDateKey(cutoffMs);
  const [dailyRows] = await pool.query(
    `
      SELECT DATE_FORMAT(day_date, '%Y-%m-%d') AS day_key, end_ok
      FROM monitor_daily_stats
      WHERE monitor_id = ?
        AND day_date < ?
      ORDER BY day_date DESC
      LIMIT 1
    `,
    [monitorId, cutoffDay]
  );

  if (!dailyRows.length) return null;
  if (dailyRows[0].end_ok === null || dailyRows[0].end_ok === undefined) return null;

  const dayEndMs = Date.parse(`${dailyRows[0].day_key}T23:59:59.999Z`);
  if (!Number.isFinite(dayEndMs)) return null;

  return { ts: dayEndMs, ok: !!dailyRows[0].end_ok };
}

function computeDowntime(rows, windowStartMs, windowEndMs, initialOk) {
  let inDown = initialOk === false;
  let currentStart = inDown ? windowStartMs : null;
  let incidents = inDown ? 1 : 0;
  let downMs = 0;

  for (const row of rows) {
    const ts = row.checked_at.getTime();
    const ok = !!row.ok;

    if (!ok) {
      if (!inDown) {
        inDown = true;
        currentStart = ts;
        incidents += 1;
      }
    } else if (inDown) {
      downMs += ts - currentStart;
      inDown = false;
      currentStart = null;
    }
  }

  if (inDown && currentStart !== null) {
    downMs += windowEndMs - currentStart;
  }

  return { incidents, downMs };
}

function computeIncidentStarts(rows, initialOk) {
  let inDown = initialOk === false;
  let starts = 0;

  for (const row of rows) {
    const ok = !!row.ok;
    if (!ok && !inDown) {
      inDown = true;
      starts += 1;
      continue;
    }
    if (ok && inDown) {
      inDown = false;
    }
  }

  return starts;
}

async function getLast24h(monitorId) {
  const [rows] = await pool.query(
    "SELECT checked_at, ok FROM monitor_checks WHERE monitor_id = ? AND checked_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR ORDER BY checked_at ASC",
    [monitorId]
  );

  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const buckets = Array.from({ length: 24 }, () => ({ ok: 0, total: 0 }));

  for (const row of rows) {
    const ts = row.checked_at.getTime();
    const index = Math.min(23, Math.floor((ts - start) / (60 * 60 * 1000)));
    if (index < 0 || index > 23) continue;
    buckets[index].total += 1;
    if (row.ok) {
      buckets[index].ok += 1;
    }
  }

  const bars = buckets.map((bucket) => {
    if (bucket.total === 0) {
      return { status: "empty", uptime: null };
    }
    const ratio = bucket.ok / bucket.total;
    return { status: ratioToStatus(ratio), uptime: ratio * 100 };
  });

  const lastBefore = await getLastCheckBefore(monitorId, start);
  const { incidents, downMs } = computeDowntime(rows, start, now, lastBefore?.ok ?? null);
  const windowMs = now - start;
  const uptime = rows.length ? ((windowMs - downMs) / windowMs) * 100 : null;
  const downMinutes = Math.round(downMs / 60000);

  return { bars, uptime, incidents, downMinutes };
}

function normalizeIncidentSort(sort) {
  const value = String(sort || "").trim().toLowerCase();
  if (value === "duration" || value === "checks" || value === "monitor") return value;
  return "start";
}

function normalizeIncidentOrder(order) {
  const value = String(order || "").trim().toLowerCase();
  return value === "asc" ? "asc" : "desc";
}

async function listMonitorRowsForUser(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        public_id,
        name,
        url,
        target_url,
        is_paused,
        created_at
      FROM monitors
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );
  return rows;
}

function toPublicMonitorId(row) {
  return isValidMonitorPublicId(String(row.public_id || "")) ? String(row.public_id) : String(row.id);
}

function isAllowedPublicStatusIdentifier(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (isValidMonitorPublicId(normalized)) return true;
  if (PUBLIC_STATUS_ALLOW_NUMERIC_ID && /^\d+$/.test(normalized)) return true;
  return false;
}

async function getIncidents(monitorId, options = {}) {
  const lookbackDays = Math.max(
    1,
    Math.min(
      INCIDENT_LOOKBACK_DAYS_MAX,
      Number.isFinite(options.lookbackDays) ? Number(options.lookbackDays) : INCIDENT_LOOKBACK_DAYS
    )
  );
  const limit = Math.max(
    1,
    Math.min(INCIDENT_LIMIT_MAX, Number.isFinite(options.limit) ? Number(options.limit) : INCIDENT_LIMIT)
  );
  const cutoffMs = Date.now() - lookbackDays * DAY_MS;
  const cutoff = new Date(cutoffMs);
  const [rows] = await pool.query(
    "SELECT checked_at, ok, status_code FROM monitor_checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at ASC",
    [monitorId, cutoff]
  );

  const incidents = [];
  let current = null;

  for (const row of rows) {
    const ts = row.checked_at.getTime();
    const ok = !!row.ok;
    const statusCode = Number.isFinite(row.status_code) ? row.status_code : null;

    if (!ok) {
      if (!current) {
        current = {
          startTs: ts,
          endTs: null,
          durationMs: null,
          statusCodes: new Set(),
          lastStatusCode: statusCode,
          samples: 0,
          ongoing: false,
        };
      }
      current.samples += 1;
      if (statusCode !== null) {
        current.statusCodes.add(statusCode);
        current.lastStatusCode = statusCode;
      }
      continue;
    }

    if (current) {
      current.endTs = ts;
      current.durationMs = current.endTs - current.startTs;
      incidents.push(current);
      current = null;
    }
  }

  if (current) {
    current.ongoing = true;
    current.durationMs = Date.now() - current.startTs;
    incidents.push(current);
  }

  const normalizedRaw = incidents
    .map((incident) => ({
      startTs: incident.startTs,
      endTs: incident.endTs,
      durationMs: incident.durationMs,
      statusCodes: Array.from(incident.statusCodes),
      lastStatusCode: incident.lastStatusCode,
      samples: incident.samples,
      ongoing: incident.ongoing,
    }))
    .sort((a, b) => b.startTs - a.startTs);

  const rawDayKeys = new Set(normalizedRaw.map((item) => formatUtcDateKey(item.startTs)));
  const cutoffDayKey = formatUtcDateKey(cutoffMs);
  const [dailyRows] = await pool.query(
    `
      SELECT
        DATE_FORMAT(day_date, '%Y-%m-%d') AS day_key,
        incidents,
        down_minutes,
        checks_error
      FROM monitor_daily_stats
      WHERE monitor_id = ?
        AND day_date >= ?
        AND incidents > 0
      ORDER BY day_date DESC
      LIMIT ?
    `,
    [monitorId, cutoffDayKey, limit]
  );

  const dailyDayKeys = dailyRows
    .map((row) => String(row.day_key || ""))
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && !rawDayKeys.has(key));

  const errorCodesByDay = new Map();
  if (dailyDayKeys.length) {
    const placeholders = dailyDayKeys.map(() => "?").join(", ");
    const [errorRows] = await pool.query(
      `
        SELECT
          DATE_FORMAT(day_date, '%Y-%m-%d') AS day_key,
          error_code,
          hits
        FROM monitor_daily_error_codes
        WHERE monitor_id = ?
          AND day_date IN (${placeholders})
        ORDER BY day_date DESC, hits DESC, error_code ASC
      `,
      [monitorId, ...dailyDayKeys]
    );

    for (const row of errorRows) {
      const dayKey = String(row.day_key || "");
      if (!errorCodesByDay.has(dayKey)) {
        errorCodesByDay.set(dayKey, []);
      }
      errorCodesByDay.get(dayKey).push({
        code: String(row.error_code || "NO_RESPONSE"),
        hits: Math.max(0, Number(row.hits || 0)),
      });
    }
  }

  const normalizedDaily = dailyRows
    .filter((row) => row.day_key && !rawDayKeys.has(row.day_key))
    .map((row) => {
      const dayStartMs = Date.parse(`${row.day_key}T00:00:00.000Z`);
      const durationMs = Math.max(0, Number(row.down_minutes || 0) * 60000);
      const errorCodes = errorCodesByDay.get(String(row.day_key)) || [];
      const statusCodes = errorCodes
        .map((item) => Number(item.code))
        .filter((code) => Number.isFinite(code));
      return {
        dateKey: String(row.day_key),
        startTs: dayStartMs,
        endTs: null,
        durationMs,
        statusCodes,
        errorCodes,
        lastStatusCode: null,
        samples: Number(row.checks_error || 0),
        ongoing: false,
        aggregated: true,
      };
    });

  const normalized = [...normalizedRaw, ...normalizedDaily]
    .sort((a, b) => b.startTs - a.startTs)
    .slice(0, limit);

  return { items: normalized, lookbackDays };
}

async function getIncidentsForUser(userId, options = {}) {
  const monitorRows = await listMonitorRowsForUser(userId);
  if (!monitorRows.length) {
    return {
      items: [],
      lookbackDays: Math.max(1, Number(options.lookbackDays) || INCIDENT_LOOKBACK_DAYS),
      sort: normalizeIncidentSort(options.sort),
      order: normalizeIncidentOrder(options.order),
      total: 0,
    };
  }

  const monitorFilter = String(options.monitor || "").trim();
  let selectedRows = monitorRows;

  if (monitorFilter && monitorFilter !== "all") {
    selectedRows = monitorRows.filter((row) => {
      const publicId = toPublicMonitorId(row);
      return publicId === monitorFilter || String(row.id) === monitorFilter;
    });
    if (!selectedRows.length) {
      return {
        items: [],
        lookbackDays: Math.max(1, Number(options.lookbackDays) || INCIDENT_LOOKBACK_DAYS),
        sort: normalizeIncidentSort(options.sort),
        order: normalizeIncidentOrder(options.order),
        total: 0,
      };
    }
  }

  const sort = normalizeIncidentSort(options.sort);
  const order = normalizeIncidentOrder(options.order);
  const lookbackDays = Math.max(1, Math.min(3650, Number(options.lookbackDays) || INCIDENT_LOOKBACK_DAYS));
  const limit = Math.max(1, Math.min(2000, Number(options.limit) || 200));
  const perMonitorLimit = Math.max(100, Math.min(1000, Math.ceil(limit * 1.5)));

  const incidentLists = await Promise.all(
    selectedRows.map(async (monitorRow) => {
      const result = await getIncidents(Number(monitorRow.id), {
        lookbackDays,
        limit: perMonitorLimit,
      });
      const monitorPublicId = toPublicMonitorId(monitorRow);
      return result.items.map((item) => ({
        ...item,
        monitorId: monitorPublicId,
        monitorName: monitorRow.name || getDefaultMonitorName(getMonitorUrl(monitorRow)),
        monitorUrl: getMonitorUrl(monitorRow),
      }));
    })
  );

  const allItems = incidentLists.flat();

  const sorted = allItems.sort((a, b) => {
    let cmp = 0;

    if (sort === "duration") {
      cmp = Number(a.durationMs || 0) - Number(b.durationMs || 0);
    } else if (sort === "checks") {
      cmp = Number(a.samples || 0) - Number(b.samples || 0);
    } else if (sort === "monitor") {
      cmp = String(a.monitorName || "").localeCompare(String(b.monitorName || ""), "de");
    } else {
      cmp = Number(a.startTs || 0) - Number(b.startTs || 0);
    }

    if (cmp === 0) {
      cmp = Number(a.startTs || 0) - Number(b.startTs || 0);
    }

    return order === "asc" ? cmp : -cmp;
  });

  return {
    items: sorted.slice(0, limit),
    lookbackDays,
    sort,
    order,
    total: sorted.length,
  };
}

async function getRangeSummary(monitorId, days) {
  const nowMs = Date.now();
  const todayStartMs = getUtcDayStartMs(nowMs);
  const rangeStartMs = todayStartMs - Math.max(0, days - 1) * DAY_MS;
  const rangeStartDate = new Date(rangeStartMs);

  const [dailyRows] = await pool.query(
    `
      SELECT
        checks_total,
        down_minutes,
        incidents
      FROM monitor_daily_stats
      WHERE monitor_id = ?
        AND day_date >= ?
        AND day_date < UTC_DATE()
      ORDER BY day_date ASC
    `,
    [monitorId, rangeStartDate]
  );

  const [todayRows] = await pool.query(
    `
      SELECT checked_at, ok
      FROM monitor_checks
      WHERE monitor_id = ?
        AND checked_at >= ?
      ORDER BY checked_at ASC
    `,
    [monitorId, new Date(todayStartMs)]
  );

  const lastBeforeToday = await getLastCheckBefore(monitorId, todayStartMs);
  const { downMs: todayDownMs } = computeDowntime(todayRows, todayStartMs, nowMs, lastBeforeToday?.ok ?? null);
  const todayIncidentStarts = computeIncidentStarts(todayRows, lastBeforeToday?.ok ?? null);

  const dailyDownMs = dailyRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.down_minutes || 0)) * 60000,
    0
  );
  const dailyIncidents = dailyRows.reduce((sum, row) => sum + Math.max(0, Number(row.incidents || 0)), 0);
  const dailyTotalChecks = dailyRows.reduce((sum, row) => sum + Math.max(0, Number(row.checks_total || 0)), 0);

  const totalDownMs = dailyDownMs + todayDownMs;
  const totalIncidents = dailyIncidents + todayIncidentStarts;
  const totalChecks = dailyTotalChecks + todayRows.length;
  const windowMs = nowMs - rangeStartMs;
  const uptime = totalChecks > 0 && windowMs > 0 ? ((windowMs - totalDownMs) / windowMs) * 100 : null;
  const downMinutes = Math.round(totalDownMs / 60000);

  return { days, uptime, incidents: totalIncidents, downMinutes, total: totalChecks };
}

async function getHeatmap(monitorId, year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [dailyRows] = await pool.query(
    `
      SELECT
        DATE_FORMAT(day_date, '%Y-%m-%d') AS day_key,
        uptime_percent
      FROM monitor_daily_stats
      WHERE monitor_id = ?
        AND day_date >= ?
        AND day_date <= ?
    `,
    [monitorId, start, end]
  );
  const dailyUptimeMap = new Map(
    dailyRows.map((row) => [String(row.day_key), Number(row.uptime_percent)])
  );

  const [rows] = await pool.query(
    "SELECT checked_at, ok FROM monitor_checks WHERE monitor_id = ? AND checked_at >= ? AND checked_at <= ? ORDER BY checked_at ASC",
    [monitorId, start, end]
  );

  const rawByDay = new Map();
  for (const row of rows) {
    const key = formatUtcDateKey(row.checked_at);
    if (!rawByDay.has(key)) rawByDay.set(key, []);
    rawByDay.get(key).push(row);
  }

  const days = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayStartMs = Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());
    const dayEndMs = dayStartMs + DAY_MS;
    const key = formatUtcDateKey(dayStartMs);

    if (dayStart > today) {
      days.push({ date: key, status: "empty", uptime: null });
      continue;
    }

    if (dailyUptimeMap.has(key) && Number.isFinite(dailyUptimeMap.get(key))) {
      const uptime = Number(dailyUptimeMap.get(key));
      const ratio = Number.isFinite(uptime) ? uptime / 100 : null;
      days.push({
        date: key,
        status: ratio === null ? "empty" : ratioToStatus(ratio),
        uptime,
      });
      continue;
    }

    const dayRows = rawByDay.get(key) || [];
    if (!dayRows.length) {
      days.push({ date: key, status: "empty", uptime: null });
      continue;
    }

    const lastBefore = await getLastCheckBefore(monitorId, dayStartMs);
    const { downMs } = computeDowntime(dayRows, dayStartMs, dayEndMs, lastBefore?.ok ?? null);
    const windowMs = dayEndMs - dayStartMs;
    const uptime = windowMs ? ((windowMs - downMs) / windowMs) * 100 : null;
    const ratio = Number.isFinite(uptime) ? uptime / 100 : null;

    days.push({
      date: key,
      status: ratio === null ? "empty" : ratioToStatus(ratio),
      uptime,
    });
  }

  return { year, days };
}

async function getMetricsForMonitor(monitor) {
  const monitorId = Number(monitor.id);
  const publicMonitorId = isValidMonitorPublicId(String(monitor.public_id || ""))
    ? String(monitor.public_id)
    : String(monitor.id);
  const targetUrl = getMonitorUrl(monitor);
  const httpAssertions = getMonitorHttpAssertionsConfig(monitor);
  const series = await getSeries(monitorId);
  const targetMeta = await getTargetMeta(targetUrl);
  const maintenanceItems = await listMaintenancesForMonitorId(monitorId, { limit: 50 });
  const maintenances = buildMaintenancePayload(maintenanceItems);

  const [range7, range30, range365] = await Promise.all([
    getRangeSummary(monitorId, 7),
    getRangeSummary(monitorId, 30),
    getRangeSummary(monitorId, 365),
  ]);

  const [lastRows] = await pool.query(
    "SELECT status_code FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1",
    [monitorId]
  );

  const statusSince = toMs(monitor.status_since) || Date.now();
  const lastCheckAt = toMs(monitor.last_checked_at) || toMs(monitor.last_check_at);

  return {
    monitorId: publicMonitorId,
    name: monitor.name || getDefaultMonitorName(targetUrl),
    target: targetUrl,
    intervalMs: getMonitorIntervalMs(monitor),
    timeoutMs: httpAssertions.enabled && httpAssertions.timeoutMs > 0 ? httpAssertions.timeoutMs : CHECK_TIMEOUT_MS,
    status: monitor.last_status || "online",
    statusSince,
    lastCheckAt,
    lastResponseMs: Number.isFinite(monitor.last_response_ms) ? monitor.last_response_ms : null,
    lastStatusCode: lastRows.length ? lastRows[0].status_code : null,
    assertions: serializeMonitorHttpAssertionsConfig(monitor),
    maintenances,
    stats: getStats(series),
    series,
    last24h: await getLast24h(monitorId),
    ranges: { range7, range30, range365 },
    incidents: await getIncidents(monitorId),
    heatmap: await getHeatmap(monitorId, new Date().getFullYear()),
    location: targetMeta.location,
    network: targetMeta.network,
    domainSsl: targetMeta.domainSsl,
  };
}

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "bad request" });
    return;
  }
  const method = (req.method || "GET").toUpperCase();
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/favicon.ico") {
    await serveStaticFile(res, "pingmyserverlogo.png");
    return;
  }

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathname === "/stripe/webhook") {
    await handleStripeWebhook(req, res);
    return;
  }

  const requiresOriginValidation =
    pathname.startsWith("/api/") ||
    pathname === "/monitor-create" ||
    pathname === "/create-monitor" ||
    pathname.startsWith("/monitor-create/") ||
    pathname.startsWith("/create-monitor/");
  if (isStateChangingMethod(method) && requiresOriginValidation && !isValidOrigin(req)) {
    runtimeTelemetry.security.invalidOriginBlocked += 1;
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }

  if (pathname.startsWith("/api/auth/")) {
    if (!enforceAuthRateLimit(req, res)) return;

    if (method === "GET" && pathname === "/api/auth/discord") {
      await handleAuthDiscordStart(req, res);
      return;
    }

    if (method === "GET" && pathname === "/api/auth/discord/callback") {
      await handleAuthDiscordCallback(req, res, url);
      return;
    }

    if (method === "GET" && pathname === "/api/auth/github") {
      await handleAuthGithubStart(req, res);
      return;
    }

    if (method === "GET" && pathname === "/api/auth/github/callback") {
      await handleAuthGithubCallback(req, res, url);
      return;
    }

    if (method === "GET" && pathname === "/api/auth/google") {
      await handleAuthGoogleStart(req, res);
      return;
    }

    if (method === "GET" && pathname === "/api/auth/google/callback") {
      await handleAuthGoogleCallback(req, res, url);
      return;
    }

    if (method === "POST" && pathname === "/api/auth/register") {
      await handleAuthRegister(req, res);
      return;
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      await handleAuthLogin(req, res);
      return;
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
      await handleAuthLogout(req, res);
      return;
    }

    if (method === "POST" && pathname === "/api/auth/logout-all") {
      await handleAuthLogoutAll(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  if (method === "GET" && pathname === "/api/me") {
    const user = await requireAuth(req, res);
    if (!user) return;
    const next = await getNextPathForUser(user.id);
    sendJson(res, 200, { ok: true, user: userToResponse(user), next });
    return;
  }

  if (method === "GET" && pathname === "/api/account/sessions") {
    await handleAccountSessionsList(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/account/connections") {
    await handleAccountConnectionsList(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/account/domains") {
    await handleAccountDomainsList(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/domains") {
    await handleAccountDomainChallengeCreate(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/domains/verify") {
    await handleAccountDomainVerify(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/account/notifications") {
    await handleAccountNotificationsGet(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/account/billing") {
    await handleAccountBillingGet(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/discord") {
    await handleAccountDiscordNotificationUpsert(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/slack") {
    await handleAccountSlackNotificationUpsert(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/webhook") {
    await handleAccountWebhookNotificationUpsert(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/billing/checkout") {
    await handleAccountBillingCheckout(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/billing/portal") {
    await handleAccountBillingPortal(req, res);
    return;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/discord") {
    await handleAccountDiscordNotificationDelete(req, res);
    return;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/slack") {
    await handleAccountSlackNotificationDelete(req, res);
    return;
  }

  if (method === "DELETE" && pathname === "/api/account/notifications/webhook") {
    await handleAccountWebhookNotificationDelete(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/discord/test") {
    await handleAccountDiscordNotificationTest(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/slack/test") {
    await handleAccountSlackNotificationTest(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/notifications/webhook/test") {
    await handleAccountWebhookNotificationTest(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/sessions/revoke-others") {
    await handleAccountRevokeOtherSessions(req, res);
    return;
  }

  const accountSessionMatch = pathname.match(/^\/api\/account\/sessions\/([a-f0-9]{64})\/?$/);
  if (method === "DELETE" && accountSessionMatch) {
    await handleAccountSessionRevoke(req, res, accountSessionMatch[1]);
    return;
  }

  const accountDomainMatch = pathname.match(/^\/api\/account\/domains\/(\d+)\/?$/);
  if (method === "DELETE" && accountDomainMatch) {
    await handleAccountDomainDelete(req, res, accountDomainMatch[1]);
    return;
  }

  if (method === "POST" && pathname === "/api/account/password") {
    await handleAccountPasswordChange(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/account/delete") {
    await handleAccountDelete(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/owner/overview") {
    await handleOwnerOverview(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/owner/monitors") {
    await handleOwnerMonitors(req, res, url);
    return;
  }

  if (method === "GET" && pathname === "/api/owner/security") {
    await handleOwnerSecurity(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/monitors") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitors = await listMonitorsForUser(user.id);
    sendJson(res, 200, { ok: true, data: monitors });
    return;
  }

  if (method === "POST" && pathname === "/api/monitors") {
    await handleCreateMonitor(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/monitor-create") {
    await handleCreateMonitor(req, res);
    return;
  }

  if (method === "POST" && pathname === "/monitor-create") {
    await handleCreateMonitor(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/create-monitor") {
    await handleCreateMonitor(req, res);
    return;
  }

  if (method === "POST" && pathname === "/create-monitor") {
    await handleCreateMonitor(req, res);
    return;
  }

  const createMonitorPathMatch = pathname.match(
    /^\/(?:api\/)?(?:monitor-create|create-monitor)\/[A-Za-z0-9_-]{1,4096}(?:\/[A-Za-z0-9_-]{1,1024})?\/?$/
  );
  if (method === "POST" && createMonitorPathMatch) {
    await handleCreateMonitor(req, res);
    return;
  }

  const isLegacyCreateGetRoute =
    method === "GET" &&
    (pathname === "/api/monitor-create" ||
      pathname === "/monitor-create" ||
      pathname === "/api/create-monitor" ||
      pathname === "/create-monitor" ||
      !!createMonitorPathMatch);
  if (isLegacyCreateGetRoute) {
    if (!MONITOR_CREATE_GET_ENABLED) {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }

    const hasCreateMarker = hasMonitorCreateRequestHeader(req);
    const sameOrigin = isValidOrigin(req);
    if (!hasCreateMarker && !sameOrigin) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    await handleCreateMonitor(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/incidents") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const incidents = await getIncidentsForUser(user.id, {
      monitor: url.searchParams.get("monitor") || "all",
      sort: url.searchParams.get("sort") || "start",
      order: url.searchParams.get("order") || "desc",
      lookbackDays: Number(url.searchParams.get("lookbackDays") || INCIDENT_LOOKBACK_DAYS),
      limit: Number(url.searchParams.get("limit") || 200),
    });

    sendJson(res, 200, { ok: true, data: incidents });
    return;
  }

  const monitorMetricsMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/metrics\/?$/);
  if (method === "GET" && monitorMetricsMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitorId = monitorMetricsMatch[1];
    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const metrics = await getMetricsForMonitor(monitor);
    sendJson(res, 200, { ok: true, data: metrics });
    return;
  }

  const monitorFaviconMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/favicon\/?$/);
  if (method === "GET" && monitorFaviconMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitorId = monitorFaviconMatch[1];
    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    await handleMonitorFavicon(req, res, monitor);
    return;
  }

  const monitorAssertionsMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/assertions\/?$/);
  if (monitorAssertionsMatch) {
    const monitorId = monitorAssertionsMatch[1];
    if (method === "GET") {
      await handleMonitorHttpAssertionsGet(req, res, monitorId);
      return;
    }
    if (method === "PUT" || method === "PATCH") {
      await handleMonitorHttpAssertionsUpdate(req, res, monitorId);
      return;
    }
  }

  const monitorIntervalMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/interval\/?$/);
  if (monitorIntervalMatch) {
    const monitorId = monitorIntervalMatch[1];
    if (method === "PUT" || method === "PATCH") {
      await handleMonitorIntervalUpdate(req, res, monitorId);
      return;
    }
  }

  const monitorMaintenancesMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/maintenances\/?$/);
  if (monitorMaintenancesMatch) {
    const monitorId = monitorMaintenancesMatch[1];
    if (method === "GET") {
      await handleMonitorMaintenancesList(req, res, monitorId);
      return;
    }
    if (method === "POST") {
      await handleMonitorMaintenanceCreate(req, res, monitorId);
      return;
    }
  }

  const monitorMaintenanceCancelMatch = pathname.match(
    /^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/maintenances\/(\d+)\/cancel\/?$/
  );
  if (method === "POST" && monitorMaintenanceCancelMatch) {
    await handleMonitorMaintenanceCancel(req, res, monitorMaintenanceCancelMatch[1], monitorMaintenanceCancelMatch[2]);
    return;
  }

  const monitorDetailMatch = pathname.match(/^\/api\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/);
  if (method === "DELETE" && monitorDetailMatch) {
    await handleDeleteMonitor(req, res, monitorDetailMatch[1]);
    return;
  }

  if (method === "GET" && monitorDetailMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitorId = monitorDetailMatch[1];
    const monitor = await getMonitorByIdForUser(user.id, monitorId);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: serializeMonitorRow(monitor),
    });
    return;
  }

  if (method === "GET" && pathname === "/api/metrics") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const monitors = await listMonitorsForUser(user.id);
    if (!monitors.length) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const monitor = await getMonitorByIdForUser(user.id, monitors[0].id);
    const metrics = await getMetricsForMonitor(monitor);
    sendJson(res, 200, { ok: true, data: metrics });
    return;
  }

  if (method === "GET" && pathname === "/status/data") {
    const monitorFilter = String(url.searchParams.get("monitor") || "").trim();
    let monitor = null;
    let user = null;

    if (monitorFilter) {
      monitor = await getPublicMonitorByIdentifier(monitorFilter);
    } else {
      user = await requireAuth(req, res, { silent: true });
      if (user) {
        monitor = await getLatestMonitorForUser(user.id);
      }
      if (!monitor) {
        monitor = await getDefaultPublicMonitor();
      }
      if (!monitor && !user) {
        monitor = await getLatestPublicMonitor();
      }
    }

    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const metrics = await getMetricsForMonitor(monitor);
    sendJson(res, 200, { ok: true, data: metrics });
    return;
  }

  if (method === "GET" && pathname === "/") {
    await serveStaticFile(res, "landing.html");
    return;
  }

  if (method === "GET" && (pathname === "/login" || pathname === "/login/")) {
    await serveStaticFile(res, "login.html");
    return;
  }

  if (method === "GET" && (pathname === "/onboarding" || pathname === "/onboarding/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "onboarding.html");
    return;
  }

  if (method === "GET" && (pathname === "/app" || pathname === "/app/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "app.html");
    return;
  }

  if (method === "GET" && (pathname === "/monitors" || pathname === "/monitors/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "monitors.html");
    return;
  }

  if (method === "GET" && /^\/app\/monitors\/([A-Za-z0-9]{6,64}|\d+)\/?$/.test(pathname)) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "app.html");
    return;
  }

  if (method === "GET" && (pathname === "/incidents" || pathname === "/incidents/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "incidents.html");
    return;
  }

  if (method === "GET" && (pathname === "/connections" || pathname === "/connections/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "connections.html");
    return;
  }

  if (method === "GET" && (pathname === "/notifications" || pathname === "/notifications/")) {
    const user = await requireAuth(req, res, { redirectToLogin: true });
    if (!user) return;
    await serveStaticFile(res, "notifications.html");
    return;
  }

  if (method === "GET" && (pathname === "/owner" || pathname === "/owner/")) {
    const owner = await requireOwner(req, res, { auth: { redirectToLogin: true }, redirectToApp: true });
    if (!owner) return;
    await serveStaticFile(res, "owner.html");
    return;
  }

  if (method === "GET" && (pathname === "/status" || pathname === "/status/")) {
    const user = await requireAuth(req, res, { silent: true });
    if (user) {
      const userMonitor = await getLatestMonitorForUser(user.id);
      if (userMonitor) {
        const publicId = toPublicMonitorId(userMonitor);
        if (isAllowedPublicStatusIdentifier(publicId)) {
          sendRedirect(res, `/status/${encodeURIComponent(publicId)}`);
          return;
        }
      }
    }

    const defaultMonitor = await getDefaultPublicMonitor();
    if (defaultMonitor) {
      const publicId = toPublicMonitorId(defaultMonitor);
      if (isAllowedPublicStatusIdentifier(publicId)) {
        sendRedirect(res, `/status/${encodeURIComponent(publicId)}`);
        return;
      }
    }

    await serveStaticFile(res, "status.html");
    return;
  }

  const publicStatusRouteRegex = PUBLIC_STATUS_ALLOW_NUMERIC_ID
    ? /^\/status\/([A-Za-z0-9]{6,64}|\d+)\/?$/
    : /^\/status\/([A-Za-z0-9]{6,64})\/?$/;
  const publicStatusRouteMatch = pathname.match(publicStatusRouteRegex);
  if (method === "GET" && publicStatusRouteMatch) {
    const monitor = await getPublicMonitorByIdentifier(publicStatusRouteMatch[1]);
    if (!monitor) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }
    await serveStaticFile(res, "status.html");
    return;
  }

  if (method === "GET" && (pathname === "/nutzungsbedingungen" || pathname === "/nutzungsbedingungen/")) {
    await serveStaticFile(res, "nutzungsbedingungen.html");
    return;
  }

  if (method === "GET" && (pathname === "/datenschutz" || pathname === "/datenschutz/")) {
    await serveStaticFile(res, "datenschutz.html");
    return;
  }

  if (method === "GET" && (pathname === "/impressum" || pathname === "/impressum/")) {
    await serveStaticFile(res, "impressum.html");
    return;
  }

  if (method === "GET" && pathname === "/robots.txt") {
    await serveStaticFile(res, "robots.txt");
    return;
  }

  if (method === "GET" && pathname === "/sitemap.xml") {
    await serveStaticFile(res, "sitemap.xml");
    return;
  }

  if (method === "GET" && pathname === "/site.webmanifest") {
    await serveStaticFile(res, "site.webmanifest");
    return;
  }

  if (method === "GET" && pathname === "/index.html") {
    sendRedirect(res, "/", 301);
    return;
  }

  if (method === "GET" && pathname.startsWith("/assets/")) {
    let filePath = "";
    try {
      filePath = decodeURIComponent(pathname.slice("/assets/".length));
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "bad request" });
      return;
    }
    await serveStaticFile(res, filePath);
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  handleRequest(req, res).catch((error) => {
    console.error("request_failed", error);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: "internal error" });
      return;
    }
    res.end();
  });
});

(async () => {
  try {
    await initDb();
    await cleanupExpiredSessions();
    await cleanupOldChecks();
    await compactClosedDays();
    await runMonitorChecks();

    setInterval(() => {
      const now = Date.now();
      const driftMs = Math.max(0, now - monitorSchedulerExpectedAt);
      pushNumericSample(runtimeTelemetry.scheduler.driftMsSamples, driftMs);
      monitorSchedulerExpectedAt = now + CHECK_SCHEDULER_MS;
      runMonitorChecks().catch((error) => {
        console.error("monitor_check_cycle_failed", error);
      });
    }, CHECK_SCHEDULER_MS);

    setInterval(() => {
      cleanupOldChecks().catch((error) => {
        console.error("check_cleanup_failed", error);
      });
      cleanupExpiredSessions().catch((error) => {
        console.error("session_cleanup_failed", error);
      });
    }, MAINTENANCE_INTERVAL_MS);

    setInterval(() => {
      compactClosedDays().catch((error) => {
        console.error("daily_compaction_cycle_failed", error);
      });
    }, DAILY_COMPACTION_INTERVAL_MS);

    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("startup_failed", error);
    process.exit(1);
  }
})();

