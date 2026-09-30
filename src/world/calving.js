// Glacier calving at Glacier Lake: slabs of ice crack off the face of the
// glacier, topple into the lake with a boom, a splash and a wave, then drift
// away as bobbing icebergs that slowly melt.
import * as THREE from 'three';
import { clamp, mulberry32 } from '../util/math.js';

const RANGE = 560; // the glacier only calves while the player is this close
const MAX_PIECES = 7;
const HALF_PI = Math.PI / 2;

const _q = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);

const SNOW = new THREE.Color(0xeef6fa);
const ICE_A = new THREE.Color(0xbfe3f2);
const ICE_B = new THREE.Color(0x8ccbe6);

// A rough, faceted block of ice with snow on top and blue sides.
function iceGeometry(w, h, d, rand) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, Math.max(2, Math.round(h / 5)), 1).toNonIndexed();
  const pos = geo.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    let o = offsets.get(key);
    if (!o) {
      const top = y > h / 2 - 0.01 ? 1 : 0;
      o = [(rand() - 0.5) * w * 0.16, (rand() - 0.5) * h * 0.06 - top * rand() * h * 0.12, (rand() - 0.5) * d * 0.3];
      offsets.set(key, o);
    }
    pos.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const c = nrm.getY(f) > 0.55 ? SNOW : rand() < 0.55 ? ICE_A : ICE_B;
    for (let k = 0; k < 3; k++) {
      col[(f + k) * 3] = c.r;
      col[(f + k) * 3 + 1] = c.g;
      col[(f + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

export class Calving {
  constructor(game) {
    this.game = game;
    const W = game.world;
    this.lake = W.lakeById.glacier;
    this.level = this.lake.level;
    this.rand = mulberry32(4711);
    this.pieces = [];
    this.timer = 0;
    this.near = false;
    this.announced = false;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0b1c24 });
    this.group = new THREE.Group();
    this.group.name = 'calving';
    game.scene.add(this.group);
    this.ok = this.findFront();
  }

  // Locate the ice cliff: walk from the end of the glacier toward the lake
  // along lines across the tongue and record where the ice meets the water.
  findFront() {
    const W = this.game.world;
    const G = W.glacier;
    const end = G.sample(G.length);
    const dx = this.lake.x - end.x;
    const dz = this.lake.z - end.z;
    const d = Math.hypot(dx, dz) || 1;
    this.dir = { x: dx / d, z: dz / d }; // out of the ice, over the lake
    // across the front, chosen so (side, up, dir) is a right-handed frame
    this.side = { x: this.dir.z, z: -this.dir.x };
    this.front = [];
    for (let o = -80; o <= 80; o += 4) {
      let edge = null;
      for (let t = -30; t <= 60; t += 0.5) {
        const x = end.x + this.dir.x * t + this.side.x * o;
        const z = end.z + this.dir.z * t + this.side.z * o;
        if (W.heightAt(x, z) < this.level + 0.5) {
          edge = t;
          break;
        }
      }
      if (edge === null) continue;
      let top = 0;
      const prof = [];
      for (let b = 1; b <= 14; b += 1) {
        const x = end.x + this.dir.x * (edge - b) + this.side.x * o;
        const z = end.z + this.dir.z * (edge - b) + this.side.z * o;
        const e = W.heightAt(x, z) - this.level;
        prof.push(e);
        top = Math.max(top, e);
      }
      // how far back from the waterline the face reaches its top
      let back = 14;
      for (let b = 0; b < prof.length; b++) {
        if (prof[b] >= top * 0.85) {
          back = b + 1;
          break;
        }
      }
      const x = end.x + this.dir.x * edge + this.side.x * o;
      const z = end.z + this.dir.z * edge + this.side.z * o;
      // only tall ice with open lake water in front of it
      const w = W.waterAt(x + this.dir.x * 10, z + this.dir.z * 10);
      if (top > 14 && w && w.kind === 'glacier' && w.depth > 1) this.front.push({ x, z, top, back });
    }
    if (!this.front.length) return false;
    this.center = this.front[Math.floor(this.front.length / 2)];
    return true;
  }

  update(dt) {
    const g = this.game;
    if (!this.ok || g.paused) return;
    const cam = g.camera.position;
    const c = this.center;
    const near = g.started && Math.hypot(cam.x - c.x, cam.z - c.z) < RANGE;
    if (near && !this.near) this.timer = 8 + this.rand() * 8; // give a first visit a show
    this.near = near;
    if (near) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 35 + this.rand() * 55;
        this.calve();
      }
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      if (!this.updatePiece(this.pieces[i], dt)) this.removePiece(i);
    }
  }

  calve() {
    const g = this.game;
    const r = this.rand;
    const spot = this.front[Math.floor(r() * this.front.length)];
    const big = r() < 0.6;
    const w = big ? 7 + r() * 7 : 4 + r() * 4;
    const d = big ? 3.5 + r() * 2.5 : 3 + r() * 2;
    const top = this.level + spot.top * (0.85 + r() * 0.1);
    const bottom = big ? this.level - 3 : top - (6 + r() * 5);
    const h = top - bottom;
    // slabs start leaning back against the sloping face; chunks break off
    // the lip at the top of it
    const lean = big ? -Math.atan2(spot.back, spot.top) : 0;
    const inset = big ? 0 : spot.back;
    const px = spot.x - this.dir.x * inset;
    const pz = spot.z - this.dir.z * inset;
    const mesh = new THREE.Mesh(iceGeometry(w, h, d, r), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // local frame: x across the ice front, y up, z out over the lake
    const base = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(this.side.x, 0, this.side.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(this.dir.x, 0, this.dir.z))
    );
    const p = {
      mesh,
      w,
      h,
      d,
      base,
      theta: lean,
      omega: 0,
      alpha: big ? 0.9 + r() * 0.5 : 0,
      phase: 'crack',
      t: 0,
      crackT: 0.9 + r() * 0.8,
      big,
      // the outer bottom edge the slab topples over
      pivot: new THREE.Vector3(px, bottom, pz),
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 0,
      life: 150 + r() * 90,
    };
    this.place(p);
    this.pieces.push(p);
    if (this.pieces.length > MAX_PIECES) this.removePiece(0);
    g.audio?.iceCrack(spot.x, spot.z);
    this.powder(p, 24);
    if (!this.announced && Math.hypot(g.camera.position.x - spot.x, g.camera.position.z - spot.z) < RANGE) {
      this.announced = true;
      setTimeout(() => g.hud.toast('The glacier is calving! Stay clear of the ice face'), 900);
    }
  }

  // Orientation from the topple angle; position from the pivot while toppling.
  place(p) {
    _qx.setFromAxisAngle(_axisX, p.theta);
    _q.copy(p.base).multiply(_qx);
    p.mesh.quaternion.copy(_q);
    if (p.phase === 'crack' || p.phase === 'topple') {
      // pivot sits at the bottom of the slab's lake-side face
      _v.set(0, -p.h / 2, p.d / 2).applyQuaternion(_q);
      p.pos.copy(p.pivot).sub(_v);
    }
    p.mesh.position.copy(p.pos);
  }

  updatePiece(p, dt) {
    const g = this.game;
    p.t += dt;
    switch (p.phase) {
      case 'crack':
        // a shiver and falling ice dust before it lets go
        if (Math.random() < dt * 10) this.powder(p, 3);
        if (p.t > p.crackT) {
          p.t = 0;
          if (p.big) p.phase = 'topple';
          else {
            // a chunk off the top just drops down the face
            p.phase = 'fall';
            p.vel.set(this.dir.x * 4.5, 0, this.dir.z * 4.5);
            p.omega = 0.8 + Math.random() * 0.6;
          }
        }
        this.place(p);
        break;
      case 'topple': {
        p.omega += p.alpha * dt;
        p.theta += p.omega * dt;
        const prev = _v.copy(p.pos);
        const px = prev.x;
        const py = prev.y;
        const pz = prev.z;
        this.place(p);
        if (p.theta > 1.15) {
          // let go of the cliff with the velocity it had
          p.vel.set((p.pos.x - px) / dt, (p.pos.y - py) / dt, (p.pos.z - pz) / dt);
          p.phase = 'fall';
          p.t = 0;
        }
        break;
      }
      case 'fall': {
        p.vel.y -= 9.8 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.theta += p.omega * dt;
        this.place(p);
        if (p.pos.y < this.level + this.extent(p) * 0.25) this.impact(p);
        break;
      }
      case 'berg': {
        p.age += dt;
        // settle (big slabs stay tilted with one end in the air), float
        // with a good part showing and drift off the face
        let target = Math.round(p.theta / HALF_PI) * HALF_PI;
        if (p.big && Math.abs(target) > 0.1) target -= Math.sign(target) * 0.3;
        p.theta += (target - p.theta) * Math.min(1, dt * 0.8);
        const ext = this.extent(p);
        const float = this.level - ext * 0.5 + ext * 0.32;
        p.vel.y += (-(p.pos.y - float) * 2.2 - p.vel.y * 1.4) * dt;
        p.pos.y += p.vel.y * dt;
        const drag = Math.exp(-dt * 0.35);
        p.vel.x *= drag;
        p.vel.z *= drag;
        const minDrift = 0.18;
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp < minDrift) {
          p.vel.x += this.dir.x * (minDrift - sp);
          p.vel.z += this.dir.z * (minDrift - sp);
        }
        const nx = p.pos.x + p.vel.x * dt;
        const nz = p.pos.z + p.vel.z * dt;
        const w = g.world.waterAt(nx, nz);
        if (w && w.kind === 'glacier' && w.depth > 0.8) {
          p.pos.x = nx;
          p.pos.z = nz;
        } else {
          p.vel.x = 0;
          p.vel.z = 0;
        }
        // melt away at the end of its life
        const melt = clamp((p.life - p.age) / 30, 0, 1);
        p.mesh.scale.setScalar(0.25 + 0.75 * melt);
        this.place(p);
        if (Math.random() < dt * 0.15) g.effects.ripples.add(p.pos.x, this.level, p.pos.z, Math.max(p.w, p.d) * 0.9, 3.5);
        return p.age < p.life;
      }
    }
    return true;
  }

  // Vertical size of the block at its current tilt.
  extent(p) {
    const c = Math.abs(Math.cos(p.theta));
    const s = Math.abs(Math.sin(p.theta));
    return p.h * c + p.d * s;
  }

  impact(p) {
    const g = this.game;
    const fx = g.effects;
    const L = this.level;
    const size = clamp((p.w * p.h * p.d) / 500, 0.4, 1.6);
    // a wall of spray thrown up along the width of the slab, as tall as the
    // cliff for the big ones
    const n = Math.round(90 + 90 * size);
    for (let i = 0; i < n; i++) {
      const u = (Math.random() - 0.5) * p.w * 1.2;
      const x = p.pos.x + this.side.x * u + (Math.random() - 0.5) * 4;
      const z = p.pos.z + this.side.z * u + (Math.random() - 0.5) * 4;
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      fx.soft.emit(x, L + 0.5, z, Math.cos(a) * sp + this.dir.x * 4, 8 + Math.random() * 16 * size, Math.sin(a) * sp + this.dir.z * 4, 2.2 + Math.random() * 1.6, 1.8 + Math.random() * 2.2, 4.5, 0.92, 0.96, 0.99, 0.95, 9.8, 0.35);
    }
    // a cloud of mist that hangs over the water
    for (let i = 0; i < 28 * size; i++) {
      const u = (Math.random() - 0.5) * p.w * 1.6;
      fx.soft.emit(p.pos.x + this.side.x * u, L + 2 + Math.random() * 10, p.pos.z + this.side.z * u, (Math.random() - 0.5) * 2.5 + this.dir.x * 2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5 + this.dir.z * 2, 6 + Math.random() * 4, 8, 26, 0.93, 0.97, 1.0, 0.3, -0.05, 0.7);
    }
    // the wave: rings spreading across the lake
    fx.ripples.add(p.pos.x, L, p.pos.z, 14 * size + 8, 2.5);
    fx.ripples.add(p.pos.x, L, p.pos.z, 30 * size + 14, 4.5);
    fx.ripples.add(p.pos.x, L, p.pos.z, 55 * size + 25, 7);
    fx.ripples.add(p.pos.x, L, p.pos.z, 90 * size + 40, 10);
    g.audio?.iceBoom(p.pos.x, p.pos.z, size);
    const cam = g.camera.position;
    const dist = Math.hypot(cam.x - p.pos.x, cam.z - p.pos.z);
    if (dist < 260) g.player.shake = Math.min(1, g.player.shake + 0.35 * (1 - dist / 260) * size);
    // slam in, then bob back up as a berg
    p.phase = 'berg';
    p.vel.set(this.dir.x * 1.4, p.vel.y * 0.25, this.dir.z * 1.4);
    p.omega = 0;
  }

  // Ice dust sliding down the face.
  powder(p, n) {
    const fx = this.game.effects;
    const top = p.pos.y + p.h / 2;
    for (let i = 0; i < n; i++) {
      const u = (Math.random() - 0.5) * p.w;
      fx.soft.emit(
        p.pivot.x + this.side.x * u - this.dir.x * 0.5,
        top - Math.random() * 3,
        p.pivot.z + this.side.z * u - this.dir.z * 0.5,
        this.dir.x * (0.6 + Math.random()),
        -1 - Math.random() * 2,
        this.dir.z * (0.6 + Math.random()),
        2.2 + Math.random(),
        1.5,
        5,
        0.93,
        0.97,
        1.0,
        0.55,
        3,
        0.6
      );
    }
  }

  removePiece(i) {
    const p = this.pieces[i];
    this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    this.pieces.splice(i, 1);
  }
}
