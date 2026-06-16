class MysqlProfileRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async get(playerId) {
    const [rows] = await this.pool.execute(
      `SELECT player_id, name, avatar_id, avatar_frame_id, perfect_combo_streak,
              extra_data, created_at, updated_at
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async upsert(playerId, data) {
    const extra = Object.assign({}, data);
    for (const key of ['playerId', 'name', 'nickname', 'avatarId', 'avatarIndex', 'avatarFrameId', 'frameIndex', 'perfectComboStreak', 'createdAt', 'updatedAt', 'exists']) {
      delete extra[key];
    }
    await this.pool.execute(
      `INSERT INTO player_profiles
         (player_id, name, avatar_id, avatar_frame_id, perfect_combo_streak, extra_data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), avatar_id = VALUES(avatar_id),
         avatar_frame_id = VALUES(avatar_frame_id),
         perfect_combo_streak = VALUES(perfect_combo_streak),
         extra_data = VALUES(extra_data), updated_at = CURRENT_TIMESTAMP(3)`,
      [
        playerId,
        data.name || data.nickname || null,
        Number(data.avatarId ?? data.avatarIndex ?? 0),
        Number(data.avatarFrameId ?? data.frameIndex ?? 0),
        Number(data.perfectComboStreak || 0),
        JSON.stringify(extra),
      ]
    );
    return this.get(playerId);
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
}

module.exports = { MysqlProfileRepository };
