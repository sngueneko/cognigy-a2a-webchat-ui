import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  fetchAgentCards,
  agentIdFromCard,
  sendMessage,
  streamMessage,
  partsToText,
} from '@/lib/a2aClient';
import type {
  AgentCard,
  AgentOption,
  ChatMessage,
  Conversation,
  Part,
} from '@/types/a2a';

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'a2a-conversations';

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed.map((c) => ({
      ...(c as unknown as Conversation),
      createdAt: new Date(c['createdAt'] as string),
      updatedAt: new Date(c['updatedAt'] as string),
      messages: (c['messages'] as Array<Record<string, unknown>>).map((m) => ({
        ...(m as unknown as ChatMessage),
        // Restore status: messages in-flight when browser closed become 'done'
        status: (m['status'] === 'sending' || m['status'] === 'streaming'
          ? 'done'
          : m['status']) as ChatMessage['status'],
        timestamp: new Date(m['timestamp'] as string),
      })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch { /* quota exceeded */ }
}

function truncate(text: string, max = 42): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const cancelStreamRef = useRef<(() => void) | null>(null);
  // Keep a ref to agents so callbacks closed over stale state can still look up agents
  const agentsRef = useRef<AgentOption[]>([]);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // ── Load agents ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setAgentsLoading(true);
    fetchAgentCards()
      .then((cards: AgentCard[]) => {
        const options = cards.map((card) => ({ id: agentIdFromCard(card), card }));
        agentsRef.current = options;
        setAgents(options);
        if (options.length > 0) setSelectedAgent(options[0] ?? null);
        setAgentsError(null);
      })
      .catch((err: unknown) => {
        setAgentsError(err instanceof Error ? err.message : 'Failed to load agents');
      })
      .finally(() => setAgentsLoading(false));
  }, []);

  // ── Open existing conversation ────────────────────────────────────────────────
  const openConversation = useCallback((convId: string) => {
    cancelStreamRef.current?.();
    setActiveConvId(convId);
    setInput('');
    setIsLoading(false);

    // Switch selected agent to match the conversation's agent
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === convId);
      if (conv) {
        const agent = agentsRef.current.find((a) => a.id === conv.agentId);
        if (agent) setSelectedAgent(agent);
      }
      return prev; // no mutation
    });
  }, []);

  const newConversation = useCallback(() => {
    cancelStreamRef.current?.();
    setActiveConvId(null);
    setInput('');
    setIsLoading(false);
  }, []);

  const deleteConversation = useCallback((convId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    setActiveConvId((cur) => (cur === convId ? null : cur));
  }, []);

  // ── Select agent (from picker) ────────────────────────────────────────────────
  const selectAgent = useCallback((agent: AgentOption) => {
    cancelStreamRef.current?.();
    setSelectedAgent(agent);
    setActiveConvId(null); // start fresh for new agent selection
    setInput('');
    setIsLoading(false);
  }, []);

  // ── Message updaters ──────────────────────────────────────────────────────────

  const updateMessage = useCallback(
    (convId: string, msgId: string, updater: (m: ChatMessage) => ChatMessage) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== convId
            ? c
            : { ...c, messages: c.messages.map((m) => (m.id === msgId ? updater(m) : m)) },
        ),
      );
    },
    [],
  );

  const appendParts = useCallback((convId: string, msgId: string, newParts: Part[]) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const messages = c.messages.map((m) => {
          if (m.id !== msgId) return m;
          const merged = [...m.parts, ...newParts];
          const fullText = merged
            .filter((p) => p.kind === 'text')
            .map((p) => (p.kind === 'text' ? p.text : ''))
            .join('\n');
          return { ...m, parts: merged, displayText: fullText, status: 'streaming' as const };
        });
        return { ...c, messages, updatedAt: new Date() };
      }),
    );
  }, []);

  const markDone = useCallback(
    (convId: string, msgId: string) => {
      updateMessage(convId, msgId, (m) => ({ ...m, status: 'done' }));
    },
    [updateMessage],
  );

  // ── Send ──────────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedAgent || isLoading) return;

    setInput('');
    setIsLoading(true);

    const agentId = selectedAgent.id;
    const agentName = selectedAgent.card.name;
    const supportsStreaming = selectedAgent.card.capabilities?.streaming ?? false;

    // Stable local convId for closures — may be renamed by adoptContextId
    let localConvId = activeConvId;
    let isNewConv = false;

    if (!localConvId) {
      localConvId = uuidv4();
      isNewConv = true;
    }

    const contextId = localConvId;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      parts: [{ kind: 'text', text }],
      status: 'done',
      timestamp: new Date(),
    };

    const agentMsgId = uuidv4();
    const agentMsg: ChatMessage = {
      id: agentMsgId,
      role: 'agent',
      parts: [],
      displayText: '',
      status: 'sending',
      agentName,
      timestamp: new Date(),
    };

    const now = new Date();

    if (isNewConv) {
      const newConv: Conversation = {
        id: localConvId,
        agentId,
        title: truncate(text),
        messages: [userMsg, agentMsg],
        createdAt: now,
        updatedAt: now,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(localConvId);
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== localConvId
            ? c
            : { ...c, messages: [...c.messages, userMsg, agentMsg], updatedAt: now },
        ),
      );
    }

    // ── Adopt gateway's canonical contextId ──────────────────────────────────
    // When the gateway returns a contextId different from what we sent, we rename
    // the conversation so future sends use the correct contextId.
    // We also track the "current" id in a ref so onDone/onError can find the conv
    // even after it's been renamed.
    const currentConvIdRef = { value: localConvId };

    const adoptContextId = (gatewayContextId: string | null) => {
      if (!gatewayContextId || gatewayContextId === currentConvIdRef.value) return;
      const oldId = currentConvIdRef.value;
      currentConvIdRef.value = gatewayContextId;
      setConversations((prev) =>
        prev.map((c) => (c.id === oldId ? { ...c, id: gatewayContextId } : c)),
      );
      setActiveConvId(gatewayContextId);
    };

    // ── Helper used in onDone to finalise the agent message ─────────────────
    const finaliseAgentMsg = (gatewayContextId: string | null) => {
      adoptContextId(gatewayContextId);
      // The conv may now have the gateway id — match either
      setConversations((prev) =>
        prev.map((c) => {
          if (
            c.id !== currentConvIdRef.value &&
            c.id !== localConvId
          ) return c;
          const messages = c.messages.map((m) => {
            if (m.id !== agentMsgId) return m;
            // Keep streaming if there's text to animate; else mark done immediately
            return m.displayText ? m : { ...m, status: 'done' as const };
          });
          return { ...c, messages };
        }),
      );
    };

    if (supportsStreaming) {
      const cancel = streamMessage(agentId, text, contextId, {
        onWorking: () => {
          updateMessage(currentConvIdRef.value, agentMsgId, (m) => ({
            ...m, status: 'sending',
          }));
        },
        onPart: (parts) => {
          appendParts(currentConvIdRef.value, agentMsgId, parts);
        },
        onDone: (gatewayContextId) => {
          finaliseAgentMsg(gatewayContextId);
          setIsLoading(false);
          cancelStreamRef.current = null;
        },
        onError: (err) => {
          updateMessage(currentConvIdRef.value, agentMsgId, (m) => ({
            ...m,
            parts: [{ kind: 'text', text: `Error: ${err.message}` }],
            displayText: `Error: ${err.message}`,
            status: 'error',
          }));
          setIsLoading(false);
          cancelStreamRef.current = null;
        },
      });
      cancelStreamRef.current = cancel;
    } else {
      try {
        const result = await sendMessage(agentId, text, contextId);
        adoptContextId(result.contextId);
        const fullText = partsToText(result.parts);
        updateMessage(currentConvIdRef.value, agentMsgId, (m) => ({
          ...m,
          parts: result.parts,
          displayText: fullText,
          status: 'streaming',
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        updateMessage(currentConvIdRef.value, agentMsgId, (m) => ({
          ...m,
          parts: [{ kind: 'text', text: `Error: ${msg}` }],
          displayText: `Error: ${msg}`,
          status: 'error',
        }));
      } finally {
        setIsLoading(false);
      }
    }
  }, [input, selectedAgent, isLoading, activeConvId, updateMessage, appendParts]);

  return {
    agents,
    agentsLoading,
    agentsError,
    selectedAgent,
    selectAgent,
    conversations,
    activeConv,
    activeConvId,
    openConversation,
    newConversation,
    deleteConversation,
    input,
    setInput,
    isLoading,
    send,
    markDone,
  };
}
