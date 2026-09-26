import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from motion_quality import angular_steps,locomotion_report

class MotionQualityTests(unittest.TestCase):
    def test_quaternion_sign_is_not_motion(self):
        q=np.array([[0,0,0,1],[0,0,0,-1],[0,0,0,1.]])[:,None,:]
        np.testing.assert_allclose(angular_steps(quats=q),0,atol=1e-6)
    def test_rotation_wrap_does_not_become_a_spike(self):
        a=np.zeros((3,1,3));a[:,0,2]=np.deg2rad([179,-179,-177])
        np.testing.assert_allclose(angular_steps(rotvec=a),2,atol=1e-6)
    def test_real_finger_spike_is_detected(self):
        a=np.zeros((4,2,15,3));a[2,1,6,0]=np.deg2rad(120)
        np.testing.assert_allclose(angular_steps(rotvec=a).max((1,2)),[0,120,120],atol=1e-6)
class LocomotionTests(unittest.TestCase):
    def metrics(self,root,feet):
        return {'rootPosition':root,'anklePosition':feet,
                'rootAcceleration':np.linalg.norm(np.diff(root,n=2,axis=0),axis=1)}
    def test_leaning_without_moving_feet_is_not_walking(self):
        root=np.zeros((91,3));root[:,0]=.25*np.sin(np.linspace(0,2*np.pi,91))
        feet=np.zeros((91,2,3))
        q=locomotion_report(self.metrics(root,feet),0,91)
        self.assertGreater(q['horizontalTravelMeters'],.8)
        self.assertEqual(max(q['footHorizontalExcursionMeters']),0)
    def test_rigid_sliding_has_no_relative_foot_motion(self):
        root=np.zeros((91,3));root[:,0]=np.linspace(0,1,91)
        feet=np.repeat(root[:,None,:],2,axis=1)
        q=locomotion_report(self.metrics(root,feet),0,91)
        self.assertAlmostEqual(q['horizontalTravelMeters'],1)
        self.assertEqual(max(q['ankleExcursionMeters']),0)
    def test_walking_has_translation_and_relative_foot_motion(self):
        root=np.zeros((91,3));root[:,0]=np.linspace(0,1,91)
        feet=np.repeat(root[:,None,:],2,axis=1)
        feet[:,0,0]+=.15*np.sin(np.linspace(0,4*np.pi,91))
        feet[:,1,0]-=.15*np.sin(np.linspace(0,4*np.pi,91))
        q=locomotion_report(self.metrics(root,feet),0,91)
        self.assertAlmostEqual(q['horizontalTravelMeters'],1)
        self.assertGreater(max(q['footHorizontalExcursionMeters']),.8)
        self.assertGreater(max(q['ankleExcursionMeters']),.25)

if __name__=='__main__':unittest.main()
