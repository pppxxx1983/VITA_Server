class MysqlDailyRankRewardRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS daily_rank_rewards (
         id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
         rank_date DATE NOT NULL,
         player_id VARCHAR(191) NOT NULL,
         rank_position TINYINT UNSIGNED NOT NULL,
         refresh_count INT UNSIGNED NOT NULL,
         hint_count INT UNSIGNED NOT NULL,
         claimed_at DATETIME(3) NULL,
         claim_multiplier TINYINT UNSIGNED NULL,
         created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         UNIQUE KEY uk_daily_rank_reward_player (rank_date, player_id),
         UNIQUE KEY uk_daily_rank_reward_position (rank_date, rank_position),
         INDEX idx_daily_rank_reward_pending (player_id, claimed_at, rank_date),
         CONSTRAINT chk_daily_reward_rank CHECK (rank_position BETWEEN 1 AND 3)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
  }

  async settleBefore(today, rewards) {
    const [dates] = await this.pool.execute(
      `SELECT scores.rank_date
       FROM (
         SELECT rank_date, LEAST(3, COUNT(*)) AS expected_count
         FROM daily_special_scores
         WHERE rank_date < ? AND special_score > 0
         GROUP BY rank_date
       ) scores
       LEFT JOIN (
         SELECT rank_date, COUNT(*) AS actual_count
         FROM daily_rank_rewards
         GROUP BY rank_date
       ) rewards ON rewards.rank_date = scores.rank_date
       WHERE COALESCE(rewards.actual_count, 0) < scores.expected_count
       ORDER BY scores.rank_date`,
      [today]
    );

    let inserted = 0;
    for (const row of dates) {
      const date = this.toDateString(row.rank_date);
      const [topRows] = await this.pool.execute(
        `SELECT player_id
         FROM daily_special_scores
         WHERE rank_date = ? AND special_score > 0
         ORDER BY special_score DESC, time_ms ASC, updated_at ASC
         LIMIT 3`,
        [date]
      );
      for (let index = 0; index < topRows.length; index++) {
        const rank = index + 1;
        const reward = rewards[rank];
        const [result] = await this.pool.execute(
          `INSERT IGNORE INTO daily_rank_rewards
             (rank_date, player_id, rank_position, refresh_count, hint_count)
           VALUES (?, ?, ?, ?, ?)`,
          [date, topRows[index].player_id, rank, reward.refreshCount, reward.hintCount]
        );
        if (result.affectedRows > 0) {
          inserted++;
        }
        await this.pool.execute(
          `INSERT IGNORE INTO daily_rank_achievements (player_id, rank_date, rank_position)
           VALUES (?, ?, ?)`,
          [topRows[index].player_id, date, rank]
        );
      }
    }
    return inserted;
  }

  async getPending(playerId) {
    const [rows] = await this.pool.execute(
      `SELECT id, rank_date, rank_position, refresh_count, hint_count
       FROM daily_rank_rewards
       WHERE player_id = ? AND claimed_at IS NULL
       ORDER BY rank_date ASC, id ASC
       LIMIT 1`,
      [playerId]
    );
    return rows.length ? this.mapReward(rows[0]) : null;
  }

  async claim(playerId, rewardId, multiplier) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, rank_date, rank_position, refresh_count, hint_count, claimed_at
         FROM daily_rank_rewards WHERE id = ? AND player_id = ? FOR UPDATE`,
        [rewardId, playerId]
      );
      if (!rows.length) throw new Error('rank reward not found');
      if (rows[0].claimed_at) throw new Error('rank reward already claimed');
      await connection.execute(
        `UPDATE daily_rank_rewards
         SET claimed_at = CURRENT_TIMESTAMP(3), claim_multiplier = ?
         WHERE id = ? AND claimed_at IS NULL`,
        [multiplier, rewardId]
      );
      await connection.commit();
      const reward = this.mapReward(rows[0]);
      reward.multiplier = multiplier;
      reward.refreshCount *= multiplier;
      reward.hintCount *= multiplier;
      return reward;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  mapReward(row) {
    return {
      id: Number(row.id),
      rankDate: this.toDateString(row.rank_date),
      rank: Number(row.rank_position),
      refreshCount: Number(row.refresh_count),
      hintCount: Number(row.hint_count),
    };
  }

  toDateString(value) {
    if (typeof value === 'string') return value.slice(0, 10);
    const date = new Date(value);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
}

module.exports = { MysqlDailyRankRewardRepository };
