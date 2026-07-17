import React, { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { MemoryNode } from "@/lib/api/client";
import type { GraphLink, MemoryGraphData } from "@/components/sections/memory-graph-canvas";
import { linkEndpointId } from "@/lib/memory-graph";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nodeLabel(node: MemoryNode): string {
  return (node.title ?? node.content.slice(0, 80)).toLowerCase();
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors duration-150"
      >
        <span className="text-[10px] font-mono uppercase tracking-wide">{title}</span>
        <ChevronDown
          className={cn("w-3.5 h-3.5 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs font-mono">
      <span className="text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-right lowercase break-words">{value}</span>
    </div>
  );
}

interface MemoryNodeDetailProps {
  node: MemoryNode;
  graph: MemoryGraphData;
  pinned?: boolean;
  onClose?: () => void;
  onNavigate?: (id: string) => void;
}

export function MemoryNodeDetail({
  node,
  graph,
  pinned = false,
  onClose,
  onNavigate,
}: MemoryNodeDetailProps) {
  const connections = graph.links.filter((link) => {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);
    return source === node.id || target === node.id;
  });

  return (
    <div
      className={cn(
        "flex flex-col border border-border bg-background/95 backdrop-blur-sm shadow-sm",
        pinned ? "h-full" : "max-h-[min(70vh,520px)]"
      )}
    >
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <span className="inline-block text-[10px] font-mono uppercase tracking-wide border border-foreground px-2 py-0.5 mb-2">
            {node.type.replace(/_/g, " ")}
          </span>
          <p className="font-mono text-sm lowercase leading-snug">{nodeLabel(node)}</p>
        </div>
        {pinned && onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="overflow-y-auto scrollbar-minimal p-4 flex flex-col gap-3">
        <p className="text-sm font-mono text-muted-foreground leading-relaxed">
          {node.content.slice(0, 1200)}
          {node.content.length > 1200 ? "..." : ""}
        </p>

        <Section title="source">
          <p className="text-xs font-mono text-muted-foreground lowercase leading-relaxed">
            {node.title ?? "extracted memory from supermemory local"}
          </p>
        </Section>

        <Section title="provenance">
          <Row label="created" value={formatDate(node.created_at)} />
          <Row label="updated" value={formatDate(node.updated_at)} />
          {node.app_name && <Row label="app" value={node.app_name} />}
          {node.window_name && <Row label="window" value={node.window_name} />}
          {node.source_type && <Row label="source" value={node.source_type} />}
          <Row label="salience" value={node.salience.toFixed(2)} />
        </Section>

        <Section title="relations" defaultOpen={connections.length > 0}>
          {connections.length === 0 ? (
            <p className="text-xs font-mono text-muted-foreground">no connections yet.</p>
          ) : (
            <div className="flex flex-col border border-border">
              {connections.map((link) => {
                const source = linkEndpointId(link.source);
                const target = linkEndpointId(link.target);
                const otherId = source === node.id ? target : source;
                const other = graph.nodes.find((n) => n.id === otherId);
                if (!other) return null;
                return (
                  <button
                    key={`${source}-${target}-${link.relation}`}
                    type="button"
                    onClick={() => onNavigate?.(otherId)}
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
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
