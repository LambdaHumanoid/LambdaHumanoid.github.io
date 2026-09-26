import { createRobotSurface } from "./robot-surface";
import type { RobotModel } from "./robot-model";

type SourcePart = { name: string; positions: number[]; indices: number[]; color: number[]; hand: number };
self.onmessage = async ({ data: url }: MessageEvent<string>) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Robot model unavailable");
    let bytes = await response.arrayBuffer();
    const head = new Uint8Array(bytes);
    if (head[0] === 0x1f && head[1] === 0x8b) {
      bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    const source: { parts: SourcePart[] } = JSON.parse(new TextDecoder().decode(bytes));
    const transfer: ArrayBuffer[] = [];
    const model: RobotModel = { parts: source.parts.map(part => {
      const { positions, normals } = createRobotSurface(part);
      transfer.push(positions.buffer as ArrayBuffer, normals.buffer as ArrayBuffer);
      const footPositions = part.name.includes("ankle_roll") ? new Float32Array(part.positions) : undefined;
      if (footPositions) transfer.push(footPositions.buffer);
      return { name: part.name, color: part.color, hand: part.hand, positions, normals, footPositions };
    }) };
    self.postMessage({ model }, { transfer });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Robot model unavailable" });
  }
};
