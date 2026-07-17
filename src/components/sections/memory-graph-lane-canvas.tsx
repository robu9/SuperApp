import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GraphLane } from "@/lib/memory-graph-layout";
import {
  getFocusSet,
  isLinkFocused,
  layoutLaneNodes,
  layoutStoryNodes,
} from "@/lib/memory-graph-layout";
import { linkEndpointId } from "@/lib/memory-graph";
import type { GraphLink, GraphNode, MemoryGraphData } from "@/components/sections/memory-graph-canvas";

interface MemoryGraphLaneCanvasProps {
  data: MemoryGraphData;
  lanes: GraphLane[];
  mode: "flow" | "type" | "story";
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function nodeStroke(focused: boolean, active: boolean): string {
  if (active) return "hsl(var(--foreground))";
  if (focused) return "hsl(var(--foreground) / 0.7)";
  return "hsl(var(--border))";
}

function nodeFill(type: string, focused: boolean, active: boolean): string {
  if (active) return "hsl(var(--foreground))";
  if (!focused) return "hsl(var(--muted) / 0.35)";
  if (type === "screen_chunk" || type === "audio_chunk") return "hsl(var(--surface-secondary))";
  if (type === "memory" || type === "document") return "hsl(var(--background))";
  return "hsl(var(--surface))";
}

export function MemoryGraphLaneCanvas({
  data,
  lanes,
  mode,
  focusId,
  onFocus,
  onSelect,
}: MemoryGraphLaneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hoverId, setHoverId] = useState<string | null>(null);

  const activeId = focusId ?? hoverId;
  const focus = useMemo(() => getFocusSet(data, activeId), [data, activeId]);
  const headerOffset = 40;

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

  const { positions, contentHeight, contentWidth } = useMemo(() => {
    if (mode === "story") {
      return layoutStoryNodes(data.nodes, size.width, size.height, 48, headerOffset);
    }
    return layoutLaneNodes(data.nodes, lanes, size.width, size.height, 48, headerOffset);
  }, [data.nodes, lanes, mode, size.height, size.width]);

  const laneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lane of lanes) {
      counts[lane.id] = data.nodes.filter((n) =>
        lane.match ? lane.match(n) : lane.types.includes(n.type)
      ).length;
    }
    return counts;
  }, [data.nodes, lanes]);

  const svgHeight = Math.max(size.height, contentHeight);
  const svgWidth = Math.max(size.width, contentWidth);

  const renderNodeLabel = (node: GraphNode) => {
    const label = node.label.length > 44 ? `${node.label.slice(0, 42)}…` : node.label;
    const width = Math.min(Math.max(label.length * 5.8 + 16, 72), 240);

    if (mode === "story") {
      return (
        <g>
          <rect
            x={-width / 2}
            y={-34}
            width={width}
            height={20}
            fill="hsl(var(--background))"
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
          />
          <text
            x={0}
            y={-20}
            textAnchor="middle"
            fill="hsl(var(--foreground))"
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
          >
            {label}
          </text>
        </g>
      );
    }

    return (
      <g>
        <rect
          x={8}
          y={-10}
          width={width}
          height={18}
          fill="hsl(var(--background))"
          stroke="hsl(var(--foreground))"
          strokeWidth={1}
        />
        <text
          x={14}
          y={3}
          fill="hsl(var(--foreground))"
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}
        >
          {label}
        </text>
      </g>
    );
  };

  const renderLink = (link: GraphLink, index: number) => {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);
    const from = positions.get(source);
    const to = positions.get(target);
    if (!from || !to) return null;

    const focused = isLinkFocused(link, focus);
    const opacity = activeId ? (focused ? 0.9 : 0.06) : 0.22;

    return (
      <g key={`${source}-${target}-${index}`} opacity={opacity}>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="hsl(var(--foreground))"
          strokeWidth={focused && activeId ? 1.5 : 0.75}
        />
        {focused && activeId && (
          <text
            x={(from.x + to.x) / 2}
            y={(from.y + to.y) / 2 - 6}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[9px] uppercase"
          >
            {link.relation.replace(/_/g, " ")}
          </text>
        )}
      </g>
    );
  };

  const renderNode = (node: GraphNode) => {
    const pos = positions.get(node.id);
    if (!pos) return null;

    const inFocus = !activeId || focus.has(node.id);
    const isActive = activeId === node.id;
    const radius = isActive ? 7 : 4;

    return (
      <g
        key={node.id}
        transform={`translate(${pos.x}, ${pos.y})`}
        className="cursor-pointer"
        onMouseEnter={() => {
          setHoverId(node.id);
          onFocus(node.id);
        }}
        onMouseLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
        onClick={() => onSelect(node.id)}
      >
        <circle r={radius + 10} fill="transparent" />
        <circle
          r={radius}
          fill={nodeFill(node.type, inFocus, isActive)}
          stroke={nodeStroke(inFocus, isActive)}
          strokeWidth={isActive ? 2 : 1}
          opacity={inFocus ? 1 : 0.2}
        />
        {isActive && renderNodeLabel(node)}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 bg-background overflow-auto"
      onMouseLeave={() => {
        setHoverId(null);
        onFocus(null);
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          minHeight: svgHeight,
          backgroundImage:
            "linear-gradient(hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.35) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {mode === "story" ? (
        <div className="sticky top-0 left-0 right-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm px-3 py-2 text-center">
          <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            story · chronological memory path
          </span>
        </div>
      ) : (
        <div className="sticky top-0 left-0 right-0 z-10 flex border-b border-border bg-background/95 backdrop-blur-sm min-w-full">
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="flex-1 px-3 py-2 border-r border-border last:border-r-0 text-center min-w-[120px]"
            >
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                {lane.label} ({laneCounts[lane.id] ?? 0})
              </span>
            </div>
          ))}
        </div>
      )}

      <svg
        width={svgWidth}
        height={svgHeight}
        className="relative block"
        style={{ minWidth: svgWidth }}
      >
        <g>{data.links.map(renderLink)}</g>
        <g>{data.nodes.map(renderNode)}</g>
      </svg>
    </div>
  );
}
