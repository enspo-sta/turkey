// Ruben's '32 Ford highboy roadster: a lofted steel body in clearcoat paint
// with traditional flames and pinstripes, a blown small-block V8 out in the
// open with its headers and side pipes, a dropped I-beam axle on a
// transverse spring, a quick-change rear on ladder bars, wide whitewalls on
// steel wheels with baby moon caps, and a tuck-and-roll cockpit with live
// gauges and a steering wheel that turns. Physics and cameras: entities/car.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelBuilder } from '../util/builder.js';
import { Car, offroadFactor } from './car.js';
import { Driver } from './drivers.js';
import { loft, capRing, tube, latheX, tyreGeometry, tyreTexture, canvasTexture, plainUv, merge } from './carparts.js';
import { lerp, clamp } from '../util/math.js';
import { ENGINES, TIRES, PAINTS, lookColors } from '../gameplay/data.js';

const SPEC = {
  id: 'hotrod',
  wheelbase: 2.75,
  ground: { fx: 0.75, fz: 1.5, rx: 0.78, rz: -1.25 },
  collider: { hx: 0.95, hz: 2.2, lz: 0.1, h: 1.6 },
  circles: { at: [1.35, 0, -1.3], r: 0.95 },
  exit: { lx: 1.7, lz: -0.3 },
  climb: 0.95,
  wade: { shallow: 0.35, cap: 4.5, deep: 1.1, toast: 'Too deep for the hot rod' },
  steer: { lock: 0.58, fade: 0.62, fadeSpeed: 55, rate: 7, lateral: 0 },
  body: { lean: 0.012, leanMax: 0.08, squat: 0.03, dive: 0.025, idle: 0.004, rough: 0 },
  engine: { gears: [0, 9, 16, 25, 36, 60], idle: 850, span: 4200, shift: 0, blip: 900, redline: 6400 },
  cam: { eye: [0.3, 1.64, -0.5], pitch: -0.05, chasePitch: -0.12, chaseDist: 7.2, chaseHeight: 2.6, lookHeight: 1.1 },
  exhaust: { every: 0.09, at: [[0.66, 0.45, -0.72], [-0.66, 0.45, -0.72]] },
};

const REAR_R = 0.47;
const FRONT_R = 0.34;
const Z_FRONT = 0.62; // firewall
const Z_TAIL = -1.705;
const Z_DASH = 0.36; // the cockpit opens behind the cowl
const Z_BACK = -0.78; // and closes at the turtle deck
const U = (z) => (Z_FRONT - z) / (Z_FRONT - Z_TAIL);
const PIN = { flame: '#7fd4ff', black: '#6fc8ff', teal: '#ffffff', orange: '#1d1d1d' };

// The body's stations from the firewall to the tail: half width, bottom
// edge, belt line, crown of the top and the radius rolled over the belt.
const STATIONS = [
  { z: 0.62, w: 0.45, y0: 0.6, y1: 1.115, crown: 0.07, roll: 0.07 },
  { z: 0.52, w: 0.5, y0: 0.6, y1: 1.122, crown: 0.068, roll: 0.068 },
  { z: 0.36, w: 0.548, y0: 0.6, y1: 1.13, crown: 0.06, roll: 0.065 },
  { z: 0.0, w: 0.56, y0: 0.6, y1: 1.126, crown: 0.06, roll: 0.065 },
  { z: -0.42, w: 0.56, y0: 0.6, y1: 1.118, crown: 0.06, roll: 0.065 },
  { z: -0.78, w: 0.56, y0: 0.6, y1: 1.1, crown: 0.062, roll: 0.065 },
  { z: -1.0, w: 0.558, y0: 0.6, y1: 1.06, crown: 0.07, roll: 0.068 },
  { z: -1.2, w: 0.552, y0: 0.6, y1: 0.99, crown: 0.075, roll: 0.07 },
  { z: -1.38, w: 0.54, y0: 0.6, y1: 0.9, crown: 0.07, roll: 0.07 },
  { z: -1.52, w: 0.52, y0: 0.6, y1: 0.8, crown: 0.06, roll: 0.065 },
  { z: -1.62, w: 0.49, y0: 0.6, y1: 0.72, crown: 0.05, roll: 0.055 },
  { z: -1.68, w: 0.44, y0: 0.605, y1: 0.665, crown: 0.034, roll: 0.04 },
  { z: -1.705, w: 0.37, y0: 0.61, y1: 0.635, crown: 0.018, roll: 0.022 },
];

// Smooth (cubic Hermite) interpolation of a station field along z.
function station(z) {
  const S = STATIONS;
  let i = 0;
  while (i < S.length - 2 && z < S[i + 1].z) i++;
  const a = S[i];
  const b = S[i + 1];
  const t = clamp((a.z - z) / (a.z - b.z), 0, 1);
  const out = { z };
  for (const k of ['w', 'y0', 'y1', 'crown', 'roll']) {
    const slope = (j) => {
      const p = S[Math.max(0, j - 1)];
      const n = S[Math.min(S.length - 1, j + 1)];
      return (n[k] - p[k]) / (p.z - n.z || 1);
    };
    const h = a.z - b.z;
    const m0 = slope(i) * h;
    const m1 = slope(i + 1) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    out[k] = (2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * m1;
  }
  return out;
}

// Half a section (x >= 0) from the bottom edge up the side, over the roll
// at the belt and across the crown to the centre line: 18 points.
const SIDE_N = 7;
const ROLL_N = 5;
const CROWN_N = 6;
function halfSection(st, lip = false) {
  const pts = [];
  const top = st.y1 - st.roll;
  const sideH = Math.max(0.004, top - st.y0);
  for (let i = 0; i < SIDE_N; i++) {
    const t = i / (SIDE_N - 1);
    // a little bulge through the side, tucked under at the bottom
    const x = st.w + Math.sin(t * Math.PI) * 0.012 - Math.pow(1 - t, 3) * 0.022;
    pts.push([x, st.y0 + sideH * t, st.z]);
  }
  for (let i = 1; i <= ROLL_N; i++) {
    const a = (i / ROLL_N) * (Math.PI / 2);
    pts.push([st.w - st.roll + Math.cos(a) * st.roll, top + Math.sin(a) * st.roll, st.z]);
  }
  if (lip) {
    // the door top rolls inside and down to the door card
    const x0 = st.w - st.roll;
    pts.push([x0 - 0.018, st.y1 - 0.004, st.z]);
    pts.push([x0 - 0.03, st.y1 - 0.025, st.z]);
    pts.push([x0 - 0.034, st.y1 - 0.07, st.z]);
    return pts;
  }
  for (let i = 1; i <= CROWN_N; i++) {
    const t = i / CROWN_N;
    pts.push([(st.w - st.roll) * (1 - t), st.y1 + (st.crown * (1 - Math.cos(t * Math.PI))) / 2, st.z]);
  }
  return pts;
}

function fullSection(st) {
  const h = halfSection(st);
  const right = [];
  for (let i = h.length - 2; i >= 0; i--) right.push([-h[i][0], h[i][1], h[i][2]]);
  return [...h, ...right];
}

// Texture v of point j in a half section: the side band, the roll, then
// the crown up to the centre line at 0.5.
function halfV(j, lip) {
  if (j < SIDE_N) return (j / (SIDE_N - 1)) * 0.3;
  if (j < SIDE_N + ROLL_N) return 0.3 + ((j - SIDE_N + 1) / ROLL_N) * 0.06;
  if (lip) return 0.36 + ((j - SIDE_N - ROLL_N + 1) / 3) * 0.03;
  return 0.36 + ((j - SIDE_N - ROLL_N + 1) / CROWN_N) * 0.14;
}

function zRange(z0, z1, step) {
  const out = [];
  const n = Math.max(1, Math.round((z0 - z1) / step));
  for (let i = 0; i <= n; i++) out.push(z0 + ((z1 - z0) * i) / n);
  return out;
}

// The whole painted shell: cowl, the two sides of the cockpit, the turtle
// deck, the firewall, the dash panel, the rear wall and the frame rails.
function bodyGeometry() {
  const parts = [];
  const nHalf = SIDE_N + ROLL_N + CROWN_N;
  // cowl and deck: whole sections, left side over the top to the right
  const fullUv = (sections) => (i, j) => {
    const v = j < nHalf ? halfV(j, false) : 1 - halfV(2 * nHalf - 2 - j, false);
    return [U(sections[i][0][2]), v];
  };
  const cowlZ = zRange(Z_FRONT, Z_DASH, 0.03);
  const cowl = cowlZ.map((z) => fullSection(station(z)));
  parts.push(loft(cowl, { uv: fullUv(cowl) }));
  const deckZ = zRange(Z_BACK, Z_TAIL, 0.035);
  const deck = deckZ.map((z) => fullSection(station(z)));
  parts.push(loft(deck, { uv: fullUv(deck) }));
  // the cockpit's sides: each side up over the door top and down inside
  const sideZ = zRange(Z_DASH, Z_BACK, 0.04);
  for (const s of [1, -1]) {
    const secs = sideZ.map((z) => halfSection(station(z), true).map((p) => [s * p[0], p[1], p[2]]));
    parts.push(
      loft(secs, {
        uv: (i, j) => [U(secs[i][0][2]), s > 0 ? halfV(j, true) : 1 - halfV(j, true)],
        flip: s < 0,
      })
    );
  }
  // the firewall closes the cowl at the front, the rear panel the tail
  parts.push(capRing(fullSection(station(Z_FRONT)).concat([[0, 0.6, Z_FRONT]]), { flip: false }));
  parts.push(capRing(fullSection(station(Z_TAIL)).concat([[0, 0.61, Z_TAIL]]), { flip: true }));
  // the dash: the cowl's back face down to the bottom of the dash
  const dashRing = fullSection(station(Z_DASH)).filter((p) => p[1] >= 0.86);
  const w = dashRing[0][0];
  parts.push(capRing([[w, 0.86, Z_DASH], ...dashRing, [-w, 0.86, Z_DASH]], { flip: true }));
  // the wall behind the seat, under the front of the deck
  parts.push(capRing(fullSection(station(Z_BACK)), { flip: false }));
  for (const p of parts.slice(-4)) plainUv(p);
  // the frame rails, painted to match: a '32 rail shows its deep reveal
  // under the body and pinches in toward the front
  for (const s of [1, -1]) {
    const secs = [];
    for (const z of zRange(1.95, -1.96, 0.1)) {
      const xo = z > 1.0 ? 0.405 : z > 0.45 ? lerp(0.53, 0.405, (z - 0.45) / 0.55) : 0.53;
      // the horns taper to the front spreader bar and sweep down a little
      const horn = Math.max(0, (z - 1.55) / 0.4);
      const depth = (z > 1.5 ? 0.11 : z > 0.3 ? lerp(0.19, 0.11, (z - 0.3) / 1.2) : z > -0.7 ? 0.19 : lerp(0.19, 0.12, Math.min(1, (-0.7 - z) / 0.9))) * (1 - 0.45 * horn);
      const top = (z < -0.95 ? 0.62 : 0.6) - horn * 0.035;
      const yb = top - depth;
      const xi = xo - 0.05;
      const ring = [
        [xo, top, z],
        [xo, yb, z],
        [xo, yb, z],
        [xi, yb, z],
        [xi, yb, z],
        [xi, top, z],
        [xi, top, z],
        [xo, top, z],
      ].map((p) => [s * p[0], p[1], p[2]]);
      secs.push(ring);
    }
    const rail = loft(secs, { closed: true, flip: s > 0 });
    parts.push(plainUv(rail));
    parts.push(plainUv(capRing(secs[0], { flip: s > 0 })));
    parts.push(plainUv(capRing(secs[secs.length - 1], { flip: s < 0 })));
  }
  return merge(parts);
}

// The paint: base coat, flames licking back from the cowl with a pinstripe
// round them, the door and deck lid gaps, a pinstripe flourish and Ruben's
// name on the deck. The barn-find paint is rust and primer with the ghost
// of old flames.
function bodyTexture(p) {
  const rust = p.id === 'rust';
  return canvasTexture(2048, 1024, (g, W, H) => {
    g.fillStyle = p.base;
    g.fillRect(0, 0, W, H);
    if (rust) rustCoat(g, W, H);
    const sh = Math.round(H * 0.36);
    const side = document.createElement('canvas');
    side.width = W;
    side.height = sh;
    const s = side.getContext('2d');
    drawFlames(s, W, sh, p, rust);
    // panel gaps: the door's front and back edges and the bottom of the door
    s.globalAlpha = rust ? 0.5 : 0.8;
    for (const z of [Z_DASH - 0.012, -0.42]) {
      const x = U(z) * W;
      s.fillStyle = 'rgba(0,0,0,0.55)';
      s.fillRect(x - 1.5, sh * 0.08, 3, sh * 0.86);
      s.fillStyle = 'rgba(255,255,255,0.18)';
      s.fillRect(x + 1.5, sh * 0.08, 1, sh * 0.86);
    }
    s.globalAlpha = 1;
    g.drawImage(side, 0, H - sh);
    g.save();
    g.translate(0, sh);
    g.scale(1, -1);
    g.drawImage(side, 0, 0);
    g.restore();
    // the top band: v 0.36 to 0.64, the centre line at mid height
    const Y = (v) => (1 - v) * H;
    // flame tips over the cowl top, mirrored either side of the centre
    {
      g.save();
      g.globalAlpha = rust ? 0.22 : 1;
      for (const m of [1, -1]) {
        g.save();
        g.translate(0, H / 2);
        g.scale(1, m);
        const tips = [
          [0.035, 0.06, 0.012],
          [0.08, 0.1, 0.015],
        ];
        for (const [v, len, th] of tips) {
          const y = v * H;
          g.fillStyle = flameGradient(g, W, p);
          g.beginPath();
          g.moveTo(0, y - th * H);
          g.bezierCurveTo(len * W * 0.5, y - th * H * 1.2, len * W * 0.8, y, len * W, y + th * H * 0.2);
          g.bezierCurveTo(len * W * 0.7, y + th * H * 0.8, len * W * 0.4, y + th * H, 0, y + th * H);
          g.closePath();
          g.fill();
        }
        g.restore();
      }
      g.restore();
    }
    // the deck lid: its gap, and a pinstripe flourish with Ruben's name
    const u0 = U(-0.93) * W;
    const u1 = U(-1.5) * W;
    const v0 = Y(0.585);
    const v1 = Y(0.415);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3;
    roundRect(g, u0, v0, u1 - u0, v1 - v0, 40);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 1;
    roundRect(g, u0 + 2, v0 + 2, u1 - u0 - 4, v1 - v0 - 4, 38);
    g.stroke();
    if (!rust) {
      // across the car one texel is about three times longer than along
      // it: draw squeezed across so the design keeps its shape
      const pin = PIN[p.id] || '#ffffff';
      const cx = u0 + (u1 - u0) * 0.42;
      const cy = H / 2;
      g.save();
      g.translate(cx, cy);
      g.scale(1, 1 / 3);
      g.strokeStyle = pin;
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      for (const m of [1, -1]) {
        g.beginPath();
        g.moveTo(-60, m * 4);
        g.bezierCurveTo(-30, m * 70, 40, m * 60, 30, m * 22);
        g.bezierCurveTo(22, m * 2, -8, m * 18, 6, m * 34);
        g.stroke();
        g.beginPath();
        g.moveTo(-60, m * 4);
        g.bezierCurveTo(-90, m * 30, -110, m * 10, -128, m * 2);
        g.stroke();
      }
      g.beginPath();
      g.ellipse(48, 0, 9, 9, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      g.save();
      g.translate(u0 + (u1 - u0) * 0.8, cy);
      g.rotate(-Math.PI / 2);
      g.scale(1 / 3, 1);
      g.fillStyle = pin;
      g.font = '46px "Yellowtail", "Brush Script MT", cursive';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Ruben', 0, 0);
      g.restore();
    }
    // the plain corner, for parts with no artwork
    g.fillStyle = rust ? '#6e3418' : p.base;
    g.fillRect(W - 40, 0, 40, 40);
  });
}

function roundRect(g, x, y, w, h, r) {
  const rx = Math.min(Math.abs(w), Math.abs(h)) / 2;
  r = Math.min(r, rx);
  const x1 = x + w;
  const y1 = y + h;
  g.beginPath();
  g.moveTo(x + Math.sign(w) * r, y);
  g.lineTo(x1 - Math.sign(w) * r, y);
  g.quadraticCurveTo(x1, y, x1, y + Math.sign(h) * r);
  g.lineTo(x1, y1 - Math.sign(h) * r);
  g.quadraticCurveTo(x1, y1, x1 - Math.sign(w) * r, y1);
  g.lineTo(x + Math.sign(w) * r, y1);
  g.quadraticCurveTo(x, y1, x, y1 - Math.sign(h) * r);
  g.lineTo(x, y + Math.sign(h) * r);
  g.quadraticCurveTo(x, y, x + Math.sign(w) * r, y);
  g.closePath();
}

function flameGradient(g, W, p) {
  const gr = g.createLinearGradient(0, 0, W * 0.6, 0);
  gr.addColorStop(0, '#fffbe0');
  gr.addColorStop(0.08, p.a);
  gr.addColorStop(0.45, p.b);
  gr.addColorStop(1, p.b);
  return gr;
}

// Traditional flames on one side: a solid front that breaks into long,
// wavy licks with curled tips. y = 0 is the belt line, h the bottom edge;
// the flames lick toward +x (the back of the car).
function drawFlames(g, W, h, p, rust) {
  const licks = [
    // centre (fraction of the height), length (fraction of the width), thickness
    [0.2, 0.56, 0.1],
    [0.38, 0.64, 0.11],
    [0.55, 0.47, 0.1],
    [0.71, 0.58, 0.1],
    [0.86, 0.38, 0.08],
  ];
  const shapes = [];
  // the solid front
  shapes.push((ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.08);
    ctx.lineTo(W * 0.05, h * 0.1);
    ctx.bezierCurveTo(W * 0.1, h * 0.3, W * 0.1, h * 0.7, W * 0.05, h * 0.93);
    ctx.lineTo(0, h * 0.95);
    ctx.closePath();
  });
  licks.forEach(([yc, len, th], k) => {
    shapes.push((ctx) => {
      const L = len * W;
      const n = 28;
      const top = [];
      const bot = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = W * 0.02 + (L - W * 0.02) * t;
        // a lazy wave, curling up at the tip
        let y = h * (yc + 0.05 * Math.sin(t * Math.PI * 1.6 + k * 1.3) * t);
        y -= h * 0.09 * Math.pow(Math.max(0, (t - 0.78) / 0.22), 2);
        const half = h * th * Math.pow(1 - t, 0.75) * (0.55 + 0.45 * Math.cos(t * Math.PI * 0.5));
        top.push([x, y - half]);
        bot.push([x, y + half]);
      }
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const q of top) ctx.lineTo(q[0], q[1]);
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
    });
  });
  g.save();
  g.lineJoin = 'round';
  if (rust) g.globalAlpha = 0.24;
  // the pinstripe: stroke every shape wide, then fill over the inner half
  if (!rust) {
    g.strokeStyle = PIN[p.id] || '#ffffff';
    g.lineWidth = 7;
    for (const f of shapes) {
      f(g);
      g.stroke();
    }
  }
  g.fillStyle = flameGradient(g, W, p);
  for (const f of shapes) {
    f(g);
    g.fill();
  }
  g.restore();
}

// Rust, primer and bare metal for the barn-find paint.
function rustCoat(g, W, H) {
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 1400; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 4 + r() * 46;
    const k = r();
    g.fillStyle = k < 0.45 ? 'rgba(70,30,12,0.35)' : k < 0.8 ? 'rgba(160,82,34,0.3)' : k < 0.93 ? 'rgba(120,118,108,0.35)' : 'rgba(40,20,10,0.5)';
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,190,120,0.12)' : 'rgba(30,12,4,0.18)';
    g.fillRect(r() * W, r() * H, 2, 2);
  }
}

function plateTexture() {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = '#f2c230';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#1a3a7a';
    g.lineWidth = 8;
    g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#1a3a7a';
    g.font = '700 22px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.fillText('ALASKA', 128, 34);
    g.font = '800 64px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('RUBEN', 128, 100);
  });
}

// The engine-turned dash insert and its gauges, in miles per hour as a
// '32 should be. Gauge centres in canvas pixels for the needles.
const GAUGES = [
  { id: 'oil', x: 112, r: 50, label: 'OIL', max: 80, ticks: 4 },
  { id: 'speed', x: 352, r: 98, label: 'MPH', max: 120, ticks: 12 },
  { id: 'rpm', x: 672, r: 98, label: 'RPM x1000', max: 8, ticks: 8 },
  { id: 'temp', x: 912, r: 50, label: 'TEMP', max: 250, ticks: 5 },
];
function dashTexture() {
  return canvasTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#8c8f94';
    g.fillRect(0, 0, W, H);
    // jewelled swirls, row by row
    for (let y = -10; y < H + 20; y += 20) {
      for (let x = (y / 20) % 2 ? -10 : 0; x < W + 20; x += 20) {
        const gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, 14);
        gr.addColorStop(0, '#f2f4f6');
        gr.addColorStop(0.5, '#a9adb3');
        gr.addColorStop(1, '#6d7076');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, 14, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const G of GAUGES) {
      const cy = H / 2;
      g.fillStyle = '#d8dadc';
      g.beginPath();
      g.arc(G.x, cy, G.r + 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0d0e10';
      g.beginPath();
      g.arc(G.x, cy, G.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f0ede4';
      g.fillStyle = '#f0ede4';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i <= G.ticks * 2; i++) {
        const a = (-135 + (270 * i) / (G.ticks * 2)) * (Math.PI / 180) - Math.PI / 2;
        const major = i % 2 === 0;
        const r0 = G.r * (major ? 0.78 : 0.85);
        g.lineWidth = major ? 4 : 2;
        g.beginPath();
        g.moveTo(G.x + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(G.x + Math.cos(a) * G.r * 0.94, cy + Math.sin(a) * G.r * 0.94);
        g.stroke();
        if (major && G.r > 60) {
          g.font = `700 ${Math.round(G.r * 0.2)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
          const v = Math.round((G.max * i) / (G.ticks * 2));
          g.fillText(String(v), G.x + Math.cos(a) * G.r * 0.58, cy + Math.sin(a) * G.r * 0.58);
        }
      }
      g.font = `600 ${Math.round(G.r * 0.17)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillStyle = '#ff9a3a';
      g.fillText(G.label, G.x, cy + G.r * 0.45);
    }
  });
}

function eightBallTexture() {
  return canvasTexture(256, 128, (g, W, H) => {
    g.fillStyle = '#0c0c0e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f4f2ec';
    g.beginPath();
    g.ellipse(W * 0.75, H * 0.3, W * 0.07, H * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0c0c0e';
    g.font = `700 ${Math.round(H * 0.17)}px "Barlow Condensed", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('8', W * 0.75, H * 0.31);
  });
}

// Fresnel rings and a reflector glow for the headlamp lenses.
function lensTexture() {
  return canvasTexture(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, '#e8ecef');
    gr.addColorStop(1, '#9aa4ac');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,90,100,0.35)';
    for (let r = 6; r < W / 2; r += 6) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(80,90,100,0.25)';
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, H);
    g.stroke();
  });
}

// The '32 grille shell outline, front view: narrower at the bottom with a
// shallow V, straight flanks, an arched top. Ring order: bottom centre,
// along the bottom to +x, up the left flank, over the top, down the right.
function grilleOutline() {
  const half = [
    [0, 0.575],
    [0.09, 0.59],
    [0.175, 0.61],
    [0.214, 0.628],
    [0.224, 0.7],
    [0.234, 0.8],
    [0.244, 0.9],
    [0.251, 0.99],
    [0.254, 1.05],
    [0.248, 1.11],
    [0.23, 1.158],
    [0.196, 1.194],
    [0.14, 1.218],
    [0.072, 1.23],
  ];
  const ring = [...half, [0, 1.233]];
  for (let i = half.length - 1; i >= 1; i--) ring.push([-half[i][0], half[i][1]]);
  return ring;
}

// Where a vertical line x crosses the outline: [bottom, top].
function outlineSpan(ring, x) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const t = (x - a[0]) / (b[0] - a[0]);
    const y = a[1] + (b[1] - a[1]) * t;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return [lo, hi];
}

// Colour a tube's vertices along its length (heat tint on the headers).
function heatTint(geo, stops) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const params = geo.parameters;
  const radial = params.radialSegments + 1;
  const tub = params.tubularSegments;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = Math.floor(i / radial) / tub;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    c.set(c0).lerp(new THREE.Color(c1), clamp((t - t0) / (t1 - t0), 0, 1));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class HotRod extends Car {
  constructor(game) {
    super(game, SPEC);
    this.headlight = new THREE.SpotLight(0xfff0d0, 0, 70, 0.55, 0.5, 1.2);
    this.headlight.castShadow = false;
    this.headlight.position.set(0, 1.0, 1.9);
    this.headlight.target.position.set(0, -1.5, 22);
    this.group.add(this.headlight, this.headlight.target);
    this._inv = new THREE.Matrix4();
  }

  handling(state) {
    const e = state.gear.engine;
    const t = state.gear.tires;
    if (this._h && this._hk === e * 10 + t) return this._h;
    const eng = ENGINES[e] || ENGINES[0];
    const tires = TIRES[t] || TIRES[0];
    this._hk = e * 10 + t;
    this._h = {
      top: eng.top,
      accel: eng.accel,
      grip: 7,
      offGrip: 3.2 + tires.grip * 2.5,
      offroad: (surf) => lerp(offroadFactor(surf), 1, (tires.grip - 0.62) * 0.9),
      brake: 17,
      brakeOff: 17,
      coast: 0.9,
      coastOff: 2.2,
      reverse: 7,
    };
    return this._h;
  }

  buildModel() {
    const M = {
      paint: new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 }),
      wheelPaint: new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.09 }),
      gloss: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.36 }),
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.85 }),
      leather: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.48 }),
      // clear glass: the scene behind shows through dimmed a tenth, and the
      // reflection of the sky is added on top at full strength (blended as
      // premultiplied light), instead of a milky blue film
      glass: new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }),
      lens: new THREE.MeshStandardMaterial({ map: lensTexture(), emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.15, metalness: 0 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x9a0d08, emissive: 0xff2010, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.1 }),
      dash: new THREE.MeshStandardMaterial({ map: dashTexture(), roughness: 0.32, metalness: 0.55 }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }),
      ball: new THREE.MeshStandardMaterial({ map: eightBallTexture(), roughness: 0.12, metalness: 0 }),
      needle: new THREE.MeshBasicMaterial({ color: 0xff5a1a }),
    };
    this.materials = M;
    const body = this.body;
    const add = (geo, mat, { shadow = true } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      body.add(m);
      return m;
    };

    // ---- the painted shell
    this.paintMesh = add(bodyGeometry(), M.paint);

    // ---- chrome and polished aluminium
    const cb = new ModelBuilder();
    const CH = (geo, o = {}) => cb.add(geo, { color: 0xffffff, jitter: 0, smooth: true, ...o });
    const ALU = 0xc9cbce;
    // grille shell: its flank, the bead round the front, the bars
    const ring = grilleOutline();
    const shell = loft(
      [ring.map((p) => [p[0], p[1], 1.705]), ring.map((p) => [p[0] * 0.985, p[1] * 0.998 + 0.004, 1.56])],
      { closed: true }
    );
    CH(shell);
    CH(tube(ring.map((p) => [p[0] * 1.004, p[1], 1.708]), 0.019, { closed: true, radial: 8, tubular: 90 }));
    for (let x = -0.231; x <= 0.2311; x += 0.0215) {
      const [lo, hi] = outlineSpan(ring, x);
      if (!(hi > lo + 0.08)) continue;
      cb.box(0.0065, hi - lo - 0.05, 0.032, { pos: [x, (lo + hi) / 2, 1.672], color: 0xffffff, jitter: 0 });
    }
    // radiator cap
    CH(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 16), { pos: [0, 1.25, 1.62] });
    CH(new THREE.SphereGeometry(0.018, 12, 8), { pos: [0, 1.272, 1.62] });
    // headlamps on stands, and the '32 headlight bar dipping in front of the grille
    const bucket = latheX(
      [
        [0.0, -0.13],
        [0.05, -0.122],
        [0.085, -0.095],
        [0.105, -0.055],
        [0.114, -0.01],
        [0.117, 0.02],
        [0.112, 0.03],
        [0.104, 0.026],
      ],
      28
    );
    for (const s of [1, -1]) {
      CH(bucket.clone(), { pos: [s * 0.44, 0.99, 1.74], rot: [0, -Math.PI / 2, 0] });
      CH(new THREE.CylinderGeometry(0.016, 0.02, 0.24, 10), { pos: [s * 0.44, 0.76, 1.71] });
      CH(new THREE.SphereGeometry(0.03, 12, 8), { pos: [s * 0.44, 0.88, 1.71] });
    }
    bucket.dispose();
    CH(tube([[0.44, 0.84, 1.72], [0.26, 0.77, 1.79], [0, 0.745, 1.81], [-0.26, 0.77, 1.79], [-0.44, 0.84, 1.72]], 0.016, { radial: 8 }));
    // front nerf bar and the spreader bar between the frame horns
    CH(tube([[0.4, 0.53, 1.9], [0.41, 0.51, 2.0], [0.3, 0.495, 2.045], [-0.3, 0.495, 2.045], [-0.41, 0.51, 2.0], [-0.4, 0.53, 1.9]], 0.018, { radial: 10 }));
    CH(new THREE.CylinderGeometry(0.014, 0.014, 0.76, 8), { pos: [0, 0.55, 1.93], rot: [0, 0, Math.PI / 2] });
    // dropped I-beam axle
    const axle = [[0.63, 0.345], [0.52, 0.338], [0.4, 0.29], [0.26, 0.248], [0.1, 0.24], [-0.1, 0.24], [-0.26, 0.248], [-0.4, 0.29], [-0.52, 0.338], [-0.63, 0.345]];
    for (let i = 0; i < axle.length - 1; i++) {
      cb.strut([axle[i][0], axle[i][1], 1.5], [axle[i + 1][0], axle[i + 1][1], 1.5], 0.055, 0.042, { color: 0xffffff, jitter: 0 });
    }
    for (const s of [1, -1]) {
      // king pin bosses, spindle and steering arm
      CH(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 12), { pos: [s * 0.635, 0.345, 1.5], rot: [0, 0, s * 0.12] });
      CH(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 10), { pos: [s * 0.68, 0.34, 1.5], rot: [0, 0, Math.PI / 2] });
      cb.beam([s * 0.635, 0.31, 1.5], [s * 0.6, 0.305, 1.39], 0.013, 6, { color: 0xffffff, jitter: 0, smooth: true });
      // hairpin radius rods to the frame
      cb.beam([s * 0.5, 0.338, 1.49], [s * 0.39, 0.47, 0.84], 0.013, 8, { color: 0xffffff, jitter: 0, smooth: true });
      cb.beam([s * 0.5, 0.27, 1.49], [s * 0.39, 0.47, 0.84], 0.013, 8, { color: 0xffffff, jitter: 0, smooth: true });
      CH(new THREE.SphereGeometry(0.024, 10, 8), { pos: [s * 0.39, 0.47, 0.84] });
      // tube shocks from the axle to the frame horn
      cb.beam([s * 0.47, 0.35, 1.44], [s * 0.43, 0.52, 1.6], 0.027, 12, { color: 0xffffff, jitter: 0, smooth: true });
      cb.beam([s * 0.43, 0.52, 1.6], [s * 0.405, 0.66, 1.7], 0.011, 8, { color: 0xffffff, jitter: 0, smooth: true });
      // spring shackles
      cb.strut([s * 0.5, 0.355, 1.53], [s * 0.5, 0.405, 1.53], 0.03, 0.03, { color: 0xffffff, jitter: 0 });
    }
    // tie rod and drag link
    CH(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 8), { pos: [0, 0.305, 1.39], rot: [0, 0, Math.PI / 2] });
    cb.beam([0.6, 0.38, 1.46], [0.44, 0.57, 0.95], 0.013, 8, { color: 0xffffff, jitter: 0, smooth: true });

    // ---- the engine: polished heads and intake, finned valve covers,
    // the 6-71 blower with its belt drive, the bug-catcher scoop
    for (const s of [1, -1]) {
      // cylinder head (aluminium), tilted out on its bank
      const tilt = -s * 0.62;
      cb.box(0.16, 0.13, 0.6, { pos: [s * 0.205, 0.8, 0.99], rot: [0, 0, tilt], color: ALU, jitter: 0 });
      // valve cover with fins, on top of the head
      const up = [-Math.sin(tilt), Math.cos(tilt)];
      const vc = [s * 0.205 + up[0] * 0.095, 0.8 + up[1] * 0.095];
      cb.box(0.12, 0.06, 0.58, { pos: [vc[0], vc[1], 0.99], rot: [0, 0, tilt], color: 0xffffff, jitter: 0 });
      for (let f = -3; f <= 3; f++) {
        const off = f * 0.015;
        cb.box(0.006, 0.022, 0.5, {
          pos: [vc[0] + up[0] * 0.04 + up[1] * off, vc[1] + up[1] * 0.04 - up[0] * off, 0.99],
          rot: [0, 0, tilt],
          color: 0xffffff,
          jitter: 0,
        });
      }
      // breather on the valve cover
      CH(new THREE.CylinderGeometry(0.028, 0.03, 0.06, 12), { pos: [vc[0] + up[0] * 0.06, vc[1] + up[1] * 0.06, 0.76], rot: [0, 0, tilt] });
      // headers: four primaries sweeping out and down into the collector,
      // gold and blue with heat near the ports
      for (let k = 0; k < 4; k++) {
        const zp = 0.78 + k * 0.155;
        const pipe = tube(
          [
            [s * 0.3, 0.75, zp],
            [s * 0.4, 0.735, zp + 0.01],
            [s * 0.5, 0.67, zp - 0.02 - k * 0.02],
            [s * 0.565, 0.57, 0.76 + k * 0.03],
            [s * 0.59, 0.515, 0.7],
          ],
          0.021,
          { radial: 8, tubular: 26, tension: 0.4 }
        );
        heatTint(pipe, [
          [0, 0xd8a85a],
          [0.18, 0x9f7fb0],
          [0.45, 0xe8e4f0],
          [1, 0xffffff],
        ]);
        CH(pipe, { keepColors: true });
      }
      // collector, side pipe and its turned-out tip
      CH(latheX([[0.05, -0.13], [0.07, -0.05], [0.075, 0]], 14), { pos: [s * 0.6, 0.508, 0.72], rot: [0, -Math.PI / 2, 0] });
      const sp = tube([[s * 0.6, 0.5, 0.6], [s * 0.645, 0.462, 0.42], [s * 0.66, 0.452, 0.1], [s * 0.66, 0.452, -0.66]], 0.045, { radial: 14, tension: 0.3 });
      CH(sp);
      CH(latheX([[0.046, -0.078], [0.054, -0.075], [0.052, -0.06], [0.045, 0]], 16), { pos: [s * 0.66, 0.452, -0.64], rot: [0, -Math.PI / 2, 0] });
    }
    // intake manifold
    cb.box(0.24, 0.1, 0.52, { pos: [0, 0.89, 1.0], color: ALU, jitter: 0 });
    // the blower: twin rotor case with ribs and end plates
    for (const s of [1, -1]) {
      CH(new THREE.CylinderGeometry(0.105, 0.105, 0.5, 22), { pos: [s * 0.045, 1.05, 1.0], rot: [Math.PI / 2, 0, 0], color: ALU });
      for (let r = 0; r < 4; r++) cb.box(0.008, 0.015, 0.5, { pos: [s * (0.148 + 0.002 * r), 0.985 + r * 0.04, 1.0], color: ALU, jitter: 0 });
    }
    cb.box(0.09, 0.21, 0.5, { pos: [0, 1.05, 1.0], color: ALU, jitter: 0 });
    for (const z of [0.735, 1.265]) cb.box(0.3, 0.245, 0.03, { pos: [0, 1.05, z], color: 0xffffff, jitter: 0 });
    // snout and pulleys; the belt is in the matte parts
    CH(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 14), { pos: [0, 1.05, 1.31], rot: [Math.PI / 2, 0, 0] });
    CH(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24), { pos: [0, 1.05, 1.365], rot: [Math.PI / 2, 0, 0], color: ALU });
    CH(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 24), { pos: [0, 0.6, 1.365], rot: [Math.PI / 2, 0, 0], color: ALU });
    // the bug catcher: a scoop rising toward its open mouth, a rolled lip
    const scoopRing = (z, hgt, wid) => {
      const pts = [];
      const r = 0.035;
      const corners = [
        [wid / 2 - r, 1.17 + r, -Math.PI / 2],
        [wid / 2 - r, 1.17 + hgt - r, 0],
        [-wid / 2 + r, 1.17 + hgt - r, Math.PI / 2],
        [-wid / 2 + r, 1.17 + r, Math.PI],
      ];
      for (const [cx2, cy2, a0] of corners) {
        for (let k = 0; k <= 4; k++) {
          const a = a0 + (k / 4) * (Math.PI / 2);
          pts.push([cx2 + Math.cos(a) * r, cy2 + Math.sin(a) * r, z]);
        }
      }
      return pts;
    };
    const scoopSecs = [
      [0.86, 0.07, 0.2],
      [0.94, 0.1, 0.24],
      [1.04, 0.135, 0.26],
      [1.14, 0.158, 0.265],
      [1.215, 0.17, 0.268],
    ].map(([z, hgt, wid]) => scoopRing(z, hgt, wid));
    // ring runs counter-clockwise seen from the front, sections run forward
    CH(loft(scoopSecs, { closed: true, flip: true }));
    CH(capRing(scoopSecs[0], { flip: true }));
    CH(tube(scoopRing(1.218, 0.17, 0.268), 0.012, { closed: true, radial: 8, tubular: 60, tension: 0.2 }));
    // alternator, master cylinder, the firewall's chrome
    CH(new THREE.CylinderGeometry(0.062, 0.062, 0.11, 18), { pos: [0.21, 0.73, 1.29], rot: [Math.PI / 2, 0, 0] });
    CH(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 18), { pos: [0.21, 0.73, 1.36], rot: [Math.PI / 2, 0, 0], color: ALU });
    CH(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), { pos: [0.34, 0.86, 0.69], rot: [Math.PI / 2, 0, 0] });

    // ---- the rear: quick-change centre, ladder bars, shocks, tank, bumper
    CH(
      latheX(
        [
          [0.0, -0.258],
          [0.07, -0.255],
          [0.135, -0.24],
          [0.135, -0.16],
          [0.125, -0.15],
          [0.152, -0.1],
          [0.15, -0.02],
          [0.115, 0.05],
          [0.06, 0.1],
          [0.045, 0.16],
          [0.0, 0.16],
        ],
        26
      ),
      { pos: [0, 0.47, -1.22], rot: [0, -Math.PI / 2, 0], color: ALU }
    );
    for (const s of [1, -1]) {
      // ladder bars: two tubes braced, from the axle forward under the body
      const a1 = [s * 0.46, 0.53, -1.2];
      const a2 = [s * 0.46, 0.39, -1.28];
      const f = [s * 0.42, 0.44, -0.35];
      cb.beam(a1, f, 0.016, 8, { color: 0xffffff, jitter: 0, smooth: true });
      cb.beam(a2, f, 0.016, 8, { color: 0xffffff, jitter: 0, smooth: true });
      for (const t of [0.25, 0.5, 0.75]) {
        const p = a1.map((v, i) => v + (f[i] - v) * t);
        const q = a2.map((v, i) => v + (f[i] - v) * t);
        cb.beam(p, q, 0.01, 6, { color: 0xffffff, jitter: 0, smooth: true });
      }
      CH(new THREE.SphereGeometry(0.026, 10, 8), { pos: f });
      // shocks
      cb.beam([s * 0.52, 0.42, -1.32], [s * 0.5, 0.58, -1.46], 0.025, 12, { color: 0xffffff, jitter: 0, smooth: true });
      // taillight stands, bezels; the lenses are their own mesh
      cb.beam([s * 0.47, 0.6, -1.87], [s * 0.47, 0.72, -1.87], 0.012, 8, { color: 0xffffff, jitter: 0, smooth: true });
      CH(new THREE.SphereGeometry(0.052, 18, 12), { pos: [s * 0.47, 0.77, -1.865], scale: [0.85, 1.5, 0.55] });
    }
    // polished fuel tank across the rear frame horns, and its filler
    CH(new THREE.CylinderGeometry(0.12, 0.12, 0.74, 24), { pos: [0, 0.56, -1.83], rot: [0, 0, Math.PI / 2], color: ALU });
    for (const s of [1, -1]) CH(new THREE.SphereGeometry(0.12, 20, 10), { pos: [s * 0.37, 0.56, -1.83], scale: [0.3, 1, 1], color: ALU });
    CH(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 14), { pos: [0.2, 0.69, -1.83] });
    // rear nerf bar
    CH(tube([[0.45, 0.56, -1.88], [0.46, 0.535, -1.99], [0.32, 0.52, -2.04], [-0.32, 0.52, -2.04], [-0.46, 0.535, -1.99], [-0.45, 0.56, -1.88]], 0.018, { radial: 10 }));
    // plate bracket and lamp
    cb.box(0.4, 0.21, 0.012, { pos: [0, 0.665, -2.005], color: 0xffffff, jitter: 0 });
    CH(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 12), { pos: [0, 0.79, -2.0], rot: [Math.PI / 2, 0, 0] });

    // ---- windshield frame, mirror, steering column, shifter lever
    const crownAt = (x) => {
      const st = station(0.42);
      const half = st.w - st.roll;
      const t = 1 - Math.min(1, Math.abs(x) / half);
      return st.y1 + (st.crown * (1 - Math.cos(t * Math.PI))) / 2;
    };
    const wsBase = [];
    for (let i = 0; i <= 8; i++) {
      const x = 0.5 - i * 0.125;
      wsBase.push([x, crownAt(x) + 0.012, 0.425]);
    }
    for (const s of [1, -1]) CH(tube([[s * 0.505, 1.13, 0.43], [s * 0.5, 1.33, 0.39], [s * 0.49, 1.53, 0.335]], 0.017, { radial: 10 }));
    CH(tube([[0.49, 1.53, 0.335], [0, 1.545, 0.335], [-0.49, 1.53, 0.335]], 0.016, { radial: 10 }));
    CH(tube(wsBase, 0.014, { radial: 8 }));
    CH(new THREE.SphereGeometry(0.05, 16, 10), { pos: [0, 1.48, 0.33], scale: [1.4, 0.75, 0.25] });
    cb.beam([0, 1.545, 0.335], [0, 1.5, 0.33], 0.008, 6, { color: 0xffffff, jitter: 0, smooth: true });
    cb.beam([0.3, 0.74, 0.6], [0.3, 1.17, 0.09], 0.024, 12, { color: 0xffffff, jitter: 0, smooth: true });
    cb.beam([0.0, 0.66, 0.02], [0.035, 1.0, -0.11], 0.011, 8, { color: 0xffffff, jitter: 0, smooth: true });
    this.chromeMesh = add(cb.build(), M.chrome);

    // ---- gloss parts: engine block, frame bits, axle tubes, brakes,
    // the spring, the radiator, the scoop's mesh, the gauges' bezels
    const gb = new ModelBuilder();
    const G = (geo, color, o = {}) => gb.add(geo, { color, jitter: 0, smooth: true, ...o });
    const BLOCK = 0x18191c;
    gb.box(0.42, 0.24, 0.62, { pos: [0, 0.61, 0.99], color: BLOCK, jitter: 0 });
    gb.box(0.34, 0.14, 0.56, { pos: [0, 0.44, 1.0], color: BLOCK, jitter: 0 });
    gb.box(0.3, 0.18, 0.06, { pos: [0, 0.62, 1.33], color: BLOCK, jitter: 0 });
    G(new THREE.CylinderGeometry(0.17, 0.12, 0.22, 18), BLOCK, { pos: [0, 0.6, 0.6], rot: [Math.PI / 2, 0, 0] });
    // distributor at the back of the intake
    G(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 12), BLOCK, { pos: [0, 0.97, 0.7] });
    G(new THREE.CylinderGeometry(0.05, 0.045, 0.04, 14), 0x7a1410, { pos: [0, 1.04, 0.7] });
    // radiator core and tanks behind the grille
    gb.box(0.5, 0.5, 0.06, { pos: [0, 0.88, 1.52], color: 0x15171a, jitter: 0 });
    for (const y of [0.62, 1.15]) gb.box(0.52, 0.06, 0.08, { pos: [0, y, 1.52], color: 0x2c2a26, jitter: 0 });
    // the grille's black backing
    const back = capRing(ring.map((p) => [p[0] * 0.97, p[1] * 0.995 + 0.003, 1.645]));
    back.deleteAttribute('uv');
    G(back, 0x060606);
    // fan
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      gb.box(0.05, 0.17, 0.008, { pos: [Math.cos(a) * 0.1, 0.88 + Math.sin(a) * 0.1, 1.45], rot: [0.3, 0, a - Math.PI / 2], color: 0x202226, jitter: 0 });
    }
    // the transverse front spring: leaves of a shallow arch
    for (let k = 0; k < 4; k++) {
      const L = 0.5 - k * 0.085;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const x = -L + (2 * L * i) / 10;
        pts.push([x, 0.495 - k * 0.013 - 0.36 * x * x, 1.53]);
      }
      for (let i = 0; i < 10; i++) gb.strut(pts[i], pts[i + 1], 0.011, 0.05, { color: 0x232427, jitter: 0 });
    }
    // front crossmember, steering box
    gb.box(0.78, 0.08, 0.1, { pos: [0, 0.53, 1.55], color: 0x1a1a1d, jitter: 0 });
    G(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 14), 0x1a1a1d, { pos: [0.45, 0.58, 0.95], rot: [Math.PI / 2, 0, 0] });
    // rear axle tubes, brake backing plates, front brake drums
    G(new THREE.CylinderGeometry(0.042, 0.042, 1.16, 14), 0x1a1a1d, { pos: [0, 0.47, -1.25], rot: [0, 0, Math.PI / 2] });
    for (const s of [1, -1]) {
      G(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 22), 0x222326, { pos: [s * 0.6, 0.47, -1.25], rot: [0, 0, Math.PI / 2] });
      // finned front drums show through the wheel
      G(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 22), 0x2b2c30, { pos: [s * 0.63, 0.34, 1.5], rot: [0, 0, Math.PI / 2] });
    }
    // rear crossmember
    gb.box(0.86, 0.08, 0.1, { pos: [0, 0.56, -1.95], color: 0x1a1a1d, jitter: 0 });
    // the bug catcher's screen
    gb.box(0.25, 0.16, 0.006, { pos: [0, 1.255, 1.19], color: 0x0a0a0a, jitter: 0 });
    // gauge bezels round the dash insert
    gb.box(0.7, 0.012, 0.012, { pos: [0, 1.072, 0.352], color: 0x1c1c1e, jitter: 0 });
    gb.box(0.7, 0.012, 0.012, { pos: [0, 0.928, 0.352], color: 0x1c1c1e, jitter: 0 });
    // the hitch drawbar for the boat trailer
    this.gloss = add(gb.build(), M.gloss);

    // ---- matte parts: tyres' neighbours, hoses, the belt, wires, carpet
    const mb = new ModelBuilder();
    const MT = (geo, color, o = {}) => mb.add(geo, { color, jitter: 0, smooth: true, ...o });
    // supercharger belt, both runs and the wraps
    mb.box(0.05, 0.45, 0.012, { pos: [0, 0.825, 1.365 + 0.084], rot: [-0.033, 0, 0], color: 0x111111, jitter: 0 });
    mb.box(0.05, 0.45, 0.012, { pos: [0, 0.825, 1.365 - 0.084], rot: [0.033, 0, 0], color: 0x111111, jitter: 0 });
    MT(new THREE.TorusGeometry(0.081, 0.007, 4, 20, Math.PI), 0x111111, { pos: [0, 1.05, 1.365], rot: [0, Math.PI / 2, 0], scale: [1, 1, 3.5] });
    MT(new THREE.TorusGeometry(0.096, 0.007, 4, 20, Math.PI), 0x111111, { pos: [0, 0.6, 1.365], rot: [Math.PI, Math.PI / 2, 0], scale: [1, 1, 3.5] });
    // radiator hoses
    MT(tube([[0.12, 1.12, 1.49], [0.08, 1.06, 1.38], [0, 0.97, 1.28]], 0.024, { radial: 10 }), 0x141414);
    MT(tube([[-0.16, 0.68, 1.49], [-0.12, 0.64, 1.42], [-0.08, 0.64, 1.34]], 0.024, { radial: 10 }), 0x141414);
    // red plug wires from the distributor to the plugs along each head
    for (const s of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const zp = 0.82 + k * 0.155;
        MT(tube([[s * 0.02, 1.06, 0.7], [s * 0.2, 1.0, 0.72 + k * 0.04], [s * 0.33, 0.86, zp - 0.04], [s * 0.34, 0.79, zp]], 0.0055, { radial: 5, tension: 0.4 }), 0xb0181a);
      }
    }
    // carpet floor and transmission tunnel
    mb.box(0.92, 0.02, 1.15, { pos: [0, 0.63, -0.2], color: 0x3a1a16, jitter: 0 });
    MT(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 16, 1, false, -Math.PI / 2, Math.PI), 0x3a1a16, { pos: [0, 0.63, -0.15], rot: [Math.PI / 2, 0, 0] });
    // the footwell under the dash
    mb.box(0.9, 0.24, 0.02, { pos: [0, 0.75, 0.6], color: 0x1a1210, jitter: 0 });
    this.matte = add(mb.build(), M.matte);

    // ---- tuck-and-roll leather: seat, door cards, the rolled rim
    const lb = new ModelBuilder();
    const CREAM = 0xdcc8a6;
    const SEAM = 0xb7a07c;
    const BLACK = 0x1a1716;
    // the cushion: a padded slab with shallow rolls front to back
    lb.box(0.92, 0.12, 0.33, { pos: [0, 0.73, -0.585], color: SEAM, jitter: 0 });
    for (let i = 0; i < 9; i++) {
      lb.add(new THREE.CylinderGeometry(0.046, 0.046, 0.33, 14), { pos: [-0.4 + i * 0.1, 0.785, -0.585], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55], color: CREAM, jitter: 0, smooth: true });
    }
    lb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.94, 16), { pos: [0, 0.76, -0.42], rot: [0, 0, Math.PI / 2], scale: [1, 0.9, 0.8], color: CREAM, jitter: 0, smooth: true });
    // the back: a slab leaning back, rolls up it, a bolster along the top
    const backTilt = -0.2;
    const backM = new THREE.Matrix4().makeRotationX(backTilt).setPosition(0, 1.0, -0.775);
    lb.add(new THREE.BoxGeometry(0.92, 0.46, 0.08), { matrix: backM, color: SEAM, jitter: 0 });
    for (let i = 0; i < 9; i++) {
      const roll = new THREE.CylinderGeometry(0.046, 0.046, 0.38, 14);
      roll.scale(1, 1, 0.5);
      roll.translate(-0.4 + i * 0.1, -0.02, 0.04);
      lb.add(roll, { matrix: backM, color: CREAM, jitter: 0, smooth: true });
    }
    const bolster = new THREE.CylinderGeometry(0.042, 0.042, 0.94, 16);
    bolster.rotateZ(Math.PI / 2);
    bolster.translate(0, 0.215, 0.012);
    lb.add(bolster, { matrix: backM, color: CREAM, jitter: 0, smooth: true });
    for (const s of [1, -1]) {
      lb.box(0.025, 0.4, 1.1, { pos: [s * 0.47, 0.85, -0.21], color: CREAM, jitter: 0 });
      for (let k = 0; k < 3; k++) {
        lb.add(new THREE.CylinderGeometry(0.026, 0.026, 1.06, 10), { pos: [s * 0.458, 0.76 + k * 0.08, -0.21], rot: [Math.PI / 2, 0, 0], color: 0xd9c8ac, jitter: 0, smooth: true });
      }
    }
    // the rolled edge round the cockpit opening
    const rim = [];
    const sd = station(Z_DASH);
    const sb = station(Z_BACK);
    const lipX = (st) => st.w - st.roll - 0.012;
    for (const z of zRange(Z_DASH, Z_BACK, 0.12)) {
      const st = station(z);
      rim.push([lipX(st), st.y1 + 0.004, z]);
    }
    for (let i = 1; i < 8; i++) {
      const x = lipX(sb) * (1 - (2 * i) / 8);
      const t = 1 - Math.abs(x) / (sb.w - sb.roll);
      rim.push([x, sb.y1 + (sb.crown * (1 - Math.cos(t * Math.PI))) / 2 + 0.004, Z_BACK - 0.005]);
    }
    for (const z of zRange(Z_BACK, Z_DASH, 0.12)) {
      const st = station(z);
      rim.push([-lipX(st), st.y1 + 0.004, z]);
    }
    for (let i = 1; i < 8; i++) {
      const x = -lipX(sd) * (1 - (2 * i) / 8);
      const t = 1 - Math.abs(x) / (sd.w - sd.roll);
      rim.push([x, sd.y1 + (sd.crown * (1 - Math.cos(t * Math.PI))) / 2 + 0.004, Z_DASH + 0.005]);
    }
    lb.add(tube(rim, 0.022, { closed: true, radial: 8, tubular: 140, tension: 0.2 }), { color: BLACK, jitter: 0, smooth: true });
    this.leather = add(lb.build(), M.leather);

    // ---- dash insert with live needles
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.17), M.dash);
    dash.position.set(0, 1.0, 0.354);
    dash.rotation.y = Math.PI;
    body.add(dash);
    this.needles = {};
    const ng = new THREE.BoxGeometry(0.004, 0.068, 0.003);
    ng.translate(0, 0.03, 0);
    for (const G of GAUGES) {
      if (G.id !== 'speed' && G.id !== 'rpm') continue;
      const n = new THREE.Mesh(ng, M.needle);
      // canvas x to the car's x: the plane is turned to face the driver
      n.position.set(0.34 - (G.x / 1024) * 0.68, 1.0, 0.35);
      body.add(n);
      this.needles[G.id] = { mesh: n, max: G.max };
    }

    // ---- steering wheel: rim, three spokes and the horn button
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0.3, 1.205, 0.06);
    wheelGroup.rotation.x = 0.68;
    const sw = new ModelBuilder();
    sw.add(new THREE.TorusGeometry(0.185, 0.013, 10, 40), { color: 0x141414, jitter: 0, smooth: true });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      sw.beam([0, 0, -0.03], [Math.cos(a) * 0.178, Math.sin(a) * 0.178, 0], 0.0075, 6, { color: 0xd8dadc, jitter: 0, smooth: true });
    }
    sw.add(new THREE.SphereGeometry(0.035, 16, 10), { pos: [0, 0, -0.03], scale: [1, 1, 0.5], color: 0xe8e8ea, jitter: 0, smooth: true });
    const swMesh = new THREE.Mesh(sw.build(), M.gloss);
    swMesh.castShadow = true;
    const swSpin = new THREE.Group();
    swSpin.add(swMesh);
    wheelGroup.add(swSpin);
    body.add(wheelGroup);
    this.steeringWheel = swSpin;
    // the 8-ball on the shifter
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 14), M.ball);
    ball.position.set(0.037, 1.03, -0.12);
    ball.rotation.set(-0.3, 0.2, 0);
    body.add(ball);

    // ---- glass, lamps, plate
    const glass = loft([wsBase.map((p) => [p[0] * 0.98, p[1] + 0.005, 0.422]), wsBase.map((p) => [p[0] * 0.96, 1.52, 0.338])], {});
    const ws = new THREE.Mesh(glass, M.glass);
    ws.renderOrder = 2;
    body.add(ws);
    // both headlamp lenses in one mesh and both tail lamps in another: two
    // draws instead of four
    const lensGeos = [];
    const tailGeos = [];
    const lm = new THREE.Matrix4();
    for (const s of [1, -1]) {
      const lg = latheX([[0.107, 0.02], [0.09, 0.027], [0.05, 0.033], [0.0, 0.036]], 24);
      lg.applyMatrix4(lm.makeRotationY(-Math.PI / 2).setPosition(s * 0.44, 0.99, 1.742));
      lensGeos.push(lg);
      const tg = new THREE.SphereGeometry(0.046, 16, 12);
      tg.applyMatrix4(lm.makeScale(0.82, 1.45, 0.45).setPosition(s * 0.47, 0.77, -1.885));
      tailGeos.push(tg);
    }
    body.add(new THREE.Mesh(mergeGeometries(lensGeos), M.lens));
    body.add(new THREE.Mesh(mergeGeometries(tailGeos), M.tail));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), M.plate);
    plate.position.set(0, 0.665, -2.013);
    plate.rotation.y = Math.PI;
    body.add(plate);
    // hitch drawbar and ball, shown while towing
    const hb = new ModelBuilder();
    hb.box(0.07, 0.07, 0.5, { pos: [0, 0.48, -2.2], color: 0x1a1a1d, jitter: 0 });
    hb.add(new THREE.SphereGeometry(0.03, 12, 8), { pos: [0, 0.535, -2.43], color: 0xd0d0d0, jitter: 0, smooth: true });
    this.hitchBar = new THREE.Mesh(hb.build(), M.gloss);
    this.hitchBar.visible = false;
    body.add(this.hitchBar);

    // ---- Ruben, dressed from the wardrobe, hands on the wheel
    this.driver = new Driver({
      hip: [0.3, 0.84, -0.6],
      lean: -0.06,
      elbow: (s) => [0.3 + s * 0.25, 1.1, -0.2],
      wheel: swSpin,
      grip: [
        [0.16, 0.093, -0.012],
        [-0.16, 0.093, -0.012],
      ],
    });
    body.add(this.driver.group);
    this.driver.visible = false;
    this.driver.setLook(lookColors(null));
    this.poseDriver();

    // ---- wheels: steel wheels painted to match, baby moons, trim rings,
    // wide whitewalls
    const frontTyre = tyreGeometry(FRONT_R, 0.2, 0.2);
    const rearTyre = tyreGeometry(REAR_R, 0.4, 0.215, { n: 4.6 });
    const tyreMat = (white) => {
      const t = tyreTexture({ whitewall: white, tread: 'street', ribs: 4 });
      // (the texture is sRGB, so the bump reads its dark tread steps decoded
      // to linear light, about seven times shallower than drawn: scaled up)
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 5, roughness: 0.9, metalness: 0 });
    };
    M.tyreFront = tyreMat(0.09);
    M.tyreRear = tyreMat(0.11);
    const rimParts = (rr, hw) => {
      const paint = latheX(
        [
          [rr + 0.004, -0.96 * hw],
          [rr + 0.002, 0.85 * hw],
          [rr - 0.012, 0.9 * hw],
          [rr - 0.04, 0.78 * hw],
          [rr * 0.62, 0.48 * hw],
          [0.12, 0.5 * hw],
        ],
        32
      );
      // the back of the wheel, so it is solid from the inside too
      const backDisc = latheX([[0, -0.9 * hw], [rr + 0.004, -0.9 * hw]], 32);
      const paintAll = merge([paint, backDisc]);
      const chrome = merge([
        // trim ring over the rim's edge
        latheX(
          [
            [rr + 0.016, 0.97 * hw],
            [rr + 0.004, 0.99 * hw],
            [rr - 0.022, 0.93 * hw],
            [rr - 0.04, 0.8 * hw],
          ],
          32
        ),
        // the baby moon
        latheX(
          [
            [0.122, 0.5 * hw],
            [0.118, 0.6 * hw],
            [0.1, 0.72 * hw],
            [0.07, 0.8 * hw],
            [0.035, 0.84 * hw],
            [0.0, 0.85 * hw],
          ],
          32
        ),
      ]);
      tintGeo(chrome, 0xffffff);
      return { paint: paintAll, chrome };
    };
    const frontRim = rimParts(0.2, 0.1);
    const rearRim = rimParts(0.215, 0.2);
    const defs = [
      { x: 0.8, z: -1.25, r: REAR_R, w: 0.4, front: false },
      { x: -0.8, z: -1.25, r: REAR_R, w: 0.4, front: false },
      { x: 0.72, z: 1.5, r: FRONT_R, w: 0.2, front: true },
      { x: -0.72, z: 1.5, r: FRONT_R, w: 0.2, front: true },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, d.r, d.z);
      const spin = new THREE.Group();
      pivot.add(spin);
      // the right-hand wheels are turned round, not mirrored, so their
      // whitewalls face out and nothing reads backwards
      const face = new THREE.Group();
      if (d.x < 0) face.rotation.y = Math.PI;
      spin.add(face);
      const tyre = new THREE.Mesh(d.front ? frontTyre : rearTyre, d.front ? M.tyreFront : M.tyreRear);
      tyre.castShadow = true;
      tyre.receiveShadow = true;
      const R = d.front ? frontRim : rearRim;
      const wp = new THREE.Mesh(R.paint, M.wheelPaint);
      const wc = new THREE.Mesh(R.chrome, M.chrome);
      face.add(tyre, wp, wc);
      this.group.add(pivot);
      this.wheels.push({ ...d, pivot, spin });
    }
    this.bodyHalfWidth = 0.6;
  }

  // Dress Ruben at the wheel from the wardrobe.
  setLook(look) {
    this.driver.setLook(lookColors(look));
    this.poseDriver();
  }

  place(x, z, yaw) {
    super.place(x, z, yaw);
    this.poseDriver();
  }

  // Forearms from the elbows to the hands on the wheel.
  poseDriver() {
    this.group.updateMatrixWorld(true);
    (this._inv || (this._inv = new THREE.Matrix4())).copy(this.body.matrixWorld).invert();
    this.driver.pose(this._inv);
  }

  setPaint(id) {
    const p = PAINTS.find((q) => q.id === id) || PAINTS[0];
    const M = this.materials;
    M.paint.map?.dispose();
    M.paint.map = bodyTexture(p);
    M.paint.color.set(0xffffff);
    const rust = p.id === 'rust';
    // the barn-find rust is matte; the rest shine under a clear coat
    M.paint.roughness = p.rough ?? 0.3;
    M.paint.metalness = p.metal ?? 0.35;
    M.paint.clearcoat = rust ? 0 : 1;
    M.paint.needsUpdate = true;
    M.wheelPaint.color.set(rust ? '#5a2c16' : p.base);
    M.wheelPaint.roughness = rust ? 0.85 : 0.3;
    M.wheelPaint.clearcoat = rust ? 0 : 1;
    this.game.materials?.paintChanged?.();
  }

  animate(dt) {
    // the wheel turns about three times as far as the front tyres
    this.steeringWheel.rotation.z = this.steer * 3.2;
    const mph = Math.abs(this.speed) * 2.237;
    const N = this.needles;
    const ang = (v, max) => (135 - (270 * clamp(v, 0, max)) / max) * (Math.PI / 180);
    N.speed.mesh.rotation.z = -ang(mph, N.speed.max);
    N.rpm.mesh.rotation.z = -ang((this.rpm || 0) / 1000, N.rpm.max);
    // lamps: headlights at night, brake lights on the pedal
    const night = this.game.env.night;
    this.headlight.intensity = this.occupied || night > 0.5 ? night * 60 : 0;
    this.materials.lens.emissiveIntensity = night * 2.2 * (this.occupied || night > 0.5 ? 1 : 0.2);
    this.materials.tail.emissiveIntensity = (this.brake && this.occupied ? 2.6 : 0.15) + night * 0.9;
    this.hitchBar.visible = !!this.towing || !!this.game.boat?.owned;
    if (this.driver.visible) this.poseDriver();
  }
}

function tintGeo(geo, hex) {
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

