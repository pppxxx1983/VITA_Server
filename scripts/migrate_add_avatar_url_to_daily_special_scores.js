#!/usr/bin/env node
/**
 * Migration: add avatar_url column to daily_special_scores table.
 * Run manually after updating the server code:
 *   node scripts/migrate_add_avatar_url_to_daily_special_scores.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mysql = require('mysql2/promise');

async function run() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'vita_game';

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
  });

  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = ? AND table_name = 'daily_special_scores' AND column_name = 'avatar_url'`,
      [database]
    );
    if (rows[0].cnt > 0) {
      console.log('[migrate] avatar_url column already exists, skipping.');
      return;
    }
    await pool.execute(
      `ALTER TABLE daily_special_scores
       ADD COLUMN avatar_url VARCHAR(500) NULL AFTER display_name`
    );
    console.log('[migrate] avatar_url column added successfully.');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
