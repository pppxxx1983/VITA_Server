function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return Math.max(0, Math.floor(numberValue));
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text ? text : undefined;
}

class UserInfoService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.rootKey = options.rootKey || 'userInfos';
  }

  registerRoutes(routes) {
    routes.get('/api/user/info/:playerId', (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      console.log(`[userInfo] GET /api/user/info/${playerId}`);
      ctx.json(200, { ok: true, playerId, userInfo: this.getUserInfo(playerId) });
    });

    routes.post('/api/user/info/:playerId', (ctx) => this.patchUserInfoRoute(ctx));
    routes.patch('/api/user/info/:playerId', (ctx) => this.patchUserInfoRoute(ctx));
  }

  async patchUserInfoRoute(ctx) {
    const playerId = this.normalizePlayerId(ctx.params.playerId);
    const body = await ctx.body();
    console.log(`[userInfo] ${ctx.req.method} /api/user/info/${playerId}`, JSON.stringify(body));
    const userInfo = this.patchUserInfo(playerId, body);
    ctx.json(200, { ok: true, playerId, userInfo });
  }

  getUserInfo(playerId) {
    const saved = this.dataStore.get([this.rootKey, playerId], null);
    const exists = isObject(saved);
    const userInfo = this.normalizeUserInfo(playerId, exists ? saved : {}, false);
    userInfo.exists = exists;
    return userInfo;
  }

  patchUserInfo(playerId, patch) {
    if (!isObject(patch)) {
      throw new Error('userInfo body must be a JSON object');
    }

    return this.dataStore.update([this.rootKey, playerId], (current) => {
      const merged = Object.assign({}, isObject(current) ? current : {});
      const normalizedPatch = this.normalizeUserInfo(playerId, patch, true);
      Object.assign(merged, normalizedPatch, {
        playerId,
        updatedAt: nowIso(),
      });
      if (!merged.createdAt) {
        merged.createdAt = merged.updatedAt;
      }
      return merged;
    }, this.defaultUserInfo(playerId));
  }

  normalizeUserInfo(playerId, data, partial) {
    const output = partial ? {} : this.defaultUserInfo(playerId);
    const avatarId = normalizeId(data.avatarId !== undefined ? data.avatarId : data.avatarIndex, 'avatarId');
    const avatarFrameId = normalizeId(
      data.avatarFrameId !== undefined ? data.avatarFrameId : data.frameIndex,
      'avatarFrameId'
    );

    if (avatarId !== undefined) {
      output.avatarId = avatarId;
      output.avatarIndex = avatarId;
    }
    if (avatarFrameId !== undefined) {
      output.avatarFrameId = avatarFrameId;
      output.frameIndex = avatarFrameId;
    }

    const name = normalizeText(
      data.name !== undefined
        ? data.name
        : (data.nickname !== undefined
          ? data.nickname
          : (data.playerName !== undefined ? data.playerName : data.displayName))
    );
    if (name !== undefined) {
      output.name = name;
      output.nickname = name;
    }

    if (!partial) {
      return Object.assign(output, clone(data || {}), {
        playerId,
        avatarId: avatarId !== undefined ? avatarId : output.avatarId,
        avatarIndex: avatarId !== undefined ? avatarId : output.avatarIndex,
        avatarFrameId: avatarFrameId !== undefined ? avatarFrameId : output.avatarFrameId,
        frameIndex: avatarFrameId !== undefined ? avatarFrameId : output.frameIndex,
      });
    }

    return output;
  }

  defaultUserInfo(playerId) {
    return {
      playerId,
      avatarId: 0,
      avatarIndex: 0,
      avatarFrameId: 0,
      frameIndex: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  normalizePlayerId(playerId) {
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('playerId is required');
    }
    return playerId;
  }
}

module.exports = {
  UserInfoService,
};
