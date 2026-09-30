// Water: ocean plane, river ribbon (with the Bear Falls drop) and lakes.
// The surface only adds what the eye sees ON the water: fresnel reflections of
// the real surroundings (a cube map captured around the camera), sun glints
// and foam. What is seen THROUGH the water (the bed, rocks, fish) is drawn by
// the objects themselves with light absorption along the refracted ray (see
// worldfx.js), so shallow gravel shows clearly and deep pools turn green-blue.
import * as THREE from 'three';
import { smoothstep, clamp, mulberry32 } from '../util/math.js';
import { FX } from './worldfx.js';

export const REFLECT_LAYER = 2;

const _probePos = new THREE.Vector3();

// Flat disc (y = 0) of rings spaced more widely with distance: small
// triangles near the middle keep interpolated world positions exact up close,
// where one huge triangle would lose metres of precision.
function ringedDisc(radius, first = 1, grow = 1.45, segments = 64) {
  const radii = [0];
  for (let r = first; r < radius; r *= grow) radii.push(r);
  radii.push(radius);
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
    }
  }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let i = 1; i < radii.length - 1; i++) {
    const a0 = 1 + (i - 1) * segments;
    const b0 = 1 + i * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const _dir = new THREE.Vector3();

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec2 flowUv;
attribute float foam;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vFoam;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vFlow = flowUv;
  vFoam = foam;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSunLight;
uniform vec3 uLightDir;
uniform float uRiver;
uniform float uOcean;
uniform float uFlowSpeed;
uniform float uRain;
uniform float uNight;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uWaves;
uniform sampler2D uFoamTex;
uniform samplerCube uRefl;
uniform float uReflOn;
uniform vec2 uWorldMin;
uniform float uUvScale;
uniform float uUvOffset;
uniform float uFarEdge;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vFoam;

vec2 waveSlope(vec2 uv) {
  return texture2D(uWaves, uv).rg * 2.0 - 1.0;
}

void main() {
  vec2 tuv = (vWorld.xz - uWorldMin) * uUvScale + uUvOffset;
  bool inside = tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0;
  if (uOcean > 0.5 && inside && texture2D(uMask, tuv).b < 0.5) discard;
  float ground = inside ? texture2D(uHeight, tuv).r : -40.0;
  float depth = vWorld.y - ground;
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;

  // --- waves: the animated wave texture at three scales -------------------
  vec2 slope;
  float crest;
  if (uRiver > 0.5) {
    // flow-aligned: vFlow = (metres across, metres along the river)
    float sp = uFlowSpeed * (1.0 + vFoam * 1.5);
    vec2 f1 = vec2(vFlow.x, vFlow.y - uTime * sp * 1.3) / 5.5;
    vec2 f2 = vec2(vFlow.x * 1.3 + 0.37, vFlow.y * 0.8 - uTime * sp * 2.1) / 2.1;
    vec2 f3 = vec2(vFlow.x + 0.71, vFlow.y - uTime * sp * 0.8) / 13.0;
    slope = waveSlope(f1) * 0.55 + waveSlope(f2) * 0.45 + waveSlope(f3) * 0.35;
    crest = texture2D(uWaves, f2).b;
    // riffles over the rapids
    slope *= 1.0 + vFoam * 1.6;
  } else {
    vec2 p = vWorld.xz;
    vec2 q = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8);
    float big = uOcean > 0.5 ? 1.0 : 0.55;
    slope = waveSlope(p / 7.0) * 0.5 + waveSlope(q / 2.3 + 0.37) * 0.38 + waveSlope(q.yx / 23.0 + 0.11) * 0.5 * big;
    crest = texture2D(uWaves, q / 2.3 + 0.37).b;
    // calm and wind-roughened patches drifting over lakes
    float gust = texture2D(uFoamTex, p * 0.0045 + vec2(uTime * 0.004, uTime * 0.0023)).g;
    slope *= mix(0.45, 1.25, smoothstep(0.3, 0.7, gust)) * (uOcean > 0.5 ? 1.25 : 1.0);
  }
  slope *= 1.0 + uRain * 0.9;
  // flatten toward the far distance, where the reflection is blurred instead
  float farK = 1.0 / (1.0 + dist * 0.004);
  vec3 n = normalize(vec3(-slope.x * farK, 1.0, -slope.y * farK));

  // --- reflection -----------------------------------------------------------
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  R.y = max(R.y, 0.015);
  R = normalize(R);
  float lod = clamp(log2(1.0 + dist * 0.035) + uRain * 2.0 + vFoam * 1.5, 0.0, 6.0) * mix(0.35, 1.0, smoothstep(0.0, 0.2, R.y));
  vec3 refl = uReflOn > 0.5 ? textureLod(uRefl, R, lod).rgb : fxSkyColor(R) * mix(1.0, 0.8, R.y);

  // --- sun glints: a sharp highlight plus a glitter path toward the sun ---
  vec2 sh = fxShade(vWorld);
  float rs = max(dot(R, uLightDir), 0.0);
  float sharp = pow(rs, mix(2600.0, 700.0, clamp(dist / 400.0, 0.0, 1.0))) * 90.0;
  float sparkle = smoothstep(0.62, 0.9, crest);
  float glitter = pow(rs, 160.0) * sparkle * 14.0 + pow(rs, 26.0) * 0.12;
  float lit = mix(sh.r, 1.0, uNight) * smoothstep(0.0, 0.08, uLightDir.y);
  vec3 spec = uSunLight * (sharp + glitter) * lit * (1.0 - uRain * 0.8);

  // --- foam: rapids, the plunge pool and lapping at the shore --------------
  float fn = texture2D(uFoamTex, (uRiver > 0.5 ? vFlow * vec2(0.23, 0.11) - vec2(0.0, uTime * uFlowSpeed * 0.11) : vWorld.xz * 0.19 + uTime * 0.01)).b;
  float fn2 = texture2D(uFoamTex, (uRiver > 0.5 ? vFlow * vec2(0.51, 0.27) - vec2(0.0, uTime * uFlowSpeed * 0.2) : vWorld.xz * 0.41 - uTime * 0.013)).b;
  // a thin, broken line of foam that creeps up and back at the waterline
  float lap = 0.5 + 0.5 * sin(uTime * 1.1 - depth * 18.0 + fn * 6.0);
  float shore = (1.0 - smoothstep(0.0, 0.07 + lap * 0.07, depth)) * step(0.0, depth);
  float fnoise = fn * 0.6 + fn2 * 0.5 + crest * 0.25;
  float foamAmt = shore * 0.55 * smoothstep(0.6, 0.82, fnoise);
  foamAmt = max(foamAmt, vFoam * smoothstep(0.35 - vFoam * 0.3, 0.75, fnoise + vFoam * 0.3));
  foamAmt = clamp(foamAmt, 0.0, 1.0);
  vec3 foamCol = uFxWaterLight * vec3(0.92, 0.96, 0.98) * 0.9;

  // --- combine (premultiplied) --------------------------------------------
  float opaque = (!inside && max(abs(vWorld.x), abs(vWorld.z)) > uFarEdge) ? 1.0 : 0.0;
  vec4 wl = fxWaterAt(vWorld.xz);
  vec3 body = fxWaterDeep(wl) * uFxWaterLight;
  // the edge fades so the waterline never draws a hard seam
  float edge = smoothstep(0.0, 0.06, depth);
  float a = fres * edge;
  vec3 c = refl;
  if (opaque > 0.5) {
    c = mix(body, refl, fres);
    a = 1.0;
  }
  c = mix(c, foamCol, foamAmt);
  a = max(a, foamAmt * 0.92 * edge);
  // haze toward the horizon
  float haze = fxHaze(vWorld);
  c = mix(c, fxSkyColor(-V), haze);
  spec *= 1.0 - haze;
  #ifdef TONE_MAPPING
    c = toneMapping(c);
    spec = toneMapping(spec);
  #endif
  c = linearToOutputTexel(vec4(c, 1.0)).rgb;
  spec = linearToOutputTexel(vec4(spec, 1.0)).rgb;
  gl_FragColor = vec4(c * a + spec, a);
}`;

// Animated wave slopes: a sum of travelling waves with deep-water dispersion
// (longer waves move faster) rendered into a small tiling texture every
// frame. RG = surface slope, B = height (crests), sampled at several scales.
class WaveTexture {
  constructor(size = 256) {
    const TILE = 8; // metres per tile at scale 1
    const rand = mulberry32(911);
    const waves = [];
    const wind = 0.35; // radians
    while (waves.length < 40) {
      const n = Math.round((rand() - 0.5) * 30);
      const m = Math.round((rand() - 0.5) * 30);
      const k = Math.hypot(n, m);
      if (k < 1.5 || k > 15) continue;
      const along = Math.cos(Math.atan2(m, n) - wind);
      if (rand() > 0.25 + 0.75 * along * along) continue;
      const kw = (2 * Math.PI * k) / TILE;
      waves.push({ n, m, a: 1 / Math.pow(k, 1.9), w: Math.sqrt(9.81 * kw), p: rand() * Math.PI * 2 });
    }
    // normalise so the slope has an RMS of about 0.2 and heights span 0..1
    let s2 = 0;
    let h2 = 0;
    for (const W of waves) {
      const kw = 2 * Math.PI * Math.hypot(W.n, W.m);
      s2 += (W.a * kw) ** 2 / 2;
      h2 += W.a ** 2 / 2;
    }
    const sk = 0.2 / Math.sqrt(s2);
    this.uniforms = {
      uTime: { value: 0 },
      uWave: { value: waves.map((W) => new THREE.Vector4(W.n * 2 * Math.PI, W.m * 2 * Math.PI, W.a * sk, W.p)) },
      uOmega: { value: waves.map((W) => W.w) },
      uHScale: { value: 0.5 / (2.2 * Math.sqrt(h2) * sk) },
    };
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearMipmapLinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.rt.texture.anisotropy = 4;
    this.rt.texture.name = 'waves';
    const count = waves.length;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        #define COUNT ${count}
        uniform float uTime;
        uniform vec4 uWave[COUNT];
        uniform float uOmega[COUNT];
        uniform float uHScale;
        varying vec2 vUv;
        void main() {
          float h = 0.0;
          vec2 s = vec2(0.0);
          for (int i = 0; i < COUNT; i++) {
            vec4 w = uWave[i];
            float ph = dot(w.xy, vUv) - uOmega[i] * uTime + w.w;
            h += w.z * cos(ph);
            s -= w.z * sin(ph) * w.xy;
          }
          // slopes per metre of an 8 m tile
          s *= 0.125;
          gl_FragColor = vec4(clamp(s * 0.5 + 0.5, 0.0, 1.0), clamp(h * uHScale + 0.5, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.material = mat;
  }

  get texture() {
    return this.rt.texture;
  }

  render(renderer, time) {
    this.uniforms.uTime.value = time;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}

// Cube map of the surroundings captured at the camera for water reflections.
// One face is refreshed per frame (the downward face is never needed), with
// only the objects on REFLECT_LAYER: sky, terrain, far mountains and trees.
class ReflectionProbe {
  constructor(renderer, size) {
    const hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    this.rt = new THREE.WebGLCubeRenderTarget(size, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    if (!hdr) this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.rt.texture.name = 'waterReflection';
    this.camera = new THREE.CubeCamera(0.1, 9000, this.rt);
    this.camera.layers.set(REFLECT_LAYER);
    // A dark water plane just below the eye: whatever the probe sees under
    // the horizon reads as water, so blurred reflections never pick up the
    // bare lake bed or land colours below the waterline.
    const disc = ringedDisc(6000, 0.25, 1.5, 48);
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uDeep: { value: new THREE.Color(0x0a2226) } },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform vec3 uDeep;
        varying vec3 vPos;
        void main() {
          vec3 V = normalize(vPos - cameraPosition);
          // like the real surface: dark straight down, sky at a glance
          float f = min(0.02 + 0.98 * pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0), 0.4);
          vec3 col = mix(uDeep * uFxWaterLight, fxSkyColor(reflect(V, vec3(0.0, 1.0, 0.0))), f);
          gl_FragColor = vec4(col, 1.0);
        }`,
      fog: true,
    });
    floorMat.userData.fx = 'manual';
    this.floor = new THREE.Mesh(disc, floorMat);
    this.floor.layers.set(REFLECT_LAYER);
    this.floor.frustumCulled = false;
    this.floor.name = 'reflectionFloor';
    this.faces = [0, 1, 2, 4, 5];
    this.next = 0;
    this.ready = false;
  }

  dispose() {
    this.rt.dispose();
    this.floor.removeFromParent();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
  }

  // Render `count` faces from position `pos`.
  update(renderer, scene, pos, count = 1) {
    const cam = this.camera;
    if (cam.coordinateSystem !== renderer.coordinateSystem) {
      cam.coordinateSystem = renderer.coordinateSystem;
      cam.updateCoordinateSystem();
    }
    cam.position.copy(pos);
    cam.updateMatrixWorld(true);
    if (this.floor.parent !== scene) scene.add(this.floor);
    this.floor.position.set(pos.x, pos.y - 0.3, pos.z);
    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace();
    const prevLevel = renderer.getActiveMipmapLevel();
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    for (let i = 0; i < count; i++) {
      const face = this.faces[this.next];
      this.next = (this.next + 1) % this.faces.length;
      renderer.setRenderTarget(this.rt, face, 0);
      renderer.clear();
      renderer.render(scene, cam.children[face]);
      if (this.next === 0) this.ready = true;
    }
    renderer.shadowMap.enabled = shadows;
    renderer.setRenderTarget(prevTarget, prevFace, prevLevel);
  }
}

export class WaterSystem {
  constructor(world, wtex, foamTex, env, renderer) {
    this.world = world;
    this.env = env;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.materials = [];
    this.waves = new WaveTexture(256);
    this.probe = null;
    this.levelT = 0;
    this.viewLevel = null;
    this.shared = {
      uTime: { value: 0 },
      uSunLight: { value: new THREE.Color() },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: env.uniforms.uNight,
      uSunColor: env.uniforms.uSunColor,
      uRain: { value: 0 },
      uHeight: { value: wtex.height },
      uMask: { value: wtex.mask },
      uWaves: { value: this.waves.texture },
      uFoamTex: { value: foamTex },
      uRefl: { value: null },
      uReflOn: { value: 0 },
      uWorldMin: { value: wtex.worldMin },
      uUvScale: { value: wtex.uvScale },
      uUvOffset: { value: wtex.uvOffset },
      uFarEdge: { value: 6300 },
    };

    this.ocean = new THREE.Mesh(this.oceanGeometry(), this.material({ ocean: true }));
    this.ocean.name = 'ocean';
    this.ocean.frustumCulled = false;
    this.group.add(this.ocean);

    this.river = new THREE.Mesh(this.riverGeometry(), this.material({ river: true, flow: 1.0 }));
    this.river.name = 'river';
    this.group.add(this.river);

    if (world.fallsS > 0) {
      this.falls = this.buildWaterfall();
      this.group.add(this.falls);
    }
    for (const lake of world.lakes) {
      const m = new THREE.Mesh(this.lakeGeometry(lake), this.material());
      m.name = 'lake-' + lake.id;
      this.group.add(m);
    }
    for (const c of this.group.children) {
      c.renderOrder = 1;
      c.receiveShadow = false;
    }
  }

  // Reflection cube size (0 turns reflections off and falls back to the sky
  // colour).
  setReflectionSize(size) {
    if (this.probe && this.probe.rt.width === size) return;
    if (this.probe) this.probe.dispose();
    this.probe = size > 0 ? new ReflectionProbe(this.renderer, size) : null;
    this.shared.uRefl.value = this.probe ? this.probe.rt.texture : null;
    this.shared.uReflOn.value = 0;
    this.primed = false;
  }

  material({ ocean = false, river = false, flow = 0 } = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uRiver: { value: river ? 1 : 0 },
        uOcean: { value: ocean ? 1 : 0 },
        uFlowSpeed: { value: flow },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: true,
      fog: true,
    });
    mat.userData.fx = 'manual';
    this.materials.push(mat);
    return mat;
  }

  // A disc around the camera (moved every frame, see update); the shader
  // works from world positions, so the waves stay put.
  oceanGeometry() {
    const g = ringedDisc(7500, 1, 1.35, 64);
    const n = g.attributes.position.count;
    g.setAttribute('flowUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('foam', new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  }

  riverGeometry() {
    const W = this.world;
    const P = W.river;
    // end the ribbon a little way out into the bay
    let sEnd = P.length;
    for (let s = P.length * 0.6; s < P.length; s += 2) {
      const p = P.sample(s);
      if (W.coastAt(p.x, p.z) < -12) {
        sEnd = s;
        break;
      }
    }
    const samples = [];
    for (let s = 0; s <= sEnd; s += 3) samples.push(s);
    if (W.fallsS > 0) {
      const f = W.fallsS;
      for (let i = samples.length - 1; i >= 0; i--) if (Math.abs(samples[i] - f) < 2.5) samples.splice(i, 1);
      samples.push(f - 0.35, f + 0.35, f - 1.6, f + 1.6);
      samples.sort((a, b) => a - b);
    }
    const across = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1];
    const cols = across.length;
    const pos = [];
    const uv = [];
    const foam = [];
    const idx = [];
    samples.forEach((s, r) => {
      const p = P.sample(s);
      const w = W.riverWidth(s) + 3.2;
      let lvl;
      if (W.fallsS > 0 && Math.abs(s - W.fallsS) < 0.5) lvl = s < W.fallsS ? W.riverLevel(W.fallsS - 0.001) : W.riverLevel(W.fallsS + 0.001);
      else lvl = W.riverLevel(s);
      const grad = W.riverGradient(s);
      let f = smoothstep(0.02, 0.09, grad) * 0.8;
      if (W.fallsS > 0) {
        const u = s - W.fallsS;
        if (u > -2 && u < 0.5) f = 1;
        else if (u >= 0.5 && u < 34) f = Math.max(f, 1 - u / 34);
      }
      const nx = -p.tz;
      const nz = p.tx;
      for (let c = 0; c < cols; c++) {
        const a = across[c];
        pos.push(p.x + nx * a * w, lvl, p.z + nz * a * w);
        uv.push(a * w, s);
        foam.push(clamp(f * (0.75 + 0.25 * Math.abs(a)), 0, 1));
      }
      const crossesFalls = W.fallsS > 0 && r > 0 && samples[r - 1] < W.fallsS && s > W.fallsS;
      if (r > 0 && !crossesFalls) {
        const b0 = (r - 1) * cols;
        const b1 = r * cols;
        for (let c = 0; c < cols - 1; c++) {
          idx.push(b0 + c, b0 + c + 1, b1 + c, b0 + c + 1, b1 + c + 1, b1 + c);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flowUv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('foam', new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // Animated curtain of falling water at Bear Falls.
  buildWaterfall() {
    const W = this.world;
    const s0 = W.fallsS;
    const top = W.riverLevel(s0 - 0.01);
    const bot = W.riverLevel(s0 + 0.01);
    const p = W.river.sample(s0);
    const width = (W.riverWidth(s0) + 3.2) * 2;
    const height = top - bot + 1.2;
    const geo = new THREE.PlaneGeometry(width, height, 20, 10);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const v = (y + height / 2) / height; // 0 bottom, 1 top
      // lip curls outward near the top, water bows out slightly mid-drop
      const bulge = Math.sin(v * Math.PI) * 0.9 + Math.pow(v, 6) * 1.4;
      const edge = 1 - Math.pow(Math.abs(x) / (width / 2), 4);
      pos.setZ(i, bulge * (0.4 + 0.6 * edge));
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.shared.uTime,
        uNoise: { value: this.shared.uFoamTex.value },
        uSunColor: this.shared.uSunColor,
        uNight: this.shared.uNight,
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec3 uSunColor;
        uniform float uNight;
        varying vec2 vUv;
        void main() {
          vec2 uv = vec2(vUv.x * 3.0, vUv.y * 0.6 + uTime * 0.9);
          float n1 = texture2D(uNoise, uv).b;
          float n2 = texture2D(uNoise, vec2(vUv.x * 7.0 + 0.3, vUv.y * 1.3 + uTime * 1.6)).b;
          float streak = smoothstep(0.35, 0.8, n1 * 0.6 + n2 * 0.5);
          vec3 deep = vec3(0.32, 0.55, 0.55);
          vec3 foam = vec3(0.93, 0.96, 0.97);
          vec3 col = mix(deep, foam, 0.35 + streak * 0.65);
          col *= mix(1.0, 0.25, uNight) * (0.75 + 0.35 * clamp(length(uSunColor), 0.0, 1.5));
          float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          float alpha = (0.72 + streak * 0.28) * edge * smoothstep(0.0, 0.05, vUv.y);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, (top + bot) / 2 - 0.3, p.z);
    // face downstream: plane normal +z -> flow direction
    mesh.rotation.y = Math.atan2(p.tx, p.tz);
    mesh.renderOrder = 2;
    mesh.name = 'waterfall';
    return mesh;
  }

  // Lake surface: rings following the shoreline (no long thin triangles).
  lakeGeometry(lake) {
    const segs = 160;
    const rings = [0.12, 0.3, 0.5, 0.68, 0.82, 0.92, 1];
    const pos = [lake.x, lake.level, lake.z];
    const idx = [];
    for (let k = 0; k < rings.length; k++) {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const r = (this.world.lakeRadius(lake, a) + 14) * rings[k];
        pos.push(lake.x + Math.cos(a) * r, lake.level, lake.z + Math.sin(a) * r);
      }
    }
    for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
    for (let k = 1; k < rings.length; k++) {
      const a0 = 1 + (k - 1) * segs;
      const b0 = 1 + k * segs;
      for (let i = 0; i < segs; i++) {
        const i1 = (i + 1) % segs;
        idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = pos.length / 3;
    g.setAttribute('flowUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('foam', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // Surface level of the water in view (null if none): the reflections are
  // captured from just above it, like the view from the water itself.
  levelAhead(camera) {
    const W = this.world;
    camera.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
    _dir.normalize();
    const p = camera.position;
    for (const d of [0, 4, 9, 16, 26, 40, 60, 90, 130]) {
      const x = p.x + _dir.x * d;
      const z = p.z + _dir.z * d;
      const w = W.waterAt(x, z);
      if (w) return w.level;
    }
    return null;
  }

  // Per frame: the wave texture, one reflection face and the light uniforms.
  update(dt, rain, camera, scene) {
    const sh = this.shared;
    sh.uTime.value += dt;
    sh.uRain.value = rain;
    const sun = this.env.sun;
    sh.uSunLight.value.copy(sun.color).multiplyScalar(sun.intensity);
    sh.uLightDir.value.copy(this.env.lightDir);
    this.ocean.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
    this.ocean.updateMatrixWorld();
    this.waves.render(this.renderer, sh.uTime.value);
    if (this.probe && scene) {
      this.levelT -= dt;
      if (this.levelT <= 0) {
        this.levelT = 0.4;
        this.viewLevel = this.levelAhead(camera);
      }
      _probePos.copy(camera.position);
      if (this.viewLevel !== null && this.viewLevel < camera.position.y) _probePos.y = this.viewLevel + 0.3;
      this.probe.update(this.renderer, scene, _probePos, this.primed ? 1 : 5);
      this.primed = true;
      sh.uReflOn.value = this.probe.ready ? 1 : 0;
    }
  }
}
