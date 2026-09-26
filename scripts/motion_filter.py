"""Offline, zero-phase smoothing that never crosses missing-observation gaps."""
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation, Slerp

def valid_runs(valid):
 ids=np.flatnonzero(valid)
 return np.split(ids,np.where(np.diff(ids)>1)[0]+1) if len(ids) else []

def smooth_commands(values,valid,sigma=1.2):
 out=np.array(values,copy=True,dtype=float)
 for run in valid_runs(valid):
  if len(run)>2:out[run]=gaussian_filter1d(out[run],sigma=sigma,axis=0,mode='nearest',truncate=2.5)
 return out

def smooth_rotations(rotations,valid,sigma=1.2):
 out=np.array(rotations,copy=True)
 for run in valid_runs(valid):
  if len(run)<3:continue
  q=Rotation.from_matrix(out[run].reshape(-1,3,3)).as_quat().reshape(len(run),-1,4)
  for i in range(1,len(q)):q[i]*=np.where(np.sum(q[i]*q[i-1],axis=-1)<0,-1,1)[:,None]
  q=gaussian_filter1d(q,sigma=sigma,axis=0,mode='nearest',truncate=2.5);q/=np.linalg.norm(q,axis=-1,keepdims=True)
  out[run]=Rotation.from_quat(q.reshape(-1,4)).as_matrix().reshape(out[run].shape)
 return out

def interpolate_invalid_commands(values,valid,times=None):
 """Fill gaps from valid samples only; hold nearest endpoint outside their range."""
 out=np.array(values,copy=True,dtype=float);valid=np.asarray(valid,dtype=bool)
 t=np.arange(len(out),dtype=float) if times is None else np.asarray(times,dtype=float)
 if not valid.any():return np.zeros_like(out)
 flat=out.reshape(len(out),-1)
 for j in range(flat.shape[1]):flat[~valid,j]=np.interp(t[~valid],t[valid],flat[valid,j])
 return out

def interpolate_invalid_rotations(rotations,valid,times=None):
 """SLERP local joint rotations after valid-only smoothing; never use invalid data."""
 out=np.array(rotations,copy=True);valid=np.asarray(valid,dtype=bool)
 t=np.arange(len(out),dtype=float) if times is None else np.asarray(times,dtype=float)
 ids=np.flatnonzero(valid)
 if not len(ids):out[:]=np.eye(3);return out
 if len(ids)==1:out[~valid]=out[ids[0]];return out
 if valid.all():return out
 flat=out.reshape(len(out),-1,3,3);query=np.clip(t[~valid],t[ids[0]],t[ids[-1]])
 for j in range(flat.shape[1]):flat[~valid,j]=Slerp(t[valid],Rotation.from_matrix(flat[valid,j]))(query).as_matrix()
 out[t<t[ids[0]]]=out[ids[0]];out[t>t[ids[-1]]]=out[ids[-1]]
 return out
