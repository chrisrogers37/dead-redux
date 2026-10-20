/* The walking bear: frame A strides, frame B raises the front knee; the frames alternate while walking. */
export function Bear({ color, size = 24, className = "", style }: {
  color: string; size?: number; className?: string; style?: React.CSSProperties;
}) {
  const h = Math.round(size * 1.125);
  return (
    <span className={`bear inline-block ${className}`} style={{ width: size, height: h, color, ...style }} aria-hidden="true">
      <svg viewBox="0 0 32 36" width={size} height={h} xmlns="http://www.w3.org/2000/svg">
        <g className="frame-a">
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none">
            <line x1="12" y1="18" x2="5" y2="23" />
            <line x1="18" y1="19" x2="28" y2="17" />
            <line x1="13" y1="29" x2="8" y2="34" />
            <line x1="17" y1="29" x2="23" y2="34" />
          </g>
          <g fill="currentColor">
            <circle cx="15" cy="4" r="2.4" />
            <circle cx="22" cy="3.5" r="2.4" />
            <circle cx="19" cy="9" r="6.5" />
            <circle cx="25.5" cy="11.5" r="2.6" />
            <ellipse cx="15" cy="22" rx="7.5" ry="9.5" />
          </g>
          <circle cx="22.5" cy="8" r="1" fill="var(--page)" />
        </g>
        <g className="frame-b" transform="translate(0 -1)">
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <line x1="12" y1="18" x2="5" y2="23" />
            <line x1="18" y1="19" x2="28" y2="17" />
            <line x1="13" y1="29" x2="12" y2="34" />
            <polyline points="17,29 23,25 26,31" />
          </g>
          <g fill="currentColor">
            <circle cx="15" cy="4" r="2.4" />
            <circle cx="22" cy="3.5" r="2.4" />
            <circle cx="19" cy="9" r="6.5" />
            <circle cx="25.5" cy="11.5" r="2.6" />
            <ellipse cx="15" cy="22" rx="7.5" ry="9.5" />
          </g>
          <circle cx="22.5" cy="8" r="1" fill="var(--page)" />
        </g>
      </svg>
    </span>
  );
}

const PARADE = ["#D4607A", "#D4A056", "#78B070", "#6898D0", "#9A80C0"];

/* The lean-back parade: five bears cross the lane once, then the lane is empty. `runKey` restarts it. */
export function DancingBears({ runKey, seconds }: { runKey: number; seconds: number }) {
  return (
    <div className="absolute left-0 right-0 bottom-0 h-16 overflow-hidden pointer-events-none" aria-hidden="true">
      <div key={runKey} className="parade absolute bottom-3 left-0 flex gap-2" style={{ "--parade-s": `${seconds}s` } as React.CSSProperties}>
        {PARADE.map((c) => (
          <Bear key={c} color={c} size={40} />
        ))}
      </div>
    </div>
  );
}
