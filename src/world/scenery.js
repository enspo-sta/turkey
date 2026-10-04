// Spectacular surroundings: steam drifting from the volcano across the bay
// and clouds clinging to the high peaks, drawn as soft camera-facing puffs in
// one instanced draw, and ribbon waterfalls cascading down the valley cliffs
// with mist at their foot.
import * as THREE from 'three';
import { SIZE, VOLCANO, MASSIF } from './worldgen.js';
import { mulberry32 } from '../util/math.js';

// A soft, lumpy cloud puff: overlapping round blobs with a feathered edge.
function puffTexture() {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * S * 0.22;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r * 0.7;
    const R = S * (0.16 + rand() * 0.14);
    const grd = g.createRadialGradient(x, y, 0, x, y, R);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const puffVert = /* glsl */ `
attribute vec4 iPos; // xyz and size
attribute vec4 iCol; // lit share, light behind it, spare, opacity
varying vec2 vUv;
varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vCol = iCol;
  vec4 mvPosition = viewMatrix * vec4( iPos.xyz, 1.0 );
  mvPosition.xy += position.xy * iPos.w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const puffFrag = /* glsl */ `
uniform sampler2D uPuff;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSun;
varying vec2 vUv;
varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  float a = texture2D( uPuff, vUv ).a;
  // sunlit toward the top of each puff, in shade underneath
  vec3 c = mix( uShade, uLit, clamp( vUv.y * 0.8 + 0.25, 0.0, 1.0 ) * vCol.x );
  // with the light behind it, the thin edges glow (a silver lining)
  c += uSun * vCol.y * ( 1.0 - a );
  gl_FragColor = vec4( c, a * vCol.w );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const CAP = 96;

export class Scenery {
  constructor(game) {
    this.game = game;
    const W = game.world;
    this.group = new THREE.Group();
    this.group.name = 'scenery';
    this.time = 0;

    // ---- puffs
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iCol', this.iCol);
    geo.instanceCount = 0;
    this.uniforms = {
      uPuff: { value: puffTexture() },
      uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.6, 0.65, 0.72) },
      uSun: { value: new THREE.Color(0, 0, 0) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: puffVert,
      fragmentShader: puffFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.puffs = new THREE.Mesh(geo, mat);
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 1;
    this.puffs.name = 'cloudPuffs';
    this.group.add(this.puffs);

    const rand = mulberry32(W.seed * 11 + 7);
    const list = [];
    // the volcano's plume: puffs rising from the crater and bending away on
    // the wind, cycling so it never ends
    // the crater floor, a little below the rim the mesh shows
    const top = VOLCANO.h * Math.pow(1 - VOLCANO.crater / VOLCANO.r, 1.55) - 70;
    for (let i = 0; i < 18; i++) list.push({ kind: 'plume', t: i / 18, seed: rand() });
    this.crater = new THREE.Vector3(VOLCANO.x, top, VOLCANO.z);
    // clouds caught on the high peaks of the ranges and the massif
    const clouds = [];
    for (let k = 0; k < 400 && clouds.length < 9; k++) {
      const a = rand() * Math.PI * 2;
      const d = 1900 + rand() * 2600;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = W.farHeight(x, z);
      if (h < 560) continue;
      if (clouds.some((c) => Math.hypot(c.x - x, c.z - z) < 900)) continue;
      clouds.push({ x, z, y: h * (0.78 + rand() * 0.12) });
    }
    clouds.push({ x: MASSIF.x - 300, z: MASSIF.z + 400, y: MASSIF.h * 0.62 });
    for (const c of clouds) {
      const n = 4 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        list.push({ kind: 'cloud', c, ox: (rand() - 0.5) * 700, oy: (rand() - 0.5) * 60, oz: (rand() - 0.5) * 380, size: 260 + rand() * 260, seed: rand() });
      }
    }
    this.list = list;

    // ---- waterfalls down the cliffs
    this.cascades = findCascades(W, 5);
    const shared = game.water.shared;
    this.cascadeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uNoise: { value: shared.uFoamTex.value },
        uSunColor: shared.uSunColor,
        uNight: shared.uNight,
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
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
          float n1 = texture2D( uNoise, vec2( vUv.x * 1.6, vUv.y * 0.35 - uTime * 0.55 ) ).b;
          float n2 = texture2D( uNoise, vec2( vUv.x * 3.1 + 0.4, vUv.y * 0.8 - uTime * 1.1 ) ).b;
          float streak = smoothstep( 0.3, 0.8, n1 * 0.6 + n2 * 0.5 );
          vec3 col = mix( vec3( 0.55, 0.68, 0.7 ), vec3( 0.95, 0.97, 0.98 ), 0.4 + streak * 0.6 );
          #ifdef USE_FOG
            // lit like the water below: dim at night, warm at sunrise
            col *= uFxWaterLight;
          #else
            col *= mix( 1.0, 0.25, uNight ) * ( 0.75 + 0.35 * clamp( length( uSunColor ), 0.0, 1.5 ) );
          #endif
          float edge = smoothstep( 0.0, 0.2, vUv.x ) * smoothstep( 1.0, 0.8, vUv.x );
          float alpha = ( 0.62 + streak * 0.38 ) * edge;
          gl_FragColor = vec4( col, alpha );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    for (const c of this.cascades) {
      const m = new THREE.Mesh(ribbonGeometry(W, c.path, c.width), this.cascadeMat);
      m.renderOrder = 2;
      m.name = 'cascade';
      this.group.add(m);
      // mist at the foot
      const b = c.path[c.path.length - 1];
      for (let i = 0; i < 3; i++) list.push({ kind: 'mist', x: b[0], y: b[1] + 2 + i * 2, z: b[2], seed: rand(), size: 7 + i * 3 });
    }
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const env = g.env;
    // light the puffs like the rest of the scene
    const sunI = env.sun.intensity * (env.sun.visible === false ? 0 : 1);
    this.uniforms.uLit.value.copy(env.sun.color).multiplyScalar(0.35 * sunI).add(_c.copy(env.hemi.color).multiplyScalar(0.65 * env.hemi.intensity));
    this.uniforms.uShade.value.copy(env.hemi.color).multiplyScalar(0.5 * env.hemi.intensity);
    this.uniforms.uSun.value.copy(env.sun.color).multiplyScalar(0.9 * sunI);
    const cam = g.camera.position;
    const L = env.lightDir;
    const P = this.iPos.array;
    const C = this.iCol.array;
    let n = 0;
    const wind = { x: 0.8, z: 0.6 };
    for (const p of this.list) {
      if (n >= CAP) break;
      let x;
      let y;
      let z;
      let size;
      let alpha;
      let lit = 1;
      if (p.kind === 'plume') {
        p.t = (p.t + dt * 0.012) % 1;
        const t = p.t;
        const s = p.seed;
        // billows straight up out of the crater, then leans over on the wind
        x = this.crater.x + wind.x * t * t * 1700 + Math.sin(t * 7 + s * 9) * 40;
        z = this.crater.z + wind.z * t * t * 1700 + Math.cos(t * 5 + s * 7) * 40;
        y = this.crater.y + 30 + t * 520;
        size = 110 + t * 560;
        alpha = Math.min(1, t * 14) * Math.pow(1 - t, 1.2) * 0.62;
        lit = 0.9;
      } else if (p.kind === 'cloud') {
        const c = p.c;
        const w = this.time * 0.004 + p.seed * 6.28;
        x = c.x + p.ox + Math.sin(w) * 120;
        z = c.z + p.oz + Math.cos(w * 0.8) * 60;
        y = c.y + p.oy;
        size = p.size * (0.95 + Math.sin(w * 1.7) * 0.08);
        alpha = 0.42 + Math.sin(w * 2.3) * 0.08;
      } else {
        // spray drifting off the foot of a cascade
        const w = this.time * 0.5 + p.seed * 6.28;
        x = p.x + Math.sin(w) * 1.5;
        z = p.z + Math.cos(w * 0.7) * 1.5;
        y = p.y + Math.sin(w * 0.9) * 0.6;
        size = p.size;
        alpha = 0.22 + Math.sin(w * 1.3) * 0.06;
        lit = 0.7;
      }
      P[n * 4] = x;
      P[n * 4 + 1] = y;
      P[n * 4 + 2] = z;
      P[n * 4 + 3] = size;
      C[n * 4] = lit;
      // how nearly the light comes from straight behind the puff
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const fw = Math.max(0, (dx * L.x + dy * L.y + dz * L.z) / (Math.hypot(dx, dy, dz) || 1));
      C[n * 4 + 1] = fw * fw * fw * fw * fw * lit;
      C[n * 4 + 2] = 0;
      C[n * 4 + 3] = alpha;
      n++;
    }
    this.puffs.geometry.instanceCount = n;
    this.iPos.needsUpdate = true;
    this.iCol.needsUpdate = true;
  }
}

const _c = new THREE.Color();

// Steep downhill runs in the playable valley walls: start high on a cliff and
// follow the steepest way down until the ground flattens.
function findCascades(W, count) {
  const out = [];
  const rand = mulberry32(W.seed * 17 + 5);
  const half = SIZE / 2 - 120;
  // cliffs within sight of the places people go
  const spots = ['glacier', 'falls', 'landing', 'moose', 'bend', 'tundra'].map((id) => W.place(id)).filter(Boolean);
  for (let t = 0; t < 20000 && out.length < count; t++) {
    const base = spots[t % spots.length];
    const a = rand() * Math.PI * 2;
    const r = 180 + rand() * 650;
    const x = base.x + Math.cos(a) * r;
    const z = base.z + Math.sin(a) * r;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    const h = W.heightAt(x, z);
    if (h < 110 || h > 420) continue;
    if (W.slopeAt(x, z) < 0.95) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 450)) continue;
    const path = [[x, h, z]];
    let px = x;
    let pz = z;
    let ph = h;
    for (let i = 0; i < 90; i++) {
      const e = 2;
      const gx = W.heightAt(px + e, pz) - W.heightAt(px - e, pz);
      const gz = W.heightAt(px, pz + e) - W.heightAt(px, pz - e);
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-3) break;
      px -= (gx / gl) * 3;
      pz -= (gz / gl) * 3;
      const nh = W.heightAt(px, pz);
      if (nh > ph - 0.05) break;
      path.push([px, nh, pz]);
      ph = nh;
      if (W.slopeAt(px, pz) < 0.28 || W.waterAt(px, pz)) break;
    }
    const drop = h - ph;
    if (drop < 55 || path.length < 14) continue;
    out.push({ x, z, path, drop, width: 7 + Math.min(8, drop * 0.05) });
  }
  return out;
}

// A strip of water lying on the slope along a path, widening a little as it
// falls; v runs down the fall for the flowing streaks.
function ribbonGeometry(W, path, width) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = path.length;
  let v = 0;
  const nrm = { x: 0, y: 1, z: 0 };
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const q = path[Math.min(n - 1, i + 1)];
    const o = path[Math.max(0, i - 1)];
    let dx = q[0] - o[0];
    let dz = q[2] - o[2];
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    if (i > 0) v += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1], p[2] - path[i - 1][2]);
    W.normalAt(p[0], p[2], nrm);
    const w = (width * (0.6 + 0.4 * (i / (n - 1)))) / 2;
    const lift = 0.35;
    const sx = -dz * w;
    const sz = dx * w;
    for (const side of [-1, 1]) {
      const x = p[0] + sx * side;
      const z = p[2] + sz * side;
      pos.push(x + nrm.x * lift, W.heightAt(x, z) + nrm.y * lift, z + nrm.z * lift);
      uv.push(side < 0 ? 0 : 1, v / 10);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
