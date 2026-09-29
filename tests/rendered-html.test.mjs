import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const gallery = JSON.parse(readFileSync(new URL("../public/motion/gallery.json", import.meta.url)));

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the research project page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // Inspect rendered markup, excluding the duplicate text in hydration payloads.
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.match(html, /Towards a General Humanoid/);
  assert.match(html, /HumanVerse-500/);
  assert.match(html, /Read the paper/);
  assert.equal((html.match(/class="demo-scene"/g) ?? []).length, 3);
  assert.equal((html.match(/class="demo-video"/g) ?? []).length, 9);
  assert.equal((html.match(/Video coming soon/g) ?? []).length, 0);
  for (const [scene, count] of [["laboratory", 4], ["break-room", 3], ["visitor-center", 2]]) {
    for (let index = 1; index <= count; index++) {
      assert.equal((html.match(new RegExp(`id="${scene}-0${index}"`, "g")) ?? []).length, 1);
    }
  }
  assert.match(html, /break-room-heading/);
  assert.doesNotMatch(html, /id="break-room-04"|次优/);
  assert.match(html, /<details class="research-details" open=""/);
  assert.doesNotMatch(html, /src=""/);
  assert.match(html, /HumanVerse in motion/);
  assert.match(html, new RegExp(`Choose from ${gallery.length} human recordings`));
  assert.doesNotMatch(html, /View all|Hand tracking coverage|Unobserved hands|s excerpt|m travel|Left hand:|Right hand:/);
  assert.match(html, /motion\/capture-066\.mp4/);
  assert.match(html, /From human motion to G1/);
  assert(html.indexOf('From human motion to G1') > html.indexOf('HumanVerse in motion'));
  assert.match(html, /GMR retargeting → SONIC/);
  assert.match(html, /Motion timeline/);
  assert.match(html, /motion\/chair\.mp4/);
  assert.match(html, /80\.4/);
  assert.match(html, /62\.5/);
  assert.match(html, /59\.9/);
  assert.match(html, /are pending/);
  // Ignore SVG coordinates when checking obsolete names and reported scores.
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /EgoSoma|70\.1/);
  assert.match(html, /Evaluation results/);
  assert.match(html, /Scaling animation controls/);
  assert.match(html, /Scaling animation timeline/);
  assert.match(html, /Human-data scaling: validation loss/);
  assert.doesNotMatch(html, /HumanVerse animation controls/);
  assert.doesNotMatch(html, /humanverse-animated\.svg/);
  assert.match(html, /src="\/figures\/humanverse.webp"/);
  assert.doesNotMatch(html, /Human experience → humanoid control/);

  assert.doesNotMatch(html, /ICLR 2027 submission|Anonymous authors/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});
