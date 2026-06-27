class MysqlProfileRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async get(playerId) {
    const [rows] = await this.pool.execute(
      `SELECT player_id, name, avatar_id, avatar_frame_id, perfect_combo_streak,
              extra_data, registration_time, last_login_time, created_at, updated_at
       FROM player_profiles WHERE player_id = ? LIMIT 1`,
      [playerId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const extra = typeof row.extra_data === 'string' ? JSON.parse(row.extra_data || '{}') : (row.extra_data || {});
    return Object.assign({}, extra, {
      playerId: row.player_id,
      name: row.name || undefined,
      nickname: row.name || undefined,
      avatarId: row.avatar_id,
      avatarIndex: row.avatar_id,
      avatarFrameId: row.avatar_frame_id,
      frameIndex: row.avatar_frame_id,
      perfectComboStreak: row.perfect_combo_streak,
      registrationTime: row.registration_time,
      lastLoginTime: row.last_login_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async upsert(playerId, data) {
    const extra = Object.assign({}, data);
    for (const key of ['playerId', 'name', 'nickname', 'avatarId', 'avatarIndex', 'avatarFrameId', 'frameIndex', 'perfectComboStreak', 'registrationTime', 'lastLoginTime', 'createdAt', 'updatedAt', 'exists']) {
      delete extra[key];
    }
    const registrationTime = data.registrationTime ? new Date(data.registrationTime) : null;
    const lastLoginTime = data.lastLoginTime ? new Date(data.lastLoginTime) : null;
    await this.pool.execute(
      `INSERT INTO player_profiles
         (player_id, name, avatar_id, avatar_frame_id, perfect_combo_streak,
          registration_time, last_login_time, extra_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), avatar_id = VALUES(avatar_id),
         avatar_frame_id = VALUES(avatar_frame_id),
         perfect_combo_streak = VALUES(perfect_combo_streak),
         registration_time = IFNULL(registration_time, VALUES(registration_time)),
         last_login_time = VALUES(last_login_time),
         extra_data = VALUES(extra_data), updated_at = CURRENT_TIMESTAMP(3)`,
      [
        playerId,
        data.name || data.nickname || null,
        Number(data.avatarId ?? data.avatarIndex ?? 0),
        Number(data.avatarFrameId ?? data.frameIndex ?? 0),
        Number(data.perfectComboStreak || 0),
        registrationTime,
        lastLoginTime,
        JSON.stringify(extra),
      ]
    );
    return this.get(playerId);
  }

  async updateLastLoginTime(playerId) {
    await this.pool.execute(
      `UPDATE player_profiles
       SET last_login_time = CURRENT_TIMESTAMP(3)
       WHERE player_id = ?`,
      [playerId]
    );
  }

  async updatePerfectComboStreak(playerId, perfectCombo) {
    await this.pool.execute(
      `INSERT INTO player_profiles (player_id, perfect_combo_streak)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         perfect_combo_streak = IF(?, perfect_combo_streak + 1, 0),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [playerId, perfectCombo ? 1 : 0, perfectCombo ? 1 : 0]
    );
  }

  async updatePerfectClearStreak(playerId, perfectClear) {
    const initialStreak = perfectClear ? 1 : 0;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO player_profiles (player_id, extra_data)
         VALUES (?, JSON_OBJECT('perfectClearStreak', ?))
         ON DUPLICATE KEY UPDATE
           extra_data = JSON_SET(
             COALESCE(extra_data, JSON_OBJECT()),
             '$.perfectClearStreak',
             IF(?,
               COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.perfectClearStreak')) AS UNSIGNED), 0) + 1,
               0
             )
           ),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [playerId, initialStreak, perfectClear ? 1 : 0]
      );
      const [rows] = await connection.execute(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.perfectClearStreak')) AS perfect_clear_streak
         FROM player_profiles WHERE player_id = ? FOR UPDATE`,
        [playerId]
      );
      await connection.commit();
      return Number(rows[0] && rows[0].perfect_clear_streak) || 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = { MysqlProfileRepository };
