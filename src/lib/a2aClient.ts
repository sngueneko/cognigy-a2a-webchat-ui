/// <reference types="vite/client" />

import { v4 as uuidv4 } from 'uuid';
import type {
  A2AMessage,
  AgentCard,
  JsonRpcRequest,
  JsonRpcResponse,
  Part,
  TextPart,
} from '@/types/a2a';

// ─── Gateway URL ──────────────────────────────────────────────────────────────

const _runtimeEnv =
  ((window as unknown as { __ENV__?: Record<string, string> }).__ENV__) ?? {};

const GATEWAY_BASE = (
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ||
  _runtimeEnv['VITE_GATEWAY_URL'] ||
  '/api'
).replace(/\/$/, '');

function agentUrl(agentId: string): string {
  return `${GATEWAY_BASE}/agents/${agentId}/`;
}

function buildRequest(method: string, params: unknown): JsonRpcRequest {
  return { jsonrpc: '2.0', method, id: uuidv4(), params };
}

function buildMessageParams(text: string, contextId: string) {
  return {
    message: {
      kind: 'message',
      messageId: uuidv4(),
      role: 'user',
      contextId,
      parts: [{ kind: 'text', text }],
    },
  };
}

// ─── Agent discovery ──────────────────────────────────────────────────────────

export async function fetchAgentCards(): Promise<AgentCard[]> {
  const res = await fetch(`${GATEWAY_BASE}/.well-known/agents.json`);
  if (!res.ok) throw new Error(`Failed to fetch agents: HTTP ${res.status}`);
  return res.json() as Promise<AgentCard[]>;
}

// ─── message/send (REST) ─────────────────────────────────────────────────────

export interface SendResult {
  parts: Part[];
  /** contextId returned by gateway — use this for subsequent messages */
  contextId: string | null;
}

export async function sendMessage(
  agentId: string,
  text: string,
  contextId: string,
): Promise<SendResult> {
  const body = buildRequest('message/send', buildMessageParams(text, contextId));
  const res = await fetch(agentUrl(agentId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as JsonRpcResponse<A2AMessage>;
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error('Empty result');

  return {
    parts: json.result.parts ?? [],
    contextId: json.result.contextId ?? null,
  };
}

// ─── message/stream (SOCKET / SSE) ───────────────────────────────────────────

export type StreamCallbacks = {
  onWorking: () => void;
  onPart: (parts: Part[]) => void;
  /** Called when stream ends. contextId = first contextId seen from gateway */
  onDone: (contextId: string | null) => void;
  onError: (err: Error) => void;
};

export function streamMessage(
  agentId: string,
  text: string,
  contextId: string,
  callbacks: StreamCallbacks,
): () => void {
  const body = buildRequest('message/stream', buildMessageParams(text, contextId));
  let aborted = false;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(agentUrl(agentId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Track the first contextId we see from the gateway
      let firstContextId: string | null = null;

      const processBuffer = () => {
        const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const events = normalized.split('\n\n');
        buffer = events.pop() ?? '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const dataLines: string[] = [];
          for (const line of eventBlock.split('\n')) {
            if (line.startsWith('data: ')) dataLines.push(line.slice(6));
          }

          const raw = dataLines.join('\n').trim();
          if (!raw || raw === '[DONE]') continue;

          let parsed: unknown;
          try { parsed = JSON.parse(raw); }
          catch { console.warn('[a2aClient] SSE parse error:', raw); continue; }

          if (aborted) return;

          // Capture contextId — unwrap JSON-RPC envelope first
          if (parsed && typeof parsed === 'object') {
            const env = parsed as Record<string, unknown>;
            const inner: Record<string, unknown> =
              env['jsonrpc'] === '2.0' && env['result'] && typeof env['result'] === 'object'
                ? (env['result'] as Record<string, unknown>)
                : env;
            const cid = inner['contextId'] as string | undefined;
            if (cid && !firstContextId) firstContextId = cid;
          }

          dispatchSseEvent(parsed, callbacks, firstContextId);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (aborted) break;
        if (done) {
          if (buffer.trim()) { buffer += '\n\n'; processBuffer(); }
          if (!aborted) callbacks.onDone(firstContextId);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
    } catch (err) {
      if (aborted) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => { aborted = true; controller.abort(); };
}

function dispatchSseEvent(
  raw: unknown,
  cb: StreamCallbacks,
  _firstContextId: string | null,
): void {
  if (!raw || typeof raw !== 'object') return;

  // The gateway wraps every SSE payload in a JSON-RPC envelope:
  //   { jsonrpc: '2.0', id: '...', result: { kind: '...', ... } }
  // Unwrap it so we always work with the plain A2A event object.
  const envelope = raw as Record<string, unknown>;
  const event: Record<string, unknown> =
    envelope['jsonrpc'] === '2.0' && envelope['result'] && typeof envelope['result'] === 'object'
      ? (envelope['result'] as Record<string, unknown>)
      : envelope;

  const kind = event['kind'];

  console.debug('[a2aClient] SSE:', kind, event);

  if (kind === 'status-update') {
    const status = event['status'] as Record<string, unknown> | undefined;
    const state = status?.['state'] as string | undefined;
    if (state === 'working') {
      // Check for message parts embedded in the status-update.
      // The gateway sends content as:
      //   { kind:'status-update', status: { state:'working', message: { parts: [...] } } }
      const message = status?.['message'] as Record<string, unknown> | undefined;
      const parts = message?.['parts'] as Part[] | undefined;
      if (parts?.length) {
        cb.onPart(parts);
      } else {
        cb.onWorking();
      }
    }
    // completed/failed/canceled: onDone is called at stream end
    return;
  }

  if (kind === 'artifact-update') {
    const artifact = event['artifact'] as Record<string, unknown> | undefined;
    const parts = artifact?.['parts'] as Part[] | undefined;
    if (parts?.length) cb.onPart(parts);
    return;
  }

  if (kind === 'message') {
    const parts = event['parts'] as Part[] | undefined;
    if (parts?.length) cb.onPart(parts);
    // onDone called at stream end
    return;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function partsToText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.kind === 'text')
    .map((p) => p.text)
    .join('\n');
}

export function agentIdFromCard(card: AgentCard): string {
  const match = card.url.match(/\/agents\/([^/]+)\//);
  return match?.[1] ?? card.name.toLowerCase().replace(/\s+/g, '-');
}
