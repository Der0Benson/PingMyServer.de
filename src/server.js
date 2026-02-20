const http = require("http");
const { app } = require("./app");
const { startLegacyRuntime } = require("./legacy/runtime");

let startPromise = null;

function start() {
  if (startPromise) return startPromise;

  startPromise = startLegacyRuntime({
    createHttpServer: () => http.createServer(app),
  });

  return startPromise;
}

module.exports = {
  start,
};
