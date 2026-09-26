import { createMotionRenderLoop } from "./motion-render-loop";
import * as THREE from "three";
import type { RobotModel } from "./robot-model";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export type RobotMotion = { times: number[]; poses: number[][]; handValid: boolean[][]; bounds: { min: number[]; max: number[] } };
export function createRobotScene(host: HTMLElement, video: HTMLVideoElement, model: RobotModel, data: RobotMotion) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#f6f7f5");
  scene.fog = new THREE.Fog("#f6f7f5", 8, 18);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("role", "img"); renderer.domElement.setAttribute("aria-label", "GMR retargeted G1 motion executed by SONIC, with synchronized BrainCo Revo2 hands"); host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(36, 1, .03, 40);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.enableZoom = false;
  controls.minPolarAngle = .3; controls.maxPolarAngle = Math.PI / 2 - .025; controls.rotateSpeed = .65;
  scene.add(new THREE.HemisphereLight(0xf4eeff, 0x8a8297, 2.6));
  const key = new THREE.DirectionalLight(0xffffff, 3.4); key.position.set(-3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .1, far: 16 }); key.shadow.normalBias = .003; key.shadow.bias = -.00012; scene.add(key);
  const rim = new THREE.DirectionalLight(0xd0b4ef, 2.2); rim.position.set(3, 3, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#f6f7f5", roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(16, 64, 0xcabed3, 0xded6e4); grid.position.y = .0001;
  (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .45; scene.add(grid);
  const meshes = model.parts.map(part => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(part.normals, 3));
    const color = new THREE.Color().setRGB(part.color[0], part.color[1], part.color[2], THREE.SRGBColorSpace);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .58, metalness: .12, side: THREE.DoubleSide })); mesh.castShadow = true; mesh.receiveShadow = false; scene.add(mesh); return mesh;
  });
  const shadowTexture = (() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64; const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gradient.addColorStop(0, "rgba(48,38,60,.42)"); gradient.addColorStop(1, "rgba(48,38,60,0)"); ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64); return new THREE.CanvasTexture(canvas);
 })();
  const feet = model.parts.flatMap((part, i) => part.name.includes("ankle_roll") ? [i] : []);
  const shadows = feet.map(() => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.32,.42), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .0003; scene.add(mesh); return mesh; });
  const target = new THREE.Vector3((data.bounds.min[0]+data.bounds.max[0])/2, .78, (data.bounds.min[2]+data.bounds.max[2])/2);
  let inspectingHands = false;
  const reset = () => { inspectingHands = false; camera.position.copy(target).add(new THREE.Vector3(1.8,.75,3.6)); controls.target.copy(target); controls.update(); };
  const resize = () => { const {width,height} = host.getBoundingClientRect(); if (!width || !height) return; camera.aspect=width/height; camera.fov=width<480?46:36; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); };
  const observer=new ResizeObserver(resize); observer.observe(host); resize(); reset();
  const handParts = model.parts.flatMap((p,i)=>p.name.endsWith("_base_link")?[i]:[]);
  const handCenter = () => handParts.reduce((v,i)=>v.add(meshes[i].position),new THREE.Vector3()).multiplyScalar(1/handParts.length);
  const focusHands = () => { inspectingHands=true; controls.target.copy(handCenter()); camera.position.copy(controls.target).add(new THREE.Vector3(.4,.2,1)); controls.update(); };
  const q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),v=new THREE.Vector3();
  function update(time: number) {
    let i=Math.min(Math.floor(time*15),data.times.length-1);
    while(i>0 && data.times[i]>time)i--; while(i<data.times.length-1 && data.times[i+1]<=time)i++;
    const next=Math.min(i+1,data.times.length-1),mix=next===i?0:THREE.MathUtils.clamp((time-data.times[i])/(data.times[next]-data.times[i]),0,1);
    meshes.forEach((mesh,k)=>{
      const offset=k*7,a=data.poses[i],b=data.poses[next];
      const t=mix;
      mesh.position.set(THREE.MathUtils.lerp(a[offset],b[offset],t),THREE.MathUtils.lerp(a[offset+1],b[offset+1],t),THREE.MathUtils.lerp(a[offset+2],b[offset+2],t));
      q1.fromArray(a,offset+3);q2.fromArray(b,offset+3);mesh.quaternion.slerpQuaternions(q1,q2,t);mesh.updateMatrixWorld();
    });
    if (inspectingHands) { const center=handCenter(); camera.position.add(center.clone().sub(controls.target)); controls.target.copy(center); }
    feet.forEach((part, k)=>{
      // Indexed source vertices give the same minimum without revisiting every
      // triangle corner in the expanded display mesh.
      const mesh=meshes[part],positions=model.parts[part].footPositions!; let low=Infinity,x=0,z=0;
      for(let n=0;n<positions.length;n+=3){v.fromArray(positions,n).applyMatrix4(mesh.matrixWorld);if(v.y<low){low=v.y;x=v.x;z=v.z;}}
      shadows[k].position.set(x,.0003,z); shadows[k].material.opacity=Math.exp(-Math.max(0,low)*65);
    });
  }
  const loop = createMotionRenderLoop(host, video, controls, (time, poseChanged) => {
    if (poseChanged) { update(time); renderer.shadowMap.needsUpdate = true; }
    renderer.render(scene, camera);
  });
  return { reset, focusHands, zoom(factor:number){camera.position.sub(controls.target).multiplyScalar(factor).clampLength(1.2,9).add(controls.target);controls.update();}, dispose(){loop.dispose();observer.disconnect();controls.dispose();scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Line){obj.geometry.dispose();for(const m of Array.isArray(obj.material)?obj.material:[obj.material])m.dispose();}});shadowTexture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();} };
}
