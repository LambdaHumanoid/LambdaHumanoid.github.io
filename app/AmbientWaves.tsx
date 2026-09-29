"use client";

import { useEffect, useRef } from "react";

// Opposing blue–violet gradients drift and crossfade without a render loop.
export function AmbientWaves() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      if (root.current) root.current.dataset.paused = String(document.hidden);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return <div className="ambient-waves" ref={root} aria-hidden="true">
    {[0, 1].map(index => <svg key={index} className={`ambient-waves-layer ambient-waves-layer-${index}`} viewBox="0 0 1600 1000" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={`ambient-wave-${index}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#91abc8" stopOpacity="0" />
          <stop offset=".28" stopColor={index === 0 ? "#91b4ec" : "#b29ae2"} stopOpacity=".6" />
          <stop offset=".6" stopColor={index === 0 ? "#b29ae2" : "#91b4ec"} stopOpacity=".8" />
          <stop offset=".82" stopColor={index === 0 ? "#a2b4e8" : "#c0a7e8"} stopOpacity=".6" />
          <stop offset="1" stopColor="#b49bdc" stopOpacity="0" />
        </linearGradient>
        <filter id={`ambient-soften-${index}`} x="-20%" y="-80%" width="140%" height="260%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="44" />
        </filter>
      </defs>
      <path d="M -160 640 C 100 1080 460 80 820 540 S 1320 1040 1760 240" fill="none" stroke={`url(#ambient-wave-${index})`} strokeWidth="112" filter={`url(#ambient-soften-${index})`} />
    </svg>)}
  </div>;
}
