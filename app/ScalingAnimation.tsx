"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ScalingChart, scalingMinima } from "./ScalingChart";

const DURATION_MS = 9000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
// Motion tokens adapted from apple-design: snappy traversal and a soft ease-out.
function bezier(value: number, x1: number, y1: number, x2: number, y2: number) {
  const x = clamp(value);
  if (x === 0 || x === 1) return x;
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const t = (low + high) / 2;
    if (sample(t, x1, x2) < x) low = t; else high = t;
  }
  return sample((low + high) / 2, y1, y2);
}
const travel = (value: number) => bezier(value, .4, 0, .2, 1);
const settle = (value: number) => bezier(value, .23, 1, .32, 1);

// Start each paired marker exactly when the reveal reaches its measured minimum.
const minimumCues = scalingMinima.map(point => {
  let low = 0, high = 1;
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    if (travel(middle) < point.sample.step / 100000) low = middle; else high = middle;
  }
  return { key: `${point.metric}-${point.fraction}`, onset: (low + high) / 2 * .72 };
});

export function ScalingAnimation() {
  // The complete figure remains readable before hydration and without JavaScript.
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);
  const started = useRef(false);
  const figure = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = figure.current;
    if (!target) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        setPlaying(false);
      } else if (!started.current && !preference.matches) {
        started.current = true;
        progressRef.current = 0;
        setProgress(0);
        setPlaying(true);
      }
    }, { threshold: .3 });
    const onPreferenceChange = () => {
      if (preference.matches) {
        setPlaying(false);
        progressRef.current = 1;
        setProgress(1);
      }
    };
    observer.observe(target);
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous: number | null = null;
    const tick = (now: number) => {
      if (document.hidden) {
        previous = null;
      } else {
        // Follow the display refresh rate; avoid jumping after a stalled frame.
        const elapsed = previous === null ? 0 : Math.min(now - previous, 64);
        previous = now;
        progressRef.current = Math.min(1, progressRef.current + elapsed / DURATION_MS);
        setProgress(progressRef.current);
        if (progressRef.current === 1) {
          setPlaying(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function replay() {
    started.current = true;
    progressRef.current = 0;
    setProgress(0);
    setPlaying(true);
  }

  function togglePlayback() {
    started.current = true;
    if (progressRef.current === 1) replay();
    else setPlaying(value => !value);
  }

  const reveal = travel(progress / .72);
  const rise = settle((progress - .48) / .2);
  const summary = settle((progress - .8) / .2);
  const step = Math.round(reveal * 100);
  const pointStyles = Object.fromEntries(minimumCues.flatMap(({ key, onset }) => {
    const phase = settle((progress - onset) / .075);
    return [[`--minimum-${key}`, phase], [`--minimum-scale-${key}`, .65 + phase * .35],
      [`--minimum-pulse-${key}`, Math.sin(phase * Math.PI) * .24]];
  }));

  return (
    <figure className="paper-figure scaling-animation" ref={figure}>
      <div className="scaling-chart-scroll" style={{
        // Account for the clipping rectangle’s 10 px padding, so reveal and step agree.
        "--scaling-reveal": reveal === 0 ? 0 : reveal === 1 ? 1 : (10 + reveal * 532.5) / 552.5,
        "--scaling-rise": rise,
        "--scaling-summary": summary,
        "--scaling-summary-offset": `${(1 - summary) * 10}px`,
        ...pointStyles,
      } as CSSProperties} role="region" tabIndex={0} aria-label="Animated scaling chart; scroll horizontally on small screens">
        <ScalingChart />
      </div>
      <div className="scaling-controls" role="group" aria-label="Scaling animation controls">
        <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause scaling animation" : "Play scaling animation"}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={replay} aria-label="Replay scaling animation">Replay</button>
        <input type="range" min={0} max={100} step={.1} value={progress * 100} aria-label="Scaling animation timeline"
          aria-valuetext={progress < .72 ? `${step} thousand training steps` : "Full training curves and validation-loss trend"}
          onChange={event => {
            started.current = true;
            setPlaying(false);
            progressRef.current = Number(event.target.value) / 100;
            setProgress(progressRef.current);
          }} />
        <span className="scaling-phase">{progress < .72 ? `${step}k / 100k steps` : "Validation-loss trend"}</span>
      </div>
      <figcaption>Increasing the human-data fraction lowers held-out loss and delays late-stage degradation at smaller scales.<a href="/figures/scaling.webp" target="_blank" rel="noreferrer">Open figure ↗</a></figcaption>
    </figure>
  );
}
