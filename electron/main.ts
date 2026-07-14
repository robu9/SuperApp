import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {
  getApiUrl,
  proxyApi,
  startBackend,
  stopBackend,
} from "./backend-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

type WindowKind = "home" | "settings" | "onboarding" | "search" | "chat";

interface WindowConfig {
  width: number;
  height: number;
  transparent?: boolean;
  frame?: boolean;
  resizable?: boolean;
  route: string;
}

const WINDOW_CONFIGS: Record<WindowKind, WindowConfig> = {
  home: { width: 1280, height: 800, route: "/home" },
  settings: { width: 1100, height: 760, route: "/settings" },
  onboarding: { width: 500, height: 560, route: "/onboarding" },
  search: { width: 720, height: 520, transparent: true, frame: false, route: "/search" },
  chat: { width: 900, height: 700, route: "/chat" },
};

const windows = new Map<WindowKind, BrowserWindow>();

function getPreloadPath() {
  return path.join(__dirname, "preload.mjs");
}

function createWindow(kind: WindowKind): BrowserWindow {
  const config = WINDOW_CONFIGS[kind];
  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    minWidth: kind === "onboarding" ? 500 : 800,
    minHeight: kind === "onboarding" ? 480 : 600,
    show: false,
    frame: config.frame !== false,
    transparent: config.transparent ?? false,
    resizable: config.resizable !== false,
    backgroundColor: config.transparent ? "#00000000" : "#121212",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = isDev
    ? `http://localhost:1420/#${config.route}`
    : `file://${path.join(__dirname, "../dist/index.html")}#${config.route}`;

  win.loadURL(url);

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    windows.delete(kind);
  });

  windows.set(kind, win);
  return win;
}

function getOrCreateWindow(kind: WindowKind): BrowserWindow {
  const existing = windows.get(kind);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  return createWindow(kind);
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    console.log(`[main] backend ready at ${getApiUrl()}`);
  } catch (err) {
    console.error("[main] backend failed to start:", err);
  }

  const onboardingComplete = true; // checked via renderer store; default to home for dev
  if (onboardingComplete) {
    getOrCreateWindow("home");
  } else {
    getOrCreateWindow("onboarding");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      getOrCreateWindow("home");
    }
  });
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("window:open", (_event, kind: WindowKind) => {
  getOrCreateWindow(kind);
});

ipcMain.handle("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

ipcMain.handle("window:set-size", (event, width: number, height: number) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setSize(width, height);
});

ipcMain.handle("shell:open-external", (_event, url: string) => {
  return shell.openExternal(url);
});

ipcMain.handle("app:get-platform", () => process.platform);

ipcMain.handle("app:quit", () => {
  app.quit();
});

ipcMain.handle("api:get-url", () => getApiUrl());

ipcMain.handle("api:request", async (_event, method: string, path: string, body?: unknown) => {
  return proxyApi(method, path, body);
});

ipcMain.handle("engine:start", async () => proxyApi("POST", "/engine/start"));
ipcMain.handle("engine:stop", async () => proxyApi("POST", "/engine/stop"));
ipcMain.handle("engine:pause", async () => proxyApi("POST", "/engine/pause"));
ipcMain.handle("engine:resume", async () => proxyApi("POST", "/engine/resume"));
ipcMain.handle("engine:status", async () => proxyApi("GET", "/engine/status"));
ipcMain.handle("engine:health", async () => proxyApi("GET", "/health"));
