import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, type MemoryNode } from "@/lib/api/client";
import {
  MemoryGraphCanvas,
  type MemoryGraphData,
} from "@/components/sections/memory-graph-canvas";
import {
  expandGraphForMemories,
  filterGraphHighlight,
  finalizeGraph,
  getNodeById,
  graphFromMemories,
  linkEndpointId,
  mergeGraphResponse,
} from "@/lib/memory-graph";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function nodeLabel(node: MemoryNode): string {
  return (node.title ?? node.content.slice(0, 60)).toLowerCase();
}

export function BrainSection() {
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState<{ nodes: number; edges: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<MemoryGraphData>({ nodes: [], links: [] });

  const loadGraph = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [list, memoryStats] = await Promise.all([
        api.memory({ q: search?.trim() || undefined, limit: 40 }),
        api.memoryStats(),
      ]);

      setStats({
        nodes: memoryStats.nodes,
        edges: memoryStats.edges || list.data.length,
      });

      const base = finalizeGraph(graphFromMemories(list.data));
      setGraph(base);
      setLoading(false);

      if (list.data.length === 0) return;

      setExpanding(true);
      const expanded = finalizeGraph(
        await expandGraphForMemories(base, list.data.slice(0, 24))
      );
      setGraph(expanded);
      setStats((prev) =>
        prev
          ? { ...prev, edges: expanded.links.length }
          : { nodes: expanded.nodes.length, edges: expanded.links.length }
      );
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

  const highlightIds = useMemo(
    () => filterGraphHighlight(graph, query),
    [graph, query]
  );

  const selected = getNodeById(graph, selectedId);

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

  const neighborCount = useMemo(() => {
    if (!selectedId) return 0;
    return graph.links.filter((l) => {
      const sourceId = linkEndpointId(l.source);
      const targetId = linkEndpointId(l.target);
      return sourceId === selectedId || targetId === selectedId;
    }).length;
  }, [graph.links, selectedId]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-mono lowercase">brain</h1>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">
            supermemory graph ·{" "}
            {stats
              ? `${graph.nodes.length} visible · ${graph.links.length} connections`
              : "loading..."}
            {expanding && " · expanding..."}
          </p>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="search & highlight nodes..."
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 min-w-0 relative">
          {loading && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-mono text-muted-foreground z-10 bg-background/80">
              <Loader2 className="w-4 h-4 animate-spin" />
              loading memory graph...
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
              <p className="text-sm font-mono text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center z-10">
              <Brain className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-mono text-muted-foreground max-w-md">
                no memories yet — start recording and supermemory will build your
                graph automatically.
              </p>
            </div>
          )}

          {graph.nodes.length > 0 && (
            <MemoryGraphCanvas
              data={graph}
              selectedId={selectedId}
              highlightIds={highlightIds}
              onSelect={handleSelect}
            />
          )}

          <div className="absolute top-4 left-4 border border-border bg-background/90 backdrop-blur-sm px-3 py-2 max-w-[240px]">
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
              controls
            </p>
            <p className="text-[11px] font-mono text-muted-foreground mt-1 leading-relaxed">
              scroll to zoom · drag canvas to pan · click node to inspect · drag node to reposition
            </p>
          </div>
        </div>

        {selected && (
          <aside className="w-80 shrink-0 border-l border-border flex flex-col min-h-0 bg-background">
            <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                  memory node
                </p>
                <p className="font-mono text-sm lowercase truncate mt-0.5">
                  {nodeLabel(selected)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setSelectedId(null)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-minimal p-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wide border border-border px-2 py-0.5">
                  {selected.type}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wide border border-border px-2 py-0.5 text-muted-foreground">
                  {formatDate(selected.created_at)}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wide border border-border px-2 py-0.5 text-muted-foreground">
                  {neighborCount} links
                </span>
              </div>

              {selected.app_name && (
                <p className="text-xs font-mono text-muted-foreground lowercase">
                  {selected.app_name}
                  {selected.window_name ? ` · ${selected.window_name}` : ""}
                </p>
              )}

              <p className="text-sm text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
                {selected.content.slice(0, 2000)}
                {selected.content.length > 2000 ? "..." : ""}
              </p>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-2">
                  connections
                </p>
                <div className="flex flex-col border border-border">
                  {graph.links
                    .filter((l) => {
                      const sourceId = linkEndpointId(l.source);
                      const targetId = linkEndpointId(l.target);
                      return sourceId === selectedId || targetId === selectedId;
                    })
                    .map((link) => {
                      const sourceId = linkEndpointId(link.source);
                      const targetId = linkEndpointId(link.target);
                      const otherId = sourceId === selectedId ? targetId : sourceId;
                      const other = graph.nodes.find((n) => n.id === otherId);
                      if (!other) return null;
                      return (
                        <button
                          key={`${link.source}-${link.target}-${link.relation}`}
                          onClick={() => handleSelect(otherId)}
                          className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0 hover:bg-accent transition-colors duration-150 text-left"
                        >
                          <span className="font-mono text-xs lowercase truncate min-w-0">
                            {other.label}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0 ml-2">
                            {link.relation.replace(/_/g, " ")}
                          </span>
                        </button>
                      );
                    })}
                  {neighborCount === 0 && (
                    <p className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      no linked nodes yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
