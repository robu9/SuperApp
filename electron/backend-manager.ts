import { spawn, type ChildProcess } from "child_process";
import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { promisify } from "util";
import { app } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = Number(process.env.SUPERAPP_PORT ?? 3030);
const API_URL = `http://127.0.0.1:${API_PORT}`;

let backendProcess: ChildProcess | null = null;

function loadEnvFile(envPath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!existsSync(envPath)) return vars;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function getBackendEntry(): { command: string; args: string[]; cwd: string } {
  const backendDir = path.join(__dirname, "..", "backend");
  const isDev = !app.isPackaged;

  if (isDev) {
    const tsxBin = path.join(
      backendDir,
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs"
    );
    return {
      command: process.execPath,
      args: [tsxBin, "src/index.ts"],
      cwd: backendDir,
    };
  }

  return {
    command: process.execPath,
    args: [path.join(backendDir, "dist", "index.js")],
    cwd: backendDir,
  };
}

function getEnvForBackend(): NodeJS.ProcessEnv {
  const dataDir = path.join(os.homedir(), ".superapp");
  const envPath = path.join(__dirname, "..", ".env");
  const dotenv = loadEnvFile(envPath);

  return {
    ...process.env,
    ...dotenv,
    SUPERAPP_DATA_DIR: dataDir,
    SUPERAPP_PORT: String(API_PORT),
  };
}

async function backendHasChatRoute(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function killProcessOnPort(port: number): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique`,
    ]);
    const pids = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0);

    for (const pid of pids) {
      if (pid === process.pid) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    if (pids.length > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {
    // ignore
  }
}

export async function startBackend(): Promise<void> {
  if (backendProcess && !backendProcess.killed) {
    const hasChat = await backendHasChatRoute();
    if (hasChat) {
      await waitForHealth(5);
      return;
    }
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }

  const hasChat = await backendHasChatRoute();
  if (!hasChat) {
    await killProcessOnPort(API_PORT);
  } else {
    await waitForHealth(5);
    return;
  }

  const { command, args, cwd } = getBackendEntry();

  backendProcess = spawn(command, args, {
    cwd,
    env: getEnvForBackend(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  backendProcess.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[backend] ${chunk.toString().trim()}`);
  });

  backendProcess.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[backend] ${chunk.toString().trim()}`);
  });

  backendProcess.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });

  await waitForHealth(30);

  const chatReady = await backendHasChatRoute();
  if (!chatReady) {
    throw new Error("Backend started but /chat route is unavailable");
  }
}

export function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
}

export async function waitForHealth(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Backend failed to start on port 3030");
}

export function getApiUrl(): string {
  return API_URL;
}

export async function proxyApi(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}
