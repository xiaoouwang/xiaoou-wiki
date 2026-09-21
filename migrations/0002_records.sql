CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY NOT NULL,
  topic TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_topic ON records(topic);
CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at);
