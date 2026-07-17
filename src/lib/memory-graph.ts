import { api, type MemoryGraphResponse, type MemoryNode } from "@/lib/api/client";
import type { GraphLink, GraphNode, MemoryGraphData } from "@/components/sections/memory-graph-canvas";
import { memoryNodeToGraphNode } from "@/components/sections/memory-graph-canvas";

function linkKey(from: string, to: string, relation: string): string {
  const [a, b] = from < to ? [from, to] : [to, from];
  return `${a}|${b}|${relation}`;
}

export function linkEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

export function pruneGraphLinks(
  graph: MemoryGraphData,
  maxPerNode = 3
): MemoryGraphData {
  const degree = new Map<string, number>();
  const kept: GraphLink[] = [];
  const seen = new Set<string>();

  const relationScore = (relation: string) =>
    relation === "related_to" ? 3 : relation === "follows" ? 2 : 1;

  const sorted = [...graph.links].sort(
    (a, b) => relationScore(b.relation) - relationScore(a.relation)
  );

  for (const link of sorted) {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);
    const key = linkKey(source, target, link.relation);
    if (seen.has(key)) continue;

    const sourceDegree = degree.get(source) ?? 0;
    const targetDegree = degree.get(target) ?? 0;
    if (sourceDegree >= maxPerNode || targetDegree >= maxPerNode) continue;

    seen.add(key);
    kept.push({ source, target, relation: link.relation });
    degree.set(source, sourceDegree + 1);
    degree.set(target, targetDegree + 1);
  }

  return { nodes: graph.nodes, links: kept };
}

export function addHeuristicLinks(graph: MemoryGraphData): MemoryGraphData {
  if (graph.links.length > 0) {
    return pruneGraphLinks(graph);
  }

  if (graph.nodes.length < 2) {
    return graph;
  }

  const links: GraphLink[] = [];
  const sorted = [...graph.nodes].sort(
    (a, b) =>
      new Date(a.memory.created_at).getTime() - new Date(b.memory.created_at).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    links.push({
      source: sorted[i].id,
      target: sorted[i + 1].id,
      relation: "follows",
    });
  }

  return { nodes: graph.nodes, links };
}

export function mergeGraphResponse(
  graph: MemoryGraphData,
  response: MemoryGraphResponse
): MemoryGraphData {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const links = new Map(
    graph.links.map((l) => [
      linkKey(linkEndpointId(l.source), linkEndpointId(l.target), l.relation),
      {
        source: linkEndpointId(l.source),
        target: linkEndpointId(l.target),
        relation: l.relation,
      },
    ])
  );

  if (!nodes.has(response.node.id)) {
    nodes.set(response.node.id, memoryNodeToGraphNode(response.node));
  }

  for (const edge of response.edges) {
    if (!nodes.has(edge.neighbor.id)) {
      nodes.set(edge.neighbor.id, memoryNodeToGraphNode(edge.neighbor));
    }

    const key = linkKey(edge.from_id, edge.to_id, edge.relation);
    if (!links.has(key)) {
      links.set(key, {
        source: edge.from_id,
        target: edge.neighbor.id,
        relation: edge.relation,
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
  };
}

export function graphFromMemories(memories: MemoryNode[]): MemoryGraphData {
  return {
    nodes: memories.map(memoryNodeToGraphNode),
    links: [],
  };
}

export async function expandGraphForMemories(
  graph: MemoryGraphData,
  memories: MemoryNode[],
  concurrency = 6
): Promise<MemoryGraphData> {
  let result = graph;

  for (let i = 0; i < memories.length; i += concurrency) {
    const chunk = memories.slice(i, i + concurrency);
    const responses = await Promise.all(
      chunk.map((memory) => api.memoryGraph(memory.id, 2).catch(() => null))
    );

    for (const response of responses) {
      if (response) {
        result = mergeGraphResponse(result, response);
      }
    }
  }

  return result;
}

export function finalizeGraph(graph: MemoryGraphData): MemoryGraphData {
  return pruneGraphLinks(addHeuristicLinks(graph));
}

export function filterGraphHighlight(
  graph: MemoryGraphData,
  query: string
): Set<string> {
  const q = query.trim().toLowerCase();
  if (!q) return new Set();

  const matched = new Set<string>();
  for (const node of graph.nodes) {
    const haystack = `${node.label} ${node.memory.content} ${node.type}`.toLowerCase();
    if (haystack.includes(q)) {
      matched.add(node.id);
      for (const link of graph.links) {
        const sourceId = linkEndpointId(link.source);
        const targetId = linkEndpointId(link.target);
        if (sourceId === node.id) matched.add(targetId);
        if (targetId === node.id) matched.add(sourceId);
      }
    }
  }
  return matched;
}

export function getNodeById(
  graph: MemoryGraphData,
  id: string | null
): MemoryNode | null {
  if (!id) return null;
  return graph.nodes.find((n) => n.id === id)?.memory ?? null;
}
