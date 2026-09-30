// GPU copies of world data for shaders: terrain height (half float), ground
// colour, a mask texture (R grass, G fireweed, B ocean allowed, A forest) and
// the water texture (R surface level, G lake, B glacial, A ocean weights).
import * as THREE from 'three';
import { N, HALF, SIZE, CS } from './worldgen.js';
import { smoothstep } from '../util/math.js';

const DRY = -1000;

// Water surface level and water kind at every grid vertex, matching
// World.waterAt. Levels spread a few cells past the shore so filtering never
// blends a surface level with "no water"; kind weights are blurred so colours
// change gradually where the river meets a lake or the sea.
function makeWaterTexture(world) {
  const nn = N * N;
  const level = new Float32Array(nn).fill(DRY);
  const wet = new Uint8Array(nn);
  const wLake = new Float32Array(nn);
  const wGlac = new Float32Array(nn);
  const wSea = new Float32Array(nn);
  const W = world;
  let maxLevel = -1e4;
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CS;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * CS;
      const k = j * N + i;
      const ground = W.h[k];
      let lvl = null;
      let kind = 0;
      for (const lake of W.lakes) {
        const dx = x - lake.x;
        const dz = z - lake.z;
        if (dx * dx + dz * dz > (lake.r * 1.6) ** 2) continue;
        if (ground < lake.level && W.lakeSD(lake, x, z) < 3) {
          lvl = lake.level;
          kind = lake.tint === 'glacial' ? 2 : 1;
        }
      }
      if (lvl === null) {
        const rd = W.riverD[k];
        if (rd < 60 && W.coastD[k] > -6) {
          const s = W.riverS[k];
          const lv = W.riverLevel(s);
          if (rd < W.riverWidth(s) + 3 && ground < lv) {
            lvl = lv;
            kind = 0;
            // glacial silt fades out down the upper river
            wGlac[k] = 0.75 * (1 - smoothstep(0, 420, s));
            // brackish near the mouth
            wSea[k] = 0.6 * smoothstep(40, -6, W.coastD[k]);
          }
        }
      }
      if (lvl === null && ground < 0 && W.coastD[k] < 300) {
        lvl = 0;
        kind = 3;
      }
      if (lvl === null) continue;
      level[k] = lvl;
      wet[k] = 1;
      if (kind === 1) wLake[k] = 1;
      else if (kind === 2) wGlac[k] = 1;
      else if (kind === 3) wSea[k] = 1;
      if (lvl > maxLevel) maxLevel = lvl;
    }
  }

  // blur the kind weights over wet cells
  const blur = (arr) => {
    const out = new Float32Array(nn);
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (!wet[k]) continue;
          let s = 0;
          let c = 0;
          for (let dj = -2; dj <= 2; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= N) continue;
            for (let di = -2; di <= 2; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= N) continue;
              const q = jj * N + ii;
              if (!wet[q]) continue;
              s += arr[q];
              c++;
            }
          }
          out[k] = s / c;
        }
      }
      arr.set(out);
    }
  };
  blur(wLake);
  blur(wGlac);
  blur(wSea);

  // spread levels and weights three cells past the shore, keeping the lowest
  // neighbouring level so cliffs beside falls are never flooded
  let front = wet;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(nn);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        if (level[k] !== DRY) continue;
        let lo = Infinity;
        let a = 0;
        let b = 0;
        let c = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const q = k + dj * N + di;
            if (!front[q]) continue;
            if (level[q] < lo) lo = level[q];
            a += wLake[q];
            b += wGlac[q];
            c += wSea[q];
            n++;
          }
        }
        if (!n) continue;
        next[k] = 1;
        level[k] = lo;
        wLake[k] = a / n;
        wGlac[k] = b / n;
        wSea[k] = c / n;
      }
    }
    front = next;
  }

  const data = new Uint16Array(nn * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < nn; k++) {
    data[k * 4] = toHalf(level[k]);
    data[k * 4 + 1] = toHalf(wLake[k]);
    data[k * 4 + 2] = toHalf(wGlac[k]);
    data[k * 4 + 3] = toHalf(wSea[k]);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { texture: tex, maxLevel: maxLevel + 0.5 };
}

export function makeWorldTextures(world) {
  const nn = N * N;
  const half = new Uint16Array(nn);
  for (let i = 0; i < nn; i++) half[i] = THREE.DataUtils.toHalfFloat(world.h[i]);
  const height = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType);
  height.magFilter = THREE.LinearFilter;
  height.minFilter = THREE.LinearFilter;
  height.wrapS = height.wrapT = THREE.ClampToEdgeWrapping;
  height.generateMipmaps = false;
  height.needsUpdate = true;

  const ground = new Uint8Array(nn * 4);
  const mask = new Uint8Array(nn * 4);
  for (let i = 0; i < nn; i++) {
    ground[i * 4] = world.color[i * 3];
    ground[i * 4 + 1] = world.color[i * 3 + 1];
    ground[i * 4 + 2] = world.color[i * 3 + 2];
    ground[i * 4 + 3] = 255;
    mask[i * 4] = world.grass[i];
    mask[i * 4 + 1] = world.flower[i];
    mask[i * 4 + 2] = world.coastD[i] < -8 ? 255 : 0;
    mask[i * 4 + 3] = world.forest[i];
  }
  const groundTex = new THREE.DataTexture(ground, N, N, THREE.RGBAFormat);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.magFilter = THREE.LinearFilter;
  groundTex.minFilter = THREE.LinearFilter;
  groundTex.generateMipmaps = false;
  groundTex.needsUpdate = true;

  const maskTex = new THREE.DataTexture(mask, N, N, THREE.RGBAFormat);
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.generateMipmaps = false;
  maskTex.needsUpdate = true;

  const water = makeWaterTexture(world);

  return {
    height,
    ground: groundTex,
    mask: maskTex,
    water: water.texture,
    waterMax: water.maxLevel,
    // uv = (xz - worldMin) * uvScale + uvOffset hits texel centres exactly
    worldMin: new THREE.Vector2(-HALF, -HALF),
    worldSize: SIZE,
    uvScale: 1 / (CS * N),
    uvOffset: 0.5 / N,
  };
}
