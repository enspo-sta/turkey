// Vegetation and rocks: deterministic placement from the world's density
// fields, rendered with per-type instanced meshes. Instances are re-bucketed
// into near/far LODs around the camera with CPU frustum culling, and each
// time the view is drawn the levels keep only the instances it can see (see
// setViewCull). The levels that cast a shadow cast it by twins of their own
// (see setShadowTwins).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelBuilder, jitterGeometry } from '../util/builder.js';
import { mulberry32, lerp, clamp, smoothstep, hash2 } from '../util/math.js';
import { HALF, SIZE, ROAD_HALF, SURF } from './worldgen.js';
import { fxPatch, reflectionMaterial } from './worldfx.js';
import { weld } from './shadowbatch.js';

const CELL = 50;
const GRID = Math.ceil(SIZE / CELL);
// the trees whose far level casts into the far shadow cascade on High (see
// Scatter.setFarShadows)
const FAR_SHADOWS = ['spruce', 'birch', 'blackSpruce', 'poplar', 'aspen'];
// How far a plant's sway (swayMaterial) can carry a point, for each unit of
// its sway amount and each square metre of height above its base: the sway
// is (sin + 0.35 sin) (0.75 + 0.45 gust) + 0.55 gust, times 1.1 amount hh²,
// along a wind of length 1, and a gust (fxGust in worldfx.js) is at most the
// wind's strength, 1.45 in the heaviest rain (Game.updateFx); reckoned here
// for a strength of 2.
const SWAY_REACH = 1.1 * (1.35 * (0.75 + 0.45 * 2) + 0.55 * 2);
// (and a little more round each plant, for the rounding of the places)
const CULL_PAD = 0.05;
// the view's planes, for ScatterType.cullView
const PLANES = new Float64Array(24);

function spruceNear() {
  const b = new ModelBuilder();
  b.cyl(0.11, 0.22, 2.4, 5, { pos: [0, 1.2, 0], color: 0x4a3322, gradient: 0.3 });
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = lerp(2.25, 0.6, t);
    const h = lerp(2.7, 1.7, t);
    const y = 1.5 + i * 1.32;
    const col = i % 2 ? 0x1d3a24 : 0x264a2c;
    b.cone(r, h, 7, { pos: [0, y + h / 2, 0], rot: [0, i * 0.9, 0], color: col, gradient: 0.45, jitter: 0.1, volume: { axis: [0, 0], up: 0.75 } });
  }
  b.cone(0.28, 1.3, 5, { pos: [0, 1.5 + layers * 1.32 + 0.4, 0], color: 0x2c5232, volume: { axis: [0, 0], up: 0.75 } });
  return b.build();
}

function spruceFar() {
  // five-sided open cone: 5 triangles per distant tree
  const b = new ModelBuilder();
  b.add(new THREE.ConeGeometry(2.1, 11.2, 5, 1, true), { pos: [0, 5.5, 0], color: 0x21422a, gradient: 0.35, jitter: 0.04, volume: { axis: [0, 0], up: 0.75 } });
  return b.build();
}

// A clump of leaves: a jittered icosahedron, finer close up (detail 1) than
// further off (0), with a sphere's normals either way, so the clump shades
// round even where its outline is a few big facets
const _cn = new THREE.Vector3();
function clump(r, detail, amount, rand) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _cn.fromBufferAttribute(p, i).normalize();
    n.setXYZ(i, _cn.x, _cn.y, _cn.z);
  }
  return jitterGeometry(g, amount, rand);
}

function birchNear() {
  const b = new ModelBuilder();
  b.cyl(0.09, 0.16, 5.4, 6, { pos: [0, 2.7, 0], color: 0xdcd8cc, jitter: 0.12, gradient: 0.25 });
  b.cyl(0.165, 0.165, 0.18, 6, { pos: [0, 1.4, 0], color: 0x2a2622 });
  b.cyl(0.14, 0.14, 0.12, 6, { pos: [0, 3.1, 0], color: 0x2a2622 });
  b.beam([0, 3.6, 0], [0.9, 4.8, 0.3], 0.05, 4, { color: 0xcfcabc });
  b.beam([0, 4.1, 0], [-0.8, 5.2, -0.4], 0.05, 4, { color: 0xcfcabc });
  const blobs = [
    [0, 6.4, 0, 1.7],
    [0.9, 5.4, 0.4, 1.3],
    [-0.9, 5.6, -0.3, 1.25],
    [0.2, 5.1, -0.9, 1.1],
    [-0.3, 7.3, 0.2, 1.1],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = clump(r, 0, r * 0.3, mulberry32((x * 13 + y * 7) | 0));
    b.add(g, { pos: [x, y, z], color: 0x6a8c36, gradient: 0.35, jitter: 0.09, smooth: true, volume: { centre: [0, 6.0, 0], k: 0.45, own: true } });
  }
  return shareVertices(b.build());
}

function birchFar() {
  // octahedron canopy on a thin triangular trunk: 11 triangles
  const b = new ModelBuilder();
  b.add(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 3, 1, true), { pos: [0, 2.2, 0], color: 0xd8d4c8 });
  b.add(new THREE.OctahedronGeometry(2.2, 0), { pos: [0, 6.0, 0], scale: [1, 1.15, 1], color: 0x668834, gradient: 0.25, volume: { centre: [0, 6.0, 0], k: 0.3 } });
  return b.build();
}

function bushGeo() {
  const b = new ModelBuilder();
  const blobs = [
    [0, 0.7, 0, 0.95],
    [0.7, 0.5, 0.3, 0.7],
    [-0.6, 0.55, -0.2, 0.75],
    [0.1, 0.45, -0.7, 0.6],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = jitterGeometry(new THREE.IcosahedronGeometry(r, 0), r * 0.4, mulberry32((x * 31 + z * 17 + 5) | 0));
    b.add(g, { pos: [x, y, z], color: 0xffffff, gradient: 0.4, jitter: 0.1, smooth: true, volume: { centre: [0, 0.4, 0], k: 0.18, squash: 1.4 } });
  }
  return b.build();
}

// Close-range shrub: twigs spreading from the base, each carrying small
// clumps of leaves (white here: the per-instance tint colours it as dwarf
// birch on the tundra, alder or willow elsewhere).
function bushDetailed() {
  const b = new ModelBuilder();
  const rand = mulberry32(88);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
    const len = 0.7 + rand() * 0.5;
    const top = [Math.cos(a) * len * 0.75, 0.55 + rand() * 0.6, Math.sin(a) * len * 0.75];
    b.beam([Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], top, 0.025, 4, { r2: 0.012, color: 0x5a5048 });
    for (let k = 0; k < 5; k++) {
      const t = 0.35 + k * 0.16;
      const r = 0.16 + rand() * 0.12;
      const p = [top[0] * t + (rand() - 0.5) * 0.25, top[1] * t + 0.12 + rand() * 0.15, top[2] * t + (rand() - 0.5) * 0.25];
      b.add(jitterGeometry(new THREE.IcosahedronGeometry(r, 0), r * 0.35, mulberry32(i * 13 + k)), { pos: p, scale: [1, 0.8, 1], color: 0xffffff, gradient: 0.35, jitter: 0.12, smooth: true, volume: { centre: [0, 0.45, 0], k: 0.2, squash: 1.4 } });
    }
  }
  return b.build();
}

function rockGeo(seed, detail = 1) {
  const b = new ModelBuilder();
  const g = jitterGeometry(new THREE.DodecahedronGeometry(1, detail), detail ? 0.45 : 0.3, mulberry32(seed));
  // darker where it sits in the ground
  b.add(g, { pos: [0, 0.35, 0], scale: [1, 0.72, 1], color: 0xffffff, jitter: 0.1, gradient: 0.38 });
  return b.build();
}

function snagGeo() {
  const b = new ModelBuilder();
  b.cyl(0.1, 0.24, 9, 5, { pos: [0, 4.5, 0], color: 0x8a8378, jitter: 0.08, gradient: 0.3 });
  b.beam([0, 5.5, 0], [1.4, 6.6, 0.2], 0.06, 4, { color: 0x7d766c });
  b.beam([0, 6.8, 0], [-1.2, 7.6, 0.5], 0.05, 4, { color: 0x7d766c });
  b.beam([0, 7.8, 0], [0.3, 8.8, -1.0], 0.045, 4, { color: 0x7d766c });
  return b.build();
}

// sRGB 0..1 components to the linear values vertex colours are stored in.
const _lc = new THREE.Color();
function lin(r, g, b) {
  _lc.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [_lc.r, _lc.g, _lc.b];
}

// Detailed spruce for close range: whorls of drooping branches with ragged
// star-shaped tips, closed underneath so looking up into a tree works.
function spruceDetailed() {
  const pos = [];
  const col = [];
  const rand = mulberry32(71);
  const push = (p, c) => {
    pos.push(p[0], p[1], p[2]);
    col.push(c[0], c[1], c[2]);
  };
  const whorls = 14;
  const dark = lin(0.1, 0.2, 0.12);
  const mid = lin(0.13, 0.25, 0.15);
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const R = lerp(2.2, 0.3, Math.pow(t, 0.85)) * (0.9 + rand() * 0.2);
    const y = 1.3 + t * 9.8;
    const h = lerp(1.35, 0.8, t);
    const droop = R * 0.42;
    const n = 18;
    const top = [0, y + h, 0];
    const under = [0, y - droop * 0.3, 0];
    const rot = rand() * Math.PI;
    const base = w % 2 ? dark : mid;
    // the low whorls live in the shade of the ones above
    const low = lerp(0.84, 1.06, t);
    const rim = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const r = R * (i % 2 ? 0.58 + rand() * 0.12 : 0.92 + rand() * 0.16);
      rim.push([Math.cos(a) * r, y - droop * (i % 2 ? 0.55 : 1) + (rand() - 0.5) * 0.1, Math.sin(a) * r]);
    }
    for (let i = 0; i < n; i++) {
      const a = rim[i];
      const b = rim[(i + 1) % n];
      const lit = (0.85 + rand() * 0.3) * low;
      // inside the whorl, under the one above, is shaded; the tips are fresh,
      // lighter and a little yellower growth
      const cTop = [base[0] * 0.85 * lit, base[1] * 0.85 * lit, base[2] * 0.85 * lit];
      const cRim = [base[0] * 1.38 * lit, base[1] * 1.33 * lit, base[2] * 1.15 * lit];
      push(top, cTop);
      push(b, cRim);
      push(a, cRim);
      const cUnder = [base[0] * 0.8 * low, base[1] * 0.8 * low, base[2] * 0.8 * low];
      push(under, cUnder);
      push(a, cUnder);
      push(b, cUnder);
    }
  }
  // leader shoot
  const lt = [0, 12.9, 0];
  const tipC = lin(0.18, 0.32, 0.18);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const b = ((i + 1) / 5) * Math.PI * 2;
    push(lt, tipC);
    push([Math.cos(b) * 0.2, 11.5, Math.sin(b) * 0.2], mid);
    push([Math.cos(a) * 0.2, 11.5, Math.sin(a) * 0.2], mid);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // soft volume lighting: every needle surface faces out from the trunk and
  // a little up, so undersides seen from below read dark green, not black
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const z = pos[i + 2];
    const l = Math.hypot(x, z) || 1;
    const nx = x / l;
    const nz = z / l;
    const ny = 0.75;
    const k = Math.hypot(nx, ny, nz);
    nrm[i] = nx / k;
    nrm[i + 1] = ny / k;
    nrm[i + 2] = nz / k;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const b = new ModelBuilder();
  b.cyl(0.1, 0.24, 3.2, 6, { pos: [0, 1.6, 0], color: 0x4a3322, gradient: 0.3 });
  // clusters of cones hanging among the top whorls
  const cr = mulberry32(72);
  for (let i = 0; i < 12; i++) {
    const t = 0.62 + cr() * 0.3;
    const y = 1.3 + t * 9.8 - 0.2;
    const R = lerp(2.2, 0.3, Math.pow(t, 0.85)) * (0.45 + cr() * 0.3);
    const a = cr() * Math.PI * 2;
    b.add(new THREE.OctahedronGeometry(0.075, 0), { pos: [Math.cos(a) * R, y, Math.sin(a) * R], scale: [0.55, 1.5, 0.55], color: [0.2, 0.1, 0.05], jitter: 0.15 });
  }
  const trunk = b.build();
  return mergeGeos([trunk, g]);
}

// Black spruce: the spire of the wet lowlands and cold north slopes. A thin
// trunk with short, irregular drooping branch tufts and a dense club of
// cones and needles at the very top.
function blackSpruceDetailed() {
  const b = new ModelBuilder();
  const rand = mulberry32(407);
  b.cyl(0.035, 0.1, 8.6, 5, { pos: [0, 4.3, 0], color: 0x3b2c20, jitter: 0.1, gradient: 0.3 });
  const tufts = 44;
  for (let i = 0; i < tufts; i++) {
    const t = i / tufts;
    const y = 0.9 + t * 6.9 + (rand() - 0.5) * 0.2;
    const len = lerp(0.8, 0.24, t) * (0.5 + rand() * 0.6);
    const a = rand() * Math.PI * 2;
    const droop = 0.18 + rand() * 0.2;
    const dark = rand() < 0.5;
    // build the tuft pointing out along +z, then swing it round the trunk
    b.cone(len * 0.26, len, 5, {
      pos: [0, y - droop * len * 0.5, len * 0.45],
      rot: [Math.PI / 2 + droop, 0, 0],
      color: dark ? 0x16291e : 0x1f3826,
      gradient: 0.3,
      jitter: 0.12,
      volume: { axis: [0, 0], up: 0.75, k: 0.12 },
    });
    b.parts[b.parts.length - 1].rotateY(a);
  }
  // the club: a dense knot of short branches and cones at the top
  for (let k = 0; k < 4; k++) {
    const g = jitterGeometry(new THREE.IcosahedronGeometry(0.34 - k * 0.05, 0), 0.08, mulberry32(90 + k));
    b.add(g, { pos: [(rand() - 0.5) * 0.12, 7.6 + k * 0.28, (rand() - 0.5) * 0.12], scale: [1, 1.3, 1], color: k === 1 ? 0x3a2a1e : 0x1b3122, gradient: 0.2, jitter: 0.12, volume: { axis: [0, 0], up: 0.9, k: 0.25 } });
  }
  b.cone(0.08, 0.7, 4, { pos: [0, 8.9, 0], color: 0x22402a });
  return b.build();
}

function blackSpruceNear() {
  const b = new ModelBuilder();
  b.cyl(0.04, 0.1, 3.5, 4, { pos: [0, 1.75, 0], color: 0x3b2c20 });
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const r = lerp(0.85, 0.3, t);
    b.cone(r, 1.9, 6, { pos: [0, 1.2 + i * 1.35 + 0.95, 0], rot: [0, i * 1.3, 0], color: i % 2 ? 0x16291e : 0x1d3526, gradient: 0.35, jitter: 0.1, volume: { axis: [0, 0], up: 0.75 } });
  }
  b.add(new THREE.OctahedronGeometry(0.4, 0), { pos: [0, 8.0, 0], scale: [1, 1.4, 1], color: 0x1b3122, volume: { axis: [0, 0], up: 0.9, k: 0.25 } });
  return b.build();
}

function blackSpruceFar() {
  const b = new ModelBuilder();
  b.add(new THREE.ConeGeometry(0.75, 8.6, 4, 1, true), { pos: [0, 4.5, 0], color: 0x19301f, gradient: 0.3, jitter: 0.04, volume: { axis: [0, 0], up: 0.75 } });
  return b.build();
}

// Balsam poplar (cottonwood): the big tree of the river bottoms, with a
// thick, deeply furrowed grey trunk, heavy limbs and a broad, uneven crown
// of glossy dark leaves.
function poplarDetailed() {
  const b = new ModelBuilder();
  const rand = mulberry32(611);
  // furrowed trunk: dark grooves between pale grey ridges that wander up
  // the bole (coloured per vertex, so built apart and merged below)
  const seg = 18;
  const trunk = new THREE.CylinderGeometry(0.26, 0.42, 7.2, seg, 6).toNonIndexed();
  trunk.translate(0, 3.6, 0);
  const tpos = trunk.attributes.position;
  const tcol = new Float32Array(tpos.count * 3);
  const ridge = lin(0.5, 0.49, 0.45);
  const furrow = lin(0.2, 0.19, 0.17);
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i);
    const z = tpos.getZ(i);
    const a = Math.atan2(z, x);
    const g = Math.sin(a * 9 + Math.sin(tpos.getY(i) * 0.9) * 0.8);
    const k = g > 0.3 ? 0.88 : 1;
    tpos.setX(i, x * k);
    tpos.setZ(i, z * k);
    const c = g > 0.3 ? furrow : ridge;
    tcol.set(c, i * 3);
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  trunk.deleteAttribute('uv');
  trunk.computeVertexNormals();
  // flared root buttresses
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.beam([0, 0.9, 0], [Math.cos(a) * 0.75, -0.1, Math.sin(a) * 0.75], 0.14, 5, { r2: 0.05, color: 0x5e5b54 });
  }
  const limbs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.6;
    const y0 = 5.6 + rand() * 1.4;
    const reach = 2.4 + rand() * 1.8;
    const top = [Math.cos(a) * reach, y0 + 3.4 + rand() * 2.2, Math.sin(a) * reach];
    b.beam([0, y0, 0], top, 0.17, 6, { r2: 0.07, color: 0x66635b });
    limbs.push(top);
  }
  // leaf masses round the limb ends and over the centre, darker inside
  const blobs = [];
  for (const [x, y, z] of limbs) {
    for (let k = 0; k < 3; k++) blobs.push([x + (rand() - 0.5) * 2.2, y + (rand() - 0.3) * 1.8, z + (rand() - 0.5) * 2.2, 1.35 + rand() * 0.7]);
  }
  blobs.push([0, 13.2, 0, 2.1], [0.6, 11.6, -0.8, 1.9], [-0.9, 12.1, 0.7, 1.8]);
  for (const [x, y, z, r] of blobs) {
    // the masses over the centre, mostly hidden inside, in the coarser clump
    const inner = Math.hypot(x, z) < 1.2 ? 0.8 : 1;
    const g = clump(r, inner < 1 ? 0 : 1, r * 0.3, mulberry32((x * 17 + y * 11 + z * 5) | 0));
    b.add(g, { pos: [x, y, z], scale: [1, 0.82, 1], color: [0.13 * inner, 0.21 * inner, 0.07 * inner], gradient: 0.42, jitter: 0.12, smooth: true, volume: { centre: [0, 11.0, 0], k: 0.45, own: true, squash: 1.8 } });
  }
  return shareVertices(mergeGeos([b.build(), trunk]));
}

function poplarNear() {
  const b = new ModelBuilder();
  b.cyl(0.26, 0.42, 7.4, 6, { pos: [0, 3.7, 0], color: 0x6d6a62, jitter: 0.15, gradient: 0.3 });
  const blobs = [
    [0, 12.6, 0, 2.6],
    [2.2, 10.6, 0.6, 2.2],
    [-2.0, 10.9, -0.9, 2.2],
    [0.5, 10.2, 2.2, 2.0],
    [-0.6, 10.0, -2.3, 2.0],
    [1.3, 13.0, -1.4, 1.7],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = clump(r, 0, r * 0.3, mulberry32((x * 19 + z * 7 + 3) | 0));
    b.add(g, { pos: [x, y, z], scale: [1, 0.82, 1], color: [0.13, 0.21, 0.07], gradient: 0.35, jitter: 0.1, smooth: true, volume: { centre: [0, 11.0, 0], k: 0.45, own: true, squash: 1.8 } });
  }
  return shareVertices(b.build());
}

function poplarFar() {
  const b = new ModelBuilder();
  b.add(new THREE.CylinderGeometry(0.22, 0.38, 7.4, 3, 1, true), { pos: [0, 3.7, 0], color: 0x6d6a62 });
  b.add(new THREE.OctahedronGeometry(3.6, 0), { pos: [0, 11.2, 0], scale: [1.1, 0.85, 1.1], color: [0.13, 0.21, 0.07], gradient: 0.3, volume: { centre: [0, 11.0, 0], k: 0.3, squash: 1.8 } });
  return b.build();
}

// Quaking aspen: slim, pale green-white trunks marked with black scars and
// a narrow crown of small round leaves high up, in groves on warm slopes.
function aspenDetailed() {
  const b = new ModelBuilder();
  const rand = mulberry32(233);
  b.cyl(0.07, 0.15, 9.4, 8, { pos: [0, 4.7, 0], color: 0xc9ccb4, jitter: 0.08, gradient: 0.25 });
  // eye-shaped branch scars and dark patches low on the trunk
  for (let i = 0; i < 9; i++) {
    const y = 0.6 + i * 0.85 + rand() * 0.3;
    const a = rand() * Math.PI * 2;
    const r = 0.15 - y * 0.009;
    b.box(0.06, 0.035, 0.02, { pos: [Math.cos(a) * r, y, Math.sin(a) * r], rot: [0, -a + Math.PI / 2, (rand() - 0.5) * 0.4], color: 0x24211d });
  }
  b.cyl(0.152, 0.152, 0.35, 8, { pos: [0, 0.18, 0], color: 0x4a473f, jitter: 0.1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand();
    const y0 = 5.8 + i * 0.6;
    b.beam([0, y0, 0], [Math.cos(a) * 1.1, y0 + 1.5, Math.sin(a) * 1.1], 0.035, 4, { r2: 0.015, color: 0xb9bca4 });
  }
  const blobs = [
    [0, 10.4, 0, 1.25],
    [0.8, 9.3, 0.3, 1.0],
    [-0.7, 9.5, -0.4, 1.0],
    [0.2, 8.6, -0.8, 0.9],
    [-0.3, 8.4, 0.8, 0.9],
    [0.5, 11.2, -0.3, 0.8],
    [-0.9, 7.8, 0.1, 0.75],
    [0.9, 7.9, -0.1, 0.75],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = clump(r, 1, r * 0.3, mulberry32((x * 23 + y * 13 + z * 3) | 0));
    b.add(g, { pos: [x, y, z], color: [0.3, 0.42, 0.1], gradient: 0.35, jitter: 0.12, smooth: true, volume: { centre: [0, 9.4, 0], k: 0.45, own: true, squash: 0.6 } });
  }
  return shareVertices(b.build());
}

function aspenNear() {
  const b = new ModelBuilder();
  b.cyl(0.07, 0.15, 9, 5, { pos: [0, 4.5, 0], color: 0xc9ccb4, jitter: 0.1, gradient: 0.25 });
  const blobs = [
    [0, 10, 0, 1.4],
    [0.7, 8.8, 0.3, 1.15],
    [-0.7, 8.9, -0.3, 1.15],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = clump(r, 0, r * 0.28, mulberry32((x * 29 + y * 3) | 0));
    b.add(g, { pos: [x, y, z], color: [0.3, 0.42, 0.1], gradient: 0.3, jitter: 0.1, smooth: true, volume: { centre: [0, 9.3, 0], k: 0.45, own: true, squash: 0.6 } });
  }
  return shareVertices(b.build());
}

function aspenFar() {
  const b = new ModelBuilder();
  b.add(new THREE.CylinderGeometry(0.06, 0.13, 7.6, 3, 1, true), { pos: [0, 3.8, 0], color: 0xc9ccb4 });
  b.add(new THREE.OctahedronGeometry(1.5, 0), { pos: [0, 9.2, 0], scale: [1, 1.5, 1], color: [0.3, 0.42, 0.1], gradient: 0.25, volume: { centre: [0, 9.3, 0], k: 0.3, squash: 0.6 } });
  return b.build();
}

// Detailed birch: white trunk with black marks, forked branches and a crown of
// leaf clusters.
function birchDetailed() {
  const b = new ModelBuilder();
  b.cyl(0.085, 0.17, 6.2, 8, { pos: [0, 3.1, 0], color: 0xe2ded2, jitter: 0.1, gradient: 0.25 });
  const rand = mulberry32(19);
  for (let i = 0; i < 7; i++) {
    const y = 0.8 + i * 0.75 + rand() * 0.3;
    b.cyl(0.176 - i * 0.012, 0.176 - i * 0.012, 0.07 + rand() * 0.1, 8, { pos: [0, y, 0], rot: [0, rand() * 3, (rand() - 0.5) * 0.2], color: 0x2a2622 });
  }
  const limbs = [
    [[0, 3.4, 0], [1.1, 4.9, 0.35]],
    [[0, 3.9, 0], [-1.0, 5.3, -0.5]],
    [[0, 4.5, 0], [0.4, 5.9, -1.0]],
    [[0, 4.8, 0], [-0.5, 6.1, 0.9]],
    [[0.6, 4.2, 0.2], [1.5, 5.7, 1.0]],
  ];
  for (const [a, c] of limbs) b.beam(a, c, 0.05, 5, { color: 0xd4cfc2, r2: 0.025 });
  const blobs = [
    [0, 6.7, 0, 1.45],
    [1.1, 5.6, 0.5, 1.15],
    [-1.05, 5.9, -0.45, 1.1],
    [0.35, 5.3, -1.05, 1.0],
    [-0.45, 7.5, 0.3, 0.95],
    [0.8, 6.9, -0.6, 0.9],
    [-0.8, 6.8, 0.85, 0.95],
    [1.5, 6.3, 1.1, 0.8],
    [-1.4, 5.2, 0.6, 0.8],
    [0.2, 5.0, 1.1, 0.75],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = clump(r, 1, r * 0.32, mulberry32((x * 13 + y * 7 + z * 5) | 0));
    b.add(g, { pos: [x, y, z], color: 0x6a8c36, gradient: 0.38, jitter: 0.11, smooth: true, volume: { centre: [0, 6.2, 0], k: 0.45, own: true } });
  }
  return shareVertices(b.build());
}

// Fern clump: arching fronds that taper to a point.
function fernGeo() {
  const pos = [];
  const col = [];
  const rand = mulberry32(5);
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const len = 0.75 + rand() * 0.35;
    const lift = 0.55 + rand() * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const segs = 6;
    let prevL = null;
    let prevR = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const d = t * len;
      const y = Math.sin(t * Math.PI * 0.8) * lift * len - t * t * 0.25;
      const w = 0.13 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.3) + 0.004;
      const cx = ca * d;
      const cz = sa * d;
      const L = [cx - sa * w, y, cz + ca * w];
      const R = [cx + sa * w, y, cz - ca * w];
      if (prevL) {
        const shade = 0.75 + t * 0.35;
        const c = lin(0.2 * shade, 0.38 * shade, 0.12 * shade);
        pos.push(...prevL, ...prevR, ...R, ...prevL, ...R, ...L);
        for (let k = 0; k < 6; k++) col.push(...c);
      }
      prevL = L;
      prevR = R;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Clump of flower spikes: fireweed (magenta, tall) or lupine (violet, short).
function flowerSpikes(kind) {
  const b = new ModelBuilder();
  const rand = mulberry32(kind === 'lupine' ? 23 : 11);
  const stems = kind === 'lupine' ? 4 : 5;
  const H = kind === 'lupine' ? 0.62 : 1.25;
  const bloomA = kind === 'lupine' ? 0x5a4cc8 : 0xc2308a;
  const bloomB = kind === 'lupine' ? 0x8a7ae0 : 0xe060a8;
  for (let i = 0; i < stems; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.22;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = H * (0.75 + rand() * 0.4);
    b.cyl(0.008, 0.012, h, 3, { pos: [x, h / 2, z], color: 0x3a5a24 });
    // leaves on the lower stem
    for (let k = 0; k < 3; k++) {
      const ly = h * (0.2 + k * 0.15);
      const la = rand() * Math.PI * 2;
      const leaf = new THREE.BufferGeometry();
      const lx = Math.cos(la) * 0.16;
      const lz = Math.sin(la) * 0.16;
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([x, ly, z, x + lx - lz * 0.2, ly + 0.05, z + lz + lx * 0.2, x + lx * 0.4 + lz * 0.15, ly + 0.09, z + lz * 0.4 - lx * 0.15], 3));
      b.add(leaf, { color: 0x3e6a2a, jitter: 0.1 });
    }
    // the bloom: small petals spiralling up the top of the stem
    const n = kind === 'lupine' ? 9 : 10;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const by = h * (kind === 'lupine' ? 0.55 : 0.6) + t * h * (kind === 'lupine' ? 0.45 : 0.4);
      const ba = k * 2.4;
      const br = (kind === 'lupine' ? 0.045 : 0.055) * (1 - t * 0.55);
      b.add(new THREE.OctahedronGeometry(br, 0), { pos: [x + Math.cos(ba) * br * 0.8, by, z + Math.sin(ba) * br * 0.8], color: k % 2 ? bloomA : bloomB, jitter: 0.12 });
    }
  }
  return b.build();
}

// ---- native ground plants, detailed for close range

// A flat leaf outline (lobes > 0 gives a palmate, maple-like leaf) as a fan
// of triangles, cupped a little, coloured from a pale centre to the edge.
function leafFan(pos, col, cx, cy, cz, R, lobes, yaw, tilt, cIn, cOut, steps = 24) {
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const pt = (r, a) => {
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    // tilt about the leaf's own x axis, droop at the rim
    const ly = -lz * tilt - (r / R) * (r / R) * R * 0.18;
    return [cx + lx * ca - lz * sa, cy + ly, cz + lx * sa + lz * ca];
  };
  const c0 = [cx, cy + R * 0.04, cz];
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const r = (a) => (lobes ? R * (0.58 + 0.42 * Math.pow(Math.abs(Math.sin(a * lobes * 0.5)), 0.55)) : R * (1 - 0.35 * Math.abs(Math.sin(a))));
    pos.push(...c0, ...pt(r(a1), a1), ...pt(r(a0), a0));
    col.push(...cIn, ...cOut, ...cOut);
  }
}

function geoFrom(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Devil's club: spiny stems crowned with huge palmate leaves and, in late
// summer, a cone of scarlet berries.
function devilsClubGeo() {
  const rand = mulberry32(151);
  const b = new ModelBuilder();
  const pos = [];
  const col = [];
  const leafIn = lin(0.3, 0.46, 0.14);
  const leafOut = lin(0.13, 0.3, 0.07);
  const stems = 4;
  for (let i = 0; i < stems; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.1 + rand() * 0.35;
    const h = 1.1 + rand() * 0.8;
    const lean = 0.15 + rand() * 0.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tx = x + Math.cos(a) * lean;
    const tz = z + Math.sin(a) * lean;
    b.beam([x, 0, z], [tx, h, tz], 0.03, 5, { r2: 0.022, color: 0x7a6440 });
    // spines: pale flecks up the stem
    for (let k = 0; k < 6; k++) {
      const t = 0.15 + k * 0.14;
      b.box(0.012, 0.03, 0.012, { pos: [x + (tx - x) * t + 0.025, h * t, z + (tz - z) * t], rot: [0, k, 0.6], color: 0xd8c890, jitter: 0 });
    }
    const leaves = 3 + Math.floor(rand() * 2);
    for (let k = 0; k < leaves; k++) {
      const la = rand() * Math.PI * 2;
      const R = 0.28 + rand() * 0.14;
      leafFan(pos, col, tx + Math.cos(la) * R * 0.7, h - 0.05 - k * 0.08, tz + Math.sin(la) * R * 0.7, R, 7, la, 0.15 + rand() * 0.2, leafIn, leafOut);
    }
    // berry cone on the tallest stems
    if (i < 2) {
      for (let k = 0; k < 14; k++) {
        const t = k / 14;
        const ba = k * 2.3;
        const br = 0.07 * (1 - t);
        b.add(new THREE.OctahedronGeometry(0.02, 0), { pos: [tx + Math.cos(ba) * br, h + 0.04 + t * 0.2, tz + Math.sin(ba) * br], color: 0xc81e14, jitter: 0.12 });
      }
    }
  }
  return mergeGeos([b.build(), geoFrom(pos, col)]);
}

// Bog blueberry: a low tangle of twigs with small leaves and blue berries.
function blueberryGeo() {
  const rand = mulberry32(257);
  const b = new ModelBuilder();
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const len = 0.25 + rand() * 0.25;
    const top = [Math.cos(a) * len * 0.8, 0.2 + rand() * 0.22, Math.sin(a) * len * 0.8];
    b.beam([0, 0, 0], top, 0.01, 3, { color: 0x6a3a28 });
    for (let k = 0; k < 4; k++) {
      const t = 0.45 + k * 0.17;
      const p = [top[0] * t + (rand() - 0.5) * 0.06, top[1] * t + 0.03, top[2] * t + (rand() - 0.5) * 0.06];
      b.add(jitterGeometry(new THREE.IcosahedronGeometry(0.06, 0), 0.02, mulberry32(i * 9 + k)), { pos: p, scale: [1, 0.55, 1], color: 0x3e6a2c, jitter: 0.15 });
    }
    for (let k = 0; k < 3; k++) {
      const t = 0.5 + rand() * 0.45;
      b.add(new THREE.IcosahedronGeometry(0.018, 0), { pos: [top[0] * t + (rand() - 0.5) * 0.08, top[1] * t - 0.02, top[2] * t + (rand() - 0.5) * 0.08], color: 0x2c3f8a, jitter: 0.1 });
    }
  }
  return b.build();
}

// Labrador tea: a dark evergreen mound topped with domes of white flowers.
function labradorTeaGeo() {
  const rand = mulberry32(331);
  const b = new ModelBuilder();
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.28 + rand() * 0.2;
    b.beam([x, 0, z], [x * 1.2, h, z * 1.2], 0.01, 3, { color: 0x4a3a2a });
    b.add(jitterGeometry(new THREE.IcosahedronGeometry(0.11, 0), 0.03, mulberry32(i + 40)), { pos: [x * 1.2, h - 0.06, z * 1.2], scale: [1.2, 0.7, 1.2], color: 0x2a4a22, jitter: 0.12 });
    // flower dome
    for (let k = 0; k < 7; k++) {
      const fa = rand() * Math.PI * 2;
      const fr = rand() * 0.05;
      b.add(new THREE.OctahedronGeometry(0.022, 0), { pos: [x * 1.2 + Math.cos(fa) * fr, h + 0.02 + (0.05 - fr) * 0.6, z * 1.2 + Math.sin(fa) * fr], color: 0xf2efe2, jitter: 0.06 });
    }
  }
  return b.build();
}

// Cotton grass: slender stems each carrying a white tuft of seed fluff.
function cottonGrassGeo() {
  const rand = mulberry32(419);
  const pos = [];
  const col = [];
  const stemC = lin(0.36, 0.42, 0.2);
  const b = new ModelBuilder();
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.16;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.36 + rand() * 0.28;
    const lx = x + Math.cos(a) * 0.06;
    const lz = z + Math.sin(a) * 0.06;
    // a thin blade of a stem
    pos.push(x - 0.004, 0, z, x + 0.004, 0, z, lx, h, lz);
    col.push(...stemC, ...stemC, ...stemC);
    // two soft lobes with round normals: a fluffy tuft, not a faceted pebble
    for (let k = 0; k < 2; k++) {
      const head = jitterGeometry(new THREE.IcosahedronGeometry(0.022, 0), 0.009, mulberry32(i * 5 + k * 17 + 1));
      const hp = head.attributes.position;
      const hn = head.attributes.normal;
      for (let v = 0; v < hp.count; v++) {
        const l = Math.hypot(hp.getX(v), hp.getY(v), hp.getZ(v)) || 1;
        hn.setXYZ(v, hp.getX(v) / l, hp.getY(v) / l, hp.getZ(v) / l);
      }
      const ox = (rand() - 0.5) * 0.024;
      const oz = (rand() - 0.5) * 0.024;
      b.add(head, { pos: [lx + ox, h + 0.012 + k * 0.022, lz + oz], scale: [1, 1.25, 1], color: k ? 0xdcdcd2 : 0xcfcfc6, jitter: 0.04, smooth: true });
    }
  }
  // grassy leaves at the base
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const tx = Math.cos(a) * 0.14;
    const tz = Math.sin(a) * 0.14;
    pos.push(-0.01, 0, 0, 0.01, 0, 0, tx, 0.18 + rand() * 0.1, tz);
    col.push(...stemC, ...stemC, ...stemC);
  }
  return mergeGeos([b.build(), geoFrom(pos, col)]);
}

// Horsetail: jointed green stems with whorls of fine branches.
function horsetailGeo() {
  const rand = mulberry32(503);
  const b = new ModelBuilder();
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.16;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.35 + rand() * 0.3;
    b.cyl(0.006, 0.01, h, 4, { pos: [x, h / 2, z], color: 0x4e7a34 });
    for (let k = 1; k < 5; k++) {
      const y = (h * k) / 5;
      b.cyl(0.011, 0.011, 0.008, 4, { pos: [x, y, z], color: 0x1e2a18, jitter: 0 });
      for (let q = 0; q < 6; q++) {
        const qa = (q / 6) * Math.PI * 2 + k;
        const L = 0.07 * (1 - k * 0.12);
        b.beam([x, y, z], [x + Math.cos(qa) * L, y - 0.025, z + Math.sin(qa) * L], 0.0025, 3, { color: 0x5a8a3c, jitter: 0.1 });
      }
    }
  }
  return b.build();
}

// Skunk cabbage: big paddle leaves round a yellow hooded spathe.
function skunkCabbageGeo() {
  const rand = mulberry32(601);
  const pos = [];
  const col = [];
  const cIn = lin(0.34, 0.5, 0.14);
  const cOut = lin(0.16, 0.36, 0.08);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const L = 0.55 + rand() * 0.35;
    const W2 = 0.2 + rand() * 0.06;
    // a paddle rising from the centre and arching out
    const steps = 6;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const d = t * L;
      const y = Math.sin(t * Math.PI * 0.6) * L * 0.8;
      const w = W2 * Math.sin(Math.min(1, t * 1.2) * Math.PI) + 0.01;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const l = [cx - Math.sin(a) * w, y, cz + Math.cos(a) * w];
      const r = [cx + Math.sin(a) * w, y, cz - Math.cos(a) * w];
      if (prev) {
        pos.push(...prev[0], ...prev[1], ...r, ...prev[0], ...r, ...l);
        const c = t < 0.4 ? cIn : cOut;
        for (let q = 0; q < 6; q++) col.push(...c);
      }
      prev = [l, r];
    }
  }
  const b = new ModelBuilder();
  b.cone(0.07, 0.3, 6, { pos: [0.04, 0.15, 0.02], scale: [1, 1, 0.6], color: 0xe8c81c, jitter: 0.06 });
  b.cyl(0.02, 0.02, 0.12, 5, { pos: [0.04, 0.06, 0.02], color: 0xb8a038 });
  return mergeGeos([b.build(), geoFrom(pos, col)]);
}

// Mushrooms: a fly agaric with its white-spotted red cap and a couple of
// brown boletes.
function mushroomGeo() {
  const b = new ModelBuilder();
  b.cyl(0.018, 0.024, 0.12, 6, { pos: [0, 0.06, 0], color: 0xf0ece0 });
  b.sphere(0.07, 8, 4, { pos: [0, 0.12, 0], scale: [1, 0.55, 1], color: 0xc4201a, jitter: 0.05 });
  const rand = mulberry32(7);
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.02 + rand() * 0.035;
    b.box(0.012, 0.006, 0.012, { pos: [Math.cos(a) * r, 0.15 + (0.05 - r) * 0.3, Math.sin(a) * r], color: 0xf8f4ea, jitter: 0 });
  }
  b.cyl(0.02, 0.028, 0.07, 6, { pos: [0.14, 0.035, 0.05], color: 0xd8c8a0 });
  b.sphere(0.05, 7, 4, { pos: [0.14, 0.07, 0.05], scale: [1, 0.6, 1], color: 0x7a4a24, jitter: 0.06 });
  b.cyl(0.014, 0.02, 0.05, 6, { pos: [-0.1, 0.025, 0.08], color: 0xd8c8a0 });
  b.sphere(0.035, 7, 4, { pos: [-0.1, 0.05, 0.08], scale: [1, 0.6, 1], color: 0x6a3e1e, jitter: 0.06 });
  return b.build();
}

// Willow and alder thicket along the water: several stems with narrow,
// grey-green leaf masses.
function willowGeo() {
  const b = new ModelBuilder();
  const rand = mulberry32(31);
  const stems = 6;
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rand() * 0.5;
    const lean = 0.35 + rand() * 0.35;
    const h = 2.2 + rand() * 1.2;
    const top = [Math.cos(a) * lean * h * 0.5, h, Math.sin(a) * lean * h * 0.5];
    b.beam([Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], top, 0.045, 4, { color: 0x5a4a3a, r2: 0.02 });
    for (let k = 0; k < 3; k++) {
      const t = 0.5 + k * 0.22;
      const p = [top[0] * t, top[1] * t + 0.2, top[2] * t];
      const r = 0.55 - k * 0.08;
      const g = jitterGeometry(new THREE.IcosahedronGeometry(r, 0), r * 0.35, mulberry32(i * 7 + k));
      b.add(g, { pos: p, scale: [0.8, 1.35, 0.8], color: 0x5c7a3c, gradient: 0.35, jitter: 0.14, volume: { centre: [0, 1.7, 0], k: 0.35, squash: 0.8 } });
    }
  }
  return b.build();
}

// Fallen log with broken branch stubs (also used bleached as driftwood).
function logGeo() {
  const b = new ModelBuilder();
  b.add(new THREE.CylinderGeometry(0.2, 0.27, 5.2, 7, 3), { pos: [0, 0.22, 0], rot: [0, 0, Math.PI / 2], color: 0xffffff, jitter: 0.12 });
  b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 7), { pos: [-2.6, 0.22, 0], rot: [0, 0, Math.PI / 2], color: 0xd8c8a0 });
  const rand = mulberry32(8);
  for (let i = 0; i < 5; i++) {
    const x = -2 + i * 0.95 + rand() * 0.3;
    const a = rand() * Math.PI * 2;
    b.beam([x, 0.3, 0], [x + 0.1, 0.3 + Math.cos(a) * 0.5, Math.sin(a) * 0.5], 0.04, 4, { color: 0xeeeeee, r2: 0.02 });
  }
  // root plate at the thick end
  b.add(jitterGeometry(new THREE.CylinderGeometry(0.75, 0.6, 0.25, 8), 0.25, mulberry32(3)), { pos: [2.62, 0.45, 0], rot: [0, 0, Math.PI / 2], color: 0x8a7a64 });
  return b.build();
}

function stumpGeo() {
  const b = new ModelBuilder();
  b.cyl(0.28, 0.36, 0.55, 8, { pos: [0, 0.27, 0], color: 0x5a4632, jitter: 0.12, gradient: 0.35 });
  b.cyl(0.27, 0.27, 0.02, 8, { pos: [0, 0.55, 0], color: 0xb89a6c });
  return b.build();
}

// A broadleaf crown's clumps are smooth, lit by their place in the crown
// and their own round shape, with a smooth colour: all of it follows from
// where a vertex is, so a vertex is the same for every face that meets at
// it. Shared, the clumps are drawn from far fewer vertices than their
// triangles' corners (the trunk's faceted parts keep their own).
function shareVertices(geo) {
  const g = mergeVertices(geo, 1e-4);
  g.computeBoundingSphere();
  return g;
}

// Merge plain position/colour geometries (normals recomputed per part).
function mergeGeos(list) {
  let total = 0;
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Boulders: rock pattern projected in world space with bump lighting, moss
// and lichen on the tops, per-instance tint.
function rockMaterial(matTex) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMat = { value: matTex };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uMat;
        float rHeight = 0.0;
        vec3 rBump( vec3 surfPos, vec3 surfNorm, float h ) {
          vec3 sx = dFdx( surfPos );
          vec3 sy = dFdy( surfPos );
          vec3 r1 = cross( sy, surfNorm );
          vec3 r2 = cross( surfNorm, sx );
          float det = dot( sx, r1 );
          vec2 dh = vec2( dFdx( h ), dFdy( h ) );
          vec3 bumped = normalize( abs( det ) * surfNorm - sign( det ) * ( dh.x * r1 + dh.y * r2 ) + surfNorm * 1e-6 );
          return normalize( mix( surfNorm, bumped, clamp( dot( bumped, surfNorm ) * 2.0 - 0.3, 0.0, 1.0 ) ) );
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef USE_FOG
        {
          vec3 wn = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
          vec3 bw = abs( wn ) + 0.001;
          bw /= bw.x + bw.y + bw.z;
          vec3 wp = vFxWorld * 0.42;
          float rk = texture2D( uMat, wp.zy ).r * bw.x + texture2D( uMat, wp.xz ).r * bw.y + texture2D( uMat, wp.xy ).r * bw.z;
          diffuseColor.rgb *= 0.55 + rk * 0.9;
          // moss and lichen settle on the upper faces
          float moss = smoothstep( 0.45, 0.85, wn.y ) * smoothstep( 0.35, 0.65, texture2D( uMat, vFxWorld.xz * 0.23 ).a );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.045, 0.075, 0.028 ) * ( 0.8 + rk * 0.5 ), moss * 0.6 );
          // stone under the surface is wet, so darker than dry, as dark as
          // the wet band just above the waterline (worldfx.js); else a pale
          // boulder just under clear water reads as glass
          #ifdef FX_UNDERWATER
          if ( vFxWorld.y < uFxWaterMax && vFxWorld.y < fxWaterAt( vFxWorld.xz ).x ) diffuseColor.rgb *= 0.68;
          #endif
          rHeight = rk * 0.05 * ( 1.0 - smoothstep( 25.0, 70.0, length( vViewPosition ) ) ) * smoothstep( 0.06, 0.3, abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) );
        }
        #endif`
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = rBump( - vViewPosition, normal, rHeight );');
    fxPatch(shader, mat);
  };
  mat.customProgramCacheKey = () => 'rock|fx:';
  return mat;
}

// A tree's per-instance tint colours its leaves; grey and white parts (birch
// and aspen bark, poplar's grey trunk) take only its brightness, so an
// autumn or gold crown does not turn the trunk yellow. Vertex colours are
// linear: bark is below about 0.3 in saturation, leaves above 0.5.
const BARK_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#if defined( USE_INSTANCING_COLOR ) && ( defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) )
	float bkMax = max( color.r, max( color.g, color.b ) );
	float bkSat = ( bkMax - min( color.r, min( color.g, color.b ) ) ) / max( bkMax, 1e-4 );
	float bkLum = dot( instanceColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	vColor.rgb *= mix( vec3( bkLum ), instanceColor.rgb, smoothstep( 0.25, 0.45, bkSat ) );
#elif defined( USE_INSTANCING_COLOR )
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif
`;

// Material with gentle wind sway for tall vegetation.
// Leaves on a broadleaf crown: clusters of small domes, lit, with the
// shade between them, from the pebble channel of the ground's detail texture
// (already in memory) read in the tree's own frame, so the pattern stays on
// its leaves as the tree sways. Only where the vertex colour is a leaf's
// (saturated), not on the bark.
const LEAF_VERT = /* glsl */ `
#ifdef USE_COLOR
	{
		float lfMax = max( color.r, max( color.g, color.b ) );
		vLeaf = smoothstep( 0.25, 0.45, ( lfMax - min( color.r, min( color.g, color.b ) ) ) / max( lfMax, 1e-4 ) );
	}
#endif
vLeafP = position;
`;
const LEAF_FRAG = /* glsl */ `
#include <color_fragment>
{
	float lfc = texture2D( uLeafTex, vLeafP.xz * 0.24 + vLeafP.y * vec2( 0.13, -0.17 ) ).g;
	diffuseColor.rgb *= mix( 1.0, 0.58 + lfc * 0.72, vLeaf );
}
`;

function swayMaterial(uniforms, amount, { base = 1.0, doubleSide = false, bark = false, leafTex = null } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  mat.userData.fx = 'foliage';
  // (for how far the sway can carry a point: see levelCull)
  mat.userData.sway = { amount, base };
  // the sway amount is baked into the shader text, so key programs by it
  mat.customProgramCacheKey = () => 'sway' + amount + '/' + base + (bark ? '/bark' : '') + (leafTex ? '/leaves' : '') + '|fx:foliage';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    if (bark) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', BARK_COLOR);
    if (leafTex) {
      shader.uniforms.uLeafTex = { value: leafTex };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLeaf;\nvarying vec3 vLeafP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + LEAF_VERT);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uLeafTex;\nvarying float vLeaf;\nvarying vec3 vLeafP;').replace('#include <color_fragment>', LEAF_FRAG);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // the wind's direction in the plant's own frame
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          vec3 wl = normalize((vec4(uFxWind.x, 0.0, uFxWind.y, 0.0) * instanceMatrix).xyz + vec3(1e-5, 0.0, 0.0));
        #else
          vec2 ip = vec2(0.0);
          vec3 wl = vec3(uFxWind.x, 0.0, uFxWind.y);
        #endif
        // steady sway, stronger in a gust, which also bends the plant downwind
        float gust = fxGust(ip);
        float sw = (sin(uTime * 1.2 + ip.x * 0.05 + ip.y * 0.07) + 0.35 * sin(uTime * 2.7 + ip.x * 0.3)) * (0.75 + 0.45 * gust) + 0.55 * gust;
        float hh = max(position.y - ${base.toFixed(2)}, 0.0);
        transformed.xz += wl.xz * sw * ${(amount * 1.1).toFixed(5)} * hh * hh;`
      );
    fxPatch(shader, mat);
  };
  return mat;
}

// A level's shape for the shadow map alone: its places only, each kept once
// (the same three 32-bit floats, to the bit: see weld in shadowbatch.js),
// and its triangles in the same order and winding over them. The shadow
// map's depth drawing reads nothing of a vertex but its place, so the map
// comes out the same to the bit, while each place is worked out once rather
// than once for every triangle that meets there: a close spruce has 375
// places to its 1,887 corners, a devil's club 762 to 2,784.
function shadowShape(geo) {
  const p = geo.attributes.position;
  const w = weld(p);
  const src = geo.index ? geo.index.array : null;
  const n = src ? geo.index.count : p.count;
  // (16-bit numbers while all fit below 65535, the one WebGL 2 keeps for
  // starting a strip anew)
  const idx = new (w.count < 65535 ? Uint16Array : Uint32Array)(n);
  for (let k = 0; k < n; k++) idx[k] = w.remap[src ? src[k] : k];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(w.position.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // (the same stretch of triangles drawn: a range over the vertices as they
  // were is the same range over their numbers now; the plants' shapes have
  // no groups)
  g.setDrawRange(geo.drawRange.start, geo.drawRange.count);
  return g;
}

// What the view's cull (see Scatter.setViewCull) keeps of a level l: its
// candidates, the instances buildType lists for it, by their places in the
// kind's own lists (src) and the spheres round them (sph: centre and radius,
// see ScatterType.bound); and which of them its buffers hold, in order, at
// the front (kept, the first nk; -1 while they hold all the candidates as
// buildType wrote them). Every point of the model lies within reach of its
// sphere's centre, swaying in the strongest wind.
function levelCull(l) {
  const geo = l.geo;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox) geo.computeBoundingBox();
  const sway = l.material.userData.sway;
  const hh = sway ? Math.max(geo.boundingBox.max.y - sway.base, 0) : 0;
  return {
    on: false,
    centre: geo.boundingSphere.center.clone(),
    reach: geo.boundingSphere.radius + (sway ? SWAY_REACH * sway.amount * hh * hh : 0),
    src: new Int32Array(l.capacity),
    sph: new Float32Array(l.capacity * 4),
    kept: new (l.capacity < 65536 ? Uint16Array : Uint32Array)(l.capacity),
    nk: -1,
  };
}

class ScatterType {
  constructor(name, lods, opts) {
    this.name = name;
    this.lods = lods; // [{geo, material, maxDist, capacity, shadow}]
    this.maxDist = lods[lods.length - 1].maxDist;
    this.opts = opts;
    this.list = []; // raw instances during generation
    this.meshes = lods.map((l) => {
      const m = new THREE.InstancedMesh(l.geo, l.material, l.capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = !!l.shadow;
      m.receiveShadow = !!l.receive;
      if (opts.tint) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(l.capacity * 3), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      m.name = `${name}-lod`;
      return m;
    });
    // whether each level casts a shadow (the far trees' only on High), and
    // the twin it casts it with (see makeTwins)
    this.casts = lods.map((l) => !!l.shadow);
    this.twins = lods.map(() => null);
    // how many instances buildType listed for each level (its candidates),
    // and what the view's cull keeps of them (see Scatter.setViewCull): every
    // level but the far trees', thousands of cones of a few triangles, not
    // worth copying out again for each drawing
    this.candidates = lods.map(() => 0);
    this.culls = lods.map((l, i) => (this.isFar(i) ? null : levelCull(l)));
    this.culls.forEach((cu, i) => {
      if (cu) this.meshes[i].intersectsFrustum = (f) => this.cullView(i, f);
    });
  }

  // Whether level i is a tree's far level (the trees' cones and octahedra
  // out to 720 m).
  isFar(i) {
    return i === this.lods.length - 1 && FAR_SHADOWS.includes(this.name);
  }

  // Each level that can cast a shadow gets a twin drawn only into the
  // shadow map (see Scatter.setShadowTwins): its shape for the shadow map
  // alone (shadowShape), with an instance buffer of its own that buildType
  // fills with the level's instances, at the same slots, and no per-instance
  // colour, which the shadow map never reads (three.js then draws it with
  // the plain instanced depth material, worldfx.js, whose vertices are
  // placed by the same code as the tinted one's). material(m) gives the
  // twin's material for a level's material m: one that casts with the same
  // side.
  makeTwins(material) {
    this.lods.forEach((l, i) => {
      if (!l.shadow && !this.isFar(i)) return;
      const tw = new THREE.InstancedMesh(shadowShape(l.geo), material(l.material), l.capacity);
      tw.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      tw.count = 0;
      // left out of every drawing, a cascade's too, while it has nothing in
      // it; and gone past by the view while it has something (to send its
      // instances before the shadow map is bound), never drawn there, as its
      // material is hidden but while the shadow map is drawn
      tw.frustumCulled = true;
      tw.intersectsFrustum = () => tw.count > 0;
      // (three.js would work its bounds out of the instances once, for an
      // order of drawing in the view that it never takes part in)
      tw.boundingSphere = new THREE.Sphere();
      tw.receiveShadow = false;
      tw.userData.shadowTwin = true;
      // (named as its level, for the tools that sort the draws by name)
      tw.name = `${this.name}-lod-shadow`;
      this.twins[i] = tw;
    });
  }

  // Instance idx (its matrix filled out to 4x4, and its tint) into slot c of
  // a level's instance buffers: by buildType, and by the view's cull, which
  // so writes each instance to the bit as buildType does.
  put(mesh, c, idx) {
    const arr = mesh.instanceMatrix.array;
    const o = c * 16;
    const s = idx * 12;
    const M = this.m;
    arr[o] = M[s];
    arr[o + 1] = M[s + 1];
    arr[o + 2] = M[s + 2];
    arr[o + 3] = 0;
    arr[o + 4] = M[s + 3];
    arr[o + 5] = M[s + 4];
    arr[o + 6] = M[s + 5];
    arr[o + 7] = 0;
    arr[o + 8] = M[s + 6];
    arr[o + 9] = M[s + 7];
    arr[o + 10] = M[s + 8];
    arr[o + 11] = 0;
    arr[o + 12] = M[s + 9];
    arr[o + 13] = M[s + 10];
    arr[o + 14] = M[s + 11];
    arr[o + 15] = 1;
    if (mesh.instanceColor) {
      const ca = mesh.instanceColor.array;
      ca[c * 3] = this.tint[idx * 3];
      ca[c * 3 + 1] = this.tint[idx * 3 + 1];
      ca[c * 3 + 2] = this.tint[idx * 3 + 2];
    }
  }

  // Candidate c of a level is instance idx, inside a sphere: the level's
  // model's own, grown by the farthest its sway can carry a point (cu.reach),
  // placed by the instance's matrix and scaled by its longest axis (a rock
  // is stretched more one way than another, and leans).
  bound(cu, c, idx) {
    const M = this.m;
    const s = idx * 12;
    const C = cu.centre;
    const q = c * 4;
    cu.src[c] = idx;
    cu.sph[q] = M[s] * C.x + M[s + 3] * C.y + M[s + 6] * C.z + M[s + 9];
    cu.sph[q + 1] = M[s + 1] * C.x + M[s + 4] * C.y + M[s + 7] * C.z + M[s + 10];
    cu.sph[q + 2] = M[s + 2] * C.x + M[s + 5] * C.y + M[s + 8] * C.z + M[s + 11];
    const k = Math.max(M[s] * M[s] + M[s + 1] * M[s + 1] + M[s + 2] * M[s + 2], M[s + 3] * M[s + 3] + M[s + 4] * M[s + 4] + M[s + 5] * M[s + 5], M[s + 6] * M[s + 6] + M[s + 7] * M[s + 7] + M[s + 8] * M[s + 8]);
    cu.sph[q + 3] = cu.reach * Math.sqrt(k) + CULL_PAD;
  }

  // The view's cull of level l, called by three.js as it goes through the
  // scene for a camera that draws it (Game.camera's view, a photo's or the
  // warm-up's; never the shadow map's, as the level does not cast, nor the
  // reflection's, which draws only its own layer), and before it sends the
  // level's buffers. Of the candidates, those whose spheres meet the view's
  // frustum f are kept, in their order, at the front of the buffers; only
  // the slots from the first that changed are written again and sent.
  // Whether any are left to draw.
  cullView(l, f) {
    const cu = this.culls[l];
    if (!cu.on) return true;
    const mesh = this.meshes[l];
    // (three.js works out a level's bounds once, the first time it draws it,
    // from what its buffers hold, for its place in the order of the draws
    // that share its material: from all its candidates, as without the cull)
    if (mesh.boundingSphere === null) mesh.computeBoundingSphere();
    // (the scatter's meshes stay where they were made, so an instance's
    // matrix places it in the world)
    const P = f.planes;
    for (let j = 0; j < 6; j++) {
      const p = P[j];
      PLANES[j * 4] = p.normal.x;
      PLANES[j * 4 + 1] = p.normal.y;
      PLANES[j * 4 + 2] = p.normal.z;
      PLANES[j * 4 + 3] = p.constant;
    }
    const n = this.candidates[l];
    const sph = cu.sph;
    const kept = cu.kept;
    const was = cu.nk;
    let k = 0;
    // the first slot whose instance is not the one the buffers hold there
    let from = was < 0 ? 0 : -1;
    next: for (let i = 0; i < n; i++) {
      const q = i * 4;
      const x = sph[q];
      const y = sph[q + 1];
      const z = sph[q + 2];
      const r = -sph[q + 3];
      for (let j = 0; j < 24; j += 4) if (PLANES[j] * x + PLANES[j + 1] * y + PLANES[j + 2] * z + PLANES[j + 3] < r) continue next;
      if (from < 0 && (k >= was || kept[k] !== i)) from = k;
      kept[k++] = i;
    }
    if (from >= 0 && from < k) {
      for (let p = from; p < k; p++) this.put(mesh, p, cu.src[kept[p]]);
      const im = mesh.instanceMatrix;
      im.clearUpdateRanges();
      im.addUpdateRange(from * 16, (k - from) * 16);
      im.needsUpdate = true;
      const ic = mesh.instanceColor;
      if (ic) {
        ic.clearUpdateRanges();
        ic.addUpdateRange(from * 3, (k - from) * 3);
        ic.needsUpdate = true;
      }
    }
    cu.nk = k;
    mesh.count = k;
    return k > 0;
  }

  // Level l's buffers given all its candidates again, in buildType's order
  // and to the bit as it wrote them (its cull turned off).
  uncull(l) {
    const mesh = this.meshes[l];
    const cu = this.culls[l];
    const n = this.candidates[l];
    for (let c = 0; c < n; c++) this.put(mesh, c, cu.src[c]);
    mesh.count = n;
    cu.nk = -1;
    if (!n) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, n * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, n * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }

  add(x, y, z, rot, scale, tint, sx = 1, sz = 1, tilt = 0) {
    this.list.push({ x, y, z, rot, scale, tint, sx, sz, tilt });
  }

  finalize() {
    const n = this.list.length;
    this.count = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.m = new Float32Array(n * 12); // 3x4 affine
    this.tint = new Float32Array(n * 3);
    const cells = Array.from({ length: GRID * GRID }, () => []);
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    this.list.forEach((it, i) => {
      this.x[i] = it.x;
      this.y[i] = it.y;
      this.z[i] = it.z;
      e.set(it.tilt ? it.tilt * Math.cos(it.rot * 3.1) : 0, it.rot, it.tilt ? it.tilt * Math.sin(it.rot * 2.3) : 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y, it.z);
      scl.set(it.scale * it.sx, it.scale, it.scale * it.sz);
      mat.compose(pos, q, scl);
      const el = mat.elements;
      this.m.set([el[0], el[1], el[2], el[4], el[5], el[6], el[8], el[9], el[10], el[12], el[13], el[14]], i * 12);
      const t = it.tint || [1, 1, 1];
      this.tint[i * 3] = t[0];
      this.tint[i * 3 + 1] = t[1];
      this.tint[i * 3 + 2] = t[2];
      const ci = clamp(Math.floor((it.x + HALF) / CELL), 0, GRID - 1);
      const cj = clamp(Math.floor((it.z + HALF) / CELL), 0, GRID - 1);
      cells[cj * GRID + ci].push(i);
    });
    this.cells = cells.map((a) => Int32Array.from(a));
    this.list = null;
  }

  // Whether fn(i) holds for any instance within r metres of (x, z).
  someNear(x, z, r, fn) {
    if (!this.cells) return false;
    const i0 = clamp(Math.floor((x - r + HALF) / CELL), 0, GRID - 1);
    const i1 = clamp(Math.floor((x + r + HALF) / CELL), 0, GRID - 1);
    const j0 = clamp(Math.floor((z - r + HALF) / CELL), 0, GRID - 1);
    const j1 = clamp(Math.floor((z + r + HALF) / CELL), 0, GRID - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const k of this.cells[j * GRID + i]) {
          const dx = this.x[k] - x;
          const dz = this.z[k] - z;
          if (dx * dx + dz * dz < r * r && fn(k)) return true;
        }
      }
    }
    return false;
  }

  // An instance's scale up and across, from its matrix.
  scaleY(k) {
    return Math.hypot(this.m[k * 12 + 3], this.m[k * 12 + 4], this.m[k * 12 + 5]);
  }

  scaleX(k) {
    return Math.hypot(this.m[k * 12], this.m[k * 12 + 1], this.m[k * 12 + 2]);
  }
}

// how far from the camera a plant's shadow can still fall in the shadow map
// (the sun's shadow distance)
const SHADOW_REACH2 = 260 * 260;

export class Scatter {
  constructor(world, colliders, sharedUniforms, matTex) {
    this.world = world;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'scatter';
    this.uniforms = sharedUniforms;
    this.distScale = 1;
    const sway = swayMaterial(sharedUniforms, 0.0016);
    const swayBirch = swayMaterial(sharedUniforms, 0.0022, { bark: true, leafTex: matTex });
    const swayShrub = swayMaterial(sharedUniforms, 0.012, { base: 0.4 });
    const swayPlant = swayMaterial(sharedUniforms, 0.09, { base: 0.1, doubleSide: true });
    const swayClub = swayMaterial(sharedUniforms, 0.06, { base: 0.5, doubleSide: true });
    const swayGrass = swayMaterial(sharedUniforms, 0.3, { base: 0.05, doubleSide: true });
    const swayPoplar = swayMaterial(sharedUniforms, 0.0012, { bark: true, leafTex: matTex });
    const swayAspen = swayMaterial(sharedUniforms, 0.0028, { bark: true, leafTex: matTex });
    const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
    // (the far trees, spruce and broadleaf alike, and the bushes: one
    // material, one shader; far off, a birch's trunk is a three-sided
    // sliver, and the bark rule there would have cost a shader of its own)
    const leafy = new THREE.MeshLambertMaterial({ vertexColors: true });
    leafy.userData.fx = 'foliage';
    const rocky = rockMaterial(matTex);

    this.types = {
      spruce: new ScatterType(
        'spruce',
        [
          { geo: spruceDetailed(), material: sway, maxDist: 55, capacity: 900, shadow: true },
          { geo: spruceNear(), material: sway, maxDist: 115, capacity: 2000, shadow: true },
          { geo: spruceFar(), material: leafy, maxDist: 720, capacity: 12000 },
        ],
        { tint: true }
      ),
      birch: new ScatterType(
        'birch',
        [
          { geo: birchDetailed(), material: swayBirch, maxDist: 45, capacity: 500, shadow: true },
          { geo: birchNear(), material: swayBirch, maxDist: 95, capacity: 1000, shadow: true },
          { geo: birchFar(), material: leafy, maxDist: 560, capacity: 5000 },
        ],
        { tint: true }
      ),
      blackSpruce: new ScatterType(
        'blackSpruce',
        [
          { geo: blackSpruceDetailed(), material: sway, maxDist: 60, capacity: 900, shadow: true },
          { geo: blackSpruceNear(), material: sway, maxDist: 130, capacity: 1800, shadow: true },
          { geo: blackSpruceFar(), material: leafy, maxDist: 650, capacity: 9000 },
        ],
        { tint: true }
      ),
      poplar: new ScatterType(
        'poplar',
        [
          { geo: poplarDetailed(), material: swayPoplar, maxDist: 66, capacity: 400, shadow: true },
          { geo: poplarNear(), material: swayPoplar, maxDist: 180, capacity: 900, shadow: true },
          { geo: poplarFar(), material: leafy, maxDist: 720, capacity: 3000 },
        ],
        { tint: true }
      ),
      aspen: new ScatterType(
        'aspen',
        [
          { geo: aspenDetailed(), material: swayAspen, maxDist: 55, capacity: 700, shadow: true },
          { geo: aspenNear(), material: swayAspen, maxDist: 115, capacity: 1400, shadow: true },
          { geo: aspenFar(), material: leafy, maxDist: 560, capacity: 5000 },
        ],
        { tint: true }
      ),
      bush: new ScatterType(
        'bush',
        [
          { geo: bushDetailed(), material: leafy, maxDist: 40, capacity: 900, shadow: false },
          { geo: bushGeo(), material: leafy, maxDist: 160, capacity: 4000, shadow: false },
        ],
        { tint: true }
      ),
      willow: new ScatterType('willow', [{ geo: willowGeo(), material: swayShrub, maxDist: 230, capacity: 1600, shadow: true }], {
        tint: true,
      }),
      fern: new ScatterType('fern', [{ geo: fernGeo(), material: swayPlant, maxDist: 55, capacity: 2600 }], { tint: true }),
      fireweed: new ScatterType('fireweed', [{ geo: flowerSpikes('fireweed'), material: swayPlant, maxDist: 85, capacity: 3000 }], {
        tint: true,
      }),
      lupine: new ScatterType('lupine', [{ geo: flowerSpikes('lupine'), material: swayPlant, maxDist: 70, capacity: 2400 }], {
        tint: true,
      }),
      log: new ScatterType('log', [{ geo: logGeo(), material: plain, maxDist: 130, capacity: 700, shadow: true }], { tint: true }),
      stump: new ScatterType('stump', [{ geo: stumpGeo(), material: plain, maxDist: 80, capacity: 500, shadow: true }], {
        tint: true,
      }),
      rock: new ScatterType(
        'rock',
        [
          { geo: rockGeo(3), material: rocky, maxDist: 90, capacity: 2500, shadow: true, receive: true },
          { geo: rockGeo(3, 0), material: rocky, maxDist: 360, capacity: 4000 },
        ],
        { tint: true }
      ),
      devilsClub: new ScatterType('devilsClub', [{ geo: devilsClubGeo(), material: swayClub, maxDist: 70, capacity: 1500, shadow: true }], { tint: true }),
      blueberry: new ScatterType('blueberry', [{ geo: blueberryGeo(), material: swayPlant, maxDist: 55, capacity: 3000 }], { tint: true }),
      labradorTea: new ScatterType('labradorTea', [{ geo: labradorTeaGeo(), material: swayPlant, maxDist: 55, capacity: 2500 }], { tint: true }),
      cottonGrass: new ScatterType('cottonGrass', [{ geo: cottonGrassGeo(), material: swayGrass, maxDist: 60, capacity: 4000 }], { tint: true }),
      horsetail: new ScatterType('horsetail', [{ geo: horsetailGeo(), material: swayPlant, maxDist: 45, capacity: 2500 }], { tint: true }),
      skunkCabbage: new ScatterType('skunkCabbage', [{ geo: skunkCabbageGeo(), material: swayPlant, maxDist: 55, capacity: 1000 }], { tint: true }),
      mushroom: new ScatterType('mushroom', [{ geo: mushroomGeo(), material: plain, maxDist: 30, capacity: 1500 }], { tint: true }),
      snag: new ScatterType('snag', [{ geo: snagGeo(), material: plain, maxDist: 500, capacity: 400, shadow: true }], {
        tint: true,
      }),
    };
    // The plants' shadows drawn by their levels' twins (see setShadowTwins),
    // with one material for each way of casting. It is never drawn: the
    // shadow map draws with its depth material, which takes its side from
    // this one as from the plant's own (a front side casts with its back),
    // and it is hidden but while the shadow map is drawn (see
    // ShadowBatcher.shadowOnly).
    const twinMaterials = new Map();
    const twinMaterial = (m) => {
      const key = `${m.side}/${m.shadowSide}`;
      if (!twinMaterials.has(key)) {
        const tm = new THREE.MeshBasicMaterial({ side: m.side, shadowSide: m.shadowSide, colorWrite: false, visible: false });
        tm.name = 'scatterShadowTwin';
        twinMaterials.set(key, tm);
      }
      return twinMaterials.get(key);
    };
    for (const t of Object.values(this.types)) t.makeTwins(twinMaterial);
    this.twinMaterials = [...twinMaterials.values()];
    this.shadowTwins = true;
    // (each twin right after its level: the shadow map's draws in the same
    // order as the levels' own)
    for (const t of Object.values(this.types)) {
      t.meshes.forEach((m, l) => {
        this.group.add(m);
        if (t.twins[l]) this.group.add(t.twins[l]);
        this.shown(m);
      });
    }
    // the view's own cull of the plants (see setViewCull), set with the
    // casting: it is off for a level that casts its own shadow
    this.viewCull = true;
    this.setCasting();

    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3(0, 0, 1);
    this.frustum = new THREE.Frustum();
    this.projCam = new THREE.PerspectiveCamera();
    this.sphere = new THREE.Sphere();
    this.snags = [];
  }

  generate(avoid = []) {
    const W = this.world;
    const rand = mulberry32(W.seed * 3 + 1);
    const T = this.types;
    const blocked = (x, z, r) => {
      for (const a of avoid) {
        const dx = x - a.x;
        const dz = z - a.z;
        if (dx * dx + dz * dz < (a.r + r) ** 2) return true;
      }
      return false;
    };
    const water = (x, z) => {
      const w = W.waterAt(x, z);
      return w && w.depth > -0.2;
    };
    // a tree's trunk to walk into, and its crown for what it hides from a
    // camera (treesInTheWay in gameplay/camera.js): from lo to hi metres up
    // and cr metres round, a spruce's cone or a broadleaf's round crown, as
    // the tree models are built (a spruce close up droops its lowest
    // branches to 0.4 of its scale); a bare snag has only its trunk
    const tree = (x, z, r, lo, hi, cr, cone) => {
      const c = this.colliders.addCircle(x, z, r, 'tree');
      c.lo = lo;
      c.hi = hi;
      c.cr = cr;
      c.cone = cone;
    };

    const lakeSD = (x, z) => {
      let m = 1e9;
      for (const lake of W.lakes) m = Math.min(m, W.lakeSD(lake, x, z));
      return m;
    };
    const nrm = { x: 0, y: 1, z: 0 };

    // trees on a jittered 5 m grid, the species chosen by site: black spruce
    // in the wet lowlands, round the lakes and on cold north slopes, aspen
    // groves on warm south slopes, birch in the lower valleys and white
    // spruce everywhere else, bigger and bluer toward the coast
    for (let gz = -HALF + 2; gz < HALF - 2; gz += 5) {
      for (let gx = -HALF + 2; gx < HALF - 2; gx += 5) {
        const x = gx + rand() * 5;
        const z = gz + rand() * 5;
        const k = W.cellIndex(x, z);
        const forest = W.forest[k] / 255;
        const lone = W.surf[k] === SURF.GRASS ? 0.012 : W.surf[k] === SURF.TUNDRA ? 0.004 : 0;
        if (rand() > forest * 0.52 + lone) continue;
        if (W.roadD[k] < ROAD_HALF + 3.5) continue;
        if (water(x, z) || blocked(x, z, 3)) continue;
        const y = W.heightAt(x, z);
        const low = y < 70;
        const slope = W.slopeAt(x, z);
        W.normalAt(x, z, nrm);
        const birchN = W.n2.noise(x * 0.006 + 7, z * 0.006 - 3);
        const aspenN = W.n3.noise(x * 0.011 - 41, z * 0.011 + 17);
        const wet = y < 45 && slope < 0.1 && (lakeSD(x, z) < 140 || W.n1.noise(x * 0.004 + 3, z * 0.004 - 9) > 0.2);
        const north = nrm.z < -0.2;
        const south = nrm.z > 0.14 && slope > 0.1;
        const rot = rand() * Math.PI * 2;
        if (south && y > 12 && y < 120 && aspenN > 0.22) {
          const s = 0.8 + rand() * 0.4;
          const gold = rand() < 0.1;
          const g = 0.85 + rand() * 0.3;
          T.aspen.add(x, y - 0.15, z, rot, s, gold ? [1.5, 1.15, 0.35] : [g, g * (1 + rand() * 0.1), g * 0.85], 0.85 + rand() * 0.3, 0.85 + rand() * 0.3);
          tree(x, z, 0.14 * s, 7 * s, 12 * s, 1.6 * s, false);
        } else if ((wet && rand() < 0.8) || (north && rand() < 0.45) || (W.surf[k] === SURF.TUNDRA && rand() < 0.6)) {
          const s = 0.6 + rand() * 0.55;
          const v = 0.8 + rand() * 0.3;
          T.blackSpruce.add(x, y - 0.1, z, rot, s, [v * 0.95, v, v * (0.95 + rand() * 0.15)], 0.7 + rand() * 0.45, 0.7 + rand() * 0.45);
          tree(x, z, 0.1 * s, 0.5 * s, 8.6 * s, 0.8 * s, true);
        } else if (low && (birchN > 0.25 || rand() < 0.08)) {
          const s = 0.75 + rand() * 0.55;
          const autumn = rand() < 0.14;
          const tint = autumn ? [1.3, 1.0, 0.45] : [0.8 + rand() * 0.2, 0.82 + rand() * 0.2, 0.78 + rand() * 0.2];
          T.birch.add(x, y - 0.15, z, rot, s, tint, 0.8 + rand() * 0.4, 0.8 + rand() * 0.4);
          tree(x, z, 0.22 * s, 4 * s, 8.4 * s, 2 * s, false);
        } else {
          const coast = smoothstep(260, 60, W.coastD[k]);
          const s = (0.5 + rand() * 0.85 + (rand() < 0.1 ? 0.35 : 0)) * (1 + coast * 0.35);
          const v = 0.8 + rand() * 0.35;
          // slender to broad: width varies apart from height
          const w = 0.8 + rand() * 0.45;
          const tint = [v * (1 - coast * 0.12), v * (0.95 + rand() * 0.1), v * (0.9 + rand() * 0.15 + coast * 0.2)];
          T.spruce.add(x, y - 0.2, z, rot, s, tint, w, w * (0.9 + rand() * 0.2));
          tree(x, z, 0.3 * s, 0.4 * s, 12 * s, 2.25 * s * w, true);
        }
      }
    }

    // balsam poplars along the river and round the lakes
    for (let gz = -HALF + 4; gz < HALF - 4; gz += 11) {
      for (let gx = -HALF + 4; gx < HALF - 4; gx += 11) {
        const x = gx + rand() * 11;
        const z = gz + rand() * 11;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st === SURF.ROAD || st === SURF.ROCK || st === SURF.SNOW || st === SURF.ICE || st === SURF.SAND) continue;
        if (W.roadD[k] < ROAD_HALF + 5) continue;
        const y = W.heightAt(x, z);
        if (y > 75) continue;
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0;
        if (rd > rw + 6 && rd < rw + 80) p = 0.42 * (1 - (rd - rw - 6) / 74);
        const ls = lakeSD(x, z);
        if (ls > 6 && ls < 50) p = Math.max(p, 0.25 * (1 - ls / 50));
        if (rand() > p || W.slopeAt(x, z) > 0.35) continue;
        if (water(x, z) || blocked(x, z, 4)) continue;
        const s = 0.8 + rand() * 0.45;
        const g = 0.85 + rand() * 0.3;
        T.poplar.add(x, y - 0.25, z, rand() * Math.PI * 2, s, [g, g * (0.95 + rand() * 0.12), g * 0.9], 0.8 + rand() * 0.45, 0.8 + rand() * 0.45);
        tree(x, z, 0.4 * s, 7 * s, 14.5 * s, 3.8 * s, false);
      }
    }

    // bushes, willows along water and dwarf shrubs on the tundra
    for (let gz = -HALF + 3; gz < HALF - 3; gz += 7) {
      for (let gx = -HALF + 3; gx < HALF - 3; gx += 7) {
        const x = gx + rand() * 7;
        const z = gz + rand() * 7;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st === SURF.ROAD || st === SURF.SNOW || st === SURF.ICE || st === SURF.MUD || st === SURF.SAND) continue;
        if (W.roadD[k] < ROAD_HALF + 2.5) continue;
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0.04;
        if (rd < rw + 30 && rd > rw + 3) p = 0.4;
        if (st === SURF.TUNDRA) p = 0.18;
        if (st === SURF.FOREST) p = 0.12;
        if (st === SURF.ROCK) p = 0.02;
        if (rand() > p) continue;
        if (water(x, z) || blocked(x, z, 2)) continue;
        const y = W.heightAt(x, z);
        let tint;
        if (st === SURF.TUNDRA) tint = rand() < 0.5 ? [0.36, 0.09, 0.035] : [0.24, 0.16, 0.05];
        else if (rand() < 0.12) tint = [0.36, 0.28, 0.07];
        else tint = [0.2 + rand() * 0.06, 0.3 + rand() * 0.08, 0.11 + rand() * 0.04];
        const s = st === SURF.TUNDRA ? 0.45 + rand() * 0.35 : 0.7 + rand() * 0.7;
        T.bush.add(x, y - 0.1, z, rand() * 6.28, s, tint, 1 + rand() * 0.4, 1 + rand() * 0.4);
      }
    }

    // rocks and boulders
    for (let gz = -HALF + 4; gz < HALF - 4; gz += 9) {
      for (let gx = -HALF + 4; gx < HALF - 4; gx += 9) {
        const x = gx + rand() * 9;
        const z = gz + rand() * 9;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (W.roadD[k] < ROAD_HALF + 2) continue;
        const slope = W.slopeAt(x, z);
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0.015 + smoothstep(0.4, 1.2, slope) * 0.25;
        if (st === SURF.TUNDRA) p += 0.06;
        if (st === SURF.GRAVEL && rd < rw + 12) p += 0.2;
        if (st === SURF.SNOW || st === SURF.ICE) p = 0.02;
        if (rand() > p) continue;
        if (blocked(x, z, 2)) continue;
        const y = W.heightAt(x, z);
        const big = rand() < 0.12;
        const s = big ? 1.6 + rand() * 1.8 : 0.35 + rand() * 0.9;
        const g = 0.75 + rand() * 0.3;
        // the stone changes from area to area: cool grey greywacke, warm
        // granite and rust-stained rock (linear tints); some lie as flat
        // slabs (from a hash, so nothing else's place changes)
        const fam = W.n3.noise(x * 0.004 + 11, z * 0.004 - 7);
        const gw = smoothstep(-0.45, -0.05, fam);
        const fe = smoothstep(0.3, 0.6, fam) * 0.8;
        const tint = [
          g * lerp(lerp(0.32, 0.44, gw), 0.46, fe),
          g * lerp(lerp(0.34, 0.41, gw), 0.37, fe),
          g * lerp(lerp(0.33, 0.38, gw), 0.3, fe),
        ];
        const flat = big ? 0.75 + hash2(x * 10, z * 10) * 0.4 : 0.55 + hash2(x * 10, z * 10) * 0.6;
        T.rock.add(x, y - 0.25 * s * flat, z, rand() * 6.28, s * flat, tint, (0.8 + rand() * 0.6) / flat, (0.8 + rand() * 0.6) / flat, 0.25);
        if (s > 0.6) {
          const c = this.colliders.addCircle(x, z, s * 0.85, 'rock');
          // one under water has a top, so a boat floats over it when it lies
          // deep enough on the bottom; on land a rock stops everything
          // (a slab's top is as low as it is flat)
          const w = W.waterAt(x, z);
          const top = y + 0.9 * s * flat;
          if (w && top < w.level) c.top = top;
        }
      }
    }

    // ferns carpet the forest floor
    for (let gz = -HALF + 2; gz < HALF - 2; gz += 3.4) {
      for (let gx = -HALF + 2; gx < HALF - 2; gx += 3.4) {
        const x = gx + rand() * 3.4;
        const z = gz + rand() * 3.4;
        const k = W.cellIndex(x, z);
        const forest = W.forest[k] / 255;
        if (forest < 0.3 || rand() > forest * 0.34) continue;
        if (W.roadD[k] < ROAD_HALF + 2 || water(x, z) || blocked(x, z, 1)) continue;
        const g = 0.8 + rand() * 0.35;
        T.fern.add(x, W.heightAt(x, z) - 0.04, z, rand() * 6.28, 0.75 + rand() * 0.6, [g, g * (0.95 + rand() * 0.1), g * 0.9]);
      }
    }

    // fireweed stands in the meadows, lupine in patches along roads and banks
    for (let gz = -HALF + 2; gz < HALF - 2; gz += 2.8) {
      for (let gx = -HALF + 2; gx < HALF - 2; gx += 2.8) {
        const x = gx + rand() * 2.8;
        const z = gz + rand() * 2.8;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st !== SURF.GRASS && st !== SURF.TUNDRA) continue;
        if (W.roadD[k] < ROAD_HALF + 1.5) continue;
        const flower = W.flower[k] / 255;
        const patch = W.n3.noise(x * 0.025 + 13, z * 0.025 - 7);
        const nearRoad = W.roadD[k] < ROAD_HALF + 14 ? 0.25 : 0;
        const pF = flower * 0.55;
        const pL = patch > 0.3 ? (patch - 0.3) * 0.9 + nearRoad : 0;
        const r = rand();
        if (r < pF) {
          if (water(x, z) || blocked(x, z, 1)) continue;
          const v = 0.85 + rand() * 0.3;
          T.fireweed.add(x, W.heightAt(x, z) - 0.03, z, rand() * 6.28, 0.8 + rand() * 0.5, [v, v, v]);
        } else if (r < pF + pL * 0.35) {
          if (water(x, z) || blocked(x, z, 1)) continue;
          const v = 0.85 + rand() * 0.3;
          T.lupine.add(x, W.heightAt(x, z) - 0.03, z, rand() * 6.28, 0.8 + rand() * 0.5, [v * (0.9 + rand() * 0.2), v, v]);
        }
      }
    }

    // native ground plants by habitat: horsetail on the banks, devil's club
    // and skunk cabbage in wet forest near water, cotton grass on wet flats
    // and tundra, blueberry and Labrador tea on the tundra and forest edges,
    // mushrooms on the forest floor
    for (let gz = -HALF + 2; gz < HALF - 2; gz += 2.6) {
      for (let gx = -HALF + 2; gx < HALF - 2; gx += 2.6) {
        const x = gx + rand() * 2.6;
        const z = gz + rand() * 2.6;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st === SURF.ROAD || st === SURF.ROCK || st === SURF.SNOW || st === SURF.ICE || st === SURF.MUD || st === SURF.SAND) continue;
        if (W.roadD[k] < ROAD_HALF + 1.5) continue;
        const r = rand();
        if (r > 0.25) continue;
        const forest = W.forest[k] / 255;
        const y = W.heightAt(x, z);
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        const ls = lakeSD(x, z);
        const bank = (rd > rw + 0.5 && rd < rw + 12) || (ls > 0.5 && ls < 12);
        const flat = W.slopeAt(x, z) < 0.08;
        const wetFlat = y < 50 && flat;
        const tundra = st === SURF.TUNDRA;
        const nearWater = rd < rw + 120 || ls < 150;
        let type = null;
        if (bank && r < 0.25) type = 'horsetail';
        else if (forest > 0.45 && nearWater && y < 90 && r < 0.055) type = 'devilsClub';
        else if (forest > 0.3 && wetFlat && nearWater && r < 0.085) type = 'skunkCabbage';
        else if ((tundra || wetFlat) && r < (wetFlat ? 0.25 : 0.12) && W.n3.noise(x * 0.03 + 5, z * 0.03 - 2) > 0.0) type = 'cottonGrass';
        else if ((tundra || (forest > 0.1 && forest < 0.55)) && r < 0.12) type = 'blueberry';
        else if ((tundra || (wetFlat && forest > 0.2)) && r < 0.2) type = 'labradorTea';
        else if (forest > 0.5 && r < 0.012) type = 'mushroom';
        if (!type) continue;
        if (water(x, z) || blocked(x, z, 1)) continue;
        const v = 0.85 + rand() * 0.3;
        let tint = [v, v, v];
        if (type === 'blueberry' && tundra && rand() < 0.3) tint = [1.35, 0.72, 0.5];
        const sc = { devilsClub: 0.85 + rand() * 0.5, mushroom: 0.9 + rand() * 0.7, skunkCabbage: 1.2 + rand() * 0.6, cottonGrass: 1.0 + rand() * 0.6, horsetail: 1.1 + rand() * 0.6, labradorTea: 1.1 + rand() * 0.5 }[type] || 0.9 + rand() * 0.45;
        T[type].add(x, y - 0.02, z, rand() * Math.PI * 2, sc, tint);
      }
    }

    // willow and alder thickets along the river and lake shores
    for (let gz = -HALF + 3; gz < HALF - 3; gz += 6) {
      for (let gx = -HALF + 3; gx < HALF - 3; gx += 6) {
        const x = gx + rand() * 6;
        const z = gz + rand() * 6;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st === SURF.ROAD || st === SURF.ROCK || st === SURF.SNOW || st === SURF.ICE || st === SURF.SAND) continue;
        if (W.roadD[k] < ROAD_HALF + 3) continue;
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0;
        if (rd < rw + 26 && rd > rw + 2) p = 0.38 * (1 - (rd - rw - 2) / 24);
        const ls = lakeSD(x, z);
        if (ls > 1 && ls < 20) p = Math.max(p, 0.3 * (1 - ls / 20));
        if (W.heightAt(x, z) > 110) p *= 0.3;
        if (rand() > p) continue;
        if (water(x, z) || blocked(x, z, 2)) continue;
        const g = 0.8 + rand() * 0.3;
        const tint = rand() < 0.4 ? [g * 0.85, g, g * 0.8] : [g, g * 1.02, g * 0.9];
        const sc = 0.8 + rand() * 0.6;
        T.willow.add(x, W.heightAt(x, z) - 0.1, z, rand() * 6.28, sc, tint);
        // its leaves, for what it hides from a camera (as a tree's crown)
        const c = this.colliders.addCircle(x, z, 0.5 * sc, 'shrub');
        c.lo = 0.5 * sc;
        c.hi = 3.6 * sc;
        c.cr = 1.4 * sc;
        c.cone = false;
      }
    }

    // fallen logs and stumps in the forest, bleached driftwood on gravel bars
    // and beaches
    for (let gz = -HALF + 4; gz < HALF - 4; gz += 10) {
      for (let gx = -HALF + 4; gx < HALF - 4; gx += 10) {
        const x = gx + rand() * 10;
        const z = gz + rand() * 10;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (W.roadD[k] < ROAD_HALF + 3) continue;
        const forest = W.forest[k] / 255;
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        const bar = (st === SURF.GRAVEL && rd < rw + 14) || st === SURF.SAND;
        const r = rand();
        if (forest > 0.45 && r < 0.16) {
          if (water(x, z) || blocked(x, z, 3) || W.slopeAt(x, z) > 0.45) continue;
          const v = 0.75 + rand() * 0.35;
          T.log.add(x, W.heightAt(x, z) - 0.06, z, rand() * 6.28, 0.7 + rand() * 0.5, [0.2 * v, 0.15 * v, 0.1 * v]);
        } else if (forest > 0.25 && r < 0.26) {
          if (water(x, z) || blocked(x, z, 2)) continue;
          const v = 0.85 + rand() * 0.3;
          T.stump.add(x, W.heightAt(x, z) - 0.05, z, rand() * 6.28, 0.8 + rand() * 0.5, [v, v, v]);
        } else if (bar && r < 0.2) {
          if (water(x, z) || blocked(x, z, 3)) continue;
          const v = 0.9 + rand() * 0.2;
          T.log.add(x, W.heightAt(x, z) - 0.1, z, rand() * 6.28, 0.5 + rand() * 0.5, [0.74 * v, 0.71 * v, 0.66 * v]);
        }
      }
    }

    // dead snags near water (eagle perches)
    for (let i = 0; i < 1400; i++) {
      const s = rand() * W.river.length;
      const p = W.river.sample(s);
      const side = rand() < 0.5 ? -1 : 1;
      const d = W.riverWidth(s) + 8 + rand() * 30;
      const x = p.x - p.tz * side * d;
      const z = p.z + p.tx * side * d;
      if (rand() > 0.09) continue;
      if (!W.inBounds(x, z, 10) || water(x, z) || blocked(x, z, 3)) continue;
      const k = W.cellIndex(x, z);
      if (W.roadD[k] < ROAD_HALF + 4) continue;
      const y = W.heightAt(x, z);
      const sc = 0.8 + rand() * 0.5;
      const sv = 0.7 + hash2(x * 10, z * 10) * 0.4;
      T.snag.add(x, y - 0.2, z, rand() * 6.28, sc, [sv, sv * 0.97, sv * 0.93]);
      tree(x, z, 0.25 * sc, 0, 9 * sc, 0, false);
      this.snags.push({ x, y: y + 8.6 * sc, z });
    }

    for (const t of Object.values(T)) t.finalize();
  }

  // Rebuild visible instance lists when the camera moved or turned enough.
  // Which instances to draw: everything near the camera and, further out,
  // what is in a wide view ahead. Rebuilt when the camera has moved 7 m or
  // turned about 11 degrees. The rebuild is spread over frames, a few kinds
  // of plant a frame within 2.5 ms, so looking round never stalls a frame
  // (the wide view hides the wait); after a jump, or forced, it is all done
  // at once.
  update(camera, force = false) {
    const pos = camera.position;
    const dir = camera.getWorldDirection(this._dir || (this._dir = new THREE.Vector3()));
    const jump = pos.distanceTo(this.lastPos) > 60;
    const moved = pos.distanceTo(this.lastPos) > 7;
    const turned = dir.dot(this.lastDir) < Math.cos(0.2);
    if (force || jump || moved || turned) {
      this.lastPos.copy(pos);
      this.lastDir.copy(dir);
      const pc = this.projCam;
      pc.fov = Math.min(170, camera.fov + 34);
      pc.aspect = camera.aspect * 1.1;
      pc.near = 0.5;
      pc.far = 1200;
      pc.position.copy(camera.position);
      pc.quaternion.copy(camera.quaternion);
      pc.updateProjectionMatrix();
      pc.updateMatrixWorld(true);
      const m = (this._m || (this._m = new THREE.Matrix4())).multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(m);
      this.snapX = pos.x;
      this.snapZ = pos.z;
      // the kinds still waiting go first, then the rest
      const all = Object.values(this.types);
      const waiting = this.pending || [];
      this.pending = waiting.concat(all.filter((t) => !waiting.includes(t)));
      if (force || jump) force = true;
    }
    if (!this.pending || !this.pending.length) return false;
    const t0 = performance.now();
    while (this.pending.length) {
      this.buildType(this.pending.shift(), this.snapX, this.snapZ);
      if (!force && performance.now() - t0 > 2.5) break;
    }
    return true;
  }

  buildType(t, cx, cz) {
    const lods = t.lods;
    const meshes = t.meshes;
    const counts = new Array(lods.length).fill(0);
    const rm = t.reflect;
    let rc = 0;
    const maxD = t.maxDist * this.distScale;
    const maxD2 = maxD * maxD;
    const i0 = clamp(Math.floor((cx - maxD + HALF) / CELL), 0, GRID - 1);
    const i1 = clamp(Math.floor((cx + maxD + HALF) / CELL), 0, GRID - 1);
    const j0 = clamp(Math.floor((cz - maxD + HALF) / CELL), 0, GRID - 1);
    const j1 = clamp(Math.floor((cz + maxD + HALF) / CELL), 0, GRID - 1);
    const lodD2 = lods.map((l) => (l.maxDist * this.distScale) ** 2);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = t.cells[j * GRID + i];
        if (list.length === 0) continue;
        const ccx = -HALF + (i + 0.5) * CELL;
        const ccz = -HALF + (j + 0.5) * CELL;
        const ddx = ccx - cx;
        const ddz = ccz - cz;
        const cd2 = ddx * ddx + ddz * ddz;
        if (cd2 > (maxD + CELL) ** 2) continue;
        const near = cd2 < 70 * 70;
        if (!near) {
          this.sphere.center.set(ccx, t.y[list[0]] + 8, ccz);
          this.sphere.radius = CELL * 0.75 + 25;
          if (!this.frustum.intersectsSphere(this.sphere)) {
            // out of view, but its trees' shadows may fall into it (a low sun
            // behind you): kept when the reach of the shadows is in view
            const sv = this.shadowVec;
            if (!sv || cd2 > SHADOW_REACH2) continue;
            this.sphere.center.x += sv.x * 0.5;
            this.sphere.center.z += sv.z * 0.5;
            this.sphere.radius += sv.len * 0.5;
            if (!this.frustum.intersectsSphere(this.sphere)) continue;
          }
        }
        for (let q = 0; q < list.length; q++) {
          const idx = list[q];
          const dx = t.x[idx] - cx;
          const dz = t.z[idx] - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > maxD2) continue;
          let lod = 0;
          while (lod < lods.length - 1 && d2 > lodD2[lod]) lod++;
          const mesh = meshes[lod];
          const c = counts[lod];
          if (c >= lods[lod].capacity) continue;
          const arr = mesh.instanceMatrix.array;
          const o = c * 16;
          t.put(mesh, c, idx);
          // (and the candidate's sphere, for the view's cull)
          if (t.culls[lod]) t.bound(t.culls[lod], c, idx);
          counts[lod] = c + 1;
          if (rm && rc < t.reflectCap) {
            rm.instanceMatrix.array.set(arr.subarray(o, o + 16), rc * 16);
            if (rm.instanceColor) {
              const ra = rm.instanceColor.array;
              ra[rc * 3] = t.tint[idx * 3];
              ra[rc * 3 + 1] = t.tint[idx * 3 + 1];
              ra[rc * 3 + 2] = t.tint[idx * 3 + 2];
            }
            rc++;
          }
        }
      }
    }
    if (rm) {
      rm.count = rc;
      rm.instanceMatrix.clearUpdateRanges();
      rm.instanceMatrix.addUpdateRange(0, rc * 16);
      rm.instanceMatrix.needsUpdate = true;
      if (rm.instanceColor) {
        rm.instanceColor.clearUpdateRanges();
        rm.instanceColor.addUpdateRange(0, rc * 3);
        rm.instanceColor.needsUpdate = true;
      }
      this.shown(rm);
    }
    for (let l = 0; l < meshes.length; l++) {
      const mesh = meshes[l];
      mesh.count = counts[l];
      t.candidates[l] = counts[l];
      // (the buffers hold all the candidates again: the view's cull, if on,
      // writes what it keeps of them anew when the view is next drawn)
      if (t.culls[l]) t.culls[l].nk = -1;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, counts[l] * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, counts[l] * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      this.shown(mesh);
      if (this.shadowTwins && t.twins[l]) this.fillTwin(mesh, t.twins[l]);
    }
  }

  // A twin given its level's instances, at the same slots: the matrices
  // just written, in one copy (the instances' full lists stay here, so after
  // a lost graphics context three.js sends them again whole).
  fillTwin(mesh, tw) {
    const n = mesh.count;
    tw.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, n * 16));
    tw.count = n;
    tw.instanceMatrix.clearUpdateRanges();
    tw.instanceMatrix.addUpdateRange(0, n * 16);
    tw.instanceMatrix.needsUpdate = true;
  }

  // A level (or a reflection's copy) with nothing in it is left out of the
  // drawing altogether while the twins are on: three.js sets an instanced
  // draw's shader and sends its uniforms before it finds there is nothing to
  // draw. n: how many it has (for a level, its candidates: with the view's
  // cull on, its count is what the view kept of them the last time).
  shown(mesh, n = mesh.count) {
    mesh.visible = !this.shadowTwins || n > 0;
  }

  // The plants' shadows drawn by twins (on in the game). A level's own model
  // has a vertex for every corner of every triangle (or, in the broadleaf
  // models that share them, for every corner with a normal or colour of its
  // own), and the shadow map shades each apart. Its twin (see
  // ScatterType.makeTwins) draws the same triangles over places kept once
  // (a spruce, a willow or a log keeps a fifth of its vertices, a broadleaf
  // two thirds or more) to the same shadow map, bit for bit; and a level
  // with nothing in it is not drawn at all (see shown).
  // Off, for comparing, the plants cast as before.
  setShadowTwins(on) {
    if (on === this.shadowTwins) return;
    this.shadowTwins = on;
    for (const t of Object.values(this.types)) {
      t.meshes.forEach((mesh, l) => {
        this.shown(mesh, t.candidates[l]);
        // (a level that casts holds all its candidates while the twins are
        // off: the view's cull is off for it, see setCulling)
        if (on && t.twins[l]) this.fillTwin(mesh, t.twins[l]);
      });
      if (t.reflect) this.shown(t.reflect);
    }
    this.setCasting();
  }

  // Which meshes cast: a level that casts does it by its twin while the
  // twins are on, by itself otherwise. A twin that casts nothing is hidden
  // (the view then does not go past it, nor send its instances).
  setCasting() {
    const on = this.shadowTwins;
    for (const t of Object.values(this.types)) {
      t.meshes.forEach((mesh, l) => {
        const tw = t.twins[l];
        mesh.castShadow = t.casts[l] && !(on && tw);
        if (tw) {
          tw.castShadow = t.casts[l];
          tw.visible = on && t.casts[l];
        }
      });
    }
    this.setCulling();
  }

  // The view's own cull of the plants (on in the game). buildType lists for
  // each level every instance within 70 m all round and, further out, those
  // in a view much wider than the camera's, kept for a few metres' walk or a
  // few degrees' turn, and three.js draws the whole list: in a portrait view
  // three quarters and more of the plants' vertices are worked out for
  // instances wholly off the screen. With the cull, each time the view is
  // drawn every level keeps only the instances whose spheres meet it (see
  // ScatterType.cullView), but the far trees' (see ScatterType.isFar). What
  // it leaves out could have made no pixel, so the picture is the same. It
  // is the view's alone: the levels' shadows are drawn by their twins from
  // the whole lists (so it is off for a level that casts its own shadow, as
  // with the twins off), and the reflection draws copies of its own.
  // Off, for comparing, the levels draw their whole lists as before.
  setViewCull(on) {
    if (on === this.viewCull) return;
    this.viewCull = on;
    this.setCulling();
  }

  // Which levels the view's cull is on for: with it on, those that do not
  // cast their own shadow (the shadow map would go past them for each of its
  // cascades, with that cascade's frustum). A level turned off gets all its
  // candidates back in its buffers.
  setCulling() {
    for (const t of Object.values(this.types)) {
      t.meshes.forEach((mesh, l) => {
        const cu = t.culls[l];
        const on = this.viewCull && !mesh.castShadow;
        if (!cu || on === cu.on) return;
        cu.on = on;
        cu.nk = -1;
        mesh.frustumCulled = on;
        if (!on) t.uncull(l);
      });
    }
  }

  // Distant tree LODs cast shadows into the far shadow cascade.
  setFarShadows(on) {
    for (const n of FAR_SHADOWS) {
      const t = this.types[n];
      t.casts[t.casts.length - 1] = on;
    }
    this.setCasting();
  }

  // Reflection stand-ins: every instance of the named types that is drawn at
  // any detail level, drawn again with the cheapest model, seen only by
  // cameras that render `layer` (the water reflections).
  enableReflections(layer, names) {
    for (const n of names) {
      const t = this.types[n];
      const last = t.lods[t.lods.length - 1];
      const cap = t.lods.reduce((a, l) => a + l.capacity, 0);
      const m = new THREE.InstancedMesh(last.geo, reflectionMaterial(last.material), cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.layers.set(layer);
      if (t.opts.tint) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      m.name = `${n}-reflect`;
      t.reflect = m;
      t.reflectCap = cap;
      this.shown(m);
      this.group.add(m);
    }
    this.lastPos.set(1e9, 0, 0);
  }

  // Each kind's instances in all and, for each of its levels, its candidates
  // (what buildType listed) and what the view drew of them the last time.
  stats() {
    const out = {};
    for (const [k, t] of Object.entries(this.types)) out[k] = { total: t.count, candidates: t.candidates.slice(), drawn: t.meshes.map((m) => m.count) };
    return out;
  }
}
