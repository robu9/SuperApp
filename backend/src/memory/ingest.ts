import { SUPERMEMORY_CONTAINER_TAG } from "../config.js";
import { getSupermemoryClient } from "./client.js";

function titleFromContent(content: string, max = 60): string {
  const line = content.split("\n").find((part) => part.trim().length > 0) ?? content;
  return line.trim().slice(0, max).toLowerCase();
}

async function addDocument(params: {
  content: string;
  customId: string;
  title?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
}): Promise<string | null> {
  try {
    const client = getSupermemoryClient();
    const response = await client.add({
      content: params.content,
      containerTag: SUPERMEMORY_CONTAINER_TAG,
      customId: params.customId,
      metadata: {
        title: params.title ?? titleFromContent(params.content),
        ...params.metadata,
      },
    });
    return response.id;
  } catch (err) {
    console.warn("[supermemory] ingest failed:", err);
    return null;
  }
}

export async function ingestScreenCapture(params: {
  frameId: number;
  text: string;
  appName: string | null;
  windowName: string | null;
  timestamp: string;
}): Promise<string | null> {
  const text = params.text.trim();
  if (!text) return null;

  const title = params.windowName ?? params.appName ?? titleFromContent(text);
  const header = [
    "[screen]",
    params.appName ? `[${params.appName}]` : null,
    params.windowName ? `"${params.windowName}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return addDocument({
    customId: `frame_${params.frameId}`,
    title,
    content: `${header}\n${text}`,
    metadata: {
      superapp_type: "screen_chunk",
      source_type: "frame",
      source_id: params.frameId,
      app_name: params.appName ?? "",
      window_name: params.windowName ?? "",
      salience: 0.55,
      created_at: params.timestamp,
    },
  });
}

export async function ingestAudioChunk(params: {
  audioId: number;
  transcription: string;
  meetingId?: number | null;
  timestamp: string;
}): Promise<string | null> {
  const text = params.transcription.trim();
  if (!text) return null;

  return addDocument({
    customId: `audio_${params.audioId}`,
    title: titleFromContent(text),
    content: `[audio]\n${text}`,
    metadata: {
      superapp_type: "audio_chunk",
      source_type: "audio",
      source_id: params.audioId,
      meeting_id: params.meetingId ?? 0,
      salience: 0.65,
      created_at: params.timestamp,
    },
  });
}

export async function ingestMeetingSummary(params: {
  meetingId: number;
  title: string;
  summary: string;
  actionItems: string[];
}): Promise<string | null> {
  const content = [
    `[meeting] ${params.title}`,
    params.summary,
    params.actionItems.length > 0
      ? `action items:\n${params.actionItems.map((item) => `- ${item}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return addDocument({
    customId: `meeting_${params.meetingId}`,
    title: params.title.toLowerCase(),
    content,
    metadata: {
      superapp_type: "meeting",
      source_type: "meeting",
      source_id: params.meetingId,
      salience: 0.9,
    },
  });
}

export async function ingestUserMemory(params: {
  title: string;
  content: string;
}): Promise<string | null> {
  return addDocument({
    customId: `user_${Date.now()}`,
    title: params.title.toLowerCase(),
    content: `[memory] ${params.title}\n${params.content}`,
    metadata: {
      superapp_type: "memory",
      source_type: "user",
      salience: 0.95,
      pinned: true,
    },
  });
}
