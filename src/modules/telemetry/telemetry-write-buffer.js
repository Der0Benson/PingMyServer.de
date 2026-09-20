"use strict";

function createTelemetryWriteBuffer(options = {}) {
  const batchSize = Math.max(1, Number(options.batchSize) || 64);
  const flushIntervalMs = Math.max(1, Number(options.flushIntervalMs) || 250);
  const writeBatch = options.writeBatch;
  const logger = options.logger || console;

  if (typeof writeBatch !== "function") {
    throw new TypeError("writeBatch must be a function");
  }

  let queue = [];
  let timer = null;
  let draining = null;
  let closed = false;

  function schedule() {
    if (timer || closed || !queue.length) return;
    timer = setTimeout(() => {
      timer = null;
      void flush().catch((error) => logger.error?.("telemetry_batch_flush_failed", error));
    }, flushIntervalMs);
    timer.unref?.();
  }

  async function drain() {
    while (queue.length) {
      const entries = queue.splice(0, batchSize);
      try {
        const results = await writeBatch(entries.map((entry) => entry.item));
        entries.forEach((entry, index) => entry.resolve(Array.isArray(results) ? results[index] : results));
      } catch (error) {
        entries.forEach((entry) => entry.reject(error));
      }
    }
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!draining) {
      draining = drain().finally(() => {
        draining = null;
        schedule();
      });
    }
    await draining;
  }

  function enqueue(item) {
    if (closed) return Promise.reject(new Error("telemetry write buffer is closed"));
    const pending = new Promise((resolve, reject) => queue.push({ item, resolve, reject }));
    if (queue.length >= batchSize) void flush();
    else schedule();
    return pending;
  }

  async function close() {
    closed = true;
    await flush();
  }

  return { enqueue, flush, close, get size() { return queue.length; } };
}

module.exports = { createTelemetryWriteBuffer };
