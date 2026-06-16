class DailyRankAchievementService {
  constructor(repository) {
    this.repository = repository;
  }

  async recordRank(playerId, date, rank) {
    if (!playerId || typeof rank !== 'number' || rank < 1 || rank > 3) {
      return { isNew: false, totalCount1: 0, totalCount2: 0, totalCount3: 0 };
    }
    const isNew = await this.repository.record(playerId, date, rank);
    const achievement = await this.getAchievement(playerId, date);
    return Object.assign({ isNew }, achievement);
  }

  async getAchievement(playerId, date) {
    return this.repository.get(playerId, date);
  }
}

module.exports = { DailyRankAchievementService };
