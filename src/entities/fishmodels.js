// Parametric fish meshes with canvas-painted skins for every species, plus a
// flop/swim vertex animation. Models are built at unit length along +z (head
// at +z) and scaled by the caller.
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

// Skin texture: u along the body (0 head .. 1 tail), v around (0 belly, 0.5 back, 1 belly)
function skinTexture(id) {
  const f = FISH[id];
  const col = f.col;
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, hex(col.belly));
  grad.addColorStop(0.2, hex(col.side));
  grad.addColorStop(0.38, hex(col.side));
  grad.addColorStop(0.5, hex(col.back));
  grad.addColorStop(0.62, hex(col.side));
  grad.addColorStop(0.8, hex(col.side));
  grad.addColorStop(1.0, hex(col.belly));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  if (col.head) {
    const hg = g.createLinearGradient(0, 0, W * 0.3, 0);
    hg.addColorStop(0, hex(col.head));
    hg.addColorStop(0.8, hex(col.head));
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, W * 0.3, H);
  }
  const rand = mulberry32(id.length * 97 + 13);
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
      g.lineTo(x + 10, H * 0.12);
      g.lineTo(x + 18, H * 0.42);
      g.lineTo(x + 8, H * 0.42);
      g.fill();
      g.beginPath();
      g.moveTo(x, H * 0.88);
      g.lineTo(x + 10, H * 0.88);
      g.lineTo(x + 18, H * 0.58);
      g.lineTo(x + 8, H * 0.58);
      g.fill();
    }
    g.globalAlpha = 1;
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
      const r = r0 + rand() * (r1 - r0);
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
    g.strokeStyle = 'rgba(40,50,55,0.35)';
    g.lineWidth = 1;
    for (let x = W * 0.1; x < W * 0.95; x += 7) {
      for (let y = H * 0.12; y < H * 0.88; y += 6) {
        g.beginPath();
        g.arc(x + ((y / 6) % 2) * 3.5, y, 3.6, -Math.PI * 0.5, Math.PI * 0.5);
        g.stroke();
      }
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
      g.arc(W * 0.3, H * v, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c8b890';
      g.beginPath();
      g.arc(W * 0.3, H * v, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // subtle scale shimmer
  g.globalAlpha = 0.08;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 400; i++) g.fillRect(rand() * W, H * (0.2 + rand() * 0.6), 2, 1);
  g.globalAlpha = 1;
  // dark head tip and eye patch
  const eg = g.createLinearGradient(0, 0, W * 0.08, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.35)');
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eg;
  g.fillRect(0, 0, W * 0.08, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function bodyGeometry(sh) {
  const ringsN = 20;
  const around = 12;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= ringsN; i++) {
    const t = i / ringsN;
    const k = profileAt(sh.profile, t);
    const kw = sh.wprofile ? profileAt(sh.wprofile, t) : k;
    const z = 0.5 - t * 0.82; // head at +0.5, tail base at -0.32
    let hh = sh.h * 0.5 * k;
    let ww = sh.w * 0.5 * kw;
    if (t < 0.02) {
      hh *= 0.4;
      ww *= 0.4;
    }
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2 - Math.PI / 2; // start at the belly
      let y = Math.sin(a) * hh;
      let x = Math.cos(a) * ww;
      if (sh.flat) {
        // flatfish: flattened disk, slightly domed on top
        y = Math.sin(a) * hh + (Math.sin(a) > 0 ? hh * 0.3 : 0);
      }
      if (sh.snout && t < 0.14) y *= 0.7;
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

function finGeometry(sh, finColor, finBars) {
  const pos = [];
  const col = [];
  const c = new THREE.Color(finColor);
  const push = (a, b, cc, tint = c) => {
    pos.push(...a, ...b, ...cc);
    for (let i = 0; i < 3; i++) col.push(tint.r, tint.g, tint.b);
  };
  const tri2 = (a, b, cc) => {
    push(a, b, cc);
    push(a, cc, b);
  };
  const H = sh.flat ? sh.w * 0.5 : sh.h * 0.5;
  // tail fin (vertical, or horizontal for the flatfish look it still reads vertically)
  const tz = -0.32;
  const tl = sh.tail;
  const tw = sh.tail * (sh.flat ? 1.6 : 1.0);
  const fork = sh.fork;
  if (sh.skate) {
    // a small fin at the end of the whip-like tail
    tri2([0, 0, tz], [0, 0.03, tz - tl], [0, 0, tz - tl * 1.4]);
  } else if (sh.flat) {
    tri2([0, 0, tz], [tw * 0.9, 0.0, tz - tl], [0, 0, tz - tl * (1 - fork * 0.5)]);
    tri2([0, 0, tz], [-tw * 0.9, 0.0, tz - tl], [0, 0, tz - tl * (1 - fork * 0.5)]);
  } else if (sh.heterocercal) {
    // shark tail: a long upper lobe and a short lower one
    tri2([0, 0, tz + 0.03], [0, tw * 1.25, tz - tl * 1.05], [0, tw * 0.1, tz - tl * 0.55]);
    tri2([0, 0, tz + 0.02], [0, -tw * 0.65, tz - tl * 0.62], [0, tw * 0.1, tz - tl * 0.55]);
  } else {
    tri2([0, 0, tz + 0.02], [0, tw * 0.95, tz - tl], [0, 0, tz - tl * (1 - fork * 0.6)]);
    tri2([0, 0, tz + 0.02], [0, -tw * 0.95, tz - tl], [0, 0, tz - tl * (1 - fork * 0.6)]);
  }
  // dorsal fin
  if (sh.dorsal) {
    const [dt, dh, dl] = sh.dorsal;
    const z0 = 0.5 - dt * 0.82;
    const top = H * profileAt(sh.profile, dt) * 0.95;
    const sail = sh.sail ? new THREE.Color(0x6a4a9a) : c;
    if (sh.spiny) {
      for (let i = 0; i < 6; i++) {
        const z = z0 - i * (dl / 6);
        push([0, top, z], [0, top + dh * (0.9 - i * 0.08), z - dl / 12], [0, top, z - dl / 6]);
        push([0, top, z], [0, top, z - dl / 6], [0, top + dh * (0.9 - i * 0.08), z - dl / 12]);
      }
    } else {
      tri2([0, top, z0], [0, top + dh, z0 - dl * 0.35], [0, top * 0.9, z0 - dl]);
      if (sh.sail) tri2([0, top, z0], [0, top + dh * 0.8, z0 - dl * 0.9], [0, top * 0.9, z0 - dl], sail);
    }
    if (sh.dorsal2) {
      const [t2, h2, l2] = sh.dorsal2;
      const z2 = 0.5 - t2 * 0.82;
      const top2 = H * profileAt(sh.profile, t2) * 0.95;
      tri2([0, top2, z2], [0, top2 + h2, z2 - l2 * 0.45], [0, top2 * 0.9, z2 - l2]);
    }
    if (sh.cod) {
      tri2([0, top * 0.8, z0 - dl * 1.3], [0, top + dh * 0.8, z0 - dl * 1.6], [0, top * 0.7, z0 - dl * 2.1]);
      tri2([0, top * 0.6, z0 - dl * 2.3], [0, top + dh * 0.6, z0 - dl * 2.6], [0, top * 0.5, z0 - dl * 3.0]);
    }
  }
  if (sh.adipose) {
    const z = 0.5 - 0.82 * 0.8;
    const top = H * profileAt(sh.profile, 0.8) * 0.95;
    tri2([0, top, z], [0, top + 0.03, z - 0.02], [0, top, z - 0.05]);
  }
  // fringe fins along both edges of a flatfish (bars on the starry flounder)
  if (sh.flat && !sh.skate) {
    const bars = finBars ? new THREE.Color(finBars) : null;
    for (let i = 0; i < 16; i++) {
      const t0 = 0.14 + (i / 16) * 0.72;
      const t1 = 0.14 + ((i + 1) / 16) * 0.72;
      const tint = bars && i % 2 ? bars : c;
      for (const s of [-1, 1]) {
        const w0 = sh.w * 0.5 * profileAt(sh.profile, t0) * s;
        const w1 = sh.w * 0.5 * profileAt(sh.profile, t1) * s;
        const e0 = w0 + 0.05 * s * Math.sin(Math.PI * (t0 - 0.14) / 0.72);
        const e1 = w1 + 0.05 * s * Math.sin(Math.PI * (t1 - 0.14) / 0.72);
        tri2([w0 * 0.97, 0, 0.5 - t0 * 0.82], [e0, 0, 0.5 - t0 * 0.82], [w1 * 0.97, 0, 0.5 - t1 * 0.82], tint);
        tri2([e0, 0, 0.5 - t0 * 0.82], [e1, 0, 0.5 - t1 * 0.82], [w1 * 0.97, 0, 0.5 - t1 * 0.82], tint);
      }
    }
  }
  // anal fin
  if (!sh.flat) {
    const z = 0.5 - 0.82 * 0.7;
    const bot = -H * profileAt(sh.profile, 0.7) * 0.95;
    tri2([0, bot, z], [0, bot - sh.h * 0.3, z - 0.05], [0, bot, z - 0.1]);
  }
  // pectoral fins (the skate's are its wings, part of the body)
  if (!sh.skate) {
    const big = sh.bigPecs ? 2 : 1;
    for (const s of [-1, 1]) {
      const z = 0.5 - 0.82 * 0.2;
      const w = sh.w * 0.5 * profileAt(sh.profile, 0.2);
      const y = sh.flat ? 0 : -sh.h * 0.18;
      tri2([s * w * 0.9, y, z], [s * (w + 0.07 * big), y - 0.03 * big, z - 0.09 * big], [s * w * 0.9, y, z - 0.08 * big]);
    }
  }
  // barbel
  if (sh.barbel) tri2([0, -sh.h * 0.3, 0.46], [0.004, -sh.h * 0.55, 0.44], [0, -sh.h * 0.3, 0.43]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function eyeGeometry(sh) {
  const g = new THREE.SphereGeometry(0.022, 8, 6);
  const geos = [];
  const z = 0.43;
  const k = profileAt(sh.profile, 0.08);
  if (sh.flat) {
    // both eyes on the top side
    for (const x of sh.skate ? [-0.05, 0.05] : [-0.035, 0.035]) {
      const e = g.clone();
      e.translate(x, sh.h * 0.5 * k + 0.012, z - 0.03);
      geos.push(e);
    }
  } else {
    for (const s of [-1, 1]) {
      const e = g.clone();
      e.translate(s * sh.w * 0.5 * k * 0.95, sh.h * 0.12, z - 0.02);
      geos.push(e);
    }
  }
  return geos;
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
  const sh = SHAPES[f.shape] || SHAPES.salmon;
  const uniforms = { uFlop: { value: 0.6 }, uFlopT: { value: 0 } };
  let base = cache.get(id);
  if (!base) {
    base = {
      body: bodyGeometry(sh),
      fins: finGeometry(sh, f.col.fin || f.col.back, f.col.finBars),
      eyes: eyeGeometry(sh),
      skin: skinTexture(id),
    };
    cache.set(id, base);
  }
  const group = new THREE.Group();
  const bodyMat = flopMaterial(new THREE.MeshStandardMaterial({ map: base.skin, roughness: 0.35, metalness: 0.25 }), uniforms);
  const finMat = flopMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), uniforms);
  const eyeMat = flopMaterial(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.4 }), uniforms);
  const body = new THREE.Mesh(base.body, bodyMat);
  const fins = new THREE.Mesh(base.fins, finMat);
  group.add(body, fins);
  for (const e of base.eyes) group.add(new THREE.Mesh(e, eyeMat));
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
