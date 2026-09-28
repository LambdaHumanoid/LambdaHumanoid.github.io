"""Build a compact offline copy; never overwrite source media.

Usage: python3 scripts/package-offline.py SOURCE_PACKAGE NEW_OUTPUT_DIRECTORY
Requires numpy, ffmpeg and the project's esbuild/fflate dependencies.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import gzip
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

import numpy as np

source, target = map(lambda x: Path(x).resolve(), sys.argv[1:3])
root = Path(__file__).resolve().parents[1]
if target.exists():
    raise SystemExit(f'Refusing to overwrite {target}')
target.mkdir(parents=True)
site = source / 'project-page'
out = target / 'project-page'
out.mkdir()
# Preserve top-level documents and the outer click-to-open entry.
for item in source.iterdir():
    if item.is_file() and not item.name.startswith('.'):
        shutil.copy2(item, target / item.name)
for name in ['index.html', 'paper.pdf']:
    if (site / name).exists():
        shutil.copy2(site / name, out / name)
shutil.copytree(site / 'figures', out / 'figures')
(out / 'motion').mkdir()
for item in (site / 'motion').glob('*.jpg'):
    shutil.copy2(item, out / 'motion' / item.name)
(out / 'offline/assets').mkdir(parents=True)
for name in ['page.js', 'page.css']:
    shutil.copy2(site / 'offline' / name, out / 'offline' / name)
subprocess.run([
    str(root / 'node_modules/.bin/esbuild'), str(root / 'scripts/offline-packed-codec.js'),
    '--bundle', '--minify', '--format=iife', '--target=es2022',
    f'--outfile={out / "offline/packed-codec.js"}',
], check=True)
entry = out / 'index.html'
html = entry.read_text()
fallback_movies = set(re.findall(r'\./(motion/[^"<>\s]+\.mp4)', html))
anchor = '<script defer src="./offline/page.js"></script>'
assert html.count(anchor) == 1
entry.write_text(html.replace(anchor, '<script defer src="./offline/packed-codec.js"></script>' + anchor))

raw_total = packed_total = checked = 0
for script in sorted((site / 'offline/assets').glob('*.js')):
    text = script.read_text()
    prefix = 'globalThis.__offlineAsset('
    assert text.startswith(prefix) and text.endswith(');')
    key, mime, encoded = json.loads('[' + text[len(prefix):-2] + ']')
    data = base64.b64decode(encoded)
    raw_total += len(data)
    stride = 0
    if key.endswith('.vertices.bin.gz'):
        original = gzip.decompress(data)
        metadata = json.loads((site / key.replace('.vertices.bin.gz', '.json')).read_text())
        stride = metadata['vertexCount'] * 3
        a = np.frombuffer(original, dtype='<u2').reshape(metadata['frameCount'], stride)
        b = a.copy()
        b[1:] = a[1:] - a[:-1]
        b[:, 3:] = b[:, 3:] - b[:, :-3]
        shuffled = b.ravel().view(np.uint8).reshape(-1, 2).T.copy().tobytes()
        data = gzip.compress(shuffled, compresslevel=9, mtime=0)
        # Independent reverse transform must reproduce the entire input exactly.
        restored = np.frombuffer(gzip.decompress(data), dtype=np.uint8).reshape(2, -1).T.copy().view('<u2').reshape(a.shape)
        for axis in range(3):
            restored[:, axis::3] = np.cumsum(restored[:, axis::3], axis=1, dtype=np.uint16)
        restored = np.cumsum(restored, axis=0, dtype=np.uint16)
        assert restored.tobytes() == original, key
        checked += 1
        call = '__offlinePackedAsset'
    elif key.endswith('.json'):
        original = data
        data = gzip.compress(data, compresslevel=9, mtime=0)
        assert gzip.decompress(data) == original
        call = '__offlinePackedAsset'
    else:
        call = '__offlineAsset'
    args = [key, mime, base64.b64encode(data).decode()]
    if call == '__offlinePackedAsset':
        args.append(stride)
    (out / 'offline/assets' / script.name).write_text(
        f'globalThis.{call}(' + ','.join(json.dumps(x, separators=(',', ':')) for x in args) + ');')
    packed_total += len(data)
    if key in fallback_movies:
        # Only the static no-JavaScript fallback needs a second direct video copy.
        shutil.copy2(site / key, out / key)
print(json.dumps({'lossless_meshes_verified': checked, 'asset_bytes_before': raw_total, 'asset_bytes_after': packed_total}), flush=True)

shutil.copytree(site / 'videos', out / 'videos', ignore=shutil.ignore_patterns('*.mp4'))
def compress(movie):
    destination = out / movie.relative_to(site)
    temporary = destination.with_name(destination.stem + '.encoding.mp4')
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(movie),
        '-map', '0:v:0', '-map', '0:a?', '-vf', "scale='min(1280,iw)':-2,fps=24",
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '30', '-threads', '2',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart',
        '-map_metadata', '-1', str(temporary),
    ], check=True)
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '2',
        '-i', str(temporary), '-f', 'null', '-',
    ], check=True)
    temporary.replace(destination)
    print(json.dumps({'video': movie.name, 'before': movie.stat().st_size, 'after': destination.stat().st_size}), flush=True)
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(compress, sorted((site / 'videos').rglob('*.mp4'))))

archive = target.with_suffix('.zip')
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for item in sorted(target.rglob('*')):
        if item.is_file():
            z.write(item, item.relative_to(target))
size = archive.stat().st_size
print(json.dumps({'zip': str(archive), 'bytes': size, 'MB': size / 1e6, 'unpacked_MB': sum(p.stat().st_size for p in target.rglob('*') if p.is_file()) / 1e6}), flush=True)
if size >= 100_000_000:
    raise SystemExit('Package exceeds the 100 MB package target; source remains unchanged.')
