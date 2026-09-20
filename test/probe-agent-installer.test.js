"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const installerPath = path.resolve(__dirname, "..", "docker", "probe-agent", "install.sh");

test("probe agent quick installer has valid POSIX shell syntax", () => {
  const result = spawnSync("sh", ["-n", installerPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("probe agent quick installer keeps the token out of process arguments", () => {
  const source = fs.readFileSync(installerPath, "utf8");
  const help = spawnSync("sh", [installerPath, "--help"], { encoding: "utf8" });

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--id PROBE_ID/);
  assert.doesNotMatch(help.stdout, /--token/);
  assert.match(source, /read -r token < \/dev\/tty/);
  assert.match(source, /chmod 600 .*probe-agent-token\.txt/);
});
