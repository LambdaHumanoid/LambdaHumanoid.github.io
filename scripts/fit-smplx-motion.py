"""Fit PICO body shape and DynHaMR finger joints to one native SMPL-X surface."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1');os.environ.setdefault('VECLIB_MAXIMUM_THREADS','1')
import argparse,gzip,json
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from smplx_lbs import SMPLX,palm,HAND_JOINTS,TIPS,ORDER
from smpl_lbs import global_quats_to_local_R,R_ALIGN
from motion_sources import motion_sources,read_body_pose
p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--clip');p.add_argument('--manifest',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'public/motion';src=root/'work/retarget-source';cache=root/'work/smplx-fit';cache.mkdir(exist_ok=True)
m=SMPLX(a.model)
for key,raw,folder in motion_sources(root,a.manifest):
 if a.clip and key!=a.clip:continue
 d=json.loads((out/f'{key}.json').read_text());h=np.load(folder/'dynhamr_hands.npz');w=np.load(folder/'world.npz');pose,body_valid=read_body_pose(raw);start=d['source']['startFrame'];inds=np.rint(np.array(d['times'])*30).astype(int)+start;N=len(inds)
 Rs=np.tile(np.eye(3),(N,55,1,1))
 for i,f in enumerate(inds):Rs[i,:22]=global_quats_to_local_R(pose[f,:,3:])[:22]
 sample=np.arange(0,N,10);m.set_shape(np.zeros(10))
 def bodyj(beta):
  m.set_shape(beta);return np.array([(m.skeleton(Rs[i])[:22,:3,3]-m.J[0])@R_ALIGN+pose[inds[i],0,:3] for i in sample])
 j0=bodyj(np.zeros(10));A=np.stack([(bodyj(np.eye(10)[i])-j0).reshape(-1) for i in range(10)],axis=1);target=pose[inds[sample],:22,:3];y=(target-j0).reshape(-1)
 beta=np.clip(np.linalg.lstsq(np.vstack([A,np.eye(10)*.12]),np.r_[y,np.zeros(10)],rcond=None)[0],-2,2);m.set_shape(beta)
 print(key,'body fit mm',np.sqrt(np.mean((j0-target)**2))*1000,'->',np.sqrt(np.mean((bodyj(beta)-target)**2))*1000,flush=True)
 valid=(h['valid'][inds]&h['visible'][inds]);errors=np.zeros((N,2));before=np.zeros((N,2));fitposes=np.zeros((N,2,45));targets=np.zeros((N,2,21,3))
 for side in [0,1]:
  rest=m.hand(np.zeros(45),side);palm_len=np.linalg.norm(rest[9]-rest[0]);seen=np.flatnonzero(h['valid'][:,side]&h['visible'][:,side]);scale=palm_len/np.median(np.linalg.norm(h['joints_world'][seen,side,9]-h['joints_world'][seen,side,0],axis=1)) if len(seen) else 1
  track=np.flatnonzero(w['is_right'][:,0]==side)
  for i,f in enumerate(inds):
   initial=m.mean[side].copy()
   if valid[i,side]:
    tr=int(track[0]);local=f-int(h['frame_interval'][0]);initial=w['pose_body'][tr,local].reshape(15,3).astype(float)
    if side==0:initial*=np.array([1,-1,-1])
    initial=initial.reshape(45);j=h['joints_world'][f,side];goal=(j-j[0])@palm(j)*scale;targets[i,side]=goal
    def coords(p):
     j=m.hand(p,side);return (j-j[0])@palm(j)
    def residual(p):return np.r_[(coords(p)[1:]-goal[1:]).reshape(-1)/.01,(p-initial)*.025]
    before[i,side]=np.sqrt(np.mean(np.sum((coords(initial)-goal)**2,axis=1)))
    fitted=least_squares(residual,initial,max_nfev=18,ftol=1e-4,xtol=1e-4,gtol=1e-4).x
    errors[i,side]=np.sqrt(np.mean(np.sum((coords(fitted)-goal)**2,axis=1)));initial=fitted
   fitposes[i,side]=initial;Rs[i,25+15*side:40+15*side]=Rotation.from_rotvec(initial.reshape(15,3)).as_matrix()
  good=valid[:,side];print(key,side,'fit frames',sum(good),'palm-local joint RMS mm',float(np.median(before[good,side])*1000) if good.any() else None,'->',float(np.median(errors[good,side])*1000) if good.any() else None,flush=True)
 # Keep native topology: all fingers and wrist seams are continuous, no appended meshes.
 right=pose[start,16,:3]-pose[start,17,:3];right[1]=0;right/=np.linalg.norm(right);up=np.array([0,1,0]);basis=np.stack([right,up,np.cross(right,up)],axis=1);origin=pose[start,0,:3].copy();origin[1]=0
 vertices=[];bodyjoints=[];handjoints=[]
 for i,f in enumerate(inds):
  v,j=m.forward(Rs[i]);v=((v-m.J[0])@R_ALIGN+pose[f,0,:3]-origin)@basis;j=((j-m.J[0])@R_ALIGN+pose[f,0,:3]-origin)@basis
  # Viewer still consumes 24 body points; final two are palm centers.
  bodyjoints.append(np.concatenate([j[:22],j[[28,43]]]))
  handjoints.append(np.array([np.concatenate([j[HAND_JOINTS[s]],v[TIPS[s]]])[ORDER] for s in [0,1]]));vertices.append(v)
 v=np.array(vertices);j=np.array(bodyjoints);hj=np.array(handjoints);floor=np.percentile(v[:,:,1].min(axis=1),2);v[:,:,1]-=floor;j[:,:,1]-=floor;hj[:,:,:,1]-=floor
 quant=np.round(v*10000);assert abs(quant).max()<32767
 # Preserve hand regions for topology validation; render the whole surface with one material.
 hand_vertices=[np.flatnonzero(m.W[:,[20+s,*range(25+15*s,40+15*s)]].sum(axis=1)>.5) for s in [0,1]]
 labels=np.zeros(len(m.faces),int)
 for s,ids in enumerate(hand_vertices):labels[np.isin(m.faces,ids).all(axis=1)]=s+1
 groups=[m.faces[labels==k] for k in range(3)];faces=np.concatenate(groups);good=valid
 d.update(model='SMPL-X',vertexCount=len(m.v),faces=faces.reshape(-1).tolist(),joints=j.round(5).reshape(N,-1).tolist(),footGroups=[np.flatnonzero(m.W[:,js].sum(axis=1)>.5).tolist() for js in [[7,10],[8,11]]],footVertices=np.flatnonzero(m.W[:,[7,8,10,11]].sum(axis=1)>.5).tolist(),bounds={'min':v.min(axis=(0,1)).tolist(),'max':v.max(axis=(0,1)).tolist()},hands={'valid':valid.tolist(),'joints':hj.round(5).reshape(N,-1).tolist(),'groups':[len(g)*3 for g in groups],'vertexGroups':[x.tolist() for x in hand_vertices],'source':'DynHaMR 21-joint palm-local fitting to native SMPL-X hands','invalidDisplay':'Neutral SMPL-X hand pose; tracking state indicated in text','fitMedianJointErrorMeters':float(np.median(errors[good])),'fitMaxJointErrorMeters':float(errors[good].max()),'continuousNativeTopology':True},fit={'bodyShape':beta.tolist(),'bodyJointRmsMeters':float(np.sqrt(np.mean((bodyj(beta)-target)**2))),'handTargetFrame':'Palm-local, episode-constant scale; wrist orientation from PICO','method':'Regularized body-shape least squares and nonlinear hand joint-position fitting'})
 np.savez_compressed(cache/f'{key}.npz',rotations=Rs,betas=beta,hand_poses=fitposes,valid=valid,errors=errors,targets=targets,source_frames=inds)
 (out/f'{key}.vertices.bin.gz').write_bytes(gzip.compress(quant.astype('<i2').tobytes(),mtime=0));(out/f'{key}.json').write_text(json.dumps(d,separators=(',',':')))
 print(key,'exported',len(m.v),'native vertices; bytes',(out/f'{key}.vertices.bin.gz').stat().st_size,flush=True)
