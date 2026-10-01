// Procedural Alaska: builds the heightfield, surface classification, colours,
// vegetation densities and water queries from the hand-authored layout.
// Pure JS (no three.js) so it can run in Node for the map preview tool.
import { Noise2D } from '../util/noise.js';
import { Path2D } from '../util/spline.js';
import { clamp, lerp, smoothstep, smin, smax } from '../util/math.js';
import {
  RIVER_POINTS,
  RIVER_LEVELS,
  RIVER_WIDTHS,
  COAST_POINTS,
  LAKES,
  GLACIER_POINTS,
  MASSIFS,
  ROADS,
  PLACES,
  GEYSER,
} from './layout.js';

export const SIZE = 2400;
export const HALF = SIZE / 2;
export const CELLS = 768;
export const CS = SIZE / CELLS; // 3.125 m
export const N = CELLS + 1;
export const ROAD_HALF = 3.6;

// hero landforms beyond the playable square (metres)
export const VOLCANO = { x: -3600, z: 3600, r: 2800, h: 2100, crater: 260 };
export const MASSIF = { x: 600, z: -4200, r: 2200, h: 2600 };

export const SURF = {
  GRASS: 0,
  FOREST: 1,
  ROCK: 2,
  SNOW: 3,
  SAND: 4,
  GRAVEL: 5,
  TUNDRA: 6,
  ICE: 7,
  MUD: 8,
  ROAD: 9,
};

// sRGB palette (0..1) for the ground.
const C = {
  grassA: [0.49, 0.6, 0.27],
  grassB: [0.36, 0.52, 0.23],
  grassC: [0.58, 0.6, 0.3],
  forest: [0.25, 0.34, 0.17],
  tundraA: [0.55, 0.53, 0.32],
  tundraB: [0.62, 0.4, 0.24],
  rock: [0.47, 0.46, 0.44],
  rockDark: [0.33, 0.32, 0.31],
  snow: [0.93, 0.95, 0.97],
  sand: [0.78, 0.72, 0.56],
  gravel: [0.6, 0.58, 0.53],
  road: [0.55, 0.49, 0.39],
  ice: [0.8, 0.9, 0.96],
  iceBlue: [0.55, 0.78, 0.9],
  mud: [0.4, 0.36, 0.28],
  seabed: [0.45, 0.42, 0.33],
  fireweed: [0.62, 0.3, 0.48],
  // the springs: white sinter, and orange and ochre mats where the hot
  // water runs off
  sinter: [0.86, 0.84, 0.77],
  mats: [0.76, 0.42, 0.14],
  ochre: [0.7, 0.55, 0.26],
  // the muskeg: moss and the red of sphagnum
  muskeg: [0.5, 0.53, 0.26],
  sphagnum: [0.52, 0.27, 0.2],
  bogpool: [0.2, 0.2, 0.12],
};

function mix3(out, c, t) {
  out[0] += (c[0] - out[0]) * t;
  out[1] += (c[1] - out[1]) * t;
  out[2] += (c[2] - out[2]) * t;
}

export class World {
  constructor(seed = 1337) {
    this.seed = seed;
    this.n1 = new Noise2D(seed);
    this.n2 = new Noise2D(seed * 7 + 3);
    this.n3 = new Noise2D(seed * 13 + 5);
    const nn = N * N;
    this.h = new Float32Array(nn);
    this.riverD = new Float32Array(nn);
    this.riverS = new Float32Array(nn);
    this.coastD = new Float32Array(nn);
    this.glacD = new Float32Array(nn);
    this.glacS = new Float32Array(nn);
    this.roadD = new Float32Array(nn);
    this.roadH = new Float32Array(nn);
    this.roadI = new Uint8Array(nn);
    this.surf = new Uint8Array(nn);
    this.color = new Uint8Array(nn * 3);
    this.forest = new Uint8Array(nn);
    this.grass = new Uint8Array(nn);
    this.flower = new Uint8Array(nn);
    this.ice = new Uint8Array(nn);
  }

  // Runs every generation step. `progress(fraction, label)` is optional.
  async build(progress = () => {}, yieldFn = null) {
    const step = async (f, label) => {
      progress(f, label);
      if (yieldFn) await yieldFn();
    };
    await step(0.02, 'Tracing the river');
    this.setupPaths();
    await step(0.08, 'Carving the coastline');
    this.computeCoast();
    await step(0.16, 'Following the river');
    this.rasterize(this.river, 270, this.riverD, this.riverS);
    this.rasterize(this.glacier, 220, this.glacD, this.glacS);
    await step(0.26, 'Raising mountains');
    this.computeHeights();
    await step(0.52, 'Grading the roads');
    this.buildRoads();
    await step(0.62, 'Painting the land');
    this.classify();
    await step(0.72, 'World ready');
  }

  setupPaths() {
    this.river = new Path2D(RIVER_POINTS, 5);
    this.glacier = new Path2D(GLACIER_POINTS, 6);
    this.coast = new Path2D(COAST_POINTS, 10);

    // Lakes: irregular shoreline radius table
    this.lakes = LAKES.map((l) => {
      const n = new Noise2D(l.seed);
      const table = new Float32Array(256);
      for (let a = 0; a < 256; a++) {
        const ang = (a / 256) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sz = Math.sin(ang);
        table[a] =
          l.r *
          (1 +
            0.2 * n.fbm(cx * 1.3 + 5, sz * 1.3 + 5, 3) +
            0.08 * Math.sin(3 * ang + l.seed) +
            0.05 * Math.sin(7 * ang + l.seed * 2));
      }
      return { ...l, table, levelCfg: l.level };
    });
    this.lakeById = Object.fromEntries(this.lakes.map((l) => [l.id, l]));

    // River keyframes -> distance along the path
    const keyS = (at) => this.river.nearest(at[0], at[1]).s;
    this.riverLevelKeys = RIVER_LEVELS.map((k) => ({ s: keyS(k.at), level: k.level, falls: k.falls || 0 })).sort(
      (a, b) => a.s - b.s
    );
    this.riverLevelKeys[0].s = 0;
    this.riverWidthKeys = RIVER_WIDTHS.map((k) => ({ s: keyS(k.at), w: k.w })).sort((a, b) => a.s - b.s);
    const fallsKey = this.riverLevelKeys.find((k) => k.falls > 0);
    this.fallsS = fallsKey ? fallsKey.s : -1;
    this.fallsDrop = fallsKey ? fallsKey.falls : 0;
  }

  lakeRadius(lake, ang) {
    let a = (ang / (Math.PI * 2)) * 256;
    a = ((a % 256) + 256) % 256;
    const i = Math.floor(a);
    const t = a - i;
    return lake.table[i] * (1 - t) + lake.table[(i + 1) & 255] * t;
  }

  // Signed distance to lake shore: negative inside.
  lakeSD(lake, x, z) {
    const dx = x - lake.x;
    const dz = z - lake.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    return d - this.lakeRadius(lake, Math.atan2(dz, dx));
  }

  riverLevel(s) {
    const K = this.riverLevelKeys;
    if (s <= K[0].s) return K[0].level;
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i];
      const b = K[i + 1];
      if (s <= b.s) {
        const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
        return lerp(a.level - a.falls, b.level, t);
      }
    }
    return K[K.length - 1].level;
  }

  riverWidth(s) {
    const K = this.riverWidthKeys;
    let w;
    if (s <= K[0].s) w = K[0].w;
    else if (s >= K[K.length - 1].s) w = K[K.length - 1].w;
    else {
      for (let i = 0; i < K.length - 1; i++) {
        if (s <= K[i + 1].s) {
          w = lerp(K[i].w, K[i + 1].w, (s - K[i].s) / Math.max(1e-6, K[i + 1].s - K[i].s));
          break;
        }
      }
    }
    // plunge pool below the falls
    if (this.fallsS > 0) {
      const u = s - this.fallsS;
      if (u > -2 && u < 60) w += 7 * Math.sin((clamp(u, 0, 60) / 60) * Math.PI) + (u > 0 && u < 8 ? 2 : 0);
    }
    return w;
  }

  riverDepth(s) {
    let d = 1.3 + this.riverWidth(s) * 0.11;
    if (this.fallsS > 0) {
      const u = s - this.fallsS;
      if (u > 0 && u < 50) d += 2.5 * Math.sin((u / 50) * Math.PI);
    }
    return d;
  }

  // 0..1 how gorge-like the valley is (around Bear Falls)
  gorge(s) {
    if (this.fallsS < 0) return 0;
    const u = s - this.fallsS;
    return smoothstep(-110, -50, u) * (1 - smoothstep(40, 110, u));
  }

  // Slope of the river surface (m per m), used for rapids foam
  riverGradient(s) {
    return Math.abs(this.riverLevel(s + 4) - this.riverLevel(s - 4)) / 8;
  }

  // Coastline signed distance on a coarse grid, then bilinear upsampling.
  computeCoast() {
    const G = 193; // 12.5 m
    const gs = SIZE / (G - 1);
    const coarse = new Float32Array(G * G);
    const P = this.coast;
    for (let j = 0; j < G; j++) {
      const pz = -HALF + j * gs;
      for (let i = 0; i < G; i++) {
        const px = -HALF + i * gs;
        coarse[j * G + i] = this.coastSDBrute(px, pz, P);
      }
    }
    this.coastCoarse = coarse;
    this.coastG = G;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CS;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CS;
        this.coastD[j * N + i] = this.coastAt(x, z);
      }
    }
  }

  coastSDBrute(px, pz, P = this.coast) {
    let best = Infinity;
    let sign = 1;
    for (let k = 0; k < P.count - 1; k++) {
      const ax = P.x[k];
      const az = P.z[k];
      const abx = P.x[k + 1] - ax;
      const abz = P.z[k + 1] - az;
      const len2 = abx * abx + abz * abz || 1e-9;
      let t = ((px - ax) * abx + (pz - az) * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + abx * t - px;
      const dz = az + abz * t - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        const cross = abx * (pz - az) - abz * (px - ax);
        sign = cross < 0 ? 1 : -1;
      }
    }
    return Math.sqrt(best) * sign;
  }

  // Signed distance to the coast (+ inland), with irregular noise.
  coastAt(x, z) {
    let v;
    const G = this.coastG;
    const gs = SIZE / (G - 1);
    const fx = (x + HALF) / gs;
    const fz = (z + HALF) / gs;
    if (fx >= 0 && fz >= 0 && fx <= G - 1 && fz <= G - 1) {
      const i = Math.min(G - 2, Math.floor(fx));
      const j = Math.min(G - 2, Math.floor(fz));
      const tx = fx - i;
      const tz = fz - j;
      const c = this.coastCoarse;
      const a = c[j * G + i] * (1 - tx) + c[j * G + i + 1] * tx;
      const b = c[(j + 1) * G + i] * (1 - tx) + c[(j + 1) * G + i + 1] * tx;
      v = a * (1 - tz) + b * tz;
    } else {
      v = this.coastSDBrute(x, z);
    }
    return v + this.n3.fbm(x * 0.006 + 40, z * 0.006 - 20, 3) * 26;
  }

  // Rasterize distance-to-path into grid arrays (distance, path distance).
  rasterize(path, radius, distArr, sArr) {
    distArr.fill(1e10);
    for (let k = 0; k < path.count - 1; k++) {
      const ax = path.x[k];
      const az = path.z[k];
      const bx = path.x[k + 1];
      const bz = path.z[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius + HALF) / CS));
      const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + radius + HALF) / CS));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - radius + HALF) / CS));
      const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + radius + HALF) / CS));
      if (i0 > i1 || j0 > j1) continue;
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz || 1e-9;
      const sa = path.s[k];
      const sb = path.s[k + 1];
      const r2 = radius * radius;
      for (let j = j0; j <= j1; j++) {
        const pz = -HALF + j * CS;
        const row = j * N;
        for (let i = i0; i <= i1; i++) {
          const px = -HALF + i * CS;
          let t = ((px - ax) * abx + (pz - az) * abz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = ax + abx * t - px;
          const dz = az + abz * t - pz;
          const d2 = dx * dx + dz * dz;
          const idx = row + i;
          if (d2 < distArr[idx] && d2 < r2) {
            distArr[idx] = d2;
            sArr[idx] = sa + (sb - sa) * t;
          }
        }
      }
    }
    for (let i = 0; i < distArr.length; i++) distArr[i] = Math.sqrt(distArr[i]);
  }

  // Natural (uncarved) terrain elevation.
  baseElevation(x, z, csd) {
    const n1 = this.n1;
    const n2 = this.n2;
    const n3 = this.n3;
    const land = smoothstep(-30, 80, csd);
    let e;
    if (csd >= 0) e = 0.9 + 27 * (1 - Math.exp(-csd / 460)) + 1.4 * smoothstep(0, 30, csd);
    else e = 0.9 + Math.max(-36, csd * 0.075);

    e += 52 * smoothstep(-80, -880, z) * land;
    const tundra = smoothstep(330, 650, x) * smoothstep(-160, -430, z);
    e += 58 * tundra * land;

    const hills = n1.fbm(x * 0.0024, z * 0.0024, 4);
    e += land * (hills * 19 + 4) * (0.3 + 0.7 * smoothstep(0, 420, csd));

    for (let k = 0; k < MASSIFS.length; k++) {
      const m = MASSIFS[k];
      const dx = x - m.x;
      const dz = z - m.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < m.r) {
        // a rounded dome (steepest half way up, not at the top) with
        // softer, wider ridges: a few degrees gentler than before
        const f = 1 - d / m.r;
        const r = n2.ridged(x * 0.0026 + k * 17.1, z * 0.0026 - k * 9.3, 5, 2.1, 0.42);
        e += m.h * f * f * (3 - 2 * f) * (0.52 + 0.75 * r) * land;
      }
    }

    const mN = smoothstep(-790, -1150, z);
    const mW = smoothstep(-820, -1150, x);
    const mE = smoothstep(840, 1160, x);
    const mS = smoothstep(880, 1180, z) * smoothstep(260, 520, x);
    const m = Math.max(mN, mW, mE, mS) * land;
    if (m > 0.001) {
      const r = n2.ridged(x * 0.0017 + 3.3, z * 0.0017 + 1.7, 5, 2.1, 0.42);
      e += m * (110 + 330 * r * (0.45 + 0.55 * m));
    }

    e += land * n3.fbm(x * 0.012, z * 0.012, 3) * 3.0;
    e += land * n1.noise(x * 0.07, z * 0.07) * 0.45;
    return e;
  }

  // Terrain outside the playable square (distant mountains, far shore).
  farHeight(x, z) {
    const csd = this.coastSDBrute(x, z) + this.n3.fbm(x * 0.006 + 40, z * 0.006 - 20, 3) * 26;
    let e = this.baseElevation(x, z, csd);
    // mountains ring grows beyond the edge
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const land = smoothstep(-30, 80, csd);
    if (edge > HALF) {
      // ridged ranges, less busy in the fine detail, grouped into higher and
      // lower massifs so the skyline has a rhythm instead of even teeth
      const r = this.n2.ridged(x * 0.00085 + 7.7, z * 0.00085 + 2.2, 5, 2.05, 0.4);
      const big = 0.55 + 0.8 * (this.n3.noise(x * 0.00035 + 3.3, z * 0.00035 - 8.1) * 0.5 + 0.5);
      e += land * smoothstep(HALF + 150, HALF + 1100, edge) * (100 + 680 * r * big);
    }
    // far shore across the bay (south-west)
    const across = (-x + z) * 0.7071;
    if (across > 2300) {
      const f = smoothstep(2300, 3300, across);
      const r = this.n1.ridged(x * 0.0008 - 3.1, z * 0.0008 + 5.2, 5, 2.05, 0.4);
      const mtn = -8 + 180 * f + 820 * r * f;
      e = Math.max(e, lerp(e, mtn, f));
    }
    // a volcano across the bay: a broad cone scored by gullies, with a
    // crater at the summit
    const V = VOLCANO;
    const vd = Math.hypot(x - V.x, z - V.z);
    if (vd < V.r) {
      const u = 1 - vd / V.r;
      const ang = Math.atan2(z - V.z, x - V.x);
      const gully = 1 - 0.1 * Math.abs(Math.sin(ang * 9 + this.n1.noise(x * 0.0017, z * 0.0017) * 2.5)) * smoothstep(0.05, 0.6, 1 - u);
      let h = V.h * Math.pow(u, 1.55) * gully;
      // inside the rim the ground drops into the crater
      if (vd < V.crater) h = V.h * Math.pow(1 - V.crater / V.r, 1.55) - Math.pow(1 - vd / V.crater, 1.5) * 110;
      e = Math.max(e, h + this.n2.noise(x * 0.004, z * 0.004) * 18 * u);
    }
    // the great glaciated massif on the northern skyline
    const M = MASSIF;
    const md = Math.hypot(x - M.x, z - M.z);
    if (md < M.r) {
      const u = 1 - md / M.r;
      const r = this.n2.ridged(x * 0.0011 + 31, z * 0.0011 - 17, 5, 2.05, 0.45);
      // broad shoulders and a summit dome that hold snow, steep in between
      e = Math.max(e, M.h * u * u * (3 - 2 * u) * (0.86 + 0.2 * r));
    }
    return e;
  }

  glacierSurface(s) {
    const L = this.glacier.length;
    const u = clamp(s / L, 0, 1); // 0 at top (north), 1 at the lake
    const lakeL = this.lakeById.glacier.level;
    return lerp(330, lakeL + 24, Math.pow(u, 0.8));
  }

  glacierHalfWidth(s) {
    const u = clamp(s / this.glacier.length, 0, 1);
    return lerp(95, 62, u);
  }

  computeHeights() {
    const h = this.h;
    // 1) natural terrain
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CS;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CS;
        const k = j * N + i;
        h[k] = this.baseElevation(x, z, this.coastD[k]);
      }
    }

    // 2) auto-level lakes against the natural terrain on their shore ring
    for (const lake of this.lakes) {
      const samples = [];
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const r = this.lakeRadius(lake, ang) + 30;
        const x = lake.x + Math.cos(ang) * r;
        const z = lake.z + Math.sin(ang) * r;
        samples.push(this.sampleGrid(h, x, z));
      }
      samples.sort((a, b) => a - b);
      const low = samples[Math.floor(samples.length * 0.15)];
      lake.level = clamp(low - 1.5, lake.levelCfg - 6, lake.levelCfg + 8);
    }
    // the river leaves Glacier Lake at its level
    const gl = this.lakeById.glacier;
    this.riverLevelKeys[0].level = gl.level;
    if (this.riverLevelKeys[1].level > gl.level - 6) this.riverLevelKeys[1].level = gl.level - 6;

    // 3) river valley and channel, glacier, lakes
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CS;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CS;
        const k = j * N + i;
        let e = h[k];
        const csd = this.coastD[k];

        // glacier valley
        const gd = this.glacD[k];
        if (gd < 220) {
          const gs = this.glacS[k];
          const surf = this.glacierSurface(gs);
          const hw = this.glacierHalfWidth(gs);
          const over = Math.max(0, gd - hw);
          const valley = surf + 3 + over * 0.85 + over * over * 0.004;
          e = smin(e, valley, 12);
          if (gd < hw + 6) {
            const u = clamp(gd / hw, 0, 1);
            const crev = Math.abs(this.n1.noise(x * 0.045, z * 0.012)) * 1.6;
            const ice = surf + 6 * (1 - u * u) - crev;
            if (gd < hw) {
              e = ice;
              this.ice[k] = 1;
            } else {
              e = Math.min(e, lerp(ice, e, (gd - hw) / 6));
            }
          }
        }

        // river
        const rd = this.riverD[k];
        if (rd < 270) {
          const s = this.riverS[k];
          const ws = this.riverLevel(s);
          const w = this.riverWidth(s);
          const dp = this.riverDepth(s);
          const g = this.gorge(s);
          const onLand = smoothstep(-40, 10, csd);
          const over = Math.max(0, rd - w - 3);
          const valley = ws + 1.1 + over * lerp(0.15, 1.6, g) + over * over * lerp(0.0022, 0.004, g);
          e = lerp(e, smin(e, valley, 8), onLand);
          if (rd > w + 2 && rd < w + 60 && csd > 10) {
            e = smax(e, ws + 0.55 + (rd - w - 2) * 0.035, 1.2);
          }
          if (rd <= w) {
            const u = rd / w;
            const bed = ws - 0.25 - dp * (1 - u * u) + this.n3.noise(x * 0.08, z * 0.08) * 0.25;
            e = csd > 10 ? bed : Math.min(e, bed);
          } else if (rd < w + 4) {
            const u = (rd - w) / 4;
            const bank = lerp(ws - 0.25, ws + 1.1, u * u * (3 - 2 * u));
            e = Math.min(e, bank);
          }
        }

        // lakes. Only the nearest lake shapes a cell's shore: a small pool's
        // rim must not fill in the bed of a bigger lake next to it
        let sdNear = Infinity;
        for (let li = 0; li < this.lakes.length; li++) {
          const lake = this.lakes[li];
          const dx = x - lake.x;
          const dz = z - lake.z;
          if (dx * dx + dz * dz > (lake.r * 1.5 + 170) ** 2) continue;
          sdNear = Math.min(sdNear, this.lakeSD(lake, x, z));
        }
        for (let li = 0; li < this.lakes.length; li++) {
          const lake = this.lakes[li];
          const dx = x - lake.x;
          const dz = z - lake.z;
          if (dx * dx + dz * dz > (lake.r * 1.5 + 170) ** 2) continue;
          const sd = this.lakeSD(lake, x, z);
          const L = lake.level;
          if (sd >= 0 && sd > sdNear) continue;
          if (sd < 0) {
            const rr = this.lakeRadius(lake, Math.atan2(dz, dx));
            const u = smoothstep(0, rr * 0.75, -sd);
            const bed = L - 0.35 - lake.depth * Math.pow(u, 0.85) + this.n3.noise(x * 0.05, z * 0.05) * 0.6;
            e = this.ice[k] ? Math.min(e, bed) : bed;
          } else if (sd < 170 && !this.ice[k]) {
            const target = L + 0.4 + sd * 0.055;
            const kk = smoothstep(0, 65, sd);
            const raised = smax(e, target, 2);
            const fade = 1 - smoothstep(110, 170, sd);
            e = lerp(e, lerp(target, raised, kk), fade);
          }
        }

        // keep inland ground above the sea
        if (csd > 25 && rd > 60) e = Math.max(e, 0.8 + (csd - 25) * 0.01);
        h[k] = e;
      }
    }
  }

  sampleGrid(arr, x, z) {
    const fx = clamp((x + HALF) / CS, 0, CELLS - 1e-4);
    const fz = clamp((z + HALF) / CS, 0, CELLS - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const k = j * N + i;
    const a = arr[k] * (1 - tx) + arr[k + 1] * tx;
    const b = arr[k + N] * (1 - tx) + arr[k + N + 1] * tx;
    return a * (1 - tz) + b * tz;
  }

  buildRoads() {
    this.roads = [];
    this.bridges = [];
    this.roadD.fill(1e10);
    for (let ri = 0; ri < ROADS.length; ri++) {
      const def = ROADS[ri];
      const path = new Path2D(def.points, 4);
      const count = path.count;
      const raw = new Float32Array(count);
      const water = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        const x = path.x[i];
        const z = path.z[i];
        raw[i] = this.sampleGrid(this.h, x, z);
        const k = this.cellIndex(x, z);
        const rd = this.riverD[k];
        const w = this.riverWidth(this.riverS[k]);
        if (rd < w + 7) water[i] = 1;
      }
      // smooth elevation profile
      let prof = raw;
      for (let pass = 0; pass < 3; pass++) {
        const out = new Float32Array(count);
        const R = 7;
        for (let i = 0; i < count; i++) {
          let sum = 0;
          let wsum = 0;
          for (let o = -R; o <= R; o++) {
            const idx = clamp(i + o, 0, count - 1);
            const wt = 1 - Math.abs(o) / (R + 1);
            sum += prof[idx] * wt;
            wsum += wt;
          }
          out[i] = sum / wsum;
        }
        prof = out;
      }
      // bridges over the river
      const bridgeSpans = [];
      let i = 0;
      while (i < count) {
        if (water[i]) {
          let a = i;
          while (i < count && water[i]) i++;
          let b = i - 1;
          a = Math.max(0, a - 2);
          b = Math.min(count - 1, b + 2);
          const mid = Math.floor((a + b) / 2);
          const k = this.cellIndex(path.x[mid], path.z[mid]);
          const deck = this.riverLevel(this.riverS[k]) + 3.4;
          bridgeSpans.push({ a, b, deck });
        } else i++;
      }
      for (const span of bridgeSpans) {
        const ramp = 14; // samples (56 m)
        for (let q = Math.max(0, span.a - ramp); q <= Math.min(count - 1, span.b + ramp); q++) {
          let t = 1;
          if (q < span.a) t = 1 - (span.a - q) / ramp;
          else if (q > span.b) t = 1 - (q - span.b) / ramp;
          t = t * t * (3 - 2 * t);
          prof[q] = lerp(prof[q], Math.max(prof[q], span.deck), t);
          if (q >= span.a && q <= span.b) prof[q] = span.deck;
        }
        const a = path.sample(path.s[span.a]);
        const b = path.sample(path.s[span.b]);
        this.bridges.push({
          road: def.id,
          x0: a.x,
          z0: a.z,
          x1: b.x,
          z1: b.z,
          deck: span.deck,
          sa: path.s[span.a],
          sb: path.s[span.b],
        });
      }
      const bridgeMask = new Uint8Array(count);
      for (const span of bridgeSpans) for (let q = span.a; q <= span.b; q++) bridgeMask[q] = 1;
      this.roads.push({ id: def.id, name: def.name, path, elev: prof, bridgeMask });
    }

    // rasterize road corridor with elevation
    const radius = 20;
    for (let ri = 0; ri < this.roads.length; ri++) {
      const road = this.roads[ri];
      const P = road.path;
      for (let k = 0; k < P.count - 1; k++) {
        const ax = P.x[k];
        const az = P.z[k];
        const bx = P.x[k + 1];
        const bz = P.z[k + 1];
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius + HALF) / CS));
        const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + radius + HALF) / CS));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - radius + HALF) / CS));
        const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + radius + HALF) / CS));
        const abx = bx - ax;
        const abz = bz - az;
        const len2 = abx * abx + abz * abz || 1e-9;
        const ea = road.elev[k];
        const eb = road.elev[k + 1];
        const bridge = road.bridgeMask[k] && road.bridgeMask[k + 1];
        for (let j = j0; j <= j1; j++) {
          const pz = -HALF + j * CS;
          for (let i = i0; i <= i1; i++) {
            const px = -HALF + i * CS;
            let t = ((px - ax) * abx + (pz - az) * abz) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = ax + abx * t - px;
            const dz = az + abz * t - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            const idx = j * N + i;
            if (d < this.roadD[idx]) {
              this.roadD[idx] = d;
              this.roadH[idx] = ea + (eb - ea) * t;
              this.roadI[idx] = bridge ? 128 + ri : ri;
            }
          }
        }
      }
    }
    // flatten terrain along roads (not under bridge spans over water)
    const h = this.h;
    for (let idx = 0; idx < h.length; idx++) {
      const d = this.roadD[idx];
      if (d > radius) continue;
      const onBridge = this.roadI[idx] >= 128;
      if (onBridge) {
        const w = this.riverWidth(this.riverS[idx]);
        if (this.riverD[idx] < w + 6) continue;
      }
      const k = 1 - smoothstep(ROAD_HALF + 0.6, ROAD_HALF + 11, d);
      h[idx] = lerp(h[idx], this.roadH[idx] - 0.06, k);
    }
  }

  cellIndex(x, z) {
    const i = clamp(Math.round((x + HALF) / CS), 0, N - 1);
    const j = clamp(Math.round((z + HALF) / CS), 0, N - 1);
    return j * N + i;
  }

  // Surface type, colours and vegetation densities.
  classify() {
    const h = this.h;
    const col = [0, 0, 0];
    const placeClear = PLACES.map((p) => ({ x: p.x, z: p.z, r: p.kind === 'service' ? 55 : 32 }));
    const glacHW = (s) => this.glacierHalfWidth(s);
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CS;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CS;
        const k = j * N + i;
        const e = h[k];
        const ie = Math.min(i + 1, N - 1);
        const iw = Math.max(i - 1, 0);
        const jn = Math.max(j - 1, 0);
        const js = Math.min(j + 1, N - 1);
        const dhx = (h[j * N + ie] - h[j * N + iw]) / ((ie - iw) * CS);
        const dhz = (h[js * N + i] - h[jn * N + i]) / ((js - jn) * CS);
        const slope = Math.sqrt(dhx * dhx + dhz * dhz);
        const curv = (h[j * N + ie] + h[j * N + iw] + h[js * N + i] + h[jn * N + i]) * 0.25 - e;

        const csd = this.coastD[k];
        const rd = this.riverD[k];
        const rs = this.riverS[k];
        const rw = rd < 300 ? this.riverWidth(rs) : 20;
        const rlevel = rd < 300 ? this.riverLevel(rs) : -100;
        const roadD = this.roadD[k];

        const nA = this.n1.noise(x * 0.018, z * 0.018);
        const nB = this.n2.noise(x * 0.05 + 9, z * 0.05 - 4);
        const nC = this.n3.fbm(x * 0.0045 - 30, z * 0.0045 + 12, 3);

        // the forest climbs to about 150 m on the mountains, but the raised
        // plateau of Caribou Tundra keeps its open tundra above about 112 m
        const plateau = smoothstep(330, 650, x) * smoothstep(-160, -430, z);
        const treeline = lerp(150 + nC * 25, 112 + nC * 22, plateau);
        const snowline = 240 + nA * 40;

        // underwater?
        let waterLevel = -1e9;
        if (e < 0.05 && csd < 200) waterLevel = 0;
        if (rd < rw + 3 && e < rlevel) waterLevel = Math.max(waterLevel, rlevel);
        let lakeSDmin = 1e9;
        let geo = 0;
        let bog = 0;
        for (const lake of this.lakes) {
          const dx = x - lake.x;
          const dz = z - lake.z;
          if (dx * dx + dz * dz > (lake.r * 1.5 + 200) ** 2) continue;
          const sd = this.lakeSD(lake, x, z);
          lakeSDmin = Math.min(lakeSDmin, sd);
          if (sd < 2 && e < lake.level) waterLevel = Math.max(waterLevel, lake.level);
          if (lake.warm || lake.hot) geo = Math.max(geo, 1 - smoothstep(3, lake.hot ? 24 : 34, sd));
          if (lake.bog) bog = Math.max(bog, 1 - smoothstep(18, 140, sd));
        }
        {
          const gd = Math.hypot(x - GEYSER.x, z - GEYSER.z);
          if (gd < 40) geo = Math.max(geo, 1 - smoothstep(6, 38, gd));
        }
        const under = e < waterLevel - 0.02;

        // forest density
        let forest = smoothstep(-0.28, 0.22, this.n2.fbm(x * 0.0036 + 100, z * 0.0036, 3) + 0.12);
        forest *= 1 - smoothstep(treeline - lerp(30, 25, plateau), treeline + lerp(5, 2, plateau), e);
        forest *= 1 - smoothstep(0.62, 0.95, slope);
        forest *= smoothstep(rw + 5, rw + 16, rd);
        forest *= smoothstep(8, 26, lakeSDmin);
        // nothing grows on the hot ground; only stunted black spruce in the bog
        forest *= (1 - geo) * (1 - bog * 0.72);
        forest *= smoothstep(30, 80, csd);
        forest *= smoothstep(9, 18, roadD);
        for (let q = 0; q < placeClear.length; q++) {
          const p = placeClear[q];
          const dx = x - p.x;
          const dz = z - p.z;
          const r2 = p.r * 2;
          if (dx > r2 || dx < -r2 || dz > r2 || dz < -r2) continue;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < r2) forest *= smoothstep(p.r, r2, d);
        }
        const glacNear = this.glacD[k] < 200 ? this.glacD[k] - glacHW(this.glacS[k]) : 1e9;
        if (this.ice[k] || glacNear < 30) forest = 0;

        // colour
        const gsel = nA * 0.5 + 0.5;
        col[0] = C.grassA[0];
        col[1] = C.grassA[1];
        col[2] = C.grassA[2];
        mix3(col, C.grassB, clamp(gsel, 0, 1) * 0.8);
        mix3(col, C.grassC, clamp(nB * 0.5, 0, 1) * 0.6);
        mix3(col, C.forest, forest * 0.85);
        const tundraF = smoothstep(treeline - 20, treeline + 25, e);
        if (tundraF > 0) {
          const t2 = [C.tundraA[0], C.tundraA[1], C.tundraA[2]];
          mix3(t2, C.tundraB, clamp(nB * 0.7 + 0.3, 0, 1) * 0.55);
          mix3(col, t2, tundraF);
        }
        const rockF = smoothstep(0.5, 0.95, slope) + (e > snowline - 60 ? smoothstep(0.35, 0.7, slope) * 0.5 : 0);
        const rockC = [C.rock[0], C.rock[1], C.rock[2]];
        mix3(rockC, C.rockDark, clamp(nB * 0.6 + 0.4, 0, 1));
        mix3(col, rockC, clamp(rockF, 0, 1));
        const snowF = smoothstep(snowline - 25, snowline + 25, e) * (1 - smoothstep(0.9, 1.5, slope));
        mix3(col, C.snow, snowF);
        const sandF = (1 - smoothstep(10, 36, csd)) * (1 - smoothstep(2.5, 6, e));
        mix3(col, C.sand, sandF);
        const gravelF = 1 - smoothstep(rw + 1, rw + 8, rd);
        if (rd < 300) mix3(col, C.gravel, gravelF * 0.9);
        const lakeShoreF = 1 - smoothstep(0, 7, lakeSDmin);
        if (lakeSDmin < 20) mix3(col, C.gravel, lakeShoreF * 0.7);
        if (bog > 0 && !under) {
          // moss with red patches of sphagnum and tea-dark puddles
          const mc = [C.muskeg[0], C.muskeg[1], C.muskeg[2]];
          mix3(mc, C.sphagnum, smoothstep(0.25, 0.5, nB) * 0.45);
          mix3(mc, C.bogpool, smoothstep(0.42, 0.52, nA) * 0.6);
          mix3(col, mc, bog * 0.75);
        }
        if (geo > 0 && !under) {
          // sinter crust with bands of orange and ochre where the runoff flows
          const sc = [C.sinter[0], C.sinter[1], C.sinter[2]];
          const band = Math.abs(Math.sin((x * 0.11 + z * 0.07) + nB * 3));
          mix3(sc, C.mats, smoothstep(0.55, 0.85, band) * 0.85);
          mix3(sc, C.ochre, smoothstep(0.2, 0.5, nA) * 0.4);
          mix3(col, sc, geo * 0.9);
        }
        const roadF = 1 - smoothstep(ROAD_HALF - 0.5, ROAD_HALF + 2.5, roadD);
        mix3(col, C.road, roadF);
        const shoulder = (1 - smoothstep(ROAD_HALF + 1, ROAD_HALF + 5, roadD)) * (1 - roadF);
        mix3(col, C.gravel, shoulder * 0.5);
        if (this.ice[k]) {
          const ib = [C.ice[0], C.ice[1], C.ice[2]];
          mix3(ib, C.iceBlue, clamp(Math.abs(this.n1.noise(x * 0.045, z * 0.012)) * 1.2, 0, 1));
          col[0] = ib[0];
          col[1] = ib[1];
          col[2] = ib[2];
        } else if (glacNear < 14) {
          mix3(col, C.gravel, 0.8); // lateral moraine
        }
        if (under) {
          const depth = waterLevel - e;
          const bed = waterLevel === 0 ? C.seabed : C.mud;
          mix3(col, bed, clamp(0.5 + depth * 0.15, 0, 1));
        }
        // fireweed tint in meadows
        let flower = 0;
        if (!under && tundraF < 0.6 && rockF < 0.3 && roadF < 0.1 && sandF < 0.3) {
          const fn = this.n1.fbm(x * 0.011 + 55, z * 0.011 - 71, 3);
          flower = smoothstep(0.18, 0.42, fn) * (1 - forest) * (1 - gravelF);
          const roadside = smoothstep(ROAD_HALF + 3, ROAD_HALF + 6, roadD) * (1 - smoothstep(12, 20, roadD));
          flower = Math.max(flower, roadside * smoothstep(-0.2, 0.3, fn) * 0.9);
          for (let q = 0; q < placeClear.length; q++) {
            const p = placeClear[q];
            const dx = x - p.x;
            const dz = z - p.z;
            const rr = p.r * 0.6;
            if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < rr) flower *= d / rr;
          }
          mix3(col, C.fireweed, flower * 0.35);
        }
        // concavity shading
        const ao = clamp(curv * 0.09, -0.12, 0.14);
        const shade = 1 - ao;
        this.color[k * 3] = clamp(col[0] * shade * 255, 0, 255);
        this.color[k * 3 + 1] = clamp(col[1] * shade * 255, 0, 255);
        this.color[k * 3 + 2] = clamp(col[2] * shade * 255, 0, 255);

        // surface type
        let st = SURF.GRASS;
        if (forest > 0.5) st = SURF.FOREST;
        if (tundraF > 0.5) st = SURF.TUNDRA;
        if (gravelF > 0.5 || lakeShoreF > 0.6 || shoulder > 0.6 || geo > 0.5) st = SURF.GRAVEL;
        if (sandF > 0.5) st = SURF.SAND;
        if (rockF > 0.6) st = SURF.ROCK;
        if (snowF > 0.5) st = SURF.SNOW;
        if (roadF > 0.5) st = SURF.ROAD;
        if (this.ice[k]) st = SURF.ICE;
        if (under) st = SURF.MUD;
        this.surf[k] = st;

        this.forest[k] = clamp(forest * 255, 0, 255);
        let grass = 0;
        if (st === SURF.GRASS) grass = 0.75 + 0.25 * gsel;
        else if (st === SURF.FOREST) grass = 0.25;
        else if (st === SURF.TUNDRA) grass = 0.45;
        else if (st === SURF.GRAVEL) grass = 0.08;
        if (roadD < ROAD_HALF + 1.2) grass = 0;
        this.grass[k] = clamp(grass * 255, 0, 255);
        this.flower[k] = clamp(flower * 255, 0, 255);
      }
    }
  }

  // ---- Runtime queries -------------------------------------------------

  // Height matching the rendered terrain triangles.
  heightAt(x, z) {
    let fx = (x + HALF) / CS;
    let fz = (z + HALF) / CS;
    if (fx < 0) fx = 0;
    if (fz < 0) fz = 0;
    if (fx > CELLS - 1e-4) fx = CELLS - 1e-4;
    if (fz > CELLS - 1e-4) fz = CELLS - 1e-4;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const k = j * N + i;
    const h = this.h;
    if (tx + tz <= 1) {
      return h[k] + (h[k + 1] - h[k]) * tx + (h[k + N] - h[k]) * tz;
    }
    const h11 = h[k + N + 1];
    return h11 + (h[k + N] - h11) * (1 - tx) + (h[k + 1] - h11) * (1 - tz);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 1.6;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx;
    const ny = 2 * e;
    const nz = -hz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    out.x = nx / l;
    out.y = ny / l;
    out.z = nz / l;
    return out;
  }

  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return Math.sqrt(1 - n.y * n.y) / Math.max(n.y, 0.05);
  }

  surfaceAt(x, z) {
    return this.surf[this.cellIndex(x, z)];
  }

  inBounds(x, z, margin = 0) {
    return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin;
  }

  // Water surface at (x,z) if any: { level, depth, kind, flowX, flowZ }
  waterAt(x, z) {
    const ground = this.heightAt(x, z);
    let best = null;
    for (const lake of this.lakes) {
      const dx = x - lake.x;
      const dz = z - lake.z;
      if (dx * dx + dz * dz > (lake.r * 1.6) ** 2) continue;
      if (this.lakeSD(lake, x, z) < 3 && ground < lake.level) {
        best = { level: lake.level, depth: lake.level - ground, kind: lake.id, flowX: 0, flowZ: 0 };
      }
    }
    if (!best && this.inBounds(x, z)) {
      const k = this.cellIndex(x, z);
      const rd = this.riverD[k];
      if (rd < 60 && this.coastD[k] > -6) {
        const s = this.riverS[k];
        const w = this.riverWidth(s);
        const lvl = this.riverLevel(s);
        if (rd < w + 3 && ground < lvl) {
          const p = this.river.sample(s);
          const speed = 0.6 + this.riverGradient(s) * 25;
          best = { level: lvl, depth: lvl - ground, kind: 'river', s, flowX: p.tx * speed, flowZ: p.tz * speed };
        }
      }
    }
    if (!best && ground < 0) {
      const k = this.inBounds(x, z) ? this.cellIndex(x, z) : -1;
      const csd = k >= 0 ? this.coastD[k] : -100;
      if (csd < 300) best = { level: 0, depth: -ground, kind: 'ocean', flowX: 0, flowZ: 0 };
    }
    return best;
  }

  place(id) {
    return this.places.find((p) => p.id === id);
  }

  coastGradient(x, z) {
    const e = 6;
    const gx = this.coastAt(x + e, z) - this.coastAt(x - e, z);
    const gz = this.coastAt(x, z + e) - this.coastAt(x, z - e);
    const l = Math.sqrt(gx * gx + gz * gz) || 1;
    return { x: gx / l, z: gz / l }; // points inland
  }

  // Resolves standing positions, facing and docks for the named places.
  finalizePlaces() {
    const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
    this.places = PLACES.map((src) => {
      const p = { ...src };
      if (p.kind === 'fishing' && p.water === 'river') {
        const near = this.river.nearest(p.x, p.z);
        const c = this.river.sample(near.s);
        let dx = p.x - c.x;
        let dz = p.z - c.z;
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= l;
        dz /= l;
        const w = this.riverWidth(near.s);
        const d = w + 5.5;
        p.x = c.x + dx * d;
        p.z = c.z + dz * d;
        p.face = yawTo(-dx, -dz);
        p.riverS = near.s;
        p.waterX = c.x;
        p.waterZ = c.z;
      } else if (p.kind === 'fishing' && this.lakeById[p.water]) {
        const lake = this.lakeById[p.water];
        let dx = p.x - lake.x;
        let dz = p.z - lake.z;
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= l;
        dz /= l;
        const r = this.lakeRadius(lake, Math.atan2(dz, dx));
        p.face = yawTo(-dx, -dz);
        p.waterX = lake.x + dx * (r - 30);
        p.waterZ = lake.z + dz * (r - 30);
        if (p.water === 'moose' || p.water === 'slough') {
          // wooden dock (at the flats, the end of the boardwalk) reaching into the lake
          const x0 = lake.x + dx * (r + 5);
          const z0 = lake.z + dz * (r + 5);
          const x1 = lake.x + dx * (r - 16);
          const z1 = lake.z + dz * (r - 16);
          p.dock = { x0, z0, x1, z1, width: 2.6, top: lake.level + 0.75 };
          p.x = lake.x + dx * (r - 13);
          p.z = lake.z + dz * (r - 13);
        } else {
          p.x = lake.x + dx * (r + 4.5);
          p.z = lake.z + dz * (r + 4.5);
        }
      } else if (p.kind === 'fishing' && p.water === 'ocean' && p.wreck) {
        // a beach: stand at the waterline, the wreck aground offshore
        const g = this.coastGradient(p.x, p.z);
        let bx = p.x;
        let bz = p.z;
        for (let i = 0; i < 40; i++) {
          const c = this.coastAt(bx, bz);
          if (Math.abs(c - 4) < 0.6) break;
          bx += g.x * (4 - c) * 0.8;
          bz += g.z * (4 - c) * 0.8;
        }
        // she ran in bow first and swung a little on the falling tide; she
        // sits on the bottom, bow up a little
        const wx = bx - g.x * 24;
        const wz = bz - g.z * 24;
        const yaw = Math.atan2(g.x, g.z) + 0.35;
        const pitch = 0.05;
        const deckTop = Math.min(this.heightAt(wx, wz), -0.6) - 0.35 + 4.12;
        p.wreckAt = { x: wx, z: wz, yaw, pitch, deckTop };
        // the gangplank, the parking bay and the signs stay on the beach
        p.beachX = bx;
        p.beachZ = bz;
        p.parkX = bx;
        p.parkZ = bz;
        // fish off her stern, out over open water and clear of the hull
        const sl = -10.2;
        p.x = wx + Math.sin(yaw) * sl;
        p.z = wz + Math.cos(yaw) * sl;
        p.standY = deckTop + sl * pitch;
        p.face = yaw;
        p.waterX = p.x - Math.sin(yaw) * 30;
        p.waterZ = p.z - Math.cos(yaw) * 30;
      } else if (p.kind === 'fishing' && p.water === 'ocean') {
        // pier from the beach out to deep water
        const g = this.coastGradient(p.x, p.z);
        let bx = p.x;
        let bz = p.z;
        for (let i = 0; i < 40; i++) {
          const c = this.coastAt(bx, bz);
          if (Math.abs(c - 14) < 1) break;
          bx += g.x * (14 - c) * 0.8;
          bz += g.z * (14 - c) * 0.8;
        }
        const len = 78;
        const x1 = bx - g.x * len;
        const z1 = bz - g.z * len;
        p.dock = { x0: bx, z0: bz, x1, z1, width: 4.2, top: 3.2, pier: true };
        p.x = bx - g.x * (len - 4);
        p.z = bz - g.z * (len - 4);
        p.face = yawTo(-g.x, -g.z);
        p.waterX = bx - g.x * (len + 30);
        p.waterZ = bz - g.z * (len + 30);
      }
      p.y = p.dock ? p.dock.top : p.standY ?? this.heightAt(p.x, p.z);
      return p;
    });
  }
}

export async function generateWorld(seed = 1337, progress, yieldFn) {
  const w = new World(seed);
  await w.build(progress, yieldFn);
  w.finalizePlaces();
  return w;
}
