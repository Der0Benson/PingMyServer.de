const http = require("http");
const https = require("https");
const net = require("net");
const { URL } = require("url");
const { performance } = require("perf_hooks");
const { createLogger } = require("./src/core/logger");

const logger = createLogger("probe.agent");
const DEFAULT_STATUS_CODES = [200, 201, 202, 203, 204, 205, 206, 301, 302, 303, 304, 307, 308];
const DEFAULT_HTTP_TIMEOUT_MS = 10000;
const API_RESPONSE_LIMIT_BYTES = 512 * 1024;
const HTTP_ASSERTION_MAX_BODY_BYTES = 64 * 1024;

function failConfig(message) {
  throw new Error(String(message || "invalid configuration"));
}

function readEnvString(name, options = {}) {
  const { fallback = "", allowEmpty = false, trim = true } = options;
  const hasValue = Object.prototype.hasOwnProperty.call(process.env, name);
  let value = hasValue ? process.env[name] : fallback;
  value = value === undefined || value === null ? "" : String(value);
  if (trim) value = value.trim();
  if (!allowEmpty && !value) {
    failConfig(`${name} is required`);
  }
  return value;
}

function readEnvNumber(name, options = {}) {
  const { fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = options;
  const raw = readEnvString(name, {
    fallback: String(fallback),
    allowEmpty: true,
  });
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    failConfig(`${name} must be a finite number`);
  }
  const rounded = Math.trunc(numeric);
  if (rounded < min || rounded > max) {
    failConfig(`${name} must be between ${min} and ${max}`);
  }
  return rounded;
}

let PROBE_AGENT_API_URL = "";
let PROBE_AGENT_ID = "";
let PROBE_AGENT_TOKEN = "";
let PROBE_AGENT_LOOP_INTERVAL_MS = 10000;
let PROBE_AGENT_JOB_LIMIT = 10;
let PROBE_AGENT_CONCURRENCY = 4;
let PROBE_AGENT_API_TIMEOUT_MS = 15000;

try {
  PROBE_AGENT_API_URL = readEnvString("PROBE_AGENT_API_URL");
  PROBE_AGENT_ID = readEnvString("PROBE_AGENT_ID");
  PROBE_AGENT_TOKEN = readEnvString("PROBE_AGENT_TOKEN", { trim: false });
  PROBE_AGENT_LOOP_INTERVAL_MS = readEnvNumber("PROBE_AGENT_LOOP_INTERVAL_MS", {
    fallback: 10000,
    min: 1000,
    max: 300000,
  });
  PROBE_AGENT_JOB_LIMIT = readEnvNumber("PROBE_AGENT_JOB_LIMIT", {
    fallback: 10,
    min: 1,
    max: 200,
  });
  PROBE_AGENT_CONCURRENCY = readEnvNumber("PROBE_AGENT_CONCURRENCY", {
    fallback: 4,
    min: 1,
    max: 64,
  });
  PROBE_AGENT_API_TIMEOUT_MS = readEnvNumber("PROBE_AGENT_API_TIMEOUT_MS", {
    fallback: 15000,
    min: 1000,
    max: 120000,
  });
} catch (error) {
  logger.error("config_failed", error);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function clampNumber(value, options = {}) {
  const { fallback = 0, min = 0, max = 120000 } = options;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.trunc(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeStatusCodeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry))
    .filter((entry) => entry >= 100 && entry <= 599);
}

function normalizeErrorMessage(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, 255);
}

function isStatusUp(statusCode, successStatusCodes) {
  const numeric = Number(statusCode);
  if (!Number.isFinite(numeric)) return false;
  const expected = normalizeStatusCodeList(successStatusCodes);
  if (expected.length) {
    return expected.includes(Math.trunc(numeric));
  }
  return DEFAULT_STATUS_CODES.includes(Math.trunc(numeric));
}

function normalizeHttpHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

function isRedirectStatusCode(statusCode) {
  if (!Number.isFinite(statusCode)) return false;
  return statusCode >= 300 && statusCode < 400;
}

function buildApiUrl(pathname) {
  return new URL(String(pathname || "").trim() || "/", PROBE_AGENT_API_URL).toString();
}

async function requestJson(method, targetUrl, options = {}) {
  const parsed = new URL(String(targetUrl || ""));
  const requestModule = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
  if (!requestModule) {
    throw new Error(`unsupported protocol: ${parsed.protocol}`);
  }

  const bodyText = options.body === undefined ? "" : JSON.stringify(options.body);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${PROBE_AGENT_TOKEN}`,
    "X-Probe-Id": PROBE_AGENT_ID,
    "X-PingMyServer-Probe-Token": PROBE_AGENT_TOKEN,
    "User-Agent": "PingMyServer-ProbeAgent/1.0",
    ...options.headers,
  };
  if (bodyText) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Length"] = Buffer.byteLength(bodyText);
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = requestModule.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        method,
        path: `${parsed.pathname || "/"}${parsed.search || ""}`,
        timeout: clampNumber(options.timeoutMs, {
          fallback: PROBE_AGENT_API_TIMEOUT_MS,
          min: 1000,
          max: 120000,
        }),
        headers,
      },
      (response) => {
        const chunks = [];
        let size = 0;

        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (!buffer.length) return;

          size += buffer.length;
          if (size <= API_RESPONSE_LIMIT_BYTES) {
            chunks.push(buffer);
            return;
          }

          response.destroy(new Error("api_response_too_large"));
        });

        response.on("end", () => {
          const text = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
          let payload = null;
          if (text) {
            try {
              payload = JSON.parse(text);
            } catch (error) {
              payload = null;
            }
          }

          finishResolve({
            statusCode: Number(response.statusCode || 0),
            payload,
          });
        });

        response.on("error", finishReject);
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("api_request_timeout"));
    });

    request.on("error", finishReject);

    if (bodyText) {
      request.write(bodyText);
    }
    request.end();
  });
}

async function requestProbeApi(method, pathname, body) {
  return await requestJson(method, buildApiUrl(pathname), {
    body,
    timeoutMs: PROBE_AGENT_API_TIMEOUT_MS,
  });
}

async function requestMonitorDetails(targetUrl, options = {}) {
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
      error: normalizeErrorMessage(error.message) || "invalid_url",
    };
  }

  const requestModule = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
  if (!requestModule) {
    return {
      statusCode: null,
      headers: null,
      bodyText: "",
      bodyTruncated: false,
      timedOut: false,
      error: `unsupported_protocol:${parsed.protocol || "unknown"}`,
    };
  }

  const connectAddress = net.isIP(String(options.connectAddress || "").trim()) ? String(options.connectAddress).trim() : "";
  const collectBody = options.collectBody === true;
  const timeoutMs = clampNumber(options.timeoutMs, {
    fallback: DEFAULT_HTTP_TIMEOUT_MS,
    min: 100,
    max: 120000,
  });
  const maxBodyBytes = clampNumber(options.maxBodyBytes, {
    fallback: HTTP_ASSERTION_MAX_BODY_BYTES,
    min: 0,
    max: HTTP_ASSERTION_MAX_BODY_BYTES,
  });
  const hostHeader = parsed.host || parsed.hostname;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const request = requestModule.request(
      {
        protocol: parsed.protocol,
        hostname: connectAddress || parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${parsed.pathname || "/"}${parsed.search || ""}`,
        timeout: timeoutMs,
        agent: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
          Host: hostHeader,
        },
        ...(parsed.protocol === "https:" ? { servername: parsed.hostname } : {}),
      },
      (response) => {
        const statusCode = Number(response.statusCode || 0) || null;
        const headers = response.headers || null;

        if (!collectBody || maxBodyBytes <= 0) {
          response.resume();
          response.on("end", () => {
            finish({
              statusCode,
              headers,
              bodyText: "",
              bodyTruncated: false,
              timedOut: false,
              error: null,
            });
          });
          response.on("error", (error) => {
            finish({
              statusCode,
              headers,
              bodyText: "",
              bodyTruncated: false,
              timedOut: false,
              error: normalizeErrorMessage(error.message) || "response_error",
            });
          });
          return;
        }

        let size = 0;
        let truncated = false;
        const chunks = [];

        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (!buffer.length) return;

          const nextSize = size + buffer.length;
          if (nextSize <= maxBodyBytes) {
            chunks.push(buffer);
            size = nextSize;
            return;
          }

          const remaining = maxBodyBytes - size;
          if (remaining > 0) {
            chunks.push(buffer.slice(0, remaining));
            size += remaining;
          }
          truncated = true;
          response.destroy();
        });

        const finalizeBody = () => ({
          bodyText: chunks.length ? Buffer.concat(chunks).toString("utf8") : "",
          bodyTruncated: truncated,
        });

        response.on("end", () => {
          finish({
            statusCode,
            headers,
            ...finalizeBody(),
            timedOut: false,
            error: null,
          });
        });

        response.on("close", () => {
          if (!truncated || settled) return;
          finish({
            statusCode,
            headers,
            ...finalizeBody(),
            timedOut: false,
            error: null,
          });
        });

        response.on("error", (error) => {
          finish({
            statusCode,
            headers,
            ...finalizeBody(),
            timedOut: false,
            error: normalizeErrorMessage(error.message) || "response_error",
          });
        });
      }
    );

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
        error: normalizeErrorMessage(error.message) || (timedOut ? "timeout" : "request_failed"),
      });
    });

    request.end();
  });
}

function evaluateHttpAssertionsResult(requestResult, assertions, successStatusCodes) {
  const statusCode = requestResult?.statusCode;
  const headers = requestResult?.headers || {};
  const bodyText = String(requestResult?.bodyText || "");

  const requestError = String(requestResult?.error || "").trim();
  if (requestError === "redirect_loop") {
    return { ok: false, errorMessage: requestError };
  }

  if (!Number.isFinite(statusCode)) {
    return { ok: false, errorMessage: requestError || "no_response" };
  }

  const expected = normalizeStatusCodeList(assertions?.expectedStatusCodes);
  const statusOk = expected.length ? expected.includes(statusCode) : isStatusUp(statusCode, successStatusCodes);
  if (!statusOk) {
    return { ok: false, errorMessage: `unexpected_status:${statusCode}` };
  }

  const expectedContentType = String(assertions?.contentTypeContains || "").trim();
  if (expectedContentType) {
    const responseContentType = normalizeHttpHeaderValue(headers["content-type"]).toLowerCase();
    if (!responseContentType.includes(expectedContentType.toLowerCase())) {
      return { ok: false, errorMessage: "content_type_mismatch" };
    }
  }

  const expectedBody = String(assertions?.bodyContains || "").trim();
  if (expectedBody && !bodyText.toLowerCase().includes(expectedBody.toLowerCase())) {
    return { ok: false, errorMessage: "body_mismatch" };
  }

  return { ok: true, errorMessage: null };
}

async function executeHttpJob(job) {
  const monitorId = Number(job?.monitorId);
  const successStatusCodes = normalizeStatusCodeList(job?.successStatusCodes);
  const assertions = job?.httpAssertions && typeof job.httpAssertions === "object" ? job.httpAssertions : {};
  const followRedirects = assertions.followRedirects === true;
  const maxRedirects = followRedirects ? clampNumber(assertions.maxRedirects, { fallback: 5, min: 0, max: 10 }) : 0;
  const timeoutMs =
    clampNumber(assertions.timeoutMs, { fallback: DEFAULT_HTTP_TIMEOUT_MS, min: 0, max: 120000 }) || DEFAULT_HTTP_TIMEOUT_MS;
  const collectBody = !!String(assertions.bodyContains || "").trim();
  const baseConnectAddress = net.isIP(String(job?.connectAddress || "").trim()) ? String(job.connectAddress).trim() : "";

  const startedAt = performance.now();
  let currentUrl = String(job?.targetUrl || "");
  let originalHost = "";
  try {
    originalHost = new URL(currentUrl).hostname.toLowerCase();
  } catch (error) {
    originalHost = "";
  }

  let lastResult = null;
  const visited = new Set();

  for (let step = 0; step <= maxRedirects; step += 1) {
    if (visited.has(currentUrl)) {
      lastResult = {
        statusCode: lastResult?.statusCode ?? null,
        headers: lastResult?.headers ?? null,
        bodyText: lastResult?.bodyText ?? "",
        bodyTruncated: !!lastResult?.bodyTruncated,
        timedOut: false,
        error: "redirect_loop",
      };
      break;
    }
    visited.add(currentUrl);

    const requestResult = await requestMonitorDetails(currentUrl, {
      connectAddress: baseConnectAddress,
      timeoutMs,
      collectBody,
      maxBodyBytes: HTTP_ASSERTION_MAX_BODY_BYTES,
    });
    lastResult = requestResult;

    if (!followRedirects || !isRedirectStatusCode(requestResult.statusCode)) {
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

    let nextHost = "";
    try {
      nextHost = new URL(nextUrl).hostname.toLowerCase();
    } catch (error) {
      nextHost = "";
    }

    if (!nextUrl.startsWith("http://") && !nextUrl.startsWith("https://")) {
      break;
    }

    if (!originalHost || nextHost !== originalHost) {
      break;
    }

    currentUrl = nextUrl;
  }

  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
  if (!lastResult) {
    return {
      monitorId,
      ok: false,
      responseMs: elapsedMs,
      statusCode: null,
      errorMessage: "request_failed",
    };
  }

  if (!assertions.enabled) {
    const ok = isStatusUp(lastResult.statusCode, successStatusCodes);
    return {
      monitorId,
      ok,
      responseMs: elapsedMs,
      statusCode: Number.isFinite(lastResult.statusCode) ? lastResult.statusCode : null,
      errorMessage: ok ? null : normalizeErrorMessage(lastResult.error) || "request_failed",
    };
  }

  const evaluation = evaluateHttpAssertionsResult(lastResult, assertions, successStatusCodes);
  return {
    monitorId,
    ok: evaluation.ok,
    responseMs: elapsedMs,
    statusCode: Number.isFinite(lastResult.statusCode) ? lastResult.statusCode : null,
    errorMessage: evaluation.ok ? null : normalizeErrorMessage(lastResult.error || evaluation.errorMessage) || "request_failed",
  };
}

async function executeJob(job) {
  const monitorId = Number(job?.monitorId);
  if (!Number.isInteger(monitorId) || monitorId <= 0) {
    return null;
  }

  if (String(job?.action || "").trim() === "report") {
    const result = job?.result && typeof job.result === "object" ? job.result : {};
    return {
      monitorId,
      ok: result.ok === true,
      responseMs: clampNumber(result.responseMs, { fallback: 0, min: 0, max: 600000 }),
      statusCode: Number.isFinite(Number(result.statusCode)) ? Math.trunc(Number(result.statusCode)) : null,
      errorMessage: normalizeErrorMessage(result.errorMessage),
    };
  }

  try {
    return await executeHttpJob(job);
  } catch (error) {
    return {
      monitorId,
      ok: false,
      responseMs: 0,
      statusCode: null,
      errorMessage: normalizeErrorMessage(error.message) || "agent_execution_failed",
    };
  }
}

async function runWithConcurrency(items, concurrency, workerFn) {
  const queue = Array.isArray(items) ? items : [];
  if (!queue.length) return [];

  const results = new Array(queue.length);
  let index = 0;
  const workerCount = Math.min(queue.length, Math.max(1, Number(concurrency) || 1));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = index;
        index += 1;
        if (currentIndex >= queue.length) return;

        results[currentIndex] = await workerFn(queue[currentIndex], currentIndex);
      }
    })
  );

  return results.filter(Boolean);
}

async function sendHeartbeat() {
  try {
    await requestProbeApi("POST", "/api/probe-agent/heartbeat", {});
  } catch (error) {
    logger.warn("heartbeat_failed", {
      message: error.message,
    });
  }
}

async function pollOnce() {
  const jobsResponse = await requestProbeApi("GET", `/api/probe-agent/jobs?limit=${encodeURIComponent(String(PROBE_AGENT_JOB_LIMIT))}`);
  if (jobsResponse.statusCode !== 200 || !jobsResponse.payload?.ok) {
    logger.warn("jobs_request_failed", {
      statusCode: jobsResponse.statusCode,
      body: jobsResponse.payload,
    });
    return;
  }

  const jobs = Array.isArray(jobsResponse.payload?.data?.jobs) ? jobsResponse.payload.data.jobs : [];
  if (!jobs.length) {
    await sendHeartbeat();
    return;
  }

  const results = await runWithConcurrency(jobs, PROBE_AGENT_CONCURRENCY, executeJob);
  if (!results.length) {
    logger.warn("jobs_without_results", { jobs: jobs.length });
    await sendHeartbeat();
    return;
  }

  const submitResponse = await requestProbeApi("POST", "/api/probe-agent/results", {
    results,
  });
  if (submitResponse.statusCode !== 200 || !submitResponse.payload?.ok) {
    logger.warn("results_submit_failed", {
      statusCode: submitResponse.statusCode,
      body: submitResponse.payload,
      attempted: results.length,
    });
    return;
  }

  logger.info("cycle_completed", {
    probeId: PROBE_AGENT_ID,
    jobs: jobs.length,
    accepted: Number(submitResponse.payload?.data?.accepted || 0),
    ignored: Number(submitResponse.payload?.data?.ignored || 0),
  });
}

async function main() {
  logger.info("startup", {
    probeId: PROBE_AGENT_ID,
    apiUrl: PROBE_AGENT_API_URL,
    intervalMs: PROBE_AGENT_LOOP_INTERVAL_MS,
    concurrency: PROBE_AGENT_CONCURRENCY,
    jobLimit: PROBE_AGENT_JOB_LIMIT,
  });

  while (true) {
    const startedAt = Date.now();
    try {
      await pollOnce();
    } catch (error) {
      logger.error("cycle_failed", error);
    }

    const elapsedMs = Date.now() - startedAt;
    const sleepMs = Math.max(1000, PROBE_AGENT_LOOP_INTERVAL_MS - elapsedMs);
    await sleep(sleepMs);
  }
}

main().catch((error) => {
  logger.error("startup_failed", error);
  process.exit(1);
});
