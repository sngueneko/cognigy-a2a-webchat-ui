export function ChevronIcon({
  size = 16,
  direction = 'down',
}: {
  size?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}) {
  const rotate = { up: 180, down: 0, left: 90, right: -90 }[direction];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.15s' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
