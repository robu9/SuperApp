import { WebSocket } from "ws";
import {
  GEMINI_API_KEY,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_VOICE,
} from "../config.js";
import {
  buildSystemInstruction,
  toGeminiContents,
  type ChatTurn,
  type RecordingStatus,
} from "./gemini.js";

const LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export interface LiveSessionEvents {
  onReady?: () => void;
  onAudio?: (base64Pcm: string) => void;
  onUserTranscript?: (text: string, finished: boolean) => void;
  onAssistantTranscript?: (text: string, finished: boolean) => void;
  onTurnComplete?: (payload: { user: string; assistant: string }) => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

interface GeminiLiveServerMessage {
  setupComplete?: Record<string, unknown>;
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    input_transcription?: { text?: string; finished?: boolean };
    output_transcription?: { text?: string; finished?: boolean };
  };
  error?: { message?: string; code?: number };
}

/**
 * Proxies a Gemini Live (native audio) WebSocket session.
 * Uses the same system instruction + history contents as text chat.
 */
export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private closed = false;
  private setupDone = false;
  private userTranscript = "";
  private assistantTranscript = "";
  private pendingHistory: ChatTurn[] = [];
  private pendingSnippets: string[] = [];

  constructor(private readonly events: LiveSessionEvents = {}) {}

  async connect(params: {
    messages: ChatTurn[];
    contextSnippets: string[];
    recording: RecordingStatus;
  }): Promise<void> {
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to the project .env file."
      );
    }

    this.pendingHistory = params.messages.filter((m) => m.content.trim());
    this.pendingSnippets = params.contextSnippets;
    this.userTranscript = "";
    this.assistantTranscript = "";

    const systemInstruction = buildSystemInstruction(
      params.contextSnippets,
      params.recording,
      false,
      { voice: true }
    );

    const url = `${LIVE_WS_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        if (!this.closed) this.events.onError?.(err.message);
        reject(err);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      ws.on("open", () => {
        const setup = {
          setup: {
            model: `models/${GEMINI_LIVE_MODEL}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: GEMINI_LIVE_VOICE },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        };
        ws.send(JSON.stringify(setup));
      });

      ws.on("message", (raw) => {
        try {
          const wasSetup = this.setupDone;
          this.handleMessage(raw.toString());
          if (!wasSetup && this.setupDone) succeed();
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.on("error", (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      ws.on("close", () => {
        this.ws = null;
        if (!this.setupDone) {
          fail(new Error("Gemini Live connection closed before setup completed"));
          return;
        }
        this.events.onClose?.();
      });
    });
  }

  sendAudio(base64Pcm: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !base64Pcm) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64Pcm,
            mimeType: "audio/pcm;rate=16000",
          },
        },
      })
    );
  }

  /** Signal that the mic stream paused (e.g. user muted). */
  sendAudioStreamEnd(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  close(): void {
    this.closed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
  }

  private handleMessage(raw: string): void {
    let msg: GeminiLiveServerMessage;
    try {
      msg = JSON.parse(raw) as GeminiLiveServerMessage;
    } catch {
      return;
    }

    if (msg.error?.message) {
      this.events.onError?.(msg.error.message);
      return;
    }

    if (msg.setupComplete && !this.setupDone) {
      this.setupDone = true;
      this.seedHistory();
      this.events.onReady?.();
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.assistantTranscript = "";
      this.events.onInterrupted?.();
      return;
    }

    const inputTx =
      content.inputTranscription ?? content.input_transcription;
    if (inputTx?.text) {
      this.userTranscript += inputTx.text;
      this.events.onUserTranscript?.(
        this.userTranscript,
        Boolean(inputTx.finished)
      );
    }

    const outputTx =
      content.outputTranscription ?? content.output_transcription;
    if (outputTx?.text) {
      this.assistantTranscript += outputTx.text;
      this.events.onAssistantTranscript?.(
        this.assistantTranscript,
        Boolean(outputTx.finished)
      );
    }

    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      const data =
        inline && "data" in inline
          ? (inline as { data?: string }).data
          : undefined;
      if (data) {
        this.events.onAudio?.(data);
      }
      if (part.text) {
        this.assistantTranscript += part.text;
        this.events.onAssistantTranscript?.(this.assistantTranscript, false);
      }
    }

    if (content.turnComplete) {
      const user = this.userTranscript.trim();
      const assistant = this.assistantTranscript.trim();
      this.events.onTurnComplete?.({ user, assistant });
      this.userTranscript = "";
      this.assistantTranscript = "";
    }
  }

  /** Inject SuperMemory context + prior chat turns (same shape as text chat). */
  private seedHistory(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const contents = toGeminiContents(
      this.pendingHistory,
      this.pendingSnippets
    );
    if (contents.length === 0) return;

    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: contents,
          turnComplete: false,
        },
      })
    );
  }
}

export function getLiveModelInfo(): { model: string; voice: string } {
  return { model: GEMINI_LIVE_MODEL, voice: GEMINI_LIVE_VOICE };
}
