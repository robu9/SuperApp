import type { DocumentListResponse } from "supermemory/resources/documents.js";
import type { SearchMemoriesResponse } from "supermemory/resources/search.js";
import type { MemoryGraph, MemoryNode, MemoryNodeType, MemoryRelation } from "./types.js";

function metadataRecord(
  metadata: DocumentListResponse.Memory["metadata"]
): Record<string, unknown> | null {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

/** Prefer document id so graph nodes match documents.list / documents.get. */
export function resolveSearchDocumentId(
  result: SearchMemoriesResponse.Result
): string {
  const doc = result.documents?.[0];
  if (doc && typeof doc.id === "string" && doc.id.length > 0) {
    return doc.id;
  }
  return result.id;
}

function cleanDisplayTitle(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const cleaned = value
    .replace(/^\[\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?\]\s*/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?[:\s-–—]+\s*/i, "")
    .trim();
  return cleaned || null;
}

export function documentToMemoryNode(doc: DocumentListResponse.Memory): MemoryNode {
  const metadata = metadataRecord(doc.metadata);
  const type = (
    typeof metadata?.superapp_type === "string"
      ? metadata.superapp_type
      : "memory"
  ) as MemoryNodeType;

  const metaTitle =
    typeof metadata?.title === "string" && metadata.title.trim()
      ? metadata.title.trim()
      : null;
  const rawContent = doc.content ?? doc.summary ?? "";
  const cleanedContent = rawContent
    .replace(/^\[(?:screen|audio|meeting|memory)\][^\n]*\n?/i, "")
    .trim();

  return {
    id: doc.id,
    type,
    title:
      cleanDisplayTitle(metaTitle) ??
      cleanDisplayTitle(doc.title) ??
      cleanDisplayTitle(cleanedContent.slice(0, 60)) ??
      null,
    content: cleanedContent || rawContent,
    metadata,
    source_type:
      typeof metadata?.source_type === "string"
        ? (metadata.source_type as MemoryNode["source_type"])
        : null,
    source_id:
      typeof metadata?.source_id === "number" ? metadata.source_id : null,
    app_name:
      typeof metadata?.app_name === "string" && metadata.app_name.trim()
        ? metadata.app_name.trim()
        : null,
    window_name:
      typeof metadata?.window_name === "string" && metadata.window_name.trim()
        ? metadata.window_name.trim()
        : null,
    salience:
      typeof metadata?.salience === "number" ? metadata.salience : 0.5,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

export function searchResultToMemoryNode(
  result: SearchMemoriesResponse.Result
): MemoryNode {
  const metadata = result.metadata ?? {};
  const rawContent = result.memory ?? result.chunk ?? "";
  const content = rawContent
    .replace(/^\[(?:screen|audio|meeting|memory)\][^\n]*\n?/i, "")
    .trim() || rawContent;
  const type = (
    typeof metadata.superapp_type === "string"
      ? String(metadata.superapp_type)
      : result.memory
        ? "memory"
        : "document"
  ) as MemoryNodeType;

  const metaTitle =
    typeof metadata.title === "string" && metadata.title.trim()
      ? metadata.title.trim()
      : null;

  return {
    id: resolveSearchDocumentId(result),
    type,
    title:
      cleanDisplayTitle(metaTitle) ??
      cleanDisplayTitle(content.slice(0, 60)) ??
      "memory",
    content,
    metadata,
    source_type:
      typeof metadata.source_type === "string"
        ? (metadata.source_type as MemoryNode["source_type"])
        : null,
    source_id:
      typeof metadata.source_id === "number" ? metadata.source_id : null,
    app_name:
      typeof metadata.app_name === "string" && metadata.app_name.trim()
        ? metadata.app_name.trim()
        : null,
    window_name:
      typeof metadata.window_name === "string" && metadata.window_name.trim()
        ? metadata.window_name.trim()
        : null,
    salience:
      typeof metadata.salience === "number"
        ? metadata.salience
        : result.similarity,
    created_at:
      typeof metadata.created_at === "string"
        ? metadata.created_at
        : result.updatedAt,
    updated_at: result.updatedAt,
  };
}

function relationFromContext(
  relation: string | undefined
): MemoryRelation {
  if (relation === "updates") return "follows";
  if (relation === "extends" || relation === "derives") return "derived_from";
  return "related_to";
}

export function buildGraphFromSearchResult(
  node: MemoryNode,
  result: SearchMemoriesResponse.Result,
  allResults: SearchMemoriesResponse.Result[] = [result]
): MemoryGraph {
  const edges: MemoryGraph["edges"] = [];
  const seen = new Set<string>();

  const addEdge = (
    neighbor: MemoryNode,
    relation: MemoryGraph["edges"][number]["relation"],
    weight = 1
  ) => {
    if (neighbor.id === node.id) return;
    const key = [node.id, neighbor.id].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);

    edges.push({
      id: `edge-${edges.length}`,
      from_id: node.id,
      to_id: neighbor.id,
      relation,
      weight,
      created_at: node.updated_at,
      neighbor,
    });
  };

  for (const item of allResults
    .filter((candidate) => resolveSearchDocumentId(candidate) !== node.id)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, 6)) {
    const similarity = item.similarity ?? 0;
    if (similarity < 0.2 && edges.length >= 3) continue;
    addEdge(searchResultToMemoryNode(item), "related_to", similarity || 0.5);
  }

  const context = result.context;
  const related = [
    ...(context?.related ?? []).map((item) => ({
      ...item,
      mappedRelation: relationFromContext(item.relation),
    })),
    ...(context?.parents ?? []).map((item) => ({
      ...item,
      mappedRelation: relationFromContext(item.relation),
    })),
    ...(context?.children ?? []).map((item) => ({
      ...item,
      mappedRelation: relationFromContext(item.relation),
    })),
  ];

  for (const item of related) {
    const neighborContent =
      typeof item === "object" && item && "memory" in item
        ? String(item.memory ?? "")
        : String(item);

    if (!neighborContent.trim()) continue;

    const meta =
      typeof item === "object" && item && "metadata" in item && item.metadata
        ? (item.metadata as Record<string, unknown>)
        : null;

    const itemId =
      typeof meta?.document_id === "string"
        ? meta.document_id
        : typeof meta?.source_id === "number"
          ? `src-${meta.source_id}`
          : typeof item === "object" &&
              item &&
              "id" in item &&
              typeof (item as { id?: unknown }).id === "string"
            ? String((item as { id: string }).id)
            : null;

    // Skip synthetic IDs that can't join the document graph — match by content later on client.
    if (!itemId) {
      const contentKey = neighborContent
        .slice(0, 80)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 32);
      const neighbor: MemoryNode = {
        id: `ctx-${contentKey || edges.length}`,
        type: "memory",
        title: neighborContent.slice(0, 60).toLowerCase(),
        content: neighborContent,
        metadata: meta,
        source_type: null,
        source_id: null,
        app_name: typeof meta?.app_name === "string" ? meta.app_name : null,
        window_name: null,
        salience: 0.5,
        created_at: node.updated_at,
        updated_at: node.updated_at,
      };
      addEdge(neighbor, item.mappedRelation);
      continue;
    }

    const neighbor: MemoryNode = {
      id: itemId,
      type:
        typeof meta?.superapp_type === "string"
          ? (meta.superapp_type as MemoryNodeType)
          : "memory",
      title: neighborContent.slice(0, 60).toLowerCase(),
      content: neighborContent,
      metadata: meta,
      source_type: null,
      source_id: typeof meta?.source_id === "number" ? meta.source_id : null,
      app_name: typeof meta?.app_name === "string" ? meta.app_name : null,
      window_name: null,
      salience: 0.5,
      created_at: node.updated_at,
      updated_at: node.updated_at,
    };

    addEdge(neighbor, item.mappedRelation);
  }

  return { node, edges };
}
