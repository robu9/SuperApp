import React, { useState } from "react";
import { Calendar, Mic, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAST_MEETINGS = [
  { id: "1", title: "project aurora sync", date: "today, 10:00", attendees: 4 },
  { id: "2", title: "design review", date: "yesterday", attendees: 3 },
  { id: "3", title: "sprint planning", date: "may 22", attendees: 6 },
];

export function MeetingsSection() {
  const [activeMeeting, setActiveMeeting] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-8 py-6 border-b border-border flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-mono lowercase">meetings</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            notes, transcripts, and calendar
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="w-3 h-3" />
          connect calendar
        </Button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-72 border-r border-border overflow-y-auto scrollbar-hide">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              past meetings
            </span>
          </div>
          {PAST_MEETINGS.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMeeting(m.id)}
              className={cn(
                "w-full px-4 py-3 border-b border-border text-left transition-all duration-150",
                activeMeeting === m.id
                  ? "bg-foreground text-background"
                  : "hover:bg-accent"
              )}
            >
              <div className="font-mono text-sm lowercase">{m.title}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-2">
                <Users className="w-3 h-3" />
                {m.attendees} · {m.date}
              </div>
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {activeMeeting ? (
            <>
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Mic className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  transcript
                </span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-minimal p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-sm space-y-4">
                  <p>
                    <strong>speaker 1:</strong> let's review the project aurora timeline and open
                    action items from last week.
                  </p>
                  <p>
                    <strong>speaker 2:</strong> the design system audit is complete. we need to
                    port the remaining components to the SuperApp build.
                  </p>
                  <p>
                    <strong>speaker 1:</strong> agreed. let's target pixel-perfect fidelity on the
                    main dashboard first.
                  </p>
                </div>
              </div>
              <div className="border-t border-border p-4">
                <textarea
                  className="w-full h-24 border border-border bg-input p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="add meeting notes..."
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm lowercase">
              select a meeting to view notes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
