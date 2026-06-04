const fs = require('fs');
const path = require('path');

const DEFAULT_GLOBAL = {
  settings: {
    language: 'zh',
    musicEnabled: true,
    soundEnabled: true,
    voiceEnabled: true,
    shockEnabled: true,
  },
  profile: {
    bgIndex: 0,
    avatarIndex: 0,
    frameIndex: 0,
  },
  daily: {
    dailySelectedYear: 0,
    dailySelectedMonth: 0,
    dailySelectedDay: 0,
    dailyClearData: {},
  },
  progress: {
    currentLevel: 1,
  },
  misc: {},
};

const KEY_SECTION = {
  language: 'settings',
  musicEnabled: 'settings',
  soundEnabled: 'settings',
  voiceEnabled: 'settings',
  shockEnabled: 'settings',
  bgIndex: 'profile',
  avatarIndex: 'profile',
  frameIndex: 'profile',
  dailySelectedYear: 'daily',
  dailySelectedMonth: 'daily',
  dailySelectedDay: 'daily',
  dailyClearData: 'daily',
  currentLevel: 'progress',
};

const SECTION_NAMES = Object.keys(DEFAULT_GLOBAL);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSectionName(section) {
  if (!SECTION_NAMES.includes(section)) {
    throw new Error(`Unknown section: ${section}`);
  }
  return section;
}

function mergeObject(base, patch) {
  const output = isObject(base) ? clone(base) : {};
  if (!isObject(patch)) return output;

  for (const key of Object.keys(patch)) {
    output[key] = patch[key];
  }
  return output;
}

function splitGlobal(flatGlobal) {
  const sections = clone(DEFAULT_GLOBAL);
  if (!isObject(flatGlobal)) return sections;

  for (const key of Object.keys(flatGlobal)) {
    const section = KEY_SECTION[key] || 'misc';
    sections[section][key] = flatGlobal[key];
  }
  return sections;
}

function mergeSections(sections) {
  const global = {};
  for (const section of SECTION_NAMES) {
    Object.assign(global, sections[section] || {});
  }
  return global;
}

class SimpleDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      version: 1,
      users: {},
    };
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
    this.data = {
      version: 1,
      users: isObject(parsed.users) ? parsed.users : {},
    };
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  ensureUser(playerId) {
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('playerId is required');
    }

    if (!this.data.users[playerId]) {
      this.data.users[playerId] = {
        playerId,
        updatedAt: nowIso(),
        sections: clone(DEFAULT_GLOBAL),
      };
      this.flush();
    }

    return this.data.users[playerId];
  }

  getSections(playerId) {
    const user = this.ensureUser(playerId);
    return clone(user.sections);
  }

  getGlobal(playerId) {
    return mergeSections(this.getSections(playerId));
  }

  getSection(playerId, section) {
    const sectionName = normalizeSectionName(section);
    const user = this.ensureUser(playerId);
    return clone(user.sections[sectionName] || {});
  }

  replaceSection(playerId, section, value) {
    if (!isObject(value)) {
      throw new Error('section body must be a JSON object');
    }

    const sectionName = normalizeSectionName(section);
    const user = this.ensureUser(playerId);
    user.sections[sectionName] = mergeObject(DEFAULT_GLOBAL[sectionName], value);
    user.updatedAt = nowIso();
    this.flush();
    return this.getSection(playerId, sectionName);
  }

  patchSection(playerId, section, value) {
    if (!isObject(value)) {
      throw new Error('section body must be a JSON object');
    }

    const sectionName = normalizeSectionName(section);
    const user = this.ensureUser(playerId);
    user.sections[sectionName] = mergeObject(user.sections[sectionName], value);
    user.updatedAt = nowIso();
    this.flush();
    return this.getSection(playerId, sectionName);
  }

  replaceGlobal(playerId, value) {
    if (!isObject(value)) {
      throw new Error('global body must be a JSON object');
    }

    const user = this.ensureUser(playerId);
    user.sections = splitGlobal(value);
    user.updatedAt = nowIso();
    this.flush();
    return this.getGlobal(playerId);
  }

  patchGlobal(playerId, value) {
    if (!isObject(value)) {
      throw new Error('global body must be a JSON object');
    }

    const user = this.ensureUser(playerId);
    const patchSections = splitGlobal(value);
    for (const section of SECTION_NAMES) {
      user.sections[section] = mergeObject(user.sections[section], patchSections[section]);
    }
    user.updatedAt = nowIso();
    this.flush();
    return this.getGlobal(playerId);
  }
}

module.exports = {
  DEFAULT_GLOBAL,
  SECTION_NAMES,
  SimpleDb,
};
