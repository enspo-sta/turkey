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
  // pebbles, in two sizes. A texel is 3.1 cm across the road and 1.8 cm
  // along it, so a pebble is drawn 1.8 times as tall as it is wide to lie
  // round on the road; a faint darker halo round each (where it sits in
  // the fines) makes them read as stones under any light
  const KY = 1.78;
  for (let i = 0; i < 9000; i++) {
    const v = 90 + rand() * 90;
    const a = 0.25 + rand() * 0.4;
    const s = rand() < 0.15 ? 2.6 + rand() * 1.8 : 0.9 + rand() * 1.7;
    const x = rand() * W;
    const y = rand() * H;
    g.fillStyle = `rgba(52,44,33,${a * 0.45})`;
    g.fillRect(x - s * 0.22, y - s * KY * 0.22, s * 1.44, s * KY * 1.44);
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.78},${a})`;
    g.fillRect(x, y, s, s * KY);
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
  // a few faint puddle stains and potholes, drawn again across the tile's
  // ends so none is cut off where the texture repeats
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(60,52,40,0.14)';
    const x = W * (0.2 + rand() * 0.6);
    const y = rand() * H;
    const rx = 8 + rand() * 14;
    const ry = (5 + rand() * 9) * KY;
    const rot = rand();
    for (const dy of [-H, 0, H]) {
      g.beginPath();
      g.ellipse(x, y + dy, rx, ry, rot, 0, Math.PI * 2);
      g.fill();
    }
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
  for (const [ri, road] of world.roads.entries()) {
    const P = road.path;
    // (each road starts the texture at its own place, so the stains of one
    // do not line up with another's)
    const v0 = ri * 0.37;
    const pos = [];
    const uv = [];
    const idx = [];
    const step = 3;
    // (one more row at the very end when the length is not a whole number of
    // steps, so the ribbon reaches the road's end)
    const whole = Math.floor(P.length / step);
    const n = whole + (P.length - whole * step > 0.01 ? 2 : 1);
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
      uv.push(0, v0 + s / 9, 1, v0 + s / 9);
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
