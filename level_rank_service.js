const MIN_LEVEL = 1;
const MAX_LEVEL = 2000;

function toFiniteNumber(value, name) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${name} must be a finite number`);
  }
  return num;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text ? text : undefined;
}

class LevelRankService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.dailySpecialDataStore = options.dailySpecialDataStore || dataStore;
    this.userInfoDataStore = options.userInfoDataStore || dataStore;
    this.dailyRankAchievementService = options.dailyRankAchievementService || null;
    this.logger = options.logger || console;
  }

  async submitResult(input) {
    this.log('submitResult input', this.summarizeInput(input));
    const result = this.normalizeResult(input);
    await this.applyPerfectClearMultiplier(result);
    this.log('submitResult normalized', result);
    const saved = await this.saveScore(result.level, result);
    this.log('submitResult saved', saved);
    const beatPercent = await this.calculateBeatPercent(saved);
    const totalPlayers = await this.getLevelCount(result.level);
    this.log('submitResult result', {
      playerId: result.playerId,
      level: result.level,
      score: result.score,
      combo: result.combo,
      timeMs: result.timeMs,
      specialScore: result.specialScore,
      beatPercent,
      improved: true,
      totalPlayers,
    });

    // 同时保存到每日特殊积分榜
    let specialRankInfo = null;
    if (result.specialScore > 0) {
      const date = this.toDateString(new Date());
      const beforeLeaderboard = await this.getDailySpecialLeaderboard(date, result.playerId);
      const oldRank = beforeLeaderboard.self ? beforeLeaderboard.self.rank : null;
      await this.saveSpecialScore(result);
      const afterLeaderboard = await this.getDailySpecialLeaderboard(date, result.playerId);
      const newRank = afterLeaderboard.self ? afterLeaderboard.self.rank : null;

      const isNew = oldRank === null && newRank !== null;
      const isUp = oldRank !== null && newRank !== null && newRank < oldRank;
      const isDown = oldRank !== null && newRank !== null && newRank > oldRank;
      const rankChange = isNew ? 'new entry' : (isUp ? `rank up ${oldRank - newRank} places` : (isDown ? `rank down ${newRank - oldRank} places` : 'rank unchanged'));
      const rankEventType = isNew ? 'new_entry' : (isUp ? 'rank_up' : (isDown ? 'rank_down' : 'unchanged'));
      // 前3名晋升标记
      const enteredTop3 = (oldRank === null || oldRank > 3) && newRank !== null && newRank <= 3;
      const top3RankUp = oldRank !== null && oldRank <= 3 && newRank !== null && newRank < oldRank;
      const promotedFrom = oldRank;
      const promotedTo = newRank;

      this.log('specialScore daily rank change', {
        playerId: result.playerId,
        date,
        oldRank,
        newRank,
        specialScore: result.specialScore,
        rankChange,
        isNew,
        isUp,
      });

      // 前三名成就和奖励在跨日登录结算时写入，过关只更新实时榜单。
      const achievement = null;

      // 用最新的 achievement 覆盖 self 中的旧数据
      const selfWithAchievement = afterLeaderboard.self
        ? Object.assign({}, afterLeaderboard.self, achievement ? { achievement } : {})
        : null;

      specialRankInfo = {
        oldRank,
        previousRank: oldRank,
        newRank,
        rank: newRank,
        rankUp: isUp || isNew,
        rankIncreased: isUp || isNew,
        rankChange,
        rankEventType,
        isNew,
        isUp,
        enteredTop3,
        top3RankUp,
        promotedFrom,
        promotedTo,
        achievement,
        achievementIsNew: false,
        isNewToday: false,
        self: selfWithAchievement,
        top100: afterLeaderboard.top100,
        surrounding: this.getRankWindow(afterLeaderboard.top100, oldRank, newRank),
      };
    }

    // 更新完美连击记录
    if (this.userInfoDataStore) {
      await this.userInfoDataStore.updatePerfectComboStreak(result.playerId, result.perfectCombo);
    }

    // 精简结算返回
    const top3 = specialRankInfo
      ? specialRankInfo.top100.slice(0, 3).map((item) => ({
          rank: item.rank,
          playerId: item.playerId,
          name: item.name,
          avatarId: item.avatarId,
          avatarFrameId: item.avatarFrameId,
          avatarUrl: item.avatarUrl || '',
          specialScore: item.specialScore,
        }))
      : [];

    return {
      playerId: result.playerId,
      level: result.level,
      score: result.score,
      combo: result.combo,
      timeMs: result.timeMs,
      specialScore: result.specialScore,
      perfectCombo: result.perfectCombo,
      perfectClear: result.perfectClear,
      originalSpecialScore: result.originalSpecialScore,
      specialScoreMultiplier: result.specialScoreMultiplier,
      perfectClearStreak: result.perfectClearStreak,
      beatPercent,
      totalPlayers,
      rank: specialRankInfo
        ? {
            oldRank: specialRankInfo.oldRank,
            newRank: specialRankInfo.newRank,
            enteredTop3: specialRankInfo.enteredTop3,
            top3RankUp: specialRankInfo.top3RankUp,
            rankUp: specialRankInfo.rankUp,
            rankIncreased: specialRankInfo.rankIncreased,
            rankEventType: specialRankInfo.rankEventType,
            improved: specialRankInfo.isNew || specialRankInfo.isUp,
            achievementIsNew: specialRankInfo.achievementIsNew,
            isNewToday: specialRankInfo.isNewToday,
          }
        : null,
      achievement: specialRankInfo ? specialRankInfo.achievement : null,
      top3,
    };
  }

  async applyPerfectClearMultiplier(result) {
    const originalSpecialScore = result.specialScore;
    let streak = 0;
    if (this.userInfoDataStore && typeof this.userInfoDataStore.updatePerfectClearStreak === 'function') {
      streak = await this.userInfoDataStore.updatePerfectClearStreak(result.playerId, result.perfectClear);
    } else if (result.perfectClear) {
      streak = 1;
    }

    const multiplier = !result.perfectClear ? 1 : (streak >= 3 ? 2 : (streak === 2 ? 1.5 : 1));
    result.originalSpecialScore = originalSpecialScore;
    result.specialScoreMultiplier = multiplier;
    result.perfectClearStreak = streak;
    result.specialScore = Math.floor(originalSpecialScore * multiplier);
  }

  async saveScore(level, result) {
    return this.dataStore.saveLevelScore(Object.assign({}, result, { level }));
  }

  async saveSpecialScore(result) {
    const date = this.toDateString(new Date());
    return this.dailySpecialDataStore.saveDailySpecial(date, result);
  }

  legacySaveSpecialScore(result) {
    const date = this.toDateString(new Date());
    const record = Object.assign({}, result, {
      id: `${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
      updatedAt: new Date().toISOString(),
      date,
    });
    return this.dailySpecialDataStore.update(['dailySpecial', date], (scores) => {
      const list = Array.isArray(scores) ? scores.slice() : [];
      const idx = list.findIndex((s) => s.playerId === result.playerId);
      if (idx >= 0) {
        // 同一天已有记录：累加特殊积分，更新其他字段
        list[idx].specialScore += result.specialScore;
        list[idx].score = result.score;
        list[idx].combo = result.combo;
        list[idx].timeMs = result.timeMs;
        list[idx].level = result.level;
        list[idx].updatedAt = record.updatedAt;
        list[idx].id = record.id;
        return list;
      }
      // 新记录
      return list.concat([record]);
    }, []);
  }

  async listDailySpecialScores(date) {
    return this.dailySpecialDataStore.listDailySpecial(date);
  }

  async aggregateDailySpecialScores(date) {
    const scores = await this.listDailySpecialScores(date);
    const playerMap = new Map();
    for (const item of scores) {
      if (!playerMap.has(item.playerId)) {
        playerMap.set(item.playerId, { ...item });
      } else {
        const existing = playerMap.get(item.playerId);
        existing.specialScore += item.specialScore;
        existing.score = item.score;
        existing.combo = item.combo;
        existing.timeMs = item.timeMs;
        existing.level = item.level;
        existing.updatedAt = item.updatedAt;
      }
    }
    return Array.from(playerMap.values());
  }

  async getDailySpecialRank(date, limit = 50) {
    const aggregated = await this.aggregateDailySpecialScores(date);
    const filtered = aggregated.filter((item) => item.specialScore > 0);
    const sorted = filtered.slice().sort((a, b) => {
      if (b.specialScore !== a.specialScore) return b.specialScore - a.specialScore;
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });
    return sorted.slice(0, limit);
  }

  toDateString(date) {
    // 基于北京时间（UTC+8）生成日期字符串
    const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const y = bj.getUTCFullYear();
    const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(bj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async getLatestDailySpecialDate() {
    return await this.dailySpecialDataStore.getLatestDailySpecialDate() || this.toDateString(new Date());
  }

  async getDailySpecialLeaderboard(date, playerId, limit = 100) {
    const aggregated = await this.aggregateDailySpecialScores(date);

    // 排序：specialScore 降序 -> timeMs 升序 -> updatedAt 升序
    const sorted = aggregated.slice().sort((a, b) => {
      if (b.specialScore !== a.specialScore) return b.specialScore - a.specialScore;
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });

    // 过滤积分为 0 的，赋予名次
    const filtered = sorted.filter((item) => item.specialScore > 0);
    const ranked = [];
    for (const item of filtered) {
      const userInfo = await this.userInfoDataStore.get(item.playerId) || {};
      const name = this.getDisplayName(item, userInfo);
      ranked.push({
        rank: ranked.length + 1,
        playerId: item.playerId,
        name,
        nickname: name,
        specialScore: item.specialScore,
        score: item.score,
        combo: item.combo,
        timeMs: item.timeMs,
        timeSeconds: Math.floor(item.timeMs / 1000),
        level: item.level,
        avatarId: typeof userInfo.avatarId === 'number' ? userInfo.avatarId : (typeof userInfo.avatarIndex === 'number' ? userInfo.avatarIndex : 0),
        avatarFrameId: typeof userInfo.avatarFrameId === 'number' ? userInfo.avatarFrameId : (typeof userInfo.frameIndex === 'number' ? userInfo.frameIndex : 0),
        avatarUrl: normalizeText(userInfo.avatarUrl)
          || normalizeText(item.avatarUrl)
          || normalizeText(userInfo.avatar_source_url)
          || normalizeText(userInfo.avatarSourceUrl)
          || '',
      });
    }

    const top100 = ranked.slice(0, limit);

    let self = null;
    if (playerId) {
      const selfIndex = ranked.findIndex((item) => item.playerId === playerId);
      if (selfIndex >= 0) {
        self = ranked[selfIndex];
        if (this.dailyRankAchievementService) {
          self.achievement = await this.dailyRankAchievementService.getAchievement(playerId, date);
        }
      }
    }

    return { top100, self };
  }

  getRankWindow(ranked, oldRank, newRank) {
    if (!Array.isArray(ranked) || ranked.length === 0) return [];
    const ranks = new Set();
    const addAround = (rank) => {
      if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) return;
      for (let i = rank - 4; i <= rank + 4; i++) {
        if (i > 0) ranks.add(i);
      }
    };
    addAround(oldRank);
    addAround(newRank);
    return ranked.filter((item) => ranks.has(item.rank));
  }

  getDisplayName(rankItem, userInfo) {
    return normalizeText(userInfo.name)
      || normalizeText(userInfo.nickname)
      || normalizeText(userInfo.playerName)
      || normalizeText(userInfo.nickName)
      || normalizeText(userInfo.userName)
      || normalizeText(userInfo.username)
      || normalizeText(userInfo.displayName)
      || normalizeText(rankItem.name)
      || normalizeText(rankItem.nickname)
      || normalizeText(rankItem.playerName)
      || normalizeText(rankItem.displayName)
      || '';
  }

  async listScores(level) {
    return this.dataStore.listLevelScores(level);
  }

  async getLevelCount(level) {
    return (await this.listScores(level)).length;
  }

  normalizeResult(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('request body must be a JSON object');
    }

    const playerId = String(input.playerId || '').trim();
    if (!playerId) {
      throw new Error('playerId is required');
    }

    const level = clampInt(toFiniteNumber(input.level, 'level'), MIN_LEVEL, MAX_LEVEL);
    const score = Math.max(0, Math.floor(toFiniteNumber(input.score, 'score')));
    const combo = Math.max(0, Math.floor(toFiniteNumber(input.combo, 'combo')));
    const specialScore = input.specialScore !== undefined
      ? Math.max(0, Math.floor(toFiniteNumber(input.specialScore, 'specialScore')))
      : 0;
    const perfectCombo = input.perfectCombo === true;
    const perfectClear = input.perfectClear === true;
    const rawTimeMs = input.timeMs !== undefined
      ? toFiniteNumber(input.timeMs, 'timeMs')
      : toFiniteNumber(input.timeSeconds, 'timeSeconds') * 1000;
    const timeMs = Math.max(0, Math.floor(rawTimeMs));

    let avatarUrl;
    if (input.avatarUrl !== undefined || input.picture !== undefined || input.photoUrl !== undefined) {
      avatarUrl = normalizeText(input.avatarUrl)
        || normalizeText(input.picture)
        || normalizeText(input.photoUrl)
        || '';
    }
    const avatarId = typeof input.avatarId === 'number' && !Number.isNaN(input.avatarId)
      ? Math.max(0, Math.floor(input.avatarId))
      : (typeof input.avatarIndex === 'number' && !Number.isNaN(input.avatarIndex)
        ? Math.max(0, Math.floor(input.avatarIndex))
        : undefined);
    const avatarFrameId = typeof input.avatarFrameId === 'number' && !Number.isNaN(input.avatarFrameId)
      ? Math.max(0, Math.floor(input.avatarFrameId))
      : (typeof input.frameIndex === 'number' && !Number.isNaN(input.frameIndex)
        ? Math.max(0, Math.floor(input.frameIndex))
        : undefined);

    return {
      playerId,
      level,
      score,
      combo,
      specialScore,
      perfectCombo,
      perfectClear,
      timeMs,
      name: normalizeText(input.name)
        || normalizeText(input.nickname)
        || normalizeText(input.playerName)
        || normalizeText(input.displayName),
      avatarUrl,
      avatarId,
      avatarFrameId,
    };
  }

  compareResult(a, b) {
    if (a.score !== b.score) return a.score > b.score ? 1 : -1;
    if (a.combo !== b.combo) return a.combo > b.combo ? 1 : -1;
    if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? 1 : -1;
    return 0;
  }

  async calculateBeatPercent(current) {
    const level = current.level;
    const playerId = current.playerId;
    const scores = await this.listScores(level);
    this.log('calculateBeatPercent start', {
      level,
      playerId,
      totalScores: scores.length,
      current,
      scoreSummary: this.summarizeScores(scores),
    });

    let notStrongerCount = 0;
    const comparisons = [];
    for (const item of scores) {
      const compare = this.compareResult(current, item);
      comparisons.push({
        playerId: item.playerId,
        score: item.score,
        combo: item.combo,
        timeMs: item.timeMs,
        compare,
      });
      if (compare >= 0) {
        notStrongerCount++;
      }
    }

    const percent = notStrongerCount / scores.length * 100;
    const beatPercent = Math.max(0, Math.min(100, Math.round(percent)));
    this.log('calculateBeatPercent done', {
      level,
      playerId,
      notStrongerCount,
      totalScores: scores.length,
      rawPercent: percent,
      beatPercent,
      comparisons,
    });
    return beatPercent;
  }

  summarizeInput(input) {
    if (!input || typeof input !== 'object') {
      return input;
    }

    return {
      playerId: input.playerId,
      level: input.level,
      score: input.score,
      combo: input.combo,
      specialScore: input.specialScore,
      timeMs: input.timeMs,
      timeSeconds: input.timeSeconds,
      keys: Object.keys(input),
    };
  }

  summarizeScores(scores) {
    return scores.map((item) => ({
      playerId: item.playerId,
      level: item.level,
      score: item.score,
      combo: item.combo,
      specialScore: item.specialScore,
      timeMs: item.timeMs,
      updatedAt: item.updatedAt,
    }));
  }

  log(message, details) {
    if (!this.logger || typeof this.logger.log !== 'function') {
      return;
    }

    this.logger.log(`[rank:settlement] ${message}`, JSON.stringify(details));
  }
}

module.exports = {
  LevelRankService,
};
