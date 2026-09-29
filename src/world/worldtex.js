// GPU copies of world data for shaders: terrain height (half float), ground
// colour and a mask texture (R grass, G fireweed, B ocean allowed, A forest).
import * as THREE from 'three';
import { N, HALF, SIZE, CS } from './worldgen.js';

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

  return {
    height,
    ground: groundTex,
    mask: maskTex,
    // uv = (xz - worldMin) * uvScale + uvOffset hits texel centres exactly
    worldMin: new THREE.Vector2(-HALF, -HALF),
    worldSize: SIZE,
    uvScale: 1 / (CS * N),
    uvOffset: 0.5 / N,
  };
}
