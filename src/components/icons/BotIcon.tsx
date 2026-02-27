export function BotIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M12 2v4" />
      <circle cx="12" cy="6" r="2" />
      <path d="M8 15h.01M16 15h.01" />
      <path d="M9 19h6" />
    </svg>
  );
}
