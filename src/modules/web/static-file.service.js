const fs = require("fs");
const path = require("path");

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

function normalizePublicHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const first = raw.split(",")[0].trim();
  if (!first) return "";

  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    if (end > 1) return first.slice(1, end).trim();
    return first;
  }

  const lastColon = first.lastIndexOf(":");
  const hasSingleColon = lastColon > -1 && first.indexOf(":") === lastColon;
  if (hasSingleColon) return first.slice(0, lastColon).trim();

  return first;
}

function resolvePublicOriginFromResponse(res) {
  const host = normalizePublicHost(res?.__pms_public_host);
  if (host === "pingmyserver.com" || host.endsWith(".pingmyserver.com")) {
    return "https://pingmyserver.com";
  }
  return "https://pingmyserver.de";
}

function resolvePrimaryLangFromOrigin(origin) {
  return origin === "https://pingmyserver.com" ? "en" : "de";
}

function resolveOgLocaleFromLang(lang) {
  return lang === "en" ? "en_US" : "de_DE";
}

function applyStaticTemplateReplacements(content, absolutePath, res) {
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext !== ".html" && ext !== ".txt" && ext !== ".xml") {
    return content;
  }

  const origin = resolvePublicOriginFromResponse(res);
  const primaryLang = resolvePrimaryLangFromOrigin(origin);
  const ogLocale = resolveOgLocaleFromLang(primaryLang);

  return String(content || "")
    .replace(/__PMS_ORIGIN__/g, origin)
    .replace(/__PMS_PRIMARY_LANG__/g, primaryLang)
    .replace(/__PMS_OG_LOCALE__/g, ogLocale);
}

function createStaticFileService(dependencies = {}) {
  const { publicDir, staticCacheMaxAgeSeconds, sendJson } = dependencies;
  if (!path.isAbsolute(String(publicDir || ""))) {
    throw new TypeError("publicDir must be an absolute path");
  }
  if (typeof sendJson !== "function") {
    throw new TypeError("sendJson must be a function");
  }

  const cacheMaxAgeSeconds = Math.max(0, Number(staticCacheMaxAgeSeconds) || 0);

  async function serveStaticFile(res, relativeFilePath) {
    const normalized = String(relativeFilePath || "").replace(/^\/+/, "");
    if (!normalized) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const absolutePath = path.resolve(publicDir, normalized);
    const relativeToPublic = path.relative(publicDir, absolutePath);
    if (
      relativeToPublic === "" ||
      relativeToPublic === ".." ||
      relativeToPublic.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToPublic)
    ) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }

    try {
      const ext = path.extname(absolutePath).toLowerCase();
      const isTextTemplate = ext === ".html" || ext === ".txt" || ext === ".xml";
      const data = isTextTemplate
        ? applyStaticTemplateReplacements(await fs.promises.readFile(absolutePath, "utf8"), absolutePath, res)
        : await fs.promises.readFile(absolutePath);
      res.writeHead(200, {
        "Content-Type": contentTypeFromPath(absolutePath),
        "Cache-Control": `public, max-age=${cacheMaxAgeSeconds}`,
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

  return { serveStaticFile };
}

module.exports = {
  applyStaticTemplateReplacements,
  contentTypeFromPath,
  createStaticFileService,
  normalizePublicHost,
  resolveOgLocaleFromLang,
  resolvePrimaryLangFromOrigin,
  resolvePublicOriginFromResponse,
};
