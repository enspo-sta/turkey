// Things floating on the water. Driftwood logs, spruce branches and leafy
// alder twigs ride the river current past the player, turning slowly as they
// go; fireweed petals and fallen leaves float on the rivers and lakes around
// the player, following the current or drifting with the wind; yellow pond
// lilies and their pads cover the shallows of Moose Lake; small ice floes
// drift on Glacier Lake. Everything bobs gently on the surface.
import * as THREE from 'three';
import { ModelBuilder, jitterGeometry } from '../util/builder.js';
import { mulberry32, clamp } from '../util/math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

const DRIFT_RANGE = 250; // river drift runs while the player is this close to the river
const FLAKE_RADIUS = 30; // petals and leaves float within this distance of the player

// ------------------------------------------------------------ geometry

// A bleached driftwood log along +z, darker and wet towards the waterline,
// with broken branch stubs and (optionally) a root wad at the back end.
function driftwoodGeometry(len, radius, roots, seed) {
  const rand = mulberry32(seed);
  const b = new ModelBuilder();
  const trunk = jitterGeometry(new THREE.CylinderGeometry(radius * 0.8, radius, len, 9, 4), radius * 0.16, rand);
  b.add(trunk, { rot: [Math.PI / 2, 0, 0], color: 0xaba59a, gradient: 0.5, jitter: 0.1 });
  // broken-off branch stubs, mostly sticking up and sideways
  for (let i = 0; i < 5; i++) {
    const z = (rand() - 0.5) * len * 0.8;
    const a = rand() * Math.PI - Math.PI / 2 + (rand() < 0.5 ? 0 : Math.PI);
    const r = radius * 0.9;
    const x0 = Math.sin(a) * r;
    const y0 = Math.cos(a) * r;
    const l = 0.15 + rand() * 0.45;
    b.beam([x0, y0, z], [x0 + Math.sin(a) * l, y0 + Math.cos(a) * l, z + (rand() - 0.2) * l * 0.6], radius * 0.22, 5, { r2: radius * 0.1, color: 0x9a9488, gradient: 0.3 });
  }
  if (roots) {
    // a flared root plate with gnarled roots
    const zb = -len / 2;
    b.add(jitterGeometry(new THREE.CylinderGeometry(radius * 1.05, radius * 2.2, radius * 1.6, 9, 1), radius * 0.2, rand), {
      pos: [0, 0, zb - radius * 0.6],
      rot: [Math.PI / 2, 0, 0],
      color: 0x8e877a,
      gradient: 0.45,
    });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
      const r0 = radius * 1.6;
      const l = 0.5 + rand() * 0.9;
      const x0 = Math.cos(a) * r0;
      const y0 = Math.sin(a) * r0;
      b.beam([x0, y0, zb - radius * 1.2], [x0 + Math.cos(a) * l, y0 + Math.sin(a) * l * 0.8, zb - radius * 1.2 - rand() * 0.5], radius * 0.28, 5, {
        r2: radius * 0.06,
        color: 0x7e776a,
        gradient: 0.3,
      });
    }
  }
  return b.build();
}

// Joins non-indexed geometries that all have position, normal and colour.
function mergeGeometries(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// A spruce branch lying flat: a thin stick with side shoots, each shoot
// bristling with rows of short needles.
function spruceBranchGeometry(seed) {
  const rand = mulberry32(seed);
  const b = new ModelBuilder();
  const len = 1.5;
  b.beam([0, 0, -len / 2], [0, 0.02, len / 2], 0.025, 5, { r2: 0.008, color: 0x5a4632 });
  const pos = [];
  const col = [];
  const greens = [new THREE.Color(0x2f5a32), new THREE.Color(0x3a6a38), new THREE.Color(0x284e2c), new THREE.Color(0x46723c)];
  const under = new THREE.Color(0x1c3a22);
  // needles along a shoot from (x0, z0) in direction (dx, dz)
  const shoot = (x0, z0, dx, dz, l) => {
    const px = -dz;
    const pz = dx;
    // a dark spray underneath gives the shoot its full, dense outline
    const w = 0.045;
    const q = (a, b, c) => {
      pos.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) col.push(under.r, under.g, under.b);
    };
    const A = [x0 + px * w * 0.4, 0.016, z0 + pz * w * 0.4];
    const B = [x0 - px * w * 0.4, 0.016, z0 - pz * w * 0.4];
    const C = [x0 + dx * l * 0.5 + px * w, 0.016, z0 + dz * l * 0.5 + pz * w];
    const D = [x0 + dx * l * 0.5 - px * w, 0.016, z0 + dz * l * 0.5 - pz * w];
    const E = [x0 + dx * l * 1.05, 0.016, z0 + dz * l * 1.05];
    q(A, B, D);
    q(A, D, C);
    q(C, D, E);
    const n = Math.max(5, Math.round(l / 0.018));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      const cx = x0 + dx * l * t;
      const cz = z0 + dz * l * t;
      const nl = 0.05 * (1 - t * 0.4);
      for (const side of [-1, 1]) {
        const c = greens[Math.floor(rand() * greens.length)];
        const tipx = cx + (px * side * 0.85 + dx * 0.5) * nl;
        const tipz = cz + (pz * side * 0.85 + dz * 0.5) * nl;
        const y = 0.02 + rand() * 0.012;
        pos.push(cx - dx * 0.011, y, cz - dz * 0.011, cx + dx * 0.011, y, cz + dz * 0.011, tipx, y + 0.008, tipz);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
      // needles standing up along the top of the shoot
      const c = greens[Math.floor(rand() * greens.length)];
      const tilt = (rand() - 0.5) * 0.03;
      pos.push(cx - dx * 0.01, 0.022, cz - dz * 0.01, cx + dx * 0.01, 0.022, cz + dz * 0.01, cx + dx * 0.012 + px * tilt, 0.058, cz + dz * 0.012 + pz * tilt);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    b.beam([x0, 0.018, z0], [x0 + dx * l, 0.02, z0 + dz * l], 0.006, 3, { r2: 0.003, color: 0x6a5238 });
  };
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const z = -len / 2 + 0.12 + t * (len - 0.25);
    const side = i % 2 ? 1 : -1;
    const l = 0.16 + (1 - t) * 0.3;
    const a = side * (0.75 + rand() * 0.25);
    shoot(0, z, Math.sin(a), Math.cos(a), l);
  }
  shoot(0, len / 2 - 0.02, 0, 1, 0.3);
  shoot(0, -len / 2 + 0.05, 0, 1, len - 0.1);
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nn = new Float32Array(pos.length);
  for (let i = 0; i < nn.length; i += 3) nn[i + 1] = 1;
  ng.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return mergeGeometries([b.build(), ng]);
}

// A leafy alder or birch twig: a forked stick with small leaves, a few of
// them already turning yellow.
function leafyTwigGeometry(seed) {
  const rand = mulberry32(seed);
  const b = new ModelBuilder();
  const len = 1.0;
  b.beam([0, 0, -len / 2], [0, 0.01, len / 2], 0.018, 5, { r2: 0.006, color: 0x6a5a48 });
  const pos = [];
  const col = [];
  const leaf = (x, z, a, s, c) => {
    // a pointed oval leaf as four triangles, lying almost flat
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const P = (lx, lz, ly = 0) => [x + lx * ca + lz * sa, 0.012 + ly, z - lx * sa + lz * ca];
    const tip = P(0, s * 1.0, 0.004);
    const base = P(0, 0);
    const l1 = P(-s * 0.32, s * 0.45, 0.006);
    const r1 = P(s * 0.32, s * 0.45, 0.006);
    const mid = P(0, s * 0.45, 0.001);
    for (const tr of [
      [base, l1, mid],
      [base, mid, r1],
      [mid, l1, tip],
      [mid, tip, r1],
    ]) {
      for (const v of tr) {
        pos.push(...v);
        col.push(c.r, c.g, c.b);
      }
    }
  };
  const greens = [new THREE.Color(0x4a7a2e), new THREE.Color(0x5a8a34), new THREE.Color(0x3e6a28), new THREE.Color(0xb8a030)];
  for (let i = 0; i < 3; i++) {
    const z0 = -len / 2 + 0.25 + i * 0.28;
    const side = i % 2 ? 1 : -1;
    const tx = side * (0.18 + rand() * 0.1);
    const tz = z0 + 0.22;
    b.beam([0, 0.005, z0], [tx, 0.008, tz], 0.01, 4, { r2: 0.004, color: 0x6a5a48 });
    for (let k = 0; k < 4; k++) {
      const t = (k + 1) / 4;
      leaf(tx * t, z0 + (tz - z0) * t, Math.atan2(tx, tz - z0) + (rand() - 0.5) * 1.6, 0.05 + rand() * 0.03, greens[Math.floor(rand() * greens.length)]);
    }
  }
  for (let k = 0; k < 5; k++) {
    const z = len / 2 - 0.05 - k * 0.09;
    leaf(0, z, (k % 2 ? 1 : -1) * (0.6 + rand() * 0.6), 0.055 + rand() * 0.03, greens[Math.floor(rand() * 3)]);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lg.computeVertexNormals();
  return mergeGeometries([b.build(), lg]);
}

// A fallen fireweed stalk: a reddish stem with narrow leaves and the
// magenta flower spike at its tip, buds at the very end.
function fireweedStalkGeometry(seed) {
  const rand = mulberry32(seed);
  const b = new ModelBuilder();
  const len = 0.95;
  b.beam([0, 0, -len / 2], [0, 0.015, len / 2], 0.009, 5, { r2: 0.005, color: 0x7a4a3a });
  const pos = [];
  const col = [];
  const tri = (a, c1, c2, c) => {
    pos.push(...a, ...c1, ...c2);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const leafC = [new THREE.Color(0x4f7a34), new THREE.Color(0x5a8238), new THREE.Color(0x6a7a30)];
  // narrow willow-like leaves along the lower two thirds
  for (let i = 0; i < 14; i++) {
    const z = -len / 2 + 0.05 + (i / 13) * len * 0.62;
    const side = i % 2 ? 1 : -1;
    const a = side * (0.5 + rand() * 0.5);
    const l = 0.07 + rand() * 0.05;
    const w = 0.012;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const P = (lx, lz, ly) => [lx * ca + lz * sa, 0.01 + ly, z - lx * sa + lz * ca];
    const c = leafC[Math.floor(rand() * leafC.length)];
    tri(P(0, 0, 0), P(-w, l * 0.45, 0.003), P(0, l, 0.004), c);
    tri(P(0, 0, 0), P(0, l, 0.004), P(w, l * 0.45, 0.003), c);
  }
  // flowers: four rounded petals each, opening from the bottom of the spike up
  const pink = [new THREE.Color(0xd8428a), new THREE.Color(0xe0569a), new THREE.Color(0xc8327a)];
  for (let i = 0; i < 9; i++) {
    const z = len * 0.15 + (i / 8) * len * 0.26;
    const side = (i % 3) - 1;
    const cx = side * 0.02;
    const r = 0.018 - i * 0.0008;
    const c = pink[Math.floor(rand() * pink.length)];
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + rand() * 0.3;
      const a1 = a0 + 0.9;
      tri([cx, 0.02, z], [cx + Math.cos(a0) * r, 0.022, z + Math.sin(a0) * r], [cx + Math.cos(a1) * r, 0.022, z + Math.sin(a1) * r], c);
    }
  }
  // buds at the tip
  b.cone(0.012, 0.09, 5, { pos: [0, 0.018, len / 2 + 0.03], rot: [Math.PI / 2, 0, 0], color: 0x9a3a6a, jitter: 0.1 });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  fg.computeVertexNormals();
  // leaves and petals are seen from above; point every normal up
  const fn = fg.attributes.normal;
  for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
  return mergeGeometries([b.build(), fg]);
}

// A floating pondweed leaf: a glossy oval with a pointed tip.
function pondweedGeometry() {
  const pos = [0, 0, -0.05, -0.02, 0, -0.02, 0.02, 0, -0.02, -0.02, 0, -0.02, -0.018, 0, 0.025, 0.02, 0, -0.02, 0.02, 0, -0.02, -0.018, 0, 0.025, 0.018, 0, 0.025, -0.018, 0, 0.025, 0, 0, 0.055, 0.018, 0, 0.025];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  const c = new THREE.Color(0x6f8a38);
  const col = [];
  for (let i = 0; i < pos.length / 3; i++) col.push(c.r, c.g, c.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A petal or small leaf: a pointed oval lying on the surface.
function flakeGeometry() {
  const pos = [0, 0, -0.03, -0.017, 0.002, 0.0, 0.0, 0.001, 0.0, 0, 0, -0.03, 0.0, 0.001, 0.0, 0.017, 0.002, 0.0, -0.017, 0.002, 0.0, 0, 0, 0.03, 0.0, 0.001, 0.0, 0.0, 0.001, 0.0, 0, 0, 0.03, 0.017, 0.002, 0.0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
  return g;
}

// A yellow pond-lily pad: a slightly cupped disc with the typical notch.
function lilyPadGeometry() {
  const pos = [];
  const col = [];
  const seg = 16;
  const notch = 0.22;
  const cIn = new THREE.Color(0x86ac50);
  const cOut = new THREE.Color(0x6a9640);
  for (let i = 0; i < seg; i++) {
    const a0 = notch + (i / seg) * (Math.PI * 2 - notch * 2);
    const a1 = notch + ((i + 1) / seg) * (Math.PI * 2 - notch * 2);
    const r = 0.16;
    pos.push(0, 0.0, 0, Math.cos(a0) * r, 0.012, Math.sin(a0) * r, Math.cos(a1) * r, 0.012, Math.sin(a1) * r);
    col.push(cIn.r, cIn.g, cIn.b, cOut.r, cOut.g, cOut.b, cOut.r, cOut.g, cOut.b);
  }
  // the fan winds clockwise seen from above; flip it so the top faces up
  for (let i = 0; i < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = pos[i + 3 + k];
      pos[i + 3 + k] = pos[i + 6 + k];
      pos[i + 6 + k] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// A yellow pond-lily flower (Nuphar): a cup of thick yellow sepals round a
// broad green-yellow stigma disc, standing just above the water.
function lilyFlowerGeometry() {
  const b = new ModelBuilder();
  const n = 6;
  for (let i = 0; i < n; i++) {
    // a thick rounded sepal leaning outwards, thin across the cup
    const a = (i / n) * Math.PI * 2;
    b.add(new THREE.SphereGeometry(0.03, 5, 4), {
      pos: [Math.cos(a) * 0.022, 0.028, Math.sin(a) * 0.022],
      rot: [0.5, Math.PI / 2 - a, 0],
      order: 'YXZ',
      scale: [0.55, 1, 0.3],
      color: 0xf0c526,
      jitter: 0.08,
      smooth: true,
    });
  }
  // stamens ring and the stigma disc
  b.cyl(0.02, 0.022, 0.02, 8, { pos: [0, 0.036, 0], color: 0x9a3a18, jitter: 0.05 });
  b.cyl(0.017, 0.015, 0.012, 8, { pos: [0, 0.05, 0], color: 0xc2b43a, jitter: 0.04 });
  // the stalk top just above the water
  b.cyl(0.006, 0.006, 0.03, 4, { pos: [0, 0.01, 0], color: 0x5a7a2a });
  return b.build();
}

// A small ice floe: a flattened faceted lump, white on top and blue below.
function floeGeometry(seed) {
  const rand = mulberry32(seed);
  const g = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, rand);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * 0.42);
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xeef6fa);
  const side = new THREE.Color(0x9fd0e8);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(side).lerp(top, clamp(pos.getY(i) * 3 + 0.35, 0, 1));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------ system

const FLAKE_COLORS = [
  [0xd8428a, 5], // fireweed petals
  [0xe27aaa, 3],
  [0xd9b83a, 3], // yellowing birch and willow leaves
  [0x6f9a3a, 3], // green leaves
  [0x8a6a3c, 2], // brown leaves
  [0xf2efe4, 2], // cottonwood fluff clumps
];

export class Floaters {
  constructor(game) {
    this.game = game;
    const W = game.world;
    this.world = W;
    this.group = new THREE.Group();
    this.group.name = 'floaters';
    this.time = 0;
    this.rand = mulberry32(4711);
    const mat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, ...o });

    // river drift: logs, poles, spruce branches, leafy twigs and fireweed
    this.driftKinds = [
      { name: 'drift-log', geo: driftwoodGeometry(3.6, 0.2, true, 11), count: 9, sink: 0.12, speed: 0.8, shadow: true },
      { name: 'drift-pole', geo: driftwoodGeometry(2.6, 0.13, false, 12), count: 11, sink: 0.07, speed: 0.85, shadow: true },
      { name: 'drift-spruce', geo: spruceBranchGeometry(13), count: 14, sink: 0.02, speed: 0.92, shadow: false },
      { name: 'drift-twig', geo: leafyTwigGeometry(14), count: 14, sink: 0.01, speed: 0.95, shadow: false },
      { name: 'drift-fireweed', geo: fireweedStalkGeometry(15), count: 12, sink: 0.008, speed: 0.97, shadow: false },
    ];
    this.drifters = [];
    for (const K of this.driftKinds) {
      const mesh = new THREE.InstancedMesh(K.geo, mat({ roughness: 0.78, side: K.shadow ? THREE.FrontSide : THREE.DoubleSide }), K.count);
      mesh.name = K.name;
      mesh.castShadow = K.shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < K.count; i++) {
        mesh.setMatrixAt(i, _zero);
        const v = 0.85 + this.rand() * 0.3;
        mesh.setColorAt(i, new THREE.Color(v, v * (0.97 + this.rand() * 0.05), v * (0.94 + this.rand() * 0.06)));
        this.drifters.push({ K, mesh, slot: i, alive: false, dying: false, fade: 0, x: 0, z: 0, y: 0, yaw: 0, spin: 0, ph: this.rand() * 6.28, scale: 1, level: 0, fx: 0, fz: 0, s: 0, t: 0 });
      }
      K.mesh = mesh;
      K.alive = 0;
      this.group.add(mesh);
    }
    // A kind of drift with none of it on the river (away from the river: all
    // of them) is left out of every drawing, the view's and the shadow map's,
    // instead of drawn as its slots at no size, every vertex shaded and come
    // to nothing: three.js sets an instanced draw's shader and sends its
    // uniforms even when there is nothing to draw. On in the game; off, for
    // comparing, as before (with the plants' shadow twins, whose switch this
    // goes with: see Scatter.setShadowTwins).
    this.skipEmpty = true;
    for (const K of this.driftKinds) this.showDrift(K);
    this.riverS = 0;
    this.riverD = 1e9;
    this.riverT = 0;

    // petals and leaves around the player
    this.flakeCount = 140;
    const fm = new THREE.InstancedMesh(flakeGeometry(), mat({ side: THREE.DoubleSide, roughness: 0.7 }), this.flakeCount);
    fm.name = 'floating-petals';
    fm.frustumCulled = false;
    fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const total = FLAKE_COLORS.reduce((a, c) => a + c[1], 0);
    this.flakes = [];
    for (let i = 0; i < this.flakeCount; i++) {
      let r = this.rand() * total;
      let hex = FLAKE_COLORS[0][0];
      for (const [h, w] of FLAKE_COLORS) {
        r -= w;
        if (r <= 0) {
          hex = h;
          break;
        }
      }
      const c = new THREE.Color(hex).multiplyScalar(0.85 + this.rand() * 0.3);
      fm.setColorAt(i, c);
      fm.setMatrixAt(i, _zero);
      const fluff = hex === 0xf2efe4;
      this.flakes.push({ alive: false, dying: false, fade: 0, x: 0, z: 0, level: 0, fx: 0, fz: 0, yaw: this.rand() * 6.28, spin: (this.rand() - 0.5) * 0.4, ph: this.rand() * 6.28, scale: fluff ? 1.0 + this.rand() * 0.8 : 0.9 + this.rand() * 0.9, t: this.rand() * 0.4, lake: false });
    }
    this.flakeMesh = fm;
    this.group.add(fm);

    // pond lilies and floating pondweed in the shallows of Moose Lake
    this.buildLilies(mat);
    this.buildPondweed(mat);
    // ice floes on Glacier Lake
    this.buildFloes(mat);
  }

  buildLilies(mat) {
    const W = this.world;
    const lake = W.lakes.find((l) => l.tint !== 'glacial');
    const pads = [];
    const flowers = [];
    if (lake) {
      const rand = mulberry32(2024);
      const ok = (x, z) => {
        const w = W.waterAt(x, z);
        return w && w.kind === lake.id && w.depth > 0.2 && w.depth < 1.4;
      };
      let clusters = 0;
      for (let tries = 0; tries < 6000 && clusters < 60; tries++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * lake.r * 1.3;
        const cx = lake.x + Math.cos(a) * d;
        const cz = lake.z + Math.sin(a) * d;
        if (!ok(cx, cz)) continue;
        clusters++;
        const n = 10 + Math.floor(rand() * 30);
        const spread = 2 + rand() * 4.5;
        for (let i = 0; i < n; i++) {
          const pa = rand() * Math.PI * 2;
          const pd = Math.sqrt(rand()) * spread;
          const x = cx + Math.cos(pa) * pd;
          const z = cz + Math.sin(pa) * pd;
          if (!ok(x, z)) continue;
          // pads do not overlap much
          let crowded = false;
          for (let k = pads.length - 1; k >= 0 && k > pads.length - 40; k--) {
            const p = pads[k];
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < (0.2 * (p.s + 1)) ** 2) {
              crowded = true;
              break;
            }
          }
          if (crowded) continue;
          const s = 0.7 + rand() * 1.0;
          pads.push({ x, z, s, yaw: rand() * Math.PI * 2, old: rand() < 0.15 });
          if (rand() < 0.13) {
            const fa = rand() * Math.PI * 2;
            flowers.push({ x: x + Math.cos(fa) * 0.12 * s, z: z + Math.sin(fa) * 0.12 * s, s: 0.9 + rand() * 0.5, yaw: rand() * 6.28 });
          }
        }
      }
    }
    const level = lake ? lake.level : 0;
    // glossy pads catch the sky like the water around them
    const padMesh = new THREE.InstancedMesh(lilyPadGeometry(), mat({ roughness: 0.32 }), Math.max(1, pads.length));
    padMesh.name = 'lily-pads';
    padMesh.receiveShadow = true;
    const c = new THREE.Color();
    pads.forEach((p, i) => {
      _e.set(0, p.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(p.x, level + 0.004, p.z);
      _s.set(p.s, 1, p.s);
      padMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      if (p.old) c.setRGB(1.3, 0.95, 0.5);
      else c.setRGB(0.88 + ((i * 7) % 5) * 0.05, 0.92 + ((i * 3) % 4) * 0.04, 0.85 + ((i * 5) % 3) * 0.06);
      padMesh.setColorAt(i, c);
    });
    padMesh.count = pads.length;
    padMesh.computeBoundingSphere();
    this.group.add(padMesh);
    this.padMesh = padMesh;
    const flowerMesh = new THREE.InstancedMesh(lilyFlowerGeometry(), mat({ roughness: 0.55 }), Math.max(1, flowers.length));
    flowerMesh.name = 'lily-flowers';
    flowerMesh.castShadow = false;
    flowers.forEach((f, i) => {
      _e.set(0, f.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(f.x, level + 0.008, f.z);
      _s.setScalar(f.s);
      flowerMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    flowerMesh.count = flowers.length;
    flowerMesh.computeBoundingSphere();
    this.group.add(flowerMesh);
    this.flowerMesh = flowerMesh;
    this.lilyCount = pads.length;
    this.lilyFlowerCount = flowers.length;
  }

  buildPondweed(mat) {
    const W = this.world;
    const lake = W.lakes.find((l) => l.tint !== 'glacial');
    const leaves = [];
    if (lake) {
      const rand = mulberry32(3033);
      let beds = 0;
      for (let tries = 0; tries < 5000 && beds < 70; tries++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * lake.r * 1.3;
        const cx = lake.x + Math.cos(a) * d;
        const cz = lake.z + Math.sin(a) * d;
        const w0 = W.waterAt(cx, cz);
        if (!w0 || w0.kind !== lake.id || w0.depth < 0.3 || w0.depth > 2.2) continue;
        beds++;
        const n = 15 + Math.floor(rand() * 35);
        const spread = 1.5 + rand() * 3;
        for (let i = 0; i < n; i++) {
          const pa = rand() * Math.PI * 2;
          const pd = Math.sqrt(rand()) * spread;
          const x = cx + Math.cos(pa) * pd;
          const z = cz + Math.sin(pa) * pd;
          const w = W.waterAt(x, z);
          if (!w || w.kind !== lake.id || w.depth < 0.25) continue;
          leaves.push({ x, z, yaw: rand() * Math.PI * 2, s: 0.8 + rand() * 0.7, c: rand() });
        }
      }
    }
    const mesh = new THREE.InstancedMesh(pondweedGeometry(), mat({ roughness: 0.3, side: THREE.DoubleSide }), Math.max(1, leaves.length));
    mesh.name = 'pondweed';
    mesh.receiveShadow = true;
    const level = lake ? lake.level : 0;
    const c = new THREE.Color();
    leaves.forEach((l, i) => {
      _e.set(0, l.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(l.x, level + 0.003, l.z);
      _s.setScalar(l.s);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      // olive to bronze, a few reddish
      if (l.c < 0.15) c.setRGB(1.35, 0.8, 0.55);
      else c.setRGB(0.85 + l.c * 0.3, 0.9 + l.c * 0.15, 0.8);
      mesh.setColorAt(i, c);
    });
    mesh.count = leaves.length;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.pondweedMesh = mesh;
    this.pondweedCount = leaves.length;
  }

  buildFloes(mat) {
    const W = this.world;
    const lake = W.lakes.find((l) => l.tint === 'glacial');
    this.floes = [];
    this.glacierLake = lake;
    if (!lake) return;
    const rand = mulberry32(77);
    const n = 16;
    const mesh = new THREE.InstancedMesh(floeGeometry(5), mat({ roughness: 0.25 }), n);
    mesh.name = 'ice-floes';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      let x = lake.x;
      let z = lake.z;
      for (let k = 0; k < 40; k++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * lake.r * 0.9;
        x = lake.x + Math.cos(a) * d;
        z = lake.z + Math.sin(a) * d;
        const w = W.waterAt(x, z);
        if (w && w.kind === lake.id && w.depth > 2.5) break;
      }
      const size = 0.7 + Math.pow(rand(), 2) * 2.2;
      this.floes.push({ x, z, yaw: rand() * 6.28, spin: (rand() - 0.5) * 0.03, size, sx: size * (0.8 + rand() * 0.5), sz: size * (0.8 + rand() * 0.5), ph: rand() * 6.28 });
      mesh.setMatrixAt(i, _zero);
    }
    this.floeMesh = mesh;
    this.group.add(mesh);
  }

  // The river surface right at (x, z): the level table is keyed by distance
  // along the river, and waterAt only knows it to the nearest grid point.
  riverLevelAt(x, z, s) {
    const W = this.world;
    const c = W.river.sample(s);
    return W.riverLevel(s + (x - c.x) * c.tx + (z - c.z) * c.tz);
  }

  // Where the river is relative to the player: distance and arc length.
  locateRiver(px, pz) {
    const r = this.world.river.nearest(px, pz);
    // a long jump along the river (fast travel) fills it afresh around you
    if (Math.abs(r.s - this.riverS) > 150) this.filled = false;
    this.riverS = r.s;
    this.riverD = r.d;
  }

  spawnDrifter(d, initial) {
    const W = this.world;
    const R = this.rand;
    const fs = W.fallsS;
    const sp = this.riverS;
    for (let tries = 0; tries < 6; tries++) {
      // mostly upstream of the player so things come floating by
      let s = initial ? sp - 120 + R() * 180 : sp - 35 - R() * 110;
      if (fs > 0) {
        if (sp > fs + 10) s = Math.max(s, fs + 14 + R() * 20);
        else s = Math.min(s, fs - 30 - R() * 30);
      }
      s = clamp(s, 5, W.river.length - 20);
      const p = W.river.sample(s);
      const u = (R() * 2 - 1) * 0.8;
      const half = W.riverWidth(s) * 0.5;
      const x = p.x - p.tz * u * half;
      const z = p.z + p.tx * u * half;
      const w = W.waterAt(x, z);
      if (!w || w.kind !== 'river' || w.depth < d.K.sink * 3 + 0.25) continue;
      d.alive = true;
      d.dying = false;
      d.fade = initial ? 1 : 0;
      d.x = x;
      d.z = z;
      d.s = w.s;
      d.level = this.riverLevelAt(x, z, w.s);
      d.fx = w.flowX;
      d.fz = w.flowZ;
      d.yaw = Math.atan2(p.tx, p.tz) + (R() - 0.5) * 2.2;
      d.spin = (R() - 0.5) * 0.25;
      d.scale = 0.8 + R() * 0.45;
      d.t = R() * 0.3;
      return true;
    }
    return false;
  }

  spawnFlake(f, px, pz) {
    const W = this.world;
    const R = this.rand;
    const a = R() * Math.PI * 2;
    const d = 2 + Math.sqrt(R()) * (FLAKE_RADIUS - 2);
    const x = px + Math.cos(a) * d;
    const z = pz + Math.sin(a) * d;
    const w = W.waterAt(x, z);
    if (!w || w.kind === 'ocean' || w.depth < 0.05) return false;
    if (this.glacierLake && w.kind === this.glacierLake.id) return false;
    f.alive = true;
    f.dying = false;
    f.fade = 0;
    f.x = x;
    f.z = z;
    f.level = w.kind === 'river' ? this.riverLevelAt(x, z, w.s) : w.level;
    f.s = w.s;
    f.fx = w.flowX;
    f.fz = w.flowZ;
    f.lake = w.kind !== 'river';
    f.t = R() * 0.4;
    return true;
  }

  // A kind of drift drawn with all its slots while any of it is on the
  // river; with none, none drawn and no draw made (see skipEmpty).
  showDrift(K) {
    const on = !this.skipEmpty || K.alive > 0;
    K.mesh.count = on ? K.count : 0;
    K.mesh.visible = on;
  }

  setSkipEmpty(on) {
    this.skipEmpty = on;
    for (const K of this.driftKinds) this.showDrift(K);
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const t = this.time;
    const W = this.world;
    const focus = g.focus || g.camera.position;
    const px = focus.x;
    const pz = focus.z;

    // --- river drift
    this.riverT -= dt;
    if (this.riverT <= 0) {
      this.riverT = 0.5;
      this.locateRiver(px, pz);
    }
    const near = this.riverD < DRIFT_RANGE;
    if (!near) this.filled = false;
    const fs = W.fallsS;
    for (const K of this.driftKinds) {
      K.dirty = false;
      K.alive = 0;
    }
    // top up a few a frame, but fill the whole river at once on arrival
    let spawns = this.filled ? 3 : 1e9;
    for (const d of this.drifters) {
      if (!near) {
        if (d.alive) {
          d.alive = false;
          d.mesh.setMatrixAt(d.slot, _zero);
          d.K.dirty = true;
        }
        continue;
      }
      if (!d.alive) {
        if (spawns <= 0) continue;
        spawns--;
        if (!this.spawnDrifter(d, !this.filled)) continue;
      }
      d.t -= dt;
      if (d.t <= 0) {
        d.t = 0.3;
        const w = W.waterAt(d.x, d.z);
        if (!w || w.kind !== 'river') d.dying = true;
        else {
          d.s = w.s;
          d.level = w.level;
          d.fx = w.flowX;
          d.fz = w.flowZ;
          // in the shallows: ease back out towards the middle of the river
          d.shallow = w.depth < d.K.sink * 2 + 0.25;
          if (d.shallow) {
            const c = W.river.sample(d.s);
            const dx = c.x - d.x;
            const dz = c.z - d.z;
            const l = Math.hypot(dx, dz) || 1;
            d.nx = dx / l;
            d.nz = dz / l;
          }
        }
      }
      const past = d.s - this.riverS;
      if (past > 150 || past < -200 || (fs > 0 && Math.abs(d.s - fs) < 10)) d.dying = true;
      // grow in when spawned, shrink away when leaving
      d.fade = d.dying ? d.fade - dt * 1.2 : Math.min(1, d.fade + dt * 0.6);
      if (d.fade <= 0 && d.dying) {
        d.alive = false;
        d.mesh.setMatrixAt(d.slot, _zero);
        d.K.dirty = true;
        continue;
      }
      const k = d.K.speed;
      d.x += d.fx * k * dt;
      d.z += d.fz * k * dt;
      d.level = this.riverLevelAt(d.x, d.z, d.s);
      if (d.shallow) {
        d.x += d.nx * 0.35 * dt;
        d.z += d.nz * 0.35 * dt;
      }
      // turn slowly; logs tend to swing round to lie along the current
      const flowYaw = Math.atan2(d.fx, d.fz);
      let diff = ((flowYaw - d.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (diff > Math.PI / 2) diff -= Math.PI;
      else if (diff < -Math.PI / 2) diff += Math.PI;
      d.yaw += (d.spin + diff * 0.04 * (d.K.shadow ? 1 : 0.3)) * dt;
      const bob = Math.sin(t * 1.6 + d.ph) * 0.018 + Math.sin(t * 2.7 + d.ph * 2) * 0.008;
      const f = Math.max(0, d.fade);
      const sc = d.scale * f;
      _e.set(Math.sin(t * 1.1 + d.ph) * 0.03, d.yaw, Math.sin(t * 1.3 + d.ph * 1.7) * 0.05, 'YXZ');
      _q.setFromEuler(_e);
      // sinking in while fading out, rising while fading in
      _p.set(d.x, d.level - d.K.sink * d.scale + bob - (1 - f) * 0.3 * d.scale, d.z);
      _s.setScalar(Math.max(0.001, sc));
      d.mesh.setMatrixAt(d.slot, _m.compose(_p, _q, _s));
      d.K.dirty = true;
      d.K.alive++;
    }
    if (near) this.filled = true;
    for (const K of this.driftKinds) {
      if (K.dirty) K.mesh.instanceMatrix.needsUpdate = true;
      this.showDrift(K);
    }

    // --- petals and leaves
    const fm = this.flakeMesh;
    let tries = 12;
    const windX = 0.07;
    const windZ = 0.035;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      if (!f.alive) {
        if (tries <= 0) continue;
        tries--;
        if (!this.spawnFlake(f, px, pz)) continue;
      }
      f.t -= dt;
      if (f.t <= 0) {
        f.t = 0.4;
        const w = W.waterAt(f.x, f.z);
        if (!w || w.kind === 'ocean' || w.depth < 0.03) f.dying = true;
        else {
          f.level = w.level;
          f.s = w.s;
          f.fx = w.flowX;
          f.fz = w.flowZ;
          f.lake = w.kind !== 'river';
        }
      }
      if ((f.x - px) ** 2 + (f.z - pz) ** 2 > (FLAKE_RADIUS + 4) ** 2) f.dying = true;
      f.fade = f.dying ? f.fade - dt * 1.5 : Math.min(1, f.fade + dt * 0.8);
      if (f.dying && f.fade <= 0) {
        f.alive = false;
        fm.setMatrixAt(i, _zero);
        continue;
      }
      if (f.lake) {
        // drift with the wind, wandering a little
        f.x += (windX + Math.sin(t * 0.3 + f.ph) * 0.03) * dt;
        f.z += (windZ + Math.cos(t * 0.23 + f.ph) * 0.03) * dt;
      } else {
        f.x += f.fx * 0.97 * dt;
        f.z += f.fz * 0.97 * dt;
        f.level = this.riverLevelAt(f.x, f.z, f.s);
      }
      f.yaw += f.spin * dt;
      _e.set(Math.sin(t * 1.7 + f.ph) * 0.06, f.yaw, Math.sin(t * 1.4 + f.ph) * 0.06, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(f.x, f.level + 0.003 + Math.sin(t * 1.6 + f.ph) * 0.006, f.z);
      _s.setScalar(Math.max(0.001, f.scale * Math.max(0, f.fade)));
      fm.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    fm.instanceMatrix.needsUpdate = true;

    // --- ice floes turning slowly on Glacier Lake
    const L = this.glacierLake;
    if (this.floeMesh && L) {
      const dx = px - L.x;
      const dz = pz - L.z;
      const show = dx * dx + dz * dz < 900 * 900;
      this.floeMesh.visible = show;
      if (show) {
        this.floes.forEach((f, i) => {
          // a slow circulation round the lake
          const rx = f.x - L.x;
          const rz = f.z - L.z;
          const rl = Math.hypot(rx, rz) || 1;
          const nx = f.x - (rz / rl) * 0.05 * dt;
          const nz = f.z + (rx / rl) * 0.05 * dt;
          const w = W.waterAt(nx, nz);
          if (w && w.depth > f.size * 0.6) {
            f.x = nx;
            f.z = nz;
          }
          f.yaw += f.spin * dt;
          _e.set(Math.sin(t * 0.7 + f.ph) * 0.03, f.yaw, Math.sin(t * 0.6 + f.ph * 1.3) * 0.03, 'YXZ');
          _q.setFromEuler(_e);
          _p.set(f.x, L.level - f.size * 0.12 + Math.sin(t * 0.9 + f.ph) * 0.03, f.z);
          _s.set(f.sx, f.size, f.sz);
          this.floeMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        });
        this.floeMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
