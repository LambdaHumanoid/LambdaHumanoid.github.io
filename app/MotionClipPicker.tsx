"use client";

import { useEffect, useRef, type RefObject } from "react";

export type MotionClip = {
  id: string;
  title: string;
  duration: number;
  poster?: string;
  locomotion?: { horizontalTravelMeters: number };
  handCoverage?: { frameCount: number; dynhamrValidFrames: number[] };
};

export function ActiveClipPreview({ clip, source, width = 320, mirrored = false }: { clip: MotionClip; source: RefObject<HTMLVideoElement | null>; width?: number; mirrored?: boolean }) {
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = preview.current, video = source.current;
    if (!canvas || !video) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let visible = false, frame = 0, lastDraw = -Infinity;
    const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
    const draw = () => {
      if (video.readyState < 2 || video.error) { canvas.hidden = true; return; }
      context.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? canvas.width : 0, 0);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false;
    };
    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - lastDraw >= 1000 / 30 - 1) { draw(); lastDraw = now; }
      if (!video.paused && !video.ended) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancel();
      if (!visible || document.hidden) return;
      draw();
      if (!video.paused && !video.ended) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(canvas.parentElement ?? canvas);
    // Use the original clock video's decoded frame, so pause, seek and speed
    // changes match the 3D view without another video player or decoder.
    const events = ["play", "playing", "pause", "timeupdate", "seeked", "loadeddata", "ended", "ratechange", "emptied", "error"] as const;
    events.forEach(event => video.addEventListener(event, sync));
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancel(); observer.disconnect();
      events.forEach(event => video.removeEventListener(event, sync));
      document.removeEventListener("visibilitychange", sync);
    };
  }, [source, mirrored]);
  return <div className="motion-gallery-preview">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={clip.poster ?? `/motion/${clip.id}.jpg`} alt="" width="160" height="90" decoding="async" style={mirrored ? { transform: "scaleX(-1)" } : undefined} />
    <canvas ref={preview} width={width} height={width * 9 / 16} aria-hidden="true" />
  </div>;
}

export function MotionClipPicker({ clips, selected, onSelect, onPrefetch, sidebar = false }: {
  clips: MotionClip[];
  selected: number;
  onSelect: (index: number) => void;
  onPrefetch?: (index: number) => void;
  sidebar?: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const clip = clips[selected];
  useEffect(() => {
    const button = strip.current?.children[selected] as HTMLElement | undefined;
    if (button && strip.current) {
      strip.current.scrollTo({
        left: sidebar ? 0 : button.offsetLeft - (strip.current.clientWidth - button.clientWidth) / 2,
        top: sidebar ? button.offsetTop - (strip.current.clientHeight - button.clientHeight) / 2 : 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    }
  }, [selected, sidebar]);
  const choose = onSelect;
  return <div className="motion-library">
    <div className="motion-selection">
      <div className="motion-selection-title" aria-live="polite">
        <span className="motion-selection-count">{String(selected + 1).padStart(2, "0")} / {clips.length}</span>
        <strong>{clip.title}</strong>
      </div>
    </div>
    <div id="human-recording-library" ref={strip} className="motion-gallery" role="group" aria-label={`Choose from ${clips.length} human recordings`}>
      {clips.map((item, index) => <button key={item.id} aria-pressed={index === selected} aria-label={`${index + 1}. ${item.title}`} onPointerEnter={() => onPrefetch?.(index)} onFocus={() => onPrefetch?.(index)} onClick={() => choose(index)}>
        {/* These small local recording thumbnails retain their native aspect ratio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.poster ?? `/motion/${item.id}.jpg`} alt="" width="160" height="90" loading="lazy" decoding="async" />
        <span><small>{String(index + 1).padStart(2, "0")}</small>{item.title}</span>
      </button>)}
    </div>
  </div>;
}
