import { createMotionRenderLoop } from "./motion-render-loop";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createGoPro } from "./gopro-model";

export type MotionData = {
  model?: string;
  vertexCount: number; frameCount: number; duration: number; quantization: number;
  vertices: string; faces: number[]; footVertices: number[]; footGroups: number[][]; times: number[]; joints: number[][];
  bounds: { min: number[]; max: number[] };
  hands?: { valid: boolean[][]; groups: number[]; vertexGroups: number[][]; joints: number[][] };
};

export function createMotionScene(host: HTMLElement, video: HTMLVideoElement, data: MotionData, frames: Int16Array, showCamera = true) {
  const integrated = Boolean(host.closest(".motion-human-gallery"));
  const scene = new THREE.Scene();
  scene.background = integrated ? null : new THREE.Color("#f6f7f5");
  scene.fog = new THREE.Fog("#f6f7f5", 8, 18);
  const camera = new THREE.PerspectiveCamera(36, 1, .05, 40);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: integrated });
  if (integrated) renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-label", `${data.model ?? "SMPL-X"} human with DynHaMR hand motion${showCamera ? ", miniature GoPro and synchronized camera image" : ""}`);
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 9;
  controls.minPolarAngle = .3;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  controls.zoomSpeed = .55;
  controls.rotateSpeed = .65;
  // Leave wheel/touch scrolling to the page. Pinch and explicit +/- controls zoom.
  controls.enableZoom = false;
  controls.touches.ONE = THREE.TOUCH.ROTATE;

  scene.add(new THREE.HemisphereLight(integrated ? 0xfaf8ff : 0xf4eeff, integrated ? 0x98939f : 0x8a8297, 2.6));
  const key = new THREE.DirectionalLight(integrated ? 0xeee5ff : 0xffffff, 3.4);
  key.position.set(-3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
  key.shadow.camera.top = 2.5; key.shadow.camera.bottom = -2.5;
  key.shadow.camera.near = .1; key.shadow.camera.far = 16;
  key.shadow.normalBias = .0003;
  key.shadow.bias = -.00001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(integrated ? 0xcdb5f1 : 0xd0b4ef, integrated ? 2.5 : 2.2); rim.position.set(3, 3, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), integrated
    ? new THREE.ShadowMaterial({ color: "#90839f", opacity: .14, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: "#f6f7f5", roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(16, 64, 0xcabed3, 0xded6e4); grid.position.y = .0001;
  (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = integrated ? .1 : .45; scene.add(grid);

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(data.vertexCount * 3);
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  geometry.setIndex(data.faces);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#a496c5", roughness: .58, metalness: .08 });
  const body = new THREE.Mesh(geometry, bodyMaterial);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  scene.add(body);

  // Soft local occlusion complements the directional shadow where a sole touches
  // the ground. It fades with actual sole height, so a swinging foot stays airborne.
  const contactShadows = data.footGroups.map(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float opacity; void main() {
        float r = length((vUv - 0.5) * 2.0);
        float falloff = exp(-3.8 * r * r) * (1.0 - smoothstep(0.65, 1.0, r));
        gl_FragColor = vec4(0.16, 0.15, 0.20, opacity * falloff);
      }`,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .0003;
    shadow.renderOrder = 1; scene.add(shadow); return shadow;
  });

  const rig = new THREE.Group(); rig.visible = showCamera; scene.add(rig);
  const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
  // Mirror the displayed camera image horizontally, including the camera LCDs.
  texture.repeat.x = -1;
  texture.offset.x = 1;
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, side: THREE.FrontSide,
    transparent: true, opacity: .5, depthWrite: false,
  });
  const goPro = createGoPro(screenMaterial);
  goPro.position.z = .018;
  rig.add(goPro);

  // A simple perspective-camera wireframe, rigidly attached to the chest.
  // Its dimensions are illustrative, not calibrated GoPro intrinsics/extrinsics.
  const nearZ = -.025, farZ = .30, halfWidth = .24, halfHeight = .135;
  const corners = [
    new THREE.Vector3(-.055, -.038, nearZ), new THREE.Vector3(.055, -.038, nearZ),
    new THREE.Vector3(.055, .038, nearZ), new THREE.Vector3(-.055, .038, nearZ),
    new THREE.Vector3(-halfWidth, -halfHeight, farZ), new THREE.Vector3(halfWidth, -halfHeight, farZ),
    new THREE.Vector3(halfWidth, halfHeight, farZ), new THREE.Vector3(-halfWidth, halfHeight, farZ),
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const frustum = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edges.flatMap(([a, b]) => [corners[a], corners[b]])),
    new THREE.LineBasicMaterial({ color: 0x78628f, transparent: true, opacity: .85 }),
  );
  rig.add(frustum);
  const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, halfHeight * 2), screenMaterial);
  imagePlane.position.z = farZ;
  rig.add(imagePlane);
  // Keep the horizontal mirror on either viewing side; DoubleSide would
  // reverse it again when seen from behind.
  const imageBack = new THREE.Mesh(imagePlane.geometry, screenMaterial);
  imageBack.rotation.y = Math.PI;
  imageBack.position.z = farZ;
  rig.add(imageBack);
  const pathPoints = data.joints.map(row => new THREE.Vector3(row[0], .002, row[2]));
  const trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPoints), new THREE.LineDashedMaterial({ color: 0x9a8abc, dashSize: .055, gapSize: .055, transparent: true, opacity: .55 }));
  trajectory.computeLineDistances(); scene.add(trajectory);

  const center = new THREE.Vector3((data.bounds.min[0] + data.bounds.max[0]) / 2, .95, (data.bounds.min[2] + data.bounds.max[2]) / 2);
  const target = center.clone().add(new THREE.Vector3(-.15, -.08, 0));
  let inspectingHands = false;
  const reset = () => { inspectingHands = false; camera.position.copy(target).add(new THREE.Vector3(1.8, .75, 3.6)); controls.target.copy(target); controls.update(); };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov = width < 480 ? 46 : 36;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize(); reset();
  const points = Array.from({ length: 24 }, () => new THREE.Vector3());
  const handCenter = () => points[20].clone().add(points[21]).multiplyScalar(.5);
  const focusHands = () => { inspectingHands = true; controls.target.copy(handCenter()); camera.position.copy(controls.target).add(new THREE.Vector3(.4,.2,1)); controls.update(); };
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const cameraPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6);
  const update = (time: number) => {
    // Same clock as the VideoTexture. Last keyframe is held through the final video frame.
    let index = Math.min(Math.floor(time * 15), data.frameCount - 1);
    while (index > 0 && data.times[index] > time) index--;
    while (index < data.frameCount - 1 && data.times[index + 1] <= time) index++;
    const next = Math.min(index + 1, data.frameCount - 1);
    const amount = next === index ? 0 : THREE.MathUtils.clamp((time - data.times[index]) / (data.times[next] - data.times[index]), 0, 1);
    const stride = positions.length;
    for (let i = 0; i < stride; i++) positions[i] = THREE.MathUtils.lerp(frames[index * stride + i], frames[next * stride + i], amount) * data.quantization;
    // Model proportions differ from the tracked wearer. Ground the supporting
    // foot surface after interpolation; translate the entire pose without flattening strides.
    let supportHeight = Infinity;
    for (const vertex of data.footVertices) supportHeight = Math.min(supportHeight, positions[vertex * 3 + 1]);
    const groundOffset = -supportHeight;
    for (let i = 1; i < stride; i += 3) positions[i] += groundOffset;
    // Interpolate the whole continuous surface together, including wrists.
    // Snapping only hand vertices at validity boundaries would separate the seam.
    attribute.needsUpdate = true; geometry.computeVertexNormals();
    for (let k = 0; k < 24; k++) points[k].set(
      THREE.MathUtils.lerp(data.joints[index][k * 3], data.joints[next][k * 3], amount),
      THREE.MathUtils.lerp(data.joints[index][k * 3 + 1], data.joints[next][k * 3 + 1], amount) + groundOffset,
      THREE.MathUtils.lerp(data.joints[index][k * 3 + 2], data.joints[next][k * 3 + 2], amount));
    data.footGroups.forEach((vertices, foot) => {
      let min = Infinity;
      for (const vertex of vertices) min = Math.min(min, positions[vertex * 3 + 1]);
      let px = 0, pz = 0, count = 0;
      for (const vertex of vertices) {
        if (positions[vertex * 3 + 1] < min + .025) {
          px += positions[vertex * 3]; pz += positions[vertex * 3 + 2]; count++;
        }
      }
      const shadow = contactShadows[foot];
      shadow.position.set(px / count, .0003, pz / count);
      const ankle = points[foot === 0 ? 7 : 8], toe = points[foot === 0 ? 10 : 11];
      shadow.rotation.set(-Math.PI / 2, 0, Math.atan2(toe.x - ankle.x, toe.z - ankle.z));
      shadow.scale.set(.19, .32, 1);
      shadow.material.uniforms.opacity.value = .48 * Math.exp(-Math.max(0, min) * 65);
    });
    x.subVectors(points[16], points[17]).normalize();
    y.subVectors(points[12], points[6]).normalize();
    z.crossVectors(x, y).normalize(); y.crossVectors(z, x).normalize();
    basis.makeBasis(x, y, z);
    // Mount between the upper chest (spine3) and neck, near the clavicles.
    rig.position.copy(points[9]).lerp(points[12], .5).addScaledVector(z, .13);
    // The rig looks along local +Z; +30° about local X points forward and down.
    rig.quaternion.setFromRotationMatrix(basis).multiply(cameraPitch);
    if (inspectingHands) { const center = handCenter(); camera.position.add(center.clone().sub(controls.target)); controls.target.copy(center); }
  };
  const loop = createMotionRenderLoop(host, video, controls, (time, poseChanged) => {
    if (poseChanged) { update(time); renderer.shadowMap.needsUpdate = true; }
    renderer.render(scene, camera);
  });
  return {
    reset, focusHands,
    zoom(factor: number) { camera.position.sub(controls.target).multiplyScalar(factor).clampLength(1.2, 9).add(controls.target); controls.update(); },
    dispose() {
      loop.dispose(); observer.disconnect(); controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); texture.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
