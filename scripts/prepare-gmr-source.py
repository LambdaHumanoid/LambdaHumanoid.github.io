"""Export the displayed SMPL-X body (at original 30 Hz) for official GMR.

Uses the existing episode shape fit and original PICO body rotations. Finger
commands remain a separate synchronized Revo2 stream. No model weights exported.
"""
import json
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from scipy.spatial.transform import Rotation

from smpl_lbs import R_ALIGN, global_quats_to_local_R
from smplx_lbs import SMPLX

root = Path(__file__).resolve().parent.parent
destination = root / "work/gmr-sonic"
destination.mkdir(exist_ok=True)
model = SMPLX(root / "work/body-models/smplx/SMPLX_NEUTRAL.npz")
y_to_z = Rotation.from_euler("x", 90, degrees=True).as_matrix()
names = ["pelvis", "left_hip", "right_hip", "spine1", "left_knee",
         "right_knee", "spine2", "left_ankle", "right_ankle", "spine3",
         "left_foot", "right_foot", "neck", "left_collar", "right_collar",
         "head", "left_shoulder", "right_shoulder", "left_elbow",
         "right_elbow", "left_wrist", "right_wrist"]
for key in ["chair", "cart", "floor"]:
    metadata = json.loads((root / f"public/motion/{key}.json").read_text())
    raw = (root / f"work/motion-source/{key}.parquet" if key != "floor" else
           Path.home() / "Desktop/diverse-human/gallery-work/v1_0729/episode_000063.parquet")
    table = pq.read_table(raw, columns=["observation.pico.body_pose", "timestamp"])
    body = np.array(table["observation.pico.body_pose"].to_pylist()).reshape(-1, 24, 7)
    start, end = metadata["source"]["startFrame"], metadata["source"]["endFrameExclusive"]
    frames = np.arange(start, end)
    timestamps = np.array(table["timestamp"].to_pylist())[frames]
    model.set_shape(np.load(root / f"work/smplx-fit/{key}.npz")["betas"])
    positions, quaternions, minimums = [], [], []
    origin = body[start, 0, :3].copy()
    origin[1] = 0
    for f in frames:
        local = np.tile(np.eye(3), (55, 1, 1))
        local[:22] = global_quats_to_local_R(body[f, :, 3:])[:22]
        transforms = model.skeleton(local)
        positions.append(((transforms[:22, :3, 3] - model.J[0]) @ R_ALIGN
                          + body[f, 0, :3] - origin) @ y_to_z.T)
        quaternions.append(Rotation.from_matrix(y_to_z @ R_ALIGN @ transforms[:22, :3, :3])
                           .as_quat()[:, [3, 0, 1, 2]])
        # One floor height for the whole clip, preserving vertical motion.
        vertices, _ = model.forward(local)
        minimums.append(((vertices - model.J[0]) @ R_ALIGN + body[f, 0, :3])[:, 1].min())
    positions = np.array(positions)
    floor = np.percentile(minimums, 2)
    positions[:, :, 2] -= floor
    assert np.isfinite(positions).all() and np.isfinite(quaternions).all()
    assert np.all(np.diff(timestamps) > 0)
    np.savez_compressed(destination / f"{key}.human.npz", positions=positions,
                        quaternions=quaternions, names=names, source_frames=frames,
                        timestamps=timestamps - timestamps[0],
                        height=np.ptp(model.v[:, 1]), floor_offset=floor)
    print(key, len(frames), "frames", flush=True)
