"""Smooth finger rotations and use shoulder/elbow IK for display-only body clearance.
Never moves hand vertices independently, changes finger data in place, or changes SONIC.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1');os.environ.setdefault('VECLIB_MAXIMUM_THREADS','1')
from pathlib import Path
import argparse,gzip,json
import numpy as np
import pyarrow.parquet as pq
import trimesh
from scipy.optimize import least_squares
from scipy.ndimage import maximum_filter1d,gaussian_filter1d
from scipy.spatial.transform import Rotation
from smplx_lbs import SMPLX,HAND_JOINTS,TIPS,ORDER
from smpl_lbs import R_ALIGN
from motion_filter import smooth_rotations,interpolate_invalid_rotations
from motion_sources import motion_sources,read_body_pose
p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--clip');p.add_argument('--manifest',type=Path);p.add_argument('--clearance-padding',type=float,default=0);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'public/motion';cache=root/'work/smplx-fit';m=SMPLX(a.model)
body_weights=m.W[:,list(range(16))+[22,23,24]].sum(axis=1)
obstacle_faces=m.faces[(body_weights[m.faces]>.75).all(axis=1)]
hand_ids=[np.flatnonzero(m.W[:,[20+s,*range(25+15*s,40+15*s)]].sum(axis=1)>.65) for s in [0,1]]

def clearance(v):
 obstacle=trimesh.Trimesh(v,obstacle_faces,process=False);dist=[]
 surface=v[np.unique(obstacle_faces)];lower,upper=surface.min(axis=0),surface.max(axis=0)
 for ids in hand_ids:
  pts=v[ids]
  # Disjoint enclosing boxes certify a conservative separation for every vertex
  # and triangle. Only nearby/overlapping boxes need the expensive exact query.
  bound=float(np.linalg.norm(np.maximum(np.maximum(lower-pts.max(axis=0),pts.min(axis=0)-upper),0)))
  if bound>.015+a.clearance_padding:
   dist.append(bound);continue
  closest,d,tri=trimesh.proximity.closest_point(obstacle,pts);sign=np.einsum('ij,ij->i',pts-closest,obstacle.face_normals[tri]);signed=d*np.where(sign>=0,1,-1);dist.append(float(signed.min()))
 return np.array(dist)

def arm_ik(R,offsets):
 result=R.copy();G=m.skeleton(R);axis=G[9,:3,:3]@np.array([1.,0,0]);forward=G[9,:3,:3]@np.array([0.,0,1.])
 for side in [0,1]:
  shift=axis*(1 if side==0 else -1)*offsets[side]+forward*offsets[side]*.22
  shoulder,elbow,wrist=16+side,18+side,20+side;target=G[wrist,:3,3]+shift;etarget=G[elbow,:3,3]+shift*.55
  def evaluate(x):
   local=result.copy();local[[shoulder,elbow]]=Rotation.from_rotvec(x.reshape(2,3)).as_matrix()@R[[shoulder,elbow]];g=m.skeleton(local);return local,g
  def residual(x):
   _,g=evaluate(x);return np.r_[(g[wrist,:3,3]-target)*40,(g[elbow,:3,3]-etarget)*10,x*.10]
  x=least_squares(residual,np.zeros(6),max_nfev=24,ftol=1e-5,xtol=1e-5,gtol=1e-5).x
  result,g=evaluate(x);result[wrist]=g[elbow,:3,:3].T@G[wrist,:3,:3]
 return result
for key,raw,_ in motion_sources(root,a.manifest):
 if a.clip and key!=a.clip:continue
 source=np.load(cache/f'{key}.npz');Rs=source['rotations'].copy();original=Rs.copy();valid=source['valid'];N=len(Rs);m.set_shape(source['betas']);d=json.loads((out/f'{key}.json').read_text());inds=source['source_frames']
 for side in [0,1]:
  joints=slice(25+side*15,40+side*15)
  Rs[:,joints]=interpolate_invalid_rotations(smooth_rotations(Rs[:,joints],valid[:,side]),valid[:,side],times=inds/30)
 def speeds(r):
  stats=[]
  for s in [0,1]:
   x=r[:,25+s*15:40+s*15];delta=np.einsum('nkji,nkjl->nkil',x[:-1],x[1:]);ang=Rotation.from_matrix(delta.reshape(-1,3,3)).magnitude().reshape(N-1,15);mask=valid[1:,s]&valid[:-1,s];stats.extend(ang[mask].reshape(-1))
  return float(np.mean(np.square(stats)))
 print(key,'finger frame-to-frame angular energy',speeds(original),'->',speeds(Rs),flush=True)
 before=np.array([clearance(m.forward(R)[0]) for R in Rs]);print(key,'before minimum hand/body clearance mm',before.min(axis=0)*1000,flush=True)
 # Start with a modest 6 cm outward wrist target on both arms. Increase only where
 # needed, dilating in time before smoothing so clearance correction does not pop.
 clearance_target=.015+a.clearance_padding
 offsets=np.full((N,2),.06+a.clearance_padding);current=Rs.copy();distances=before.copy()
 for iteration in range(8):
  offsets=gaussian_filter1d(maximum_filter1d(offsets,size=7,axis=0,mode='nearest'),sigma=1.0,axis=0,mode='nearest')
  for i in range(N):current[i]=arm_ik(Rs[i],offsets[i])
  distances=np.array([clearance(m.forward(R)[0]) for R in current]);bad=distances<clearance_target
  print(key,'pass',iteration,'clearance mm',distances.min(axis=0)*1000,'frames below target',bad.sum(),'max target shift',offsets.max(),flush=True)
  if not bad.any():break
  offsets+=np.maximum(clearance_target-distances,0)*1.4+.01*bad
 else:raise RuntimeError(f'{key}: clearance did not converge; refusing to export')
 pose,_=read_body_pose(raw);start=int(inds[0]);right=pose[start,16,:3]-pose[start,17,:3];right[1]=0;right/=np.linalg.norm(right);up=np.array([0.,1.,0.]);basis=np.stack([right,up,np.cross(right,up)],axis=1);origin=pose[start,0,:3].copy();origin[1]=0
 vertices=[];joints=[];hands=[];wrist_delta=[]
 for i,f in enumerate(inds):
  v,j=m.forward(current[i]);wrist_delta.append(np.linalg.norm(j[[20,21]]-m.skeleton(Rs[i])[[20,21],:3,3],axis=1))
  v=((v-m.J[0])@R_ALIGN+pose[f,0,:3]-origin)@basis;j=((j-m.J[0])@R_ALIGN+pose[f,0,:3]-origin)@basis;vertices.append(v);joints.append(np.concatenate([j[:22],j[[28,43]]]))
  hands.append(np.array([np.concatenate([j[HAND_JOINTS[s]],v[TIPS[s]]])[ORDER] for s in [0,1]]))
 v=np.array(vertices);j=np.array(joints);hj=np.array(hands);floor=np.percentile(v[:,:,1].min(axis=1),2);v[:,:,1]-=floor;j[:,:,1]-=floor;hj[:,:,:,1]-=floor
 # Verify intermediate animation frames too: browser linearly interpolates baked
 # vertices. Test quarter, midpoint and three-quarter positions for every interval.
 interpolated_min=np.array([np.inf,np.inf])
 for i in range(N-1):
  for mix in [.25,.5,.75]:interpolated_min=np.minimum(interpolated_min,clearance(v[i]*(1-mix)+v[i+1]*mix))
 print(key,'interpolated minimum clearance mm',interpolated_min*1000,flush=True)
 assert interpolated_min.min()>.006,'Insufficient interpolated clearance'
 assert np.max(wrist_delta)<.3,'Display correction exceeds 30 cm; refusing to export'
 q=np.round(v*10000);assert abs(q).max()<32767
 (out/f'{key}.vertices.bin.gz').write_bytes(gzip.compress(q.astype('<i2').tobytes(),mtime=0))
 d['joints']=j.round(5).reshape(N,-1).tolist();d['hands']['joints']=hj.round(5).reshape(N,-1).tolist();d['bounds']={'min':v.min(axis=(0,1)).tolist(),'max':v.max(axis=(0,1)).tolist()}
 d['hands']['invalidDisplay']='SLERP between smoothed valid finger poses; nearest valid pose held at endpoints; neutral only if no valid pose exists'
 d['hands']['gapFilling']={'method':'SLERP after valid-only smoothing','validMaskUnchanged':True,'edgePolicy':'nearest valid','allInvalidPolicy':'neutral'}
 d['fit']['displayRefinement']={'handSmoothing':'Sign-continuous normalized quaternion Gaussian, sigma=1.2 at 15Hz, zero phase, within valid runs only','rawAngularEnergy':speeds(original),'filteredAngularEnergy':speeds(Rs),'armCorrection':'Shoulder/elbow IK; preserve wrist world orientation and filtered finger rotations','minKeyframeClearanceMeters':distances.min(axis=0).tolist(),'minInterpolatedClearanceMeters':interpolated_min.tolist(),'maxWristDisplacementMeters':np.max(wrist_delta,axis=0).tolist(),'collisionSurface':'Hand vertices against torso/head/leg surface; arm attachment regions excluded','scope':'Display correction only; source data and SONIC rollout unchanged'}
 d['fit']['displayRefinement']['clearanceEvaluation']='Conservative separation from disjoint enclosing boxes; exact signed point-to-triangle distances for nearby or overlapping boxes'
 (out/f'{key}.json').write_text(json.dumps(d,separators=(',',':')));np.savez_compressed(cache/f'{key}.display.npz',rotations=current,offsets=offsets,clearances=distances,smoothed_rotations=Rs)
 print(key,'saved',flush=True)
