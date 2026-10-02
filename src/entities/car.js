// The driving model both cars share: arcade physics on the heightfield,
// collisions, the wheels, the lights, the exhaust, and the cockpit and chase
// cameras. A car is a model (built by the subclass in buildModel) and a spec
// of numbers: where its wheels touch the ground, how it handles on and off
// the road, where the driver's eye is.
import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';
import { HALF, SURF, ROAD_HALF } from '../world/worldgen.js';

const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

export class Car {
  constructor(game, spec) {
    this.game = game;
    this.spec = spec;
    this.id = spec.id;
    this.group = new THREE.Group();
    this.group.name = spec.id;
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // world xz velocity
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vy = 0;
    this.airborne = false;
    this.lastGroundY = 0;
    this.wheelSpin = 0;
    this.throttle = 0;
    this.brake = 0;
    this.rpm = 0;
    this.gear = 1;
    this.camMode = 'cockpit';
    this.camYaw = 0;
    this.camPitch = spec.cam.pitch;
    this.chasePos = new THREE.Vector3();
    this.occupied = false;
    this.shake = 0;
    this.lean = 0;
    this.squat = 0;
    this.lastImpact = 0;
    this.deepWarned = 0;
    this.onRoad = true;
    this.wheels = [];
    this.buildModel();
    const C = spec.collider;
    this.collider = game.colliders.addBox(0, 0, C.hx, C.hz, 0, -1e9, 1e9, 'car');
  }

  // subclasses build this.body's meshes, this.driver and this.wheels
  buildModel() {}

  // subclasses move their own parts (steering wheel, gauges, lights)
  animate() {}

  place(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.vel.set(0, 0);
    this.airborne = false;
    this.vy = 0;
    const g = this.groundY();
    this.pos.y = g.y;
    this.pitch = g.pitch;
    this.roll = g.roll;
    this.lastGroundY = g.y;
    this.syncTransform();
    this.syncCollider();
  }

  groundAtPoint(x, z, refY) {
    const W = this.game.world;
    const t = W.heightAt(x, z);
    const d = this.game.colliders.deckAt(x, z, refY, 1.4);
    return d !== null && d > t - 0.6 ? Math.max(d, t) : t;
  }

  // Height, pitch and roll from the ground under the four tyres.
  groundY() {
    const G = this.spec.ground;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const pt = (lx, lz) => this.groundAtPoint(this.pos.x + lx * c + lz * s, this.pos.z - lx * s + lz * c, this.pos.y);
    const fl = pt(G.fx, G.fz);
    const fr = pt(-G.fx, G.fz);
    const rl = pt(G.rx, G.rz);
    const rr = pt(-G.rx, G.rz);
    const front = (fl + fr) / 2;
    const rear = (rl + rr) / 2;
    const left = (fl + rl) / 2;
    const right = (fr + rr) / 2;
    return {
      y: (front + rear) / 2,
      pitch: Math.atan2(front - rear, G.fz - G.rz),
      roll: Math.atan2(left - right, G.fx + G.rx),
    };
  }

  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  // Beside the driver's door (side 1), or the other side.
  exitPoint(side = 1) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const lx = side * this.spec.exit.lx;
    const lz = this.spec.exit.lz;
    return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c };
  }

  // What the pedals and the wheel ask for this frame.
  readControls(input) {
    let throttle = 0;
    let brake = 0;
    let steerIn = 0;
    if (this.occupied) {
      throttle = input.held('gas') || input.key('KeyW') || input.key('ArrowUp') ? 1 : 0;
      brake = input.held('brake') || input.key('KeyS') || input.key('ArrowDown') || input.key('Space') ? 1 : 0;
      steerIn = input.stick.active ? input.stick.x * 1.25 : 0;
      if (input.key('KeyA') || input.key('ArrowLeft')) steerIn -= 1;
      if (input.key('KeyD') || input.key('ArrowRight')) steerIn += 1;
      steerIn = clamp(steerIn, -1, 1);
    }
    return { throttle, brake, steerIn };
  }

  update(dt, input, state) {
    const W = this.game.world;
    const S = this.spec;
    const H = this.handling(state);
    const { throttle, brake, steerIn } = this.readControls(input);
    this.throttle = damp(this.throttle, throttle, 6, dt);
    this.brake = brake;

    // surface: the road, or what the tyres find off it
    const k = W.cellIndex(this.pos.x, this.pos.z);
    const onRoad = W.roadD[k] < ROAD_HALF + 1.2 || this.onBridge;
    this.onRoad = onRoad;
    const surf = W.surf[k];
    let cap = H.top;
    let grip = H.grip;
    if (!onRoad) {
      cap *= H.offroad(surf);
      grip = H.offGrip;
    }
    // a boat on the trailer behind: a little slower
    if (this.towing) cap *= 0.82;
    const water = W.waterAt(this.pos.x, this.pos.z);
    if (water && water.depth > S.wade.shallow && !this.onBridge) {
      cap = Math.min(cap, S.wade.cap);
      grip = 2.2;
    }
    this.cap = cap;

    // longitudinal
    const fwd = this.forward();
    if (throttle > 0) {
      if (this.speed < -0.5) this.speed += H.brake * dt;
      else this.speed += H.accel * this.throttle * clamp(1 - this.speed / (cap + 0.01), -1, 1) * dt;
    }
    if (brake > 0) {
      if (this.speed > 0.6) this.speed -= (onRoad ? H.brake : H.brakeOff) * dt;
      else this.speed = Math.max(this.speed - 6 * dt, -H.reverse);
    }
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (onRoad ? H.coast : H.coastOff) * dt);
    if (this.speed > cap) this.speed = damp(this.speed, cap, 1.5, dt);
    // slope, except when parked: an empty car, or one crawling with no pedal
    // down, holds on its brake instead of rolling off down a bank
    const holding = !this.occupied || (!throttle && !brake && Math.abs(this.speed) < 1.5);
    if (holding) this.speed = damp(this.speed, 0, 6, dt);
    else this.speed -= 9.8 * Math.sin(this.pitch) * dt * 0.75;

    // steering: less lock as the speed rises
    const sp = Math.abs(this.speed);
    let maxSteer = S.steer.lock * (1 - Math.min(S.steer.fade, sp / S.steer.fadeSpeed));
    if (S.steer.lateral && sp > 1) maxSteer = Math.min(maxSteer, Math.atan((S.steer.lateral * S.wheelbase) / (sp * sp)));
    this.steer = damp(this.steer, steerIn * maxSteer, S.steer.rate, dt);
    if (!this.airborne) {
      const yawRate = (this.speed * Math.tan(this.steer)) / S.wheelbase;
      this.yaw -= yawRate * dt;
    }

    // velocity with slip
    const dvx = fwd.x * this.speed;
    const dvz = fwd.z * this.speed;
    const g = this.airborne ? 0.3 : grip;
    this.vel.x += (dvx - this.vel.x) * Math.min(1, g * dt);
    this.vel.y += (dvz - this.vel.y) * Math.min(1, g * dt);
    const lateral = this.vel.x * Math.cos(this.yaw) - this.vel.y * Math.sin(this.yaw);
    this.slip = lateral;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.y * dt;
    const lim = HALF - 30;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) {
      nx = clamp(nx, -lim, lim);
      nz = clamp(nz, -lim, lim);
      this.speed *= 0.5;
    }

    // too deep or too steep: refuse
    const w2 = W.waterAt(nx, nz);
    const deckAhead = this.game.colliders.deckAt(nx, nz, this.pos.y, 1.4);
    if (w2 && w2.depth > S.wade.deep && deckAhead === null) {
      nx = this.pos.x;
      nz = this.pos.z;
      this.speed *= -0.2;
      this.vel.set(0, 0);
      if (this.game.time - this.deepWarned > 5 && this.occupied) {
        this.deepWarned = this.game.time;
        this.game.hud?.toast(S.wade.toast);
      }
    }

    // collisions: circles along the body
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    let pushX = 0;
    let pushZ = 0;
    let hit = null;
    this.game.colliders.removeBox(this.collider);
    for (const lz of S.circles.at) {
      const cx = nx + lz * s;
      const cz = nz + lz * c;
      const r = this.game.colliders.resolve(cx, cz, S.circles.r, this.pos.y, 1.4);
      if (r.hit) {
        pushX += r.x - cx;
        pushZ += r.z - cz;
        hit = r.hit;
      }
    }
    this.game.colliders.boxes.push(this.collider);
    if (hit) {
      nx += pushX;
      nz += pushZ;
      const impact = Math.abs(this.speed);
      if (impact > 5 && this.game.time - this.lastImpact > 0.6) {
        this.lastImpact = this.game.time;
        this.shake = Math.min(1, impact / 20);
        this.game.audio?.thud(Math.min(1, impact / 25));
        this.game.effects?.dust(nx + s * S.circles.at[0], this.pos.y + 0.6, nz + c * S.circles.at[0], 8);
      }
      this.speed *= Math.max(0, 1 - dt * 14);
      const n = Math.hypot(pushX, pushZ) || 1;
      const vn = (this.vel.x * pushX + this.vel.y * pushZ) / n;
      if (vn < 0) {
        this.vel.x -= (pushX / n) * vn;
        this.vel.y -= (pushZ / n) * vn;
      }
    }
    // refuse cliffs: compare ground under the nose before and after the move
    const oldX = this.pos.x;
    const oldZ = this.pos.z;
    const gCur = this.pos.y;
    this.pos.x = nx;
    this.pos.z = nz;
    let gr = this.groundY();
    const horiz = Math.hypot(nx - oldX, nz - oldZ);
    if (!this.airborne && horiz > 1e-4 && (gr.y - gCur) / horiz > S.climb && gr.y - gCur > 0.25) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
      this.speed *= -0.15;
      this.vel.set(0, 0);
      gr = this.groundY();
    }
    this.onBridge = this.game.colliders.deckAt(this.pos.x, this.pos.z, this.pos.y, 1.4) !== null;

    // vertical
    const groundVel = (gr.y - this.lastGroundY) / Math.max(dt, 1e-4);
    this.lastGroundY = gr.y;
    if (!this.airborne) {
      if (groundVel < -7 && Math.abs(this.speed) > 11 && this.vy > -1) {
        this.airborne = true;
      } else {
        this.pos.y = gr.y;
        this.vy = groundVel;
      }
    }
    if (this.airborne) {
      this.vy -= 19 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gr.y) {
        const land = -this.vy;
        this.pos.y = gr.y;
        this.airborne = false;
        this.vy = 0;
        if (land > 4) {
          this.shake = Math.min(1, land / 12);
          this.game.audio?.thud(Math.min(1, land / 14));
          this.game.effects?.dust(this.pos.x, this.pos.y, this.pos.z, 14);
        }
      }
    }
    const pitchT = this.airborne ? this.pitch * 0.98 : gr.pitch;
    this.pitch = damp(this.pitch, pitchT, this.airborne ? 2 : 12, dt);
    this.roll = damp(this.roll, this.airborne ? this.roll : gr.roll, 10, dt);

    // body dynamics: lean in the corners, squat under power, dive on the brakes
    const latAcc = Math.abs(this.speed) * ((this.speed * Math.tan(this.steer)) / S.wheelbase);
    this.lean = damp(this.lean, clamp(-latAcc * S.body.lean, -S.body.leanMax, S.body.leanMax), 6, dt);
    this.squat = damp(this.squat, this.throttle * (this.speed < cap * 0.8 ? S.body.squat : 0) - brake * S.body.dive, 5, dt);
    // a low car off the road rattles over every root and stone
    const rough = !onRoad && !this.airborne ? S.body.rough * Math.min(1, sp / 6) : 0;
    this.rattle = rough;

    // wheels: they all turn at the ground speed, each by its own radius
    this.wheelSpin += this.speed * dt;
    for (const wd of this.wheels) {
      wd.spin.rotation.x = this.wheelSpin / wd.r;
      // steering right (steer > 0) turns the wheels toward -x, the right side
      if (wd.front) wd.pivot.rotation.y = -this.steer;
    }

    // engine
    this.updateRpm(dt, sp);

    this.shake = Math.max(0, this.shake - dt * 2);
    const idle = this.occupied ? S.body.idle * (1 - Math.min(1, sp / 4)) : 0;
    this.syncTransform(idle);
    this.animate(dt, state);

    // exhaust and dust
    if (this.occupied && this.game.effects) {
      this.fxT = (this.fxT || 0) + dt;
      if (S.exhaust && this.throttle > 0.5 && this.fxT > S.exhaust.every) {
        this.fxT = 0;
        for (const p of S.exhaust.at) {
          const px = this.pos.x + p[0] * c + p[2] * s;
          const pz = this.pos.z - p[0] * s + p[2] * c;
          this.game.effects.exhaust(px, this.pos.y + p[1], pz, -s, -c);
        }
      }
      if (!onRoad && sp > 6 && Math.random() < dt * 14) {
        const back = S.ground.rz - 0.05;
        this.game.effects.dust(this.pos.x + back * s, this.pos.y + 0.2, this.pos.z + back * c, 1);
      }
    }
    this.syncCollider();
  }

  // Engine speed from the road speed through the gears.
  updateRpm(dt, sp) {
    const E = this.spec.engine;
    const gears = E.gears;
    let gear = 1;
    while (gear < gears.length - 2 && sp > gears[gear]) gear++;
    const lo = gears[gear - 1];
    const hi = gears[gear];
    const frac = clamp((sp - lo) / (hi - lo), 0, 1);
    const pull = this.throttle * E.blip * (gear === 1 ? 1 : 0.4);
    const target = this.occupied ? E.idle + (gear === 1 ? frac * E.span : E.shift + frac * (E.span - E.shift)) + pull : 0;
    this.rpm = damp(this.rpm, Math.min(E.redline, target), 6, dt);
    this.gear = gear;
  }

  // Keep the car's own collision box on it, for the player and the others.
  syncCollider() {
    const C = this.spec.collider;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const cb = this.collider;
    cb.x = this.pos.x + C.lz * s;
    cb.z = this.pos.z + C.lz * c;
    cb.rot = this.yaw;
    cb.cos = c;
    cb.sin = s;
    cb.yMin = this.pos.y - 0.5;
    cb.yMax = this.pos.y + C.h;
  }

  syncTransform(idle = 0) {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -this.pitch;
    this.group.rotation.z = this.roll;
    const t = this.game.time;
    const r = this.rattle || 0;
    this.body.rotation.z = this.lean + (idle ? Math.sin(t * 38) * idle : 0) + (r ? Math.sin(t * 51) * r * 0.5 : 0);
    this.body.rotation.x = -this.squat + (r ? Math.sin(t * 43) * r * 0.4 : 0);
    this.body.position.y = (idle ? Math.sin(t * 29) * idle * 2 : 0) + (r ? Math.abs(Math.sin(t * 37)) * r : 0);
  }

  // Camera placement while driving: the driver's eye, or behind the car.
  applyCamera(cam, dt, input) {
    const C = this.spec.cam;
    const look = input.readLook();
    this.camYaw -= look.dx;
    this.camPitch -= look.dy;
    this.camPitch = clamp(this.camPitch, -0.9, 0.6);
    // drift the free-look back to centre when not dragging
    if (Math.abs(look.dx) < 1e-5 && input.lookTouch.id === null && !input.mouseDown) {
      this.camYaw = damp(this.camYaw, 0, 1.5, dt);
      this.camPitch = damp(this.camPitch, this.camMode === 'cockpit' ? C.pitch : C.chasePitch, 1.5, dt);
    }
    this.camYaw = clamp(this.camYaw, -2.2, 2.2);
    const sh = this.shake + (this.rattle || 0) * 0.6;
    const shx = sh ? Math.sin(this.game.time * 60) * 0.02 * sh : 0;
    const shy = sh ? Math.cos(this.game.time * 47) * 0.02 * sh : 0;
    this.group.updateMatrixWorld(true);
    if (this.camMode === 'cockpit') {
      this.driver.visible = false;
      const p = _v.fromArray(C.eye).applyMatrix4(this.body.matrixWorld);
      cam.position.copy(p);
      // heads keep the horizon steadier than the chassis: damp pitch and roll
      _e.set(this.pitch * 0.8 + this.camPitch + shy, this.yaw + Math.PI + this.camYaw + shx, -this.roll * 0.35, 'YXZ');
      cam.quaternion.setFromEuler(_e);
    } else {
      this.driver.visible = true;
      const yaw = this.yaw + this.camYaw;
      const tx = this.pos.x - Math.sin(yaw) * C.chaseDist;
      const tz = this.pos.z - Math.cos(yaw) * C.chaseDist;
      let ty = this.pos.y + C.chaseHeight - this.camPitch * 4;
      const gy = this.game.world.heightAt(tx, tz) + 0.8;
      if (ty < gy) ty = gy;
      _target.set(tx, ty, tz);
      if (this.chasePos.lengthSq() === 0 || this.chasePos.distanceTo(_target) > 30) this.chasePos.copy(_target);
      this.chasePos.lerp(_target, 1 - Math.exp(-8 * dt));
      cam.position.copy(this.chasePos);
      cam.position.x += shx * 3;
      cam.position.y += shy * 3;
      _look.set(this.pos.x + Math.sin(yaw) * 3, this.pos.y + C.lookHeight, this.pos.z + Math.cos(yaw) * 3);
      cam.lookAt(_look);
    }
  }
}

// Off-road speed factors by surface for a car with ordinary ground clearance.
export function offroadFactor(surf) {
  if (surf === SURF.GRAVEL || surf === SURF.SAND) return 0.7;
  if (surf === SURF.TUNDRA) return 0.6;
  if (surf === SURF.FOREST) return 0.5;
  if (surf === SURF.ROCK) return 0.42;
  if (surf === SURF.SNOW || surf === SURF.ICE) return 0.38;
  if (surf === SURF.MUD) return 0.35;
  return 0.62;
}

