import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import Supermemory from "supermemory";
import {
  SUPERMEMORY_API_KEY,
  SUPERMEMORY_BASE_URL,
} from "../config.js";

let client: Supermemory | null = null;

function readApiKeyFromDataDir(): string | undefined {
  const candidates = [
    path.join(process.cwd(), ".supermemory", "api_key"),
    path.join(os.homedir(), ".supermemory", "api_key"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const value = readFileSync(filePath, "utf8").trim();
    if (value.startsWith("sm_")) return value;
  }

  return undefined;
}

export function getSupermemoryClient(): Supermemory {
  if (client) return client;

  const apiKey =
    SUPERMEMORY_API_KEY || readApiKeyFromDataDir() || "local";

  client = new Supermemory({
    apiKey,
    baseURL: SUPERMEMORY_BASE_URL,
    timeout: 60_000,
  });

  return client;
}

export async function isSupermemoryReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    const response = await fetch(SUPERMEMORY_BASE_URL, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

export function resetSupermemoryClient(): void {
  client = null;
}
