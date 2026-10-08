"use client";

import { useEffect, useRef, useState } from "react";

const SILENT_LOOP_SECONDS = 18;

export function HeroReport() {
  const report = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [showSoundButton, setShowSoundButton] = useState(false);

  useEffect(() => {
    const element = report.current;
    const hero = element?.closest(".hero");
    if (!element || !hero) return;
    const title = hero.querySelector("h1");
    const header = document.querySelector(".site-header");

    let frame = 0;
    const update = () => {
      frame = 0;
      const scrolled = Math.max(0, -hero.getBoundingClientRect().top);
      header?.classList.toggle("is-visible", hero.getBoundingClientRect().bottom <= 0);
      const start = window.innerHeight * .12;
      const end = window.innerHeight * .67;
      const reveal = Math.max(0, Math.min(1, (scrolled - start) / (end - start)));
      const headerHeight = parseFloat(getComputedStyle(element).top) || 0;
      const titleBottom = title?.getBoundingClientRect().bottom ?? window.innerHeight;
      const resize = Math.max(0, Math.min(1, (headerHeight - titleBottom) / (window.innerHeight * .3)));
      const settledWidth = Math.min(window.innerWidth * .96, window.innerHeight * 1.76, 1600);
      const settledHeight = settledWidth * 9 / 16;
      element.style.setProperty("--video-width", `${element.clientWidth + (settledWidth - element.clientWidth) * resize}px`);
      element.style.setProperty("--video-height", `${element.clientHeight + (settledHeight - element.clientHeight) * resize}px`);
      element.style.setProperty("--video-zoom", `${1.38 - .38 * resize}`);
      element.style.setProperty("--video-blur", `${2 * (1 - reveal)}px`);
      element.style.setProperty("--video-saturation", `${.9 + .1 * reveal}`);
      element.style.setProperty("--video-opacity", "1");
      element.style.setProperty("--video-wash", `${.12 * (1 - reveal)}`);
      const showButton = reveal >= .95 && resize >= .95 && hero.getBoundingClientRect().bottom >= window.innerHeight * .5;
      setShowSoundButton(showButton);
      if (!showButton && video.current && !video.current.muted) {
        video.current.muted = true;
        if (video.current.currentTime >= SILENT_LOOP_SECONDS) video.current.currentTime = 0;
        setSoundOn(false);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function toggleSound() {
    const movie = video.current;
    if (!movie) return;
    if (soundOn) {
      movie.muted = true;
      if (movie.currentTime >= SILENT_LOOP_SECONDS) movie.currentTime = 0;
      setSoundOn(false);
      return;
    }
    if (movie.readyState) movie.currentTime = 0;
    movie.muted = false;
    void movie.play().then(() => setSoundOn(true)).catch(() => { movie.muted = true; setSoundOn(false); });
  }

  return (
    <div className="hero-report" ref={report}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/videos/report-video-poster.jpg?v=193d1c943b" alt="" />
      {/* The supplied video has subtitles burned into the picture. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={video} autoPlay muted={!soundOn} loop={!soundOn} playsInline preload="metadata" poster="/videos/report-video-poster.jpg?v=193d1c943b" tabIndex={-1} aria-hidden="true" onTimeUpdate={event => { if (event.currentTarget.muted && event.currentTarget.currentTime >= SILENT_LOOP_SECONDS) event.currentTarget.currentTime = 0; }}>
        <source src="/videos/report-video.mp4?v=e501883b93" type="video/mp4" />
      </video>
      {showSoundButton && <button className={`hero-report-sound${soundOn ? " is-playing" : ""}`} type="button" onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? "Mute Sound" : "Watch Video with Sound"}</button>}
    </div>
  );
}
