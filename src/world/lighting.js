// Terrain lighting maps computed on the GPU and sampled by every material
// through the shared world shading (worldfx.js):
//   R: whether the sun (or the moon at night) clears the mountains, marched
//      over the heightfield toward the light and refreshed a band at a time
//      as the light moves;
//   G: how much open sky a spot sees (static), which darkens ambient light in
//      valleys, gullies and at the foot of cliffs.
// The maps cover a 6 km square: the playable terrain from its own height
// texture and the distant mountains from a coarse copy of the far terrain.
import * as THREE from 'three';
import { HALF } from './worldgen.js';
import { FX } from './worldfx.js';

const DOMAIN = 3000; // half size in metres

const quadVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const HEIGHT_FN = /* glsl */ `
uniform sampler2D uFine;
uniform sampler2D uMacro;
uniform vec4 uFineTf;
uniform vec3 uDomain;
float heightAt(vec2 xz) {
  vec2 fuv = (xz - uFineTf.xy) * uFineTf.z + uFineTf.w;
  if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) return texture2D(uFine, fuv).r;
  return texture2D(uMacro, clamp((xz - uDomain.xy) * uDomain.z, 0.0, 1.0)).r;
}
`;

const horizonFrag = /* glsl */ `
${HEIGHT_FN}
uniform vec3 uLight;
uniform sampler2D uSky;
varying vec2 vUv;
void main() {
  vec2 xz = uDomain.xy + vUv / uDomain.z;
  // start a couple of texels out: slopes right here are the lighting's job
  float h0 = heightAt(xz) + 2.0;
  vec2 dir = normalize(uLight.xz + vec2(1e-5, 0.0));
  float tanL = uLight.y / max(length(uLight.xz), 1e-4);
  float maxT = -10.0;
  float t = 11.0;
  for (int i = 0; i < 40; i++) {
    float hh = heightAt(xz + dir * t);
    maxT = max(maxT, (hh - h0) / t);
    t *= 1.16;
  }
  // soft edge a couple of degrees wide
  float vis = smoothstep(-0.03, 0.03, tanL - maxT);
  gl_FragColor = vec4(vis, texture2D(uSky, vUv).r, 0.0, 1.0);
}`;

const skyFrag = /* glsl */ `
${HEIGHT_FN}
varying vec2 vUv;
void main() {
  vec2 xz = uDomain.xy + vUv / uDomain.z;
  float h0 = heightAt(xz) + 0.6;
  float occ = 0.0;
  for (int d = 0; d < 12; d++) {
    float a = float(d) * 0.5235988 + 0.26;
    vec2 dir = vec2(cos(a), sin(a));
    float maxT = 0.0;
    float t = 3.5;
    for (int i = 0; i < 11; i++) {
      maxT = max(maxT, (heightAt(xz + dir * t) - h0) / t);
      t *= 1.75;
    }
    occ += maxT / sqrt(1.0 + maxT * maxT);
  }
  gl_FragColor = vec4(1.0 - occ / 12.0, 0.0, 0.0, 1.0);
}`;

// Coarse heights over the whole domain: the playable square from the world,
// outside it from the far terrain's grid.
function macroHeights(world, farGrid, size) {
  const { coords, H } = farGrid;
  const n = coords.length;
  const find = (v) => {
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (coords[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const data = new Uint16Array(size * size);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const step = (2 * DOMAIN) / size;
  const idx = new Int32Array(size);
  const frac = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const v = Math.min(Math.max(-DOMAIN + (i + 0.5) * step, coords[0]), coords[n - 1]);
    const k = find(v);
    idx[i] = k;
    frac[i] = (v - coords[k]) / (coords[k + 1] - coords[k]);
  }
  for (let j = 0; j < size; j++) {
    const z = -DOMAIN + (j + 0.5) * step;
    const j0 = idx[j];
    const tz = frac[j];
    for (let i = 0; i < size; i++) {
      const x = -DOMAIN + (i + 0.5) * step;
      let h;
      if (Math.abs(x) < HALF && Math.abs(z) < HALF) h = world.heightAt(x, z);
      else {
        const i0 = idx[i];
        const tx = frac[i];
        const a = H[j0 * n + i0];
        const b = H[j0 * n + i0 + 1];
        const c = H[(j0 + 1) * n + i0];
        const d = H[(j0 + 1) * n + i0 + 1];
        h = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
      }
      data[j * size + i] = toHalf(h);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Same heights as a plain array for queries on the CPU.
function macroArray(tex) {
  const src = tex.image.data;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = THREE.DataUtils.fromHalfFloat(src[i]);
  return out;
}

export class TerrainLighting {
  constructor(renderer, world, wtex, farGrid, size = 1024) {
    this.renderer = renderer;
    this.size = size;
    this.bands = 16;
    this.band = 0;
    this.ready = false;
    const macro = macroHeights(world, farGrid, 512);
    this.world = world;
    this.macro = macroArray(macro);
    this.macroSize = 512;
    const common = {
      uFine: { value: wtex.height },
      uMacro: { value: macro },
      uFineTf: { value: new THREE.Vector4(wtex.worldMin.x, wtex.worldMin.y, wtex.uvScale, wtex.uvOffset) },
      uDomain: { value: new THREE.Vector3(-DOMAIN, -DOMAIN, 1 / (2 * DOMAIN)) },
    };
    const target = (name) => {
      const rt = new THREE.WebGLRenderTarget(size, size, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
      });
      rt.texture.name = name;
      return rt;
    };
    this.skyRT = target('skyVisibility');
    this.shadeRT = target('terrainShade');
    this.uniforms = { ...common, uLight: { value: new THREE.Vector3(0, 1, 0) }, uSky: { value: this.skyRT.texture } };
    const quad = (frag, uniforms) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({ uniforms, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false })
      );
      m.frustumCulled = false;
      const s = new THREE.Scene();
      s.add(m);
      return s;
    };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.skyScene = quad(skyFrag, common);
    this.shadeScene = quad(horizonFrag, this.uniforms);

    // sky visibility never changes: render it once
    this.draw(this.skyScene, this.skyRT, null);
    FX.uFxShade.value = this.shadeRT.texture;
    FX.uFxShadeTf.value.set(-DOMAIN, -DOMAIN, 1 / (2 * DOMAIN));
  }

  draw(scene, rt, rows) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    if (rows) {
      rt.scissor.set(0, rows[0], this.size, rows[1] - rows[0]);
      rt.scissorTest = true;
    } else rt.scissorTest = false;
    r.setRenderTarget(rt);
    r.render(scene, this.camera);
    r.setRenderTarget(prev);
    rt.scissorTest = false;
  }

  // Refresh `count` bands of the mountain shadow map for light direction dir.
  update(dir, count = 1) {
    this.uniforms.uLight.value.copy(dir);
    const h = this.size / this.bands;
    for (let i = 0; i < count; i++) {
      this.draw(this.shadeScene, this.shadeRT, [this.band * h, (this.band + 1) * h]);
      this.band = (this.band + 1) % this.bands;
      if (this.band === 0) this.ready = true;
    }
    FX.uFxShadeOn.value = this.ready ? 1 : 0;
  }

  // Height for CPU queries: the world inside the playable square, the coarse
  // copy outside it.
  heightAt(x, z) {
    if (Math.abs(x) < HALF && Math.abs(z) < HALF) return this.world.heightAt(x, z);
    const S = this.macroSize;
    const fx = Math.min(S - 1.001, Math.max(0, ((x + DOMAIN) / (2 * DOMAIN)) * S - 0.5));
    const fz = Math.min(S - 1.001, Math.max(0, ((z + DOMAIN) / (2 * DOMAIN)) * S - 0.5));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const m = this.macro;
    const a = m[j * S + i];
    const b = m[j * S + i + 1];
    const c = m[(j + 1) * S + i];
    const d = m[(j + 1) * S + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // How much of the sun reaches point (x, y, z) past the mountains: the same
  // march as the GPU map, for things drawn outside the world (the rod and
  // hands in the first-person view).
  sunVisibility(x, y, z, dir) {
    const hl = Math.hypot(dir.x, dir.z);
    if (hl < 1e-4) return 1;
    const dx = dir.x / hl;
    const dz = dir.z / hl;
    const tanL = dir.y / hl;
    let maxT = -10;
    let t = 11;
    for (let i = 0; i < 40; i++) {
      maxT = Math.max(maxT, (this.heightAt(x + dx * t, z + dz * t) - y) / t);
      t *= 1.16;
    }
    const v = (tanL - maxT + 0.03) / 0.06;
    return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
  }

  // Redo the whole map now (after a jump in time of day).
  refresh(dir) {
    this.band = 0;
    this.update(dir, this.bands);
  }
}
