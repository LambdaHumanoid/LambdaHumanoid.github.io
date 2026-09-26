"""Bake SMPL + native DynHaMR MANO; no keypoint fitting or pose filtering.

MANO_RIGHT is also used for left tracks, matching DynHaMR's X reflection.
The native rest axes match SMPL's hand axes. Only the rigid wrist transform is
replaced by PICO/SMPL; only pose_body is used. Shape is fixed at betas=0,
and no mean is added. Source betas are never read.
Shared wrist vertices and a smooth forearm transition join the surfaces,
without moving MANO vertices or changing finger rotations.
Run after build-motion-gallery.py --prepare-only (or reuse prepared metadata).
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('VECLIB_MAXIMUM_THREADS', '1')
import argparse, gzip, json
from collections import Counter
from scipy import sparse
from scipy.sparse.linalg import spsolve
from pathlib import Path
import numpy as np
import trimesh
from mano_lbs import MANO
from smpl_lbs import SMPL, PARENTS, R_ALIGN, global_quats_to_local_R
from motion_sources import read_body_pose

ROOT = Path(__file__).resolve().parent.parent


def skeleton(model, rotations):
    transforms = np.tile(np.eye(4), (24, 1, 1))
    transforms[:, :3, :3] = rotations
    transforms[0, :3, 3] = model.J[0]
    for i in range(1, 24):
        transforms[i, :3, 3] = model.J[i] - model.J[PARENTS[i]]
        transforms[i] = transforms[PARENTS[i]] @ transforms[i]
    return transforms


def boundary(faces):
    counts = Counter(tuple(sorted(e)) for t in faces for e in zip(t, np.roll(t, -1)))
    return sorted({v for e, count in counts.items() if count == 1 for v in e})


def ordered_boundary(faces):
    edges = Counter(tuple(sorted(e)) for t in faces for e in zip(t, np.roll(t, -1)))
    adjacency = {}
    for (a, b), count in edges.items():
        if count == 1:
            adjacency.setdefault(a, []).append(b)
            adjacency.setdefault(b, []).append(a)
    assert all(len(neighbors) == 2 for neighbors in adjacency.values())
    loops = []
    remaining = set(adjacency)
    while remaining:
        first = min(remaining)
        ring, previous, current = [], None, first
        while current not in ring:
            ring.append(current)
            nxt = next(i for i in adjacency[current] if i != previous)
            previous, current = current, nxt
        assert current == first
        remaining.difference_update(ring)
        loops.append(np.asarray(ring))
    return loops


def topology(smpl, mano):
    # Preserve MANO entirely. Weld its wrist loop to the corresponding SMPL
    # loop, then distribute the attachment displacement into the forearm with
    # a biharmonic field. Fingers and hand joint transforms are never changed.
    keep = (np.abs(smpl.vt[smpl.faces, 0]) <= abs(smpl.J[20, 0]) - .012).all(axis=1)
    raw_faces = smpl.faces[keep]
    loops = ordered_boundary(raw_faces)
    assert len(loops) == 2
    mano_loops = ordered_boundary(mano.faces)
    assert len(mano_loops) == 1
    hb = mano_loops[0]
    flat_v, flat_j = mano.forward(np.zeros(45), np.zeros(10), np.zeros(3), np.zeros(3), mean=False)
    flat_v -= flat_j[0]
    body_rings, hand_rings, rest_hands = [], [], []
    for side in range(2):
        bb = next(loop for loop in loops if (smpl.vt[loop, 0].mean() > 0) == (side == 0))
        assert len(bb) == len(hb) == 16
        hand = flat_v.copy()
        if side == 0:
            hand[:, 0] *= -1
        hand += smpl.J[20 + side]
        candidates = [np.roll(order, shift) for order in [hb, hb[::-1]] for shift in range(len(hb))]
        match = min(candidates, key=lambda order: np.sum((hand[order] - smpl.vt[bb]) ** 2))
        body_rings.append(bb)
        hand_rings.append(match)
        rest_hands.append(hand)

    raw_ids = np.unique(raw_faces)
    boundary_ids = np.concatenate(body_rings)
    body_ids = np.setdiff1d(raw_ids, boundary_ids)
    n = len(body_ids)
    lookup = np.full(smpl.nv, -1, dtype=int)
    lookup[body_ids] = np.arange(n)
    for side in range(2):
        lookup[body_rings[side]] = n + side * 778 + hand_rings[side]
    body_faces = lookup[raw_faces]
    hand_faces = [mano.faces[:, [0, 2, 1]] + n, mano.faces + n + 778]
    faces = np.concatenate([body_faces, *hand_faces])

    # Uniform graph Laplacian: minimize squared Laplacian of displacement,
    # with MANO boundary displacement fixed and the proximal body fixed at zero.
    edges = np.unique(np.sort(np.concatenate([raw_faces[:, [0, 1]], raw_faces[:, [1, 2]], raw_faces[:, [2, 0]]]), axis=1), axis=0)
    row = np.concatenate([edges[:, 0], edges[:, 1]])
    col = np.concatenate([edges[:, 1], edges[:, 0]])
    adjacency = sparse.csr_matrix((np.ones(len(row)), (row, col)), shape=(smpl.nv, smpl.nv))
    degree = np.asarray(adjacency.sum(axis=1)).ravel()
    laplacian = sparse.diags((degree > 0).astype(float)) - sparse.diags(1 / np.maximum(degree, 1)) @ adjacency
    free = body_ids[np.abs(smpl.vt[body_ids, 0]) > abs(smpl.J[20, 0]) - .085]
    lf, lb = laplacian[:, free], laplacian[:, boundary_ids]
    field = spsolve((lf.T @ lf).tocsc(), -(lf.T @ lb).toarray())
    assert np.isfinite(field).all()
    blend = np.zeros((n, len(boundary_ids)))
    blend[np.searchsorted(body_ids, free)] = field
    rest = np.concatenate([smpl.vt[body_ids], *rest_hands])
    targets = np.concatenate([rest_hands[side][hand_rings[side]] for side in range(2)])
    rest[:n] += blend @ (targets - smpl.vt[boundary_ids])
    mesh = trimesh.Trimesh(rest, faces, process=False)
    mesh.fix_normals()
    assert mesh.is_watertight and mesh.is_winding_consistent
    assert len(mesh.split()) == 1
    attachment = dict(boundary=boundary_ids, handRings=hand_rings, blend=blend,
                      weldedVertexPairs=[[[int(a), int(n + side * 778 + b)] for a, b in zip(body_rings[side], hand_rings[side])] for side in range(2)])
    return body_ids, mesh.faces, [len(body_faces) * 3, *[len(f) * 3 for f in hand_faces]], attachment


def export(key, smpl, mano, body_ids, faces, groups, attachment, out, metadata_dir):
    folder = ROOT / 'work/gallery-source' / key
    d = json.loads((metadata_dir / f'{key}.json').read_text())
    body, body_valid = read_body_pose(folder / 'source.parquet')
    h, w = np.load(folder / 'dynhamr_hands.npz'), np.load(folder / 'world.npz')
    start = d['source']['startFrame']
    indices = np.rint(np.asarray(d['times']) * 30).astype(int) + start
    right = body[start, 16, :3] - body[start, 17, :3]
    right[1] = 0
    right /= np.linalg.norm(right)
    up = np.array([0., 1., 0.])
    basis = np.stack([right, up, np.cross(right, up)], axis=1)
    origin = body[start, 0, :3].copy()
    origin[1] = 0
    frames, joints, hand_joints, valid = [], [], [], []
    neutral_beta = np.zeros(10)
    _, neutral_joints = mano.forward(np.zeros(45), neutral_beta, np.zeros(3), np.zeros(3), mean=False)
    bone_pairs = [(a, b) for base in [1, 5, 9, 13, 17]
                  for a, b in [(0, base), (base, base + 1), (base + 1, base + 2)]]
    neutral_lengths = np.asarray([np.linalg.norm(neutral_joints[b] - neutral_joints[a]) for a, b in bone_pairs])
    max_bone_error = max_rigid_error = 0.
    for frame in indices:
        local = frame - int(h['frame_interval'][0])
        assert local >= 0 and local < w['pose_body'].shape[1]
        rotations = global_quats_to_local_R(body[frame, :, 3:])
        # SMPL's obsolete palm joints are not used to articulate the new hands.
        rotations[22:] = np.eye(3)
        g = skeleton(smpl, rotations)
        full_body_v = (smpl.forward(rotations, body[frame, 0, :3]) - origin) @ basis
        body_v = full_body_v[body_ids].copy()
        body_j = ((g[:, :3, 3] - smpl.J[0]) @ R_ALIGN + body[frame, 0, :3] - origin) @ basis
        hands, js = [], []
        for side in range(2):
            assert h['valid'][frame, side] and h['visible'][frame, side]
            tracks = np.flatnonzero(w['is_right'][:, 0] == side)
            assert len(tracks) == 1
            tr = tracks[0]
            pose = w['pose_body'][tr, local]
            v, j = mano.forward(pose, neutral_beta, np.zeros(3), np.zeros(3), mean=False)
            lengths = np.asarray([np.linalg.norm(j[b] - j[a]) for a, b in bone_pairs])
            max_bone_error = max(max_bone_error, float(np.abs(lengths - neutral_lengths).max()))
            v, j = v - j[0], j - j[0]
            if side == 0:
                v[:, 0] *= -1
                j[:, 0] *= -1
            attach = g[20 + side, :3, :3].T @ R_ALIGN @ basis
            wrist = body_j[20 + side]
            placed_v, placed_j = v @ attach + wrist, j @ attach + wrist
            # Invert placement: all 778 native vertices must survive unchanged.
            max_rigid_error = max(max_rigid_error, float(np.abs((placed_v - wrist) @ attach.T - v).max()))
            hands.append(placed_v)
            js.append(placed_j)
        targets = np.concatenate([hands[side][attachment['handRings'][side]] for side in range(2)])
        body_v += attachment['blend'] @ (targets - full_body_v[attachment['boundary']])
        frames.append(np.concatenate([body_v, *hands]))
        joints.append(body_j)
        hand_joints.append(js)
        valid.append([True, True])
    assert max_bone_error < 1e-9, (key, max_bone_error)
    assert max_rigid_error < 1e-9, (key, max_rigid_error)
    vertices, joints, hand_joints = map(np.asarray, (frames, joints, hand_joints))
    foot_groups = [np.flatnonzero(smpl.W[body_ids][:, ids].sum(axis=1) > .5).tolist() for ids in [[7, 10], [8, 11]]]
    foot_ids = sorted(set(sum(foot_groups, [])))
    ground = vertices[0, foot_ids, 1].min()
    for array in [vertices, joints, hand_joints]:
        array[..., 1] -= ground
    assert np.isfinite(vertices).all()
    quantized = np.rint(vertices / d['quantization'])
    assert np.abs(quantized).max() < 32767
    n = len(body_ids)
    d.pop('fit', None)
    d.update(model='SMPL + MANO', vertexCount=vertices.shape[1], faces=faces.reshape(-1).tolist(),
             footVertices=foot_ids, footGroups=foot_groups, joints=joints.reshape(len(indices), -1).tolist(),
             bounds={'min': vertices.min(axis=(0, 1)).tolist(), 'max': vertices.max(axis=(0, 1)).tolist()},
             hands={'valid': valid, 'groups': groups, 'vertexGroups': [list(range(n, n + 778)), list(range(n + 778, n + 1556))],
                    'joints': hand_joints.reshape(len(indices), -1).tolist(), 'verticesPerHand': 778,
                    'source': 'DynHaMR smooth_fit world.npz pose_body only; neutral MANO shape',
                    'sourceBetasUsed': False, 'shapeBetas': neutral_beta.tolist(),
                    'bonePairs': bone_pairs, 'neutralBoneLengthsMeters': neutral_lengths.tolist(),
                    'poseRefitted': False, 'poseFiltered': False, 'meanAdded': False, 'scale': 1.,
                    'leftConvention': 'MANO_RIGHT mirrored along X, including triangle winding',
                    'wristPlacement': 'Native rest axes; rigid attachment to PICO-driven SMPL wrists; no world-frame calibration',
                    'stitchedCuffs': False, 'weldedWrists': True, 'watertight': True,
                    'attachmentVersion': 2, 'transition': 'Biharmonic forearm displacement; shared MANO wrist vertices',
                    'weldedVertexPairs': attachment['weldedVertexPairs'], 'forearmTransitionMeters': .085,
                    'maxNeutralBoneLengthErrorMeters': max_bone_error,
                    'maxRigidVertexErrorMeters': max_rigid_error})
    out.mkdir(parents=True, exist_ok=True)
    (out / f'{key}.vertices.bin.gz').write_bytes(gzip.compress(quantized.astype('<i2').tobytes(), mtime=0))
    (out / f'{key}.json').write_text(json.dumps(d, separators=(',', ':')))
    print(key, 'vertices', d['vertexCount'], 'neutral bone error (m)', max_bone_error, flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--smpl', required=True)
    p.add_argument('--mano', required=True, help='MANO_RIGHT pickle with NumPy arrays')
    p.add_argument('--clip')
    p.add_argument('--metadata-dir', type=Path, default=ROOT / 'public/motion')
    p.add_argument('--out', type=Path, default=ROOT / 'work/smpl-mano')
    a = p.parse_args()
    smpl, mano = SMPL(a.smpl), MANO(a.mano)
    body_ids, faces, groups, attachment = topology(smpl, mano)
    rows = [{'id': a.clip}] if a.clip else json.loads((ROOT / 'public/motion/gallery.json').read_text())
    for row in rows:
        if not a.clip or row['id'] == a.clip:
            export(row['id'], smpl, mano, body_ids, faces, groups, attachment, a.out, a.metadata_dir)


if __name__ == '__main__':
    main()
