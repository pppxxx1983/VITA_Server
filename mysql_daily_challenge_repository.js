class MysqlDailyChallengeRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.execute(
      `CREATE TABLE IF NOT EXISTS player_daily_challenges (
         player_id VARCHAR(191) NOT NULL,
         challenge_date VARCHAR(10) NOT NULL,
         opened TINYINT(1) NOT NULL DEFAULT 0,
         opened_at DATETIME(3) NULL,
         total_special_score INT NOT NULL DEFAULT 0,
         completed TINYINT(1) NOT NULL DEFAULT 0,
         rewarded TINYINT(1) NOT NULL DEFAULT 0,
         created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
         PRIMARY KEY (player_id, challenge_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
  }

  async getOrCreate(playerId, date) {
    const [rows] = await this.pool.execute(
      `SELECT player_id, challenge_date, opened, opened_at, total_special_score,
              completed, rewarded, created_at, updated_at
       FROM player_daily_challenges
       WHERE player_id = ? AND challenge_date = ?`,
      [playerId, date]
    );

    if (rows.length > 0) {
      return this._mapRow(rows[0]);
    }

    await this.pool.execute(
      `INSERT INTO player_daily_challenges
         (player_id, challenge_date, opened, total_special_score, completed, rewarded)
       VALUES (?, ?, 0, 0, 0, 0)`,
      [playerId, date]
    );

    return {
      playerId,
      challengeDate: date,
      opened: false,
      openedAt: null,
      totalSpecialScore: 0,
      completed: false,
      rewarded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async openChallenge(playerId, date) {
    await this.pool.execute(
      `INSERT INTO player_daily_challenges
         (player_id, challenge_date, opened, opened_at, total_special_score, completed, rewarded)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP(3), 0, 0, 0)
       ON DUPLICATE KEY UPDATE
         opened = 1,
         opened_at = COALESCE(opened_at, VALUES(opened_at))`,
      [playerId, date]
    );

    return this.getOrCreate(playerId, date);
  }

  async addSpecialScore(playerId, date, score) {
    const safeScore = Math.max(0, Number(score) || 0);
    await this.pool.execute(
      `UPDATE player_daily_challenges
       SET total_special_score = total_special_score + ?
       WHERE player_id = ? AND challenge_date = ?`,
      [safeScore, playerId, date]
    );

    return this.getOrCreate(playerId, date);
  }

  async markRewarded(playerId, date) {
    await this.pool.execute(
      `UPDATE player_daily_challenges
       SET completed = 1, rewarded = 1
       WHERE player_id = ? AND challenge_date = ?`,
      [playerId, date]
    );

    return this.getOrCreate(playerId, date);
  }

  async markCompleted(playerId, date) {
    await this.pool.execute(
      `UPDATE player_daily_challenges
       SET completed = 1
       WHERE player_id = ? AND challenge_date = ?`,
      [playerId, date]
    );

    return this.getOrCreate(playerId, date);
  }

  _mapRow(row) {
    return {
      playerId: row.player_id,
      challengeDate: row.challenge_date,
      opened: Boolean(row.opened),
      openedAt: row.opened_at ? new Date(row.opened_at).toISOString() : null,
      totalSpecialScore: Number(row.total_special_score) || 0,
      completed: Boolean(row.completed),
      rewarded: Boolean(row.rewarded),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }
}

module.exports = { MysqlDailyChallengeRepository };
