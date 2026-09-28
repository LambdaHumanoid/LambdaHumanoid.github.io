"""Further shrink an existing compact site, preserving all 3D frames.

Usage: python3 scripts/shrink-offline.py CURRENT_PACKAGE ORIGINAL_PACKAGE NEW_OUTPUT
Original media are used for video encoding to avoid repeated lossy transcoding.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import zipfile

import numpy as np

import numpy as np

current, original, target = [Path(x).resolve() for x in sys.argv[1:4]]
assert not target.exists()
shutil.copytree(current, target)
site = target / 'project-page'
source = original / 'project-page'
root = Path(__file__).resolve().parents[1]
assets = site / 'offline/assets'

def encoded(data):
    return json.dumps(base64.b64encode(data).decode())

def json_bytes(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()

shared = {}
metadata_count = 0
for script in sorted(assets.glob('motion--*.json.js')):
    name = script.name[len('motion--'):-3]
    data = json.loads((source / 'motion' / name).read_text())
    reduced = copy.deepcopy(data)
    reduced['__sharedFields'] = {}
    for field in ['faces', 'footVertices', 'footGroups']:
        if field not in data:
            continue
        key = hashlib.sha256(json_bytes(data[field])).hexdigest()[:16]
        shared[key] = reduced.pop(field)
        reduced['__sharedFields'][field] = key
    restored = {k: v for k, v in reduced.items() if k != '__sharedFields'}
    restored.update({k: shared[v] for k, v in reduced['__sharedFields'].items()})
    assert restored == data
    script.write_text(f'globalThis.__offlineJSONAsset({json.dumps("motion/" + name)},{encoded(gzip.compress(json_bytes(reduced), compresslevel=6, mtime=0))});')
    metadata_count += 1
(site / 'offline/shared.js').write_text(f'globalThis.__offlineSharedData({encoded(gzip.compress(json_bytes(shared), compresslevel=6, mtime=0))});')

model = json.loads(gzip.decompress((source / 'motion/g1-revo2.model.json.gz').read_bytes()))
packed_model = copy.deepcopy(model)
chunks = []
offset = 0
for part in packed_model['parts']:
    for field in ['positions', 'indices']:
        values = np.asarray(part[field], dtype='<f4' if field == 'positions' else '<u4')
        if field == 'indices':
            values = values.copy()
            values[1:] = values[1:] - values[:-1]
        chunk = values.view(np.uint8).reshape(-1, 4).T.copy().tobytes()
        part[field] = {'offset': offset, 'count': len(values)}
        chunks.append(chunk)
        offset += len(chunk)
header = json_bytes(packed_model)
binary = struct.pack('<I', len(header)) + header + b''.join(chunks)
model_script = assets / 'motion--g1-revo2.model.json.gz.js'
model_script.write_text(f'globalThis.__offlineRobotAsset("motion/g1-revo2.model.json.gz",{encoded(gzip.compress(binary, compresslevel=6, mtime=0))});')
subprocess.run([str(root / 'node_modules/.bin/esbuild'), str(root / 'scripts/offline-packed-codec.js'), '--bundle', '--minify', '--format=iife', '--target=es2022', f'--outfile={site / "offline/packed-codec.js"}'], check=True)
entry = site / 'index.html'
anchor = '<script defer src="./offline/packed-codec.js"></script>'
html = entry.read_text()
assert html.count(anchor) == 1
entry.write_text(html.replace(anchor, anchor + '<script defer src="./offline/shared.js"></script>'))
print(json.dumps({'metadata_verified': metadata_count, 'shared_arrays': len(shared), 'model_script_MB': model_script.stat().st_size / 1e6}), flush=True)

jobs = [(source / 'motion' / s.name[len('motion--'):-3], True) for s in sorted(assets.glob('motion--*.mp4.js'))]
jobs += [(p, False) for p in sorted((source / 'videos').rglob('*.mp4'))]

def compress(job):
    movie, motion = job
    name = str(movie.relative_to(source))
    destination = site / name
    temporary = destination.with_name(destination.stem + '.encoding.mp4')
    # RGB motion thumbnails remain synchronized with the original continuous clock.
    scale, fps, crf = (384, 15, 30) if motion else (960, 24, 32)
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(movie),
        '-map', '0:v:0', '-map', '0:a?', '-vf', f"scale='min({scale},iw)':-2,fps={fps}",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-threads', '2',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart',
        '-map_metadata', '-1', str(temporary),
    ], check=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '1', '-i', str(temporary), '-f', 'null', '-'], check=True)
    if motion:
        script = assets / (name.replace('/', '--') + '.js')
        script.write_text(f'globalThis.__offlineAsset({json.dumps(name)},"video/mp4",{encoded(temporary.read_bytes())});')
        # Retain direct copies only where the existing no-JavaScript fallback uses them.
        if destination.exists():
            temporary.replace(destination)
        else:
            temporary.unlink()
    else:
        temporary.replace(destination)
        print(json.dumps({'demo': movie.name, 'MB': destination.stat().st_size / 1e6}), flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(compress, jobs))
print(json.dumps({'videos_fully_decoded': len(jobs)}), flush=True)
archive = target.with_suffix('.zip')
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for item in sorted(target.rglob('*')):
        if item.is_file():
            z.write(item, item.relative_to(target))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({'zip': str(archive), 'MB': archive.stat().st_size / 1e6}), flush=True)
