// Water: ocean plane, river ribbon (with the Bear Falls drop) and lakes, all
// sharing one shader with depth-based colour, fresnel sky reflection, sun
// glints, flow-aligned ripples and shore foam.
import * as THREE from 'three';
import { smoothstep, clamp } from '../util/math.js';

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
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uAmbient;
uniform float uNight;
uniform float uRiver;
uniform float uOcean;
uniform float uFlowSpeed;
uniform float uRain;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uNormal;
uniform vec2 uWorldMin;
uniform float uUvScale;
uniform float uUvOffset;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vFoam;

void main() {
  vec2 tuv = (vWorld.xz - uWorldMin) * uUvScale + uUvOffset;
  bool inside = tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0;
  float ground = inside ? texture2D(uHeight, tuv).r : -40.0;
  if (uOcean > 0.5 && inside && texture2D(uMask, tuv).b < 0.5) discard;
  float depth = vWorld.y - ground;

  vec2 uvA;
  vec2 uvB;
  if (uRiver > 0.5) {
    uvA = vFlow * vec2(0.11, 0.05) - vec2(0.0, uTime * uFlowSpeed * 0.05);
    uvB = vFlow * vec2(0.19, 0.09) - vec2(0.013, uTime * uFlowSpeed * 0.085) + 0.37;
  } else {
    uvA = vWorld.xz * 0.035 + vec2(uTime * 0.011, uTime * 0.007);
    uvB = vWorld.xz * 0.093 - vec2(uTime * 0.009, -uTime * 0.013);
  }
  vec3 tA = texture2D(uNormal, uvA).xyz;
  vec3 tB = texture2D(uNormal, uvB).xyz;
  vec2 nn = (tA.xy - 0.5) + (tB.xy - 0.5) * 0.8;
  float choppy = uOcean > 0.5 ? 1.25 : 0.8;
  choppy += uRain * 0.6 + vFoam * 1.5;
  vec3 n = normalize(vec3(nn.x * choppy, 1.0, nn.y * choppy));

  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 4.0 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.12;
  spec *= smoothstep(-0.05, 0.08, uSunDir.y);

  float dd = clamp(depth, 0.0, 30.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, uOcean > 0.5 ? 14.0 : 4.5, dd));
  float sunUp = clamp(uSunDir.y * 1.6 + 0.12, 0.05, 1.0);
  body *= uAmbient * 0.55 + sunUp * 0.6;

  vec3 col = mix(body, sky, fres * 0.9);
  col += uSunColor * spec;

  float fn = texture2D(uNormal, uvB * 1.9 + vec2(0.0, uTime * 0.02)).z;
  float shore = 1.0 - smoothstep(0.0, 0.32, depth);
  float foamAmt = max(shore * 0.5, vFoam);
  foamAmt *= smoothstep(0.42 - vFoam * 0.3, 0.7, fn + vFoam * 0.35);
  vec3 foamCol = mix(vec3(0.78, 0.84, 0.85), vec3(0.2, 0.25, 0.3), uNight * 0.8) * (0.45 + sunUp * 0.55);
  col = mix(col, foamCol, clamp(foamAmt, 0.0, 1.0));

  float alpha = smoothstep(0.0, 1.6, depth) * 0.82 + 0.1;
  alpha = max(alpha, fres * 0.9);
  alpha = clamp(max(alpha, foamAmt), 0.0, 1.0);
  alpha = max(alpha, vFoam * 0.9);
  if (!inside) alpha = 1.0;

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const TINTS = {
  ocean: { shallow: 0x3f8a86, deep: 0x0f3a52 },
  river: { shallow: 0x6fa39a, deep: 0x1e5a66 },
  lake: { shallow: 0x587f62, deep: 0x16384a },
  glacial: { shallow: 0x8fd0cc, deep: 0x3a9ab0 },
};

export class WaterSystem {
  constructor(world, wtex, normalTex, env) {
    this.world = world;
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.materials = [];
    this.shared = {
      uTime: { value: 0 },
      uSunDir: env.uniforms.uSunDir,
      uSunColor: env.uniforms.uSunColor,
      uZenith: env.uniforms.uZenith,
      uHorizon: env.uniforms.uHorizon,
      uNight: env.uniforms.uNight,
      uAmbient: { value: new THREE.Color(1, 1, 1) },
      uRain: { value: 0 },
      uHeight: { value: wtex.height },
      uMask: { value: wtex.mask },
      uNormal: { value: normalTex },
      uWorldMin: { value: wtex.worldMin },
      uUvScale: { value: wtex.uvScale },
      uUvOffset: { value: wtex.uvOffset },
    };

    this.ocean = new THREE.Mesh(this.oceanGeometry(), this.material('ocean', { ocean: true }));
    this.ocean.name = 'ocean';
    this.ocean.frustumCulled = false;
    this.group.add(this.ocean);

    this.river = new THREE.Mesh(this.riverGeometry(), this.material('river', { river: true, flow: 1.0 }));
    this.river.name = 'river';
    this.group.add(this.river);

    for (const lake of world.lakes) {
      const m = new THREE.Mesh(this.lakeGeometry(lake), this.material(lake.tint === 'glacial' ? 'glacial' : 'lake'));
      m.name = 'lake-' + lake.id;
      this.group.add(m);
    }
    for (const c of this.group.children) {
      c.renderOrder = 1;
      c.receiveShadow = false;
    }
  }

  material(tint, { ocean = false, river = false, flow = 0 } = {}) {
    const t = TINTS[tint];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uShallow: { value: new THREE.Color(t.shallow) },
        uDeep: { value: new THREE.Color(t.deep) },
        uRiver: { value: river ? 1 : 0 },
        uOcean: { value: ocean ? 1 : 0 },
        uFlowSpeed: { value: flow },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: true,
      fog: true,
    });
    this.materials.push(mat);
    return mat;
  }

  oceanGeometry() {
    const g = new THREE.PlaneGeometry(14000, 14000, 1, 1);
    g.rotateX(-Math.PI / 2);
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
      if (r > 0) {
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

  lakeGeometry(lake) {
    const segs = 160;
    const pos = [lake.x, lake.level, lake.z];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r = this.world.lakeRadius(lake, a) + 14;
      pos.push(lake.x + Math.cos(a) * r, lake.level, lake.z + Math.sin(a) * r);
      if (i > 0) idx.push(0, i + 1, i);
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

  update(dt, rain, ambientColor) {
    this.shared.uTime.value += dt;
    this.shared.uRain.value = rain;
    if (ambientColor) this.shared.uAmbient.value.copy(ambientColor);
  }
}
