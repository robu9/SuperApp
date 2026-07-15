import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Brain,
  Clock,
  HelpCircle,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  MessageSquare,
  Search,
  Settings as SettingsIcon,
  Workflow,
} from "lucide-react";
import { AppSidebar, useSidebarContext } from "@/components/app-sidebar";
import { RecordingStatus } from "@/components/recording-status";
import { ChatPanel } from "@/components/chat-panel";
import { ChatSidebar } from "@/components/chat-sidebar";
import { TimelineSection } from "@/components/sections/timeline-section";
import { PipesSection } from "@/components/sections/pipes-section";
import { MeetingsSection } from "@/components/sections/meetings-section";
import { BrainSection } from "@/components/sections/brain-section";
import { ConnectionsSection } from "@/components/sections/connections-section";
import { HelpSection } from "@/components/sections/help-section";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatShortcut } from "@/lib/utils";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useRecordingStore } from "@/lib/stores/recording-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { electron } from "@/lib/electron";

type MainSection =
  | "home"
  | "timeline"
  | "pipes"
  | "meetings"
  | "brain"
  | "connections"
  | "help"
  | "history";

const NAV_ITEMS: { id: MainSection; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "chat", icon: MessageSquare },
  { id: "timeline", label: "timeline", icon: Clock },
  { id: "pipes", label: "pipes", icon: Workflow },
  { id: "meetings", label: "meetings", icon: NotebookPen },
  { id: "brain", label: "brain", icon: Brain },
  { id: "connections", label: "connections", icon: Plug },
  { id: "help", label: "help", icon: HelpCircle },
];

const SETTINGS_SECTIONS = new Set([
  "account", "recording", "ai", "general", "display", "shortcuts",
  "notifications", "privacy", "storage", "team", "referral", "usage", "speakers",
]);

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const section = (searchParams.get("section") || "home") as MainSection;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { isTranslucent } = useSidebarContext();
  const disableTimeline = useSettingsStore((s) => s.settings.disableTimeline);
  const tick = useRecordingStore((s) => s.tick);
  const syncFromBackend = useRecordingStore((s) => s.syncFromBackend);
  const { createSession } = useChatStore((s) => s.actions);

  useEffect(() => {
    void syncFromBackend();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [tick, syncFromBackend]);

  useEffect(() => {
    if (SETTINGS_SECTIONS.has(section)) {
      navigate(`/settings?section=${section}`);
    }
  }, [section, navigate]);

  useEffect(() => {
    if (disableTimeline && section === "timeline") {
      setSearchParams({ section: "home" });
    }
  }, [disableTimeline, section, setSearchParams]);

  useEffect(() => {
    const sessions = useChatStore.getState().sessions;
    if (Object.keys(sessions).length === 0) {
      createSession();
    }
  }, [createSession]);

  const setSection = (s: MainSection) => setSearchParams({ section: s });

  const openSearch = () => electron?.openWindow("search");

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen min-h-0 min-w-0 flex-1 relative">
        {/* Floating top-left chrome */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-1 px-3 pt-8 pb-2 pointer-events-none">
          <div className="flex items-center gap-1 pointer-events-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarOpen((o) => !o)}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center border transition-all duration-150",
                    isTranslucent
                      ? "border-foreground/20 bg-background/80 backdrop-blur-sm hover:bg-foreground hover:text-background"
                      : "border-border hover:bg-foreground hover:text-background"
                  )}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="w-4 h-4" />
                  ) : (
                    <PanelLeftOpen className="w-4 h-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>toggle sidebar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openSearch}
                  className={cn(
                    "h-8 px-3 flex items-center gap-2 border font-mono text-xs uppercase tracking-wide transition-all duration-150",
                    isTranslucent
                      ? "border-foreground/20 bg-background/80 backdrop-blur-sm hover:bg-foreground hover:text-background"
                      : "border-border hover:bg-foreground hover:text-background"
                  )}
                >
                  <Search className="w-3 h-3" />
                  search
                  <span className="text-[10px] opacity-60">{formatShortcut("Cmd+K")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>global search</TooltipContent>
            </Tooltip>
            <RecordingStatus isTranslucent={isTranslucent} />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 min-w-0 pt-14">
          {sidebarOpen && (
            <AppSidebar>
              <nav className="flex flex-col flex-1 min-h-0">
                {NAV_ITEMS.filter((item) => !(disableTimeline && item.id === "timeline")).map(
                  (item) => {
                    const Icon = item.icon;
                    const active = section === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSection(item.id)}
                        className={cn(
                          "h-12 px-5 flex items-center gap-4 border-b border-border font-mono text-xs uppercase tracking-wide transition-all duration-150",
                          active
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-foreground hover:text-background"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  }
                )}
                <div className="flex-1" />
                <button
                  onClick={() => navigate("/settings")}
                  className="h-12 px-5 flex items-center gap-4 border-t border-border font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-foreground hover:text-background transition-all duration-150"
                >
                  <SettingsIcon className="w-4 h-4" />
                  settings
                </button>
              </nav>
            </AppSidebar>
          )}

          <main className="flex flex-1 min-h-0 min-w-0">
            {section === "home" && (
              <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-w-0">
                  <ChatPanel />
                </div>
                <div className="w-64 border-l border-border hidden lg:flex flex-col min-h-0">
                  <ChatSidebar />
                </div>
              </div>
            )}
            {section === "timeline" && (
              <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
                <TimelineSection />
              </div>
            )}
            {section === "pipes" && <PipesSection />}
            {section === "meetings" && <MeetingsSection />}
            {section === "brain" && <BrainSection />}
            {section === "connections" && <ConnectionsSection />}
            {section === "help" && <HelpSection />}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
