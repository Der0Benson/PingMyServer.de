function createAuthEmailChallengeService(dependencies = {}) {
  const {
    authEmailChallengeRepository,
    crypto,
    normalizeEmail,
    isValidEmail,
    createAuthEmailVerificationCode,
    hashAuthEmailVerificationCode,
    buildAuthLoginVerificationEmail,
    sendOwnerSmtpTestEmail,
    maskNotificationEmailAddress,
    authEmailVerificationPurposeLogin,
    authEmailVerificationChallengeRetentionMs,
    authEmailVerificationCodeTtlSeconds,
    authEmailVerificationResendIntervalSeconds,
    authEmailVerificationCodeLength,
    authEmailVerificationMaxAttempts,
    authEmailVerificationMaxSends,
    authEmailVerificationMaxRequestsPerHour,
  } = dependencies;

  async function cleanupExpiredAuthEmailChallenges() {
    const retentionMs = Math.max(Number(authEmailVerificationChallengeRetentionMs || 0), 60 * 1000);
    const cutoff = new Date(Date.now() - retentionMs);
    await authEmailChallengeRepository.cleanupExpiredAuthEmailChallenges(cutoff);
  }

  async function findAuthEmailChallengeByToken(token, purpose = authEmailVerificationPurposeLogin) {
    const normalizedPurpose = String(purpose || authEmailVerificationPurposeLogin)
      .trim()
      .toLowerCase();
    const challengeToken = String(token || "")
      .trim()
      .toLowerCase();
    return authEmailChallengeRepository.findAuthEmailChallengeByToken(challengeToken, normalizedPurpose);
  }

  async function countRecentAuthEmailChallengesForUser(userId, purpose = authEmailVerificationPurposeLogin) {
    const normalizedPurpose = String(purpose || authEmailVerificationPurposeLogin)
      .trim()
      .toLowerCase();
    const lookback = new Date(Date.now() - 60 * 60 * 1000);
    return authEmailChallengeRepository.countRecentAuthEmailChallengesForUser(userId, normalizedPurpose, lookback);
  }

  function buildAuthVerificationChallengeResponse(challenge) {
    const expiresAtMs = Number(challenge?.expiresAtMs || 0);
    const now = Date.now();
    const expiresInSeconds = Number.isFinite(expiresAtMs)
      ? Math.max(1, Math.ceil((expiresAtMs - now) / 1000))
      : Number(authEmailVerificationCodeTtlSeconds || 0);
    return {
      verifyRequired: true,
      challengeToken: challenge?.token || "",
      emailMasked: maskNotificationEmailAddress(challenge?.email) || challenge?.email || "",
      expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs : now + Number(authEmailVerificationCodeTtlSeconds || 0) * 1000,
      expiresInSeconds,
      resendAfterSeconds: Number(authEmailVerificationResendIntervalSeconds || 0),
      codeLength: Number(authEmailVerificationCodeLength || 0),
    };
  }

  async function createAuthEmailChallenge({ userId, email, purpose = authEmailVerificationPurposeLogin }) {
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      const error = new Error("invalid_user_id");
      error.code = "invalid_user_id";
      throw error;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      const error = new Error("invalid_email");
      error.code = "invalid_email";
      throw error;
    }

    const normalizedPurpose = String(purpose || authEmailVerificationPurposeLogin)
      .trim()
      .toLowerCase();
    const recentCount = await countRecentAuthEmailChallengesForUser(numericUserId, normalizedPurpose);
    if (recentCount >= Number(authEmailVerificationMaxRequestsPerHour || 0)) {
      const error = new Error("too_many_challenges");
      error.code = "too_many_challenges";
      throw error;
    }

    const challengeToken = crypto.randomBytes(32).toString("hex");
    const code = createAuthEmailVerificationCode();
    const codeHash = hashAuthEmailVerificationCode(challengeToken, code);
    const now = new Date();
    const expiresAt = new Date(Date.now() + Number(authEmailVerificationCodeTtlSeconds || 0) * 1000);

    await authEmailChallengeRepository.insertAuthEmailChallenge({
      challengeToken,
      userId: numericUserId,
      email: normalizedEmail,
      purpose: normalizedPurpose,
      codeHash,
      codeLast4: code.slice(-4),
      maxAttempts: Number(authEmailVerificationMaxAttempts || 0),
      lastSentAt: now,
      expiresAt,
    });

    return {
      token: challengeToken,
      userId: numericUserId,
      email: normalizedEmail,
      purpose: normalizedPurpose,
      code,
      expiresAtMs: expiresAt.getTime(),
    };
  }

  async function deleteAuthEmailChallengeByToken(token, purpose = authEmailVerificationPurposeLogin) {
    const normalizedPurpose = String(purpose || authEmailVerificationPurposeLogin)
      .trim()
      .toLowerCase();
    const challengeToken = String(token || "")
      .trim()
      .toLowerCase();
    await authEmailChallengeRepository.deleteAuthEmailChallengeByToken(challengeToken, normalizedPurpose);
  }

  async function resendAuthEmailChallenge(challenge, challengeToken) {
    const challengeId = Number(challenge?.id || 0);
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      const error = new Error("invalid_challenge");
      error.code = "invalid_challenge";
      throw error;
    }

    const now = Date.now();
    const expiresAtMs = Number(challenge?.expiresAtMs || 0);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      const error = new Error("challenge_expired");
      error.code = "challenge_expired";
      throw error;
    }
    if (Number(challenge?.consumedAtMs || 0) > 0) {
      const error = new Error("challenge_consumed");
      error.code = "challenge_consumed";
      throw error;
    }
    if (Number(challenge?.sendCount || 0) >= Number(authEmailVerificationMaxSends || 0)) {
      const error = new Error("challenge_send_limit");
      error.code = "challenge_send_limit";
      throw error;
    }

    const lastSentAtMs = Number(challenge?.lastSentAtMs || 0);
    const resendDelayMs = Number(authEmailVerificationResendIntervalSeconds || 0) * 1000;
    if (Number.isFinite(lastSentAtMs) && lastSentAtMs > 0 && now - lastSentAtMs < resendDelayMs) {
      const retryAfter = Math.max(1, Math.ceil((resendDelayMs - (now - lastSentAtMs)) / 1000));
      const error = new Error("challenge_resend_wait");
      error.code = "challenge_resend_wait";
      error.retryAfterSeconds = retryAfter;
      throw error;
    }

    const code = createAuthEmailVerificationCode();
    const codeHash = hashAuthEmailVerificationCode(challengeToken, code);
    const nextExpiresAt = new Date(Date.now() + Number(authEmailVerificationCodeTtlSeconds || 0) * 1000);
    const affectedRows = await authEmailChallengeRepository.updateAuthEmailChallengeForResend({
      challengeId,
      codeHash,
      codeLast4: code.slice(-4),
      nextExpiresAt,
      maxSends: Number(authEmailVerificationMaxSends || 0),
    });
    if (affectedRows !== 1) {
      const error = new Error("challenge_update_conflict");
      error.code = "challenge_update_conflict";
      throw error;
    }

    return {
      ...challenge,
      code,
      expiresAtMs: nextExpiresAt.getTime(),
      sendCount: Number(challenge.sendCount || 0) + 1,
    };
  }

  async function sendAuthEmailChallenge(challenge, user) {
    const emailPayload = buildAuthLoginVerificationEmail({
      ownerEmail: String(user?.email || challenge?.email || "").trim(),
      code: challenge?.code,
      expiresAt: Number.isFinite(Number(challenge?.expiresAtMs)) ? new Date(Number(challenge.expiresAtMs)) : null,
    });

    await sendOwnerSmtpTestEmail({
      to: String(challenge?.email || "").trim(),
      subject: emailPayload.subject,
      textBody: emailPayload.textBody,
      htmlBody: emailPayload.htmlBody,
      extraHeaders: {
        "X-PMS-Notification-Type": "auth_email_verification",
      },
    });
  }

  return {
    cleanupExpiredAuthEmailChallenges,
    findAuthEmailChallengeByToken,
    countRecentAuthEmailChallengesForUser,
    buildAuthVerificationChallengeResponse,
    createAuthEmailChallenge,
    deleteAuthEmailChallengeByToken,
    resendAuthEmailChallenge,
    sendAuthEmailChallenge,
  };
}

module.exports = {
  createAuthEmailChallengeService,
};
