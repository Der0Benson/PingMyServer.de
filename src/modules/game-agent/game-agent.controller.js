function createGameAgentController(dependencies = {}) {
  const {
    requireAuth,
    normalizeMinecraftHost,
    normalizeMinecraftPort,
    minecraftDefaultPort,
    sendJson,
    validateMonitorTarget,
    queryMinecraftServer,
    minecraftQueryTimeoutMs,
    normalizeMinecraftTps,
    normalizeMinecraftPlayerSample,
    extractMinecraftMotdText,
    normalizeMinecraftProbeError,
    pool,
    normalizeGameAgentGame,
    gameAgentDefaultGame,
    serializeGameAgentPairingRow,
    gameAgentPairingTtlMs,
    createGameAgentPairingCode,
    serializeGameAgentSessionRow,
    hashSessionToken,
    readJsonBody,
    gameAgentPayloadMaxBytes,
    isValidGameAgentPublicId,
    normalizeGameAgentPairingCode,
    normalizeGameAgentInstanceId,
    getClientIp,
    normalizeGameAgentServerName,
    normalizeGameAgentServerHost,
    normalizeGameAgentVersion,
    normalizeGameAgentPayload,
    crypto,
    parseGameAgentJsonColumn,
    mergeGameAgentPayload,
    generateUniqueGameAgentPublicId,
    gameAgentHeartbeatIntervalMs,
    gameAgentHeartbeatStaleMs,
    readGameAgentTokenFromRequest,
    toTimestampMs,
    logger,
  } = dependencies;

  const logError = (event, error) => {
    if (logger && typeof logger.error === "function") {
      logger.error(event, error);
      return;
    }
    console.error(event, error);
  };

  async function handleGameMonitorMinecraftStatus(req, res, url) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const host = normalizeMinecraftHost(url.searchParams.get("host"));
    const port = normalizeMinecraftPort(url.searchParams.get("port"), minecraftDefaultPort);

    if (!host || !Number.isInteger(port)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const targetValidation = await validateMonitorTarget(`https://${host}:${port}`, { useCache: true });
    if (!targetValidation.allowed) {
      sendJson(res, 400, { ok: false, error: "target blocked" });
      return;
    }

    try {
      const result = await queryMinecraftServer(host, port, minecraftQueryTimeoutMs);
      const status = result?.status && typeof result.status === "object" ? result.status : {};
      const players = status?.players && typeof status.players === "object" ? status.players : {};
      const version = status?.version && typeof status.version === "object" ? status.version : {};
      const onlinePlayers = Number(players.online);
      const maxPlayers = Number(players.max);
      const protocol = Number(version.protocol);

      sendJson(res, 200, {
        ok: true,
        data: {
          game: "minecraft",
          host,
          port,
          online: true,
          pingMs: Number.isFinite(result?.pingMs) ? Math.round(Number(result.pingMs)) : null,
          tps: normalizeMinecraftTps(status?.tps ?? status?.performance?.tps ?? null),
          players: {
            online: Number.isFinite(onlinePlayers) ? onlinePlayers : null,
            max: Number.isFinite(maxPlayers) ? maxPlayers : null,
            sample: normalizeMinecraftPlayerSample(players.sample),
          },
          version: String(version.name || "").trim() || null,
          protocol: Number.isFinite(protocol) ? protocol : null,
          motd: extractMinecraftMotdText(status.description),
          icon: typeof status.favicon === "string" ? status.favicon : null,
          secureChatRequired: status.enforcesSecureChat === true,
          checkedAt: Date.now(),
          errorCode: "",
        },
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: true,
        data: {
          game: "minecraft",
          host,
          port,
          online: false,
          pingMs: null,
          tps: null,
          players: {
            online: null,
            max: null,
            sample: [],
          },
          version: null,
          protocol: null,
          motd: null,
          icon: null,
          secureChatRequired: false,
          checkedAt: Date.now(),
          errorCode: normalizeMinecraftProbeError(error),
        },
      });
    }
  }

  async function cleanupGameAgentPairings() {
    await pool.query(
      "DELETE FROM game_agent_pairings WHERE expires_at < UTC_TIMESTAMP(3) OR (used_at IS NOT NULL AND used_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY))"
    );
  }

  async function listGameAgentPairingsForUser(userId, game = gameAgentDefaultGame) {
    const normalizedGame = normalizeGameAgentGame(game);
    if (!normalizedGame) return [];

    const [rows] = await pool.query(
      `
        SELECT id, user_id, game, code, expires_at, used_at, created_at
        FROM game_agent_pairings
        WHERE user_id = ?
          AND game = ?
          AND used_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [userId, normalizedGame]
    );
    return rows.map((row) => serializeGameAgentPairingRow(row)).filter(Boolean);
  }

  async function createGameAgentPairingForUser(userId, game = gameAgentDefaultGame) {
    const normalizedGame = normalizeGameAgentGame(game);
    if (!normalizedGame) {
      const error = new Error("invalid_game");
      error.statusCode = 400;
      throw error;
    }

    await cleanupGameAgentPairings();
    await pool.query(
      `
        DELETE FROM game_agent_pairings
        WHERE user_id = ?
          AND game = ?
          AND used_at IS NULL
      `,
      [userId, normalizedGame]
    );

    const expiresAt = new Date(Date.now() + gameAgentPairingTtlMs);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = createGameAgentPairingCode();
      try {
        const [result] = await pool.query(
          `
            INSERT INTO game_agent_pairings (user_id, game, code, expires_at)
            VALUES (?, ?, ?, ?)
          `,
          [userId, normalizedGame, code, expiresAt]
        );

        const [rows] = await pool.query(
          `
            SELECT id, user_id, game, code, expires_at, used_at, created_at
            FROM game_agent_pairings
            WHERE id = ?
            LIMIT 1
          `,
          [result.insertId]
        );
        return serializeGameAgentPairingRow(rows[0]);
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") continue;
        throw error;
      }
    }

    throw new Error("pairing_code_generation_failed");
  }

  async function listGameAgentSessionsForUser(userId, game = gameAgentDefaultGame) {
    const normalizedGame = normalizeGameAgentGame(game);
    if (!normalizedGame) return [];

    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          game,
          instance_id,
          server_name,
          server_host,
          mod_version,
          game_version,
          connected_at,
          last_heartbeat_at,
          disconnected_at,
          revoked_at,
          last_ip,
          last_payload,
          created_at,
          updated_at
        FROM game_agent_sessions
        WHERE user_id = ?
          AND game = ?
        ORDER BY COALESCE(last_heartbeat_at, connected_at, created_at) DESC, id DESC
        LIMIT 200
      `,
      [userId, normalizedGame]
    );

    const now = Date.now();
    return rows.map((row) => serializeGameAgentSessionRow(row, now)).filter(Boolean);
  }

  async function findGameAgentSessionByToken(token) {
    const normalizedToken = String(token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedToken)) return null;

    const tokenHash = hashSessionToken(normalizedToken);
    const [rows] = await pool.query(
      `
        SELECT
          id,
          public_id,
          user_id,
          game,
          instance_id,
          server_name,
          server_host,
          mod_version,
          game_version,
          connected_at,
          last_heartbeat_at,
          disconnected_at,
          revoked_at,
          last_ip,
          last_payload,
          created_at,
          updated_at
        FROM game_agent_sessions
        WHERE token_hash = ?
        LIMIT 1
      `,
      [tokenHash]
    );

    return rows[0] || null;
  }

  async function handleGameAgentPairingCreate(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return;

    let body = {};
    try {
      body = await readJsonBody(req, gameAgentPayloadMaxBytes);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 400);
      sendJson(res, statusCode, { ok: false, error: statusCode === 413 ? "payload too large" : "invalid input" });
      return;
    }

    const game = normalizeGameAgentGame(body?.game);
    if (!game) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      const pairing = await createGameAgentPairingForUser(user.id, game);
      if (!pairing) {
        sendJson(res, 500, { ok: false, error: "internal error" });
        return;
      }

      sendJson(res, 201, {
        ok: true,
        data: {
          ...pairing,
          ttlMs: gameAgentPairingTtlMs,
        },
      });
    } catch (error) {
      if (error?.statusCode === 400) {
        sendJson(res, 400, { ok: false, error: "invalid input" });
        return;
      }
      logError("game_agent_pairing_create_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentPairingsList(req, res, url) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const game = normalizeGameAgentGame(url.searchParams.get("game"));
    if (!game) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      await cleanupGameAgentPairings();
      const pairings = await listGameAgentPairingsForUser(user.id, game);
      sendJson(res, 200, { ok: true, data: pairings });
    } catch (error) {
      logError("game_agent_pairing_list_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentSessionsList(req, res, url) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const game = normalizeGameAgentGame(url.searchParams.get("game"));
    if (!game) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      const sessions = await listGameAgentSessionsForUser(user.id, game);
      sendJson(res, 200, {
        ok: true,
        data: {
          game,
          heartbeatStaleMs: gameAgentHeartbeatStaleMs,
          sessions,
        },
      });
    } catch (error) {
      logError("game_agent_sessions_list_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentSessionRevoke(req, res, publicId) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const normalizedPublicId = String(publicId || "").trim();
    if (!isValidGameAgentPublicId(normalizedPublicId)) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    try {
      const [result] = await pool.query(
        `
          UPDATE game_agent_sessions
          SET revoked_at = UTC_TIMESTAMP(3), disconnected_at = UTC_TIMESTAMP(3)
          WHERE user_id = ?
            AND public_id = ?
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [user.id, normalizedPublicId]
      );

      if (!Number(result?.affectedRows || 0)) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      logError("game_agent_session_revoke_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentLink(req, res) {
    let body = {};
    try {
      body = await readJsonBody(req, gameAgentPayloadMaxBytes);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 400);
      sendJson(res, statusCode, { ok: false, error: statusCode === 413 ? "payload too large" : "invalid input" });
      return;
    }

    const pairingCode = normalizeGameAgentPairingCode(body?.pairingCode || body?.code);
    const instanceId = normalizeGameAgentInstanceId(body?.instanceId || body?.instance_id);
    const requestedGame = normalizeGameAgentGame(body?.game || gameAgentDefaultGame);
    if (!pairingCode || !instanceId || !requestedGame) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const clientIp = getClientIp(req);
    let connection = null;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [pairingRows] = await connection.query(
        `
          SELECT id, user_id, game, code, expires_at, used_at
          FROM game_agent_pairings
          WHERE code = ?
            AND used_at IS NULL
            AND expires_at > UTC_TIMESTAMP(3)
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [pairingCode]
      );

      if (!pairingRows.length) {
        await connection.rollback();
        connection.release();
        connection = null;
        sendJson(res, 400, { ok: false, error: "invalid pairing code" });
        return;
      }

      const pairing = pairingRows[0];
      const game = normalizeGameAgentGame(pairing.game);
      if (!game || game !== requestedGame) {
        await connection.rollback();
        connection.release();
        connection = null;
        sendJson(res, 400, { ok: false, error: "invalid pairing code" });
        return;
      }

      const serverName = normalizeGameAgentServerName(body?.serverName || body?.server_name);
      const serverHost = normalizeGameAgentServerHost(body?.serverHost || body?.server_host);
      const modVersion = normalizeGameAgentVersion(body?.modVersion || body?.mod_version);
      const gameVersion = normalizeGameAgentVersion(body?.gameVersion || body?.game_version);
      const incomingPayload = normalizeGameAgentPayload(body);
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashSessionToken(token);
      const tokenLast4 = token.slice(-4);

      const [existingRows] = await connection.query(
        `
          SELECT
            id,
            public_id,
            user_id,
            game,
            instance_id,
            server_name,
            server_host,
            mod_version,
            game_version,
            connected_at,
            last_heartbeat_at,
            disconnected_at,
            revoked_at,
            last_ip,
            last_payload,
            created_at,
            updated_at
          FROM game_agent_sessions
          WHERE user_id = ?
            AND game = ?
            AND instance_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [pairing.user_id, game, instanceId]
      );

      let sessionId = null;
      if (existingRows.length) {
        const existing = existingRows[0];
        const mergedPayload = mergeGameAgentPayload(parseGameAgentJsonColumn(existing.last_payload), incomingPayload);
        await connection.query(
          `
            UPDATE game_agent_sessions
            SET
              server_name = ?,
              server_host = ?,
              mod_version = ?,
              game_version = ?,
              token_hash = ?,
              token_last4 = ?,
              connected_at = UTC_TIMESTAMP(3),
              last_heartbeat_at = UTC_TIMESTAMP(3),
              disconnected_at = NULL,
              revoked_at = NULL,
              last_ip = ?,
              last_payload = ?
            WHERE id = ?
            LIMIT 1
          `,
          [
            serverName || existing.server_name || null,
            serverHost || existing.server_host || null,
            modVersion || existing.mod_version || null,
            gameVersion || existing.game_version || null,
            tokenHash,
            tokenLast4,
            clientIp || null,
            JSON.stringify(mergedPayload),
            existing.id,
          ]
        );
        sessionId = Number(existing.id);
      } else {
        const publicId = await generateUniqueGameAgentPublicId(connection);
        const [insertResult] = await connection.query(
          `
            INSERT INTO game_agent_sessions (
              public_id,
              user_id,
              game,
              instance_id,
              server_name,
              server_host,
              mod_version,
              game_version,
              token_hash,
              token_last4,
              connected_at,
              last_heartbeat_at,
              last_ip,
              last_payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?, ?)
          `,
          [
            publicId,
            pairing.user_id,
            game,
            instanceId,
            serverName || null,
            serverHost || null,
            modVersion || null,
            gameVersion || null,
            tokenHash,
            tokenLast4,
            clientIp || null,
            JSON.stringify(incomingPayload),
          ]
        );
        sessionId = Number(insertResult.insertId);
      }

      await connection.query(
        `
          UPDATE game_agent_pairings
          SET used_at = UTC_TIMESTAMP(3)
          WHERE id = ?
            AND used_at IS NULL
          LIMIT 1
        `,
        [pairing.id]
      );

      const [sessionRows] = await connection.query(
        `
          SELECT
            id,
            public_id,
            user_id,
            game,
            instance_id,
            server_name,
            server_host,
            mod_version,
            game_version,
            connected_at,
            last_heartbeat_at,
            disconnected_at,
            revoked_at,
            last_ip,
            last_payload,
            created_at,
            updated_at
          FROM game_agent_sessions
          WHERE id = ?
          LIMIT 1
        `,
        [sessionId]
      );

      await connection.commit();
      connection.release();
      connection = null;

      const session = serializeGameAgentSessionRow(sessionRows[0], Date.now());
      sendJson(res, 201, {
        ok: true,
        data: {
          session,
          token,
          heartbeatIntervalMs: gameAgentHeartbeatIntervalMs,
          heartbeatStaleMs: gameAgentHeartbeatStaleMs,
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          // ignore rollback errors
        }
        connection.release();
      }
      logError("game_agent_link_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentHeartbeat(req, res) {
    const token = readGameAgentTokenFromRequest(req);
    if (!token) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req, gameAgentPayloadMaxBytes);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 400);
      sendJson(res, statusCode, { ok: false, error: statusCode === 413 ? "payload too large" : "invalid input" });
      return;
    }

    try {
      const session = await findGameAgentSessionByToken(token);
      if (!session) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }

      if (toTimestampMs(session.revoked_at)) {
        sendJson(res, 403, { ok: false, error: "token revoked" });
        return;
      }

      const incomingPayload = normalizeGameAgentPayload(body);
      const mergedPayload = mergeGameAgentPayload(parseGameAgentJsonColumn(session.last_payload), incomingPayload);
      const serverName = normalizeGameAgentServerName(body?.serverName || body?.server_name) || session.server_name || null;
      const serverHost = normalizeGameAgentServerHost(body?.serverHost || body?.server_host) || session.server_host || null;
      const modVersion = normalizeGameAgentVersion(body?.modVersion || body?.mod_version) || session.mod_version || null;
      const gameVersion = normalizeGameAgentVersion(body?.gameVersion || body?.game_version) || session.game_version || null;
      const clientIp = getClientIp(req);

      const [updateResult] = await pool.query(
        `
          UPDATE game_agent_sessions
          SET
            server_name = ?,
            server_host = ?,
            mod_version = ?,
            game_version = ?,
            last_heartbeat_at = UTC_TIMESTAMP(3),
            disconnected_at = NULL,
            last_ip = ?,
            last_payload = ?
          WHERE id = ?
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [serverName, serverHost, modVersion, gameVersion, clientIp || null, JSON.stringify(mergedPayload), session.id]
      );
      if (!Number(updateResult?.affectedRows || 0)) {
        sendJson(res, 403, { ok: false, error: "token revoked" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: {
          heartbeatIntervalMs: gameAgentHeartbeatIntervalMs,
          heartbeatStaleMs: gameAgentHeartbeatStaleMs,
          checkedAt: Date.now(),
        },
      });
    } catch (error) {
      logError("game_agent_heartbeat_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  async function handleGameAgentDisconnect(req, res) {
    const token = readGameAgentTokenFromRequest(req);
    if (!token) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    try {
      const session = await findGameAgentSessionByToken(token);
      if (!session) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }

      if (toTimestampMs(session.revoked_at)) {
        sendJson(res, 403, { ok: false, error: "token revoked" });
        return;
      }

      const [updateResult] = await pool.query(
        `
          UPDATE game_agent_sessions
          SET disconnected_at = UTC_TIMESTAMP(3), last_heartbeat_at = UTC_TIMESTAMP(3)
          WHERE id = ?
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [session.id]
      );
      if (!Number(updateResult?.affectedRows || 0)) {
        sendJson(res, 403, { ok: false, error: "token revoked" });
        return;
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      logError("game_agent_disconnect_failed", error);
      sendJson(res, 500, { ok: false, error: "internal error" });
    }
  }

  return {
    cleanupGameAgentPairings,
    handleGameAgentPairingCreate,
    handleGameAgentPairingsList,
    handleGameAgentSessionsList,
    handleGameAgentSessionRevoke,
    handleGameAgentLink,
    handleGameAgentHeartbeat,
    handleGameAgentDisconnect,
    handleGameMonitorMinecraftStatus,
  };
}

module.exports = {
  createGameAgentController,
};
