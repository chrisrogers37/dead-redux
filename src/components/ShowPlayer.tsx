"use client";

import { useState } from "react";

interface ShowPlayerProps {
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const [loaded, setLoaded] = useState(false);
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="relative w-full bg-dead-charcoal/50">
      {/* Skeleton pulse while loading */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse text-dead-bone/20 text-sm">Loading player...</div>
        </div>
      )}
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className={`block border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
