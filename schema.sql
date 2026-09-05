CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  github_username TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  warned_at TEXT
);