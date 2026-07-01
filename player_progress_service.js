function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function normalizeDailyClearData(value) {
  const result = {};
  if (!isObject(value)) return result;

  for (const yearKey of Object.keys(value)) {
    const year = String(parseInt(yearKey, 10));
    if (!year || year === 'NaN' || !isObject(value[yearKey])) continue;
    if (!result[year]) result[year] = {};

    for (const monthKey of Object.keys(value[yearKey])) {
      const month = String(parseInt(monthKey, 10));
      if (!month || month === 'NaN' || !Array.isArray(value[yearKey][monthKey])) continue;
      const days = value[yearKey][monthKey]
        .map((day) => normalizePositiveInt(day, 0))
        .filter((day) => day >= 1 && day <= 31);
      result[year][month] = Array.from(new Set([...(result[year][month] || []), ...days])).sort((a, b) => a - b);
    }
  }

  return result;
}

function normalizeIndexArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((index) => normalizePositiveInt(index, -1))
      .filter((index) => index >= 0)
  )).sort((a, b) => a - b);
}

function mergeDailyClearData(a, b) {
  const result = normalizeDailyClearData(a);
  const next = normalizeDailyClearData(b);

  for (const year of Object.keys(next)) {
    if (!result[year]) result[year] = {};
    for (const month of Object.keys(next[year])) {
      result[year][month] = Array.from(new Set([...(result[year][month] || []), ...next[year][month]])).sort((x, y) => x - y);
    }
  }

  return result;
}

function normalizeProgress(progress) {
  const source = isObject(progress) ? progress : {};
  return {
    currentLevel: Math.max(1, normalizePositiveInt(source.currentLevel, 1)),
    dailyClearData: normalizeDailyClearData(source.dailyClearData),
    travelLevelIndex: Math.max(1, normalizePositiveInt(source.travelLevelIndex, 1)),
    travelCollectedMedalIndexes: normalizeIndexArray(source.travelCollectedMedalIndexes),
    refreshCount: Math.max(0, normalizePositiveInt(source.refreshCount, 0)),
    hintCount: Math.max(0, normalizePositiveInt(source.hintCount, 0)),
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt.trim() ? source.updatedAt.trim() : '',
  };
}

function mergeProgress(current, patch) {
  const base = normalizeProgress(current);
  const next = normalizeProgress(patch);
  return {
    currentLevel: Math.max(base.currentLevel, next.currentLevel),
    dailyClearData: mergeDailyClearData(base.dailyClearData, next.dailyClearData),
    travelLevelIndex: Math.max(base.travelLevelIndex, next.travelLevelIndex),
    travelCollectedMedalIndexes: Array.from(new Set([
      ...base.travelCollectedMedalIndexes,
      ...next.travelCollectedMedalIndexes,
    ])).sort((a, b) => a - b),
    refreshCount: next.refreshCount,
    hintCount: next.hintCount,
    updatedAt: nowIso(),
  };
}

class PlayerProgressService {
  constructor(profileRepository) {
    this.profileRepository = profileRepository;
  }

  registerRoutes(routes) {
    routes.get('/api/player/progress/:playerId', async (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      const progress = await this.getProgress(playerId);
      ctx.json(200, { ok: true, playerId, progress });
    });

    routes.patch('/api/player/progress/:playerId', async (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      const body = await ctx.body();
      const progress = await this.patchProgress(playerId, body && body.progress ? body.progress : body);
      ctx.json(200, { ok: true, playerId, progress });
    });

    routes.post('/api/player/progress/:playerId', async (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      const body = await ctx.body();
      const progress = await this.patchProgress(playerId, body && body.progress ? body.progress : body);
      ctx.json(200, { ok: true, playerId, progress });
    });
  }

  async getProgress(playerId) {
    const profile = await this.profileRepository.get(playerId);
    return normalizeProgress(profile && profile.progress);
  }

  async patchProgress(playerId, patch) {
    if (!isObject(patch)) {
      throw new Error('progress body must be a JSON object');
    }

    const current = await this.profileRepository.get(playerId);
    const mergedProfile = Object.assign({}, current || { playerId });
    mergedProfile.progress = mergeProgress(current && current.progress, patch);
    return (await this.profileRepository.upsert(playerId, mergedProfile)).progress;
  }

  normalizePlayerId(playerId) {
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('playerId is required');
    }
    return playerId;
  }
}

module.exports = {
  PlayerProgressService,
  mergeProgress,
  normalizeProgress,
};
