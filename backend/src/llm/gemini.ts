import fs from "fs";
import { GEMINI_API_KEY, GEMINI_MODEL } from "../config.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RecordingStatus {
  screenRecording: boolean;
  framesCaptured: number;
  audioRecording: boolean;
  audioChunks: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

function buildSystemInstruction(
  contextSnippets: string[],
  recording: RecordingStatus
): string {
  const statusLines = [
    `Screen recording: ${recording.screenRecording ? "active" : "paused/off"} (${recording.framesCaptured} frames captured)`,
    `Audio recording: ${recording.audioRecording ? "active" : "off"} (${recording.audioChunks} transcriptions stored)`,
  ].join("\n");

  const contextBlock =
    contextSnippets.length > 0
      ? `\n\nRecent screen & audio history from the user's machine:\n${contextSnippets
          .slice(0, 12)
          .map((snippet, i) => `${i + 1}. ${snippet.slice(0, 600)}`)
          .join("\n")}`
      : recording.framesCaptured > 0
        ? "\n\nScreen frames exist in the database but no readable text was extracted from recent captures."
        : "\n\nNo screen history is available yet — the capture engine may have just started.";

  return [
    "You are SuperApp, a helpful AI assistant inside a desktop app that records the user's screen and audio locally.",
    "Answer clearly and concisely. Use lowercase, friendly tone unless the user prefers otherwise.",
    "When screen-history context is provided below, use it to give specific, grounded answers about what the user was doing.",
    "IMPORTANT: Trust the recording status below. If screen recording is active and frames exist, do NOT tell the user recording is disabled.",
    `Current recording status:\n${statusLines}`,
    contextBlock,
  ].join("");
}

function toGeminiContents(messages: ChatTurn[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

export async function generateGeminiReply(
  messages: ChatTurn[],
  contextSnippets: string[] = [],
  recording: RecordingStatus = {
    screenRecording: false,
    framesCaptured: 0,
    audioRecording: false,
    audioChunks: 0,
  }
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to the project .env file.");
  }

  const conversation = messages.filter((m) => m.content.trim().length > 0);
  if (conversation.length === 0) {
    throw new Error("No messages to send to the model.");
  }

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(contextSnippets, recording) }],
        },
        contents: toGeminiContents(conversation),
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok) {
    const message =
      data.error?.message ?? `Gemini API request failed (${res.status})`;
    throw new Error(message);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

/** Transcribe a local audio file via Gemini multimodal API. */
export async function transcribeAudio(filePath: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const audioBytes = fs.readFileSync(filePath);
  if (audioBytes.length < 1000) {
    return "";
  }

  const base64 = audioBytes.toString("base64");
  const ext = filePath.toLowerCase().endsWith(".mp3") ? "audio/mp3" : "audio/wav";

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Transcribe this audio verbatim. If there is no speech, return an empty string. Return only the transcription, no commentary.",
              },
              {
                inline_data: {
                  mime_type: ext,
                  data: base64,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    const message =
      data.error?.message ?? `Gemini transcription failed (${res.status})`;
    throw new Error(message);
  }

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}
