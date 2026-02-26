const { handleRequestError } = require("../core/error-handler");
const { handleDispatchedRoutes } = require("../modules/routes/dispatch");
const { handleSystemRoutes } = require("../modules/system/system.routes");

function getPrimaryHeaderValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return String(value[0] || "").trim();
  }
  return String(value || "").trim();
}

function resolvePublicRequestHost(req) {
  const forwardedHost = getPrimaryHeaderValue(req?.headers?.["x-forwarded-host"]);
  if (forwardedHost) return forwardedHost;
  return getPrimaryHeaderValue(req?.headers?.host);
}

function createLegacyRequestHandlerFactory(dependencies = {}) {
  const {
    applySecurityHeaders,
    sendJson,
    runtimeTelemetry,
    isStateChangingMethod,
    isValidOrigin,
    handlers,
    utilities,
    constants,
    logger,
  } = dependencies;

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

    const systemHandled = await handleSystemRoutes({
      method,
      pathname,
      req,
      res,
      url,
      handlers: {
        handleLandingRatingsGet: handlers.handleLandingRatingsGet,
        handleLandingRatingsCreate: handlers.handleLandingRatingsCreate,
        handleStripeWebhook: handlers.handleStripeWebhook,
        handleAccountEmailNotificationUnsubscribe: handlers.handleAccountEmailNotificationUnsubscribe,
      },
      utilities: {
        serveStaticFile: utilities.serveStaticFile,
        sendJson: utilities.sendJson,
      },
    });
    if (systemHandled) {
      return;
    }

    const isGameAgentIngestPath =
      pathname === "/api/game-agent/link" ||
      pathname === "/api/game-agent/heartbeat" ||
      pathname === "/api/game-agent/disconnect";
    const isEmailUnsubscribePath = pathname === "/api/account/notifications/email/unsubscribe";
    const requiresOriginValidation =
      (pathname.startsWith("/api/") && !isGameAgentIngestPath && !isEmailUnsubscribePath) ||
      pathname === "/monitor-create" ||
      pathname === "/create-monitor" ||
      pathname.startsWith("/monitor-create/") ||
      pathname.startsWith("/create-monitor/");
    if (isStateChangingMethod(method) && requiresOriginValidation && !isValidOrigin(req)) {
      runtimeTelemetry.security.invalidOriginBlocked += 1;
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }

    const routed = await handleDispatchedRoutes({
      method,
      pathname,
      req,
      res,
      url,
      handlers,
      utilities,
      constants,
    });
    if (routed) {
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  }

  function createLegacyRequestHandler() {
    return async (req, res) => {
      res.__pms_public_host = resolvePublicRequestHost(req);
      applySecurityHeaders(res);

      try {
        await handleRequest(req, res);
      } catch (error) {
        handleRequestError({
          error,
          res,
          sendJson,
          logger,
          event: "request_failed",
          fallbackStatusCode: 500,
          fallbackBody: { ok: false, error: "internal error" },
        });
      }
    };
  }

  return {
    handleRequest,
    createLegacyRequestHandler,
  };
}

module.exports = {
  createLegacyRequestHandlerFactory,
};
