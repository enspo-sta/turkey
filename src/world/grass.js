// GPU grass and fireweed around the camera. Tufts live in a wrapping square
// patch; the vertex shader places them on the heightfield, fades them with
// distance and density, and applies wind. No CPU work per frame.
import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
attribute vec3 aOffset; // x,z offset in patch, y random
uniform vec2 uCam;
uniform float uR;
uniform float uTime;
uniform float uChannel; // 0 grass, 1 flowers
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uGround;
uniform vec2 uWorldMin;
uniform float uUvScale;
uniform float uUvOffset;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uWind;
uniform sampler2D uFxShade;
uniform vec3 uFxShadeTf;
uniform float uFxShadeOn;
varying vec3 vColor;
varying vec3 vSun;
void main() {
  float size = 2.0 * uR;
  vec2 base = uCam - uR;
  vec2 wp = base + mod(aOffset.xz - base, size);
  vec2 tuv = (wp - uWorldMin) * uUvScale + uUvOffset;
  vec4 m = texture2D(uMask, tuv);
  float density = uChannel > 0.5 ? m.g : m.r;
  float dist = length(wp - uCam);
  float fade = 1.0 - smoothstep(uR * 0.55, uR * 0.95, dist);
  float r = aOffset.y;
  float show = step(r, density * 0.98) * fade;
  float h = texture2D(uHeight, tuv).r;
  float ang = r * 43.0;
  float c = cos(ang), s = sin(ang);
  vec3 p = position;
  float tall = uChannel > 0.5 ? (0.75 + fract(r * 17.0) * 0.6) : (0.55 + fract(r * 13.0) * 0.7) * (0.6 + density * 0.6);
  p.y *= tall * show;
  // thin blades would shimmer far away: widen them with distance
  p.xz *= show * (1.0 + smoothstep(6.0, 24.0, dist) * 0.9);
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  float wave = sin(uTime * 1.9 + wp.x * 0.35 + wp.y * 0.21) + 0.5 * sin(uTime * 3.7 + wp.x * 0.9);
  // a passing gust lays the blades over downwind and sets them tossing
  float gust = fxGust(wp);
  float bend = p.y * p.y * ((0.12 + 0.1 * uWind) * wave * (0.65 + 0.6 * gust) + (0.08 + 0.15 * uWind) * gust);
  p.xz += uFxWind.xy * bend * 1.1;
  vec3 world = vec3(wp.x, h - 0.03, wp.y) + p;
  vec3 g = texture2D(uGround, tuv).rgb;
  float tip = clamp(position.y / 0.9, 0.0, 1.0);
  vec3 col;
  if (uChannel > 0.5) {
    vec3 stem = vec3(0.18, 0.3, 0.1);
    vec3 bloom = mix(vec3(0.62, 0.1, 0.42), vec3(0.9, 0.28, 0.62), fract(r * 7.0));
    bloom = mix(vec3(0.35, 0.08, 0.3), bloom, color.r);
    col = color.r > 0.2 ? bloom : stem;
  } else {
    col = g * (0.62 + tip * 0.75) * vec3(0.95, 1.08, 0.88);
    // blades vary from lush green to dry straw
    col *= mix(vec3(0.84, 0.97, 0.9), vec3(1.16, 1.04, 0.8), color.g);
  }
  float diff = clamp(uSunDir.y, 0.0, 1.0) * 0.85 + 0.15;
  // mountain shadow and open sky from the terrain lighting maps
  vec2 shade = vec2(1.0);
  vec2 suv = (wp - uFxShadeTf.xy) * uFxShadeTf.z;
  if (uFxShadeOn > 0.5) shade = texture2D(uFxShade, suv).rg;
  float shadeTip = 0.7 + tip * 0.35;
  // blades laid over by a gust catch more light: waves of paler green roll
  // across the meadow; wet grass is darker
  shadeTip *= (1.0 + 0.35 * gust * tip) * (1.0 - 0.2 * uFxWet);
  vColor = col * uSkyCol * 0.9 * mix(0.42, 1.0, shade.g) * shadeTip;
  vSun = col * uSunCol * diff * 0.65 * shade.r * fxCloudShadow(vec3(wp.x, h, wp.y)) * shadeTip;
  vec4 worldPosition = vec4(world, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
varying vec3 vColor;
varying vec3 vSun;
void main() {
  float sunShadow = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
    sunShadow = getSunShadow( sunShadowMap[ 0 ], sunLightShadows[ 0 ], 0 );
  #endif
  gl_FragColor = vec4(vColor + vSun * sunShadow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function tuftGeometry(blades, flower) {
  const pos = [];
  const col = [];
  const index = [];
  const rand = mulberry32(flower ? 5 : 9);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rand() * 0.6;
    if (!flower) {
      // a blade in two segments, upright at the base and bending outward
      // toward a point, so the tuft arches like real grass
      const r = 0.04 + rand() * 0.12;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const w0 = 0.021 + rand() * 0.013;
      const w1 = w0 * 0.62;
      const h = 0.48 + rand() * 0.45;
      const lean = 0.1 + rand() * 0.22;
      const tint = rand();
      const m = 0.55;
      const mx = cx + dx * lean * m * m;
      const mz = cz + dz * lean * m * m;
      const v = pos.length / 3;
      pos.push(cx + dz * w0, 0, cz - dx * w0, cx - dz * w0, 0, cz + dx * w0);
      pos.push(mx + dz * w1, h * m, mz - dx * w1, mx - dz * w1, h * m, mz + dx * w1);
      pos.push(cx + dx * lean, h, cz + dz * lean);
      index.push(v, v + 1, v + 3, v, v + 3, v + 2, v + 2, v + 3, v + 4);
      // green channel: from lush to dry, per blade
      for (let k = 0; k < 5; k++) col.push(0, tint, 0);
      continue;
    }
    const w = 0.025;
    const h = 0.9;
    const px = Math.cos(a + 1.57) * w;
    const pz = Math.sin(a + 1.57) * w;
    let v = pos.length / 3;
    pos.push(-px, 0, -pz, px, 0, pz, 0, h, 0);
    col.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
    index.push(v, v + 1, v + 2);
    // fireweed raceme: small blossoms spiralling up the top half of the stalk
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const y = h * (0.5 + t * 0.55);
      const ang = k * 2.4;
      const rr = 0.055 * (1 - t * 0.6);
      const dx = Math.cos(ang) * rr;
      const dz = Math.sin(ang) * rr;
      const s = 0.05 * (1 - t * 0.5);
      v = pos.length / 3;
      pos.push(dx - s * 0.5, y, dz, dx + s * 0.5, y, dz, dx, y + s * 1.6, dz + s * 0.3);
      const c = 1 - t * 0.5;
      col.push(c, c, c, c, c, c, c, c, c);
      index.push(v, v + 1, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export class GrassField {
  constructor(wtex, env, { count = 9000, radius = 30, flowers = 1400 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.uniforms = {
      uCam: { value: new THREE.Vector2() },
      uR: { value: radius },
      uTime: { value: 0 },
      uChannel: { value: 0 },
      uHeight: { value: wtex.height },
      uMask: { value: wtex.mask },
      uGround: { value: wtex.ground },
      uWorldMin: { value: wtex.worldMin },
      uUvScale: { value: wtex.uvScale },
      uUvOffset: { value: wtex.uvOffset },
      uSunDir: env.uniforms.uSunDir,
      uSunCol: { value: new THREE.Color() },
      uSkyCol: { value: new THREE.Color() },
      uGroundCol: { value: new THREE.Color() },
      uWind: { value: 0.3 },
    };
    this.grass = this.makeLayer(tuftGeometry(5, false), count, radius, 0);
    this.flowers = this.makeLayer(tuftGeometry(1, true), flowers, radius * 1.3, 1);
    this.group.add(this.grass, this.flowers);
    this.env = env;
  }

  makeLayer(geo, count, radius, channel) {
    const rand = mulberry32(channel ? 77 : 31);
    const off = new Float32Array(count * 3);
    const size = radius * 2 * (channel ? 1 : 1);
    for (let i = 0; i < count; i++) {
      off[i * 3] = rand() * size;
      off[i * 3 + 1] = rand();
      off[i * 3 + 2] = rand() * size;
    }
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    ig.attributes.position = geo.attributes.position;
    ig.attributes.color = geo.attributes.color;
    ig.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    ig.instanceCount = count;
    const uniforms = {
      ...this.uniforms,
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    };
    uniforms.uChannel = { value: channel };
    uniforms.uR = { value: channel ? radius : radius };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      fog: true,
      lights: true,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(ig, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.maxCount = count;
    return mesh;
  }

  setDensity(f) {
    this.grass.geometry.instanceCount = Math.floor(this.grass.userData.maxCount * f);
    this.flowers.geometry.instanceCount = Math.floor(this.flowers.userData.maxCount * f);
  }

  update(dt, camPos, sunLight, hemi, wind) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.set(camPos.x, camPos.z);
    this.uniforms.uSunCol.value.copy(sunLight.color).multiplyScalar(sunLight.intensity * 0.32);
    this.uniforms.uSkyCol.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55);
    this.uniforms.uWind.value = wind;
    for (const m of [this.grass, this.flowers]) m.material.uniforms.uCam.value.set(camPos.x, camPos.z);
  }
}
