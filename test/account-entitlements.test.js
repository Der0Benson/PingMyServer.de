const assert = require("node:assert/strict");
const test = require("node:test");

const { createAccountEntitlementsService } = require("../src/modules/account/account-entitlements.service");

function createService({ status = null, live = false, checks30d = 0 } = {}) {
  return createAccountEntitlementsService({
    getBillingByUserId: async () => ({ stripe_subscription_status: status }),
    getCommunitySummaryByUserId: async () => ({ hasLiveAgent: live, checks30d }),
    paidMonitorLimit: 1000,
    freeMonitorLimit: 1,
    communityMonitorLimit: 3,
    paidMinimumIntervalMs: 30000,
    freeMinimumIntervalMs: 60000,
  });
}

test("free accounts receive one monitor and 60-second checks", async () => {
  const entitlement = await createService().resolveForUser(1);
  assert.equal(entitlement.tier, "free");
  assert.equal(entitlement.monitorLimit, 1);
  assert.equal(entitlement.minimumIntervalMs, 60000);
  assert.equal(entitlement.discountPercent, 0);
});

test("a live community agent unlocks three free monitors", async () => {
  const entitlement = await createService({ live: true, checks30d: 4321 }).resolveForUser(1);
  assert.equal(entitlement.tier, "community");
  assert.equal(entitlement.monitorLimit, 3);
  assert.equal(entitlement.minimumIntervalMs, 60000);
  assert.equal(entitlement.communityChecks30d, 4321);
  assert.equal(entitlement.discountPercent, 40);
  assert.equal(entitlement.discountPendingVerification, true);
});

test("active paid subscriptions keep paid limits and fast checks", async () => {
  const entitlement = await createService({ status: "active", live: true }).resolveForUser(1);
  assert.equal(entitlement.tier, "paid");
  assert.equal(entitlement.paid, true);
  assert.equal(entitlement.monitorLimit, 1000);
  assert.equal(entitlement.minimumIntervalMs, 30000);
});
