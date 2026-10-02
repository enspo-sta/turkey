// Hand lab: renders each hand pose from four sides on a grey backdrop, for
// tuning entities/hands.js without loading the game.
import * as THREE from 'three';
import { ModelBuilder } from '../../src/util/builder.js';
import { addHand, addSleeve, handFrame, POSES } from '../../src/entities/hands.js';
import { shirtTexture } from '../../src/entities/cloth.js';
import { lookColors } from '../../src/gameplay/data.js';

const W = 1200;
const H = 900;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const look = lookColors(JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')));
const handMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
const clothMat = new THREE.MeshStandardMaterial({ map: shirtTexture(look.shirt), vertexColors: true, roughness: 0.86 });
const poses = Object.keys(POSES);
const views = [
  [0, 0.05, 0.35],
  [0.35, 0.05, 0],
  [0, 0.35, 0.02],
  [-0.25, 0.15, -0.25],
];
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a7480);
scene.add(new THREE.HemisphereLight(0xdde6f0, 0x404040, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(0.4, 1, 0.6);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, W / 4 / (H / poses.length), 0.01, 10);
poses.forEach((name, row) => {
  const g = new THREE.Group();
  const hb = new ModelBuilder();
  const cb = new ModelBuilder({ uvs: true });
  const X = addHand(hb, look, POSES[name], new THREE.Matrix4(), true);
  // a bar where a fist would hold one
  if (name !== 'cradle') hb.cyl(0.016, 0.016, 0.16, 12, { pos: name === 'draw' ? [0, -0.025, 0.128] : [0, -0.028, 0.072], rot: [0, 0, Math.PI / 2], color: 0xc9a46e, jitter: 0, smooth: true });
  addSleeve(cb, hb, look, [[0, 0, -0.06], [0, -0.01, -0.2], [0, -0.03, -0.35]], 0.046, 0.06, { wrist: X([0, 0, -0.012]) });
  g.add(new THREE.Mesh(hb.build(), handMat), new THREE.Mesh(cb.build(), clothMat));
  g.position.set(row * 3, 0, 0);
  scene.add(g);
  views.forEach((v, col) => {
    const target = new THREE.Vector3(row * 3, -0.01, 0.06);
    cam.position.set(target.x + v[0], target.y + v[1], target.z + v[2]);
    cam.lookAt(target);
    const x = (col * W) / 4;
    const y = H - ((row + 1) * H) / poses.length;
    renderer.setViewport(x, y, W / 4, H / poses.length);
    renderer.setScissor(x, y, W / 4, H / poses.length);
    renderer.render(scene, cam);
  });
});
window.__done = true;
