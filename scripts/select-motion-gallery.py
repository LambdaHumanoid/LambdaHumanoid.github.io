"""Rank one eight-second window per episode by both-hand DynHaMR coverage.
Read-only against the dataset; prints JSON for local selection/reproducibility.
"""
import argparse,json
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--frames',type=int,default=240);a=p.parse_args()
episodes={x['episode_index']:x for x in map(json.loads,(a.root/'raw/meta/episodes.jsonl').read_text().splitlines())}
results=[];errors=[]
for path in sorted((a.root/'.pipeline_work_sonic_online_v4').glob('episode_[0-9][0-9][0-9][0-9][0-9][0-9]/dynhamr_hands.npz')):
 try:
  ep=int(path.parent.name.split('_')[-1]);meta=episodes[ep]
  with np.load(path) as d:
   valid=d['valid']&d['visible'];n=len(valid);world=Path(str(d['result_path']))
   if n<a.frames or not world.is_file():continue
   sums=np.vstack([np.zeros((1,2)),np.cumsum(valid,axis=0)]);counts=sums[a.frames:]-sums[:-a.frames]
   both=np.r_[0,np.cumsum(valid.all(axis=1))];both=both[a.frames:]-both[:-a.frames]
   score=counts.min(axis=1)*2+both+counts.mean(axis=1)*.1
   start=int(np.argmax(score));end=start+a.frames
   repro=d['reprojection_error_px'][start:end];good=valid[start:end]
   results.append({'episode':ep,'task':meta['tasks'][0],'start':start,'end':end,'frames':n,'left':int(counts[start,0]),'right':int(counts[start,1]),'both':int(both[start]),'score':float(score[start]),'medianReprojectionPx':float(np.median(repro[good])),'handsPath':str(path),'worldPath':str(world)})
 except Exception as e:errors.append({'path':str(path),'error':str(e)})
print(json.dumps({'candidates':sorted(results,key=lambda x:-x['score']),'errors':errors},ensure_ascii=False,indent=2))
