import type { GraphLink, GraphNode, MemoryGraphData } from "@/components/sections/memory-graph-canvas";
import { linkEndpointId } from "@/lib/memory-graph";

export type GraphViewMode = "flow" | "force" | "type" | "story";

export interface GraphLane {
  id: string;
  label: string;
  types: string[];
  match?: (node: GraphNode) => boolean;
}

export const FLOW_LANES: GraphLane[] = [
  { id: "capture", label: "capture", types: ["screen_chunk", "audio_chunk"] },
  { id: "memories", label: "memories", types: ["memory", "document"] },
  { id: "entities", label: "entities", types: ["topic", "app"] },
  { id: "events", label: "events", types: ["meeting", "task"] },
];

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  contentHeight: number;
  contentWidth: number;
}

const MIN_CELL_W = 36;
const MIN_CELL_H = 28;
const STORY_GAP_X = 148;
const STORY_ROW_GAP = 80;

function nodeInLane(node: GraphNode, lane: GraphLane): boolean {
  if (lane.match) return lane.match(node);
  return lane.types.includes(node.type);
}

function layoutNodesInGrid(
  laneNodes: GraphNode[],
  laneLeft: number,
  laneWidth: number,
  startY: number,
  availableHeight: number
): { positions: Map<string, NodePosition>; height: number } {
  const positions = new Map<string, NodePosition>();
  if (laneNodes.length === 0) {
    return { positions, height: availableHeight };
  }

  const maxCols = Math.max(1, Math.floor(laneWidth / MIN_CELL_W));
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(laneNodes.length))));
  const rows = Math.ceil(laneNodes.length / cols);
  const contentHeight = Math.max(availableHeight, rows * MIN_CELL_H + 24);
  const cellW = laneWidth / cols;
  const cellH = contentHeight / rows;

  laneNodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(node.id, {
      x: laneLeft + cellW * col + cellW / 2,
      y: startY + cellH * row + cellH / 2,
    });
  });

  return { positions, height: contentHeight };
}

export function getFocusSet(graph: MemoryGraphData, nodeId: string | null): Set<string> {
  if (!nodeId) return new Set();
  const focus = new Set<string>([nodeId]);
  for (const link of graph.links) {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);
    if (source === nodeId) focus.add(target);
    if (target === nodeId) focus.add(source);
  }
  return focus;
}

export function isLinkFocused(link: GraphLink, focus: Set<string>): boolean {
  if (focus.size === 0) return true;
  const source = linkEndpointId(link.source);
  const target = linkEndpointId(link.target);
  return focus.has(source) && focus.has(target);
}

export function buildTypeLanes(graph: MemoryGraphData): GraphLane[] {
  const types = [...new Set(graph.nodes.map((n) => n.type))].sort();
  return types.map((type) => ({
    id: type,
    label: type.replace(/_/g, " "),
    types: [type],
  }));
}

/** When captures dominate, split flow into app columns instead of one vertical stack. */
export function buildFlowLanes(graph: MemoryGraphData): GraphLane[] {
  const captureTypes = new Set(["screen_chunk", "audio_chunk"]);
  const captureCount = graph.nodes.filter((n) => captureTypes.has(n.type)).length;
  const captureHeavy = graph.nodes.length > 0 && captureCount / graph.nodes.length >= 0.6;

  if (!captureHeavy || graph.nodes.length < 6) {
    const active = FLOW_LANES.filter((lane) => graph.nodes.some((n) => nodeInLane(n, lane)));
    return active.length > 0 ? active : FLOW_LANES;
  }

  const appGroups = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    const app = (node.memory.app_name || "unknown").toLowerCase().slice(0, 24);
    const group = appGroups.get(app) ?? [];
    group.push(node);
    appGroups.set(app, group);
  }

  const topApps = [...appGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  return topApps.map(([app, nodes]) => {
    const ids = new Set(nodes.map((n) => n.id));
    return {
      id: `app:${app}`,
      label: app,
      types: [],
      match: (node: GraphNode) => ids.has(node.id),
    };
  });
}

export function layoutLaneNodes(
  nodes: GraphNode[],
  lanes: GraphLane[],
  width: number,
  height: number,
  padding = 48,
  topOffset = 40
): LayoutResult {
  const positions = new Map<string, NodePosition>();
  const usableWidth = Math.max(width - padding * 2, 200);
  const laneCount = Math.max(lanes.length, 1);
  const laneWidth = usableWidth / laneCount;
  const startY = padding + topOffset;
  const availableHeight = Math.max(height - startY - padding, 200);

  let maxContentHeight = availableHeight;

  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    const lane = lanes[laneIndex];
    const laneNodes = nodes
      .filter((node) => nodeInLane(node, lane))
      .sort(
        (a, b) =>
          new Date(a.memory.created_at).getTime() - new Date(b.memory.created_at).getTime()
      );
    const laneLeft = padding + laneWidth * laneIndex;

    const { positions: lanePositions, height: laneHeight } = layoutNodesInGrid(
      laneNodes,
      laneLeft,
      laneWidth,
      startY,
      availableHeight
    );

    for (const [id, pos] of lanePositions) {
      positions.set(id, pos);
    }
    maxContentHeight = Math.max(maxContentHeight, laneHeight);
  }

  return {
    positions,
    contentHeight: maxContentHeight + padding,
    contentWidth: width,
  };
}

export function layoutStoryNodes(
  nodes: GraphNode[],
  width: number,
  height: number,
  padding = 48,
  topOffset = 40
): LayoutResult {
  const positions = new Map<string, NodePosition>();
  const sorted = [...nodes].sort(
    (a, b) =>
      new Date(a.memory.created_at).getTime() - new Date(b.memory.created_at).getTime()
  );

  if (sorted.length === 0) {
    return { positions, contentHeight: height, contentWidth: width };
  }

  const usableWidth = Math.max(width - padding * 2, 200);
  const nodesPerRow = Math.max(1, Math.floor(usableWidth / STORY_GAP_X));
  const rows = Math.ceil(sorted.length / nodesPerRow);
  const contentWidth = Math.max(
    width,
    padding * 2 + (nodesPerRow - 1) * STORY_GAP_X + 40,
    padding * 2 + (sorted.length - 1) * STORY_GAP_X + 40
  );
  const contentHeight = Math.max(
    height,
    topOffset + padding * 2 + rows * STORY_ROW_GAP + 60
  );
  const startY = topOffset + padding + 48;

  sorted.forEach((node, index) => {
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;
    const rowReversed = row % 2 === 1;
    const colInRow = rowReversed ? nodesPerRow - 1 - col : col;
    const nodesInThisRow = Math.min(nodesPerRow, sorted.length - row * nodesPerRow);
    const rowWidth = (nodesInThisRow - 1) * STORY_GAP_X;
    const rowStartX = padding + 24 + (usableWidth - rowWidth) / 2;

    positions.set(node.id, {
      x: rowStartX + colInRow * STORY_GAP_X,
      y: startY + row * STORY_ROW_GAP,
    });
  });

  return { positions, contentHeight, contentWidth };
}

export function countNodeKinds(graph: MemoryGraphData): number {
  return new Set(graph.nodes.map((n) => n.type)).size;
}

export function laneCounts(
  graph: MemoryGraphData,
  lanes: GraphLane[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lane of lanes) {
    counts[lane.id] = graph.nodes.filter((n) => nodeInLane(n, lane)).length;
  }
  return counts;
}
