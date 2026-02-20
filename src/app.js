const { handleRequestError } = require("./core/error-handler");
const { createLogger } = require("./core/logger");
const { createLegacyRequestHandler } = require("./legacy/runtime");

function sendJsonLegacy(res, statusCode, payload) {
  if (res.headersSent) return;
  res.writeHead(Number(statusCode) || 500, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function createApp() {
  const logger = createLogger("app");
  const legacyHandler = createLegacyRequestHandler();
  return async (req, res) => {
    try {
      await legacyHandler(req, res);
    } catch (error) {
      handleRequestError({
        error,
        res,
        sendJson: sendJsonLegacy,
        logger,
        event: "app_error",
        fallbackStatusCode: 500,
        fallbackBody: { ok: false, error: "internal error" },
      });
    }
  };
}

module.exports = {
  app: createApp(),
  createApp,
};
