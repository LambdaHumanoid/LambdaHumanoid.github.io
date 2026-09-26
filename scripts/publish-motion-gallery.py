"""Verify complete gallery outputs, then publish the picker manifest."""
import argparse,gzip,json,subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,default=root/'work/gallery-source/selection.json');p.add_argument('--out',type=Path,default=root/'public/motion');args=p.parse_args();out=args.out
selection=json.loads(args.manifest.read_text())
assert selection and len({(x.get('collection','v1_0729'),x['episode']) for x in selection})==len(selection)
assert len({x['id'] for x in selection})==len(selection)
entries=[]
for row in selection:
 key=row['id'];data=json.loads((out/f'{key}.json').read_text());src=data['source']
 assert src['episode']==row['episode'] and src['startFrame']==row['start'] and src['endFrameExclusive']==row['end']
 assert src['collection']==row.get('collection','v1_0729')
 assert data['model']=='SMPL + MANO'
 assert data['quality']['bodyMissing']==data['quality']['handMissing']==0
 assert data['quality']['bodyDegrees'][0]<=15 and data['quality']['fingerDegrees'][0]<=25 and data['quality']['rootCm'][0]<=8
 assert data['locomotion']['horizontalTravelMeters']>=.45 and max(data['locomotion']['footHorizontalExcursionMeters'])>=.2
 assert max(data['locomotion']['ankleExcursionMeters'])>=.12
 assert data['locomotion']['maxRootAccelerationMetersPerFrameSquared']<=.02
 assert not data['hands']['poseRefitted'] and not data['hands']['poseFiltered']
 assert data['hands']['attachmentVersion']==2 and data['hands']['weldedWrists']
 assert data['hands']['sourceBetasUsed'] is False
 assert data['hands']['shapeBetas']==[0.]*10
 assert data['hands']['maxNeutralBoneLengthErrorMeters']<1e-9
 assert data['hands']['maxRigidVertexErrorMeters']<1e-9
 assert data['hands']['watertight'] and np.asarray(data['hands']['valid']).all()
 assert data['handCoverage']['bothValidFrames']==data['handCoverage']['frameCount']==row['end']-row['start']
 vertices=np.frombuffer(gzip.decompress((out/f'{key}.vertices.bin.gz').read_bytes()),dtype='<i2')
 assert vertices.size==data['vertexCount']*data['frameCount']*3
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,r_frame_rate','-of','json',str(out/f'{key}.mp4')]))['streams'][0]
 assert int(probe['nb_frames'])==row['end']-row['start'] and probe['r_frame_rate']=='30/1'
 entries.append({'id':key,'title':row['title'],'duration':data['duration'],'metadata':f'/motion/{key}.json','video':f'/motion/{key}.mp4','poster':f'/motion/{key}.jpg','collection':src['collection'],'episode':row['episode'],'task':row['task'],'handCoverage':data['handCoverage'],'quality':data['quality'],'locomotion':data['locomotion']})
 print(key,'verified; neutral MANO shape, original finger rotations',flush=True)
path=out/'gallery.json';tmp=path.with_suffix('.json.tmp');tmp.write_text(json.dumps(entries,ensure_ascii=False,indent=2));tmp.replace(path)
print(f'Published {len(entries)} clips with 100% valid body/hands and raw rotation continuity checks')
