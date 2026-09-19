const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyStaticTemplateReplacements,
  contentTypeFromPath,
  createStaticFileService,
  normalizePublicHost,
} = require("../src/modules/web/static-file.service");

function createResponse(publicHost = "pingmyserver.de") {
  return {
    __pms_public_host: publicHost,
    body: null,
    headers: null,
    statusCode: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("contentTypeFromPath maps known extensions", () => {
  assert.equal(contentTypeFromPath("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFromPath("app.js"), "application/javascript; charset=utf-8");
  assert.equal(contentTypeFromPath("image.png"), "image/png");
  assert.equal(contentTypeFromPath("archive.bin"), "application/octet-stream");
});

test("normalizePublicHost handles ports, forwarded hosts and IPv6", () => {
  assert.equal(normalizePublicHost("PingMyServer.com:443"), "pingmyserver.com");
  assert.equal(normalizePublicHost("pingmyserver.de, proxy.internal"), "pingmyserver.de");
  assert.equal(normalizePublicHost("[2001:db8::1]:443"), "2001:db8::1");
});

test("applyStaticTemplateReplacements selects the English public origin", () => {
  const rendered = applyStaticTemplateReplacements(
    "__PMS_ORIGIN__|__PMS_PRIMARY_LANG__|__PMS_OG_LOCALE__",
    "/tmp/index.html",
    createResponse("www.pingmyserver.com")
  );
  assert.equal(rendered, "https://pingmyserver.com|en|en_US");
});

test("serveStaticFile renders templates and applies cache headers", async (t) => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), "pms-static-"));
  t.after(() => fs.rm(publicDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(publicDir, "index.html"), "<html lang=\"__PMS_PRIMARY_LANG__\">__PMS_ORIGIN__</html>");

  const sendJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  };
  const { serveStaticFile } = createStaticFileService({ publicDir, staticCacheMaxAgeSeconds: 120, sendJson });
  const res = createResponse("pingmyserver.com");

  await serveStaticFile(res, "index.html");

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "public, max-age=120");
  assert.equal(res.body, '<html lang="en">https://pingmyserver.com</html>');
});

test("serveStaticFile blocks paths outside the public directory", async (t) => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), "pms-static-"));
  t.after(() => fs.rm(publicDir, { recursive: true, force: true }));

  const sendJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  };
  const { serveStaticFile } = createStaticFileService({ publicDir, staticCacheMaxAgeSeconds: 0, sendJson });
  const res = createResponse();

  await serveStaticFile(res, "../secret.txt");

  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: "forbidden" });
});
