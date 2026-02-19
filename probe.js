// Probe-only entrypoint: runs checks and writes probe results, but does not serve HTTP.
// Configure per-server PROBE_ID + DB access via environment (.env on that server).

process.env.APP_MODE = "probe";
process.env.MULTI_LOCATION_ENABLED = process.env.MULTI_LOCATION_ENABLED || "true";

require("./server.js");

