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
export const VIDEO_DIR = path.join(DATA_DIR, "video");
export const TMP_DIR = path.join(DATA_DIR, "tmp");

/** Frames per MP4 chunk before rotating to a new file */
export const VIDEO_CHUNK_MAX_FRAMES = Number(
  process.env.SUPERAPP_VIDEO_CHUNK_FRAMES ?? 150
);

/**
 * Stored video is downscaled to this width (never upscaled). OCR runs on the
 * full-resolution capture before encoding, so search quality is unaffected.
 */
export const VIDEO_MAX_WIDTH = Number(
  process.env.SUPERAPP_VIDEO_MAX_WIDTH ?? 1920
);

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
export const AUTO_START_CAPTURE = process.env.SUPERAPP_AUTO_START !== "0";

/** Audio chunk length in seconds before transcription */
export const AUDIO_CHUNK_SEC = Number(
  process.env.SUPERAPP_AUDIO_CHUNK_SEC ?? 30
);

export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
/** Native-audio model for live voice (BidiGenerateContent). */
export const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? "gemini-2.5-flash-native-audio-latest";
export const GEMINI_LIVE_VOICE =
  process.env.GEMINI_LIVE_VOICE ?? "Puck";

/** Official Supermemory local server — see https://supermemory.ai/docs/self-hosting/overview */
export const SUPERMEMORY_BASE_URL =
  process.env.SUPERMEMORY_BASE_URL ??
  process.env.SUPERMEMORY_LOCAL_URL ??
  "http://127.0.0.1:6767";

/** Bearer token printed on first `supermemory-server` boot */
export const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY ?? "";

/** Scopes all SuperApp memories to one container */
export const SUPERMEMORY_CONTAINER_TAG =
  process.env.SUPERMEMORY_CONTAINER_TAG ?? "superapp";
