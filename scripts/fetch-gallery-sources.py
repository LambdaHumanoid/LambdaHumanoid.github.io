"""Resume selected read-only source downloads from the shared Primus dataset."""
from pathlib import Path
import argparse,concurrent.futures,json,subprocess,time,shlex,shutil
root=Path(__file__).resolve().parent.parent
cache=root/'work/gallery-source'
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,default=cache/'selection.json');p.add_argument('--skip-video',action='store_true');args=p.parse_args()
rows=json.loads(args.manifest.read_text())
def fetch(x):
 remote=Path('/primus_xpfs_workspace_T04/xcy/ego_dataset/PicoGoPro')/x.get('collection','v1_0729')
 dst=cache/x['id'];dst.mkdir(exist_ok=True)
 ep=f"episode_{x['episode']:06d}"
 pairs=[(Path(x['handsPath']),'dynhamr_hands.npz'),(Path(x['worldPath']),'world.npz'),(remote/'raw/data/chunk-000'/f'{ep}.parquet','source.parquet'),(remote/'raw/videos/chunk-000/observation.images.gopro'/f'{ep}.mp4','source.mp4')]
 for src,name in pairs:
  if args.skip_video and name=='source.mp4':continue
  if (dst/name).exists():continue
  for attempt in range(4):
   partial=dst/(name+'.part');offset=partial.stat().st_size if partial.exists() else 0
   code="import os,sys,shutil;p=sys.argv[1];o=int(sys.argv[2]);print(os.path.getsize(p),flush=True);f=open(p,'rb');f.seek(o);shutil.copyfileobj(f,sys.stdout.buffer)"
   command=shlex.join(['/primus_xpfs_workspace_T04/xcy/miniforge3/bin/python','-c',code,str(src),str(offset)])
   run=subprocess.Popen(['ssh','-o','ConnectTimeout=15','-o','ClearAllForwardings=yes','primus1',command],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   try:
    expected=int(run.stdout.readline())
    with partial.open('ab') as f:shutil.copyfileobj(run.stdout,f)
    error=run.communicate()[1].decode();ok=run.returncode==0 and partial.stat().st_size==expected
   except Exception as e:run.kill();error=str(e);ok=False
   if ok:partial.replace(dst/name);break
   print(x['id'],name,'retry',attempt+1,error[-250:],flush=True)
  else:raise RuntimeError(f"Could not transfer {x['id']}/{name}")
 print('downloaded',x['id'],sum(p.stat().st_size for p in dst.iterdir()),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(fetch,rows))
