import React from "react";
import { Monitor, MonitorOff, Mic, MicOff, Volume2, VolumeX, Phone, Pause, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRecordingStore, type RecordingDevice } from "@/lib/stores/recording-store";

const KIND_ICONS: Record<
  RecordingDevice["kind"],
  { active: typeof Monitor; paused: typeof Monitor }
> = {
  monitor: { active: Monitor, paused: MonitorOff },
  input: { active: Mic, paused: MicOff },
  output: { active: Volume2, paused: VolumeX },
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

interface RecordingStatusProps {
  isTranslucent?: boolean;
  floatingOverMedia?: boolean;
}

export function RecordingStatus({ isTranslucent, floatingOverMedia }: RecordingStatusProps) {
  const [open, setOpen] = React.useState(false);
  const {
    devices,
    meetingActive,
    isGloballyPaused,
    elapsedSeconds,
    toggleDevice,
    toggleMeeting,
    pauseAll,
    resumeAll,
  } = useRecordingStore();

  const monitorDevices = devices.filter((d) => d.kind === "monitor");
  const monitorsPaused = monitorDevices.length > 0 && monitorDevices.every((d) => !d.active);
  const isScreenPaused = isGloballyPaused || monitorsPaused;
  const summary =
    devices.length === 0
      ? "not recording"
      : isScreenPaused
        ? "paused"
        : "recording";
  const label = meetingActive ? `${summary} · meeting notes` : summary;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 h-8 font-mono text-xs uppercase tracking-wide transition-all duration-150 border",
            floatingOverMedia
              ? "border-foreground/20 bg-background/80 backdrop-blur-sm text-foreground"
              : isTranslucent
                ? "border-foreground/20 text-foreground hover:bg-foreground hover:text-background"
                : "border-border text-muted-foreground hover:bg-foreground hover:text-background"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 border border-current",
              meetingActive && !isScreenPaused && "animate-pulse",
              isScreenPaused && !meetingActive && "bg-transparent",
              (!isScreenPaused || meetingActive) && "bg-current"
            )}
          />
          <span>{label}</span>
          <span className="tabular-nums text-[10px] opacity-70">{formatElapsed(elapsedSeconds)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            recording status
          </span>
        </div>
        <div className="flex flex-col">
          {devices.map((device) => {
            const Icon = device.active
              ? KIND_ICONS[device.kind].active
              : KIND_ICONS[device.kind].paused;
            const isMonitor = device.kind === "monitor";
            return (
              <div
                key={device.fullName}
                className={cn(
                  "flex items-center justify-between px-4 py-3 border-b border-border text-sm font-mono",
                  !isMonitor && "hover:bg-accent transition-colors duration-150"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span className="lowercase">{device.name}</span>
                </div>
                {isMonitor ? (
                  <button
                    type="button"
                    onClick={() => (isScreenPaused ? resumeAll() : pauseAll())}
                    className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {device.active ? "on" : "off"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleDevice(device.fullName)}
                    className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {device.active ? "on" : "off"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="p-3 flex flex-col gap-2 border-t border-border">
          <button
            onClick={isScreenPaused ? resumeAll : pauseAll}
            className="flex items-center justify-center gap-2 h-9 border border-border font-mono text-xs uppercase tracking-wide hover:bg-foreground hover:text-background transition-all duration-150"
          >
            {isScreenPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isScreenPaused ? "resume all" : "pause all"}
          </button>
          <button
            onClick={toggleMeeting}
            className={cn(
              "flex items-center justify-center gap-2 h-9 border font-mono text-xs uppercase tracking-wide transition-all duration-150",
              meetingActive
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-foreground hover:text-background"
            )}
          >
            <Phone className="w-3 h-3" />
            {meetingActive ? "stop meeting notes" : "start meeting notes"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
