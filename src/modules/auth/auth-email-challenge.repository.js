function createAuthEmailChallengeRepository(dependencies = {}) {
  const { pool, hashSessionToken, normalizeEmail, toTimestampMs } = dependencies;

  function serializeAuthEmailChallengeRow(row) {
    if (!row || typeof row !== "object") return null;
    return {
      id: Number(row.id || 0),
      tokenHash: String(row.token_hash || "").trim(),
      userId: Number(row.user_id || 0),
      email: normalizeEmail(row.email),
      purpose: String(row.purpose || "").trim().toLowerCase(),
      codeHash: String(row.code_hash || "").trim(),
      codeLast4: String(row.code_last4 || "").trim(),
      attempts: Number(row.attempts || 0),
      maxAttempts: Number(row.max_attempts || 0),
      sendCount: Number(row.send_count || 0),
      lastSentAtMs: toTimestampMs(row.last_sent_at),
      expiresAtMs: toTimestampMs(row.expires_at),
      consumedAtMs: toTimestampMs(row.consumed_at),
    };
  }

  async function cleanupExpiredAuthEmailChallenges(cutoff) {
    await pool.query(
      `
        DELETE FROM auth_email_challenges
        WHERE expires_at < UTC_TIMESTAMP(3)
           OR (consumed_at IS NOT NULL AND consumed_at < ?)
      `,
      [cutoff]
    );
  }

  async function findAuthEmailChallengeByToken(challengeToken, normalizedPurpose) {
    const token = String(challengeToken || "").trim().toLowerCase();
    const purpose = String(normalizedPurpose || "").trim().toLowerCase();
    if (!token || !purpose || !/^[a-f0-9]{64}$/.test(token)) return null;

    const [rows] = await pool.query(
      `
        SELECT
          id,
          token_hash,
          user_id,
          email,
          purpose,
          code_hash,
          code_last4,
          attempts,
          max_attempts,
          send_count,
          last_sent_at,
          expires_at,
          consumed_at
        FROM auth_email_challenges
        WHERE token_hash = ? AND purpose = ?
        LIMIT 1
      `,
      [hashSessionToken(token), purpose]
    );

    return rows.length ? serializeAuthEmailChallengeRow(rows[0]) : null;
  }

  async function countRecentAuthEmailChallengesForUser(userId, normalizedPurpose, lookback) {
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) return 0;
    const purpose = String(normalizedPurpose || "").trim().toLowerCase();
    if (!purpose) return 0;

    const [rows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM auth_email_challenges
        WHERE user_id = ?
          AND purpose = ?
          AND created_at >= ?
      `,
      [numericUserId, purpose, lookback]
    );
    return Number(rows?.[0]?.total || 0);
  }

  async function insertAuthEmailChallenge(payload = {}) {
    const challengeToken = String(payload.challengeToken || "").trim().toLowerCase();
    const numericUserId = Number(payload.userId);
    const email = normalizeEmail(payload.email);
    const purpose = String(payload.purpose || "").trim().toLowerCase();
    const codeHash = String(payload.codeHash || "").trim();
    const codeLast4 = String(payload.codeLast4 || "").trim();
    const maxAttempts = Number(payload.maxAttempts || 0);
    const lastSentAt = payload.lastSentAt instanceof Date ? payload.lastSentAt : null;
    const expiresAt = payload.expiresAt instanceof Date ? payload.expiresAt : null;

    if (!challengeToken || !/^[a-f0-9]{64}$/.test(challengeToken)) return false;
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) return false;
    if (!email || !purpose || !codeHash || !codeLast4) return false;
    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0 || !(lastSentAt instanceof Date) || !(expiresAt instanceof Date)) {
      return false;
    }

    await pool.query(
      `
        INSERT INTO auth_email_challenges (
          token_hash,
          user_id,
          email,
          purpose,
          code_hash,
          code_last4,
          attempts,
          max_attempts,
          send_count,
          last_sent_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)
      `,
      [hashSessionToken(challengeToken), numericUserId, email, purpose, codeHash, codeLast4, maxAttempts, lastSentAt, expiresAt]
    );
    return true;
  }

  async function deleteAuthEmailChallengeByToken(challengeToken, normalizedPurpose) {
    const token = String(challengeToken || "").trim().toLowerCase();
    const purpose = String(normalizedPurpose || "").trim().toLowerCase();
    if (!token || !purpose || !/^[a-f0-9]{64}$/.test(token)) return 0;
    const [result] = await pool.query("DELETE FROM auth_email_challenges WHERE token_hash = ? AND purpose = ?", [
      hashSessionToken(token),
      purpose,
    ]);
    return Number(result?.affectedRows || 0);
  }

  async function updateAuthEmailChallengeForResend(payload = {}) {
    const challengeId = Number(payload.challengeId || 0);
    const codeHash = String(payload.codeHash || "").trim();
    const codeLast4 = String(payload.codeLast4 || "").trim();
    const nextExpiresAt = payload.nextExpiresAt instanceof Date ? payload.nextExpiresAt : null;
    const maxSends = Number(payload.maxSends || 0);
    if (!Number.isInteger(challengeId) || challengeId <= 0) return 0;
    if (!codeHash || !codeLast4 || !(nextExpiresAt instanceof Date)) return 0;
    if (!Number.isInteger(maxSends) || maxSends <= 0) return 0;

    const [result] = await pool.query(
      `
        UPDATE auth_email_challenges
        SET
          code_hash = ?,
          code_last4 = ?,
          send_count = send_count + 1,
          last_sent_at = UTC_TIMESTAMP(3),
          expires_at = ?,
          updated_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)
          AND send_count < ?
        LIMIT 1
      `,
      [codeHash, codeLast4, nextExpiresAt, challengeId, maxSends]
    );
    return Number(result?.affectedRows || 0);
  }

  async function incrementAuthEmailChallengeAttempts(challengeId) {
    const id = Number(challengeId || 0);
    if (!Number.isInteger(id) || id <= 0) return 0;
    const [result] = await pool.query(
      `
        UPDATE auth_email_challenges
        SET attempts = attempts + 1
        WHERE id = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)
          AND attempts < max_attempts
        LIMIT 1
      `,
      [id]
    );
    return Number(result?.affectedRows || 0);
  }

  async function consumeAuthEmailChallenge(challengeId) {
    const id = Number(challengeId || 0);
    if (!Number.isInteger(id) || id <= 0) return 0;
    const [result] = await pool.query(
      `
        UPDATE auth_email_challenges
        SET consumed_at = UTC_TIMESTAMP(3)
        WHERE id = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)
          AND attempts < max_attempts
        LIMIT 1
      `,
      [id]
    );
    return Number(result?.affectedRows || 0);
  }

  return {
    cleanupExpiredAuthEmailChallenges,
    findAuthEmailChallengeByToken,
    countRecentAuthEmailChallengesForUser,
    insertAuthEmailChallenge,
    deleteAuthEmailChallengeByToken,
    updateAuthEmailChallengeForResend,
    incrementAuthEmailChallengeAttempts,
    consumeAuthEmailChallenge,
  };
}

module.exports = {
  createAuthEmailChallengeRepository,
};
