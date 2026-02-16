export function StealYourFace({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Outer circle */}
        <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="3" opacity="0.15" />
        {/* Lightning bolt divider */}
        <path
          d="M100 5 L115 95 L85 95 L100 195"
          stroke="currentColor"
          strokeWidth="4"
          opacity="0.1"
          fill="none"
        />
        {/* Skull shape */}
        <ellipse cx="100" cy="90" rx="55" ry="50" stroke="currentColor" strokeWidth="2" opacity="0.08" />
        {/* Eye sockets */}
        <circle cx="80" cy="82" r="12" stroke="currentColor" strokeWidth="2" opacity="0.08" />
        <circle cx="120" cy="82" r="12" stroke="currentColor" strokeWidth="2" opacity="0.08" />
      </svg>
    </div>
  );
}
