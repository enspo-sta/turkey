// The fishing boat: a sixteen-foot aluminium skiff with an outboard, on a
// trailer that hitches to the hot rod. Tow it anywhere, back it toward the
// water and LAUNCH; BOARD it and run the lakes, the river and the bay; FISH
// from it at anchor; LOAD it back on the trailer when you are done.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { clamp, damp, lerp, wrapAngle } from '../util/math.js';

// the trailer: hitch ball to axle, and the axle to the rear rollers
const TONGUE = 3.5;
const TAIL = 1.9;
// the boat sits on the trailer with its middle this far behind the hitch
const BOAT_ON_TRAILER = 3.3;
const HITCH_BACK = 2.45;
const DECK = 0.32;

export const BOAT = { price: 1500, motorPrice: 900, top: [8.5, 13.5] };

// A lofted hull from cross sections, stern to bow: half beam at the
// gunwale, half width of the flat bottom, keel, chine and gunwale heights.
const SECTIONS = [
  [-2.3, 0.82, 0.62, -0.04, 0.03, 0.56],
  [-1.4, 0.86, 0.66, -0.07, 0.0, 0.56],
  [-0.2, 0.87, 0.65, -0.08, 0.0, 0.57],
  [0.9, 0.8, 0.54, -0.07, 0.03, 0.6],
  [1.65, 0.64, 0.34, 0.0, 0.1, 0.65],
  [2.15, 0.4, 0.14, 0.14, 0.22, 0.71],
  [2.5, 0.06, 0.03, 0.34, 0.38, 0.77],
];

function hullGeometry(inner) {
  const pos = [];
  const inset = inner ? 0.035 : 0;
  const pts = SECTIONS.map(([z, gw, bw, keel, chine, gun]) => [
    [-(gw - inset), gun, z],
    [-(bw - inset * 0.7), chine + inset, z],
    [0, keel + inset * 1.2, z],
    [bw - inset * 0.7, chine + inset, z],
    [gw - inset, gun, z],
  ]);
  const quad = (a, b, c, d) => {
    // a b along one section, c d along the next; outward winding for the
    // outer skin, inward for the inner
    if (inner) pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    else pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    for (let k = 0; k < 4; k++) quad(A[k], A[k + 1], B[k], B[k + 1]);
  }
  // the transom across the stern
  const T = pts[0];
  const tri = (a, b, c) => (inner ? pos.push(...a, ...b, ...c) : pos.push(...a, ...c, ...b));
  tri(T[0], T[1], T[2]);
  tri(T[0], T[2], T[4]);
  tri(T[2], T[3], T[4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildBoat(motor) {
  const b = new ModelBuilder();
  b.add(hullGeometry(false), { color: 0xb9c0c6 });
  b.add(hullGeometry(true), { color: 0x7d858c });
  // painted stripe along the outside and the bow number
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    const [z0, g0, , , , h0] = SECTIONS[i];
    const [z1, g1, , , , h1] = SECTIONS[i + 1];
    for (const sd of [-1, 1]) {
      b.beam([sd * (g0 + 0.004), h0 - 0.07, z0], [sd * (g1 + 0.004), h1 - 0.07, z1], 0.035, 4, { color: 0xc8361e });
      // the gunwale rail
      b.beam([sd * g0, h0 + 0.01, z0], [sd * g1, h1 + 0.01, z1], 0.028, 5, { color: 0x8d949a });
    }
  }
  // three bench seats and a front deck
  for (const [z, w] of [
    [-1.75, 0.8],
    [-0.35, 0.84],
    [0.95, 0.76],
  ])
    b.box(w * 2 - 0.04, 0.05, 0.36, { pos: [0, 0.38, z], color: 0x9a7448 });
  b.box(0.7, 0.05, 0.55, { pos: [0, 0.55, 2.0], color: 0x8d949a });
  // floor boards
  b.box(1.1, 0.03, 3.8, { pos: [0, 0.02, -0.2], color: 0x6f5a3f });
  // a red fuel tank, a cooler and a rod in a holder
  b.box(0.42, 0.24, 0.3, { pos: [0.35, 0.16, -2.0], color: 0xc42b1c });
  b.box(0.56, 0.32, 0.36, { pos: [-0.25, 0.2, 0.3], color: 0xf0efe8 });
  b.box(0.58, 0.04, 0.38, { pos: [-0.25, 0.38, 0.3], color: 0x2d6fb0 });
  b.beam([0.78, 0.5, -1.2], [0.95, 1.9, -0.2], 0.012, 4, { color: 0x222222 });
  // the outboard on the transom: clamp bracket, cowling, shaft, lower unit,
  // skeg, propeller and the tiller
  const big = motor > 0;
  const cw = big ? 0.42 : 0.34;
  b.box(0.18, 0.2, 0.12, { pos: [0, 0.5, -2.36], color: 0x2a2c30 });
  b.box(cw, big ? 0.48 : 0.4, big ? 0.6 : 0.5, { pos: [0, 0.82, -2.6], color: big ? 0xd8d8d8 : 0x1d1f22 });
  b.box(cw + 0.02, 0.06, big ? 0.62 : 0.52, { pos: [0, big ? 1.07 : 1.03, -2.6], color: 0xe86a1a });
  b.box(0.12, 0.62, 0.14, { pos: [0, 0.33, -2.52], color: 0x26282c });
  b.box(0.15, 0.16, 0.3, { pos: [0, -0.06, -2.55], color: 0x26282c });
  b.box(0.03, 0.18, 0.16, { pos: [0, -0.2, -2.55], color: 0x26282c });
  for (let i = 0; i < 3; i++) b.box(0.025, 0.2, 0.06, { pos: [0, -0.06, -2.72], rot: [0, 0, (i * Math.PI * 2) / 3], color: 0x9aa0a6 });
  b.beam([0, 0.86, -2.35], [0.05, 0.78, -1.75], 0.025, 5, { color: 0x1d1f22 });
  return b.build();
}

function buildTrailer() {
  const b = new ModelBuilder();
  const steel = 0x8d9399;
  const dark = 0x2a2c2f;
  // coupler and tongue
  b.box(0.16, 0.12, 0.34, { pos: [0, 0.48, -0.1], color: dark });
  b.beam([0, 0.46, -0.2], [0, 0.42, -1.4], 0.06, 5, { color: steel });
  b.beam([0, 0.42, -1.4], [-0.55, 0.38, -2.6], 0.055, 5, { color: steel });
  b.beam([0, 0.42, -1.4], [0.55, 0.38, -2.6], 0.055, 5, { color: steel });
  // side rails and cross members
  for (const sd of [-1, 1]) b.beam([sd * 0.55, 0.38, -2.6], [sd * 0.62, 0.36, -(TONGUE + TAIL)], 0.05, 5, { color: steel });
  for (const z of [-2.6, -TONGUE, -(TONGUE + TAIL)]) b.beam([-0.62, 0.36, z], [0.62, 0.36, z], 0.045, 5, { color: steel });
  // carpeted bunks the hull rests on
  for (const sd of [-1, 1]) b.box(0.12, 0.08, 3.4, { pos: [sd * 0.42, 0.46, -3.85], color: 0x2c3a52 });
  // the winch post with its winch and a bow roller
  b.beam([0, 0.42, -1.5], [0, 1.0, -1.35], 0.04, 5, { color: steel });
  b.cyl(0.08, 0.08, 0.18, 8, { pos: [0, 0.86, -1.32], rot: [0, 0, Math.PI / 2], color: dark });
  b.cyl(0.05, 0.05, 0.2, 8, { pos: [0, 1.02, -1.46], rot: [0, 0, Math.PI / 2], color: 0xd8d8d8 });
  // axle, fenders and tail lights
  b.beam([-0.95, 0.3, -TONGUE], [0.95, 0.3, -TONGUE], 0.04, 5, { color: dark });
  for (const sd of [-1, 1]) {
    b.box(0.3, 0.04, 0.8, { pos: [sd * 0.95, 0.62, -TONGUE], color: steel });
    b.box(0.1, 0.08, 0.06, { pos: [sd * 0.62, 0.38, -(TONGUE + TAIL) - 0.03], color: 0xd2231a });
  }
  return b.build();
}

function buildWheel() {
  const b = new ModelBuilder();
  b.cyl(0.3, 0.3, 0.2, 14, { rot: [0, 0, Math.PI / 2], color: 0x1d1d1d });
  b.cyl(0.16, 0.16, 0.21, 10, { rot: [0, 0, Math.PI / 2], color: 0xc8ccd0 });
  b.box(0.215, 0.06, 0.24, { color: 0x1d1d1d });
  return b.build();
}

const _v = new THREE.Vector3();
const _e = new THREE.Euler();

export class Boat {
  constructor(game) {
    this.game = game;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.45 });
    this.mat = mat;
    this.group = new THREE.Group();
    this.boatMesh = new THREE.Mesh(buildBoat(0), mat);
    this.boatMesh.castShadow = true;
    this.trailerGroup = new THREE.Group();
    const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
    this.trailer = new THREE.Mesh(buildTrailer(), tmat);
    this.trailer.castShadow = true;
    this.trailerGroup.add(this.trailer);
    this.wheels = [];
    const wg = buildWheel();
    for (const sd of [-1, 1]) {
      const w = new THREE.Mesh(wg, tmat);
      w.position.set(sd * 0.95, 0.3, -TONGUE);
      this.trailerGroup.add(w);
      this.wheels.push(w);
    }
    this.group.add(this.trailerGroup, this.boatMesh);
    game.scene.add(this.group);
    this.group.visible = false;
    this.owned = false;
    this.motor = 0;
    // 'trailer' (riding on it), 'water' (afloat) or 'moving' (sliding on or off)
    this.where = 'trailer';
    // trailer axle and heading
    this.axle = new THREE.Vector2();
    this.tYaw = 0;
    this.tPitch = 0;
    this.spin = 0;
    // the boat afloat
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.pitch = 0;
    this.roll = 0;
    this.occupied = false;
    this.camMode = 'seat';
    this.camYaw = 0;
    this.camPitch = -0.08;
    this.chasePos = new THREE.Vector3();
    this.wakeT = 0;
    this.warnT = -10;
    this.slide = null;
    this.anchored = false;
  }

  // ------------------------------------------------------------ ownership
  setOwned(owned, motor = 0) {
    this.owned = owned;
    if (motor !== this.motor) {
      this.motor = motor;
      this.boatMesh.geometry.dispose();
      this.boatMesh.geometry = buildBoat(motor);
    }
    this.group.visible = owned;
  }

  // The hitch ball behind the hot rod's bumper.
  hitch(out = _v) {
    const car = this.game.hotrod;
    return out.set(car.pos.x - Math.sin(car.yaw) * HITCH_BACK, car.pos.y + 0.45, car.pos.z - Math.cos(car.yaw) * HITCH_BACK);
  }

  // Put the trailer straight behind the car (after a fast travel or a load).
  resetTrailer() {
    const car = this.game.hotrod;
    const h = this.hitch();
    this.axle.set(h.x - Math.sin(car.yaw) * TONGUE, h.z - Math.cos(car.yaw) * TONGUE);
    this.tYaw = car.yaw;
  }

  // The back of the trailer, where the boat slides off.
  rear() {
    return {
      x: this.axle.x - Math.sin(this.tYaw) * TAIL,
      z: this.axle.y - Math.cos(this.tYaw) * TAIL,
    };
  }

  // Water deep enough to float the boat behind (or beside) the trailer.
  launchSpot() {
    const W = this.game.world;
    const r = this.rear();
    for (let d = 0; d <= 12; d += 1) {
      for (const off of [0, 0.5, -0.5, 1, -1]) {
        const a = this.tYaw + Math.PI + off;
        const x = r.x + Math.sin(a) * d;
        const z = r.z + Math.cos(a) * d;
        const w = W.waterAt(x, z);
        if (w && w.depth > 0.8) return { x, z, w, yaw: this.tYaw + Math.PI };
      }
    }
    return null;
  }

  canLaunch() {
    return this.owned && this.where === 'trailer' && Math.abs(this.game.hotrod.speed) < 1.2 && !!this.launchSpot();
  }

  // The boat close enough to the trailer to winch it back on.
  canLoad() {
    if (!this.owned || this.where !== 'water' || Math.abs(this.speed) > 1.5) return false;
    const r = this.rear();
    return Math.hypot(this.pos.x - r.x, this.pos.z - r.z) < 14;
  }

  launch() {
    const s = this.launchSpot();
    if (!s) return false;
    const from = this.boatOnTrailer();
    this.slide = { t: 0, dur: 1.6, from, to: { x: s.x, y: s.w.level, z: s.z, yaw: s.yaw }, then: 'water' };
    this.where = 'moving';
    this.speed = 0;
    this.game.audio?.splash(0.8, s.x, s.z);
    this.game.hud?.toast('Boat in the water. Walk up to it and BOARD', 'good');
    return true;
  }

  load() {
    const g = this.game;
    if (this.occupied) this.leave(true);
    const to = this.boatOnTrailer();
    this.slide = { t: 0, dur: 1.8, from: { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw }, to, then: 'trailer' };
    this.where = 'moving';
    this.speed = 0;
    this.anchored = false;
    g.audio?.tone?.('square', 140, 0.6, 0.03, { f2: 90 });
    g.hud?.toast('Winched onto the trailer. Ready to tow', 'good');
  }

  // Where the boat rides on the trailer, in the world.
  boatOnTrailer() {
    const x = this.axle.x + Math.sin(this.tYaw) * (TONGUE - BOAT_ON_TRAILER);
    const z = this.axle.y + Math.cos(this.tYaw) * (TONGUE - BOAT_ON_TRAILER);
    const y = this.trailerGroup.position.y - Math.sin(this.tPitch) * BOAT_ON_TRAILER + 0.42;
    return { x, y, z, yaw: this.tYaw };
  }

  // ---------------------------------------------------------------- boarding
  canBoard() {
    const g = this.game;
    if (!this.owned || this.where !== 'water' || g.player.mode !== 'foot' || g.player.boat) return false;
    return Math.hypot(this.pos.x - g.player.pos.x, this.pos.z - g.player.pos.z) < 6;
  }

  board() {
    const g = this.game;
    g.fishing.cancel();
    g.hunting.reset();
    g.player.mode = 'boat';
    g.player.boat = null;
    this.occupied = true;
    this.anchored = false;
    this.camYaw = 0;
    this.camPitch = -0.08;
    g.input.leftZoneMode = 'move';
    g.hud.hint('Hold GAS for the outboard, steer by dragging on the left. FISH to drop anchor and cast.', 5);
  }

  // Drop anchor and fish from the boat: you stand in it with your rod.
  fishHere() {
    const g = this.game;
    const P = g.player;
    this.occupied = false;
    this.anchored = true;
    this.speed = 0;
    P.mode = 'foot';
    P.boat = this;
    P.tool = 'rod';
    g.viewmodel.setTool('rod');
    const s = this.standPoint();
    P.pos.set(s.x, s.y, s.z);
    P.yaw = this.yaw + Math.PI;
    P.pitch = -0.1;
    g.hud.toast('Anchor down. Cast all around the boat', 'good');
  }

  // Take the tiller again after fishing.
  takeHelm() {
    const g = this.game;
    g.fishing.cancel();
    g.player.boat = null;
    this.board();
  }

  // Step off: onto the nearest dry ground, or into the car's seat when the
  // boat is loaded.
  leave(force = false) {
    const g = this.game;
    const P = g.player;
    if (!force && Math.abs(this.speed) > 1.5) {
      g.hud.toast('Slow down first');
      return false;
    }
    const spot = this.shoreSpot();
    if (!spot && !force) {
      g.hud.toast('Get closer to the shore to step off');
      return false;
    }
    this.occupied = false;
    P.boat = null;
    P.mode = 'foot';
    const at = spot || g.hotrod.exitPoint(1);
    P.place(at.x, at.z, this.yaw);
    return true;
  }

  // Dry ground within a few metres of the boat.
  shoreSpot() {
    const W = this.game.world;
    let best = null;
    for (let r = 1.5; r <= 7 && !best; r += 0.75) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = this.pos.x + Math.sin(a) * r;
        const z = this.pos.z + Math.cos(a) * r;
        const w = W.waterAt(x, z);
        if ((!w || w.depth < 0.25) && W.slopeAt(x, z) < 0.6) {
          best = { x, z };
          break;
        }
      }
    }
    return best;
  }

  // Dry ground in reach, checked twice a second.
  nearShore() {
    const t = this.game.time;
    if (t - (this.shoreT || -9) > 0.5) {
      this.shoreT = t;
      this.shoreCache = this.where === 'water' ? this.shoreSpot() : null;
    }
    return this.shoreCache;
  }

  // Where you stand when fishing from the boat: the middle bench.
  standPoint() {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const lz = -0.35;
    return { x: this.pos.x + s * lz, y: this.pos.y + 0.08, z: this.pos.z + c * lz };
  }

  // ------------------------------------------------------------------ update
  update(dt, input) {
    if (!this.owned) return;
    const g = this.game;
    const car = g.hotrod;
    // the trailer follows the hitch: the axle trails the ball at the
    // tongue's length, and never folds past a jackknife
    const h = this.hitch();
    let dx = h.x - this.axle.x;
    let dz = h.z - this.axle.y;
    let L = Math.hypot(dx, dz);
    if (L < 1e-3 || L > TONGUE * 3) {
      this.resetTrailer();
      dx = h.x - this.axle.x;
      dz = h.z - this.axle.y;
      L = Math.hypot(dx, dz);
    }
    let yaw = Math.atan2(dx, dz);
    let rel = wrapAngle(yaw - car.yaw);
    // backing up straightens it a little, as a careful driver would
    if (car.speed < -0.3) rel *= 1 - Math.min(1, dt * 0.9);
    rel = clamp(rel, -1.25, 1.25);
    yaw = car.yaw + rel;
    const before = this.axle.clone();
    this.axle.set(h.x - Math.sin(yaw) * TONGUE, h.z - Math.cos(yaw) * TONGUE);
    this.tYaw = yaw;
    this.spin += (this.axle.distanceTo(before) / 0.3) * Math.sign(car.speed || 1);
    const W = g.world;
    const ay = Math.max(W.heightAt(this.axle.x, this.axle.y), -2.5);
    this.tPitch = Math.atan2(h.y - 0.45 - ay, TONGUE);
    this.trailerGroup.position.set(h.x, h.y - 0.45, h.z);
    this.trailerGroup.rotation.set(0, 0, 0);
    this.trailerGroup.rotation.order = 'YXZ';
    this.trailerGroup.rotation.y = yaw;
    this.trailerGroup.rotation.x = -this.tPitch;
    for (const w of this.wheels) w.rotation.x = this.spin;
    car.towing = this.where === 'trailer';

    if (this.slide) this.updateSlide(dt);
    else if (this.where === 'trailer') {
      if (this.wasAfloat) {
        this.wasAfloat = false;
        g.audio?.updateOutboard?.(0, 0, 999, false);
      }
      const p = this.boatOnTrailer();
      this.pos.set(p.x, p.y, p.z);
      this.yaw = p.yaw;
      this.pitch = this.tPitch;
      this.roll = 0;
    } else {
      this.wasAfloat = true;
      this.updateAfloat(dt, input);
    }
    this.boatMesh.position.copy(this.pos);
    this.boatMesh.rotation.set(0, 0, 0);
    this.boatMesh.rotation.order = 'YXZ';
    this.boatMesh.rotation.y = this.yaw;
    this.boatMesh.rotation.x = -this.pitch;
    this.boatMesh.rotation.z = this.roll;
  }

  updateSlide(dt) {
    const S = this.slide;
    S.t += dt;
    const u = clamp(S.t / S.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    this.pos.set(lerp(S.from.x, S.to.x, e), lerp(S.from.y, S.to.y, e) + Math.sin(u * Math.PI) * 0.25, lerp(S.from.z, S.to.z, e));
    // off the trailer she swings round once she floats; onto it she lines
    // up as the winch pulls
    const ey = S.then === 'water' ? clamp((u - 0.55) / 0.45, 0, 1) : e;
    this.yaw = S.from.yaw + wrapAngle(S.to.yaw - S.from.yaw) * ey * ey * (3 - 2 * ey);
    this.pitch = Math.sin(u * Math.PI) * 0.12;
    if (u >= 1) {
      this.slide = null;
      this.where = S.then;
      if (S.then === 'water') {
        this.game.effects?.splash(this.pos.x, this.pos.y, this.pos.z, 1.1);
        this.game.effects?.ripples.add(this.pos.x, this.pos.y, this.pos.z, 4, 1.3);
      }
    }
  }

  updateAfloat(dt, input) {
    const g = this.game;
    const W = g.world;
    let throttle = 0;
    let reverse = 0;
    let steerIn = 0;
    if (this.occupied) {
      throttle = input.held('gas') || input.key('KeyW') || input.key('ArrowUp') ? 1 : 0;
      reverse = input.held('brake') || input.key('KeyS') || input.key('ArrowDown') ? 1 : 0;
      steerIn = input.stick.active ? input.stick.x * 1.25 : 0;
      if (input.key('KeyA') || input.key('ArrowLeft')) steerIn -= 1;
      if (input.key('KeyD') || input.key('ArrowRight')) steerIn += 1;
      steerIn = clamp(steerIn, -1, 1);
    }
    this.throttle = damp(this.throttle, throttle, 3, dt);
    const top = BOAT.top[this.motor] || BOAT.top[0];
    if (throttle) this.speed += (top - this.speed) * Math.min(1, dt * 0.55);
    else if (reverse) this.speed = Math.max(-2.6, this.speed - 4 * dt);
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (0.6 + Math.abs(this.speed) * 0.18) * dt);
    if (this.anchored) this.speed = 0;
    // an outboard turns the stern: it bites even at walking pace
    this.steer = damp(this.steer, steerIn, 5, dt);
    const turn = this.steer * (0.25 + 0.75 * Math.min(1, Math.abs(this.speed) / 3)) * (this.speed < 0 ? -0.8 : 0.85);
    this.yaw -= turn * dt;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let nx = this.pos.x + fx * this.speed * dt;
    let nz = this.pos.z + fz * this.speed * dt;
    // the river carries you while you drive; moored or anchored she stays put
    const here = W.waterAt(this.pos.x, this.pos.z);
    if (here && this.occupied) {
      nx += (here.flowX || 0) * 0.7 * dt;
      nz += (here.flowZ || 0) * 0.7 * dt;
    }
    // shallows: the skeg touches bottom and the boat stops
    const bow = W.waterAt(nx + fx * 2.4 * Math.sign(this.speed || 1), nz + fz * 2.4 * Math.sign(this.speed || 1));
    const w = W.waterAt(nx, nz);
    if (!w || w.depth < 0.45 || !bow || bow.depth < 0.3) {
      nx = this.pos.x;
      nz = this.pos.z;
      if (Math.abs(this.speed) > 2.5) {
        g.audio?.thud?.(Math.min(1, Math.abs(this.speed) / 10));
        g.player.shake = Math.min(1, Math.abs(this.speed) / 8);
      }
      if (this.occupied && g.time - this.warnT > 4) {
        this.warnT = g.time;
        g.hud.toast(this.shoreSpot() ? 'Too shallow. Tap ASHORE to step off here' : 'Too shallow for the outboard');
      }
      this.speed *= -0.2;
    }
    this.pos.x = nx;
    this.pos.z = nz;
    const water = w || here;
    const level = water ? water.level : this.pos.y;
    // waves: the bay rolls, the lakes ripple
    const t = g.time;
    const sea = water && water.kind === 'ocean' ? 1 : water && water.kind === 'river' ? 0.5 : 0.3;
    const bob = Math.sin(t * 1.3 + this.pos.x * 0.2) * 0.05 * sea + Math.sin(t * 2.1 + this.pos.z * 0.3) * 0.03 * sea;
    this.pos.y = damp(this.pos.y, level + bob, 6, dt);
    // the bow lifts as she gets on the plane, and she leans into turns
    const plane = clamp(this.speed / 5, 0, 1) * (1 - clamp((this.speed - 7) / 6, 0, 0.6));
    this.pitch = damp(this.pitch, plane * 0.09 + Math.sin(t * 1.7) * 0.025 * sea, 3, dt);
    this.roll = damp(this.roll, -this.steer * clamp(this.speed / 8, 0, 1) * 0.12 + Math.sin(t * 1.1 + 1) * 0.03 * sea, 3, dt);
    // wake and spray
    const sp = Math.abs(this.speed);
    this.wakeT -= dt;
    if (sp > 1.2 && this.wakeT <= 0 && g.effects) {
      this.wakeT = 0.16;
      g.effects.ripples.add(this.pos.x - fx * 2.6, level, this.pos.z - fz * 2.6, 1.2 + sp * 0.25, 0.9);
      if (sp > 5) g.effects.splash(this.pos.x + fx * 2 + fz * 0.8 * (Math.random() < 0.5 ? 1 : -1), level + 0.1, this.pos.z + fz * 2 - fx * 0.8, 0.25);
    }
    if (this.occupied && this.throttle > 0.3 && Math.random() < dt * 8) g.effects?.splash(this.pos.x - fx * 2.65, level, this.pos.z - fz * 2.65, 0.15);
    g.audio?.updateOutboard?.(this.occupied ? 900 + sp * 420 + this.throttle * 900 : 0, this.throttle, this.occupied ? 0 : this.pos.distanceTo(g.camera.position), this.occupied);
  }

  // Seat view at the tiller, or the chase camera.
  applyCamera(cam, dt, input) {
    const look = input.readLook();
    this.camYaw -= look.dx;
    this.camPitch = clamp(this.camPitch - look.dy, -0.9, 0.6);
    if (Math.abs(look.dx) < 1e-5 && input.lookTouch.id === null && !input.mouseDown) {
      this.camYaw = damp(this.camYaw, 0, 1.2, dt);
      this.camPitch = damp(this.camPitch, -0.08, 1.2, dt);
    }
    this.camYaw = clamp(this.camYaw, -2.6, 2.6);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (this.camMode === 'seat') {
      // sitting on the back bench with the tiller in your hand
      cam.position.set(this.pos.x - fx * 1.75, this.pos.y + DECK + 0.95, this.pos.z - fz * 1.75);
      _e.set(this.pitch + this.camPitch, this.yaw + Math.PI + this.camYaw, -this.roll * 0.6, 'YXZ');
      cam.quaternion.setFromEuler(_e);
    } else {
      const yaw = this.yaw + this.camYaw;
      const target = _v.set(this.pos.x - Math.sin(yaw) * 8, this.pos.y + 3 - this.camPitch * 4, this.pos.z - Math.cos(yaw) * 8);
      if (this.chasePos.lengthSq() === 0 || this.chasePos.distanceTo(target) > 30) this.chasePos.copy(target);
      this.chasePos.lerp(target, 1 - Math.exp(-6 * dt));
      cam.position.copy(this.chasePos);
      cam.lookAt(this.pos.x + Math.sin(yaw) * 3, this.pos.y + 0.8, this.pos.z + Math.cos(yaw) * 3);
    }
  }

  // ---------------------------------------------------------------- saving
  toJSON() {
    return { owned: this.owned, motor: this.motor, afloat: this.where === 'water', x: this.pos.x, z: this.pos.z, yaw: this.yaw };
  }

  restore(d) {
    this.setOwned(!!(d && d.owned), (d && d.motor) || 0);
    this.slide = null;
    this.occupied = false;
    this.anchored = false;
    this.speed = 0;
    this.resetTrailer();
    if (d && d.owned && d.afloat) {
      const w = this.game.world.waterAt(d.x, d.z);
      if (w && w.depth > 0.4) {
        this.where = 'water';
        this.pos.set(d.x, w.level, d.z);
        this.yaw = d.yaw || 0;
        return;
      }
    }
    this.where = 'trailer';
  }
}
