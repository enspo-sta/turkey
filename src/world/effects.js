// Particle effects (splashes, mist, dust, exhaust, chimney smoke, campfire
// sparks), expanding water ripples and rain.
import * as THREE from 'three';
import { makeSoftDotTexture } from '../util/textures.js';

const _lc = new THREE.Color();

const pVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const pFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uTex;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// Steam, spray, mist, dust and smoke take the light of the hour: the sky's
// and the sun's colour (dim and blue by moonlight, warm at dawn), and they
// glow when the sun is behind them, as droplets do. Worked out once per
// particle in the vertex stage.
const litVert = pVert
  .replace(
    'uniform float uScale;',
    `uniform float uScale;
uniform vec3 uLight;
uniform vec3 uGlow;
uniform vec3 uLightDir;`
  )
  .replace(
    'vColor = aColor;',
    `vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float fwd = pow(max(dot(normalize(wp - cameraPosition), uLightDir), 0.0), 5.0);
  vColor = vec4(aColor.rgb * (uLight + uGlow * fwd), aColor.a);`
  );

class ParticlePool {
  constructor(max, tex, additive, lit = false) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aColor', this.aColor);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uScale: { value: 400 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uGlow: { value: new THREE.Color(0, 0, 0) },
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      },
      vertexShader: lit ? litVert : pVert,
      fragmentShader: pFrag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    let i = this.count;
    if (i >= this.max) {
      // overwrite a random live particle
      i = Math.floor(Math.random() * this.max);
    } else this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = s0;
    this.size1[i] = s1;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.alpha[i] = a;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt) {
    let n = this.count;
    const P = this.pos;
    const V = this.vel;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        const j = n;
        if (i !== j) {
          P[i * 3] = P[j * 3];
          P[i * 3 + 1] = P[j * 3 + 1];
          P[i * 3 + 2] = P[j * 3 + 2];
          V[i * 3] = V[j * 3];
          V[i * 3 + 1] = V[j * 3 + 1];
          V[i * 3 + 2] = V[j * 3 + 2];
          this.life[i] = this.life[j];
          this.maxLife[i] = this.maxLife[j];
          this.size0[i] = this.size0[j];
          this.size1[i] = this.size1[j];
          this.col[i * 3] = this.col[j * 3];
          this.col[i * 3 + 1] = this.col[j * 3 + 1];
          this.col[i * 3 + 2] = this.col[j * 3 + 2];
          this.alpha[i] = this.alpha[j];
          this.grav[i] = this.grav[j];
          this.drag[i] = this.drag[j];
        }
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      V[i * 3] *= d;
      V[i * 3 + 1] = V[i * 3 + 1] * d - this.grav[i] * dt;
      V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
    }
    this.count = n;
    const ap = this.aPos.array;
    const as = this.aSize.array;
    const ac = this.aColor.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      ap[i * 3] = P[i * 3];
      ap[i * 3 + 1] = P[i * 3 + 1];
      ap[i * 3 + 2] = P[i * 3 + 2];
      as[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      ac[i * 4] = this.col[i * 3];
      ac[i * 4 + 1] = this.col[i * 3 + 1];
      ac[i * 4 + 2] = this.col[i * 3 + 2];
      const fadeIn = Math.min(1, t * 8);
      ac[i * 4 + 3] = this.alpha[i] * fadeIn * (1 - t) * (1 - t * 0.2);
    }
    this.points.geometry.setDrawRange(0, n);
    this.aPos.clearUpdateRanges();
    this.aPos.addUpdateRange(0, n * 3);
    this.aPos.needsUpdate = true;
    this.aSize.clearUpdateRanges();
    this.aSize.addUpdateRange(0, n);
    this.aSize.needsUpdate = true;
    this.aColor.clearUpdateRanges();
    this.aColor.addUpdateRange(0, n * 4);
    this.aColor.needsUpdate = true;
  }
}

const rVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aRip; // x,y,z, age 0..1 (negative = dead)
attribute float aScale;
varying float vAge;
varying vec2 vUv;
void main() {
  vAge = aRip.w;
  vUv = uv;
  float s = aScale * (0.25 + aRip.w * 1.0);
  vec3 p = vec3(position.x * s, 0.0, -position.y * s) + aRip.xyz;
  if (aRip.w < 0.0) p = vec3(0.0, -9999.0, 0.0);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const rFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
varying float vAge;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.55, 0.78, r) * (1.0 - smoothstep(0.82, 1.0, r));
  float a = ring * (1.0 - vAge) * 0.7;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class Ripples {
  constructor(max = 96) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    ig.attributes.position = geo.attributes.position;
    ig.attributes.uv = geo.attributes.uv;
    this.aRip = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-1), 4).setUsage(THREE.DynamicDrawUsage);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute('aRip', this.aRip);
    ig.setAttribute('aScale', this.aScale);
    ig.instanceCount = max;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xe8f0f0) }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: rVert,
      fragmentShader: rFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(ig, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.items = [];
    this.next = 0;
  }

  add(x, y, z, size = 2, life = 1.6) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.items[i] = { x, y: y + 0.03, z, t: 0, life, size };
  }

  update(dt) {
    const a = this.aRip.array;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it) {
        a[i * 4 + 3] = -1;
        continue;
      }
      it.t += dt;
      const age = it.t / it.life;
      if (age >= 1) {
        this.items[i] = null;
        a[i * 4 + 3] = -1;
        continue;
      }
      a[i * 4] = it.x;
      a[i * 4 + 1] = it.y;
      a[i * 4 + 2] = it.z;
      a[i * 4 + 3] = age;
      this.aScale.array[i] = it.size;
    }
    this.aRip.needsUpdate = true;
    this.aScale.needsUpdate = true;
  }
}

class Rain {
  constructor(count = 1600) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.seed[i * 3] = Math.random() * 60 - 30;
      this.seed[i * 3 + 1] = Math.random() * 30;
      this.seed[i * 3 + 2] = Math.random() * 60 - 30;
    }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.mesh = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.t = 0;
  }

  update(dt, cam, intensity) {
    this.mesh.visible = intensity > 0.05;
    if (!this.mesh.visible) return;
    this.t += dt;
    const n = Math.floor(this.count * intensity);
    const p = this.attr.array;
    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    for (let i = 0; i < this.count; i++) {
      if (i >= n) {
        p[i * 6 + 1] = -9999;
        p[i * 6 + 4] = -9999;
        continue;
      }
      const sx = this.seed[i * 3];
      const sz = this.seed[i * 3 + 2];
      let y = (this.seed[i * 3 + 1] - this.t * 22) % 30;
      if (y < 0) y += 30;
      const wx = cx + sx + ((this.t * 1.5) % 4);
      const wz = cz + sz;
      p[i * 6] = wx;
      p[i * 6 + 1] = cy - 12 + y;
      p[i * 6 + 2] = wz;
      p[i * 6 + 3] = wx + 0.05;
      p[i * 6 + 4] = cy - 12 + y + 0.7;
      p[i * 6 + 5] = wz;
    }
    this.attr.needsUpdate = true;
    this.mesh.material.opacity = 0.18 + intensity * 0.22;
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    const tex = makeSoftDotTexture();
    // soft: lit by the sun and the sky; glow: sparks and flames, their own light
    this.soft = new ParticlePool(2400, tex, false, true);
    this.glow = new ParticlePool(600, tex, true);
    this.ripples = new Ripples();
    this.rain = new Rain();
    this.group.add(this.soft.points, this.glow.points, this.ripples.mesh, this.rain.mesh);
    this.smokeT = 0;
    this.mistT = 0;
    this.fireT = 0;
  }

  resize(w, h, dpr) {
    const s = (h * dpr) / 2 / Math.tan((this.game.camera.fov * Math.PI) / 360);
    this.soft.material.uniforms.uScale.value = s;
    this.glow.material.uniforms.uScale.value = s;
  }

  splash(x, y, z, strength = 1) {
    const n = Math.floor(10 + strength * 22);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.8) * strength;
      this.soft.emit(
        x,
        y + 0.05,
        z,
        Math.cos(a) * sp,
        2 + Math.random() * 3.5 * strength,
        Math.sin(a) * sp,
        0.6 + Math.random() * 0.5,
        0.12 * strength + 0.05,
        0.05,
        0.85,
        0.92,
        0.95,
        0.85,
        9.8,
        0.5
      );
    }
    for (let i = 0; i < 4 + strength * 4; i++) {
      this.soft.emit(x, y + 0.2, z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2, 1.2, 0.5 * strength, 1.6 * strength, 0.9, 0.95, 0.97, 0.35, 0.3, 1.5);
    }
    this.ripples.add(x, y, z, 2.2 + strength * 2.5, 1.8);
    if (strength > 0.8) this.ripples.add(x, y, z, 1.4 + strength * 1.5, 1.2);
  }

  dust(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      this.soft.emit(
        x + (Math.random() - 0.5),
        y + Math.random() * 0.4,
        z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2,
        1.3 + Math.random(),
        0.5,
        2.2,
        0.62,
        0.55,
        0.44,
        0.4,
        0.2,
        1.2
      );
    }
  }

  exhaust(x, y, z, dx, dz) {
    this.soft.emit(x, y, z, dx * 2 + (Math.random() - 0.5), 0.4 + Math.random() * 0.4, dz * 2 + (Math.random() - 0.5), 1.1, 0.18, 1.0, 0.55, 0.56, 0.58, 0.32, -0.3, 1.5);
  }

  puff(x, y, z, r, g, b, n = 10) {
    for (let i = 0; i < n; i++) {
      this.soft.emit(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.8, 0.2, 0.6, r, g, b, 0.7, 3, 2);
    }
  }

  sparkle(x, y, z, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.glow.emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 1 + Math.random() * 0.6, 0.25, 0.05, 1.0, 0.8, 0.3, 1.0, 3, 1);
    }
  }

  update(dt) {
    const g = this.game;
    this.smokeT += dt;
    this.mistT += dt;
    this.fireT += dt;
    // chimney smoke
    if (g.props && this.smokeT > 0.35) {
      this.smokeT = 0;
      for (const p of g.props.smokePoints) {
        if (p.distanceTo(g.camera.position) > 400) continue;
        this.soft.emit(p.x, p.y, p.z, 0.4 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 0.2, 6, 0.6, 3.5, 0.72, 0.72, 0.74, 0.28, -0.05, 0.1);
      }
    }
    // Bear Falls mist
    if (g.fallsMist && this.mistT > 0.05) {
      this.mistT = 0;
      const m = g.fallsMist;
      if (m.distanceTo(g.camera.position) < 500) {
        for (let i = 0; i < 2; i++) {
          this.soft.emit(
            m.x + (Math.random() - 0.5) * m.w,
            m.y + Math.random() * 1.5,
            m.z + (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1.5,
            1 + Math.random() * 1.5,
            (Math.random() - 0.5) * 1.5 + m.dz * 1.5,
            2.2,
            1.0,
            4.0,
            0.92,
            0.95,
            0.97,
            0.22,
            -0.1,
            0.6
          );
        }
        if (Math.random() < 0.3) this.ripples.add(m.x + (Math.random() - 0.5) * m.w, m.y, m.z + m.dz * (2 + Math.random() * 6), 2 + Math.random() * 3, 1.5);
      }
    }
    // campfire flames and sparks
    if (g.props && this.fireT > 0.06) {
      this.fireT = 0;
      const night = g.env.night;
      for (const f of g.props.fires) {
        const dx = f.x - g.camera.position.x;
        const dz = f.z - g.camera.position.z;
        if (dx * dx + dz * dz > 160 * 160) continue;
        const a = 0.7 + night * 0.3;
        this.glow.emit(f.x + (Math.random() - 0.5) * 0.3, f.y + 0.25, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3, 0.45, 0.55, 0.15, 1.0, 0.45 + Math.random() * 0.25, 0.12, a, -1, 1);
        if (Math.random() < 0.3) this.glow.emit(f.x, f.y + 0.4, f.z, (Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 1.4, 0.07, 0.03, 1.0, 0.6, 0.2, a, 0.5, 0.5);
        if (Math.random() < 0.25) this.soft.emit(f.x, f.y + 0.9, f.z, 0.2, 0.9, 0.1, 4, 0.4, 2.2, 0.5, 0.5, 0.52, 0.16, -0.05, 0.2);
      }
    }
    // the light of the hour, scaled so the noon look is unchanged
    const env = g.env;
    const u = this.soft.material.uniforms;
    u.uLight.value.copy(env.sun.color).multiplyScalar(env.sun.intensity * 0.24).add(_lc.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.36));
    u.uGlow.value.copy(env.sun.color).multiplyScalar(env.sun.intensity * 0.4);
    u.uLightDir.value.copy(env.lightDir);
    this.soft.update(dt);
    this.glow.update(dt);
    this.ripples.update(dt);
    this.rain.update(dt, g.camera, g.env.weather.rain);
  }
}
