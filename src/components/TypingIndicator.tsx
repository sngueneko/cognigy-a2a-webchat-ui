import { BotIcon } from '@/components/icons/BotIcon';

interface Props {
  agentName?: string;
}

export function TypingIndicator({ agentName }: Props) {
  return (
    <div
      className="message-row agent"
      aria-live="polite"
      aria-label={`${agentName ?? 'Agent'} is typing`}
    >
      <div className="avatar agent-avatar">
        <BotIcon size={16} />
      </div>
      <div className="bubble bubble-agent">
        {agentName && <span className="bubble-author">{agentName}</span>}
        <div className="typing-indicator">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}
