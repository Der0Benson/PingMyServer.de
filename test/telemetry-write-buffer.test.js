"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTelemetryWriteBuffer } = require("../src/modules/telemetry/telemetry-write-buffer");

test("flushes a full telemetry batch immediately", async () => {
  const batches = [];
  const buffer = createTelemetryWriteBuffer({
    batchSize: 3,
    flushIntervalMs: 1000,
    writeBatch: async (items) => {
      batches.push(items);
      return items.map((item) => item.id);
    },
  });

  const results = await Promise.all([1, 2, 3].map((id) => buffer.enqueue({ id })));
  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(batches, [[{ id: 1 }, { id: 2 }, { id: 3 }]]);
  await buffer.close();
});

test("flushes partial batches on the timer", async () => {
  const batches = [];
  const buffer = createTelemetryWriteBuffer({
    batchSize: 64,
    flushIntervalMs: 5,
    writeBatch: async (items) => batches.push(items),
  });

  await buffer.enqueue({ id: 1 });
  assert.equal(batches.length, 1);
  await buffer.close();
});

test("rejects every item when a batch write fails", async () => {
  const buffer = createTelemetryWriteBuffer({
    batchSize: 2,
    writeBatch: async () => {
      throw new Error("database unavailable");
    },
  });

  const results = await Promise.allSettled([buffer.enqueue({ id: 1 }), buffer.enqueue({ id: 2 })]);
  assert.ok(results.every((result) => result.status === "rejected"));
  await buffer.close();
});
