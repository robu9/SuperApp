import { api, type MemoryGraphResponse, type MemoryNode } from "@/lib/api/client";
import type { GraphLink, GraphNode, MemoryGraphData } from "@/components/sections/memory-graph-canvas";
import { memoryNodeToGraphNode } from "@/components/sections/memory-graph-canvas";

function linkKey(from: string, to: string, relation: string): string {
  const [a, b] = from < to ? [from, to] : [to, from];
  return `${a}|${b}|${relation}`;
}

export function mergeGraphResponse(
  graph: MemoryGraphData,
  response: MemoryGraphResponse
): MemoryGraphData {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const links = new Map(graph.links.map((l) => [linkKey(l.source, l.target, l.relation), l]));

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
        if (link.source === node.id) matched.add(link.target);
        if (link.target === node.id) matched.add(link.source);
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
