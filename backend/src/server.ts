import { readFileSync, existsSync } from "fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { API_HOST, API_PORT, AUDIO_ENABLED, GEMINI_MODEL } from "./config.js";
import { captureEngine } from "./capture/engine.js";
import {
  isAudioRecording,
  listAudioDevices,
  startAudioRecording,
  stopAudioRecording,
} from "./capture/audio.js";
import { listMonitors } from "./capture/screen.js";
import {
  getActivitySummary,
  getFrameById,
  getFrameText,
  getRecentContext,
  getStats,
  initDatabase,
  keywordSearch,
  listFrames,
  runReadOnlySql,
  searchContent,
} from "./db/index.js";
import type { ContentType } from "./types.js";
import { generateGeminiReply, type ChatTurn } from "./llm/gemini.js";

const app = new Hono();
const startTime = Date.now();

app.use("*", cors());

app.get("/health", (c) => {
  const stats = getStats();
  const engine = captureEngine.state;

  return c.json({
    status: engine.running ? "healthy" : "degraded",
    last_frame_timestamp: stats.lastFrameTimestamp,
    frame_status: engine.paused ? "paused" : engine.running ? "ok" : "disabled",
    audio_status: isAudioRecording() ? "ok" : engine.running ? "paused" : "disabled",
    ui_status: "ok",
    message: engine.lastError ?? "superapp capture engine",
    version: "0.1.0",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    frames_captured: stats.framesCaptured,
    audio_chunks: stats.audioChunks,
  });
});

app.get("/search", (c) => {
  const q = c.req.query("q");
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = Number(c.req.query("offset") ?? 0);
  const contentType = (c.req.query("content_type") ?? "all") as ContentType;
  const startTimeQ = c.req.query("start_time");
  const endTimeQ = c.req.query("end_time");
  const appName = c.req.query("app_name");
  const windowName = c.req.query("window_name");
  const minLength = c.req.query("min_length")
    ? Number(c.req.query("min_length"))
    : undefined;

  const { data, total } = searchContent({
    q,
    limit,
    offset,
    contentType,
    startTime: startTimeQ,
    endTime: endTimeQ,
    appName,
    windowName,
    minLength,
  });

  return c.json({
    data,
    pagination: { limit, offset, total },
  });
});

app.get("/search/keyword", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = Number(c.req.query("offset") ?? 0);
  const { data, total } = keywordSearch({ q, limit, offset });
  return c.json({ data, pagination: { limit, offset, total } });
});

app.get("/activity-summary", (c) => {
  const start = c.req.query("start_time") ?? new Date(Date.now() - 86400000).toISOString();
  const end = c.req.query("end_time") ?? new Date().toISOString();
  return c.json(getActivitySummary(start, end));
});

app.get("/frames/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const frame = getFrameById(id);
  if (!frame) return c.json({ error: "frame not found" }, 404);

  const includeImage = c.req.query("include_image") === "true";
  let imageBase64: string | undefined;
  if (includeImage && existsSync(frame.image_path)) {
    imageBase64 = readFileSync(frame.image_path).toString("base64");
  }

  return c.json({ ...frame, image_base64: imageBase64 });
});

app.get("/frames/:id/text", (c) => {
  const id = Number(c.req.param("id"));
  const frame = getFrameById(id);
  if (!frame) return c.json({ error: "frame not found" }, 404);
  const text = getFrameText(id);
  return c.json({
    frame_id: id,
    accessibility: text.accessibility,
    ocr: text.ocr,
    text: text.accessibility ?? text.ocr ?? "",
    timestamp: frame.timestamp,
    app_name: frame.app_name,
    window_name: frame.window_name,
  });
});

app.get("/frames/:id/ocr", (c) => {
  const id = Number(c.req.param("id"));
  const frame = getFrameById(id);
  if (!frame) return c.json({ error: "frame not found" }, 404);
  const text = getFrameText(id);
  return c.json({ frame_id: id, text: text.ocr ?? "", source: "ocr" });
});

app.get("/frames/:id/context", (c) => {
  const id = Number(c.req.param("id"));
  const frame = getFrameById(id);
  if (!frame) return c.json({ error: "frame not found" }, 404);
  const text = getFrameText(id);
  return c.json({
    frame_id: id,
    context: text.accessibility ?? text.ocr ?? "",
    app_name: frame.app_name,
    window_name: frame.window_name,
    browser_url: frame.browser_url,
  });
});

app.get("/frames/:id/metadata", (c) => {
  const id = Number(c.req.param("id"));
  const frame = getFrameById(id);
  if (!frame) return c.json({ error: "frame not found" }, 404);
  return c.json({
    frame_id: id,
    timestamp: frame.timestamp,
    app_name: frame.app_name,
    window_name: frame.window_name,
    browser_url: frame.browser_url,
    monitor_id: frame.monitor_id,
    focused: Boolean(frame.focused),
    image_path: frame.image_path,
  });
});

app.get("/frames", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  const startTimeQ = c.req.query("start_time");
  const endTimeQ = c.req.query("end_time");
  const { frames, total } = listFrames({
    limit,
    offset,
    startTime: startTimeQ,
    endTime: endTimeQ,
  });
  return c.json({ data: frames, pagination: { limit, offset, total } });
});

app.get("/vision/list", async (c) => {
  const monitors = await listMonitors();
  return c.json({ data: monitors });
});

app.get("/audio/list", async (c) => {
  const devices = await listAudioDevices();
  return c.json({ data: devices });
});

app.post("/audio/start", async (c) => {
  await startAudioRecording();
  captureEngine.state.audioRecording = true;
  return c.json({ status: "ok", recording: true });
});

app.post("/audio/stop", (c) => {
  stopAudioRecording();
  captureEngine.state.audioRecording = false;
  return c.json({ status: "ok", recording: false });
});

app.post("/engine/start", (c) => {
  captureEngine.start();
  return c.json({ status: "ok", running: true });
});

app.post("/engine/stop", (c) => {
  captureEngine.stop();
  return c.json({ status: "ok", running: false });
});

app.post("/engine/pause", (c) => {
  captureEngine.pause();
  return c.json({ status: "ok", paused: true });
});

app.post("/engine/resume", (c) => {
  captureEngine.resume();
  return c.json({ status: "ok", paused: false });
});

app.get("/engine/status", (c) => {
  return c.json(captureEngine.state);
});

app.post("/chat", async (c) => {
  try {
    const body = await c.req.json<{
      messages: ChatTurn[];
      context_query?: string;
    }>();

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: "messages array is required" }, 400);
    }

    const stats = getStats();
    const engine = captureEngine.state;

    // Always include recent screen + audio context (not keyword-dependent)
    const recent = getRecentContext(12);
    const contextSnippets: string[] = recent.map((item) => {
      const sourceLabel = item.source === "audio" ? "[audio]" : "[screen]";
      const parts = [
        sourceLabel,
        item.app_name ? `[${item.app_name}]` : null,
        item.window_name ? `"${item.window_name}"` : null,
        item.text,
      ].filter(Boolean);
      return parts.join(" ");
    });

    const lastUserMessage = [...body.messages]
      .reverse()
      .find((message) => message.role === "user")?.content;

    const searchQuery = body.context_query ?? lastUserMessage;
    if (searchQuery?.trim() && searchQuery.trim().length > 2) {
      const { data } = searchContent({
        q: searchQuery,
        limit: 8,
        offset: 0,
        contentType: "all",
      });
      const searchSnippets = data
        .map((item) => item.content.text)
        .filter(Boolean);
      for (const snippet of searchSnippets) {
        if (!contextSnippets.includes(snippet)) {
          contextSnippets.push(snippet);
        }
      }
    }

    const content = await generateGeminiReply(body.messages, contextSnippets, {
      screenRecording: engine.running && !engine.paused,
      framesCaptured: stats.framesCaptured,
      audioRecording: isAudioRecording(),
      audioChunks: stats.audioChunks,
    });
    return c.json({ content, model: GEMINI_MODEL, provider: "gemini" });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "chat request failed" },
      500
    );
  }
});

app.post("/raw_sql", async (c) => {
  try {
    const body = await c.req.json<{ query: string }>();
    const rows = runReadOnlySql(body.query);
    return c.json({ data: rows });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "query failed" },
      400
    );
  }
});

app.post("/add", async (c) => {
  const body = await c.req.json<{
    type: "ocr" | "accessibility" | "audio";
    text: string;
    timestamp?: string;
    app_name?: string;
    window_name?: string;
  }>();

  const timestamp = body.timestamp ?? new Date().toISOString();

  if (body.type === "audio") {
    const { insertAudioTranscription } = await import("./db/index.js");
    const id = insertAudioTranscription({
      timestamp,
      transcription: body.text,
      deviceName: "manual",
    });
    return c.json({ status: "ok", id });
  }

  const { insertFrame, insertOcrText, insertAccessibilityText } = await import(
    "./db/index.js"
  );
  const frameId = insertFrame({
    timestamp,
    appName: body.app_name ?? null,
    windowName: body.window_name ?? null,
    browserUrl: null,
    monitorId: 0,
    imagePath: "",
    focused: true,
  });

  if (body.type === "accessibility") {
    insertAccessibilityText(frameId, body.text);
  } else {
    insertOcrText(frameId, body.text);
  }

  return c.json({ status: "ok", frame_id: frameId });
});

export function startServer(): void {
  initDatabase();
  captureEngine.start();

  if (AUDIO_ENABLED) {
    void startAudioRecording().then(() => {
      captureEngine.state.audioRecording = true;
    });
  }

  serve({ fetch: app.fetch, hostname: API_HOST, port: API_PORT }, () => {
    console.log(`[server] superapp api http://${API_HOST}:${API_PORT}`);
  });
}

export { app };
