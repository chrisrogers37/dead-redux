const CLOUDS = [
  { color1: "#A855F7", color2: "#FF6EC7", x: "5%", y: "8%", scale: 1.2, delay: 0, duration: 18 },
  { color1: "#5856D6", color2: "#00FFFF", x: "70%", y: "5%", scale: 0.9, delay: 3, duration: 22 },
  { color1: "#FF2D55", color2: "#FFD700", x: "35%", y: "15%", scale: 0.7, delay: 6, duration: 20 },
  { color1: "#00FFFF", color2: "#39FF14", x: "85%", y: "20%", scale: 0.6, delay: 9, duration: 24 },
  { color1: "#FF6EC7", color2: "#A855F7", x: "15%", y: "75%", scale: 0.8, delay: 4, duration: 19 },
  { color1: "#FFD700", color2: "#FF2D55", x: "60%", y: "80%", scale: 0.65, delay: 7, duration: 21 },
];

function Cloud({
  color1,
  color2,
  x,
  y,
  scale,
  delay,
  duration,
  id,
}: {
  color1: string;
  color2: string;
  x: string;
  y: string;
  scale: number;
  delay: number;
  duration: number;
  id: number;
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        transform: `scale(${scale})`,
        animation: `float ${duration}s ease-in-out infinite, cloud-drift ${duration * 2}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0.12,
      }}
    >
      <svg
        width="200"
        height="100"
        viewBox="0 0 200 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`cloud-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
          <filter id={`cloud-blur-${id}`}>
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <g filter={`url(#cloud-blur-${id})`}>
          {/* Main body */}
          <ellipse cx="100" cy="60" rx="70" ry="30" fill={`url(#cloud-grad-${id})`} />
          {/* Left puff */}
          <ellipse cx="55" cy="50" rx="40" ry="28" fill={`url(#cloud-grad-${id})`} />
          {/* Right puff */}
          <ellipse cx="140" cy="52" rx="35" ry="25" fill={`url(#cloud-grad-${id})`} />
          {/* Top puffs */}
          <ellipse cx="80" cy="38" rx="30" ry="22" fill={`url(#cloud-grad-${id})`} />
          <ellipse cx="120" cy="40" rx="28" ry="20" fill={`url(#cloud-grad-${id})`} />
        </g>
      </svg>
    </div>
  );
}

export function PsychedelicClouds() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {CLOUDS.map((cloud, i) => (
        <Cloud key={i} id={i} {...cloud} />
      ))}
    </div>
  );
}
