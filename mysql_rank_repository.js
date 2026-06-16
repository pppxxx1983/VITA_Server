class MysqlRankRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async saveLevelScore(result) {
    const externalId = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    await this.pool.execute(
      `INSERT INTO level_scores
         (external_id, player_id, level, score, combo, special_score, time_ms,
          perfect_combo, perfect_clear, display_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [externalId, result.playerId, result.level, result.score, result.combo,
        result.specialScore, result.timeMs, result.perfectCombo, result.perfectClear,
        result.name || null]
    );
    return Object.assign({}, result, { id: externalId, updatedAt: new Date().toISOString() });
  }

  async listLevelScores(level) {
    const [rows] = await this.pool.execute(
      `SELECT external_id, player_id, level, score, combo, special_score, time_ms,
              perfect_combo, perfect_clear, display_name, created_at
       FROM level_scores WHERE level = ?`,
      [level]
    );
    return rows.map((row) => ({
      id: row.external_id,
      playerId: row.player_id,
      level: row.level,
      score: row.score,
      combo: row.combo,
      specialScore: row.special_score,
      timeMs: row.time_ms,
      perfectCombo: Boolean(row.perfect_combo),
      perfectClear: Boolean(row.perfect_clear),
      name: row.display_name || undefined,
      updatedAt: row.created_at,
    }));
  }

  async saveDailySpecial(date, result) {
    const externalId = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    await this.pool.execute(
      `INSERT INTO daily_special_scores
         (rank_date, player_id, level, score, combo, special_score, time_ms, display_name, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         special_score = special_score + VALUES(special_score),
         level = VALUES(level), score = VALUES(score), combo = VALUES(combo),
         time_ms = VALUES(time_ms), display_name = COALESCE(VALUES(display_name), display_name),
         external_id = VALUES(external_id), updated_at = CURRENT_TIMESTAMP(3)`,
      [date, result.playerId, result.level, result.score, result.combo,
        result.specialScore, result.timeMs, result.name || null, externalId]
    );
  }

  async listDailySpecial(date) {
    const [rows] = await this.pool.execute(
      `SELECT d.player_id, d.level, d.score, d.combo, d.special_score, d.time_ms,
              d.display_name, d.external_id, d.updated_at,
              p.name AS profile_name, p.avatar_id, p.avatar_frame_id
       FROM daily_special_scores d
       LEFT JOIN player_profiles p ON p.player_id = d.player_id
       WHERE d.rank_date = ? AND d.special_score > 0
       ORDER BY d.special_score DESC, d.time_ms ASC, d.updated_at ASC`,
      [date]
    );
    return rows.map((row) => ({
      playerId: row.player_id,
      level: row.level,
      score: row.score,
      combo: row.combo,
      specialScore: row.special_score,
      timeMs: row.time_ms,
      name: row.profile_name || row.display_name || '',
      avatarId: row.avatar_id || 0,
      avatarFrameId: row.avatar_frame_id || 0,
      id: row.external_id,
      updatedAt: row.updated_at,
      date,
    }));
  }

  async getLatestDailySpecialDate() {
    const [rows] = await this.pool.query('SELECT MAX(rank_date) AS latest_date FROM daily_special_scores');
    return rows[0] && rows[0].latest_date ? String(rows[0].latest_date) : null;
  }
}

module.exports = { MysqlRankRepository };
