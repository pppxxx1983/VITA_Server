const fs = require('fs');
const path = require('path');
const { createMysqlPool, verifyMysql } = require('../mysql_database');
const { MysqlProfileRepository } = require('../mysql_profile_repository');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'server.config.json'), 'utf8'));
const pool = createMysqlPool(config);
const profiles = new MysqlProfileRepository(pool);

function readJson(name, fallback) {
  const filePath = path.join(root, 'db', name);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mysqlDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

async function migrateUsers() {
  const data = readJson('users.json', { users: {} });
  let count = 0;
  for (const user of Object.values(data.users || {})) {
    const registrationTime = user.registrationTime ? mysqlDate(user.registrationTime) : mysqlDate(user.createdAt);
    const lastLoginTime = user.lastLoginTime ? mysqlDate(user.lastLoginTime) : null;
    await pool.execute(
      `INSERT INTO game_users (account, player_id, game_name, token, registration_time, last_login_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         player_id = VALUES(player_id), game_name = VALUES(game_name),
         token = VALUES(token), registration_time = VALUES(registration_time),
         last_login_time = VALUES(last_login_time), updated_at = VALUES(updated_at)`,
      [user.account, user.playerId || user.account, user.gameName || user.account,
        user.token || null, registrationTime, lastLoginTime,
        mysqlDate(user.createdAt), mysqlDate(user.updatedAt)]
    );
    count++;
  }
  return count;
}

async function migrateProfiles() {
  const data = readJson('user_info.json', { userInfos: {} });
  let count = 0;
  for (const [playerId, profile] of Object.entries(data.userInfos || {})) {
    await profiles.upsert(playerId, profile);
    count++;
  }
  return count;
}

async function migrateLevelScores() {
  const data = readJson('level_rank.json', { levels: {} });
  let count = 0;
  for (const [levelKey, levelData] of Object.entries(data.levels || {})) {
    const records = [];
    if (levelData.players && typeof levelData.players === 'object') records.push(...Object.values(levelData.players));
    if (Array.isArray(levelData.scores)) records.push(...levelData.scores);
    for (const score of records) {
      const externalId = String(score.id || `legacy_${levelKey}_${score.playerId}_${count}`);
      await pool.execute(
        `INSERT IGNORE INTO level_scores
           (external_id, player_id, level, score, combo, special_score, time_ms,
            perfect_combo, perfect_clear, display_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [externalId, score.playerId, Number(score.level || levelKey), Number(score.score || 0),
          Number(score.combo || 0), Number(score.specialScore || 0), Number(score.timeMs || 0),
          score.perfectCombo ? 1 : 0, score.perfectClear ? 1 : 0, score.name || null,
          mysqlDate(score.updatedAt)]
      );
      count++;
    }
  }
  return count;
}

async function migrateDailySpecial() {
  const data = readJson('daily_special.json', { dailySpecial: {} });
  let count = 0;
  for (const [date, records] of Object.entries(data.dailySpecial || {})) {
    for (const score of records || []) {
      await pool.execute(
        `INSERT INTO daily_special_scores
           (rank_date, player_id, level, score, combo, special_score, time_ms,
            display_name, external_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           level = VALUES(level), score = VALUES(score), combo = VALUES(combo),
           special_score = VALUES(special_score), time_ms = VALUES(time_ms),
           display_name = VALUES(display_name), external_id = VALUES(external_id),
           updated_at = VALUES(updated_at)`,
        [date, score.playerId, Number(score.level || 1), Number(score.score || 0),
          Number(score.combo || 0), Number(score.specialScore || 0), Number(score.timeMs || 0),
          score.name || null, String(score.id || `legacy_daily_${date}_${score.playerId}`),
          mysqlDate(score.updatedAt), mysqlDate(score.updatedAt)]
      );
      count++;
    }
  }
  return count;
}

async function migrateAchievements() {
  const data = readJson('daily_rank_achievement.json', { players: {} });
  let count = 0;
  for (const [playerId, achievement] of Object.entries(data.players || {})) {
    for (const [date, ranks] of Object.entries(achievement.dailyRanks || {})) {
      for (const rank of ranks || []) {
        await pool.execute(
          `INSERT IGNORE INTO daily_rank_achievements (player_id, rank_date, rank_position, created_at)
           VALUES (?, ?, ?, ?)`,
          [playerId, date, Number(rank), mysqlDate(achievement.createdAt)]
        );
        count++;
      }
    }
  }
  return count;
}

async function main() {
  await verifyMysql(pool);
  const summary = {
    users: await migrateUsers(),
    profiles: await migrateProfiles(),
    levelScores: await migrateLevelScores(),
    dailySpecialScores: await migrateDailySpecial(),
    achievements: await migrateAchievements(),
  };
  console.log('Migration completed:', summary);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
