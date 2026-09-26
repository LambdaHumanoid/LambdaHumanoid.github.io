"""Offline official GMR -> SONIC G1 encoder -> free-base MuJoCo rollout.

Run inside the isolated remote task directory containing upstream GMR's
general_motion_retargeting/, assets/, the existing pipeline/ controller and
*.human.npz from prepare-gmr-source.py. CPU only; never connects to hardware.
"""
import argparse
import hashlib
import json
import sys
import types
from pathlib import Path

import mujoco
import numpy as np
import torch
from scipy.interpolate import interp1d
from scipy.spatial.transform import Rotation, Slerp

parser = argparse.ArgumentParser()
parser.add_argument("--work", type=Path, required=True)
parser.add_argument("--sonic", type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.work))
# Load upstream's unchanged solver without importing its optional GUI/VR stack.
package = types.ModuleType("general_motion_retargeting")
package.__path__ = [str(args.work / "general_motion_retargeting")]
sys.modules[package.__name__] = package
from general_motion_retargeting.motion_retarget import GeneralMotionRetargeting
from pipeline.sonic_decoder import _load_decoder_state
from pipeline.sonic_encoder import SonicSMPLMotionEncoder
from pipeline.sonic_mujoco_rollout import (
    G1MujocoController, JOINT_NAMES, MUJOCO_INDEX_FOR_ISAAC,
    _history_observation, CONTROL_DT, SIM_DT,
)

torch.set_num_threads(2)
checkpoint = args.sonic / "sonic_release/last.pt"
state = _load_decoder_state(checkpoint)

def network(prefix):
    layers = []
    indices = sorted(int(k.removeprefix(prefix).split(".")[0]) for k in state
                     if k.startswith(prefix) and k.endswith(".weight"))
    for i, index in enumerate(indices):
        weight = state[f"{prefix}{index}.weight"]
        layer = torch.nn.Linear(weight.shape[1], weight.shape[0])
        layer.weight.data.copy_(weight)
        layer.bias.data.copy_(state[f"{prefix}{index}.bias"])
        layers.append(layer)
        if i < len(indices) - 1:
            layers.append(torch.nn.SiLU())
    return torch.nn.Sequential(*layers).eval().requires_grad_(False)

encoder = network("actor_module.encoders.g1.module.")
decoder = network("actor_module.decoders.g1_dyn.module.")
assert encoder[0].in_features == 640 and encoder[-1].out_features == 64
assert decoder[0].in_features == 994 and decoder[-1].out_features == 29
del state
scene = args.sonic / "gear_sonic_deploy/g1/scene_29dof.xml"
model = mujoco.MjModel.from_xml_path(str(scene))
model.opt.timestep = SIM_DT

for key in ["chair", "cart", "floor"]:
    source = np.load(args.work / f"{key}.human.npz")
    positions, quaternions = source["positions"], source["quaternions"]
    time = source["timestamps"]
    assert np.isfinite(positions).all() and np.isfinite(quaternions).all()
    retargeter = GeneralMotionRetargeting("smplx", "unitree_g1",
                                         actual_human_height=float(source["height"]), verbose=False)
    def human_frame(i):
        return {str(name): (positions[i, j].copy(), quaternions[i, j].copy())
                for j, name in enumerate(source["names"])}
    for _ in range(20):
        retargeter.retarget(human_frame(0))
    qpos = np.stack([retargeter.retarget(human_frame(i)) for i in range(len(time))])
    # Match by name, never assume GMR and SONIC joint order are interchangeable.
    addresses = [retargeter.model.jnt_qposadr[
        mujoco.mj_name2id(retargeter.model, mujoco.mjtObj.mjOBJ_JOINT, name)]
        for name in JOINT_NAMES]
    qpos = np.c_[qpos[:, :7], qpos[:, addresses]]
    # Constant heading/origin normalization only; preserve all root displacement.
    yaw = Rotation.from_quat(qpos[0, [4, 5, 6, 3]]).as_euler("xyz")[2]
    heading = Rotation.from_euler("z", -yaw)
    origin = qpos[0, :3].copy(); origin[2] = 0
    qpos[:, :3] = heading.apply(qpos[:, :3] - origin)
    qpos[:, 3:7] = (heading * Rotation.from_quat(qpos[:, [4, 5, 6, 3]])).as_quat()[:, [3, 0, 1, 2]]
    np.savez_compressed(args.work / f"{key}.gmr.npz", qpos=qpos, timestamps=time,
                        source_frames=source["source_frames"], joint_names=JOINT_NAMES)
    print(key, "GMR complete", "root height", qpos[:, 2].min(), qpos[:, 2].max(), flush=True)
    joint_positions = qpos[:, 7:][:, MUJOCO_INDEX_FOR_ISAAC]
    joint_velocities = np.gradient(joint_positions, time, axis=0)
    q_interpolate = interp1d(time, joint_positions, axis=0)
    dq_interpolate = interp1d(time, joint_velocities, axis=0)
    root_interpolate = Slerp(time, Rotation.from_quat(qpos[:, [4, 5, 6, 3]]))
    controller = G1MujocoController(model)
    controller.data.qpos[:7] = qpos[0, :7]
    controller.data.qpos[controller.joint_qpos] = qpos[0, 7:]
    mujoco.mj_forward(model, controller.data)
    # Initialize on the real contact plane using collision geometry, then run
    # an unassisted 1 s frozen-reference settling period (excluded from playback).
    foot_ids = [i for i in range(model.ngeom) if "ankle_roll" in
                (mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, model.geom_bodyid[i]) or "")
                and model.geom_contype[i] and model.geom_type[i] == mujoco.mjtGeom.mjGEOM_SPHERE]
    if foot_ids:
        bottom = min(controller.data.geom_xpos[i, 2] - model.geom_size[i, 0] for i in foot_ids)
        controller.data.qpos[2] += .002 - bottom
        mujoco.mj_forward(model, controller.data)
    histories = [np.zeros((10, n), np.float32) for n in [3, 29, 29, 29, 3]]
    last_action = np.zeros(29, np.float32)
    recorded, tokens, applied, heights, gravity, tick_times = [], [], [], [], [], []
    for tick in range(-50, int(np.ceil(time[-1] / CONTROL_DT)) + 1):
        now = max(tick, 0) * CONTROL_DT
        observation = controller.observe()
        future = np.clip(now + np.arange(10) * .1, time[0], time[-1])
        q, dq = q_interpolate(future), dq_interpolate(future)
        if tick < 0:
            future[:] = 0
            q = q_interpolate(future); dq = np.zeros_like(q)
        relative = Rotation.from_quat(np.asarray(observation["base_quaternion"])[[1, 2, 3, 0]]).inv() * root_interpolate(future)
        orientation = relative.as_matrix()[:, :, :2].reshape(10, 6)
        # Exact upstream command_multi_future -> nonflat reshape -> cat order:
        # flatten ALL q frames, then ALL dq frames, reshape (10,58), append R6.
        command = np.concatenate([q.reshape(-1), dq.reshape(-1)]).reshape(10, 58)
        encoder_input = np.c_[command, orientation].reshape(1, 640).astype(np.float32)
        with torch.inference_mode():
            latent = encoder(torch.from_numpy(encoder_input))
            token = SonicSMPLMotionEncoder._fsq_32(latent).numpy()[0]
        values = [observation["base_angular_velocity"], observation["q_isaac_relative"],
                  observation["dq_isaac"], last_action, observation["projected_gravity"]]
        for history, value in zip(histories, values):
            history[:-1] = history[1:]; history[-1] = value
        with torch.inference_mode():
            action = decoder(torch.from_numpy(_history_observation(token, *histories))[None]).numpy()[0]
        assert np.isfinite(action).all()
        if tick >= 0:
            recorded.append(observation["floating_qpos"])
            tokens.append(token.copy()); applied.append(action.copy())
            heights.append(observation["pelvis_height"])
            gravity.append(observation["projected_gravity"])
            tick_times.append(now)
        controller.step(action, elastic_band=False)
        last_action = action
    recorded, gravity = np.array(recorded), np.array(gravity)
    sampling = np.searchsorted(tick_times, time - 1e-9)
    fallen = (recorded[:, 2] < .2) | (gravity[:, 2] > -.25)
    result = dict(qpos=recorded[sampling], timestamps=time, joint_names=JOINT_NAMES,
                  source_frames=source["source_frames"], fallen=fallen[sampling],
                  control_qpos=recorded, control_times=tick_times, control_fallen=fallen,
                  motion_token=np.array(tokens), wbc_action=np.array(applied),
                  projected_gravity=gravity, sim_dt=SIM_DT, control_dt=CONTROL_DT,
                  pipeline_version="gmr-smplx-g1-sonic-g1-dyn-v1", support_mode="free")
    np.savez_compressed(args.work / f"{key}.sonic.npz", **result)
    print(key, "SONIC complete", "fallen", int(fallen.sum()), 
          "height", float(recorded[:, 2].min()), float(recorded[:, 2].max()), flush=True)

manifest = dict(pipeline="SMPL-X → official GMR unitree_g1 → SONIC g1 encoder / FSQ / g1_dyn → MuJoCo",
                gmrCommit="bb1bbe40774794fceb2a7c579a3464a28e68c844",
                checkpointSha256=hashlib.file_digest(checkpoint.open("rb"), "sha256").hexdigest(),
                controlHz=50, physicsHz=200, warmupSeconds=1, support="none",
                sampling="first control tick at or after original timestamp",
                encoder="g1", futureFrames=10, futureStepSeconds=.1)
(args.work / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
