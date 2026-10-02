// Parametric fish meshes with canvas-painted skins for every species, plus a
// flop/swim vertex animation. Models are built at unit length along +z (head
// at +z) and scaled by the caller.
//
// A caught fish is seen close up, in your hands and in the catch photo, so it
// is made with care: a body with flat flanks, the step of the gill cover and a
// wet clear coat with a little sheen; a skin with fine scales, the lateral
// line, the gill cover, the mouth and the species' own marks; fins of rays
// with clear membrane between (tail, dorsal, adipose, anal, pelvic and
// pectoral); eyes with an iris and a pupil.
import * as THREE from 'three';
import { fxPatch } from '../world/worldfx.js';
import { FISH } from '../gameplay/data.js';
import { mulberry32 } from '../util/math.js';

const SHAPES = {
  salmon: { h: 0.25, w: 0.12, profile: [[0, 0.1], [0.08, 0.55], [0.25, 0.92], [0.42, 1], [0.62, 0.8], [0.8, 0.42], [0.9, 0.3], [1, 0.34]], tail: 0.22, fork: 0.6, dorsal: [0.42, 0.14, 0.16], adipose: true },
  trout: { h: 0.23, w: 0.12, profile: [[0, 0.12], [0.08, 0.58], [0.25, 0.94], [0.45, 1], [0.64, 0.82], [0.82, 0.45], [0.9, 0.34], [1, 0.36]], tail: 0.2, fork: 0.25, dorsal: [0.42, 0.13, 0.15], adipose: true },
  grayling: { h: 0.2, w: 0.1, profile: [[0, 0.12], [0.07, 0.55], [0.25, 0.95], [0.45, 1], [0.65, 0.78], [0.84, 0.4], [0.92, 0.3], [1, 0.33]], tail: 0.18, fork: 0.55, dorsal: [0.3, 0.34, 0.3], adipose: true, sail: true },
  pike: { h: 0.15, w: 0.1, profile: [[0, 0.05], [0.12, 0.45], [0.3, 0.9], [0.5, 1], [0.7, 0.92], [0.84, 0.6], [0.93, 0.4], [1, 0.42]], tail: 0.17, fork: 0.35, dorsal: [0.8, 0.12, 0.12], adipose: false, snout: true },
  eel: { h: 0.14, w: 0.1, profile: [[0, 0.3], [0.06, 0.8], [0.2, 1], [0.5, 0.92], [0.75, 0.7], [0.95, 0.35], [1, 0.3]], tail: 0.13, fork: 0, dorsal: [0.62, 0.08, 0.35], adipose: false, barbel: true },
  flat: { h: 0.07, w: 0.44, profile: [[0, 0.15], [0.1, 0.6], [0.3, 0.95], [0.5, 1], [0.7, 0.85], [0.86, 0.4], [0.93, 0.25], [1, 0.3]], tail: 0.24, fork: 0.35, dorsal: null, adipose: false, flat: true },
  ling: { h: 0.19, w: 0.15, profile: [[0, 0.3], [0.08, 0.8], [0.22, 1], [0.45, 0.9], [0.7, 0.62], [0.88, 0.36], [1, 0.3]], tail: 0.18, fork: 0, dorsal: [0.55, 0.1, 0.4], adipose: false },
  rockfish: { h: 0.34, w: 0.13, profile: [[0, 0.2], [0.1, 0.7], [0.28, 1], [0.5, 0.95], [0.7, 0.66], [0.85, 0.36], [1, 0.34]], tail: 0.2, fork: 0.1, dorsal: [0.4, 0.16, 0.34], adipose: false, spiny: true },
  cod: { h: 0.23, w: 0.15, profile: [[0, 0.2], [0.08, 0.72], [0.25, 1], [0.48, 0.92], [0.7, 0.64], [0.86, 0.36], [1, 0.34]], tail: 0.19, fork: 0.05, dorsal: [0.35, 0.12, 0.14], adipose: false, barbel: true, cod: true },
  // small-headed, slim and silver, deeply forked tail
  whitefish: { h: 0.21, w: 0.11, profile: [[0, 0.1], [0.06, 0.42], [0.22, 0.9], [0.45, 1], [0.66, 0.8], [0.84, 0.42], [0.92, 0.3], [1, 0.33]], tail: 0.2, fork: 0.7, dorsal: [0.4, 0.14, 0.14], adipose: true },
  // a deep rockfish with a very tall spiny dorsal
  quillback: { h: 0.36, w: 0.13, profile: [[0, 0.2], [0.1, 0.72], [0.28, 1], [0.5, 0.95], [0.7, 0.64], [0.85, 0.36], [1, 0.34]], tail: 0.2, fork: 0.05, dorsal: [0.34, 0.3, 0.38], adipose: false, spiny: true },
  // slender with one long dorsal fin
  greenling: { h: 0.18, w: 0.12, profile: [[0, 0.25], [0.08, 0.72], [0.25, 1], [0.5, 0.92], [0.72, 0.64], [0.88, 0.36], [1, 0.32]], tail: 0.17, fork: 0.1, dorsal: [0.28, 0.1, 0.56], adipose: false },
  // big broad head, tapering body, fan-like pectorals
  sculpin: { h: 0.2, w: 0.22, profile: [[0, 0.5], [0.05, 0.95], [0.15, 1], [0.3, 0.78], [0.55, 0.52], [0.8, 0.34], [1, 0.3]], tail: 0.15, fork: 0, dorsal: [0.3, 0.13, 0.42], adipose: false, spiny: true, bigPecs: true },
  // torpedo body, pointed snout, two dorsals, longer upper tail lobe
  shark: { h: 0.16, w: 0.15, profile: [[0, 0.08], [0.08, 0.5], [0.25, 0.92], [0.42, 1], [0.62, 0.78], [0.82, 0.38], [0.93, 0.22], [1, 0.2]], tail: 0.25, fork: 0.5, dorsal: [0.38, 0.15, 0.13], dorsal2: [0.72, 0.07, 0.07], adipose: false, heterocercal: true, bigPecs: true },
  // a flat diamond disc with a long thin tail
  skate: { h: 0.075, w: 0.95, wprofile: [[0, 0.12], [0.06, 0.5], [0.3, 1], [0.44, 0.42], [0.5, 0.06], [1, 0.04]], profile: [[0, 0.3], [0.3, 1], [0.44, 0.6], [0.5, 0.25], [1, 0.15]], tail: 0.07, fork: 0, dorsal: null, adipose: false, flat: true, skate: true },
};

function profileAt(profile, t) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return profile[profile.length - 1][1];
}

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

// Cross-section of each body shape: a superellipse, flatter flanks the
// higher the power (a trout is a slab, an eel a tube), and the eye's size.
const SECTION = { salmon: 2.6, trout: 2.5, grayling: 2.5, whitefish: 2.6, pike: 2.2, eel: 2.0, ling: 2.2, rockfish: 2.7, quillback: 2.7, cod: 2.3, greenling: 2.4, sculpin: 2.0, shark: 2.1 };
const EYE = { rockfish: 0.031, quillback: 0.031, sculpin: 0.03, eel: 0.017, ling: 0.02, cod: 0.026, shark: 0.019, pike: 0.022, flat: 0.02, skate: 0.022 };
// the iris: silver and gold on the salmon and trout, the yelloweye's own
// yellow, the pike's and the cod's gold, dark on the sharks and the skate
const IRIS = { yelloweye: 0xffd21a, pike: 0xd8b030, cod: 0xc8a840, lingcod: 0xb8a060, blackrock: 0x8a6a3a, quillback: 0xd89a40, sculpin: 0xc89040, salmonshark: 0x2a3a30, dogfish: 0x6a8a6a, skate: 0x4a4436, halibut: 0x6a6040, flounder: 0x8a7a40, burbot: 0xa89a60, wolfeel: 0x7a7060, greenling: 0xb07a40, blackfish: 0x8a7a50 };

// Skin texture: u along the body (0 head .. 1 tail), v around (0 belly, 0.5
// back, 1 belly; the flanks at 0.25 and 0.75), both flanks drawn alike.
function skinTexture(id) {
  const f = FISH[id];
  const col = f.col;
  const W = 512;
  const H = 256;
  // (the marks were laid out on a skin half this size)
  const kx = W / 256;
  const ky = H / 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, hex(col.belly));
  grad.addColorStop(0.16, hex(col.belly));
  grad.addColorStop(0.24, hex(col.side));
  grad.addColorStop(0.38, hex(col.side));
  grad.addColorStop(0.5, hex(col.back));
  grad.addColorStop(0.62, hex(col.side));
  grad.addColorStop(0.76, hex(col.side));
  grad.addColorStop(0.84, hex(col.belly));
  grad.addColorStop(1.0, hex(col.belly));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // a darker saddle along the back and a pale belly
  const sg = g.createLinearGradient(0, H * 0.4, 0, H * 0.6);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg;
  g.fillRect(0, H * 0.4, W, H * 0.2);
  if (col.head) {
    const hg = g.createLinearGradient(0, 0, W * 0.3, 0);
    hg.addColorStop(0, hex(col.head));
    hg.addColorStop(0.8, hex(col.head));
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, H * 0.12, W * 0.3, H * 0.76);
  }
  const rand = mulberry32(id.length * 97 + 13);
  // a sheen along the flanks: pink on the trout that carry a band, a cool
  // violet on the silver fish
  const silver = !col.band && (f.shape === 'salmon' || f.shape === 'whitefish' || id === 'steelhead' || id === 'kokanee');
  if (silver) {
    for (const y of [0.3, 0.7]) {
      const bg = g.createLinearGradient(0, H * (y - 0.08), 0, H * (y + 0.08));
      bg.addColorStop(0, 'rgba(150,140,220,0)');
      bg.addColorStop(0.5, 'rgba(150,140,220,0.18)');
      bg.addColorStop(1, 'rgba(150,140,220,0)');
      g.fillStyle = bg;
      g.fillRect(W * 0.15, H * (y - 0.08), W * 0.8, H * 0.16);
    }
  }
  if (col.band && id !== 'chum') {
    // lateral stripe on both flanks
    for (const y of [0.3, 0.7]) {
      const bg = g.createLinearGradient(0, H * (y - 0.07), 0, H * (y + 0.07));
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(0.5, hex(col.band));
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bg;
      g.fillRect(W * 0.12, H * (y - 0.07), W * 0.8, H * 0.14);
    }
  }
  if (id === 'chum') {
    // tiger bars
    g.fillStyle = hex(col.band);
    g.globalAlpha = 0.65;
    for (let i = 0; i < 9; i++) {
      const x = W * (0.2 + i * 0.075);
      g.beginPath();
      g.moveTo(x, H * 0.12);
      g.lineTo(x + 10 * kx, H * 0.12);
      g.lineTo(x + 18 * kx, H * 0.42);
      g.lineTo(x + 8 * kx, H * 0.42);
      g.fill();
      g.beginPath();
      g.moveTo(x, H * 0.88);
      g.lineTo(x + 10 * kx, H * 0.88);
      g.lineTo(x + 18 * kx, H * 0.58);
      g.lineTo(x + 8 * kx, H * 0.58);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // fine scales over the flanks: a net of small arcs, each catching a little
  // light on its edge
  if (!col.scales && f.shape !== 'eel' && f.shape !== 'shark' && f.shape !== 'skate') {
    const step = f.shape === 'flat' ? 5 : 4;
    for (let x = W * 0.16; x < W * 0.97; x += step) {
      for (let y = H * 0.06; y < H * 0.94; y += step * 0.8) {
        const ox = (Math.round(y / (step * 0.8)) % 2) * step * 0.5;
        g.strokeStyle = 'rgba(20,24,28,0.13)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.arc(x + ox, y, step * 0.62, -Math.PI * 0.45, Math.PI * 0.45);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.arc(x + ox - 0.8, y, step * 0.62, -Math.PI * 0.4, Math.PI * 0.4);
        g.stroke();
      }
    }
  }
  if (col.spots) {
    g.fillStyle = hex(col.spots);
    // per species: how many, how big, and where round the body (v: 0 belly,
    // 0.5 back); the default is small spots on the upper flanks
    const SP = {
      rainbow: { n: 170 },
      laker: { n: 150, r: [2, 5] },
      pike: { n: 90, r: [3, 6] },
      steelhead: { n: 55 },
      greenling: { n: 60, r: [2.5, 4.2], v: [0.2, 0.8] },
      quillback: { n: 150, r: [1, 1.9], v: [0.2, 0.8] },
      blackrock: { n: 45, r: [3, 5.5], v: [0.25, 0.75], a: 0.5 },
      sculpin: { n: 34, r: [4, 7.5], v: [0.22, 0.78], a: 0.6 },
      dogfish: { n: 30, r: [2, 3.5], v: [0.36, 0.64] },
      salmonshark: { n: 40, r: [3, 5.5], v: [0.04, 0.2], both: true, a: 0.55 },
      skate: { n: 70, r: [3, 6.5], v: [0.3, 0.7], a: 0.55 },
      flounder: { n: 90, r: [1.5, 3], v: [0.3, 0.7] },
    }[id] || {};
    const count = SP.n || 70;
    const [r0, r1] = SP.r || [1.4, 3.6];
    // pale spots (the chars) wear a soft halo
    const pale = (col.spots >> 16) + ((col.spots >> 8) & 255) + (col.spots & 255) > 360;
    for (let i = 0; i < count; i++) {
      const u = 0.12 + rand() * 0.86;
      let v;
      if (SP.v) {
        v = SP.v[0] + rand() * (SP.v[1] - SP.v[0]);
        if (SP.both && rand() < 0.5) v = 1 - v;
      } else {
        // spots mostly on the upper flanks
        const up = rand();
        v = up < 0.5 ? 0.3 + rand() * 0.22 : 0.48 + rand() * 0.22;
      }
      const r = (r0 + rand() * (r1 - r0)) * kx;
      if (pale) {
        g.globalAlpha = 0.18;
        g.beginPath();
        g.arc(u * W, v * H, r * 1.8, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = SP.a || 0.85;
      g.beginPath();
      if (id === 'pike') g.ellipse(u * W, v * H, r * 1.8, r, 0, 0, Math.PI * 2);
      else g.arc(u * W, v * H, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // big scales in a net (whitefish)
  if (col.scales) {
    for (let x = W * 0.12; x < W * 0.95; x += 7 * kx) {
      for (let y = H * 0.1; y < H * 0.9; y += 6 * ky) {
        const ox = ((y / (6 * ky)) % 2) * 3.5 * kx;
        g.strokeStyle = 'rgba(40,50,55,0.35)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(x + ox, y, 3.6 * kx, -Math.PI * 0.5, Math.PI * 0.5);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.beginPath();
        g.arc(x + ox - 1.2, y, 3.6 * kx, -Math.PI * 0.42, Math.PI * 0.42);
        g.stroke();
      }
    }
  }
  // the lateral line along each flank, a little above the middle
  if (f.shape !== 'skate') {
    for (const y of [0.3, 0.7]) {
      g.strokeStyle = 'rgba(20,20,20,0.28)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(W * 0.2, H * y);
      g.bezierCurveTo(W * 0.4, H * (y + (y < 0.5 ? 0.025 : -0.025)), W * 0.7, H * y, W * 0.97, H * (y + (y < 0.5 ? -0.03 : 0.03)));
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 1;
      g.stroke();
    }
  }
  // the red slash under the jaw (cutthroat trout)
  if (col.throat) {
    g.fillStyle = hex(col.throat);
    g.globalAlpha = 0.9;
    for (const v of [0.08, 0.92]) {
      g.beginPath();
      g.ellipse(W * 0.075, H * v, W * 0.05, H * 0.022, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // a dark eyespot on each wing (big skate)
  if (col.eyespot) {
    for (const v of [0.36, 0.64]) {
      g.fillStyle = hex(col.eyespot);
      g.beginPath();
      g.arc(W * 0.3, H * v, 7 * kx, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c8b890';
      g.beginPath();
      g.arc(W * 0.3, H * v, 3 * kx, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (f.shape !== 'flat' && f.shape !== 'skate') {
    // the gill cover: its edge a dark curve, the cheek before it a touch
    // lighter
    for (const [v0, v1] of [
      [0.1, 0.42],
      [0.58, 0.9],
    ]) {
      const ux = f.shape === 'shark' ? 0.2 : 0.19;
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(W * 0.03, H * v0, W * (ux - 0.03), H * (v1 - v0));
      if (f.shape === 'shark') {
        // five gill slits instead of a cover
        g.strokeStyle = 'rgba(10,12,14,0.5)';
        g.lineWidth = 1.6;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.moveTo(W * (0.17 + k * 0.018), H * (v0 + 0.08));
          g.lineTo(W * (0.172 + k * 0.018), H * (v1 - 0.08));
          g.stroke();
        }
      } else {
        g.strokeStyle = 'rgba(12,14,16,0.55)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(W * ux, H * v0);
        g.quadraticCurveTo(W * (ux + 0.035), H * (v0 + v1) * 0.5, W * ux, H * v1);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(W * (ux - 0.006), H * v0);
        g.quadraticCurveTo(W * (ux + 0.029), H * (v0 + v1) * 0.5, W * (ux - 0.006), H * v1);
        g.stroke();
      }
    }
    // the mouth along each side of the snout, under the eye
    g.strokeStyle = 'rgba(8,8,8,0.7)';
    g.lineWidth = 2;
    for (const [v0, v1] of [
      [0.24, 0.17],
      [0.76, 0.83],
    ]) {
      g.beginPath();
      g.moveTo(0, H * v0);
      g.quadraticCurveTo(W * 0.03, H * (v0 + v1) * 0.5, W * (f.shape === 'pike' || f.shape === 'ling' ? 0.1 : 0.065), H * v1);
      g.stroke();
    }
  }
  // the scales' shimmer
  g.globalAlpha = 0.09;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 1200; i++) g.fillRect(rand() * W, H * (0.18 + rand() * 0.64), 2, 1);
  g.globalAlpha = 1;
  // the dark tip of the snout
  const eg = g.createLinearGradient(0, 0, W * 0.06, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.35)');
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eg;
  g.fillRect(0, 0, W * 0.06, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The fins' rays: u from the fin's base (0) to its edge (1), v across it.
// Dark rays with lighter membrane between, a little clearer toward the edge.
let finTex = null;
function finTexture() {
  if (finTex) return finTex;
  const W = 64;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // the membrane, clearer toward the edge
  const mg = g.createLinearGradient(0, 0, W, 0);
  mg.addColorStop(0, 'rgba(236,236,236,0.95)');
  mg.addColorStop(1, 'rgba(214,214,214,0.6)');
  g.fillStyle = mg;
  g.fillRect(0, 0, W, H);
  // a darker ray on each sixteenth (and on its wrap round at the ends)
  const rg = g.createLinearGradient(0, 0, W, 0);
  rg.addColorStop(0, 'rgba(140,140,140,0.97)');
  rg.addColorStop(1, 'rgba(150,150,150,0.8)');
  g.fillStyle = rg;
  for (let k = 0; k <= 16; k++) g.fillRect(0, (k / 16) * H - 1.5, W, 3);
  finTex = new THREE.CanvasTexture(c);
  finTex.colorSpace = THREE.SRGBColorSpace;
  finTex.wrapT = THREE.RepeatWrapping;
  return finTex;
}

// An eye in the shape of a ball with its pole looking out: the pupil round
// the pole, then the iris, then the dark of the eyeball (v from the pole).
const eyeTex = new Map();
function eyeTexture(iris) {
  if (eyeTex.has(iris)) return eyeTex.get(iris);
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d');
  const ic = new THREE.Color(iris);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, '#050505');
  grad.addColorStop(0.11, '#050505');
  grad.addColorStop(0.13, '#' + ic.clone().multiplyScalar(0.5).getHexString());
  grad.addColorStop(0.17, '#' + ic.getHexString());
  grad.addColorStop(0.26, '#' + ic.clone().multiplyScalar(0.7).getHexString());
  grad.addColorStop(0.3, '#1a1a18');
  grad.addColorStop(1.0, '#202020');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  eyeTex.set(iris, t);
  return t;
}

// The cross-section's half width and half height at t along the body.
function section(sh, t) {
  const k = profileAt(sh.profile, t);
  const kw = sh.wprofile ? profileAt(sh.wprofile, t) : k;
  let hh = sh.h * 0.5 * k;
  let ww = sh.w * 0.5 * kw;
  // the snout rounds off rather than ending in a point
  if (t < 0.035) {
    const f = 0.4 + 0.6 * Math.sqrt(t / 0.035);
    hh *= f;
    ww *= f;
  }
  return [hh, ww];
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function bodyGeometry(sh, shape) {
  const ringsN = 40;
  const around = 24;
  const n = SECTION[shape] || 2.4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= ringsN; i++) {
    const t = i / ringsN;
    const z = 0.5 - t * 0.82; // head at +0.5, tail base at -0.32
    const [hh, ww] = section(sh, t);
    // the gill cover stands a little proud of the body and drops back to it
    // at its edge
    const gill = sh.flat ? 1 : 1 + 0.035 * smooth(0.1, 0.19, t) * (1 - smooth(0.2, 0.225, t));
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2 - Math.PI / 2; // start at the belly
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let x;
      let y;
      if (sh.flat) {
        // flatfish: flattened disk, slightly domed on top
        x = ca * ww;
        y = sa * hh + (sa > 0 ? hh * 0.3 : 0);
      } else {
        x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) * ww * (Math.abs(ca) > 0.3 ? gill : 1 + (gill - 1) * (Math.abs(ca) / 0.3));
        y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n) * hh;
        // a fuller belly
        if (sa < 0) y *= 1.05;
        if (sh.snout && t < 0.14) y *= 0.7;
      }
      pos.push(x, y, z);
      uv.push(t, j / around);
    }
  }
  for (let i = 0; i < ringsN; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The fins as strips of rays: each ray from a point on the fin's base to a
// point on its edge, the membrane between neighbouring rays.
function finGeometry(sh, finColor, finBars, sailColor) {
  const pos = [];
  const uv = [];
  const col = [];
  const base = new THREE.Color(finColor);
  // rays: [[baseX, baseY, baseZ], [edgeX, edgeY, edgeZ], tint?]
  const strip = (rays) => {
    for (let i = 0; i + 1 < rays.length; i++) {
      const [b0, e0, c0 = base] = rays[i];
      const [b1, e1, c1 = base] = rays[i + 1];
      // one ray to a sixteenth of the fin texture, so its dark lines fall on
      // the rays
      const v0 = i / 16;
      const v1 = (i + 1) / 16;
      for (const [p, u, v, cc] of [
        [b0, 0, v0, c0],
        [e0, 1, v0, c0],
        [e1, 1, v1, c1],
        [b0, 0, v0, c0],
        [e1, 1, v1, c1],
        [b1, 0, v1, c1],
      ]) {
        pos.push(p[0], p[1], p[2]);
        uv.push(u, v);
        col.push(cc.r, cc.g, cc.b);
      }
    }
  };
  const H = sh.flat ? sh.w * 0.5 : sh.h * 0.5;
  const tz = -0.32;
  const tl = sh.tail;
  const tw = sh.tail * (sh.flat ? 1.6 : 1.0);
  const fork = sh.fork;
  // ---- the tail
  {
    const N = 13;
    const rays = [];
    const hb = sh.flat ? sh.w * 0.5 * profileAt(sh.profile, 1) * 0.9 : H * profileAt(sh.profile, 1) * 0.9;
    for (let i = 0; i < N; i++) {
      const s = -1 + (2 * i) / (N - 1);
      const a = Math.abs(s);
      let len = tl * (0.4 + 0.6 * (1 - fork * 0.62 * (1 - Math.pow(a, 1.5))));
      // the lobes reach a little past the body's own depth
      let spread = sh.flat ? hb * 0.7 + tw * 0.95 * Math.pow(a, 0.9) : hb * 0.5 + tw * 0.58 * Math.pow(a, 0.9);
      if (sh.heterocercal) {
        len *= s > 0 ? 1.3 : 0.7;
        spread *= s > 0 ? 1.3 : 0.7;
      }
      if (sh.skate) {
        len = tl * 0.9;
        spread = 0.03 * s;
      }
      const b = sh.flat ? [s * hb, 0, tz + 0.015] : [0, s * hb, tz + 0.015];
      const e = sh.flat ? [s * spread, 0, tz - len] : [0, Math.sign(s) * spread * (sh.skate ? 1 : 1), tz - len];
      if (sh.skate) {
        b[0] = 0;
        b[1] = 0.004 * s;
        b[2] = tz - tl * 0.4;
        e[0] = 0;
        e[1] = 0.03 * (s + 1) * 0.5;
        e[2] = tz - tl * (1 + 0.4 * (1 - a));
      }
      rays.push([b, e]);
    }
    strip(rays);
  }
  // ---- dorsal fins
  const dorsal = (dt, dh, dl, opts = {}) => {
    const z0 = 0.5 - dt * 0.82;
    const N = Math.max(6, Math.round(dl * 45));
    const rays = [];
    for (let i = 0; i < N; i++) {
      const q = i / (N - 1);
      const tt = dt + (q * dl) / 0.82;
      const top = H * profileAt(sh.profile, Math.min(1, tt)) * 0.95;
      const z = z0 - q * dl;
      let hgt;
      if (opts.sail) hgt = dh * (0.75 + 0.25 * Math.sin(Math.PI * q));
      else if (opts.long) hgt = dh * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, q * 1.1)));
      else hgt = dh * (q < 0.22 ? 0.75 + 1.1 * q : 1 - 0.78 * ((q - 0.22) / 0.78));
      // a spiny fin: the membrane notched between its spines
      if (opts.spiny && i % 2 === 1) hgt *= 0.62;
      const lean = opts.sail ? 0.55 : 0.4;
      rays.push([[0, top - 0.004, z], [0, top + hgt * 0.92, z - hgt * lean], opts.tint]);
    }
    strip(rays);
  };
  if (sh.dorsal) {
    const [dt, dh, dl] = sh.dorsal;
    const sail = sh.sail ? new THREE.Color(sailColor || 0x6a4a9a) : null;
    dorsal(dt, dh, dl, { sail: !!sh.sail, spiny: !!sh.spiny, long: dl > 0.3, tint: sail || undefined });
    if (sh.dorsal2) dorsal(...sh.dorsal2);
    if (sh.cod) {
      dorsal(sh.dorsal[0] + 0.2, sh.dorsal[1] * 0.85, 0.13);
      dorsal(sh.dorsal[0] + 0.38, sh.dorsal[1] * 0.7, 0.12);
    }
  }
  // ---- the adipose fin: a small rounded flap
  if (sh.adipose) {
    const rays = [];
    for (let i = 0; i < 6; i++) {
      const q = i / 5;
      const tt = 0.78 + q * 0.06;
      const top = H * profileAt(sh.profile, tt) * 0.95;
      const z = 0.5 - tt * 0.82;
      const hgt = 0.032 * Math.sin(Math.PI * Math.min(1, q * 1.15));
      rays.push([[0, top - 0.003, z], [0, top + hgt, z - hgt * 0.5]]);
    }
    strip(rays);
  }
  // ---- fringe fins along both edges of a flatfish (bars on the starry
  // flounder)
  if (sh.flat && !sh.skate) {
    const bars = finBars ? new THREE.Color(finBars) : null;
    for (const s of [-1, 1]) {
      const rays = [];
      for (let i = 0; i <= 24; i++) {
        const t = 0.12 + (i / 24) * 0.76;
        const w = sh.w * 0.5 * profileAt(sh.profile, t) * s;
        const e = w + 0.055 * s * Math.sin((Math.PI * (t - 0.12)) / 0.76);
        rays.push([[w * 0.96, 0, 0.5 - t * 0.82], [e, -0.004, 0.5 - t * 0.82 - 0.01], bars && Math.floor(i / 2) % 2 ? bars : base]);
      }
      strip(rays);
    }
  }
  if (!sh.flat) {
    // ---- the anal fin
    {
      const N = 7;
      const rays = [];
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1);
        const tt = 0.66 + q * 0.11;
        const bot = -H * profileAt(sh.profile, tt) * 0.95 * 1.05;
        const z = 0.5 - tt * 0.82;
        const hgt = sh.h * 0.3 * (q < 0.25 ? 0.8 + 0.8 * q : 1 - 0.75 * ((q - 0.25) / 0.75));
        rays.push([[0, bot + 0.004, z], [0, bot - hgt * 0.9, z - hgt * 0.45]]);
      }
      strip(rays);
    }
    // ---- the pelvic fins, a pair under the belly
    for (const sd of [-1, 1]) {
      const N = 6;
      const rays = [];
      const tt = 0.47;
      const [hh, ww] = section(sh, tt);
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1);
        const z = 0.5 - (tt + q * 0.05) * 0.82;
        const bx = sd * ww * 0.35;
        const by = -hh * 0.98;
        const len = sh.h * 0.32 * (0.7 + 0.3 * Math.sin(Math.PI * q));
        rays.push([[bx, by, z], [bx + sd * len * 0.45, by - len * 0.45, z - len * 0.8]]);
      }
      strip(rays);
    }
  }
  // ---- the pectoral fins, low behind the gill covers (the skate's are its
  // wings)
  if (!sh.skate) {
    const big = sh.bigPecs ? 1.9 : 1;
    for (const sd of [-1, 1]) {
      const N = 8;
      const rays = [];
      const tt = 0.215;
      const [hh, ww] = section(sh, tt);
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1);
        const z = 0.5 - (tt + q * 0.03) * 0.82;
        const bx = sd * ww * (sh.flat ? 0.95 : 0.93);
        const by = sh.flat ? 0.004 : -hh * (0.5 - q * 0.22);
        const len = 0.1 * big * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, q * 1.2)));
        const out = sh.flat ? 0.6 : 0.45;
        rays.push([[bx, by, z], [bx + sd * len * out, by - len * (sh.flat ? 0 : 0.28), z - len * 0.85]]);
      }
      strip(rays);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// The eyes, each a ball whose pole looks out of the head (see eyeTexture),
// and the barbel under the chin of the cod and the burbot.
function eyeGeometry(sh, shape) {
  const r = EYE[shape] || 0.024;
  const geos = [];
  const z = 0.41;
  const t = (0.5 - z) / 0.82;
  const [hh, ww] = section(sh, t);
  if (sh.flat) {
    // both eyes on the top side
    for (const x of sh.skate ? [-0.05, 0.05] : [-0.035, 0.035]) {
      const e = new THREE.SphereGeometry(r, 14, 10);
      e.translate(x, hh + hh * 0.3 + r * 0.35, z - 0.02);
      geos.push(e);
    }
  } else {
    for (const s of [-1, 1]) {
      const e = new THREE.SphereGeometry(r, 14, 10);
      e.rotateZ(-s * Math.PI / 2);
      e.translate(s * (ww * 0.93 - r * 0.25), sh.h * 0.12, z);
      geos.push(e);
    }
  }
  return geos;
}

function barbelGeometry(sh) {
  const g = new THREE.ConeGeometry(0.006, sh.h * 0.3, 5);
  g.rotateX(Math.PI * 0.85);
  g.translate(0, -sh.h * 0.38, 0.45);
  return g;
}

// Material with flop animation (bend along the body).
function flopMaterial(params, uniforms) {
  params.onBeforeCompile = null;
  const m = params;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlop = uniforms.uFlop;
    shader.uniforms.uFlopT = uniforms.uFlopT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFlop;\nuniform float uFlopT;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tailw = clamp((0.5 - position.z) / 0.95, 0.0, 1.2);
        transformed.x += sin(uFlopT * 9.0 - position.z * 6.0) * uFlop * tailw * tailw * 0.22;`
      );
    fxPatch(shader, m);
  };
  return m;
}

const cache = new Map();

export function makeFishModel(id) {
  const f = FISH[id];
  const shape = f.shape || 'salmon';
  const sh = SHAPES[shape] || SHAPES.salmon;
  const uniforms = { uFlop: { value: 0.6 }, uFlopT: { value: 0 } };
  let base = cache.get(id);
  if (!base) {
    base = {
      body: bodyGeometry(sh, shape),
      fins: finGeometry(sh, f.col.fin || f.col.back, f.col.finBars, id === 'grayling' ? 0x6a4a9a : null),
      eyes: eyeGeometry(sh, sh.skate ? 'skate' : sh.flat ? 'flat' : shape),
      // (the wolf eel shares the burbot's long body, not its chin barbel)
      barbel: sh.barbel && id !== 'wolfeel' ? barbelGeometry(sh) : null,
      skin: skinTexture(id),
      eye: eyeTexture(IRIS[id] || (shape === 'whitefish' ? 0xd8d8d0 : 0xc8b070)),
    };
    cache.set(id, base);
  }
  const group = new THREE.Group();
  // wet: a clear coat over the skin, and a little sheen on the scales
  const bodyMat = flopMaterial(
    new THREE.MeshPhysicalMaterial({
      map: base.skin,
      roughness: 0.36,
      metalness: 0.18,
      clearcoat: 0.75,
      clearcoatRoughness: 0.2,
      iridescence: shape === 'salmon' || shape === 'trout' || shape === 'whitefish' ? 0.45 : 0.15,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [250, 600],
    }),
    uniforms
  );
  const finMat = flopMaterial(new THREE.MeshStandardMaterial({ map: finTexture(), vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, transparent: true }), uniforms);
  const eyeMat = flopMaterial(new THREE.MeshStandardMaterial({ map: base.eye, roughness: 0.06, metalness: 0.1 }), uniforms);
  const body = new THREE.Mesh(base.body, bodyMat);
  const fins = new THREE.Mesh(base.fins, finMat);
  group.add(body, fins);
  for (const e of base.eyes) group.add(new THREE.Mesh(e, eyeMat));
  if (base.barbel) group.add(new THREE.Mesh(base.barbel, bodyMat));
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.userData.uniforms = uniforms;
  group.userData.flat = !!sh.flat;
  return group;
}

// Length in cm from weight in kg using a species-appropriate condition factor.
export function lengthFor(id, kg) {
  const a = { flat: 1.35e-5, pike: 7.2e-6, eel: 6.5e-6, rockfish: 1.9e-5, grayling: 1.15e-5, ling: 1.0e-5, cod: 1.05e-5, whitefish: 1.0e-5, quillback: 1.9e-5, greenling: 9e-6, sculpin: 1.4e-5, shark: 6.5e-6, skate: 4.3e-6 }[FISH[id].shape] || 1.08e-5;
  return Math.round(Math.cbrt(kg / a));
}
