// Fishing: aim at water, a golf-style 3-tap cast meter (power then accuracy),
// lure flight, float with nibbles and bites, hook timing, a tension/stamina
// fight with rod steering and jumps, landing and the catch card.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { FISH, LURES, LEGENDS, speciesPool } from './data.js';
import { lengthFor, makeFishModel } from '../entities/fishmodels.js';
import { clamp, lerp, damp, weightedPick, randRange, angleDiff, smoothstep } from '../util/math.js';

const MIN_CAST = 4;
const ACC_TARGET = 0.07;
const LINE_PTS = 18;

export class Fishing {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.t = 0;
    this.meter = { phase: 0, t: 0, needle: 0, power: 0, acc: 0 };
    this.aim = { yaw: 0, waterBands: [], hotBand: null, hasWater: false, hotspot: null };
    this.lurePos = new THREE.Vector3();
    this.lureStart = new THREE.Vector3();
    this.lureEnd = new THREE.Vector3();
    this.floatBase = 0;
    this.water = null;
    this.encounter = null;
    this.fight = null;
    this.hotspots = [];
    this.hotPlace = null;
    this.nextApproach = 10;
    this.tip = new THREE.Vector3();
    this.perfect = false;
    this.catchInfo = null;
    this.retrieveHold = 0;
    this.pressTime = 0;

    // float (bobber)
    const fb = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0281e, roughness: 0.4 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.4 }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xe0281e }));
    stick.position.y = 0.09;
    fb.add(top, bot, stick);
    fb.visible = false;
    this.float = fb;
    game.scene.add(fb);

    // lure (visible in flight)
    this.lureMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, metalness: 0.8, roughness: 0.2 }));
    this.lureMesh.visible = false;
    game.scene.add(this.lureMesh);

    // fishing line
    this.lineGeo = new LineGeometry();
    this.linePos = new Float32Array(LINE_PTS * 3);
    this.lineGeo.setPositions(this.linePos);
    this.lineMat = new LineMaterial({ color: 0xf2f2e6, linewidth: 1.6, transparent: true, opacity: 0.85, worldUnits: false });
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.renderOrder = 4;
    game.scene.add(this.line);

    // hooked fish model shown when it jumps / is landed
    this.jumper = null;
    this.jumperId = null;
  }

  resize(w, h) {
    this.lineMat.resolution.set(w, h);
  }

  get busy() {
    return this.state !== 'idle';
  }

  rod() {
    return this.game.state.rod();
  }

  maxCast() {
    return this.rod().cast;
  }

  castDist(p) {
    return MIN_CAST + p * (this.maxCast() - MIN_CAST);
  }

  // Scan along the aim direction for water and hotspots (for the meter bands).
  scanAim() {
    const g = this.game;
    const P = g.player;
    const W = g.world;
    const yaw = P.yaw;
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const maxD = this.maxCast();
    const bands = [];
    let cur = null;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const d = this.castDist(p);
      const x = P.pos.x + dx * d;
      const z = P.pos.z + dz * d;
      const w = W.waterAt(x, z);
      const ok = w && w.depth > 0.3;
      if (ok && !cur) cur = { p0: p, p1: p };
      if (ok && cur) cur.p1 = p;
      if (!ok && cur) {
        bands.push(cur);
        cur = null;
      }
    }
    if (cur) bands.push(cur);
    this.aim.waterBands = bands;
    this.aim.hasWater = bands.length > 0;
    this.aim.yaw = yaw;
    // hotspot along the aim line
    let best = null;
    for (const h of this.hotspots) {
      const hx = h.x - P.pos.x;
      const hz = h.z - P.pos.z;
      const along = hx * dx + hz * dz;
      if (along < MIN_CAST || along > maxD + h.r) continue;
      const lateral = Math.abs(hx * dz - hz * dx);
      if (lateral > h.r * 1.1) continue;
      const half = Math.sqrt(Math.max(0, h.r * h.r - lateral * lateral));
      const p0 = clamp((along - half - MIN_CAST) / (maxD - MIN_CAST), 0, 1);
      const p1 = clamp((along + half - MIN_CAST) / (maxD - MIN_CAST), 0, 1);
      if (p1 - p0 < 0.01) continue;
      if (!best || lateral < best.lateral) best = { p0, p1, h, lateral };
    }
    this.aim.hotBand = best;
    return this.aim;
  }

  startCast() {
    const g = this.game;
    this.scanAim();
    if (!this.aim.hasWater) {
      g.hud.toast('Face open water to cast');
      return;
    }
    this.state = 'meter';
    this.meter = { phase: 0, t: 0, needle: 0, power: 0, acc: 0 };
    g.player.moveLocked = true;
    g.audio?.click();
  }

  cancel(message) {
    const g = this.game;
    this.settleCatch();
    this.state = 'idle';
    this.encounter = null;
    this.fight = null;
    this.float.visible = false;
    this.lureMesh.visible = false;
    this.line.visible = false;
    this.hideJumper();
    g.player.moveLocked = false;
    g.player.lookLocked = false;
    g.viewmodel.rodPoseTarget = { pitch: 0.34, side: 0, bendX: 0, bendY: 0, reeling: 0, shake: 0 };
    g.hud.hideMeter();
    g.hud.hideFight();
    g.audio?.stopReel();
    if (message) g.hud.toast(message);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    const input = g.input;
    const P = g.player;
    this.t += dt;
    this.updateHotspots(dt);
    const onFoot = P.mode === 'foot' && P.tool === 'rod' && !g.menuOpen;
    if (!onFoot && this.state !== 'idle' && this.state !== 'catch') this.cancel();
    if (!onFoot) {
      this.updateLine(dt);
      return;
    }
    if (this.watchT > 0) {
      this.watchT -= dt;
      const b = this.watchBird;
      if (b && b.mode === 'carry' && this.state === 'idle' && input.lookTouch.id === null && !input.mouseDown) this.lookToward(b.x, b.y, b.z, dt, 2.5);
    }
    const primaryPressed = input.pressed('primary') || input.keyPressed('Space') || input.mouseActionPressed();
    const primaryHeld = input.held('primary') || input.key('Space') || input.mouseAction();
    const primaryReleased = input.released('primary');

    switch (this.state) {
      case 'idle': {
        this.scanAim();
        if (primaryPressed && !g.hud.blocking) this.startCast();
        break;
      }
      case 'meter':
        this.updateMeter(dt, primaryPressed);
        break;
      case 'tangle':
        this.t2 -= dt;
        if (this.t2 <= 0) {
          this.state = 'idle';
          P.moveLocked = false;
          g.hud.toast('Line untangled');
        }
        break;
      case 'flight':
        this.updateFlight(dt);
        break;
      case 'waiting':
        this.updateWaiting(dt, primaryPressed, primaryHeld, primaryReleased);
        break;
      case 'fight':
        this.updateFight(dt, primaryHeld, input);
        break;
      case 'landing':
        this.updateLanding(dt);
        break;
      case 'stolen':
        this.updateStolen(dt);
        break;
      case 'catch':
        break;
      default:
        break;
    }
    this.updateLine(dt);
  }

  // ------------------------------------------------------------------ meter
  updateMeter(dt, tap) {
    const g = this.game;
    const m = this.meter;
    m.t += dt;
    if (m.phase === 0) {
      m.needle = Math.min(1, Math.pow(m.t / 1.15, 1.3));
      if (tap || m.needle >= 1) {
        m.power = m.needle;
        m.phase = 1;
        m.t = 0;
        g.audio?.tick(1);
      }
    } else if (m.phase === 1) {
      m.needle = m.power - m.t * 1.25;
      if (tap) {
        m.acc = m.needle - ACC_TARGET;
        g.audio?.tick(2);
        this.releaseCast();
        return;
      }
      if (m.needle < -0.09) {
        // backlash: bird's nest in the reel
        g.hud.hideMeter();
        g.hud.banner("Backlash! Bird's nest in the reel", 'bad');
        g.audio?.snag();
        this.state = 'tangle';
        this.t2 = 2.4;
        return;
      }
    }
    g.hud.showMeter({
      needle: m.needle,
      phase: m.phase,
      power: m.phase > 0 ? m.power : null,
      water: this.aim.waterBands,
      hot: this.aim.hotBand,
      accTarget: ACC_TARGET,
    });
  }

  releaseCast() {
    const g = this.game;
    const P = g.player;
    const m = this.meter;
    const err = m.acc;
    const aerr = Math.abs(err);
    let quality;
    if (aerr < 0.022) quality = 'perfect';
    else if (aerr < 0.06) quality = 'good';
    else quality = 'poor';
    const inHot = this.aim.hotBand && m.power >= this.aim.hotBand.p0 - 0.015 && m.power <= this.aim.hotBand.p1 + 0.015;
    this.perfect = quality === 'perfect' && (inHot || !this.aim.hotBand);
    const yawErr = quality === 'perfect' ? 0 : clamp(err * 2.4, -0.4, 0.4) * (quality === 'good' ? 0.35 : 1);
    let dist = this.castDist(m.power);
    if (quality === 'poor') dist *= 0.85;
    const yaw = this.aim.yaw + yawErr;
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const ex = P.pos.x + dx * dist;
    const ez = P.pos.z + dz * dist;
    const w = g.world.waterAt(ex, ez);
    this.water = w;
    const ey = w ? w.level : g.world.heightAt(ex, ez) + 0.05;
    g.viewmodel.cast();
    g.audio?.whoosh();
    this.lureEnd.set(ex, ey, ez);
    this.flightT = -0.3; // wind-up before the lure leaves the tip
    this.flightDur = 0.55 + dist * 0.018;
    this.state = 'flight';
    g.hud.hideMeter();
    g.state.stats.casts++;
    if (this.perfect) {
      g.state.stats.perfects++;
      g.hud.banner('PERFECT CAST!', 'good');
      g.audio?.chime();
      g.onEvent({ type: 'perfect' });
    } else if (quality === 'poor') {
      g.hud.toast(err > 0 ? 'Hooked it left' : 'Sliced it right');
    }
    this.castHot = inHot ? this.aim.hotBand.h : null;
  }

  updateFlight(dt) {
    const g = this.game;
    this.flightT += dt;
    if (this.flightT < 0) {
      g.viewmodel.rodTipWorld(this.tip);
      this.lurePos.copy(this.tip);
      return;
    }
    if (!this.lureMesh.visible) {
      g.viewmodel.rodTipWorld(this.lureStart);
      this.lureMesh.visible = true;
      this.line.visible = true;
    }
    const u = clamp(this.flightT / this.flightDur, 0, 1);
    const apex = 2 + this.lureStart.distanceTo(this.lureEnd) * 0.14;
    this.lurePos.lerpVectors(this.lureStart, this.lureEnd, u);
    this.lurePos.y += apex * 4 * u * (1 - u);
    this.lureMesh.position.copy(this.lurePos);
    if (u >= 1) {
      this.lureMesh.visible = false;
      if (!this.water || this.water.depth < 0.25) {
        g.hud.toast('Snagged on the bank. Reeling in');
        g.audio?.snag();
        this.cancel();
        return;
      }
      g.effects.splash(this.lureEnd.x, this.water.level, this.lureEnd.z, 0.35);
      g.fish?.scare(this.lureEnd.x, this.lureEnd.z, 2.5);
      g.audio?.plop(0.6);
      this.float.visible = true;
      this.float.position.copy(this.lureEnd);
      this.floatBase = this.water.level;
      this.state = 'waiting';
      // a hold that began before the float landed does not reel it back in;
      // retrieving needs a fresh press on the water
      this.pressTime = Infinity;
      this.waitT = 0;
      this.encounter = null;
      this.nextApproach = this.approachDelay();
      g.player.moveLocked = true;
    }
  }

  // Expected delay until a fish takes interest, from all bite modifiers.
  approachDelay() {
    const g = this.game;
    const f = this.float.position;
    let rate = 0.07;
    const hot = this.hotspotAt(f.x, f.z);
    if (hot === 'in') rate *= 3.4;
    else if (hot === 'near') rate *= 1.7;
    const t = g.env.time;
    if ((t > 4 && t < 8.5) || (t > 19 && t < 23)) rate *= 1.45;
    else if (g.env.night > 0.5) rate *= 0.8;
    rate *= 1 + g.env.weather.rain * 0.35;
    if (this.perfect) rate *= 1.35;
    // lure match with the local species pool
    const pool = this.pool();
    const lure = LURES[g.state.gear.lure];
    let match = 0;
    let wsum = 0;
    for (const p of pool) {
      match += (lure.likes[p.id] ?? 0.5) * p.w;
      wsum += p.w;
    }
    rate *= clamp(match / Math.max(wsum, 1e-3), 0.3, 2);
    if (this.salmonRunHere()) rate *= 1.8;
    const mean = 1 / rate;
    return Math.max(1.2, -Math.log(1 - Math.random()) * mean);
  }

  salmonRunHere() {
    const run = this.game.state.salmonRun;
    if (!run || !this.water || this.water.kind !== 'river') return false;
    const pl = this.game.world.place(run.place);
    if (!pl) return false;
    const dx = pl.x - this.float.position.x;
    const dz = pl.z - this.float.position.z;
    return dx * dx + dz * dz < 110 * 110;
  }

  pool() {
    const g = this.game;
    const w = this.water || g.world.waterAt(this.float.position.x, this.float.position.z) || { kind: 'river', s: 0 };
    return speciesPool(w, g.world, this.hotPlace?.id, g.env.night > 0.5);
  }

  pickFish() {
    const g = this.game;
    const pool = this.pool();
    const lure = LURES[g.state.gear.lure];
    const night = g.env.night > 0.5;
    const choice = weightedPick(pool, (p) => p.w * (lure.likes[p.id] ?? 0.5) * (FISH[p.id].night && !night ? 0.1 : 1));
    const id = choice ? choice.id : 'dolly';
    const f = FISH[id];
    // legendary?
    const f0 = this.float.position;
    for (const [lid, L] of Object.entries(LEGENDS)) {
      if (L.base !== id || g.state.legends[lid]) continue;
      const pl = g.world.place(L.place);
      if (!pl) continue;
      const d = Math.hypot(pl.x - f0.x, pl.z - f0.z);
      if (d > 90) continue;
      let chance = 0.035;
      if (g.state.gear.lure === L.lure) chance *= 2.5;
      if (this.castHot) chance *= 1.8;
      if (this.perfect) chance *= 1.6;
      if (g.state.rod().id === 'bigblock') chance *= 1.3;
      if (Math.random() < chance) {
        return { species: id, weight: L.weight * randRange(0.97, 1.04), legend: lid, name: L.name };
      }
    }
    let u = Math.pow(Math.random(), 1.9);
    if (this.castHot) u = Math.max(u, Math.pow(Math.random(), 1.4));
    if (this.perfect) u = Math.min(1, u * 1.15 + 0.05);
    const weight = f.min + (f.max - f.min) * u;
    return { species: id, weight: Math.round(weight * 10) / 10, legend: null, name: f.name };
  }

  // ---------------------------------------------------------------- waiting
  updateWaiting(dt, pressed, held, released) {
    const g = this.game;
    const P = g.player;
    const fl = this.float.position;
    this.waitT += dt;
    // drift with the current, stay on water
    if (this.water && this.water.kind === 'river') {
      const w = g.world.waterAt(fl.x, fl.z);
      if (w && w.depth > 0.3) {
        const nx = fl.x + w.flowX * 0.35 * dt;
        const nz = fl.z + w.flowZ * 0.35 * dt;
        const w2 = g.world.waterAt(nx, nz);
        if (w2 && w2.depth > 0.3) {
          fl.x = nx;
          fl.z = nz;
          this.floatBase = w2.level;
        }
      }
    }
    // retrieve when holding (and not a bite response)
    const enc = this.encounter;
    if (pressed) {
      this.pressTime = this.t;
      if (enc && enc.phase === 'bite') {
        this.hook();
        return;
      }
      if (enc && enc.phase === 'nibble') {
        g.hud.toast('Too early! It spooked');
        g.audio?.plop(0.3);
        this.spook();
      } else {
        // twitch
        this.pullFloat(0.45);
        g.effects.ripples.add(fl.x, this.floatBase, fl.z, 0.8, 0.8);
        this.nextApproach = Math.max(0.5, this.nextApproach * 0.85);
      }
    }
    if (held && this.t - this.pressTime > 0.25) {
      this.pullFloat(1.7 * this.rod().reel * dt);
      g.viewmodel.rodPoseTarget.reeling = 1;
      g.audio?.reel(true, 0.4);
      if (enc && enc.phase === 'approach' && Math.random() < dt * 0.6) enc.skipNibble = true;
    } else {
      g.viewmodel.rodPoseTarget.reeling = 0;
      g.audio?.reel(false);
    }
    const toPlayer = Math.hypot(fl.x - P.pos.x, fl.z - P.pos.z);
    if (toPlayer < 2.6) {
      this.cancel();
      return;
    }
    // bite logic
    if (!enc) {
      this.nextApproach -= dt;
      if (this.nextApproach <= 0) this.startEncounter();
    } else this.updateEncounter(dt);

    // float bobbing
    let dip = 0;
    if (enc && enc.phase === 'nibble' && enc.dipT > 0) dip = Math.sin((enc.dipT / 0.35) * Math.PI) * 0.06;
    if (enc && enc.phase === 'bite') dip = 0.28 + Math.sin(this.t * 30) * 0.03;
    this.float.position.y = this.floatBase + Math.sin(this.t * 2.2) * 0.012 - dip;
    this.float.rotation.z = Math.sin(this.t * 1.7) * 0.08 + (enc && enc.phase === 'bite' ? 0.5 : 0);
    g.hud.setWaitingHint(enc && enc.phase === 'bite');
  }

  pullFloat(d) {
    const g = this.game;
    const P = g.player;
    const fl = this.float.position;
    const dx = P.pos.x - fl.x;
    const dz = P.pos.z - fl.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = fl.x + (dx / l) * d;
    const nz = fl.z + (dz / l) * d;
    const w = g.world.waterAt(nx, nz);
    if (!w || w.depth < 0.15) {
      this.cancel();
      return;
    }
    fl.x = nx;
    fl.z = nz;
    this.floatBase = w.level;
    this.water = w;
  }

  startEncounter() {
    const fish = this.pickFish();
    const fl = this.float.position;
    const W = this.game.world;
    // come in from somewhere with water all the way to the float
    const deepAt = (x, z) => {
      const w = W.waterAt(x, z);
      return w && w.depth >= 0.5;
    };
    let sx = fl.x;
    let sz = fl.z;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = k < 6 ? 5 + Math.random() * 3 : 2 + Math.random() * 1.5;
      const x = fl.x + Math.cos(a) * d;
      const z = fl.z + Math.sin(a) * d;
      if (deepAt(x, z) && deepAt((x + fl.x) / 2, (z + fl.z) / 2)) {
        sx = x;
        sz = z;
        break;
      }
    }
    const big = fish.weight / (FISH[fish.species].max || 10);
    this.encounter = {
      fish,
      phase: 'approach',
      t: 0,
      dur: 1.8 + Math.random() * 1.8,
      sx,
      sz,
      nibbles: Math.floor(Math.random() * 3),
      dipT: 0,
      gap: 0.4 + Math.random() * 0.6,
      window: clamp(0.95 - big * 0.3 - (fish.legend ? 0.2 : 0), 0.45, 0.95),
      skipNibble: false,
      size: clamp(lengthFor(fish.species, fish.weight) / 100, 0.3, 2.2),
    };
    this.showJumper(fish.species, fish.weight);
    this.jumper.visible = false;
  }

  // Place the fish model under water, heading along yaw, swimming.
  swimFish(x, z, yaw, depth, flop, dt) {
    const j = this.jumper;
    if (!j) return;
    j.visible = true;
    j.position.set(x, this.floatBase - depth, z);
    j.rotation.set(0, yaw, 0);
    const u = j.userData.uniforms;
    u.uFlop.value = flop;
    u.uFlopT.value += dt * (0.6 + flop);
  }

  spook() {
    const e = this.encounter;
    if (e) {
      e.phase = 'flee';
      e.t = 0;
    }
    this.nextApproach = this.approachDelay() + 3;
  }

  updateEncounter(dt) {
    const g = this.game;
    const e = this.encounter;
    const fl = this.float.position;
    e.t += dt;
    const deep = 0.42 + e.size * 0.18;
    if (e.phase === 'approach') {
      const u = smoothstep(0, 1, e.t / e.dur);
      // curve in from the side, slowing as it closes on the float
      const x = lerp(e.sx, fl.x, u * 0.9) + Math.sin(u * Math.PI) * 0.6 * Math.cos(e.sx);
      const z = lerp(e.sz, fl.z, u * 0.9);
      const yaw = Math.atan2(fl.x - x, fl.z - z);
      e.x = x;
      e.z = z;
      e.yaw = yaw;
      this.swimFish(x, z, yaw, deep + (1 - u) * 0.4, 0.45 - u * 0.2, dt);
      if (e.t >= e.dur) {
        e.phase = e.skipNibble || e.nibbles === 0 ? 'strike' : 'nibble';
        e.t = 0;
        e.gap = 0.3 + Math.random() * 0.5;
      }
    } else if (e.phase === 'nibble') {
      // nose up under the float, circling a little between pecks
      const back = e.dipT > 0 ? 0.08 : 0.28 + Math.sin(this.t * 1.7) * 0.06;
      const yaw = e.yaw + Math.sin(this.t * 0.9) * 0.25;
      const x = fl.x - Math.sin(yaw) * (back + e.size * 0.45);
      const z = fl.z - Math.cos(yaw) * (back + e.size * 0.45);
      e.x = x;
      e.z = z;
      this.swimFish(x, z, yaw, deep * (e.dipT > 0 ? 0.7 : 1), 0.25, dt);
      if (e.dipT > 0) e.dipT -= dt;
      e.gap -= dt;
      if (e.gap <= 0) {
        if (e.nibbles > 0) {
          e.nibbles--;
          e.dipT = 0.35;
          g.effects.ripples.add(fl.x, this.floatBase, fl.z, 0.7, 0.8);
          g.audio?.plop(0.25);
          g.haptic?.('light');
          e.gap = 0.6 + Math.random() * 1.0;
        } else {
          e.phase = 'strike';
          e.t = 0;
        }
      }
    } else if (e.phase === 'strike') {
      e.phase = 'bite';
      e.t = 0;
      g.effects.splash(fl.x, this.floatBase, fl.z, 0.45);
      g.effects.ripples.add(fl.x, this.floatBase, fl.z, 2.2, 1.2);
      g.audio?.bite();
      g.haptic?.('heavy');
      g.hud.prompt('HOOK!', 'hot', e.window);
    } else if (e.phase === 'bite') {
      // the take: the fish turns down and away with the bait
      const yaw = (e.yaw ?? 0) + Math.min(1, e.t * 3) * 0.9;
      e.x = fl.x - Math.sin(yaw) * e.size * 0.3;
      e.z = fl.z - Math.cos(yaw) * e.size * 0.3;
      this.swimFish(e.x, e.z, yaw, deep * 0.8, 1.1, dt);
      if (e.t > e.window) {
        g.hud.toast('Missed it! The fish spat the hook');
        g.hud.prompt(null);
        this.spook();
      }
    } else if (e.phase === 'flee') {
      const yaw = (e.yaw ?? 0) + Math.PI;
      e.x = (e.x ?? fl.x) + Math.sin(yaw) * dt * 5;
      e.z = (e.z ?? fl.z) + Math.cos(yaw) * dt * 5;
      this.swimFish(e.x, e.z, yaw, deep + e.t * 0.8, 1.3, dt);
      if (e.t > 0.9) {
        this.encounter = null;
        this.hideJumper();
      }
    }
  }

  hook() {
    const g = this.game;
    const e = this.encounter;
    const fish = e.fish;
    const f = FISH[fish.species];
    const P = g.player;
    const fl = this.float.position;
    g.hud.prompt(null);
    g.hud.banner(fish.legend ? `${fish.name.toUpperCase()}!` : 'FISH ON!', fish.legend ? 'legend' : 'good');
    g.audio?.fishOn(!!fish.legend);
    g.haptic?.('heavy');
    const power = f.fight * (10 + 9 * Math.pow(fish.weight, 0.6)) * (fish.legend ? 1.1 : 1);
    const dist = Math.hypot(fl.x - P.pos.x, fl.z - P.pos.z);
    const baseYaw = Math.atan2(-(fl.x - P.pos.x), -(fl.z - P.pos.z));
    this.fight = {
      fish,
      power,
      stamina: 1,
      dist,
      baseYaw,
      angle: 0,
      state: 'run',
      stateT: 1.2 + Math.random(),
      dir: Math.random() < 0.5 ? -1 : 1,
      tension: 20,
      overload: 0,
      slack: 0,
      rodSide: 0,
      jumpT: -1,
      jumps: 0,
      splashT: 0,
      pos: new THREE.Vector3(fl.x, this.floatBase, fl.z),
      level: this.floatBase,
    };
    this.float.visible = false;
    this.encounter = null;
    this.state = 'fight';
    g.effects.splash(fl.x, this.floatBase, fl.z, 0.8);
    g.hud.showFight();
    if (!this.jumper || this.jumperId !== fish.species) this.showJumper(fish.species, fish.weight);
    this.jumper.visible = false;
  }

  // ------------------------------------------------------------------ fight
  nextFightState(F) {
    const s = F.stamina;
    const f = FISH[F.fish.species];
    const options = [
      { id: 'run', w: 0.15 + 0.45 * s },
      { id: 'swim', w: 0.45 },
      { id: 'tired', w: 0.1 + 0.7 * (1 - s) },
      { id: 'jump', w: f.jumpy * 0.35 * (0.3 + s) * (F.dist > 4 ? 1 : 0) },
    ];
    const next = weightedPick(options, (o) => o.w).id;
    F.state = next;
    if (next === 'run') {
      F.stateT = 1.1 + Math.random() * 2.2;
      F.dir = Math.random() < 0.5 ? -1 : 1;
      this.game.audio?.reelScream(true);
    } else {
      this.game.audio?.reelScream(false);
    }
    if (next === 'swim') F.stateT = 1.4 + Math.random() * 1.8;
    if (next === 'tired') F.stateT = 1.4 + Math.random() * 1.4;
    if (next === 'jump') {
      F.stateT = 1.15;
      F.jumpT = 0;
      F.jumps++;
      F.jumpChecked = false;
      this.game.hud.prompt('JUMP! Let go of REEL', 'warn', 1.1);
    }
  }

  updateFight(dt, reeling, input) {
    const g = this.game;
    const F = this.fight;
    const rod = this.rod();
    const P = g.player;
    const fish = F.fish;
    const W = g.world;

    F.stateT -= dt;
    if (F.stateT <= 0) this.nextFightState(F);

    // rod steering from the left-zone drag or A/D
    let side = input.stick.active ? clamp(input.stick.x * 1.4, -1, 1) : 0;
    if (input.key('KeyA') || input.key('ArrowLeft')) side = -1;
    if (input.key('KeyD') || input.key('ArrowRight')) side = 1;
    F.rodSide = damp(F.rodSide, side, 10, dt);

    const lateral = F.state === 'run' || F.state === 'swim' ? F.dir : 0;
    // F.dir > 0 means the fish runs to the player's left; pulling right (+) opposes it
    const opposition = F.rodSide * lateral;
    const sideMult = 1 - 0.22 * opposition;
    const staminaMult = 1 + 0.6 * Math.max(0, opposition) - 0.3 * Math.max(0, -opposition);

    const mult = { run: 1.35, swim: 0.75, tired: 0.35, jump: 1.0 }[F.state];
    const pull = F.power * mult * (0.35 + 0.65 * F.stamina);
    let target = reeling ? pull * sideMult + 16 * rod.reel : pull * 0.42 * sideMult;
    if (F.state === 'jump' && reeling) target += 25;
    target += (Math.sin(this.t * 11) + Math.sin(this.t * 17)) * 2;
    F.tension = damp(F.tension, Math.max(0, target), F.state === 'run' ? 9 : 6, dt);

    // line distance
    const runSpeed = F.state === 'run' ? 2.0 + F.power * 0.018 : F.state === 'swim' ? 0.45 : F.state === 'jump' ? 0.6 : 0;
    if (reeling) {
      const gain = 1.55 * rod.reel * (1 + 20 / (F.power + 10)) * (F.state === 'run' ? 0.12 : F.state === 'swim' ? 0.62 : F.state === 'jump' ? 0.2 : 1.0);
      F.dist += (runSpeed * 0.5 - gain) * dt;
    } else F.dist += runSpeed * dt;
    F.dist = Math.max(1.2, F.dist);
    if (F.dist > 140) return this.lose('Spooled! The fish stripped all your line', true);

    // lateral movement, kept on water
    const angSpeed = F.state === 'run' ? 0.5 : F.state === 'swim' ? 0.16 : 0.02;
    let newAngle = F.angle + (F.dir * angSpeed * dt * 10) / Math.max(F.dist, 6);
    newAngle = clamp(newAngle, -1.1, 1.1);
    const yaw = F.baseYaw + newAngle;
    const fx = P.pos.x - Math.sin(yaw) * F.dist;
    const fz = P.pos.z - Math.cos(yaw) * F.dist;
    const w = W.waterAt(fx, fz);
    if (w && w.depth > 0.35) {
      F.angle = newAngle;
      F.pos.set(fx, w.level - 0.35, fz);
      F.level = w.level;
    } else {
      F.dir = -F.dir;
      // pull the fish back toward the last good spot
      F.dist = Math.max(1.2, F.dist - 0.8 * dt * 10);
      const yaw2 = F.baseYaw + F.angle;
      const x2 = P.pos.x - Math.sin(yaw2) * F.dist;
      const z2 = P.pos.z - Math.cos(yaw2) * F.dist;
      const w3 = W.waterAt(x2, z2);
      if (w3) {
        F.pos.set(x2, w3.level - 0.35, z2);
        F.level = w3.level;
      }
    }

    // stamina
    const drain = ((0.028 + 0.095 * (F.tension / (F.power + 20))) * staminaMult) / Math.pow(fish.weight, 0.22);
    F.stamina -= drain * dt;
    if (!reeling && F.tension < F.power * 0.2) F.stamina += 0.008 * dt;
    F.stamina = clamp(F.stamina, 0, 1);

    // failure: overload, slack, jumps
    if (F.tension > rod.maxTension) F.overload += dt;
    else F.overload = Math.max(0, F.overload - dt * 2);
    if (F.overload > 0.4) return this.lose('SNAP! The line broke', true);
    if (F.tension < Math.min(5, F.power * 0.15) && F.state !== 'tired') F.slack += dt;
    else F.slack = Math.max(0, F.slack - dt * 2);
    if (F.slack > 2.7) return this.lose('Slack line. The fish shook the hook');
    if (F.state === 'jump') {
      F.jumpT += dt;
      if (!F.jumpChecked && F.jumpT > 0.45) {
        F.jumpChecked = true;
        if (reeling && Math.random() < 0.45) return this.lose('It threw the hook mid-jump!');
      }
    }

    // land when close and tired
    if (F.dist < 3.2) {
      if (F.stamina < 0.4) {
        this.state = 'landing';
        this.landT = 0;
        g.hud.hideFight();
        g.audio?.reelScream(false);
        g.audio?.stopReel();
        g.effects.splash(F.pos.x, F.level, F.pos.z, 0.9);
        return;
      }
      F.state = 'run';
      F.stateT = 1.5;
      F.dir = Math.random() < 0.5 ? -1 : 1;
      g.hud.toast('Still too green to land. Wear it out');
    }

    // visuals: splashes, jumper, rod pose, camera assist
    F.splashT -= dt;
    if (F.splashT <= 0 && (F.state === 'run' || F.stamina < 0.3 || F.dist < 8)) {
      F.splashT = F.state === 'run' ? 0.35 : 0.9;
      g.effects.splash(F.pos.x, F.level, F.pos.z, F.state === 'run' ? 0.55 : 0.3);
      if (Math.random() < 0.5) g.audio?.splash(0.3);
    }
    this.updateJumper(dt, F);
    const tNorm = F.tension / rod.maxTension;
    const vm = g.viewmodel.rodPoseTarget;
    const fishYaw = F.baseYaw + F.angle;
    const rel = angleDiff(P.yaw, fishYaw);
    vm.pitch = 0.55 + tNorm * 0.25;
    vm.side = clamp(F.rodSide * 0.7 + rel * 0.4, -1, 1);
    vm.bendY = 0.15 + tNorm * 0.65;
    vm.bendX = clamp(-rel * 0.6 + F.rodSide * 0.1, -0.5, 0.5);
    vm.reeling = reeling ? 1 : 0;
    vm.shake = tNorm > 0.75 ? (tNorm - 0.75) * 4 : 0;
    // gently keep the fish in view
    if (g.input.lookTouch.id === null && !g.input.mouseDown) P.yaw += angleDiff(P.yaw, fishYaw) * Math.min(1, dt * 1.4);
    g.audio?.reel(reeling, tNorm);
    g.audio?.creak(tNorm > 0.82 ? (tNorm - 0.82) * 5 : 0);
    if (tNorm > 0.9) g.haptic?.('light');

    g.hud.setFight({
      tension: tNorm,
      stamina: F.stamina,
      dist: F.dist,
      dir: F.state === 'run' || F.state === 'swim' ? -F.dir : 0,
      rel: rel,
      state: F.state,
      overload: F.overload > 0.05,
      rodSide: F.rodSide,
      reeling,
      opposing: opposition > 0.3,
    });
  }

  showJumper(id, weight) {
    this.hideJumper();
    const m = makeFishModel(id);
    const L = lengthFor(id, weight) / 100;
    m.scale.setScalar(L);
    this.jumper = m;
    this.jumperId = id;
    this.jumperLen = L;
    this.game.scene.add(m);
  }

  hideJumper() {
    if (this.jumper) {
      this.game.scene.remove(this.jumper);
      this.jumper.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
      this.jumper = null;
      this.jumperId = null;
    }
  }

  updateJumper(dt, F) {
    const j = this.jumper;
    if (!j) return;
    const u = j.userData.uniforms;
    u.uFlopT.value += dt;
    if (F.state === 'jump' && F.jumpT >= 0 && F.jumpT < 1.1) {
      const t = F.jumpT / 1.1;
      const h = (0.8 + this.jumperLen * 0.9) * 4 * t * (1 - t);
      j.visible = true;
      j.position.set(F.pos.x, F.level + h - 0.1, F.pos.z);
      const yaw = F.baseYaw + F.angle + Math.PI / 2 * F.dir;
      j.rotation.set(0, yaw, 0);
      j.rotateX(-(t - 0.5) * 2.2);
      j.rotateZ(Math.sin(t * Math.PI * 3) * 0.5);
      u.uFlop.value = 1.2;
      if (!F.splashIn && t > 0.02) {
        F.splashIn = true;
        this.game.effects.splash(F.pos.x, F.level, F.pos.z, 1.0);
        this.game.audio?.splash(0.8);
      }
      if (!F.splashOut && t > 0.93) {
        F.splashOut = true;
        this.game.effects.splash(F.pos.x, F.level, F.pos.z, 1.1);
        this.game.audio?.splash(1);
      }
    } else {
      // fighting under the surface: runs deep and sideways, rolls when tired
      const P = this.game.player.pos;
      const away = Math.atan2(F.pos.x - P.x, F.pos.z - P.z);
      const run = F.state === 'run' ? 1 : F.state === 'swim' ? 0.5 : 0;
      const yaw = away + (F.dir || 1) * run * 0.9;
      const depth = 0.3 + this.jumperLen * 0.25 + run * 0.35 + (F.state === 'tired' ? -0.12 : 0);
      j.visible = true;
      j.position.set(F.pos.x, F.level - depth, F.pos.z);
      j.rotation.set(0, yaw, 0);
      if (F.state === 'tired') j.rotateZ(Math.sin(this.t * 2.2) * 0.5 + 0.3);
      u.uFlop.value = 0.4 + run * 0.8;
      F.splashIn = false;
      F.splashOut = false;
    }
  }

  lose(message, snapped = false) {
    const g = this.game;
    if (snapped) {
      g.state.stats.snapped++;
      g.audio?.snap();
      g.haptic?.('heavy');
    } else g.audio?.splash(0.5);
    g.hud.banner(message, 'bad');
    this.cancel();
    return false;
  }

  // ----------------------------------------------------------------- landing
  updateLanding(dt) {
    const g = this.game;
    const F = this.fight;
    this.landT += dt;
    const P = g.player;
    // a bald eagle may snatch a small fish right at the surface
    if (!F.eagleRolled) {
      F.eagleRolled = true;
      const fish = F.fish;
      const chance = g.debugEagle ? 1 : 0.07;
      const veteran = g.state.stats.caught >= 3 || g.debugEagle;
      if (veteran && fish.weight < 3.2 && !fish.legend && g.env.night < 0.5 && Math.random() < chance) {
        const ok = g.wildlife.swoopSteal(
          () => (this.jumper ? this.jumper.position : F.pos),
          (bird) => this.stolen(bird)
        );
        if (ok) {
          this.state = 'stolen';
          this.stealT = 0;
          this.stealSpot = null;
          this.stealSplashT = 0;
          g.hud.banner('BALD EAGLE!', 'danger');
          g.audio?.reelScream(false);
          return;
        }
      }
    }
    if (this.jumper) {
      this.jumper.visible = true;
      const t = Math.min(1, this.landT / 0.7);
      const tx = lerp(F.pos.x, P.pos.x - Math.sin(P.yaw) * 1.2, t);
      const tz = lerp(F.pos.z, P.pos.z - Math.cos(P.yaw) * 1.2, t);
      this.jumper.position.set(tx, F.level + t * 1.2, tz);
      this.jumper.userData.uniforms.uFlopT.value += dt;
    }
    if (this.landT > 0.7) this.finishCatch();
  }

  // The eagle's dive in progress: the fish flops at the surface near shore.
  updateStolen(dt) {
    const g = this.game;
    const F = this.fight;
    const P = g.player;
    this.stealT += dt;
    const j = this.jumper;
    if (j) {
      j.visible = true;
      if (!this.stealSpot) {
        // thrashing at the surface a few metres out
        const d = Math.max(4.5, Math.hypot(F.pos.x - P.pos.x, F.pos.z - P.pos.z));
        const a = Math.atan2(F.pos.x - P.pos.x, F.pos.z - P.pos.z);
        this.stealSpot = { x: P.pos.x + Math.sin(a) * d, z: P.pos.z + Math.cos(a) * d };
      }
      const hop = Math.abs(Math.sin(this.stealT * 5));
      j.position.set(this.stealSpot.x, F.level + 0.05 + hop * 0.5, this.stealSpot.z);
      j.rotation.set(0, this.stealT * 1.7, Math.sin(this.stealT * 10) * 0.6);
      j.userData.uniforms.uFlop.value = 1.2;
      j.userData.uniforms.uFlopT.value += dt;
      if (hop < 0.08 && this.stealT - (this.stealSplashT || 0) > 0.3) {
        this.stealSplashT = this.stealT;
        g.effects.splash(j.position.x, F.level, j.position.z, 0.35);
      }
    }
    // keep the diving eagle and the fish in view
    const eagle = g.wildlife.birds.find((b) => b.mode === 'swoop');
    const tx = j ? j.position.x : F.pos.x;
    const ty = j ? j.position.y : F.level;
    const tz = j ? j.position.z : F.pos.z;
    let lx = tx;
    let ly = ty;
    let lz = tz;
    if (eagle) {
      const w = clamp(Math.hypot(eagle.x - tx, eagle.z - tz) / 60, 0, 0.6);
      lx = lerp(tx, eagle.x, w);
      ly = lerp(ty, eagle.y, w);
      lz = lerp(tz, eagle.z, w);
    }
    this.lookToward(lx, ly, lz, dt, 3);
    if (this.stealT > 12) this.lose('The fish got away');
  }

  // Ease the first person view toward a world point.
  lookToward(x, y, z, dt, rate) {
    const P = this.game.player;
    const eye = this.game.camera.position;
    const yaw = Math.atan2(-(x - eye.x), -(z - eye.z));
    const pitch = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
    const k = Math.min(1, dt * rate);
    P.yaw += angleDiff(P.yaw, yaw) * k;
    P.pitch += (clamp(pitch, -0.9, 0.9) - P.pitch) * k;
  }

  stolen(bird) {
    const g = this.game;
    // the player walked off or drove away before the eagle arrived
    if (this.state !== 'stolen') return;
    // hand the fish over to the eagle, which carries it off
    if (this.jumper) {
      bird.carried = this.jumper;
      this.jumper = null;
    }
    // watch the thief fly off for a moment
    this.watchBird = bird;
    this.watchT = 3.5;
    g.state.stats.stolen = (g.state.stats.stolen || 0) + 1;
    g.hud.banner('Stolen by an eagle!', 'bad');
    g.hud.toast('A bald eagle snatched your fish. Welcome to Alaska');
    this.cancel();
  }

  finishCatch() {
    const g = this.game;
    const F = this.fight;
    const fish = F.fish;
    const f = FISH[fish.species];
    this.hideJumper();
    this.line.visible = false;
    const len = lengthFor(fish.species, fish.weight);
    let value = Math.round(fish.weight * f.perKg);
    if (fish.legend) value += LEGENDS[fish.legend].bonus;
    const flags = g.state.recordCatch({ species: fish.species, weight: fish.weight, length: len, legend: fish.legend });
    this.catchInfo = {
      species: fish.species,
      name: fish.legend ? fish.name : f.name,
      speciesName: f.name,
      weight: fish.weight,
      length: len,
      value,
      legend: fish.legend,
      ...flags,
      place: this.hotPlace ? this.hotPlace.name : null,
    };
    this.state = 'catch';
    g.viewmodel.showFish(fish.species, len);
    g.player.lookLocked = true;
    g.audio?.fanfare(!!fish.legend || flags.isNew);
    g.haptic?.('success');
    if (fish.legend) {
      const p = g.camera.position;
      g.effects.sparkle(p.x - Math.sin(g.player.yaw) * 1.5, p.y, p.z - Math.cos(g.player.yaw) * 1.5, 60);
    }
    g.onEvent({ type: 'catch', fish: { species: fish.species, weight: fish.weight, legend: fish.legend } });
    g.hud.showCatch(this.catchInfo, g.state.coolerFull(), (keep) => this.resolveCatch(keep));
  }

  // A catch card still waiting for a choice when something else takes over
  // (a mauling, fast travel, going back to the title): keep the fish if there
  // is room so nothing is lost and the card never lingers.
  settleCatch() {
    if (!this.catchInfo) return;
    this.game.hud.closeCatch();
    this.resolveCatch(!this.game.state.coolerFull());
  }

  resolveCatch(keep) {
    const g = this.game;
    const c = this.catchInfo;
    if (keep && !g.state.coolerFull()) {
      g.state.cooler.push({ species: c.species, weight: c.weight, length: c.length, value: c.value, legend: c.legend, name: c.name });
      g.hud.toast(`${c.name} in the cooler (${g.state.cooler.length}/${g.state.coolerCap()})`);
      g.bears?.onFishKept?.();
    } else {
      g.state.stats.released++;
      const P = g.player;
      g.effects.splash(P.pos.x - Math.sin(P.yaw) * 2, (this.water && this.water.level) || P.pos.y, P.pos.z - Math.cos(P.yaw) * 2, 0.6);
      g.audio?.splash(0.6);
      g.hud.toast(`Released the ${c.name.toLowerCase()}. Good karma`);
    }
    g.viewmodel.hideFish();
    g.player.lookLocked = false;
    this.catchInfo = null;
    this.cancel();
    g.save();
  }

  // ----------------------------------------------------------------- line
  updateLine() {
    const g = this.game;
    const show = this.state === 'flight' || this.state === 'waiting' || this.state === 'fight' || this.state === 'landing';
    this.line.visible = show && (this.state !== 'flight' || this.flightT >= 0);
    if (!this.line.visible) return;
    g.viewmodel.rodTipWorld(this.tip);
    let end;
    let sag;
    if (this.state === 'flight') {
      end = this.lurePos;
      sag = 0.1;
    } else if (this.state === 'waiting') {
      end = this.float.position;
      sag = 0.6;
    } else if (this.state === 'fight') {
      end = this.fight.pos;
      const tn = this.fight.tension / this.rod().maxTension;
      sag = clamp(0.8 - tn * 1.2, 0.02, 0.8);
    } else {
      end = this.jumper ? this.jumper.position : this.fight.pos;
      sag = 0.05;
    }
    const p = this.linePos;
    const dist = this.tip.distanceTo(end);
    for (let i = 0; i < LINE_PTS; i++) {
      const t = i / (LINE_PTS - 1);
      p[i * 3] = lerp(this.tip.x, end.x, t);
      p[i * 3 + 1] = lerp(this.tip.y, end.y, t) - Math.sin(t * Math.PI) * sag * Math.min(1, dist / 12);
      p[i * 3 + 2] = lerp(this.tip.z, end.z, t);
    }
    this.lineGeo.setPositions(p);
    this.lineMat.resolution.set(g.renderer.domElement.width, g.renderer.domElement.height);
    this.lineMat.linewidth = 1.3 * (g.dpr || 1);
  }

  // --------------------------------------------------------------- hotspots
  hotspotAt(x, z) {
    let res = null;
    for (const h of this.hotspots) {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < h.r) return 'in';
      if (d < h.r * 2.4) res = 'near';
    }
    return res;
  }

  updateHotspots(dt) {
    const g = this.game;
    const P = g.player.mode === 'drive' ? g.hotrod.pos : g.player.pos;
    // nearest fishing place
    let near = null;
    let nd = 1e9;
    for (const pl of g.world.places) {
      if (pl.kind !== 'fishing') continue;
      const d = Math.hypot(pl.x - P.x, pl.z - P.z);
      if (d < nd) {
        nd = d;
        near = pl;
      }
    }
    if (!near || nd > 160) {
      this.hotPlace = null;
      this.hotspots.length = 0;
      return;
    }
    if (this.hotPlace !== near) {
      this.hotPlace = near;
      this.hotspots.length = 0;
    }
    const want = this.game.state.salmonRun && this.game.state.salmonRun.place === near.id ? 5 : 3;
    while (this.hotspots.length < want) {
      const h = this.spawnHotspot(near);
      if (!h) break;
      this.hotspots.push(h);
    }
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      const h = this.hotspots[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.hotspots.splice(i, 1);
        continue;
      }
      h.rip -= dt;
      if (h.rip <= 0) {
        h.rip = 0.5 + Math.random() * 0.9;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * h.r * 0.8;
        g.effects.ripples.add(h.x + Math.cos(a) * r, h.y, h.z + Math.sin(a) * r, 0.8 + Math.random() * 1.4, 1.4);
      }
      h.jump -= dt;
      if (h.jump <= 0) {
        h.jump = 5 + Math.random() * 9;
        g.wildlife?.jumpFish(h.x + (Math.random() - 0.5) * h.r, h.y, h.z + (Math.random() - 0.5) * h.r, h.kind);
      }
    }
  }

  spawnHotspot(pl) {
    const g = this.game;
    const W = g.world;
    for (let tries = 0; tries < 40; tries++) {
      const face = pl.face ?? 0;
      const a = face + (Math.random() - 0.5) * 1.8;
      const d = 9 + Math.random() * (this.maxCast() + 6);
      const x = pl.x - Math.sin(a) * d;
      const z = pl.z - Math.cos(a) * d;
      const w = W.waterAt(x, z);
      if (!w || w.depth < 0.9) continue;
      let clash = false;
      for (const h of this.hotspots) if (Math.hypot(h.x - x, h.z - z) < 9) clash = true;
      if (clash) continue;
      return { x, z, y: w.level, r: 3 + Math.random() * 1.6, life: 70 + Math.random() * 90, rip: Math.random(), jump: 2 + Math.random() * 6, kind: w.kind };
    }
    return null;
  }
}
