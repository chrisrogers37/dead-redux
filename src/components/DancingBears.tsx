const BEAR_COLORS = [
  "#D42A2A", // red
  "#D4A843", // gold
  "#1A3A6B", // blue
  "#2D8B46", // green
  "#D46A2A", // orange
];

function Bear({ color, delay }: { color: string; delay: number }) {
  return (
    <div
      className="inline-block mx-3 animate-bear-walk"
      style={{ animationDelay: `${delay}s` }}
    >
      <svg
        width="32"
        height="36"
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
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
      className="fixed bottom-4 left-0 w-full overflow-hidden pointer-events-none opacity-30"
      aria-hidden="true"
    >
      <div className="flex whitespace-nowrap">
        {BEAR_COLORS.map((color, i) => (
          <Bear key={i} color={color} delay={i * 2.4} />
        ))}
      </div>
    </div>
  );
}
