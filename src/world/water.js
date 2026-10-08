// Water: ocean plane, river ribbon (with the Bear Falls drop) and lakes.
// The surface only adds what the eye sees ON the water: fresnel reflections of
// the real surroundings (a cube map captured around the camera), sun glints
// and foam. What is seen THROUGH the water (the bed, rocks, fish) is drawn by
// the objects themselves with light absorption along the refracted ray (see
// worldfx.js), so shallow gravel shows clearly and deep pools turn green-blue.
import * as THREE from 'three';
import { smoothstep, clamp, mulberry32 } from '../util/math.js';
import { FX } from './worldfx.js';
import { ModelBuilder } from '../util/builder.js';

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
    // calm and wind-roughened patches drifting over lakes, and dark cat's
    // paws running across the water as a gust comes through
    float gust = texture2D(uFoamTex, p * 0.0045 + vec2(uTime * 0.004, uTime * 0.0023)).g;
    slope *= mix(0.45, 1.25, smoothstep(0.3, 0.7, gust)) * (uOcean > 0.5 ? 1.25 : 1.0) * (0.85 + 0.8 * fxGust(p));
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
  float lit = mix(sh.r * fxCloudShadow(vWorld), 1.0, uNight) * smoothstep(0.0, 0.08, uLightDir.y);
  // weighted like the reflection: faint looking down, strong across the water toward a low sun
  vec3 spec = uSunLight * (sharp + glitter) * lit * (1.0 - uRain * 0.8) * (0.35 + 2.0 * fres);

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
  // mist lying on the water, then haze toward the horizon
  // the sky's colour once, for the mist (paler) and the haze
  vec3 skyV = fxSkyColor(-V);
  float mist = fxMist(vWorld);
  c = mix(c, fxMistColor(skyV), mist);
  float haze = fxHaze(vWorld);
  c = mix(c, skyV, haze);
  spec *= (1.0 - haze) * (1.0 - mist);
  #ifdef TONE_MAPPING
    c = toneMapping(c);
    spec = toneMapping(spec);
  #endif
  c = linearToOutputTexel(vec4(c, 1.0)).rgb;
  spec = linearToOutputTexel(vec4(spec, 1.0)).rgb;
  #ifdef TONE_MAPPING
    // fine noise against banding where the colour goes straight to the 8-bit screen (Medium and Low; High's finish does its own)
    c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  #endif
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
          vec3 col = mix(uDeep * uFxWaterLight, fxHorizonColor(reflect(V, vec3(0.0, 1.0, 0.0))), f);
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
    // a lost graphics context given back leaves the reflection's faces
    // empty: none is shown until all five are drawn again
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (this.probe) {
        this.probe.ready = false;
        this.probe.next = 0;
      }
      this.primed = false;
    });
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
      if (c === this.falls) continue;
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

  // Bear Falls: the river slides glassy over the lip, arcs out and falls as
  // white water, split into three falls by two boulders; a darker sheet
  // behind gives it depth, and foam boils where it lands in the pool.
  buildWaterfall() {
    const W = this.world;
    const s0 = W.fallsS;
    const top = W.riverLevel(s0 - 0.01);
    const bot = W.riverLevel(s0 + 0.01);
    const p = W.river.sample(s0);
    const half = W.riverWidth(s0) + 3.2;
    const drop = top - bot;
    const group = new THREE.Group();
    group.position.set(p.x, bot, p.z);
    // local +z points downstream
    group.rotation.y = Math.atan2(p.tx, p.tz);
    group.name = 'waterfall';
    // the path of the water: a flat run to the lip, then a falling arc
    const OUT = 2.6;
    const shape = (v, back) => {
      if (v <= 0) return { y: drop + 0.04, z: v * 14 - (back ? 0.5 : 0) };
      const y = drop * (1 - v);
      return { y, z: OUT * Math.sqrt(2 * drop * v / 9.8) * (back ? 0.62 : 1) - (back ? 0.5 : 0) };
    };
    const sheet = (back) => {
      const nx = 36;
      const ny = 20;
      const pos = [];
      const uv = [];
      const idx = [];
      for (let j = 0; j <= ny; j++) {
        // a few rows on the run-in, the rest down the drop
        const v = j < 3 ? -0.12 + (j / 3) * 0.12 : (j - 3) / (ny - 3);
        const sh = shape(v, back);
        for (let i = 0; i <= nx; i++) {
          const u = i / nx;
          const x = (u - 0.5) * 2 * half * (1 + Math.max(0, v) * 0.12);
          // the middle bows out a little more than the sides
          const bow = Math.max(0, v) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 2)) * 0.5;
          pos.push(x, sh.y, sh.z + bow);
          uv.push(u, v);
        }
      }
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i;
          idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const fallMat = (back) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.shared.uTime,
          uNoise: { value: this.shared.uFoamTex.value },
          uSunColor: this.shared.uSunColor,
          uNight: this.shared.uNight,
          uBack: { value: back ? 1 : 0 },
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        },
        vertexShader: /* glsl */ `
          #include <common>
          #include <fog_pars_vertex>
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vView = -mvPosition.xyz;
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
          uniform float uBack;
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            float v = vUv.y;
            float fall = clamp(v, 0.0, 1.0);
            // the water speeds up as it falls: the pattern scrolls faster lower down
            float run = v - uTime * (0.35 + fall * 1.6) * (1.0 - uBack * 0.35);
            float n1 = texture2D(uNoise, vec2(vUv.x * 5.0, run * 0.7)).b;
            float n2 = texture2D(uNoise, vec2(vUv.x * 13.0 + 0.37, run * 1.6 + 0.2)).b;
            float n3 = texture2D(uNoise, vec2(vUv.x * 2.0 + 0.11, v * 0.4 - uTime * 0.2)).g;
            float streak = smoothstep(0.3, 0.85, n1 * 0.55 + n2 * 0.55);
            // aerated white water grows down the drop
            float white = smoothstep(0.05, 0.7, fall) * 0.7 + streak * 0.5;
            // two boulders on the lip split the river into three falls
            float gapA = 1.0 - smoothstep(0.035, 0.07 + fall * 0.02, abs(vUv.x - 0.34 + n3 * 0.02));
            float gapB = 1.0 - smoothstep(0.03, 0.065 + fall * 0.02, abs(vUv.x - 0.68 - n3 * 0.02));
            float gap = max(gapA, gapB) * smoothstep(-0.04, 0.02, v) * (1.0 - smoothstep(0.55, 0.95, fall) * 0.8);
            // ragged sides that fray as they fall
            float fray = 0.03 + fall * 0.06 + n2 * 0.05;
            float edge = smoothstep(0.0, fray, vUv.x) * smoothstep(1.0, 1.0 - fray, vUv.x);
            vec3 glass = vec3(0.12, 0.34, 0.33);
            vec3 foam = vec3(0.93, 0.96, 0.97);
            vec3 col = mix(glass, foam, clamp(white, 0.0, 1.0));
            // light: sun colour where the sun reaches the falls (not in the
            // shadow of the gorge or a cloud), and a bright rim where the
            // sheet turns from you
            float sunVis = 1.0;
            #ifdef USE_FOG
              sunVis = fxShade(vFxWorld).r * fxCloudShadow(vFxWorld);
            #endif
            float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
            #ifdef USE_FOG
              // lit by the light the water itself is lit by (the sky's and the
              // sun's), so the falls are dim at night and in a dark gorge,
              // instead of glowing white
              col *= uFxWaterLight * mix(0.55, 1.0, sunVis);
            #else
              col *= (0.7 + 0.4 * clamp(length(uSunColor), 0.0, 1.5) * mix(0.3, 1.0, sunVis)) * mix(1.0, 0.25, uNight);
            #endif
            col += rim * 0.12 * (1.0 - uNight) * sunVis;
            col *= mix(1.0, 0.62, uBack);
            float alpha = mix(0.38, 0.95, clamp(white, 0.0, 1.0)) * edge * (1.0 - gap);
            // the run-in is clear water, the falls themselves opaque white
            alpha *= mix(0.55, 1.0, smoothstep(-0.06, 0.08, v));
            alpha *= mix(1.0, 0.7, uBack);
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
    const back = new THREE.Mesh(sheet(true), fallMat(true));
    back.renderOrder = 2;
    const front = new THREE.Mesh(sheet(false), fallMat(false));
    front.renderOrder = 3;
    // foam boiling where the falls land, spreading downstream
    const landZ = OUT * Math.sqrt((2 * drop) / 9.8);
    const foamGeo = new THREE.PlaneGeometry(half * 2.6, 16, 1, 1);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMat = new THREE.ShaderMaterial({
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
          // vUv.y: 1 at the falls, 0 downstream
          float d = 1.0 - vUv.y;
          float n1 = texture2D(uNoise, vec2(vUv.x * 4.0, d * 2.0 - uTime * 0.5)).b;
          float n2 = texture2D(uNoise, vec2(vUv.x * 9.0 + 0.3, d * 4.0 - uTime * 0.9)).b;
          float boil = smoothstep(0.35, 0.8, n1 * 0.6 + n2 * 0.5);
          float fade = smoothstep(1.0, 0.75, d) * 0.4 + smoothstep(0.85, 0.1, d) * 0.6;
          float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float a = boil * fade * side * 0.9;
          #ifdef USE_FOG
            vec3 col = vec3(0.92, 0.95, 0.96) * uFxWaterLight * 0.85;
          #else
            vec3 col = vec3(0.92, 0.95, 0.96) * (0.72 + 0.35 * clamp(length(uSunColor), 0.0, 1.5)) * mix(1.0, 0.25, uNight);
          #endif
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.position.set(0, 0.07, landZ + 6.5);
    foam.renderOrder = 2;
    // the two boulders on the lip and a few wet rocks in the plunge
    const rb = new ModelBuilder();
    for (const u of [0.34, 0.68]) {
      const x = (u - 0.5) * 2 * half;
      rb.dodeca(1.15, { pos: [x, drop - 0.2, 0.1], scale: [0.9, 1.0, 1.3], color: 0x34332f, jitter: 0.25 });
      rb.dodeca(0.8, { pos: [x + 0.3, drop - 1.4, 0.4], scale: [0.8, 1.1, 0.9], color: 0x2c2b28, jitter: 0.25 });
    }
    for (let i = 0; i < 6; i++) {
      const x = (i / 5 - 0.5) * 2 * half * 1.1;
      rb.dodeca(0.6 + (i % 3) * 0.25, { pos: [x, 0.05, landZ + 2 + (i % 2) * 2.5], scale: [1.2, 0.6, 1], color: 0x3a3934, jitter: 0.25 });
    }
    const rocks = new THREE.Mesh(rb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }));
    rocks.castShadow = true;
    group.add(back, front, foam, rocks);
    // the mist rises where the water lands
    this.fallsLanding = { x: p.x + p.tx * landZ, z: p.z + p.tz * landZ, y: bot };
    return group;
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
  // Returns whether the reflection was drawn.
  update(dt, rain, camera, scene) {
    const sh = this.shared;
    sh.uTime.value = (sh.uTime.value + dt) % 7200;
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
      // (drawn: every object's matrix in the world is up to date)
      return true;
    }
    return false;
  }
}
