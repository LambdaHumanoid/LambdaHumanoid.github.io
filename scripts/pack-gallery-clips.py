"""Add selected gallery clips to the standalone site without repacking existing assets."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import gzip
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', type=Path, required=True)
parser.add_argument('--source', type=Path, default=root / 'public/motion')
parser.add_argument('--site', type=Path, default=root / 'offline-site')
args = parser.parse_args()
rows = json.loads(args.manifest.read_text())
assets = args.site / 'offline/assets'
assets.mkdir(parents=True, exist_ok=True)
(args.site / 'motion').mkdir(exist_ok=True)


def register(key, data, mime, packed=False, stride=0):
    values = [key, mime, base64.b64encode(data).decode()]
    if packed:
        values.append(stride)
    call = '__offlinePackedAsset' if packed else '__offlineAsset'
    script = 'globalThis.' + call + '(' + ','.join(json.dumps(v) for v in values) + ');'
    (assets / (key.replace('/', '--') + '.js')).write_text(script)


def pack(row):
    clip = row['id']
    metadata_bytes = (args.source / f'{clip}.json').read_bytes()
    metadata = json.loads(metadata_bytes)
    original = gzip.decompress((args.source / f'{clip}.vertices.bin.gz').read_bytes())
    stride = metadata['vertexCount'] * 3
    values = np.frombuffer(original, dtype='<u2').reshape(metadata['frameCount'], stride)
    delta = values.copy()
    delta[1:] = values[1:] - values[:-1]
    delta[:, 3:] = delta[:, 3:] - delta[:, :-3]
    shuffled = delta.ravel().view(np.uint8).reshape(-1, 2).T.copy().tobytes()
    packed = gzip.compress(shuffled, compresslevel=9, mtime=0)
    restored = np.frombuffer(gzip.decompress(packed), dtype=np.uint8).reshape(2, -1).T.copy().view('<u2').reshape(values.shape)
    for axis in range(3):
        restored[:, axis::3] = np.cumsum(restored[:, axis::3], axis=1, dtype=np.uint16)
    restored = np.cumsum(restored, axis=0, dtype=np.uint16)
    assert restored.tobytes() == original, clip

    with tempfile.TemporaryDirectory(prefix='lambda-gallery-') as temporary:
        movie = Path(temporary) / f'{clip}.mp4'
        subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(args.source / f'{clip}.mp4'),
            '-map', '0:v:0', '-vf', 'scale=384:-2,fps=15', '-an', '-c:v', 'libx264',
            '-preset', 'veryfast', '-crf', '30', '-threads', '2', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', '-map_metadata', '-1', str(movie),
        ], check=True)
        video = movie.read_bytes()
    register(f'motion/{clip}.json', gzip.compress(metadata_bytes, mtime=0), 'application/json', packed=True)
    register(f'motion/{clip}.vertices.bin.gz', packed, 'application/octet-stream', packed=True, stride=stride)
    register(f'motion/{clip}.mp4', video, 'video/mp4')
    shutil.copy2(args.source / f'{clip}.jpg', args.site / 'motion' / f'{clip}.jpg')
    print(clip, 'mesh round-trip verified, packed MB', round((len(packed) + len(video)) / 1e6, 2), flush=True)


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(pack, rows))
