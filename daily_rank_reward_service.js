const REWARDS = {
  1: { refreshCount: 5, hintCount: 5 },
  2: { refreshCount: 3, hintCount: 3 },
  3: { refreshCount: 1, hintCount: 1 },
};

class DailyRankRewardService {
  constructor(repository) {
    this.repository = repository;
  }

  async settleBefore(today) {
    return this.repository.settleBefore(today, REWARDS);
  }

  async getPending(playerId) {
    if (!playerId) return null;
    return this.repository.getPending(playerId);
  }

  async claim(playerId, rewardId, multiplier) {
    if (!playerId || !Number.isSafeInteger(rewardId) || rewardId <= 0) {
      throw new Error('playerId and valid rewardId are required');
    }
    const safeMultiplier = multiplier === 2 ? 2 : 1;
    return this.repository.claim(playerId, rewardId, safeMultiplier);
  }
}

module.exports = { DailyRankRewardService, REWARDS };
