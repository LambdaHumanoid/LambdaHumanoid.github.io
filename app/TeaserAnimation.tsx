"use client";

import { useEffect, useRef, useState } from "react";
import teaserSvg from "../public/figures/teaser-animated.svg?raw";

// Figma Teaser / 3157:2: latest compact EE and transfer evidence.
// The export preserves its vectors; embedded photographs are compressed to WebP.
const DURATION = 5700;
const DESCRIPTION = "HumanVerse to humanoid control: 500 hours of human data, action alignment, three-stage training, scaling, and real-world results.";
type Playback = { toggle: () => void; replay: () => void };

export function TeaserAnimation() {
  const figure = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const playback = useRef<Playback | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const target = figure.current, mount = art.current;
    if (!target || !mount) return;
    const xml = new DOMParser().parseFromString(teaserSvg, "image/svg+xml");
    if (xml.querySelector("parsererror")) return;
    const svg = document.importNode(xml.documentElement, true);
    mount.replaceChildren(svg);
    const layers = Array.from(svg.querySelectorAll<SVGElement>("[data-teaser-start]"));
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let elapsed = DURATION, previous = 0, frame = 0;
    let inView = false, intent = true, started = false, disposed = false;
    const paint = () => {
      for (const node of layers) {
        const progress = Math.max(0, Math.min(1, (elapsed - Number(node.dataset.teaserStart)) / 950));
        const opacity = String(1 - (1 - progress) ** 3);
        if (node.style.opacity !== opacity) node.style.opacity = opacity;
      }
      svg.setAttribute("data-progress", (elapsed / DURATION).toFixed(3));
    };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; previous = 0; setPlaying(false); };
    const tick = (time: number) => {
      if (disposed) return;
      frame = 0;
      if (!previous) previous = time;
      if (time - previous >= 1000 / 30 - 1) {
        elapsed = Math.min(DURATION, elapsed + Math.min(time - previous, 100));
        previous = time; paint();
      }
      if (elapsed >= DURATION) { intent = false; stop(); return; }
      frame = requestAnimationFrame(tick);
    };
    const play = () => {
      if (disposed || frame || preference.matches || !inView || document.hidden || !intent || elapsed >= DURATION) return;
      previous = 0; setPlaying(true); frame = requestAnimationFrame(tick);
    };
    const replay = () => {
      if (preference.matches) return;
      stop(); elapsed = 0; started = true; intent = true; paint(); play();
    };
    const syncPreference = () => {
      setReduced(preference.matches);
      if (preference.matches) { stop(); elapsed = DURATION; paint(); }
      else if (started && elapsed < DURATION) play();
    };
    const onVisibility = () => { if (document.hidden) stop(); else play(); };
    playback.current = {
      replay,
      toggle: () => {
        if (elapsed >= DURATION) { replay(); return; }
        intent = !intent;
        if (intent) play(); else stop();
      },
    };
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) { stop(); return; }
      if (!started && !preference.matches) { started = true; elapsed = 0; paint(); }
      play();
    }, { threshold: 0.25 });
    observer.observe(target);
    preference.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", onVisibility);
    syncPreference(); setReady(true);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      preference.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", onVisibility);
      playback.current = null; mount.replaceChildren();
    };
  }, []);

  return <figure className="paper-figure teaser-figure" ref={figure}>
    <div className="teaser-scroll" role="region" aria-label="Research teaser; scroll horizontally to explore on small screens" tabIndex={0}>
      <div className={`teaser-stage ${ready ? "is-ready" : ""}`}>
        {/* The complete exported figure stays available without JavaScript. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figures/teaser.webp" alt={DESCRIPTION} width={1266} height={650} loading="lazy" aria-hidden={ready} />
        <div className="teaser-svg" ref={art} />
      </div>
    </div>
    <div className="teaser-meta">
      <figcaption>Human data → alignment → training → humanoid control.</figcaption>
      <div className="humanverse-controls teaser-controls" role="group" aria-label="Teaser animation controls" hidden={!ready || reduced}>
        <button type="button" onClick={() => playback.current?.toggle()} aria-label={playing ? "Pause teaser animation" : "Play teaser animation"}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={() => playback.current?.replay()} aria-label="Replay teaser animation">Replay ↻</button>
      </div>
    </div>
  </figure>;
}
