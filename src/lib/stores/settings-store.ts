import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
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
        theme: "system",
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

export function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.setProperty("--font-size-base", `${useSettingsStore.getState().settings.fontSize}px`);
}
