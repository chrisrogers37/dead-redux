export function WhimsicalUnicorn({
  className = "",
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none ${className}`}
      aria-hidden="true"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <svg
        width="80"
        height="90"
        viewBox="0 0 80 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="unicorn-mane" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8A0B8" />
            <stop offset="33%" stopColor="#C8B8E0" />
            <stop offset="66%" stopColor="#A8D0F0" />
            <stop offset="100%" stopColor="#B8E0C8" />
          </linearGradient>
          <linearGradient id="unicorn-horn" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#F0E0A8" />
            <stop offset="100%" stopColor="#F0C8A8" />
          </linearGradient>
        </defs>
        {/* Horn */}
        <polygon points="40,2 36,22 44,22" fill="url(#unicorn-horn)" opacity="0.9" />
        {/* Horn spiral lines */}
        <line x1="39" y1="8" x2="43" y2="10" stroke="#E8C8A0" strokeWidth="0.8" opacity="0.5" />
        <line x1="38" y1="13" x2="43" y2="15" stroke="#E8C8A0" strokeWidth="0.8" opacity="0.5" />
        <line x1="37" y1="18" x2="44" y2="20" stroke="#E8C8A0" strokeWidth="0.8" opacity="0.5" />
        {/* Head */}
        <ellipse cx="40" cy="32" rx="16" ry="14" fill="white" opacity="0.9" />
        {/* Ear */}
        <ellipse cx="28" cy="22" rx="4" ry="7" fill="white" opacity="0.85" transform="rotate(-15 28 22)" />
        <ellipse cx="28" cy="22" rx="2" ry="5" fill="#F0D0D8" opacity="0.6" transform="rotate(-15 28 22)" />
        {/* Eye */}
        <circle cx="34" cy="30" r="2.5" fill="#5C4F3D" opacity="0.7" />
        <circle cx="33.5" cy="29.5" r="0.8" fill="white" opacity="0.8" />
        {/* Nostril */}
        <circle cx="26" cy="35" r="1" fill="#D4A0A0" opacity="0.4" />
        {/* Mane */}
        <path
          d="M48 20 Q55 28, 52 38 Q58 32, 56 42 Q62 36, 58 48"
          stroke="url(#unicorn-mane)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        {/* Body */}
        <ellipse cx="42" cy="56" rx="20" ry="14" fill="white" opacity="0.85" />
        {/* Front leg */}
        <rect x="28" y="64" width="5" height="18" rx="2.5" fill="white" opacity="0.85" />
        {/* Back leg */}
        <rect x="50" y="64" width="5" height="18" rx="2.5" fill="white" opacity="0.85" />
        {/* Hooves */}
        <ellipse cx="30.5" cy="83" rx="3" ry="2" fill="#C8B8E0" opacity="0.6" />
        <ellipse cx="52.5" cy="83" rx="3" ry="2" fill="#C8B8E0" opacity="0.6" />
        {/* Tail */}
        <path
          d="M62 52 Q72 48, 70 58 Q76 52, 72 62"
          stroke="url(#unicorn-mane)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        {/* Cheek blush */}
        <circle cx="30" cy="36" r="3" fill="#F0C0C0" opacity="0.3" />
      </svg>
    </div>
  );
}
