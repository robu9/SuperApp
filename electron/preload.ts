import { contextBridge, ipcRenderer } from "electron";

export type WindowKind = "home" | "settings" | "onboarding" | "search" | "chat";

const electronAPI = {
  openWindow: (kind: WindowKind) => ipcRenderer.invoke("window:open", kind),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.invoke("window:set-size", width, height),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  getPlatform: () => ipcRenderer.invoke("app:get-platform") as Promise<NodeJS.Platform>,
  quit: () => ipcRenderer.invoke("app:quit"),
  onThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_: unknown, theme: string) => callback(theme);
    ipcRenderer.on("theme-changed", handler);
    return () => ipcRenderer.removeListener("theme-changed", handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
