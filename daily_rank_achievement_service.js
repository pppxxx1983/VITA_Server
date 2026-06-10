/**
 * 每日排名成就服务
 * 记录玩家获得 1-3 名的次数，同一天同一名次只算一次
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

class DailyRankAchievementService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.rootKey = options.rootKey || 'players';
  }

  /**
   * 记录玩家获得的名次
   * @param {string} playerId
   * @param {string} date - YYYY-MM-DD
   * @param {number} rank - 名次（1-3）
   * @returns {{ isNew: boolean, totalCount1: number, totalCount2: number, totalCount3: number }}
   */
  recordRank(playerId, date, rank) {
    if (!playerId || typeof rank !== 'number' || rank < 1 || rank > 3) {
      return { isNew: false, totalCount1: 0, totalCount2: 0, totalCount3: 0 };
    }

    return this.dataStore.update([this.rootKey, playerId], (current) => {
      const merged = Object.assign({}, isObject(current) ? current : this.defaultAchievement(playerId));

      // 确保 dailyRanks 存在
      if (!isObject(merged.dailyRanks)) {
        merged.dailyRanks = {};
      }

      // 获取今天的记录
      const todayRanks = Array.isArray(merged.dailyRanks[date])
        ? merged.dailyRanks[date]
        : [];

      // 如果今天已经获得过该名次，不算
      if (todayRanks.includes(rank)) {
        return merged;
      }

      // 记录今天获得的名次
      todayRanks.push(rank);
      merged.dailyRanks[date] = todayRanks;

      // 累加总计数
      if (!isObject(merged.totalCounts)) {
        merged.totalCounts = { '1': 0, '2': 0, '3': 0 };
      }
      const key = String(rank);
      merged.totalCounts[key] = (merged.totalCounts[key] || 0) + 1;

      merged.updatedAt = nowIso();
      if (!merged.createdAt) {
        merged.createdAt = merged.updatedAt;
      }

      return merged;
    }, this.defaultAchievement(playerId));
  }

  /**
   * 获取玩家的名次成就信息
   * @param {string} playerId
   * @param {string} date - YYYY-MM-DD
   * @returns {{ todayRanks: number[], todayBestRank: number|null, totalCount1: number, totalCount2: number, totalCount3: number }}
   */
  getAchievement(playerId, date) {
    const saved = this.dataStore.get([this.rootKey, playerId], {});
    const data = isObject(saved) ? saved : this.defaultAchievement(playerId);

    const dailyRanks = isObject(data.dailyRanks) ? data.dailyRanks : {};
    const todayRanks = Array.isArray(dailyRanks[date]) ? dailyRanks[date] : [];
    const todayBestRank = todayRanks.length > 0 ? Math.min(...todayRanks) : null;

    const totalCounts = isObject(data.totalCounts) ? data.totalCounts : { '1': 0, '2': 0, '3': 0 };

    return {
      todayRanks,
      todayBestRank,
      totalCount1: totalCounts['1'] || 0,
      totalCount2: totalCounts['2'] || 0,
      totalCount3: totalCounts['3'] || 0,
    };
  }

  defaultAchievement(playerId) {
    return {
      playerId,
      dailyRanks: {},
      totalCounts: { '1': 0, '2': 0, '3': 0 },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }
}

module.exports = {
  DailyRankAchievementService,
};
