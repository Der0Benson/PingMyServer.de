const { start } = require("./src/server");
const { createLogger } = require("./src/core/logger");

const logger = createLogger("server.bootstrap");

start().catch((error) => {
  logger.error("startup_failed", error);
  process.exit(1);
});

module.exports = {
  start,
};
