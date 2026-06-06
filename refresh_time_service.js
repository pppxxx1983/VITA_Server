/**
 * 刷新时间服务
 * 管理闯关和旅行的刷新时间（基于 UTC+8 北京时间）
 * - 闯关：每天 0 点刷新（24 小时周期）
 * - 旅行：每 3 天刷新一次
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toBeijingTime(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function beijingDateParts(date) {
  const bj = toBeijingTime(date);
  return {
    year: bj.getUTCFullYear(),
    month: bj.getUTCMonth(),
    day: bj.getUTCDate(),
    hour: bj.getUTCHours(),
    minute: bj.getUTCMinutes(),
    second: bj.getUTCSeconds(),
    ms: bj.getUTCMilliseconds(),
  };
}

function beijingStartOfDay(date) {
  const parts = beijingDateParts(date);
  const bjStart = Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0, 0);
  return new Date(bjStart - 8 * 60 * 60 * 1000);
}

class RefreshTimeService {
  constructor(options = {}) {
    this.travelCycleDays = options.travelCycleDays || 3;
    this.baseDate = options.baseDate || beijingStartOfDay(new Date('2026-01-01T00:00:00.000+08:00'));
  }

  /**
   * 获取下一次闯关刷新时间（明天北京时间 0 点）
   * @returns {Date}
   */
  getNextLevelEndTime() {
    const now = new Date();
    const todayBeijing = beijingStartOfDay(now);
    return new Date(todayBeijing.getTime() + MS_PER_DAY);
  }

  /**
   * 获取下一次旅行刷新时间（基于 3 天周期，北京时间 0 点）
   * @returns {Date}
   */
  getNextTravelEndTime() {
    const now = new Date();
    const todayBeijing = beijingStartOfDay(now);

    const diffMs = todayBeijing.getTime() - this.baseDate.getTime();
    const diffDays = diffMs / MS_PER_DAY;

    // 当前处于第几个周期（从 0 开始）
    const currentCycle = Math.floor(diffDays / this.travelCycleDays);

    // 下一个周期的开始时间
    const nextCycleDays = (currentCycle + 1) * this.travelCycleDays;
    return new Date(this.baseDate.getTime() + nextCycleDays * MS_PER_DAY);
  }

  /**
   * 获取两个结束时间
   * @returns {{ levelEndTime: string, travelEndTime: string }}
   */
  getRefreshTimes() {
    const levelEndTime = this.getNextLevelEndTime().toISOString();
    const travelEndTime = this.getNextTravelEndTime().toISOString();

    return {
      levelEndTime,
      travelEndTime,
    };
  }

  registerRoutes(routes) {
    const handler = (ctx) => {
      const times = this.getRefreshTimes();
      ctx.json(200, { ok: true, ...times });
    };
    routes.get('/api/refresh-times', handler);
    routes.post('/api/refresh-times', handler);
  }
}

module.exports = {
  RefreshTimeService,
};
