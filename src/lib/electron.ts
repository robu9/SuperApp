export interface ElectronAPI {
  openWindow: (kind: "home" | "settings" | "onboarding" | "search" | "chat") => Promise<void>;
  closeWindow: () => Promise<void>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getPlatform: () => Promise<NodeJS.Platform>;
  quit: () => Promise<void>;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const electron = window.electronAPI;
