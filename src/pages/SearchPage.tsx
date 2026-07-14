import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { electron } from "@/lib/electron";

const MOCK_RESULTS = [
  { id: "1", type: "screen", text: "project aurora timeline discussion", time: "10:42" },
  { id: "2", type: "audio", text: "meeting notes about design system audit", time: "09:15" },
  { id: "3", type: "ocr", text: "electron app architecture document", time: "yesterday" },
  { id: "4", type: "chat", text: "summarize project updates from last meeting", time: "yesterday" },
];

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<typeof MOCK_RESULTS>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setResults(
        MOCK_RESULTS.filter((r) =>
          r.text.toLowerCase().includes(query.toLowerCase())
        )
      );
    }, 200);
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
          {results.length === 0 && query && (
            <div className="p-6 text-sm text-muted-foreground font-mono lowercase">
              no results for "{query}"
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              className="w-full px-4 py-3 border-b border-border text-left hover:bg-accent transition-colors duration-150 flex justify-between items-center"
            >
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mr-2">
                  {r.type}
                </span>
                <span className="font-mono text-sm lowercase">{r.text}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                {r.time}
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
