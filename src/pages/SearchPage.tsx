import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { electron } from "@/lib/electron";
import { api, type SearchResultItem } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";

function formatResultTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return timestamp;
  }
}

function resultType(item: SearchResultItem): string {
  return item.type.toLowerCase();
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search({
          q: query,
          limit: 30,
          content_type: "all",
        });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") electron?.closeWindow();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen bg-transparent flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl border border-border bg-background shadow-lg">
        <div className="flex items-center border-b border-border">
          <Search className="w-4 h-4 ml-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search your timeline..."
            className="border-0 focus-visible:ring-0 h-12"
          />
          <button
            onClick={() => electron?.closeWindow()}
            className="h-12 w-12 flex items-center justify-center border-l border-border hover:bg-foreground hover:text-background transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-minimal">
          {loading && (
            <div className="p-6 text-sm text-muted-foreground font-mono lowercase">
              searching...
            </div>
          )}
          {!loading && results.length === 0 && query && (
            <div className="p-6 text-sm text-muted-foreground font-mono lowercase">
              no results for "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.content.frame_id ?? r.content.audio_chunk_id ?? i}`}
              className="w-full px-4 py-3 border-b border-border text-left hover:bg-accent transition-colors duration-150 flex justify-between items-center gap-4"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mr-2">
                  {resultType(r)}
                </span>
                <span className="font-mono text-sm lowercase truncate block">
                  {r.content.text.slice(0, 120)}
                  {r.content.text.length > 120 ? "…" : ""}
                </span>
                {r.content.app_name && (
                  <span className="text-[10px] text-muted-foreground font-mono block mt-1">
                    {r.content.app_name}
                    {r.content.window_name ? ` · ${r.content.window_name}` : ""}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0">
                {formatResultTime(r.content.timestamp)}
              </span>
            </button>
          ))}
          {!query && (
            <div className="p-6 text-sm text-muted-foreground font-mono lowercase">
              type to search screen history, audio, and chats
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
