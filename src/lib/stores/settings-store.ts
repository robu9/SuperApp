import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppSettings {
  translucentSidebar: boolean;
  disableTimeline: boolean;
  fontSize: number;
  launchAtStartup: boolean;
}

interface SettingsState {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        translucentSidebar: true,
        disableTimeline: false,
        fontSize: 16,
        launchAtStartup: false,
      },
      setSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),
    }),
    { name: "superapp-settings" }
  )
);

export function applyTheme() {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.setProperty(
    "--font-size-base",
    `${useSettingsStore.getState().settings.fontSize}px`
  );
}
