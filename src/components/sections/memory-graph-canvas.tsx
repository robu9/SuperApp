import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { MemoryNode } from "@/lib/api/client";
import { linkEndpointId } from "@/lib/memory-graph";
import { getFocusSet, isLinkFocused } from "@/lib/memory-graph-layout";

/** Supermemory-style dark knowledge web */
const GRAPH = {
  background: "#000000",
  edge: "rgba(255, 255, 255, 0.55)",
  edgeDim: "rgba(255, 255, 255, 0.08)",
  edgeFocus: "rgba(255, 255, 255, 0.92)",
  leaf: "#f97316",
  leafActive: "#fb923c",
  hubFill: "#0a0a0a",
  hubStroke: "#f5f5f5",
  hubText: "#ffffff",
  dim: 0.18,
};

const APP_COLORS: Record<string, string> = {
  chrome: "#4285f4",
  "google chrome": "#4285f4",
  code: "#0078d4",
  "visual studio code": "#0078d4",
  vscode: "#0078d4",
  discord: "#5865f2",
  slack: "#e01e5a",
  spotify: "#1db954",
  youtube: "#ff0000",
  twitter: "#e7e9ea",
  x: "#e7e9ea",
  chatgpt: "#10a37f",
  openai: "#10a37f",
  pinterest: "#e60023",
  cursor: "#f5f5f5",
};

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
}

export interface GraphNode extends NodeObject {
  id: string;
  label: string;
  type: string;
  memory: MemoryNode;
  val: number;
  role?: "hub" | "leaf";
}

export interface MemoryGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface MemoryGraphCanvasProps {
  data: MemoryGraphData;
  selectedId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

function nodeLabel(node: MemoryNode): string {
  return (node.title ?? node.content.slice(0, 48)).trim() || "memory";
}

function nodeRadius(type: string, salience: number, role?: "hub" | "leaf"): number {
  if (role === "hub") {
    if (type === "topic") return 22;
    if (type === "app" || type === "meeting") return 16;
    return 14;
  }
  const base =
    type === "meeting" || type === "topic"
      ? 7
      : type === "memory"
        ? 5.5
        : type === "screen_chunk" || type === "audio_chunk"
          ? 4.5
          : 5;
  return base + salience * 2.5;
}

function hubAccent(node: GraphNode): string {
  const app = (node.memory.app_name ?? node.label).toLowerCase();
  for (const [key, color] of Object.entries(APP_COLORS)) {
    if (app.includes(key)) return color;
  }
  if (node.type === "meeting") return "#a78bfa";
  if (node.id === "hub-supermemory") return "#f97316";
  return "#e5e5e5";
}

export function memoryNodeToGraphNode(
  memory: MemoryNode,
  role: "hub" | "leaf" = "leaf"
): GraphNode {
  return {
    id: memory.id,
    label: nodeLabel(memory),
    type: memory.type,
    memory,
    role,
    val: nodeRadius(memory.type, memory.salience, role),
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function MemoryGraphCanvas({
  data,
  selectedId,
  hoverId,
  onHover,
  onSelect,
}: MemoryGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const [size, setSize] = useState({ width: 800, height: 600 });

  const activeId = selectedId ?? hoverId;
  const focus = useMemo(() => getFocusSet(data, activeId), [data, activeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links
        .map((l) => ({
          source: linkEndpointId(l.source),
          target: linkEndpointId(l.target),
          relation: l.relation,
        }))
        .filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target)),
    };
  }, [data]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const linkForce = fg.d3Force("link") as
      | {
          distance: (fn: (link: LinkObject<GraphNode, GraphLink>) => number) => void;
          strength: (n: number) => void;
        }
      | undefined;
    linkForce?.distance((link: LinkObject<GraphNode, GraphLink>) => {
      const source = typeof link.source === "object" ? (link.source as GraphNode) : null;
      const target = typeof link.target === "object" ? (link.target as GraphNode) : null;
      if (source?.role === "hub" || target?.role === "hub") return 70;
      return 42;
    });
    linkForce?.strength(0.45);
    const chargeForce = fg.d3Force("charge") as
      | { strength: (fn: (node: GraphNode) => number) => void }
      | undefined;
    chargeForce?.strength((node: GraphNode) => (node.role === "hub" ? -520 : -120));
    const centerForce = fg.d3Force("center") as { strength?: (n: number) => void } | undefined;
    centerForce?.strength?.(0.05);
  }, [graphData]);

  useEffect(() => {
    if (!selectedId || !graphRef.current) return;
    const node = graphData.nodes.find((n) => n.id === selectedId);
    if (!node || node.x == null || node.y == null) return;
    graphRef.current.centerAt(node.x, node.y, 500);
    graphRef.current.zoom(2.2, 500);
  }, [selectedId, graphData.nodes]);

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const inFocus = !activeId || focus.has(node.id);
      const isActive = activeId === node.id;
      const radius = node.val ?? 6;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      ctx.globalAlpha = inFocus ? 1 : GRAPH.dim;

      if (node.role === "hub") {
        const accent = hubAccent(node);
        const label = node.label.toUpperCase();
        const fontSize = Math.max(9 / globalScale, 3.2);
        ctx.font = `600 ${fontSize}px "DM Sans", system-ui, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const padX = 10 / globalScale;
        const padY = 7 / globalScale;
        const boxW = Math.max(radius * 2.2, textWidth + padX * 2);
        const boxH = Math.max(radius * 1.4, fontSize + padY * 2);

        // Soft glow
        ctx.beginPath();
        ctx.arc(x, y, Math.max(boxW, boxH) * 0.55, 0, 2 * Math.PI);
        ctx.fillStyle = isActive ? `${accent}55` : `${accent}22`;
        ctx.fill();

        drawRoundedRect(ctx, x - boxW / 2, y - boxH / 2, boxW, boxH, 6 / globalScale);
        ctx.fillStyle = GRAPH.hubFill;
        ctx.fill();
        ctx.lineWidth = (isActive ? 2.2 : 1.4) / globalScale;
        ctx.strokeStyle = isActive ? accent : GRAPH.hubStroke;
        ctx.stroke();

        // App color chip
        ctx.beginPath();
        ctx.arc(x - boxW / 2 + 8 / globalScale, y, 3.5 / globalScale, 0, 2 * Math.PI);
        ctx.fillStyle = accent;
        ctx.fill();

        ctx.fillStyle = GRAPH.hubText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + 2 / globalScale, y);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isActive ? GRAPH.leafActive : GRAPH.leaf;
        ctx.fill();

        if (isActive) {
          ctx.lineWidth = 2 / globalScale;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();

          if (globalScale > 0.7) {
            const fontSize = Math.max(9 / globalScale, 2.8);
            ctx.font = `500 ${fontSize}px "DM Sans", system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#fafafa";
            const text =
              node.label.length > 26 ? `${node.label.slice(0, 24)}…` : node.label;
            ctx.fillText(text, x, y + radius + 3 / globalScale);
          }
        }
      }

      ctx.globalAlpha = 1;
    },
    [activeId, focus]
  );

  const linkColor = useCallback(
    (link: LinkObject<GraphNode, GraphLink>) => {
      const focused = isLinkFocused(link as GraphLink, focus);
      if (!activeId) return GRAPH.edge;
      return focused ? GRAPH.edgeFocus : GRAPH.edgeDim;
    },
    [activeId, focus]
  );

  const linkWidth = useCallback(
    (link: LinkObject<GraphNode, GraphLink>) => {
      const focused = isLinkFocused(link as GraphLink, focus);
      if (!activeId) return 0.9;
      return focused ? 1.8 : 0.35;
    },
    [activeId, focus]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 overflow-hidden"
      style={{ background: GRAPH.background }}
    >
      <ForceGraph2D
        ref={graphRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor={GRAPH.background}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalParticles={0}
        enableNodeDrag
        cooldownTicks={180}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
        warmupTicks={40}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GraphNode;
          const radius = (n.val ?? 6) + (n.role === "hub" ? 14 : 6);
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        onNodeClick={(node) => {
          const n = node as GraphNode;
          onSelect(n.id === selectedId ? null : n.id);
        }}
        onNodeHover={(node) => onHover(node ? (node as GraphNode).id : null)}
        onBackgroundClick={() => onSelect(null)}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] tracking-wide text-white/40">
        drag nodes · scroll to zoom · click to inspect
      </div>
    </div>
  );
}
