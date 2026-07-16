import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { DATA_DIR, WHISPER_MODEL } from "../config.js";

const execFileAsync = promisify(execFile);

const WHISPER_VERSION = "1.7.6";
const TARBALL_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz`;
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin`;

const WHISPER_DIR = path.join(DATA_DIR, "whisper");
const BIN_PATH = path.join(WHISPER_DIR, "whisper-cli");
const MODEL_PATH = path.join(WHISPER_DIR, `ggml-${WHISPER_MODEL}.bin`);

type WhisperState = "unknown" | "building" | "ready" | "unavailable";
let state: WhisperState = "unknown";
let setupPromise: Promise<void> | null = null;

export function whisperStatus(): WhisperState {
  if (state === "unknown" && fs.existsSync(BIN_PATH) && fs.existsSync(MODEL_PATH)) {
    state = "ready";
  }
  return state;
}

export function isWhisperReady(): boolean {
  return whisperStatus() === "ready";
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}): ${url}`);
  }
  const tmp = `${dest}.download`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
}

async function buildWhisper(): Promise<void> {
  fs.mkdirSync(WHISPER_DIR, { recursive: true });

  // cmake is required to build whisper.cpp
  await execFileAsync("cmake", ["--version"]).catch(() => {
    throw new Error("cmake not found — install it (e.g. `brew install cmake`) to enable local whisper");
  });

  if (!fs.existsSync(MODEL_PATH)) {
    console.log(`[whisper] downloading model ggml-${WHISPER_MODEL}.bin ...`);
    await downloadFile(MODEL_URL, MODEL_PATH);
    console.log(`[whisper] model saved to ${MODEL_PATH}`);
  }

  if (!fs.existsSync(BIN_PATH)) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-build-"));
    const tarPath = path.join(workDir, "whisper.tar.gz");
    console.log(`[whisper] downloading whisper.cpp v${WHISPER_VERSION} source ...`);
    await downloadFile(TARBALL_URL, tarPath);
    await execFileAsync("tar", ["-xzf", tarPath, "-C", workDir]);
    const srcDir = path.join(workDir, `whisper.cpp-${WHISPER_VERSION}`);

    console.log("[whisper] building whisper-cli (one-time, takes a few minutes) ...");
    await execFileAsync(
      "cmake",
      ["-S", srcDir, "-B", path.join(srcDir, "build"), "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"],
      { timeout: 300_000 }
    );
    await execFileAsync(
      "cmake",
      ["--build", path.join(srcDir, "build"), "--config", "Release", "-j", "4", "--target", "whisper-cli"],
      { timeout: 900_000 }
    );

    fs.copyFileSync(path.join(srcDir, "build", "bin", "whisper-cli"), BIN_PATH);
    fs.chmodSync(BIN_PATH, 0o755);
    fs.rmSync(workDir, { recursive: true, force: true });
    console.log(`[whisper] built ${BIN_PATH}`);
  }
}

/** Kick off (or join) the one-time whisper.cpp setup. Never rejects. */
export function ensureWhisperSetup(): Promise<void> {
  if (whisperStatus() === "ready" || state === "unavailable") {
    return Promise.resolve();
  }
  if (!setupPromise) {
    state = "building";
    setupPromise = buildWhisper()
      .then(() => {
        state = "ready";
      })
      .catch((err) => {
        state = "unavailable";
        console.error(
          "[whisper] setup failed, falling back to cloud transcription:",
          err instanceof Error ? err.message : err
        );
      });
  }
  return setupPromise;
}

/** Strip whisper annotations like [BLANK_AUDIO], [Music], (coughs). */
function cleanWhisperText(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runWhisper(wavPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    BIN_PATH,
    [
      "-m", MODEL_PATH,
      "-f", wavPath,
      "--no-timestamps",
      "--no-prints",
      "--language", "auto",
      "--threads", "4",
    ],
    { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }
  );
  return cleanWhisperText(stdout);
}
