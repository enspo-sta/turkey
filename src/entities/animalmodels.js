// Animal and bird models with limb ids for vertex-shader animation, built
// as smooth lofted shapes (see animalkit.js): one indexed mesh per species,
// drawn for every animal of it at once (AnimatedHerd).
// Limbs: 1-4 legs (FL, FR, BL, BR), 5 head/neck, 6 tail, 7/8 left/right
// open wing, 9 a bird's folded wings and perching legs (shown at rest), 10/11
// a walking bird's legs, 12 a long-necked bird's neck and head (nodding at
// rest, stretched forward in flight). Models face +z; left is +x. A bird
// that rests on the ground or a perch has its origin at its feet, a swimmer
// at its waterline.
import * as THREE from 'three';
import { fxPatch, casterDepthMaterial } from '../world/worldfx.js';
import { ModelBuilder } from '../util/builder.js';
import { OrganicBuilder, countershade, chain, toRgb, mixRgb, smooth01, noise3 } from './animalkit.js';

// ---- shared anatomy for the organic models (see animalkit.js) ---------------

// One leg: a tube from its top (the pivot it swings from) down through the
// joints to the hoof or paw, path as [y, z] at the leg's x.
function leg(b, limb, x, path, radii, cols, o = {}) {
  const pts = path.map(([y, z], i) => [x + (o.splay ? o.splay[i] * Math.sign(x) : 0), y, z]);
  b.tube(pts, radii, { seg: o.seg ?? 8, sub: o.sub ?? 1, cols, cap0: 'round', cap1: o.cap1 ?? 'flat', limb, pivot: [x, path[0][0], path[0][1]], jitter: 0.04, colorFn: o.colorFn, e: o.e });
}

// The four legs: front pair at +-fx from `front`, back pair at +-bx from
// `back` (limbs 1 and 2 front, 3 and 4 back, as the walk expects)
function legs4(b, { fx, bx, front, back, rf, rb, cf, cb, o = {} }) {
  leg(b, 1, fx, front, rf, cf, o);
  leg(b, 2, -fx, front, rf, cf, o);
  leg(b, 3, bx, back, rb, cb, o);
  leg(b, 4, -bx, back, rb, cb, o);
}

// A pair of eyes: dark, a little glossy at the top
function eyes(b, x, y, z, r, o = {}) {
  for (const s of [-1, 1]) b.ellipsoid([s * x, y, z], [r * 0.8, r, r], { rot: [0, s * (o.yaw ?? 0.5), 0], seg: 8, rings: 4, color: o.color ?? 0x0c0a08, limb: o.limb, pivot: o.pivot, jitter: 0 });
}

// A pair of ears: a cupped leaf standing out from the head
function ears(b, x, y, z, len, wid, o = {}) {
  for (const s of [-1, 1]) {
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(s * x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tilt ?? -0.3, s * (o.yaw ?? 0.4), s * (o.out ?? -0.5), 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    // the leaf runs up its own y
    const rings = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = wid * Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI) * (1 - t * 0.35);
      rings.push({ c: [0, t * len, 0], r: [Math.max(w, wid * 0.08), wid * 0.22, wid * 0.22], e: 2 });
    }
    b.loft(rings, { seg: 8, up: [0, 0, 1], cap0: 'flat', cap1: 'point', capLen1: len * 0.08, matrix: M, color: o.color, limb: o.limb, pivot: o.pivot, colorFn: o.colorFn, jitter: 0.03 });
  }
}

const mat = (pos, rot, scale = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(...scale));

export function mooseModel(bull = true) {
  const b = new OrganicBuilder();
  const coat = toRgb(0x3b2a1d);
  const dark = toRgb(0x241912);
  const legC = toRgb(0x8c7c66);
  const hoof = toRgb(0x1a1612);
  // a dark back and neck, a lighter flank, a faint grizzle over the hump
  const fur = chain(countershade(coat, 0x4a382a, 1.25, 1.55, 0.86, 1.6, 2.05), (p, n, c) => {
    const g = noise3(p[0] * 7, p[1] * 7, p[2] * 7);
    const k = 0.92 + g * 0.16;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  // body: rump to chest, the shoulders standing high over the forelegs
  b.loft(
    [
      { c: [0, 1.5, -1.16], r: [0.2, 0.16, 0.22] },
      { c: [0, 1.53, -1.02], r: [0.37, 0.28, 0.36] },
      { c: [0, 1.56, -0.78], r: [0.45, 0.33, 0.42] },
      { c: [0, 1.52, -0.38], r: [0.47, 0.35, 0.46] },
      { c: [0, 1.54, 0.02], r: [0.49, 0.4, 0.47] },
      { c: [0, 1.6, 0.36], r: [0.48, 0.46, 0.47] },
      { c: [0, 1.7, 0.6], r: [0.42, 0.52, 0.48] },
      { c: [0, 1.64, 0.82], r: [0.34, 0.44, 0.48] },
      { c: [0, 1.58, 0.96], r: [0.2, 0.3, 0.36] },
    ],
    { seg: 14, color: coat, colorFn: fur, capLen0: 0.16, capLen1: 0.12 },
  );
  const hp = [0, 1.78, 0.86];
  const head = { limb: 5, pivot: hp };
  // neck: thick, a little arched, with a dark mane along its top
  b.tube(
    [
      [0, 1.76, 0.72],
      [0, 1.9, 1.08],
      [0, 1.98, 1.34],
    ],
    [
      [0.25, 0.32, 0.3],
      [0.2, 0.24, 0.22],
      [0.16, 0.18, 0.18],
    ],
    { seg: 12, sub: 2, color: coat, cap0: 'round', cap1: 'round', ...head, colorFn: chain(fur, (p, n, c) => mixRgb(c, dark, smooth01((n[1] - 0.2) / 0.6) * 0.8)) },
  );
  // head: the long face sloping down to a heavy overhanging nose
  b.loft(
    [
      { c: [0, 2.02, 1.32], r: [0.15, 0.15, 0.16] },
      { c: [0, 2.0, 1.48], r: [0.16, 0.16, 0.17] },
      { c: [0, 1.92, 1.66], r: [0.13, 0.13, 0.15], col: 0x33251a },
      { c: [0, 1.82, 1.84], r: [0.11, 0.115, 0.14], col: 0x3a2b20 },
      { c: [0, 1.73, 2.0], r: [0.125, 0.125, 0.15], col: 0x46362a, e: 2.3 },
      { c: [0, 1.67, 2.1], r: [0.12, 0.1, 0.13], col: 0x3e3026, e: 2.3 },
    ],
    { seg: 12, color: dark, ...head, capLen0: 0.1, capLen1: 0.06 },
  );
  // nostrils and the overhanging lip
  for (const s of [-1, 1]) b.ellipsoid([s * 0.055, 1.68, 2.15], [0.025, 0.02, 0.02], { seg: 6, rings: 3, color: 0x120e0a, ...head, jitter: 0 });
  eyes(b, 0.125, 1.95, 1.62, 0.026, head);
  ears(b, 0.13, 2.1, 1.4, 0.3, 0.085, { tilt: -0.5, yaw: 0.6, out: -1.0, color: 0x3a2b20, ...head });
  // the bell: a flap of skin and hair under the throat
  b.tube(
    [
      [0, 1.83, 1.5],
      [0, 1.62, 1.54],
      [0, 1.44, 1.56],
    ],
    [
      [0.03, 0.04, 0.04],
      [0.035, 0.05, 0.05],
      [0.025, 0.03, 0.03],
    ],
    { seg: 6, sub: 1, color: 0x2a1d14, ...head, cap0: 'flat', cap1: 'round' },
  );
  if (bull) {
    const bone = toRgb(0xc8b48e);
    const tipC = toRgb(0xe2d4b2);
    for (const s of [-1, 1]) {
      // the beam out from the skull, then the broad palm turned up and out
      b.tube(
        [
          [s * 0.1, 2.12, 1.44],
          [s * 0.3, 2.2, 1.42],
          [s * 0.46, 2.27, 1.4],
        ],
        [0.045, 0.04, 0.05],
        { seg: 7, sub: 1, color: bone, ...head, cap0: 'round', cap1: 'open' },
      );
      const palm = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        palm.push([t * 0.62, 0.11 + Math.sin(t * Math.PI) * 0.15 - t * 0.05, -0.04 + t * 0.06]);
      }
      b.plate(palm, 0.022, { matrix: mat([s * 0.44, 2.27, 1.4], [0, s * 0.18, s * 0.42], [s, 1, 1]), color: bone, ...head, seg: 10, jitter: 0.06 });
      // tines along the palm's top edge, and two brow tines forward
      for (let i = 0; i < 5; i++) {
        const t = 0.15 + i * 0.19;
        const bx = s * (0.44 + t * 0.62 * Math.cos(0.42));
        const by = 2.27 + t * 0.62 * Math.sin(0.42) + 0.05;
        const bz = 1.4 - 0.12 + Math.sin(t * Math.PI) * 0.1;
        b.tube(
          [
            [bx, by, bz],
            [bx + s * 0.04, by + 0.12 + (i === 4 ? 0.04 : 0), bz - 0.05],
          ],
          [0.024, 0.008],
          { seg: 5, color: bone, cols: [bone, tipC], ...head, cap0: 'flat', cap1: 'point', capLen1: 0.02 },
        );
      }
      for (let i = 0; i < 2; i++) {
        const bx = s * (0.42 + i * 0.06);
        b.tube(
          [
            [bx, 2.28, 1.47],
            [bx + s * 0.05, 2.36, 1.62 + i * 0.02],
          ],
          [0.022, 0.008],
          { seg: 5, color: bone, cols: [bone, tipC], ...head, cap0: 'flat', cap1: 'point', capLen1: 0.02 },
        );
      }
    }
  }
  // long legs, pale below the knee, on dark cloven hooves
  const cf = [coat, coat, legC, legC, hoof];
  legs4(b, {
    fx: 0.24,
    bx: 0.25,
    front: [
      [1.5, 0.62],
      [1.06, 0.68],
      [0.64, 0.66],
      [0.17, 0.68],
      [0.0, 0.72],
    ],
    back: [
      [1.52, -0.84],
      [1.04, -0.7],
      [0.64, -0.98],
      [0.17, -0.92],
      [0.0, -0.88],
    ],
    rf: [0.15, 0.1, 0.06, 0.05, 0.058],
    rb: [0.19, 0.13, 0.065, 0.05, 0.058],
    cf,
    cb: cf,
  });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.27, 1.5, 0.6], [0.13, 0.3, 0.2], { rot: [0.25, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 1 : 2, pivot: [s * 0.24, 1.5, 0.62] });
    b.ellipsoid([s * 0.28, 1.4, -0.82], [0.15, 0.33, 0.27], { rot: [-0.2, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 3 : 4, pivot: [s * 0.25, 1.52, -0.84] });
  }
  b.ellipsoid([0, 1.56, -1.24], [0.06, 0.09, 0.06], { rot: [-0.6, 0, 0], color: dark, limb: 6, pivot: [0, 1.6, -1.18] });
  return b.build();
}

// a ring of a body or head along z: centre height y, half-width, half-height above and below
const R = (z, y, rx, rt, rb, col, e) => ({ c: [0, y, z], r: [rx, rt, rb ?? rt], col, e });
// fur with a soft mottle, so a coat is not one flat colour
const mottle = (k = 7, amt = 0.16) => (p, n, c) => {
  const g = 1 - amt / 2 + noise3(p[0] * k, p[1] * k, p[2] * k) * amt;
  return [c[0] * g, c[1] * g, c[2] * g];
};
// a branching antler tine: a tapering tube from a point on a beam
function tine(b, from, to, r0, col, head, tipCol) {
  b.tube([from, to], [r0, r0 * 0.3], { seg: 5, cols: [col, tipCol ?? col], cap0: 'flat', cap1: 'point', capLen1: r0 * 0.8, ...head, jitter: 0.03 });
}

export function caribouModel(bull = true) {
  const b = new OrganicBuilder();
  const coat = toRgb(0x6b5844);
  const pale = toRgb(0xe6dfd0);
  const legC = toRgb(0x3e3229);
  const fur = chain(countershade(coat, pale, 0.78, 0.92, 0.84, 1.05, 1.3), mottle(8, 0.14), (p, n, c) => {
    // the white rump patch
    return mixRgb(c, pale, smooth01((-p[2] - 0.62) / 0.12) * smooth01((p[1] - 0.82) / 0.12));
  });
  b.loft([R(-0.82, 1.0, 0.17, 0.14, 0.16), R(-0.7, 1.02, 0.29, 0.23, 0.27), R(-0.45, 1.03, 0.34, 0.25, 0.31), R(-0.1, 1.0, 0.35, 0.27, 0.33), R(0.22, 1.04, 0.35, 0.3, 0.33), R(0.45, 1.1, 0.31, 0.32, 0.33), R(0.62, 1.06, 0.24, 0.27, 0.32), R(0.72, 1.02, 0.14, 0.18, 0.22)], { seg: 14, color: coat, colorFn: fur, capLen0: 0.1, capLen1: 0.08 });
  const hp = [0, 1.12, 0.62];
  const head = { limb: 5, pivot: hp };
  // neck with the long white mane hanging under it
  b.tube([[0, 1.12, 0.52], [0, 1.28, 0.78], [0, 1.4, 0.94]], [[0.15, 0.2, 0.22], [0.12, 0.15, 0.17], [0.1, 0.12, 0.12]], { seg: 12, sub: 2, color: pale, ...head, colorFn: (p, n, c) => mixRgb(c, toRgb(0x8a7a66), smooth01((n[1] + 0.1) / 0.6) * 0.55) });
  b.tube([[0, 1.08, 0.62], [0, 0.98, 0.78], [0, 1.1, 0.9]], [[0.06, 0.06, 0.1], [0.07, 0.07, 0.12], [0.05, 0.05, 0.08]], { seg: 8, sub: 1, color: pale, ...head });
  b.loft([R(0.9, 1.45, 0.1, 0.11, 0.12), R(1.02, 1.44, 0.105, 0.11, 0.12), R(1.16, 1.38, 0.08, 0.085, 0.1, 0x5e4c3c), R(1.3, 1.32, 0.07, 0.07, 0.085, 0x4a3c30), R(1.38, 1.29, 0.065, 0.06, 0.07, 0x3a3028, 2.3)], { seg: 12, color: toRgb(0x6e5c48), ...head, capLen0: 0.08, capLen1: 0.05 });
  b.ellipsoid([0, 1.29, 1.42], [0.045, 0.03, 0.03], { seg: 6, rings: 3, color: 0x1a1612, ...head, jitter: 0 });
  eyes(b, 0.085, 1.45, 1.1, 0.019, head);
  ears(b, 0.08, 1.52, 0.96, 0.13, 0.045, { tilt: -0.4, yaw: 0.5, out: -1.1, color: 0x6e5c48, ...head });
  if (bull) {
    const bone = toRgb(0xd4c4a2);
    const tipC = toRgb(0xece2c8);
    for (const s of [-1, 1]) {
      const beam = [[s * 0.06, 1.55, 0.98], [s * 0.14, 1.78, 0.9], [s * 0.3, 2.15, 0.72], [s * 0.38, 2.52, 0.8], [s * 0.3, 2.82, 1.02], [s * 0.22, 2.94, 1.16]];
      b.tube(beam, [0.035, 0.033, 0.03, 0.026, 0.02, 0.012], { seg: 7, sub: 2, color: bone, cols: [bone, bone, bone, bone, tipC, tipC], ...head, cap0: 'round', cap1: 'point', capLen1: 0.03 });
      tine(b, [s * 0.32, 2.3, 0.74], [s * 0.5, 2.48, 0.92], 0.022, bone, head, tipC);
      tine(b, [s * 0.36, 2.6, 0.84], [s * 0.5, 2.72, 1.02], 0.018, bone, head, tipC);
      tine(b, [s * 0.28, 2.86, 1.06], [s * 0.36, 3.0, 1.2], 0.015, bone, head, tipC);
      tine(b, [s * 0.12, 1.74, 0.92], [s * 0.1, 1.86, 1.14], 0.02, bone, head, tipC);
    }
    // one brow tine flattened into a shovel over the face
    b.plate([[0, 0.02, 0], [0.1, 0.05, 0], [0.22, 0.07, 0], [0.3, 0.05, 0]], 0.012, { matrix: mat([0.04, 1.84, 1.1], [0, -Math.PI / 2, -1.1]), color: bone, ...head, seg: 8 });
  }
  legs4(b, {
    fx: 0.17,
    bx: 0.17,
    front: [[1.0, 0.5], [0.72, 0.54], [0.44, 0.52], [0.13, 0.55], [0.0, 0.59]],
    back: [[1.04, -0.6], [0.74, -0.5], [0.44, -0.72], [0.13, -0.68], [0.0, -0.64]],
    rf: [0.1, 0.07, 0.04, 0.034, 0.052],
    rb: [0.13, 0.085, 0.045, 0.034, 0.052],
    cf: [coat, legC, legC, toRgb(0xd8d0c0), toRgb(0x1a1814)],
    cb: [coat, legC, legC, toRgb(0xd8d0c0), toRgb(0x1a1814)],
  });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.2, 0.98, 0.48], [0.09, 0.2, 0.13], { rot: [0.25, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 1 : 2, pivot: [s * 0.17, 1.0, 0.5] });
    b.ellipsoid([s * 0.21, 0.92, -0.58], [0.1, 0.22, 0.17], { rot: [-0.2, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 3 : 4, pivot: [s * 0.17, 1.04, -0.6] });
  }
  b.ellipsoid([0, 1.04, -0.86], [0.06, 0.05, 0.08], { rot: [-0.4, 0, 0], color: pale, limb: 6, pivot: [0, 1.06, -0.8] });
  return b.build();
}

export function deerModel(buck = true) {
  const b = new OrganicBuilder();
  const coat = toRgb(0x7c5638);
  const pale = toRgb(0xe8dccb);
  const fur = chain(countershade(coat, pale, 0.66, 0.76, 0.86, 0.85, 1.05), mottle(10, 0.12));
  b.loft([R(-0.56, 0.84, 0.12, 0.1, 0.12), R(-0.46, 0.85, 0.2, 0.17, 0.2), R(-0.28, 0.86, 0.24, 0.19, 0.23), R(0.0, 0.83, 0.25, 0.2, 0.25), R(0.22, 0.86, 0.25, 0.22, 0.25), R(0.38, 0.9, 0.22, 0.23, 0.25), R(0.5, 0.88, 0.16, 0.19, 0.22), R(0.56, 0.86, 0.09, 0.12, 0.14)], { seg: 14, color: coat, colorFn: fur, capLen0: 0.07, capLen1: 0.06 });
  const hp = [0, 0.98, 0.46];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.96, 0.4], [0, 1.13, 0.58], [0, 1.26, 0.68]], [[0.1, 0.13, 0.15], [0.08, 0.1, 0.1], [0.065, 0.075, 0.075]], { seg: 10, sub: 2, color: coat, ...head, colorFn: chain(fur, (p, n, c) => mixRgb(c, pale, smooth01((-n[1] - 0.2) / 0.5) * smooth01((p[1] - 1.0) / 0.12))) });
  b.loft([R(0.62, 1.31, 0.075, 0.08, 0.085), R(0.72, 1.31, 0.08, 0.08, 0.085), R(0.84, 1.26, 0.06, 0.06, 0.07, 0x6a4a30), R(0.95, 1.2, 0.045, 0.045, 0.05, 0x5a3e28), R(1.0, 1.18, 0.038, 0.035, 0.04, 0x1a1410, 2.2)], { seg: 12, color: coat, ...head, capLen0: 0.06, capLen1: 0.03 });
  eyes(b, 0.06, 1.33, 0.78, 0.016, head);
  ears(b, 0.07, 1.38, 0.68, 0.15, 0.055, { tilt: -0.2, yaw: 0.55, out: -1.0, color: 0x7a5a40, ...head });
  if (buck) {
    const bone = toRgb(0xd8c8a8);
    for (const s of [-1, 1]) {
      b.tube([[s * 0.04, 1.4, 0.72], [s * 0.12, 1.56, 0.74], [s * 0.18, 1.66, 0.82], [s * 0.15, 1.74, 0.92]], [0.016, 0.015, 0.012, 0.007], { seg: 5, sub: 1, color: bone, ...head, cap0: 'round', cap1: 'point', capLen1: 0.015 });
      tine(b, [s * 0.15, 1.62, 0.77], [s * 0.2, 1.75, 0.72], 0.011, bone, head);
    }
  }
  const legC = toRgb(0x6a4a30);
  legs4(b, {
    fx: 0.11,
    bx: 0.11,
    front: [[0.82, 0.38], [0.58, 0.41], [0.34, 0.4], [0.09, 0.42], [0.0, 0.45]],
    back: [[0.86, -0.42], [0.6, -0.34], [0.34, -0.52], [0.09, -0.49], [0.0, -0.46]],
    rf: [0.07, 0.05, 0.026, 0.022, 0.03],
    rb: [0.09, 0.06, 0.03, 0.022, 0.03],
    cf: [coat, legC, legC, legC, toRgb(0x151210)],
    cb: [coat, legC, legC, legC, toRgb(0x151210)],
  });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.13, 0.82, 0.38], [0.065, 0.15, 0.1], { rot: [0.25, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 1 : 2, pivot: [s * 0.11, 0.82, 0.38] });
    b.ellipsoid([s * 0.14, 0.78, -0.4], [0.075, 0.17, 0.13], { rot: [-0.2, 0, 0], color: coat, colorFn: fur, limb: s > 0 ? 3 : 4, pivot: [s * 0.11, 0.86, -0.42] });
  }
  // the black-topped tail of a Sitka black-tailed deer
  b.tube([[0, 0.92, -0.56], [0, 0.86, -0.62], [0, 0.76, -0.64]], [[0.035, 0.03, 0.03], [0.04, 0.03, 0.03], [0.02, 0.02, 0.02]], { seg: 6, sub: 1, color: 0x161210, cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.92, -0.55], colorFn: (p, n, c) => mixRgb(c, pale, smooth01((-n[2] - 0.2) / 0.4)) });
  return b.build();
}

export function sheepModel() {
  const b = new OrganicBuilder();
  const white = toRgb(0xece7da);
  const fleece = chain(countershade(white, 0xdcd4c2, 0.6, 0.72, 1.0), mottle(9, 0.1));
  b.loft([R(-0.48, 0.8, 0.13, 0.12, 0.14), R(-0.38, 0.82, 0.25, 0.21, 0.24), R(-0.15, 0.82, 0.29, 0.24, 0.29), R(0.12, 0.83, 0.3, 0.25, 0.29), R(0.32, 0.86, 0.27, 0.26, 0.28), R(0.44, 0.86, 0.19, 0.21, 0.24), R(0.5, 0.86, 0.1, 0.13, 0.15)], { seg: 14, color: white, colorFn: fleece, capLen0: 0.08, capLen1: 0.06 });
  const hp = [0, 0.94, 0.42];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.92, 0.36], [0, 1.03, 0.5], [0, 1.1, 0.58]], [[0.12, 0.15, 0.16], [0.09, 0.11, 0.11], [0.075, 0.085, 0.085]], { seg: 10, sub: 1, color: white, ...head, colorFn: fleece });
  b.loft([R(0.54, 1.15, 0.08, 0.085, 0.09), R(0.64, 1.15, 0.08, 0.085, 0.085), R(0.75, 1.1, 0.06, 0.06, 0.065), R(0.84, 1.05, 0.045, 0.045, 0.05, 0xd8d0c0), R(0.88, 1.03, 0.04, 0.035, 0.04, 0xb8b0a0, 2.2)], { seg: 12, color: white, ...head, capLen0: 0.06, capLen1: 0.03 });
  eyes(b, 0.065, 1.17, 0.68, 0.014, { ...head, color: 0x2a1e10 });
  ears(b, 0.075, 1.2, 0.58, 0.07, 0.03, { tilt: 0.1, yaw: 0.9, out: -1.3, color: white, ...head });
  // a ram's amber horns curling back, down and forward round the ear
  const horn = toRgb(0xc8a878);
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = t * Math.PI * 1.45;
      pts.push([s * (0.06 + t * 0.1), 1.2 + Math.sin(a) * 0.12, 0.6 - (1 - Math.cos(a)) * 0.08 + t * 0.02]);
    }
    const radii = pts.map((_, i) => 0.042 * (1 - (i / 8) * 0.7));
    b.tube(pts, radii, { seg: 7, color: horn, ...head, cap0: 'round', cap1: 'point', capLen1: 0.015, colorFn: (p, n, c) => {
      const ring = 0.92 + 0.08 * Math.sin(p[1] * 90 + p[2] * 90);
      return [c[0] * ring, c[1] * ring, c[2] * ring];
    } });
  }
  const legC = toRgb(0xdcd6c8);
  legs4(b, {
    fx: 0.12,
    bx: 0.12,
    front: [[0.74, 0.34], [0.5, 0.37], [0.3, 0.36], [0.08, 0.38], [0.0, 0.4]],
    back: [[0.78, -0.36], [0.52, -0.3], [0.3, -0.44], [0.08, -0.41], [0.0, -0.39]],
    rf: [0.075, 0.055, 0.033, 0.028, 0.034],
    rb: [0.09, 0.065, 0.035, 0.028, 0.034],
    cf: [white, legC, legC, legC, toRgb(0x2a2622)],
    cb: [white, legC, legC, legC, toRgb(0x2a2622)],
  });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.14, 0.74, 0.34], [0.07, 0.15, 0.1], { rot: [0.2, 0, 0], color: white, colorFn: fleece, limb: s > 0 ? 1 : 2, pivot: [s * 0.12, 0.74, 0.34] });
    b.ellipsoid([s * 0.15, 0.7, -0.35], [0.08, 0.17, 0.13], { rot: [-0.2, 0, 0], color: white, colorFn: fleece, limb: s > 0 ? 3 : 4, pivot: [s * 0.12, 0.78, -0.36] });
  }
  b.ellipsoid([0, 0.8, -0.54], [0.035, 0.06, 0.04], { rot: [-0.4, 0, 0], color: 0x3a3028, limb: 6, pivot: [0, 0.84, -0.5] });
  return b.build();
}

export function goatModel() {
  const b = new OrganicBuilder();
  const white = toRgb(0xf1eee4);
  const shag = chain(countershade(white, 0xe2dccd, 0.6, 0.85, 1.0), mottle(12, 0.12));
  // a deep chest and a hump over the shoulders, shaggy all over
  b.loft([R(-0.56, 0.86, 0.13, 0.12, 0.15), R(-0.45, 0.88, 0.25, 0.22, 0.28), R(-0.22, 0.88, 0.29, 0.25, 0.33), R(0.06, 0.92, 0.31, 0.3, 0.37), R(0.26, 1.0, 0.3, 0.36, 0.4), R(0.42, 0.98, 0.25, 0.32, 0.38), R(0.52, 0.94, 0.15, 0.2, 0.26)], { seg: 14, color: white, colorFn: shag, capLen0: 0.08, capLen1: 0.06, jitter: 0.07 });
  const hp = [0, 1.02, 0.44];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.98, 0.4], [0, 1.1, 0.54], [0, 1.18, 0.62]], [[0.13, 0.17, 0.2], [0.1, 0.13, 0.15], [0.08, 0.09, 0.1]], { seg: 10, sub: 1, color: white, ...head, colorFn: shag });
  b.loft([R(0.58, 1.24, 0.07, 0.08, 0.085), R(0.68, 1.23, 0.07, 0.08, 0.085), R(0.8, 1.16, 0.055, 0.06, 0.07), R(0.9, 1.1, 0.04, 0.045, 0.05), R(0.94, 1.08, 0.034, 0.035, 0.04, 0x302a24, 2.2)], { seg: 12, color: white, ...head, capLen0: 0.06, capLen1: 0.03 });
  // the long beard
  b.tube([[0, 1.08, 0.78], [0, 0.96, 0.8], [0, 0.86, 0.78]], [[0.03, 0.03, 0.04], [0.035, 0.03, 0.035], [0.012, 0.012, 0.012]], { seg: 6, sub: 1, color: white, ...head, cap0: 'flat', cap1: 'point', capLen1: 0.02 });
  eyes(b, 0.06, 1.25, 0.72, 0.014, head);
  ears(b, 0.07, 1.31, 0.62, 0.1, 0.03, { tilt: 0.2, yaw: 0.6, out: -0.9, color: white, ...head });
  // short black horns, curving back
  for (const s of [-1, 1]) {
    b.tube([[s * 0.04, 1.3, 0.66], [s * 0.05, 1.42, 0.62], [s * 0.055, 1.49, 0.54]], [0.022, 0.016, 0.004], { seg: 6, sub: 1, color: 0x14110e, ...head, cap0: 'round', cap1: 'point', capLen1: 0.01 });
  }
  const legC = toRgb(0xe4ded0);
  legs4(b, {
    fx: 0.13,
    bx: 0.13,
    front: [[0.8, 0.34], [0.52, 0.38], [0.3, 0.36], [0.08, 0.38], [0.0, 0.41]],
    back: [[0.82, -0.38], [0.54, -0.3], [0.3, -0.44], [0.08, -0.41], [0.0, -0.39]],
    rf: [0.1, 0.075, 0.04, 0.032, 0.038],
    rb: [0.11, 0.08, 0.04, 0.032, 0.038],
    cf: [white, white, legC, legC, toRgb(0x1a1612)],
    cb: [white, white, legC, legC, toRgb(0x1a1612)],
  });
  // the shaggy "pantaloons" over the upper legs
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.14, 0.66, 0.35], [0.07, 0.24, 0.1], { rot: [0.15, 0, 0], color: white, colorFn: shag, limb: s > 0 ? 1 : 2, pivot: [s * 0.13, 0.8, 0.34], jitter: 0.08 });
    b.ellipsoid([s * 0.145, 0.64, -0.37], [0.08, 0.26, 0.12], { rot: [-0.1, 0, 0], color: white, colorFn: shag, limb: s > 0 ? 3 : 4, pivot: [s * 0.13, 0.82, -0.38], jitter: 0.08 });
  }
  b.ellipsoid([0, 0.94, -0.6], [0.035, 0.05, 0.04], { rot: [-0.6, 0, 0], color: white, limb: 6, pivot: [0, 0.96, -0.56] });
  return b.build();
}

export function muskoxModel() {
  const b = new OrganicBuilder();
  const coat = toRgb(0x2c2017);
  const saddle = toRgb(0x8a7458);
  const hair = chain(mottle(10, 0.2), (p, n, c) => mixRgb(c, saddle, smooth01((p[1] - 1.22) / 0.1) * smooth01((0.5 - Math.abs(p[2] + 0.05)) / 0.25) * 0.9));
  // a massive body with a high shoulder hump
  b.loft([R(-1.0, 0.98, 0.3, 0.28, 0.32), R(-0.82, 1.0, 0.52, 0.42, 0.5), R(-0.45, 1.0, 0.6, 0.48, 0.56), R(-0.05, 1.04, 0.62, 0.52, 0.58), R(0.32, 1.1, 0.58, 0.58, 0.6), R(0.6, 1.08, 0.48, 0.52, 0.56), R(0.8, 1.0, 0.3, 0.36, 0.42)], { seg: 16, color: coat, colorFn: hair, capLen0: 0.16, capLen1: 0.1, jitter: 0.08 });
  // long guard hair hanging almost to the ground, a ragged hem
  const skirt = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const z = -0.92 + t * 1.6;
    skirt.push({ c: [0, 0.62 - Math.sin(t * Math.PI) * 0.06, z], r: [0.62 - Math.abs(t - 0.5) * 0.25, 0.32, 0.3], col: 0x382a1e });
  }
  b.loft(skirt, { seg: 16, color: 0x382a1e, cap0: 'round', cap1: 'round', jitter: 0.12, colorFn: (p, n, c) => {
    const k = 0.75 + noise3(p[0] * 25, p[1] * 4, p[2] * 25) * 0.35;
    return [c[0] * k, c[1] * k, c[2] * k];
  } });
  const hp = [0, 1.02, 0.78];
  const head = { limb: 5, pivot: hp };
  // the head held low, a short broad face
  b.loft([R(0.82, 1.0, 0.24, 0.24, 0.26), R(0.98, 0.96, 0.24, 0.24, 0.26), R(1.14, 0.88, 0.2, 0.2, 0.22), R(1.28, 0.8, 0.16, 0.15, 0.17, 0x241a12), R(1.36, 0.76, 0.13, 0.11, 0.13, 0x1c140e, 2.3)], { seg: 14, color: coat, colorFn: hair, ...head, capLen0: 0.1, capLen1: 0.05 });
  b.ellipsoid([0, 0.76, 1.4], [0.09, 0.06, 0.04], { seg: 8, rings: 3, color: 0x6a6258, ...head, jitter: 0 });
  eyes(b, 0.17, 0.98, 1.16, 0.02, head);
  // horns: a heavy boss that sweeps down past the eyes and hooks up
  const horn = toRgb(0xcdbb92);
  for (const s of [-1, 1]) {
    b.loft([R(0, 0, 0.1, 0.035, 0.035), R(0.08, 0, 0.09, 0.035, 0.035), R(0.15, 0, 0.07, 0.03, 0.03)], { seg: 8, matrix: mat([s * 0.09, 1.2, 1.0], [0, s * Math.PI / 2, s * 0.3]), color: 0xa89670, ...head });
    b.tube([[s * 0.24, 1.2, 1.0], [s * 0.36, 1.08, 1.03], [s * 0.4, 0.9, 1.07], [s * 0.45, 0.94, 1.18], [s * 0.48, 1.06, 1.22]], [0.055, 0.05, 0.04, 0.025, 0.008], { seg: 7, sub: 1, color: horn, cols: [horn, horn, toRgb(0xa89870), toRgb(0x3a302a), toRgb(0x1e1a16)], ...head, cap0: 'round', cap1: 'point', capLen1: 0.015 });
  }
  const legC = toRgb(0xbcae8e);
  legs4(b, {
    fx: 0.25,
    bx: 0.26,
    front: [[0.98, 0.5], [0.66, 0.53], [0.38, 0.52], [0.1, 0.54], [0.0, 0.57]],
    back: [[1.0, -0.62], [0.68, -0.54], [0.38, -0.7], [0.1, -0.67], [0.0, -0.64]],
    rf: [0.15, 0.12, 0.075, 0.06, 0.07],
    rb: [0.16, 0.12, 0.075, 0.06, 0.07],
    cf: [coat, coat, coat, legC, toRgb(0x16120e)],
    cb: [coat, coat, coat, legC, toRgb(0x16120e)],
  });
  b.ellipsoid([0, 0.98, -1.06], [0.05, 0.07, 0.05], { rot: [-0.6, 0, 0], color: coat, limb: 6, pivot: [0, 1.0, -1.0] });
  return b.build();
}

// A paw: a rounded pad at the foot of a leg, toes forward, claws in
// front (bears)
function paws(b, legsAt, r, col, o = {}) {
  for (const [limb, x, z, pivot] of legsAt) {
    b.ellipsoid([x, r * 0.55, z + r * 0.35], [r, r * 0.6, r * 1.3], { seg: 8, rings: 4, color: col, limb, pivot, jitter: 0.03 });
    if (o.claws) {
      for (let k = -1.5; k <= 1.5; k++) {
        b.tube([[x + k * r * 0.45, r * 0.5, z + r * 1.4], [x + k * r * 0.5, r * 0.15, z + r * 1.4 + o.claws]], [r * 0.12, r * 0.04], { seg: 4, color: o.clawCol ?? 0xc8b89a, limb, pivot, cap0: 'flat', cap1: 'point', capLen1: r * 0.1, jitter: 0 });
      }
    }
  }
}

export function bearModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x5c412c);
  const tip = toRgb(0x9a7a56);
  // grizzled: silver-tipped hair over the hump and back
  const coat = chain(mottle(9, 0.22), (p, n, c) => mixRgb(c, tip, smooth01((n[1] - 0.25) / 0.6) * smooth01((p[1] - 1.05) / 0.35) * 0.55));
  b.loft([R(-1.18, 0.96, 0.3, 0.3, 0.34), R(-1.02, 1.0, 0.5, 0.46, 0.5), R(-0.7, 1.02, 0.58, 0.52, 0.56), R(-0.3, 1.0, 0.6, 0.53, 0.58), R(0.1, 1.06, 0.6, 0.56, 0.58), R(0.42, 1.18, 0.56, 0.6, 0.6), R(0.66, 1.12, 0.46, 0.5, 0.58), R(0.86, 1.04, 0.3, 0.36, 0.44)], { seg: 16, color: fur, colorFn: coat, capLen0: 0.2, capLen1: 0.12, jitter: 0.08 });
  const hp = [0, 1.08, 0.8];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 1.08, 0.7], [0, 1.1, 0.92], [0, 1.08, 1.04]], [[0.3, 0.34, 0.38], [0.27, 0.3, 0.32], [0.24, 0.26, 0.27]], { seg: 14, sub: 1, color: fur, ...head, colorFn: coat });
  // a broad dished face and a blunt muzzle
  b.loft([R(1.0, 1.12, 0.26, 0.26, 0.26), R(1.16, 1.12, 0.28, 0.27, 0.27), R(1.3, 1.08, 0.2, 0.19, 0.21), R(1.42, 1.0, 0.13, 0.12, 0.14, 0x7a5a3e), R(1.54, 0.97, 0.1, 0.09, 0.1, 0x8a6a4a, 2.3)], { seg: 14, color: fur, colorFn: coat, ...head, capLen0: 0.12, capLen1: 0.05 });
  b.ellipsoid([0, 0.99, 1.6], [0.06, 0.04, 0.035], { seg: 8, rings: 3, color: 0x111111, ...head, jitter: 0 });
  eyes(b, 0.13, 1.17, 1.3, 0.02, head);
  for (const s of [-1, 1]) b.ellipsoid([s * 0.2, 1.36, 1.1], [0.08, 0.08, 0.04], { rot: [0, s * 0.4, 0], seg: 8, rings: 4, color: fur, ...head });
  legs4(b, {
    fx: 0.32,
    bx: 0.34,
    front: [[1.0, 0.54], [0.66, 0.58], [0.32, 0.56], [0.08, 0.58]],
    back: [[1.02, -0.86], [0.66, -0.74], [0.32, -0.88], [0.08, -0.84]],
    rf: [0.2, 0.17, 0.13, 0.12],
    rb: [0.23, 0.18, 0.13, 0.12],
    cf: [fur, fur, toRgb(0x3e2a1c), toRgb(0x34241a)],
    cb: [fur, fur, toRgb(0x3e2a1c), toRgb(0x34241a)],
    o: { seg: 10, cap1: 'round' },
  });
  paws(b, [[1, 0.32, 0.58, [0.32, 1.0, 0.54]], [2, -0.32, 0.58, [-0.32, 1.0, 0.54]], [3, 0.34, -0.84, [0.34, 1.02, -0.86]], [4, -0.34, -0.84, [-0.34, 1.02, -0.86]]], 0.13, toRgb(0x2e2016), { claws: 0.06 });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.36, 0.98, 0.5], [0.16, 0.3, 0.24], { rot: [0.2, 0, 0], color: fur, colorFn: coat, limb: s > 0 ? 1 : 2, pivot: [s * 0.32, 1.0, 0.54] });
    b.ellipsoid([s * 0.38, 0.94, -0.84], [0.18, 0.32, 0.3], { rot: [-0.15, 0, 0], color: fur, colorFn: coat, limb: s > 0 ? 3 : 4, pivot: [s * 0.34, 1.02, -0.86] });
  }
  b.ellipsoid([0, 1.0, -1.32], [0.06, 0.06, 0.06], { color: fur, limb: 6, pivot: [0, 1.02, -1.28] });
  return b.build();
}

export function blackBearModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x1b1815);
  const coat = chain(mottle(9, 0.25), (p, n, c) => mixRgb(c, toRgb(0x34302a), smooth01((n[1] - 0.4) / 0.5) * 0.5));
  // no hump: the back runs level, higher over the hips
  b.loft([R(-0.96, 0.82, 0.24, 0.24, 0.28), R(-0.84, 0.84, 0.42, 0.4, 0.42), R(-0.56, 0.86, 0.48, 0.45, 0.46), R(-0.2, 0.84, 0.5, 0.45, 0.48), R(0.16, 0.84, 0.48, 0.44, 0.48), R(0.42, 0.86, 0.42, 0.42, 0.46), R(0.62, 0.84, 0.28, 0.3, 0.36)], { seg: 16, color: fur, colorFn: coat, capLen0: 0.16, capLen1: 0.1, jitter: 0.08 });
  const hp = [0, 0.9, 0.62];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.88, 0.5], [0, 0.92, 0.72], [0, 0.92, 0.84]], [[0.24, 0.28, 0.3], [0.21, 0.24, 0.25], [0.19, 0.2, 0.21]], { seg: 14, sub: 1, color: fur, ...head, colorFn: coat });
  // a straight face and a long tan muzzle
  b.loft([R(0.8, 0.96, 0.2, 0.2, 0.2), R(0.94, 0.96, 0.21, 0.2, 0.2), R(1.06, 0.92, 0.15, 0.14, 0.15), R(1.18, 0.87, 0.1, 0.09, 0.1, 0x8a6a4a), R(1.28, 0.84, 0.075, 0.07, 0.075, 0x9a7a58, 2.2)], { seg: 14, color: fur, ...head, capLen0: 0.1, capLen1: 0.04 });
  b.ellipsoid([0, 0.86, 1.33], [0.045, 0.03, 0.03], { seg: 8, rings: 3, color: 0x0a0a0a, ...head, jitter: 0 });
  eyes(b, 0.1, 1.0, 1.06, 0.017, { ...head, color: 0x2a1a0e });
  for (const s of [-1, 1]) b.ellipsoid([s * 0.17, 1.15, 0.86], [0.07, 0.075, 0.035], { rot: [0, s * 0.35, 0], seg: 8, rings: 4, color: fur, ...head });
  legs4(b, {
    fx: 0.26,
    bx: 0.27,
    front: [[0.82, 0.45], [0.54, 0.48], [0.26, 0.46], [0.07, 0.48]],
    back: [[0.84, -0.7], [0.54, -0.6], [0.26, -0.72], [0.07, -0.69]],
    rf: [0.16, 0.13, 0.1, 0.095],
    rb: [0.18, 0.14, 0.1, 0.095],
    cf: [fur, fur, fur, toRgb(0x141210)],
    cb: [fur, fur, fur, toRgb(0x141210)],
    o: { seg: 10, cap1: 'round' },
  });
  paws(b, [[1, 0.26, 0.48, [0.26, 0.82, 0.45]], [2, -0.26, 0.48, [-0.26, 0.82, 0.45]], [3, 0.27, -0.69, [0.27, 0.84, -0.7]], [4, -0.27, -0.69, [-0.27, 0.84, -0.7]]], 0.1, toRgb(0x121010), { claws: 0.03, clawCol: 0x3a3430 });
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.3, 0.8, 0.42], [0.13, 0.24, 0.2], { rot: [0.2, 0, 0], color: fur, colorFn: coat, limb: s > 0 ? 1 : 2, pivot: [s * 0.26, 0.82, 0.45] });
    b.ellipsoid([s * 0.31, 0.78, -0.69], [0.15, 0.27, 0.25], { rot: [-0.15, 0, 0], color: fur, colorFn: coat, limb: s > 0 ? 3 : 4, pivot: [s * 0.27, 0.84, -0.7] });
  }
  b.ellipsoid([0, 0.86, -1.08], [0.05, 0.05, 0.05], { color: fur, limb: 6, pivot: [0, 0.86, -1.05] });
  return b.build();
}

export function wolfModel() {
  const b = new OrganicBuilder();
  const grey = toRgb(0x7f7b72);
  const pale = toRgb(0xcfc8b8);
  const coat = chain(countershade(grey, pale, 0.6, 0.72, 0.78, 0.82, 0.98), mottle(12, 0.2));
  // a deep narrow chest, a tucked waist
  b.loft([R(-0.52, 0.72, 0.1, 0.1, 0.1), R(-0.42, 0.74, 0.15, 0.14, 0.15), R(-0.2, 0.73, 0.16, 0.14, 0.14), R(0.04, 0.74, 0.18, 0.16, 0.19), R(0.24, 0.78, 0.2, 0.19, 0.23), R(0.38, 0.8, 0.18, 0.2, 0.24), R(0.48, 0.8, 0.12, 0.14, 0.17)], { seg: 14, color: grey, colorFn: coat, capLen0: 0.06, capLen1: 0.06 });
  const hp = [0, 0.86, 0.42];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.84, 0.36], [0, 0.94, 0.52], [0, 0.98, 0.6]], [[0.13, 0.16, 0.18], [0.11, 0.12, 0.13], [0.09, 0.1, 0.1]], { seg: 12, sub: 1, color: grey, ...head, colorFn: chain(coat, (p, n, c) => mixRgb(c, pale, smooth01((-n[1] - 0.1) / 0.5) * 0.7)) });
  b.loft([R(0.58, 1.0, 0.1, 0.1, 0.1), R(0.68, 1.0, 0.105, 0.1, 0.1), R(0.78, 0.96, 0.07, 0.065, 0.07, 0x8e8a80), R(0.88, 0.93, 0.05, 0.045, 0.05, 0x9a958a), R(0.95, 0.92, 0.04, 0.035, 0.04, 0x8a857a, 2.2)], { seg: 12, color: grey, ...head, capLen0: 0.06, capLen1: 0.03, colorFn: (p, n, c) => mixRgb(c, pale, smooth01((-n[1] - 0.2) / 0.5)) });
  b.ellipsoid([0, 0.93, 0.98], [0.025, 0.02, 0.018], { seg: 6, rings: 3, color: 0x111111, ...head, jitter: 0 });
  eyes(b, 0.055, 1.03, 0.76, 0.012, { ...head, color: 0x3a2a10 });
  ears(b, 0.055, 1.07, 0.64, 0.09, 0.035, { tilt: 0.1, yaw: 0.2, out: -0.25, color: 0x6a665e, ...head });
  const legC = toRgb(0x8a857a);
  legs4(b, {
    fx: 0.09,
    bx: 0.09,
    front: [[0.72, 0.32], [0.48, 0.35], [0.24, 0.34], [0.05, 0.36]],
    back: [[0.74, -0.42], [0.5, -0.34], [0.24, -0.5], [0.05, -0.47]],
    rf: [0.06, 0.04, 0.027, 0.026],
    rb: [0.075, 0.05, 0.028, 0.026],
    cf: [grey, legC, legC, legC],
    cb: [grey, legC, legC, legC],
    o: { cap1: 'round' },
  });
  paws(b, [[1, 0.09, 0.36, [0.09, 0.72, 0.32]], [2, -0.09, 0.36, [-0.09, 0.72, 0.32]], [3, 0.09, -0.47, [0.09, 0.74, -0.42]], [4, -0.09, -0.47, [-0.09, 0.74, -0.42]]], 0.035, legC);
  for (const s of [-1, 1]) {
    b.ellipsoid([s * 0.11, 0.68, 0.32], [0.055, 0.13, 0.08], { rot: [0.2, 0, 0], color: grey, colorFn: coat, limb: s > 0 ? 1 : 2, pivot: [s * 0.09, 0.72, 0.32] });
    b.ellipsoid([s * 0.12, 0.66, -0.42], [0.06, 0.14, 0.1], { rot: [-0.2, 0, 0], color: grey, colorFn: coat, limb: s > 0 ? 3 : 4, pivot: [s * 0.09, 0.74, -0.42] });
  }
  // a bushy tail held low, dark at the tip
  b.tube([[0, 0.74, -0.52], [0, 0.62, -0.64], [0, 0.46, -0.72], [0, 0.34, -0.74]], [0.04, 0.065, 0.06, 0.025], { seg: 8, sub: 1, color: 0x6a665e, cols: [grey, grey, toRgb(0x5e5a52), toRgb(0x1c1a18)], cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.74, -0.5] });
  return b.build();
}

export function foxModel() {
  const b = new OrganicBuilder();
  const orange = toRgb(0xc8641e);
  const white = toRgb(0xf2ebe0);
  const coat = chain(countershade(orange, white, 0.28, 0.34, 0.9, 0.38, 0.46), mottle(18, 0.14));
  b.loft([R(-0.25, 0.33, 0.06, 0.06, 0.06), R(-0.2, 0.34, 0.085, 0.08, 0.085), R(-0.08, 0.34, 0.09, 0.08, 0.085), R(0.06, 0.35, 0.095, 0.085, 0.095), R(0.17, 0.36, 0.09, 0.09, 0.1), R(0.23, 0.36, 0.06, 0.07, 0.08)], { seg: 12, color: orange, colorFn: coat, capLen0: 0.03, capLen1: 0.03 });
  const hp = [0, 0.4, 0.2];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.39, 0.17], [0, 0.44, 0.25], [0, 0.46, 0.29]], [[0.06, 0.07, 0.075], [0.05, 0.055, 0.058], [0.045, 0.05, 0.05]], { seg: 10, sub: 1, color: orange, ...head, colorFn: (p, n, c) => mixRgb(c, white, smooth01((-n[1] - 0.05) / 0.4) * smooth01((n[2] + 0.3) / 0.5)) });
  // a narrow pointed face, white cheeks
  b.loft([R(0.28, 0.47, 0.055, 0.05, 0.05), R(0.33, 0.47, 0.056, 0.05, 0.048), R(0.38, 0.45, 0.038, 0.034, 0.036), R(0.43, 0.43, 0.024, 0.022, 0.024), R(0.46, 0.42, 0.016, 0.015, 0.016, 0x2a1a10)], { seg: 10, color: orange, ...head, capLen0: 0.03, capLen1: 0.012, colorFn: (p, n, c) => mixRgb(c, white, smooth01((-n[1] + 0.1) / 0.4) * 0.9) });
  b.ellipsoid([0, 0.42, 0.468], [0.012, 0.01, 0.009], { seg: 6, rings: 3, color: 0x111111, ...head, jitter: 0 });
  eyes(b, 0.03, 0.48, 0.36, 0.008, { ...head, color: 0x3a2a0a });
  ears(b, 0.032, 0.5, 0.29, 0.07, 0.026, { tilt: 0, yaw: 0.25, out: -0.3, color: 0x2a1a10, ...head, colorFn: (p, n, c) => mixRgb(c, orange, smooth01((n[2] - 0.1) / 0.4)) });
  // black stockings
  const sock = toRgb(0x241610);
  legs4(b, {
    fx: 0.05,
    bx: 0.055,
    front: [[0.33, 0.17], [0.22, 0.18], [0.1, 0.18], [0.025, 0.19]],
    back: [[0.34, -0.2], [0.22, -0.16], [0.1, -0.23], [0.025, -0.22]],
    rf: [0.03, 0.02, 0.013, 0.013],
    rb: [0.036, 0.024, 0.014, 0.013],
    cf: [orange, sock, sock, sock],
    cb: [orange, sock, sock, sock],
    o: { seg: 6, cap1: 'round' },
  });
  // the long bushy tail with a white tip
  b.tube([[0, 0.36, -0.24], [0, 0.32, -0.34], [0, 0.26, -0.46], [0, 0.22, -0.56], [0, 0.21, -0.62]], [0.03, 0.06, 0.07, 0.055, 0.02], { seg: 10, sub: 1, color: orange, cols: [orange, orange, orange, white, white], cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.36, -0.22] });
  return b.build();
}

export function lynxModel() {
  const b = new OrganicBuilder();
  const coat = toRgb(0x9c8c74);
  const pale = toRgb(0xe2d8c6);
  const fur = chain(countershade(coat, pale, 0.42, 0.5, 0.88, 0.58, 0.7), mottle(16, 0.22), (p, n, c) => {
    // faint dark spots on the flanks and legs
    const sp = noise3(p[0] * 22, p[1] * 22, p[2] * 22);
    return mixRgb(c, toRgb(0x5a4a38), smooth01((sp - 0.66) / 0.06) * 0.45);
  });
  b.loft([R(-0.4, 0.54, 0.09, 0.09, 0.1), R(-0.32, 0.56, 0.14, 0.13, 0.14), R(-0.12, 0.54, 0.15, 0.13, 0.14), R(0.1, 0.54, 0.16, 0.15, 0.16), R(0.26, 0.55, 0.15, 0.16, 0.17), R(0.36, 0.55, 0.1, 0.12, 0.13)], { seg: 12, color: coat, colorFn: fur, capLen0: 0.05, capLen1: 0.05 });
  const hp = [0, 0.6, 0.34];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.58, 0.3], [0, 0.64, 0.4], [0, 0.66, 0.44]], [[0.09, 0.1, 0.11], [0.08, 0.09, 0.09], [0.075, 0.08, 0.08]], { seg: 10, sub: 1, color: coat, ...head, colorFn: fur });
  // a round face with a pale ruff, a short muzzle
  b.loft([R(0.42, 0.68, 0.1, 0.095, 0.1), R(0.48, 0.68, 0.11, 0.1, 0.105), R(0.54, 0.66, 0.08, 0.07, 0.075), R(0.58, 0.64, 0.05, 0.045, 0.05, 0xd8ccb8), R(0.6, 0.635, 0.035, 0.03, 0.035, 0xc8b8a0, 2.2)], { seg: 12, color: coat, ...head, capLen0: 0.05, capLen1: 0.015 });
  for (const s of [-1, 1]) b.ellipsoid([s * 0.085, 0.63, 0.47], [0.035, 0.05, 0.03], { rot: [0, s * 0.5, s * 0.3], seg: 8, rings: 4, color: pale, ...head });
  b.ellipsoid([0, 0.64, 0.61], [0.013, 0.01, 0.009], { seg: 6, rings: 3, color: 0x3a2a24, ...head, jitter: 0 });
  eyes(b, 0.042, 0.7, 0.55, 0.013, { ...head, color: 0xb8902a });
  ears(b, 0.055, 0.76, 0.44, 0.07, 0.028, { tilt: 0.1, yaw: 0.25, out: -0.25, color: 0x6a5a48, ...head });
  // the black tufts on the ear tips
  for (const s of [-1, 1]) b.tube([[s * 0.07, 0.82, 0.43], [s * 0.073, 0.86, 0.43]], [0.005, 0.0015], { seg: 4, color: 0x111111, ...head, cap0: 'flat', cap1: 'point', capLen1: 0.005, jitter: 0 });
  legs4(b, {
    fx: 0.08,
    bx: 0.085,
    front: [[0.5, 0.26], [0.32, 0.28], [0.16, 0.27], [0.04, 0.28]],
    back: [[0.52, -0.3], [0.34, -0.24], [0.16, -0.34], [0.04, -0.32]],
    rf: [0.05, 0.04, 0.032, 0.032],
    rb: [0.06, 0.045, 0.032, 0.032],
    cf: [coat, coat, coat, pale],
    cb: [coat, coat, coat, pale],
    o: { cap1: 'round', colorFn: mottle(16, 0.22) },
  });
  // big furred snowshoe paws
  paws(b, [[1, 0.08, 0.28, [0.08, 0.5, 0.26]], [2, -0.08, 0.28, [-0.08, 0.5, 0.26]], [3, 0.085, -0.32, [0.085, 0.52, -0.3]], [4, -0.085, -0.32, [-0.085, 0.52, -0.3]]], 0.045, pale);
  // the short tail, black at the tip
  b.tube([[0, 0.58, -0.4], [0, 0.55, -0.47], [0, 0.52, -0.52]], [0.03, 0.03, 0.022], { seg: 7, cols: [coat, coat, toRgb(0x111111)], cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.58, -0.38] });
  return b.build();
}

export function hareModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x8a6a4a);
  const white = toRgb(0xf0ece4);
  const coat = chain(countershade(fur, white, 0.07, 0.12, 0.9, 0.2, 0.28), mottle(26, 0.18));
  // sitting hunched: round haunches on the ground, the shoulders a little up
  b.loft([R(-0.17, 0.12, 0.07, 0.07, 0.09), R(-0.11, 0.14, 0.11, 0.11, 0.12), R(-0.02, 0.15, 0.1, 0.11, 0.12), R(0.06, 0.17, 0.08, 0.09, 0.1), R(0.11, 0.19, 0.06, 0.07, 0.08)], { seg: 12, color: fur, colorFn: coat, capLen0: 0.06, capLen1: 0.03 });
  const hp = [0, 0.22, 0.1];
  const head = { limb: 5, pivot: hp };
  b.loft([R(0.09, 0.25, 0.05, 0.055, 0.05), R(0.14, 0.26, 0.055, 0.058, 0.052), R(0.19, 0.245, 0.042, 0.042, 0.04), R(0.22, 0.235, 0.03, 0.03, 0.028, 0x9a7a5a)], { seg: 10, color: fur, ...head, capLen0: 0.03, capLen1: 0.012 });
  eyes(b, 0.035, 0.27, 0.17, 0.01, { ...head, yaw: 0.9 });
  // the long ears, dark at the tips, laid a little back
  for (const s of [-1, 1]) {
    b.loft(
      [
        { c: [0, 0, 0], r: [0.012, 0.008, 0.008] },
        { c: [0, 0.05, 0], r: [0.022, 0.009, 0.009] },
        { c: [0, 0.11, -0.005], r: [0.022, 0.008, 0.008], col: 0x8a6a4a },
        { c: [0, 0.15, -0.01], r: [0.014, 0.006, 0.006], col: 0x2a2018 },
      ],
      { seg: 7, up: [0, 0, 1], cap0: 'flat', cap1: 'point', capLen1: 0.012, matrix: mat([s * 0.025, 0.29, 0.11], [-0.5, 0, s * -0.18]), color: fur, ...head },
    );
  }
  // short forelegs under the chest, long hind feet flat on the ground (the snowshoes)
  leg(b, 1, 0.032, [[0.14, 0.1], [0.06, 0.12], [0.012, 0.13]], [0.018, 0.015, 0.014], [fur, white, white], { seg: 6, cap1: 'round' });
  leg(b, 2, -0.032, [[0.14, 0.1], [0.06, 0.12], [0.012, 0.13]], [0.018, 0.015, 0.014], [fur, white, white], { seg: 6, cap1: 'round' });
  for (const [limb, s] of [
    [3, 1],
    [4, -1],
  ]) {
    b.ellipsoid([s * 0.07, 0.09, -0.08], [0.045, 0.075, 0.09], { rot: [0.3, 0, 0], color: fur, colorFn: coat, limb, pivot: [s * 0.07, 0.12, -0.08] });
    b.ellipsoid([s * 0.072, 0.022, -0.03], [0.026, 0.02, 0.085], { color: white, colorFn: (p, n, c) => mixRgb(c, fur, smooth01((n[1] - 0.3) / 0.5) * 0.5), limb, pivot: [s * 0.07, 0.12, -0.08] });
  }
  b.ellipsoid([0, 0.12, -0.19], [0.03, 0.03, 0.025], { color: white, limb: 6, pivot: [0, 0.12, -0.17] });
  return b.build();
}

export function porcupineModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x2e2418);
  b.loft([R(-0.32, 0.22, 0.1, 0.1, 0.1), R(-0.22, 0.25, 0.18, 0.18, 0.16), R(-0.02, 0.27, 0.21, 0.21, 0.18), R(0.18, 0.25, 0.18, 0.18, 0.15), R(0.3, 0.22, 0.11, 0.11, 0.1)], { seg: 14, color: fur, capLen0: 0.06, capLen1: 0.05, colorFn: mottle(20, 0.2) });
  // quills: pale-tipped spikes raised over the back and sides
  const rnd = (i) => Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453);
  for (let i = 0; i < 46; i++) {
    const a = (rnd(i) - 0.5) * Math.PI * 1.25;
    const z = -0.3 + rnd(i + 50) * 0.52;
    const rr = 0.2 * Math.sqrt(Math.max(0.1, 1 - ((z + 0.02) / 0.34) ** 2));
    const x = Math.sin(a) * rr;
    const y = 0.25 + Math.cos(a) * rr * 0.95;
    const len = 0.12 + rnd(i + 9) * 0.1;
    const dx = Math.sin(a) * 0.6, dy = Math.cos(a) * 0.75, dz = -0.55;
    b.tube([[x, y, z], [x + dx * len, y + dy * len, z + dz * len]], [0.012, 0.002], { seg: 4, cols: [toRgb(0x3a2e22), toRgb(i % 3 ? 0xe2d6bc : 0xb0a488)], cap0: 'flat', cap1: 'point', capLen1: 0.008, jitter: 0.08 });
  }
  const hp = [0, 0.24, 0.28];
  const head = { limb: 5, pivot: hp };
  b.loft([R(0.28, 0.23, 0.09, 0.085, 0.08), R(0.34, 0.22, 0.085, 0.08, 0.075), R(0.4, 0.2, 0.06, 0.055, 0.05), R(0.45, 0.19, 0.035, 0.03, 0.03, 0x1a1410)], { seg: 10, color: 0x1e1810, ...head, capLen0: 0.04, capLen1: 0.015 });
  eyes(b, 0.05, 0.25, 0.38, 0.011, head);
  legs4(b, {
    fx: 0.11,
    bx: 0.12,
    front: [[0.18, 0.16], [0.09, 0.18], [0.02, 0.19]],
    back: [[0.18, -0.18], [0.09, -0.16], [0.02, -0.17]],
    rf: [0.04, 0.035, 0.035],
    rb: [0.045, 0.035, 0.035],
    cf: [fur, toRgb(0x18120c), toRgb(0x18120c)],
    cb: [fur, toRgb(0x18120c), toRgb(0x18120c)],
    o: { seg: 6, cap1: 'round' },
  });
  b.tube([[0, 0.22, -0.32], [0, 0.18, -0.42], [0, 0.12, -0.48]], [0.06, 0.055, 0.03], { seg: 8, color: 0x3a2e20, cols: [toRgb(0x3a2e20), toRgb(0x3a2e20), toRgb(0xb8ac90)], cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.22, -0.3] });
  return b.build();
}

export function squirrelModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x9a5a34);
  const white = toRgb(0xece2d0);
  const coat = chain(countershade(fur, white, 0.05, 0.08, 0.9, 0.1, 0.14), mottle(40, 0.15));
  b.loft([R(-0.08, 0.065, 0.035, 0.035, 0.04), R(-0.04, 0.075, 0.05, 0.048, 0.05), R(0.02, 0.085, 0.048, 0.05, 0.048), R(0.07, 0.1, 0.04, 0.042, 0.04), R(0.1, 0.11, 0.03, 0.032, 0.03)], { seg: 10, color: fur, colorFn: coat, capLen0: 0.02, capLen1: 0.015 });
  const hp = [0, 0.12, 0.1];
  const head = { limb: 5, pivot: hp };
  b.loft([R(0.1, 0.13, 0.03, 0.032, 0.03), R(0.13, 0.135, 0.034, 0.034, 0.03), R(0.16, 0.13, 0.025, 0.024, 0.022), R(0.18, 0.125, 0.014, 0.014, 0.013, 0x7a4a2a)], { seg: 10, color: fur, ...head, capLen0: 0.015, capLen1: 0.007 });
  eyes(b, 0.022, 0.142, 0.145, 0.006, { ...head, yaw: 0.9 });
  ears(b, 0.016, 0.162, 0.125, 0.022, 0.009, { tilt: 0, yaw: 0.3, out: -0.3, color: fur, ...head });
  legs4(b, {
    fx: 0.025,
    bx: 0.032,
    front: [[0.08, 0.07], [0.04, 0.08], [0.006, 0.085]],
    back: [[0.07, -0.05], [0.03, -0.035], [0.006, -0.025]],
    rf: [0.012, 0.009, 0.008],
    rb: [0.022, 0.013, 0.009],
    cf: [fur, fur, toRgb(0x6a4026)],
    cb: [fur, fur, toRgb(0x6a4026)],
    o: { seg: 6, cap1: 'round' },
  });
  // the big bushy tail curled up over the back
  b.tube([[0, 0.07, -0.08], [0, 0.11, -0.14], [0, 0.2, -0.15], [0, 0.26, -0.1], [0, 0.28, -0.05]], [0.02, 0.035, 0.04, 0.035, 0.02], { seg: 10, sub: 1, color: fur, cols: [fur, fur, toRgb(0x8a5030), toRgb(0x7a4a2a), toRgb(0x6a3e24)], cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0.08, -0.07], colorFn: mottle(30, 0.25) });
  return b.build();
}

// ---- birds -------------------------------------------------------------------
// Open wings run along +-x from the shoulder (limbs 7 and 8, flapping about
// the body's axis). Folded wings and perching legs are limb 9: shown only
// at rest, when the open wings are drawn in (see animatedMaterial). A
// walking bird's legs are limbs 10 and 11, tucked back in flight.

// One open wing, s = +1 or -1: broad over the arm, a rounded or fingered
// hand, pale underneath, the tip colour from `tipFrom` of the span out
function openWing(b, s, W) {
  const half = W.span / 2;
  const x0 = W.sh[0];
  const color = toRgb(W.color);
  const tipC = toRgb(W.tip ?? W.color);
  const under = W.under != null ? toRgb(W.under) : null;
  const n = 8;
  const rings = [];
  const span = W.fingers ? half * 0.86 : half;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ch = W.chord * (t < 0.42 ? 1 - t * 0.12 : 0.95 - (t - 0.42) * (W.fingers ? 0.45 : 0.85)) * (W.fingers ? 1 : 1 - Math.pow(t, 8) * 0.5);
    const lead = W.sh[2] + W.chord * 0.32 - Math.pow(t, 1.4) * (W.sweep ?? 0.12);
    const th = (W.thick ?? 0.025) * (1 - t * 0.75);
    rings.push({ c: [s * (x0 + t * (span - x0)), W.sh[1] + Math.sin(t * Math.PI * 0.5) * (W.up ?? 0.03), lead - ch * 0.5], r: [ch * 0.5, th, th * 0.45], col: mixRgb(color, tipC, smooth01((t - (W.tipFrom ?? 0.7)) / 0.12)) });
  }
  const limb = s > 0 ? 7 : 8;
  const pivot = [s * x0 * 0.5, W.sh[1], W.sh[2]];
  const colorFn = (p, nn, c) => {
    let out = c;
    if (under) out = mixRgb(out, mixRgb(under, out, smooth01((Math.abs(p[0]) / half - (W.tipFrom ?? 0.7)) / 0.15) * (W.tipUnder ? 1 : 0)), smooth01((-nn[1] - 0.2) / 0.4));
    if (W.band) out = mixRgb(out, toRgb(W.band[0]), smooth01(1 - Math.abs(Math.abs(p[0]) / half - W.band[1]) / 0.08) * smooth01((W.sh[2] - p[2] - W.chord * 0.25) / 0.05) * smooth01((nn[1] + 0.2) / 0.3));
    return out;
  };
  b.loft(rings, { seg: 10, up: [0, 1, 0], cap0: 'flat', cap1: 'round', limb, pivot, colorFn, jitter: 0.03 });
  // the slotted primaries of a soaring bird: fingers spread at the tip
  if (W.fingers) {
    const tipX = s * span, tipY = W.sh[1] + (W.up ?? 0.03), tipZ = W.sh[2] + W.chord * 0.32 - (W.sweep ?? 0.12) - W.chord * 0.25;
    for (let k = 0; k < W.fingers; k++) {
      const a = (k / (W.fingers - 1) - 0.5) * 0.7;
      const len = half * (0.2 - Math.abs(k / (W.fingers - 1) - 0.4) * 0.08);
      const dx = Math.cos(a) * s, dz = Math.sin(a) * -1;
      b.tube(
        [
          [tipX - s * half * 0.05, tipY, tipZ + (k / (W.fingers - 1) - 0.5) * W.chord * 0.5],
          [tipX + dx * len * 0.6, tipY + 0.01, tipZ + (k / (W.fingers - 1) - 0.5) * W.chord * 0.5 + dz * len * 0.6],
          [tipX + dx * len, tipY + 0.02 + len * 0.1, tipZ + (k / (W.fingers - 1) - 0.5) * W.chord * 0.5 + dz * len],
        ],
        [
          [W.chord * 0.06, 0.006, 0.004],
          [W.chord * 0.055, 0.005, 0.004],
          [W.chord * 0.02, 0.003, 0.002],
        ],
        { seg: 6, color: tipC, cap0: 'flat', cap1: 'round', limb, pivot, jitter: 0.03 },
      );
    }
  }
}

// The folded wings at rest, lying along the flanks from the shoulder back
// past the tail's base (limb 9)
function foldedWings(b, F) {
  for (const s of [-1, 1]) {
    const rings = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const h = F.h * (t < 0.3 ? 0.75 + t * 0.8 : 1 - (t - 0.3) * 1.1);
      rings.push({ c: [s * (F.x - t * F.x * 0.35), F.y + Math.sin(t * Math.PI) * 0.01 - t * (F.drop ?? 0), F.z0 + (F.z1 - F.z0) * t], r: [F.t ?? 0.012, Math.max(h, F.h * 0.12), Math.max(h, F.h * 0.12)], col: mixRgb(toRgb(F.color), toRgb(F.tip ?? F.color), smooth01((t - (F.tipFrom ?? 0.6)) / 0.15)) });
    }
    b.loft(rings, { seg: 8, up: [0, 1, 0], cap0: 'round', cap1: 'point', capLen1: F.h * 0.4, limb: 9, pivot: [s * F.x, F.y, F.z0], jitter: 0.03, colorFn: F.colorFn });
  }
}

// Legs and feet shown at rest (limb 9): thin shanks and three toes forward
function restLegs(b, L) {
  for (const s of [-1, 1]) {
    const x = s * L.x;
    b.tube([[x, L.hip, L.z], [x, L.knee ?? L.hip * 0.5, L.z - 0.01], [x, L.r * 0.5, L.z]], [L.r * 1.6, L.r, L.r], { seg: 5, color: L.color, cap1: 'round', limb: 9, pivot: [x, L.hip, L.z], jitter: 0.02 });
    for (const a of [-0.45, 0, 0.45]) b.tube([[x, L.r * 0.5, L.z], [x + Math.sin(a) * L.toe, L.r * 0.4, L.z + Math.cos(a) * L.toe]], [L.r * 0.8, L.r * 0.5], { seg: 4, color: L.color, cap0: 'flat', cap1: 'round', limb: 9, pivot: [x, L.hip, L.z], jitter: 0 });
    b.tube([[x, L.r * 0.5, L.z], [x, L.r * 0.4, L.z - L.toe * 0.6]], [L.r * 0.8, L.r * 0.5], { seg: 4, color: L.color, cap0: 'flat', cap1: 'round', limb: 9, pivot: [x, L.hip, L.z], jitter: 0 });
  }
}

// A beak: a tapering point from its base, drooping, a raptor's hooked
function beakOf(b, base, len, r, color, o = {}) {
  const [x, y, z] = base;
  const droop = o.droop ?? 0;
  const pts = [
    [x, y, z],
    [x, y - droop * 0.3, z + len * 0.5],
    [x, y - droop * (o.hook ? 0.5 : 1), z + len * (o.hook ? 0.92 : 1)],
  ];
  const rad = [[r, r * (o.deep ?? 1), r * (o.deep ?? 1)], [r * 0.62, r * 0.62 * (o.deep ?? 1), r * 0.55 * (o.deep ?? 1)], [r * 0.15, r * 0.15, r * 0.12]];
  if (o.hook) {
    pts.push([x, y - droop - len * 0.12, z + len * 1.02]);
    rad.push([r * 0.08, r * 0.08, r * 0.08]);
  }
  b.tube(pts, rad, { seg: 8, sub: 1, color, cap0: 'flat', cap1: 'point', capLen1: r * 0.2, limb: o.limb, pivot: o.pivot, jitter: 0.02, e: o.flat ? 2.6 : 2, cols: o.cols });
}

// A long-necked bird's model notes its neck, from the base the neck (limb
// 12) swings from to the centre the head (limb 13) turns on, for
// AnimatedHerd's aNeck: in flight the head rides on the neck's end, level.
function withNeck(geo, neck, head) {
  geo.userData.neck = [0, 1, 2].map((i) => head.pivot[i] - neck.pivot[i]);
  return geo;
}

// A tail fan behind the body (limb 6), its outline along -z
function tailFan(b, at, len, wid, color, o = {}) {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const w = o.wedge ? wid * (1 - t * 0.55) : o.fork ? wid * (0.6 + t * 0.6) : wid * (0.75 + Math.sin(t * Math.PI * 0.5) * 0.35);
    pts.push([t * len, w * 0.5, 0]);
  }
  b.plate(pts, o.thick ?? 0.008, { matrix: mat(at, [o.tilt ?? 0, Math.PI / 2, 0]), color, seg: 8, limb: 6, pivot: at, colorFn: o.colorFn, jitter: 0.03 });
}

export function eagleModel() {
  // a bald eagle; its origin at the feet, so a perched one stands on its perch
  const b = new OrganicBuilder();
  const brown = toRgb(0x3a2a1a);
  const white = toRgb(0xf4f2ea);
  const y = 0.3;
  b.loft([R(-0.36, y - 0.02, 0.06, 0.05, 0.05), R(-0.26, y, 0.11, 0.1, 0.1), R(-0.06, y, 0.15, 0.14, 0.15), R(0.12, y + 0.02, 0.15, 0.14, 0.15), R(0.26, y + 0.04, 0.11, 0.11, 0.12), R(0.34, y + 0.06, 0.08, 0.08, 0.08, 0xf0eee6)], { seg: 12, color: brown, capLen0: 0.04, capLen1: 0.03, colorFn: mottle(12, 0.14) });
  b.ellipsoid([0, y + 0.1, 0.4], [0.075, 0.08, 0.1], { color: white, seg: 10, rings: 6 });
  eyes(b, 0.05, y + 0.13, 0.45, 0.012, { color: 0xc8a020 });
  beakOf(b, [0, y + 0.1, 0.47], 0.1, 0.032, 0xe8b830, { hook: true, droop: 0.05, deep: 1.25 });
  openWing(b, 1, { sh: [0.08, y + 0.02, 0.08], span: 2.0, chord: 0.38, color: brown, tip: 0x241810, under: 0x4a3a2a, sweep: 0.08, fingers: 5, thick: 0.03 });
  openWing(b, -1, { sh: [0.08, y + 0.02, 0.08], span: 2.0, chord: 0.38, color: brown, tip: 0x241810, under: 0x4a3a2a, sweep: 0.08, fingers: 5, thick: 0.03 });
  foldedWings(b, { x: 0.13, y: y + 0.03, z0: 0.16, z1: -0.5, h: 0.12, color: brown, tip: 0x241810 });
  tailFan(b, [0, y, -0.3], 0.26, 0.2, white);
  restLegs(b, { x: 0.06, hip: y - 0.06, z: 0.0, r: 0.02, toe: 0.06, color: 0xe0b030 });
  return b.build();
}

export function ravenModel() {
  const b = new OrganicBuilder();
  const black = toRgb(0x111114);
  const sheen = (p, n, c) => mixRgb(c, toRgb(0x2a3448), smooth01((n[1] - 0.3) / 0.5) * 0.6);
  b.loft([R(-0.22, 0, 0.04, 0.035, 0.035), R(-0.14, 0, 0.07, 0.065, 0.065), R(0.02, 0.005, 0.09, 0.085, 0.09), R(0.16, 0.015, 0.08, 0.08, 0.08), R(0.24, 0.025, 0.055, 0.06, 0.06)], { seg: 12, color: black, colorFn: sheen, capLen0: 0.03, capLen1: 0.02 });
  b.ellipsoid([0, 0.04, 0.28], [0.05, 0.055, 0.065], { color: black, colorFn: sheen, seg: 10, rings: 5 });
  eyes(b, 0.035, 0.06, 0.31, 0.007, {});
  beakOf(b, [0, 0.035, 0.32], 0.08, 0.022, 0x0a0a0a, { droop: 0.012, deep: 1.3 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.05, 0.01, 0.06], span: 1.15, chord: 0.24, color: black, under: 0x18181c, sweep: 0.08, fingers: 4, thick: 0.018 });
  foldedWings(b, { x: 0.08, y: 0.02, z0: 0.1, z1: -0.3, h: 0.07, color: black, colorFn: sheen });
  tailFan(b, [0, 0, -0.2], 0.2, 0.12, black, { wedge: true });
  return b.build();
}

export function gullModel() {
  // a glaucous-winged gull: white, a pale grey mantle, wingtips of that
  // grey a shade darker (not black, as most gulls'), a red spot on the
  // yellow bill; it floats with its origin at the waterline
  const b = new OrganicBuilder();
  const white = toRgb(0xf4f4f0);
  const grey = toRgb(0xa8b0b8);
  const y = 0.08;
  const mantle = (p, n, c) => mixRgb(c, grey, smooth01((n[1] - 0.45) / 0.3) * smooth01((0.18 - p[2]) / 0.1));
  b.loft([R(-0.24, y + 0.01, 0.04, 0.035, 0.035), R(-0.15, y, 0.075, 0.065, 0.07), R(0.0, y, 0.09, 0.085, 0.09), R(0.14, y + 0.01, 0.08, 0.08, 0.085), R(0.22, y + 0.03, 0.055, 0.055, 0.06)], { seg: 12, color: white, colorFn: mantle, capLen0: 0.03, capLen1: 0.02 });
  b.ellipsoid([0, y + 0.07, 0.26], [0.048, 0.05, 0.062], { color: white, seg: 10, rings: 5 });
  eyes(b, 0.032, y + 0.09, 0.29, 0.007, { color: 0x1a1810 });
  beakOf(b, [0, y + 0.065, 0.31], 0.07, 0.016, 0xe8c030, { droop: 0.012, deep: 1.25, hook: true });
  b.ellipsoid([0, y + 0.05, 0.355], [0.008, 0.008, 0.008], { seg: 5, rings: 3, color: 0xc0201a, jitter: 0 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.05, y + 0.02, 0.05], span: 1.3, chord: 0.2, color: grey, tip: 0x8a9299, tipFrom: 0.78, under: white, sweep: 0.12, thick: 0.016 });
  foldedWings(b, { x: 0.08, y: y + 0.04, z0: 0.08, z1: -0.32, h: 0.06, color: grey, tip: 0x8a9299, tipFrom: 0.7 });
  tailFan(b, [0, y + 0.02, -0.2], 0.12, 0.1, white);
  return b.build();
}

export function gooseModel() {
  // a Canada goose: black neck and head, the white chin strap, a pale breast
  const b = new OrganicBuilder();
  const body = toRgb(0x8a7a64);
  const black = toRgb(0x151515);
  const y = 0.09;
  const plumage = chain(countershade(body, 0xd8d0c0, y - 0.04, y + 0.06, 1.0), (p, n, c) => {
    // pale scalloped edges on the back feathers, a white rump under the tail
    const sc = 0.9 + 0.1 * Math.abs(Math.sin(p[2] * 60 + Math.sin(p[0] * 50)));
    const rump = smooth01((-p[2] - 0.3) / 0.06) * smooth01((-n[1] + 0.1) / 0.4);
    return mixRgb([c[0] * sc, c[1] * sc, c[2] * sc], [0.95, 0.95, 0.92], rump);
  }, (p, n, c) => mixRgb(c, toRgb(0xe2dccf), smooth01((p[2] - 0.12) / 0.1) * smooth01((-n[1] + 0.2) / 0.4)));
  b.loft([R(-0.42, y + 0.03, 0.05, 0.04, 0.04), R(-0.32, y + 0.02, 0.11, 0.1, 0.1), R(-0.08, y, 0.15, 0.13, 0.13), R(0.14, y + 0.01, 0.15, 0.13, 0.13), R(0.28, y + 0.04, 0.1, 0.1, 0.1)], { seg: 14, color: body, colorFn: plumage, capLen0: 0.04, capLen1: 0.04 });
  const neck = { limb: 12, pivot: [0, y + 0.08, 0.28] };
  const head = { limb: 13, pivot: [0, y + 0.48, 0.48] };
  b.tube([[0, y + 0.08, 0.28], [0, y + 0.22, 0.36], [0, y + 0.36, 0.4], [0, y + 0.46, 0.44]], [0.045, 0.038, 0.033, 0.032], { seg: 10, sub: 1, color: black, cap0: 'round', cap1: 'round', ...neck });
  b.ellipsoid([0, y + 0.48, 0.48], [0.038, 0.042, 0.06], { color: black, seg: 10, rings: 5, ...head, colorFn: (p, n, c) => mixRgb(c, toRgb(0xf2f0ea), smooth01((Math.abs(p[0]) - 0.025) / 0.008) * smooth01((p[1] - (y + 0.44)) / 0.015) * smooth01((y + 0.5 - p[1]) / 0.015)) });
  eyes(b, 0.03, y + 0.5, 0.5, 0.006, head);
  beakOf(b, [0, y + 0.47, 0.53], 0.06, 0.018, 0x101010, { flat: true, deep: 0.7, ...head });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.06, y + 0.04, 0.12], span: 1.65, chord: 0.3, color: 0x7a6a56, tip: 0x3a3430, tipFrom: 0.72, under: 0xb8ae9c, sweep: 0.14, thick: 0.022 });
  foldedWings(b, { x: 0.11, y: y + 0.06, z0: 0.14, z1: -0.42, h: 0.09, color: 0x76664f, tip: 0x2e2a26, tipFrom: 0.72 });
  tailFan(b, [0, y + 0.04, -0.36], 0.12, 0.12, black);
  return withNeck(b.build(), neck, head);
}

export function duckModel() {
  // a mallard drake: green head, white collar, chestnut breast, grey flanks
  const b = new OrganicBuilder();
  const grey = toRgb(0xa29c90);
  const y = 0.08;
  const plumage = (p, n, c) => {
    let out = mixRgb(c, toRgb(0x5a3424), smooth01((p[2] - 0.1) / 0.05)); // chestnut breast
    out = mixRgb(out, toRgb(0x2a2a2a), smooth01((-p[2] - 0.2) / 0.04)); // black stern
    const fine = 0.94 + 0.06 * Math.sin(p[1] * 300);
    return [out[0] * fine, out[1] * fine, out[2] * fine];
  };
  b.loft([R(-0.27, y + 0.03, 0.04, 0.03, 0.03), R(-0.2, y + 0.02, 0.09, 0.075, 0.07), R(-0.02, y, 0.12, 0.1, 0.1), R(0.12, y + 0.01, 0.12, 0.1, 0.1), R(0.21, y + 0.03, 0.08, 0.08, 0.08)], { seg: 12, color: grey, colorFn: plumage, capLen0: 0.03, capLen1: 0.03 });
  // the curled black feathers over the tail
  b.tube([[0, y + 0.06, -0.24], [0, y + 0.1, -0.26], [0, y + 0.11, -0.22]], [0.008, 0.007, 0.004], { seg: 5, color: 0x161616, cap1: 'round' });
  const neck = { limb: 12, pivot: [0, y + 0.06, 0.18] };
  const head = { limb: 13, pivot: [0, y + 0.17, 0.24] };
  b.tube([[0, y + 0.06, 0.18], [0, y + 0.13, 0.22]], [0.045, 0.042], { seg: 10, color: 0xf4f4f0, cap0: 'open', cap1: 'open', ...neck });
  b.ellipsoid([0, y + 0.17, 0.24], [0.05, 0.055, 0.07], { color: 0x1f5a2a, seg: 10, rings: 5, ...head, colorFn: (p, n, c) => mixRgb(c, toRgb(0x2a7a5a), smooth01((n[1] - 0.2) / 0.5) * 0.6) });
  eyes(b, 0.038, y + 0.19, 0.27, 0.006, head);
  beakOf(b, [0, y + 0.155, 0.3], 0.06, 0.02, 0xe0c030, { flat: true, deep: 0.55, droop: 0.01, ...head });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.05, y + 0.04, 0.08], span: 0.88, chord: 0.17, color: 0x7a746a, tip: 0x5a5650, tipFrom: 0.75, under: 0xd8d4cc, sweep: 0.1, thick: 0.014, band: [0x2a50a0, 0.32] });
  foldedWings(b, { x: 0.09, y: y + 0.06, z0: 0.1, z1: -0.22, h: 0.055, color: 0x6e685e, tip: 0x3a3a3a, tipFrom: 0.75, colorFn: (p, n, c) => mixRgb(c, toRgb(0x2a50a0), smooth01(1 - Math.abs(p[2] + 0.07) / 0.03) * 0.8) });
  return withNeck(b.build(), neck, head);
}

export function loonModel() {
  // a common loon: low in the water, black head, white necklace, a back
  // chequered black and white
  const b = new OrganicBuilder();
  const black = toRgb(0x16181a);
  const back = (p, n, c) => {
    const top = smooth01((n[1] - 0.15) / 0.3);
    const chk = Math.sin(p[0] * 150) * Math.sin(p[2] * 120) > 0.5 ? 1 : 0;
    let out = mixRgb(c, toRgb(0xe8e8e0), top * chk * 0.75);
    out = mixRgb(out, toRgb(0xf0f0ea), smooth01((-n[1] - 0.25) / 0.3));
    return out;
  };
  b.loft([R(-0.38, 0.05, 0.05, 0.04, 0.04), R(-0.28, 0.04, 0.11, 0.08, 0.09), R(-0.05, 0.03, 0.15, 0.1, 0.11), R(0.16, 0.04, 0.13, 0.09, 0.1), R(0.26, 0.07, 0.08, 0.07, 0.08)], { seg: 12, color: black, colorFn: back, capLen0: 0.04, capLen1: 0.03 });
  const neck = { limb: 12, pivot: [0, 0.09, 0.26] };
  const head = { limb: 13, pivot: [0, 0.22, 0.43] };
  b.tube([[0, 0.09, 0.26], [0, 0.16, 0.34], [0, 0.2, 0.4]], [0.05, 0.045, 0.045], { seg: 10, sub: 1, color: 0x15201a, cap0: 'round', cap1: 'round', ...neck, colorFn: (p, n, c) => mixRgb(c, toRgb(0xe8e8e0), (Math.sin(p[1] * 400) > 0.4 ? 1 : 0) * smooth01(1 - Math.abs(p[1] - 0.15) / 0.03) * smooth01((Math.abs(n[0]) - 0.4) / 0.3)) });
  b.ellipsoid([0, 0.22, 0.43], [0.045, 0.05, 0.065], { color: 0x15201a, seg: 10, rings: 5, ...head });
  eyes(b, 0.032, 0.24, 0.46, 0.007, { color: 0x9a1a14, ...head });
  beakOf(b, [0, 0.215, 0.49], 0.1, 0.018, 0x111111, { droop: 0.005, ...head });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.06, 0.07, 0.06], span: 1.25, chord: 0.2, color: black, under: 0xe8e8e0, sweep: 0.1, thick: 0.016 });
  foldedWings(b, { x: 0.11, y: 0.07, z0: 0.08, z1: -0.34, h: 0.055, color: black, colorFn: back });
  tailFan(b, [0, 0.05, -0.36], 0.06, 0.08, black);
  return withNeck(b.build(), neck, head);
}

export function puffinModel() {
  // a tufted puffin: all black, a white face, golden tufts sweeping back
  // from behind the eyes, the big orange-red bill, orange feet trailed
  // behind in flight
  const b = new OrganicBuilder();
  const black = toRgb(0x151413);
  const white = toRgb(0xf2efe6);
  b.loft([R(-0.15, 0, 0.035, 0.03, 0.03), R(-0.08, 0, 0.07, 0.065, 0.07), R(0.04, 0.005, 0.08, 0.075, 0.08), R(0.12, 0.02, 0.065, 0.065, 0.07)], { seg: 12, color: black, colorFn: (p, n, c) => mixRgb(c, toRgb(0x2c2925), smooth01((-n[1] + 0.1) / 0.5)), capLen0: 0.02, capLen1: 0.02 });
  // the white mask on the sides of the face; crown, nape and throat black
  b.ellipsoid([0, 0.05, 0.16], [0.05, 0.052, 0.055], { color: black, seg: 10, rings: 5, colorFn: (p, n, c) => mixRgb(c, white, smooth01((Math.abs(n[0]) - 0.35) / 0.2) * smooth01((0.55 - n[1]) / 0.2) * smooth01((n[1] + 0.35) / 0.2) * smooth01((p[2] - 0.135) / 0.02)) });
  eyes(b, 0.039, 0.066, 0.18, 0.006, { color: 0xd8d4c0 });
  // the tufts: from behind each eye back over the nape and down
  for (const s of [-1, 1]) b.tube([[s * 0.036, 0.072, 0.165], [s * 0.042, 0.068, 0.12], [s * 0.04, 0.05, 0.085], [s * 0.034, 0.028, 0.07]], [0.009, 0.008, 0.006, 0.003], { seg: 6, sub: 1, color: 0xe2c25a, cap0: 'round', cap1: 'point', jitter: 0.03 });
  beakOf(b, [0, 0.045, 0.2], 0.055, 0.03, 0xf06a1a, { flat: true, deep: 1.6, droop: 0.014, cols: [toRgb(0xd8c450), toRgb(0xf05a1a), toRgb(0xd8401a)] });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.04, 0.02, 0.04], span: 0.58, chord: 0.1, color: black, under: 0x2a2826, sweep: 0.06, thick: 0.012 });
  foldedWings(b, { x: 0.06, y: 0.025, z0: 0.06, z1: -0.15, h: 0.045, color: black });
  tailFan(b, [0, 0.01, -0.14], 0.05, 0.06, black);
  // the feet, trailed under the tail
  for (const s of [-1, 1]) b.tube([[s * 0.025, -0.035, -0.1], [s * 0.03, -0.04, -0.15], [s * 0.034, -0.042, -0.18]], [[0.008, 0.004, 0.004], [0.014, 0.003, 0.003], [0.016, 0.002, 0.002]], { seg: 6, color: 0xf07a28, cap0: 'round', cap1: 'round', jitter: 0.03 });
  return b.build();
}

export function ptarmiganModel() {
  // a willow ptarmigan in summer: mottled brown, white wings and belly; its
  // origin at its feet, so it stands on the ground
  const b = new OrganicBuilder();
  const brown = toRgb(0x8a6a48);
  const white = toRgb(0xf0ece4);
  const y = 0.11;
  const plumage = chain(countershade(brown, white, y - 0.06, y - 0.01, 1.0), (p, n, c) => {
    const m = noise3(p[0] * 60, p[1] * 60, p[2] * 60);
    const k = 0.78 + m * 0.4;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  b.loft([R(-0.16, y, 0.04, 0.035, 0.035), R(-0.1, y, 0.08, 0.07, 0.07), R(0.02, y, 0.1, 0.09, 0.09), R(0.1, y + 0.02, 0.08, 0.08, 0.08), R(0.15, y + 0.04, 0.05, 0.05, 0.05)], { seg: 12, color: brown, colorFn: plumage, capLen0: 0.02, capLen1: 0.02 });
  b.ellipsoid([0, y + 0.07, 0.15], [0.042, 0.045, 0.05], { color: 0x7a5838, seg: 10, rings: 5, colorFn: plumage });
  // the red comb over the eye
  for (const s of [-1, 1]) b.ellipsoid([s * 0.03, y + 0.1, 0.16], [0.008, 0.006, 0.014], { seg: 5, rings: 3, color: 0xc02a1a, jitter: 0 });
  eyes(b, 0.033, y + 0.085, 0.17, 0.006, {});
  beakOf(b, [0, y + 0.065, 0.19], 0.025, 0.012, 0x1a1612, { droop: 0.008, deep: 1.2 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.04, y + 0.02, 0.04], span: 0.62, chord: 0.13, color: white, under: white, sweep: 0.05, thick: 0.014 });
  foldedWings(b, { x: 0.075, y: y + 0.015, z0: 0.06, z1: -0.14, h: 0.05, color: brown, tip: white, tipFrom: 0.55, colorFn: plumage });
  tailFan(b, [0, y + 0.005, -0.14], 0.06, 0.07, 0x2a2018);
  // feathered white feet
  restLegs(b, { x: 0.03, hip: y - 0.05, z: 0.01, r: 0.012, toe: 0.025, color: 0xe8e4dc });
  return b.build();
}

export function swanModel() {
  // a trumpeter swan: all white, the long neck, a black bill
  const b = new OrganicBuilder();
  const white = toRgb(0xf6f6f2);
  const y = 0.12;
  b.loft([R(-0.5, y + 0.05, 0.06, 0.05, 0.05), R(-0.38, y + 0.03, 0.17, 0.13, 0.12), R(-0.1, y, 0.25, 0.18, 0.18), R(0.2, y + 0.01, 0.23, 0.17, 0.18), R(0.36, y + 0.04, 0.15, 0.13, 0.14)], { seg: 14, color: white, capLen0: 0.05, capLen1: 0.05, colorFn: (p, n, c) => mixRgb(c, toRgb(0xe6e4dc), smooth01((-n[1] - 0.1) / 0.5) * 0.5) });
  // the neck in an S, the head held level
  const neck = { limb: 12, pivot: [0, y + 0.08, 0.36] };
  const head = { limb: 13, pivot: [0, y + 0.64, 0.52] };
  b.tube([[0, y + 0.08, 0.36], [0, y + 0.3, 0.42], [0, y + 0.52, 0.42], [0, y + 0.62, 0.48]], [0.055, 0.045, 0.04, 0.038], { seg: 10, sub: 2, color: white, cap0: 'round', cap1: 'round', ...neck });
  b.ellipsoid([0, y + 0.64, 0.52], [0.045, 0.05, 0.075], { color: white, seg: 10, rings: 5, ...head });
  eyes(b, 0.034, y + 0.66, 0.55, 0.006, head);
  beakOf(b, [0, y + 0.625, 0.58], 0.1, 0.026, 0x111111, { flat: true, deep: 0.6, droop: 0.02, ...head });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.08, y + 0.08, 0.12], span: 2.25, chord: 0.38, color: white, tip: 0xeeeeea, under: 0xececE8, sweep: 0.14, thick: 0.03 });
  foldedWings(b, { x: 0.18, y: y + 0.1, z0: 0.24, z1: -0.46, h: 0.12, color: white, t: 0.02 });
  tailFan(b, [0, y + 0.06, -0.48], 0.1, 0.16, white);
  return withNeck(b.build(), neck, head);
}

export function craneModel() {
  // a sandhill crane: grey, a red crown, long legs that walk (limbs 10
  // and 11) and trail behind in flight; its origin at its feet
  const b = new OrganicBuilder();
  const grey = toRgb(0x8c8a84);
  const y = 1.0;
  const plumage = (p, n, c) => mixRgb(c, toRgb(0x9a7a5a), smooth01((n[1] - 0.4) / 0.4) * 0.35); // rusty wash on the back
  b.loft([R(-0.3, y, 0.06, 0.05, 0.05), R(-0.2, y, 0.12, 0.12, 0.12), R(0.02, y, 0.16, 0.16, 0.16), R(0.18, y + 0.03, 0.14, 0.14, 0.15), R(0.28, y + 0.06, 0.08, 0.09, 0.09)], { seg: 12, color: grey, colorFn: plumage, capLen0: 0.04, capLen1: 0.03 });
  // the bustle of drooping feathers over the tail
  b.ellipsoid([0, y - 0.02, -0.34], [0.1, 0.07, 0.14], { rot: [0.5, 0, 0], color: 0x6e6c68, limb: 6, pivot: [0, y, -0.28] });
  const neck = { limb: 12, pivot: [0, y + 0.06, 0.26] };
  const head = { limb: 13, pivot: [0, y + 0.58, 0.47] };
  b.tube([[0, y + 0.06, 0.26], [0, y + 0.28, 0.32], [0, y + 0.48, 0.38], [0, y + 0.56, 0.44]], [0.045, 0.032, 0.028, 0.03], { seg: 10, sub: 1, color: grey, ...neck, cap0: 'round', cap1: 'round' });
  b.ellipsoid([0, y + 0.58, 0.47], [0.035, 0.04, 0.055], { color: 0xd8d6d0, seg: 10, rings: 5, ...head, colorFn: (p, n, c) => mixRgb(c, toRgb(0xc0201a), smooth01((p[1] - (y + 0.6)) / 0.01) * smooth01((p[2] - 0.45) / 0.02)) });
  eyes(b, 0.026, y + 0.6, 0.49, 0.006, { ...head, color: 0xc8901a });
  beakOf(b, [0, y + 0.575, 0.51], 0.13, 0.014, 0x2a2a2a, { ...head, droop: 0.03 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.07, y + 0.04, 0.08], span: 1.95, chord: 0.32, color: grey, tip: 0x4a4a48, tipFrom: 0.7, under: 0xb0aea8, sweep: 0.1, fingers: 5, thick: 0.022 });
  foldedWings(b, { x: 0.12, y: y + 0.05, z0: 0.14, z1: -0.34, h: 0.1, color: grey, tip: 0x5a5a58, tipFrom: 0.65 });
  // legs: thighs in the body, long dark shanks, spread toes
  for (const [limb, s] of [
    [10, 1],
    [11, -1],
  ]) {
    const x = s * 0.06;
    const piv = [x, y - 0.04, 0.02];
    b.tube([[x, y - 0.04, 0.02], [x, y - 0.42, 0.0], [x, 0.03, 0.02]], [0.02, 0.012, 0.011], { seg: 6, color: 0x2a2a2a, cap1: 'round', limb, pivot: piv, jitter: 0 });
    for (const a of [-0.5, 0, 0.5]) b.tube([[x, 0.02, 0.02], [x + Math.sin(a) * 0.09, 0.012, 0.02 + Math.cos(a) * 0.09]], [0.008, 0.005], { seg: 4, color: 0x2a2a2a, cap0: 'flat', cap1: 'round', limb, pivot: piv, jitter: 0 });
  }
  return withNeck(b.build(), neck, head);
}

export function magpieModel() {
  // a black-billed magpie: black, white belly and shoulders, the long
  // green-blue tail; its origin at its feet
  const b = new OrganicBuilder();
  const black = toRgb(0x0e0e12);
  const white = toRgb(0xf4f4f0);
  const y = 0.1;
  b.loft([R(-0.12, y, 0.035, 0.03, 0.03), R(-0.06, y, 0.06, 0.055, 0.055), R(0.04, y + 0.005, 0.065, 0.06, 0.065), R(0.11, y + 0.02, 0.05, 0.05, 0.055)], { seg: 12, color: black, colorFn: (p, n, c) => mixRgb(c, white, smooth01((-n[1] + 0.1) / 0.35) * smooth01((0.07 - p[2]) / 0.04)), capLen0: 0.02, capLen1: 0.02 });
  b.ellipsoid([0, y + 0.05, 0.15], [0.038, 0.04, 0.048], { color: black, seg: 10, rings: 5 });
  eyes(b, 0.028, y + 0.065, 0.17, 0.005, {});
  beakOf(b, [0, y + 0.048, 0.19], 0.045, 0.012, 0x0a0a0a, { droop: 0.008, deep: 1.2 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.04, y + 0.01, 0.04], span: 0.6, chord: 0.12, color: 0x101418, tip: white, tipFrom: 0.55, under: 0x202024, sweep: 0.06, thick: 0.012 });
  foldedWings(b, { x: 0.058, y: y + 0.02, z0: 0.06, z1: -0.14, h: 0.045, color: 0x12161a, colorFn: (p, n, c) => mixRgb(c, white, smooth01(1 - Math.abs(p[2] - 0.0) / 0.03) * 0.9) });
  tailFan(b, [0, y + 0.01, -0.12], 0.3, 0.07, 0x1a2a3a, { wedge: true, colorFn: (p, n, c) => mixRgb(c, toRgb(0x2a5a4a), smooth01((n[1] - 0.3) / 0.5) * 0.5) });
  restLegs(b, { x: 0.025, hip: y - 0.04, z: 0.0, r: 0.006, toe: 0.025, color: 0x111111 });
  return b.build();
}

export function kingfisherModel() {
  // a belted kingfisher: blue-grey, a ragged crest, a white collar and a
  // blue band across the breast, the big dagger bill
  const b = new OrganicBuilder();
  const blue = toRgb(0x44607e);
  const white = toRgb(0xf4f4f0);
  b.loft([R(-0.1, 0, 0.03, 0.025, 0.025), R(-0.05, 0, 0.05, 0.045, 0.05), R(0.04, 0.005, 0.055, 0.05, 0.055), R(0.09, 0.015, 0.045, 0.045, 0.05)], { seg: 12, color: blue, colorFn: (p, n, c) => mixRgb(c, white, smooth01((-n[1] + 0.05) / 0.35) * (1 - smooth01(1 - Math.abs(p[2] - 0.05) / 0.02))), capLen0: 0.02, capLen1: 0.02 });
  b.tube([[0, 0.02, 0.08], [0, 0.04, 0.1]], [0.04, 0.042], { seg: 10, color: white, cap0: 'open', cap1: 'open' });
  b.ellipsoid([0, 0.05, 0.12], [0.04, 0.042, 0.048], { color: blue, seg: 10, rings: 5 });
  // the ragged crest
  for (let k = 0; k < 3; k++) b.tube([[0, 0.085, 0.13 - k * 0.025], [0, 0.11 - k * 0.006, 0.1 - k * 0.03]], [0.012, 0.003], { seg: 4, color: 0x3a5270, cap0: 'flat', cap1: 'point', capLen1: 0.006, jitter: 0 });
  eyes(b, 0.03, 0.06, 0.14, 0.005, {});
  beakOf(b, [0, 0.048, 0.16], 0.07, 0.014, 0x1a1a1a, { deep: 1.2 });
  for (const s of [-1, 1]) openWing(b, s, { sh: [0.035, 0.01, 0.03], span: 0.5, chord: 0.1, color: blue, tip: 0x2a3a4e, tipFrom: 0.65, under: 0xe8e8e4, sweep: 0.05, thick: 0.01 });
  foldedWings(b, { x: 0.05, y: 0.02, z0: 0.05, z1: -0.1, h: 0.04, color: blue, tip: 0x2a3a4e });
  tailFan(b, [0, 0.005, -0.09], 0.07, 0.05, blue);
  return b.build();
}

export function whaleModel() {
  // a humpback: knobbly head, long white flippers, pale grooved throat
  const b = new OrganicBuilder();
  const grey = toRgb(0x283038);
  const pale = toRgb(0xd8dcd8);
  const skin = chain((p, n, c) => {
    // pale under the throat and belly, with the grooves running back
    const under = smooth01((-n[1] - 0.15) / 0.5) * smooth01((p[2] + 1.0) / 2.5);
    const groove = 0.82 + 0.18 * Math.abs(Math.sin(p[0] * 22));
    return mixRgb(c, [pale[0] * groove, pale[1] * groove, pale[2] * groove], under);
  }, mottle(1.2, 0.12));
  b.loft([R(-6.6, 0.0, 0.32, 0.3, 0.3), R(-5.6, 0.0, 0.62, 0.6, 0.62), R(-4.0, 0.05, 1.05, 0.98, 1.0), R(-1.8, 0.05, 1.42, 1.25, 1.3), R(0.6, 0.0, 1.55, 1.25, 1.4), R(2.8, -0.1, 1.4, 1.05, 1.35), R(4.6, -0.25, 1.05, 0.72, 1.05), R(5.8, -0.35, 0.62, 0.42, 0.6, null, 2.4), R(6.5, -0.45, 0.3, 0.22, 0.32)], { seg: 16, color: grey, colorFn: skin, capLen0: 0.3, capLen1: 0.35, jitter: 0.03 });
  // the knobs on the head (tubercles) and the small dorsal fin with its hump
  for (let i = 0; i < 12; i++) {
    const z = 4.4 + (i % 6) * 0.32;
    const x = (i < 6 ? 1 : -1) * (0.18 + (i % 3) * 0.12);
    b.ellipsoid([x, 0.42 - (z - 4.4) * 0.12, z], [0.07, 0.05, 0.07], { seg: 6, rings: 3, color: 0x20262c });
  }
  b.plate([[0, 0.22, 0], [0.3, 0.2, -0.1], [0.55, 0.1, -0.25], [0.7, 0.03, -0.38]], 0.08, { matrix: mat([0, 1.1, -2.6], [0, 0, Math.PI / 2]), color: grey, seg: 8 });
  // the long flippers, white below and on their leading edge
  for (const s of [-1, 1]) {
    const fl = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      fl.push([t * 3.6, 0.42 * (1 - t * 0.75) + 0.06, -t * 0.9]);
    }
    b.plate(fl, 0.09, { matrix: mat([s * 1.2, -0.55, 2.2], [0, s * -0.35, s * -0.4], [s, 1, 1]), color: pale, seg: 8, colorFn: (p, n, c) => mixRgb(c, grey, smooth01((n[1] - 0.2) / 0.5) * 0.75) });
  }
  // the tail stock and flukes swing together (limb 6): the flukes flat,
  // reaching out to either side and swept back, one the other's mirror
  const tp = [0, 0, -5.2];
  for (const s of [-1, 1]) b.plate([[0, 0.25, 0], [0.8, 0.55, -0.25], [1.7, 0.6, -0.55], [2.5, 0.35, -0.95], [2.9, 0.1, -1.25]], 0.08, { matrix: mat([0, 0, -6.9], [0, 0, 0], [s, 1, 1]), color: grey, seg: 8, limb: 6, pivot: tp });
  return b.build();
}

export function orcaModel() {
  const b = new OrganicBuilder();
  const black = toRgb(0x0f1113);
  const white = toRgb(0xf2f2ee);
  const markings = (p, n, c) => {
    // the white belly sweeping up the flank behind, the eye patch, the grey saddle
    const belly = smooth01((-p[1] - 0.15 + Math.max(0, -p[2] - 0.5) * 0.25) / 0.12) * smooth01((p[2] + 2.6) / 0.6) * smooth01((3.1 - p[2]) / 0.4);
    const eye = smooth01(1 - Math.hypot((Math.abs(p[0]) - 0.72) / 0.12, (p[1] - 0.32) / 0.14, (p[2] - 2.25) / 0.45));
    const saddle = smooth01((p[1] - 0.6) / 0.15) * smooth01(1 - Math.abs(p[2] + 0.9) / 0.6) * 0.75;
    let out = mixRgb(c, white, Math.max(belly, eye > 0.5 ? 1 : eye * 2));
    out = mixRgb(out, toRgb(0x8a9096), saddle);
    return out;
  };
  b.loft([R(-4.0, 0.0, 0.2, 0.22, 0.2), R(-3.4, 0.0, 0.42, 0.45, 0.42), R(-2.2, 0.0, 0.8, 0.78, 0.76), R(-0.8, 0.0, 1.0, 0.98, 0.95), R(0.6, 0.0, 1.02, 1.0, 0.98), R(1.8, -0.05, 0.92, 0.85, 0.9), R(2.7, -0.12, 0.7, 0.6, 0.72), R(3.3, -0.18, 0.42, 0.36, 0.45), R(3.6, -0.22, 0.22, 0.18, 0.24)], { seg: 16, color: black, colorFn: markings, capLen0: 0.2, capLen1: 0.2, jitter: 0.02 });
  // the tall dorsal fin
  b.plate([[0, 0.38, 0.05], [0.6, 0.3, -0.05], [1.2, 0.2, -0.2], [1.6, 0.1, -0.35], [1.8, 0.03, -0.45]], 0.07, { matrix: mat([0, 0.85, -0.3], [0, 0, Math.PI / 2]), color: black, seg: 8 });
  for (const s of [-1, 1]) b.plate([[0, 0.35, 0], [0.5, 0.33, -0.1], [0.9, 0.2, -0.25], [1.1, 0.06, -0.35]], 0.06, { matrix: mat([s * 0.85, -0.5, 1.5], [0, s * -0.4, s * -0.35], [s, 1, 1]), color: black, seg: 8 });
  const tp = [0, 0, -3.3];
  for (const s of [-1, 1]) b.plate([[0, 0.25, 0], [0.5, 0.42, -0.2], [1.1, 0.4, -0.45], [1.5, 0.15, -0.7]], 0.06, { matrix: mat([0, 0, -4.05], [0, 0, 0], [s, 1, 1]), color: black, seg: 8, limb: 6, pivot: tp });
  return b.build();
}

export function seaLionModel() {
  // a Steller sea lion bull: a heavy neck and chest, propped on its fore flippers
  const b = new OrganicBuilder();
  const brown = toRgb(0x8a6844);
  const coat = chain(countershade(brown, 0x6a4e34, 0.25, 0.4, 1.12, 0.55, 0.8), mottle(5, 0.14));
  b.loft([R(-1.32, 0.1, 0.12, 0.08, 0.08), R(-1.1, 0.16, 0.24, 0.16, 0.14), R(-0.6, 0.26, 0.38, 0.26, 0.24), R(-0.1, 0.34, 0.44, 0.32, 0.3), R(0.35, 0.46, 0.42, 0.38, 0.4), R(0.7, 0.6, 0.34, 0.36, 0.42), R(0.88, 0.72, 0.24, 0.26, 0.3)], { seg: 14, color: brown, colorFn: coat, capLen0: 0.08, capLen1: 0.1 });
  const hp = [0, 0.74, 0.8];
  const head = { limb: 5, pivot: hp };
  b.tube([[0, 0.7, 0.78], [0, 0.88, 0.94], [0, 0.98, 1.04]], [[0.2, 0.2, 0.22], [0.15, 0.15, 0.16], [0.12, 0.12, 0.12]], { seg: 12, sub: 1, color: brown, colorFn: coat, ...head });
  b.loft([R(1.0, 1.0, 0.13, 0.12, 0.12), R(1.1, 1.01, 0.13, 0.12, 0.11), R(1.22, 0.98, 0.09, 0.08, 0.08, 0x6a4c30), R(1.32, 0.95, 0.06, 0.055, 0.055, 0x4a3420, 2.2)], { seg: 12, color: brown, ...head, capLen0: 0.06, capLen1: 0.03 });
  eyes(b, 0.075, 1.05, 1.16, 0.016, head);
  // whiskers: a few pale strokes on the muzzle
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.tube([[s * 0.05, 0.96 - k * 0.012, 1.3], [s * 0.15, 0.95 - k * 0.03, 1.28]], [0.003, 0.001], { seg: 3, color: 0xe8e0c8, cap0: 'flat', cap1: 'point', capLen1: 0.003, ...head, jitter: 0 });
  // fore flippers prop the chest up; hind flippers trail
  for (const s of [-1, 1]) {
    const limb = s > 0 ? 1 : 2;
    const piv = [s * 0.3, 0.5, 0.62];
    // broad and flat, the flat side out, down from the shoulder to the ground
    b.tube([[s * 0.28, 0.52, 0.62], [s * 0.37, 0.3, 0.68], [s * 0.43, 0.08, 0.74]], [[0.11, 0.07, 0.07], [0.1, 0.035, 0.035], [0.11, 0.018, 0.018]], { seg: 8, sub: 1, color: brown, cols: [brown, toRgb(0x5e4430), toRgb(0x3e2c1c)], colorFn: mottle(5, 0.14), limb, pivot: piv, cap1: 'round', up: [0, 0, 1] });
    b.plate([[0, 0.07, 0], [0.12, 0.12, 0], [0.26, 0.11, 0], [0.38, 0.05, 0]], 0.018, { matrix: mat([s * 0.4, 0.05, 0.74], [0, s > 0 ? -1.1 : Math.PI + 1.1, 0.0]), color: 0x3e2c1c, limb, pivot: piv, seg: 8 });
    b.plate([[0, 0.05, 0], [0.16, 0.09, 0], [0.32, 0.1, 0], [0.4, 0.04, 0]], 0.014, { matrix: mat([s * 0.08, 0.06, -1.25], [0, s > 0 ? -2.0 : Math.PI + 2.0, 0]), color: 0x3e2c1c, limb: 6, pivot: [0, 0.1, -1.15], seg: 8 });
  }
  return b.build();
}

export function sealHeadModel() {
  // a harbour seal looking up out of the water: spotted grey, big dark eyes
  const b = new OrganicBuilder();
  const grey = toRgb(0x7a766c);
  const spots = chain(mottle(6, 0.12), (p, n, c) => {
    const s = noise3(p[0] * 26, p[1] * 26, p[2] * 26);
    return mixRgb(c, toRgb(0x3a3630), smooth01((s - 0.64) / 0.05) * 0.7);
  });
  b.loft([R(-0.7, -0.3, 0.18, 0.18, 0.18), R(-0.4, -0.18, 0.26, 0.26, 0.26), R(-0.05, -0.04, 0.27, 0.27, 0.27), R(0.12, 0.08, 0.22, 0.22, 0.22), R(0.24, 0.18, 0.17, 0.17, 0.17)], { seg: 14, color: grey, colorFn: spots, capLen0: 0.1, capLen1: 0.06 });
  b.loft([R(0.2, 0.2, 0.16, 0.16, 0.16), R(0.3, 0.22, 0.155, 0.15, 0.15), R(0.4, 0.2, 0.1, 0.1, 0.1, 0x6e6a62), R(0.46, 0.18, 0.07, 0.06, 0.06, 0x5a564e, 2.2)], { seg: 14, color: grey, colorFn: spots, capLen0: 0.08, capLen1: 0.03 });
  eyes(b, 0.085, 0.27, 0.36, 0.03, { yaw: 0.6 });
  for (const s of [-1, 1]) b.ellipsoid([s * 0.025, 0.21, 0.485], [0.012, 0.008, 0.008], { seg: 5, rings: 3, color: 0x1a1816, jitter: 0 });
  return b.build();
}

export function otterModel() {
  // a sea otter, built belly down; it floats on its back (the game rolls it
  // over), forepaws on its chest and a pale grizzled head
  const b = new OrganicBuilder();
  const fur = toRgb(0x4a3222);
  const pale = toRgb(0xc8b8a0);
  b.loft([R(-0.42, 0.0, 0.08, 0.06, 0.06), R(-0.3, 0.0, 0.14, 0.1, 0.1), R(-0.05, 0.0, 0.17, 0.12, 0.12), R(0.2, 0.0, 0.16, 0.12, 0.12), R(0.34, 0.02, 0.12, 0.1, 0.1)], { seg: 12, color: fur, colorFn: mottle(14, 0.16), capLen0: 0.06, capLen1: 0.04 });
  const hp = [0, 0.02, 0.32];
  const head = { limb: 5, pivot: hp };
  b.loft([R(0.34, 0.04, 0.1, 0.1, 0.1), R(0.42, 0.05, 0.105, 0.1, 0.1), R(0.5, 0.04, 0.075, 0.07, 0.07), R(0.55, 0.03, 0.05, 0.045, 0.045, 0x9a8a74)], { seg: 12, color: pale, colorFn: mottle(20, 0.2), ...head, capLen0: 0.05, capLen1: 0.02 });
  eyes(b, 0.055, 0.09, 0.48, 0.01, head);
  for (const s of [-1, 1]) b.ellipsoid([s * 0.085, 0.11, 0.38], [0.02, 0.018, 0.012], { seg: 6, rings: 3, color: 0x3a2a1c, ...head });
  // forepaws held on the chest (below in the model, up when it floats on its back)
  for (const s of [-1, 1]) b.tube([[s * 0.1, -0.06, 0.18], [s * 0.07, -0.14, 0.24], [s * 0.03, -0.15, 0.3]], [0.025, 0.02, 0.022], { seg: 6, color: 0x2e2016, cap1: 'round', limb: 5, pivot: [0, -0.02, 0.18] });
  // webbed hind feet and the thick tail
  for (const s of [-1, 1]) b.plate([[0, 0.03, 0], [0.08, 0.05, 0], [0.14, 0.04, 0]], 0.01, { matrix: mat([s * 0.08, -0.04, -0.4], [0, s > 0 ? -1.9 : Math.PI + 1.9, 0]), color: 0x2a1c12, seg: 6 });
  b.tube([[0, 0.0, -0.42], [0, 0.0, -0.56], [0, 0.0, -0.68]], [[0.06, 0.03, 0.03], [0.055, 0.025, 0.025], [0.035, 0.018, 0.018]], { seg: 8, color: 0x3a2618, cap0: 'flat', cap1: 'round', limb: 6, pivot: [0, 0, -0.4] });
  return b.build();
}

export function beaverModel() {
  const b = new OrganicBuilder();
  const fur = toRgb(0x4a3220);
  b.loft([R(-0.44, -0.02, 0.12, 0.1, 0.1), R(-0.3, 0.0, 0.2, 0.15, 0.15), R(-0.05, 0.0, 0.21, 0.16, 0.15), R(0.18, 0.02, 0.17, 0.14, 0.13), R(0.3, 0.04, 0.12, 0.11, 0.1)], { seg: 12, color: fur, colorFn: chain(countershade(fur, 0x6a4c34, -0.08, 0.02, 0.9, 0.05, 0.15), mottle(14, 0.16)), capLen0: 0.06, capLen1: 0.04 });
  b.loft([R(0.3, 0.06, 0.12, 0.11, 0.1), R(0.4, 0.07, 0.125, 0.11, 0.1), R(0.48, 0.05, 0.09, 0.08, 0.07, 0x3e2a1a), R(0.53, 0.03, 0.06, 0.05, 0.05, 0x3a2818)], { seg: 12, color: 0x3e2a1a, capLen0: 0.05, capLen1: 0.025 });
  // orange incisors, small round ears, dark eyes
  b.loft([R(0, 0, 0.018, 0.008, 0.008), R(0.022, 0, 0.018, 0.008, 0.008)], { seg: 6, cap0: 'flat', cap1: 'flat', matrix: mat([0, 0.005, 0.535], [Math.PI / 2, 0, 0]), color: 0xd88a2a, jitter: 0 });
  for (const s of [-1, 1]) b.ellipsoid([s * 0.09, 0.15, 0.36], [0.025, 0.025, 0.012], { seg: 6, rings: 3, color: 0x2a1a10 });
  eyes(b, 0.075, 0.11, 0.45, 0.012, {});
  // the flat, scaly paddle tail
  b.plate([[0, 0.06, 0], [0.08, 0.1, 0], [0.22, 0.11, 0], [0.32, 0.08, 0], [0.36, 0.03, 0]], 0.018, {
    matrix: mat([0, -0.02, -0.4], [0, Math.PI / 2, 0]),
    color: 0x2a2420,
    seg: 8,
    limb: 6,
    pivot: [0, 0, -0.4],
    colorFn: (p, n, c) => {
      const k = 0.85 + 0.15 * Math.abs(Math.sin(p[0] * 120) * Math.sin(p[2] * 120));
      return [c[0] * k, c[1] * k, c[2] * k];
    },
  });
  return b.build();
}

// Limb animation in the vertex shader, from the per-instance aAnim: x the
// gait's phase, y its amplitude, z the head's dip, w the tail's wag or the
// wings' beat. Legs (limbs 1 to 4) swing in diagonal pairs, the head (5)
// nods, the tail (6) wags, open wings (7 and 8) flap. A bird at rest is
// sent with w = -1: its open wings draw in to the shoulder and its folded
// wings and perching legs (9) show instead; a walking bird's legs (10, 11)
// stride on the ground and trail behind in flight.
const LIMB_GLSL = `
        attribute float aLimb;
        attribute vec3 aPivot;
        attribute vec4 aAnim;
        attribute vec3 aNeck;
        mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
        // a long neck nods at rest and swings forward in flight
        mat3 neckRot() { return aAnim.w < -0.5 ? rX(aAnim.z * 0.95 + sin(aAnim.x * 0.5) * 0.05 * aAnim.y) : rX(1.15); }
        mat3 limbRot() {
          float L = aLimb;
          if (L < 0.5) return mat3(1.0);
          float ph = aAnim.x;
          float amp = aAnim.y;
          float W = max(aAnim.w, 0.0);
          bool rest = aAnim.w < -0.5;
          if (L < 4.5) {
            float off = (L < 1.5 || L > 3.5) ? 0.0 : 3.14159;
            return rX(sin(ph + off) * amp * 0.62);
          }
          if (L < 5.5) return rX(aAnim.z * 0.95 + sin(ph * 0.5) * 0.05 * amp);
          if (L < 6.5) return rY(sin(ph * 1.7) * 0.35 * (0.25 + W)) * rX(W * sin(ph) * 0.4);
          if (L < 7.5) return rest ? mat3(1e-4) : rZ(sin(ph) * W + amp * 0.15);
          if (L < 8.5) return rest ? mat3(1e-4) : rZ(-sin(ph) * W - amp * 0.15);
          if (L < 9.5) return rest ? mat3(1.0) : mat3(1e-4);
          if (L < 11.5) {
            float off = L < 10.5 ? 0.0 : 3.14159;
            return rest ? rX(sin(ph + off) * amp * 0.62) : rX(1.35);
          }
          // 12 the neck; 13 the head on it, pivoting at its own centre: it
          // nods with the neck at rest and stays level in flight, carried to
          // the neck's end by limbShift
          return L < 12.5 || rest ? neckRot() : mat3(1.0);
        }
        // the head of a long neck moves with the neck's end: aNeck (per
        // instance, the same for the whole herd) runs from the neck's base to
        // the head's centre
        vec3 limbShift() { return aLimb > 12.5 ? neckRot() * aNeck - aNeck : vec3(0.0); }`;

function limbPatch(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>' + LIMB_GLSL)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = limbRot() * objectNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPivot + limbRot() * (transformed - aPivot) + limbShift();');
}

// Material with limb animation driven by the per-instance aAnim attribute.
export function animatedMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    limbPatch(shader);
    fxPatch(shader, mat);
  };
  return mat;
}

// The shadow of an animated herd: the same limbs, so a walking animal's
// shadow walks and a resting bird's shadow has its wings folded (one
// program shared by every herd that casts a shadow; no colour written, see
// casterDepthMaterial)
let depthMat = null;
export function animatedDepthMaterial() {
  if (depthMat) return depthMat;
  depthMat = casterDepthMaterial(new THREE.MeshDepthMaterial());
  depthMat.onBeforeCompile = function (shader) {
    limbPatch(shader);
    fxPatch(shader, this);
  };
  return depthMat;
}

// Instanced renderer for one species with per-instance animation data.
export class AnimatedHerd {
  // `far`: the same model in less detail (lowDetail), drawn instead while
  // the herd's nearest animal is far enough off to be small on screen
  constructor(geometry, capacity, { shadow = true, material, far = null } = {}) {
    this.capacity = capacity;
    const g = geometry;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    // a long-necked bird's neck, base to head (limb 13; zero for the rest)
    const nk = g.userData.neck || [0, 0, 0];
    const neck = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) neck.set(nk, i * 3);
    const neckAttr = new THREE.InstancedBufferAttribute(neck, 3);
    for (const geo of far ? [g, far] : [g]) {
      geo.setAttribute('aAnim', this.anim);
      geo.setAttribute('aNeck', neckAttr);
    }
    this.near = g;
    this.far = far;
    this.mesh = new THREE.InstancedMesh(g, material || animatedMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = shadow;
    if (shadow) this.mesh.customDepthMaterial = animatedDepthMaterial();
    this.mesh.receiveShadow = false;
    // culled as a whole by a sphere round this frame's animals (see end)
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere();
    g.computeBoundingSphere();
    this.reach = g.boundingSphere.center.length() + g.boundingSphere.radius;
    // the low detail from 28 times the model's radius away, where the whole
    // animal is some 6% of the view's height
    this.lodDist = g.boundingSphere.radius * 28;
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  // Write one instance: matrix from position/rotation/scale plus animation.
  push(matrix, phase, amp, head, extra) {
    if (this.n >= this.capacity) return;
    matrix.toArray(this.mesh.instanceMatrix.array, this.n * 16);
    const a = this.anim.array;
    a[this.n * 4] = phase;
    a[this.n * 4 + 1] = amp;
    a[this.n * 4 + 2] = head;
    a[this.n * 4 + 3] = extra;
    this.n++;
  }

  // `eye`: the camera's position, for the level of detail (without it, the
  // near detail)
  end(eye) {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.anim.clearUpdateRanges();
      this.anim.addUpdateRange(0, this.n * 4);
      this.anim.needsUpdate = true;
      // a sphere round this frame's animals, so a herd wholly out of view
      // (or out of the sun's shadow view) is not drawn at all; a little
      // over the model's reach, for heads, tails and wings swinging out
      const a = this.mesh.instanceMatrix.array;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < this.n; i++) {
        cx += a[i * 16 + 12];
        cy += a[i * 16 + 13];
        cz += a[i * 16 + 14];
      }
      cx /= this.n;
      cy /= this.n;
      cz /= this.n;
      let r = 0;
      let near = !eye;
      for (let i = 0; i < this.n; i++) {
        const o = i * 16;
        const sc = Math.hypot(a[o], a[o + 1], a[o + 2]);
        r = Math.max(r, Math.hypot(a[o + 12] - cx, a[o + 13] - cy, a[o + 14] - cz) + this.reach * sc * 1.15);
        if (!near && Math.hypot(a[o + 12] - eye.x, a[o + 13] - eye.y, a[o + 14] - eye.z) < this.lodDist * sc) near = true;
      }
      this.mesh.boundingSphere.center.set(cx, cy, cz);
      this.mesh.boundingSphere.radius = r;
      if (this.far) this.mesh.geometry = near ? this.near : this.far;
    }
  }

  // While the shadow maps are drawn, the herd is in its low detail (see
  // Wildlife): a shadow shows only an outline, softened, so the near detail
  // is spent only where it is seen. `on` false puts back this frame's choice.
  shadowDetail(on) {
    if (!this.far || !this.n) return;
    if (on) {
      this.seen = this.mesh.geometry;
      this.mesh.geometry = this.far;
    } else if (this.seen) {
      this.mesh.geometry = this.seen;
      this.seen = null;
    }
  }
}

// ---- more species -----------------------------------------------------------

// Beaver lodge: a dome of gnawed sticks and mud at the water's edge.
export function beaverLodgeGeometry() {
  const b = new ModelBuilder();
  b.sphere(1, 9, 6, { pos: [0, -0.2, 0], scale: [2.6, 1.3, 2.3], color: 0x4a3a2a, jitter: 0.18 });
  const rnd = (i) => Math.sin(i * 78.233) * 43758.5453 - Math.floor(Math.sin(i * 78.233) * 43758.5453);
  for (let i = 0; i < 70; i++) {
    const a = rnd(i) * Math.PI * 2;
    const r = 0.6 + rnd(i + 3) * 2.0;
    const y = 1.1 * Math.sqrt(Math.max(0, 1 - (r / 2.6) ** 2)) - 0.1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    const t = rnd(i + 11) * Math.PI;
    const len = 0.9 + rnd(i + 7) * 1.4;
    b.beam([x - Math.cos(t) * len * 0.5, y, z - Math.sin(t) * len * 0.5], [x + Math.cos(t) * len * 0.5, y + (rnd(i + 5) - 0.3) * 0.5, z + Math.sin(t) * len * 0.5], 0.035, 4, {
      color: i % 4 ? 0x7a6450 : 0xb8a888,
      jitter: 0.12,
    });
  }
  return b.build();
}
