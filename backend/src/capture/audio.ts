import { execFile, spawn, type ChildProcess } from "child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { AUDIO_CHUNK_SEC, AUDIO_DIR, AUDIO_ENABLED } from "../config.js";
import { insertAudioTranscription } from "../db/index.js";
import {
  closeMeeting,
  closeOrphanOpenMeetings,
  createMeeting,
} from "../db/meetings.js";
import { transcribeChunk as transcribeChunkAudio } from "./stt.js";
import type { AudioDeviceInfo } from "../types.js";

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

class AudioRecorder {
  private recording = false;
  private loopRunning = false;
  private currentProcess: ChildProcess | null = null;
  private inputDevice: string | null = null;
  private chunkIndex = 0;
  private currentMeetingId: number | null = null;

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    if (!AUDIO_ENABLED || this.recording) return;

    this.inputDevice = await resolveInputDevice();
    this.recording = true;
    this.chunkIndex = 0;
    closeOrphanOpenMeetings();
    this.currentMeetingId = createMeeting(new Date().toISOString());
    console.log(
      `[audio] recording started (device: ${this.inputDevice ?? "default"}, chunk ${AUDIO_CHUNK_SEC}s)`
    );

    if (!this.loopRunning) {
      this.loopRunning = true;
      void this.recordLoop();
    }
  }

  stop(): void {
    this.recording = false;
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }
    if (this.currentMeetingId !== null) {
      closeMeeting(this.currentMeetingId, new Date().toISOString());
      this.currentMeetingId = null;
    }
    console.log("[audio] recording stopped");
  }

  private async recordLoop(): Promise<void> {
    while (this.recording) {
      try {
        await this.recordOneChunk();
      } catch (err) {
        console.error("[audio] chunk error:", err);
        await sleep(2000);
      }
    }
    this.loopRunning = false;
  }

  private async recordOneChunk(): Promise<void> {
    if (!this.recording) return;

    const filename = `audio_${Date.now()}_c${this.chunkIndex++}.wav`;
    const filePath = path.join(AUDIO_DIR, filename);
    const args = buildRecordArgs(this.inputDevice, filePath, AUDIO_CHUNK_SEC);
    // Capture before recording: transcription may finish after stop()
    const meetingId = this.currentMeetingId;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
      this.currentProcess = proc;

      let stderr = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", reject);
      proc.on("close", (code) => {
        this.currentProcess = null;
        if (code !== 0 && code !== null) {
          console.warn(`[audio] ffmpeg exited ${code}: ${stderr.slice(-300)}`);
        }
        resolve();
      });
    });

    if (!this.recording || !fs.existsSync(filePath)) return;

    const stat = fs.statSync(filePath);
    if (stat.size < 1000) {
      fs.unlinkSync(filePath);
      return;
    }

    void this.transcribeChunk(filePath, filename, meetingId);
  }

  private async transcribeChunk(
    filePath: string,
    filename: string,
    meetingId: number | null
  ): Promise<void> {
    try {
      const text = await transcribeChunkAudio(filePath);
      const cleaned = text.trim();
      // Gemini sometimes answers "No speech detected." instead of an empty
      // string; also skip punctuation-only results.
      if (
        !cleaned ||
        /^no speech( was)? detected\.?$/i.test(cleaned) ||
        !/[\p{L}\p{N}]/u.test(cleaned)
      ) {
        console.log(`[audio] chunk ${filename}: no speech detected`);
        return;
      }

      insertAudioTranscription({
        timestamp: new Date().toISOString(),
        transcription: cleaned,
        filePath,
        deviceName: this.inputDevice ?? "default",
        durationSecs: AUDIO_CHUNK_SEC,
        meetingId,
      });

      console.log(`[audio] transcribed chunk ${filename} (${text.length} chars)`);
    } catch (err) {
      console.error(`[audio] transcription failed for ${filename}:`, err);
    }
  }
}

const audioRecorder = new AudioRecorder();

export function isAudioRecording(): boolean {
  return audioRecorder.isRecording();
}

export async function startAudioRecording(): Promise<void> {
  await audioRecorder.start();
}

export function stopAudioRecording(): void {
  audioRecorder.stop();
}

export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!AUDIO_ENABLED) return [];

  if (process.platform === "win32") {
    try {
      const devices = await listDshowAudioDevices();
      if (devices.length > 0) {
        return devices.map((name, i) => ({
          name,
          device_type: i % 2 === 0 ? "input" : "output",
          is_default: i === 0,
        })) as AudioDeviceInfo[];
      }
    } catch {
      /* fall through */
    }

    try {
      const ps = `
Get-CimInstance Win32_SoundDevice | Select-Object Name, Status | ConvertTo-Json -Compress
`.trim();
      const { stdout } = await execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        ps,
      ]);
      const parsed = JSON.parse(stdout.trim());
      const devices = Array.isArray(parsed) ? parsed : [parsed];
      return devices.map((d: { Name: string }, i: number) => ({
        name: d.Name || `audio device ${i + 1}`,
        device_type: i % 2 === 0 ? "input" : "output",
        is_default: i === 0,
      })) as AudioDeviceInfo[];
    } catch {
      return [
        { name: "default microphone", device_type: "input", is_default: true },
        { name: "default speakers", device_type: "output", is_default: true },
      ];
    }
  }

  return [
    { name: "default microphone", device_type: "input", is_default: true },
    { name: "default speakers", device_type: "output", is_default: true },
  ];
}

async function listDshowAudioDevices(): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, ["-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", () => {
      const devices: string[] = [];
      const lines = output.split("\n");
      let inAudio = false;
      for (const line of lines) {
        if (line.includes("DirectShow audio devices")) inAudio = true;
        else if (line.includes("DirectShow video devices")) inAudio = false;
        else if (inAudio) {
          const match = line.match(/"([^"]+)"/);
          if (match) devices.push(match[1]);
        }
      }
      resolve(devices);
    });
    proc.on("error", () => resolve([]));
  });
}

async function resolveInputDevice(): Promise<string | null> {
  if (process.platform === "win32") {
    const devices = await listDshowAudioDevices();
    const mic = devices.find(
      (d) =>
        /microphone|mic|input|array|headset/i.test(d) &&
        !/speaker|output|loopback/i.test(d)
    );
    return mic ?? devices[0] ?? null;
  }
  if (process.platform === "darwin") return ":0";
  return "default";
}

function buildRecordArgs(
  device: string | null,
  outputPath: string,
  durationSec: number
): string[] {
  const common = ["-t", String(durationSec), "-ac", "1", "-ar", "16000", "-y", outputPath];

  if (process.platform === "win32") {
    const input = device ? `audio=${device}` : "audio=Microphone";
    return ["-f", "dshow", "-i", input, ...common];
  }
  if (process.platform === "darwin") {
    return ["-f", "avfoundation", "-i", device ?? ":0", ...common];
  }
  return ["-f", "pulse", "-i", device ?? "default", ...common];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
