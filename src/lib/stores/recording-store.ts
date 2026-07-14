import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { MonitorInfo, AudioDeviceInfo } from "@/lib/api/client";

export interface RecordingDevice {
  name: string;
  fullName: string;
  kind: "monitor" | "input" | "output";
  active: boolean;
  id?: number | string;
}

interface RecordingState {
  devices: RecordingDevice[];
  meetingActive: boolean;
  isGloballyPaused: boolean;
  elapsedSeconds: number;
  isConnected: boolean;
  framesCaptured: number;
  syncFromBackend: () => Promise<void>;
  toggleDevice: (fullName: string) => void;
  toggleMeeting: () => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  tick: () => void;
}

function monitorsToDevices(monitors: MonitorInfo[]): RecordingDevice[] {
  return monitors.map((m) => ({
    name: m.name.toLowerCase(),
    fullName: `monitor-${m.id}`,
    kind: "monitor" as const,
    active: m.active,
    id: m.id,
  }));
}

function audioToDevices(
  audio: AudioDeviceInfo[],
  audioRecording: boolean
): RecordingDevice[] {
  return audio.map((d, i) => ({
    name: d.name.toLowerCase(),
    fullName: `audio-${d.device_type}-${i}`,
    kind: d.device_type === "input" ? "input" : "output",
    active: d.device_type === "input" ? audioRecording : true,
  }));
}

function mergeDevices(
  monitors: MonitorInfo[],
  audio: AudioDeviceInfo[],
  status: { paused: boolean; audioRecording: boolean },
  previous: RecordingDevice[]
): RecordingDevice[] {
  const previousActive = new Map(previous.map((d) => [d.fullName, d.active]));

  const next = [
    ...monitorsToDevices(monitors),
    ...audioToDevices(audio, status.audioRecording),
  ];

  if (next.length === 0) return previous;

  return next.map((device) => {
    if (device.kind === "monitor") {
      if (status.paused) return { ...device, active: false };
      const wasActive = previousActive.get(device.fullName);
      return { ...device, active: wasActive ?? device.active };
    }

    if (device.kind === "input") {
      return { ...device, active: status.audioRecording };
    }

    const wasActive = previousActive.get(device.fullName);
    return { ...device, active: wasActive ?? true };
  });
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  devices: [],
  meetingActive: false,
  isGloballyPaused: false,
  elapsedSeconds: 0,
  isConnected: false,
  framesCaptured: 0,

  syncFromBackend: async () => {
    try {
      const [health, vision, audio, status] = await Promise.all([
        api.health(),
        api.visionList(),
        api.audioList(),
        api.engineStatus(),
      ]);

      const devices = mergeDevices(
        vision.data,
        audio.data,
        { paused: status.paused, audioRecording: status.audioRecording },
        get().devices
      );

      set({
        devices,
        isConnected: true,
        isGloballyPaused: status.paused,
        meetingActive: status.audioRecording,
        framesCaptured: health.frames_captured,
        elapsedSeconds: health.uptime_seconds,
      });
    } catch {
      set({ isConnected: false });
    }
  },

  toggleDevice: (fullName) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.fullName === fullName ? { ...d, active: !d.active } : d
      ),
    })),

  toggleMeeting: async () => {
    const { meetingActive } = get();
    try {
      if (meetingActive) {
        await api.audioStop();
      } else {
        await api.audioStart();
      }
      set({ meetingActive: !meetingActive });
    } catch (err) {
      console.error("[recording] meeting toggle failed:", err);
    }
  },

  pauseAll: async () => {
    try {
      await api.enginePause();
      set((state) => ({
        isGloballyPaused: true,
        devices: state.devices.map((d) => ({ ...d, active: false })),
      }));
    } catch (err) {
      console.error("[recording] pause failed:", err);
    }
  },

  resumeAll: async () => {
    try {
      await api.engineResume();
      set((state) => ({
        isGloballyPaused: false,
        devices: state.devices.map((d) => ({ ...d, active: true })),
      }));
    } catch (err) {
      console.error("[recording] resume failed:", err);
    }
  },

  tick: () => {
    void get().syncFromBackend();
  },
}));
