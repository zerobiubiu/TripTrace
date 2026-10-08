-- 途迹 TripTrace 初始化迁移
-- 说明：D1 默认开启外键约束，ON DELETE CASCADE 生效。

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,        -- 归一化登录名（拉丁字母统一小写）
  display_name   TEXT NOT NULL,               -- 显示名（可中文）
  pwd_algo       TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
  pwd_salt       TEXT NOT NULL,               -- base64url
  pwd_hash       TEXT NOT NULL,               -- base64url
  pwd_iterations INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,          -- sha256(token) 十六进制
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  extended_at  TEXT NOT NULL,                 -- 最近一次滚动续期时间
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS trips (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date       TEXT NOT NULL,                   -- YYYY-MM-DD（用户本地日期）
  nodes      TEXT NOT NULL,                   -- JSON 数组：途经节点，按顺序
  legs       TEXT NOT NULL DEFAULT '[]',      -- JSON 数组：[{from,to,km|null}]
  total_km   REAL,                            -- 总里程；NULL 表示未填
  note       TEXT,
  source     TEXT NOT NULL DEFAULT 'manual',  -- manual | import
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS trips_user_date_idx ON trips (user_id, date DESC, created_at DESC);
