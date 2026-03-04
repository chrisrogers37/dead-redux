const BEAR_COLORS = [
  "#E8889B", // soft rose
  "#F0C8A8", // peach
  "#F0E0A8", // butter yellow
  "#A8D4A0", // mint green
  "#A8D0F0", // sky blue
  "#C8B8E0", // lavender
  "#E8A0B8", // pink
  "#B8E0C8", // seafoam
  "#D4A056", // warm gold
];

function Bear({ color, delay, size = 40 }: { color: string; delay: number; size?: number }) {
  return (
    <div
      className="inline-block mx-4 animate-bear-walk"
      style={{ animationDelay: `${delay}s` }}
    >
      <svg
        width={size}
        height={size * 1.125}
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.08))` }}
      >
        {/* Head */}
        <circle cx="16" cy="6" r="5" fill={color} />
        {/* Ears */}
        <circle cx="12" cy="2" r="2.5" fill={color} />
        <circle cx="20" cy="2" r="2.5" fill={color} />
        {/* Body */}
        <ellipse cx="16" cy="18" rx="7" ry="9" fill={color} />
        {/* Arms — raised in dance pose */}
        <ellipse cx="7" cy="14" rx="2.5" ry="5" fill={color} transform="rotate(-30 7 14)" />
        <ellipse cx="25" cy="14" rx="2.5" ry="5" fill={color} transform="rotate(30 25 14)" />
        {/* Legs — mid-step */}
        <ellipse cx="12" cy="29" rx="2.5" ry="5" fill={color} transform="rotate(-10 12 29)" />
        <ellipse cx="20" cy="30" rx="2.5" ry="5" fill={color} transform="rotate(10 20 30)" />
        {/* Eyes */}
        <circle cx="14" cy="5.5" r="0.8" fill="white" opacity="0.8" />
        <circle cx="18" cy="5.5" r="0.8" fill="white" opacity="0.8" />
      </svg>
    </div>
  );
}

export function DancingBears() {
  return (
    <div
      className="fixed bottom-4 left-0 w-full overflow-hidden pointer-events-none opacity-80"
      aria-hidden="true"
    >
      <div className="flex whitespace-nowrap">
        {BEAR_COLORS.map((color, i) => (
          <Bear key={i} color={color} delay={i * 1.5} size={44} />
        ))}
      </div>
    </div>
  );
}
