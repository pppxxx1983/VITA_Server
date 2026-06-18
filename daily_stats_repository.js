class DailyStatsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        stat_date DATE NOT NULL PRIMARY KEY,
        login_count INT UNSIGNED NOT NULL DEFAULT 0,
        new_users INT UNSIGNED NOT NULL DEFAULT 0,
        peak_online INT UNSIGNED NOT NULL DEFAULT 0,
        avg_online INT UNSIGNED NOT NULL DEFAULT 0,
        paying_users INT UNSIGNED NOT NULL DEFAULT 0,
        retention_d1 INT UNSIGNED NOT NULL DEFAULT 0,
        retention_d1_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        retention_d3 INT UNSIGNED NOT NULL DEFAULT 0,
        retention_d3_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        retention_d7 INT UNSIGNED NOT NULL DEFAULT 0,
        retention_d7_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        retention_d15 INT UNSIGNED NOT NULL DEFAULT 0,
        retention_d15_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        player_id VARCHAR(191) NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency VARCHAR(32) NOT NULL DEFAULT 'CNY',
        product_id VARCHAR(191) NULL,
        paid_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_payment_player (player_id),
        INDEX idx_payment_date (paid_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_first_seen (
        player_id VARCHAR(191) NOT NULL PRIMARY KEY,
        first_seen_date DATE NOT NULL,
        first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_first_seen_date (first_seen_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_daily_logins (
        player_id VARCHAR(191) NOT NULL,
        login_date DATE NOT NULL,
        login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (player_id, login_date),
        INDEX idx_login_date (login_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS online_stats (
        stat_date DATE NOT NULL PRIMARY KEY,
        realtime_online INT UNSIGNED NOT NULL DEFAULT 0,
        avg_online INT UNSIGNED NOT NULL DEFAULT 0,
        total_online INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.addColumnIfMissing('daily_stats', 'peak_online', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'avg_online', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'paying_users', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'retention_d1', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'retention_d1_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00');
    await this.addColumnIfMissing('daily_stats', 'retention_d3', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'retention_d3_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00');
    await this.addColumnIfMissing('daily_stats', 'retention_d7', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'retention_d7_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00');
    await this.addColumnIfMissing('daily_stats', 'retention_d15', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('daily_stats', 'retention_d15_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  }

  async addColumnIfMissing(table, column, definition) {
    const [rows] = await this.pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, column],
    );
    if (rows.length === 0) {
      await this.pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  async recordLogin(playerId, date) {
    const loginDate = this.normalizeDate(date);
    const [result] = await this.pool.execute(
      `INSERT IGNORE INTO player_daily_logins (player_id, login_date, login_at)
       VALUES (?, ?, CURRENT_TIMESTAMP(3))`,
      [playerId, loginDate],
    );

    if (result.affectedRows > 0) {
      await this.pool.execute(
        `INSERT INTO daily_stats (stat_date, login_count, new_users)
         VALUES (?, 1, 0)
         ON DUPLICATE KEY UPDATE login_count = login_count + 1`,
        [loginDate],
      );
    }
    return { loginDate, isNewLogin: result.affectedRows > 0 };
  }

  async recordNewUser(playerId, date) {
    const statDate = this.normalizeDate(date);
    const [result] = await this.pool.execute(
      `INSERT IGNORE INTO player_first_seen (player_id, first_seen_date, first_seen_at)
       VALUES (?, ?, CURRENT_TIMESTAMP(3))`,
      [playerId, statDate],
    );

    if (result.affectedRows > 0) {
      await this.pool.execute(
        `INSERT INTO daily_stats (stat_date, login_count, new_users)
         VALUES (?, 1, 1)
         ON DUPLICATE KEY UPDATE
           login_count = login_count + 1,
           new_users = new_users + 1`,
        [statDate],
      );
    }
    return { statDate, isNewUser: result.affectedRows > 0 };
  }

  async recordPlayerActivity(playerId, date) {
    const statDate = this.normalizeDate(date);
    const newUserResult = await this.recordNewUser(playerId, statDate);
    if (!newUserResult.isNewUser) {
      await this.recordLogin(playerId, statDate);
    }
    return { statDate, isNewUser: newUserResult.isNewUser };
  }

  async recordPayment(playerId, amount, currency = 'CNY', productId = null, paidAt = null) {
    const [result] = await this.pool.execute(
      `INSERT INTO payment_records (player_id, amount, currency, product_id, paid_at)
       VALUES (?, ?, ?, ?, ?)`,
      [playerId, amount, currency, productId, paidAt || new Date()],
    );
    return { id: result.insertId };
  }

  normalizeDate(date) {
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    return this.normalizeDate(new Date());
  }
}

module.exports = { DailyStatsRepository };
