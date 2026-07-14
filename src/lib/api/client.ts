import { electron } from "../electron";

const FALLBACK_API = "http://127.0.0.1:3030";

export interface SearchResultItem {
  type: "OCR" | "Audio" | "UI" | "Accessibility";
  content: {
    frame_id?: number;
    audio_chunk_id?: number;
    timestamp: string;
    text: string;
    app_name?: string | null;
    window_name?: string | null;
  };
}

export interface SearchResponse {
  data: SearchResultItem[];
  pagination: { limit: number; offset: number; total: number };
}

export interface HealthResponse {
  status: string;
  last_frame_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  frames_captured: number;
  audio_chunks: number;
  uptime_seconds: number;
}

export interface FrameRow {
  id: number;
  timestamp: string;
  app_name: string | null;
  window_name: string | null;
  browser_url: string | null;
  monitor_id: number;
  image_path: string;
  focused: number;
}

export interface FramesResponse {
  data: FrameRow[];
  pagination: { limit: number; offset: number; total: number };
}

export interface MonitorInfo {
  id: number | string;
  name: string;
  width: number;
  height: number;
  active: boolean;
}

export interface AudioDeviceInfo {
  name: string;
  device_type: "input" | "output";
  is_default: boolean;
}

export interface EngineStatus {
  running: boolean;
  paused: boolean;
  audioRecording: boolean;
  framesCaptured: number;
  startedAt: number | null;
  lastError: string | null;
}

export interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context_query?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
}

async function getBaseUrl(): Promise<string> {
  if (electron?.getApiUrl) {
    return electron.getApiUrl();
  }
  return FALLBACK_API;
}

export async function getApiBaseUrl(): Promise<string> {
  return getBaseUrl();
}

export async function frameImageUrl(id: number): Promise<string> {
  const base = await getBaseUrl();
  return `${base}/frames/${id}/image`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  if (electron?.apiRequest) {
    return electron.apiRequest(method, path, body) as Promise<T>;
  }

  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API ${method} ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("GET", "/health"),
  search: (params: {
    q?: string;
    limit?: number;
    offset?: number;
    content_type?: string;
  }) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    if (params.content_type) query.set("content_type", params.content_type);
    const qs = query.toString();
    return request<SearchResponse>("GET", `/search${qs ? `?${qs}` : ""}`);
  },
  frames: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request<FramesResponse>("GET", `/frames${qs ? `?${qs}` : ""}`);
  },
  frameImage: (id: number) =>
    request<FrameRow & { image_base64?: string }>(
      "GET",
      `/frames/${id}?include_image=true`
    ),
  frameText: (id: number) =>
    request<{ text: string; app_name: string | null; window_name: string | null }>(
      "GET",
      `/frames/${id}/text`
    ),
  visionList: () =>
    request<{ data: MonitorInfo[] }>("GET", "/vision/list"),
  audioList: () =>
    request<{ data: AudioDeviceInfo[] }>("GET", "/audio/list"),
  engineStatus: () => request<EngineStatus>("GET", "/engine/status"),
  engineStart: () => request<{ running: boolean }>("POST", "/engine/start"),
  engineStop: () => request<{ running: boolean }>("POST", "/engine/stop"),
  enginePause: () => request<{ paused: boolean }>("POST", "/engine/pause"),
  engineResume: () => request<{ paused: boolean }>("POST", "/engine/resume"),
  audioStart: () => request<{ recording: boolean }>("POST", "/audio/start"),
  audioStop: () => request<{ recording: boolean }>("POST", "/audio/stop"),
  chat: (body: ChatRequest) => request<ChatResponse>("POST", "/chat", body),
};

/** Load a frame screenshot for display — base64 via API first (Electron-safe), then binary URL. */
export async function loadFrameImageSrc(id: number): Promise<string> {
  try {
    const data = await api.frameImage(id);
    if (data.image_base64) {
      return `data:image/jpeg;base64,${data.image_base64}`;
    }
  } catch {
    // fall through to direct fetch
  }

  const base = await getBaseUrl();
  const res = await fetch(`${base}/frames/${id}/image`);
  if (!res.ok) {
    throw new Error(`frame image unavailable (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
