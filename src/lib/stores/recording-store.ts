import { create } from "zustand";

export interface RecordingDevice {
  name: string;
  fullName: string;
  kind: "monitor" | "input" | "output";
  active: boolean;
  id?: number;
}

interface RecordingState {
  devices: RecordingDevice[];
  meetingActive: boolean;
  isGloballyPaused: boolean;
  elapsedSeconds: number;
  toggleDevice: (fullName: string) => void;
  toggleMeeting: () => void;
  pauseAll: () => void;
  resumeAll: () => void;
  tick: () => void;
}

const defaultDevices: RecordingDevice[] = [
  { name: "display 1", fullName: "\\\\.\\DISPLAY1", kind: "monitor", active: true, id: 0 },
  { name: "microphone", fullName: "default-mic", kind: "input", active: true },
  { name: "speakers", fullName: "default-output", kind: "output", active: true },
];

export const useRecordingStore = create<RecordingState>((set, get) => ({
  devices: defaultDevices,
  meetingActive: false,
  isGloballyPaused: false,
  elapsedSeconds: 441,
  toggleDevice: (fullName) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.fullName === fullName ? { ...d, active: !d.active } : d
      ),
    })),
  toggleMeeting: () => set((state) => ({ meetingActive: !state.meetingActive })),
  pauseAll: () =>
    set((state) => ({
      isGloballyPaused: true,
      devices: state.devices.map((d) => ({ ...d, active: false })),
    })),
  resumeAll: () =>
    set((state) => ({
      isGloballyPaused: false,
      devices: state.devices.map((d) => ({ ...d, active: true })),
    })),
  tick: () => {
    const { isGloballyPaused, devices } = get();
    const anyActive = devices.some((d) => d.active);
    if (!isGloballyPaused && anyActive) {
      set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 }));
    }
  },
}));
