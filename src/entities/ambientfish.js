// Fish you can spot through the water: small schools holding in the current
// at the fishing hotspots and in nearby pools. Species come from the same
// pools the bites use, so a school of red sockeye means sockeye can bite.
// One instanced mesh; colours per instance (back, flank, head) and a swimming
// wiggle in the vertex shader. Light absorption under water comes from the
// shared world shading, so deeper fish fade into the green-blue.
import * as THREE from 'three';
import { FISH, speciesPool } from '../gameplay/data.js';
import { lengthFor } from './fishmodels.js';
import { fxPatch } from '../world/worldfx.js';
import { clamp, damp, dampAngle, angleDiff } from '../util/math.js';

const CAP = 56;

// Colours seen from above and the side, per species (linear-ish sRGB hex).
const LOOK = {
  pink: { back: 0x3c4a3c, side: 0x8a928a, head: 0x3c4a3c },
  sockeye: { back: 0xa01e16, side: 0xb82a1c, head: 0x40602c },
  coho: { back: 0x2a4258, side: 0x929ca4, head: 0x2a4258 },
  king: { back: 0x323f48, side: 0x8a9290, head: 0x323f48 },
  chum: { back: 0x48503e, side: 0x6e6a5c, head: 0x48503e },
  rainbow: { back: 0x3e5230, side: 0xa87a7e, head: 0x3e5230 },
  dolly: { back: 0x34483f, side: 0x8a9688, head: 0x34483f },
  grayling: { back: 0x3e404e, side: 0x76748a, head: 0x3e404e },
  char: { back: 0x283c36, side: 0xb85c2c, head: 0x283c36 },
  laker: { back: 0x3e4436, side: 0x72725c, head: 0x3e4436 },
  pike: { back: 0x303e1c, side: 0x667c3c, head: 0x303e1c },
  burbot: { back: 0x3e3828, side: 0x66583c, head: 0x3e3828 },
  halibut: { back: 0x40392c, side: 0x4c4538, head: 0x40392c },
  lingcod: { back: 0x4a4a30, side: 0x74744a, head: 0x4a4a30 },
  yelloweye: { back: 0xb04014, side: 0xd06a26, head: 0xb04014 },
  cod: { back: 0x5a5444, side: 0x888066, head: 0x5a5444 },
};

// How many swim together, and how wide the body is (width, height per length).
const HABIT = {
  pink: { school: [5, 9], w: 0.16, h: 0.22 },
  sockeye: { school: [6, 11], w: 0.15, h: 0.22 },
  coho: { school: [4, 7], w: 0.15, h: 0.21 },
  king: { school: [2, 4], w: 0.16, h: 0.22 },
  chum: { school: [3, 6], w: 0.16, h: 0.21 },
  rainbow: { school: [2, 4], w: 0.15, h: 0.2 },
  dolly: { school: [3, 5], w: 0.14, h: 0.18 },
  grayling: { school: [3, 6], w: 0.13, h: 0.2 },
  char: { school: [3, 6], w: 0.15, h: 0.19 },
  laker: { school: [1, 3], w: 0.15, h: 0.18 },
  pike: { school: [1, 2], w: 0.12, h: 0.14 },
  burbot: { school: [1, 2], w: 0.12, h: 0.12 },
  halibut: { school: [1, 1], w: 0.5, h: 0.1 },
  lingcod: { school: [1, 2], w: 0.16, h: 0.17 },
  yelloweye: { school: [2, 4], w: 0.2, h: 0.3 },
  cod: { school: [2, 4], w: 0.17, h: 0.2 },
};

// Unit fish along +z (head at +0.5, tail at -0.5). aRegion: x back (0 belly
// .. 1 back), y head weight, z bend weight (0 head .. 1 tail tip).
function fishGeometry() {
  const pos = [];
  const reg = [];
  const idx = [];
  const rings = [
    [0.5, 0.0, 0.0],
    [0.44, 0.45, 0.55],
    [0.32, 0.85, 0.9],
    [0.15, 1.0, 1.0],
    [-0.05, 0.92, 0.92],
    [-0.22, 0.62, 0.66],
    [-0.36, 0.3, 0.36],
    [-0.42, 0.18, 0.24],
  ];
  const seg = 8;
  for (let r = 0; r < rings.length; r++) {
    const [z, sw, sh] = rings[r];
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const cy = Math.cos(a);
      pos.push(Math.sin(a) * 0.5 * sw, cy * 0.5 * sh, z);
      reg.push(cy * 0.5 + 0.5, clamp((z - 0.2) / 0.3, 0, 1), clamp((0.2 - z) / 0.7, 0, 1));
    }
    if (r > 0) {
      const b0 = (r - 1) * seg;
      const b1 = r * seg;
      for (let s = 0; s < seg; s++) {
        const s1 = (s + 1) % seg;
        idx.push(b0 + s, b1 + s, b0 + s1, b0 + s1, b1 + s, b1 + s1);
      }
    }
  }
  const v0 = pos.length / 3;
  // tail fin (vertical fan)
  pos.push(0, 0, -0.4, 0, 0.36, -0.62, 0, -0.34, -0.62, 0, 0, -0.52);
  reg.push(0.7, 0, 0.85, 0.9, 0, 1, 0.4, 0, 1, 0.6, 0, 0.95);
  idx.push(v0, v0 + 1, v0 + 3, v0, v0 + 3, v0 + 2, v0, v0 + 3, v0 + 1, v0, v0 + 2, v0 + 3);
  // dorsal fin
  const v1 = pos.length / 3;
  pos.push(0, 0.46, 0.14, 0, 0.62, -0.02, 0, 0.44, -0.12);
  reg.push(1, 0, 0.3, 1, 0, 0.45, 1, 0, 0.55);
  idx.push(v1, v1 + 1, v1 + 2, v1, v1 + 2, v1 + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fishMaterial(time) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute vec3 aRegion;
        attribute vec3 iBack;
        attribute vec3 iSide;
        attribute vec3 iHead;
        attribute vec3 iSwim;`
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec4( 1.0 );
        vColor.rgb = mix( mix( iSide, iBack, smoothstep( 0.35, 0.8, aRegion.x ) ), iHead, aRegion.y );`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float bend = aRegion.z;
        float ph = iSwim.x + uTime * iSwim.z;
        transformed.x += sin( ph - position.z * 6.0 ) * iSwim.y * bend * bend * 0.16;`
      );
    fxPatch(shader, mat);
  };
  return mat;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class AmbientFish {
  constructor(game) {
    this.game = game;
    this.time = { value: 0 };
    const geo = fishGeometry();
    const attr = (n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(n, a);
      return a;
    };
    this.aBack = attr('iBack');
    this.aSide = attr('iSide');
    this.aHead = attr('iHead');
    this.aSwim = attr('iSwim');
    this.mesh = new THREE.InstancedMesh(geo, fishMaterial(this.time), CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.name = 'ambientFish';
    game.scene.add(this.mesh);
    this.schools = [];
    this.fish = [];
    this.scanT = 0;
    this.density = 1;
  }

  setDensity(f) {
    this.density = f;
    this.scanT = 0;
  }

  // Fish near (x, z) bolt away, e.g. when the float lands on top of them.
  scare(x, z, radius = 4) {
    for (const f of this.fish) {
      const dx = f.x - x;
      const dz = f.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        f.flee = 1.2 + Math.random() * 0.8;
        f.fleeYaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8;
      }
    }
  }

  pickSpecies(w, place) {
    const g = this.game;
    const pool = speciesPool(w, g.world, place ? place.id : null, g.env.isNight).filter((p) => p.w > 0.05 && LOOK[p.id]);
    const run = g.state.salmonRun;
    if (run && place && run.place === place.id && w.kind === 'river' && Math.random() < 0.6) return 'sockeye';
    let t = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    for (const p of pool) {
      t -= p.w;
      if (t <= 0) return p.id;
    }
    return pool.length ? pool[0].id : 'pink';
  }

  addSchool(x, z, radius, place, anchor) {
    const W = this.game.world;
    const w = W.waterAt(x, z);
    if (!w || w.depth < 0.6) return null;
    const species = this.pickSpecies(w, place);
    const hab = HABIT[species];
    const run = this.game.state.salmonRun;
    const bonus = run && place && run.place === place.id && species === 'sockeye' ? 5 : 0;
    const n = Math.round((hab.school[0] + Math.random() * (hab.school[1] - hab.school[0]) + bonus) * this.density);
    const school = { x, z, radius, level: w.level, kind: w.kind, species, anchor, fish: [] };
    const look = LOOK[species];
    const f = FISH[species];
    for (let i = 0; i < n && this.fish.length < CAP; i++) {
      const kg = f.min + (f.max - f.min) * Math.pow(Math.random(), 2.2) * 0.6;
      const L = clamp(lengthFor(species, kg) / 100, 0.22, 1.3);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const fish = {
        school,
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        y: w.level - 0.5,
        ox: Math.cos(a) * r,
        oz: Math.sin(a) * r,
        yaw: Math.random() * Math.PI * 2,
        speed: 0,
        depthK: 0.35 + Math.random() * 0.55,
        L,
        phase: Math.random() * 10,
        freq: 5 + Math.random() * 2,
        wander: Math.random() * 10,
        flee: 0,
        fleeYaw: 0,
        checkT: Math.random(),
        back: _c.set(look.back).toArray(),
        side: _c.set(look.side).toArray(),
        head: _c.set(look.head).toArray(),
        w: hab.w,
        h: hab.h,
        flat: species === 'halibut',
      };
      school.fish.push(fish);
      this.fish.push(fish);
    }
    this.schools.push(school);
    return school;
  }

  removeSchool(s) {
    this.schools.splice(this.schools.indexOf(s), 1);
    this.fish = this.fish.filter((f) => f.school !== s);
  }

  // Keep schools at the current hotspots and a few pools in front of the
  // player; drop the ones left far behind.
  scan() {
    const g = this.game;
    const W = g.world;
    const P = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
    const hs = g.fishing ? g.fishing.hotspots : [];
    const place = g.fishing ? g.fishing.hotPlace : null;
    for (let i = this.schools.length - 1; i >= 0; i--) {
      const s = this.schools[i];
      const gone = s.anchor ? !hs.includes(s.anchor) : Math.hypot(s.x - P.x, s.z - P.z) > 75;
      if (gone) this.removeSchool(s);
    }
    if (this.density <= 0) return;
    for (const h of hs) {
      if (!this.schools.some((s) => s.anchor === h) && this.fish.length < CAP - 4) this.addSchool(h.x, h.z, h.r * 0.9, place, h);
    }
    const free = this.schools.filter((s) => !s.anchor).length;
    if (free < 3 && this.fish.length < CAP - 6) {
      const yaw = g.player.yaw;
      for (let t = 0; t < 14; t++) {
        const a = yaw + Math.PI + (Math.random() - 0.5) * 2.4;
        const d = 10 + Math.random() * 38;
        const x = P.x + Math.sin(a) * d;
        const z = P.z + Math.cos(a) * d;
        if (!W.inBounds(x, z, 5)) continue;
        const w = W.waterAt(x, z);
        if (!w || w.depth < 0.9) continue;
        if (this.schools.some((s) => Math.hypot(s.x - x, s.z - z) < 14)) continue;
        this.addSchool(x, z, 2 + Math.random() * 2.5, place && Math.hypot(place.x - x, place.z - z) < 160 ? place : null, null);
        break;
      }
    }
  }

  update(dt) {
    const g = this.game;
    if (g.paused && g.started) return;
    this.time.value += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1.5;
      this.scan();
    }
    const W = g.world;
    const cam = g.camera.position;
    let n = 0;
    const back = this.aBack.array;
    const side = this.aSide.array;
    const head = this.aHead.array;
    const swim = this.aSwim.array;
    const mat = this.mesh.instanceMatrix.array;
    for (const f of this.fish) {
      const s = f.school;
      f.wander += dt * 0.35;
      // personal station within the school, slowly shifting
      const tx = s.x + f.ox + Math.sin(f.wander * 0.7 + f.phase) * s.radius * 0.35;
      const tz = s.z + f.oz + Math.cos(f.wander * 0.5 + f.phase * 1.3) * s.radius * 0.35;
      let desired;
      let targetSpeed;
      f.checkT -= dt;
      if (f.checkT <= 0) {
        f.checkT = 0.4 + Math.random() * 0.3;
        const w = W.waterAt(f.x, f.z);
        if (w) {
          f.flowX = w.flowX;
          f.flowZ = w.flowZ;
          f.level = w.level;
          f.depth = w.depth;
        }
      }
      if (f.flee > 0) {
        f.flee -= dt;
        desired = f.fleeYaw;
        targetSpeed = 3.2;
      } else {
        const dx = tx - f.x;
        const dz = tz - f.z;
        const dist = Math.hypot(dx, dz);
        if (s.kind === 'river' && f.flowX !== undefined) {
          // hold facing upstream, slipping sideways to the station
          const up = Math.atan2(-f.flowX, -f.flowZ);
          desired = up + clamp(angleDiff(up, Math.atan2(dx, dz)), -0.6, 0.6) * clamp(dist / 2, 0, 1);
          targetSpeed = clamp(dist * 0.5, 0, 0.9);
        } else {
          desired = dist > 0.3 ? Math.atan2(dx, dz) : f.yaw;
          targetSpeed = clamp(dist * 0.35, 0.05, 0.7);
        }
      }
      f.yaw = dampAngle(f.yaw, desired, f.flee > 0 ? 8 : 1.6, dt);
      f.speed = damp(f.speed, targetSpeed, 2.5, dt);
      let nx = f.x + Math.sin(f.yaw) * f.speed * dt;
      let nz = f.z + Math.cos(f.yaw) * f.speed * dt;
      if (s.kind === 'river' && f.flowX !== undefined && f.flee <= 0) {
        // the current pushes back what the fish does not swim against
        const hold = 1 - clamp(f.speed / 0.9, 0, 1);
        nx += f.flowX * dt * 0.15 * hold;
        nz += f.flowZ * dt * 0.15 * hold;
      }
      const w2 = W.waterAt(nx, nz);
      if (w2 && w2.depth > 0.45) {
        f.x = nx;
        f.z = nz;
      } else {
        f.yaw += Math.PI * 0.6;
        f.flee = 0;
      }
      const level = f.level ?? s.level;
      const depth = f.depth ?? 1;
      const sink = clamp(depth * f.depthK, 0.45, Math.max(0.45, depth - 0.18));
      f.y = damp(f.y, level - (f.flat ? Math.max(0.3, depth - 0.1) : sink), 1.5, dt);
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      if (d > 90 || n >= CAP) continue;
      // tilt into turns, a gentle roll while holding
      _e.set(f.flat ? 0 : Math.sin(f.wander * 2 + f.phase) * 0.06, f.yaw, f.flat ? 0 : Math.sin(f.wander * 1.3) * 0.1);
      _q.setFromEuler(_e);
      _p.set(f.x, f.y, f.z);
      if (f.flat) _s.set(f.L * f.w * 1.6, f.L * f.h, f.L);
      else _s.set(f.L * f.w * 1.25, f.L * f.h * 1.2, f.L);
      _m.compose(_p, _q, _s);
      _m.toArray(mat, n * 16);
      back.set(f.back, n * 3);
      side.set(f.side, n * 3);
      head.set(f.head, n * 3);
      swim[n * 3] = f.phase;
      swim[n * 3 + 1] = 0.35 + clamp(f.speed, 0, 3) * 0.35 + (f.flee > 0 ? 0.4 : 0);
      swim[n * 3 + 2] = f.freq * (1 + f.speed * 0.8);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      for (const a of [this.aBack, this.aSide, this.aHead, this.aSwim]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 3);
        a.needsUpdate = true;
      }
    }
  }
}
