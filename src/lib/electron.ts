export interface ElectronAPI {
  openWindow: (kind: "home" | "settings" | "onboarding" | "search" | "chat") => Promise<void>;
  closeWindow: () => Promise<void>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getPlatform: () => Promise<NodeJS.Platform>;
  quit: () => Promise<void>;
  getApiUrl: () => Promise<string>;
  apiRequest: (method: string, path: string, body?: unknown) => Promise<unknown>;
  engine: {
    start: () => Promise<unknown>;
    stop: () => Promise<unknown>;
    pause: () => Promise<unknown>;
    resume: () => Promise<unknown>;
    status: () => Promise<unknown>;
    health: () => Promise<unknown>;
  };
  onThemeChanged: (callback: (theme: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const electron = window.electronAPI;
