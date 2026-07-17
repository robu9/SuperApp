import type { WebSocket as ClientWebSocket } from "ws";
import { buildChatContext } from "../chat/context.js";
import {
  GeminiLiveSession,
  getLiveModelInfo,
} from "../llm/gemini-live.js";
import type { ChatTurn } from "../llm/gemini.js";

type ClientMessage =
  | {
      type: "start";
      messages?: ChatTurn[];
      context_query?: string;
    }
  | { type: "audio"; data: string }
  | { type: "audio_end" }
  | { type: "stop" };

function send(ws: ClientWebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Handles one browser ↔ SuperApp Live voice session.
 * Reuses the same context + prompt builders as POST /chat.
 */
export function attachLiveChatSocket(client: ClientWebSocket): void {
  let live: GeminiLiveSession | null = null;
  let starting = false;

  const cleanup = () => {
    live?.close();
    live = null;
  };

  client.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(client, { type: "error", message: "invalid json message" });
      return;
    }

    try {
      if (msg.type === "start") {
        if (starting || live) {
          send(client, {
            type: "error",
            message: "live session already active",
          });
          return;
        }
        starting = true;

        const messages = Array.isArray(msg.messages) ? msg.messages : [];
        const lastUser = [...messages]
          .reverse()
          .find((m) => m.role === "user")?.content;
        const searchQuery = msg.context_query ?? lastUser ?? "recent activity";

        const context = await buildChatContext(searchQuery);
        const info = getLiveModelInfo();

        live = new GeminiLiveSession({
          onReady: () => {
            send(client, {
              type: "ready",
              model: info.model,
              voice: info.voice,
              provider: "gemini",
            });
          },
          onAudio: (data) => send(client, { type: "audio", data }),
          onUserTranscript: (text, finished) =>
            send(client, { type: "user_transcript", text, finished }),
          onAssistantTranscript: (text, finished) =>
            send(client, { type: "assistant_transcript", text, finished }),
          onTurnComplete: ({ user, assistant }) =>
            send(client, { type: "turn_complete", user, assistant }),
          onInterrupted: () => send(client, { type: "interrupted" }),
          onError: (message) => send(client, { type: "error", message }),
          onClose: () => {
            live = null;
            send(client, { type: "closed" });
          },
        });

        await live.connect({
          messages,
          contextSnippets: context.snippets,
          recording: context.recording,
        });
        starting = false;
        return;
      }

      if (msg.type === "audio") {
        live?.sendAudio(msg.data);
        return;
      }

      if (msg.type === "audio_end") {
        live?.sendAudioStreamEnd();
        return;
      }

      if (msg.type === "stop") {
        cleanup();
        send(client, { type: "closed" });
        return;
      }
    } catch (err) {
      starting = false;
      cleanup();
      send(client, {
        type: "error",
        message: err instanceof Error ? err.message : "live session failed",
      });
    }
  });

  client.on("close", cleanup);
  client.on("error", cleanup);
}
