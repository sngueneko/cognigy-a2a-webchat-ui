import ReactMarkdown from 'react-markdown';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { ChatMessage, TextPart } from '@/types/a2a';
import { BotIcon } from '@/components/icons/BotIcon';
import { UserIcon } from '@/components/icons/UserIcon';

interface Props {
  message: ChatMessage;
  onTypingDone?: () => void;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
// Custom components so images and links open safely and look right in the bubble.

const mdComponents = {
  // Images — render inline, constrained width, with alt text fallback
  img({ src, alt }: { src?: string; alt?: string }) {
    if (!src) return null;
    return (
      <img
        src={src}
        alt={alt ?? ''}
        className="md-image"
        loading="lazy"
        onError={(e) => {
          // If image fails to load show the alt text or URL instead
          const target = e.currentTarget;
          target.style.display = 'none';
          const fallback = document.createElement('span');
          fallback.className = 'md-image-fallback';
          fallback.textContent = alt ?? src;
          target.parentNode?.insertBefore(fallback, target.nextSibling);
        }}
      />
    );
  },
  // Links — open in new tab, never navigate away from the chat
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">
        {children}
      </a>
    );
  },
  // Paragraphs — no extra margin, let the bubble spacing handle it
  p({ children }: { children?: React.ReactNode }) {
    return <span className="md-paragraph">{children}</span>;
  },
  // List items — keep the bullet style minimal
  li({ children }: { children?: React.ReactNode }) {
    return <li className="md-list-item">{children}</li>;
  },
};

// ─── Text content with optional typewriter + markdown ─────────────────────────

function TextContent({
  text,
  animate,
  onDone,
}: {
  text: string;
  animate: boolean;
  onDone?: () => void;
}) {
  const displayed = useTypewriter({ text, speed: 10, enabled: animate, onDone });
  const content = animate ? displayed : text;
  const isTyping = animate && displayed.length < text.length;

  return (
    <span className="message-text">
      <ReactMarkdown components={mdComponents as never}>
        {content}
      </ReactMarkdown>
      {isTyping && <span className="cursor-blink" aria-hidden="true" />}
    </span>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({ message, onTypingDone }: Props) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';
  const isSending = message.status === 'sending';

  const fullText =
    message.displayText ??
    message.parts
      .filter((p): p is TextPart => p.kind === 'text')
      .map((p) => p.text)
      .join('\n');

  return (
    <div className={`message-row ${isUser ? 'user' : 'agent'}`}>
      {!isUser && (
        <div className="avatar agent-avatar" aria-hidden="true">
          <BotIcon size={16} />
        </div>
      )}

      <div
        className={[
          'bubble',
          isUser ? 'bubble-user' : 'bubble-agent',
          isError ? 'bubble-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {!isUser && message.agentName && (
          <span className="bubble-author">{message.agentName}</span>
        )}

        <div className="bubble-content">
          {isSending && !fullText ? (
            <span className="streaming-dots">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <TextContent
              text={fullText}
              animate={isStreaming && !isUser}
              onDone={onTypingDone}
            />
          )}
        </div>

        <time className="bubble-time" dateTime={message.timestamp.toISOString()}>
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>

      {isUser && (
        <div className="avatar user-avatar" aria-hidden="true">
          <UserIcon size={16} />
        </div>
      )}
    </div>
  );
}
