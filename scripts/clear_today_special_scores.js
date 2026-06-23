const mysql = require('mysql2/promise');
const config = require('../server.config.json');

function toBeijingDateString(date) {
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    connectionLimit: 1,
  });

  const today = toBeijingDateString(new Date());
  console.log(`[clear] today (Beijing): ${today}`);

  try {
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS count FROM daily_special_scores WHERE rank_date = ?',
      [today]
    );
    const count = countRows[0].count;
    console.log(`[clear] found ${count} record(s) for ${today}`);

    if (count === 0) {
      console.log('[clear] nothing to delete');
      return;
    }

    const [result] = await pool.execute(
      'DELETE FROM daily_special_scores WHERE rank_date = ?',
      [today]
    );
    console.log(`[clear] deleted ${result.affectedRows} row(s)`);
  } catch (error) {
    console.error('[clear] failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
