const VALID_MODES = ['normal', 'signin', 'travel'];

class DifficultyRepository {
  constructor(pool) { this.pool = pool; }
  async ensureTable() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS game_difficulty_levels (
      level INT UNSIGNED NOT NULL PRIMARY KEY, difficulty TINYINT UNSIGNED NOT NULL,
      grid_w SMALLINT UNSIGNED NOT NULL, grid_h SMALLINT UNSIGNED NOT NULL,
      max_layers SMALLINT UNSIGNED NOT NULL, min_tiles SMALLINT UNSIGNED NOT NULL,
      max_tiles SMALLINT UNSIGNED NOT NULL, chaos DECIMAL(5,4) NOT NULL,
      min_available_pairs SMALLINT UNSIGNED NOT NULL, hidden_ratio DECIMAL(5,4) NOT NULL,
      special_pair_count SMALLINT UNSIGNED NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const ensureColumn = async (table, column, definition) => {
      const [rows] = await this.pool.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
        [table, column]
      );
      if (!rows[0]) await this.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    };
    await this.pool.query(`CREATE TABLE IF NOT EXISTS game_difficulty_ranges (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, start_level INT UNSIGNED NOT NULL,
      end_level INT UNSIGNED NOT NULL, difficulty TINYINT UNSIGNED NOT NULL,
      grid_w SMALLINT UNSIGNED NOT NULL, grid_h SMALLINT UNSIGNED NOT NULL,
      max_layers SMALLINT UNSIGNED NOT NULL, min_tiles SMALLINT UNSIGNED NOT NULL,
      max_tiles SMALLINT UNSIGNED NOT NULL, chaos DECIMAL(5,4) NOT NULL,
      min_available_pairs SMALLINT UNSIGNED NOT NULL, hidden_ratio DECIMAL(5,4) NOT NULL,
      special_pair_count SMALLINT UNSIGNED NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_difficulty_range (start_level, end_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await ensureColumn('game_difficulty_ranges', 'mode', "VARCHAR(32) NOT NULL DEFAULT 'normal'");
    await ensureColumn('game_difficulty_ranges', 'curve_type', "VARCHAR(16) NOT NULL DEFAULT 'wave'");
    await ensureColumn('game_difficulty_ranges', 'curve_amplitude', 'DECIMAL(6,4) NOT NULL DEFAULT 0.1000');
    await ensureColumn('game_difficulty_ranges', 'curve_cycles', 'DECIMAL(6,2) NOT NULL DEFAULT 1.00');
    await ensureColumn('game_difficulty_levels', 'mode', "VARCHAR(32) NOT NULL DEFAULT 'normal'");
    await ensureColumn('game_difficulty_levels', 'range_id', 'INT UNSIGNED NULL');
    await ensureColumn('game_difficulty_levels', 'difficulty_label', "VARCHAR(16) NOT NULL DEFAULT 'normal'");
    await ensureColumn('game_difficulty_levels', 'curve_factor', 'DECIMAL(7,4) NOT NULL DEFAULT 1.0000');
    await ensureColumn('game_difficulty_levels', 'manual_override', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.migrateDifficultyPrimaryKey();
    await this.ensureDifficultyRangeIndex();
  }

  async migrateDifficultyPrimaryKey() {
    const [rows] = await this.pool.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_difficulty_levels'
       AND CONSTRAINT_NAME = 'PRIMARY' AND CONSTRAINT_TYPE = 'PRIMARY KEY' LIMIT 1`
    );
    if (!rows[0]) return;
    const [cols] = await this.pool.query(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_difficulty_levels'
       AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`
    );
    const pkCols = cols.map((row) => row.COLUMN_NAME);
    if (pkCols.length === 1 && pkCols[0] === 'level') {
      await this.pool.query('ALTER TABLE game_difficulty_levels DROP PRIMARY KEY, ADD PRIMARY KEY (mode, level)');
    }
  }

  async ensureDifficultyRangeIndex() {
    const [rows] = await this.pool.query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_difficulty_ranges'
       AND INDEX_NAME = 'idx_difficulty_range' LIMIT 1`
    );
    if (!rows[0]) {
      await this.pool.query('ALTER TABLE game_difficulty_ranges ADD INDEX idx_difficulty_range (mode, start_level, end_level)');
      return;
    }
    const [cols] = await this.pool.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_difficulty_ranges'
       AND INDEX_NAME = 'idx_difficulty_range' ORDER BY SEQ_IN_INDEX`
    );
    const idxCols = cols.map((row) => row.COLUMN_NAME);
    if (idxCols[0] !== 'mode') {
      await this.pool.query('ALTER TABLE game_difficulty_ranges DROP INDEX idx_difficulty_range, ADD INDEX idx_difficulty_range (mode, start_level, end_level)');
    }
  }

  async getConfig() {
    const [rows] = await this.pool.query(`SELECT id, mode, start_level AS startLevel, end_level AS endLevel,
      difficulty, grid_w AS gridW, grid_h AS gridH,
      max_layers AS maxLayers, min_tiles AS minTiles, max_tiles AS maxTiles, chaos,
      min_available_pairs AS minAvailablePairs, hidden_ratio AS hiddenRatio,
      special_pair_count AS specialPairCount, curve_type AS curveType, curve_amplitude AS curveAmplitude,
      curve_cycles AS curveCycles FROM game_difficulty_ranges ORDER BY mode, start_level, end_level`);
    const [levels] = await this.pool.query(`SELECT mode,level,difficulty,difficulty_label AS difficultyLabel,manual_override AS manualOverride,
      curve_factor AS curveFactor,grid_w AS gridW,grid_h AS gridH,max_layers AS maxLayers,min_tiles AS minTiles,
      max_tiles AS maxTiles,chaos,min_available_pairs AS minAvailablePairs,hidden_ratio AS hiddenRatio,
      special_pair_count AS specialPairCount FROM game_difficulty_levels WHERE range_id IS NOT NULL ORDER BY mode, level`);
    const ranges = rows.map((row) => ({
      ...row, chaos: Number(row.chaos), hiddenRatio: Number(row.hiddenRatio),
      curveAmplitude: Number(row.curveAmplitude), curveCycles: Number(row.curveCycles),
    }));
    const exactLevels = levels.map((row) => ({ ...row, chaos: Number(row.chaos), hiddenRatio: Number(row.hiddenRatio), curveFactor: Number(row.curveFactor) }));
    const modes = {};
    for (const mode of VALID_MODES) {
      modes[mode] = {
        ranges: ranges.filter((row) => (row.mode || 'normal') === mode),
        levels: exactLevels.filter((row) => (row.mode || 'normal') === mode),
      };
    }
    return {
      version: rows.length ? `db-${Date.now()}` : '',
      modes,
      ranges: modes.normal.ranges,
      levels: modes.normal.levels,
    };
  }
}
module.exports = { DifficultyRepository };
