const CLOUDS = [
  { color1: "#E8C8E0", color2: "#F0D8E8", x: "5%", y: "6%", scale: 1.3, delay: 0, duration: 20 },
  { color1: "#C8D8F0", color2: "#D8E8F8", x: "65%", y: "3%", scale: 1.0, delay: 3, duration: 24 },
  { color1: "#F0D0C0", color2: "#F8E0D0", x: "30%", y: "12%", scale: 0.8, delay: 6, duration: 22 },
  { color1: "#C8E8D8", color2: "#D8F0E0", x: "82%", y: "18%", scale: 0.7, delay: 9, duration: 26 },
  { color1: "#E0D0F0", color2: "#E8D8F8", x: "12%", y: "70%", scale: 0.9, delay: 4, duration: 21 },
  { color1: "#F0E0C8", color2: "#F8E8D0", x: "55%", y: "75%", scale: 0.75, delay: 7, duration: 23 },
  { color1: "#D8E0F0", color2: "#E0E8F8", x: "88%", y: "65%", scale: 0.6, delay: 2, duration: 25 },
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
        opacity: 0.55,
      }}
    >
      <svg
        width="220"
        height="120"
        viewBox="0 0 220 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`cloud-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
          <filter id={`cloud-blur-${id}`}>
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <g filter={`url(#cloud-blur-${id})`}>
          {/* Main body — wide and rounded */}
          <ellipse cx="110" cy="65" rx="80" ry="35" fill={`url(#cloud-grad-${id})`} />
          {/* Left puff */}
          <ellipse cx="55" cy="55" rx="45" ry="35" fill={`url(#cloud-grad-${id})`} />
          {/* Right puff */}
          <ellipse cx="160" cy="58" rx="42" ry="32" fill={`url(#cloud-grad-${id})`} />
          {/* Top puffs — extra round and puffy */}
          <ellipse cx="80" cy="38" rx="38" ry="30" fill={`url(#cloud-grad-${id})`} />
          <ellipse cx="130" cy="40" rx="35" ry="28" fill={`url(#cloud-grad-${id})`} />
          {/* Extra top center puff */}
          <ellipse cx="105" cy="30" rx="30" ry="25" fill={`url(#cloud-grad-${id})`} />
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
