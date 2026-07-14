import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  messages: ChatMessage[];
  updatedAt: number;
  draft?: boolean;
}

interface ChatState {
  sessions: Record<string, ChatSession>;
  currentId: string | null;
  isStreaming: boolean;
  actions: {
    setCurrent: (id: string) => void;
    createSession: () => string;
    addMessage: (sessionId: string, message: Omit<ChatMessage, "id" | "timestamp">) => void;
    setStreaming: (streaming: boolean) => void;
    updateSessionTitle: (id: string, title: string) => void;
  };
}

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "hello. i'm your ai assistant.\n\ni can help you with tasks, answer questions, and collaborate on ideas.\n\nwhat would you like to work on?",
  timestamp: Date.now(),
};

function createDefaultSession(): ChatSession {
  const id = crypto.randomUUID();
  return {
    id,
    title: "untitled",
    preview: welcomeMessage.content.slice(0, 60),
    messages: [welcomeMessage],
    updatedAt: Date.now(),
    draft: true,
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},
      currentId: null,
      isStreaming: false,
      actions: {
        setCurrent: (id) => set({ currentId: id }),
        createSession: () => {
          const session = createDefaultSession();
          set((state) => ({
            sessions: { ...state.sessions, [session.id]: session },
            currentId: session.id,
          }));
          return session.id;
        },
        addMessage: (sessionId, message) => {
          const msg: ChatMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          };
          set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;
            const updated: ChatSession = {
              ...session,
              draft: false,
              messages: [...session.messages, msg],
              preview: msg.content.slice(0, 60),
              updatedAt: Date.now(),
              title:
                session.title === "untitled" && message.role === "user"
                  ? message.content.slice(0, 40).toLowerCase()
                  : session.title,
            };
            return {
              sessions: { ...state.sessions, [sessionId]: updated },
            };
          });
        },
        setStreaming: (streaming) => set({ isStreaming: streaming }),
        updateSessionTitle: (id, title) =>
          set((state) => ({
            sessions: {
              ...state.sessions,
              [id]: { ...state.sessions[id], title },
            },
          })),
      },
    }),
    {
      name: "superapp-chat",
      partialize: (state) => ({
        sessions: state.sessions,
        currentId: state.currentId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.currentId) {
          const id = state.actions.createSession();
          state.actions.setCurrent(id);
        }
      },
    }
  )
);

export async function simulateAssistantReply(
  sessionId: string,
  userMessage: string
): Promise<void> {
  const { actions } = useChatStore.getState();
  actions.setStreaming(true);

  await new Promise((r) => setTimeout(r, 800));

  const responses = [
    `i found context related to "${userMessage.slice(0, 40)}..." from your recent screen activity.`,
    "here's a summary based on your captured timeline and meeting notes.",
    "would you like me to dig deeper into a specific time range?",
  ];

  actions.addMessage(sessionId, {
    role: "assistant",
    content: responses.join("\n\n"),
  });
  actions.setStreaming(false);
}
