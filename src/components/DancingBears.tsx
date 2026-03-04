const BEAR_COLORS = [
  "#FF2D55", // hot pink
  "#FF6EC7", // neon pink
  "#A855F7", // purple
  "#5856D6", // indigo
  "#00FFFF", // cyan
  "#39FF14", // neon green
  "#FFD700", // gold
  "#FF6EC7", // pink again
  "#FF2D55", // hot pink again
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
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
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
      </svg>
    </div>
  );
}

export function DancingBears() {
  return (
    <div
      className="fixed bottom-4 left-0 w-full overflow-hidden pointer-events-none opacity-70"
      aria-hidden="true"
    >
      <div className="flex whitespace-nowrap">
        {BEAR_COLORS.map((color, i) => (
          <Bear key={i} color={color} delay={i * 1.3} size={44} />
        ))}
      </div>
    </div>
  );
}
