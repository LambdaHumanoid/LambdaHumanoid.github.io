"""Run through SSH stdin in the existing gr00t_wbc env; emits NPZ to stdout.
Read-only: extract model geometry and recorded FK, never step or modify the rollout.
"""
import argparse,hashlib,io,sys
from pathlib import Path
import numpy as np
import mujoco
root=Path('/primus_xpfs_workspace_T04/xcy')
parser=argparse.ArgumentParser();parser.add_argument('--rollout-dir',type=Path);args=parser.parse_args()
model_path=root/'code/GR00T-WholeBodyControl/gear_sonic/data/robots/g1/g1_29dof.xml'
m=mujoco.MjModel.from_xml_path(str(model_path));d=mujoco.MjData(m)
parts=[];out={}
for g in range(m.ngeom):
 if m.geom_type[g]!=mujoco.mjtGeom.mjGEOM_MESH or m.geom_group[g]!=1:continue
 mesh=int(m.geom_dataid[g]);name=mujoco.mj_id2name(m,mujoco.mjtObj.mjOBJ_MESH,mesh)
 if 'rubber_hand' in name:continue
 p=len(parts);parts.append(g)
 va,nv=m.mesh_vertadr[mesh],m.mesh_vertnum[mesh];fa,nf=m.mesh_faceadr[mesh],m.mesh_facenum[mesh]
 out[f'v{p}']=m.mesh_vert[va:va+nv];out[f'f{p}']=m.mesh_face[fa:fa+nf];out[f'color{p}']=m.geom_rgba[g];out[f'name{p}']=np.array(name)
 wrists=[mujoco.mj_name2id(m,mujoco.mjtObj.mjOBJ_BODY,s+'_wrist_yaw_link') for s in ['left','right']]
out['parts']=np.array(len(parts));out['model_path']=np.array(str(model_path))
for key,ep,start,end in [('chair',1,0,260),('cart',0,30,330),('floor',63,560,830)]:
 source=root/f'ego_dataset/PicoGoPro/v1_0729/.pipeline_work_sonic_online_v4/episode_{ep:06d}/sonic_mujoco.npz'
 if args.rollout_dir:source=args.rollout_dir/f'{key}.sonic.npz'
 a=np.load(source);q=a['qpos'];indices=list(range(start,end,2))
 if indices[-1]!=end-1:indices.append(end-1)
 sample_indices=np.array(indices)-start if args.rollout_dir else np.array(indices)
 if args.rollout_dir:
  assert str(a['pipeline_version'])=='gmr-smplx-g1-sonic-g1-dyn-v1'
  assert not a['control_fallen'].any(), f'{key}: fallen rollout is not publishable'
  assert np.array_equal(a['source_frames'],np.arange(start,end))
  assert np.isfinite(q).all()
  out[key+'_rollout_sha256']=np.array(hashlib.file_digest(source.open('rb'),'sha256').hexdigest())
  out[key+'_pipeline']=a['pipeline_version']
 p=[];r=[];wp=[];wr=[]
 for i in sample_indices:
  d.qpos[:7]=q[i,:7]
  for j,name in enumerate(a['joint_names']):d.qpos[m.jnt_qposadr[mujoco.mj_name2id(m,mujoco.mjtObj.mjOBJ_JOINT,str(name))]]=q[i,7+j]
  mujoco.mj_forward(m,d)
  p.append(d.geom_xpos[parts].copy());r.append(d.geom_xmat[parts].reshape(-1,3,3).copy());wp.append(d.xpos[wrists].copy());wr.append(d.xmat[wrists].reshape(-1,3,3).copy())
 out[key+'_positions']=np.array(p);out[key+'_rotations']=np.array(r);out[key+'_wrists']=np.array(wp);out[key+'_wrist_rotations']=np.array(wr)
 out[key+'_indices']=np.array(indices);out[key+'_source_qpos']=q[sample_indices];out[key+'_fallen']=a['fallen'][sample_indices]
b=io.BytesIO();np.savez_compressed(b,**out);sys.stdout.buffer.write(b.getvalue())
