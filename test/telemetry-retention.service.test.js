"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getRetentionPolicy,
  normalizeRetentionClass,
  resolveRetentionClass,
} = require("../src/modules/telemetry/telemetry-retention.service");

test("uses the expected tiered retention windows", () => {
  assert.deepEqual(getRetentionPolicy("free"), { rawDays: 1, aggregateDays: 30 });
  assert.deepEqual(getRetentionPolicy("community"), { rawDays: 7, aggregateDays: 180 });
  assert.deepEqual(getRetentionPolicy("pro"), { rawDays: 30, aggregateDays: 730 });
});

test("paid plan takes precedence over a community connection", () => {
  assert.equal(resolveRetentionClass({ hasPaidPlan: true, hasLiveCommunityAgent: true }), "pro");
  assert.equal(resolveRetentionClass({ hasLiveCommunityAgent: true }), "community");
  assert.equal(resolveRetentionClass({}), "free");
  assert.equal(normalizeRetentionClass("unknown"), "free");
});
