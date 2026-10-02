// The Tesla Memorial at Bear Falls. Nikola Tesla (1856-1943) worked out the
// alternating current system the world's power grids still run on, and the
// first big power station built on it, at Niagara Falls, sent its power to
// Buffalo in November 1896. A bronze Tesla has sat on Goat Island by those
// falls since 1976, a gift from Yugoslavia by the sculptor Frano Kršinić:
// Tesla seated, reading his notes. The power cooperative that runs the
// little hydro plant at Bear Falls put up this one in the same pose, on a
// terrace at the rim of the gorge over its powerhouse.
//
// Here:
// - the bronze statue on a granite base with its plaque, on a stone
//   terrace with a parapet on the gorge side;
// - the coil house: an open pavilion with a Tesla coil in an earthed wire
//   cage, and a fluorescent tube on a stand that lights up with no wire to
//   it when the coil runs (Tesla's wireless lighting of 1891);
// - Bear Falls Hydro below: the intake at the top of the falls, the
//   penstock (the big pipe) out of its tunnel and along the foot of the
//   gorge, the powerhouse at the water with its outflow foaming back into
//   the river, three wires up the gorge on poles (three wires: three-phase
//   alternating current, Tesla's polyphase system), and a board at the rim
//   with the plant's numbers.
//
// Like the other sites added after the world is made, the trees on the
// site are felled and the forest elsewhere stays exactly as it was.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { makeSignTexture } from '../util/textures.js';
import { ROAD_HALF } from './worldgen.js';
import { frame, groundRange } from './buildings.js';
import { clearGrass } from './worldtex.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { segDist, smoothstep, mulberry32, clamp } from '../util/math.js';
import { sphere, ellipsoid, cone, roundBox, torus, placed, frameAt, blend, carve, boxed, smax, meshSDFSteps } from '../util/sdfmesh.js';

// The statue looks east, to the road and the people coming from it, with
// the gorge and the falls behind him.
export const TESLA = { x: 2.6, z: -409 };
const YAW = Math.PI / 2;
const COIL_AT = { x: 10, z: -397.5 };
const BOARD_AT = { x: -5.5, z: -421 };
// the powerhouse at the foot of the gorge, its front to the river
const HOUSE = { x: -23.7, z: -422, yaw: -Math.PI / 2 };
// the tunnel's mouth near the foot of the falls, and the intake above them
const PORTAL = { x: -24.3, z: -435.6 };
const INTAKE = { x: -29.2, z: -446.4 };
// the poles carrying the three wires from the powerhouse to the road
const POLES = [
  { x: -18.6, z: -424.2 },
  { x: -6.2, z: -427 },
  { x: 8.6, z: -420.5 },
  { x: 15.8, z: -416.5 },
];
// The plant: the flow through the turbine (cubic metres a second) and how
// much of the falling water's power the turbine and generator keep. The
// drop (the head) is measured from the world: the pool above the falls to
// the river below.
export const HYDRO = { flow: 2.6, eff: 0.85 };

const BRONZE = 0x6e5230;
const VERDIGRIS = 0x5a8a74;
const POLISHED = 0xc49a5c;
const COPPER = 0xb8693e;
const STEEL = 0x5b6168;
const RUST = 0x6a4a36;
const WOOD = 0x7a5a3c;
const WOOD_DARK = 0x4e3826;

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

// Polished granite for the base: dark pinkish grey with black mica, white
// feldspar and grey quartz grains.
function graniteTex() {
  return canvasTexture(
    256,
    256,
    (g, W, H) => {
      const rnd = mulberry32(911);
      g.fillStyle = '#5d5452';
      g.fillRect(0, 0, W, H);
      const grain = (n, color, s0, s1) => {
        g.fillStyle = color;
        for (let i = 0; i < n; i++) {
          const s = s0 + rnd() * (s1 - s0);
          g.fillRect(rnd() * W, rnd() * H, s, s * (0.5 + rnd() * 0.6));
        }
      };
      grain(900, 'rgba(150,120,116,0.55)', 1.5, 4);
      grain(700, 'rgba(205,198,190,0.45)', 1, 3);
      grain(1200, 'rgba(22,20,22,0.7)', 1, 2.6);
      grain(500, 'rgba(120,124,130,0.5)', 1, 3);
    },
    { repeat: true }
  );
}

// The bronze plaque on the front of the base.
function plaqueTex() {
  return canvasTexture(1024, 680, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#5e4526');
    grd.addColorStop(1, '#3f2e19');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#a8824c';
    g.lineWidth = 14;
    g.strokeRect(22, 22, W - 44, H - 44);
    g.lineWidth = 3;
    g.strokeRect(46, 46, W - 92, H - 92);
    const text = (s, y, size, weight = 700, color = '#e2c48a') => {
      g.font = `${weight} ${size}px Georgia, "Times New Roman", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(s, W / 2 + 3, y + 3);
      g.fillStyle = color;
      g.fillText(s, W / 2, y);
    };
    text('NIKOLA TESLA', 140, 96);
    text('1856 – 1943', 230, 54, 600);
    text('Inventor of the polyphase alternating current system.', 330, 34, 500, '#d7b97e');
    text('His motors and generators sent the power of Niagara Falls', 386, 34, 500, '#d7b97e');
    text('to Buffalo in 1896. The world still runs on his current.', 432, 34, 500, '#d7b97e');
    text('After the statue by Frano Kršinić at Niagara Falls, 1976', 520, 28, 500, '#c4a46c');
    text('Bear Falls Power Cooperative', 590, 30, 700, '#c4a46c');
  });
}

// The wire mesh of the coil's cage, and the copper winding of the coil.
function meshTex() {
  return canvasTexture(
    128,
    128,
    (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(190,196,202,1)';
      g.lineWidth = 5;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo((i * W) / 4, 0);
        g.lineTo((i * W) / 4, H);
        g.stroke();
        g.beginPath();
        g.moveTo(0, (i * H) / 4);
        g.lineTo(W, (i * H) / 4);
        g.stroke();
      }
    },
    { repeat: true, srgb: true }
  );
}
function windingTex() {
  return canvasTexture(
    64,
    256,
    (g, W, H) => {
      g.fillStyle = '#7a3e1e';
      g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 4) {
        const grd = g.createLinearGradient(0, y, 0, y + 4);
        grd.addColorStop(0, '#6a3418');
        grd.addColorStop(0.5, '#e09a62');
        grd.addColorStop(1, '#6a3418');
        g.fillStyle = grd;
        g.fillRect(0, y, W, 4);
      }
    },
    { repeat: true }
  );
}

// A soft round glow, for the corona round the coil's top.
function glowTex() {
  return canvasTexture(
    64,
    64,
    (g, W, H) => {
      const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(200,190,255,0.55)');
      r.addColorStop(1, 'rgba(120,110,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    },
    { srgb: false }
  );
}

// Foam on the water where the powerhouse's outflow comes back to the river.
function foamTex() {
  return canvasTexture(
    128,
    128,
    (g, W, H) => {
      const rnd = mulberry32(57);
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 160; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const r = 2 + rnd() * 9;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
    },
    { repeat: true }
  );
}

export class TeslaMemorial {
  constructor(game) {
    this.game = game;
    const W = game.world;
    const P = game.props;
    const C = game.colliders;
    this.group = new THREE.Group();
    this.group.name = 'tesla';
    this.road = P.nearestRoad(TESLA.x + 6, TESLA.z);
    this.f = frame(TESLA.x, TESLA.z, YAW);
    this.clear();

    // the drop the plant works with: the pool above the falls to the river
    // below the powerhouse
    const up = W.waterAt(INTAKE.x - 2, INTAKE.z);
    const down = W.waterAt(HOUSE.x - 4, HOUSE.z);
    this.head = up && down ? up.level - down.level : 13.4;
    this.power = (1000 * 9.81 * HYDRO.flow * this.head * HYDRO.eff) / 1000;
    this.tail = down ? down.level : 36.5;

    this.buildTerrace();
    this.buildStatue();
    this.buildCoilHouse();
    this.buildHydro();
    this.buildBoard();
    this.group.traverse((o) => {
      if (o.isMesh && o.receiveShadow === false && !o.userData.noShadow) o.receiveShadow = true;
    });
    game.scene.add(this.group);

    // ------------------------------------- the place, its parking, its doors
    const f = this.f;
    const [ix, iz] = f.to(0, 2.7);
    P.interactions.push({ id: 'tesla', x: ix, z: iz, r: 2.6, y: this.top });
    P.interactions.push({ id: 'coil', x: this.coilDesk.x, z: this.coilDesk.z, r: 1.7 });
    P.interactions.push({ id: 'hydro', x: this.boardFront.x, z: this.boardFront.z, r: 1.8 });
    const [px, pz] = f.to(0, 5.6);
    W.places.push({
      id: 'tesla',
      name: 'Tesla Memorial',
      kind: 'landmark',
      x: px,
      z: pz,
      y: W.heightAt(px, pz),
      face: Math.atan2(-(TESLA.x - px), -(TESLA.z - pz)),
      blurb: 'A bronze Nikola Tesla reads his notes on the rim of the gorge at Bear Falls, over the little hydro plant the falls drive. Run the Tesla coil in the coil house and read how falling water becomes power.',
      bearRisk: 0.45,
    });
    const road = this.road;
    const dx = road.x - TESLA.x;
    const dz = road.z - TESLA.z;
    const dl = Math.hypot(dx, dz) || 1;
    P.layout.parking.tesla = { x: road.x - (dx / dl) * (ROAD_HALF + 2), z: road.z - (dz / dl) * (ROAD_HALF + 2), yaw: Math.atan2(road.tx, road.tz), roadX: road.x, roadZ: road.z, side: { x: dx / dl, z: dz / dl } };

    // the coil's show
    this.coilT = 0;
    this.coilCool = 0;
  }

  // Fell what grows on the terrace, round the coil house and the board,
  // on the path from the road, under the wires and round the plant.
  clear() {
    const g = this.game;
    const S = g.scatter;
    const road = this.road;
    const spots = [
      [TESLA.x + 3, TESLA.z, 6.5],
      [COIL_AT.x, COIL_AT.z, 4.5],
      [BOARD_AT.x, BOARD_AT.z, 2.6],
      [HOUSE.x, HOUSE.z, 6.5],
      [PORTAL.x, PORTAL.z, 3],
      [INTAKE.x, INTAKE.z, 3.5],
    ];
    const lines = [
      [TESLA.x + 6, TESLA.z, road.x, road.z, 2.2],
      [COIL_AT.x, COIL_AT.z, road.x, road.z, 2.2],
      [PORTAL.x, PORTAL.z, HOUSE.x, HOUSE.z + 3, 2],
      [HOUSE.x, HOUSE.z, POLES[0].x, POLES[0].z, 2.5],
    ];
    for (let i = 0; i + 1 < POLES.length; i++) lines.push([POLES[i].x, POLES[i].z, POLES[i + 1].x, POLES[i + 1].z, 2.8]);
    const inSite = (x, z) => spots.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r) || lines.some(([ax, az, bx, bz, w]) => segDist(x, z, ax, az, bx, bz).d < w);
    for (const t of Object.values(S.types)) {
      for (let i = 0; i < t.count; i++) if (inSite(t.x[i], t.z[i])) t.x[i] = 1e6;
    }
    g.colliders.removeCircles(-60, -470, 40, -380, (c) => (c.tag === 'tree' || c.tag === 'rock' || c.tag === 'shrub') && inSite(c.x, c.z));
    S.lastPos.set(1e9, 0, 0);
  }

  // ------------------------------------------------------------ terrace
  // A stone terrace, level, with its gorge side built up on a wall and a
  // low parapet on the two sides that drop away; steps up at the front.
  buildTerrace() {
    const W = this.game.world;
    const P = this.game.props;
    const C = this.game.colliders;
    const f = this.f;
    // local: x across (+x is north), z forward (east, to the road)
    const X0 = -3.3;
    const X1 = 3.3;
    const Z0 = -1.7;
    const Z1 = 4.9;
    const gr = groundRange(W, f, X0, X1, Z0, Z1);
    const top = gr.hi + 0.06;
    this.top = top;
    const b = new ModelBuilder();
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const depth = top - (gr.lo - 0.5);
    // the paving and the wall under it
    b.box(X1 - X0, 0.12, Z1 - Z0, { pos: [cx, -0.06, cz], color: 0xa7a197, surf: 'concrete', surfScale: 0.8 });
    b.box(X1 - X0 + 0.02, depth - 0.1, Z1 - Z0 + 0.02, { pos: [cx, -0.12 - (depth - 0.1) / 2, cz], color: 0x8f877c, surf: 'stone' });
    // the parapet on the north and west (the gorge) sides
    b.box(0.32, 0.5, Z1 - Z0, { pos: [X1 - 0.16, 0.25, cz], color: 0x9a9288, surf: 'stone' });
    b.box(X1 - X0, 0.5, 0.32, { pos: [cx, 0.25, Z0 + 0.16], color: 0x9a9288, surf: 'stone' });
    b.box(0.4, 0.06, Z1 - Z0 + 0.06, { pos: [X1 - 0.16, 0.53, cz], color: 0xb4ada3, surf: 'concrete' });
    b.box(X1 - X0 + 0.06, 0.06, 0.4, { pos: [cx, 0.53, Z0 + 0.16], color: 0xb4ada3, surf: 'concrete' });
    // steps down from the front edge to the ground in front of it
    const frontGround = W.heightAt(...f.to(0, Z1 + 0.9));
    const rise = top - frontGround;
    const nSteps = Math.max(0, Math.round(rise / 0.18));
    for (let i = 0; i < nSteps; i++) {
      const h = top - ((i + 1) * rise) / (nSteps + 1);
      b.box(2.6, h - (frontGround - 0.3), 0.34, { pos: [0, (h + frontGround - 0.3) / 2 - top, Z1 + 0.17 + i * 0.34], color: 0x9d968b, surf: 'stone' });
    }
    P.addMesh(b.build(), TESLA.x, top, TESLA.z, YAW);
    const [tx, tz] = f.to(cx, cz);
    C.addDeck(tx, tz, (X1 - X0) / 2, (Z1 - Z0) / 2, YAW, top);
    for (const [lx, lz, hx, hz] of [
      [X1 - 0.16, cz, 0.16, (Z1 - Z0) / 2],
      [cx, Z0 + 0.16, (X1 - X0) / 2, 0.16],
    ]) {
      const [wx, wz] = f.to(lx, lz);
      C.addBox(wx, wz, hx, hz, YAW, top - 0.3, top + 0.55);
    }
    this.terrace = { X0, X1, Z0, Z1 };
    // no grass through the paving or the coil house's floor
    clearGrass(this.game, tx, tz, 3.6);
    clearGrass(this.game, COIL_AT.x, COIL_AT.z, 2.2);
  }

  // ------------------------------------------------------------ statue
  buildStatue() {
    const C = this.game.colliders;
    const f = this.f;
    const top = this.top;
    // the base: a granite step, a tapering block and a capstone (the base at
    // Niagara is a pyramid too)
    const gmat = new THREE.MeshStandardMaterial({ map: graniteTex(), roughness: 0.32, metalness: 0.05 });
    const b = new ModelBuilder({ uvs: true });
    const sq = (w) => (w / 2) * Math.SQRT2;
    const frustum = (wb, wt, h, y) => {
      const geo = new THREE.CylinderGeometry(sq(wt), sq(wb), h, 4, 1);
      geo.rotateY(Math.PI / 4);
      geo.translate(0, y + h / 2, 0);
      return geo;
    };
    b.add(new THREE.BoxGeometry(2.1, 0.22, 2.1).translate(0, 0.11, 0), { color: 0xffffff, jitter: 0 });
    b.add(frustum(1.62, 1.2, 1.32, 0.22), { color: 0xffffff, jitter: 0 });
    b.add(new THREE.BoxGeometry(1.42, 0.13, 1.42).translate(0, 1.6, 0), { color: 0xffffff, jitter: 0 });
    // box-project the texture in metres, so the grains are the same size on
    // every face
    const geo = b.build();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nrm.getX(i));
      const ay = Math.abs(nrm.getY(i));
      const az = Math.abs(nrm.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i) / 1.2, pos.getZ(i) / 1.2);
      else if (ax >= az) uv.setXY(i, pos.getZ(i) / 1.2, pos.getY(i) / 1.2);
      else uv.setXY(i, pos.getX(i) / 1.2, pos.getY(i) / 1.2);
    }
    const base = new THREE.Mesh(geo, gmat);
    base.position.set(TESLA.x, top, TESLA.z);
    base.rotation.y = YAW;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);
    // the plaque, on the sloping front face of the block
    const slope = Math.atan2((1.62 - 1.2) / 2, 1.32);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.61), new THREE.MeshStandardMaterial({ map: plaqueTex(), roughness: 0.45, metalness: 0.55 }));
    const mid = 0.22 + 1.32 * 0.55;
    const zf = (1.62 / 2) * (1 - 0.55) + (1.2 / 2) * 0.55 + 0.012;
    plaque.position.set(...[0, 0, 0]);
    const pm = new THREE.Object3D();
    pm.position.set(TESLA.x, top, TESLA.z);
    pm.rotation.y = YAW;
    plaque.position.set(0, mid, zf);
    plaque.rotation.x = -slope;
    pm.add(plaque);
    this.group.add(pm);
    // the bronze on the capstone
    // the bronze on the capstone: sculpted a little at a time when you come
    // near (see update)
    const bronze = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
    const statue = new THREE.Mesh(new THREE.BufferGeometry(), bronze);
    statue.rotation.y = YAW;
    const [sx, sz] = f.to(0, -0.06);
    statue.position.set(sx, top + 1.665, sz);
    statue.castShadow = true;
    statue.receiveShadow = true;
    statue.visible = false;
    this.group.add(statue);
    this.statue = statue;
    this.sculpt = teslaSculpt();
    C.addBox(TESLA.x, TESLA.z, 1.08, 1.08, YAW, top - 0.5, top + 3.4, 'statue');
  }

  // ------------------------------------------------------------ coil house
  // An open pavilion on a plank floor under a hipped shingle roof. In the
  // middle the coil inside its earthed cage; at the front the control desk
  // with its big red button, and a fluorescent tube on a stand by the cage.
  buildCoilHouse() {
    const W = this.game.world;
    const P = this.game.props;
    const C = this.game.colliders;
    // the open side faces the statue's terrace
    const yaw = Math.atan2(TESLA.x + 3 - COIL_AT.x, TESLA.z - COIL_AT.z);
    const f = frame(COIL_AT.x, COIL_AT.z, yaw);
    const gr = groundRange(W, f, -2.3, 2.3, -2.3, 2.3);
    const floor = gr.hi + 0.18;
    this.coilFloor = floor;
    const b = new ModelBuilder();
    const H = 2.75;
    b.box(4.6, floor - gr.lo + 0.3, 4.6, { pos: [0, -(floor - gr.lo + 0.3) / 2, 0], color: 0x8a8278, surf: 'stone' });
    b.box(4.4, 0.06, 4.4, { pos: [0, 0.03, 0], color: 0x9c7a56, surf: 'deck' });
    for (const [px, pz] of [
      [-2.05, -2.05],
      [2.05, -2.05],
      [2.05, 2.05],
      [-2.05, 2.05],
    ]) {
      b.box(0.18, H, 0.18, { pos: [px, H / 2, pz], color: WOOD_DARK, surf: 'log' });
    }
    // the plates round the top and the hipped roof
    for (const s of [-1, 1]) {
      b.box(4.3, 0.2, 0.16, { pos: [0, H + 0.1, s * 2.05], color: WOOD_DARK, surf: 'plank' });
      b.box(0.16, 0.2, 4.3, { pos: [s * 2.05, H + 0.1, 0], color: WOOD_DARK, surf: 'plank' });
    }
    const roof = new THREE.ConeGeometry(3.6, 1.5, 4, 1, true);
    roof.rotateY(Math.PI / 4);
    b.add(roof, { pos: [0, H + 0.2 + 0.75, 0], color: 0x5e4a3c, surf: 'shingle' });
    b.add(new THREE.ConeGeometry(3.6, 0.02, 4, 1).rotateY(Math.PI / 4), { pos: [0, H + 0.21, 0], color: 0x6b5848, surf: 'plank' });
    // the back wall, so the coil has a dark ground to show against
    b.box(4.2, H - 0.2, 0.1, { pos: [0, (H - 0.2) / 2 + 0.06, -2.02], color: 0x6a5240, surf: 'batten' });
    // the coil: a cabinet with the capacitors and the spark gap, the flat
    // spiral of the primary, the tall secondary (its winding is drawn on its
    // own material below) and the ring on top
    b.box(0.62, 0.5, 0.62, { pos: [0, 0.31, -0.5], color: 0x2f3438, surf: 'metal' });
    for (let i = 0; i < 4; i++) b.torus(0.2 + i * 0.045, 0.012, 6, 28, { pos: [0, 0.6, -0.5], rot: [Math.PI / 2, 0, 0], color: COPPER, smooth: true });
    b.cyl(0.06, 0.06, 0.06, 12, { pos: [0, 0.59, -0.5], color: 0x222222 });
    b.torus(0.27, 0.085, 12, 28, { pos: [0, 1.68, -0.5], rot: [Math.PI / 2, 0, 0], color: 0xc9ccd0, smooth: true });
    b.cyl(0.12, 0.12, 0.05, 16, { pos: [0, 1.68, -0.5], color: 0xc9ccd0 });
    // the earthed target: a ball on a rod, for the sparks to strike
    b.cyl(0.015, 0.015, 1.4, 8, { pos: [0.8, 0.76, -0.5], color: 0x8e9296 });
    b.sphere(0.06, 12, 8, { pos: [0.8, 1.46, -0.5], color: 0xc9ccd0, smooth: true });
    // the control desk, at the front left
    b.box(0.7, 0.9, 0.42, { pos: [-1.3, 0.45, 1.5], color: 0x3a4a3a, surf: 'metal' });
    b.box(0.74, 0.06, 0.5, { pos: [-1.3, 0.93, 1.48], rot: [0.25, 0, 0], color: 0x2a3329 });
    b.cyl(0.05, 0.055, 0.05, 14, { pos: [-1.42, 0.99, 1.48], rot: [0.25, 0, 0], color: 0xd02a20 });
    b.cyl(0.03, 0.03, 0.04, 10, { pos: [-1.16, 0.99, 1.46], rot: [0.25, 0, 0], color: 0xf0c020 });
    // the stand for the tube, front right
    b.box(0.3, 0.05, 0.3, { pos: [1.2, 0.05, 1.0], color: WOOD });
    b.box(0.05, 1.15, 0.05, { pos: [1.2, 0.6, 1.0], color: WOOD });
    b.box(0.16, 0.05, 0.05, { pos: [1.2, 1.18, 1.0], color: WOOD });
    P.addMesh(b.build(), COIL_AT.x, floor, COIL_AT.z, yaw);
    // the winding: fine copper wire round the secondary
    const sec = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.0, 20, 1, true), new THREE.MeshStandardMaterial({ map: windingTex(), roughness: 0.35, metalness: 0.7 }));
    sec.material.map.repeat.set(1, 3);
    const coilGroup = new THREE.Group();
    coilGroup.position.set(COIL_AT.x, floor, COIL_AT.z);
    coilGroup.rotation.y = yaw;
    sec.position.set(0, 1.12, -0.5);
    coilGroup.add(sec);
    // the cage: fine mesh round the coil, open toward the floor's back wall
    const cageTex = meshTex();
    cageTex.repeat.set(36, 9);
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 2.25, 36, 1, true),
      new THREE.MeshStandardMaterial({ map: cageTex, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 })
    );
    cage.position.set(0, 1.18, -0.5);
    coilGroup.add(cage);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.022, 6, 48), new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.5, metalness: 0.6 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 2.3, -0.5);
    coilGroup.add(rim);
    const rim2 = rim.clone();
    rim2.position.y = 0.07;
    coilGroup.add(rim2);
    // the tube on its stand: dark until the coil runs
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, emissive: 0xd9d2ff, emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.9 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 10), this.tubeMat);
    tube.rotation.x = Math.PI / 2;
    tube.rotation.z = 0.9;
    tube.position.set(1.2, 1.24, 1.0);
    coilGroup.add(tube);
    // the sparks: ribbons rebuilt every few hundredths of a second while it
    // runs, and a glow round the ring
    const N = 8 * 12;
    this.arcPos = new Float32Array(N * 4 * 3);
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    ag.setIndex(idx);
    const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 4.0), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.arcs = new THREE.Mesh(ag, arcMat);
    this.arcs.frustumCulled = false;
    this.arcs.visible = false;
    this.arcs.userData.noShadow = true;
    this.group.add(this.arcs);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xcfc8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
    this.glow.scale.set(1.3, 1.3, 1);
    this.glow.position.set(0, 1.68, -0.5);
    coilGroup.add(this.glow);
    this.group.add(coilGroup);
    coilGroup.updateMatrixWorld(true);
    this.coilGroup = coilGroup;
    this.coilTop = new THREE.Vector3(0, 1.68, -0.5).applyMatrix4(coilGroup.matrixWorld);
    this.coilTarget = new THREE.Vector3(0.8, 1.46, -0.5).applyMatrix4(coilGroup.matrixWorld);
    this.tubeAt = new THREE.Vector3(1.2, 1.24, 1.0).applyMatrix4(coilGroup.matrixWorld);
    const [dx, dz] = f.to(-1.3, 2.3);
    this.coilDesk = { x: dx, z: dz };
    this.coilYaw = yaw;
    C.addDeck(COIL_AT.x, COIL_AT.z, 2.3, 2.3, yaw, floor);
    // the cage, the desk, the posts and the back wall stop a walker
    const [cx, cz] = f.to(0, -0.5);
    C.addCircle(cx, cz, 1.2, 'cage');
    const [kx, kz] = f.to(-1.3, 1.5);
    C.addBox(kx, kz, 0.38, 0.24, yaw, floor - 0.3, floor + 1.0);
    const [wx, wz] = f.to(0, -2.02);
    C.addBox(wx, wz, 2.1, 0.08, yaw, floor - 0.3, floor + H);
    for (const [px, pz] of [
      [-2.05, 2.05],
      [2.05, 2.05],
    ]) {
      const [qx, qz] = f.to(px, pz);
      C.addCircle(qx, qz, 0.14, 'post');
    }
  }

  // ------------------------------------------------------------ the plant
  buildHydro() {
    const W = this.game.world;
    const P = this.game.props;
    const C = this.game.colliders;
    // ---- the powerhouse: a fieldstone hall on a concrete footing, its front
    // to the river, tall windows, a steel roof and the plant's name
    const f = frame(HOUSE.x, HOUSE.z, HOUSE.yaw);
    const gr = groundRange(W, f, -4.1, 4.1, -2.6, 2.6);
    const floor = Math.max(this.tail + 0.7, gr.lo + 0.4);
    this.houseFloor = floor;
    const b = new ModelBuilder();
    const HW = 4.0;
    const HD = 2.5;
    const WALL = 5.0;
    const footing = floor - (this.tail - 1.2);
    b.box(HW * 2 + 0.4, footing, HD * 2 + 0.4, { pos: [0, -footing / 2 + 0.6, 0], color: 0x96918a, surf: 'concrete' });
    b.box(HW * 2, WALL, HD * 2, { pos: [0, 0.6 + WALL / 2, 0], color: 0x8e857a, surf: 'stone' });
    // the gable roof along the hall, and its gable ends
    const pitch = 0.5;
    const rise = HD * Math.tan(pitch);
    for (const s of [-1, 1]) {
      b.box(HW * 2 + 0.5, 0.08, HD / Math.cos(pitch) + 0.35, { pos: [0, 0.6 + WALL + rise / 2, (s * (HD + 0.35)) / 2], rot: [s * pitch, 0, 0], color: 0x5a6a62, surf: 'metal' });
    }
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-HD, 0);
      sh.lineTo(HD, 0);
      sh.lineTo(0, rise);
      sh.closePath();
      const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
      gg.rotateY(Math.PI / 2);
      b.add(gg, { pos: [s * HW - (s > 0 ? 0.2 : 0), 0.6 + WALL, 0], color: 0x8e857a, surf: 'stone' });
    }
    // tall windows down the river side and the ends, with stone sills
    for (const lx of [-2.6, -0.9, 0.9, 2.6]) {
      b.box(0.9, 2.4, 0.08, { pos: [lx, 3.1, HD + 0.02], color: 0x1d2a33 });
      b.box(1.06, 0.12, 0.2, { pos: [lx, 1.84, HD + 0.06], color: 0xb8b0a4 });
      b.box(1.06, 0.18, 0.12, { pos: [lx, 4.38, HD + 0.04], color: 0xb8b0a4 });
      for (const k of [-1, 1]) b.box(0.04, 2.4, 0.04, { pos: [lx + k * 0.22, 3.1, HD + 0.07], color: 0x2a3036 });
      b.box(0.9, 0.04, 0.04, { pos: [lx, 3.1, HD + 0.07], color: 0x2a3036 });
    }
    // the steel door at the downstream end, and a lamp over it
    b.box(0.08, 2.2, 1.1, { pos: [HW + 0.02, 1.7, -0.8], color: 0x4a5560, surf: 'metal' });
    b.box(0.2, 0.12, 0.2, { pos: [HW + 0.12, 3.05, -0.8], color: 0x3a3a3a });
    // the outflow: an arch in the footing at the water, at the downstream end
    b.box(1.8, 1.1, 0.12, { pos: [2.6, 0.05, HD + 0.16], color: 0x1a2024 });
    b.box(2.2, 0.25, 0.3, { pos: [2.6, 0.72, HD + 0.2], color: 0xa29d95, surf: 'concrete' });
    // the insulators on the roof's end where the wires leave
    b.box(0.12, 0.9, 0.12, { pos: [HW - 0.3, 0.6 + WALL + rise + 0.2, -0.6], color: 0x5a4a3a });
    b.box(1.4, 0.1, 0.1, { pos: [HW - 0.3, 0.6 + WALL + rise + 0.6, -0.6], color: 0x5a4a3a });
    for (const k of [-0.55, 0, 0.55]) b.cyl(0.04, 0.05, 0.16, 8, { pos: [HW - 0.3 + k, 0.6 + WALL + rise + 0.73, -0.6], color: 0x9c4a2a });
    P.addMesh(b.build(), HOUSE.x, floor - 0.6, HOUSE.z, HOUSE.yaw);
    // the name over the windows
    const nameTex = makeSignTexture('BEAR FALLS HYDRO', 'Bear Falls Power Cooperative · 1958', { aspect: 4.2 / 0.8, width: 4.2, bg: '#2e3a40', fg: '#efe6cf' });
    const name = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.8 }));
    const [nx, nz] = f.to(0, HD + 0.09);
    name.position.set(nx, floor - 0.6 + 5.0, nz);
    name.rotation.y = HOUSE.yaw;
    this.group.add(name);
    C.addBox(HOUSE.x, HOUSE.z, HW + 0.2, HD + 0.2, HOUSE.yaw, floor - 3, floor + WALL + 1);
    const [wx, wz] = f.to(HW - 0.3, -0.6);
    this.houseWires = new THREE.Vector3(wx, floor - 0.6 + 0.6 + WALL + rise + 0.8, wz);

    // ---- the outflow's foam on the river, drifting downstream
    const [ox, oz] = f.to(2.6, HD + 2.2);
    const foamT = foamTex();
    foamT.repeat.set(2, 2);
    this.foamTex = foamT;
    // (a soft round edge: the foam thins out away from the outflow)
    const fade = canvasTexture(
      64,
      64,
      (g2, W2, H2) => {
        const r = g2.createRadialGradient(W2 / 2, H2 / 2, 0, W2 / 2, H2 / 2, W2 / 2);
        r.addColorStop(0, '#fff');
        r.addColorStop(0.45, '#bbb');
        r.addColorStop(1, '#000');
        g2.fillStyle = r;
        g2.fillRect(0, 0, W2, H2);
      },
      { srgb: false }
    );
    const foam = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ map: foamT, alphaMap: fade, transparent: true, opacity: 0.85, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(1.5, 1, 1);
    foam.rotation.z = HOUSE.yaw;
    foam.position.set(ox, this.tail + 0.06, oz);
    foam.userData.noShadow = true;
    this.group.add(foam);

    // ---- the penstock: out of its tunnel at the foot of the falls, along
    // the foot of the gorge on concrete saddles, into the powerhouse's end
    const [ex, ez] = f.to(-HW - 0.1, 0.4);
    const inY = floor + 1.2;
    const portalY = W.heightAt(PORTAL.x, PORTAL.z) + 1.6;
    const a = new THREE.Vector3(PORTAL.x, Math.max(portalY, inY + 0.6), PORTAL.z);
    const e = new THREE.Vector3(ex, inY, ez);
    const pipe = new ModelBuilder();
    const d = e.clone().sub(a);
    const plen = d.length();
    pipe.beam(a.toArray(), e.toArray(), 0.55, 20, { color: RUST, surf: 'metal', smooth: true });
    // the rings that join its sections, and saddles under it
    for (let t = 0.08; t < 1; t += 2.4 / plen) {
      const p = a.clone().lerp(e, t);
      pipe.beam(p.clone().addScaledVector(d, -0.03 / plen).toArray(), p.clone().addScaledVector(d, 0.03 / plen).toArray(), 0.6, 20, { color: STEEL, smooth: true });
      const gy = W.heightAt(p.x, p.z);
      if (p.y - 0.55 > gy + 0.1) {
        const h = p.y - 0.4 - (gy - 0.4);
        pipe.box(0.8, h, 1.3, { pos: [p.x, gy - 0.4 + h / 2, p.z], rot: [0, Math.atan2(d.x, d.z), 0], color: 0x9a958d, surf: 'concrete' });
      }
    }
    // the tunnel's mouth in the rock: a concrete portal round the pipe
    const pd = d.clone().setY(0).normalize();
    const pyaw = Math.atan2(pd.x, pd.z);
    pipe.box(2.2, 2.4, 0.6, { pos: [a.x, a.y, a.z], rot: [0, pyaw, 0], color: 0x9a958d, surf: 'concrete' });
    pipe.box(2.6, 0.3, 0.8, { pos: [a.x, a.y + 1.3, a.z], rot: [0, pyaw, 0], color: 0xa8a39b, surf: 'concrete' });
    // the intake above the falls: a concrete box at the pool's edge with a
    // screen of bars against logs and fish, and the gate's wheel on top
    const iy = W.waterAt(INTAKE.x - 2, INTAKE.z)?.level ?? 50.5;
    const ig = W.heightAt(INTAKE.x, INTAKE.z);
    const iTop = Math.max(iy + 0.9, ig + 0.5);
    const ib = iTop - (iy - 2.5);
    const iyaw = Math.atan2(-1, 0);
    pipe.box(2.6, ib, 2.2, { pos: [INTAKE.x, iTop - ib / 2, INTAKE.z], rot: [0, iyaw, 0], color: 0x9a958d, surf: 'concrete' });
    for (let k = -5; k <= 5; k++) {
      const bx = INTAKE.x - 1.12;
      const bz = INTAKE.z + k * 0.2;
      pipe.box(0.04, 1.8, 0.04, { pos: [bx, iy - 0.2, bz], color: STEEL });
    }
    pipe.cyl(0.05, 0.05, 0.9, 8, { pos: [INTAKE.x, iTop + 0.45, INTAKE.z], color: STEEL });
    pipe.torus(0.32, 0.03, 6, 20, { pos: [INTAKE.x, iTop + 0.92, INTAKE.z], rot: [Math.PI / 2, 0, 0], color: 0x9c3a2a });
    for (const r of [0, Math.PI / 2]) pipe.box(0.64, 0.03, 0.03, { pos: [INTAKE.x, iTop + 0.92, INTAKE.z], rot: [0, r, 0], color: 0x9c3a2a });
    P.addMesh(pipe.build(), 0, 0, 0, 0);
    C.addCircle(INTAKE.x, INTAKE.z, 1.4, 'intake');

    // ---- the poles and the three wires: from the powerhouse's roof up the
    // gorge to the rim and on to the road
    const poles = new ModelBuilder();
    const tops = [this.houseWires];
    for (const p of POLES) {
      const gy = W.heightAt(p.x, p.z);
      const h = 8.5;
      poles.cyl(0.13, 0.16, h, 10, { pos: [p.x, gy + h / 2 - 0.3, p.z], color: 0x5a4632, surf: 'log' });
      // the cross-arm across the line, with three insulators
      const nxt = POLES[POLES.indexOf(p) + 1] || p;
      const prv = POLES[POLES.indexOf(p) - 1] || this.houseWires;
      const along = Math.atan2(nxt.x - prv.x, nxt.z - prv.z);
      poles.box(1.7, 0.12, 0.12, { pos: [p.x, gy + h - 0.6, p.z], rot: [0, along, 0], color: 0x4a3a2a });
      const cs = Math.cos(along);
      const sn = Math.sin(along);
      for (const k of [-0.7, 0, 0.7]) poles.cyl(0.04, 0.055, 0.18, 8, { pos: [p.x + k * cs, gy + h - 0.45, p.z - k * sn], color: 0x9c4a2a });
      tops.push(new THREE.Vector3(p.x, gy + h - 0.32, p.z));
      p.along = along;
      C.addCircle(p.x, p.z, 0.2, 'post');
    }
    // the transformer on the third pole, stepping the voltage up for the
    // road
    const t3 = POLES[2];
    const g3 = W.heightAt(t3.x, t3.z);
    poles.cyl(0.32, 0.32, 1.0, 14, { pos: [t3.x + 0.42, g3 + 5.2, t3.z], color: 0x7d8288, smooth: true });
    poles.cyl(0.34, 0.34, 0.08, 14, { pos: [t3.x + 0.42, g3 + 5.74, t3.z], color: 0x6c7076 });
    P.addMesh(poles.build(), 0, 0, 0, 0);
    // the wires: three, sagging between the arms. Each end's three points
    // lie along its arm, the arms turned to agree so the wires never cross.
    const attach = [{ p: this.houseWires, arm: new THREE.Vector3(0, 0, 1), w: 0.55 }];
    POLES.forEach((p, i) => attach.push({ p: tops[i + 1], arm: new THREE.Vector3(Math.cos(p.along), 0, -Math.sin(p.along)), w: 0.7 }));
    for (let i = 1; i < attach.length; i++) if (attach[i].arm.dot(attach[i - 1].arm) < 0) attach[i].arm.negate();
    const pts = [];
    for (let i = 0; i + 1 < attach.length; i++) {
      const A = attach[i];
      const B = attach[i + 1];
      for (const k of [-1, 0, 1]) {
        const pa = A.p.clone().addScaledVector(A.arm, k * A.w);
        const pb = B.p.clone().addScaledVector(B.arm, k * B.w);
        const span = pa.distanceTo(pb);
        const sag = 0.012 * span + 0.15;
        const n = 12;
        for (let j = 0; j < n; j++) {
          const t0 = j / n;
          const t1 = (j + 1) / n;
          const q0 = pa.clone().lerp(pb, t0);
          q0.y -= sag * 4 * t0 * (1 - t0);
          const q1 = pa.clone().lerp(pb, t1);
          q1.y -= sag * 4 * t1 * (1 - t1);
          pts.push(q0, q1);
        }
      }
    }
    const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
    wires.userData.noShadow = true;
    this.group.add(wires);
  }

  // ------------------------------------------------------------ the board
  // At the rim, looking down on the plant: what it does and its numbers.
  buildBoard() {
    const W = this.game.world;
    const P = this.game.props;
    const C = this.game.colliders;
    // the board faces away from the gorge, so a reader looks over it at the
    // powerhouse
    const toHouse = Math.atan2(HOUSE.x - BOARD_AT.x, HOUSE.z - BOARD_AT.z);
    const yaw = toHouse + Math.PI;
    const gy = W.heightAt(BOARD_AT.x, BOARD_AT.z);
    const b = new ModelBuilder();
    for (const s of [-1, 1]) b.box(0.12, 1.9, 0.12, { pos: [s * 0.95, 0.95, 0], color: WOOD_DARK, surf: 'log' });
    b.box(2.25, 0.1, 0.4, { pos: [0, 1.95, -0.05], rot: [0.3, 0, 0], color: 0x4a3420, surf: 'plank' });
    P.addMesh(b.build(), BOARD_AT.x, gy, BOARD_AT.z, yaw);
    const tex = canvasTexture(1024, 560, (g, Wd, Hd) => {
      g.fillStyle = '#efe6d2';
      g.fillRect(0, 0, Wd, Hd);
      g.fillStyle = '#2e3a40';
      g.fillRect(0, 0, Wd, 110);
      g.fillStyle = '#efe6cf';
      g.font = '800 64px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textBaseline = 'middle';
      g.fillText('BEAR FALLS HYDRO', 40, 56);
      g.fillStyle = '#2a2e33';
      g.font = '600 34px "Barlow Condensed", "Arial Narrow", sans-serif';
      const lines = [
        'Water from the pool above the falls runs through a tunnel and down',
        'the penstock to the turbine in the powerhouse below, then back to the river.',
        `Drop ${this.head.toFixed(1)} m · flow ${HYDRO.flow} m³ a second · ${Math.round(HYDRO.eff * 100)}% kept`,
        `Power = 1000 × 9.81 × ${HYDRO.flow} × ${this.head.toFixed(1)} × ${HYDRO.eff} ≈ ${Math.round(this.power)} kW`,
        'Three-phase alternating current at 60 cycles a second: Tesla’s system.',
        'Count the wires on the poles: three.',
      ];
      lines.forEach((s, i) => {
        g.fillStyle = i === 3 ? '#8a3a20' : '#2a2e33';
        g.font = `${i === 3 ? 700 : 600} 34px "Barlow Condensed", "Arial Narrow", sans-serif`;
        g.fillText(s, 40, 160 + i * 64);
      });
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.98), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    face.position.set(BOARD_AT.x + Math.sin(yaw) * 0.07, gy + 1.3, BOARD_AT.z + Math.cos(yaw) * 0.07);
    face.rotation.y = yaw;
    this.group.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 }));
    back.position.set(BOARD_AT.x, gy + 1.3, BOARD_AT.z);
    back.rotation.y = yaw;
    this.group.add(back);
    C.addBox(BOARD_AT.x, BOARD_AT.z, 1.0, 0.1, yaw, gy - 0.3, gy + 2.2);
    this.boardFront = { x: BOARD_AT.x + Math.sin(yaw) * 1.1, z: BOARD_AT.z + Math.cos(yaw) * 1.1 };
  }

  // ------------------------------------------------------------ the coil
  get coilRunning() {
    return this.coilT > 0;
  }

  // Press the red button: six seconds of sparks.
  runCoil() {
    if (this.coilT > 0 || this.coilCool > 0) return false;
    this.coilT = 6;
    this.arcs.visible = true;
    this.game.audio.coil?.(this.coilTop.x, this.coilTop.z, 6);
    return true;
  }

  // Sculpt the statue: a few milliseconds a frame once you are within a
  // kilometre (or all at once, for tests).
  sculptStep(budget = 3) {
    if (!this.sculpt) return true;
    const t0 = performance.now();
    let r = this.sculpt.next();
    while (!r.done && performance.now() - t0 < budget) r = this.sculpt.next();
    if (!r.done) return false;
    this.statue.geometry.dispose();
    this.statue.geometry = r.value;
    this.statue.visible = true;
    this.sculpt = null;
    return true;
  }

  finishSculpt() {
    return this.sculptStep(1e9);
  }

  update(dt) {
    const g = this.game;
    if (this.sculpt) {
      const c = g.camera.position;
      if (Math.hypot(c.x - TESLA.x, c.z - TESLA.z) < 1000) this.sculptStep(3);
    }
    // the foam drifts away downstream
    if (this.foamTex) {
      this.foamTex.offset.x += dt * 0.05;
      this.foamTex.offset.y += dt * 0.11;
    }
    this.coilCool = Math.max(0, this.coilCool - dt);
    if (this.coilT <= 0) return;
    this.coilT -= dt;
    if (this.coilT <= 0) {
      this.coilT = 0;
      this.coilCool = 1.5;
      this.arcs.visible = false;
      this.glow.material.opacity = 0;
      this.tubeMat.emissiveIntensity = 0;
      return;
    }
    // the tube glows, flickering with the bursts of the spark gap
    const flick = 0.65 + 0.35 * Math.random();
    this.tubeMat.emissiveIntensity = 2.6 * flick;
    this.glow.material.opacity = 0.55 + 0.35 * Math.random();
    // new sparks every few hundredths of a second
    this.arcClock = (this.arcClock || 0) - dt;
    if (this.arcClock <= 0) {
      this.arcClock = 0.045;
      this.buildArcs(g.camera.position);
      if (Math.random() < 0.35) g.audio.zap?.(this.coilTop.x, this.coilTop.z);
    }
  }

  // Sparks from the ring on the coil's top: crooked, forking, most dying in
  // the air and one or two striking the earthed ball or the cage. Each
  // spark is a strip of quads turned to the eye.
  buildArcs(eye) {
    const P = this.arcPos;
    const top = this.coilTop;
    let q = 0;
    const maxQ = P.length / 12;
    const quad = (a, c, w) => {
      if (q >= maxQ) return;
      const dir = _d.subVectors(c, a);
      const side = _s.subVectors(a, eye).cross(dir).normalize().multiplyScalar(w);
      const o = q * 12;
      P[o] = a.x - side.x;
      P[o + 1] = a.y - side.y;
      P[o + 2] = a.z - side.z;
      P[o + 3] = a.x + side.x;
      P[o + 4] = a.y + side.y;
      P[o + 5] = a.z + side.z;
      P[o + 6] = c.x - side.x;
      P[o + 7] = c.y - side.y;
      P[o + 8] = c.z - side.z;
      P[o + 9] = c.x + side.x;
      P[o + 10] = c.y + side.y;
      P[o + 11] = c.z + side.z;
      q++;
    };
    const spark = (from, to, w, segs, jag) => {
      let prev = from.clone();
      const d = to.clone().sub(from);
      for (let i = 1; i <= segs; i++) {
        const p = from.clone().addScaledVector(d, i / segs);
        if (i < segs) p.add(_r.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(jag));
        quad(prev, p, w * (1 - (i / segs) * 0.5));
        // a fork now and then
        if (i > 1 && i < segs && Math.random() < 0.18) {
          const fk = p.clone().add(_r.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.35));
          quad(p, fk, w * 0.5);
        }
        prev = p;
      }
    };
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const from = top.clone().add(_r.set(Math.cos(ang) * 0.33, (Math.random() - 0.5) * 0.08, Math.sin(ang) * 0.33));
      let to;
      if (i === 0) to = this.coilTarget.clone();
      else {
        const L = 0.45 + Math.random() * 0.6;
        to = from.clone().add(_r.set(Math.cos(ang) * L, (Math.random() - 0.35) * L * 0.9, Math.sin(ang) * L));
      }
      spark(from, to, 0.014 + Math.random() * 0.012, 7, 0.16);
    }
    // the unused quads fold away to nothing
    for (let o = q * 12; o < P.length; o++) P[o] = top.getComponent(o % 3);
    this.arcs.geometry.attributes.position.needsUpdate = true;
  }

  // The plaque's story, for the note it opens.
  plaqueNote() {
    return {
      title: 'Nikola Tesla (1856–1943)',
      html: [
        'Born on 10 July 1856 in Smiljan, then in the Austrian Empire and now in Croatia; died in New York on 7 January 1943.',
        'In 1888 he showed that two or more alternating currents, each a little behind the other, make a magnetic field that turns by itself: the <b>rotating magnetic field</b>. A motor built on it needs no brushes and no switches. It is the induction motor in fans, pumps and fridges today.',
        'George Westinghouse bought his patents. Westinghouse won the contract for the generators at Niagara Falls in 1893, and on 16 November 1896 the falls’ power reached Buffalo: the first big power station built on alternating current.',
        'In 1891 he showed his <b>coil</b>: a resonant transformer that makes very high voltage at very high frequency. Gas-filled tubes glowed in his hands with no wire to them. Try the one in the coil house.',
        'The unit of magnetic field strength, the <b>tesla</b>, has carried his name since 1960.',
        'The statue copies the pose of Frano Kršinić’s bronze on Goat Island at Niagara Falls, a gift from Yugoslavia in 1976: Tesla seated, reading his notes.',
      ],
    };
  }

  hydroNote() {
    const h = this.head.toFixed(1);
    return {
      title: 'Bear Falls Hydro',
      html: [
        'Water from the pool above the falls runs into the intake, through a tunnel in the rock and down the <b>penstock</b>, the big pipe, to a turbine in the powerhouse at the foot of the gorge, and back to the river.',
        `<span class="formula">Power = water’s density × gravity × flow × drop × efficiency<br>= 1000 kg/m³ × 9.81 m/s² × ${HYDRO.flow} m³/s × ${h} m × ${HYDRO.eff}<br>≈ <b>${Math.round(this.power)} kW</b></span>`,
        `That is about as much as ${Math.round(this.power / 1.2)} homes use on average. Double the drop or double the flow and you double the power.`,
        'The generator makes <b>three-phase alternating current</b> at 60 cycles a second: three currents, each a third of a turn behind the next. That is Tesla’s polyphase system, and why the poles carry three wires.',
        'Why alternating current? A transformer can step it up and down. Up to a high voltage it travels far with little loss (the loss in a wire grows with the square of the current, and a high voltage carries the same power with a small current); down again it is safe to use at home.',
      ],
    };
  }

  coilNote() {
    return {
      title: 'The Tesla coil',
      html: [
        'A small <b>primary</b> coil at the bottom and the tall <b>secondary</b> of fine wire are tuned to ring at the same frequency, like two swings. Energy passes back and forth between them and builds up to a few hundred thousand volts on the ring at the top, swinging hundreds of thousands of times a second.',
        'The sparks are air torn apart by the field. The tube on the stand lights with <b>no wire to it</b>: the changing field drives the gas inside to glow. Tesla showed it in New York on 20 May 1891.',
        'The cage round the coil is earthed: a spark that reaches for you strikes the cage and runs harmlessly to the ground.',
      ],
    };
  }
}

const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _r = new THREE.Vector3();
