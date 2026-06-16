class MysqlAchievementRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async record(playerId, date, rank) {
    const [result] = await this.pool.execute(
      `INSERT IGNORE INTO daily_rank_achievements (player_id, rank_date, rank_position)
       VALUES (?, ?, ?)`,
      [playerId, date, rank]
    );
    return result.affectedRows > 0;
  }

  async get(playerId, date) {
    const [todayRows] = await this.pool.execute(
      `SELECT rank_position FROM daily_rank_achievements
       WHERE player_id = ? AND rank_date = ? ORDER BY rank_position`,
      [playerId, date]
    );
    const [countRows] = await this.pool.execute(
      `SELECT rank_position, COUNT(*) AS total
       FROM daily_rank_achievements WHERE player_id = ?
       GROUP BY rank_position`,
      [playerId]
    );
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const row of countRows) counts[row.rank_position] = Number(row.total);
    const todayRanks = todayRows.map((row) => row.rank_position);
    return {
      todayRanks,
      todayBestRank: todayRanks.length ? Math.min(...todayRanks) : null,
      totalCount1: counts[1],
      totalCount2: counts[2],
      totalCount3: counts[3],
    };
  }
}

module.exports = { MysqlAchievementRepository };
