const { handleAuthRoutes } = require("../auth/auth.routes");
const { handleAccountRoutes } = require("../account/account.routes");
const { handleGameAgentRoutes } = require("../game-agent/game-agent.routes");
const { handleMonitorApiRoutes } = require("../monitors/monitors.routes");
const { handleOwnerRoutes } = require("../owner/owner.routes");
const { handleStatusRoutes } = require("../status/status.routes");
const { handleWebRoutes } = require("../web/web.routes");

async function handleDispatchedRoutes(context) {
  const { method, pathname, req, res, url, handlers, utilities, constants } = context;

  const authHandled = await handleAuthRoutes({
    method,
    pathname,
    req,
    res,
    url,
    handlers: {
      handleAuthDiscordStart: handlers.handleAuthDiscordStart,
      handleAuthDiscordCallback: handlers.handleAuthDiscordCallback,
      handleAuthGithubStart: handlers.handleAuthGithubStart,
      handleAuthGithubCallback: handlers.handleAuthGithubCallback,
      handleAuthGoogleStart: handlers.handleAuthGoogleStart,
      handleAuthGoogleCallback: handlers.handleAuthGoogleCallback,
      handleAuthRegister: handlers.handleAuthRegister,
      handleAuthLogin: handlers.handleAuthLogin,
      handleAuthLoginVerify: handlers.handleAuthLoginVerify,
      handleAuthLoginVerifyResend: handlers.handleAuthLoginVerifyResend,
      handleAuthLogout: handlers.handleAuthLogout,
      handleAuthLogoutAll: handlers.handleAuthLogoutAll,
    },
    utilities: {
      enforceAuthRateLimit: utilities.enforceAuthRateLimit,
      sendJson: utilities.sendJson,
    },
  });
  if (authHandled) return true;

  const accountHandled = await handleAccountRoutes({
    method,
    pathname,
    req,
    res,
    handlers: {
      handleAccountSessionsList: handlers.handleAccountSessionsList,
      handleAccountConnectionsList: handlers.handleAccountConnectionsList,
      handleAccountDomainsList: handlers.handleAccountDomainsList,
      handleAccountTeamGet: handlers.handleAccountTeamGet,
      handleAccountTeamCreate: handlers.handleAccountTeamCreate,
      handleAccountTeamLeaveOrDisband: handlers.handleAccountTeamLeaveOrDisband,
      handleAccountTeamInvitationCreate: handlers.handleAccountTeamInvitationCreate,
      handleAccountTeamInvitationVerify: handlers.handleAccountTeamInvitationVerify,
      handleAccountDomainChallengeCreate: handlers.handleAccountDomainChallengeCreate,
      handleAccountDomainVerify: handlers.handleAccountDomainVerify,
      handleAccountNotificationsGet: handlers.handleAccountNotificationsGet,
      handleAccountBillingGet: handlers.handleAccountBillingGet,
      handleAccountDiscordNotificationUpsert: handlers.handleAccountDiscordNotificationUpsert,
      handleAccountEmailNotificationUpsert: handlers.handleAccountEmailNotificationUpsert,
      handleAccountSlackNotificationUpsert: handlers.handleAccountSlackNotificationUpsert,
      handleAccountWebhookNotificationUpsert: handlers.handleAccountWebhookNotificationUpsert,
      handleAccountBillingCheckout: handlers.handleAccountBillingCheckout,
      handleAccountBillingPortal: handlers.handleAccountBillingPortal,
      handleAccountDiscordNotificationDelete: handlers.handleAccountDiscordNotificationDelete,
      handleAccountEmailNotificationDelete: handlers.handleAccountEmailNotificationDelete,
      handleAccountSlackNotificationDelete: handlers.handleAccountSlackNotificationDelete,
      handleAccountWebhookNotificationDelete: handlers.handleAccountWebhookNotificationDelete,
      handleAccountDiscordNotificationTest: handlers.handleAccountDiscordNotificationTest,
      handleAccountEmailNotificationTest: handlers.handleAccountEmailNotificationTest,
      handleAccountSlackNotificationTest: handlers.handleAccountSlackNotificationTest,
      handleAccountWebhookNotificationTest: handlers.handleAccountWebhookNotificationTest,
      handleAccountRevokeOtherSessions: handlers.handleAccountRevokeOtherSessions,
      handleAccountSessionRevoke: handlers.handleAccountSessionRevoke,
      handleAccountDomainDelete: handlers.handleAccountDomainDelete,
      handleAccountTeamInvitationRevoke: handlers.handleAccountTeamInvitationRevoke,
      handleAccountTeamMemberDelete: handlers.handleAccountTeamMemberDelete,
      handleAccountPasswordChange: handlers.handleAccountPasswordChange,
      handleAccountDelete: handlers.handleAccountDelete,
    },
    utilities: {
      requireAuth: utilities.requireAuth,
      getNextPathForUser: utilities.getNextPathForUser,
      userToResponse: utilities.userToResponse,
      sendJson: utilities.sendJson,
    },
  });
  if (accountHandled) return true;

  const gameAgentHandled = await handleGameAgentRoutes({
    method,
    pathname,
    req,
    res,
    url,
    handlers: {
      handleGameAgentPairingsList: handlers.handleGameAgentPairingsList,
      handleGameAgentPairingCreate: handlers.handleGameAgentPairingCreate,
      handleGameAgentSessionsList: handlers.handleGameAgentSessionsList,
      handleGameAgentEventsList: handlers.handleGameAgentEventsList,
      handleGameAgentSessionRevoke: handlers.handleGameAgentSessionRevoke,
      handleGameAgentLink: handlers.handleGameAgentLink,
      handleGameAgentHeartbeat: handlers.handleGameAgentHeartbeat,
      handleGameAgentDisconnect: handlers.handleGameAgentDisconnect,
    },
  });
  if (gameAgentHandled) return true;

  const ownerHandled = await handleOwnerRoutes({
    method,
    pathname,
    req,
    res,
    url,
    handlers: {
      handleOwnerOverview: handlers.handleOwnerOverview,
      handleOwnerMonitors: handlers.handleOwnerMonitors,
      handleOwnerSecurity: handlers.handleOwnerSecurity,
      handleOwnerDbStorage: handlers.handleOwnerDbStorage,
      handleOwnerEmailTest: handlers.handleOwnerEmailTest,
    },
  });
  if (ownerHandled) return true;

  const monitorApiHandled = await handleMonitorApiRoutes({
    method,
    pathname,
    req,
    res,
    url,
    handlers: {
      handleCreateMonitor: handlers.handleCreateMonitor,
      handleIncidentHide: handlers.handleIncidentHide,
      handleGameMonitorMinecraftStatus: handlers.handleGameMonitorMinecraftStatus,
      handleMonitorFavicon: handlers.handleMonitorFavicon,
      handleMonitorHttpAssertionsGet: handlers.handleMonitorHttpAssertionsGet,
      handleMonitorHttpAssertionsUpdate: handlers.handleMonitorHttpAssertionsUpdate,
      handleMonitorIntervalUpdate: handlers.handleMonitorIntervalUpdate,
      handleMonitorEmailNotificationUpdate: handlers.handleMonitorEmailNotificationUpdate,
      handleMonitorSloGet: handlers.handleMonitorSloGet,
      handleMonitorSloUpdate: handlers.handleMonitorSloUpdate,
      handleMonitorMaintenancesList: handlers.handleMonitorMaintenancesList,
      handleMonitorMaintenanceCreate: handlers.handleMonitorMaintenanceCreate,
      handleMonitorMaintenanceCancel: handlers.handleMonitorMaintenanceCancel,
      handleDeleteMonitor: handlers.handleDeleteMonitor,
    },
    utilities: {
      requireAuth: utilities.requireAuth,
      listProbesForUser: utilities.listProbesForUser,
      parseMonitorLocationParam: utilities.parseMonitorLocationParam,
      listMonitorsForUserAtProbe: utilities.listMonitorsForUserAtProbe,
      listMonitorsForUser: utilities.listMonitorsForUser,
      hasMonitorCreateRequestHeader: utilities.hasMonitorCreateRequestHeader,
      isValidOrigin: utilities.isValidOrigin,
      getIncidentsForUser: utilities.getIncidentsForUser,
      getHiddenIncidentsForUser: utilities.getHiddenIncidentsForUser,
      getMonitorByIdForUser: utilities.getMonitorByIdForUser,
      getMetricsForMonitorAtLocation: utilities.getMetricsForMonitorAtLocation,
      serializeMonitorRow: utilities.serializeMonitorRow,
      getMetricsForMonitor: utilities.getMetricsForMonitor,
      sendJson: utilities.sendJson,
    },
    constants: {
      MONITOR_CREATE_GET_ENABLED: constants.MONITOR_CREATE_GET_ENABLED,
      INCIDENT_LOOKBACK_DAYS: constants.INCIDENT_LOOKBACK_DAYS,
    },
  });
  if (monitorApiHandled) return true;

  const statusHandled = await handleStatusRoutes({
    method,
    pathname,
    req,
    res,
    url,
    utilities: {
      getPublicMonitorByIdentifier: utilities.getPublicMonitorByIdentifier,
      requireAuth: utilities.requireAuth,
      getLatestMonitorForUser: utilities.getLatestMonitorForUser,
      getDefaultPublicMonitor: utilities.getDefaultPublicMonitor,
      getLatestPublicMonitor: utilities.getLatestPublicMonitor,
      getMetricsForMonitor: utilities.getMetricsForMonitor,
      toPublicMonitorId: utilities.toPublicMonitorId,
      isAllowedPublicStatusIdentifier: utilities.isAllowedPublicStatusIdentifier,
      sendRedirect: utilities.sendRedirect,
      serveStaticFile: utilities.serveStaticFile,
      sendJson: utilities.sendJson,
    },
    constants: {
      PUBLIC_STATUS_ALLOW_NUMERIC_ID: constants.PUBLIC_STATUS_ALLOW_NUMERIC_ID,
    },
  });
  if (statusHandled) return true;

  const webHandled = await handleWebRoutes({
    method,
    pathname,
    req,
    res,
    utilities: {
      requireAuth: utilities.requireAuth,
      requireOwner: utilities.requireOwner,
      sendRedirect: utilities.sendRedirect,
      serveStaticFile: utilities.serveStaticFile,
      sendJson: utilities.sendJson,
    },
  });
  if (webHandled) return true;

  return false;
}

module.exports = {
  handleDispatchedRoutes,
};
