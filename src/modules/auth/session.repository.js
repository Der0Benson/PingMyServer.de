function createSessionRepository(dependencies = {}) {
  const { pool, crypto, hashSessionToken, sessionTtlMs } = dependencies;

  async function cleanupExpiredSessions() {
    await pool.query("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()");
  }

  async function createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + sessionTtlMs);
    await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [sessionId, userId, expiresAt]);
    return token;
  }

  async function findSessionByHash(sessionId) {
    const [rows] = await pool.query("SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (!rows.length) return null;
    return rows[0];
  }

  async function findUserById(userId) {
    const [rows] = await pool.query("SELECT id, email, created_at FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!rows.length) return null;
    return rows[0];
  }

  async function findUserByEmail(email) {
    const [rows] = await pool.query(
      `
        SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  return {
    cleanupExpiredSessions,
    createSession,
    findSessionByHash,
    findUserById,
    findUserByEmail,
  };
}

module.exports = {
  createSessionRepository,
};
