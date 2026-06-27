const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { SECTION_NAMES, SimpleDb } = require('./simple_db');
const { JsonDataStore } = require('./json_data_store');
const { RouteRegistry } = require('./route_registry');
const { LevelRankService } = require('./level_rank_service');
const { UserInfoService } = require('./user_info_service');
const { RefreshTimeService } = require('./refresh_time_service');
const { TravelService } = require('./travel_service');
const { DailyRankAchievementService } = require('./daily_rank_achievement_service');
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

function loadConfig() {
  const configPath = path.join(__dirname, 'server.config.json');
  const defaults = {
    host: '127.0.0.1',
    port: 8787,
    dbFile: './db/global_db.json',
    hotUpdateDir: '../VITA/build/hotupdate',
    maxBodyBytes: 1024 * 1024,
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
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || config.maxBodyBytes);
const mysqlPool = createMysqlPool(config);

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

const db = new SimpleDb(DB_FILE);
const userDb = new MysqlUserTable(mysqlPool);
const rankRepository = new MysqlRankRepository(mysqlPool);
const profileRepository = new MysqlProfileRepository(mysqlPool);
const achievementRepository = new MysqlAchievementRepository(mysqlPool);
const dailyRankRewardRepository = new MysqlDailyRankRewardRepository(mysqlPool);
const trackingRepository = new TrackingRepository(mysqlPool);
const dailyStatsRepository = new DailyStatsRepository(mysqlPool);
const difficultyRepository = new DifficultyRepository(mysqlPool);
const dailyRankAchievementService = new DailyRankAchievementService(achievementRepository);
const dailyRankRewardService = new DailyRankRewardService(dailyRankRewardRepository);
const levelRankService = new LevelRankService(rankRepository, {
  logger: console,
  userInfoDataStore: profileRepository,
  dailySpecialDataStore: rankRepository,
  dailyRankAchievementService,
});
const userInfoService = new UserInfoService(profileRepository, { dailyStatsRepository });
const refreshTimeService = new RefreshTimeService();
const travelDataStore = new JsonDataStore(path.join(path.dirname(DB_FILE), 'travel_data.json'), {
  version: 1,
  players: {},
});
const travelService = new TravelService(travelDataStore, { defaultFragmentLimit: 10, defaultTotalStages: 20 });
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

userInfoService.registerRoutes(apiRoutes);
refreshTimeService.registerRoutes(apiRoutes);
travelService.registerRoutes(apiRoutes);

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

async function routeUser(req, res, parts) {
  if (parts[0] !== 'api' || parts[1] !== 'user') return false;

  // POST /api/user/register
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'register') {
    const body = await parseBody(req);
    const user = await userDb.register(body.account, body.gameName, body.playerId);
    try {
      await dailyStatsRepository.recordNewUser(new Date());
    } catch (error) {
      console.error('[register] failed to record daily stats:', error.message);
    }
    const userInfo = await userInfoService.patchUserInfo(getPlayerIdFromUser(user), {
      name: user.gameName,
      playerName: user.gameName,
      avatarId: body.avatarId,
      avatarFrameId: body.avatarFrameId,
    });
    const difficultyConfig = await difficultyRepository.getConfig();
    sendJson(res, 200, { ok: true, user, userInfo, roleInfo: userInfo, difficultyConfig });
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
      await dailyStatsRepository.recordLogin(new Date());
    } catch (error) {
      console.error('[login] failed to record daily stats:', error.message);
    }
    const userInfo = await getUserInfoForLogin(user);
    const today = levelRankService.toDateString(new Date());
    await dailyRankRewardService.settleBefore(today);
    const rankReward = playerId ? await dailyRankRewardService.getPending(playerId) : null;
    const difficultyConfig = await difficultyRepository.getConfig();
    sendJson(res, 200, { ok: true, user, userInfo, roleInfo: userInfo, rankReward, difficultyConfig });
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
