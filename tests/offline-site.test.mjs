import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const root = new URL('../offline-site/', import.meta.url);
test('GitHub Pages root serves the project directly with local resources', async () => {
  const siteRoot = new URL('../', import.meta.url);
  const html = await readFile(new URL('index.html', siteRoot), 'utf8');
  assert.equal(html, await readFile(new URL('index.html', root), 'utf8'));
  assert.doesNotMatch(html, /location\.replace|http-equiv="refresh"/);
  const assets = [...html.matchAll(/(?:src|href|poster)="(\.\/[^"?#]+)(?:\?[^"#]*)?"/g)].map(match => match[1]);
  for (const asset of new Set(assets)) await access(new URL(asset, siteRoot));
});

test('offline page has local resources, nine demos, and neutral project branding', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<title>Scaling Egocentric Human Data for General Humanoid Control<\/title>/);
  assert.doesNotMatch(html, /ICLR|Anonymous submission|Anonymous Authors|submission-badge|submission-footer/i);
  assert.doesNotMatch(html, /Video coming soon/);
  assert.equal((html.match(/href="\.\/paper\.pdf"/g) ?? []).length, 3);
  assert.equal((html.match(/class="demo-video"/g) ?? []).length, 9);
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:\?[^"#]*)?"/g)].map(match => match[1]);
  assert(assets.length > 20);
  for (const asset of new Set(assets)) await access(new URL(asset, root));
  for (const asset of ['offline/page.js', 'offline/page.css']) {
    const text = await readFile(new URL(asset, root), 'utf8');
    assert.doesNotMatch(text, /Anonymous submission|ICLR 2027|submission-badge|submission-footer/);
  }
});

test('all packed offline recordings restore original metadata and every mesh coordinate', async () => {
  const delivered = new Map();
  const context = vm.createContext({
    atob, btoa, Uint8Array, Uint16Array, Uint32Array, Float32Array, DataView, TextDecoder, TextEncoder,
    __offlineAsset(key, _mime, encoded) { delivered.set(key, Buffer.from(encoded, 'base64')); },
  });
  for (const asset of ['offline/packed-codec.js', 'offline/shared.js']) {
    vm.runInContext(await readFile(new URL(asset, root), 'utf8'), context);
  }
  const clips = JSON.parse(await readFile(new URL('../public/motion/gallery.json', import.meta.url), 'utf8'));
  for (const clip of clips) {
    const metadataKey = `motion/${clip.id}.json`;
    vm.runInContext(await readFile(new URL(`offline/assets/motion--${clip.id}.json.js`, root), 'utf8'), context);
    const original = JSON.parse(await readFile(new URL(`../public/${metadataKey}`, import.meta.url), 'utf8'));
    const restored = JSON.parse(delivered.get(metadataKey));
    assert.deepEqual(restored, original);
    const key = original.vertices.replace(/^\//, '');
    vm.runInContext(await readFile(new URL(`offline/assets/${key.replaceAll('/', '--')}.js`, root), 'utf8'), context);
    const expected = gunzipSync(await readFile(new URL(`../public/${key}`, import.meta.url)));
    assert.deepEqual(delivered.get(key), expected, clip.id);
    delivered.clear();
  }
});

test('every listed recording has an offline poster, video, metadata and mesh', async () => {
  const clips = [];
  for (const file of ['gallery.json', 'clips.json']) {
    clips.push(...JSON.parse(await readFile(new URL(`../public/motion/${file}`, import.meta.url), 'utf8')));
  }
  for (const clip of clips) {
    const metadata = JSON.parse(await readFile(new URL(`../public/motion/${clip.id}.json`, import.meta.url), 'utf8'));
    await access(new URL(`motion/${clip.id}.jpg`, root));
    for (const key of [`motion/${clip.id}.json`, `motion/${clip.id}.mp4`, metadata.vertices.replace(/^\//, '')]) {
      await access(new URL(`offline/assets/${key.replaceAll('/', '--')}.js`, root));
    }
  }
});
