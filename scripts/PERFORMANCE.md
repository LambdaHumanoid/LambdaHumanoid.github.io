# Page rendering performance

The motion viewers use `app/motion-render-loop.ts`. Playback is capped at the
recordings' 30 fps, independent of display refresh rate. Paused views render only
for camera changes, resize, or seeking. Offscreen and hidden-tab views cancel
animation callbacks. OrbitControls damping can finish before the loop sleeps.
The clock video is visually hidden, so the loop deliberately does not depend on
`requestVideoFrameCallback`, which browsers may suspend for invisible videos.
Shadow maps update only when the pose changes.

`app/robot-model.worker.ts` fetches/decompresses the static G1 + Revo2 model and
computes creased normals with exact coincident-vertex adjacency in a worker. The worker transfers typed arrays
and exits. `app/robot-model.ts` retains one immutable result across clip changes;
failed loads clear the promise for retry. Each scene still disposes its own GPU
resources. Triangle positions, topology, 45-degree crease angle and motion data are preserved.
`robot-surface.ts` replaces centimetre-scale normal buckets with exact exported
coordinates, avoiding cross-surface blending on millimetre-scale fingers and shells.
Foot contact shadows scan original indexed vertices instead of duplicated triangle
corners. Human and robot asset loading starts concurrently.

Scaling-chart curves are memoized. Animation changes three CSS variables for the
reveal width and annotations, instead of rebuilding curve paths on every tick.
Both figure animations update at most 30 times per second. HumanVerse skips SVG
style writes for elements whose appearance has not changed. Development watching
excludes the offline `work/` data and `.wrangler/` state.

## Verification (2026-09-25)

Local desktop Chrome, headless, 1440 × 1000, three-second samples of the visible
comparison viewer, reduced-motion preference with playback manually enabled:

| Measurement | Before | After |
| --- | ---: | ---: |
| WebGL draw submissions while paused | 27,693 | 0 |
| WebGL draw submissions during playback | 27,540 | 13,770 |
| Main-thread task time during playback | 0.482 s | 0.243 s |
| Longest observed main-thread loading task | 9,731 ms | No task ≥ 50 ms in that run |

These are diagnostic measurements, not a cross-device benchmark. Model preparation
still takes time in the background. A cached switch to the floor clip took 160 ms
locally; the static model was fetched/prepared only once.

Browser checks cover paused seeking and dragging, playback, reset/hand inspection,
clip switching/cache reuse, scaling reveal/pause, HumanVerse pause/replay/offscreen
and reduced motion, and 390 px layout. Unit tests cover sleeping/invalidation,
30 fps playback on a simulated 120 Hz screen, visibility, and disposal.
