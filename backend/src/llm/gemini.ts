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
  const hasHistory = contextSnippets.length > 0;
  const statusLines = [
    `Screen recording: ${recording.screenRecording ? "active" : "paused/off"} (${recording.framesCaptured} frames in database)`,
    `Audio recording: ${recording.audioRecording ? "active" : "off"} (${recording.audioChunks} transcriptions stored)`,
    `Captured history snippets attached: ${contextSnippets.length}`,
  ].join("\n");

  return [
    "You are SuperApp, a helpful AI assistant inside a desktop app that records the user's screen and audio locally.",
    "Answer clearly and concisely. Use lowercase, friendly tone unless the user prefers otherwise.",
    "CRITICAL RULES:",
    "- The user's captured screen/audio history is provided in this conversation (not live video). You already have it.",
    "- NEVER say you can only answer if recording is enabled. NEVER offer to turn on recording when frames exist in the database or history snippets are provided.",
    "- NEVER say you don't have screen history when history snippets are in the conversation.",
    "- If the user asks about something not in the history, say what you DO see in the history instead.",
    "- If the user asks what they were watching or doing, answer from the history snippets directly.",
    `Current capture status:\n${statusLines}`,
    hasHistory
      ? "History snippets are in the messages below — use them."
      : recording.framesCaptured > 0
        ? "Frames exist but no readable text was extracted from recent captures."
        : "No captures yet — the engine may have just started.",
  ].join("\n");
}

function toGeminiContents(messages: ChatTurn[], contextSnippets: string[] = []) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  if (contextSnippets.length > 0) {
    const historyBlock = contextSnippets
      .slice(0, 12)
      .map((snippet, i) => `${i + 1}. ${snippet.slice(0, 800)}`)
      .join("\n");

    contents.push({
      role: "user",
      parts: [
        {
          text: `Here is my recent captured screen and audio activity from SuperApp:\n\n${historyBlock}\n\nRemember this for my questions.`,
        },
      ],
    });
    contents.push({
      role: "model",
      parts: [
        {
          text: "got it — i have your recent screen and audio history and i'll use it to answer your questions.",
        },
      ],
    });
  }

  for (const message of messages) {
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  return contents;
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
        contents: toGeminiContents(conversation, contextSnippets),
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
