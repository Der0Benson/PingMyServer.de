function handleRequestError(options = {}) {
  const {
    error,
    res,
    sendJson,
    logger,
    event = "request_failed",
    fallbackStatusCode = 500,
    fallbackBody = { ok: false, error: "internal error" },
  } = options;

  if (logger && typeof logger.error === "function") {
    logger.error(event, error);
  } else {
    console.error(event, error);
  }

  if (!res || !sendJson || typeof sendJson !== "function") return;

  if (!res.headersSent) {
    sendJson(res, fallbackStatusCode, fallbackBody);
    return;
  }

  try {
    res.end();
  } catch (endError) {
    if (logger && typeof logger.error === "function") {
      logger.error("response_end_failed", endError);
    } else {
      console.error("response_end_failed", endError);
    }
  }
}

module.exports = {
  handleRequestError,
};
