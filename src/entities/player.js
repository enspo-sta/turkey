// First-person player: walking, wading, decks, collisions, head bob and camera.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../util/math.js';
import { HALF, SURF } from '../world/worldgen.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.66;
    this.health = 100;
    this.maxHealth = 100;
    this.lastHurt = -100;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.mode = 'foot';
    this.tool = 'rod';
    this.moveLocked = false;
    this.lookLocked = false;
    this.onDeck = false;
    this.water = null;
    this.sprintTime = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.kick = 0; // recoil pitch offset
    this.lookSway = { x: 0, y: 0 };
    this.stepCount = 0;
    this.distanceWalked = 0;
    this.surface = SURF.GRASS;
    this.speed = 0;
    this.lookDelta = { x: 0, y: 0 };
    this.onStep = null;
  }

  place(x, z, yaw = this.yaw) {
    this.pos.set(x, this.groundAt(x, z, 1e9), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  groundAt(x, z, fromY = this.pos.y) {
    const W = this.game.world;
    const t = W.heightAt(x, z);
    const d = this.game.colliders.deckAt(x, z, fromY, 1.1);
    if (d !== null && d > t - 0.5) {
      this._deck = true;
      return Math.max(d, t);
    }
    this._deck = false;
    return t;
  }

  hurt(amount, dirX = 0, dirZ = 0) {
    if (this.game.godMode) return;
    this.health = Math.max(0, this.health - amount);
    this.lastHurt = this.game.time;
    this.shake = Math.min(1.2, this.shake + amount / 30);
    this.vel.x += dirX * amount * 0.12;
    this.vel.z += dirZ * amount * 0.12;
    this.game.events?.emit('hurt', { amount });
    if (this.health <= 0) this.game.events?.emit('down', {});
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(dt, input) {
    const game = this.game;
    const W = game.world;
    if (this.mode !== 'foot') return;

    // look
    const look = input.readLook();
    const zoom = game.zoom || 1;
    if (!this.lookLocked) {
      this.yaw -= look.dx * zoom;
      this.pitch -= look.dy * zoom;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    this.lookDelta.x = look.dx;
    this.lookDelta.y = look.dy;

    // move
    const mv = input.readMove();
    let mx = mv.x;
    let my = mv.y;
    if (this.moveLocked) {
      mx = 0;
      my = 0;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 0.93 && input.usingTouch) this.sprintTime += dt;
    else if (mag < 0.5) this.sprintTime = 0;
    const sprint = (input.key('ShiftLeft') || input.key('ShiftRight') || this.sprintTime > 0.45) && my < -0.3;
    let speed = sprint ? 7.2 : 4.3;
    if (game.hunting && game.hunting.scoped) speed = 1.8;

    const water = this.onDeck ? null : W.waterAt(this.pos.x, this.pos.z);
    this.water = water;
    if (water && water.depth > 0.25) speed *= water.depth > 0.7 ? 0.38 : 0.6;
    if (this.surface === SURF.SNOW) speed *= 0.8;

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const wishX = (fx * -my + rx * mx) * speed;
    const wishZ = (fz * -my + rz * mx) * speed;
    const accel = mag > 0.05 ? 10 : 12;
    this.vel.x = damp(this.vel.x, wishX, accel, dt);
    this.vel.z = damp(this.vel.z, wishZ, accel, dt);

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    // world bounds
    const lim = HALF - 25;
    nx = clamp(nx, -lim, lim);
    nz = clamp(nz, -lim, lim);

    // slope and deep water checks
    const gOld = this.pos.y;
    let gNew = this.groundAt(nx, nz, gOld);
    const onDeckNew = this._deck;
    const horiz = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    if (!onDeckNew && horiz > 1e-4) {
      const rise = gNew - gOld;
      const grade = rise / horiz;
      const w2 = W.waterAt(nx, nz);
      const tooDeep = w2 && w2.depth > 1.15;
      if (grade > 1.25 || tooDeep) {
        // try sliding along each axis
        const ax = this.groundAt(nx, this.pos.z, gOld);
        const wa = W.waterAt(nx, this.pos.z);
        const okX = (ax - gOld) / Math.max(1e-4, Math.abs(nx - this.pos.x)) <= 1.25 && !(wa && wa.depth > 1.15 && !this._deck);
        const az = this.groundAt(this.pos.x, nz, gOld);
        const wb = W.waterAt(this.pos.x, nz);
        const okZ = (az - gOld) / Math.max(1e-4, Math.abs(nz - this.pos.z)) <= 1.25 && !(wb && wb.depth > 1.15 && !this._deck);
        if (okX && Math.abs(nx - this.pos.x) > Math.abs(nz - this.pos.z)) nz = this.pos.z;
        else if (okZ) nx = this.pos.x;
        else if (okX) nz = this.pos.z;
        else {
          nx = this.pos.x;
          nz = this.pos.z;
        }
        if (tooDeep && !this._warnedDeep) {
          this._warnedDeep = true;
          game.hud?.toast('Too deep to wade any further');
          setTimeout(() => (this._warnedDeep = false), 4000);
        }
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
        gNew = this.groundAt(nx, nz, gOld);
      }
    }

    // colliders
    const r = game.colliders.resolve(nx, nz, 0.38, this.pos.y, 1.8);
    nx = r.x;
    nz = r.z;
    const ground = this.groundAt(nx, nz, gOld);
    this.onDeck = this._deck;
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.x = nx;
    this.pos.z = nz;
    // vertical: step up quickly, fall with gravity
    if (ground >= this.pos.y) {
      this.pos.y = damp(this.pos.y, ground, 20, dt);
      if (ground - this.pos.y > 1.5) this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.vel.y -= 22 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y < ground) {
        this.pos.y = ground;
        this.vel.y = 0;
      }
    }
    this.speed = moved / Math.max(dt, 1e-4);
    this.distanceWalked += moved;
    this.surface = this.onDeck ? -1 : W.surfaceAt(this.pos.x, this.pos.z);

    // head bob and footsteps
    const moving = this.speed > 0.6;
    this.bobAmt = damp(this.bobAmt, moving ? Math.min(1, this.speed / 5) : 0, 8, dt);
    if (moving) {
      const before = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += dt * (sprint ? 12.5 : 9.2);
      const after = Math.floor(this.bobPhase / Math.PI);
      if (after !== before && this.onStep) this.onStep(this.surface, this.water, sprint);
    }

    // health regeneration
    if (game.time - this.lastHurt > 6 && this.health < this.maxHealth && this.health > 0) this.heal(3 * dt);

    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.shakeT += dt;
    this.kick = damp(this.kick, 0, 7, dt);
  }

  applyCamera(cam) {
    const bob = Math.sin(this.bobPhase) * 0.045 * this.bobAmt;
    const sideBob = Math.cos(this.bobPhase * 0.5) * 0.03 * this.bobAmt;
    const sx = this.shake > 0 ? (Math.sin(this.shakeT * 53) + Math.sin(this.shakeT * 31)) * 0.02 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.cos(this.shakeT * 47) + Math.sin(this.shakeT * 29)) * 0.02 * this.shake : 0;
    const wade = this.water && !this.onDeck ? Math.min(this.water.depth, 0.9) * 0.45 : 0;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * sideBob,
      this.pos.y + this.eye + bob - wade,
      this.pos.z - Math.sin(this.yaw) * sideBob
    );
    cam.rotation.set(this.pitch + this.kick + sy + this.lookSway.y, this.yaw + sx + this.lookSway.x, 0, 'YXZ');
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
