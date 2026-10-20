const DRAWING = (
  <>
    <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="100" cy="100" r="96" />
      <path d="M100 4 L118 92 L82 108 L100 196" />
      <path d="M100 28 C130 28 156 56 156 96 L153 114 L144 128 L140 150 L124 166 L76 166 L60 150 L56 128 L47 114 L44 96 C44 56 70 28 100 28 Z" />
    </g>
    <g fill="currentColor" fillOpacity="0.6">
      <circle cx="66" cy="108" r="11" />
      <circle cx="134" cy="108" r="11" />
      <path d="M100 124 L93 140 L107 140 Z" />
    </g>
  </>
);

/* The emblem printed in three inks, each a little off register, screened: orange (-2,-1), teal (+2,+1), cream on register. */
/* Each pass is held at 0.55 on its outer group; the entrance animates the inner group's own opacity from 0 to 1. */
export function StealYourFace({ className = "", animate = true }: { className?: string; animate?: boolean }) {
  const passes: Array<[string, number, number, string]> = [
    ["#F2A33A", -2, -1, "pass-wm-1"],
    ["#34C4DC", 2, 1, "pass-wm-2"],
    ["#F1E9D8", 0, 0, "pass-wm-3"],
  ];
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ mixBlendMode: "screen" }}>
        {passes.map(([color, dx, dy, cls]) => (
          <g key={color} opacity="0.55">
            <g className={animate ? cls : undefined} transform={`translate(${dx} ${dy})`} color={color}>
              {DRAWING}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
