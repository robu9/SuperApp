import { GEMINI_API_KEY, STT_ENGINE } from "../config.js";
import { transcribeAudio } from "../llm/gemini.js";
import {
  ensureWhisperSetup,
  isWhisperReady,
  runWhisper,
  whisperStatus,
} from "./whisper.js";

export function sttStatus(): string {
  if (STT_ENGINE === "gemini") return "gemini";
  const ws = whisperStatus();
  if (ws === "ready") return "whisper (local)";
  if (STT_ENGINE === "whisper") return `whisper (${ws})`;
  return `gemini (whisper ${ws})`;
}

export async function transcribeChunk(filePath: string): Promise<string> {
  if (STT_ENGINE !== "gemini") {
    if (isWhisperReady()) {
      try {
        return await runWhisper(filePath);
      } catch (err) {
        console.error("[stt] whisper failed:", err instanceof Error ? err.message : err);
        if (STT_ENGINE === "whisper") return "";
      }
    } else {
      void ensureWhisperSetup();
      if (STT_ENGINE === "whisper") {
        console.log("[stt] whisper not ready yet, skipping chunk");
        return "";
      }
    }
  }

  if (!GEMINI_API_KEY) return "";
  return transcribeAudio(filePath);
}
