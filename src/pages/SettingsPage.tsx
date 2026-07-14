import React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Brain,
  ChevronLeft,
  Gift,
  HardDrive,
  Keyboard,
  Layout,
  Mic,
  Settings as SettingsIcon,
  Shield,
  User,
  Users,
  Video,
} from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useSettingsStore } from "@/lib/stores/settings-store";

type SettingsSection =
  | "display"
  | "general"
  | "ai"
  | "recording"
  | "shortcuts"
  | "notifications"
  | "usage"
  | "privacy"
  | "storage"
  | "speakers"
  | "team"
  | "account"
  | "referral";

const NAV_GROUPS: {
  label: string;
  items: { id: SettingsSection; label: string; icon: React.ElementType }[];
}[] = [
  {
    label: "capture & ai",
    items: [
      { id: "display", label: "display", icon: Layout },
      { id: "general", label: "general", icon: SettingsIcon },
      { id: "ai", label: "ai", icon: Brain },
      { id: "recording", label: "recording", icon: Video },
      { id: "shortcuts", label: "shortcuts", icon: Keyboard },
      { id: "notifications", label: "notifications", icon: Bell },
    ],
  },
  {
    label: "privacy & security",
    items: [
      { id: "usage", label: "usage", icon: BarChart3 },
      { id: "privacy", label: "privacy", icon: Shield },
    ],
  },
  {
    label: "data",
    items: [{ id: "storage", label: "storage", icon: HardDrive }],
  },
  {
    label: "audio",
    items: [{ id: "speakers", label: "speakers", icon: Mic }],
  },
  {
    label: "account",
    items: [
      { id: "team", label: "team", icon: Users },
      { id: "account", label: "account", icon: User },
      { id: "referral", label: "referral", icon: Gift },
    ],
  },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
      <div>
        <div className="font-mono text-sm lowercase">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground font-mono mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-10 h-5 border border-border relative transition-all duration-150",
        checked ? "bg-foreground" : "bg-background"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-3.5 h-3.5 transition-all duration-150",
          checked ? "right-0.5 bg-background" : "left-0.5 bg-foreground"
        )}
      />
    </button>
  );
}

function SectionContent({ section }: { section: SettingsSection }) {
  const { theme, setTheme } = useTheme();
  const { settings, setSetting } = useSettingsStore();

  const titles: Record<SettingsSection, string> = {
    display: "display",
    general: "general",
    ai: "ai presets",
    recording: "recording",
    shortcuts: "shortcuts",
    notifications: "notifications",
    usage: "usage",
    privacy: "privacy",
    storage: "storage",
    speakers: "speakers",
    team: "team",
    account: "account",
    referral: "referral",
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-mono lowercase mb-6">{titles[section]}</h2>
      <div className="border border-border p-6">
        {section === "display" && (
          <>
            <SettingRow label="theme" description="light, dark, or system">
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={theme === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="translucent sidebar" description="macOS vibrancy effect">
              <Toggle
                checked={settings.translucentSidebar}
                onChange={(v) => setSetting("translucentSidebar", v)}
              />
            </SettingRow>
            <SettingRow label="disable timeline" description="hide timeline section">
              <Toggle
                checked={settings.disableTimeline}
                onChange={(v) => setSetting("disableTimeline", v)}
              />
            </SettingRow>
            <SettingRow label="font size" description={`${settings.fontSize}px base`}>
              <input
                type="range"
                min={14}
                max={20}
                value={settings.fontSize}
                onChange={(e) => setSetting("fontSize", Number(e.target.value))}
                className="w-32"
              />
            </SettingRow>
          </>
        )}
        {section === "general" && (
          <>
            <SettingRow label="launch at startup" description="open SuperApp on login">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="check for updates" description="automatically">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "recording" && (
          <>
            <SettingRow label="screen capture" description="record your screen">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="audio capture" description="record microphone and system audio">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="ocr" description="extract text from screen frames">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "ai" && (
          <>
            <SettingRow label="default model" description="local llm">
              <span className="text-sm font-mono text-muted-foreground">llama 3.2</span>
            </SettingRow>
            <SettingRow label="cloud fallback" description="use cloud when local unavailable">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "shortcuts" && (
          <div className="space-y-2 font-mono text-sm">
            {[
              ["global search", "⌘K"],
              ["new chat", "⌘N"],
              ["toggle recording", "⌘⇧R"],
            ].map(([label, keys]) => (
              <div key={label} className="flex justify-between py-2 border-b border-border">
                <span className="lowercase">{label}</span>
                <span className="text-muted-foreground uppercase tracking-wide text-xs">{keys}</span>
              </div>
            ))}
          </div>
        )}
        {!["display", "general", "recording", "ai", "shortcuts"].includes(section) && (
          <p className="text-sm text-muted-foreground font-mono lowercase">
            {titles[section]} settings — configure in full build
          </p>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const section = (searchParams.get("section") || "display") as SettingsSection;

  return (
    <div className="flex h-screen min-h-0 flex-1">
      <AppSidebar>
        <div className="flex flex-col h-full">
          <button
            onClick={() => navigate("/home")}
            className="h-12 px-5 flex items-center gap-2 border-b border-border font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-foreground hover:text-background transition-all duration-150"
          >
            <ChevronLeft className="w-4 h-4" />
            back
          </button>
          <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="px-5 py-2 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSearchParams({ section: item.id })}
                      className={cn(
                        "w-full h-10 px-5 flex items-center gap-3 font-mono text-xs lowercase transition-all duration-150",
                        section === item.id
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </AppSidebar>
      <div className="flex-1 overflow-y-auto scrollbar-minimal p-8 pt-12">
        <SectionContent section={section} />
      </div>
    </div>
  );
}
