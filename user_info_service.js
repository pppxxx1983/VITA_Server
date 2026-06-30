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

function copyTextField(output, data, key) {
  const value = normalizeText(data[key]);
  if (value !== undefined) {
    output[key] = value;
  }
}

class UserInfoService {
  constructor(dataStore, options = {}) {
    this.dataStore = dataStore;
    this.dailyStatsRepository = options.dailyStatsRepository || null;
    this.rootKey = options.rootKey || 'userInfos';
  }

  registerRoutes(routes) {
    routes.get('/api/user/info/:playerId', async (ctx) => {
      const playerId = this.normalizePlayerId(ctx.params.playerId);
      console.log(`[userInfo] GET /api/user/info/${playerId}`);
      const userInfo = await this.getUserInfo(playerId);
      await this.recordActivity(playerId);
      ctx.json(200, { ok: true, playerId, userInfo });
    });

    routes.post('/api/user/info/:playerId', (ctx) => this.patchUserInfoRoute(ctx));
    routes.patch('/api/user/info/:playerId', (ctx) => this.patchUserInfoRoute(ctx));
  }

  async patchUserInfoRoute(ctx) {
    const playerId = this.normalizePlayerId(ctx.params.playerId);
    const body = await ctx.body();
    console.log(`[userInfo] ${ctx.req.method} /api/user/info/${playerId}`, JSON.stringify(body));
    const userInfo = await this.patchUserInfo(playerId, body);
    await this.recordActivity(playerId);
    ctx.json(200, { ok: true, playerId, userInfo });
  }

  async getUserInfo(playerId) {
    const saved = await this.dataStore.get(playerId);
    const exists = isObject(saved);
    const userInfo = this.normalizeUserInfo(playerId, exists ? saved : {}, false);
    userInfo.exists = exists;
    return userInfo;
  }

  async patchUserInfo(playerId, patch) {
    if (!isObject(patch)) {
      throw new Error('userInfo body must be a JSON object');
    }

    const current = await this.dataStore.get(playerId);
    const merged = Object.assign({}, isObject(current) ? current : this.defaultUserInfo(playerId));
    const normalizedPatch = this.normalizeUserInfo(playerId, patch, true);
    Object.assign(merged, normalizedPatch, { playerId, updatedAt: nowIso() });
    if (!merged.createdAt) merged.createdAt = merged.updatedAt;
    if (!merged.registrationTime) merged.registrationTime = merged.createdAt;
    return this.dataStore.upsert(playerId, merged);
  }

  async recordActivity(playerId) {
    if (!this.dailyStatsRepository) return;
    try {
      await this.dailyStatsRepository.recordPlayerActivity(playerId, new Date());
    } catch (error) {
      console.error(`[userInfo] failed to record activity for ${playerId}:`, error.message);
    }
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

    const ageSegment = normalizeId(data.ageSegment, 'ageSegment');
    if (ageSegment !== undefined) {
      output.ageSegment = ageSegment;
    }

    if (data.registrationTime !== undefined) {
      output.registrationTime = data.registrationTime;
    }
    if (data.lastLoginTime !== undefined) {
      output.lastLoginTime = data.lastLoginTime;
    }

    [
      'email',
      'googleId',
      'rawGoogleId',
      'account',
      'loginType',
      'displayId',
      'avatarFile',
    ].forEach((key) => copyTextField(output, data, key));

    // avatarUrl/avatarSourceUrl can be explicitly cleared with an empty string
    if (data.avatarUrl !== undefined) {
      output.avatarUrl = normalizeText(data.avatarUrl) || '';
    }
    if (data.avatarSourceUrl !== undefined) {
      output.avatarSourceUrl = normalizeText(data.avatarSourceUrl) || '';
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
    const now = nowIso();
    return {
      playerId,
      avatarId: 0,
      avatarIndex: 0,
      avatarFrameId: 0,
      frameIndex: 0,
      perfectComboStreak: 0,
      registrationTime: now,
      lastLoginTime: null,
      createdAt: now,
      updatedAt: now,
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
