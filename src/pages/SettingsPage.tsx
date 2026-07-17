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
    label: "Capture & AI",
    items: [
      { id: "display", label: "Display", icon: Layout },
      { id: "general", label: "General", icon: SettingsIcon },
      { id: "ai", label: "AI", icon: Brain },
      { id: "recording", label: "Recording", icon: Video },
      { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Privacy & security",
    items: [
      { id: "usage", label: "Usage", icon: BarChart3 },
      { id: "privacy", label: "Privacy", icon: Shield },
    ],
  },
  {
    label: "Data",
    items: [{ id: "storage", label: "Storage", icon: HardDrive }],
  },
  {
    label: "Audio",
    items: [{ id: "speakers", label: "Speakers", icon: Mic }],
  },
  {
    label: "Account",
    items: [
      { id: "team", label: "Team", icon: Users },
      { id: "account", label: "Account", icon: User },
      { id: "referral", label: "Referral", icon: Gift },
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
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
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
        "w-10 h-5 rounded-full relative transition-colors duration-150",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-background shadow-sm transition-all duration-150",
          checked ? "right-0.5" : "left-0.5"
        )}
      />
    </button>
  );
}

function SectionContent({ section }: { section: SettingsSection }) {
  const { theme, setTheme } = useTheme();
  const { settings, setSetting } = useSettingsStore();

  const titles: Record<SettingsSection, string> = {
    display: "Display",
    general: "General",
    ai: "AI presets",
    recording: "Recording",
    shortcuts: "Shortcuts",
    notifications: "Notifications",
    usage: "Usage",
    privacy: "Privacy",
    storage: "Storage",
    speakers: "Speakers",
    team: "Team",
    account: "Account",
    referral: "Referral",
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-6">{titles[section]}</h2>
      <div className="rounded-lg border border-border p-6 bg-card">
        {section === "display" && (
          <>
            <SettingRow label="Theme" description="Light, dark, or system">
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={theme === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(t)}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Translucent sidebar" description="macOS vibrancy effect">
              <Toggle
                checked={settings.translucentSidebar}
                onChange={(v) => setSetting("translucentSidebar", v)}
              />
            </SettingRow>
            <SettingRow label="Disable timeline" description="Hide timeline section">
              <Toggle
                checked={settings.disableTimeline}
                onChange={(v) => setSetting("disableTimeline", v)}
              />
            </SettingRow>
            <SettingRow label="Font size" description={`${settings.fontSize}px base`}>
              <input
                type="range"
                min={14}
                max={20}
                value={settings.fontSize}
                onChange={(e) => setSetting("fontSize", Number(e.target.value))}
                className="w-32 accent-foreground"
              />
            </SettingRow>
          </>
        )}
        {section === "general" && (
          <>
            <SettingRow label="Launch at startup" description="Open SuperApp on login">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="Check for updates" description="Automatically">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "recording" && (
          <>
            <SettingRow label="Screen capture" description="Record your screen">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="Audio capture" description="Record microphone and system audio">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="OCR" description="Extract text from screen frames">
              <Toggle checked={true} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "ai" && (
          <>
            <SettingRow label="Default model" description="Google Gemini">
              <span className="text-sm text-muted-foreground">gemini-2.5-flash</span>
            </SettingRow>
            <SettingRow label="Cloud fallback" description="Use cloud when local unavailable">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
          </>
        )}
        {section === "shortcuts" && (
          <div className="space-y-1">
            {[
              ["Global search", "⌘K"],
              ["New chat", "⌘N"],
              ["Toggle recording", "⌘⇧R"],
            ].map(([label, keys]) => (
              <div key={label} className="flex justify-between py-2.5 border-b border-border last:border-b-0">
                <span className="text-sm">{label}</span>
                <kbd className="inline-flex h-6 items-center rounded border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        )}
        {!["display", "general", "recording", "ai", "shortcuts"].includes(section) && (
          <p className="text-sm text-muted-foreground">
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
            className="nav-item w-full mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSearchParams({ section: item.id })}
                        className={cn(
                          "nav-item w-full",
                          section === item.id && "nav-item-active"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppSidebar>
      <div className="flex-1 overflow-y-auto scrollbar-minimal p-8">
        <SectionContent section={section} />
      </div>
    </div>
  );
}
