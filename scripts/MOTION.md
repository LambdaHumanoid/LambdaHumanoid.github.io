# Recorded human / G1 motion viewers

The first viewer, **HumanVerse in motion**, sits below the dataset figure and shows
40 selectable SMPL + MANO recordings with a chest-camera wireframe and synchronized GoPro RGB.
The gallery covers collections `v1_0729`, `v1_0730`, `v1_0828` and `v1_0901`.
The human gallery uses `public/motion/gallery.json`; the three existing G1 comparisons
use their separate `public/motion/clips.json` manifest.
The next row compares human motion (left) with **GMR → G1 → SONIC**
simulation and retargeted BrainCo Revo2 hands (right). The comparison's human also
shows the same chest-mounted GoPro, perspective wireframe and synchronized RGB
image plane as the gallery. The pair and camera image share one video clock.
All views support playback, seeking, half speed, rotation, zoom, reset and
**Hands** close-up. Reduced-motion preference starts paused; offscreen views pause.
The 3D engines warm up during browser idle time. Motion metadata and meshes prefetch
within 1600 px of the viewport; GPU scenes initialize within 600 px, while playback
waits for visibility. The next task and hovered/focused tasks prefetch into a shared
four-clip LRU cache of decoded meshes (three robot pose sequences); concurrent speculative
loads are limited to two. Failed entries are removed for retry. Data-saver/2G connections
and hidden tabs skip speculation. A native video remains available on failure.

## Human gallery: SMPL body + native MANO hands

`export-smpl-mano-gallery.py` replaces the former 21-keypoint-to-SMPL-X fitting
pipeline for all 40 gallery clips. The three older G1 comparison human clips still
use the existing SMPL-X export; their robot rollouts and timing are unchanged.

- PICO's 24 global quaternions drive a neutral-shape SMPL body through the existing
  coordinate conversion. Unavailable body samples use the nearest available frame;
  their indices remain in metadata. The obsolete SMPL palm rotations are neutral.
- DynHaMR `world.npz` supplies **unchanged** `pose_body` (15 × 3 axis-angle values)
  for native MANO linear blend skinning. Source `betas` are never read: all clips
  and both hands use the same neutral shape (`betas=0`). No hand mean is added, no
  nonlinear keypoint fit or extra pose smoothing is performed, and scale stays 1.
- Both tracks use the same MANO_RIGHT model as DynHaMR. Left hands reflect X,
  including triangle winding. Correct fingertip indices are 744, 320, 443, 554,
  671. The previous helper incorrectly used 555 and 672 for the last two tips.
- Native local hand vertices attach rigidly at the corresponding SMPL wrist,
  using the fixed native rest axes and PICO wrist orientation. The attachment
  does **not** compute a pose-dependent palm frame. DynHaMR world root rotation
  and translation are not used for display:
  PICO and VIPE do not supply calibrated common world coordinates.
- SMPL mitten faces are removed. Each 16-vertex body wrist ring is matched to
  MANO's wrist ring once in the neutral rest pose, preserving cyclic order. Body
  faces reference the MANO boundary vertices directly; the former bridge triangles
  and duplicate body boundary vertices are removed. This gives exact shared seams.
- Near each wrist, a fixed biharmonic displacement field blends the boundary
  correction into the distal forearm (within 8.5 cm of the rest wrist). This avoids
  the sharp join between SMPL's mixed forearm/wrist skinning and MANO's wrist skinning.
  All 778 vertices of each MANO hand and all finger joint rotations remain unchanged.
  Body vertices proximal to that region are unchanged. No extra per-frame hand
  fitting, scaling, translation or orientation adjustment is introduced.
- The final mesh has 6,826 vertices and 13,648 triangles. Export asserts a single
  connected, watertight, consistently wound surface. This is SMPL + MANO with welded
  wrists, not native SMPL-X topology. Metadata records attachment version 2.
- Every exported frame checks the 15 skeletal bone lengths against neutral MANO,
  requiring error below 1e-9 m. Inverse wrist placement must recover all native
  neutral-shape hand vertices within 1e-9 m. Shape normalization deliberately changes
  joint positions from the original reconstruction; no raw world-joint reconstruction
  accuracy is claimed. Metadata records zero shape coefficients and unchanged poses.

Some source shape estimates produced palms up to 3.26 times the neutral wrist-to-middle
MCP length. Neutral display shape removes this distortion while retaining every
source finger rotation. Source archives are unchanged.


Quality selection scans active episodes and uses geodesic rotation changes, treating
quaternions q and -q as the same orientation. The selected raw 30 Hz windows have no
missing observations, at most 15 degrees per frame for the first 22 PICO body joints,
at most 25 degrees for any finger joint, and at most 8 cm of pelvis displacement.
A second-difference limit of 0.02 m/frame² rejects sudden position jumps while
allowing smooth walking faster than the previous 4 cm/frame speed limit.
These are screening thresholds, not accuracy guarantees. Unlike the old coverage-only
ranking, windows with pose spikes are rejected, and durations may shorten to retain
original unsmoothed rotations. `quality` metadata contains max / p99 / median metrics.
Selection now prioritizes observed horizontal travel rather than duration alone.
Each selected window travels at least 0.45 m horizontally, measured at 5 Hz to reduce
tracking micro-jitter, at least one foot has 0.2 m horizontal world excursion, and foot motion relative
to the pelvis spans at least 0.12 m.
This rejects clips that only lean or sway in place. These are motion-screening metrics,
not a formal gait classifier. `locomotion` records path, displacement, foot travel and
excursions. Some clips include short steps and handling rather than continuous walking.
Larger-motion examples appear first.
The gallery stops at the end instead of jumping from its last frame to the first;
manual replay remains available. Comparison clips keep their previous loop behavior.
The illustrative chest camera points forward with a 30-degree downward pitch relative
to the torso. Both viewers mirror the image horizontally on both GoPro LCDs and
both outward-facing sides of the image plane, with 50% image opacity.
The 0.48 × 0.27 m plane sits
0.30 m along the camera axis. It is not a calibrated camera reconstruction.

The browser interpolates baked 15 Hz meshes (plus the final source frame), quantized
at 0.1 mm. It retains visual foot grounding and the illustrative camera. There is no
hand/body collision correction or arm IK in this gallery export; raw tracking,
independent body/hand proportions, and wrist attachment can produce intersections.
The 40 source windows contain 60–222 frames (approximately 2–7.4 seconds), all
with valid body tracking and valid & visible observations for both hands at 30 Hz.
These flags measure availability, not accuracy; PICO hand-active counts are separate.

Each clip records its task, episode, original frame range, coverage, repaired body
indices and SHA256 source checksums. Private models and pose archives stay under
ignored `work/`; only baked meshes, trimmed RGB, posters and metadata are public.
`MotionClipPicker` provides a single-column, vertically scrolling task list beside an enlarged 3D stage.
The camera preview floats in the stage’s upper-right corner and mirrors the chest-camera image.
The stage blends into the page using a transparent renderer, subtle purple lighting and soft ground shadows.
The SMPL material retains its original purple. Coverage, travel, excerpt length and hand-status notes are omitted from the interface.
All task thumbnails remain static posters, including the selected task.
Only the upper-right camera preview draws the clock video's decoded frames, following
playback, pauses, seeking and speed changes. It stops drawing offscreen and needs
no additional video decoder.

Reproduction with existing prepared sources and metadata:

```sh
python scripts/export-smpl-mano-gallery.py \
  --smpl /path/to/SMPL_NEUTRAL_np.npz \
  --mano /path/to/MANO_RIGHT_numpy.pkl \
  --out public/motion
python scripts/publish-motion-gallery.py
```

The MANO pickle is the original DynHaMR model with any legacy Chumpy arrays converted
to NumPy, without numerical changes. Required Python packages are numpy, scipy,
pyarrow, trimesh and networkx. For new ranges, use `select-stable-motion-gallery.py --root <dataset> --cache <metrics-cache> --out <candidates.json>`, choose distinct tasks, cache
sources under `work/gallery-source/<clip>/`, and run `build-motion-gallery.py` with
the private SMPL/MANO paths. Selection rows include `collection` (default `v1_0729`);
`--manifest` selects the input task list for fetch/build/publish. `--prepare-only` prepares metadata/video/posters. `--out` supports staging all assets
before publication; `--prepared-videos` accepts pretrimmed, frame-aligned videos and
posters. Each build recomputes continuity checks from the local source archives.
`tests/motion-gallery.test.mjs` independently checks edge incidence/winding, vertex
counts, provenance, coverage, bounds, neutral bone lengths, raw continuity metrics and the exact selected RGB frame counts.

The old `fit-smplx-motion.py` and `refine-smplx-motion.py` remain for reproducing the
three legacy comparison clips. Their fitted hand poses, smoothing and arm clearance
adjustments are not used in the new gallery. `run-gallery-meshes.py` is likewise a
legacy SMPL-X worker and must not be used to regenerate the SMPL + MANO gallery.

## G1: GMR reference tracked by SONIC, original visual geometry

The body assets were regenerated on 2026-09-25 using:

1. `prepare-gmr-source.py`: original 30 Hz PICO body rotations and the existing
   episode-level SMPL-X shape fit → global SMPL-X joints and orientations in Z-up.
   One constant floor offset per clip preserves vertical motion. The separate
   human display's finger smoothing and arm clearance adjustments are not GMR inputs.
2. Official [GMR](https://github.com/YanjieZe/GMR), commit
   `bb1bbe40774794fceb2a7c579a3464a28e68c844`, unchanged `smplx_to_g1.json`,
   `unitree_g1`, DAQP: 29-DoF G1 reference. Joint names explicitly map to SONIC.
3. `run-gmr-sonic.py`: released SONIC **g1** encoder (not the SMPL encoder),
   32-level FSQ and `g1_dyn` decoder, with online robot orientation and
   proprioception feedback. The encoder receives ten future frames 0.1 s apart,
   using upstream's exact flattened q / dq and 6D orientation layout.
4. Free-base MuJoCo at 200 Hz, 50 Hz control, official deployment scene and PD
   settings. One second of unassisted frozen-reference settling precedes each
   clip; no suspension or external support is used. Playback contains simulated
   qpos after physics, rather than the GMR reference itself.

`export-g1-source.py --rollout-dir ...` uses `mj_forward` to export visual part
transforms from these simulation states (qpos quaternion wxyz). It checks the
pipeline identity, original source frame mapping, finite values and no detected
falls across the entire control-rate rollout. Each browser asset embeds the
checkpoint and rollout SHA256 plus pipeline provenance. The old direct-SMPL
SONIC body outputs are no longer shown; their training Parquet supplies only hands.

All three clips passed the fall check (pelvis below 0.2 m or projected gravity
z above −0.25). Joint tracking RMS versus the GMR reference: chair 0.075 rad,
cart 0.085 rad, floor 0.129 rad. Sampling the first control tick at/after each
source timestamp adds at most 20 ms. These are offline simulation checks, not
hardware validation. Revo2 hands are animated after the body simulation; their
mass/contact dynamics are not part of this G1 controller rollout.

**Keep original visual topology.** The earlier 1,600-triangle-per-part simplification
damaged thin shell surfaces and is removed. URDF dark/light material colors are
restored and interpreted as sRGB. Crease-aware normals group only exactly coincident exported positions and preserve
45-degree mechanical edges; centimetre position buckets previously mixed unrelated
G1 shell and Revo2 finger surfaces and caused patchy shading.
double-sided shell rendering preserves thin visual surfaces. The static model is
about 9.2 MB gzip JSON, shared by all clips and loaded lazily.

Robot hands use the [official BrainCo Revo2 URDF](https://github.com/BrainCoTech/revo2_description),
commit `92cc697c7fa691db59404ce52344f3969a5ef7a6`. Actual training commands
`action[64:76]` map to URDF joint limits and distal mimic ratios. Static rubber G1
hands are removed. Display commands use the same 80 ms Gaussian smoothing
(sigma 2.4 at 30 Hz), separately within valid runs. Missing commands then use linear
interpolation between smoothed valid commands, holding the nearest valid command
at the ends, before URDF forward kinematics. A wholly unobserved hand uses zero
commands. The original validity mask remains unchanged.
Raw commands remain in the exported metadata; G1 body transforms are unchanged.
The illustrative adapter keeps +4.5 cm local-X translation. Its orientation is
`Rx(-90°) @ Ry(+90°)` for the left hand and `Rx(+90°) @ Ry(+90°)` for the right.
Revo2's +Z finger axis maps to G1 wrist +X; the mirrored thumb sides (-Y left,
+Y right) both map to wrist +Z, matching GMR's SMPL-X wrist conventions.
The former shared `Ry(+90°)` left the palms a quarter-turn out of alignment.
`revo2_mount.py` defines this conversion; model and clip metadata record version 2.
This corrects visualization attachment, not simulated wrist joints or finger
commands, and is not a measured physical mount. Revo2's Apache 2.0
license is included under `public/motion/licenses/`.

The robot retains the simulation's fixed ground plane and actual root height,
without per-frame vertical correction. The human viewer retains its existing
visual foot grounding.

## Source recordings and rebuild

All clips use `v1_0729` at 30 Hz:

- Chair: episode 1, frames [0, 260).
- Floor pickup: episode 63, frames [560, 830).
- Cart: episode 0, frames [30, 330).

Body and RGB source:
`oss://aigc-brain-data/users/wuzhao/data/robot/ego_data/pico_gopro/processed/v1_0729/`.
Chair/cart are cached under `work/motion-source`; floor is cached under
`~/Desktop/diverse-human/gallery-work/v1_0729/episode_000063.parquet/mp4`.

Remote root: `/primus_xpfs_workspace_T04/xcy/ego_dataset/PicoGoPro/v1_0729/`:

- `.pipeline_work_sonic_online_v4/episode_*/dynhamr_hands.npz` and `sonic_mujoco.npz`.
- Smooth-fit archives referenced by each DynHaMR NPZ's `result_path` (episode 63
  uses `.pipeline_work_vipe_full_20260731`).
- `lambda0_midtrain_dual_sonic_online_v4/robot/data/chunk-000/episode_*.parquet`.

SMPL-X comes from the user's existing
`/primus_xpfs_workspace_T04/xcy/models/body_models/smplx/SMPLX_NEUTRAL.npz`, copied
locally into ignored `work/body-models/smplx/` and SHA256-verified. The G1 model is
`/primus_xpfs_workspace_T04/xcy/code/GR00T-WholeBodyControl/gear_sonic/data/robots/g1/`.

Dependencies: numpy, scipy, pyarrow, trimesh and rtree (surface proximity checks). Remote FK uses
the existing `miniforge3/envs/gr00t_wbc` environment and MuJoCo.

```sh
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 python scripts/fit-smplx-motion.py \
  --model work/body-models/smplx/SMPLX_NEUTRAL.npz
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 python scripts/refine-smplx-motion.py \
  --model work/body-models/smplx/SMPLX_NEUTRAL.npz
python scripts/prepare-gmr-source.py
# Upload *.human.npz and run-gmr-sonic.py into the isolated remote task directory.
# That directory contains upstream GMR core/assets and the existing pipeline/.
# Run run-gmr-sonic.py --work TASK_DIR --sonic GR00T_REPO with gr00t_wbc Python.
ssh primus1 '/primus_xpfs_workspace_T04/xcy/miniforge3/envs/gr00t_wbc/bin/python - --rollout-dir /primus_xpfs_workspace_T04/xcy/tmp/iclr27-gmr-sonic-20260925' \
  < scripts/export-g1-source.py > work/gmr-sonic/g1-fk.npz
# Copy provenance.json and the private *.gmr.npz / *.sonic.npz results locally.
python scripts/export-robot-motion.py --gmr-sonic work/gmr-sonic
```

`export-motion.py` creates the original clips/video metadata and is only needed
for new source ranges. `export-articulated-hands.py` and `stitch-hand-cuffs.py` are
legacy experiments; **do not run them after the SMPL-X export**. The existing
trimmed videos and shared robot timestamps remain frame-aligned.

References: [SMPL-X](https://github.com/vchoutas/smplx),
[Unitree G1 description](https://github.com/unitreerobotics/unitree_ros/tree/master/robots/g1_description),
[Three.js VideoTexture](https://threejs.org/docs/pages/VideoTexture.html).
The small GoPro and its frustum are illustrative, not a calibrated projection.
