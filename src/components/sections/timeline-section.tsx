import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MOCK_FRAMES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  time: `${String(10 + Math.floor(i / 6)).padStart(2, "0")}:${String((i * 5) % 60).padStart(2, "0")}`,
  label: `frame ${i + 1}`,
}));

export function TimelineSection() {
  const [current, setCurrent] = useState(0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">timeline</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          browse your screen history
        </p>
      </div>
      <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
        <div className="flex-1 border border-border bg-surface flex items-center justify-center relative min-h-[300px]">
          <div className="text-center">
            <div className="text-6xl font-mono text-muted-foreground/30 mb-4">▦</div>
            <p className="text-sm font-mono text-muted-foreground lowercase">
              {MOCK_FRAMES[current].label} — {MOCK_FRAMES[current].time}
            </p>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 h-1 bg-border relative">
              <div
                className="absolute top-0 left-0 h-full bg-foreground transition-all duration-150"
                style={{ width: `${((current + 1) / MOCK_FRAMES.length) * 100}%` }}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrent((c) => Math.min(MOCK_FRAMES.length - 1, c + 1))}
              disabled={current === MOCK_FRAMES.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Play className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2">
          {MOCK_FRAMES.map((frame, i) => (
            <button
              key={frame.id}
              onClick={() => setCurrent(i)}
              className={cn(
                "flex-shrink-0 w-20 h-14 border font-mono text-[10px] lowercase transition-all duration-150",
                i === current
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground"
              )}
            >
              {frame.time}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
