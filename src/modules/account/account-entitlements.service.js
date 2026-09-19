const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

function createAccountEntitlementsService(dependencies = {}) {
  const {
    getBillingByUserId,
    getCommunitySummaryByUserId,
    paidMonitorLimit = 1000,
    freeMonitorLimit = 1,
    communityMonitorLimit = 3,
    paidMinimumIntervalMs = 30000,
    freeMinimumIntervalMs = 60000,
  } = dependencies;

  async function resolveForUser(userId) {
    const [billing, community] = await Promise.all([
      getBillingByUserId(userId),
      getCommunitySummaryByUserId(userId),
    ]);
    const subscriptionStatus = String(billing?.stripe_subscription_status || "none").trim().toLowerCase();
    const paid = ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
    const communityActive = !!community?.hasLiveAgent;
    const tier = paid ? "paid" : communityActive ? "community" : "free";

    return {
      tier,
      paid,
      communityActive,
      monitorLimit: paid ? paidMonitorLimit : communityActive ? communityMonitorLimit : freeMonitorLimit,
      minimumIntervalMs: paid ? paidMinimumIntervalMs : freeMinimumIntervalMs,
      communityChecks30d: Number(community?.checks30d || 0),
      discountPercent: communityActive ? 40 : 0,
      discountPendingVerification: communityActive,
    };
  }

  return { resolveForUser };
}

module.exports = {
  ACTIVE_SUBSCRIPTION_STATUSES,
  createAccountEntitlementsService,
};
