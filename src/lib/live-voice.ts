import { getApiBaseUrl } from "@/lib/api/client";

export type LiveServerEvent =
  | { type: "ready"; model: string; voice: string; provider: string }
  | { type: "audio"; data: string }
  | { type: "user_transcript"; text: string; finished: boolean }
  | { type: "assistant_transcript"; text: string; finished: boolean }
  | { type: "turn_complete"; user: string; assistant: string }
  | { type: "interrupted" }
  | { type: "error"; message: string }
  | { type: "closed" };

export interface LiveVoiceHandlers {
  onReady?: () => void;
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  onTurnComplete?: (user: string, assistant: string) => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
  onClosed?: () => void;
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Downsample Float32 audio from sourceRate → 16 kHz. */
function downsampleTo16k(
  input: Float32Array,
  sourceRate: number
): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return result;
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

/**
 * Browser-side Gemini Live voice session.
 * Mic → PCM16@16kHz → backend WS → Gemini Live; plays 24kHz PCM replies.
 * Turn transcripts are written into the same chat store as typed messages.
 */
export class LiveVoiceSession {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextPlayTime = 0;
  private closed = false;

  constructor(private readonly handlers: LiveVoiceHandlers = {}) {}

  get active(): boolean {
    return !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }

  async start(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    contextQuery?: string;
  }): Promise<void> {
    if (this.ws) throw new Error("live session already started");

    const base = await getApiBaseUrl();
    const wsUrl = base.replace(/^http/, "ws") + "/chat/live";

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "start",
            messages: params.messages,
            context_query: params.contextQuery,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg: LiveServerEvent;
        try {
          msg = JSON.parse(String(event.data)) as LiveServerEvent;
        } catch {
          return;
        }

        if (msg.type === "ready") {
          if (!settled) {
            settled = true;
            void this.startMic()
              .then(() => {
                this.handlers.onReady?.();
                resolve();
              })
              .catch(fail);
          }
          return;
        }

        this.handleServerEvent(msg);
      };

      ws.onerror = () => fail(new Error("live voice websocket failed"));
      ws.onclose = () => {
        if (!settled) {
          fail(new Error("live voice closed before ready"));
          return;
        }
        void this.teardownMedia();
        this.handlers.onClosed?.();
      };
    });
  }

  stop(): void {
    this.closed = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "audio_end" }));
        this.ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        // ignore
      }
      this.ws.close();
    }
    this.ws = null;
    void this.teardownMedia();
  }

  private handleServerEvent(msg: LiveServerEvent): void {
    switch (msg.type) {
      case "audio":
        this.enqueuePlayback(msg.data);
        break;
      case "user_transcript":
        this.handlers.onUserTranscript?.(msg.text);
        break;
      case "assistant_transcript":
        this.handlers.onAssistantTranscript?.(msg.text);
        break;
      case "turn_complete":
        this.handlers.onTurnComplete?.(msg.user, msg.assistant);
        break;
      case "interrupted":
        this.nextPlayTime = this.playbackCtx?.currentTime ?? 0;
        this.handlers.onInterrupted?.();
        break;
      case "error":
        this.handlers.onError?.(msg.message);
        break;
      case "closed":
        void this.teardownMedia();
        this.handlers.onClosed?.();
        break;
      default:
        break;
    }
  }

  private async startMic(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.captureCtx = new AudioContext();
    const source = this.captureCtx.createMediaStreamSource(this.mediaStream);
    // ScriptProcessor is deprecated but widely available; fine for desktop app mic streaming.
    this.processor = this.captureCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, this.captureCtx!.sampleRate);
      const pcm = floatTo16BitPCM(down);
      const data = int16ToBase64(pcm);
      this.ws.send(JSON.stringify({ type: "audio", data }));
    };

    source.connect(this.processor);
    // Keep the graph alive without playing mic into speakers.
    const mute = this.captureCtx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.captureCtx.destination);

    this.playbackCtx = new AudioContext({ sampleRate: 24000 });
    this.nextPlayTime = 0;
  }

  private enqueuePlayback(base64Pcm: string): void {
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = 0;
    }
    const ctx = this.playbackCtx;
    const samples = base64ToInt16(base64Pcm);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = (samples[i] ?? 0) / 0x8000;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  private async teardownMedia(): Promise<void> {
    try {
      this.processor?.disconnect();
    } catch {
      // ignore
    }
    this.processor = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    if (this.captureCtx && this.captureCtx.state !== "closed") {
      await this.captureCtx.close().catch(() => undefined);
    }
    this.captureCtx = null;

    if (this.playbackCtx && this.playbackCtx.state !== "closed") {
      await this.playbackCtx.close().catch(() => undefined);
    }
    this.playbackCtx = null;
    this.nextPlayTime = 0;
  }
}
