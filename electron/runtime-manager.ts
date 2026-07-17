import { app, safeStorage, shell, utilityProcess, type UtilityProcess } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../build/runtime-manifest.json";
import {
  initialRuntimeStatus,
  type RuntimeError,
  type RuntimePhase,
  type RuntimeStatus,
  type ModelProvider,
} from "./runtime-types.js";
import { startBackend, stopBackend } from "./backend-manager.js";
import {
  isSupportedRuntimePlatform,
  nextRuntimeStatus,
  redactRuntimeDiagnostics,
  readManagedApiKey,
} from "./runtime-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_URL = `http://127.0.0.1:${manifest.supermemoryPort}`;

type StatusListener = (status: RuntimeStatus) => void;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reachable(url: string, timeoutMs = 1_500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(url: string, attempts: number): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reachable(url)) return;
    await delay(500);
  }
  throw new Error(`health check timed out for ${url}`);
}

export class RuntimeManager {
  private status: RuntimeStatus = initialRuntimeStatus();
  private listeners = new Set<StatusListener>();
  private memoryProcess: ChildProcess | null = null;
  private installProcess: UtilityProcess | null = null;
  private activeStart: Promise<void> | null = null;
  private memoryOutput = "";
  private existingLogSanitized = false;

  getStatus = (): RuntimeStatus => ({ ...this.status });

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private update(
    phase: RuntimePhase,
    message: string,
    progress: number,
    patch: Partial<RuntimeStatus> = {}
  ) {
    this.status = nextRuntimeStatus(this.status, phase, message, progress, patch);
    this.writeLog(`${phase}: ${message}`);
    for (const listener of this.listeners) listener(this.getStatus());
  }

  private paths() {
    const root = path.join(app.getPath("userData"), "runtime");
    const memory = path.join(root, "supermemory");
    const bin = path.join(memory, "bin");
    const wrappers = path.join(memory, "wrappers");
    return {
      root,
      memory,
      bin,
      wrappers,
      server: path.join(bin, "supermemory-server"),
      log: path.join(root, "runtime.log"),
      provider: path.join(root, "provider.json"),
    };
  }

  private writeLog(message: string) {
    try {
      const { root, log } = this.paths();
      mkdirSync(root, { recursive: true });
      if (!this.existingLogSanitized) {
        this.existingLogSanitized = true;
        if (existsSync(log)) {
          const existing = readFileSync(log, "utf8");
          const sanitized = redactRuntimeDiagnostics(existing);
          if (sanitized !== existing) writeFileSync(log, sanitized, { mode: 0o600 });
        }
      }
      appendFileSync(
        log,
        `[${new Date().toISOString()}] ${redactRuntimeDiagnostics(message)}\n`,
      );
      chmodSync(log, 0o600);
    } catch {
      // Logging must never prevent startup.
    }
  }

  async openLogs() {
    const { root, log } = this.paths();
    mkdirSync(root, { recursive: true });
    if (!existsSync(log)) appendFileSync(log, "SuperApp runtime log\n");
    await shell.showItemInFolder(log);
  }

  getProviderInfo(): { provider: ModelProvider | null; configured: boolean } {
    if (
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY
    ) {
      const provider = process.env.GEMINI_API_KEY
        ? "gemini"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : "anthropic";
      return { provider, configured: true };
    }
    const providerPath = this.paths().provider;
    if (!existsSync(providerPath)) return { provider: null, configured: false };
    try {
      const stored = JSON.parse(readFileSync(providerPath, "utf8")) as {
        encrypted: boolean;
        content: string;
      };
      const buffer = Buffer.from(stored.content, "base64");
      const payload = stored.encrypted
        ? safeStorage.decryptString(buffer)
        : buffer.toString("utf8");
      const value = JSON.parse(payload) as { provider: ModelProvider };
      return { provider: value.provider, configured: true };
    } catch {
      return { provider: null, configured: false };
    }
  }

  configureProvider(provider: ModelProvider, apiKey: string) {
    const key = apiKey.trim();
    if (!key) throw new Error("API key is required");
    const payload = JSON.stringify({ provider, apiKey: key });
    const encrypted = safeStorage.isEncryptionAvailable();
    const content = encrypted
      ? safeStorage.encryptString(payload).toString("base64")
      : Buffer.from(payload, "utf8").toString("base64");
    const providerPath = this.paths().provider;
    writeFileSync(providerPath, JSON.stringify({ encrypted, content }), {
      mode: 0o600,
    });
    chmodSync(providerPath, 0o600);
  }

  private getProviderEnv(): NodeJS.ProcessEnv {
    if (
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY
    ) {
      return {};
    }
    const providerPath = this.paths().provider;
    if (!existsSync(providerPath)) return {};
    try {
      const stored = JSON.parse(readFileSync(providerPath, "utf8")) as {
        encrypted: boolean;
        content: string;
      };
      const buffer = Buffer.from(stored.content, "base64");
      const payload = stored.encrypted
        ? safeStorage.decryptString(buffer)
        : buffer.toString("utf8");
      const value = JSON.parse(payload) as {
        provider: ModelProvider;
        apiKey: string;
      };
      const variable = {
        gemini: "GEMINI_API_KEY",
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
      }[value.provider];
      return { [variable]: value.apiKey };
    } catch (error) {
      this.writeLog(`provider credentials could not be read: ${String(error)}`);
      return {};
    }
  }

  start(): Promise<void> {
    if (this.activeStart) return this.activeStart;
    this.activeStart = this.startInternal().finally(() => {
      this.activeStart = null;
    });
    return this.activeStart;
  }

  async retry(): Promise<void> {
    await this.stop();
    this.status = initialRuntimeStatus();
    await this.start();
  }

  private async startInternal() {
    try {
      if (!app.isPackaged) {
        this.update("checking", "waiting for development services", 20);
        await waitForHealth(MEMORY_URL, 60);
        this.update("starting-backend", "connecting to capture backend", 75, {
          memoryReady: true,
        });
        await startBackend(
          {
            SUPERMEMORY_BASE_URL: MEMORY_URL,
            SUPERMEMORY_LOCAL_URL: MEMORY_URL,
          },
          (message) => this.writeLog(`backend: ${message}`),
        );
        this.update("ready", "local runtime ready", 100, {
          memoryReady: true,
          backendReady: true,
          error: undefined,
        });
        return;
      }

      if (!isSupportedRuntimePlatform(process.platform)) {
        throw this.runtimeError(
          "UNSUPPORTED_PLATFORM",
          "SuperApp currently supports macOS and Linux.",
          false
        );
      }

      const paths = this.paths();
      mkdirSync(paths.bin, { recursive: true });
      this.update("checking", "checking Supermemory Local", 10);

      if (!this.isNativeServer(paths.server)) await this.installSupermemory();

      if (await reachable(MEMORY_URL)) {
        throw this.runtimeError(
          "PORT_IN_USE",
          `Port ${manifest.supermemoryPort} is already in use by a process SuperApp did not start.`,
          true
        );
      }

      this.update("starting-memory", "starting Supermemory Local", 55);
      this.memoryOutput = "";
      const providerEnv = this.getProviderEnv();
      this.memoryProcess = spawn(paths.server, [], {
        cwd: paths.memory,
        env: {
          ...process.env,
          PORT: String(manifest.supermemoryPort),
          SUPERMEMORY_INSTALL_DIR: paths.memory,
          SUPERMEMORY_BIN_DIR: paths.wrappers,
          SUPERMEMORY_DATA_DIR: path.join(paths.memory, "data"),
          SUPERMEMORY_DISABLE_TELEMETRY: "1",
          ...providerEnv,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.pipeLogs(this.memoryProcess, "supermemory", (text) => {
        this.memoryOutput = `${this.memoryOutput}\n${text}`.slice(-16_000);
      });
      this.memoryProcess.once("error", (error) => {
        this.memoryOutput = `${this.memoryOutput}\n${error.message}`.slice(-16_000);
      });
      this.memoryProcess.once("exit", (code) => {
        if (this.status.phase === "ready") {
          this.fail(
            this.runtimeError(
              "MEMORY_START_FAILED",
              `Supermemory exited unexpectedly (${code ?? "signal"}).`,
              true
            )
          );
        }
      });
      await this.waitForMemoryHealth();

      this.update("starting-backend", "starting SuperApp capture engine", 78, {
        memoryReady: true,
      });
      try {
        await startBackend(
          {
            SUPERMEMORY_BASE_URL: MEMORY_URL,
            SUPERMEMORY_LOCAL_URL: MEMORY_URL,
            SUPERMEMORY_API_KEY: readManagedApiKey(paths.memory),
            SUPERAPP_NATIVE_DIR: path.join(process.resourcesPath, "backend-native"),
            ...providerEnv,
          },
          (message) => this.writeLog(`backend: ${message}`),
        );
      } catch (error) {
        throw this.runtimeError(
          String(error).includes("already in use") ? "PORT_IN_USE" : "BACKEND_START_FAILED",
          String(error).includes("already in use")
            ? `Port ${manifest.backendPort} is already in use by another process.`
            : "The SuperApp capture engine could not be started.",
          true,
          error instanceof Error ? error.stack : String(error)
        );
      }
      this.update("ready", "SuperApp is ready", 100, {
        memoryReady: true,
        backendReady: true,
        error: undefined,
      });
    } catch (error) {
      const runtimeError = this.asRuntimeError(error);
      this.fail(runtimeError);
      throw error;
    }
  }

  private installSupermemory(): Promise<void> {
    this.update("installing", "downloading Supermemory Local", 28);
    const paths = this.paths();
    const cli = path.join(
      __dirname,
      "..",
      "node_modules",
      "supermemory",
      "bin",
      "cli"
    );

    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(
        cli,
        [
          "local",
          "install",
          "--version",
          manifest.supermemoryServerVersion,
          "--force",
        ],
        {
          cwd: paths.root,
          env: {
            ...process.env,
            SUPERMEMORY_INSTALL_DIR: paths.memory,
            SUPERMEMORY_BIN_DIR: paths.wrappers,
            SUPERMEMORY_NO_PROMPT: "1",
            SUPERMEMORY_NO_START: "1",
          },
          stdio: "pipe",
          serviceName: "Supermemory Installer",
        }
      );
      this.installProcess = child;
      child.stdout?.on("data", (data: Buffer) =>
        this.writeLog(`installer: ${data.toString().trim()}`)
      );
      child.stderr?.on("data", (data: Buffer) =>
        this.writeLog(`installer: ${data.toString().trim()}`)
      );
      child.once("exit", (code) => {
        this.installProcess = null;
        if (code === 0 && this.isNativeServer(paths.server)) resolve();
        else
          reject(
            this.runtimeError(
              "INSTALL_FAILED",
              "Supermemory Local could not be installed. Check your internet connection and retry.",
              true
            )
          );
      });
    });
  }

  private isNativeServer(serverPath: string): boolean {
    if (!existsSync(serverPath)) return false;
    try {
      return readFileSync(serverPath).subarray(0, 2).toString() !== "#!";
    } catch {
      return false;
    }
  }

  private pipeLogs(
    child: ChildProcess,
    label: string,
    capture?: (text: string) => void
  ) {
    const log = (data: Buffer) => {
      const text = data.toString().trim();
      this.writeLog(`${label}: ${text}`);
      capture?.(text);
    };
    child.stdout?.on("data", log);
    child.stderr?.on("data", log);
  }

  private async waitForMemoryHealth() {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (await reachable(MEMORY_URL)) return;
      if (this.memoryProcess?.exitCode !== null) {
        if (this.memoryOutput.includes("No model provider API key configured")) {
          throw this.runtimeError(
            "PROVIDER_KEY_REQUIRED",
            "Choose a model provider to finish local memory setup.",
            true
          );
        }
        throw this.runtimeError(
          "MEMORY_START_FAILED",
          "Supermemory Local exited before it became ready.",
          true,
          this.memoryOutput
        );
      }
      await delay(500);
    }
    throw this.runtimeError(
      "HEALTH_TIMEOUT",
      "Supermemory Local took too long to start.",
      true,
      this.memoryOutput
    );
  }

  async stop(): Promise<void> {
    this.update("stopping", "stopping local services", 10, {
      backendReady: false,
    });
    this.installProcess?.kill();
    this.installProcess = null;
    stopBackend();
    await this.stopChild(this.memoryProcess);
    this.memoryProcess = null;
    this.update("stopping", "local services stopped", 100, {
      memoryReady: false,
      backendReady: false,
    });
  }

  private async stopChild(child: ChildProcess | null) {
    if (!child || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      delay(3_000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  private runtimeError(
    code: RuntimeError["code"],
    message: string,
    retryable: boolean,
    detail?: string
  ): RuntimeError {
    return { code, message, retryable, detail };
  }

  private asRuntimeError(error: unknown): RuntimeError {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "retryable" in error
    ) {
      return error as RuntimeError;
    }
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    const code = detail.includes("health check timed out")
      ? "HEALTH_TIMEOUT"
      : "UNKNOWN";
    return this.runtimeError(code, "The local runtime could not be started.", true, detail);
  }

  private fail(error: RuntimeError) {
    this.update("error", error.message, this.status.progress, {
      error,
      backendReady: false,
    });
  }
}
