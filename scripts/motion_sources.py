"""Resolve legacy comparison clips or a selected human-gallery manifest."""
import json
from pathlib import Path


def motion_sources(root, manifest=None):
    if manifest:
        rows = json.loads(Path(manifest).read_text())
        return [(row['id'], root / 'work/gallery-source' / row['id'] / 'source.parquet',
                 root / 'work/gallery-source' / row['id']) for row in rows]
    src = root / 'work/retarget-source'
    return [('chair', root / 'work/motion-source/chair.parquet', src),
            ('cart', root / 'work/motion-source/cart.parquet', src / 'cart'),
            ('floor', Path('/Users/arson/Desktop/diverse-human/gallery-work/v1_0729/episode_000063.parquet'), src / 'floor')]


def read_body_pose(path):
    """Repair unavailable body samples without interpreting invalid rotations."""
    import numpy as np
    import pyarrow.parquet as pq
    table = pq.read_table(path, columns=['observation.pico.body_pose', 'observation.pico.body_available'])
    pose = np.asarray(table['observation.pico.body_pose'].to_pylist()).reshape(-1, 24, 7)
    available = np.asarray(table['observation.pico.body_available'].to_pylist()).reshape(-1).astype(bool)
    valid = available & np.isfinite(pose).all(axis=(1, 2)) & (np.linalg.norm(pose[:, :, 3:], axis=2) > .5).all(axis=1)
    ids = np.flatnonzero(valid)
    if not len(ids):
        raise ValueError(f'No valid body observations: {path}')
    for i in np.flatnonzero(~valid):
        pose[i] = pose[ids[np.argmin(abs(ids - i))]]
    return pose, valid
