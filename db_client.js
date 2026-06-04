/**
 * HTTP API 客户端封装
 * 用于浏览器或 Node 环境调用本服务的数据库接口
 */
class DbClient {
  constructor(baseUrl = 'http://127.0.0.1:8787') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
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

  /* ---------- 全局数据读写 ---------- */

  async readGlobal(playerId) {
    const data = await this.request('GET', `/api/global/${playerId}`);
    return data.global;
  }

  async writeGlobal(playerId, global) {
    const data = await this.request('PUT', `/api/global/${playerId}`, global);
    return data.global;
  }

  async updateGlobal(playerId, patch) {
    const data = await this.request('PATCH', `/api/global/${playerId}`, patch);
    return data.global;
  }

  /* ---------- 分区数据读写 ---------- */

  async readSections(playerId) {
    const data = await this.request('GET', `/api/global/${playerId}/sections`);
    return data.sections;
  }

  async readSection(playerId, section) {
    const data = await this.request('GET', `/api/global/${playerId}/sections/${section}`);
    return data.data;
  }

  async writeSection(playerId, section, body) {
    const data = await this.request('PUT', `/api/global/${playerId}/sections/${section}`, body);
    return data.data;
  }

  async updateSection(playerId, section, patch) {
    const data = await this.request('PATCH', `/api/global/${playerId}/sections/${section}`, patch);
    return data.data;
  }

  /* ---------- 便捷封装 ---------- */

  async readKey(playerId, section, key) {
    const sec = await this.readSection(playerId, section);
    return sec[key];
  }

  async writeKey(playerId, section, key, value) {
    const patch = { [key]: value };
    return this.updateSection(playerId, section, patch);
  }

  async health() {
    const data = await this.request('GET', '/health');
    return data;
  }
}

module.exports = { DbClient };
