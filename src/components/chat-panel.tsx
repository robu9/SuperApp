import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { electron } from "@/lib/electron";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  simulateAssistantReply,
  type ChatMessage,
} from "@/lib/stores/chat-store";

function getSafeExternalUrl(href?: string): string | null {
  if (!href) return null;

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => getSafeExternalUrl(url) ?? ""}
      components={{
        a: ({ href, children, ...props }) => {
          const safeUrl = getSafeExternalUrl(href);
          if (!safeUrl) return <span>{children}</span>;

          return (
            <a
              {...props}
              href={safeUrl}
              onClick={(event) => {
                event.preventDefault();
                if (electron?.openExternal) {
                  void electron.openExternal(safeUrl);
                } else {
                  window.open(safeUrl, "_blank", "noopener,noreferrer");
                }
              }}
            >
              {children}
            </a>
          );
        },
        table: ({ children, ...props }) => (
          <div className="max-w-full overflow-x-auto">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

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
          "min-w-0 max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "whitespace-pre-wrap bg-primary text-primary-foreground"
            : [
                "prose prose-sm max-w-none break-words border border-border bg-surface text-foreground",
                "prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-foreground",
                "prose-p:my-2 prose-p:text-foreground prose-ul:my-2 prose-ol:my-2",
                "prose-li:my-0.5 prose-li:text-foreground prose-strong:text-foreground",
                "prose-blockquote:border-border prose-blockquote:text-muted-foreground",
                "prose-a:text-primary prose-a:cursor-pointer prose-a:no-underline hover:prose-a:underline",
                "prose-code:break-words prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
                "prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:whitespace-pre prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-surface-secondary",
                "prose-table:my-2 prose-th:text-foreground prose-td:text-foreground",
                "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              ]
        )}
      >
        {isUser ? message.content : <MarkdownMessage content={message.content} />}
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
