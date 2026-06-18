const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_USERS_DATA = {
  version: 1,
  users: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 用户表管理类
 * 字段: account(账号), gameName(游戏名), token(验证令牌), createdAt, updatedAt
 */
class UserTable {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = clone(DEFAULT_USERS_DATA);
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.flush();
      return;
    }

    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) {
      this.flush();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.data = {
        version: parsed.version || 1,
        users: isObject(parsed.users) ? parsed.users : {},
      };
    } catch {
      this.data = clone(DEFAULT_USERS_DATA);
      this.flush();
    }
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  /* ---------- 基础 CRUD ---------- */

  /**
   * 注册用户
   * @param {string} account - 账号（唯一）
   * @param {string} gameName - 游戏名
   * @returns {object} 用户信息（不含敏感字段的副本）
   */
  register(account, gameName, playerId) {
    if (!account || typeof account !== 'string') {
      throw new Error('account is required');
    }
    if (!gameName || typeof gameName !== 'string') {
      throw new Error('gameName is required');
    }
    if (this.data.users[account]) {
      throw new Error('account already exists');
    }

    const now = nowIso();
    const user = {
      account,
      gameName,
      playerId: playerId && typeof playerId === 'string' ? playerId : account,
      token: generateToken(),
      registrationTime: now,
      lastLoginTime: now,
      createdAt: now,
      updatedAt: now,
    };

    this.data.users[account] = user;
    this.flush();
    return this._safeUser(user, true);
  }

  /**
   * 删除用户
   */
  delete(account) {
    if (!this.data.users[account]) {
      return false;
    }
    delete this.data.users[account];
    this.flush();
    return true;
  }

  /**
   * 获取单个用户（内部完整数据）
   */
  _getRaw(account) {
    return this.data.users[account] || null;
  }

  /**
   * 获取单个用户（安全副本）
   */
  getUser(account) {
    const user = this._getRaw(account);
    return user ? this._safeUser(user) : null;
  }

  /**
   * 获取所有用户
   */
  listUsers() {
    return Object.values(this.data.users).map((u) => this._safeUser(u));
  }

  /**
   * 获取用户数量
   */
  getCount() {
    return Object.keys(this.data.users).length;
  }

  /**
   * 更新游戏名
   */
  updateGameName(account, gameName) {
    const user = this._getRaw(account);
    if (!user) {
      throw new Error('user not found');
    }
    if (!gameName || typeof gameName !== 'string') {
      throw new Error('gameName is required');
    }
    user.gameName = gameName;
    user.updatedAt = nowIso();
    this.flush();
    return this._safeUser(user);
  }

  /* ---------- Token 管理 ---------- */

  /**
   * 登录：刷新 token
   */
  login(account) {
    const user = this._getRaw(account);
    if (!user) {
      throw new Error('user not found');
    }
    if (!user.playerId) {
      user.playerId = user.account;
    }
    user.token = generateToken();
    user.lastLoginTime = nowIso();
    user.updatedAt = nowIso();
    this.flush();
    return this._safeUser(user, true);
  }

  /**
   * 登出：清空 token
   */
  logout(account) {
    const user = this._getRaw(account);
    if (!user) {
      throw new Error('user not found');
    }
    user.token = '';
    user.updatedAt = nowIso();
    this.flush();
    return this._safeUser(user);
  }

  /**
   * 验证 token
   * @param {string} account
   * @param {string} token
   * @returns {boolean}
   */
  verifyToken(account, token) {
    if (!account || !token) return false;
    const user = this._getRaw(account);
    if (!user || !user.token) return false;
    return user.token === token;
  }

  /**
   * 根据 token 查找用户
   */
  findByToken(token) {
    if (!token) return null;
    for (const user of Object.values(this.data.users)) {
      if (user.token === token) {
        return this._safeUser(user);
      }
    }
    return null;
  }

  /* ---------- HTTP 中间件 ---------- */

  /**
   * Express / 通用中间件：验证请求 token
   * 期望 header: x-account 和 x-token
   */
  middleware() {
    return (req, res, next) => {
      const account = req.headers['x-account'] || '';
      const token = req.headers['x-token'] || '';

      if (!this.verifyToken(account, token)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }

      req.currentUser = this.getUser(account);
      next();
    };
  }

  /**
   * 原生 http 模块验证辅助函数
   */
  verifyRequestHeaders(headers) {
    const account = headers['x-account'] || headers['X-Account'] || '';
    const token = headers['x-token'] || headers['X-Token'] || '';
    return this.verifyToken(account, token);
  }

  /* ---------- 工具方法 ---------- */

  _safeUser(user, includeToken = false) {
    const safeUser = {
      account: user.account,
      gameName: user.gameName,
      playerId: user.playerId || user.account,
      registrationTime: user.registrationTime,
      lastLoginTime: user.lastLoginTime,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    if (includeToken) {
      safeUser.token = user.token;
    }
    return safeUser;
  }

  getRawData() {
    return clone(this.data);
  }
}

module.exports = {
  UserTable,
  generateToken,
};
