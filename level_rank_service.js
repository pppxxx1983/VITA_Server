const MIN_LEVEL = 1;
const MAX_LEVEL = 1000;

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

class LevelRankService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.logger = options.logger || console;
  }

  submitResult(input) {
    this.log('submitResult input', this.summarizeInput(input));
    const result = this.normalizeResult(input);
    this.log('submitResult normalized', result);
    const saved = this.saveScore(result.level, result);
    this.log('submitResult saved', saved);
    const beatPercent = this.calculateBeatPercent(saved);
    const totalPlayers = this.getLevelCount(result.level);
    this.log('submitResult result', {
      playerId: result.playerId,
      level: result.level,
      score: result.score,
      combo: result.combo,
      timeMs: result.timeMs,
      beatPercent,
      improved: true,
      totalPlayers,
    });

    return {
      playerId: result.playerId,
      level: result.level,
      score: result.score,
      combo: result.combo,
      timeMs: result.timeMs,
      beatPercent,
      improved: true,
      totalPlayers,
    };
  }

  saveScore(level, result) {
    const record = Object.assign({}, result, {
      level,
      id: `${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
      updatedAt: new Date().toISOString(),
    });
    return this.dataStore.update(['levels', String(level), 'scores'], (scores) => {
      return Array.isArray(scores) ? scores.concat([record]) : [record];
    }, []).slice(-1)[0];
  }

  listScores(level) {
    const players = this.dataStore.get(['levels', String(level), 'players'], {});
    const scores = this.dataStore.get(['levels', String(level), 'scores'], []);
    const legacyScores = players && typeof players === 'object' && !Array.isArray(players)
      ? Object.values(players)
      : [];
    const scoreRecords = Array.isArray(scores) ? scores : [];
    return legacyScores.concat(scoreRecords);
  }

  getLevelCount(level) {
    return this.listScores(level).length;
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
    const rawTimeMs = input.timeMs !== undefined
      ? toFiniteNumber(input.timeMs, 'timeMs')
      : toFiniteNumber(input.timeSeconds, 'timeSeconds') * 1000;
    const timeMs = Math.max(0, Math.floor(rawTimeMs));

    return {
      playerId,
      level,
      score,
      combo,
      timeMs,
    };
  }

  compareResult(a, b) {
    if (a.score !== b.score) return a.score > b.score ? 1 : -1;
    if (a.combo !== b.combo) return a.combo > b.combo ? 1 : -1;
    if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? 1 : -1;
    return 0;
  }

  calculateBeatPercent(current) {
    const level = current.level;
    const playerId = current.playerId;
    const scores = this.listScores(level);
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
