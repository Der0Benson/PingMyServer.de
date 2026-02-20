const net = require("net");
const crypto = require("crypto");
const { URL, domainToASCII } = require("url");

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
  const toTimestampMs = (value) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.round(numeric);
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };

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

module.exports = {
  normalizeDomainForVerification,
  createDomainVerificationToken,
  getDomainVerificationDnsName,
  getDomainVerificationTxtValue,
  serializeDomainVerificationRow,
};
