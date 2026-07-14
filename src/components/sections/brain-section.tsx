import React from "react";
import { Brain, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const MEMORIES = [
  { id: "1", title: "project aurora goals", type: "memory", date: "may 24" },
  { id: "2", title: "api integration notes", type: "artifact", date: "may 23" },
  { id: "3", title: "user research findings", type: "memory", date: "may 21" },
  { id: "4", title: "architecture decisions", type: "artifact", date: "may 20" },
];

export function BrainSection() {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">brain</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          memories and artifacts from your activity
        </p>
      </div>
      <div className="p-6 max-w-2xl">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="search memories..." className="pl-10" />
        </div>
        <div className="flex flex-col border border-border">
          {MEMORIES.map((item) => (
            <button
              key={item.id}
              className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent transition-colors duration-150 text-left"
            >
              <div className="flex items-center gap-3">
                {item.type === "memory" ? (
                  <Brain className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="font-mono text-sm lowercase">{item.title}</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                {item.type} · {item.date}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
