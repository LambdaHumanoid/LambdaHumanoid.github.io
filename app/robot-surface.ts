/** Smooth coincident corners without merging nearby millimetre-scale robot details. */
export function createRobotSurface(source: { positions: number[]; indices: number[] }, creaseAngle = Math.PI / 4) {
  const vertices = new Float32Array(source.positions);
  const indices = source.indices;
  const vertexCount = vertices.length / 3;
  const faceCount = indices.length / 3;
  const ids = new Int32Array(vertexCount);
  const coincident = new Map<string, number>();
  for (let i = 0; i < vertexCount; i++) {
    // The export already quantizes positions to 1 micrometre. Exact coordinates
    // join duplicated STL corners without smoothing across thin shells or gaps.
    const key = `${vertices[i * 3]},${vertices[i * 3 + 1]},${vertices[i * 3 + 2]}`;
    let id = coincident.get(key);
    if (id === undefined) { id = coincident.size; coincident.set(key, id); }
    ids[i] = id;
  }
  const offsets = new Int32Array(coincident.size + 1);
  for (const index of indices) offsets[ids[index] + 1]++;
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const cursors = offsets.slice(0, -1);
  const adjacent = new Int32Array(indices.length);
  const faceNormals = new Float64Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3;
    const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    faceNormals.set([nx / length, ny / length, nz / length], f * 3);
    for (let corner = 0; corner < 3; corner++) adjacent[cursors[ids[indices[f * 3 + corner]]]++] = f;
  }
  const positions = new Float32Array(indices.length * 3);
  const normals = new Float32Array(positions.length);
  const creaseDot = Math.cos(creaseAngle);
  for (let corner = 0; corner < indices.length; corner++) {
    const sourceIndex = indices[corner] * 3, out = corner * 3;
    positions.set(vertices.subarray(sourceIndex, sourceIndex + 3), out);
    const face = Math.floor(corner / 3) * 3, id = ids[indices[corner]];
    const nx = faceNormals[face], ny = faceNormals[face + 1], nz = faceNormals[face + 2];
    let x = 0, y = 0, z = 0;
    for (let k = offsets[id]; k < offsets[id + 1]; k++) {
      const other = adjacent[k] * 3;
      const ox = faceNormals[other], oy = faceNormals[other + 1], oz = faceNormals[other + 2];
      if (nx * ox + ny * oy + nz * oz > creaseDot) { x += ox; y += oy; z += oz; }
    }
    const length = Math.hypot(x, y, z);
    normals.set(length ? [x / length, y / length, z / length] : [nx, ny, nz], out);
  }
  return { positions, normals };
}
