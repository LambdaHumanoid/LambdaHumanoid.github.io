"""Prepare RGB and bake SMPL + native DynHaMR MANO gallery clips."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('VECLIB_MAXIMUM_THREADS','1')
import argparse,concurrent.futures,hashlib,json,subprocess,sys,time,shutil
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
from motion_sources import read_body_pose
from motion_quality import sequence_metrics,report,locomotion_report
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,default=root/'work/gallery-source/selection.json');p.add_argument('--workers',type=int,default=3);p.add_argument('--clip');p.add_argument('--prepare-only',action='store_true');p.add_argument('--smpl',default='/Users/arson/ego_viz_local/body_models/smpl/SMPL_NEUTRAL_np.npz');p.add_argument('--mano',default=str(root/'work/body-models/mano/MANO_RIGHT_numpy.pkl'));p.add_argument('--out',type=Path,default=root/'public/motion');p.add_argument('--prepared-videos',type=Path);a=p.parse_args()
rows=json.loads(a.manifest.read_text());out=a.out;out.mkdir(parents=True,exist_ok=True);cache=root/'work/gallery-source'
if a.clip:rows=[x for x in rows if x['id']==a.clip]
def build(row):
 key=row['id'];src=cache/key;start,end=row['start'],row['end'];count=end-start
 marker=src/'complete.json'
 if marker.exists() and not a.prepare_only and (out/f'{key}.json').exists():
  existing=json.loads((out/f'{key}.json').read_text())
  if existing.get('locomotion') is not None and existing.get('model')=='SMPL + MANO' and existing.get('hands',{}).get('sourceBetasUsed') is False and existing.get('hands',{}).get('attachmentVersion')==2 and existing['source']['startFrame']==start and existing['source']['endFrameExclusive']==end:return json.loads(marker.read_text())
 deadline=time.monotonic()+900
 while not all((src/name).exists() for name in (['source.parquet','world.npz','dynhamr_hands.npz']+([] if a.prepared_videos else ['source.mp4']))):
  if time.monotonic()>deadline:raise TimeoutError(f'Sources not downloaded: {key}')
  time.sleep(2)
 pose,body_valid=read_body_pose(src/'source.parquet')
 assert body_valid[start:end].all(),(key,'body tracking gap')
 metrics=sequence_metrics(src/'source.parquet',src/'dynhamr_hands.npz',src/'world.npz')
 quality=report(metrics,start,end)
 locomotion=locomotion_report(metrics,start,end)
 assert locomotion['horizontalTravelMeters']>=.45 and max(locomotion['footHorizontalExcursionMeters'])>=.2,(key,locomotion)
 assert max(locomotion['ankleExcursionMeters'])>=.12,(key,'no relative foot motion')
 assert locomotion['maxRootAccelerationMetersPerFrameSquared']<=.02,(key,'translation discontinuity')
 assert quality['bodyDegrees'][0]<=15 and quality['fingerDegrees'][0]<=25 and quality['rootCm'][0]<=8,(key,quality)
 quality.update(criterion='Raw 30 Hz geodesic rotation continuity; no missing body/hands; no smoothing',bodyStepLimitDegrees=15,fingerStepLimitDegrees=25,rootStepLimitCm=8,rootAccelerationLimitMetersPerFrameSquared=.02)
 t=pq.read_table(src/'source.parquet',columns=['timestamp','observation.pico.left_hand_active','observation.pico.right_hand_active'])
 assert np.max(abs(np.asarray(t['timestamp'].to_pylist()).reshape(-1)[start:end]-np.arange(start,end)/30))<1e-4
 pico=np.stack([np.asarray(t[f'observation.pico.{side}_hand_active'].to_pylist()).reshape(-1) for side in ['left','right']],axis=1)[start:end]
 with np.load(src/'dynhamr_hands.npz') as h:
  valid=(h['valid']&h['visible'])[start:end]
  assert valid.shape==(count,2) and valid.all(),(key,'not fully observed')
  assert np.isfinite(h['joints_world'][start:end]).all()
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,r_frame_rate','-of','json',str(a.prepared_videos/f'{key}.mp4' if a.prepared_videos else src/'source.mp4')]))['streams'][0]
 assert int(probe['nb_frames'])==(count if a.prepared_videos else len(pose)) and probe['r_frame_rate']=='30/1',(key,probe,len(pose))
 indices=list(range(start,end,2))
 if indices[-1]!=end-1:indices.append(end-1)
 coverage={'frameCount':count,'dynhamrValidFrames':valid.sum(axis=0).tolist(),'bothValidFrames':int(valid.all(axis=1).sum()),'picoActiveFrames':pico.sum(axis=0).tolist(),'bodyValidFrames':int(body_valid[start:end].sum()),'criterion':'DynHaMR valid & visible at original 30 fps; PICO hand_active'}
 hashes={name:hashlib.file_digest((src/name).open('rb'),'sha256').hexdigest() for name in ['source.parquet','dynhamr_hands.npz','world.npz']}
 data={'id':key,'title':row['title'],'fps':30,'sampleFps':15,'duration':count/30,'frameCount':len(indices),'quantization':.0001,'vertices':f'/motion/{key}.vertices.bin.gz','times':[(i-start)/30 for i in indices],'source':{'collection':row.get('collection','v1_0729'),'episode':row['episode'],'task':row['task'],'startFrame':start,'endFrameExclusive':end,'replacedInvalidFrames':[int(i) for i in np.flatnonzero(~body_valid) if start<=i<end],'sha256':hashes},'handCoverage':coverage,'quality':quality,'locomotion':locomotion,'cameraMount':'Illustrative chest placement, forward and pitched downward 30 degrees; no calibrated camera extrinsics supplied.'}
 (out/f'{key}.json').write_text(json.dumps(data,separators=(',',':')))
 if a.prepared_videos:
  for suffix in ['mp4','jpg']:shutil.copyfile(a.prepared_videos/f'{key}.{suffix}',out/f'{key}.{suffix}')
 else:
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-threads','1','-i',str(src/'source.mp4'),'-vf',f'trim=start_frame={start}:end_frame={end},setpts=N/(30*TB),scale=640:-2','-an','-r','30','-fps_mode','cfr','-enc_time_base','1:30','-c:v','libx264','-threads','1','-preset','medium','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'{key}.mp4')],check=True)
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(count/60),'-i',str(out/f'{key}.mp4'),'-frames:v','1',str(out/f'{key}.jpg')],check=True)
 print(key,'prepared',coverage,flush=True)
 entry={'id':key,'title':row['title'],'duration':count/30,'metadata':f'/motion/{key}.json','video':f'/motion/{key}.mp4','poster':f'/motion/{key}.jpg','collection':row.get('collection','v1_0729'),'episode':row['episode'],'task':row['task'],'handCoverage':coverage,'quality':quality,'locomotion':locomotion}
 if a.prepare_only:return entry
 with (src/'build.log').open('w') as log:
  subprocess.run([sys.executable,str(root/'scripts/export-smpl-mano-gallery.py'),
                  '--smpl',a.smpl,'--mano',a.mano,'--clip',key,'--out',str(out),'--metadata-dir',str(out)],
                 check=True,stdout=log,stderr=subprocess.STDOUT)
 marker.write_text(json.dumps(entry,ensure_ascii=False,indent=2))
 print(key,'complete',flush=True)
 return entry
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
 entries=list(pool.map(build,rows))
if not a.clip and not a.prepare_only:
 assert entries and len({(x.get('collection','v1_0729'),x['episode']) for x in entries})==len(entries)
 (out/'gallery.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2))
 print(f'Built {len(entries)}-clip gallery manifest',flush=True)
