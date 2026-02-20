function normalizeLogValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      statusCode: value.statusCode,
    };
  }
  return value;
}

function createLogger(moduleName = "app") {
  const scope = String(moduleName || "app").trim() || "app";

  function write(level, event, ...meta) {
    const payload = {
      ts: new Date().toISOString(),
      level: String(level || "info").toLowerCase(),
      module: scope,
      event: String(event || "log"),
    };

    if (meta.length === 1) {
      payload.meta = normalizeLogValue(meta[0]);
    } else if (meta.length > 1) {
      payload.meta = meta.map((item) => normalizeLogValue(item));
    }

    const line = JSON.stringify(payload);
    if (payload.level === "error") {
      console.error(line);
      return;
    }
    if (payload.level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }

  return {
    debug(event, ...meta) {
      write("debug", event, ...meta);
    },
    info(event, ...meta) {
      write("info", event, ...meta);
    },
    warn(event, ...meta) {
      write("warn", event, ...meta);
    },
    error(event, ...meta) {
      write("error", event, ...meta);
    },
  };
}

module.exports = {
  createLogger,
};
