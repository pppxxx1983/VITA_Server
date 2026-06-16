CREATE DATABASE IF NOT EXISTS vita_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vita_game;

CREATE TABLE IF NOT EXISTS game_users (
  account VARCHAR(191) PRIMARY KEY,
  player_id VARCHAR(191) NOT NULL UNIQUE,
  game_name VARCHAR(191) NOT NULL,
  token CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_game_users_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_profiles (
  player_id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NULL,
  avatar_id INT UNSIGNED NOT NULL DEFAULT 0,
  avatar_frame_id INT UNSIGNED NOT NULL DEFAULT 0,
  perfect_combo_streak INT UNSIGNED NOT NULL DEFAULT 0,
  extra_data JSON NULL,
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
  display_name VARCHAR(191) NULL,
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
