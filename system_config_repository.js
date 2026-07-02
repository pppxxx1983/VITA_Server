const DEFAULT_AGE_SEGMENT_LABELS = ['0-35', '35-55', '55+'];

class SystemConfigRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        config_key VARCHAR(64) NOT NULL PRIMARY KEY,
        config_value TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.seedDefaults();
  }

  async seedDefaults() {
    const keys = ['age_segment_1', 'age_segment_2', 'age_segment_3'];
    const [rows] = await this.pool.query(
      'SELECT config_key FROM system_config WHERE config_key IN (?, ?, ?)',
      keys,
    );
    const existing = new Set((rows || []).map((row) => row.config_key));
    const missing = keys.filter((key, index) => !existing.has(key));
    if (!missing.length) return;
    const values = missing.map((key, index) => {
      const value = DEFAULT_AGE_SEGMENT_LABELS[keys.indexOf(key)];
      return [key, value];
    });
    await this.pool.query('INSERT INTO system_config (config_key, config_value) VALUES ?', [values]);
  }

  async getAgeSegmentLabels() {
    const keys = ['age_segment_1', 'age_segment_2', 'age_segment_3'];
    const [rows] = await this.pool.query(
      'SELECT config_key, config_value FROM system_config WHERE config_key IN (?, ?, ?)',
      keys,
    );
    const map = new Map((rows || []).map((row) => [row.config_key, String(row.config_value)]));
    return keys.map((key, index) => {
      const value = map.get(key);
      return value && value.trim() ? value.trim() : DEFAULT_AGE_SEGMENT_LABELS[index];
    });
  }
}

module.exports = { SystemConfigRepository, DEFAULT_AGE_SEGMENT_LABELS };
