import { createHash } from "crypto";
import { CAPTURE_INTERVAL_MS } from "../config.js";
import {
  insertAccessibilityText,
  insertFrame,
  insertOcrText,
  saveFrameImage,
} from "../db/index.js";
import type { EngineState } from "../types.js";
import { runOcr, terminateOcr } from "./ocr.js";
import { captureAllMonitors } from "./screen.js";
import { getActiveWindow } from "./window.js";

export class CaptureEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHashes = new Map<string, string>();
  private capturing = false;

  readonly state: EngineState = {
    running: false,
    paused: false,
    audioRecording: false,
    framesCaptured: 0,
    startedAt: null,
    lastError: null,
  };

  start(): void {
    if (this.state.running) return;
    this.state.running = true;
    this.state.paused = false;
    this.state.startedAt = Date.now();
    this.state.lastError = null;

    console.log(`[engine] started (interval ${CAPTURE_INTERVAL_MS}ms)`);
    this.timer = setInterval(() => {
      void this.tick();
    }, CAPTURE_INTERVAL_MS);

    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.running = false;
    this.state.paused = false;
    void terminateOcr();
    console.log("[engine] stopped");
  }

  pause(): void {
    this.state.paused = true;
    console.log("[engine] paused");
  }

  resume(): void {
    this.state.paused = false;
    console.log("[engine] resumed");
  }

  private async tick(): Promise<void> {
    if (!this.state.running || this.state.paused || this.capturing) return;
    this.capturing = true;

    try {
      const activeWindow = await getActiveWindow();
      const captures = await captureAllMonitors();

      for (const { monitorId, buffer } of captures) {
        const hash = createHash("md5").update(buffer).digest("hex");
        const monitorKey = String(monitorId);
        const prev = this.lastHashes.get(monitorKey);
        if (prev === hash) continue;
        this.lastHashes.set(monitorKey, hash);

        const timestamp = new Date().toISOString();
        const imagePath = saveFrameImage(monitorId, buffer);
        const frameId = insertFrame({
          timestamp,
          appName: activeWindow?.app ?? null,
          windowName: activeWindow?.title ?? null,
          browserUrl: activeWindow?.browserUrl ?? null,
          monitorId: typeof monitorId === "number" ? monitorId : 0,
          imagePath,
          focused: String(monitorId).includes("DISPLAY1") || monitorId === 0,
        });

        const axText = await extractAccessibilityText(activeWindow);
        if (axText) {
          insertAccessibilityText(frameId, axText);
        } else {
          const { text, confidence } = await runOcr(buffer);
          if (text) insertOcrText(frameId, text, confidence);
        }

        this.state.framesCaptured += 1;
      }
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err);
      console.error("[engine] capture error:", err);
    } finally {
      this.capturing = false;
    }
  }
}

async function extractAccessibilityText(
  activeWindow: Awaited<ReturnType<typeof getActiveWindow>>
): Promise<string | null> {
  if (!activeWindow) return null;
  const parts = [activeWindow.title, activeWindow.app, activeWindow.browserUrl].filter(
    Boolean
  );
  const text = parts.join("\n").trim();
  return text.length > 0 ? text : null;
}

export const captureEngine = new CaptureEngine();
