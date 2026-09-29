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
  const S = 256;
  const fine = tileableFbm(S, 32, 3, 7, 0.6);
  const blot = tileableFbm(S, 4, 4, 11, 0.55);
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
  const S = 256;
  const h = tileableFbm(S, 8, 5, 21, 0.5);
  const foam = tileableFbm(S, 16, 3, 5, 0.55);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = h(x, y);
  const data = new Uint8Array(S * S * 4);
  const k = 3.2;
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
  const W = 512;
  const H = 192;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#5a3b22';
  g.fillRect(0, 0, W, H);
  const rand = mulberry32(text.length * 31 + 7);
  for (let i = 0; i < 38; i++) {
    g.strokeStyle = `rgba(${30 + rand() * 30},${18 + rand() * 18},${8},${0.25 + rand() * 0.3})`;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    const y = rand() * H;
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rand() - 0.5) * 12, W * 0.6, y + (rand() - 0.5) * 12, W, y + (rand() - 0.5) * 8);
    g.stroke();
  }
  g.strokeStyle = 'rgba(20,10,4,0.8)';
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.fillStyle = opts.fg || '#f3e3c0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 78;
  g.font = `800 ${size}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  while (g.measureText(text.toUpperCase()).width > W - 50 && size > 30) {
    size -= 4;
    g.font = `800 ${size}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  }
  g.fillText(text.toUpperCase(), W / 2, sub ? H * 0.42 : H / 2);
  if (sub) {
    g.font = `600 34px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
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
