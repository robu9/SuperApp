import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import {
  MemoryGraphCanvas,
  type MemoryGraphData,
} from "@/components/sections/memory-graph-canvas";
import { MemoryGraphLaneCanvas } from "@/components/sections/memory-graph-lane-canvas";
import { MemoryNodeDetail } from "@/components/sections/memory-node-detail";
import {
  expandGraphForMemories,
  finalizeGraph,
  getNodeById,
  graphFromMemories,
  mergeGraphResponse,
} from "@/lib/memory-graph";
import {
  buildFlowLanes,
  buildTypeLanes,
  countNodeKinds,
  type GraphViewMode,
} from "@/lib/memory-graph-layout";
import { cn } from "@/lib/utils";

const VIEW_MODES: { id: GraphViewMode; label: string }[] = [
  { id: "flow", label: "Flow" },
  { id: "force", label: "Force" },
  { id: "type", label: "Type" },
  { id: "story", label: "Story" },
];

const NODE_LEGEND = [
  { type: "screen_chunk", label: "screen" },
  { type: "audio_chunk", label: "audio" },
  { type: "memory", label: "memory" },
  { type: "topic", label: "topic" },
  { type: "meeting", label: "meeting" },
];

export function BrainSection() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<GraphViewMode>("flow");
  const [loading, setLoading] = useState(true);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [graph, setGraph] = useState<MemoryGraphData>({ nodes: [], links: [] });

  const loadGraph = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.memory({ q: search?.trim() || undefined, limit: 40 });
      const base = graphFromMemories(list.data);
      setGraph(base);
      setLoading(false);

      if (list.data.length === 0) return;

      setExpanding(true);
      const expanded = finalizeGraph(
        await expandGraphForMemories(base, list.data.slice(0, 12))
      );
      setGraph(expanded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load supermemory");
    } finally {
      setLoading(false);
      setExpanding(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadGraph(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadGraph]);

  const typeLanes = useMemo(() => buildTypeLanes(graph), [graph]);
  const flowLanes = useMemo(() => buildFlowLanes(graph), [graph]);
  const detailId = selectedId ?? hoverId;
  const detailNode = getNodeById(graph, detailId);

  const expandSelected = useCallback(async (id: string) => {
    setExpanding(true);
    try {
      const response = await api.memoryGraph(id, 2);
      setGraph((prev) => finalizeGraph(mergeGraphResponse(prev, response)));
    } catch {
      // keep current graph
    } finally {
      setExpanding(false);
    }
  }, []);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) void expandSelected(id);
    },
    [expandSelected]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="page-header flex items-center gap-4 shrink-0">
        <div className="min-w-0 shrink-0">
          <h1 className="page-header-title">Brain</h1>
          <p className="page-header-desc">
            {graph.nodes.length} nodes · {graph.links.length} edges · {countNodeKinds(graph)} kinds
            {expanding && " · Expanding…"}
          </p>
        </div>

        <div className="relative flex-1 max-w-md ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes…"
            className="pl-10 h-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 min-w-0 relative">
          {loading && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground z-20 bg-background/80">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading memory graph…
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 z-20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center z-20">
              <Brain className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-md">
                No memories yet. Start recording and SuperMemory will build your graph automatically.
              </p>
            </div>
          )}

          {graph.nodes.length > 0 && mode === "force" && (
            <MemoryGraphCanvas
              data={graph}
              selectedId={selectedId}
              hoverId={hoverId}
              onHover={setHoverId}
              onSelect={handleSelect}
            />
          )}

          {graph.nodes.length > 0 && mode === "flow" && (
            <MemoryGraphLaneCanvas
              data={graph}
              lanes={flowLanes}
              mode="flow"
              focusId={hoverId ?? selectedId}
              onFocus={setHoverId}
              onSelect={(id) => handleSelect(id)}
            />
          )}

          {graph.nodes.length > 0 && mode === "type" && (
            <MemoryGraphLaneCanvas
              data={graph}
              lanes={typeLanes}
              mode="type"
              focusId={hoverId ?? selectedId}
              onFocus={setHoverId}
              onSelect={(id) => handleSelect(id)}
            />
          )}

          {graph.nodes.length > 0 && mode === "story" && (
            <MemoryGraphLaneCanvas
              data={graph}
              lanes={[]}
              mode="story"
              focusId={hoverId ?? selectedId}
              onFocus={setHoverId}
              onSelect={(id) => handleSelect(id)}
            />
          )}

          <div className="absolute bottom-4 left-4 rounded-lg border border-border bg-background/95 backdrop-blur-sm px-3 py-2 max-w-[200px] z-10">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Node type
            </p>
            <div className="flex flex-col gap-1.5">
              {NODE_LEGEND.map((item) => (
                <div key={item.type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm border border-foreground/40 bg-background shrink-0" />
                  <span className="text-xs text-muted-foreground capitalize">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex rounded-lg border border-border bg-background/95 backdrop-blur-sm overflow-hidden">
            {VIEW_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "px-4 py-2 text-xs font-medium border-r border-border last:border-r-0 transition-colors duration-150",
                  mode === item.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {detailNode && (
          <aside
            className={cn(
              "shrink-0 z-20 transition-all duration-150",
              selectedId ? "w-96 border-l border-border" : "absolute right-4 top-4 w-80 pointer-events-auto"
            )}
          >
            <MemoryNodeDetail
              node={detailNode}
              graph={graph}
              pinned={!!selectedId}
              onClose={() => setSelectedId(null)}
              onNavigate={(id) => handleSelect(id)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
