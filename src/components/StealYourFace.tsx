export function StealYourFace({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full animate-[spin-slow_60s_linear_infinite]"
      >
        <defs>
          <linearGradient id="syf-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF2D55" stopOpacity="0.25" />
            <stop offset="25%" stopColor="#A855F7" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#00FFFF" stopOpacity="0.2" />
            <stop offset="75%" stopColor="#39FF14" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="syf-bolt" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FF2D55" />
            <stop offset="50%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
        {/* Outer circle */}
        <circle cx="100" cy="100" r="95" stroke="url(#syf-rainbow)" strokeWidth="3" opacity="0.3" />
        {/* Inner rings for trippy effect */}
        <circle cx="100" cy="100" r="85" stroke="url(#syf-rainbow)" strokeWidth="1" opacity="0.15" />
        <circle cx="100" cy="100" r="75" stroke="url(#syf-rainbow)" strokeWidth="1" opacity="0.1" />
        {/* Lightning bolt divider */}
        <path
          d="M100 5 L115 95 L85 95 L100 195"
          stroke="url(#syf-bolt)"
          strokeWidth="4"
          opacity="0.2"
          fill="none"
        />
        {/* Skull shape */}
        <ellipse cx="100" cy="90" rx="55" ry="50" stroke="url(#syf-rainbow)" strokeWidth="2" opacity="0.12" />
        {/* Eye sockets */}
        <circle cx="80" cy="82" r="12" stroke="#A855F7" strokeWidth="2" opacity="0.15" />
        <circle cx="120" cy="82" r="12" stroke="#00FFFF" strokeWidth="2" opacity="0.15" />
      </svg>
    </div>
  );
}
