import React, { useCallback, useEffect, useState } from "react";
import { Brain, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api, type MemoryGraphResponse, type MemoryNode } from "@/lib/api/client";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function nodeIcon(type: string) {
  if (type === "memory" || type === "meeting" || type === "topic") {
    return <Brain className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function nodeLabel(node: MemoryNode): string {
  return (node.title ?? node.content.slice(0, 60)).toLowerCase();
}

export function BrainSection() {
  const [query, setQuery] = useState("");
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [stats, setStats] = useState<{ nodes: number; edges: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [graph, setGraph] = useState<MemoryGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const loadMemories = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [list, memoryStats] = await Promise.all([
        api.memory({ q: search?.trim() || undefined, limit: 40 }),
        api.memoryStats(),
      ]);
      setMemories(list.data);
      setStats({ nodes: memoryStats.nodes, edges: memoryStats.edges });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load supermemory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMemories(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, loadMemories]);

  useEffect(() => {
    if (!selectedId) {
      setGraph(null);
      return;
    }

    setGraphLoading(true);
    void api
      .memoryGraph(selectedId, 2)
      .then(setGraph)
      .catch(() => setGraph(null))
      .finally(() => setGraphLoading(false));
  }, [selectedId]);

  const selected = memories.find((item) => item.id === selectedId) ?? graph?.node ?? null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">brain</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          supermemory graph — {stats ? `${stats.nodes} nodes · ${stats.edges} edges` : "loading..."}
        </p>
      </div>

      <div className="p-6 max-w-3xl flex flex-col gap-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="search supermemory..."
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            loading graph...
          </div>
        )}

        {error && (
          <p className="text-sm font-mono text-destructive">{error}</p>
        )}

        {!loading && !error && memories.length === 0 && (
          <p className="text-sm font-mono text-muted-foreground">
            no memories yet — start recording and supermemory will build your graph automatically.
          </p>
        )}

        <div className="flex flex-col border border-border">
          {memories.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
              className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent transition-colors duration-150 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {nodeIcon(item.type)}
                <span className="font-mono text-sm lowercase truncate">{nodeLabel(item)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                  {item.type} · {formatDate(item.created_at)}
                </span>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    selectedId === item.id ? "rotate-90" : ""
                  }`}
                />
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="border border-border p-4 flex flex-col gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                selected memory
              </p>
              <p className="font-mono text-sm lowercase">{nodeLabel(selected)}</p>
              <p className="text-sm text-muted-foreground font-mono mt-3 whitespace-pre-wrap">
                {selected.content.slice(0, 1200)}
                {selected.content.length > 1200 ? "..." : ""}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-2">
                graph neighbors
              </p>
              {graphLoading && (
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  traversing...
                </div>
              )}
              {!graphLoading && graph && graph.edges.length === 0 && (
                <p className="text-sm font-mono text-muted-foreground">no linked nodes yet.</p>
              )}
              {!graphLoading && graph && graph.edges.length > 0 && (
                <div className="flex flex-col border border-border">
                  {graph.edges.map((edge) => (
                    <button
                      key={edge.id}
                      onClick={() => setSelectedId(edge.neighbor.id)}
                      className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0 hover:bg-accent text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {nodeIcon(edge.neighbor.type)}
                        <span className="font-mono text-xs lowercase truncate">
                          {nodeLabel(edge.neighbor)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0">
                        {edge.relation}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
