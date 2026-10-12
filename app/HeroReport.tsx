"use client";

import { useEffect, useRef, useState } from "react";

export function HeroReport() {
  const report = useRef<HTMLDivElement>(null);
  const fullVideo = useRef<HTMLVideoElement>(null);
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
      if (!showButton && fullVideo.current && !fullVideo.current.paused) {
        fullVideo.current.pause();
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
    const movie = fullVideo.current;
    if (!movie) return;
    if (soundOn) {
      movie.pause();
      setSoundOn(false);
      return;
    }
    if (movie.readyState) movie.currentTime = 0;
    void movie.play().then(() => setSoundOn(true)).catch(() => setSoundOn(false));
  }

  return (
    <div className="hero-report" ref={report}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/videos/report-video-poster.jpg?v=566909a039" alt="" />
      {/* The silent preview contains no audio track. */}
      <video autoPlay muted loop playsInline preload="auto" poster="/videos/report-video-poster.jpg?v=566909a039" tabIndex={-1} aria-hidden="true" style={{ visibility: soundOn ? "hidden" : "visible" }}>
        <source src="/videos/report-preview-17-34.mp4?v=7b1f529ef4" type="video/mp4" />
      </video>
      {/* The supplied video has subtitles burned into the picture. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={fullVideo} playsInline preload="metadata" poster="/videos/report-video-poster.jpg?v=566909a039" tabIndex={-1} aria-hidden="true" style={{ visibility: soundOn ? "visible" : "hidden" }} onEnded={() => setSoundOn(false)}>
        <source src="/videos/report-video.mp4?v=129775da9e" type="video/mp4" />
      </video>
      {showSoundButton && <button className={`hero-report-sound${soundOn ? " is-playing" : ""}`} type="button" onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? "Mute Sound" : "Watch Video with Sound"}</button>}
    </div>
  );
}
