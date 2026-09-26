"""Bake recorded SONIC FK + actual retargeted Revo2 commands for browser playback.
Revo2 official URDF geometry, joint limits and mimic coupling are applied offline.
"""
from pathlib import Path
import argparse,gzip,json,xml.etree.ElementTree as ET
import numpy as np
import pyarrow.parquet as pq
import trimesh
from scipy.spatial.transform import Rotation as R
from motion_filter import smooth_commands,interpolate_invalid_commands
from revo2_mount import mount_rotation,mount_metadata,TRANSLATION
root=Path(__file__).resolve().parent.parent;out=root/'public/motion';src=root/'work/retarget-source';repo=root/'work/revo2-model'
parser=argparse.ArgumentParser();parser.add_argument('--gmr-sonic',type=Path,default=root/'work/gmr-sonic');args=parser.parse_args()
a=np.load((args.gmr_sonic if args.gmr_sonic else src)/'g1-fk.npz');parts=[]
provenance=json.loads((args.gmr_sonic/'provenance.json').read_text()) if args.gmr_sonic else None
# Keep the original visual topology; aggressive 1,600-face decimation broke thin shells.
urdf=ET.parse(src/'g1_29dof.urdf').getroot()
body_colors={Path(v.find('geometry/mesh').get('filename')).stem:np.fromstring(v.find('material/color').get('rgba'),sep=' ').tolist() for v in urdf.findall('./link/visual') if v.find('geometry/mesh') is not None and v.find('material/color') is not None}
def add(v,f,name,color,side=-1):
 v=np.asarray(v,dtype=np.float32);f=np.asarray(f,dtype=np.int32)
 parts.append(dict(name=name,positions=np.round(v,6).reshape(-1).tolist(),indices=f.reshape(-1).tolist(),color=list(color),hand=side));return len(parts)-1
for i in range(int(a['parts'])):add(a[f'v{i}'],a[f'f{i}'],str(a[f'name{i}']),body_colors.get(str(a[f'name{i}']),a[f'color{i}'].tolist()))
bodyparts=len(parts);hands=[]
def transform(e):
 T=np.eye(4)
 if e is not None:T[:3,3]=np.fromstring(e.get('xyz','0 0 0'),sep=' ');T[:3,:3]=R.from_euler('xyz',np.fromstring(e.get('rpy','0 0 0'),sep=' ')).as_matrix()
 return T
for side,label in enumerate(['left','right']):
 xml=ET.parse(repo/f'urdf/revo2_{label}_hand.urdf').getroot();joints=[];visuals=[]
 for e in xml.findall('joint'):
  lim=e.find('limit');mimic=e.find('mimic');joints.append(dict(name=e.get('name'),type=e.get('type'),parent=e.find('parent').get('link'),child=e.find('child').get('link'),T=transform(e.find('origin')),axis=np.fromstring(e.find('axis').get('xyz'),sep=' ') if e.find('axis') is not None else np.array([1,0,0]),limit=[float(lim.get('lower')),float(lim.get('upper'))] if lim is not None else [0,0],mimic=dict(mimic.attrib) if mimic is not None else None))
 for link in xml.findall('link'):
  for vis in link.findall('visual'):
   filename=vis.find('geometry/mesh').get('filename').replace('package://revo2_description/','');mesh=trimesh.load(repo/filename,force='mesh');scale=np.fromstring(vis.find('geometry/mesh').get('scale','1 1 1'),sep=' ')
   name=link.get('name');dark=any(s in filename for s in ['touch','tip','distal'])
   part=add(mesh.vertices*scale,mesh.faces,name,[.17,.19,.22,1] if dark else [.72,.74,.78,1],side)
   visuals.append((part,name,transform(vis.find('origin'))))
 hands.append((label,joints,visuals))
model={'parts':parts,'bodyParts':bodyparts,'geometryQuality':'Original visual mesh topology; no decimation','handMount':mount_metadata(),'sources':{'body':str(a['model_path']),'hands':'https://github.com/BrainCoTech/revo2_description','handMount':'Side-specific palm alignment to GMR wrist frames; illustrative +4.5 cm adapter, not a calibrated hardware mount.'}}
(out/'g1-revo2.model.json.gz').write_bytes(gzip.compress(json.dumps(model,separators=(',',':')).encode(),mtime=0))
for key,folder in [('chair',src),('cart',src/'cart'),('floor',src/'floor')]:
 d=json.loads((out/f'{key}.json').read_text());t=pq.read_table(folder/'robot.parquet');actions=np.asarray(t['action'].to_pylist())[:,64:76];masks=np.asarray(t['action.valid_mask'].to_pylist())[:,64:76];inds=a[key+'_indices'];assert np.array_equal(inds,np.rint(np.array(d['times'])*30).astype(int)+d['source']['startFrame'])
 assert not a[key+'_fallen'].any()
 if args.gmr_sonic:
  assert str(a[key+'_pipeline'])=='gmr-smplx-g1-sonic-g1-dyn-v1'
 else:assert np.max(abs(np.asarray(t['observation.g1.qpos'].to_pylist())[inds]-a[key+'_source_qpos']))<1e-5
 raw_actions=actions.copy()
 for side in [0,1]:
  channels=slice(side*6,(side+1)*6);good=masks[:,channels].all(axis=1)
  actions[:,channels]=interpolate_invalid_commands(smooth_commands(actions[:,channels],good,sigma=2.4),good)
 actions=np.clip(actions,0,1)
 poses=[];valid=[];bounds=[]
 # G1 is Z-up, +X forward; the viewer is Y-up, +Z forward. One initial yaw only.
 yaw=R.from_quat(a[key+'_source_qpos'][0,3:7][[1,2,3,0]]).as_euler('xyz')[2]
 C=np.array([[0,1,0],[0,0,1],[1,0,0]])@R.from_euler('z',-yaw).as_matrix();origin=a[key+'_source_qpos'][0,:3].copy();origin[2]=0
 for fi,idx in enumerate(inds):
  Tlist=[]
  for i in range(bodyparts):
   T=np.eye(4);T[:3,:3]=a[key+'_rotations'][fi,i];T[:3,3]=a[key+'_positions'][fi,i];Tlist.append(T)
  for side,(label,joints,visuals) in enumerate(hands):
   cmd=actions[idx,side*6:(side+1)*6]
   vals={};links={label+'_base_link':np.eye(4)}
   for j in joints:
    name=j['name'];value=0
    if j['type']!='fixed':
     if j['mimic']:mi=j['mimic'];value=vals[mi['joint']]*float(mi.get('multiplier',1))+float(mi.get('offset',0))
     else:
      channel=1 if 'metacarpal' in name else 0 if 'thumb' in name else next(i+2 for i,f in enumerate(['index','middle','ring','pinky']) if f in name)
      value=j['limit'][0]+cmd[channel]*(j['limit'][1]-j['limit'][0])
     value=np.clip(value,*j['limit'])
    vals[name]=value;rot=np.eye(4);rot[:3,:3]=R.from_rotvec(j['axis']*value).as_matrix();links[j['child']]=links[j['parent']]@j['T']@rot
   mount=np.eye(4);mount[:3,:3]=a[key+'_wrist_rotations'][fi,side]@mount_rotation(side);mount[:3,3]=a[key+'_wrists'][fi,side]+a[key+'_wrist_rotations'][fi,side]@TRANSLATION
   for part,name,vis in visuals:assert part==len(Tlist);Tlist.append(mount@links[name]@vis)
  display=[];footmin=1e9
  for i,T in enumerate(Tlist):
   rot=C@T[:3,:3];pos=C@(T[:3,3]-origin);display.append([*pos,*R.from_matrix(rot).as_quat()])
   if not args.gmr_sonic and 'ankle_roll' in parts[i]['name']:
    v=np.array(parts[i]['positions']).reshape(-1,3)@rot.T+pos;footmin=min(footmin,float(v[:,1].min()))
  display=np.array(display)
  if not args.gmr_sonic:display[:,1]-=footmin
  poses.append(display.round(6).reshape(-1).tolist());valid.append(masks[idx].reshape(2,6).all(axis=1).tolist())
  bounds.append(display[:bodyparts,:3])
 b=np.array(bounds);result={'id':key,'times':d['times'],'duration':d['duration'],'partCount':len(parts),'poses':poses,'handValid':valid,'handCommands':actions[inds].round(6).tolist(),'rawHandCommands':raw_actions[inds].round(6).tolist(),'handSmoothing':{'method':'Zero-phase Gaussian within contiguous valid runs','sigmaSeconds':.08,'sourceUnchanged':True},'sourceFrames':inds.tolist(),'source':{'collection':'v1_0729','episode':d['source']['episode'],'body':'Recorded SONIC closed-loop MuJoCo qpos','hands':'Training Parquet action[64:76], normalized Revo2 motor positions','renderGrounding':'Per-frame common vertical shift at the lowest foot surface'},'bounds':{'min':b.min(axis=(0,1)).tolist(),'max':b.max(axis=(0,1)).tolist()}}
 if args.gmr_sonic:
  result['source'].update(body='GMR retargeted G1 reference tracked by SONIC in free-base MuJoCo',renderGrounding='Fixed simulation ground; no per-frame vertical correction',pipeline=provenance,rolloutSha256=str(a[key+'_rollout_sha256']))
 result['handSmoothing']['gapFilling']={'method':'Linear interpolation after valid-only smoothing','validMaskUnchanged':True,'edgePolicy':'nearest valid','allInvalidPolicy':'zero command'}
 result['handMount']=mount_metadata()
 (out/f'{key}.robot.json.gz').write_bytes(gzip.compress(json.dumps(result,separators=(',',':')).encode(),mtime=0));print(key,len(poses),'frames',len(parts),'parts',flush=True)
print('model MB',(out/'g1-revo2.model.json.gz').stat().st_size/1e6)
