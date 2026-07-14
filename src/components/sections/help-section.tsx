import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HelpSection() {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">help</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          feedback and support
        </p>
      </div>
      <div className="p-6 max-w-lg flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            subject
          </label>
          <Input className="mt-2" placeholder="what's on your mind?" />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            message
          </label>
          <textarea
            className="mt-2 w-full h-32 border border-border bg-input p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="describe your issue or feedback..."
          />
        </div>
        <Button className="w-fit">send feedback</Button>
      </div>
    </div>
  );
}
