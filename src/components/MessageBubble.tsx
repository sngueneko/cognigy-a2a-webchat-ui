import { useTypewriter } from '@/hooks/useTypewriter';
import type { ChatMessage, TextPart } from '@/types/a2a';
import { BotIcon } from '@/components/icons/BotIcon';
import { UserIcon } from '@/components/icons/UserIcon';

interface Props {
  message: ChatMessage;
  onTypingDone?: () => void;
}

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

  return (
    <span className="message-text">
      {displayed}
      {animate && displayed.length < text.length && (
        <span className="cursor-blink" aria-hidden="true" />
      )}
    </span>
  );
}

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
