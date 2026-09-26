"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DemoVideo } from "./research";

const clock = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;

function Icon({ name }: { name: "play" | "pause" | "muted" | "sound" | "fullscreen" | "exit" }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "play" && <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />}
    {name === "pause" && <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>}
    {(name === "muted" || name === "sound") && <><path d="M11 5 6 9H3v6h3l5 4Z" />{name === "muted" ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>}</>}
    {name === "fullscreen" && <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />}
    {name === "exit" && <path d="M3 9h6V3m6 0v6h6M9 21v-6H3m12 6v-6h6" />}
  </svg>;
}

export function DemoPlayer({ video, scene }: { video: DemoVideo; scene: string }) {
  const root = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = root.current, movie = media.current;
    if (!element || !movie) return;
    setCanFullscreen(typeof element.requestFullscreen === "function" && Boolean(document.fullscreenEnabled));
    const changed = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener("fullscreenchange", changed);
    // Only fetch metadata as the demos approach the viewport.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { movie.preload = "metadata"; movie.load(); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => { observer.disconnect(); document.removeEventListener("fullscreenchange", changed); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (media.current) setTime(media.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  async function togglePlayback() {
    const movie = media.current;
    if (!movie) return;
    if (!movie.paused) { movie.pause(); return; }
    setError("");
    if (movie.ended) movie.currentTime = 0;
    try { await movie.play(); } catch { setError("Unable to play. Try again or open the video."); }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch { /* Keep the inline player usable if fullscreen is unavailable. */ }
  }

  return <div className="demo-player" ref={root}>
    <div className="demo-player-frame">
      <video ref={media} muted playsInline preload="none" poster={video.posterSrc ?? undefined} aria-label={`${scene}: ${video.title}`}
        onLoadedMetadata={event => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onSeeked={event => setTime(event.currentTarget.currentTime)}
        onVolumeChange={event => setMuted(event.currentTarget.muted)} onError={() => setError("Unable to load this video.")}>
        <source src={video.videoSrc!} type="video/mp4" />
        <track kind="captions" src={video.captionsSrc ?? undefined} srcLang="en" label="English" default={Boolean(video.captionsSrc)} />
      </video>
    </div>
    <div className="demo-player-controls" role="group" aria-label={`${video.title} playback controls`}>
      <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"}><Icon name={playing ? "pause" : "play"} /></button>
      <input className="demo-player-timeline" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(time, duration || 1)} disabled={!duration}
        aria-label={`${video.title} video progress`} aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        style={{ "--played": `${duration ? Math.min(time / duration, 1) * 100 : 0}%` } as CSSProperties}
        onChange={event => { const value = Number(event.target.value); if (media.current) media.current.currentTime = value; setTime(value); }} />
      <span className="demo-player-time">{clock(time)} <span>/ {clock(duration)}</span></span>
      <button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={() => { if (media.current) media.current.muted = !media.current.muted; }}><Icon name={muted ? "muted" : "sound"} /></button>
      {canFullscreen && <button type="button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen}><Icon name={fullscreen ? "exit" : "fullscreen"} /></button>}
    </div>
    {error && <p className="demo-player-error" role="status">{error} <a href={video.videoSrc!}>Open video ↗</a></p>}
    <noscript><a className="demo-player-download" href={video.videoSrc!}>Watch {video.title} ↗</a></noscript>
  </div>;
}
