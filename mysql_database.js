const mysql = require('mysql2/promise');

function createMysqlPool(config = {}) {
  const mysqlConfig = config.mysql || {};
  return mysql.createPool({
    host: process.env.MYSQL_HOST || mysqlConfig.host || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || mysqlConfig.port || 3306),
    user: process.env.MYSQL_USER || mysqlConfig.user || 'root',
    password: process.env.MYSQL_PASSWORD || mysqlConfig.password || '',
    database: process.env.MYSQL_DATABASE || mysqlConfig.database || 'vita_game',
    charset: 'utf8mb4',
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || mysqlConfig.connectionLimit || 10),
    waitForConnections: true,
    queueLimit: 0,
    dateStrings: true,
  });
}

async function verifyMysql(pool) {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

module.exports = {
  createMysqlPool,
  verifyMysql,
};
