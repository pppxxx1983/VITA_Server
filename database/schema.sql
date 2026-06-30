CREATE DATABASE IF NOT EXISTS vita_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vita_game;

CREATE TABLE IF NOT EXISTS game_users (
  account VARCHAR(191) PRIMARY KEY,
  player_id VARCHAR(191) NOT NULL UNIQUE,
  game_name VARCHAR(191) NOT NULL,
  token CHAR(64) NULL,
  registration_time DATETIME(3) NULL,
  last_login_time DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_game_users_token (token),
  INDEX idx_game_users_last_login (last_login_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_profiles (
  player_id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NULL,
  avatar_id INT UNSIGNED NOT NULL DEFAULT 0,
  avatar_frame_id INT UNSIGNED NOT NULL DEFAULT 0,
  perfect_combo_streak INT UNSIGNED NOT NULL DEFAULT 0,
  extra_data JSON NULL,
  registration_time DATETIME(3) NULL,
  last_login_time DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_player_profiles_name (name),
  INDEX idx_player_profiles_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS level_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  player_id VARCHAR(191) NOT NULL,
  level INT UNSIGNED NOT NULL,
  score BIGINT UNSIGNED NOT NULL DEFAULT 0,
  combo INT UNSIGNED NOT NULL DEFAULT 0,
  special_score BIGINT UNSIGNED NOT NULL DEFAULT 0,
  time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  perfect_combo TINYINT(1) NOT NULL DEFAULT 0,
  perfect_clear TINYINT(1) NOT NULL DEFAULT 0,
  display_name VARCHAR(191) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_level_scores_level_rank (level, score DESC, combo DESC, time_ms ASC),
  INDEX idx_level_scores_player (player_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_special_scores (
  rank_date DATE NOT NULL,
  player_id VARCHAR(191) NOT NULL,
  level INT UNSIGNED NOT NULL,
  score BIGINT UNSIGNED NOT NULL DEFAULT 0,
  combo INT UNSIGNED NOT NULL DEFAULT 0,
  special_score BIGINT UNSIGNED NOT NULL DEFAULT 0,
  time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  display_name VARCHAR(255) NULL,
  avatar_url VARCHAR(500) NULL,
  external_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (rank_date, player_id),
  INDEX idx_daily_special_rank (rank_date, special_score DESC, time_ms ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_rank_achievements (
  player_id VARCHAR(191) NOT NULL,
  rank_date DATE NOT NULL,
  rank_position TINYINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (player_id, rank_date, rank_position),
  INDEX idx_rank_achievements_date (rank_date, rank_position),
  CONSTRAINT chk_rank_position CHECK (rank_position BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_rank_rewards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rank_date DATE NOT NULL,
  player_id VARCHAR(191) NOT NULL,
  rank_position TINYINT UNSIGNED NOT NULL,
  refresh_count INT UNSIGNED NOT NULL,
  hint_count INT UNSIGNED NOT NULL,
  claimed_at DATETIME(3) NULL,
  claim_multiplier TINYINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_daily_rank_reward_player (rank_date, player_id),
  UNIQUE KEY uk_daily_rank_reward_position (rank_date, rank_position),
  INDEX idx_daily_rank_reward_pending (player_id, claimed_at, rank_date),
  CONSTRAINT chk_daily_reward_rank CHECK (rank_position BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracking_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(96) NOT NULL UNIQUE,
  event_name VARCHAR(64) NOT NULL,
  player_id VARCHAR(191) NULL,
  session_id VARCHAR(96) NULL,
  platform VARCHAR(32) NULL,
  app_version VARCHAR(32) NULL,
  client_time DATETIME(3) NOT NULL,
  server_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  properties JSON NULL,
  user_ip VARCHAR(45) NULL,
  INDEX idx_tracking_event_time (event_name, client_time),
  INDEX idx_tracking_player_time (player_id, client_time),
  INDEX idx_tracking_server_time (server_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_stats (
  stat_date DATE NOT NULL PRIMARY KEY,
  login_count INT UNSIGNED NOT NULL DEFAULT 0,
  new_users INT UNSIGNED NOT NULL DEFAULT 0,
  peak_online INT UNSIGNED NOT NULL DEFAULT 0,
  avg_online INT UNSIGNED NOT NULL DEFAULT 0,
  paying_users INT UNSIGNED NOT NULL DEFAULT 0,
  retention_d1 INT UNSIGNED NOT NULL DEFAULT 0,
  retention_d1_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  retention_d3 INT UNSIGNED NOT NULL DEFAULT 0,
  retention_d3_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  retention_d7 INT UNSIGNED NOT NULL DEFAULT 0,
  retention_d7_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  retention_d15 INT UNSIGNED NOT NULL DEFAULT 0,
  retention_d15_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_id VARCHAR(191) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(32) NOT NULL DEFAULT 'CNY',
  product_id VARCHAR(191) NULL,
  paid_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_payment_player (player_id),
  INDEX idx_payment_date (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_first_seen (
  player_id VARCHAR(191) NOT NULL PRIMARY KEY,
  first_seen_date DATE NOT NULL,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_first_seen_date (first_seen_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_daily_logins (
  player_id VARCHAR(191) NOT NULL,
  login_date DATE NOT NULL,
  login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (player_id, login_date),
  INDEX idx_login_date (login_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS online_stats (
  stat_date DATE NOT NULL PRIMARY KEY,
  realtime_online INT UNSIGNED NOT NULL DEFAULT 0,
  avg_online INT UNSIGNED NOT NULL DEFAULT 0,
  total_online INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_difficulty_levels (
  mode VARCHAR(32) NOT NULL DEFAULT 'normal',
  level INT UNSIGNED NOT NULL,
  range_id INT UNSIGNED NULL,
  difficulty TINYINT UNSIGNED NOT NULL,
  difficulty_label VARCHAR(16) NOT NULL DEFAULT 'normal',
  curve_factor DECIMAL(7,4) NOT NULL DEFAULT 1.0000,
  manual_override TINYINT(1) NOT NULL DEFAULT 0,
  grid_w SMALLINT UNSIGNED NOT NULL,
  grid_h SMALLINT UNSIGNED NOT NULL,
  max_layers SMALLINT UNSIGNED NOT NULL,
  min_tiles SMALLINT UNSIGNED NOT NULL,
  max_tiles SMALLINT UNSIGNED NOT NULL,
  chaos DECIMAL(5,4) NOT NULL,
  min_available_pairs SMALLINT UNSIGNED NOT NULL,
  hidden_ratio DECIMAL(5,4) NOT NULL,
  special_pair_count SMALLINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mode, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_difficulty_ranges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mode VARCHAR(32) NOT NULL DEFAULT 'normal',
  start_level INT UNSIGNED NOT NULL,
  end_level INT UNSIGNED NOT NULL,
  difficulty TINYINT UNSIGNED NOT NULL,
  grid_w SMALLINT UNSIGNED NOT NULL,
  grid_h SMALLINT UNSIGNED NOT NULL,
  max_layers SMALLINT UNSIGNED NOT NULL,
  min_tiles SMALLINT UNSIGNED NOT NULL,
  max_tiles SMALLINT UNSIGNED NOT NULL,
  chaos DECIMAL(5,4) NOT NULL,
  min_available_pairs SMALLINT UNSIGNED NOT NULL,
  hidden_ratio DECIMAL(5,4) NOT NULL,
  special_pair_count SMALLINT UNSIGNED NOT NULL,
  curve_type VARCHAR(16) NOT NULL DEFAULT 'wave',
  curve_amplitude DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
  curve_cycles DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_difficulty_range (mode, start_level, end_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
