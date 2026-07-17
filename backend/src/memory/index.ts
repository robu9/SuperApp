import { getDb } from "../db/index.js";
import { SUPERMEMORY_CONTAINER_TAG } from "../config.js";
import {
  buildGraphFromSearchResult,
  documentToMemoryNode,
  searchResultToMemoryNode,
} from "./adapter.js";
import { getSupermemoryClient, isSupermemoryReachable } from "./client.js";
import {
  ingestAudioChunk,
  ingestMeetingSummary,
  ingestScreenCapture,
  ingestUserMemory,
} from "./ingest.js";
import type { MemoryGraph, MemoryNode, MemoryStats } from "./types.js";

let initialized = false;

export function initSupermemory(): void {
  initialized = true;
}

export function isSupermemoryInitialized(): boolean {
  return initialized;
}

export async function retrieveContextForChat(
  query: string,
  charBudget = 24_000
): Promise<{ snippets: string[]; nodeIds: string[] }> {
  initSupermemory();

  if (!(await isSupermemoryReachable())) {
    return { snippets: [], nodeIds: [] };
  }

  try {
    const client = getSupermemoryClient();
    const trimmed = query.trim();
    const response = await client.profile({
      containerTag: SUPERMEMORY_CONTAINER_TAG,
      q: trimmed.length > 2 ? trimmed : undefined,
      threshold: 0.3,
    });

    const snippets: string[] = [];
    const nodeIds: string[] = [];
    let budget = 0;

    for (const fact of response.profile.static) {
      const snippet = `[profile] ${fact}`;
      if (budget + snippet.length > charBudget) break;
      snippets.push(snippet);
      budget += snippet.length;
    }

    for (const fact of response.profile.dynamic) {
      const snippet = `[recent] ${fact}`;
      if (budget + snippet.length > charBudget) break;
      snippets.push(snippet);
      budget += snippet.length;
    }

    for (const result of response.searchResults?.results ?? []) {
      const item = result as {
        id?: string;
        memory?: string;
        chunk?: string;
      };
      const text = item.memory ?? item.chunk;
      if (!text?.trim()) continue;
      if (budget + text.length > charBudget) break;
      snippets.push(text);
      if (item.id) nodeIds.push(item.id);
      budget += text.length;
    }

    return { snippets, nodeIds };
  } catch (err) {
    console.warn("[supermemory] retrieveContextForChat failed:", err);
    return { snippets: [], nodeIds: [] };
  }
}

export async function backfillSupermemory(): Promise<{ ingested: number }> {
  initSupermemory();

  if (!(await isSupermemoryReachable())) {
    console.warn(
      "[supermemory] local server not reachable at startup — run `npm run memory:start`"
    );
    return { ingested: 0 };
  }

  let ingested = 0;

  const ocrRows = getDb()
    .prepare(
      `SELECT o.frame_id, o.text, f.app_name, f.window_name, f.timestamp
       FROM ocr_text o
       JOIN frames f ON f.id = o.frame_id
       ORDER BY f.timestamp ASC
       LIMIT 500`
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
      await ingestScreenCapture({
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
       ORDER BY timestamp ASC
       LIMIT 500`
    )
    .all() as Array<{
    id: number;
    transcription: string;
    meeting_id: number | null;
    timestamp: string;
  }>;

  for (const row of audioRows) {
    if (
      await ingestAudioChunk({
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

export async function listNodes(params: {
  q?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: MemoryNode[]; total: number }> {
  initSupermemory();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  if (!(await isSupermemoryReachable())) {
    return { data: [], total: 0 };
  }

  try {
    const client = getSupermemoryClient();

    if (params.q?.trim()) {
      const response = await client.search.memories({
        q: params.q,
        containerTag: SUPERMEMORY_CONTAINER_TAG,
        limit,
      });

      const data = response.results
        .map(searchResultToMemoryNode)
        .filter((node) => !params.type || node.type === params.type);

      return { data, total: data.length };
    }

    const response = await client.documents.list({
      containerTags: [SUPERMEMORY_CONTAINER_TAG],
      limit,
      page: Math.floor(offset / limit) + 1,
      includeContent: true,
    });

    const data = response.memories
      .map(documentToMemoryNode)
      .filter((node) => !params.type || node.type === params.type);

    return {
      data,
      total: response.pagination?.totalItems ?? data.length,
    };
  } catch (err) {
    console.warn("[supermemory] listNodes failed:", err);
    return { data: [], total: 0 };
  }
}

export async function getNode(id: string): Promise<MemoryNode | null> {
  initSupermemory();

  if (!(await isSupermemoryReachable())) return null;

  try {
    const client = getSupermemoryClient();
    const doc = await client.documents.get(id);
    return documentToMemoryNode({
      id: doc.id,
      connectionId: doc.connectionId ?? null,
      createdAt: doc.createdAt,
      customId: doc.customId ?? null,
      filepath: doc.filepath ?? null,
      metadata: doc.metadata ?? null,
      status: doc.status,
      summary: doc.summary ?? null,
      title: doc.title ?? null,
      type: doc.type,
      updatedAt: doc.updatedAt,
      content: doc.content ?? doc.summary ?? undefined,
    });
  } catch {
    return null;
  }
}

export async function getNodeGraph(
  id: string,
  _hops = 2
): Promise<MemoryGraph | null> {
  initSupermemory();

  if (!(await isSupermemoryReachable())) return null;

  try {
    const client = getSupermemoryClient();
    const node = await getNode(id);
    if (!node) return null;

    const response = await client.search.memories({
      q: node.content.slice(0, 200) || node.title || id,
      containerTag: SUPERMEMORY_CONTAINER_TAG,
      limit: 5,
    });

    const match =
      response.results.find((result) => result.id === id) ?? response.results[0];

    if (!match) return { node, edges: [] };
    return buildGraphFromSearchResult(node, match, response.results);
  } catch {
    const node = await getNode(id);
    return node ? { node, edges: [] } : null;
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  initSupermemory();

  if (!(await isSupermemoryReachable())) {
    return { nodes: 0, edges: 0, by_type: {} };
  }

  try {
    const client = getSupermemoryClient();
    const response = await client.documents.list({
      containerTags: [SUPERMEMORY_CONTAINER_TAG],
      limit: 100,
      includeContent: false,
    });

    const by_type: Record<string, number> = {};
    for (const doc of response.memories) {
      const node = documentToMemoryNode(doc);
      by_type[node.type] = (by_type[node.type] ?? 0) + 1;
    }

    return {
      nodes: response.pagination?.totalItems ?? response.memories.length,
      edges: 0,
      by_type,
    };
  } catch {
    return { nodes: 0, edges: 0, by_type: {} };
  }
}

export function formatNodeSnippet(node: MemoryNode): string {
  const label =
    node.type === "screen_chunk"
      ? "[screen]"
      : node.type === "audio_chunk"
        ? "[audio]"
        : node.type === "meeting"
          ? "[meeting]"
          : node.type === "memory"
            ? "[memory]"
            : `[${node.type}]`;

  const parts = [
    label,
    node.app_name ? `[${node.app_name}]` : null,
    node.window_name ? `"${node.window_name}"` : null,
    node.content.slice(0, 1500),
  ].filter(Boolean);

  return parts.join(" ");
}

export {
  ingestScreenCapture,
  ingestAudioChunk,
  ingestMeetingSummary,
  ingestUserMemory,
};

export type {
  MemoryNode,
  MemoryEdge,
  MemoryGraph,
  MemoryNodeType,
  MemoryRelation,
  MemorySearchResult,
  MemoryStats,
} from "./types.js";
