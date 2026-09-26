"use client";

import { useEffect, useRef, useState } from "react";
import { canPrefetchMotion, whenIdle, loadMotionClip, loadRobotMotion, preloadMotionClip } from "./motion-preload";
import { ActiveClipPreview, MotionClipPicker, type MotionClip } from "./MotionClipPicker";
import galleryClips from "../public/motion/gallery.json";
import comparisonClips from "../public/motion/clips.json";

const clock = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
type Scene = ReturnType<typeof import("./motion-scene").createMotionScene>;

export function HeroMotion({ comparison = false }: { comparison?: boolean }) {
  const clips: MotionClip[] = comparison ? comparisonClips : galleryClips;
  const timelineId = comparison ? "comparison-motion-timeline" : "human-motion-timeline";
  const robotHost = useRef<HTMLDivElement>(null);
  const robotScene = useRef<Scene | null>(null);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scene = useRef<Scene | null>(null);
  const intent = useRef(true);
  const clip = clips[selected];
  const nextClipId = clips[(selected + 1) % clips.length].id;

  useEffect(() => whenIdle(() => {
    if (!canPrefetchMotion()) return;
    void import("./motion-scene").catch(() => {});
    if (comparison) void import("./robot-scene").catch(() => {});
  }), [comparison]);

  useEffect(() => {
    const element = host.current, movie = video.current;
    if (!element || !movie) return;
    const playbackHost = comparison ? element : element.closest(".motion-viewer") ?? element;
    let cancelNeighbor = () => {};
    let disposed = false, renderer: Scene | null = null, robotRenderer: Scene | null = null, inView = false, ready = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    intent.current = !reduced.matches;
    const playIfVisible = () => {
      if (ready && inView && !document.hidden && intent.current) void movie.play().catch(() => { /* Native play button remains available if autoplay is blocked. */ });
      else movie.pause();
    };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; playIfVisible(); }, { threshold: .15 }); observer.observe(playbackHost);
    document.addEventListener("visibilitychange", playIfVisible);
    const motionPreference = () => { if (reduced.matches) { intent.current = false; movie.pause(); } };
    reduced.addEventListener("change", motionPreference);
    const load = async () => {
      try {
        const [module, { data, vertices }] = await Promise.all([import("./motion-scene"), loadMotionClip(clip.id)]);
        if (disposed) return;
        renderer = module.createMotionScene(element, movie, data, vertices);
        if (comparison && robotHost.current) {
          const [robotModule, model, poses] = await Promise.all([
            import("./robot-scene"), import("./robot-model").then(module => module.loadRobotModel()),
            loadRobotMotion(clip.id),
          ]);
          if (disposed) return;
          robotRenderer = robotModule.createRobotScene(robotHost.current, movie, model, poses);
          robotScene.current = robotRenderer;
        }
        scene.current = renderer;
        ready = true; setStatus("ready"); playIfVisible();
        cancelNeighbor = whenIdle(() => { if (!disposed) preloadMotionClip(nextClipId, comparison); });
      } catch (error) {
        if (!disposed) { renderer?.dispose(); robotRenderer?.dispose(); renderer = null; robotRenderer = null; console.warn("Motion viewer could not initialize:", error); setStatus("error"); movie.pause(); }
      }
    };
    // Fetch/decode ahead of scrolling, then create GPU scenes closer to the viewport.
    let movieLoaded = false;
    const prepareMovie = () => { if (!movieLoaded) { movieLoaded = true; movie.preload = "auto"; movie.load(); } };
    const prefetchObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && canPrefetchMotion()) {
        prefetchObserver.disconnect(); preloadMotionClip(clip.id, comparison); prepareMovie();
      }
    }, { rootMargin: "1600px" });
    prefetchObserver.observe(playbackHost);
    const loadObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { loadObserver.disconnect(); prepareMovie(); void load(); }
    }, { rootMargin: "600px" });
    loadObserver.observe(playbackHost);
    return () => {
      disposed = true; cancelNeighbor(); movie.pause(); observer.disconnect(); loadObserver.disconnect(); prefetchObserver.disconnect();
      document.removeEventListener("visibilitychange", playIfVisible); reduced.removeEventListener("change", motionPreference);
      renderer?.dispose(); robotRenderer?.dispose(); scene.current = null; robotScene.current = null;
    };
  }, [clip.id, comparison, nextClipId]);

  function choose(index: number) {
    if (index === selected) return;
    video.current?.pause(); setSelected(index); setTime(0); setPlaying(false); setStatus("loading"); setSpeed(1);
  }
  function toggle() {
    const movie = video.current;
    if (!movie) return;
    intent.current = movie.paused;
    if (movie.paused) void movie.play().catch(() => setPlaying(false)); else movie.pause();
  }
  return (
    <div className={`motion-viewer ${comparison ? "motion-comparison" : "motion-human-gallery"}`}>
      <div className="motion-heading"><span>{comparison ? "From human motion to G1" : "HumanVerse in motion"}</span><span className="motion-live"><i />{comparison ? "Synchronized replay" : "SMPL + MANO + RGB"}</span></div>
      {comparison && <div className="motion-pair-labels"><span>Human motion <small>SMPL-X + fitted hands + RGB</small></span><span>G1 + Revo2 <small>GMR retargeting → SONIC</small></span></div>}
      <div className={`motion-stage ${comparison ? "motion-pair-stage" : ""}`}>
        <div className="motion-webgl" ref={host} />
        {comparison && <div className="motion-webgl motion-robot-webgl" ref={robotHost} />}
        {!comparison && <div className="motion-camera-preview" role="img" aria-label={`${clip.title}: synchronized camera preview`}>
          <div className="motion-camera-heading">Egocentric camera <span>Synchronized</span></div>
          <ActiveClipPreview key={clip.id} clip={clip} source={video} width={640} mirrored />
        </div>}
        {/* Source video also provides a usable fallback when WebGL is unavailable. Clips have no audio. */}
        <video key={clip.id} ref={video} className={`motion-source ${status === "error" ? "motion-fallback" : ""}`} src={`/motion/${clip.id}.mp4`} poster={`/motion/${clip.id}.jpg`} muted loop={comparison} playsInline preload="none" controls={status === "error"}
          aria-label={`${clip.title}: synchronized egocentric recording`}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
          onError={() => setStatus("error")}>
          <track kind="captions" />
        </video>
        {status === "loading" && <div className="motion-message" role="status"><span className="motion-loader" />Loading recorded motion…</div>}
        {status === "error" && <p className="motion-fallback-note" role="status">3D view unavailable. Watch the synchronized camera recording.</p>}
        {status === "ready" && <><span className="motion-hint">Drag to rotate</span><div className="motion-view-controls"><button className="motion-hands-button" aria-label="Inspect hand motion" onClick={() => { scene.current?.focusHands(); robotScene.current?.focusHands(); }}>Hands</button><button aria-label="Zoom in" onClick={() => { scene.current?.zoom(.85); robotScene.current?.zoom(.85); }}>+</button><button aria-label="Zoom out" onClick={() => { scene.current?.zoom(1.15); robotScene.current?.zoom(1.15); }}>−</button><button aria-label="Reset 3D view" onClick={() => { scene.current?.reset(); robotScene.current?.reset(); }}>↺</button></div></>}
        <noscript><p className="motion-message">Enable JavaScript to explore synchronized 3D motion. <a href={`/motion/${clip.id}.mp4`}>Watch the camera recording</a>.</p></noscript>
      </div>
      <div className="motion-transport">
        <button className="motion-play" onClick={toggle} disabled={status === "loading"} aria-label={playing ? "Pause motion" : "Play motion"}>{playing ? "Ⅱ" : "▶"}</button>
        <label className="sr-only" htmlFor={timelineId}>Motion timeline</label>
        <input id={timelineId} type="range" min="0" max={clip.duration - 1 / 30} step={1 / 30} value={time} disabled={status === "loading"} aria-valuetext={`${time.toFixed(1)} seconds of ${clip.duration.toFixed(1)} seconds`} onChange={event => { const value = Number(event.target.value); if (video.current) video.current.currentTime = value; setTime(value); }} />
        <span className="motion-clock">{clock(time)} / {clock(clip.duration)}</span>
        <button className="motion-speed" aria-label={`Playback speed ${speed} times. Toggle half speed.`} onClick={() => { const value = speed === 1 ? .5 : 1; setSpeed(value); if (video.current) video.current.playbackRate = value; }}>{speed}×</button>
      </div>
      {comparison ? <div className="motion-clips" aria-label="Choose a motion recording">{clips.map((item, index) => <button key={item.id} aria-pressed={index === selected} onPointerEnter={() => preloadMotionClip(item.id, true)} onFocus={() => preloadMotionClip(item.id, true)} onClick={() => choose(index)}>{item.title}</button>)}</div> : <aside className="motion-sidebar" aria-label="Recording selection">
        <MotionClipPicker clips={clips} selected={selected} onSelect={choose} onPrefetch={index => preloadMotionClip(clips[index].id)} sidebar />
      </aside>}
    </div>
  );
}
