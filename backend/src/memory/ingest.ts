import {
  createMemoryNode,
  findNodeBySource,
  getLatestChunkNode,
  initSupermemory,
  linkNodes,
  updateMemoryNode,
  upsertAppNode,
} from "./graph.js";

function titleFromContent(content: string, max = 60): string {
  const line = content.split("\n").find((part) => part.trim().length > 0) ?? content;
  return line.trim().slice(0, max).toLowerCase();
}

export function ingestScreenCapture(params: {
  frameId: number;
  text: string;
  appName: string | null;
  windowName: string | null;
  timestamp: string;
}): number | null {
  const text = params.text.trim();
  if (!text) return null;

  initSupermemory();

  const nodeId = createMemoryNode({
    type: "screen_chunk",
    title: params.windowName ?? params.appName ?? titleFromContent(text),
    content: text,
    sourceType: "frame",
    sourceId: params.frameId,
    appName: params.appName,
    windowName: params.windowName,
    salience: 0.55,
    createdAt: params.timestamp,
    metadata: { frame_id: params.frameId },
  });

  if (params.appName) {
    const appId = upsertAppNode(params.appName);
    linkNodes(nodeId, appId, "captured_in", 1);
  }

  const previous = getLatestChunkNode("screen_chunk", params.appName);
  if (previous && previous.id !== nodeId) {
    linkNodes(previous.id, nodeId, "follows", 0.9);
  }

  return nodeId;
}

export function ingestAudioChunk(params: {
  audioId: number;
  transcription: string;
  meetingId?: number | null;
  timestamp: string;
}): number | null {
  const text = params.transcription.trim();
  if (!text) return null;

  initSupermemory();

  const nodeId = createMemoryNode({
    type: "audio_chunk",
    title: titleFromContent(text),
    content: text,
    sourceType: "audio",
    sourceId: params.audioId,
    salience: 0.65,
    createdAt: params.timestamp,
    metadata: {
      audio_id: params.audioId,
      meeting_id: params.meetingId ?? null,
    },
  });

  if (params.meetingId) {
    const meetingNode = findNodeBySource("meeting", params.meetingId);
    if (meetingNode) {
      linkNodes(nodeId, meetingNode.id, "spoken_in", 1);
    } else {
      const meetingNodeId = createMemoryNode({
        type: "meeting",
        title: `meeting #${params.meetingId}`,
        content: `audio meeting session ${params.meetingId}`,
        sourceType: "meeting",
        sourceId: params.meetingId,
        salience: 0.7,
      });
      linkNodes(nodeId, meetingNodeId, "spoken_in", 1);
    }
  }

  const previous = getLatestChunkNode("audio_chunk");
  if (previous && previous.id !== nodeId) {
    linkNodes(previous.id, nodeId, "follows", 0.85);
  }

  return nodeId;
}

export function ingestMeetingSummary(params: {
  meetingId: number;
  title: string;
  summary: string;
  actionItems: string[];
}): number {
  initSupermemory();

  const content = [
    params.summary,
    params.actionItems.length > 0
      ? `action items:\n${params.actionItems.map((item) => `- ${item}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const existing = findNodeBySource("meeting", params.meetingId);
  const meetingNodeId =
    existing?.id ??
    createMemoryNode({
      type: "meeting",
      title: params.title,
      content,
      sourceType: "meeting",
      sourceId: params.meetingId,
      salience: 0.85,
    });

  if (existing) {
    updateMemoryNode(meetingNodeId, {
      title: params.title,
      content,
      salience: 0.9,
    });
  }

  for (const item of params.actionItems) {
    const taskId = createMemoryNode({
      type: "task",
      title: item.slice(0, 80).toLowerCase(),
      content: item,
      salience: 0.8,
      metadata: { meeting_id: params.meetingId },
    });
    linkNodes(meetingNodeId, taskId, "contains", 1);
  }

  return meetingNodeId;
}

export function ingestUserMemory(params: {
  title: string;
  content: string;
  relatedNodeIds?: number[];
}): number {
  initSupermemory();

  const nodeId = createMemoryNode({
    type: "memory",
    title: params.title.toLowerCase(),
    content: params.content,
    sourceType: "user",
    sourceId: null,
    salience: 0.95,
    metadata: { pinned: true },
  });

  for (const relatedId of params.relatedNodeIds ?? []) {
    linkNodes(nodeId, relatedId, "related_to", 1);
  }

  return nodeId;
}
