function createAuthFailureRepository(dependencies = {}) {
  const { pool, authLockMaxFails, authLockDurationMs } = dependencies;

  async function getAuthFailure(email) {
    const [rows] = await pool.query("SELECT email, fails, last_fail, locked_until FROM auth_failures WHERE email = ? LIMIT 1", [email]);
    if (!rows.length) return null;
    return rows[0];
  }

  function isAccountLocked(failure) {
    if (!failure || !failure.locked_until) return false;
    const lockedUntilMs = new Date(failure.locked_until).getTime();
    return Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now();
  }

  async function registerAuthFailure(email, failure) {
    const nextFails = (failure?.fails || 0) + 1;
    const nextLockedUntil = nextFails >= authLockMaxFails ? new Date(Date.now() + authLockDurationMs) : null;

    await pool.query(
      `
        INSERT INTO auth_failures (email, fails, last_fail, locked_until)
        VALUES (?, ?, UTC_TIMESTAMP(), ?)
        ON DUPLICATE KEY UPDATE
          fails = VALUES(fails),
          last_fail = VALUES(last_fail),
          locked_until = VALUES(locked_until)
      `,
      [email, nextFails, nextLockedUntil]
    );

    return { fails: nextFails, lockedUntil: nextLockedUntil };
  }

  async function clearAuthFailures(email) {
    await pool.query("DELETE FROM auth_failures WHERE email = ?", [email]);
  }

  return {
    getAuthFailure,
    isAccountLocked,
    registerAuthFailure,
    clearAuthFailures,
  };
}

module.exports = {
  createAuthFailureRepository,
};
