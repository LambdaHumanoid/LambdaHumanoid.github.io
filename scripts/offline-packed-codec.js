import { gunzipSync } from 'fflate';

const fromBase64 = encoded => Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
function deliver(key, mime, bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  }
  globalThis.__offlineAsset(key, mime, btoa(chunks.join('')));
}
const readJSON = encoded => JSON.parse(new TextDecoder().decode(gunzipSync(fromBase64(encoded))));
let shared = {};
globalThis.__offlineSharedData = encoded => { shared = readJSON(encoded); };
globalThis.__offlineJSONAsset = (key, encoded) => {
  const value = readJSON(encoded);
  for (const [field, id] of Object.entries(value.__sharedFields || {})) value[field] = shared[id];
  delete value.__sharedFields;
  deliver(key, 'application/json', new TextEncoder().encode(JSON.stringify(value)));
};
globalThis.__offlineRobotAsset = (key, encoded) => {
  const bytes = gunzipSync(fromBase64(encoded));
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const model = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength)));
  const binary = bytes.subarray(4 + headerLength);
  for (const part of model.parts) {
    for (const field of ['positions', 'indices']) {
      const { offset, count } = part[field];
      const buffer = new Uint8Array(count * 4);
      for (let byte = 0; byte < 4; byte++) {
        for (let i = 0; i < count; i++) buffer[i * 4 + byte] = binary[offset + byte * count + i];
      }
      const values = field === 'positions' ? new Float32Array(buffer.buffer) : new Uint32Array(buffer.buffer);
      if (field === 'indices') for (let i = 1; i < count; i++) values[i] += values[i - 1];
      part[field] = Array.from(values);
    }
  }
  // JSON.stringify normally erases negative zero; preserve its Float32 sign bit.
  const json = JSON.stringify(model, (_key, value) => Object.is(value, -0) ? '__offline_negative_zero__' : value)
    .replaceAll('"__offline_negative_zero__"', '-0');
  deliver(key, 'application/json', new TextEncoder().encode(json));
};

// Synchronous decoding preserves the existing offline script loader's lifecycle.
// Delta coding restores every original int16 value, without changing precision.
globalThis.__offlinePackedAsset = (key, mime, encoded, stride = 0) => {
  const binary = atob(encoded);
  const packed = Uint8Array.from(binary, c => c.charCodeAt(0));
  let bytes = gunzipSync(packed);
  if (stride) {
    const n = bytes.length / 2;
    const values = new Uint16Array(n);
    for (let i = 0; i < n; i++) values[i] = bytes[i] | (bytes[n + i] << 8);
    for (let start = 0; start < n; start += stride) {
      for (let i = start + 3; i < start + stride; i++) values[i] += values[i - 3];
    }
    for (let i = stride; i < n; i++) values[i] += values[i - stride];
    bytes = new Uint8Array(values.buffer);
  }
  deliver(key, mime, bytes);
};
