// The race car hidden in the woods: a Formula One car of the ground-effect
// era in an aurora livery. A lofted monocoque with the halo over the
// cockpit, sidepods with high narrow inlets over an undercut, a carbon
// floor and diffuser, a four-element front wing on a low nose, a rear wing
// whose top flap opens on the straights, slicks on 18-inch wheels with aero
// covers, push-rod wishbones, and Ruben in a race suit and helmet.
// Blindingly fast on a road, hopeless on grass: it sits two fingers off
// the ground. Physics and cameras: entities/car.js.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { Car } from './car.js';
import { Driver } from './drivers.js';
import { loft, capRing, tube, latheX, tyreGeometry, tyreTexture, canvasTexture, plainUv, merge } from './carparts.js';
import { clamp, lerp, smoothstep, damp } from '../util/math.js';
import { SURF } from '../world/worldgen.js';
import { lookColors } from '../gameplay/data.js';

const SPEC = {
  id: 'racer',
  wheelbase: 3.6,
  ground: { fx: 0.8, fz: 1.8, rx: 0.78, rz: -1.8 },
  collider: { hx: 1.0, hz: 2.85, lz: 0.05, h: 1.0 },
  circles: { at: [2.2, 0.75, -0.75, -2.15], r: 0.95 },
  exit: { lx: 1.55, lz: -0.3 },
  climb: 0.7,
  wade: { shallow: 0.12, cap: 2.5, deep: 0.32, toast: 'Too deep for a race car: it sits two fingers off the ground' },
  // arcade grip: about twelve g, so it corners at least as well as the hot rod
  steer: { lock: 0.42, fade: 0.8, fadeSpeed: 70, rate: 9, lateral: 120 },
  body: { lean: 0.004, leanMax: 0.022, squat: 0.008, dive: 0.012, idle: 0.0015, rough: 0.045 },
  engine: { gears: [0, 20, 30, 40, 50, 60, 70, 80, 100], idle: 4200, span: 7800, shift: 4600, blip: 1200, redline: 12500 },
  cam: { eye: [0, 0.865, -0.36], pitch: -0.07, chasePitch: -0.1, chaseDist: 6.4, chaseHeight: 1.9, lookHeight: 0.6 },
  exhaust: null,
};

const NAVY = '#0b1a3a';
const GREEN = '#3dff9a';
const TEAL = '#21d4d0';
const VIOLET = '#8b5cff';
const WHITE = '#f4f6fb';
const BLACK = '#0d0e11';
// swatches in the livery's top right corner for plain parts
const SW_NAVY = [0.992, 0.984];
const SW_GREEN = [0.977, 0.984];
const SW_BLACK = [0.961, 0.984];

// ---------------------------------------------------------------- chassis
// Stations from the nose tip to the gearbox: z, bottom, top, half width at
// the bottom and at the top, and how square the section is.
const CH = [
  [2.9, 0.098, 0.108, 0.012, 0.01, 2],
  [2.88, 0.084, 0.125, 0.05, 0.04, 2.2],
  [2.75, 0.078, 0.168, 0.085, 0.068, 2.4],
  [2.55, 0.088, 0.23, 0.108, 0.086, 2.6],
  [2.3, 0.105, 0.3, 0.128, 0.1, 2.8],
  [2.0, 0.122, 0.38, 0.152, 0.116, 3],
  [1.7, 0.13, 0.46, 0.176, 0.136, 3.2],
  [1.4, 0.118, 0.54, 0.2, 0.158, 3.4],
  [1.1, 0.1, 0.6, 0.226, 0.18, 3.6],
  [0.8, 0.08, 0.635, 0.248, 0.198, 3.8],
  [0.5, 0.07, 0.655, 0.268, 0.218, 4],
  [0.28, 0.07, 0.668, 0.278, 0.228, 4],
  [-0.1, 0.07, 0.68, 0.285, 0.23, 4],
  [-0.52, 0.07, 0.71, 0.29, 0.2, 4],
  [-0.66, 0.07, 0.925, 0.3, 0.12, 3.2],
  [-0.85, 0.07, 0.962, 0.31, 0.11, 3],
  [-1.1, 0.07, 0.9, 0.3, 0.1, 3],
  [-1.4, 0.08, 0.78, 0.26, 0.09, 3],
  [-1.7, 0.12, 0.64, 0.2, 0.08, 3],
  [-2.0, 0.2, 0.53, 0.14, 0.07, 3],
  [-2.2, 0.26, 0.48, 0.09, 0.05, 2.6],
  [-2.3, 0.3, 0.44, 0.04, 0.03, 2.4],
];
const Z_NOSE = 2.9;
const Z_GEAR = -2.3;
const Z_CF = 0.28; // cockpit opening, front and back
const Z_CB = -0.52;
const RING = 40;
const RIM = 15; // the cockpit sides end at this ring index

// Smooth interpolation of a station table (first column z, descending).
function interp(T, z) {
  let i = 0;
  while (i < T.length - 2 && z < T[i + 1][0]) i++;
  const a = T[i];
  const b = T[i + 1];
  const h = a[0] - b[0];
  const t = clamp((a[0] - z) / h, 0, 1);
  const out = [z];
  for (let k = 1; k < a.length; k++) {
    const sl = (j) => {
      const p = T[Math.max(0, j - 1)];
      const n = T[Math.min(T.length - 1, j + 1)];
      return (n[k] - p[k]) / (p[0] - n[0] || 1);
    };
    const m0 = sl(i) * h;
    const m1 = sl(i + 1) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    out.push((2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * m1);
  }
  return out;
}

// A ring round a tapered rounded section: index 0 at the bottom centre, a
// quarter round at +x, half at the top, three quarters at -x.
function ringPoint(st, i, ring = RING) {
  const [z, yb, yt, wb, wt, n] = st;
  const th = -Math.PI / 2 + (i / ring) * Math.PI * 2;
  const e = 2 / n;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const sx = Math.sign(c) * Math.pow(Math.abs(c), e);
  const sy = Math.sign(s) * Math.pow(Math.abs(s), e);
  const w = lerp(wb, wt, (sy + 1) / 2);
  return [sx * w, (yb + yt) / 2 + (sy * (yt - yb)) / 2, z];
}

function zSteps(z0, z1, step) {
  const n = Math.max(1, Math.round(Math.abs(z0 - z1) / step));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(z0 + ((z1 - z0) * i) / n);
  return out;
}

const uChassis = (z) => (Z_NOSE - z) / (Z_NOSE - Z_GEAR);

function chassisGeometry() {
  const parts = [];
  const full = (zs) => {
    const secs = zs.map((z) => {
      const st = interp(CH, z);
      const r = [];
      for (let i = 0; i <= RING; i++) r.push(ringPoint(st, i));
      return r;
    });
    return loft(secs, { uv: (i, j) => [uChassis(secs[i][0][2]), (j / RING) * 0.6] });
  };
  parts.push(full(zSteps(Z_NOSE, Z_CF, 0.04)));
  parts.push(full(zSteps(Z_CB, Z_GEAR, 0.04)));
  // the cockpit's sides, rolled over into the opening
  for (const s of [1, -1]) {
    const zs = zSteps(Z_CF, Z_CB, 0.04);
    const secs = zs.map((z) => {
      const st = interp(CH, z);
      const r = [];
      for (let i = 0; i <= RIM; i++) r.push(ringPoint(st, i));
      const top = r[RIM];
      r.push([top[0] - 0.02, top[1] + 0.006, z], [top[0] - 0.04, top[1] - 0.015, z], [top[0] - 0.045, top[1] - 0.13, z]);
      return r.map((p) => [s * p[0], p[1], p[2]]);
    });
    const vOf = (j) => (Math.min(j, RIM + 3) / RING) * 0.6;
    parts.push(loft(secs, { uv: (i, j) => [uChassis(secs[i][0][2]), s > 0 ? vOf(j) : 0.6 - vOf(j)], flip: s < 0 }));
  }
  // close the nose tip, the gearbox, and the cockpit's front and back walls
  const ringAt = (z) => {
    const st = interp(CH, z);
    const r = [];
    for (let i = 0; i < RING; i++) r.push(ringPoint(st, i));
    return r;
  };
  parts.push(capRing(ringAt(Z_GEAR), { flip: true, uv: SW_BLACK }));
  parts.push(capRing(ringAt(Z_CF), { flip: true, uv: SW_BLACK }));
  parts.push(capRing(ringAt(Z_CB), { flip: false, uv: SW_BLACK }));
  return merge(parts);
}

// -------------------------------------------------------------- sidepods
// z, centre x, centre y, half width, half height, squareness
const SP = [
  [0.64, 0.5, 0.48, 0.2, 0.135, 3.4],
  [0.55, 0.505, 0.465, 0.225, 0.16, 3.4],
  [0.35, 0.5, 0.44, 0.24, 0.19, 3.2],
  [0.0, 0.48, 0.41, 0.24, 0.2, 3],
  [-0.4, 0.45, 0.37, 0.22, 0.19, 3],
  [-0.8, 0.4, 0.32, 0.19, 0.17, 3],
  [-1.15, 0.34, 0.27, 0.14, 0.14, 3],
  [-1.45, 0.28, 0.24, 0.08, 0.1, 2.8],
  [-1.7, 0.22, 0.22, 0.04, 0.06, 2.6],
];
const SP_RING = 32;
const uPod = (z) => (0.64 - z) / 2.34;

function podRing(z, s) {
  const [, cx, cy, hw, hh, n] = interp(SP, z);
  const e = 2 / n;
  const r = [];
  for (let i = 0; i <= SP_RING; i++) {
    const th = -Math.PI / 2 + (i / SP_RING) * Math.PI * 2;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const x = cx + Math.sign(c) * Math.pow(Math.abs(c), e) * hw;
    const y = cy + Math.sign(sn) * Math.pow(Math.abs(sn), e) * hh;
    r.push([s * x, y, z]);
  }
  return r;
}

function sidepodGeometry(s) {
  const zs = zSteps(0.64, -1.7, 0.06);
  const secs = zs.map((z) => podRing(z, s));
  const band = s > 0 ? 0.6 : 0.8;
  const g = loft(secs, { uv: (i, j) => [uPod(secs[i][0][2]), band + (j / SP_RING) * 0.2], flip: s < 0 });
  const tail = capRing(podRing(-1.7, s).slice(0, SP_RING), { flip: s > 0, uv: SW_NAVY });
  return merge([g, tail]);
}

// ------------------------------------------------------------------ foils
// A thin cambered section as a ring: chord from the leading edge at 0 back
// along -z, the suction side underneath (it is a wing upside down), pitched
// trailing edge up about the leading edge.
function foilRing(chord, pitch, { thick = 0.09, camber = 0.05, n = 7 } = {}) {
  const up = [];
  const lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const t = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const c = -camber * 4 * x * (1 - x);
    up.push([x, c + t]);
    lo.push([x, c - t]);
  }
  const ring = [];
  for (let i = n; i >= 0; i--) ring.push(up[i]);
  for (let i = 1; i < n; i++) ring.push(lo[i]);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return ring.map(([x, y]) => {
    const zc = -x * chord;
    const yc = y * chord;
    return [zc * cp + yc * sp, yc * cp - zc * sp];
  });
}

// A wing element along the span from x0 to x1 (positive side), mirrored to
// the other side. at(t) gives the leading edge [z, y], chord and pitch at
// t (0 inboard, 1 at the tip).
function wingElement(x0, x1, at, { steps = 12, both = true } = {}) {
  const out = [];
  for (const s of both ? [1, -1] : [1]) {
    const secs = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const { z, y, chord, pitch } = at(t);
      const ring = foilRing(chord, pitch);
      secs.push(ring.map(([dz, dy]) => [s * x, y + dy, z + dz]));
    }
    const n = secs[0].length;
    const g = loft(secs, { closed: true, flip: s > 0, uv: (i, j) => [(x0 + ((x1 - x0) * i) / steps) / 0.12, (j / n) * 2] });
    out.push(g);
    // the ring turns counter-clockwise seen from +x on both sides: the
    // inboard end faces the middle, the tip faces out
    out.push(capRing(secs[0].slice(0), { flip: s > 0, uv: [0, 0] }));
    out.push(capRing(secs[steps].slice(0), { flip: s < 0, uv: [0, 0] }));
  }
  return out;
}

// A flat plate (an end plate) from a side outline [z, y], thickness w,
// standing at x.
function plate(outline, x, w) {
  const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 4 });
  // shape x -> z, extrusion -> -x
  g.rotateY(-Math.PI / 2);
  g.translate(x + w / 2, 0, 0);
  const uv = g.attributes.uv.array;
  for (let i = 0; i < uv.length; i++) uv[i] /= 0.12;
  return g;
}

// --------------------------------------------------------------- textures
function carbonTexture() {
  const t = canvasTexture(
    256,
    256,
    (g, W, H) => {
      g.fillStyle = '#16171a';
      g.fillRect(0, 0, W, H);
      const n = 16;
      const c = W / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          // 2x2 twill: tows run one way, then the other, offset each row
          const along = (i + j) % 4 < 2;
          const gr = along ? g.createLinearGradient(i * c, 0, (i + 1) * c, 0) : g.createLinearGradient(0, j * c, 0, (j + 1) * c);
          gr.addColorStop(0, '#1c1d21');
          gr.addColorStop(0.5, along ? '#3a3c43' : '#2b2d33');
          gr.addColorStop(1, '#1c1d21');
          g.fillStyle = gr;
          g.fillRect(i * c + 0.5, j * c + 0.5, c - 1, c - 1);
        }
      }
    },
    { repeat: true }
  );
  return t;
}

function liveryTexture() {
  return canvasTexture(2048, 1024, (g, W, H) => {
    const Y = (v) => (1 - v) * H;
    g.fillStyle = NAVY;
    g.fillRect(0, 0, W, H);
    const aurora = (x0, x1) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, GREEN);
      gr.addColorStop(0.55, TEAL);
      gr.addColorStop(1, VIOLET);
      return gr;
    };
    // ---- the tub, nose to gearbox (v 0 to 0.6): black underneath, the
    // aurora stripe down the spine widening toward the engine cover
    g.fillStyle = BLACK;
    g.fillRect(0, Y(0.085), W, Y(0) - Y(0.085));
    g.fillRect(0, Y(0.6), W, Y(0.515) - Y(0.6));
    const ribbon = (vc, w0, w1, amp, freq, phase, alpha) => {
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = aurora(0, W);
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        const half = lerp(w0, w1, u);
        g.lineTo(u * W, Y(vc + half + amp * Math.sin(u * freq + phase)));
      }
      for (let i = 120; i >= 0; i--) {
        const u = i / 120;
        const half = lerp(w0, w1, u);
        g.lineTo(u * W, Y(vc - half + amp * Math.sin(u * freq + phase)));
      }
      g.closePath();
      g.fill();
      g.restore();
    };
    ribbon(0.3, 0.012, 0.05, 0.004, 9, 0, 0.35);
    ribbon(0.3, 0.007, 0.03, 0.004, 9, 0, 1);
    // thin white pinlines either side
    g.strokeStyle = WHITE;
    g.lineWidth = 2;
    for (const m of [1, -1]) {
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        g.lineTo(u * W, Y(0.3 + m * lerp(0.016, 0.062, u) + 0.004 * Math.sin(u * 9)));
      }
      g.stroke();
    }
    // the number on the nose, readable from in front
    g.save();
    g.translate(0.17 * W, Y(0.3));
    g.rotate(Math.PI / 2);
    g.scale(1, 0.5);
    g.font = '800 120px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = NAVY;
    g.strokeText('99', 0, 0);
    g.fillStyle = WHITE;
    g.fillText('99', 0, 0);
    g.restore();
    // ---- the sidepods: left v 0.6 to 0.8, right v 0.8 to 1.0; band v
    // 0 is the bottom, 0.25 the outer face, 0.5 the top
    for (const [band, mirror] of [
      [0.6, false],
      [0.8, true],
    ]) {
      const V = (b) => Y(band + b * 0.2);
      g.fillStyle = BLACK;
      g.fillRect(0, V(0.06), W, V(0) - V(0.06));
      g.fillRect(0, V(1), W, V(0.94) - V(1));
      // an aurora curtain sweeping up and back over the outer face
      g.save();
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        g.lineTo(u * W, V(0.3 + 0.12 * u + 0.025 * Math.sin(u * 14)));
      }
      for (let i = 120; i >= 0; i--) {
        const u = i / 120;
        g.lineTo(u * W, V(0.15 + 0.2 * u * u + 0.02 * Math.sin(u * 11 + 1)));
      }
      g.closePath();
      g.fillStyle = aurora(0, W);
      g.globalAlpha = 0.95;
      g.fill();
      // curtain rays
      g.globalAlpha = 0.35;
      g.strokeStyle = '#d8fff0';
      g.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const u = 0.05 + i * 0.023;
        g.beginPath();
        g.moveTo(u * W, V(0.16 + 0.2 * u * u));
        g.lineTo((u + 0.01) * W, V(0.3 + 0.12 * u));
        g.stroke();
      }
      g.restore();
      // the team's backer, readable from its own side
      g.save();
      g.translate(0.36 * W, V(0.205));
      if (mirror) g.scale(-1, 1);
      g.scale(1, 0.62);
      g.font = '800 64px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = WHITE;
      g.fillText('KENAI TRADING POST', 0, 0);
      g.restore();
    }
    // swatches for plain parts
    g.fillStyle = NAVY;
    g.fillRect(W - 32, 0, 32, 32);
    g.fillStyle = GREEN;
    g.fillRect(W - 64, 0, 32, 32);
    g.fillStyle = BLACK;
    g.fillRect(W - 96, 0, 32, 32);
  });
}

// The rear wing's end plates carry the bait shop's name.
function plateTexture() {
  return canvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, GREEN);
    gr.addColorStop(1, VIOLET);
    g.fillStyle = gr;
    g.fillRect(0, H * 0.72, W, H * 0.08);
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 58px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('MOOSE LAKE', W / 2, H * 0.3);
    g.font = '700 40px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('BAIT & TACKLE', W / 2, H * 0.55);
  });
}

function wheelDisplayTexture() {
  return canvasTexture(256, 160, (g, W, H) => {
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, H);
    // shift lights: green, red, blue
    const cols = ['#2bff6a', '#2bff6a', '#2bff6a', '#2bff6a', '#ff3030', '#ff3030', '#ff3030', '#ff3030', '#3a7bff', '#3a7bff'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(22 + i * 23.5, 16, 8, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = '#e8f0ff';
    g.font = '800 90px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('8', W / 2, H * 0.6);
    g.font = '700 22px "Barlow Condensed", sans-serif';
    g.fillStyle = '#ffcc3a';
    g.fillText('BBAL 54.2', 50, H * 0.88);
    g.fillText('ERS 92%', W - 50, H * 0.88);
  });
}

function suitTexture() {
  const t = canvasTexture(
    128,
    128,
    (g, W, H) => {
      g.fillStyle = NAVY;
      g.fillRect(0, 0, W, H);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, GREEN);
      gr.addColorStop(1, VIOLET);
      g.fillStyle = gr;
      g.fillRect(W * 0.4, 0, W * 0.14, H);
      g.fillStyle = WHITE;
      g.fillRect(W * 0.56, 0, 2, H);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
        g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
      }
    },
    { repeat: true }
  );
  return t;
}

// ===================================================================== car
export class RaceCar extends Car {
  constructor(game) {
    super(game, SPEC);
    this.name = 'race car';
    this.drs = 0;
    this._inv = new THREE.Matrix4();
  }

  handling() {
    if (this._h) return this._h;
    this._h = {
      top: 88,
      accel: 13,
      grip: 13,
      offGrip: 2.6,
      // off the tarmac the floor drags: grass, moss and gravel alike
      offroad: (surf) => (surf === SURF.GRAVEL || surf === SURF.SAND ? 0.17 : surf === SURF.ROCK ? 0.09 : surf === SURF.MUD || surf === SURF.SNOW || surf === SURF.ICE ? 0.07 : 0.12),
      brake: 34,
      brakeOff: 9,
      coast: 2.2,
      coastOff: 4,
      reverse: 4,
    };
    return this._h;
  }

  buildModel() {
    const carbonTex = carbonTexture();
    const M = {
      livery: new THREE.MeshPhysicalMaterial({ map: liveryTexture(), roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
      carbon: new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.45, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
      carbon2: new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.55, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 }),
      chrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 1 }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.35, metalness: 0.2 }),
      display: new THREE.MeshBasicMaterial({ map: wheelDisplayTexture(), toneMapped: false }),
      rain: new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0xff1a0a, emissiveIntensity: 0.1, roughness: 0.3 }),
      foam: new THREE.MeshStandardMaterial({ color: 0x14203a, roughness: 0.9, metalness: 0 }),
    };
    this.materials = M;
    const body = this.body;
    const add = (geo, mat, { shadow = true, parent = body } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // ---- painted: tub, sidepods, halo, mirrors, nose pylons, inlet lips
    const paint = [chassisGeometry(), sidepodGeometry(1), sidepodGeometry(-1)];
    // the halo: a hoop over the cockpit on a pillar in front of the driver
    const halo = tube(
      [
        [0.21, 0.72, -0.62],
        [0.265, 0.84, -0.42],
        [0.26, 0.895, -0.12],
        [0.18, 0.915, 0.08],
        [0.07, 0.925, 0.155],
        [0, 0.927, 0.165],
        [-0.07, 0.925, 0.155],
        [-0.18, 0.915, 0.08],
        [-0.26, 0.895, -0.12],
        [-0.265, 0.84, -0.42],
        [-0.21, 0.72, -0.62],
      ],
      0.028,
      { radial: 12, tubular: 80 }
    );
    paint.push(plainUv(halo, ...SW_NAVY));
    paint.push(plainUv(tube([[0, 0.925, 0.165], [0, 0.85, 0.3], [0, 0.72, 0.4], [0, 0.66, 0.44]], 0.03, { radial: 12, tubular: 20 }), ...SW_NAVY));
    // inlet lips in the accent colour
    for (const s of [1, -1]) {
      const r = podRing(0.64, s).slice(0, SP_RING);
      paint.push(plainUv(tube(r.map((p) => [p[0], p[1], p[2] + 0.004]), 0.014, { closed: true, radial: 8, tubular: 64, tension: 0.2 }), ...SW_GREEN));
      // mirror housings on stalks
      const mh = new THREE.SphereGeometry(0.06, 16, 10);
      mh.scale(1.25, 0.6, 0.55);
      mh.translate(s * 0.48, 0.71, 0.26);
      paint.push(plainUv(mh, ...SW_NAVY));
    }
    for (const s of [1, -1]) {
      const p = new THREE.CylinderGeometry(0.012, 0.016, 0.16, 8);
      p.rotateX(0.5);
      p.translate(s * 0.05, 0.13, 2.68);
      paint.push(plainUv(p, ...SW_NAVY));
    }
    this.paintMesh = add(merge(paint), M.livery);

    // ---- carbon: floor, edge wings, front wing, rear wing, beam wing,
    // bargeboards, brake ducts
    const carbon = [];
    const fl = new THREE.Shape();
    const outline = [
      [0.5, 1.2],
      [0.8, 1.05],
      [0.88, 0.9],
      [0.88, -0.9],
      [0.8, -1.15],
      [0.62, -1.3],
      [0.55, -1.38],
      [0.5, -1.76],
    ];
    fl.moveTo(-outline[0][0], outline[0][1]);
    for (const [w, z] of outline) fl.lineTo(w, z);
    for (let i = outline.length - 1; i >= 0; i--) fl.lineTo(-outline[i][0], outline[i][1]);
    const floor = new THREE.ExtrudeGeometry(fl, { depth: 0.025, bevelEnabled: false });
    floor.rotateX(Math.PI / 2);
    floor.translate(0, 0.06, 0);
    {
      const uv = floor.attributes.uv.array;
      for (let i = 0; i < uv.length; i++) uv[i] /= 0.12;
    }
    carbon.push(floor);
    // the floor's edges curl up
    for (const s of [1, -1]) {
      const edge = new THREE.BoxGeometry(0.012, 0.07, 1.8);
      edge.rotateZ(-s * 0.45);
      edge.translate(s * 0.9, 0.088, 0);
      carbon.push(edge);
      // bargeboard fences under the sidepod's front
      for (let k = 0; k < 3; k++) {
        const f = new THREE.BoxGeometry(0.008, 0.11, 0.42);
        f.rotateY(s * (0.12 + k * 0.05));
        f.translate(s * (0.62 + k * 0.08), 0.11, 0.86 - k * 0.04);
        carbon.push(f);
      }
    }
    // front wing: four elements sweeping up to the end plates
    const sm = (t, a, b) => smoothstep(a, b, t);
    carbon.push(
      ...wingElement(0, 0.985, (t) => ({ z: 2.96 - 0.05 * t, y: 0.068 + 0.05 * sm(t, 0.55, 1), chord: 0.25 - 0.05 * t, pitch: 0.08 + 0.12 * t })),
      ...wingElement(0.1, 0.985, (t) => ({ z: 2.77 - 0.06 * t, y: 0.112 + 0.08 * sm(t, 0.45, 1), chord: 0.15, pitch: 0.3 + 0.2 * t })),
      ...wingElement(0.12, 0.985, (t) => ({ z: 2.66 - 0.07 * t, y: 0.162 + 0.085 * sm(t, 0.45, 1), chord: 0.11, pitch: 0.5 + 0.2 * t })),
      ...wingElement(0.14, 0.985, (t) => ({ z: 2.58 - 0.07 * t, y: 0.212 + 0.08 * sm(t, 0.45, 1), chord: 0.085, pitch: 0.72 + 0.15 * t }))
    );
    // rear wing main plane, a spoon dipping in the middle
    carbon.push(...wingElement(0, 0.5, (t) => ({ z: -2.24, y: 0.775 + 0.02 * t * t, chord: 0.36, pitch: 0.14 })));
    // beam wing
    carbon.push(...wingElement(0.02, 0.46, () => ({ z: -2.28, y: 0.43, chord: 0.12, pitch: 0.2 })));
    carbon.push(...wingElement(0.02, 0.46, () => ({ z: -2.36, y: 0.5, chord: 0.11, pitch: 0.5 })));
    this.carbonMesh = add(merge(carbon), M.carbon);

    // the flap on top of the rear wing: opens on the straights
    const flap = merge(wingElement(0, 0.5, () => ({ z: 0, y: 0, chord: 0.21, pitch: 0 })));
    this.flap = add(flap, M.carbon);
    this.flap.position.set(0, 0.895, -2.53);
    this.flap.rotation.x = 0.85;

    // ---- thin carbon plates: diffuser ramp and strakes, end plates
    const thin = [];
    const ramp = [];
    for (const z of zSteps(-1.74, -2.34, 0.06)) {
      const t = (-1.74 - z) / 0.6;
      const y = 0.06 + 0.24 * t * t * (3 - 2 * t) * 0.9 + 0.02 * t;
      ramp.push([
        [0.48, y, z],
        [-0.48, y, z],
      ]);
    }
    thin.push(loft(ramp, { uv: (i, j) => [j * 8, i * 0.6] }));
    for (const x of [-0.48, -0.3, -0.12, 0.12, 0.3, 0.48]) {
      thin.push(plate([[-1.74, 0.03], [-2.34, 0.03], [-2.34, 0.32], [-2.1, 0.22], [-1.74, 0.07]], x, 0.006));
    }
    // front wing end plates
    for (const s of [1, -1]) {
      thin.push(plate([[2.97, 0.03], [2.47, 0.03], [2.44, 0.1], [2.47, 0.3], [2.62, 0.315], [2.9, 0.2], [2.98, 0.1]], s * 0.99, 0.012));
      // rear wing end plates
      thin.push(plate([[-2.2, 0.56], [-2.21, 0.92], [-2.3, 0.975], [-2.76, 0.975], [-2.78, 0.62], [-2.6, 0.52]], s * 0.51, 0.014));
      // the front tyres' wake control winglets
      const arc = [];
      for (let k = 0; k <= 10; k++) {
        const a = -0.25 + (k / 10) * 1.2;
        arc.push([
          [s * 0.68, 0.36 + Math.sin(a) * 0.43, 1.8 + Math.cos(a) * 0.43],
          [s * 0.8, 0.36 + Math.sin(a) * 0.44, 1.8 + Math.cos(a) * 0.44],
        ]);
      }
      thin.push(loft(arc, { uv: (i, j) => [j * 2, i] }));
    }
    this.thinMesh = add(merge(thin), M.carbon2);
    // the bait shop's name on the rear wing end plates
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.5, 0.25);
      if (s < 0) {
        const uv = g.attributes.uv.array;
        for (let i = 0; i < uv.length; i += 2) uv[i] = 1 - uv[i];
      }
      const m = add(g, M.plate, { shadow: false });
      m.position.set(s * 0.519, 0.77, -2.5);
      m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    // ---- dark parts: suspension, driveshafts, cockpit tub, steering
    // column, airbox mouth, T-camera, the radiators in the inlets
    const db = new ModelBuilder();
    const CF = 0x1d1e22;
    const sus = (a, b, w = 0.034, h = 0.012) => db.strut(a, b, w, h, { color: CF, jitter: 0 });
    for (const s of [1, -1]) {
      // front: upper and lower wishbones, push rod, track rod
      sus([s * 0.17, 0.5, 1.98], [s * 0.66, 0.52, 1.82]);
      sus([s * 0.19, 0.5, 1.56], [s * 0.66, 0.52, 1.8]);
      sus([s * 0.13, 0.2, 2.0], [s * 0.69, 0.2, 1.82]);
      sus([s * 0.15, 0.2, 1.52], [s * 0.69, 0.2, 1.8]);
      sus([s * 0.67, 0.22, 1.78], [s * 0.16, 0.56, 1.62], 0.026, 0.026);
      sus([s * 0.15, 0.36, 1.66], [s * 0.68, 0.37, 1.68], 0.02, 0.012);
      // rear: wishbones, pull rod, toe link
      sus([s * 0.13, 0.53, -1.55], [s * 0.6, 0.56, -1.78]);
      sus([s * 0.11, 0.53, -2.02], [s * 0.6, 0.56, -1.8]);
      sus([s * 0.13, 0.19, -1.5], [s * 0.63, 0.18, -1.78]);
      sus([s * 0.11, 0.19, -2.06], [s * 0.63, 0.18, -1.8]);
      sus([s * 0.6, 0.54, -1.76], [s * 0.15, 0.22, -1.62], 0.026, 0.026);
      sus([s * 0.12, 0.3, -1.95], [s * 0.62, 0.33, -1.92], 0.02, 0.012);
      db.beam([s * 0.1, 0.36, -1.8], [s * 0.6, 0.36, -1.8], 0.026, 10, { color: 0x111214, jitter: 0, smooth: true });
      // the radiator behind each inlet
      const rad = capRing(podRing(0.6, s).slice(0, SP_RING).map((p) => [s * (Math.abs(p[0]) * 0.96 + 0.02), p[1] * 0.99 + 0.004, 0.6]), { flip: s < 0 });
      rad.deleteAttribute('uv');
      db.add(rad, { color: 0x050506, jitter: 0, smooth: true });
      // mirror stalks
      db.strut([s * 0.4, 0.6, 0.3], [s * 0.47, 0.705, 0.27], 0.012, 0.03, { color: CF, jitter: 0 });
    }
    // the cockpit tub, the seat, the airbox's mouth, the T-camera
    db.box(0.4, 0.26, 0.78, { pos: [0, 0.45, -0.12], color: 0x0b0c0e, jitter: 0 });
    db.add(new THREE.SphereGeometry(0.1, 16, 10), { pos: [0, 0.835, -0.6], scale: [0.95, 0.62, 0.22], rot: [-0.7, 0, 0], color: 0x020203, jitter: 0, smooth: true });
    db.box(0.06, 0.035, 0.13, { pos: [0, 0.98, -0.86], color: 0x111111, jitter: 0 });
    db.box(0.062, 0.012, 0.13, { pos: [0, 1.0, -0.86], color: 0xffd23a, jitter: 0 });
    // the steering column
    db.beam([0, 0.45, 0.45], [0, 0.58, 0.14], 0.016, 8, { color: 0x222222, jitter: 0, smooth: true });
    this.darkMesh = add(db.build(), M.dark);

    // ---- headrest foam round the cockpit's back and sides
    const pad = tube(
      [
        [0.2, 0.655, 0.05],
        [0.205, 0.672, -0.3],
        [0.15, 0.69, -0.5],
        [0, 0.7, -0.535],
        [-0.15, 0.69, -0.5],
        [-0.205, 0.672, -0.3],
        [-0.2, 0.655, 0.05],
      ],
      0.05,
      { radial: 10, tubular: 50 }
    );
    add(pad, M.foam);

    // ---- metal: exhaust, wheel nuts, mirror glass
    const mb = new ModelBuilder();
    mb.beam([0, 0.41, -2.18], [0, 0.41, -2.37], 0.042, 16, { color: 0xc9b9a0, jitter: 0, smooth: true });
    for (const s of [1, -1]) mb.add(new THREE.CircleGeometry(0.055, 16), { pos: [s * 0.48, 0.71, 0.227], rot: [0, Math.PI, 0], scale: [1.3, 0.55, 1], color: 0xffffff, jitter: 0, smooth: true });
    add(mb.build(), M.chrome, { shadow: false });

    // the rain light under the rear wing
    this.rainLight = add(new THREE.BoxGeometry(0.1, 0.045, 0.02), M.rain, { shadow: false });
    this.rainLight.position.set(0, 0.36, -2.345);

    // ---- steering wheel with its display, and Ruben in his race suit
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.6, 0.12);
    wheel.rotation.x = 0.55;
    const spin = new THREE.Group();
    wheel.add(spin);
    const sw = new ModelBuilder();
    sw.box(0.22, 0.11, 0.03, { pos: [0, 0, 0], color: 0x18191c, jitter: 0 });
    for (const s of [1, -1]) {
      sw.add(new THREE.CapsuleGeometry(0.024, 0.09, 4, 10), { pos: [s * 0.128, -0.005, 0.005], color: 0x0c0c0e, jitter: 0, smooth: true });
      for (let k = 0; k < 3; k++) sw.add(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), { pos: [s * (0.06 + k * 0.016), -0.035, -0.018], rot: [Math.PI / 2, 0, 0], color: [0xff3a3a, 0xffd23a, 0x3a9bff][k], jitter: 0, smooth: true });
    }
    const swMesh = add(sw.build(), M.dark, { parent: spin });
    swMesh.castShadow = false;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.056), M.display);
    disp.position.set(0, 0.012, -0.0155);
    disp.rotation.y = Math.PI;
    spin.add(disp);
    body.add(wheel);
    this.steeringWheel = spin;
    this.driver = new Driver({
      hip: [0, 0.28, -0.05],
      lean: -0.75,
      shoulder: 0.17,
      elbow: (s) => [s * 0.2, 0.5, -0.07],
      head: [0, 0.82, -0.43],
      wheel: spin,
      grip: [
        [0.128, 0, -0.01],
        [-0.128, 0, -0.01],
      ],
      suit: { texture: suitTexture(), collar: 0x0b1a3a, glove: 0x15161c, helmet: { shell: 0x0b1a3a, stripe: 0x3dff9a } },
    });
    body.add(this.driver.group);
    this.driver.visible = false;
    this.driver.setLook(lookColors(null));

    // ---- wheels: slicks with a red soft-compound ring, dark 18-inch rims
    // under flat aero covers, a centre-lock nut
    const tex = tyreTexture({ tread: 'slick', ring: '#e8202a', letters: 'SOFT' });
    const tyreMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
    M.tyre = tyreMat;
    const rim = (rr, hw) => {
      const dark = latheX(
        [
          [rr + 0.004, -0.96 * hw],
          [rr + 0.002, 0.88 * hw],
          [rr - 0.012, 0.92 * hw],
          [rr - 0.03, 0.84 * hw],
        ],
        32
      );
      const back = latheX([[0, -0.9 * hw], [rr + 0.004, -0.9 * hw]], 32);
      const cover = latheX(
        [
          [rr - 0.028, 0.845 * hw],
          [rr * 0.6, 0.86 * hw],
          [0.05, 0.87 * hw],
          [0.0, 0.87 * hw],
        ],
        32
      );
      const nut = latheX(
        [
          [0.045, 0.87 * hw],
          [0.044, 0.87 * hw + 0.03],
          [0.03, 0.87 * hw + 0.045],
          [0.0, 0.87 * hw + 0.048],
        ],
        12
      );
      return {
        dark: tintAll(merge([dark, back]), 0x15161a),
        cover: cover,
        nut: tintAll(nut, 0x3dff9a),
      };
    };
    const fr = rim(0.229, 0.1525);
    const rr = rim(0.229, 0.2025);
    const frontTyre = tyreGeometry(0.36, 0.305, 0.229, { n: 5 });
    const rearTyre = tyreGeometry(0.36, 0.405, 0.229, { n: 5.4 });
    const defs = [
      { x: 0.775, z: -1.8, r: 0.36, w: 0.405, front: false },
      { x: -0.775, z: -1.8, r: 0.36, w: 0.405, front: false },
      { x: 0.8, z: 1.8, r: 0.36, w: 0.305, front: true },
      { x: -0.8, z: 1.8, r: 0.36, w: 0.305, front: true },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, d.r, d.z);
      const spinG = new THREE.Group();
      pivot.add(spinG);
      const face = new THREE.Group();
      if (d.x < 0) face.rotation.y = Math.PI;
      spinG.add(face);
      const R = d.front ? fr : rr;
      const tyre = new THREE.Mesh(d.front ? frontTyre : rearTyre, tyreMat);
      tyre.castShadow = true;
      tyre.receiveShadow = true;
      face.add(tyre, new THREE.Mesh(R.dark, M.dark), new THREE.Mesh(R.cover, M.carbon), new THREE.Mesh(R.nut, M.chrome));
      // the brake duct inside the wheel does not turn with it
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 20), M.carbon);
      duct.rotation.z = Math.PI / 2;
      duct.position.x = -Math.sign(d.x) * (d.w / 2 - 0.02);
      pivot.add(duct);
      this.group.add(pivot);
      this.wheels.push({ ...d, pivot, spin: spinG });
    }
    this.poseDriver();
  }

  // The driver always wears the race suit; the wardrobe has no say here.
  setLook() {}

  setPaint() {}

  place(x, z, yaw) {
    super.place(x, z, yaw);
    this.poseDriver();
  }

  poseDriver() {
    this.group.updateMatrixWorld(true);
    (this._inv || (this._inv = new THREE.Matrix4())).copy(this.body.matrixWorld).invert();
    this.driver.pose(this._inv);
  }

  animate(dt) {
    this.steeringWheel.rotation.z = this.steer * 4.2;
    // the drag reduction flap opens flat out on a straight road
    const open = this.occupied && this.onRoad && this.speed > 55 && this.throttle > 0.9 && Math.abs(this.steer) < 0.03;
    this.drs = damp(this.drs, open ? 1 : 0, open ? 6 : 12, dt);
    this.flap.rotation.x = lerp(0.85, 0.2, this.drs);
    // the rain light blinks in the wet and the dark
    const env = this.game.env;
    const dim = env.night > 0.4 || env.weather.rain > 0.2;
    const blink = this.occupied && dim && Math.sin(this.game.time * Math.PI * 8) > 0;
    this.materials.rain.emissiveIntensity = blink ? 3.2 : this.brake && this.occupied ? 1.5 : 0.1;
    if (this.driver.visible) this.poseDriver();
  }
}

function tintAll(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
