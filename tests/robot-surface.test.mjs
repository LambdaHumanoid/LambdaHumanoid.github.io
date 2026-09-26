import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../app/robot-surface.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} }; vm.runInNewContext(code, context);
const { createRobotSurface } = context.exports;
const normal = (array, corner) => Array.from(array.slice(corner * 3, corner * 3 + 3));
const close = (a, b) => a.forEach((value, i) => assert(Math.abs(value - b[i]) < 1e-6));

test('nearby millimetre-scale surfaces do not contaminate one another’s normals', () => {
  const { normals } = createRobotSurface({
    positions: [0,0,0, .002,0,0, 0,.002,0, 0,0,.003, .002,0,.003, 0,.002,.004],
    indices: [0,1,2, 3,4,5],
  });
  for (let i = 0; i < 3; i++) close(normal(normals, i), [0,0,1]);
  for (let i = 3; i < 6; i++) close(normal(normals, i), [0,-1/Math.sqrt(5),2/Math.sqrt(5)]);
});

test('duplicated coincident corners smooth across a curved surface seam', () => {
  const { normals } = createRobotSurface({
    positions: [0,0,0, .002,0,0, 0,.002,0, .002,0,0, 0,0,0, 0,-.002,.001],
    indices: [0,1,2, 3,4,5],
  });
  close(normal(normals, 0), normal(normals, 4));
  close(normal(normals, 1), normal(normals, 3));
  assert(normal(normals, 0)[1] > 0);
});

test('right-angle mechanical edges remain sharp and triangle positions stay exact', () => {
  const source = { positions: [0,0,0, .002,0,0, 0,.002,0, 0,0,.002], indices: [0,1,2, 1,0,3] };
  const { positions, normals } = createRobotSurface(source);
  const original = new Float32Array(source.positions);
  assert.deepEqual(Array.from(positions), source.indices.flatMap(i => Array.from(original.slice(i * 3, i * 3 + 3))));
  for (let i = 0; i < 3; i++) close(normal(normals, i), [0,0,1]);
  for (let i = 3; i < 6; i++) close(normal(normals, i), [0,1,0]);
});
