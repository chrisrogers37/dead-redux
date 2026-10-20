/* The walking bear: frame A strides, frame B raises the front knee. Silhouette: no eye. */
export function Bear({ color, size = 28, className = "", style }: {
  color: string; size?: number; className?: string; style?: React.CSSProperties;
}) {
  const h = Math.round(size * 1.125);
  const body = (
    <>
      <g fill="currentColor">
        <circle cx="15" cy="4" r="2.4" />
        <circle cx="22" cy="3.5" r="2.4" />
        <circle cx="19" cy="9" r="6.5" />
        <circle cx="25.5" cy="11.5" r="2.6" />
        <ellipse cx="15" cy="22" rx="7.5" ry="9.5" />
      </g>
    </>
  );
  return (
    <span className={`bear inline-block ${className}`} style={{ width: size, height: h, color, ...style }} aria-hidden="true">
      <svg viewBox="0 0 32 36" width={size} height={h} xmlns="http://www.w3.org/2000/svg">
        <g className="frame-a">
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none">
            <line x1="12" y1="18" x2="5" y2="23" /><line x1="18" y1="19" x2="28" y2="17" />
            <line x1="13" y1="29" x2="8" y2="34" /><line x1="17" y1="29" x2="23" y2="34" />
          </g>
          {body}
        </g>
        <g className="frame-b" transform="translate(0 -1)">
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <line x1="12" y1="18" x2="5" y2="23" /><line x1="18" y1="19" x2="28" y2="17" />
            <line x1="13" y1="29" x2="12" y2="34" /><polyline points="17,29 23,25 26,31" />
          </g>
          {body}
        </g>
      </svg>
    </span>
  );
}

/* The printed border: a row of cream bears along a field's bottom edge. `stepKey` makes them step once in place.
   Before the first step they print in; afterwards they are already printed and only step. */
export function DancingBears({ count, size, stepKey }: { count: number; size: number; stepKey: number }) {
  return (
    <div className="absolute left-0 right-0 bottom-2 flex justify-center gap-3 pointer-events-none" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Bear key={`${i}-${stepKey}`} color="#F1E9D8" size={size} className={stepKey > 0 ? "step" : "border-bear"} style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

/* The lean-back crossing: the same bears walk the edge of the bottom band once. */
export function BearCrossing({ runKey, size }: { runKey: number; size: number }) {
  return (
    <div className="absolute left-0 right-0 -top-10 h-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div key={runKey} className="parade absolute bottom-0 left-0 flex gap-3">
        {Array.from({ length: 12 }, (_, i) => <Bear key={i} color="#F1E9D8" size={size} />)}
      </div>
    </div>
  );
}
