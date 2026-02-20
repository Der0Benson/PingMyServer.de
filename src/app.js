const { createLegacyRequestHandler } = require("./legacy/runtime");

function createApp() {
  const legacyHandler = createLegacyRequestHandler();
  const app = async (req, res) => {
    try {
      await legacyHandler(req, res);
    } catch (error) {
      console.error("app.errorHandler", error);
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ ok: false, error: "internal error" }));
        return;
      }
      res.end();
    }
  };

  return app;
}

module.exports = {
  app: createApp(),
  createApp,
};
