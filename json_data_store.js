const fs = require('fs');
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class JsonDataStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = isObject(defaults) ? clone(defaults) : {};
    this.data = clone(this.defaults);
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

    const parsed = JSON.parse(raw);
    this.data = Object.assign(clone(this.defaults), isObject(parsed) ? parsed : {});
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  get(pathParts, fallback = undefined) {
    const value = this._read(pathParts);
    return value === undefined ? fallback : clone(value);
  }

  set(pathParts, value) {
    const parent = this._ensureParent(pathParts);
    parent[pathParts[pathParts.length - 1]] = clone(value);
    this.flush();
    return this.get(pathParts);
  }

  update(pathParts, updater, fallback = {}) {
    const current = this.get(pathParts, fallback);
    const next = updater(clone(current));
    return this.set(pathParts, next);
  }

  ensureObject(pathParts) {
    const current = this._read(pathParts);
    if (!isObject(current)) {
      return this.set(pathParts, {});
    }
    return clone(current);
  }

  _read(pathParts) {
    let cursor = this.data;
    for (const part of pathParts) {
      if (!isObject(cursor) || cursor[part] === undefined) {
        return undefined;
      }
      cursor = cursor[part];
    }
    return cursor;
  }

  _ensureParent(pathParts) {
    if (!Array.isArray(pathParts) || pathParts.length === 0) {
      throw new Error('pathParts must not be empty');
    }

    let cursor = this.data;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!isObject(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    return cursor;
  }
}

module.exports = {
  JsonDataStore,
};
