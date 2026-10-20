"use client";

import { useEffect, useRef, useState } from "react";
import { startDisplay, type DisplayParams } from "./engine";

interface DisplayProps {
  seed: number;
  disc: boolean;
  internalWidth: number;
  update: (t: number, p: DisplayParams) => void;
  className?: string;
}

/* One canvas, one ambient layer. Shows the CSS floor when no canvas context exists. */
export function Display({ seed, disc, internalWidth, update, className = "" }: DisplayProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const updateRef = useRef(update);
  const [floor, setFloor] = useState(false);

  /* The engine calls the latest schedule through a ref, so a new schedule never restarts it. */
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = startDisplay(canvas, {
      seed,
      disc,
      internalWidth,
      fps: 30,
      still,
      update: (t, p) => updateRef.current(t, p),
    });
    /* With no canvas context the CSS floor shows; the flag is set on the next frame, not in the effect body. */
    let floorFrame = 0;
    if (canvas.dataset.renderer === "none") floorFrame = window.requestAnimationFrame(() => setFloor(true));
    return () => {
      window.cancelAnimationFrame(floorFrame);
      stop();
    };
  }, [seed, disc, internalWidth]);

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <canvas ref={ref} className="display" />
      {floor && (
        <div className="display-css">
          <div className="g1" />
          <div className="g2" />
          <div className="g3" />
        </div>
      )}
    </div>
  );
}
