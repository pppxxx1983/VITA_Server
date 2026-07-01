const DEFAULT_CHANCES = {
  8: 0.25,
  7: 0.40,
  6: 0.60,
  5: 0.80,
  4: 0.00,
  3: 0.00,
  2: 0.00,
  1: 0.00,
};

class AutoMatchConfigRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auto_match_config (
        pair_count TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        chance DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.seedDefaults();
  }

  async seedDefaults() {
    const [rows] = await this.pool.query('SELECT pair_count FROM auto_match_config WHERE pair_count BETWEEN 1 AND 8');
    const existing = new Set((rows || []).map((row) => row.pair_count));
    const missing = Object.keys(DEFAULT_CHANCES)
      .map(Number)
      .filter((pairCount) => !existing.has(pairCount));
    if (!missing.length) return;
    const values = missing.map((pairCount) => [pairCount, DEFAULT_CHANCES[pairCount]]);
    await this.pool.query('INSERT INTO auto_match_config (pair_count, chance) VALUES ?', [values]);
  }

  async getConfig() {
    const [rows] = await this.pool.query('SELECT pair_count, chance FROM auto_match_config WHERE pair_count BETWEEN 1 AND 8 ORDER BY pair_count DESC');
    const chances = {};
    for (let i = 1; i <= 8; i += 1) {
      chances[i] = DEFAULT_CHANCES[i];
    }
    for (const row of rows || []) {
      const pairCount = Number(row.pair_count);
      if (pairCount >= 1 && pairCount <= 8) {
        chances[pairCount] = Number(row.chance);
      }
    }
    return { chances };
  }

  async setConfig(chances) {
    const values = [];
    for (let i = 1; i <= 8; i += 1) {
      const chance = chances && typeof chances[i] === 'number' ? chances[i] : DEFAULT_CHANCES[i];
      values.push([i, Math.max(0, Math.min(1, Number(chance) || 0))]);
    }
    await this.pool.query('INSERT INTO auto_match_config (pair_count, chance) VALUES ? ON DUPLICATE KEY UPDATE chance=VALUES(chance)', [values]);
    return this.getConfig();
  }

  async resetConfig() {
    const values = Object.keys(DEFAULT_CHANCES).map((pairCount) => [Number(pairCount), DEFAULT_CHANCES[pairCount]]);
    await this.pool.query('INSERT INTO auto_match_config (pair_count, chance) VALUES ? ON DUPLICATE KEY UPDATE chance=VALUES(chance)', [values]);
    return this.getConfig();
  }
}

module.exports = { AutoMatchConfigRepository, DEFAULT_CHANCES };
