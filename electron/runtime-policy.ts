import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RuntimePhase, RuntimeStatus } from "./runtime-types.js";

export function isSupportedRuntimePlatform(platform: NodeJS.Platform): boolean {
  return platform === "darwin" || platform === "linux";
}

export function readManagedApiKey(memoryDir: string): string {
  for (const relative of [
    "api-key",
    "api_key",
    path.join("data", "api-key"),
    path.join("data", "api_key"),
    path.join(".supermemory", "api-key"),
    path.join(".supermemory", "api_key"),
  ]) {
    const candidate = path.join(memoryDir, relative);
    if (!existsSync(candidate)) continue;
    const value = readFileSync(candidate, "utf8").trim();
    if (value) return value;
  }
  return "local";
}

export function nextRuntimeStatus(
  current: RuntimeStatus,
  phase: RuntimePhase,
  message: string,
  progress: number,
  patch: Partial<RuntimeStatus> = {}
): RuntimeStatus {
  return {
    ...current,
    ...patch,
    phase,
    message,
    progress: Math.max(0, Math.min(100, progress)),
    updatedAt: new Date().toISOString(),
  };
}
