"""Rank 2–8 second stable windows by observed horizontal travel and real foot movement.
Require fully tracked body/hands and reject large rotation or translation changes.
Source files are read-only; per-episode metrics are saved in the requested cache.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import argparse,json,concurrent.futures
from pathlib import Path
import numpy as np
from motion_quality import sequence_metrics,report,locomotion_report
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--root',type=Path,required=True)
p.add_argument('--cache',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--min-frames',type=int,default=60)
a=p.parse_args();root=a.root;cache=a.cache;cache.mkdir(parents=True,exist_ok=True)
eps={x['episode_index']:x for x in map(json.loads,(root/'raw/meta/episodes.jsonl').read_text().splitlines())}

def scan(path):
 ep=int(path.parent.name.split('_')[-1]);cp=cache/f'{ep}.npz'
 try:
  with np.load(path) as h:world=Path(str(h['result_path']))
  if not world.is_file():return None
  m={}
  if cp.exists():
   with np.load(cp) as f:m={k:f[k] for k in f.files}
  if 'rootPosition' not in m:
   m=sequence_metrics(root/'raw/data/chunk-000'/f'episode_{ep:06d}.parquet',path,world);np.savez_compressed(cp,**m)
  good=m['bodyValid']&m['handsValid'];acc=np.r_[0,m['rootAcceleration']]
  links=good[1:]&good[:-1]&(m['bodyStep']<=15)&(m['fingerStep']<=25)&(m['rootStep']<=.08)&(acc<=.02)
  ids=np.flatnonzero(links);runs=np.split(ids,np.flatnonzero(np.diff(ids)>1)+1);candidates=[]
  for run in runs:
   if len(run)+1<a.min_frames:continue
   length=min(240,len(run)+1)
   for start in range(int(run[0]),int(run[-1])+3-length):
    end=start+length;loc=locomotion_report(m,start,end)
    if loc['horizontalTravelMeters']<.45 or max(loc['footHorizontalExcursionMeters'])<.2 or max(loc['ankleExcursionMeters'])<.12:continue
    candidates.append((loc['horizontalTravelMeters'],length,start,end,loc))
  if not candidates:return None
  distance,_,start,end,loc=max(candidates,key=lambda x:(x[0],x[1]));count=end-start
  return dict(episode=ep,task=eps[ep]['tasks'][0],start=start,end=end,frames=len(good),left=count,right=count,both=count,quality=report(m,start,end),locomotion=loc,handsPath=str(path),worldPath=str(world))
 except Exception as e:return dict(episode=ep,error=str(e))
paths=sorted((root/'.pipeline_work_sonic_online_v4').glob('episode_[0-9][0-9][0-9][0-9][0-9][0-9]/dynhamr_hands.npz'));out=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for i,r in enumerate(pool.map(scan,paths)):
  if r:out.append(r)
  if i%30==0:print(i+1,'/',len(paths),'candidates',len(out),flush=True)
a.out.write_text(json.dumps(sorted(out,key=lambda x:-x.get('locomotion',{}).get('horizontalTravelMeters',0)),ensure_ascii=False,indent=2));print('COMPLETE',len(out),flush=True)
