"""Copy completed meshes from the isolated CPU build, with resumable transfers."""
import concurrent.futures,json,shlex,shutil,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
remote=Path('/primus_xpfs_workspace_T04/xcy/tmp/humanverse-gallery-20260925-2238')
rows=json.loads((root/'work/gallery-source/remote-selection.json').read_text());pending={x['id'] for x in rows}
ssh=['ssh','-o','ConnectTimeout=15','-o','ClearAllForwardings=yes','primus1']
def copy(src,dst):
 dst.parent.mkdir(parents=True,exist_ok=True);partial=dst.with_name(dst.name+'.part')
 for attempt in range(4):
  offset=partial.stat().st_size if partial.exists() else 0
  code="import os,sys,shutil;p=sys.argv[1];o=int(sys.argv[2]);print(os.path.getsize(p),flush=True);f=open(p,'rb');f.seek(o);shutil.copyfileobj(f,sys.stdout.buffer)"
  command=shlex.join(['/primus_xpfs_workspace_T04/xcy/miniforge3/bin/python','-c',code,str(src),str(offset)])
  run=subprocess.Popen([*ssh,command],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try:
   expected=int(run.stdout.readline())
   with partial.open('ab') as f:shutil.copyfileobj(run.stdout,f)
   error=run.communicate()[1].decode()
   if run.returncode==0 and partial.stat().st_size==expected:partial.replace(dst);return
  except Exception as e:run.kill();error=str(e)
  print('retry',dst.name,error[-120:],flush=True)
 raise RuntimeError(f'Transfer failed: {src}')
def fetch(key):
 for relative in [f'public/motion/{key}.json',f'public/motion/{key}.vertices.bin.gz',f'work/smplx-fit/{key}.npz',f'work/smplx-fit/{key}.display.npz',f'work/gallery-source/{key}/build.log']:
  copy(remote/relative,root/relative)
 (root/'work/gallery-source'/key/'download-complete').write_text('ok\n')
 print('downloaded',key,flush=True)
code="import json;from pathlib import Path;print(json.dumps([p.parent.name for p in Path("+repr(str(remote/'work/gallery-source'))+").glob('capture-*/mesh-complete')]))"
command=shlex.join(['/primus_xpfs_workspace_T04/xcy/miniforge3/bin/python','-c',code])
deadline=time.monotonic()+2400
while pending and time.monotonic()<deadline:
 ready=set(json.loads(subprocess.check_output([*ssh,command],stderr=subprocess.DEVNULL))) & pending
 if ready:
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(fetch,sorted(ready)))
  pending-=ready
  print('remaining',len(pending),sorted(pending),flush=True)
 else:time.sleep(15)
if pending:raise TimeoutError(f'Incomplete meshes: {pending}')
