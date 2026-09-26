import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Simplified HERO13-style model in metres; +Z faces the scene being recorded.
 * Body proportions follow the GoPro comparison reference (71.8 × 50.8 × 33.6 mm).
 * This is authored display geometry, not a manufacturer CAD asset.
 */
export function createGoPro(videoMaterial: THREE.MeshBasicMaterial) {
  const group = new THREE.Group();
  group.name = "GoPro HERO13-style camera";
  const rubber = new THREE.MeshStandardMaterial({ color: "#181b20", roughness: .84, metalness: .02 });
  const rim = new THREE.MeshStandardMaterial({ color: "#30343c", roughness: .57, metalness: .12 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#190f23", roughness: .09, metalness: .38, clearcoat: 1 });
  const blackGlass = new THREE.MeshStandardMaterial({ color: "#070b10", roughness: .2, metalness: .2 });
  const red = new THREE.MeshBasicMaterial({ color: "#d94c49" });
  const box = (name: string, size: [number, number, number], at: [number, number, number], radius: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, radius), material);
    mesh.name = name; mesh.position.set(...at); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  box("Rubber body", [.0718, .0508, .027], [0, 0, 0], .004, rubber);
  // A square lens protector with a recessed circular optical element, not a barrel lens.
  box("Square lens protector", [.029, .029, .0066], [.0185, .008, .0168], .003, rim);
  box("Lens cover glass", [.025, .025, .0005], [.0185, .008, .02025], .0022, blackGlass);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.0098, 40), glass);
  lens.name = "Recessed lens"; lens.position.set(.0185, .008, .0206); group.add(lens);
  const innerLens = new THREE.Mesh(new THREE.CircleGeometry(.0061, 32), new THREE.MeshPhysicalMaterial({ color: "#2c1d41", roughness: .025, metalness: .5, clearcoat: 1 }));
  innerLens.position.set(.0185, .008, .0207); group.add(innerLens);
  box("Front display bezel", [.0275, .0285, .001], [-.018, .0035, .014], .002, blackGlass);
  const frontGeometry = new THREE.PlaneGeometry(.023, .023);
  // Center-crop the wide recording on the square front LCD, preserving its aspect.
  const uv = frontGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, .21875 + uv.getX(i) * .5625);
  const frontScreen = new THREE.Mesh(frontGeometry, videoMaterial);
  frontScreen.name = "Front LCD"; frontScreen.position.set(-.018, .0035, .0146); group.add(frontScreen);
  box("Rear touchscreen bezel", [.063, .041, .001], [0, 0, -.014], .003, blackGlass);
  const rearScreen = new THREE.Mesh(new THREE.PlaneGeometry(.055, .03094), videoMaterial);
  rearScreen.name = "Rear LCD"; rearScreen.position.z = -.0146; rearScreen.rotation.y = Math.PI; group.add(rearScreen);
  box("Top shutter button", [.014, .0018, .009], [-.015, .026, -.001], .0015, rim);
  const recordRing = new THREE.Mesh(new THREE.TorusGeometry(.0023, .00035, 6, 20), red);
  recordRing.position.set(-.015, .027, -.001); recordRing.rotation.x = -Math.PI / 2; group.add(recordRing);
  box("Side mode button", [.0013, .009, .007], [.036, -.005, -.002], .001, rim);
  const led = new THREE.Mesh(new THREE.CircleGeometry(.00085, 12), red);
  led.position.set(-.028, .0205, .0137); group.add(led);
  // Small front grille and four purple accent bars retain the recognizable silhouette.
  for (let i = 0; i < 4; i++) {
    box("Front grille", [.022, .001, .0006], [.0185, -.011 - i * .0022, .0138], .0003, blackGlass);
    box("Purple accent bar", [.0042, .0032, .0004], [-.029 + i * .0052, -.0195, .0138], .0002,
      new THREE.MeshBasicMaterial({ color: ["#9974c2", "#7a5195", "#b29acd", "#eee2f4"][i] }));
  }
  // Compact folding fingers underneath the body replace the oversized rear plate.
  for (const x of [-.008, 0, .008]) box("Mount finger", [.0038, .0075, .011], [x, -.0285, -.001], .0012, rubber);
  return group;
}
