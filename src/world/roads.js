// Gravel road ribbons laid over the flattened terrain corridors, with tyre
// tracks, a crown and softened shoulders in a canvas-painted texture.
import * as THREE from 'three';
import { ROAD_HALF } from './worldgen.js';
import { mulberry32 } from '../util/math.js';

function gravelTexture() {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#8b7d63';
  g.fillRect(0, 0, W, H);
  const rand = mulberry32(77);
  // pebbles
  for (let i = 0; i < 9000; i++) {
    const v = 90 + rand() * 90;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.78},${0.25 + rand() * 0.4})`;
    const s = 1 + rand() * 2.5;
    g.fillRect(rand() * W, rand() * H, s, s);
  }
  // tyre tracks: smoother, darker lanes
  for (const x of [0.27, 0.73]) {
    const grad = g.createLinearGradient(W * (x - 0.1), 0, W * (x + 0.1), 0);
    grad.addColorStop(0, 'rgba(70,58,44,0)');
    grad.addColorStop(0.5, 'rgba(70,58,44,0.42)');
    grad.addColorStop(1, 'rgba(70,58,44,0)');
    g.fillStyle = grad;
    g.fillRect(W * (x - 0.1), 0, W * 0.2, H);
  }
  // loose gravel along the crown and the shoulders
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(110,120,70,0.55)');
  edge.addColorStop(0.07, 'rgba(120,110,85,0.15)');
  edge.addColorStop(0.5, 'rgba(160,150,125,0.18)');
  edge.addColorStop(0.93, 'rgba(120,110,85,0.15)');
  edge.addColorStop(1, 'rgba(110,120,70,0.55)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  // a few puddle stains and potholes
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(60,52,40,0.35)';
    g.beginPath();
    g.ellipse(W * (0.2 + rand() * 0.6), rand() * H, 8 + rand() * 14, 5 + rand() * 9, rand(), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function buildRoads(world) {
  const group = new THREE.Group();
  group.name = 'roads';
  const mat = new THREE.MeshLambertMaterial({
    map: gravelTexture(),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (const road of world.roads) {
    const P = road.path;
    const pos = [];
    const uv = [];
    const idx = [];
    const step = 3;
    const n = Math.floor(P.length / step) + 1;
    const segLen = P.length / (P.count - 1);
    for (let i = 0; i < n; i++) {
      const s = Math.min(P.length, i * step);
      const p = P.sample(s);
      const k = Math.min(road.elev.length - 1, Math.max(0, s / segLen));
      const k0 = Math.floor(k);
      const k1 = Math.min(road.elev.length - 1, k0 + 1);
      const y = road.elev[k0] + (road.elev[k1] - road.elev[k0]) * (k - k0) + 0.07;
      const nx = -p.tz;
      const nz = p.tx;
      const hw = ROAD_HALF + 0.4;
      pos.push(p.x + nx * hw, y, p.z + nz * hw, p.x - nx * hw, y, p.z - nz * hw);
      uv.push(0, s / 9, 1, s / 9);
      if (i > 0) {
        const a = (i - 1) * 2;
        const b = i * 2;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'road-' + road.id;
    group.add(mesh);
  }
  return group;
}
