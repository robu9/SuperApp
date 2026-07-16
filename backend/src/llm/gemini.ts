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
    "Your context comes from SuperMemory — a local graph of screen captures, audio, meetings, tasks, and pinned memories.",
    "Answer clearly and concisely. Use lowercase, friendly tone unless the user prefers otherwise.",
    "CRITICAL RULES:",
    "- SuperMemory history is provided in this conversation (not live video). You already have it.",
    "- NEVER say you can only answer if recording is enabled. NEVER offer to turn on recording when frames exist in the database or history snippets are provided.",
    "- NEVER say you don't have screen history when history snippets are in the conversation.",
    "- If the user asks about something not in the history, say what you DO see in the history instead.",
    "- If the user asks what they were watching or doing, answer from the history snippets directly.",
    "- Related memories may be linked in the graph (same app, meeting, or topic) — use those connections when helpful.",
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
    // Caller (server.ts /chat) already truncates and budgets snippets
    const historyBlock = contextSnippets
      .map((snippet, i) => `${i + 1}. ${snippet}`)
      .join("\n");

    contents.push({
      role: "user",
      parts: [
        {
          text: `Here is my recent captured screen and audio activity from SuperMemory:\n\n${historyBlock}\n\nRemember this for my questions.`,
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

export interface MeetingSummary {
  title: string;
  summary: string;
  action_items: string[];
}

/** Generate a title, summary, and action items for a meeting transcript. */
export async function summarizeMeeting(transcript: string): Promise<MeetingSummary> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to the project .env file.");
  }

  const prompt = [
    "You are summarizing a meeting from an automatic transcript (30-second chunks, no speaker labels, may contain transcription errors).",
    "Return ONLY a JSON object with exactly these keys:",
    '{"title": "short lowercase title (max 6 words)", "summary": "2-4 sentence summary", "action_items": ["specific action item", ...]}',
    "action_items may be an empty array if none were discussed.",
    "",
    "Transcript:",
    transcript.slice(0, 30_000),
  ].join("\n");

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini summarize failed (${res.status})`);
  }

  const raw =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(jsonText) as Partial<MeetingSummary>;
  return {
    title: typeof parsed.title === "string" ? parsed.title : "meeting",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    action_items: Array.isArray(parsed.action_items)
      ? parsed.action_items.filter((item): item is string => typeof item === "string")
      : [],
  };
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

async function generateJsonFromPrompt<T>(prompt: string): Promise<T> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to the project .env file.");
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
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini request failed (${res.status})`);
  }

  const raw =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(jsonText) as T;
}

export interface DailySummaryResult {
  title: string;
  summary: string;
  highlights: string[];
}

export async function generateDailySummary(params: {
  activity: string;
  context: string;
}): Promise<DailySummaryResult> {
  const prompt = [
    "You are summarizing the user's work day from local screen captures and audio transcriptions.",
    "Return ONLY JSON:",
    '{"title":"short lowercase title","summary":"3-5 sentence narrative","highlights":["notable moment", ...]}',
    "Use lowercase friendly tone. If there is little data, say so honestly.",
    "",
    "App activity:",
    params.activity.slice(0, 8000),
    "",
    "Captured context:",
    params.context.slice(0, 24_000),
  ].join("\n");

  const parsed = await generateJsonFromPrompt<Partial<DailySummaryResult>>(prompt);
  return {
    title: typeof parsed.title === "string" ? parsed.title : "daily summary",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export interface FocusReportResult {
  summary: string;
  top_apps: Array<{ app: string; assessment: string }>;
  suggestions: string[];
}

export async function generateFocusReport(params: {
  activity: string;
  context: string;
}): Promise<FocusReportResult> {
  const prompt = [
    "Analyze the user's recent app usage and screen activity for focus and productivity.",
    "Return ONLY JSON:",
    '{"summary":"2-3 sentences","top_apps":[{"app":"name","assessment":"brief note"}],"suggestions":["actionable focus suggestion", ...]}',
    "Suggest concrete focus blocks or habit changes. Be specific, not generic.",
    "",
    "App activity:",
    params.activity.slice(0, 8000),
    "",
    "Recent context:",
    params.context.slice(0, 16_000),
  ].join("\n");

  const parsed = await generateJsonFromPrompt<Partial<FocusReportResult>>(prompt);
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    top_apps: Array.isArray(parsed.top_apps)
      ? parsed.top_apps
          .filter(
            (item): item is { app: string; assessment: string } =>
              typeof item?.app === "string" && typeof item?.assessment === "string"
          )
          .slice(0, 8)
      : [],
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export interface ActionItemsResult {
  action_items: string[];
  summary: string;
}

export async function extractActionItems(context: string): Promise<ActionItemsResult> {
  const prompt = [
    "Extract concrete action items / todos from recent conversations and screen text.",
    "Return ONLY JSON:",
    '{"summary":"one sentence on what you found","action_items":["specific todo", ...]}',
    "Only include items that sound like real tasks the user should do. Empty array is fine.",
    "",
    "Recent context:",
    context.slice(0, 28_000),
  ].join("\n");

  const parsed = await generateJsonFromPrompt<Partial<ActionItemsResult>>(prompt);
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    action_items: Array.isArray(parsed.action_items)
      ? parsed.action_items.filter((item): item is string => typeof item === "string")
      : [],
  };
}
