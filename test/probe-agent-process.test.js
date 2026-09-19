const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("probe agent reads a Docker secret and returns leased results", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pms-probe-agent-"));
  const tokenPath = path.join(tempDir, "token");
  await fs.writeFile(tokenPath, "integration-secret\n", { mode: 0o600 });

  let submittedBody = null;
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer integration-secret");
    assert.equal(req.headers["x-probe-id"], "integration-probe");

    if (req.method === "GET" && req.url.startsWith("/api/probe-agent/jobs")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          data: {
            jobs: [
              {
                monitorId: 42,
                jobId: "86ced452-b59a-4d38-9d27-236f198d23d4",
                leaseToken: "integration-lease",
                expiresAt: Date.now() + 60000,
                action: "report",
                result: { ok: false, responseMs: 0, statusCode: null, errorMessage: "control_result" },
              },
            ],
          },
        })
      );
      return;
    }

    if (req.method === "POST" && req.url === "/api/probe-agent/results") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        submittedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, data: { accepted: 1, ignored: 0 } }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const address = server.address();
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "probe-agent.js"), "--once"], {
    env: {
      ...process.env,
      PROBE_AGENT_API_URL: `http://127.0.0.1:${address.port}`,
      PROBE_AGENT_ALLOW_INSECURE_HTTP: "true",
      PROBE_AGENT_ID: "integration-probe",
      PROBE_AGENT_TOKEN_FILE: tokenPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("probe agent test timed out")), 5000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0, stderr);
  assert.deepEqual(submittedBody, {
    results: [
      {
        monitorId: 42,
        ok: false,
        responseMs: 0,
        statusCode: null,
        errorMessage: "control_result",
        jobId: "86ced452-b59a-4d38-9d27-236f198d23d4",
        leaseToken: "integration-lease",
      },
    ],
  });
});
