import React, { useState } from "react";
import { Download, Play, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PIPES = [
  {
    id: "daily-summary",
    name: "daily summary",
    description: "summarize your day every evening",
    installed: true,
  },
  {
    id: "meeting-recap",
    name: "meeting recap",
    description: "auto-generate meeting notes from transcripts",
    installed: true,
  },
  {
    id: "focus-tracker",
    name: "focus tracker",
    description: "track app usage and suggest focus blocks",
    installed: false,
  },
  {
    id: "action-items",
    name: "action items",
    description: "extract todos from conversations",
    installed: false,
  },
];

export function PipesSection() {
  const [installed, setInstalled] = useState(
    () => new Set(PIPES.filter((p) => p.installed).map((p) => p.id))
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">pipes</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          automation workflows for your captured context
        </p>
      </div>
      <div className="p-6 grid gap-4 md:grid-cols-2">
        {PIPES.map((pipe) => {
          const isInstalled = installed.has(pipe.id);
          return (
            <div
              key={pipe.id}
              className="border border-border p-6 flex flex-col gap-4 hover:border-foreground transition-colors duration-150"
            >
              <div className="flex items-start justify-between">
                <Workflow className="w-5 h-5" />
                {isInstalled && (
                  <span className="text-[10px] font-mono uppercase tracking-wide border border-border px-2 py-0.5">
                    installed
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-mono lowercase text-foreground">{pipe.name}</h3>
                <p className="text-sm text-muted-foreground font-mono mt-1">{pipe.description}</p>
              </div>
              <Button
                variant={isInstalled ? "outline" : "default"}
                size="sm"
                className="w-fit gap-2"
                onClick={() =>
                  setInstalled((prev) => {
                    const next = new Set(prev);
                    if (next.has(pipe.id)) next.delete(pipe.id);
                    else next.add(pipe.id);
                    return next;
                  })
                }
              >
                {isInstalled ? (
                  <>
                    <Play className="w-3 h-3" /> run
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" /> install
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
