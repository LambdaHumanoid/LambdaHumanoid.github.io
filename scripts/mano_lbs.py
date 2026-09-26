"""NumPy MANO LBS for baked DynHaMR poses (private model is never published)."""
import pickle
import numpy as np
from scipy.spatial.transform import Rotation
class MANO:
 def __init__(self,path):
  with open(path,'rb') as f:self.d=pickle.load(f,encoding='latin1')
  self.faces=np.asarray(self.d['f']);self.parents=np.asarray(self.d['kintree_table'][0]).astype(int);self.parents[0]=-1
 def forward(self,pose,beta,root,trans,mean=True):
  d=self.d;v=np.asarray(d['v_template'])+np.einsum('vci,i->vc',d['shapedirs'],beta)
  J=d['J_regressor']@v
  pose=np.asarray(pose).reshape(45)+(d['hands_mean'] if mean else 0)
  R=Rotation.from_rotvec(np.concatenate([np.asarray(root).reshape(1,3),pose.reshape(15,3)])).as_matrix()
  v+=np.einsum('vci,i->vc',d['posedirs'],(R[1:]-np.eye(3)).reshape(-1))
  T=np.tile(np.eye(4),(16,1,1));T[:,:3,:3]=R;T[0,:3,3]=J[0]
  for i in range(1,16):T[i,:3,3]=J[i]-J[self.parents[i]];T[i]=T[self.parents[i]]@T[i]
  jp=T[:,:3,3].copy();A=T.copy();A[:,:3,3]-=np.einsum('nij,nj->ni',T[:,:3,:3],J)
  B=np.einsum('vj,jab->vab',d['weights'],A);v=np.einsum('vab,vb->va',B[:,:3,:3],v)+B[:,:3,3]+trans;jp+=trans
  # DynHaMR / smplx.vertex_ids MANO fingertip vertices (ring=554, pinky=671).
  allj=np.concatenate([jp,v[[744,320,443,554,671]]]);order=[0,13,14,15,16,1,2,3,17,4,5,6,18,10,11,12,19,7,8,9,20]
  return v,allj[order]
