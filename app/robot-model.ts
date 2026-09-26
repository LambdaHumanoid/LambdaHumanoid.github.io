import RobotModelWorker from "./robot-model.worker?worker";

export type RobotModel = {
  parts: {
    name: string; positions: Float32Array; normals: Float32Array;
    footPositions?: Float32Array; color: number[]; hand: number;
  }[];
};

type WorkerResult = { model: RobotModel } | { error: string };
// One immutable model for the page. Clip changes reuse the decoded typed arrays;
// each scene still owns and disposes its own GPU buffers and materials.
let pending: Promise<RobotModel> | undefined;
export function loadRobotModel(): Promise<RobotModel> {
  if (!pending) {
    pending = new Promise<RobotModel>((resolve, reject) => {
      const worker = new RobotModelWorker();
      worker.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
        worker.terminate();
        if ("error" in data) reject(new Error(data.error));
        else resolve(data.model);
      };
      worker.onerror = event => { worker.terminate(); reject(new Error(event.message || "Robot model unavailable")); };
      worker.postMessage("/motion/g1-revo2.model.json.gz");
    }).catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
