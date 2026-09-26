"""Read-only motion continuity metrics in physical rotation space, at source FPS."""
import numpy as np
import pyarrow.parquet as pq
from scipy.spatial.transform import Rotation


def angular_steps(rotvec=None, quats=None):
    shape = rotvec.shape[:-1] if rotvec is not None else quats.shape[:-1]
    r = Rotation.from_rotvec(rotvec.reshape(-1, 3)) if rotvec is not None else Rotation.from_quat(quats.reshape(-1, 4))
    q = r.as_quat().reshape(*shape, 4)
    # q and -q represent the same orientation; never difference raw coefficients.
    angles = np.degrees(2 * np.arccos(np.clip(np.abs((q[1:] * q[:-1]).sum(-1)), 0, 1)))
    return angles


def sequence_metrics(parquet, hands_path, world_path):
    t = pq.read_table(parquet, columns=['observation.pico.body_pose', 'observation.pico.body_available'])
    body = np.asarray(t['observation.pico.body_pose'].to_pylist()).reshape(-1,24,7)
    available = np.asarray(t['observation.pico.body_available'].to_pylist()).reshape(-1).astype(bool)
    valid = available & np.isfinite(body).all((1,2)) & (np.linalg.norm(body[:,:,3:],axis=2)>.5).all(1)
    # Match the existing display's nearest-valid repair for auditing old windows.
    # Candidate selection independently requires every raw body frame valid.
    observed=np.flatnonzero(valid)
    if not len(observed):raise ValueError('No valid body frames')
    body=body.copy()
    for i in np.flatnonzero(~valid):body[i]=body[observed[np.argmin(abs(observed-i))]]
    safe = body[:,:,3:].copy()
    body_steps=angular_steps(quats=safe)[:,:22].max(1)
    root_steps=np.linalg.norm(np.diff(body[:,0,:3],axis=0),axis=1)
    h=np.load(hands_path);w=np.load(world_path);n=len(body)
    finger=np.full(n-1,np.inf)
    start=int(h['frame_interval'][0]);pose=w['pose_body']
    steps=angular_steps(rotvec=pose.transpose(1,0,2,3)).max((1,2))
    finger[start:start+len(steps)]=steps
    observed=(h['valid']&h['visible']).all(1)
    return {'bodyValid':valid,'handsValid':observed,'bodyStep':body_steps,'fingerStep':finger,'rootStep':root_steps,'rootPosition':body[:,0,:3],
            'anklePosition':body[:,[7,8],:3],
            'rootAcceleration':np.linalg.norm(np.diff(body[:,0,:3],n=2,axis=0),axis=1)}


def report(m,start,end):
    def stat(name,scale=1):
        a=m[name][start:end-1]*scale
        return [float(np.max(a)),float(np.percentile(a,99)),float(np.percentile(a,50))]
    return dict(bodyMissing=int((~m['bodyValid'][start:end]).sum()),handMissing=int((~m['handsValid'][start:end]).sum()),
                bodyDegrees=stat('bodyStep'),fingerDegrees=stat('fingerStep'),rootCm=stat('rootStep',100))


def locomotion_report(m,start,end):
    """Horizontal travel measured at 5 Hz to suppress tracking micro-jitter."""
    indices=list(range(start,end,6))
    if indices[-1]!=end-1:indices.append(end-1)
    root=m['rootPosition'][indices][:,[0,2]]
    steps=np.linalg.norm(np.diff(root,axis=0),axis=1)
    foot=m['anklePosition'][indices]-m['rootPosition'][indices,None,:]
    excursions=[float(np.linalg.norm(np.ptp(foot[:,side],axis=0))) for side in range(2)]
    return dict(horizontalTravelMeters=float(steps.sum()),
                horizontalDisplacementMeters=float(np.linalg.norm(root[-1]-root[0])),
                ankleExcursionMeters=excursions,
                footTravelMeters=[float(np.linalg.norm(np.diff(m['anklePosition'][indices,side][:,[0,2]],axis=0),axis=1).sum()) for side in range(2)],
                footHorizontalExcursionMeters=[float(np.linalg.norm(np.ptp(m['anklePosition'][indices,side][:,[0,2]],axis=0))) for side in range(2)],
                footVerticalExcursionMeters=[float(np.ptp(m['anklePosition'][indices,side,1])) for side in range(2)],
                maxRootAccelerationMetersPerFrameSquared=float(m['rootAcceleration'][start:end-2].max()))
