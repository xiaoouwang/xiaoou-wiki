-- Single admin identity everything syncs under (exportable owner).
INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at)
VALUES (
  'admin',
  'admin@xiaoou.wiki',
  'token-auth-only',
  'Xiaoou Wang',
  datetime('now')
);

CREATE TABLE IF NOT EXISTS admin_content (
  path TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'admin',
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  commit_sha TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_content_owner ON admin_content(owner_id);
CREATE INDEX IF NOT EXISTS idx_admin_content_updated ON admin_content(updated_at);

CREATE TABLE IF NOT EXISTS admin_sync_log (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'admin',
  commit_sha TEXT,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
