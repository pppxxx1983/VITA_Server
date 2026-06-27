const CHALLENGE_GOAL = 20;
const CHALLENGE_WINDOW_MS = 60 * 60 * 1000;

function normalizePlayerId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error('playerId is required');
  }
  return text;
}

function toDateString(date) {
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isExpired(openedAt) {
  if (!openedAt) return false;
  return Date.now() - new Date(openedAt).getTime() >= CHALLENGE_WINDOW_MS;
}

class DailyChallengeService {
  constructor(repository) {
    this.repository = repository;
  }

  registerRoutes(routes) {
    routes.get('/api/daily-challenge/:playerId', async (ctx) => {
      const playerId = normalizePlayerId(ctx.params.playerId);
      const date = toDateString(new Date());
      const challenge = await this.getStatus(playerId, date);
      ctx.json(200, { ok: true, playerId, date, challenge });
    });

    routes.post('/api/daily-challenge/:playerId/open', async (ctx) => {
      const playerId = normalizePlayerId(ctx.params.playerId);
      const date = toDateString(new Date());
      const challenge = await this.openChallenge(playerId, date);
      ctx.json(200, { ok: true, playerId, date, challenge });
    });

    routes.post('/api/daily-challenge/:playerId/settle', async (ctx) => {
      const playerId = normalizePlayerId(ctx.params.playerId);
      const date = toDateString(new Date());
      const body = await ctx.body();
      const specialScore = Number(body && body.specialScore) || 0;
      const result = await this.settle(playerId, date, specialScore);
      ctx.json(200, { ok: true, playerId, date, ...result });
    });
  }

  async getStatus(playerId, date) {
    let challenge = await this.repository.getOrCreate(playerId, date);

    if (challenge.opened && !challenge.completed && isExpired(challenge.openedAt)) {
      challenge = await this.repository.markCompleted(playerId, date);
    }

    return this._toClientShape(challenge);
  }

  async openChallenge(playerId, date) {
    const current = await this.getStatus(playerId, date);

    if (current.completed) {
      throw new Error('challenge already completed today');
    }

    if (current.opened) {
      return current;
    }

    const challenge = await this.repository.openChallenge(playerId, date);
    return this._toClientShape(challenge);
  }

  async settle(playerId, date, specialScore) {
    let challenge = await this.getStatus(playerId, date);

    if (!challenge.opened) {
      return { challenge, rewardGranted: false, reward: null };
    }

    if (challenge.completed) {
      return { challenge, rewardGranted: false, reward: null };
    }

    if (specialScore > 0) {
      challenge = await this.repository.addSpecialScore(playerId, date, specialScore);
      challenge = this._toClientShape(challenge);
    }

    const rewardGranted = challenge.totalSpecialScore >= CHALLENGE_GOAL && !challenge.rewarded;

    if (rewardGranted) {
      challenge = await this.repository.markRewarded(playerId, date);
      challenge = this._toClientShape(challenge);
    }

    return {
      challenge,
      rewardGranted,
      reward: rewardGranted ? { refreshCount: 1, hintCount: 1 } : null,
    };
  }

  _toClientShape(challenge) {
    const expired = challenge.opened && isExpired(challenge.openedAt);
    return {
      opened: challenge.opened,
      openedAt: challenge.openedAt,
      totalSpecialScore: challenge.totalSpecialScore,
      completed: challenge.completed || expired,
      rewarded: challenge.rewarded,
      expired,
    };
  }
}

module.exports = { DailyChallengeService, CHALLENGE_GOAL, CHALLENGE_WINDOW_MS };
