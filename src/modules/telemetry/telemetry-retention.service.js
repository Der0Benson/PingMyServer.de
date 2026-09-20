"use strict";

const RETENTION_POLICIES = Object.freeze({
  free: Object.freeze({ rawDays: 1, aggregateDays: 30 }),
  community: Object.freeze({ rawDays: 7, aggregateDays: 180 }),
  pro: Object.freeze({ rawDays: 30, aggregateDays: 730 }),
});

function normalizeRetentionClass(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RETENTION_POLICIES, candidate) ? candidate : "free";
}

function getRetentionPolicy(value) {
  return RETENTION_POLICIES[normalizeRetentionClass(value)];
}

function resolveRetentionClass(options = {}) {
  if (options.hasPaidPlan) return "pro";
  if (options.hasLiveCommunityAgent) return "community";
  return "free";
}

module.exports = {
  RETENTION_POLICIES,
  getRetentionPolicy,
  normalizeRetentionClass,
  resolveRetentionClass,
};
