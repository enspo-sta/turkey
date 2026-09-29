// Small math helpers shared by every system. Pure functions, no three.js dependency.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Frame-rate independent exponential approach of a towards b.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const angleDiff = (a, b) => wrapAngle(b - a);
export const dampAngle = (a, b, rate, dt) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));

export function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

// Deterministic PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of two ints to [0,1).
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const rand = Math.random;
export const randRange = (a, b, r = Math.random) => a + (b - a) * r();
export const randInt = (a, b, r = Math.random) => Math.floor(a + (b - a + 1) * r());
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];

export function weightedPick(items, weightFn, r = Math.random) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  if (total <= 0) return null;
  let x = r() * total;
  for (const it of items) {
    x -= Math.max(0, weightFn(it));
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

// Gaussian-ish random in [-1,1] (sum of uniforms).
export const randNormal = (r = Math.random) => (r() + r() + r() - 1.5) / 1.5;

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Distance from point p to segment ab in 2D. Returns {d, t}.
export function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}

export function formatMoney(v) {
  const n = Math.round(v);
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatTime(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
