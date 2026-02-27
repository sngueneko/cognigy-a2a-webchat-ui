import {
  useEffect, useRef, useCallback, useState, type KeyboardEvent, type ChangeEvent,
} from 'react';
import { useChat } from '@/hooks/useChat';
import { MessageBubble } from '@/components/MessageBubble';
import { TypingIndicator } from '@/components/TypingIndicator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SendIcon } from '@/components/icons/SendIcon';
import { BotIcon } from '@/components/icons/BotIcon';
import { PlusIcon } from '@/components/icons/PlusIcon';
import { TrashIcon } from '@/components/icons/TrashIcon';
import { ChevronIcon } from '@/components/icons/ChevronIcon';
import type { AgentOption, Conversation } from '@/types/a2a';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    const s = localStorage.getItem('a2a-theme') as Theme | null;
    if (s === 'dark' || s === 'light') return s;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ─── Agent picker popover (Claude-style, above the input) ─────────────────────

function AgentPicker({
  agents,
  selected,
  onSelect,
}: {
  agents: AgentOption[];
  selected: AgentOption | null;
  onSelect: (a: AgentOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="agent-picker" ref={ref}>
      <button
        className="agent-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        type="button"
      >
        <BotIcon size={14} />
        <span className="agent-picker-name">
          {selected ? selected.card.name : 'Select agent'}
        </span>
        <ChevronIcon size={12} direction={open ? 'up' : 'down'} />
      </button>

      {open && (
        <div className="agent-picker-popover" role="listbox">
          <p className="agent-picker-label">Switch agent</p>
          {agents.map((a) => (
            <button
              key={a.id}
              className={`agent-picker-item ${selected?.id === a.id ? 'active' : ''}`}
              role="option"
              aria-selected={selected?.id === a.id}
              onClick={() => { onSelect(a); setOpen(false); }}
              type="button"
            >
              <span className="agent-picker-item-dot" />
              <span className="agent-picker-item-name">{a.card.name}</span>
              {a.card.capabilities.streaming && (
                <span className="agent-picker-item-badge">streaming</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Conversation history item ─────────────────────────────────────────────────

function ConvItem({
  conv,
  active,
  onOpen,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lastMsg = conv.messages[conv.messages.length - 1];
  const textPart = lastMsg?.parts.find((p) => p.kind === 'text');
  const preview = lastMsg?.role === 'agent'
    ? (lastMsg.displayText ?? (textPart?.kind === 'text' ? textPart.text : '') ?? '')
    : (textPart?.kind === 'text' ? textPart.text : '') ?? '';

  return (
    <div
      className={`conv-item ${active ? 'active' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button className="conv-item-body" onClick={onOpen} type="button">
        <span className="conv-item-title">{conv.title}</span>
        <span className="conv-item-preview">{preview.slice(0, 60)}</span>
      </button>
      {(hover || active) && (
        <button
          className="conv-item-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete conversation"
          type="button"
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const {
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
  } = useChat();

  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('a2a-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => t === 'dark' ? 'light' : 'dark'), []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  const handleInput = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [setInput]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }, [send]);

  const handleSend = useCallback(() => {
    void send();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [send]);

  const messages = activeConv?.messages ?? [];
  const isEmpty = messages.length === 0;

  // Group conversations by agent for display
  const convsByAgent = agents.map((a) => ({
    agent: a,
    convs: conversations.filter((c) => c.agentId === a.id),
  })).filter((g) => g.convs.length > 0);

  return (
    <div className="app">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <BotIcon size={18} />
            <span>A2A Chat</span>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="icon-btn"
              onClick={newConversation}
              title="New conversation"
              type="button"
            >
              <PlusIcon size={15} />
            </button>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        <div className="sidebar-body">
          {/* ── New conversation shortcut ── */}
          <button className="new-conv-btn" onClick={newConversation} type="button">
            <PlusIcon size={14} />
            <span>New conversation</span>
          </button>

          {/* ── History ── */}
          {agentsLoading && (
            <div className="skeleton-list">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton-item" />)}
            </div>
          )}

          {agentsError && (
            <p className="sidebar-error">{agentsError}</p>
          )}

          {!agentsLoading && conversations.length === 0 && (
            <p className="sidebar-empty">No conversations yet</p>
          )}

          {convsByAgent.map(({ agent, convs }) => (
            <div key={agent.id} className="conv-group">
              <p className="conv-group-label">{agent.card.name}</p>
              {convs.map((c) => (
                <ConvItem
                  key={c.id}
                  conv={c}
                  active={c.id === activeConvId}
                  onOpen={() => openConversation(c.id)}
                  onDelete={() => deleteConversation(c.id)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-footer-text">
            A2A {selectedAgent?.card.protocolVersion ?? '0.3.0'}
          </span>
        </div>
      </aside>

      {/* ── Chat ─────────────────────────────────────────────────────────── */}
      <main className="chat-main">
        {/* Chat header showing current context */}
        <div className="chat-header">
          <span className="chat-header-title">
            {activeConv ? activeConv.title : selectedAgent ? `Chat with ${selectedAgent.card.name}` : 'A2A Gateway'}
          </span>
          {activeConvId && (
            <span className="chat-header-context" title="Context ID">
              ctx: {activeConvId.slice(0, 8)}…
            </span>
          )}
        </div>

        <div className="messages-container">
          {isEmpty && !agentsLoading && (
            <div className="empty-state">
              <div className="empty-icon">
                <BotIcon size={36} />
              </div>
              <h2 className="empty-title">
                {selectedAgent ? `${selectedAgent.card.name}` : 'Select an agent below'}
              </h2>
              <p className="empty-subtitle">
                {selectedAgent
                  ? selectedAgent.card.description
                  : 'Use the agent picker in the input to choose who to talk to.'}
              </p>
              {selectedAgent && selectedAgent.card.skills.length > 0 && (
                <div className="empty-suggestions">
                  {selectedAgent.card.skills
                    .flatMap((s) => s.tags.slice(0, 2))
                    .slice(0, 4)
                    .map((tag) => (
                      <button
                        key={tag}
                        className="suggestion-pill"
                        type="button"
                        onClick={() => { setInput(tag); textareaRef.current?.focus(); }}
                      >
                        {tag}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onTypingDone={() => activeConvId && markDone(activeConvId, msg.id)}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <TypingIndicator agentName={selectedAgent?.card.name} />
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ─────────────────────────────────────────────────── */}
        <div className="input-area">
          <div className="input-shell">
            {/* Agent picker sits above the textarea inside the shell */}
            <div className="input-top-bar">
              <AgentPicker
                agents={agents}
                selected={selectedAgent}
                onSelect={selectAgent}
              />
            </div>

            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="input-field"
                placeholder={
                  selectedAgent
                    ? `Message ${selectedAgent.card.name}…`
                    : 'Pick an agent above, then type…'
                }
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={!selectedAgent || isLoading}
                rows={1}
              />
              <button
                className="send-button"
                onClick={handleSend}
                disabled={!input.trim() || !selectedAgent || isLoading}
                aria-label="Send message"
                type="button"
              >
                <SendIcon size={16} />
              </button>
            </div>
          </div>

          <p className="input-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline
          </p>
        </div>
      </main>
    </div>
  );
}
