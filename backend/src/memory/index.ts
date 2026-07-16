import { getDb } from "../db/index.js";
import { ingestAudioChunk, ingestScreenCapture } from "./ingest.js";
import {
  formatNodeSnippet,
  getMemoryStats,
  getNode,
  getNodeGraph,
  initSupermemory,
  listNodes,
  searchMemoryNodes,
  traverseGraph,
} from "./graph.js";

export function retrieveContextForChat(
  query: string,
  charBudget = 24_000
): { snippets: string[]; nodeIds: number[] } {
  initSupermemory();

  const seeds = new Map<number, number>();
  const trimmed = query.trim();

  if (trimmed.length > 2) {
    for (const hit of searchMemoryNodes(trimmed, 8)) {
      seeds.set(hit.node.id, Math.max(seeds.get(hit.node.id) ?? 0, hit.score));
    }
  }

  for (const node of listNodes({ limit: 6 }).data) {
    if (node.type === "screen_chunk" || node.type === "audio_chunk") {
      seeds.set(node.id, Math.max(seeds.get(node.id) ?? 0, 0.4));
    }
  }

  for (const node of listNodes({ limit: 4, type: "memory" }).data) {
    seeds.set(node.id, Math.max(seeds.get(node.id) ?? 0, 0.7));
  }

  const graphHits = traverseGraph([...seeds.keys()], 2, 20);
  const ranked = new Map<number, { node: ReturnType<typeof getNode>; score: number }>();

  for (const [id, seedScore] of seeds) {
    const node = getNode(id);
    if (node) ranked.set(id, { node, score: seedScore });
  }

  for (const hit of graphHits) {
    const existing = ranked.get(hit.node.id);
    if (!existing || existing.score < hit.score) {
      ranked.set(hit.node.id, { node: hit.node, score: hit.score });
    }
  }

  const ordered = [...ranked.values()]
    .filter((item): item is { node: NonNullable<ReturnType<typeof getNode>>; score: number } =>
      item.node != null
    )
    .sort((a, b) => {
      const salienceDiff = b.node.salience - a.node.salience;
      if (Math.abs(salienceDiff) > 0.05) return salienceDiff;
      return b.score - a.score;
    });

  const snippets: string[] = [];
  const nodeIds: number[] = [];
  let budget = 0;

  for (const item of ordered) {
    const snippet = formatNodeSnippet(item.node);
    if (!snippet.trim()) continue;
    if (budget + snippet.length > charBudget) break;
    if (snippets.includes(snippet)) continue;
    snippets.push(snippet);
    nodeIds.push(item.node.id);
    budget += snippet.length;
  }

  return { snippets, nodeIds };
}

export function backfillSupermemory(): { ingested: number } {
  initSupermemory();

  const existing = (
    getDb().prepare(`SELECT COUNT(*) as count FROM memory_nodes`).get() as { count: number }
  ).count;
  if (existing > 0) return { ingested: 0 };

  let ingested = 0;

  const ocrRows = getDb()
    .prepare(
      `SELECT o.frame_id, o.text, f.app_name, f.window_name, f.timestamp
       FROM ocr_text o
       JOIN frames f ON f.id = o.frame_id
       ORDER BY f.timestamp ASC`
    )
    .all() as Array<{
    frame_id: number;
    text: string;
    app_name: string | null;
    window_name: string | null;
    timestamp: string;
  }>;

  for (const row of ocrRows) {
    if (
      ingestScreenCapture({
        frameId: row.frame_id,
        text: row.text,
        appName: row.app_name,
        windowName: row.window_name,
        timestamp: row.timestamp,
      })
    ) {
      ingested++;
    }
  }

  const audioRows = getDb()
    .prepare(
      `SELECT id, transcription, meeting_id, timestamp
       FROM audio_transcriptions
       WHERE length(trim(transcription)) > 0
       ORDER BY timestamp ASC`
    )
    .all() as Array<{
    id: number;
    transcription: string;
    meeting_id: number | null;
    timestamp: string;
  }>;

  for (const row of audioRows) {
    if (
      ingestAudioChunk({
        audioId: row.id,
        transcription: row.transcription,
        meetingId: row.meeting_id,
        timestamp: row.timestamp,
      })
    ) {
      ingested++;
    }
  }

  return { ingested };
}

export {
  initSupermemory,
  getNode,
  getNodeGraph,
  listNodes,
  getMemoryStats,
  formatNodeSnippet,
  searchMemoryNodes,
  traverseGraph,
} from "./graph.js";

export {
  ingestScreenCapture,
  ingestAudioChunk,
  ingestMeetingSummary,
  ingestUserMemory,
} from "./ingest.js";

export type {
  MemoryNode,
  MemoryEdge,
  MemoryGraph,
  MemoryNodeType,
  MemoryRelation,
  MemorySearchResult,
  MemoryStats,
} from "./types.js";
