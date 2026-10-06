// Tesla's statue at Bear Falls: the seated figure and his armchair, sculpted
// as distance fields and meshed (see util/sdfmesh.js), with the bronze's
// patina. On its own, free of the page, so the sculptor's worker can carve it
// off the main thread (workers/sculpt.js); world/tesla.js sets it in place.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothstep, clamp } from '../util/math.js';
import { sphere, ellipsoid, cone, roundBox, placed, frameAt, blend, carve, boxed, smax, meshSDFSteps } from '../util/sdfmesh.js';

const BRONZE = 0x6e5230;
const VERDIGRIS = 0x5a8a74;
const POLISHED = 0xc49a5c;

// ------------------------------------------------------------ helpers
function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// ------------------------------------------------------------ the statue
// Tesla seated in an armchair, reading the notes open on his lap, sculpted
// at life size (he was 1.88 m tall, and thin) as a distance field (see
// util/sdfmesh.js) in the chair's frame: the seat's front edge at the
// origin, the figure facing +z, his right hand toward -x. Three pieces are
// meshed, each as finely as it needs: the head, the hands with the notes,
// and the body with the chair. The statue is cast at one and a quarter
// times life size.
const HEAD_AT = [0, 1.232, -0.05];
const HEAD_TILT = 0.55;
const HEAD_SCALE = 1.08;

function headSDF() {
  // in the head's own frame: y up the face, z out of it. The hair is thick,
  // parted in the middle and combed straight back, in fine ridges.
  const hairShell = ellipsoid(0, 0.034, -0.018, 0.082, 0.104, 0.104);
  const n = [0, -0.5, 0.866];
  const parting = roundBox(0, 0.1, 0.03, 0.0022, 0.035, 0.07, 0.001);
  const hair = (x, y, z) => {
    let d = hairShell(x, y, z);
    // the hairline: nothing in front of a plane sloping up over the brow
    d = Math.max(d, n[1] * (y - 0.068) + n[2] * (z - 0.06));
    // combed back: ridges running front to back
    d += 0.0012 * Math.sin(x * 300);
    return smax(d, -parting(x, y, z), 0.003);
  };
  hair.b = hairShell.b;
  const face = blend([
    [ellipsoid(0, 0.02, -0.01, 0.072, 0.1, 0.093), 0],
    [ellipsoid(0, -0.042, 0.026, 0.056, 0.072, 0.068), 0.035],
    [ellipsoid(0, -0.1, 0.055, 0.024, 0.022, 0.026), 0.03],
    // a brow over each eye, and the bridge of the nose between them
    [ellipsoid(0.03, 0.026, 0.072, 0.03, 0.012, 0.022), 0.016],
    [ellipsoid(-0.03, 0.026, 0.072, 0.03, 0.012, 0.022), 0.016],
    [cone([0, 0.012, 0.082], [0, -0.034, 0.106], 0.009, 0.0145), 0.012],
    [ellipsoid(0.044, -0.014, 0.056, 0.022, 0.018, 0.02), 0.022],
    [ellipsoid(-0.044, -0.014, 0.056, 0.022, 0.018, 0.02), 0.022],
    [ellipsoid(0.073, -0.004, -0.008, 0.011, 0.029, 0.019), 0.008],
    [ellipsoid(-0.073, -0.004, -0.008, 0.011, 0.029, 0.019), 0.008],
    // the moustache, its ends turned down
    [cone([0.002, -0.05, 0.096], [0.036, -0.068, 0.08], 0.011, 0.0055), 0.005],
    [cone([-0.002, -0.05, 0.096], [-0.036, -0.068, 0.08], 0.011, 0.0055), 0.005],
    [hair, 0.008],
  ]);
  // the eyes deep under the brows, the hollow of the cheeks, the line of
  // the mouth
  const carved = carve(face, [
    [sphere(0.03, 0.008, 0.088, 0.016), 0.01],
    [sphere(-0.03, 0.008, 0.088, 0.016), 0.01],
    [ellipsoid(0.05, -0.05, 0.052, 0.012, 0.018, 0.01), 0.016],
    [ellipsoid(-0.05, -0.05, 0.052, 0.012, 0.018, 0.01), 0.016],
  ]);
  const eyes = blend([
    [carved, 0],
    [sphere(0.03, 0.006, 0.075, 0.0095), 0.004],
    [sphere(-0.03, 0.006, 0.075, 0.0095), 0.004],
  ]);
  const k = 1 / HEAD_SCALE;
  const scaled = (x, y, z) => eyes(x * k, y * k, z * k) * HEAD_SCALE;
  scaled.b = [0, 0.01 * HEAD_SCALE, 0, 0.16 * HEAD_SCALE];
  return placed(scaled, frameAt(HEAD_AT, [HEAD_TILT, 0, 0]));
}

// The hands round the edges of the notes, and the notes.
const ARMS = [
  { s: -1, sh: [-0.19, 1.0, -0.155], el: [-0.215, 0.755, -0.05], wr: [-0.1, 0.703, 0.182] },
  { s: 1, sh: [0.19, 1.0, -0.155], el: [0.22, 0.76, -0.04], wr: [0.115, 0.708, 0.202] },
];
const BOOK = { at: [0, 0.672, 0.205], tilt: -0.35 };

function handFrame(A) {
  const wr = new THREE.Vector3(...A.wr);
  const el = new THREE.Vector3(...A.el);
  const y = wr.clone().sub(el).normalize();
  // the palm faces in, toward the book's middle, a little down
  const inward = new THREE.Vector3(-A.s, -0.35, 0).normalize();
  const z = inward.clone().addScaledVector(y, -inward.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(wr);
}

function handsSDF() {
  const parts = [];
  for (const A of ARMS) {
    const M = handFrame(A);
    const hand = blend([
      // the palm, then the fingers curled under the page and the thumb on top
      [ellipsoid(0, 0.045, 0.004, 0.037, 0.048, 0.017), 0],
      [placed(roundBox(0, 0, 0, 0.033, 0.03, 0.01, 0.009), frameAt([0, 0.098, 0.012], [0.9, 0, 0])), 0.012],
      [cone([0.026 * -1, 0.03, 0.01], [0.03 * -1, 0.078, 0.032], 0.012, 0.0095), 0.01],
    ]);
    parts.push([placed(hand, M), 0]);
  }
  const bookM = frameAt(BOOK.at, [BOOK.tilt, 0, 0]);
  const pages = blend([
    [placed(roundBox(0, 0, 0, 0.1, 0.006, 0.14, 0.004), frameAt([0.097, 0.008, 0], [0, 0, 0.09])), 0],
    [placed(roundBox(0, 0, 0, 0.1, 0.006, 0.14, 0.004), frameAt([-0.097, 0.008, 0], [0, 0, -0.09])), 0.004],
    [cone([0, 0.0, -0.14], [0, 0.0, 0.14], 0.007, 0.007), 0.004],
  ]);
  parts.push([placed(pages, bookM), 0.003]);
  return blend(parts);
}

function bodySDF() {
  const P = [];
  const add = (fn, k) => P.push([fn, k]);
  // ---- the body, leaning forward over the book. The frock coat is open
  // in a V down to its one button at the waist, showing the waistcoat:
  // the coat's chest is cut away in the V, and a waistcoat a little inside
  // it shows there.
  const chest = placed(ellipsoid(0, 0, 0, 0.165, 0.2, 0.108), frameAt([0, 0.9, -0.135], [0.2, 0, 0]));
  const vest = placed(ellipsoid(0, 0, 0, 0.15, 0.186, 0.084), frameAt([0, 0.9, -0.135], [0.2, 0, 0]));
  const wedge = (x, y, z) => Math.max(Math.abs(x) - (0.012 + (y - 0.69) * 0.17), y - 1.045, 0.69 - y, -(z + 0.12));
  wedge.b = [0, 0.87, -0.05, 0.22];
  add(blend([[carve(chest, [[wedge, 0.004]]), 0], [vest, 0]]), 0);
  // the lapels: broad and flat, lying back from the edges of the V
  for (const s of [-1, 1]) {
    const top = new THREE.Vector3(s * 0.058, 1.0, -0.058);
    const bot = new THREE.Vector3(s * 0.02, 0.705, -0.083);
    const mid = top.clone().add(bot).multiplyScalar(0.5);
    const along = top.clone().sub(bot).normalize();
    const out = new THREE.Vector3(s * 0.35, 0.15, 1).normalize();
    const side = new THREE.Vector3().crossVectors(along, out).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, along).normalize();
    const M = new THREE.Matrix4().makeBasis(side, along, nrm).setPosition(mid);
    add(placed(roundBox(0, 0, 0, 0.026, top.distanceTo(bot) / 2, 0.006, 0.005), M), 0.004);
  }
  // the waistcoat's buttons, and the coat's one at the waist
  for (let i = 0; i < 4; i++) {
    const y = 0.76 + i * 0.05;
    add(sphere(0, y, -0.094 + (y - 0.76) * 0.22, 0.011), 0.003);
  }
  add(sphere(0.022, 0.7, -0.08, 0.014), 0.004);
  add(cone([-0.166, 1.02, -0.152], [0.166, 1.02, -0.152], 0.062, 0.062), 0.05);
  add(placed(ellipsoid(0, 0, 0, 0.148, 0.15, 0.102), frameAt([0, 0.72, -0.175], [0.12, 0, 0])), 0.06);
  add(ellipsoid(0, 0.565, -0.22, 0.176, 0.105, 0.145), 0.05);
  // the neck, the high stiff collar round it and the cravat under the chin,
  // its ends down into the waistcoat
  add(cone([0, 1.03, -0.14], [0, 1.19, -0.07], 0.05, 0.046), 0.025);
  add(placed(cone([0, -0.025, 0], [0, 0.04, 0], 0.061, 0.057), frameAt([0, 1.1, -0.112], [0.35, 0, 0])), 0.003);
  add(ellipsoid(0, 1.04, -0.064, 0.026, 0.02, 0.018), 0.004);
  add(placed(roundBox(0, 0, 0, 0.022, 0.055, 0.007, 0.006), frameAt([0, 0.98, -0.072], [-0.25, 0, 0])), 0.004);
  // the coat's skirts: over the lap, and its tails down the sides of the seat
  add(placed(roundBox(0, 0, 0, 0.19, 0.032, 0.21, 0.02), frameAt([0, 0.605, -0.08], [0.05, 0, 0])), 0.012);
  for (const s of [-1, 1]) add(placed(roundBox(0, 0, 0, 0.02, 0.13, 0.19, 0.018), frameAt([s * 0.2, 0.5, -0.17], [0, 0, s * 0.08])), 0.04);
  // ---- the arms in the coat's sleeves; the shirt's cuffs show at the ends
  for (const A of ARMS) {
    const d = new THREE.Vector3(...A.wr).sub(new THREE.Vector3(...A.el)).normalize();
    const end = new THREE.Vector3(...A.wr).addScaledVector(d, -0.03).toArray();
    add(cone(A.sh, A.el, 0.058, 0.051), 0.05);
    add(cone(A.el, end, 0.05, 0.046), 0.02);
    add(cone(end, A.wr, 0.034, 0.033), 0.0);
  }
  // ---- the legs in loose trousers, the shoes
  const legs = [
    { hip: [-0.1, 0.56, -0.2], knee: [-0.112, 0.575, 0.235], ankle: [-0.125, 0.085, 0.275] },
    { hip: [0.1, 0.56, -0.2], knee: [0.118, 0.57, 0.245], ankle: [0.138, 0.085, 0.355] },
  ];
  for (const L of legs) {
    add(cone(L.hip, L.knee, 0.078, 0.06), 0.04);
    add(sphere(...L.knee, 0.06), 0.02);
    add(cone(L.knee, L.ankle, 0.054, 0.042), 0.02);
    const [ax, ay, az] = L.ankle;
    add(cone([ax, ay + 0.06, az], [ax, ay - 0.012, az + 0.004], 0.045, 0.048), 0.01);
    add(ellipsoid(ax, 0.042, az + 0.065, 0.043, 0.038, 0.125), 0.015);
    add(roundBox(ax, 0.03, az - 0.03, 0.035, 0.03, 0.035, 0.012), 0.01);
  }
  // the coat's skirts part below its button, over the lap
  return carve(blend(P), [[roundBox(0, 0.62, 0.04, 0.005, 0.07, 0.17, 0.004), 0.004]]);
}

// The armchair and the plate it stands on: plain cast shapes.
function chairGeometry() {
  const b = new ModelBuilder();
  const C = BRONZE;
  const o = { color: C, smooth: true, jitter: 0 };
  b.box(0.92, 0.05, 1.26, { pos: [0, 0.025, -0.02], color: C, jitter: 0 });
  b.box(0.58, 0.07, 0.52, { pos: [0, 0.425, -0.26], color: C, jitter: 0 });
  for (const s of [-1, 1]) {
    b.beam([s * 0.255, 0.05, -0.04], [s * 0.255, 0.4, -0.04], 0.02, 12, { ...o, r2: 0.022 });
    b.beam([s * 0.255, 0.05, -0.48], [s * 0.255, 1.13, -0.565], 0.021, 12, o);
    b.beam([s * 0.255, 0.17, -0.04], [s * 0.255, 0.17, -0.48], 0.013, 8, o);
    b.beam([s * 0.3, 0.46, -0.06], [s * 0.3, 0.69, -0.06], 0.017, 10, { ...o, r2: 0.018 });
    b.box(0.056, 0.04, 0.5, { pos: [s * 0.305, 0.705, -0.25], color: C, jitter: 0 });
    b.sphere(0.024, 10, 8, { pos: [s * 0.305, 0.705, 0.0], ...o });
  }
  b.beam([-0.235, 0.17, -0.26], [0.235, 0.17, -0.26], 0.012, 8, o);
  b.box(0.5, 0.54, 0.036, { pos: [0, 0.83, -0.53], rot: [-0.1, 0, 0], color: C, jitter: 0 });
  b.beam([-0.27, 1.125, -0.565], [0.27, 1.125, -0.565], 0.026, 14, o);
  for (const s of [-1, 1]) b.sphere(0.03, 12, 8, { pos: [s * 0.27, 1.125, -0.565], ...o });
  return b.build({ flat: false });
}

// The statue, a little at a time (a generator: see util/sdfmesh.js). It
// takes about half a second in all, so the memorial sculpts it over many
// frames as you come near Bear Falls.
export function* teslaSculpt() {
  const pieces = [];
  // the head, finely: its box stops at the collar, inside the body's neck
  const hLo = [-0.105, 1.11, -0.165];
  const hHi = [0.105, 1.39, 0.12];
  pieces.push(yield* meshSDFSteps(boxed(headSDF(), hLo, hHi), [hLo[0] - 0.01, hLo[1] - 0.01, hLo[2] - 0.01], [hHi[0] + 0.01, hHi[1] + 0.01, hHi[2] + 0.01], 0.0062));
  // the hands and the notes
  const kLo = [-0.25, 0.6, 0.04];
  const kHi = [0.25, 0.8, 0.39];
  pieces.push(yield* meshSDFSteps(boxed(handsSDF(), kLo, kHi), [kLo[0] - 0.01, kLo[1] - 0.01, kLo[2] - 0.01], [kHi[0] + 0.01, kHi[1] + 0.01, kHi[2] + 0.01], 0.009));
  // the body
  pieces.push(yield* meshSDFSteps(bodySDF(), [-0.36, 0.0, -0.42], [0.36, 1.28, 0.6], 0.016));
  yield;
  const chair = chairGeometry();
  yield;
  chair.deleteAttribute('color');
  const n = chair.attributes.position.count;
  const ci = new Uint32Array(n);
  for (let i = 0; i < n; i++) ci[i] = i;
  chair.setIndex(new THREE.BufferAttribute(ci, 1));
  for (const p of pieces) p.setIndex(new THREE.BufferAttribute(Uint32Array.from(p.index.array), 1));
  yield;
  const g = mergeGeometries([...pieces, chair]);
  yield;
  g.scale(1.25, 1.25, 1.25);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  yield;
  yield* patina(g, [
    // where hands rub the bronze bright: the toe of the forward shoe, the
    // left knee and the edge of the notes
    new THREE.Vector3(0.138, 0.05, 0.48).multiplyScalar(1.25),
    new THREE.Vector3(0.118, 0.6, 0.26).multiplyScalar(1.25),
    new THREE.Vector3(0.0, 0.64, 0.34).multiplyScalar(1.25),
  ]);
  g.computeBoundingSphere();
  return g;
}

// The whole statue at once (for tools and tests).
export function teslaGeometry() {
  const it = teslaSculpt();
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Bronze weathers green where the rain runs and sits: verdigris on what
// faces the sky and in streaks, the brown metal underneath and in shelter,
// and bright where people touch it for luck.
function* patina(g, rubbed) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = g.attributes.color;
  const a = new THREE.Color(BRONZE);
  const v = new THREE.Color(VERDIGRIS);
  const pol = new THREE.Color(POLISHED);
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (i % 3000 === 2999) yield;
    p.fromBufferAttribute(pos, i);
    const ny = nrm.getY(i);
    const n1 = vnoise3(p.x * 9, p.y * 9, p.z * 9);
    const streak = vnoise3(p.x * 18, p.y * 4.5, p.z * 18);
    let k = smoothstep(0.15, 0.9, ny) * 0.6 + (n1 - 0.5) * 0.35 + smoothstep(0.7, 0.9, streak) * 0.22;
    k = clamp(k, 0, 0.85);
    c.copy(a).lerp(v, k);
    // darker in the shelter under things
    c.multiplyScalar(0.82 + 0.18 * smoothstep(-0.9, 0.2, ny));
    let rub = 0;
    for (const r of rubbed) rub = Math.max(rub, 1 - smoothstep(0.03, 0.075, p.distanceTo(r)));
    c.lerp(pol, rub);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// The statue's arrays, to send from the worker (their memory handed over).
export function teslaArrays() {
  const g = teslaGeometry();
  const a = (name) => g.attributes[name].array;
  const index = g.index.array;
  const s = g.boundingSphere;
  return { position: a('position'), normal: a('normal'), color: a('color'), index: index instanceof Uint32Array ? index : Uint32Array.from(index), bs: [s.center.x, s.center.y, s.center.z, s.radius] };
}
