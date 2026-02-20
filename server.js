const { start } = require("./src/server");

start().catch((error) => {
  console.error("startup_failed", error);
  process.exit(1);
});

module.exports = {
  start,
};
