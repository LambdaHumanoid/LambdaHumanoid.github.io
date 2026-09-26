"""Revo2 URDF base axes to G1 wrist-yaw link axes used by SMPL-X GMR.

Revo2 fingers extend along +Z, with the left/right thumb on -Y/+Y.
G1 fingers extend along +X. GMR's wrist frames require the thumb side along
+Z for both hands (the right wrist has a 180-degree SMPL-X Z offset).
The old shared Ry(90) aligned finger length but left the palms quarter-turned.
This is a visualization adapter, not a calibrated physical hardware mount.
"""
import numpy as np
from scipy.spatial.transform import Rotation

TRANSLATION = np.array([.045, 0., 0.])

def mount_rotation(side):
    if side not in (0, 1):
        raise ValueError('Expected left=0 or right=1')
    roll = -np.pi / 2 if side == 0 else np.pi / 2
    return Rotation.from_rotvec([roll, 0., 0.]).as_matrix() @ Rotation.from_rotvec([0., np.pi / 2, 0.]).as_matrix()

def mount_metadata():
    return {
        'version': 2,
        'frame': 'G1 wrist_yaw_link',
        'translationMeters': TRANSLATION.tolist(),
        'rotationMatrices': [mount_rotation(side).tolist() for side in (0, 1)],
        'method': 'Side-specific palm alignment: Rx(-90 left / +90 right) @ Ry(+90)',
        'scope': 'Visual hand attachment only; recorded body trajectory and finger commands unchanged',
    }
