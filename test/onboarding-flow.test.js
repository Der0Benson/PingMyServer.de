const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");

test("onboarding collects target, interval and email preference before creation", () => {
  const html = fs.readFileSync(path.join(publicDir, "onboarding.html"), "utf8");

  assert.match(html, /name="target-type"/);
  assert.match(html, /name="interval"/);
  assert.match(html, /name="email-notifications"/);
  assert.match(html, /value="60000" checked/);
  assert.match(html, /Gameserver/);
  assert.match(html, /aria-disabled="true"/);
});

test("onboarding persists interval and per-monitor email settings", () => {
  const source = fs.readFileSync(path.join(publicDir, "onboarding.js"), "utf8");

  assert.match(source, /body: JSON\.stringify\(\{\s*intervalMs\s*\}\)/);
  assert.match(source, /email-notifications/);
  assert.match(source, /api\/account\/notifications\/email/);
});

test("dashboard navigation explains every main destination", () => {
  const source = fs.readFileSync(path.join(publicDir, "dashboard-shell.js"), "utf8");

  for (const route of ["/app", "/monitors", "/incidents", "/notifications", "/connections", "/status"]) {
    assert.ok(source.includes(`"${route}"`), `missing navigation description for ${route}`);
  }
});
