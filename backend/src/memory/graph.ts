import { getDb } from "../db/index.js";
import { MEMORY_SCHEMA_SQL } from "./schema.js";
import type {
  MemoryEdge,
  MemoryGraph,
  MemoryNode,
  MemoryNodeType,
  MemoryRelation,
  MemorySearchResult,
  MemorySourceType,
  MemoryStats,
} from "./types.js";

interface NodeRow {
  id: number;
  type: string;
  title: string | null;
  content: string;
  metadata_json: string | null;
  source_type: string | null;
  source_id: number | null;
  app_name: string | null;
  window_name: string | null;
  salience: number;
  created_at: string;
  updated_at: string;
}

let initialized = false;

export function initSupermemory(): void {
  if (initialized) return;
  getDb().exec(MEMORY_SCHEMA_SQL);
  initialized = true;
}

function rowToNode(row: NodeRow): MemoryNode {
  return {
    id: row.id,
    type: row.type as MemoryNode["type"],
    title: row.title,
    content: row.content,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
    source_type: row.source_type as MemoryNode["source_type"],
    source_id: row.source_id,
    app_name: row.app_name,
    window_name: row.window_name,
    salience: row.salience,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function lastInsertId(): number {
  const row = getDb()
    .prepare(`SELECT last_insert_rowid() as id`)
    .get() as { id: number };
  return row.id;
}

function indexNodeFts(nodeId: number, title: string | null, content: string, type: string): void {
  getDb().prepare(`DELETE FROM memory_fts WHERE node_id = ?`).run(nodeId);
  getDb()
    .prepare(`INSERT INTO memory_fts (title, content, node_id, type) VALUES (?, ?, ?, ?)`)
    .run(title ?? "", content, nodeId, type);
}

export function findNodeBySource(
  sourceType: MemorySourceType,
  sourceId: number
): MemoryNode | null {
  initSupermemory();
  const row = getDb()
    .prepare(
      `SELECT * FROM memory_nodes WHERE source_type = ? AND source_id = ? LIMIT 1`
    )
    .get(sourceType, sourceId) as NodeRow | undefined;
  return row ? rowToNode(row) : null;
}

export function upsertAppNode(appName: string): number {
  initSupermemory();
  const existing = getDb()
    .prepare(`SELECT id FROM memory_nodes WHERE type = 'app' AND title = ? LIMIT 1`)
    .get(appName) as { id: number } | undefined;

  if (existing) return existing.id;

  getDb()
    .prepare(
      `INSERT INTO memory_nodes (type, title, content, salience)
       VALUES ('app', ?, ?, 0.3)`
    )
    .run(appName, `application context: ${appName}`);

  const id = lastInsertId();
  indexNodeFts(id, appName, `application context: ${appName}`, "app");
  return id;
}

export function createMemoryNode(params: {
  type: MemoryNodeType;
  title?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
  sourceType?: MemorySourceType | null;
  sourceId?: number | null;
  appName?: string | null;
  windowName?: string | null;
  salience?: number;
  createdAt?: string;
}): number {
  initSupermemory();

  if (params.sourceType && params.sourceId != null) {
    const existing = findNodeBySource(params.sourceType, params.sourceId);
    if (existing) return existing.id;
  }

  getDb()
    .prepare(
      `INSERT INTO memory_nodes
       (type, title, content, metadata_json, source_type, source_id, app_name, window_name, salience, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`
    )
    .run(
      params.type,
      params.title ?? null,
      params.content,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.sourceType ?? null,
      params.sourceId ?? null,
      params.appName ?? null,
      params.windowName ?? null,
      params.salience ?? 0.5,
      params.createdAt ?? null
    );

  const id = lastInsertId();
  indexNodeFts(id, params.title ?? null, params.content, params.type);
  return id;
}

export function updateMemoryNode(
  id: number,
  updates: { title?: string; content?: string; salience?: number }
): void {
  initSupermemory();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push("content = ?");
    values.push(updates.content);
  }
  if (updates.salience !== undefined) {
    fields.push("salience = ?");
    values.push(updates.salience);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  getDb()
    .prepare(`UPDATE memory_nodes SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);

  const node = getNode(id);
  if (node) {
    indexNodeFts(id, updates.title ?? node.title, updates.content ?? node.content, node.type);
  }
}

export function linkNodes(
  fromId: number,
  toId: number,
  relation: MemoryRelation,
  weight = 1
): void {
  if (fromId === toId) return;
  initSupermemory();
  getDb()
    .prepare(
      `INSERT INTO memory_edges (from_id, to_id, relation, weight)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(from_id, to_id, relation) DO UPDATE SET weight = MAX(weight, excluded.weight)`
    )
    .run(fromId, toId, relation, weight);
}

export function getLatestChunkNode(
  type: "screen_chunk" | "audio_chunk",
  appName?: string | null
): MemoryNode | null {
  initSupermemory();
  const row = appName
    ? (getDb()
        .prepare(
          `SELECT * FROM memory_nodes
           WHERE type = ? AND app_name = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(type, appName) as NodeRow | undefined)
    : (getDb()
        .prepare(
          `SELECT * FROM memory_nodes WHERE type = ? ORDER BY created_at DESC LIMIT 1`
        )
        .get(type) as NodeRow | undefined);
  return row ? rowToNode(row) : null;
}

export function getNode(id: number): MemoryNode | null {
  initSupermemory();
  const row = getDb()
    .prepare(`SELECT * FROM memory_nodes WHERE id = ?`)
    .get(id) as NodeRow | undefined;
  return row ? rowToNode(row) : null;
}

export function listNodes(params: {
  limit?: number;
  offset?: number;
  type?: MemoryNodeType;
  q?: string;
}): { data: MemoryNode[]; total: number } {
  initSupermemory();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  if (params.q?.trim()) {
    const ftsQuery = params.q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replace(/"/g, '""')}"*`)
      .join(" AND ");

    const typeFilter = params.type ? `AND n.type = ?` : "";
    const rows = getDb()
      .prepare(
        `SELECT n.*, bm25(memory_fts) as rank
         FROM memory_fts
         JOIN memory_nodes n ON n.id = memory_fts.node_id
         WHERE memory_fts MATCH ? ${typeFilter}
         ORDER BY rank
         LIMIT ? OFFSET ?`
      )
      .all(
        ftsQuery,
        ...(params.type ? [params.type] : []),
        limit,
        offset
      ) as NodeRow[];

    const total = (
      getDb()
        .prepare(
          `SELECT COUNT(*) as count
           FROM memory_fts
           JOIN memory_nodes n ON n.id = memory_fts.node_id
           WHERE memory_fts MATCH ? ${typeFilter}`
        )
        .get(ftsQuery, ...(params.type ? [params.type] : [])) as { count: number }
    ).count;

    return { data: rows.map(rowToNode), total };
  }

  const where = params.type ? `WHERE type = ?` : "";
  const args = params.type ? [params.type, limit, offset] : [limit, offset];
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_nodes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...args) as NodeRow[];

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) as count FROM memory_nodes ${where}`)
      .get(...(params.type ? [params.type] : [])) as { count: number }
  ).count;

  return { data: rows.map(rowToNode), total };
}

export function searchMemoryNodes(
  query: string,
  limit = 12
): MemorySearchResult[] {
  initSupermemory();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const ftsQuery = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" AND ");

  const rows = getDb()
    .prepare(
      `SELECT n.*, bm25(memory_fts) as rank
       FROM memory_fts
       JOIN memory_nodes n ON n.id = memory_fts.node_id
       WHERE memory_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(ftsQuery, limit) as Array<NodeRow & { rank: number }>;

  return rows.map((row) => ({
    node: rowToNode(row),
    score: -row.rank,
    match_source: "fts" as const,
  }));
}

export function traverseGraph(
  seedIds: number[],
  maxHops = 2,
  maxNodes = 24
): MemorySearchResult[] {
  initSupermemory();
  if (seedIds.length === 0) return [];

  const visited = new Set<number>();
  const scored = new Map<number, MemorySearchResult>();
  let frontier = seedIds.map((id, i) => ({ id, hop: 0, score: 1 / (i + 1) }));

  while (frontier.length > 0 && scored.size < maxNodes) {
    const nextFrontier: Array<{ id: number; hop: number; score: number }> = [];

    for (const item of frontier) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);

      const node = getNode(item.id);
      if (!node) continue;

      const existing = scored.get(item.id);
      const nodeScore = item.score * (0.5 + node.salience);
      if (!existing || existing.score < nodeScore) {
        scored.set(item.id, {
          node,
          score: nodeScore,
          match_source: item.hop === 0 ? "fts" : "graph",
        });
      }

      if (item.hop >= maxHops) continue;

      const edges = getDb()
        .prepare(
          `SELECT from_id, to_id, weight FROM memory_edges
           WHERE from_id = ? OR to_id = ?`
        )
        .all(item.id, item.id) as Array<{
        from_id: number;
        to_id: number;
        weight: number;
      }>;

      for (const edge of edges) {
        const neighborId = edge.from_id === item.id ? edge.to_id : edge.from_id;
        if (visited.has(neighborId)) continue;
        nextFrontier.push({
          id: neighborId,
          hop: item.hop + 1,
          score: item.score * edge.weight * 0.85,
        });
      }
    }

    frontier = nextFrontier;
  }

  return [...scored.values()].sort((a, b) => b.score - a.score);
}

export function getNodeGraph(id: number, hops = 2): MemoryGraph | null {
  initSupermemory();
  const node = getNode(id);
  if (!node) return null;

  const neighborhood = traverseGraph([id], hops, 40);
  const neighborIds = neighborhood.map((item) => item.node.id).filter((nid) => nid !== id);

  const edges: MemoryGraph["edges"] = [];
  if (neighborIds.length > 0) {
    const placeholders = neighborIds.map(() => "?").join(",");
    const edgeRows = getDb()
      .prepare(
        `SELECT * FROM memory_edges
         WHERE (from_id = ? AND to_id IN (${placeholders}))
            OR (to_id = ? AND from_id IN (${placeholders}))`
      )
      .all(id, ...neighborIds, id, ...neighborIds) as MemoryEdge[];

    for (const edge of edgeRows) {
      const neighborId = edge.from_id === id ? edge.to_id : edge.from_id;
      const neighbor = getNode(neighborId);
      if (neighbor) {
        edges.push({ ...edge, neighbor });
      }
    }
  }

  return { node, edges };
}

export function getMemoryStats(): MemoryStats {
  initSupermemory();
  const nodes = (
    getDb().prepare(`SELECT COUNT(*) as count FROM memory_nodes`).get() as { count: number }
  ).count;
  const edges = (
    getDb().prepare(`SELECT COUNT(*) as count FROM memory_edges`).get() as { count: number }
  ).count;
  const typeRows = getDb()
    .prepare(`SELECT type, COUNT(*) as count FROM memory_nodes GROUP BY type`)
    .all() as Array<{ type: string; count: number }>;

  const by_type: Record<string, number> = {};
  for (const row of typeRows) {
    by_type[row.type] = row.count;
  }

  return { nodes, edges, by_type };
}

export function formatNodeSnippet(node: MemoryNode, maxLen = 1200): string {
  const sourceLabel =
    node.type === "audio_chunk"
      ? "[audio]"
      : node.type === "screen_chunk"
        ? "[screen]"
        : node.type === "meeting"
          ? "[meeting]"
          : node.type === "task"
            ? "[task]"
            : node.type === "memory"
              ? "[memory]"
              : `[${node.type}]`;

  const parts = [
    sourceLabel,
    node.app_name ? `[${node.app_name}]` : null,
    node.window_name ? `"${node.window_name}"` : null,
    node.title ? `(${node.title})` : null,
    node.content.slice(0, maxLen),
  ].filter(Boolean);

  return parts.join(" ");
}
