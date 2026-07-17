import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  simulateAssistantReply,
  type ChatMessage,
} from "@/lib/stores/chat-store";

function MessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("flex flex-col gap-1.5", isUser && "items-end")}>
      <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
        <span className="text-xs font-medium text-foreground capitalize">{message.role}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
      </div>
      <div
        className={cn(
          "rounded-lg px-4 py-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-surface border border-border text-foreground"
        )}
      >
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
      <div className="page-header">
        <h1 className="page-header-title">Chat</h1>
        <p className="page-header-desc">Ask questions about your captured context</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-minimal px-6 py-6">
        <div className="flex flex-col gap-6 max-w-3xl mx-auto">
          {session?.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground max-w-sm">
                Start a conversation. Your assistant can search screen history, audio, and connected apps.
              </p>
            </div>
          )}
          {session?.messages.map((msg) => (
            <MessageBlock key={msg.id} message={msg} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
              </span>
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="p-4 shrink-0 border-t border-border bg-background">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask anything…"
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isStreaming} className="gap-2 shrink-0">
            Send
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
