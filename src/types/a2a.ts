// ─── A2A Protocol Types ───────────────────────────────────────────────────────

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface DataPart {
  kind: 'data';
  data: { type: string; payload: unknown };
}

export type Part = TextPart | DataPart;

export interface A2AMessage {
  kind: 'message';
  messageId: string;
  role: 'user' | 'agent';
  contextId: string;
  parts: Part[];
}

export interface TaskStatusUpdateEvent {
  kind: 'status-update';
  taskId: string;
  contextId: string;
  status: { state: 'submitted' | 'working' | 'completed' | 'canceled' | 'failed'; timestamp?: string };
  final: boolean;
}

export interface TaskArtifactUpdateEvent {
  kind: 'artifact-update';
  taskId: string;
  contextId: string;
  artifact: { artifactId: string; parts: Part[]; lastChunk?: boolean };
}

export type StreamEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent | A2AMessage;

// ─── JSON-RPC ─────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string;
  params: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: AgentSkill[];
}

// ─── UI types ─────────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'streaming' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  parts: Part[];
  status: MessageStatus;
  displayText?: string;
  agentName?: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;           // === contextId (stable, may be updated from gateway response)
  agentId: string;
  title: string;        // first user message, truncated
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentOption {
  id: string;
  card: AgentCard;
}
