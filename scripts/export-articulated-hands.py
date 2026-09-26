"""Add DynHaMR MANO hands to the baked SMPL clips. Run after export-motion.py.
World reconstructions have an independent VIPE frame: retain finger articulation in
palm coordinates, attach to the SMPL wrist, do not invent camera calibration.
"""
import argparse,gzip,json
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import fast_simplification as fs
from smpl_lbs import SMPL,global_quats_to_local_R,PARENTS,R_ALIGN
from mano_lbs import MANO
p=argparse.ArgumentParser();p.add_argument('--smpl',required=True);p.add_argument('--mano',required=True);p.add_argument('--floor-source',required=True);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'public/motion';src=root/'work/retarget-source'
s=SMPL(a.smpl);m=MANO(a.mano)
rv,rf,col=fs.simplify(s.vt,s.faces,target_count=4600,return_collapses=True)
# Cut distal to the SMPL wrists. MANO includes a short overlapping wrist cuff.
keep=(np.abs(rv[rf,0]) <= abs(s.J[20,0])+.004).all(axis=1)
bodyfaces=rf[keep]

def palm(j):
 x=j[17]-j[5];x/=np.linalg.norm(x);z=np.cross(x,j[9]-j[0]);z/=np.linalg.norm(z);y=np.cross(z,x)
 return np.stack([x,y,z],axis=1)

def skeleton(R):
 G=np.tile(np.eye(4),(24,1,1));G[:,:3,:3]=R;G[0,:3,3]=s.J[0]
 for i in range(1,24):G[i,:3,3]=s.J[i]-s.J[PARENTS[i]];G[i]=G[PARENTS[i]]@G[i]
 return G
nv,nj=m.forward(np.zeros(45),np.zeros(10),np.zeros(3),np.zeros(3),mean=True)
for key,raw,folder in [('chair',root/'work/motion-source/chair.parquet',src),('cart',root/'work/motion-source/cart.parquet',src/'cart'),('floor',Path(a.floor_source).with_suffix('.parquet'),src/'floor')]:
 d=json.loads((out/f'{key}.json').read_text());assert not d.get('hands'),'Run base export first'
 h=np.load(folder/'dynhamr_hands.npz');w=np.load(folder/'world.npz')
 rows=pq.read_table(raw).to_pylist();pose=np.asarray([r['observation.pico.body_pose'] for r in rows]).reshape(-1,24,7)
 start=d['source']['startFrame'];inds=np.rint(np.array(d['times'])*30).astype(int)+start
 right=pose[start,16,:3]-pose[start,17,:3];right[1]=0;right/=np.linalg.norm(right);up=np.array([0,1,0]);basis=np.stack([right,up,np.cross(right,up)],axis=1)
 origin=pose[start,0,:3].copy();origin[1]=0
 orig=np.frombuffer(gzip.decompress((out/f'{key}.vertices.bin.gz').read_bytes()),dtype='<i2').reshape(d['frameCount'],d['vertexCount'],3)*d['quantization']
 # Reconstruct the same fixed ground normalization as export-motion.
 v0=s.forward(global_quats_to_local_R(pose[start,:,3:]),pose[start,0,:3]);sv,_,_=fs.replay_simplification(v0.astype(np.float32),s.faces,col)
 ground=np.median(((sv-origin)@basis)[:,1]-orig[0,:,1])
 frames=[];valid=[];maxerr=0;handj=[]
 for fi,bi in enumerate(inds):
  G=skeleton(global_quats_to_local_R(pose[bi,:,3:]));hands=[];jlist=[]
  for side,wi in [(0,20),(1,21)]:
   good=bool(h['valid'][bi,side] and h['visible'][bi,side]);local=bi-int(h['frame_interval'][0]);tracks=np.flatnonzero(w['is_right'][:,0]==side)
   if good:
    assert 0<=local<w['trans'].shape[1] and len(tracks)==1
    tr=int(tracks[0]);bet=w['betas'][tr];bet=bet[local] if bet.ndim==2 else bet
    v,j=m.forward(w['pose_body'][tr,local],bet,w['root_orient'][tr,local],w['trans'][tr,local],mean=False)
    if side==0:v[:,0]*=-1;j[:,0]*=-1
    target=h['joints_world'][bi,side];non_tips=[i for i in range(21) if i not in [4,8,12,16,20]]
    err=np.max(np.linalg.norm(j[non_tips]-target[non_tips],axis=1));maxerr=max(maxerr,float(err));assert err<2e-5,(key,bi,err)
   else:
    v=nv.copy();j=nj.copy()
    if side==0:v[:,0]*=-1;j[:,0]*=-1
   localv=(v-j[0])@palm(j);localj=(j-j[0])@palm(j)
   # Scale only hand size, using an episode-constant palm length.
   ids=np.flatnonzero(h['valid'][:,side]);scale=.085/np.median(np.linalg.norm(h['joints_world'][ids,side,9]-h['joints_world'][ids,side,0],axis=1)) if len(ids) else .085/np.linalg.norm(j[9]-j[0])
   localv*=scale;localj*=scale
   across=np.array([0.,0.,-1.]);forward=np.array([1. if side==0 else -1.,0.,0.]);rest=np.stack([across,forward,np.cross(across,forward)],axis=1)
   rotation=rest.T@G[wi,:3,:3].T@R_ALIGN@basis
   wrist=((G[wi,:3,3]-s.J[0])@R_ALIGN+pose[bi,0,:3]-origin)@basis;wrist[1]-=ground
   hands.append(localv@rotation+wrist);jlist.append(localj@rotation+wrist)
  frames.append(np.concatenate([orig[fi],*hands]));valid.append((h['valid'][bi]&h['visible'][bi]).tolist());handj.append(np.array(jlist).round(5).reshape(-1).tolist())
 vertices=np.array(frames);n=d['vertexCount'];lf=m.faces[:,[0,2,1]]+n;rf=m.faces+n+778
 faces=np.concatenate([bodyfaces,lf,rf]);quant=np.round(vertices*10000);assert abs(quant).max()<32767
 (out/f'{key}.vertices.bin.gz').write_bytes(gzip.compress(quant.astype('<i2').tobytes(),mtime=0))
 d.update(vertexCount=vertices.shape[1],faces=faces.reshape(-1).tolist(),hands={'valid':valid,'joints':handj,'groups':[len(bodyfaces)*3,len(lf)*3,len(rf)*3],'vertexStart':n,'verticesPerHand':778,'source':'DynHaMR MANO smooth_fit; palm-local articulation attached to SMPL wrists','invalidDisplay':'Neutral hand geometry, muted gray; never treated as measured motion','maxJointReconstructionErrorMeters':maxerr})
 (out/f'{key}.json').write_text(json.dumps(d,separators=(',',':')))
 print(key,'valid sampled hands',np.sum(valid,axis=0),'max MANO joint error',maxerr,flush=True)
