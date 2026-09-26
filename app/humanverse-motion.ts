// Animate the original Figma paths. No chart values or geometry are reconstructed.
const DURATION = 4200;
const ease = (value: number) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;

export function createHumanverseMotion(svg: SVGSVGElement, onPlaying: (value: boolean) => void) {
  const doc = svg.ownerDocument;
  const get = (id: string) => doc.getElementById(`hv_${id}`) as SVGElement | null;
  const bars = Array.from({ length: 19 }, (_, i) => ({ bar: get(`524_${24 + i * 3}`), label: get(`524_${25 + i * 3}`) }));
  const ring = get("524_104") as SVGGraphicsElement | null;
  const fades: { node: SVGElement; start: number; duration: number; opacity: number }[] = [];
  function fade(id: string, start: number, duration = 750) {
    const node = get(id);
    if (node) fades.push({ node, start, duration, opacity: Number(node.getAttribute("opacity") ?? 1) });
  }
  // Human/robot capture setup, followed by statistics, then contextual examples.
  ["532_235", "533_237", "533_238", "533_239", "533_240", "533_241", "533_244",
    "537_2", "537_3", "537_4", "538_2", "540_2", "540_3", "540_4", "540_5",
    "547_2", "548_2", "548_3", "549_2", "549_3", "555_8"].forEach(id => fade(id, 0));
  ["524_82", "524_85", "524_88", "524_91"].forEach((id, i) => fade(id, 450 + i * 160));
  fade("524_450", 500, 1000);
  fade("524_300", 1000);
  // Ring labels and their callouts live outside the sector group in the source.
  const ringParent = get("524_100");
  if (ringParent) Array.from(ringParent.children).forEach(node => {
    if (["hv_524_104", "hv_524_450", "hv_524_299", "hv_524_300"].includes(node.id)) return;
    fades.push({ node: node as SVGElement, start: 1700, duration: 900, opacity: Number(node.getAttribute("opacity") ?? 1) });
  });
  ["563_2", "560_248", "568_5", "563_3", "587_251", "587_252", "594_3"]
    .forEach((id, i) => fade(id, 2200 + (i % 2) * 150));
  fade("524_97", 2900, 1300);

  const ns = "http://www.w3.org/2000/svg";
  const clip = doc.createElementNS(ns, "clipPath");
  clip.id = "humanverse-ring-reveal";
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  const wedge = doc.createElementNS(ns, "path");
  clip.appendChild(wedge);
  svg.querySelector("defs")?.appendChild(clip);
  // Figma's blur helpers enlarge the GROUP bounds. Use the actual sector paths
  // so the sweep is centered on the data rings, not on their shadow filters.
  const boxes = Array.from({ length: 49 }, (_, i) => {
    const node = get(`524_${105 + i}`);
    // One sector has a gradient-border group containing an oversized mask.
    const path = node?.tagName === "path" ? node : node?.querySelector(":scope > path[d]");
    return (path as SVGGraphicsElement | null)?.getBBox();
  }).filter(box => box !== undefined);
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const radius = Math.hypot(right - left, bottom - top) / 2 + 4;
  if (ring) ring.setAttribute("clip-path", `url(#${clip.id})`);
  for (const { bar } of bars) if (bar) {
    bar.style.transformBox = "fill-box";
    bar.style.transformOrigin = "center bottom";
  }

  let elapsed = DURATION, frame = 0, previous: number | null = null;
  let playing = false, disposed = false;
  // Most labels have already reached their final opacity. Avoid invalidating
  // those SVG subtrees again for every remaining animation frame.
  const styles = new WeakMap<SVGElement, Map<string, string>>();
  function style(node: SVGElement, property: string, value: string) {
    let previous = styles.get(node);
    if (!previous) { previous = new Map(); styles.set(node, previous); }
    if (previous.get(property) === value) return;
    previous.set(property, value); node.style.setProperty(property, value);
  }
  let lastSweep = -1;
  const paint = () => {
    svg.dataset.progress = (elapsed / DURATION).toFixed(3);
    bars.forEach(({ bar, label }, i) => {
      const progress = ease((elapsed - 500 - i * 65) / 1100);
      if (bar) style(bar, "transform", `scaleY(${progress})`);
      if (label) style(label, "opacity", String(ease((elapsed - 950 - i * 65) / 550)));
    });
    const sweep = ease((elapsed - 250) / 2400);
    if (ring && sweep !== lastSweep) {
      lastSweep = sweep;
      style(ring, "opacity", sweep > 0 ? "1" : "0");
      if (sweep >= 1) ring.removeAttribute("clip-path");
      else {
        ring.setAttribute("clip-path", `url(#${clip.id})`);
        const angle = sweep * Math.PI * 2 - Math.PI / 2;
        wedge.setAttribute("d", `M${cx} ${cy} L${cx} ${cy - radius} A${radius} ${radius} 0 ${sweep > .5 ? 1 : 0} 1 ${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)} Z`);
      }
    }
    fades.forEach(({ node, start, duration, opacity }) => { style(node, "opacity", String(opacity * ease((elapsed - start) / duration))); });
  };
  function pause() {
    cancelAnimationFrame(frame); previous = null;
    if (playing) { playing = false; onPlaying(false); }
  }
  const tick = (now: number) => {
    if (disposed || !playing) return;
    if (previous !== null && now - previous < 1000 / 30 - 1) {
      frame = requestAnimationFrame(tick); return;
    }
    if (previous !== null) elapsed = Math.min(DURATION, elapsed + now - previous);
    previous = now; paint();
    if (elapsed >= DURATION) pause();
    else frame = requestAnimationFrame(tick);
  };
  function play() {
    if (disposed || playing || elapsed >= DURATION) return;
    previous = null; playing = true; onPlaying(true); frame = requestAnimationFrame(tick);
  }
  return {
    play, pause,
    reset() { pause(); elapsed = 0; paint(); },
    finish() { pause(); elapsed = DURATION; paint(); },
    get complete() { return elapsed >= DURATION; },
    dispose() { disposed = true; cancelAnimationFrame(frame); clip.remove(); },
  };
}
