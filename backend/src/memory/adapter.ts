import type { DocumentListResponse } from "supermemory/resources/documents.js";
import type { SearchMemoriesResponse } from "supermemory/resources/search.js";
import type { MemoryGraph, MemoryNode, MemoryNodeType } from "./types.js";

function metadataRecord(
  metadata: DocumentListResponse.Memory["metadata"]
): Record<string, unknown> | null {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

export function documentToMemoryNode(doc: DocumentListResponse.Memory): MemoryNode {
  const metadata = metadataRecord(doc.metadata);
  const type = (
    typeof metadata?.superapp_type === "string"
      ? metadata.superapp_type
      : "memory"
  ) as MemoryNodeType;

  return {
    id: doc.id,
    type,
    title: doc.title,
    content: doc.content ?? doc.summary ?? "",
    metadata,
    source_type:
      typeof metadata?.source_type === "string"
        ? (metadata.source_type as MemoryNode["source_type"])
        : null,
    source_id:
      typeof metadata?.source_id === "number" ? metadata.source_id : null,
    app_name:
      typeof metadata?.app_name === "string" ? metadata.app_name : null,
    window_name:
      typeof metadata?.window_name === "string" ? metadata.window_name : null,
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
  const content = result.memory ?? result.chunk ?? "";
  const type = (
    typeof metadata.superapp_type === "string"
      ? String(metadata.superapp_type)
      : result.memory
        ? "memory"
        : "document"
  ) as MemoryNodeType;

  return {
    id: result.id,
    type,
    title:
      typeof metadata.title === "string"
        ? metadata.title
        : content.slice(0, 60).toLowerCase(),
    content,
    metadata,
    source_type:
      typeof metadata.source_type === "string"
        ? (metadata.source_type as MemoryNode["source_type"])
        : null,
    source_id:
      typeof metadata.source_id === "number" ? metadata.source_id : null,
    app_name:
      typeof metadata.app_name === "string" ? metadata.app_name : null,
    window_name:
      typeof metadata.window_name === "string" ? metadata.window_name : null,
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
    .filter((candidate) => candidate.id !== node.id)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, 2)) {
    const similarity = item.similarity ?? 0;
    if (similarity < 0.35 && edges.length > 0) continue;
    addEdge(
      searchResultToMemoryNode(item),
      "related_to",
      similarity || 0.5
    );
  }

  const context = result.context;
  const related = [
    ...(context?.related ?? []),
    ...(context?.parents ?? []),
    ...(context?.children ?? []),
  ];

  for (const item of related) {
    const neighborContent =
      typeof item === "object" && item && "memory" in item
        ? String(item.memory ?? "")
        : String(item);

    if (!neighborContent.trim()) continue;

    const itemId =
      typeof item === "object" && item && "id" in item && typeof item.id === "string"
        ? item.id
        : `related-${edges.length}`;

    const neighbor: MemoryNode = {
      id: itemId,
      type: "memory",
      title: neighborContent.slice(0, 60).toLowerCase(),
      content: neighborContent,
      metadata: null,
      source_type: null,
      source_id: null,
      app_name: null,
      window_name: null,
      salience: 0.5,
      created_at: node.updated_at,
      updated_at: node.updated_at,
    };

    addEdge(neighbor, "related_to");
  }

  return { node, edges };
}
