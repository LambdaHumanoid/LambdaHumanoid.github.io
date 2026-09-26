import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/motion/', import.meta.url);
const clips = JSON.parse(await readFile(new URL('gallery.json', root), 'utf8'));

test('human gallery offers distinct activities with full two-hand coverage', () => {
  assert(clips.length >= 20);
  assert.equal(new Set(clips.map(c => c.id)).size, clips.length);
  assert.equal(new Set(clips.map(c => `${c.collection ?? 'v1_0729'}/${c.episode}`)).size, clips.length);
  assert.equal(new Set(clips.map(c => c.task)).size, clips.length);
  for (const c of clips) {
    const n = c.handCoverage.frameCount;
    assert(n >= 60 && n <= 240);
    assert.deepEqual(c.handCoverage.dynhamrValidFrames, [n, n]);
    assert.equal(c.handCoverage.bothValidFrames, n);
    assert.equal(c.handCoverage.bodyValidFrames, n);
    assert(c.quality.bodyDegrees[0] <= 15);
    assert(c.quality.fingerDegrees[0] <= 25);
    assert(c.quality.rootCm[0] <= 8);
    assert(c.locomotion.horizontalTravelMeters >= .45);
    assert(Math.max(...c.locomotion.footHorizontalExcursionMeters) >= .2);
    assert(Math.max(...c.locomotion.ankleExcursionMeters) >= .12);
    assert(c.locomotion.maxRootAccelerationMetersPerFrameSquared <= .02);
  }
});

for (const clip of clips) {
  test(`${clip.id}: synchronized SMPL + native MANO with neutral shape and original finger rotations`, async () => {
    const d = JSON.parse(await readFile(new URL(clip.metadata.replace('/motion/', ''), root), 'utf8'));
    assert.equal(d.source.episode, clip.episode);
    assert.equal(d.source.task, clip.task);
    assert.equal(d.duration, clip.duration);
    assert.equal(d.duration, (d.source.endFrameExclusive - d.source.startFrame) / 30);
    assert.equal(d.times.length, d.frameCount);
    assert.equal(d.times[0], 0);
    assert(Math.abs(d.times.at(-1) - (d.duration - 1 / 30)) < 1e-6);
    assert(d.times.every((t, i) => i === 0 || t > d.times[i - 1]));
    assert.equal(d.model, 'SMPL + MANO');
    assert.equal(d.vertexCount, 6826);
    assert.equal(d.faces.length, (2 * d.vertexCount - 4) * 3);
    assert(d.faces.every(i => Number.isInteger(i) && i >= 0 && i < d.vertexCount));
    assert.equal(d.hands.stitchedCuffs, false);
    assert.equal(d.hands.weldedWrists, true);
    assert.equal(d.hands.attachmentVersion, 2);
    const bodyIndices = new Set(d.faces.slice(0, d.hands.groups[0]));
    for (let side = 0; side < 2; side++) {
      assert.equal(d.hands.weldedVertexPairs[side].length, 16);
      for (const [,shared] of d.hands.weldedVertexPairs[side]) {
        assert(bodyIndices.has(shared));
        assert(d.hands.vertexGroups[side].includes(shared));
      }
    }
    assert.equal(d.hands.watertight, true);
    // Independently verify every edge is shared twice with opposite winding.
    const edges = new Map();
    for (let i = 0; i < d.faces.length; i += 3) {
      const f = d.faces.slice(i, i + 3);
      for (let j = 0; j < 3; j++) {
        const a = f[j], b = f[(j + 1) % 3], key = `${Math.min(a,b)},${Math.max(a,b)}`;
        const e = edges.get(key) ?? [0, 0];
        e[0]++; e[1] += a < b ? 1 : -1; edges.set(key, e);
      }
    }
    for (const [count, winding] of edges.values()) { assert.equal(count, 2); assert.equal(winding, 0); }
    assert.equal(d.hands.verticesPerHand, 778);
    assert(d.hands.vertexGroups.every(g => g.length === 778));
    assert.equal(d.hands.groups.reduce((a,b) => a+b, 0), d.faces.length);
    assert.equal(d.hands.valid.length, d.frameCount);
    assert(d.hands.valid.every(v => v.length === 2 && v.every(Boolean)));
    assert(d.joints.every(j => j.length === 72 && j.every(Number.isFinite)));
    assert(d.hands.joints.every(j => j.length === 126 && j.every(Number.isFinite)));
    assert.deepEqual(d.handCoverage, clip.handCoverage);
    assert.deepEqual(d.quality, clip.quality);
    assert.deepEqual(d.locomotion, clip.locomotion);
    // Verify travel is present in the exported pelvis trajectory, not just metadata.
    const samples = d.times.flatMap((t,i) => Math.round(t*30)%6 === 0 ? [i] : []);
    if(samples.at(-1) !== d.frameCount-1) samples.push(d.frameCount-1);
    let travel = 0;
    for(let i=1;i<samples.length;i++) {
      const a=d.joints[samples[i-1]], b=d.joints[samples[i]];
      travel += Math.hypot(b[0]-a[0],b[2]-a[2]);
    }
    assert(Math.abs(travel-d.locomotion.horizontalTravelMeters)<1e-6);
    assert.deepEqual(d.source.replacedInvalidFrames, []);
    for (const sha of Object.values(d.source.sha256)) assert.match(sha, /^[a-f0-9]{64}$/);
    assert.equal(d.hands.poseRefitted, false);
    assert.equal(d.hands.poseFiltered, false);
    assert.equal(d.hands.meanAdded, false);
    assert.equal(d.hands.scale, 1);
    assert.equal(d.hands.sourceBetasUsed, false);
    assert.deepEqual(d.hands.shapeBetas, Array(10).fill(0));
    assert(d.hands.maxNeutralBoneLengthErrorMeters < 1e-9);
    assert.equal(d.hands.maxJointReconstructionErrorMeters, undefined);
    assert.equal(d.hands.bonePairs.length, 15);
    for (const row of d.hands.joints) {
      for (let side = 0; side < 2; side++) {
        d.hands.bonePairs.forEach(([a,b], i) => {
          const ai = side * 63 + a * 3, bi = side * 63 + b * 3;
          const length = Math.hypot(...[0,1,2].map(k => row[bi+k] - row[ai+k]));
          assert(Math.abs(length - d.hands.neutralBoneLengthsMeters[i]) < 1e-9);
        });
      }
    }
    assert(d.hands.maxRigidVertexErrorMeters < 1e-9);
    assert.equal(d.fit, undefined);
    const bytes = gunzipSync(await readFile(new URL(`${clip.id}.vertices.bin.gz`, root)));
    assert.equal(bytes.length, d.vertexCount * d.frameCount * 3 * 2);
    const vertices = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity, max = -Infinity;
      for (let i = axis; i < vertices.length; i += 3) { min = Math.min(min, vertices[i] * d.quantization); max = Math.max(max, vertices[i] * d.quantization); }
      assert(Math.abs(min - d.bounds.min[axis]) < .00006);
      assert(Math.abs(max - d.bounds.max[axis]) < .00006);
    }
    const videoPath = fileURLToPath(new URL(`${clip.id}.mp4`, root));
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,r_frame_rate', '-of', 'json', videoPath])).streams[0];
    assert.equal(probe.r_frame_rate, '30/1');
    assert.equal(Number(probe.nb_frames), d.handCoverage.frameCount);
    assert((await readFile(new URL(`${clip.id}.jpg`, root))).length > 1000);
  });
}
