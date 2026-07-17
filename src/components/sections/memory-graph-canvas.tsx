import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
} from "react-force-graph-2d";
import type { MemoryNode } from "@/lib/api/client";
import { linkEndpointId } from "@/lib/memory-graph";
import { useTheme } from "@/components/theme-provider";

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
}

export interface MemoryGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface MemoryGraphCanvasProps {
  data: MemoryGraphData;
  selectedId: string | null;
  highlightIds: Set<string>;
  onSelect: (id: string | null) => void;
  onNodeDragEnd?: (node: GraphNode) => void;
}

function nodeLabel(node: MemoryNode): string {
  return (node.title ?? node.content.slice(0, 48)).toLowerCase();
}

function nodeRadius(type: string, salience: number): number {
  const base =
    type === "topic" || type === "meeting"
      ? 10
      : type === "memory"
        ? 8
        : type === "screen_chunk" || type === "audio_chunk"
          ? 6
          : 7;
  return base + salience * 4;
}

export function memoryNodeToGraphNode(memory: MemoryNode): GraphNode {
  return {
    id: memory.id,
    label: nodeLabel(memory),
    type: memory.type,
    memory,
    val: nodeRadius(memory.type, memory.salience),
  };
}

export function MemoryGraphCanvas({
  data,
  selectedId,
  highlightIds,
  onSelect,
  onNodeDragEnd,
}: MemoryGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const { isDark } = useTheme();
  const [size, setSize] = React.useState({ width: 800, height: 600 });

  const palette = useMemo(
    () => ({
      background: isDark ? "hsl(0 0% 7%)" : "hsl(0 0% 100%)",
      foreground: isDark ? "hsl(0 0% 100%)" : "hsl(0 0% 0%)",
      muted: isDark ? "hsl(0 0% 40%)" : "hsl(0 0% 40%)",
      border: isDark ? "hsl(0 0% 25%)" : "hsl(0 0% 80%)",
      accent: isDark ? "hsl(0 0% 18%)" : "hsl(0 0% 96%)",
    }),
    [isDark]
  );

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

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({
        source: linkEndpointId(l.source),
        target: linkEndpointId(l.target),
        relation: l.relation,
      })),
    }),
    [data]
  );

  useEffect(() => {
    if (!selectedId || !graphRef.current) return;
    const node = graphData.nodes.find((n) => n.id === selectedId);
    if (!node || node.x == null || node.y == null) return;
    graphRef.current.centerAt(node.x, node.y, 400);
    graphRef.current.zoom(2.2, 400);
  }, [selectedId, graphData.nodes]);

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = node.id === selectedId;
      const isHighlighted =
        highlightIds.size === 0 || highlightIds.has(node.id);
      const radius = node.val ?? 8;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);

      if (isSelected) {
        ctx.fillStyle = palette.foreground;
        ctx.fill();
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = palette.foreground;
        ctx.stroke();
      } else if (isHighlighted) {
        ctx.fillStyle = palette.background;
        ctx.fill();
        ctx.lineWidth = 1.5 / globalScale;
        ctx.strokeStyle = palette.foreground;
        ctx.stroke();
      } else {
        ctx.fillStyle = palette.accent;
        ctx.fill();
        ctx.lineWidth = 1 / globalScale;
        ctx.strokeStyle = palette.border;
        ctx.stroke();
      }

      if (globalScale > 0.65 && isHighlighted) {
        const fontSize = Math.max(10 / globalScale, 3);
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? palette.background : palette.foreground;
        const text = node.label.length > 28 ? `${node.label.slice(0, 26)}…` : node.label;
        ctx.fillText(text, x, y + radius + 2 / globalScale);
      }
    },
    [highlightIds, palette, selectedId]
  );

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 bg-background">
      <ForceGraph2D
        ref={graphRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor={palette.background}
        linkColor={() => palette.muted}
        linkWidth={1.2}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.004}
        linkLabel={(link) =>
          (link as GraphLink).relation.replace(/_/g, " ")
        }
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GraphNode;
          const radius = (n.val ?? 8) + 4;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        onNodeClick={(node) => {
          const n = node as GraphNode;
          onSelect(n.id === selectedId ? null : n.id);
        }}
        onBackgroundClick={() => onSelect(null)}
        onNodeDragEnd={(node) => onNodeDragEnd?.(node as GraphNode)}
      />
    </div>
  );
}
