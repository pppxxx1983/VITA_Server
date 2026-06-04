/**
 * 用户表 HTTP 客户端
 * 对应服务端 /api/user/* 接口
 */
class UserClient {
  constructor(baseUrl = 'http://127.0.0.1:8787') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.account = '';
    this.token = '';
  }

  async request(method, path, body = null, withAuth = false) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (withAuth && this.account && this.token) {
      options.headers['x-account'] = this.account;
      options.headers['x-token'] = this.token;
    }

    if (body !== null) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({ ok: false, error: 'invalid json' }));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  /* ---------- 认证状态 ---------- */

  setAuth(account, token) {
    this.account = account;
    this.token = token;
  }

  clearAuth() {
    this.account = '';
    this.token = '';
  }

  isLoggedIn() {
    return !!(this.account && this.token);
  }

  /* ---------- 用户接口 ---------- */

  async register(account, gameName) {
    const data = await this.request('POST', '/api/user/register', { account, gameName });
    if (data.user && data.user.token) {
      this.setAuth(data.user.account, data.user.token);
    }
    return data.user;
  }

  async login(account) {
    const data = await this.request('POST', '/api/user/login', { account });
    if (data.user && data.user.token) {
      this.setAuth(data.user.account, data.user.token);
    }
    return data.user;
  }

  async logout() {
    if (!this.account) throw new Error('not logged in');
    const data = await this.request('POST', '/api/user/logout', { account: this.account }, true);
    this.clearAuth();
    return data.user;
  }

  async getProfile() {
    if (!this.account) throw new Error('not logged in');
    return this.request('GET', `/api/user/profile/${this.account}`, null, true);
  }

  async updateGameName(gameName) {
    if (!this.account) throw new Error('not logged in');
    return this.request('PATCH', `/api/user/profile/${this.account}`, { gameName }, true);
  }

  async deleteAccount() {
    if (!this.account) throw new Error('not logged in');
    const data = await this.request('DELETE', `/api/user/account/${this.account}`, null, true);
    this.clearAuth();
    return data.deleted;
  }

  /* ---------- 管理接口（需管理员权限或本地调用） ---------- */

  async listUsers() {
    return this.request('GET', '/api/user/list', null, true);
  }
}

module.exports = { UserClient };
