import os from "os";
import path from "path";
import { loadRootEnv } from "./load-env.js";

loadRootEnv();

export const API_PORT = Number(process.env.SUPERAPP_PORT ?? 3030);
export const API_HOST = process.env.SUPERAPP_HOST ?? "127.0.0.1";

export const DATA_DIR =
  process.env.SUPERAPP_DATA_DIR ??
  path.join(os.homedir(), ".superapp");

export const DB_PATH = path.join(DATA_DIR, "db.sqlite");
export const FRAMES_DIR = path.join(DATA_DIR, "frames");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

/** Capture interval in ms — event-driven lite via frame dedup */
export const CAPTURE_INTERVAL_MS = Number(
  process.env.SUPERAPP_CAPTURE_INTERVAL ?? 2000
);

export const OCR_ENABLED = process.env.SUPERAPP_OCR !== "0";

/** OCR engine override: "native" (platform default), "tesseract", or "off" */
export const OCR_ENGINE = (process.env.SUPERAPP_OCR_ENGINE ?? "native") as
  | "native"
  | "tesseract"
  | "off";
export const AUDIO_ENABLED = process.env.SUPERAPP_AUDIO !== "0";

/** Audio chunk length in seconds before transcription */
export const AUDIO_CHUNK_SEC = Number(
  process.env.SUPERAPP_AUDIO_CHUNK_SEC ?? 30
);

export const STT_ENGINE = (process.env.SUPERAPP_STT_ENGINE ?? "auto") as
  | "auto"
  | "whisper"
  | "gemini";

export const WHISPER_MODEL = process.env.SUPERAPP_WHISPER_MODEL ?? "base";

export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
