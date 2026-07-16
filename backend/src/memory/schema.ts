export const MEMORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memory_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata_json TEXT,
  source_type TEXT,
  source_id INTEGER,
  app_name TEXT,
  window_name TEXT,
  salience REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memory_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_id, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_source ON memory_nodes(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_created ON memory_nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_app ON memory_nodes(app_name);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_relation ON memory_edges(relation);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  title,
  content,
  node_id UNINDEXED,
  type UNINDEXED,
  tokenize='porter unicode61'
);
`;
