"""NumPy SMPL-X skinning, including the native continuous wrist/hand surface."""
import numpy as np
from scipy.spatial.transform import Rotation
HAND_JOINTS=[[20,37,38,39,25,26,27,28,29,30,34,35,36,31,32,33],[21,52,53,54,40,41,42,43,44,45,49,50,51,46,47,48]]
TIPS=[[5361,4933,5058,5169,5286],[8079,7669,7794,7905,8022]]
ORDER=[0,1,2,3,16,4,5,6,17,7,8,9,18,10,11,12,19,13,14,15,20]
def palm(j):
 x=j[17]-j[5];x=x/np.linalg.norm(x);z=np.cross(x,j[9]-j[0]);z=z/np.linalg.norm(z);return np.stack([x,np.cross(z,x),z],axis=1)
class SMPLX:
 def __init__(self,path):
  d=np.load(path,allow_pickle=True);self.vt=d['v_template'].astype(float);self.faces=d['f'].astype(np.int32);self.W=d['weights'].astype(float);self.pd=d['posedirs'].astype(float);self.sd=d['shapedirs'][:,:,:10].astype(float);self.Jreg=d['J_regressor'];self.parents=d['kintree_table'][0].astype(int);self.parents[0]=-1;self.mean=[d['hands_meanl'],d['hands_meanr']];self.set_shape(np.zeros(10))
 def set_shape(self,beta):self.beta=np.array(beta);self.v=self.vt+np.einsum('vci,i->vc',self.sd,beta);self.J=self.Jreg@self.v
 def skeleton(self,R):
  G=np.tile(np.eye(4),(55,1,1));G[:,:3,:3]=R;G[0,:3,3]=self.J[0]
  for k in range(1,55):G[k,:3,3]=self.J[k]-self.J[self.parents[k]];G[k]=G[self.parents[k]]@G[k]
  return G
 def forward(self,R,indices=None):
  G=self.skeleton(R);A=G.copy();A[:,:3,3]-=np.einsum('nij,nj->ni',G[:,:3,:3],self.J)
  sel=slice(None) if indices is None else indices
  v=self.v[sel]+np.einsum('vci,i->vc',self.pd[sel],(R[1:]-np.eye(3)).reshape(-1));T=np.einsum('vj,jab->vab',self.W[sel],A)
  verts=np.einsum('vab,vb->va',T[:,:3,:3],v)+T[:,:3,3];return verts,G[:,:3,3]
 def hand(self,pose,side):
  # Only the hand chain and five fingertip vertices are needed by the optimizer.
  start=25+side*15;ids=[20+side,*range(start,start+15)];index={j:i for i,j in enumerate(ids)};J=self.J[ids]
  rotations=np.concatenate([np.eye(3)[None],Rotation.from_rotvec(pose.reshape(15,3)).as_matrix()]);G=np.tile(np.eye(4),(16,1,1));G[0,:3,3]=J[0]
  for i in range(1,16):p=index[self.parents[ids[i]]];G[i,:3,:3]=rotations[i];G[i,:3,3]=J[i]-J[p];G[i]=G[p]@G[i]
  A=G.copy();A[:,:3,3]-=np.einsum('nij,nj->ni',G[:,:3,:3],J)
  tip=TIPS[side];features=(rotations[1:]-np.eye(3)).reshape(-1);posed=self.v[tip]+self.pd[tip,:,9*(start-1):9*(start+14)]@features
  weights=self.W[np.ix_(tip,ids)];T=np.einsum('vj,jab->vab',weights,A);tv=np.einsum('vab,vb->va',T[:,:3,:3],posed)+T[:,:3,3]
  # Any negligible non-hand tip weights retain identity rest transforms.
  tv+=(1-weights.sum(axis=1))[:,None]*posed
  jointids=[index[i] for i in HAND_JOINTS[side]];j=np.concatenate([G[jointids,:3,3],tv])[ORDER];return j
