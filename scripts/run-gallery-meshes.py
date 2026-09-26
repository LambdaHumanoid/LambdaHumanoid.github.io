"""Fit gallery meshes with bounded CPU parallelism; no GPU or dataset mutation."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1';os.environ['VECLIB_MAXIMUM_THREADS']='1'
import argparse,concurrent.futures,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--workers',type=int,default=8);a=p.parse_args()
rows=json.loads(a.manifest.read_text());model=root/'work/body-models/smplx/SMPLX_NEUTRAL.npz'
def build(row):
 key=row['id'];cache=root/'work/gallery-source'/key;cache.mkdir(parents=True,exist_ok=True)
 raw=Path('/primus_xpfs_workspace_T04/xcy/ego_dataset/PicoGoPro/v1_0729/raw/data/chunk-000')/f"episode_{row['episode']:06d}.parquet"
 for name,source in [('source.parquet',raw),('dynhamr_hands.npz',Path(row['handsPath'])),('world.npz',Path(row['worldPath']))]:
  link=cache/name
  if not link.exists():link.symlink_to(source)
 try:
  with (cache/'build.log').open('w') as log:
   common=['--model',str(model),'--manifest',str(a.manifest),'--clip',key]
   print(key,'fit',flush=True)
   subprocess.run([sys.executable,str(root/'scripts/fit-smplx-motion.py'),*common],stdout=log,stderr=subprocess.STDOUT,check=True)
   for padding in [0,.02,.04]:
    print(key,'refine',padding,flush=True)
    result=subprocess.run([sys.executable,str(root/'scripts/refine-smplx-motion.py'),*common,'--clearance-padding',str(padding)],stdout=log,stderr=subprocess.STDOUT)
    if result.returncode==0:break
   else:raise RuntimeError('Display clearance checks failed')
  (cache/'mesh-complete').write_text('ok\n');print(key,'complete',flush=True)
  return {'id':key,'ok':True}
 except Exception as e:
  print(key,'failed',str(e),flush=True);return {'id':key,'ok':False,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:result=list(pool.map(build,rows))
(root/'work/gallery-source/results.json').write_text(json.dumps(result,indent=2))
if not all(x['ok'] for x in result):sys.exit(1)
