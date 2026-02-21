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

  const GAME_AGENT_EVENT_RETENTION_DAYS = 30;
  const GAME_AGENT_TELEMETRY_STALE_DAYS = 14;
  const GAME_AGENT_EVENTS_LIST_DEFAULT = 50;
  const GAME_AGENT_EVENTS_LIST_MAX = 200;

  function normalizePositiveInteger(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const rounded = Math.trunc(numeric);
    if (!Number.isInteger(rounded)) return fallback;
    if (rounded < min || rounded > max) return fallback;
    return rounded;
  }

  function serializeGameAgentEventRow(row) {
    if (!row) return null;
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const type = String(row.event_type || "info")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 24);
    const severity = String(row.severity || "info")
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 16);
    const message = String(row.message || "").trim().slice(0, 512);
    if (!message) return null;

    const eventCodeRaw = String(row.event_code || "")
      .trim()
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 64);
    const sessionId = String(row.session_public_id || "").trim();
    const sessionName = String(row.session_server_name || row.session_server_host || row.session_instance_id || "")
      .trim()
      .slice(0, 120);

    return {
      id,
      type: type || "info",
      severity: severity || "info",
      message,
      eventCode: eventCodeRaw || null,
      happenedAt: toTimestampMs(row.happened_at),
      createdAt: toTimestampMs(row.created_at),
      session: sessionId
        ? {
            id: sessionId,
            name: sessionName || null,
          }
        : null,
    };
  }

  async function persistGameAgentTelemetrySnapshot({ queryable = pool, sessionId, userId, game, payload }) {
    const normalizedGame = normalizeGameAgentGame(game);
    const numericSessionId = Number(sessionId);
    const numericUserId = Number(userId);
    if (!normalizedGame) return;
    if (!Number.isInteger(numericSessionId) || numericSessionId <= 0) return;
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) return;

    const source = payload && typeof payload === "object" ? payload : {};
    const metrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
    const sampledAtMs = toTimestampMs(metrics.sampledAt);
    const sampledAt = Number.isFinite(sampledAtMs) && sampledAtMs > 0 ? new Date(sampledAtMs) : new Date();

    const pluginsInput = Array.isArray(source.plugins) ? source.plugins : [];
    await queryable.query("DELETE FROM game_agent_session_plugins WHERE session_id = ?", [numericSessionId]);
    const pluginRows = [];
    for (const rawPlugin of pluginsInput) {
      if (!rawPlugin || typeof rawPlugin !== "object") continue;
      const pluginName = String(rawPlugin.name || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80);
      if (!pluginName) continue;
      const pluginVersion = String(rawPlugin.version || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 64);
      const enabled = rawPlugin.enabled === false ? 0 : 1;
      pluginRows.push([numericSessionId, numericUserId, normalizedGame, pluginName, pluginVersion || null, enabled, sampledAt]);
      if (pluginRows.length >= 200) break;
    }
    if (pluginRows.length) {
      const placeholders = pluginRows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
      await queryable.query(
        `
          INSERT INTO game_agent_session_plugins (
            session_id,
            user_id,
            game,
            plugin_name,
            plugin_version,
            enabled,
            detected_at
          )
          VALUES ${placeholders}
        `,
        pluginRows.flat()
      );
    }

    const latencyInput = Array.isArray(source.regionalLatency) ? source.regionalLatency : [];
    await queryable.query("DELETE FROM game_agent_session_region_latency WHERE session_id = ?", [numericSessionId]);
    const latencyRows = [];
    for (const rawEntry of latencyInput) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const regionKey = String(rawEntry.region || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 32);
      if (!regionKey) continue;
      const pingMs = Number(rawEntry.pingMs);
      if (!Number.isFinite(pingMs) || pingMs < 0 || pingMs > 600000) continue;
      latencyRows.push([numericSessionId, numericUserId, normalizedGame, regionKey, Math.trunc(pingMs), sampledAt]);
      if (latencyRows.length >= 64) break;
    }
    if (latencyRows.length) {
      const placeholders = latencyRows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      await queryable.query(
        `
          INSERT INTO game_agent_session_region_latency (
            session_id,
            user_id,
            game,
            region_key,
            ping_ms,
            sampled_at
          )
          VALUES ${placeholders}
        `,
        latencyRows.flat()
      );
    }

    const eventsInput = Array.isArray(source.events) ? source.events : [];
    const eventRows = [];
    for (const rawEvent of eventsInput) {
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const type = String(rawEvent.type || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 24);
      const severity = String(rawEvent.severity || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, 16);
      const message = String(rawEvent.message || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 512);
      if (!type || !severity || !message) continue;
      const eventCode = String(rawEvent.eventCode || "")
        .trim()
        .replace(/[^A-Za-z0-9._-]/g, "")
        .slice(0, 64);
      const happenedAtMs = toTimestampMs(rawEvent.happenedAt);
      const happenedAt = Number.isFinite(happenedAtMs) && happenedAtMs > 0 ? new Date(happenedAtMs) : new Date();
      const eventHash = crypto
        .createHash("sha256")
        .update(`${type}|${severity}|${eventCode}|${message}|${happenedAt.getTime()}`)
        .digest("hex");
      eventRows.push([numericSessionId, numericUserId, normalizedGame, eventHash, type, severity, message, eventCode || null, happenedAt]);
      if (eventRows.length >= 120) break;
    }
    if (eventRows.length) {
      const placeholders = eventRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      await queryable.query(
        `
          INSERT IGNORE INTO game_agent_session_events (
            session_id,
            user_id,
            game,
            event_hash,
            event_type,
            severity,
            message,
            event_code,
            happened_at
          )
          VALUES ${placeholders}
        `,
        eventRows.flat()
      );
    }
  }

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
    await pool.query(
      `DELETE FROM game_agent_session_events
       WHERE happened_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${GAME_AGENT_EVENT_RETENTION_DAYS} DAY)`
    );
    await pool.query(
      `DELETE p
       FROM game_agent_session_plugins p
       LEFT JOIN game_agent_sessions s ON s.id = p.session_id
       WHERE s.id IS NULL
          OR s.revoked_at IS NOT NULL
          OR COALESCE(s.last_heartbeat_at, s.created_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${GAME_AGENT_TELEMETRY_STALE_DAYS} DAY)`
    );
    await pool.query(
      `DELETE r
       FROM game_agent_session_region_latency r
       LEFT JOIN game_agent_sessions s ON s.id = r.session_id
       WHERE s.id IS NULL
          OR s.revoked_at IS NOT NULL
          OR COALESCE(s.last_heartbeat_at, s.created_at) < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${GAME_AGENT_TELEMETRY_STALE_DAYS} DAY)`
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

  async function listGameAgentEventsForUser(userId, game = gameAgentDefaultGame, limit = GAME_AGENT_EVENTS_LIST_DEFAULT) {
    const normalizedGame = normalizeGameAgentGame(game);
    if (!normalizedGame) return [];
    const safeLimit = normalizePositiveInteger(limit, GAME_AGENT_EVENTS_LIST_DEFAULT, 1, GAME_AGENT_EVENTS_LIST_MAX);

    const [rows] = await pool.query(
      `
        SELECT
          e.id,
          e.event_type,
          e.severity,
          e.message,
          e.event_code,
          e.happened_at,
          e.created_at,
          s.public_id AS session_public_id,
          s.server_name AS session_server_name,
          s.server_host AS session_server_host,
          s.instance_id AS session_instance_id
        FROM game_agent_session_events e
        LEFT JOIN game_agent_sessions s ON s.id = e.session_id
        WHERE e.user_id = ?
          AND e.game = ?
        ORDER BY e.happened_at DESC, e.id DESC
        LIMIT ?
      `,
      [userId, normalizedGame, safeLimit]
    );

    return rows.map((row) => serializeGameAgentEventRow(row)).filter(Boolean);
  }

  async function handleGameAgentEventsList(req, res, url) {
    const user = await requireAuth(req, res);
    if (!user) return;

    const game = normalizeGameAgentGame(url.searchParams.get("game"));
    if (!game) {
      sendJson(res, 400, { ok: false, error: "invalid input" });
      return;
    }

    const limit = normalizePositiveInteger(url.searchParams.get("limit"), GAME_AGENT_EVENTS_LIST_DEFAULT, 1, GAME_AGENT_EVENTS_LIST_MAX);

    try {
      const events = await listGameAgentEventsForUser(user.id, game, limit);
      sendJson(res, 200, {
        ok: true,
        data: {
          game,
          events,
        },
      });
    } catch (error) {
      logError("game_agent_events_list_failed", error);
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
      let payloadForPersistence = incomingPayload;
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
        payloadForPersistence = mergedPayload;
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

      await persistGameAgentTelemetrySnapshot({
        queryable: connection,
        sessionId,
        userId: pairing.user_id,
        game,
        payload: payloadForPersistence,
      });

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
      const sessionGame = normalizeGameAgentGame(session.game) || gameAgentDefaultGame;

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

      await persistGameAgentTelemetrySnapshot({
        sessionId: session.id,
        userId: session.user_id,
        game: sessionGame,
        payload: mergedPayload,
      });

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
    handleGameAgentEventsList,
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
