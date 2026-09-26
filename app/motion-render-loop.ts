import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Playback draws at most 30 fps, matching the recording. A paused view only draws for camera changes,
// resizing or seeking; invisible views have no outstanding animation callbacks.
export function createMotionRenderLoop(
  host: HTMLElement,
  video: HTMLVideoElement,
  controls: OrbitControls,
  draw: (time: number, poseChanged: boolean) => void,
) {
  let visible = false, disposed = false, frame = 0;
  let dirty = true, mediaTime = video.currentTime, lastTime = -1, lastFallback = -Infinity;
  const active = () => !disposed && visible && !document.hidden;
  function invalidate() {
    dirty = true;
    if (active() && !frame) frame = requestAnimationFrame(render);
  }
  function render(now: number) {
    frame = 0;
    if (!active()) return;
    // The clock video is visually hidden. Browsers can suspend its video-frame
    // callbacks, so use a capped RAF clock that also works for hidden videos.
    if (!video.paused && now - lastFallback >= 1000 / 30 - 1) {
      lastFallback = now;
      mediaTime = video.currentTime;
      dirty ||= mediaTime !== lastTime;
    }
    if (dirty) {
      dirty = false;
      // OrbitControls emits change while its damping is settling, invalidating
      // the next frame. Once still, both drawing and RAF scheduling stop.
      controls.update();
      draw(mediaTime, mediaTime !== lastTime);
      lastTime = mediaTime;
    }
    if (!video.paused && !frame) frame = requestAnimationFrame(render);
  }
  function cancel() {
    cancelAnimationFrame(frame); frame = 0;
  }
  function sync() {
    if (!active()) { cancel(); return; }
    mediaTime = video.currentTime;
    invalidate();
  }
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  const resize = new ResizeObserver(invalidate);
  visibility.observe(host); resize.observe(host);
  controls.addEventListener("change", invalidate);
  document.addEventListener("visibilitychange", sync);
  const events = ["play", "pause", "seeked", "loadeddata", "ended"] as const;
  events.forEach(event => video.addEventListener(event, sync));
  return {
    dispose() {
      disposed = true; cancel(); visibility.disconnect(); resize.disconnect();
      controls.removeEventListener("change", invalidate);
      document.removeEventListener("visibilitychange", sync);
      events.forEach(event => video.removeEventListener(event, sync));
    },
  };
}
