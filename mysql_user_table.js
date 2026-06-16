const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

class MysqlUserTable {
  constructor(pool) {
    this.pool = pool;
  }

  async register(account, gameName, playerId) {
    if (!account || typeof account !== 'string') throw new Error('account is required');
    if (!gameName || typeof gameName !== 'string') throw new Error('gameName is required');
    const normalizedPlayerId = playerId && typeof playerId === 'string' ? playerId : account;
    const token = generateToken();
    try {
      await this.pool.execute(
        `INSERT INTO game_users (account, player_id, game_name, token)
         VALUES (?, ?, ?, ?)`,
        [account, normalizedPlayerId, gameName, token]
      );
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') throw new Error('account already exists');
      throw error;
    }
    return this.getUser(account, true);
  }

  async delete(account) {
    const [result] = await this.pool.execute('DELETE FROM game_users WHERE account = ?', [account]);
    return result.affectedRows > 0;
  }

  async getUser(account, includeToken = false) {
    const [rows] = await this.pool.execute(
      `SELECT account, player_id, game_name, token, created_at, updated_at
       FROM game_users WHERE account = ? LIMIT 1`,
      [account]
    );
    return rows[0] ? this.safeUser(rows[0], includeToken) : null;
  }

  async listUsers() {
    const [rows] = await this.pool.query(
      `SELECT account, player_id, game_name, created_at, updated_at
       FROM game_users ORDER BY created_at DESC`
    );
    return rows.map((row) => this.safeUser(row));
  }

  async updateGameName(account, gameName) {
    if (!gameName || typeof gameName !== 'string') throw new Error('gameName is required');
    const [result] = await this.pool.execute(
      'UPDATE game_users SET game_name = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE account = ?',
      [gameName, account]
    );
    if (!result.affectedRows) throw new Error('user not found');
    return this.getUser(account);
  }

  async login(account) {
    const token = generateToken();
    const [result] = await this.pool.execute(
      'UPDATE game_users SET token = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE account = ?',
      [token, account]
    );
    if (!result.affectedRows) throw new Error('user not found');
    return this.getUser(account, true);
  }

  async logout(account) {
    const [result] = await this.pool.execute(
      'UPDATE game_users SET token = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE account = ?',
      [account]
    );
    if (!result.affectedRows) throw new Error('user not found');
    return this.getUser(account);
  }

  async verifyRequestHeaders(headers) {
    const account = headers['x-account'];
    const token = headers['x-token'];
    if (!account || !token) return false;
    const [rows] = await this.pool.execute(
      'SELECT 1 FROM game_users WHERE account = ? AND token = ? LIMIT 1',
      [account, token]
    );
    return rows.length > 0;
  }

  safeUser(row, includeToken = false) {
    const user = {
      account: row.account,
      gameName: row.game_name,
      playerId: row.player_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (includeToken) user.token = row.token;
    return user;
  }
}

module.exports = { MysqlUserTable };
