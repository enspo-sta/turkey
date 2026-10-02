// Procedurally generated textures: tileable noise, water normals, clouds and
// canvas-painted decals (hot rod flames, signs, flags).
import * as THREE from 'three';
import { mulberry32 } from './math.js';

// Tileable value-noise fbm sampler over a size x size image.
function tileableFbm(size, basePeriod, octaves, seed, gain = 0.5) {
  const rand = mulberry32(seed);
  const layers = [];
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    layers.push({ period, lat });
    period *= 2;
  }
  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (const L of layers) {
      const fx = (x / size) * L.period;
      const fy = (y / size) * L.period;
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      let tx = fx - i0;
      let ty = fy - j0;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const P = L.period;
      const a = L.lat[(j0 % P) * P + (i0 % P)];
      const b = L.lat[(j0 % P) * P + ((i0 + 1) % P)];
      const c = L.lat[((j0 + 1) % P) * P + (i0 % P)];
      const d = L.lat[((j0 + 1) % P) * P + ((i0 + 1) % P)];
      sum += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };
}

function dataTexture(data, size, { repeat = true, mipmaps = true, anisotropy = 4 } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mipmaps;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

// Ground detail: R = fine grain, G = blotches, B = streaks (for rock), mean ~0.5
export function makeDetailTexture(anisotropy) {
  const S = 512;
  const fine = tileableFbm(S, 32, 4, 7, 0.6);
  const blot = tileableFbm(S, 4, 5, 11, 0.55);
  const rand = mulberry32(99);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      let f = fine(x, y);
      if (rand() < 0.08) f += (rand() - 0.5) * 0.5; // speckles
      const b = blot(x, y);
      data[i] = Math.max(0, Math.min(255, (0.25 + f * 0.5 + (f - 0.5) * 0.6) * 255));
      data[i + 1] = Math.max(0, Math.min(255, b * 255));
      data[i + 2] = Math.max(0, Math.min(255, fine(x * 3, y * 0.3) * 255));
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, S, { anisotropy });
}

export function makeCloudTexture() {
  const S = 256;
  const n = tileableFbm(S, 4, 6, 3, 0.52);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const v = n(x, y);
      const v2 = n(x + 97, y + 41);
      data[i] = v * 255;
      data[i + 1] = v2 * 255;
      data[i + 2] = n(x * 2, y * 2) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, S, { anisotropy: 1 });
}

// Water normal map: RG = normal xz, B = foam noise
export function makeWaterNormalTexture() {
  const S = 512;
  const h = tileableFbm(S, 8, 6, 21, 0.5);
  const foam = tileableFbm(S, 16, 4, 5, 0.55);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = h(x, y);
  const data = new Uint8Array(S * S * 4);
  // the same slopes as at 256 texels: neighbours are half as far apart
  const k = 3.2 * (S / 256);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const hl = H[y * S + ((x - 1 + S) % S)];
      const hr = H[y * S + ((x + 1) % S)];
      const hu = H[((y - 1 + S) % S) * S + x];
      const hd = H[((y + 1) % S) * S + x];
      const nx = (hl - hr) * k;
      const nz = (hu - hd) * k;
      data[i] = Math.max(0, Math.min(255, (nx * 0.5 + 0.5) * 255));
      data[i + 1] = Math.max(0, Math.min(255, (nz * 0.5 + 0.5) * 255));
      data[i + 2] = foam(x, y) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, S, { anisotropy: 2 });
}

// Tileable caustics: sunlight refracted through a rippled surface and
// gathered on the bed below. Rays through a wave heightfield are splatted
// where they land, which draws the familiar network of bright lines.
// Returns the raw density (mean 1) for tests plus the texture (R = density/4).
export function makeCausticData(S = 256, seed = 17) {
  const rand = mulberry32(seed);
  const waves = [];
  for (let i = 0; i < 26; i++) {
    let n = 0;
    let m = 0;
    while (n === 0 && m === 0) {
      n = Math.round((rand() - 0.5) * 12);
      m = Math.round((rand() - 0.5) * 12);
    }
    const k = Math.hypot(n, m);
    waves.push({ n, m, a: 1 / Math.pow(k, 1.6), p: rand() * Math.PI * 2 });
  }
  const R = S * 2; // rays per axis
  const acc = new Float32Array(S * S);
  const TAU = Math.PI * 2;
  // focusing strength: displacement per unit slope, in tiles
  const focus = 0.0065;
  // cos(a + b) = cos a cos b - sin a sin b with a along u and b along v, so
  // each wave needs only per-row and per-column tables
  const NW = waves.length;
  const cu = new Float32Array(NW * R);
  const su = new Float32Array(NW * R);
  const cv = new Float32Array(NW * R);
  const sv = new Float32Array(NW * R);
  for (let w = 0; w < NW; w++) {
    const W = waves[w];
    for (let t = 0; t < R; t++) {
      const q = (t + 0.5) / R;
      cu[w * R + t] = Math.cos(TAU * W.n * q);
      su[w * R + t] = Math.sin(TAU * W.n * q);
      cv[w * R + t] = Math.cos(TAU * W.m * q + W.p);
      sv[w * R + t] = Math.sin(TAU * W.m * q + W.p);
    }
  }
  const kx = new Float32Array(NW);
  const ky = new Float32Array(NW);
  for (let w = 0; w < NW; w++) {
    kx[w] = waves[w].a * TAU * waves[w].n;
    ky[w] = waves[w].a * TAU * waves[w].m;
  }
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) / R;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) / R;
      let gx = 0;
      let gy = 0;
      for (let w = 0; w < NW; w++) {
        const c = cu[w * R + x] * cv[w * R + y] - su[w * R + x] * sv[w * R + y];
        gx += c * kx[w];
        gy += c * ky[w];
      }
      let px = (u - gx * focus) * S - 0.5;
      let py = (v - gy * focus) * S - 0.5;
      px = ((px % S) + S) % S;
      py = ((py % S) + S) % S;
      const i0 = Math.floor(px);
      const j0 = Math.floor(py);
      const tx = px - i0;
      const ty = py - j0;
      const i1 = (i0 + 1) % S;
      const j1 = (j0 + 1) % S;
      acc[j0 * S + i0] += (1 - tx) * (1 - ty);
      acc[j0 * S + i1] += tx * (1 - ty);
      acc[j1 * S + i0] += (1 - tx) * ty;
      acc[j1 * S + i1] += tx * ty;
    }
  }
  // soften the single-texel speckle, then normalise to mean 1
  const tmp = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      let s = acc[j * S + i] * 4;
      s += acc[j * S + ((i + 1) % S)] + acc[j * S + ((i - 1 + S) % S)];
      s += acc[((j + 1) % S) * S + i] + acc[((j - 1 + S) % S) * S + i];
      tmp[j * S + i] = s / 8;
    }
  }
  let mean = 0;
  for (let k = 0; k < S * S; k++) mean += tmp[k];
  mean /= S * S;
  for (let k = 0; k < S * S; k++) tmp[k] /= mean;
  return tmp;
}

export function makeCausticTexture() {
  const S = 256;
  const d = makeCausticData(S);
  const data = new Uint8Array(S * S * 4);
  for (let k = 0; k < S * S; k++) {
    const v = Math.max(0, Math.min(255, (d[k] / 4) * 255));
    data[k * 4] = v;
    data[k * 4 + 1] = v;
    data[k * 4 + 2] = v;
    data[k * 4 + 3] = 255;
  }
  return dataTexture(data, S, { anisotropy: 2 });
}

// Terrain material detail, four tiling height patterns (0..1):
//   R rock: bedding layers broken by cracks (projected on cliff faces)
//   G pebbles: rounded stones of varied tone with dark gaps (gravel, beds)
//   B sand and snow: soft wind ripples and grain
//   A forest floor: needles and moss
export function makeTerrainDetailData(S = 512) {
  const rand = mulberry32(4711);
  const data = new Uint8Array(S * S * 4);
  const f1 = tileableFbm(S, 8, 5, 101, 0.55);
  const f2 = tileableFbm(S, 16, 4, 202, 0.5);
  const f3 = tileableFbm(S, 64, 2, 303, 0.5);
  const f4 = tileableFbm(S, 4, 4, 404, 0.6);
  // pebbles: jittered toroidal grid of stones
  const C = 26;
  const cells = [];
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      const a = rand() * Math.PI;
      cells.push({ x: (i + 0.15 + rand() * 0.7) / C, y: (j + 0.15 + rand() * 0.7) / C, r: (0.5 + rand() * 0.45) / C, t: 0.35 + rand() * 0.65, e: 0.7 + rand() * 0.6, ca: Math.cos(a), sa: Math.sin(a) });
    }
  }
  const pebble = (u, v) => {
    const ci = Math.floor(u * C);
    const cj = Math.floor(v * C);
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + C) % C;
        const jj = (cj + dj + C) % C;
        const c = cells[jj * C + ii];
        let dx = u - c.x;
        let dy = v - c.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        // elongated, rotated stones
        const px = (dx * c.ca + dy * c.sa) / (c.r * c.e);
        const py = (-dx * c.sa + dy * c.ca) / (c.r / c.e);
        const d2 = px * px + py * py;
        if (d2 < 1) {
          const dome = Math.sqrt(1 - d2);
          const v2 = c.t * (0.55 + 0.45 * dome);
          if (v2 > best) best = v2;
        }
      }
    }
    return best;
  };
  // needles: short random strokes
  const needles = new Float32Array(S * S);
  const k = S / 512;
  for (let n = 0; n < 5200 * k * k; n++) {
    const x0 = rand() * S;
    const y0 = rand() * S;
    const a = rand() * Math.PI;
    const len = (4 + rand() * 9) * k;
    const tone = 0.4 + rand() * 0.6;
    for (let t = 0; t < len; t += 0.5) {
      const x = Math.floor(x0 + Math.cos(a) * t + S) % S;
      const y = Math.floor(y0 + Math.sin(a) * t + S) % S;
      needles[y * S + x] = Math.max(needles[y * S + x], tone);
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S;
      const v = y / S;
      const n2 = f2(x, y);
      const n3 = f3(x, y);
      // rock: horizontal beds (v is height on cliff faces) warped by noise
      const warp = f1(x, y) * 3.2;
      const bed = Math.sin((v * 7 + warp) * Math.PI * 2) * 0.5 + 0.5;
      const crack = Math.abs(f2(x * 2, y) - 0.5) * 2;
      const crackV = 1 - Math.min(1, Math.max(0, (crack - 0.015) / 0.09));
      let rock = 0.38 + bed * 0.24 + n2 * 0.32 - crackV * crackV * 0.22;
      rock += (n3 - 0.5) * 0.08;
      // pebbles with sand between
      const peb = pebble(u, v);
      const pebbles = peb > 0 ? peb : 0.12 + n3 * 0.12;
      // sand ripples
      const rip = Math.sin((u * 18 + f4(x, y) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const sand = 0.45 + rip * 0.25 + (n3 - 0.5) * 0.35;
      // forest floor: needles over dark humus with moss patches
      const moss = n2;
      const floor = Math.max(needles[y * S + x] * 0.85, 0.25 + moss * 0.35);
      data[i] = Math.max(0, Math.min(255, rock * 255));
      data[i + 1] = Math.max(0, Math.min(255, pebbles * 255));
      data[i + 2] = Math.max(0, Math.min(255, sand * 255));
      data[i + 3] = Math.max(0, Math.min(255, floor * 255));
    }
  }
  return data;
}

export function makeTerrainDetailTexture(anisotropy) {
  // 1024 texels: pebbles, rock beds and needles stay sharp up close on a
  // Retina screen
  const S = 1024;
  return dataTexture(makeTerrainDetailData(S), S, { anisotropy });
}

// ---- Canvas textures (browser only) ------------------------------------------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Hot rod body panel: candy paint with licking flames toward the rear (+u).
export function makeFlameTexture(base = '#8e0f14', flameA = '#ffd23a', flameB = '#ff5a1f') {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(base, 1.25));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, shade(base, 0.6));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rand = mulberry32(4);
  const drawFlames = (color, scale, offset) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H * 0.15);
    const tongues = 6;
    for (let i = 0; i < tongues; i++) {
      const y0 = H * (0.15 + (i / tongues) * 0.7);
      const y1 = H * (0.15 + ((i + 1) / tongues) * 0.7);
      const len = W * (0.35 + rand() * 0.45) * scale + offset;
      const ym = (y0 + y1) / 2 + (rand() - 0.5) * 20;
      g.bezierCurveTo(len * 0.4, y0 - 18, len * 0.8, ym - 30, len, ym - 6);
      g.bezierCurveTo(len * 0.7, ym + 8, len * 0.35, y1 - 4, 0 + 30 * scale, y1);
    }
    g.lineTo(0, H * 0.85);
    g.closePath();
    g.fill();
  };
  drawFlames(flameB, 1.0, 0);
  drawFlames(flameA, 0.72, -10);
  g.globalAlpha = 0.9;
  drawFlames('#fff3b0', 0.38, -20);
  g.globalAlpha = 1;
  // pinstripe outline feel
  g.strokeStyle = 'rgba(40,0,0,0.35)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, W - 4, H - 4);
  return canvasTexture(c);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f);
  const gg = Math.min(255, ((n >> 8) & 255) * f);
  const b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

// Painted wooden sign with a place name.
export function makeSignTexture(text, sub = '', opts = {}) {
  // as wide as the board is long (about 100 texels a metre, 512 to 1024
  // across) and in its shape (opts.aspect, width over height), so the
  // letters keep their own proportions on long boards and short ones; the
  // lettering is sized for a board 192 texels tall
  const aspect = opts.aspect || 512 / 192;
  const W = Math.round(Math.min(1024, Math.max(512, (opts.width || 0) * 100)));
  const H = Math.max(48, Math.round(W / aspect));
  const k = H / 192;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#5a3b22';
  g.fillRect(0, 0, W, H);
  const rand = mulberry32(text.length * 31 + 7);
  for (let i = 0; i < 38; i++) {
    g.strokeStyle = `rgba(${30 + rand() * 30},${18 + rand() * 18},${8},${0.25 + rand() * 0.3})`;
    g.lineWidth = (1 + rand() * 3) * k;
    g.beginPath();
    const y = rand() * H;
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rand() - 0.5) * 12 * k, W * 0.6, y + (rand() - 0.5) * 12 * k, W, y + (rand() - 0.5) * 8 * k);
    g.stroke();
  }
  g.strokeStyle = 'rgba(20,10,4,0.8)';
  g.lineWidth = 10 * k;
  g.strokeRect(5 * k, 5 * k, W - 10 * k, H - 10 * k);
  g.fillStyle = opts.fg || '#f3e3c0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 78 * k;
  const font = (px) => `800 ${Math.round(px)}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  g.font = font(size);
  while (g.measureText(text.toUpperCase()).width > W - 50 * k && size > 30 * k) {
    size -= 4 * k;
    g.font = font(size);
  }
  g.fillText(text.toUpperCase(), W / 2, sub ? H * 0.42 : H / 2);
  if (sub) {
    let ss = 34 * k;
    g.font = `600 ${Math.round(ss)}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    while (g.measureText(sub).width > W - 40 * k && ss > 14 * k) {
      ss -= 2 * k;
      g.font = `600 ${Math.round(ss)}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    }
    g.globalAlpha = 0.85;
    g.fillText(sub, W / 2, H * 0.76);
    g.globalAlpha = 1;
  }
  return canvasTexture(c);
}

// Alaska state flag: eight gold stars (Big Dipper + Polaris) on dark blue.
export function makeAlaskaFlagTexture() {
  const W = 256;
  const H = 160;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#0f204b';
  g.fillRect(0, 0, W, H);
  const star = (x, y, r) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#ffb612';
  const dipper = [
    [40, 128],
    [74, 118],
    [98, 100],
    [118, 86],
    [152, 90],
    [160, 58],
    [124, 52],
  ];
  for (const [x, y] of dipper) star(x, y, 8);
  star(214, 30, 12);
  return canvasTexture(c);
}

// Soft round sprite for particles.
export function makeSoftDotTexture() {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: false });
}
