export function PastelRainbow({
  className = "",
  size = "large",
}: {
  className?: string;
  size?: "large" | "small";
}) {
  const isLarge = size === "large";
  const w = isLarge ? 600 : 200;
  const h = isLarge ? 320 : 110;

  const bands = [
    { color: "#E8889B", offset: 0 },   // soft red
    { color: "#F0C8A8", offset: 1 },   // peach
    { color: "#F0E0A8", offset: 2 },   // butter
    { color: "#A8D4A0", offset: 3 },   // mint green
    { color: "#A8D0F0", offset: 4 },   // sky blue
    { color: "#C8B8E0", offset: 5 },   // lavender
    { color: "#E8A0B8", offset: 6 },   // pink
  ];

  const baseRadius = isLarge ? 240 : 80;
  const bandWidth = isLarge ? 12 : 4;
  const gap = isLarge ? 4 : 1.5;

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {bands.map((band, i) => {
          const r = baseRadius - i * (bandWidth + gap);
          const cx = w / 2;
          const cy = h;
          return (
            <path
              key={i}
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              stroke={band.color}
              strokeWidth={bandWidth}
              strokeLinecap="round"
              opacity={isLarge ? 0.5 : 0.6}
            />
          );
        })}
      </svg>
    </div>
  );
}
