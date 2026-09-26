"use client";

import { useEffect, useRef, useState } from "react";
import { createHumanverseMotion } from "./humanverse-motion";

export function HumanVerseAnimation() {
  const figure = useRef<HTMLElement>(null);
  const object = useRef<HTMLObjectElement>(null);
  const motion = useRef<ReturnType<typeof createHumanverseMotion> | null>(null);
  const visible = useRef(false);
  const intent = useRef(true);
  const reduced = useRef(false);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const target = figure.current;
    if (!target) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = preference.matches;
    const sync = () => {
      if (reduced.current) motion.current?.finish();
      else if (visible.current && intent.current && !document.hidden) motion.current?.play();
      else motion.current?.pause();
    };
    const lazy = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setLoad(true); lazy.disconnect(); }
    }, { rootMargin: "1400px" });
    const observer = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; sync(); }, { threshold: .25 });
    const change = () => { reduced.current = preference.matches; setReduceMotion(preference.matches); sync(); };
    preference.addEventListener("change", change);
    document.addEventListener("visibilitychange", sync);
    lazy.observe(target); observer.observe(target);
    return () => {
      lazy.disconnect(); observer.disconnect(); preference.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", sync); motion.current?.dispose(); motion.current = null;
    };
  }, []);

  function loaded() {
    const svg = object.current?.contentDocument?.querySelector("svg");
    if (!svg) return; // Keep the original image if the vector asset cannot load.
    motion.current?.dispose();
    motion.current = createHumanverseMotion(svg, setPlaying);
    const preferReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduced.current = preferReduced; setReduceMotion(preferReduced);
    if (preferReduced) motion.current.finish();
    else {
      motion.current.reset();
      if (visible.current && !document.hidden) motion.current.play();
    }
    setReady(true);
  }

  function replay() {
    if (reduced.current) return;
    intent.current = true; motion.current?.reset(); motion.current?.play();
  }

  return (
    <figure className="paper-figure humanverse-animation" ref={figure}>
      <div className={`humanverse-art ${ready ? "is-ready" : ""}`}>
        {/* A complete, transparent figure is always available without JavaScript. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figures/humanverse.webp" alt="HumanVerse-500: wearable capture setup, skill frequencies, five-ring activity distribution, and synchronized image–pose examples" width={2400} height={929} loading="lazy" aria-hidden={ready} />
        {load && <object ref={object} type="image/svg+xml" data="/figures/humanverse-animated.svg" aria-label="Animated HumanVerse-500 dataset figure" onLoad={loaded} tabIndex={-1} />}
      </div>
      <div className="humanverse-controls" role="group" aria-label="HumanVerse animation controls" hidden={!ready || reduceMotion}>
        <button type="button" onClick={() => {
          if (motion.current?.complete) { replay(); return; }
          intent.current = !playing;
          if (playing) motion.current?.pause(); else motion.current?.play();
        }} aria-label={playing ? "Pause dataset animation" : "Play dataset animation"}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={replay} aria-label="Replay dataset animation">Replay ↻</button>
      </div>
      <figcaption>HumanVerse-500 spans everyday scenes, objects, and coordinated whole-body activities.<a href="/figures/humanverse.webp" target="_blank" rel="noreferrer">Open figure ↗</a></figcaption>
    </figure>
  );
}
