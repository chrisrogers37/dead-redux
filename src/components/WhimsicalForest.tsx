export function WhimsicalForest({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none w-full ${className}`} aria-hidden="true">
      <svg
        width="100%"
        height="60"
        viewBox="0 0 800 60"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Ground line */}
        <rect x="0" y="50" width="800" height="10" fill="#B8E0C8" opacity="0.2" rx="5" />

        {/* Trees — various sizes and greens */}
        <g opacity="0.3">
          {/* Tree 1 */}
          <rect x="58" y="30" width="4" height="20" rx="2" fill="#C4A882" />
          <ellipse cx="60" cy="22" rx="14" ry="18" fill="#A8D4A0" />

          {/* Tree 2 — taller */}
          <rect x="138" y="20" width="4" height="30" rx="2" fill="#C4A882" />
          <ellipse cx="140" cy="10" rx="16" ry="20" fill="#90C490" />

          {/* Tree 3 — small bush */}
          <ellipse cx="210" cy="42" rx="12" ry="10" fill="#B8E0C8" />

          {/* Tree 4 */}
          <rect x="298" y="25" width="4" height="25" rx="2" fill="#C4A882" />
          <ellipse cx="300" cy="16" rx="15" ry="18" fill="#A0CCA0" />

          {/* Tree 5 — small */}
          <rect x="378" y="35" width="3" height="15" rx="1.5" fill="#C4A882" />
          <ellipse cx="379.5" cy="28" rx="10" ry="14" fill="#B8D8B0" />

          {/* Tree 6 */}
          <rect x="448" y="22" width="4" height="28" rx="2" fill="#C4A882" />
          <ellipse cx="450" cy="12" rx="16" ry="20" fill="#A8D4A0" />

          {/* Tree 7 — bush */}
          <ellipse cx="530" cy="40" rx="14" ry="12" fill="#C0E8C8" />

          {/* Tree 8 */}
          <rect x="598" y="28" width="4" height="22" rx="2" fill="#C4A882" />
          <ellipse cx="600" cy="18" rx="14" ry="18" fill="#98CC98" />

          {/* Tree 9 — tall */}
          <rect x="688" y="18" width="4" height="32" rx="2" fill="#C4A882" />
          <ellipse cx="690" cy="8" rx="17" ry="20" fill="#A8D4A0" />

          {/* Tree 10 — small */}
          <rect x="758" y="35" width="3" height="15" rx="1.5" fill="#C4A882" />
          <ellipse cx="759.5" cy="28" rx="10" ry="14" fill="#B8E0C8" />
        </g>

        {/* Gentle rolling hill line */}
        <path
          d="M0 52 Q100 44, 200 50 Q300 42, 400 48 Q500 42, 600 50 Q700 44, 800 50"
          stroke="#A8D4A0"
          strokeWidth="2"
          fill="none"
          opacity="0.25"
        />
      </svg>
    </div>
  );
}
