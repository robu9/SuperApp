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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function makeHubMemory(params: {
  id: string;
  type: string;
  title: string;
  content: string;
  appName?: string | null;
}): MemoryNode {
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    content: params.content,
    metadata: { hub: true, app_name: params.appName ?? null },
    source_type: null,
    source_id: null,
    app_name: params.appName ?? null,
    window_name: null,
    salience: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** App / meeting / supermemory hubs + chronological + co-app edges. */
export function addStructuralLinks(graph: MemoryGraphData): MemoryGraphData {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const links = new Map(
    graph.links.map((l) => {
      const source = linkEndpointId(l.source);
      const target = linkEndpointId(l.target);
      return [linkKey(source, target, l.relation), { source, target, relation: l.relation }];
    })
  );

  const addLink = (source: string, target: string, relation: string) => {
    if (source === target) return;
    if (!nodes.has(source) || !nodes.has(target)) return;
    const key = linkKey(source, target, relation);
    if (links.has(key)) return;
    links.set(key, { source, target, relation });
  };

  // Root hub — mirrors supermemory's central "SUPERMEMORY" node.
  const rootId = "hub-supermemory";
  if (!nodes.has(rootId)) {
    nodes.set(
      rootId,
      memoryNodeToGraphNode(
        makeHubMemory({
          id: rootId,
          type: "topic",
          title: "SUPERMEMORY",
          content: "Local memory graph root",
        }),
        "hub"
      )
    );
  }

  const appGroups = new Map<string, GraphNode[]>();
  const meetingGroups = new Map<number, GraphNode[]>();
  const leaves: GraphNode[] = [];

  for (const node of nodes.values()) {
    if (node.role === "hub") continue;
    leaves.push(node);

    const app = node.memory.app_name?.trim();
    if (app) {
      const key = slugify(app);
      if (!appGroups.has(key)) appGroups.set(key, []);
      appGroups.get(key)!.push(node);
    }

    const meetingId = node.memory.metadata?.meeting_id;
    if (typeof meetingId === "number" && meetingId > 0) {
      if (!meetingGroups.has(meetingId)) meetingGroups.set(meetingId, []);
      meetingGroups.get(meetingId)!.push(node);
    }
  }

  for (const [key, group] of appGroups) {
    if (group.length < 1) continue;
    const appName = group[0].memory.app_name ?? key;
    const hubId = `hub-app-${key}`;
    if (!nodes.has(hubId)) {
      nodes.set(
        hubId,
        memoryNodeToGraphNode(
          makeHubMemory({
            id: hubId,
            type: "app",
            title: appName,
            content: `Memories captured in ${appName}`,
            appName,
          }),
          "hub"
        )
      );
    }
    addLink(rootId, hubId, "contains");
    for (const leaf of group) {
      addLink(hubId, leaf.id, "captured_in");
    }
  }

  for (const [meetingId, group] of meetingGroups) {
    const hubId = `hub-meeting-${meetingId}`;
    if (!nodes.has(hubId)) {
      nodes.set(
        hubId,
        memoryNodeToGraphNode(
          makeHubMemory({
            id: hubId,
            type: "meeting",
            title: `meeting ${meetingId}`,
            content: `Audio and notes from meeting ${meetingId}`,
          }),
          "hub"
        )
      );
    }
    addLink(rootId, hubId, "contains");
    for (const leaf of group) {
      addLink(hubId, leaf.id, "spoken_in");
    }
  }

  // Orphan leaves still attach to the root so the web stays connected.
  for (const leaf of leaves) {
    const hasApp = Boolean(leaf.memory.app_name?.trim());
    const meetingId = leaf.memory.metadata?.meeting_id;
    const hasMeeting = typeof meetingId === "number" && meetingId > 0;
    if (!hasApp && !hasMeeting) {
      addLink(rootId, leaf.id, "contains");
    }
  }

  // Chronological follows within the same app (or globally if no app).
  const byApp = new Map<string, GraphNode[]>();
  for (const leaf of leaves) {
    const key = leaf.memory.app_name?.trim()
      ? slugify(leaf.memory.app_name)
      : "__global__";
    if (!byApp.has(key)) byApp.set(key, []);
    byApp.get(key)!.push(leaf);
  }

  for (const group of byApp.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.memory.created_at).getTime() -
        new Date(b.memory.created_at).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      addLink(sorted[i].id, sorted[i + 1].id, "follows");
    }
  }

  // Type hubs for screen / audio / pinned memories when enough exist.
  const typeHubs: Array<{ type: string; title: string; match: (n: GraphNode) => boolean }> = [
    { type: "screen_chunk", title: "SCREEN", match: (n) => n.type === "screen_chunk" },
    { type: "audio_chunk", title: "AUDIO", match: (n) => n.type === "audio_chunk" },
    { type: "memory", title: "MEMORY", match: (n) => n.type === "memory" },
  ];

  for (const hub of typeHubs) {
    const group = leaves.filter(hub.match);
    if (group.length < 3) continue;
    const hubId = `hub-type-${hub.type}`;
    if (!nodes.has(hubId)) {
      nodes.set(
        hubId,
        memoryNodeToGraphNode(
          makeHubMemory({
            id: hubId,
            type: "topic",
            title: hub.title,
            content: `${hub.title} memories`,
          }),
          "hub"
        )
      );
    }
    addLink(rootId, hubId, "contains");
    for (const leaf of group.slice(0, 24)) {
      addLink(hubId, leaf.id, "contains");
    }
  }

  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
  };
}

export function pruneGraphLinks(
  graph: MemoryGraphData,
  maxPerNode = 10
): MemoryGraphData {
  const degree = new Map<string, number>();
  const kept: GraphLink[] = [];
  const seen = new Set<string>();

  const relationScore = (relation: string) => {
    if (relation === "captured_in" || relation === "spoken_in" || relation === "contains")
      return 5;
    if (relation === "related_to" || relation === "derived_from") return 4;
    if (relation === "follows") return 2;
    return 1;
  };

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
    const sourceIsHub = graph.nodes.find((n) => n.id === source)?.role === "hub";
    const targetIsHub = graph.nodes.find((n) => n.id === target)?.role === "hub";
    const sourceCap = sourceIsHub ? 40 : maxPerNode;
    const targetCap = targetIsHub ? 40 : maxPerNode;
    if (sourceDegree >= sourceCap || targetDegree >= targetCap) continue;

    seen.add(key);
    kept.push({ source, target, relation: link.relation });
    degree.set(source, sourceDegree + 1);
    degree.set(target, targetDegree + 1);
  }

  return { nodes: graph.nodes, links: kept };
}

export function addHeuristicLinks(graph: MemoryGraphData): MemoryGraphData {
  if (graph.nodes.length < 2) return graph;

  const links: GraphLink[] = [...graph.links];
  const seen = new Set(
    links.map((l) =>
      linkKey(linkEndpointId(l.source), linkEndpointId(l.target), l.relation)
    )
  );

  const leaves = graph.nodes.filter((n) => n.role !== "hub");
  const sorted = [...leaves].sort(
    (a, b) =>
      new Date(a.memory.created_at).getTime() - new Date(b.memory.created_at).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const key = linkKey(sorted[i].id, sorted[i + 1].id, "follows");
    if (seen.has(key)) continue;
    seen.add(key);
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
    nodes: memories.map((m) => memoryNodeToGraphNode(m)),
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
  return pruneGraphLinks(addHeuristicLinks(addStructuralLinks(graph)), 12);
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
