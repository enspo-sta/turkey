// Gus's paraglider. With it, GLIDE from high ground where the land drops
// away ahead: the canopy fills and you fly. Steer with the stick (or A/D),
// push forward to dive, pull back to brake; look round freely while you fly.
// You land when your feet touch ground, a deck or water; a treetop, a roof,
// a rock or a pole ends the flight early, and at the edge of the map a
// headwind turns you back. At trim the wing sinks 1.15 m a
// second at 10 m/s, a glide of about 8.7 to 1.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { clamp, damp, lerp } from '../util/math.js';
import { HALF } from '../world/worldgen.js';

export const GLIDE = {
  speed: 10,
  sink: 1.15,
  diveSpeed: 14,
  diveSink: 2.9,
  brakeSpeed: 7.5,
  brakeSink: 0.95,
  turn: 0.95,
};

// The ground at least this far below your feet 25 m ahead, for a launch.
const DROP = 12;

export class Glider {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = GLIDE.speed;
    this.sink = GLIDE.sink;
    this.bank = 0;
    this.look = 0;
    this.lookT = 0;
    this.t = 0;
    this.from = null;
    this.edgeWarned = false;
    this.canopy = this.buildCanopy();
    this.canopy.visible = false;
    game.scene.add(this.canopy);
  }

  get owned() {
    return !!this.game.state.flags.glider;
  }

  get flying() {
    return this.game.player.mode === 'glide';
  }

  // A red and yellow ram-air wing of eleven cells on an arc about 11 m from
  // tip to tip, its middle 7 m over the pilot's feet and a little ahead
  // (-z), on lines gathered to the risers at the shoulders.
  buildCanopy() {
    const b = new ModelBuilder();
    const cells = 11;
    const R = 6.4;
    const arc = 1.9;
    const cw = (R * arc) / cells;
    for (let i = 0; i < cells; i++) {
      const a = ((i + 0.5) / cells - 0.5) * arc;
      // deeper and thicker in the middle, slimmer toward the tips
      const k = 1 - Math.abs(a) / arc;
      b.box(cw * 1.04, 0.2 + 0.16 * k, 1.5 + 1.1 * k, { pos: [Math.sin(a) * R, Math.cos(a) * R + 0.6, -0.5], rot: [0.12, 0, -a], color: i % 2 ? 0xf2c230 : 0xd8322a, jitter: 0.02 });
    }
    for (let i = 0; i <= cells; i++) {
      const a = (i / cells - 0.5) * arc;
      const top = [Math.sin(a) * (R - 0.2), Math.cos(a) * (R - 0.2) + 0.6, -0.5];
      b.beam(top, [Math.sign(a) * 0.25, 1.35, 0], 0.01, 3, { color: 0x222222, jitter: 0 });
    }
    // the cells are closed boxes: one side is enough (fewer pixels drawn);
    // the sun shines through the fabric like through leaves, and the canopy
    // is never under water
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    mat.userData.fx = 'foliage dry';
    const m = new THREE.Mesh(b.build(), mat);
    m.frustumCulled = false;
    m.castShadow = true;
    m.name = 'paraglider';
    return m;
  }

  // On foot with the glider, at an edge: the ground 25 m ahead lies DROP
  // metres or more below your feet and nothing rises in between.
  canLaunch() {
    const g = this.game;
    const P = g.player;
    const W = g.world;
    if (!this.owned || P.mode !== 'foot' || P.boat) return false;
    if (P.water && P.water.depth > 0.2) return false;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const ax = P.pos.x + fx * 25;
    const az = P.pos.z + fz * 25;
    if (!W.inBounds(ax, az, 40)) return false;
    let low = W.heightAt(ax, az);
    const w = W.waterAt(ax, az);
    if (w) low = Math.max(low, w.level);
    if (P.pos.y - low < DROP) return false;
    // on the way out, metre by metre: no ground rising above your feet, no
    // water as high as the wing will be (it sinks about 0.12 m a metre at
    // first), no crate or wall right in front, and no treetop or rock where
    // the wing passes
    for (let t = 1; t <= 25; t++) {
      const x = P.pos.x + fx * t;
      const z = P.pos.z + fz * t;
      const y = P.pos.y + 0.3 - 0.12 * t;
      if (W.heightAt(x, z) > P.pos.y + 0.8) return false;
      const wa = W.waterAt(x, z);
      if (wa && wa.level > y - 0.1) return false;
      if (t <= 6 && this.boxAt(x, P.pos.y + 0.3, z)) return false;
      if (this.obstacleAt(x, y, z) || this.obstacleAt(x, y + 1.2, z)) return false;
    }
    return true;
  }

  // canLaunch for the GLIDE button: worked out again only when you have
  // moved or turned, or a few frames have gone by (GLIDE itself checks
  // afresh)
  offer() {
    const g = this.game;
    const P = g.player;
    const k = this.offerKey;
    if (k && g.time - k.t < 0.15 && Math.abs(P.pos.x - k.x) < 0.3 && Math.abs(P.pos.z - k.z) < 0.3 && Math.abs(P.yaw - k.yaw) < 0.05 && k.mode === P.mode) return k.ok;
    const ok = this.canLaunch();
    this.offerKey = { t: g.time, x: P.pos.x, z: P.pos.z, yaw: P.yaw, mode: P.mode, ok };
    return ok;
  }

  launch() {
    const g = this.game;
    const P = g.player;
    if (!this.canLaunch()) return;
    P.mode = 'glide';
    g.onEvent?.({ type: 'flight' });
    P.running = false;
    P.vel.set(0, 0, 0);
    P.bobAmt = 0;
    this.from = { x: P.pos.x, z: P.pos.z, yaw: P.yaw };
    // from the water's surface when you stand in a little water
    const w = g.world.waterAt(P.pos.x, P.pos.z);
    this.pos.set(P.pos.x, (w && !P.onDeck ? Math.max(P.pos.y, w.level) : P.pos.y) + 0.3, P.pos.z);
    this.heading = P.yaw;
    // a running start: the wing fills and gets up to speed
    this.speed = 6;
    this.sink = 0.4;
    this.bank = 0;
    this.look = 0;
    this.lookT = 0;
    this.t = 0;
    // the take-off run: your feet stay on the ground until it drops away
    this.run = true;
    // the stick or keys still held from walking to the edge steer nothing
    // until they are let go or moved, each way on its own (W held from the
    // walk stays off when you add A to turn)
    const mv = g.input.readMove();
    this.hold = { x: mv.x, y: mv.y };
    this.edgeWarned = false;
    this.canopy.visible = true;
    g.audio?.gust?.();
    g.hud?.prompt('', 'hot', 0);
    const s = g.state;
    if (!s.flags.glided) {
      s.flags.glided = true;
      g.hud?.toast(g.input.usingTouch ? 'Drag the left side to steer: up dives, down brakes. Look round with the right side' : 'A and D steer, W dives, S brakes. Touch down to land', 'good');
    }
  }

  update(dt, input) {
    const g = this.game;
    const P = g.player;
    const W = g.world;
    this.t += dt;
    // looking round turns the view, not the wing; it drifts back ahead
    const look = input.readLook();
    P.lookDelta.x = look.dx;
    P.lookDelta.y = look.dy;
    if (look.dx || look.dy) this.lookT = 1.6;
    this.lookT -= dt;
    this.look = clamp(this.look - look.dx, -2.4, 2.4);
    if (this.lookT <= 0) this.look = damp(this.look, 0, 1.2, dt);
    P.pitch = clamp(P.pitch - look.dy, -1.3, 1.0);

    const mv = input.readMove();
    let turn = clamp(mv.x, -1, 1);
    let push = clamp(-mv.y, -1, 1);
    const H = this.hold;
    if (H) {
      if (H.x !== null && (Math.abs(mv.x) < 0.15 || Math.abs(mv.x - H.x) > 0.35)) H.x = null;
      if (H.y !== null && (Math.abs(mv.y) < 0.15 || Math.abs(mv.y - H.y) > 0.35)) H.y = null;
      if (H.x !== null) turn = 0;
      if (H.y !== null) push = 0;
    }
    // for the hands on the brakes (entities/viewmodel.js)
    this.turnIn = turn;
    this.pushIn = push;
    // the edge of the map: the wind turns you back toward the middle
    const lim = HALF - 30;
    if (Math.abs(this.pos.x) > lim - 20 || Math.abs(this.pos.z) > lim - 20) {
      const home = Math.atan2(this.pos.x, this.pos.z);
      const diff = Math.atan2(Math.sin(home - this.heading), Math.cos(home - this.heading));
      this.heading += clamp(diff, -1, 1) * GLIDE.turn * dt;
      if (!this.edgeWarned) {
        this.edgeWarned = true;
        g.hud?.toast('A headwind at the edge of the map turns you back');
      }
    } else this.heading -= turn * GLIDE.turn * dt;
    const tSpeed = push >= 0 ? lerp(GLIDE.speed, GLIDE.diveSpeed, push) : lerp(GLIDE.speed, GLIDE.brakeSpeed, -push);
    const tSink = (push >= 0 ? lerp(GLIDE.sink, GLIDE.diveSink, push) : lerp(GLIDE.sink, GLIDE.brakeSink, -push)) + Math.abs(turn) * 0.45;
    this.speed = damp(this.speed, tSpeed, 1.4, dt);
    this.sink = damp(this.sink, tSink, 1.8, dt);
    this.bank = damp(this.bank, turn * 0.32, 3, dt);

    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const nx = clamp(this.pos.x + fx * this.speed * dt, -lim, lim);
    const nz = clamp(this.pos.z + fz * this.speed * dt, -lim, lim);
    const ny = this.pos.y - this.sink * dt;

    // a treetop, a rock or a pole in the way ends the flight at its foot
    const hit = this.obstacleAt(nx, ny, nz);
    if (hit) {
      const c = hit.c;
      const ox = nx - c.x;
      const oz = nz - c.z;
      const l = Math.hypot(ox, oz) || 1;
      const r = c.r + 0.6;
      g.hud?.toast(hit.tree ? 'You snag a treetop and climb down' : 'Bonk! You glance off it and drop to the ground');
      this.land(c.x + (ox / l) * r, c.z + (oz / l) * r, null, ny + 0.3);
      return;
    }
    // a roof or a wall: bump into it and slide down beside it (pushed out at
    // the height you hit it, so a pier's side wall leaves you in the water
    // beside it, not inside it)
    const box = this.boxAt(nx, ny, nz);
    if (box) {
      const r = g.colliders.resolve(nx, nz, 0.45, ny, 1.8);
      g.hud?.toast('Bonk! You slide down off the roof');
      this.land(r.x, r.z, null, ny + 0.3);
      return;
    }
    // water, ground or a deck under your feet
    const w = W.waterAt(nx, nz);
    if (w && ny <= w.level + 0.05) {
      this.splashdown(nx, nz, w);
      return;
    }
    const ground = P.groundAt(nx, nz, ny + 0.3);
    let y = ny;
    if (this.run && (this.t > 2.5 || ny - ground > 1.2)) this.run = false;
    if (ny <= ground) {
      // running up a little rise before the edge: keep running
      if (this.run && ground - this.pos.y < this.speed * dt * 1.25 + 0.02) y = ground + 0.02;
      else {
        this.land(nx, nz, ground);
        return;
      }
    }
    this.pos.set(nx, y, nz);
    P.pos.copy(this.pos);
    P.yaw = this.heading + this.look;
    this.place();
  }

  // The tree whose crown the pilot is in (see the crowns in
  // world/scatter.js), or the rock, post or tower in the way: { c, tree }.
  // A circle with no height of its own (hi) stands 2.5 m, a rock about as
  // tall as its radius; a rock under water has its top.
  obstacleAt(x, y, z) {
    const g = this.game;
    const W = g.world;
    for (const c of g.colliders.circlesNear(x, z, 7)) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (c.tag === 'tree' || c.tag === 'shrub') {
        const h = y - W.heightAt(c.x, c.z);
        if (h > (c.hi ?? 14) || h < 0) continue;
        let reach = c.r + 0.3;
        if (c.cr && h >= c.lo) {
          const f = (h - c.lo) / (c.hi - c.lo);
          const k = c.cone ? 1 - f : Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
          reach = Math.max(reach, c.cr * k * 0.8);
        }
        if (d < reach) return { c, tree: true };
        continue;
      }
      if (d > c.r + 0.3) continue;
      const top = c.top ?? W.heightAt(c.x, c.z) + (c.hi ?? (c.tag === 'rock' ? Math.max(0.5, c.r * 1.1) : 2.5));
      if (y < top) return { c, tree: false };
    }
    return null;
  }

  // The building, car, sign or crate the pilot flies into, if any.
  boxAt(x, y, z) {
    const W = this.game.world;
    for (const b of this.game.colliders.boxes) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > (b.radius + 0.5) ** 2) continue;
      // a rail you could step over has its own height for the glider
      // (glideTop); with no height at all: the hot rod 1.5 m, a sign, pump
      // or outhouse 2.6 m, a cabin or the Trading Post 6 m
      const top = b.glideTop ?? (b.yMax < 1e8 ? b.yMax : W.heightAt(b.x, b.z) + (b.tag === 'car' ? 1.5 : Math.max(b.hx, b.hz) < 1.6 ? 2.6 : 6));
      if (y > top || y + 1.8 < b.yMin) continue;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) < b.hx + 0.4 && Math.abs(lz) < b.hz + 0.4) return b;
    }
    return null;
  }

  // Back on your feet: carry a little of the speed into a few running steps.
  // With no ground given, the ground (or a deck no higher than fromY) under
  // that spot, and deep water there means a swim ashore.
  land(x, z, ground, fromY = 1e9) {
    const g = this.game;
    const P = g.player;
    if (ground === null) {
      ground = P.groundAt(x, z, fromY);
      const w = P._deck ? null : g.world.waterAt(x, z);
      if (w && w.depth > 0.9) {
        this.splashdown(x, z, w);
        return;
      }
    }
    this.end();
    P.pos.set(x, ground, z);
    P.vel.set(-Math.sin(this.heading) * this.speed * 0.35, 0, -Math.cos(this.heading) * this.speed * 0.35);
    P.yaw = this.heading + this.look;
    g.audio?.step?.(P.surface, null, true);
    if (!g.state.flags.landed) {
      g.state.flags.landed = true;
      g.hud?.toast('Touchdown! GLIDE again from any edge', 'good');
    }
  }

  // Into a lake, the river or the sea: swim to the nearest shore you can
  // stand on, glider and all.
  splashdown(x, z, w) {
    const g = this.game;
    const W = g.world;
    g.audio?.splash?.(1, x, z);
    if (w.depth <= 0.9) {
      this.land(x, z, W.heightAt(x, z));
      g.hud?.toast('Splash! A soggy landing in the shallows');
      return;
    }
    let spot = null;
    for (let r = 4; r <= 160 && !spot; r += 4) {
      for (let a = 0; a < 24 && !spot; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const sx = x + Math.cos(ang) * r;
        const sz = z + Math.sin(ang) * r;
        if (!W.inBounds(sx, sz, 30)) continue;
        const ww = W.waterAt(sx, sz);
        if (!ww || ww.depth < 0.6) spot = { x: sx, z: sz };
      }
    }
    if (!spot) spot = this.from || { x, z };
    this.land(spot.x, spot.z, null);
    g.hud?.toast('Splashdown! You swim ashore, glider and all');
  }

  // Ends a flight without a landing (fast travel, the title screen).
  end() {
    const P = this.game.player;
    if (P.mode === 'glide') P.mode = 'foot';
    this.canopy.visible = false;
  }

  // The wing above you, turned with the flight and banked into turns.
  place() {
    const c = this.canopy;
    c.position.copy(this.pos);
    c.rotation.set(0, this.heading, -this.bank * 0.8, 'YXZ');
  }

  applyCamera(cam) {
    const P = this.game.player;
    const sway = Math.sin(this.t * 1.3) * 0.015;
    cam.position.set(this.pos.x, this.pos.y + P.eye - 0.15, this.pos.z);
    cam.rotation.set(P.pitch + sway, this.heading + this.look, -this.bank, 'YXZ');
  }

  // Height above the ground (or water) under you.
  height() {
    const W = this.game.world;
    let gnd = W.heightAt(this.pos.x, this.pos.z);
    const w = W.waterAt(this.pos.x, this.pos.z);
    if (w) gnd = Math.max(gnd, w.level);
    return this.pos.y - gnd;
  }
}
