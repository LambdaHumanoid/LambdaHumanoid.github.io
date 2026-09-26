"""纯 numpy 的 SMPL 前向(LBS),零 torch/chumpy 依赖。

数据来自 SMPL_NEUTRAL_np.npz(由 conv_smpl.py 从官方 .pkl 转出)。
驱动方式:用 PICO 的 24 关节全局四元数 → 各关节相对父节点的局部旋转(SMPL pose),
betas 取 0(标准体型),pelvis 全局位置作平移。
"""
from __future__ import annotations
import numpy as np

# SMPL 24 关节运动树父节点
PARENTS = np.array(
    [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19, 20, 21]
)


def quat_to_rotmat(q: np.ndarray) -> np.ndarray:
    """四元数(xyzw, 末维=4)→ 旋转矩阵(...,3,3)。"""
    q = q / (np.linalg.norm(q, axis=-1, keepdims=True) + 1e-12)
    x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    R = np.empty(q.shape[:-1] + (3, 3), dtype=np.float64)
    R[..., 0, 0] = 1 - 2 * (y * y + z * z)
    R[..., 0, 1] = 2 * (x * y - z * w)
    R[..., 0, 2] = 2 * (x * z + y * w)
    R[..., 1, 0] = 2 * (x * y + z * w)
    R[..., 1, 1] = 1 - 2 * (x * x + z * z)
    R[..., 1, 2] = 2 * (y * z - x * w)
    R[..., 2, 0] = 2 * (x * z - y * w)
    R[..., 2, 1] = 2 * (y * z + x * w)
    R[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return R


# PICO(Unity 左手系)四元数 → SMPL(右手系):翻 y 轴手性。
# 实测对全 24 关节做 Procrustes,此变换残差最小(0.03m,其余 ≥0.09m)。
PICO_TO_SMPL_QUAT = np.array([-1.0, 1.0, -1.0, 1.0])

# SMPL(flipy 后)坐标基 → PICO 位置坐标基:绕 y 轴 180°(实测各帧一致、纯旋转无镜像)。
R_ALIGN = np.diag([-1.0, 1.0, -1.0])


def global_quats_to_local_R(quats: np.ndarray) -> np.ndarray:
    """24 关节全局四元数(PICO 约定)→各关节相对父节点的局部旋转矩阵(24,3,3)。"""
    quats = quats * PICO_TO_SMPL_QUAT
    gR = quat_to_rotmat(quats)  # (24,3,3)
    lR = gR.copy()
    for j in range(1, 24):
        p = PARENTS[j]
        lR[j] = gR[p].T @ gR[j]
    return lR


class SMPL:
    def __init__(self, npz_path: str) -> None:
        d = np.load(npz_path)
        self.vt = d["v_template"].astype(np.float64)         # (6890,3)
        self.posedirs = d["posedirs"].astype(np.float64)      # (6890,3,207)
        self.Jreg = d["J_regressor"].astype(np.float64)       # (24,6890)
        self.W = d["weights"].astype(np.float64)              # (6890,24)
        self.faces = d["f"].astype(np.int32)                  # (13776,3)
        self.J = self.Jreg @ self.vt                          # (24,3) rest 关节(betas=0)
        self.nv = self.vt.shape[0]

    def forward(self, R: np.ndarray, transl: np.ndarray) -> np.ndarray:
        """R:(24,3,3) 各关节局部旋转;transl:(3,) pelvis 平移。返回顶点(6890,3)。"""
        eye = np.eye(3)
        pose_feat = (R[1:] - eye).reshape(-1)                 # (207,)
        v_posed = self.vt + self.posedirs @ pose_feat         # (6890,3)

        relJ = self.J.copy()
        relJ[1:] -= self.J[PARENTS[1:]]
        T = np.zeros((24, 4, 4))
        T[:, 3, 3] = 1.0
        T[:, :3, :3] = R
        T[:, :3, 3] = relJ
        G = np.zeros((24, 4, 4))
        G[0] = T[0]
        for j in range(1, 24):
            G[j] = G[PARENTS[j]] @ T[j]
        # 去 rest:A[j] = G[j] @ inv([I|J[j]])
        A = G.copy()
        A[:, :3, 3] = G[:, :3, 3] - np.einsum("jab,jb->ja", G[:, :3, :3], self.J)

        Tv = np.einsum("vj,jab->vab", self.W, A)              # (6890,4,4)
        vh = np.concatenate([v_posed, np.ones((self.nv, 1))], axis=1)
        v = np.einsum("vab,vb->va", Tv, vh)[:, :3]
        # 去 rest pelvis 居中 → 绕 y 180° 对齐 PICO 朝向 → 平移到世界 pelvis
        return (v - self.J[0]) @ R_ALIGN + transl
