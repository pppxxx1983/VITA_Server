const fs = require('fs');
const path = require('path');
const { SimpleDb, DEFAULT_GLOBAL, SECTION_NAMES } = require('./simple_db');

class Database {
  constructor(filePath) {
    this.db = new SimpleDb(filePath);
    this.filePath = filePath;
  }

  /* ---------- 用户级别读写 ---------- */

  createUser(playerId, initialData = {}) {
    const user = this.db.ensureUser(playerId);
    if (Object.keys(initialData).length > 0) {
      this.db.patchGlobal(playerId, initialData);
    }
    return {
      playerId: user.playerId,
      updatedAt: user.updatedAt,
      global: this.db.getGlobal(playerId),
    };
  }

  getUser(playerId) {
    const global = this.db.getGlobal(playerId);
    const sections = this.db.getSections(playerId);
    return { playerId, global, sections };
  }

  deleteUser(playerId) {
    if (this.db.data.users[playerId]) {
      delete this.db.data.users[playerId];
      this.db.flush();
      return true;
    }
    return false;
  }

  listUsers() {
    return Object.keys(this.db.data.users);
  }

  getUserCount() {
    return Object.keys(this.db.data.users).length;
  }

  /* ---------- 全局数据读写 ---------- */

  readGlobal(playerId) {
    return this.db.getGlobal(playerId);
  }

  writeGlobal(playerId, data) {
    return this.db.replaceGlobal(playerId, data);
  }

  updateGlobal(playerId, patch) {
    return this.db.patchGlobal(playerId, patch);
  }

  /* ---------- 分区数据读写 ---------- */

  readSection(playerId, section) {
    return this.db.getSection(playerId, section);
  }

  writeSection(playerId, section, data) {
    return this.db.replaceSection(playerId, section, data);
  }

  updateSection(playerId, section, patch) {
    return this.db.patchSection(playerId, section, patch);
  }

  /* ---------- 键值级别读写 ---------- */

  readKey(playerId, section, key) {
    const sec = this.db.getSection(playerId, section);
    return sec[key];
  }

  writeKey(playerId, section, key, value) {
    const patch = { [key]: value };
    const result = this.db.patchSection(playerId, section, patch);
    return result;
  }

  deleteKey(playerId, section, key) {
    const sec = this.db.getSection(playerId, section);
    if (!(key in sec)) return false;
    delete sec[key];
    this.db.replaceSection(playerId, section, sec);
    return true;
  }

  /* ---------- 批量操作 ---------- */

  batchWrite(playerId, section, entries) {
    if (!entries || typeof entries !== 'object') {
      throw new Error('entries must be an object');
    }
    return this.db.patchSection(playerId, section, entries);
  }

  batchRead(playerId, keys) {
    const global = this.db.getGlobal(playerId);
    const result = {};
    for (const key of keys) {
      if (key in global) {
        result[key] = global[key];
      }
    }
    return result;
  }

  /* ---------- 查询与统计 ---------- */

  findUsersByCondition(section, predicate) {
    const matches = [];
    for (const playerId of this.listUsers()) {
      const sec = this.db.getSection(playerId, section);
      if (predicate(sec, playerId)) {
        matches.push(playerId);
      }
    }
    return matches;
  }

  findUsersByKeyValue(section, key, value) {
    return this.findUsersByCondition(section, (sec) => sec[key] === value);
  }

  getStats() {
    const users = this.listUsers();
    return {
      totalUsers: users.length,
      dbVersion: this.db.data.version,
      filePath: this.filePath,
      fileSizeBytes: fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0,
    };
  }

  /* ---------- 备份与恢复 ---------- */

  backup(backupDir = './db/backups') {
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
    fs.copyFileSync(this.filePath, backupPath);
    return backupPath;
  }

  restore(backupPath) {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }
    fs.copyFileSync(backupPath, this.filePath);
    this.db.load();
    return true;
  }

  /* ---------- 原始数据访问 ---------- */

  getRawData() {
    return JSON.parse(JSON.stringify(this.db.data));
  }

  flush() {
    this.db.flush();
  }
}

module.exports = {
  Database,
  DEFAULT_GLOBAL,
  SECTION_NAMES,
};
