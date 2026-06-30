const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { SECTION_NAMES, SimpleDb } = require('./simple_db');
const { JsonDataStore } = require('./json_data_store');
const { RouteRegistry } = require('./route_registry');
const { LevelRankService } = require('./level_rank_service');
const { UserInfoService } = require('./user_info_service');
const { RefreshTimeService } = require('./refresh_time_service');
const { TravelService } = require('./travel_service');
const { DailyRankAchievementService } = require('./daily_rank_achievement_service');
const { PlayerProgressService } = require('./player_progress_service');
const { createMysqlPool, verifyMysql } = require('./mysql_database');
const { MysqlUserTable } = require('./mysql_user_table');
const { MysqlProfileRepository } = require('./mysql_profile_repository');
const { MysqlRankRepository } = require('./mysql_rank_repository');
const { MysqlAchievementRepository } = require('./mysql_achievement_repository');
const { MysqlDailyRankRewardRepository } = require('./mysql_daily_rank_reward_repository');
const { DailyRankRewardService } = require('./daily_rank_reward_service');
const { TrackingRepository } = require('./tracking_repository');
const { DailyStatsRepository } = require('./daily_stats_repository');
const { DifficultyRepository } = require('./difficulty_repository');
const { MysqlDailyChallengeRepository } = require('./mysql_daily_challenge_repository');
const { DailyChallengeService } = require('./daily_challenge_service');

function loadConfig() {
  const configPath = path.join(__dirname, 'server.config.json');
  const defaults = {
    host: '127.0.0.1',
    port: 8787,
    dbFile: './db/global_db.json',
    hotUpdateDir: '../VITA/build/hotupdate',
    maxBodyBytes: 1024 * 1024,
    publicBaseUrl: '',
    googleOAuth: {
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      sessionTtlMs: 5 * 60 * 1000,
    },
  };

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return Object.assign(defaults, parsed);
}

function resolveDbFile(dbFile) {
  if (path.isAbsolute(dbFile)) {
    return dbFile;
  }
  return path.resolve(__dirname, dbFile);
}

const config = loadConfig();
const HOST = process.env.HOST || config.host;
const PORT = Number(process.env.PORT || config.port);
const DB_FILE = resolveDbFile(process.env.DB_FILE || config.dbFile);
const HOT_UPDATE_DIR = path.resolve(__dirname, process.env.HOT_UPDATE_DIR || config.hotUpdateDir);
const PUBLIC_DIR = path.resolve(__dirname, process.env.PUBLIC_DIR || config.publicDir || './public');
const AVATAR_DIR = path.join(PUBLIC_DIR, 'avatars');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || config.maxBodyBytes);
const mysqlPool = createMysqlPool(config);
const GOOGLE_OAUTH = Object.assign({}, config.googleOAuth || {}, {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || (config.googleOAuth && config.googleOAuth.clientId) || '',
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || (config.googleOAuth && config.googleOAuth.clientSecret) || '',
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || (config.googleOAuth && config.googleOAuth.redirectUri) || '',
  sessionTtlMs: Number(process.env.GOOGLE_OAUTH_SESSION_TTL_MS || (config.googleOAuth && config.googleOAuth.sessionTtlMs) || 5 * 60 * 1000),
});
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || config.publicBaseUrl || '').replace(/\/+$/, '');
const googleLoginSessions = new Map();

const HOT_UPDATE_MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
};

const PUBLIC_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const db = new SimpleDb(DB_FILE);
const userDb = new MysqlUserTable(mysqlPool);
const rankRepository = new MysqlRankRepository(mysqlPool);
const profileRepository = new MysqlProfileRepository(mysqlPool);
const achievementRepository = new MysqlAchievementRepository(mysqlPool);
const dailyRankRewardRepository = new MysqlDailyRankRewardRepository(mysqlPool);
const trackingRepository = new TrackingRepository(mysqlPool);
const dailyStatsRepository = new DailyStatsRepository(mysqlPool);
const difficultyRepository = new DifficultyRepository(mysqlPool);
const dailyChallengeRepository = new MysqlDailyChallengeRepository(mysqlPool);
const dailyRankAchievementService = new DailyRankAchievementService(achievementRepository);
const dailyRankRewardService = new DailyRankRewardService(dailyRankRewardRepository);
const levelRankService = new LevelRankService(rankRepository, {
  logger: console,
  userInfoDataStore: profileRepository,
  dailySpecialDataStore: rankRepository,
  dailyRankAchievementService,
});
const userInfoService = new UserInfoService(profileRepository, { dailyStatsRepository });
const playerProgressService = new PlayerProgressService(profileRepository);
const refreshTimeService = new RefreshTimeService();
const travelDataStore = new JsonDataStore(path.join(path.dirname(DB_FILE), 'travel_data.json'), {
  version: 1,
  players: {},
});
const travelService = new TravelService(travelDataStore, { defaultFragmentLimit: 10, defaultTotalStages: 20 });
const dailyChallengeService = new DailyChallengeService(dailyChallengeRepository);
const apiRoutes = new RouteRegistry({
  parseBody,
  sendJson,
});

function getPlayerIdFromUser(user) {
  return user && (user.playerId || user.account);
}

async function getUserInfoForLogin(user) {
  const playerId = getPlayerIdFromUser(user);
  if (!playerId) {
    return null;
  }

  const userInfo = await userInfoService.getUserInfo(playerId);
  if (!userInfo.name && user && user.gameName) {
    return userInfoService.patchUserInfo(playerId, {
      name: user.gameName,
      playerName: user.gameName,
    });
  }
  return userInfo;
}

function nowMs() {
  return Date.now();
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function normalizeGoogleProfile(profile) {
  const raw = profile && typeof profile === 'object' ? profile : {};
  const googleId = String(raw.sub || raw.id || raw.googleId || '').trim();
  const email = String(raw.email || raw.account || '').trim();
  const accountKey = googleId || email;
  if (!accountKey) {
    throw new Error('Google profile missing unique id');
  }
  return {
    googleId: accountKey,
    rawGoogleId: googleId,
    email,
    name: String(raw.name || raw.displayName || raw.nickname || email || 'Google Player').trim(),
    picture: String(raw.picture || raw.photoUrl || raw.avatarUrl || raw.avatar || '').trim(),
  };
}

async function generateUniqueDisplayId() {
  for (let i = 0; i < 20; i++) {
    const displayId = String(Math.floor(10000000 + Math.random() * 90000000));
    const [rows] = await mysqlPool.execute(
      `SELECT player_id FROM player_profiles
       WHERE JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.displayId')) = ?
       LIMIT 1`,
      [displayId]
    );
    if (!rows.length) return displayId;
  }
  return String(Date.now()).slice(-8).padStart(8, '0');
}

function getAvatarPublicUrl(req, fileName) {
  const baseUrl = req ? getRequestBaseUrl(req) : (PUBLIC_BASE_URL || `http://${HOST}:${PORT}`);
  return `${baseUrl.replace(/\/+$/, '')}/avatars/${encodeURIComponent(fileName)}`;
}

function sanitizeAvatarExtension(contentType, urlPath) {
  const lowerType = String(contentType || '').toLowerCase();
  if (lowerType.includes('png')) return '.png';
  if (lowerType.includes('webp')) return '.webp';
  if (lowerType.includes('gif')) return '.gif';
  if (lowerType.includes('jpeg') || lowerType.includes('jpg')) return '.jpg';
  const ext = path.extname(urlPath || '').toLowerCase();
  return PUBLIC_MIME_TYPES[ext] ? ext : '.jpg';
}

function downloadBuffer(url, maxBytes = 2 * 1024 * 1024, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!url || redirectCount > 3) {
      reject(new Error('invalid avatar url'));
      return;
    }

    let target;
    try {
      target = new URL(url);
    } catch (error) {
      reject(new Error('invalid avatar url'));
      return;
    }

    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      reject(new Error('unsupported avatar url protocol'));
      return;
    }

    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(target, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, target).toString();
        downloadBuffer(nextUrl, maxBytes, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`avatar download HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error('avatar image too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || '',
        urlPath: target.pathname,
      }));
    });
    req.on('timeout', () => req.destroy(new Error('avatar download timeout')));
    req.on('error', reject);
  });
}

async function saveGoogleAvatar(profile, req) {
  if (!profile.picture) return {};
  return {
    avatarUrl: profile.picture,
    avatarSourceUrl: profile.picture,
  };
}

function getRequestBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `${HOST}:${PORT}`;
  return `${proto}://${host}`;
}

function getGoogleRedirectUri(req) {
  if (GOOGLE_OAUTH.redirectUri) return GOOGLE_OAUTH.redirectUri;
  return `${getRequestBaseUrl(req)}/api/auth/google/callback`;
}

function cleanupGoogleLoginSessions() {
  const now = nowMs();
  for (const [sessionId, session] of googleLoginSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      googleLoginSessions.delete(sessionId);
    }
  }
}

function createGoogleLoginSession(req) {
  cleanupGoogleLoginSessions();
  const sessionId = randomId(18);
  const state = randomId(24);
  const expiresAt = nowMs() + Math.max(60 * 1000, GOOGLE_OAUTH.sessionTtlMs || 5 * 60 * 1000);
  const redirectUri = getGoogleRedirectUri(req);
  const session = {
    sessionId,
    state,
    redirectUri,
    status: 'pending',
    expiresAt,
    createdAt: new Date().toISOString(),
    user: null,
    userInfo: null,
    error: '',
  };
  googleLoginSessions.set(sessionId, session);
  return session;
}

function findGoogleLoginSessionByState(state) {
  cleanupGoogleLoginSessions();
  for (const session of googleLoginSessions.values()) {
    if (session.state === state) {
      return session;
    }
  }
  return null;
}

function buildGoogleAuthUrl(session) {
  if (!GOOGLE_OAUTH.clientId) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID is not configured');
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_OAUTH.clientId);
  url.searchParams.set('redirect_uri', session.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', session.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

function ensureGoogleOAuthConfigured() {
  if (!GOOGLE_OAUTH.clientId) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID is not configured');
  }
  if (!GOOGLE_OAUTH.clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is not configured');
  }
}

function getGoogleSessionStatus(session) {
  if (!session) return null;
  const payload = {
    sessionId: session.sessionId,
    status: session.status,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
  if (session.status === 'success') {
    payload.result = session.result;
  } else if (session.status === 'error') {
    payload.error = session.error || 'Google sign-in failed';
  }
  return payload;
}

async function buildLoginResult(user, userInfo, googleProfile) {
  const playerId = getPlayerIdFromUser(user);
  const today = levelRankService.toDateString(new Date());
  await dailyRankRewardService.settleBefore(today);
  const rankReward = playerId ? await dailyRankRewardService.getPending(playerId) : null;
  const difficultyConfig = await difficultyRepository.getConfig();
  const progress = playerId ? await playerProgressService.getProgress(playerId) : null;
  return {
    ok: true,
    isNewUser: !!googleProfile.isNewUser,
    user,
    userInfo,
    roleInfo: userInfo,
    progress,
    rankReward,
    difficultyConfig,
    google: googleProfile ? {
      id: googleProfile.googleId,
      email: googleProfile.email || '',
      name: googleProfile.name || '',
      avatarUrl: googleProfile.avatarUrl || '',
      displayId: userInfo && userInfo.displayId ? userInfo.displayId : '',
    } : undefined,
  };
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function postFormJson(url, form) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = new URLSearchParams(form).toString();
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error('invalid Google token response'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed.error_description || parsed.error || `Google token HTTP ${res.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Google token request timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

function getJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error('invalid Google tokeninfo response'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed.error_description || parsed.error || `Google tokeninfo HTTP ${res.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Google tokeninfo request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_OAUTH.clientId) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID is not configured');
  }
  const token = String(idToken || '').trim();
  console.log('[google-login] verify idToken start: hasToken=%s, tokenLength=%d, expectedAud=%s', !!token, token.length, GOOGLE_OAUTH.clientId);
  if (!token) {
    throw new Error('Google idToken is required');
  }

  const tokenInfoUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
  tokenInfoUrl.searchParams.set('id_token', token);
  let payload;
  try {
    payload = await getJson(tokenInfoUrl.toString());
  } catch (error) {
    console.error('[google-login] verify idToken request failed: %s', error && error.message ? error.message : error);
    throw error;
  }

  if (payload.aud !== GOOGLE_OAUTH.clientId) {
    console.error('[google-login] verify idToken failed: invalid audience aud=%s expected=%s sub=%s email=%s', payload.aud, GOOGLE_OAUTH.clientId, payload.sub || '', payload.email || '');
    throw new Error('invalid Google id token audience');
  }
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    console.error('[google-login] verify idToken failed: invalid issuer iss=%s sub=%s email=%s', payload.iss, payload.sub || '', payload.email || '');
    throw new Error('invalid Google id token issuer');
  }
  if (!payload.sub) {
    console.error('[google-login] verify idToken failed: missing sub email=%s aud=%s', payload.email || '', payload.aud || '');
    throw new Error('Google id token missing sub');
  }
  const expiresAtSeconds = Number(payload.exp || 0);
  if (!expiresAtSeconds || expiresAtSeconds <= Math.floor(Date.now() / 1000)) {
    console.error('[google-login] verify idToken failed: expired exp=%s sub=%s email=%s', payload.exp || '', payload.sub || '', payload.email || '');
    throw new Error('Google id token expired');
  }

  console.log('[google-login] verify idToken success: sub=%s, email=%s, aud=%s, iss=%s, exp=%s', payload.sub, payload.email || '', payload.aud, payload.iss, payload.exp);
  return {
    sub: String(payload.sub || '').trim(),
    id: String(payload.sub || '').trim(),
    googleId: String(payload.sub || '').trim(),
    email: String(payload.email || '').trim(),
    account: String(payload.email || payload.sub || '').trim(),
    name: String(payload.name || payload.email || 'Google Player').trim(),
    displayName: String(payload.name || '').trim(),
    picture: String(payload.picture || '').trim(),
    photoUrl: String(payload.picture || '').trim(),
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    aud: payload.aud,
    iss: payload.iss,
    exp: expiresAtSeconds,
  };
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (error) {
    return null;
  }
}

async function getNativeGoogleProfile(body) {
  const raw = body && typeof body === 'object' ? body : {};
  if (raw.idToken && GOOGLE_OAUTH.clientId) {
    return verifyGoogleIdToken(raw.idToken);
  }

  if (raw.idToken && !GOOGLE_OAUTH.clientId) {
    console.warn('[google-login] GOOGLE_OAUTH_CLIENT_ID is not configured; using unverified native Google profile fallback.');
    const payload = decodeJwtPayload(raw.idToken);
    if (payload && payload.sub) {
      return {
        ...raw,
        sub: String(payload.sub || '').trim(),
        id: String(payload.sub || raw.id || '').trim(),
        googleId: String(payload.sub || raw.googleId || '').trim(),
        email: String(payload.email || raw.email || raw.account || '').trim(),
        account: String(payload.email || raw.account || payload.sub || '').trim(),
        name: String(payload.name || raw.name || raw.displayName || payload.email || 'Google Player').trim(),
        displayName: String(payload.name || raw.displayName || '').trim(),
        picture: String(payload.picture || raw.picture || raw.photoUrl || '').trim(),
        photoUrl: String(payload.picture || raw.photoUrl || raw.picture || '').trim(),
      };
    }
  }

  return raw;
}

async function loginWithGoogleProfile(profile, req) {
  const googleProfile = normalizeGoogleProfile(profile);
  const googleId = googleProfile.googleId;
  const account = `google:${googleId}`;
  const gameName = googleProfile.name;
  let isNewUser = false;
  let user = await userDb.getUser(account);
  if (!user) {
    isNewUser = true;
    try {
      user = await userDb.register(account, gameName, account);
      await dailyStatsRepository.recordNewUser(account, new Date());
    } catch (error) {
      if (error.message !== 'account already exists') throw error;
    }
  } else if (user.gameName !== gameName) {
    try {
      await userDb.updateGameName(account, gameName);
    } catch (error) {
      console.error('[google-login] failed to update game name:', error.message);
    }
  }

  user = await userDb.login(account);
  const playerId = getPlayerIdFromUser(user);
  if (playerId) {
    try {
      await profileRepository.updateLastLoginTime(playerId);
    } catch (error) {
      console.error('[google-login] failed to update profile lastLoginTime:', error.message);
    }
  }
  try {
    await dailyStatsRepository.recordLogin(playerId, new Date());
  } catch (error) {
    console.error('[google-login] failed to record daily stats:', error.message);
  }

  const currentInfo = playerId ? await userInfoService.getUserInfo(playerId) : null;
  const displayId = currentInfo && currentInfo.displayId ? currentInfo.displayId : await generateUniqueDisplayId();
  const avatarInfo = await saveGoogleAvatar(googleProfile, req);
  const selectedAvatarId = currentInfo && Number(currentInfo.avatarId || currentInfo.avatarIndex || 0) > 0
    ? Number(currentInfo.avatarId || currentInfo.avatarIndex || 0)
    : 0;
  const userInfo = await userInfoService.patchUserInfo(playerId, {
    email: googleProfile.email,
    googleId,
    rawGoogleId: googleProfile.rawGoogleId,
    account,
    loginType: 'google',
    displayId,
    ...avatarInfo,
    avatarUrl: selectedAvatarId > 0 ? '' : (avatarInfo.avatarUrl || ''),
  });
  return { user, userInfo, googleId, email: googleProfile.email, name: userInfo.name || '', avatarUrl: avatarInfo.avatarUrl || '', isNewUser };
}

userInfoService.registerRoutes(apiRoutes);
playerProgressService.registerRoutes(apiRoutes);
refreshTimeService.registerRoutes(apiRoutes);
travelService.registerRoutes(apiRoutes);
dailyChallengeService.registerRoutes(apiRoutes);

apiRoutes.post('/api/tracking/events', async (ctx) => {
  const body = await ctx.body();
  const forwarded = ctx.req.headers['x-forwarded-for'];
  const userIp = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded ? String(forwarded).split(',')[0].trim() : ctx.req.socket.remoteAddress);
  const result = await trackingRepository.insertEvents(body, userIp);
  ctx.json(200, { ok: true, ...result });
});

apiRoutes.get('/api/difficulty-config', async (ctx) => {
  ctx.json(200, { ok: true, config: await difficultyRepository.getConfig() });
});

apiRoutes.post('/api/rank/settlement', async (ctx) => {
  const body = await ctx.body();
  console.log('[rank:settlement] POST /api/rank/settlement body', JSON.stringify({
    playerId: body && body.playerId,
    level: body && body.level,
    score: body && body.score,
    combo: body && body.combo,
    specialScore: body && body.specialScore,
    timeMs: body && body.timeMs,
    timeSeconds: body && body.timeSeconds,
    keys: body && typeof body === 'object' ? Object.keys(body) : [],
  }));
  const rank = await levelRankService.submitResult(body);
  console.log('[rank:settlement] POST /api/rank/settlement response', JSON.stringify(rank));
  ctx.json(200, { ok: true, rank });
});

apiRoutes.get('/api/rank/special/daily', async (ctx) => {
  const url = new URL(ctx.req.url, `http://${ctx.req.headers.host || `${HOST}:${PORT}`}`);
  let date = url.searchParams.get('date');
  if (!date) {
    date = await levelRankService.getLatestDailySpecialDate();
  }
  const rank = await levelRankService.getDailySpecialRank(date);
  ctx.json(200, { ok: true, date, rank });
});

apiRoutes.get('/api/rank/special/daily/leaderboard', async (ctx) => {
  const url = new URL(ctx.req.url, `http://${ctx.req.headers.host || `${HOST}:${PORT}`}`);
  let date = url.searchParams.get('date');
  const playerId = url.searchParams.get('playerId');
  if (!date) {
    date = await levelRankService.getLatestDailySpecialDate();
  }
  const result = await levelRankService.getDailySpecialLeaderboard(date, playerId || '', 100);
  ctx.json(200, { ok: true, date, playerId: playerId || '', top100: result.top100, self: result.self });
});

apiRoutes.get('/api/rank/achievement/:playerId', async (ctx) => {
  const playerId = ctx.params.playerId;
  const url = new URL(ctx.req.url, `http://${ctx.req.headers.host || `${HOST}:${PORT}`}`);
  let date = url.searchParams.get('date');
  if (!date) {
    date = levelRankService.toDateString(new Date());
  }
  const achievement = await dailyRankAchievementService.getAchievement(playerId, date);
  ctx.json(200, { ok: true, playerId, date, achievement });
});

apiRoutes.get('/api/rank/rewards/pending/:playerId', async (ctx) => {
  const today = levelRankService.toDateString(new Date());
  await dailyRankRewardService.settleBefore(today);
  const reward = await dailyRankRewardService.getPending(ctx.params.playerId);
  ctx.json(200, { ok: true, reward });
});

apiRoutes.post('/api/rank/rewards/claim', async (ctx) => {
  const body = await ctx.body();
  const reward = await dailyRankRewardService.claim(
    String(body.playerId || '').trim(),
    Number(body.rewardId),
    Number(body.multiplier)
  );
  ctx.json(200, { ok: true, reward });
});

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Account,X-Token',
  });
  res.end(payload);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function parseRoute(req) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return { url, parts };
}

function routeHealth(req, res, parts) {
  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'health') {
    sendJson(res, 200, { ok: true, sections: SECTION_NAMES, hotUpdateDir: HOT_UPDATE_DIR });
    return true;
  }
  return false;
}

function routeHotUpdate(req, res, parts) {
  if (req.method !== 'GET' || parts[0] !== 'hotupdate' || parts.length < 2) {
    return false;
  }

  const relativePath = parts.slice(1).join(path.sep);
  const filePath = path.resolve(HOT_UPDATE_DIR, relativePath);
  const rootWithSeparator = HOT_UPDATE_DIR.endsWith(path.sep) ? HOT_UPDATE_DIR : HOT_UPDATE_DIR + path.sep;
  if (filePath !== HOT_UPDATE_DIR && !filePath.startsWith(rootWithSeparator)) {
    sendError(res, 403, 'invalid hot update path');
    return true;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendError(res, 404, 'hot update file not found');
    return true;
  }

  const stat = fs.statSync(filePath);
  const headers = {
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': path.extname(filePath).toLowerCase() === '.json'
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
    'Content-Type': HOT_UPDATE_MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
  };
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, Object.assign(headers, { 'Content-Length': stat.size }));
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, Object.assign(headers, { 'Content-Range': `bytes */${stat.size}` }));
    res.end();
    return true;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  if (start >= stat.size || end < start) {
    res.writeHead(416, Object.assign(headers, { 'Content-Range': `bytes */${stat.size}` }));
    res.end();
    return true;
  }

  res.writeHead(206, Object.assign(headers, {
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
  }));
  fs.createReadStream(filePath, { start, end }).pipe(res);
  return true;
}

function routePublicAvatar(req, res, parts) {
  if (req.method !== 'GET' || parts[0] !== 'avatars' || parts.length !== 2) {
    return false;
  }

  const fileName = parts[1];
  const filePath = path.resolve(AVATAR_DIR, fileName);
  const rootWithSeparator = AVATAR_DIR.endsWith(path.sep) ? AVATAR_DIR : AVATAR_DIR + path.sep;
  if (filePath !== AVATAR_DIR && !filePath.startsWith(rootWithSeparator)) {
    sendError(res, 403, 'invalid avatar path');
    return true;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendError(res, 404, 'avatar not found');
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': PUBLIC_MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function routeGlobal(req, res, parts) {
  if (parts[0] !== 'api' || parts[1] !== 'global' || !parts[2]) {
    return false;
  }

  const playerId = parts[2];

  if (parts.length === 3) {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, playerId, global: db.getGlobal(playerId) });
      return true;
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      sendJson(res, 200, { ok: true, playerId, global: db.replaceGlobal(playerId, body) });
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await parseBody(req);
      sendJson(res, 200, { ok: true, playerId, global: db.patchGlobal(playerId, body) });
      return true;
    }
  }

  if (parts.length === 4 && parts[3] === 'sections' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, playerId, sections: db.getSections(playerId) });
    return true;
  }

  if (parts.length === 5 && parts[3] === 'sections') {
    const section = parts[4];

    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, playerId, section, data: db.getSection(playerId, section) });
      return true;
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      sendJson(res, 200, { ok: true, playerId, section, data: db.replaceSection(playerId, section, body) });
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await parseBody(req);
      sendJson(res, 200, { ok: true, playerId, section, data: db.patchSection(playerId, section, body) });
      return true;
    }
  }

  return false;
}

async function routeGoogleAuth(req, res, parts) {
  if (parts[0] !== 'api' || parts[1] !== 'auth' || parts[2] !== 'google') {
    return false;
  }

  const action = parts[3];
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'POST' && parts.length === 4 && action === 'session') {
    const session = createGoogleLoginSession(req);
    const authUrl = buildGoogleAuthUrl(session);
    sendJson(res, 200, {
      ok: true,
      sessionId: session.sessionId,
      authUrl,
      expiresAt: session.expiresAt,
    });
    return true;
  }

  if (req.method === 'GET' && parts.length === 4 && action === 'start') {
    const sessionId = String(url.searchParams.get('session') || '').trim();
    const session = googleLoginSessions.get(sessionId) || createGoogleLoginSession(req);
    const authUrl = buildGoogleAuthUrl(session);
    res.writeHead(302, {
      Location: authUrl,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && parts.length === 4 && action === 'status') {
    cleanupGoogleLoginSessions();
    const sessionId = String(url.searchParams.get('session') || '').trim();
    const session = googleLoginSessions.get(sessionId);
    if (!session) {
      sendError(res, 404, 'Google login session not found or expired');
      return true;
    }
    sendJson(res, 200, { ok: true, ...getGoogleSessionStatus(session) });
    return true;
  }

  if (req.method === 'POST' && parts.length === 4 && action === 'test') {
    const body = await parseBody(req);
    const testType = String(body.type || '').trim();
    if (!testType) {
      sendError(res, 400, 'test type is required');
      return true;
    }
    const testAccounts = {
      'mingyue': {
        sub: '102614654036713113611',
        googleId: '102614654036713113611',
        email: 'yumingyue178@gmail.com',
        name: 'Mingyue Yu',
        displayName: 'Mingyue Yu',
        picture: 'https://lh3.googleusercontent.com/a/ACg8ocKUinFMjQTR7DqcRkGIN92iTRgzUbTbI_nnQ3DLBttDrukdHzc=s96-c',
      },
    };
    const testProfile = testAccounts[testType];
    if (!testProfile) {
      sendError(res, 404, 'unknown test account: ' + testType);
      return true;
    }
    const login = await loginWithGoogleProfile(testProfile, req);
    const result = await buildLoginResult(login.user, login.userInfo, login);
    sendJson(res, 200, result);
    return true;
  }

  if (req.method === 'POST' && parts.length === 4 && action === 'native') {
    const body = await parseBody(req);
    const googleProfile = await getNativeGoogleProfile(body);
    const login = await loginWithGoogleProfile(googleProfile, req);
    const result = await buildLoginResult(login.user, login.userInfo, login);
    sendJson(res, 200, result);
    return true;
  }

  if (req.method === 'GET' && parts.length === 4 && action === 'callback') {
    const state = String(url.searchParams.get('state') || '').trim();
    const code = String(url.searchParams.get('code') || '').trim();
    const oauthError = String(url.searchParams.get('error') || '').trim();
    const session = findGoogleLoginSessionByState(state);

    if (!session) {
      sendHtml(res, 400, '<!doctype html><meta charset="utf-8"><title>Google Login</title><h2>Login expired</h2><p>Please return to the game and try again.</p>');
      return true;
    }

    try {
      if (oauthError) {
        throw new Error(oauthError);
      }
      if (!code) {
        throw new Error('Google callback missing code');
      }
      ensureGoogleOAuthConfigured();

      const token = await postFormJson('https://oauth2.googleapis.com/token', {
        code,
        client_id: GOOGLE_OAUTH.clientId,
        client_secret: GOOGLE_OAUTH.clientSecret,
        redirect_uri: session.redirectUri,
        grant_type: 'authorization_code',
      });
      const verifiedProfile = await verifyGoogleIdToken(token.id_token);

      const login = await loginWithGoogleProfile(verifiedProfile, req);
      session.status = 'success';
      session.completedAt = new Date().toISOString();
      session.user = login.user;
      session.userInfo = login.userInfo;
      session.result = await buildLoginResult(login.user, login.userInfo, login);
      sendHtml(res, 200, '<!doctype html><meta charset="utf-8"><title>Google Login</title><h2>Google login succeeded</h2><p>You can return to the game.</p>');
    } catch (error) {
      session.status = 'error';
      session.error = error.message || 'Google sign-in failed';
      session.completedAt = new Date().toISOString();
      console.error('[google-login] callback failed:', session.error);
      sendHtml(res, 400, `<!doctype html><meta charset="utf-8"><title>Google Login</title><h2>Google login failed</h2><p>${escapeHtml(session.error)}</p><p>Please return to the game and try again.</p>`);
    }
    return true;
  }

  return false;
}

async function routeUser(req, res, parts) {
  if (parts[0] !== 'api' || parts[1] !== 'user') return false;

  // POST /api/user/register
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'register') {
    const body = await parseBody(req);
    const user = await userDb.register(body.account, body.gameName, body.playerId);
    try {
      await dailyStatsRepository.recordNewUser(getPlayerIdFromUser(user), new Date());
    } catch (error) {
      console.error('[register] failed to record daily stats:', error.message);
    }
    const userInfo = await userInfoService.patchUserInfo(getPlayerIdFromUser(user), {
      name: user.gameName,
      playerName: user.gameName,
      avatarId: body.avatarId,
      avatarFrameId: body.avatarFrameId,
    });
    const progress = await playerProgressService.getProgress(getPlayerIdFromUser(user));
    const difficultyConfig = await difficultyRepository.getConfig();
    sendJson(res, 200, { ok: true, user, userInfo, roleInfo: userInfo, progress, difficultyConfig });
    return true;
  }

  // POST /api/user/login
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'login') {
    const body = await parseBody(req);
    const user = await userDb.login(body.account);
    const playerId = getPlayerIdFromUser(user);
    if (playerId) {
      try {
        await profileRepository.updateLastLoginTime(playerId);
      } catch (error) {
        console.error('[login] failed to update profile lastLoginTime:', error.message);
      }
    }
    try {
      await dailyStatsRepository.recordLogin(playerId, new Date());
    } catch (error) {
      console.error('[login] failed to record daily stats:', error.message);
    }
    const userInfo = await getUserInfoForLogin(user);
    const today = levelRankService.toDateString(new Date());
    await dailyRankRewardService.settleBefore(today);
    const rankReward = playerId ? await dailyRankRewardService.getPending(playerId) : null;
    const progress = playerId ? await playerProgressService.getProgress(playerId) : null;
    const difficultyConfig = await difficultyRepository.getConfig();
    sendJson(res, 200, { ok: true, user, userInfo, roleInfo: userInfo, progress, rankReward, difficultyConfig });
    return true;
  }

  // POST /api/user/logout
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'logout') {
    const body = await parseBody(req);
    const user = await userDb.logout(body.account);
    sendJson(res, 200, { ok: true, user });
    return true;
  }

  // GET /api/user/list
  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'list') {
    if (!await userDb.verifyRequestHeaders(req.headers)) {
      sendError(res, 401, 'unauthorized');
      return true;
    }
    const users = await userDb.listUsers();
    sendJson(res, 200, { ok: true, count: users.length, users });
    return true;
  }

  // GET /api/user/profile/:account
  if (req.method === 'GET' && parts.length === 4 && parts[2] === 'profile') {
    const account = parts[3];
    if (!await userDb.verifyRequestHeaders(req.headers)) {
      sendError(res, 401, 'unauthorized');
      return true;
    }
    const user = await userDb.getUser(account);
    if (!user) {
      sendError(res, 404, 'user not found');
      return true;
    }
    sendJson(res, 200, { ok: true, user });
    return true;
  }

  // PATCH /api/user/profile/:account
  if (req.method === 'PATCH' && parts.length === 4 && parts[2] === 'profile') {
    const account = parts[3];
    if (!await userDb.verifyRequestHeaders(req.headers)) {
      sendError(res, 401, 'unauthorized');
      return true;
    }
    const body = await parseBody(req);
    const user = await userDb.updateGameName(account, body.gameName);
    sendJson(res, 200, { ok: true, user });
    return true;
  }

  // DELETE /api/user/account/:account
  if (req.method === 'DELETE' && parts.length === 4 && parts[2] === 'account') {
    const account = parts[3];
    if (!await userDb.verifyRequestHeaders(req.headers)) {
      sendError(res, 401, 'unauthorized');
      return true;
    }
    const deleted = await userDb.delete(account);
    sendJson(res, 200, { ok: true, deleted });
    return true;
  }

  // POST /api/payment/record
  if (req.method === 'POST' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'payment' && parts[2] === 'record') {
    const body = await parseBody(req);
    if (!body.playerId || typeof body.amount !== 'number' || body.amount <= 0) {
      sendError(res, 400, 'playerId and positive amount are required');
      return true;
    }
    const result = await dailyStatsRepository.recordPayment(
      String(body.playerId),
      body.amount,
      body.currency,
      body.productId,
      body.paidAt ? new Date(body.paidAt) : null,
    );
    sendJson(res, 200, { ok: true, paymentId: result.id });
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const { parts } = parseRoute(req);

  try {
    if (routeHealth(req, res, parts)) return;
    if (routeHotUpdate(req, res, parts)) return;
    if (routePublicAvatar(req, res, parts)) return;
    if (await routeGoogleAuth(req, res, parts)) return;
    if (await routeUser(req, res, parts)) return;
    if (await apiRoutes.handle(req, res, parts)) return;
    if (await routeGlobal(req, res, parts)) return;
    sendError(res, 404, 'route not found');
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

const server = http.createServer(handleRequest);

async function startServer() {
  await verifyMysql(mysqlPool);
  await dailyRankRewardRepository.ensureTable();
  await trackingRepository.ensureTable();
  await dailyStatsRepository.ensureTable();
  await difficultyRepository.ensureTable();
  await dailyChallengeRepository.ensureTable();
  server.listen(PORT, HOST, () => {
    console.log(`Global settings server listening on http://${HOST}:${PORT}`);
    console.log(`MySQL database: ${process.env.MYSQL_DATABASE || (config.mysql && config.mysql.database) || 'vita_game'}`);
    console.log(`Hot update URL: http://${HOST}:${PORT}/hotupdate`);
    console.log(`Hot update directory: ${HOT_UPDATE_DIR}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
