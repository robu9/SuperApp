import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/stores/chat-store";
import { formatDistanceToNow } from "date-fns";

export function ChatSidebar() {
  const sessions = useChatStore((s) => s.sessions);
  const currentId = useChatStore((s) => s.currentId);
  const { setCurrent, createSession } = useChatStore((s) => s.actions);

  const sorted = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          threads
        </span>
        <button
          onClick={() => createSession()}
          className="text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          new
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {sorted.map((session) => (
          <button
            key={session.id}
            onClick={() => setCurrent(session.id)}
            className={cn(
              "w-full px-4 py-3 border-b border-border text-left flex justify-between items-center transition-all duration-150 font-mono text-sm lowercase",
              currentId === session.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-foreground hover:text-background"
            )}
          >
            <span className="truncate pr-2">{session.title}</span>
            <span className="text-[10px] tabular-nums shrink-0 uppercase tracking-wide opacity-70">
              {formatDistanceToNow(session.updatedAt, { addSuffix: true })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
