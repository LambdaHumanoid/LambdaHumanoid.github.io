import type { MotionData } from "./motion-scene";
import type { RobotMotion } from "./robot-scene";

type Clip = { data: MotionData; vertices: Int16Array };
// Share in-flight work and decoded frames across preloading and actual playback.
// LRU limits prevent browsing the gallery from retaining all forty mesh sequences.
const clips = new Map<string, Promise<Clip>>();
const robots = new Map<string, Promise<RobotMotion>>();
let speculative = 0;

function cached<T>(cache: Map<string, Promise<T>>, key: string, limit: number, load: () => Promise<T>) {
  let pending = cache.get(key);
  if (pending) { cache.delete(key); cache.set(key, pending); return pending; }
  pending = load().catch(error => { if (cache.get(key) === pending) cache.delete(key); throw error; });
  cache.set(key, pending);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
  return pending;
}

export function canPrefetchMotion() {
  if (typeof navigator === "undefined" || document.hidden) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

export function whenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, 400);
  return () => window.clearTimeout(handle);
}

export function loadMotionClip(id: string) {
  return cached(clips, id, 4, async () => {
    const response = await fetch(`/motion/${id}.json`);
    if (!response.ok) throw new Error("Motion data unavailable");
    const data: MotionData = await response.json();
    const binary = await fetch(data.vertices);
    if (!binary.ok) throw new Error("Motion frames unavailable");
    let bytes = await binary.arrayBuffer();
    const expectedBytes = data.vertexCount * data.frameCount * 3 * 2;
    // Support both HTTP-decompressed responses and raw gzip from static hosts.
    if (bytes.byteLength !== expectedBytes) bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    if (bytes.byteLength !== expectedBytes) throw new Error("Incomplete motion frames");
    return { data, vertices: new Int16Array(bytes) };
  });
}

export function loadRobotMotion(id: string) {
  return cached(robots, id, 3, async () => {
    const response = await fetch(`/motion/${id}.robot.json.gz`);
    if (!response.ok) throw new Error("Robot motion unavailable");
    let bytes = await response.arrayBuffer();
    const head = new Uint8Array(bytes);
    if (head[0] === 0x1f && head[1] === 0x8b) bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(bytes)) as RobotMotion;
  });
}

export function preloadMotionClip(id: string, comparison = false) {
  if (!canPrefetchMotion() || speculative >= 2) return;
  speculative++;
  void Promise.all([
    loadMotionClip(id),
    ...(comparison ? [loadRobotMotion(id), import("./robot-model").then(module => module.loadRobotModel())] : []),
  ]).catch(() => { /* A failed speculative load is retried on actual selection. */ }).finally(() => { speculative--; });
}
