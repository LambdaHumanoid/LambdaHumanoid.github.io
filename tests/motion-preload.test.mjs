import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../app/motion-preload.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function setup({ compressed = false } = {}) {
  const requests = [], failures = new Set();
  const context = { exports: {}, Response, Blob, DecompressionStream, TextDecoder, Int16Array, Uint8Array,
    navigator: { connection: {} }, document: { hidden: false },
    fetch: async url => {
      requests.push(url);
      if (failures.delete(url)) return new Response('', { status: 503 });
      if (url.endsWith('.json')) return Response.json({ vertexCount: 1, frameCount: 1, vertices: url.replace('.json', '.bin.gz') });
      const bytes = new Int16Array([1, 2, 3]);
      return new Response(compressed ? gzipSync(bytes) : bytes);
    },
  };
  vm.runInNewContext(code, context);
  return { ...context.exports, context, requests, failures };
}

test('motion preload and playback share one decoded sequence and in-flight request', async () => {
  const x = setup();
  const first = x.loadMotionClip('a'), second = x.loadMotionClip('a');
  assert.equal(first, second);
  const clip = await first;
  assert.deepEqual([...clip.vertices], [1, 2, 3]);
  assert.equal(await x.loadMotionClip('a'), clip);
  assert.equal(x.requests.length, 2);
});

test('raw gzip responses decode and failed preloads can retry', async () => {
  const x = setup({ compressed: true });
  x.failures.add('/motion/a.json');
  await assert.rejects(x.loadMotionClip('a'), /unavailable/);
  assert.deepEqual([...(await x.loadMotionClip('a')).vertices], [1, 2, 3]);
});

test('decoded mesh cache stays bounded while retaining recently used clips', async () => {
  const x = setup();
  for (const id of ['a', 'b', 'c', 'd']) await x.loadMotionClip(id);
  await x.loadMotionClip('a');
  await x.loadMotionClip('e');
  await x.loadMotionClip('a');
  assert.equal(x.requests.filter(url => url === '/motion/a.json').length, 1);
  await x.loadMotionClip('b');
  assert.equal(x.requests.filter(url => url === '/motion/b.json').length, 2);
});

test('speculation respects hidden tabs, data saver and slow connections', async () => {
  const x = setup();
  for (const connection of [{ saveData: true }, { effectiveType: '2g' }]) {
    x.context.navigator.connection = connection; x.preloadMotionClip('a');
  }
  x.context.navigator.connection = {}; x.context.document.hidden = true; x.preloadMotionClip('a');
  assert.equal(x.requests.length, 0);
  x.context.document.hidden = false; x.preloadMotionClip('a');
  await x.loadMotionClip('a');
  assert.equal(x.requests.length, 2);
});
