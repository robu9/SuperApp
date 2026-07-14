import React, { useState } from "react";
import { Check, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONNECTIONS = [
  { id: "google-calendar", name: "google calendar", connected: false },
  { id: "slack", name: "slack", connected: true },
  { id: "notion", name: "notion", connected: false },
  { id: "browser-extension", name: "browser extension", connected: true },
  { id: "custom-mcp", name: "custom mcp", connected: false },
];

export function ConnectionsSection() {
  const [connected, setConnected] = useState(
    () => new Set(CONNECTIONS.filter((c) => c.connected).map((c) => c.id))
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">connections</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          third-party integrations
        </p>
      </div>
      <div className="p-6 grid gap-3 max-w-xl">
        {CONNECTIONS.map((conn) => {
          const isConnected = connected.has(conn.id);
          return (
            <div
              key={conn.id}
              className="border border-border p-4 flex items-center justify-between hover:border-foreground transition-colors duration-150"
            >
              <div className="flex items-center gap-3">
                <Plug className="w-4 h-4" />
                <span className="font-mono text-sm lowercase">{conn.name}</span>
              </div>
              <Button
                variant={isConnected ? "outline" : "default"}
                size="sm"
                className="gap-2"
                onClick={() =>
                  setConnected((prev) => {
                    const next = new Set(prev);
                    if (next.has(conn.id)) next.delete(conn.id);
                    else next.add(conn.id);
                    return next;
                  })
                }
              >
                {isConnected ? (
                  <>
                    <Check className="w-3 h-3" /> connected
                  </>
                ) : (
                  "connect"
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
