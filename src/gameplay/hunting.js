// Rifle: scope zoom with breathing sway, bolt action, magazine and reload,
// hit zones on game animals and grizzlies, aim assist against charging
// bears, terrain and water impacts, and claiming downed game.
import * as THREE from 'three';
import { GAME } from './data.js';
import { clamp, damp, angleDiff } from '../util/math.js';

const MAG = 4;
const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();
const _mz = new THREE.Vector3();

export class Hunting {
  constructor(game) {
    this.game = game;
    this.scoped = false;
    this.boltT = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.stillT = 0;
    this.swayT = 0;
    this.shots = 0;
  }

  reset() {
    this.setScoped(false);
    this.reloading = false;
  }

  setScoped(on) {
    const g = this.game;
    if (on && (g.player.tool !== 'rifle' || g.player.mode !== 'foot' || this.reloading)) return;
    this.scoped = on;
    g.viewmodel.setScoped(on);
    if (!on) g.player.lookSway.x = g.player.lookSway.y = 0;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const input = g.input;
    this.boltT = Math.max(0, this.boltT - dt);
    const active = P.mode === 'foot' && P.tool === 'rifle' && !g.menuOpen && !g.hud.blocking;
    if (!active) {
      if (this.scoped) this.setScoped(false);
      return;
    }
    const gear = g.state.gear;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = MAG - gear.mag;
        const take = Math.min(need, gear.ammo);
        gear.mag += take;
        gear.ammo -= take;
        this.reloading = false;
      }
    }
    if (input.pressed('secondary') || input.keyPressed('Mouse2')) this.setScoped(!this.scoped);
    if (input.pressed('reload') || input.keyPressed('KeyR')) this.reload();
    if (input.pressed('spray') || input.keyPressed('KeyG')) g.bears.spray();
    const fire = input.pressed('primary') || input.keyPressed('Space') || (input.keyPressed('Mouse0') && (input.pointerLocked || !input.usingTouch));
    if (fire) this.fire();

    // scope sway: calmer when holding still
    if (this.scoped) {
      const moving = Math.abs(P.lookDelta.x) + Math.abs(P.lookDelta.y) > 0.0005 || P.speed > 0.5;
      this.stillT = moving ? 0 : this.stillT + dt;
      this.swayT += dt;
      const amp = (this.stillT > 1 ? 0.0012 : 0.0035) * (P.health < 50 ? 1.8 : 1);
      P.lookSway.x = Math.sin(this.swayT * 0.9) * amp + Math.sin(this.swayT * 2.3) * amp * 0.3;
      P.lookSway.y = Math.sin(this.swayT * 1.3 + 1) * amp * 0.8;
    }
  }

  reload() {
    const g = this.game;
    const gear = g.state.gear;
    if (this.reloading || gear.mag >= MAG) return;
    if (gear.ammo <= 0) {
      g.hud.toast('Out of ammo. Buy more at the Trading Post', 'bad');
      return;
    }
    this.setScoped(false);
    this.reloading = true;
    this.reloadT = 2.2;
    g.viewmodel.reload();
    g.audio?.reloadSound();
  }

  fire() {
    const g = this.game;
    const gear = g.state.gear;
    if (this.reloading || this.boltT > 0) return;
    if (gear.mag <= 0) {
      g.audio?.dryFire();
      this.reload();
      return;
    }
    gear.mag--;
    this.boltT = 0.9;
    this.shots++;
    const cam = g.camera;
    cam.getWorldDirection(_dir);
    _o.copy(cam.position);
    // spread when not scoped
    const spread = this.scoped ? 0.0015 : 0.03;
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();
    // aim assist against a close charging bear when firing from the hip
    const threat = g.bears.threat;
    if (threat && !this.scoped) {
      const tx = threat.x - _o.x;
      const ty = threat.y + 0.9 - _o.y;
      const tz = threat.z - _o.z;
      const d = Math.hypot(tx, ty, tz);
      if (d < 45) {
        const dot = (tx * _dir.x + ty * _dir.y + tz * _dir.z) / d;
        if (dot > Math.cos(0.2)) _dir.set(tx / d, ty / d, tz / d);
      }
    }
    g.audio?.gunshot();
    g.viewmodel.recoil();
    setTimeout(() => g.audio?.bolt(), 250);
    g.player.kick += this.scoped ? 0.035 : 0.06;
    g.player.shake = Math.min(1, g.player.shake + 0.25);
    g.haptic?.('heavy');
    g.viewmodel.muzzleWorld(_mz);
    if (!this.scoped) g.effects.muzzle(_mz.x, _mz.y, _mz.z, _dir.x, _dir.y, _dir.z);

    // what did we hit?
    const maxD = 700;
    const hit = g.wildlife.raycast(_o.x, _o.y, _o.z, _dir.x, _dir.y, _dir.z, maxD);
    const ground = this.terrainHit(_o, _dir, maxD);
    if (hit && (!ground || hit.dist < ground.dist)) {
      const a = hit.animal;
      const mult = hit.zone === 'head' ? 3 : hit.zone === 'vital' ? 1.6 : 1;
      const dmg = 75 * mult;
      const px = _o.x + _dir.x * hit.dist;
      const py = _o.y + _dir.y * hit.dist;
      const pz = _o.z + _dir.z * hit.dist;
      g.effects.puff(px, py, pz, 0.45, 0.32, 0.22, 10);
      g.audio?.hit(px, pz);
      let killed;
      if (a.species === 'bear') {
        a.hp -= dmg;
        killed = a.hp <= 0;
        if (killed) {
          a.dead = true;
          a.state = 'dead';
          a.speed = 0;
        }
        g.bears.onHit(a, killed);
      } else killed = g.wildlife.damage(a, dmg, hit.zone, _o.x, _o.z);
      g.hud.hitmark(killed);
      if (killed) {
        g.hud.toast(`${GAME[a.species].name} down${hit.zone === 'head' ? ' with a clean shot' : ''}`, 'good');
        if (a.species === 'bear') g.hud.banner('GRIZZLY DOWN', 'good');
      }
    } else if (ground) {
      const px = _o.x + _dir.x * ground.dist;
      const pz = _o.z + _dir.z * ground.dist;
      if (ground.water) g.effects.splash(px, ground.y, pz, 0.35);
      else g.effects.dust(px, ground.y, pz, 5);
    }
    g.wildlife.scare(_o.x, _o.z, 260);
    // auto reload an empty magazine
    if (gear.mag <= 0) setTimeout(() => this.reload(), 700);
  }

  // March the ray over the heightfield (and water) to find the first impact.
  terrainHit(o, d, maxD) {
    const W = this.game.world;
    let prevT = 0;
    let step = 1.5;
    for (let t = 1; t < maxD; t += step) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (!W.inBounds(x, z)) return null;
      const h = W.heightAt(x, z);
      const w = W.waterAt(x, z);
      const top = w ? Math.max(h, w.level) : h;
      if (y <= top) {
        // refine
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) / 2;
          const mx = o.x + d.x * m;
          const my = o.y + d.y * m;
          const mz = o.z + d.z * m;
          const mh = W.heightAt(mx, mz);
          const mw = W.waterAt(mx, mz);
          const mt = mw ? Math.max(mh, mw.level) : mh;
          if (my <= mt) hi = m;
          else lo = m;
        }
        const ex = o.x + d.x * hi;
        const ez = o.z + d.z * hi;
        const ew = W.waterAt(ex, ez);
        return { dist: hi, y: o.y + d.y * hi, water: !!(ew && ew.level > W.heightAt(ex, ez)) };
      }
      prevT = t;
      step = Math.min(6, 1.5 + t * 0.02);
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
    if (a.species === 'bear') g.bears.remove(a);
    else g.wildlife.removeAnimal(a);
    g.save();
  }
}
