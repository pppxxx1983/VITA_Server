/**
 * 旅行闯关数据服务（TravelUI）
 * 管理玩家碎片收集与闯关进度
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

class TravelService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.rootKey = options.rootKey || 'players';
    this.defaultFragmentLimit = options.defaultFragmentLimit || 10;
    this.defaultTotalStages = options.defaultTotalStages || 20;
  }

  registerRoutes(routes) {
    routes.get('/api/travel/:playerId', (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      const data = this.getPlayerTravelData(playerId);
      ctx.json(200, { ok: true, playerId, data });
    });

    routes.post('/api/travel/:playerId', (ctx) => this.patchTravelDataRoute(ctx));
    routes.patch('/api/travel/:playerId', (ctx) => this.patchTravelDataRoute(ctx));

    routes.post('/api/travel/:playerId/collect', (ctx) => this.collectFragmentRoute(ctx));

    routes.post('/api/travel/:playerId/reset', (ctx) => this.resetTravelDataRoute(ctx));
  }

  async patchTravelDataRoute(ctx) {
    const playerId = this.normalizePlayerId(ctx.params.playerId);
    const body = await ctx.body();
    const data = this.patchTravelData(playerId, body);
    ctx.json(200, { ok: true, playerId, data });
  }

  async collectFragmentRoute(ctx) {
    const playerId = this.normalizePlayerId(ctx.params.playerId);
    const body = await ctx.body();
    const result = this.collectFragment(playerId, body);
    ctx.json(200, { ok: true, playerId, ...result });
  }

  async resetTravelDataRoute(ctx) {
    const playerId = this.normalizePlayerId(ctx.params.playerId);
    const data = this.resetTravelData(playerId);
    ctx.json(200, { ok: true, playerId, data });
  }

  getPlayerTravelData(playerId) {
    const saved = this.dataStore.get([this.rootKey, playerId], {});
    return this.normalizeTravelData(playerId, saved, false);
  }

  patchTravelData(playerId, patch) {
    if (!isObject(patch)) {
      throw new Error('travel body must be a JSON object');
    }

    return this.dataStore.update([this.rootKey, playerId], (current) => {
      const base = isObject(current) ? current : this.defaultTravelData(playerId);
      const merged = this.deepMerge(base, patch);
      const normalized = this.normalizeTravelData(playerId, merged, false);
      normalized.playerId = playerId;
      normalized.updatedAt = nowIso();
      if (!normalized.createdAt) {
        normalized.createdAt = normalized.updatedAt;
      }
      return normalized;
    }, this.defaultTravelData(playerId));
  }

  collectFragment(playerId, input = {}) {
    const add = input && input.amount !== undefined
      ? clampInt(toFiniteNumber(input.amount, 'amount'), 0, 1000)
      : 1;

    return this.dataStore.update([this.rootKey, playerId], (current) => {
      const merged = Object.assign({}, isObject(current) ? current : this.defaultTravelData(playerId));
      const fragments = isObject(merged.fragments) ? merged.fragments : this.defaultFragments();

      const previous = clampInt(fragments.collected, 0, fragments.limit);
      const nextRaw = previous + add;
      const next = Math.min(nextRaw, fragments.limit);
      const overflow = Math.max(0, nextRaw - fragments.limit);
      const accepted = next - previous;

      fragments.collected = next;
      fragments.totalCollected = clampInt((fragments.totalCollected || 0) + accepted, 0, Number.MAX_SAFE_INTEGER);

      merged.fragments = fragments;
      merged.updatedAt = nowIso();
      if (!merged.createdAt) {
        merged.createdAt = merged.updatedAt;
      }

      return merged;
    }, this.defaultTravelData(playerId));
  }

  resetTravelData(playerId) {
    const fresh = this.defaultTravelData(playerId);
    return this.dataStore.set([this.rootKey, playerId], fresh);
  }

  normalizeTravelData(playerId, data, partial) {
    const output = partial ? {} : this.defaultTravelData(playerId);
    if (!isObject(data)) {
      return output;
    }

    if (isObject(data.fragments)) {
      const df = this.defaultFragments();
      const mergedFragments = Object.assign({}, df, data.fragments);
      const limit = clampInt(toFiniteNumber(mergedFragments.limit, 'fragments.limit'), 1, 1000000);
      const collected = clampInt(toFiniteNumber(mergedFragments.collected, 'fragments.collected'), 0, 1000000);
      const totalCollected = clampInt(toFiniteNumber(mergedFragments.totalCollected, 'fragments.totalCollected'), 0, Number.MAX_SAFE_INTEGER);

      output.fragments = {
        collected: Math.min(collected, limit),
        limit,
        totalCollected,
      };
    }

    if (isObject(data.stages)) {
      const ds = this.defaultStages();
      const mergedStages = Object.assign({}, ds, data.stages);
      const totalStages = clampInt(toFiniteNumber(mergedStages.totalStages, 'stages.totalStages'), 1, 1000000);
      const currentStage = clampInt(toFiniteNumber(mergedStages.currentStage, 'stages.currentStage'), 1, totalStages);
      const clearedStages = Array.isArray(mergedStages.clearedStages)
        ? mergedStages.clearedStages.map((v) => clampInt(toFiniteNumber(v, 'clearedStages[]'), 1, totalStages))
        : ds.clearedStages;

      output.stages = {
        currentStage,
        totalStages,
        clearedStages: Array.from(new Set(clearedStages)).sort((a, b) => a - b),
      };
    }

    if (data.updatedAt && typeof data.updatedAt === 'string') {
      output.updatedAt = data.updatedAt;
    }
    if (data.createdAt && typeof data.createdAt === 'string') {
      output.createdAt = data.createdAt;
    }

    return output;
  }

  defaultTravelData(playerId) {
    return {
      playerId,
      fragments: this.defaultFragments(),
      stages: this.defaultStages(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  defaultFragments() {
    return {
      collected: 0,
      limit: this.defaultFragmentLimit,
      totalCollected: 0,
    };
  }

  defaultStages() {
    return {
      currentStage: 1,
      totalStages: this.defaultTotalStages,
      clearedStages: [],
    };
  }

  deepMerge(base, patch) {
    if (!isObject(base) || !isObject(patch)) {
      return isObject(patch) ? clone(patch) : clone(base);
    }

    const output = clone(base);
    for (const key of Object.keys(patch)) {
      const pv = patch[key];
      if (isObject(output[key]) && isObject(pv)) {
        output[key] = this.deepMerge(output[key], pv);
      } else if (pv !== undefined) {
        output[key] = clone(pv);
      }
    }
    return output;
  }

  normalizePlayerId(playerId) {
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('playerId is required');
    }
    return playerId;
  }
}

module.exports = {
  TravelService,
};
