"""Bake PICO + SMPL to compact animated meshes; never ship SMPL model parameters.
Run with numpy, scipy, pyarrow and fast-simplification. See scripts/MOTION.md.
"""
import argparse, gzip, json, subprocess
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import fast_simplification as fs
from smpl_lbs import SMPL, global_quats_to_local_R

parser=argparse.ArgumentParser()
parser.add_argument('--model',required=True)
parser.add_argument('--floor-source',type=Path,required=True)
a=parser.parse_args()
root=Path(__file__).resolve().parent.parent
out=root/'public/motion';out.mkdir(exist_ok=True)
source=root/'work/motion-source'
model=SMPL(a.model)
_,_,collapses=fs.simplify(model.vt,model.faces,target_count=4600,return_collapses=True)
clips=[('chair',source/'chair',0,260,'Reposition a chair',1),('floor',a.floor_source,560,830,'Collect objects from the floor',63),('cart',source/'cart',30,330,'Push a cart',0)]
manifest=[]
for key,path,start,end,title,episode in clips:
 rows=pq.read_table(path.with_suffix('.parquet')).to_pylist()
 pose=np.asarray([r['observation.pico.body_pose'] for r in rows]).reshape(-1,24,7)
 valid=np.array([bool(np.asarray(r['observation.pico.body_available']).all()) for r in rows]) & np.isfinite(pose).all(axis=(1,2)) & (np.linalg.norm(pose[:,:,3:],axis=2)>.5).all(axis=1)
 # Isolated missing tracker frames use the nearest valid pose, preserving timeline.
 for i in np.flatnonzero(~valid):pose[i]=pose[np.flatnonzero(valid)[np.argmin(abs(np.flatnonzero(valid)-i))]]
 assert end<=len(pose)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,r_frame_rate','-of','json',str(path.with_suffix('.mp4'))]))['streams'][0]
 assert int(probe['nb_frames'])==len(rows), 'Video and motion frame counts differ'
 assert probe['r_frame_rate']=='30/1'
 assert all(abs(float(rows[i]['timestamp'])-i/30)<1e-4 for i in range(start,end))
 # One fixed yaw normalization per clip; keep recorded translation, pitch and roll.
 right=pose[start,16,:3]-pose[start,17,:3];right[1]=0;right/=np.linalg.norm(right)
 up=np.array([0.,1.,0.]);front=np.cross(right,up)
 basis=np.stack([right,up,front],axis=1)
 origin=pose[start,0,:3].copy();origin[1]=0
 vertices=[];joints=[];times=[]
 indices=list(range(start,end,2))
 if indices[-1]!=end-1:indices.append(end-1)
 for fi in indices:
  body=pose[fi]
  v=model.forward(global_quats_to_local_R(body[:,3:]),body[0,:3])
  v,f,mapping=fs.replay_simplification(v.astype(np.float32),model.faces,collapses)
  if vertices:assert np.array_equal(f,faces), 'Animated topology changed'
  faces=f
  vertices.append((v-origin)@basis)
  joints.append((body[:,:3]-origin)@basis)
  times.append((fi-start)/30)
 v=np.array(vertices);j=np.array(joints)
 floor=float(np.percentile(v[:,:,1].min(axis=1),2))
 v[:,:,1]-=floor;j[:,:,1]-=floor
 quant=np.round(v*10000)
 assert abs(quant).max()<32767
 raw=quant.astype('<i2').tobytes()
 (out/f'{key}.vertices.bin.gz').write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
 data={'id':key,'title':title,'fps':30,'sampleFps':15,'duration':(end-start)/30,'vertexCount':v.shape[1],'frameCount':len(v),'quantization':.0001,'vertices':f'/motion/{key}.vertices.bin.gz','footGroups':[np.unique(mapping[model.W[:,js].sum(axis=1)>.5]).tolist() for js in [[7,10],[8,11]]],'footVertices':np.unique(mapping[model.W[:,[7,8,10,11]].sum(axis=1)>.5]).tolist(),'faces':faces.reshape(-1).tolist(),'times':times,'joints':np.round(j,5).reshape(len(j),-1).tolist(),'bounds':{'min':v.min(axis=(0,1)).tolist(),'max':v.max(axis=(0,1)).tolist()},'source':{'collection':'v1_0729','episode':episode,'startFrame':start,'endFrameExclusive':end,'replacedInvalidFrames':[int(i) for i in np.flatnonzero(~valid) if start<=i<end]},'cameraMount':'Illustrative chest placement; no calibrated camera extrinsics supplied.'}
 (out/f'{key}.json').write_text(json.dumps(data,separators=(',',':')))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path.with_suffix('.mp4')),'-vf',f'trim=start_frame={start}:end_frame={end},setpts=N/(30*TB),scale=640:-2','-an','-r','30','-fps_mode','cfr','-enc_time_base','1:30','-c:v','libx264','-preset','medium','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'{key}.mp4')],check=True)
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','0','-i',str(out/f'{key}.mp4'),'-frames:v','1',str(out/f'{key}.jpg')],check=True)
 manifest.append({'id':key,'title':title,'duration':data['duration'],'metadata':f'/motion/{key}.json','video':f'/motion/{key}.mp4','poster':f'/motion/{key}.jpg'})
 print(key,'frames',len(v),'vertices',v.shape[1],'compressed', (out/f'{key}.vertices.bin.gz').stat().st_size,flush=True)
(out/'clips.json').write_text(json.dumps(manifest,indent=2))
