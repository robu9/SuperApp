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

export function addHeuristicLinks(graph: MemoryGraphData): MemoryGraphData {
  const links = [...graph.links];
  const keys = new Set(links.map((l) => linkKey(linkEndpointId(l.source), linkEndpointId(l.target), l.relation)));

  const addLink = (from: string, to: string, relation: string) => {
    if (from === to) return;
    const key = linkKey(from, to, relation);
    if (keys.has(key)) return;
    keys.add(key);
    links.push({ source: from, target: to, relation });
  };

  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const a = graph.nodes[i].memory;
      const b = graph.nodes[j].memory;

      if (a.app_name && a.app_name === b.app_name) {
        addLink(a.id, b.id, "captured_in");
      }

      if (a.window_name && a.window_name === b.window_name) {
        addLink(a.id, b.id, "mentions");
      }
    }
  }

  if (links.length === 0 && graph.nodes.length >= 2) {
    const sorted = [...graph.nodes].sort(
      (a, b) =>
        new Date(a.memory.created_at).getTime() - new Date(b.memory.created_at).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      addLink(sorted[i].id, sorted[i + 1].id, "follows");
    }

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 2; j < Math.min(i + 4, sorted.length); j++) {
        addLink(sorted[i].id, sorted[j].id, "related_to");
      }
    }
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
  return addHeuristicLinks(graph);
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
