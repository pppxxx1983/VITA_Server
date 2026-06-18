const fs = require('fs');
const path = require('path');
const { createMysqlPool, verifyMysql } = require('../mysql_database');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'server.config.json'), 'utf8'));
const pool = createMysqlPool(config);

async function columnExists(table, column) {
  const database = config.mysql.database;
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [database, table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const database = config.mysql.database;
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [database, table, index]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition, afterColumn) {
  if (await columnExists(table, column)) {
    console.log(`Column ${table}.${column} already exists, skipping.`);
    return;
  }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition} AFTER ${afterColumn}`);
  console.log(`Added column ${table}.${column}.`);
}

async function addIndex(table, index, columns) {
  if (await indexExists(table, index)) {
    console.log(`Index ${index} on ${table} already exists, skipping.`);
    return;
  }
  await pool.query(`ALTER TABLE ${table} ADD INDEX ${index} (${columns})`);
  console.log(`Added index ${index} on ${table}.`);
}

async function main() {
  await verifyMysql(pool);

  await addColumn('game_users', 'registration_time', 'DATETIME(3) NULL', 'token');
  await addColumn('game_users', 'last_login_time', 'DATETIME(3) NULL', 'registration_time');
  await addIndex('game_users', 'idx_game_users_last_login', 'last_login_time');

  await addColumn('player_profiles', 'registration_time', 'DATETIME(3) NULL', 'extra_data');
  await addColumn('player_profiles', 'last_login_time', 'DATETIME(3) NULL', 'registration_time');

  console.log('Time fields migration completed.');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
