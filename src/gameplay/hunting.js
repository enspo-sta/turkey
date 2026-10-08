// Longbow: hold to draw, let go to loose. Arrows fly with gravity and a
// little drag, stick in the ground, in trunks and in rocks, splash into
// water, and can be picked up again by walking over them. AIM narrows the
// view (more with the bow sight); holding a full draw for long makes the aim
// shake. Hit zones on game animals and grizzlies, aim help against a
// charging bear, and claiming downed game.
import * as THREE from 'three';
import { GAME, ARROWS, ARROW_ORDER } from './data.js';
import { ModelBuilder } from '../util/builder.js';
import { clamp } from '../util/math.js';

const ARROW_CAP = 40;
const GRAVITY = 9.81;
const DRAW_TIME = 0.85; // seconds to full draw
const NOCK_TIME = 0.75; // seconds to nock the next arrow
const STUCK_LIFE = 150; // seconds an arrow stays where it landed

const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);

// Arrow along +z: broadhead at the front (z = 0), nock at the back.
export function arrowGeometry(detail = 1) {
  const b = new ModelBuilder();
  const seg = detail ? 6 : 4;
  b.cyl(0.0042, 0.0042, 0.7, seg, { pos: [0, 0, -0.39], rot: [Math.PI / 2, 0, 0], color: 0xc59c62, jitter: 0.02 });
  // broadhead: ferrule and two crossed blades
  b.cyl(0.0035, 0.0048, 0.03, seg, { pos: [0, 0, -0.03], rot: [Math.PI / 2, 0, 0], color: 0x4a4d52, jitter: 0 });
  b.cone(0.012, 0.05, 4, { pos: [0, 0, 0.005], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.18], color: 0x9aa0a6, jitter: 0 });
  b.cone(0.012, 0.05, 4, { pos: [0, 0, 0.005], rot: [Math.PI / 2, 0, Math.PI / 2], scale: [1, 1, 0.18], color: 0x9aa0a6, jitter: 0 });
  // three fletching vanes, the cock feather red
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const col = i === 0 ? 0xc22e26 : 0xe9e1cf;
    const off = 0.012;
    b.box(0.0012, 0.02, 0.1, { pos: [Math.sin(a) * off, Math.cos(a) * off, -0.66], rot: [0, 0, -a], color: col, jitter: 0.03 });
  }
  // nock and cresting bands
  b.cyl(0.0048, 0.0045, 0.018, seg, { pos: [0, 0, -0.745], rot: [Math.PI / 2, 0, 0], color: 0x2a2724, jitter: 0 });
  b.cyl(0.0047, 0.0047, 0.012, seg, { pos: [0, 0, -0.57], rot: [Math.PI / 2, 0, 0], color: 0x1f4d2e, jitter: 0 });
  b.cyl(0.0047, 0.0047, 0.006, seg, { pos: [0, 0, -0.59], rot: [Math.PI / 2, 0, 0], color: 0xd9b23a, jitter: 0 });
  return b.build();
}

export class Hunting {
  constructor(game) {
    this.game = game;
    this.aiming = false;
    this.draw = 0; // 0..1
    this.drawing = false;
    this.nockT = 0; // > 0 while fitting the next arrow
    this.fullT = 0; // time held at full draw
    this.swayT = 0;
    this.shots = 0;
    this.wasHeld = false;
    this.pickedUp = 0;
    // arrows in the world
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(arrowGeometry(0), mat, ARROW_CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // each kind of arrow in its own colour
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.tints = {};
    for (const k of ARROW_ORDER) this.tints[k] = new THREE.Color(ARROWS[k].tint);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = 'arrows';
    game.scene.add(this.mesh);
    this.arrows = [];
  }

  reset() {
    this.setAiming(false);
    // (a draw cut short lets the string down, and its creak with it)
    if (this.drawing) this.letDown();
    this.drawing = false;
    this.draw = 0;
  }

  get speedScale() {
    return this.game.state.gear.yew ? 1.15 : 1;
  }

  setAiming(on) {
    const g = this.game;
    if (on && (g.player.tool !== 'bow' || g.player.mode !== 'foot')) return;
    this.aiming = on;
    if (!on) g.player.lookSway.x = g.player.lookSway.y = 0;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const input = g.input;
    this.updateArrows(dt);
    const active = P.mode === 'foot' && P.tool === 'bow' && !g.menuOpen && !g.hud.blocking;
    if (!active) {
      if (this.aiming) this.setAiming(false);
      if (this.drawing) this.letDown();
      this.wasHeld = false;
      return;
    }
    const s = g.state;
    if (input.pressed('secondary') || input.keyPressed('Mouse2')) this.setAiming(!this.aiming);
    if (input.pressed('arrows') || input.keyPressed('KeyT')) this.nextKind(true);
    if (input.pressed('spray') || input.keyPressed('KeyG')) g.bears.spray();

    // fit the next arrow after a shot
    if (this.nockT > 0) this.nockT = Math.max(0, this.nockT - dt);
    // out of this kind: nock the next kind there is
    if (s.arrowsLeft() <= 0 && s.totalArrows() > 0 && !this.drawing) this.nextKind(false);
    const ready = this.nockT <= 0 && s.arrowsLeft() > 0;

    const held = input.held('primary') || input.key('Space') || input.mouseAction();
    if (held && !this.wasHeld && !ready && s.totalArrows() <= 0) g.hud.toast('Quiver empty. Pick up your arrows or buy more at the Trading Post', 'bad');
    if (held && ready) {
      if (!this.drawing) {
        this.drawing = true;
        this.fullT = 0;
      }
      this.draw = Math.min(1, this.draw + dt / DRAW_TIME);
      if (this.draw >= 1) this.fullT += dt;
      g.audio?.creak?.(this.draw < 1 ? 0.25 + this.draw * 0.5 : 0.06);
    } else if (this.drawing) {
      if (this.draw > 0.22) this.loose();
      else this.letDown();
    }
    this.wasHeld = held;

    // aim sway: calm when aiming and still, growing when a full draw is held
    // too long
    const moving = Math.abs(P.lookDelta.x) + Math.abs(P.lookDelta.y) > 0.0005 || P.speed > 0.5;
    this.swayT += dt;
    if (this.drawing) {
      const steady = s.gear.sight ? 0.6 : 1;
      let amp = (this.aiming ? 0.0016 : 0.003) * steady * (moving ? 1.6 : 1) * (P.health < 50 ? 1.7 : 1);
      if (this.fullT > 3) amp *= 1 + Math.min(3, (this.fullT - 3) * 0.9);
      P.lookSway.x = Math.sin(this.swayT * 0.9) * amp + Math.sin(this.swayT * 2.3) * amp * 0.3;
      P.lookSway.y = Math.sin(this.swayT * 1.3 + 1) * amp * 0.8 + (this.fullT > 3 ? Math.sin(this.swayT * 17) * amp * 0.25 : 0);
    } else if (P.lookSway.x || P.lookSway.y) {
      P.lookSway.x *= Math.max(0, 1 - dt * 6);
      P.lookSway.y *= Math.max(0, 1 - dt * 6);
    }
  }

  // Nock the next kind of arrow there is (tap the arrows chip, or T).
  nextKind(announce) {
    const g = this.game;
    const s = g.state;
    const i = ARROW_ORDER.indexOf(s.gear.arrow);
    for (let k = 1; k <= ARROW_ORDER.length; k++) {
      const kind = ARROW_ORDER[(i + k) % ARROW_ORDER.length];
      if (s.arrowsLeft(kind) > 0) {
        if (kind === s.gear.arrow) break;
        s.gear.arrow = kind;
        if (!this.drawing) this.nockT = Math.max(this.nockT, 0.3);
        g.audio?.tick(1);
        if (announce) g.hud.toast(`${ARROWS[kind].name}: ${s.arrowsLeft(kind)} left`);
        return;
      }
    }
    if (announce) g.hud.toast(s.totalArrows() ? 'Only one kind of arrow in the quiver' : 'Quiver empty');
  }

  letDown() {
    this.drawing = false;
    this.draw = 0;
    this.fullT = 0;
    this.game.audio?.creak?.(0);
  }

  loose() {
    const g = this.game;
    const s = g.state;
    const kind = s.gear.arrow;
    const A = ARROWS[kind];
    const power = this.draw;
    this.drawing = false;
    this.draw = 0;
    this.fullT = 0;
    g.audio?.creak?.(0);
    if (s.arrowsLeft(kind) <= 0) return;
    s.gear.quiver[kind]--;
    this.shots++;
    this.nockT = s.totalArrows() > 0 ? NOCK_TIME : 0;
    const cam = g.camera;
    cam.getWorldDirection(_dir);
    _o.copy(cam.position);
    // a loose from a half draw wanders more
    const spread = (this.aiming ? 0.002 : 0.006) + (1 - power) * 0.012;
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();
    const speed = (24 + 48 * Math.pow(power, 0.8)) * this.speedScale * A.speed;
    // help against a close charging bear when shooting without aiming
    const threat = g.bears.threat;
    if (threat && !this.aiming) {
      const tx = threat.x - _o.x;
      const ty = threat.y + 1.0 - _o.y;
      const tz = threat.z - _o.z;
      const d = Math.hypot(tx, ty, tz);
      if (d < 40) {
        const dot = (tx * _dir.x + ty * _dir.y + tz * _dir.z) / d;
        if (dot > Math.cos(0.22)) {
          const tFlight = d / speed;
          _dir.set(tx, ty + 0.5 * GRAVITY * tFlight * tFlight, tz).normalize();
        }
      }
    }
    // start a little in front of the eye and just below it, where the arrow
    // lies at full draw
    const start = new THREE.Vector3(_o.x + _dir.x * 0.5, _o.y + _dir.y * 0.5 - 0.04, _o.z + _dir.z * 0.5);
    this.spawn(start, _dir.clone().multiplyScalar(speed), (55 + 75 * power) * A.damage, kind);
    g.audio?.twang?.(power);
    if (A.whistle) g.audio?.whistle?.();
    g.viewmodel.loose(power);
    g.player.kick += 0.012;
    g.haptic?.('light');
    // a bowshot is quiet: only animals right next to you hear the string
    g.wildlife.scare(_o.x, _o.z, 12);
  }

  spawn(pos, vel, damage, kind = 'cedar') {
    if (this.arrows.length >= ARROW_CAP) {
      // drop the oldest stuck arrow
      const i = this.arrows.findIndex((a) => a.stuck);
      this.arrows.splice(i >= 0 ? i : 0, 1);
    }
    this.arrows.push({ pos, vel, damage, kind, stuck: false, life: 0, sink: 0, flown: 0, dir: vel.clone().normalize() });
  }

  updateArrows(dt) {
    const g = this.game;
    const W = g.world;
    const P = g.player;
    let n = 0;
    const mat = this.mesh.instanceMatrix.array;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life += dt;
      if (!a.stuck) {
        const x0 = a.pos.x;
        const y0 = a.pos.y;
        const z0 = a.pos.z;
        this.fly(a, dt);
        // a whistler shrieking past a bear sends it running: the closest
        // approach over this frame's flight, so a fast arrow cannot skip it
        if (ARROWS[a.kind].whistle) {
          const sx = a.pos.x - x0;
          const sy = a.pos.y - y0;
          const sz = a.pos.z - z0;
          const ll = sx * sx + sy * sy + sz * sz || 1;
          for (const b of g.bears.bears) {
            if (b.dead || b.state === 'flee' || b.state === 'gone') continue;
            const u = clamp(((b.x - x0) * sx + (b.y + 1 - y0) * sy + (b.z - z0) * sz) / ll, 0, 1);
            if (Math.hypot(b.x - x0 - sx * u, b.y + 1 - y0 - sy * u, b.z - z0 - sz * u) < 9) g.bears.scareOff(b);
          }
        }
      }
      if (a.remove || a.life > STUCK_LIFE || (!a.stuck && a.life > 12)) {
        this.arrows.splice(i, 1);
        continue;
      }
      // walk over an arrow to pick it up
      if (a.stuck && !a.inWater && P.mode === 'foot') {
        const d = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z);
        const s = g.state;
        if (d < 1.5 && Math.abs(a.pos.y - P.pos.y) < 2.2 && s.arrowsLeft(a.kind) < s.arrowCap(a.kind)) {
          s.gear.quiver[a.kind] = s.arrowsLeft(a.kind) + 1;
          this.arrows.splice(i, 1);
          g.audio?.tick(1);
          if (this.pickedUp++ === 0) g.hud.toast('Picked up an arrow', 'good');
          continue;
        }
      }
    }
    for (const a of this.arrows) {
      if (n >= ARROW_CAP) break;
      if (Math.hypot(a.pos.x - g.camera.position.x, a.pos.z - g.camera.position.z) > 250) continue;
      _q.setFromUnitVectors(_z, a.dir);
      let y = a.pos.y;
      if (a.inWater) y -= Math.min(0.5, a.sink);
      _o.set(a.pos.x, y, a.pos.z);
      _m.compose(_o, _q, _s);
      _m.toArray(mat, n * 16);
      this.mesh.setColorAt(n, this.tints[a.kind] || this.tints.cedar);
      n++;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
    void W;
  }

  // One step of flight: gravity and drag, then what the step ran into.
  fly(a, dt) {
    const g = this.game;
    const W = g.world;
    const p0 = _o.copy(a.pos);
    a.vel.y -= GRAVITY * dt;
    a.vel.multiplyScalar(1 - 0.012 * dt);
    const step = a.vel.clone().multiplyScalar(dt);
    const len = step.length();
    const dir = step.clone().divideScalar(len || 1);
    a.dir.copy(dir);
    // game and bears; the test reaches back over the end of the last step,
    // so an animal running at the arrow cannot slip past it between frames
    const back = Math.min(1.2, a.flown);
    const hit = g.wildlife.raycast(p0.x - dir.x * back, p0.y - dir.y * back, p0.z - dir.z * back, dir.x, dir.y, dir.z, len + back);
    if (hit) hit.dist = Math.max(0, hit.dist - back);
    a.flown += len;
    // trunks and rocks
    const solid = this.solidHit(p0, dir, len);
    // ground and water
    const ground = this.groundHit(p0, dir, len);
    let first = null;
    if (hit) first = { kind: 'game', dist: hit.dist, hit };
    if (solid && (!first || solid.dist < first.dist)) first = { kind: solid.kind, dist: solid.dist };
    if (ground && (!first || ground.dist < first.dist)) first = { kind: ground.water ? 'water' : 'ground', dist: ground.dist };
    if (!first) {
      a.pos.add(step);
      if (!W.inBounds(a.pos.x, a.pos.z, -50)) a.remove = true;
      return;
    }
    const hx = p0.x + dir.x * first.dist;
    const hy = p0.y + dir.y * first.dist;
    const hz = p0.z + dir.z * first.dist;
    if (first.kind === 'game') {
      this.lastHit = { species: first.hit.animal.species, zone: first.hit.zone };
      this.onGameHit(first.hit, a, hx, hy, hz);
      a.remove = true;
      return;
    }
    a.stuck = true;
    a.life = 0;
    a.landed = first.kind;
    // the thump of a miss startles whatever stands close to it
    g.wildlife.scare(hx, hz, 20);
    // bury the head a little
    const bury = first.kind === 'wood' ? 0.12 : first.kind === 'rock' ? 0.02 : 0.2;
    a.pos.set(hx + dir.x * bury, hy + dir.y * bury, hz + dir.z * bury);
    if (first.kind === 'water') {
      a.inWater = true;
      a.sink = 0.15;
      g.effects.splash(hx, hy, hz, 0.25);
      g.effects.ripples.add(hx, hy, hz, 0.8, 1);
      g.audio?.plop(0.3);
    } else if (first.kind === 'rock') {
      // glances off stone: lies at the foot of the rock
      a.pos.set(hx - dir.x * 0.3, W.heightAt(hx - dir.x * 0.3, hz - dir.z * 0.3) + 0.03, hz - dir.z * 0.3);
      a.dir.set(dir.x, 0, dir.z).normalize();
      g.effects.dust(hx, hy, hz, 3);
      g.audio?.arrowHit?.(hx, hz, 'rock');
    } else {
      g.effects.dust(hx, hy, hz, first.kind === 'wood' ? 2 : 4);
      g.audio?.arrowHit?.(hx, hz, first.kind);
    }
  }

  onGameHit(hit, arrow, px, py, pz) {
    const g = this.game;
    const a = hit.animal;
    const mult = hit.zone === 'head' ? 3 : hit.zone === 'vital' ? 1.8 : 1;
    const speedK = clamp(arrow.vel.length() / 60, 0.5, 1.2);
    const dmg = arrow.damage * mult * speedK;
    g.effects.puff(px, py, pz, 0.45, 0.2, 0.16, 8);
    g.audio?.arrowHit?.(px, pz, 'game');
    const from = g.player.pos;
    let killed;
    if (a.isBear) {
      a.hp -= dmg;
      killed = a.hp <= 0;
      if (killed) {
        a.dead = true;
        a.state = 'dead';
        a.speed = 0;
      }
      // a whistler that hits is still a whistler: the bear runs
      if (!killed && ARROWS[arrow.kind]?.whistle) g.bears.scareOff(a);
      else g.bears.onHit(a, killed);
    } else killed = g.wildlife.damage(a, dmg, hit.zone, from.x, from.z);
    g.hud.hitmark(killed);
    if (killed) {
      g.hud.toast(`${GAME[a.species].name} down${hit.zone === 'head' ? ' with a clean shot' : ''}`, 'good');
      if (hit.zone === 'head') g.announcer?.say('bullseye', { banner: false });
      if (a.isBear) g.hud.banner(g.bears.downBanner(a), 'good');
    }
    // the rest of the herd bolts
    g.wildlife.scare(px, pz, 70);
  }

  // Trunks, stumps and rocks: vertical cylinders from the collider circles.
  solidHit(o, d, len) {
    const C = this.game.colliders;
    const W = this.game.world;
    const mx = o.x + d.x * len * 0.5;
    const mz = o.z + d.z * len * 0.5;
    const cands = C.circlesNear(mx, mz, len * 0.5 + 1.5);
    let best = null;
    const hl = Math.hypot(d.x, d.z);
    if (hl < 1e-6) return null;
    for (const c of cands) {
      if (c.tag === 'shrub') continue;
      // closest approach of the horizontal ray to the circle centre
      const lx = c.x - o.x;
      const lz = c.z - o.z;
      const tc = (lx * d.x + lz * d.z) / (hl * hl);
      const px = o.x + d.x * tc - c.x;
      const pz = o.z + d.z * tc - c.z;
      const d2 = px * px + pz * pz;
      if (d2 > c.r * c.r) continue;
      const back = Math.sqrt(c.r * c.r - d2) / hl;
      const t = tc - back;
      if (t < 0 || t > len) continue;
      const y = o.y + d.y * t;
      const ground = W.heightAt(c.x, c.z);
      const top = c.tag === 'tree' ? 14 : c.tag === 'rock' ? c.r * 1.3 : c.tag === 'log' ? 0.7 : 2.4;
      if (y < ground - 0.2 || y > ground + top) continue;
      if (!best || t < best.dist) best = { dist: t, kind: c.tag === 'rock' ? 'rock' : 'wood' };
    }
    return best;
  }

  // Ground or water surface along the step.
  groundHit(o, d, len) {
    const W = this.game.world;
    const top = (x, z) => {
      const h = W.heightAt(x, z);
      const w = W.waterAt(x, z);
      return w && w.level > h ? { y: w.level, water: true } : { y: h, water: false };
    };
    const n = Math.max(1, Math.ceil(len / 0.75));
    let prev = 0;
    for (let i = 1; i <= n; i++) {
      const t = (len * i) / n;
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (!W.inBounds(x, z)) return null;
      const s = top(x, z);
      if (y <= s.y) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          const ms = top(o.x + d.x * m, o.z + d.z * m);
          if (o.y + d.y * m <= ms.y) hi = m;
          else lo = m;
        }
        const e = top(o.x + d.x * hi, o.z + d.z * hi);
        return { dist: hi, water: e.water };
      }
      prev = t;
    }
    return null;
  }

  // Nearest downed animal within reach.
  claimable() {
    const g = this.game;
    const P = g.player.pos;
    let best = null;
    let bd = 3.8;
    const all = g.wildlife.animals.concat(g.bears.bears);
    for (const a of all) {
      if (!a.dead || !a.huntable) continue;
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  claim(a) {
    const g = this.game;
    const info = GAME[a.species];
    const weight = Math.round({ caribou: 130, moose: 480, deer: 55, sheep: 80, bear: 290, blackbear: 115, goat: 78 }[a.species] * a.scale * (0.9 + Math.random() * 0.2));
    const value = Math.round(info.value * a.scale);
    g.state.trophies.push({ species: a.species, name: info.name, weight, value });
    g.state.hunted[a.species] = (g.state.hunted[a.species] || 0) + 1;
    g.state.stats.hunted++;
    g.hud.toast(`${info.name} field dressed. Sell it at the Trading Post (${'$' + value})`, 'money');
    g.audio?.cash();
    g.onEvent({ type: 'hunt', animal: a.species });
    if (a.isBear) g.bears.remove(a);
    else g.wildlife.removeAnimal(a);
    g.save();
  }
}
