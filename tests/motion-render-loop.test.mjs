import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../app/motion-render-loop.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function setup() {
  const callbacks = new Map(); let serial = 0, intersection, resize;
  const document = Object.assign(new EventTarget(), { hidden: false });
  const video = Object.assign(new EventTarget(), { paused: true, currentTime: 0 });
  const controls = Object.assign(new EventTarget(), { update() {} });
  const context = {
    exports: {}, document,
    requestAnimationFrame(fn) { callbacks.set(++serial, fn); return serial; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
  };
  vm.runInNewContext(code, context);
  const draws = [];
  const loop = context.exports.createMotionRenderLoop({}, video, controls, (time, changed) => draws.push({time, changed}));
  return { video, controls, document, draws, loop, callbacks,
    visible(value) { intersection([{ isIntersecting: value }]); },
    resize() { resize(); },
    tick(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(now)); },
  };
}
test('paused scenes sleep, but still render seeking and camera/size changes', () => {
  const x = setup(); assert.equal(x.callbacks.size, 0);
  x.visible(true); x.tick(0); assert.deepEqual(x.draws, [{time:0,changed:true}]);
  assert.equal(x.callbacks.size, 0);
  x.controls.dispatchEvent(new Event('change')); x.tick(16);
  assert.deepEqual(x.draws.at(-1), {time:0,changed:false});
  x.video.currentTime = 3; x.video.dispatchEvent(new Event('seeked')); x.tick(32);
  assert.deepEqual(x.draws.at(-1), {time:3,changed:true});
  x.resize(); x.tick(48); assert.equal(x.draws.length, 4); assert.equal(x.callbacks.size, 0);
  x.loop.dispose();
});
test('120 Hz screens do not drive 120 pose updates; offscreen/background work stops', () => {
  const x = setup(); x.visible(true); x.video.paused = false; x.video.dispatchEvent(new Event('play'));
  for(let i=0;i<120;i++){x.video.currentTime=i/120;x.tick(i*1000/120);}
  assert(x.draws.length >= 29 && x.draws.length <= 31);
  x.visible(false); assert.equal(x.callbacks.size,0);
  x.visible(true); x.tick(1100); assert(x.callbacks.size>0);
  x.document.hidden=true; x.document.dispatchEvent(new Event('visibilitychange')); assert.equal(x.callbacks.size,0);
  x.document.hidden=false; x.document.dispatchEvent(new Event('visibilitychange')); x.tick(1200);
  x.video.paused=true; x.video.dispatchEvent(new Event('pause')); x.tick(1250); assert.equal(x.callbacks.size,0);
  x.loop.dispose(); x.video.dispatchEvent(new Event('play')); x.controls.dispatchEvent(new Event('change'));
  assert.equal(x.callbacks.size,0);
});
