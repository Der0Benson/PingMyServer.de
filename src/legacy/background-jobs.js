function startBackgroundJobs(dependencies = {}) {
  const {
    clusterEnabled,
    clusterLeaseRenewMs,
    refreshClusterLeadership,
    runProbeChecks,
    runMonitorChecks,
    shouldRunLeaderTasks,
    cleanupExpiredSessions,
    cleanupExpiredAuthEmailChallenges,
    cleanupGameAgentPairings,
    cleanupOldChecks,
    compactClosedDays,
    compactProbeClosedDays,
    checkSchedulerMs,
    maintenanceIntervalMs,
    authEmailVerificationCleanupIntervalMs,
    dailyCompactionIntervalMs,
    runtimeTelemetry,
    pushNumericSample,
    logger,
  } = dependencies;

  const jobs = [];
  let monitorSchedulerExpectedAt = Date.now() + checkSchedulerMs;

  const logBackgroundError = (event, error) => {
    if (logger && typeof logger.error === "function") {
      logger.error(event, error);
      return;
    }
    console.error(event, error);
  };

  async function initialize() {
    await refreshClusterLeadership();
    if (clusterEnabled) {
      jobs.push(
        setInterval(() => {
          refreshClusterLeadership().catch((error) => {
            logBackgroundError("cluster_leader_refresh_failed", error);
          });
        }, clusterLeaseRenewMs)
      );
    }

    await runProbeChecks();
    await runMonitorChecks();
    if (shouldRunLeaderTasks()) {
      await cleanupExpiredSessions();
      await cleanupExpiredAuthEmailChallenges();
      await cleanupGameAgentPairings();
      await cleanupOldChecks();
      await compactClosedDays();
      await compactProbeClosedDays();
    }

    jobs.push(
      setInterval(() => {
        const now = Date.now();
        const driftMs = Math.max(0, now - monitorSchedulerExpectedAt);
        pushNumericSample(runtimeTelemetry.scheduler.driftMsSamples, driftMs);
        monitorSchedulerExpectedAt = now + checkSchedulerMs;

        (async () => {
          try {
            await runProbeChecks();
          } catch (error) {
            logBackgroundError("probe_check_cycle_failed", error);
          }

          try {
            await runMonitorChecks();
          } catch (error) {
            logBackgroundError("monitor_check_cycle_failed", error);
          }
        })();
      }, checkSchedulerMs)
    );

    jobs.push(
      setInterval(() => {
        if (!shouldRunLeaderTasks()) return;

        cleanupOldChecks().catch((error) => {
          logBackgroundError("check_cleanup_failed", error);
        });
        cleanupExpiredSessions().catch((error) => {
          logBackgroundError("session_cleanup_failed", error);
        });
        cleanupGameAgentPairings().catch((error) => {
          logBackgroundError("game_agent_pairing_cleanup_failed", error);
        });
      }, maintenanceIntervalMs)
    );

    jobs.push(
      setInterval(() => {
        if (!shouldRunLeaderTasks()) return;

        cleanupExpiredAuthEmailChallenges().catch((error) => {
          logBackgroundError("auth_email_challenge_cleanup_failed", error);
        });
      }, authEmailVerificationCleanupIntervalMs)
    );

    jobs.push(
      setInterval(() => {
        if (!shouldRunLeaderTasks()) return;

        compactClosedDays().catch((error) => {
          logBackgroundError("daily_compaction_cycle_failed", error);
        });
        compactProbeClosedDays().catch((error) => {
          logBackgroundError("probe_daily_compaction_cycle_failed", error);
        });
      }, dailyCompactionIntervalMs)
    );
  }

  return {
    initialize,
    jobs,
  };
}

module.exports = {
  startBackgroundJobs,
};
