function createOauthRepository(dependencies = {}) {
  const { pool, crypto, bcrypt, bcryptCost, hashPassword } = dependencies;

  const hashPasswordValue =
    typeof hashPassword === "function"
      ? (password) => hashPassword(password)
      : (password) => bcrypt.hash(password, bcryptCost);

  async function findUserByGithubId(githubId) {
    const [rows] = await pool.query(
      `
        SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
        FROM users
        WHERE github_id = ?
        LIMIT 1
      `,
      [githubId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function findUserByGoogleSub(googleSub) {
    const [rows] = await pool.query(
      `
        SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
        FROM users
        WHERE google_sub = ?
        LIMIT 1
      `,
      [googleSub]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function linkGithubToUser(userId, githubId, githubLogin) {
    await pool.query("UPDATE users SET github_id = ?, github_login = ? WHERE id = ? LIMIT 1", [githubId, githubLogin, userId]);
  }

  async function createUserFromGithub(email, githubId, githubLogin) {
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const passwordHash = await hashPasswordValue(randomPassword);
    const [result] = await pool.query("INSERT INTO users (email, password_hash, github_id, github_login) VALUES (?, ?, ?, ?)", [
      email,
      passwordHash,
      githubId,
      githubLogin,
    ]);
    return Number(result.insertId);
  }

  async function linkGoogleToUser(userId, googleSub, googleEmail) {
    await pool.query("UPDATE users SET google_sub = ?, google_email = ? WHERE id = ? LIMIT 1", [googleSub, googleEmail, userId]);
  }

  async function createUserFromGoogle(email, googleSub, googleEmail) {
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const passwordHash = await hashPasswordValue(randomPassword);
    const [result] = await pool.query("INSERT INTO users (email, password_hash, google_sub, google_email) VALUES (?, ?, ?, ?)", [
      email,
      passwordHash,
      googleSub,
      googleEmail,
    ]);
    return Number(result.insertId);
  }

  async function findUserByDiscordId(discordId) {
    const [rows] = await pool.query(
      `
        SELECT id, email, password_hash, github_id, github_login, google_sub, google_email, discord_id, discord_username, discord_email, created_at
        FROM users
        WHERE discord_id = ?
        LIMIT 1
      `,
      [discordId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async function linkDiscordToUser(userId, discordId, discordUsername, discordEmail) {
    await pool.query("UPDATE users SET discord_id = ?, discord_username = ?, discord_email = ? WHERE id = ? LIMIT 1", [
      discordId,
      discordUsername,
      discordEmail,
      userId,
    ]);
  }

  async function createUserFromDiscord(email, discordId, discordUsername, discordEmail) {
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const passwordHash = await hashPasswordValue(randomPassword);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, discord_id, discord_username, discord_email) VALUES (?, ?, ?, ?, ?)",
      [email, passwordHash, discordId, discordUsername, discordEmail]
    );
    return Number(result.insertId);
  }

  return {
    findUserByGithubId,
    findUserByGoogleSub,
    linkGithubToUser,
    createUserFromGithub,
    linkGoogleToUser,
    createUserFromGoogle,
    findUserByDiscordId,
    linkDiscordToUser,
    createUserFromDiscord,
  };
}

module.exports = {
  createOauthRepository,
};
