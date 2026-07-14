import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  simulateAssistantReply,
  type ChatMessage,
} from "@/lib/stores/chat-store";

function MessageBlock({ message }: { message: ChatMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          {message.role}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{time}</span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

export function ChatPanel({ className }: { className?: string }) {
  const currentId = useChatStore((s) => s.currentId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const { addMessage } = useChatStore((s) => s.actions);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const session = currentId ? sessions[currentId] : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, isStreaming]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !currentId || isStreaming) return;
    setInput("");
    addMessage(currentId, { role: "user", content: text });
    await simulateAssistantReply(currentId, text);
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      <div className="flex-1 overflow-y-auto scrollbar-minimal px-8 py-10">
        <div className="mb-12">
          <h1 className="text-2xl font-mono lowercase text-foreground tracking-wide">ai chat</h1>
          <span className="text-sm text-muted-foreground font-mono">&gt;_ assistant online</span>
        </div>
        <div className="flex flex-col gap-10 max-w-3xl">
          {session?.messages.map((msg, i) => (
            <React.Fragment key={msg.id}>
              {i > 0 && <div className="h-px bg-border w-full" />}
              <MessageBlock message={msg} />
            </React.Fragment>
          ))}
          {isStreaming && (
            <>
              <div className="h-px bg-border w-full" />
              <div className="text-sm text-muted-foreground font-mono">
                &gt; thinking<span className="animate-blink">_</span>
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="p-6 shrink-0 border-t border-border">
        <div className="border border-border h-[52px] w-full flex bg-background group">
          <div className="flex-1 flex items-center px-4">
            <span className="text-foreground mr-3 font-mono">&gt;_</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="type your command or question..."
              className="bg-transparent border-none outline-none w-full text-sm font-mono text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            variant="outline"
            className="h-full border-l border-t-0 border-b-0 border-r-0 px-6 gap-2"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            send
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
