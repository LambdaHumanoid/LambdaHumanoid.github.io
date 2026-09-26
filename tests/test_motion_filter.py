"""Numerical behavior checks for the offline hand smoothing filter."""
import sys,unittest
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from motion_filter import smooth_commands,smooth_rotations,interpolate_invalid_commands,interpolate_invalid_rotations
class MotionFilterTests(unittest.TestCase):
 def test_no_temporal_shift_or_overshoot(self):
  x=np.zeros((101,1));x[50:]=1;y=smooth_commands(x,np.ones(101,bool))
  self.assertTrue(np.all((y>=0)&(y<=1)));self.assertEqual(np.flatnonzero(y[:,0]>=.5)[0],50)
 def test_no_filtering_across_missing_intervals(self):
  x=np.r_[np.zeros(12),[-4,-5],np.ones(12)].reshape(-1,1);valid=np.ones(26,bool);valid[12:14]=False;y=smooth_commands(x,valid)
  np.testing.assert_array_equal(y,x)
 def test_rotation_wrap_does_not_flip_hand(self):
  angles=np.deg2rad([178,179,-179,-178,179,178]);r=Rotation.from_rotvec(np.column_stack([angles,np.zeros((6,2))])).as_matrix()[:,None];s=smooth_rotations(r,np.ones(6,bool))
  self.assertTrue(np.all(Rotation.from_matrix(s[:,0]).magnitude()>3.0));np.testing.assert_allclose(np.linalg.det(s[:,0]),1,atol=1e-12)
 def test_reduces_jitter_while_preserving_slow_motion(self):
  t=np.arange(150)/15;slow=.5+.3*np.sin(2*np.pi*.3*t);noisy=slow+.07*(-1.)**np.arange(150);y=smooth_commands(noisy[:,None],np.ones(150,bool))[:,0]
  self.assertLess(np.mean((y-slow)**2),np.mean((noisy-slow)**2)*.1)
 def test_invalid_values_cannot_affect_valid_filter_or_gap_fill(self):
  valid=np.array([False,True,True,True,False,False,True,True,True,False]);x=np.linspace(.1,.9,10)[:,None];poison=x.copy();poison[~valid]=np.nan
  for values in [x,poison]:
   filtered=smooth_commands(values,valid);filled=interpolate_invalid_commands(filtered,valid)
   np.testing.assert_allclose(filled,np.interp(np.arange(10),np.flatnonzero(valid),smooth_commands(x,valid)[valid,0])[:,None])
   r=Rotation.from_rotvec(np.column_stack([x[:,0],np.zeros((10,2))])).as_matrix()[:,None];r[~valid]=np.nan if values is poison else np.eye(3)
   result=interpolate_invalid_rotations(smooth_rotations(r,valid),valid)
   if values is x:expected=result
   else:np.testing.assert_allclose(result,expected)
 def test_rotation_gap_uses_shortest_arc_and_real_timestamps(self):
  r=np.tile(np.eye(3),(5,1,1,1));r[1,0]=Rotation.from_rotvec([0,0,np.deg2rad(170)]).as_matrix();r[3,0]=Rotation.from_rotvec([0,0,np.deg2rad(-170)]).as_matrix();r[[0,2,4]]=np.nan
  result=interpolate_invalid_rotations(r,[False,True,False,True,False],times=[0,1,2,5,6]);expected=Rotation.from_rotvec([0,0,np.deg2rad(175)]).as_matrix()
  np.testing.assert_allclose(result[2,0],expected,atol=1e-12);np.testing.assert_array_equal(result[0],r[1]);np.testing.assert_allclose(result[4],r[3],atol=1e-12)
 def test_one_or_no_valid_sample(self):
  r=np.tile(np.eye(3),(4,2,1,1));r[2]=Rotation.from_rotvec([.2,.4,.1]).as_matrix();valid=np.array([False,False,True,False])
  np.testing.assert_allclose(interpolate_invalid_rotations(r,valid),np.repeat(r[2:3],4,axis=0))
  np.testing.assert_array_equal(interpolate_invalid_commands(np.arange(4)[:,None],valid),np.full((4,1),2))
  np.testing.assert_array_equal(interpolate_invalid_rotations(r,np.zeros(4,bool)),np.tile(np.eye(3),(4,2,1,1)))
  np.testing.assert_array_equal(interpolate_invalid_commands(np.ones((4,2)),np.zeros(4,bool)),np.zeros((4,2)))
if __name__=='__main__':unittest.main()
