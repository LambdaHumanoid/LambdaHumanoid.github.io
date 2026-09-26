import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const root = new URL("../public/motion/", import.meta.url);
const clips = JSON.parse(await readFile(new URL("clips.json", root), "utf8"));
for (const clip of clips) {
  test(`${clip.id}: mesh samples and trimmed video use the same source timeline`, async () => {
    const data = JSON.parse(await readFile(new URL(`${clip.id}.json`, root), "utf8"));
    const bytes = gunzipSync(await readFile(new URL(`${clip.id}.vertices.bin.gz`, root)));
    assert.equal(bytes.length, data.vertexCount * data.frameCount * 3 * 2);
    assert.equal(data.times.length, data.frameCount);
    assert.equal(data.joints.length, data.frameCount);
    assert.equal(data.times[0], 0);
    assert(Math.abs(data.times.at(-1) - (data.duration - 1 / 30)) < 1e-6);
    assert.equal(data.duration, (data.source.endFrameExclusive - data.source.startFrame) / data.fps);
    assert.equal(data.duration, clip.duration);
    assert(data.faces.every(i => Number.isInteger(i) && i >= 0 && i < data.vertexCount));
    assert(data.footVertices.length > 0);
    assert(data.footVertices.every(i => Number.isInteger(i) && i >= 0 && i < data.vertexCount));
    assert(data.joints.every(j => j.length === 72 && j.every(Number.isFinite)));
    assert(data.times.every((time, i) => !i || time > data.times[i - 1]));
    const video = await readFile(new URL(`${clip.id}.mp4`, root));
    assert.equal(video.toString("ascii", 4, 8), "ftyp");
  });
}

const robotModel = JSON.parse(gunzipSync(await readFile(new URL('g1-revo2.model.json.gz', root))));
for (const clip of clips) {
  test(`${clip.id}: measured hands and robot share source frames and preserve missing-data masks`, async () => {
    const human = JSON.parse(await readFile(new URL(`${clip.id}.json`, root), 'utf8'));
    const robot = JSON.parse(gunzipSync(await readFile(new URL(`${clip.id}.robot.json.gz`, root))));
    assert.deepEqual(robot.times, human.times);
    assert.equal(robot.source.episode, human.source.episode);
    assert.equal(robot.source.pipeline.encoder, 'g1');
    assert.equal(robot.source.pipeline.support, 'none');
    assert.match(robot.source.rolloutSha256, /^[a-f0-9]{64}$/);
    assert.match(robot.source.body, /GMR.*SONIC/);
    assert.equal(robot.source.renderGrounding, 'Fixed simulation ground; no per-frame vertical correction');
    assert.equal(robot.partCount, robotModel.parts.length);
    assert.equal(robot.poses.length, human.frameCount);
    assert.equal(human.hands.groups.reduce((a,b)=>a+b), human.faces.length);
    assert.equal(human.model, 'SMPL-X');
    assert.equal(human.vertexCount, 10475);
    assert.equal(human.hands.continuousNativeTopology, true);
    assert(human.hands.fitMedianJointErrorMeters < .012);
    assert(human.hands.fitMaxJointErrorMeters < .03);
    for (const vertices of human.hands.vertexGroups) assert(vertices.length > 500);
    assert.equal(human.hands.valid.length, human.frameCount);
    assert(human.footGroups.every(group => group.length && group.every(v => human.footVertices.includes(v))));
    robot.poses.forEach((pose, frame) => {
      assert.equal(pose.length, robot.partCount * 7);
      assert(pose.every(Number.isFinite));
      assert.equal(robot.sourceFrames[frame], human.source.startFrame + Math.round(human.times[frame]*30));
      for(let k=0;k<robot.partCount;k++)assert(Math.abs(Math.hypot(...pose.slice(k*7+3,k*7+7))-1)<1e-5);
      assert(robot.handCommands[frame].every(v=>v>=0&&v<=1));
      assert.deepEqual(robot.handValid[frame],human.hands.valid[frame]);
    });
    assert(robot.poses.some(p=>p.some((v,i)=>Math.abs(v-robot.poses[0][i])>.01)));
  });
}
test('G1 uses articulated Revo2 visual meshes on both wrists',()=>{
  for(const side of [0,1])assert(robotModel.parts.filter(p=>p.hand===side).length>=10);
  assert(!robotModel.parts.some(p=>p.name.includes('rubber_hand')));
  robotModel.parts.forEach(p=>{assert(p.positions.every(Number.isFinite));assert(p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<p.positions.length/3));});
});

test('Revo2 mounts align fingers and mirrored thumb sides with the GMR wrist frames', async () => {
  const mount = robotModel.handMount;
  assert.equal(mount.version, 2);
  const apply = (m, v) => m.map(row => row.reduce((sum, x, i) => sum + x * v[i], 0));
  const close = (actual, expected) => actual.forEach((x, i) => assert(Math.abs(x - expected[i]) < 1e-12));
  for (const side of [0, 1]) {
    const m = mount.rotationMatrices[side];
    close(apply(m, [0, 0, 1]), [1, 0, 0]); // fingers continue along the wrist
    close(apply(m, [0, side === 0 ? -1 : 1, 0]), [0, 0, 1]); // thumb side
    close(apply(m, [1, 0, 0]), [0, side === 0 ? -1 : 1, 0]); // mirrored palm normals
  }
  for (const clip of clips) {
    const data = JSON.parse(gunzipSync(await readFile(new URL(`${clip.id}.robot.json.gz`, root))));
    assert.deepEqual(data.handMount, mount);
  }
});

test('G1 retains original shell geometry and distinct dark materials', () => {
  assert.match(robotModel.geometryQuality, /no decimation/);
  const torso = robotModel.parts.find(p => p.name === 'torso_link');
  assert(torso.indices.length / 3 > 40000);
  assert(robotModel.parts.some(p => p.hand < 0 && p.color[0] < .3));
  assert(robotModel.parts.some(p => p.hand < 0 && p.color[0] > .6));
});
test('SMPL-X wrist rings connect the hands to the body without added cuff geometry', async () => {
  const data = JSON.parse(await readFile(new URL('floor.json', root), 'utf8'));
  const neighbors = Array.from({length:data.vertexCount},()=>new Set());
  for(let i=0;i<data.faces.length;i+=3){ const a=data.faces[i],b=data.faces[i+1],c=data.faces[i+2]; neighbors[a].add(b).add(c);neighbors[b].add(a).add(c);neighbors[c].add(a).add(b); }
  const seen=new Set([data.footVertices[0]]),queue=[...seen];
  for(let i=0;i<queue.length;i++)for(const n of neighbors[queue[i]])if(!seen.has(n)){seen.add(n);queue.push(n);}
  for(const group of data.hands.vertexGroups)assert(group.every(i=>seen.has(i)));
  assert.equal(data.faces.length/3,20908);
});

test('human display refinement smooths fingers and leaves a checked body clearance', async () => {
  for (const clip of clips) {
    const d = JSON.parse(await readFile(new URL(`${clip.id}.json`, root), 'utf8'));
    const r = d.fit.displayRefinement;
    assert(r, `${clip.id} has no refinement report`);
    assert(r.filteredAngularEnergy < r.rawAngularEnergy * .3);
    assert(r.minKeyframeClearanceMeters.every(x => x >= .015));
    assert(r.minInterpolatedClearanceMeters.every(x => x >= .006));
    assert(r.maxWristDisplacementMeters.every(x => x < .3));
    assert.equal(d.hands.gapFilling.method, 'SLERP after valid-only smoothing');
    assert.equal(d.hands.gapFilling.validMaskUnchanged, true);
    assert.equal(d.hands.gapFilling.edgePolicy, 'nearest valid');
  }
});
test('Revo2 filtering smooths valid motor commands and fills missing observations', async () => {
  let filled = 0;
  for (const clip of clips) {
    const r = JSON.parse(gunzipSync(await readFile(new URL(`${clip.id}.robot.json.gz`, root))));
    assert.equal(r.handSmoothing.sigmaSeconds, .08);
    assert.equal(r.handSmoothing.gapFilling.method, 'Linear interpolation after valid-only smoothing');
    assert.equal(r.handSmoothing.gapFilling.validMaskUnchanged, true);
    let original = 0, filtered = 0;
    r.handCommands.forEach((row,i) => row.forEach((v,j) => {
      const side=Math.floor(j/6);
      if(!r.handValid[i][side] && Math.abs(v-r.rawHandCommands[i][j])>1e-6)filled++;
      if(i && r.handValid[i][side] && r.handValid[i-1][side]) {
        original+=(r.rawHandCommands[i][j]-r.rawHandCommands[i-1][j])**2;
        filtered+=(v-r.handCommands[i-1][j])**2;
      }
    }));
    assert(filtered<original*.3);
  }
  assert(filled>0, 'Missing observations should use valid poses instead of original invalid commands');
});
