"""Close the SMPL/MANO wrist seams using their existing boundary vertices.
No joint/pose changes; a triangulated cuff connects the two surface boundaries.
"""
from pathlib import Path
from collections import Counter
import gzip,json
import numpy as np
root=Path(__file__).resolve().parent.parent/'public/motion'
def boundary(faces):
 edges=Counter(tuple(sorted(e)) for t in faces for e in [(t[0],t[1]),(t[1],t[2]),(t[2],t[0])]);return sorted(set(v for e,n in edges.items() if n==1 for v in e))
for name in ['chair','floor','cart']:
 p=root/f'{name}.json';d=json.loads(p.read_text());h=d['hands']
 if h.get('stitchedCuffs'):continue
 faces=np.array(d['faces']).reshape(-1,3);counts=np.array(h['groups'])//3;body=faces[:counts[0]];raw=np.frombuffer(gzip.decompress((root/f'{name}.vertices.bin.gz').read_bytes()),dtype='<i2').reshape(d['frameCount'],d['vertexCount'],3)*d['quantization'];v=raw[0];bnd=boundary(body);hj=np.array(h['joints'][0]).reshape(2,21,3);bridge=[]
 for side in [0,1]:
  begin=int(sum(counts[:side+1]));handfaces=faces[begin:begin+counts[side+1]];hb=boundary(handfaces);center=v[hb].mean(axis=0)
  bb=[i for i in bnd if np.linalg.norm(v[i]-center)<.085]
  assert len(bb)>=5 and len(hb)>=5,(name,side,len(bb),len(hb))
  axis=hj[side,9]-hj[side,0];axis/=np.linalg.norm(axis);x=v[bb[0]]-center;x-=axis*np.dot(x,axis);x/=np.linalg.norm(x);y=np.cross(axis,x)
  def ring(ids):
   coords=v[ids]-v[ids].mean(axis=0);ang=np.mod(np.arctan2(coords@y,coords@x),2*np.pi);order=np.argsort(ang);return np.array(ids)[order],ang[order]
  bi,ba=ring(bb);hi,ha=ring(hb);i=j=0
  while i<len(bi) or j<len(hi):
   bn=ba[(i+1)%len(bi)]+(2*np.pi if i+1>=len(bi) else 0) if i<len(bi) else np.inf
   hn=ha[(j+1)%len(hi)]+(2*np.pi if j+1>=len(hi) else 0) if j<len(hi) else np.inf
   if bn<hn:t=[int(bi[i%len(bi)]),int(bi[(i+1)%len(bi)]),int(hi[j%len(hi)])];i+=1
   else:t=[int(bi[i%len(bi)]),int(hi[(j+1)%len(hi)]),int(hi[j%len(hi)])];j+=1
   points=v[t];normal=np.cross(points[1]-points[0],points[2]-points[0]);radial=points.mean(axis=0)-center;radial-=axis*np.dot(axis,radial)
   if np.dot(normal,radial)<0:t=t[::-1]
   bridge.append(t)
  print(name,side,'cuff loops',len(bb),len(hb))
 d['faces']=np.concatenate([body,np.array(bridge),faces[counts[0]:]]).reshape(-1).tolist();h['groups'][0]+=len(bridge)*3;h['stitchedCuffs']=True;p.write_text(json.dumps(d,separators=(',',':')))
