// Grizzly and black bears: fishing bears at Bear Falls, roaming bears, and the
// encounter director that stages charges near fishing spots. A bear only
// comes for you when there is fish in the cooler; with none it fishes, roams
// and runs off when hurt. States: roam, fish, stalk, alert, charge, attack,
// retreat, dead.
import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff, lerp } from '../util/math.js';
import { HALF, SURF } from '../world/worldgen.js';

const CFG = { walk: 1.5, run: 10.5, height: 1.25, len: 2.1, body: 0.62, head: 0.34, wade: 1.4, maxSlope: 0.9 };
// black bears: smaller, lighter swipes, quicker to bluff and to run
const BLACK = { walk: 1.1, run: 9, height: 1.0, len: 1.5, body: 0.42, head: 0.2, wade: 0.6, maxSlope: 0.8 };
const KIND = {
  grizzly: { species: 'bear', cfg: CFG, hp: 240, bluff: 0.28, dmg: [20, 30], smell: 30, name: 'GRIZZLY!', down: 'GRIZZLY DOWN', herd: 'bear' },
  black: { species: 'blackbear', cfg: BLACK, hp: 150, bluff: 0.6, dmg: [10, 16], smell: 22, name: 'BLACK BEAR!', down: 'BLACK BEAR DOWN', herd: 'blackbear' },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = { x: 0, y: 1, z: 0 };
const _nv = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Bears {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.bears = [];
    this.threat = null;
    this.directorT = 70;
    this.firstEncounterDone = false;
    this.spawnBears();
  }

  makeBear(x, z, mode, kind = 'grizzly') {
    const K = KIND[kind];
    const b = {
      species: K.species,
      kind,
      isBear: true,
      cfg: K.cfg,
      x,
      z,
      y: this.world.heightAt(x, z),
      homeX: x,
      homeZ: z,
      yaw: Math.random() * Math.PI * 2,
      speed: 0,
      targetSpeed: 0,
      state: mode,
      mode,
      t: Math.random() * 5,
      hp: K.hp,
      dead: false,
      huntable: true,
      visible: true,
      phase: Math.random() * 10,
      amp: 0,
      head: 0,
      headT: 0,
      stand: 0,
      standT: 0,
      scale: 0.95 + Math.random() * 0.15,
      swipeT: 0,
      bluff: false,
      growlT: 0,
    };
    this.bears.push(b);
    return b;
  }

  spawnBears() {
    const W = this.world;
    // two bears fishing at the falls, standing in the water below the lip
    if (W.fallsS > 0) {
      for (let i = 0; i < 2; i++) {
        const s = W.fallsS + 4 + i * 9;
        const p = W.river.sample(s);
        const off = (i ? -0.35 : 0.3) * W.riverWidth(s);
        const x = p.x - p.tz * off;
        const z = p.z + p.tx * off;
        const b = this.makeBear(x, z, 'fish');
        b.yaw = Math.atan2(-p.tx, -p.tz);
      }
    }
    // a bear working the river at Salmon Bend
    const bend = W.place('bend');
    const bs = W.river.nearest(bend.x, bend.z).s + 60;
    const bp = W.river.sample(bs);
    this.makeBear(bp.x + bp.tz * (W.riverWidth(bs) + 6), bp.z - bp.tx * (W.riverWidth(bs) + 6), 'roam');
    // roaming bears in the woods
    const spots = [
      [-420, -120],
      [120, -140],
      [520, 320],
      [-620, 380],
    ];
    for (const [x, z] of spots) this.makeBear(x, z, 'roam');
    // black bears in the thick forest
    const wl = this.game.wildlife;
    if (wl && wl.habitats) for (const p of wl.findSpots(wl.habitats.blackbear, 3, 120)) this.makeBear(p.x, p.z, 'roam', 'black');
  }

  // Fish in the cooler (or the chest freezer): the only thing that makes a
  // bear come for you.
  smellsFish() {
    return this.game.state.cooler.length > 0;
  }

  // The bear after you (if any) goes home to what it was doing: a fishing
  // bear back to its fishing.
  clearThreat() {
    if (this.threat) {
      const b = this.threat;
      if (!b.dead) {
        b.state = b.mode;
        b.x = b.homeX;
        b.z = b.homeZ;
      }
    }
    this.threat = null;
    this.game.hud?.danger(0, 0);
  }

  // A new game, or a save continued: every bear alive and at home, nothing
  // after you, the encounters' clock started over.
  reset() {
    this.clearThreat();
    for (const b of this.bears) {
      b.state = b.mode;
      b.x = b.homeX;
      b.z = b.homeZ;
      b.y = this.world.heightAt(b.x, b.z);
      b.hp = KIND[b.kind].hp;
      b.dead = false;
      b.deadT = 0;
      b.speed = 0;
      b.t = Math.random() * 5;
      b.lunge = 0;
      b.visible = true;
    }
    this.directorT = 70;
    this.firstEncounterDone = false;
  }

  onFishKept() {
    // the smell of fish shortens the wait for the next encounter
    this.directorT = Math.max(20, this.directorT - 12);
  }

  playerPos() {
    const g = this.game;
    return g.player.mode === 'drive' ? g.car.pos : g.player.mode === 'boat' ? g.boat.pos : g.player.pos;
  }

  // On your own two feet on land: in the car or out on the boat a bear
  // cannot get at you.
  exposed() {
    const P = this.game.player;
    return P.mode === 'foot' && !P.boat;
  }

  // ---------------------------------------------------------------- director
  director(dt) {
    const g = this.game;
    // (one bear at a time: none while one is stalking you either)
    if (!g.started || this.threat || this.bears.some((b) => b.state === 'stalk')) return;
    const P = this.playerPos();
    let place = null;
    let pd = 1e9;
    for (const p of this.world.places) {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < pd) {
        pd = d;
        place = p;
      }
    }
    const risk = place && pd < 180 ? place.bearRisk || 0.15 : 0.12;
    const fishing = g.fishing.state === 'waiting' || g.fishing.state === 'fight';
    const cooler = g.state.cooler.length;
    const onFoot = this.exposed();
    if (!onFoot || !this.smellsFish()) return;
    this.directorT -= dt * (fishing ? 1 : 0.5) * (0.5 + risk) * (1 + cooler * 0.08) * (g.state.salmonRun ? 1.3 : 1);
    if (this.directorT > 0) return;
    this.directorT = 85 + Math.random() * 110;
    // first encounter only after the player has some fish, as a lesson
    if (!this.firstEncounterDone && g.state.stats.caught < 2) return;
    const chance = clamp(risk * (0.55 + cooler * 0.08), 0.1, 0.95);
    if (Math.random() > chance) return;
    this.stage(P);
  }

  // Bring a bear in from out of sight to stalk the player.
  stage(P) {
    const g = this.game;
    const W = this.world;
    let bear = null;
    let best = 1e9;
    for (const b of this.bears) {
      if (b.dead || b.mode === 'fish' || b.state === 'gone') continue;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      // (a bear close enough to be seen is not moved out of sight)
      if (d < 120) continue;
      if (d < best) {
        best = d;
        bear = b;
      }
    }
    if (!bear) return;
    // spawn behind the player, on dry land
    const yaw = g.player.yaw;
    for (let i = 0; i < 24; i++) {
      const a = yaw + Math.PI + (Math.random() - 0.5) * 2.2;
      const d = 58 + Math.random() * 18;
      const x = P.x - Math.sin(a) * d;
      const z = P.z - Math.cos(a) * d;
      if (!W.inBounds(x, z, 40)) continue;
      const w = W.waterAt(x, z);
      if (w && w.depth > 0.4) continue;
      if (W.slopeAt(x, z) > 0.8) continue;
      bear.x = x;
      bear.z = z;
      bear.state = 'stalk';
      bear.t = 25;
      bear.hp = KIND[bear.kind].hp;
      bear.bluff = Math.random() < KIND[bear.kind].bluff;
      this.firstEncounterDone = true;
      g.audio?.growl(x, z, 0.5);
      return;
    }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    if (g.paused && g.started) return;
    this.director(dt);
    const P = this.playerPos();
    const onFoot = this.exposed();
    const fish = this.smellsFish();
    for (const b of this.bears) {
      if (b.state === 'gone') {
        b.t -= dt;
        b.visible = false;
        // (back at home only while you are not there to see it appear)
        if (b.t <= 0 && Math.hypot(P.x - b.homeX, P.z - b.homeZ) > 300) {
          b.deadT = 0;
          b.state = b.mode;
          b.x = b.homeX;
          b.z = b.homeZ;
          b.hp = KIND[b.kind].hp;
          b.dead = false;
        }
        continue;
      }
      const dx = P.x - b.x;
      const dz = P.z - b.z;
      const d = Math.hypot(dx, dz);
      b.visible = d < 600;
      if (b.dead) continue;
      if (d > 650 && b !== this.threat) continue;
      b.t -= dt;
      b.growlT -= dt;
      const toPlayer = Math.atan2(dx, dz);
      let desired = b.yaw;
      b.headT = 0;
      b.standT = 0;
      switch (b.state) {
        case 'fish': {
          b.targetSpeed = 0;
          b.headT = 0.7 + Math.sin(g.time * 0.7 + b.phase) * 0.3;
          // lunge for a salmon now and then
          if (b.t <= 0) {
            b.t = 5 + Math.random() * 8;
            b.lunge = 0.6;
            g.effects.splash(b.x + Math.sin(b.yaw) * 1.4, b.y + 0.6, b.z + Math.cos(b.yaw) * 1.4, 0.9);
            g.audio?.splash(0.6, b.x, b.z);
          }
          if (b.lunge > 0) {
            b.lunge -= dt;
            b.headT = 1.2;
          }
          // surprise: player walks right up to a fishing bear with fish on him
          if (onFoot && fish && d < 16 && !this.threat && !this.fishingBusy()) this.alert(b, 2.2);
          break;
        }
        case 'roam': {
          b.headT = 0.4;
          if (b.t <= 0 || Math.hypot(b.tx - b.x, b.tz - b.z) < 3) {
            b.t = 8 + Math.random() * 10;
            b.tx = b.homeX + (Math.random() - 0.5) * 160;
            b.tz = b.homeZ + (Math.random() - 0.5) * 160;
          }
          desired = Math.atan2((b.tx ?? b.x) - b.x, (b.tz ?? b.z) - b.z);
          b.targetSpeed = b.cfg.walk;
          const smell = KIND[b.kind].smell + g.state.cooler.length * 6;
          if (onFoot && fish && d < Math.min(smell, 45) && !this.threat && !this.fishingBusy()) this.alert(b, 3.2);
          break;
        }
        case 'stalk': {
          // sniffing its way toward the player
          desired = toPlayer + Math.sin(g.time * 0.6 + b.phase) * 0.4;
          b.targetSpeed = 2.2;
          b.headT = 0.5 + Math.sin(g.time * 3) * 0.3;
          if (b.growlT <= 0) {
            b.growlT = 4 + Math.random() * 3;
            g.audio?.huff(b.x, b.z);
          }
          // (a fish on the line is fought to the end first: the bear holds
          // back, sniffing, and comes on once it is landed or gone)
          if (this.fishingBusy()) {
            if (d < 34) b.targetSpeed = 0;
          } else if (d < 42 || b.t <= 0) this.alert(b, 3.6);
          if (!onFoot || !fish) {
            b.state = 'retreat';
            b.t = 8;
          }
          break;
        }
        case 'alert': {
          // stands up, sniffs, huffs: the warning window
          desired = toPlayer;
          b.targetSpeed = 0;
          b.standT = b.t > 1.2 ? 1 : 0;
          if (b.growlT <= 0) {
            b.growlT = 1.3;
            g.audio?.huff(b.x, b.z);
          }
          if (b.t <= 0) {
            if (!onFoot || d > 70 || !fish) {
              b.state = 'retreat';
              b.t = 10;
              this.endThreat(false, b);
            } else {
              b.state = 'charge';
              b.t = 12;
              g.audio?.growl(b.x, b.z, 1, true);
              g.hud?.banner('CHARGE!', 'danger');
              g.haptic?.('heavy');
            }
          }
          break;
        }
        case 'charge': {
          desired = toPlayer;
          b.targetSpeed = b.cfg.run;
          b.headT = -0.1;
          if (b.growlT <= 0) {
            b.growlT = 1.2;
            g.audio?.growl(b.x, b.z, 0.9, Math.random() < 0.5);
          }
          if (b.bluff && d < 11) {
            // bluff charge: stops short, stands, then leaves
            b.state = 'bluffstop';
            b.t = 2.5;
            g.hud?.toast('Bluff charge! Stand your ground');
          } else if (d < 2.6) {
            b.state = 'attack';
            b.t = 0.4;
            b.reachT = 0;
          }
          if (!onFoot || b.t <= 0) {
            b.state = 'retreat';
            b.t = 10;
            this.endThreat(true, b);
          }
          break;
        }
        case 'bluffstop':
          desired = toPlayer;
          b.targetSpeed = 0;
          b.standT = b.t > 1 ? 1 : 0;
          if (b.t <= 0) {
            b.state = 'retreat';
            b.t = 10;
            this.endThreat(true, b);
          }
          break;
        case 'attack': {
          desired = toPlayer;
          b.targetSpeed = d > 2.4 ? 4 : 0;
          b.headT = 0.3;
          // in the car or on the boat: out of reach before any swipe
          if (!onFoot) {
            b.state = 'retreat';
            b.t = 10;
            this.endThreat(true, b);
            break;
          }
          b.swipeT -= dt;
          // kept from you (behind something) for long enough: it gives up
          b.reachT = (b.reachT || 0) + dt;
          if (b.reachT > 8) {
            b.reachT = 0;
            b.state = 'retreat';
            b.t = 10;
            this.endThreat(true, b);
            break;
          }
          if (d > 6) {
            b.state = 'charge';
            b.t = 6;
          } else if (b.swipeT <= 0 && d < 3) {
            b.swipeT = 1.15;
            b.reachT = 0;
            b.lunge = 0.35;
            const [d0, d1] = KIND[b.kind].dmg;
            const dmg = d0 + Math.random() * (d1 - d0);
            g.audio?.swipe();
            g.audio?.growl(b.x, b.z, 1, true);
            g.player.hurt(dmg, dx / (d || 1), dz / (d || 1));
          }
          if (b.lunge > 0) {
            b.lunge -= dt;
            b.standT = 0.6;
          }
          break;
        }
        case 'retreat':
        case 'flee':
          desired = toPlayer + Math.PI;
          b.targetSpeed = b.state === 'flee' ? b.cfg.run * 0.9 : b.cfg.walk * 2.5;
          if (b.t <= 0 || d > 150) {
            b.state = b.mode;
            b.t = 5;
            if (b.mode === 'fish') {
              b.x = b.homeX;
              b.z = b.homeZ;
            }
          }
          break;
        default:
          break;
      }
      this.move(b, desired, dt);
    }
    // threat bookkeeping for the HUD and music
    const tb = this.threat;
    if (tb) {
      if (tb.dead || tb.state === 'retreat' || tb.state === 'flee' || tb.state === 'roam' || tb.state === 'fish') {
        this.threat = null;
        g.hud?.danger(0, 0);
      } else {
        const dx = tb.x - P.x;
        const dz = tb.z - P.z;
        const d = Math.hypot(dx, dz);
        const bearing = Math.atan2(dx, -dz);
        const cam = g.camera.getWorldDirection(_v);
        const heading = Math.atan2(cam.x, -cam.z);
        let rel = bearing - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const inten = tb.state === 'charge' || tb.state === 'attack' ? 1 : clamp(1 - d / 60, 0.3, 1);
        g.hud?.danger(rel, Math.abs(rel) > 0.35 ? inten : 0);
      }
    }
  }

  // A fish on the line, being landed or on the catch card: no bear starts
  // a charge until that is over.
  fishingBusy() {
    const s = this.game.fishing?.state;
    return s === 'fight' || s === 'landing' || s === 'catch' || s === 'stolen';
  }

  alert(b, warn) {
    const g = this.game;
    if (this.threat && this.threat !== b) return;
    b.state = 'alert';
    b.t = warn;
    b.growlT = 0;
    this.threat = b;
    this.threatStartHp = b.hp;
    g.audio?.growl(b.x, b.z, b.kind === 'black' ? 0.6 : 0.8);
    g.hud?.banner(KIND[b.kind].name, 'danger');
    g.announcer?.say('bear', { banner: false, sub: KIND[b.kind].name });
    g.hud?.toast(g.player.tool !== 'bow' ? 'Switch to your bow!' : 'Draw and aim for the chest!', 'bad');
    g.haptic?.('heavy');
    if (g.fishing.state === 'fight' || g.fishing.state === 'waiting') g.fishing.cancel('You drop the line');
  }

  // The threat over. b: the bear whose charge ended; another bear's ending
  // leaves the one after you as it is.
  endThreat(survived, b = this.threat) {
    const g = this.game;
    if (b !== this.threat) return;
    if (survived && this.threat) {
      g.state.stats.bearsSurvived++;
      g.onEvent({ type: 'bearSurvived' });
      g.hud?.toast(this.threat.kind === 'black' ? 'You saw off the black bear' : 'You survived the grizzly', 'good');
    }
    this.threat = null;
    g.hud?.danger(0, 0);
  }

  // Called by hunting when a bear is shot.
  onHit(b, killed) {
    const g = this.game;
    if (killed) {
      if (this.threat === b) this.endThreat(true);
      g.state.stats.bearsKilled++;
      return;
    }
    // wounded bears often break off, and always when there is no fish to fight for
    if (!this.smellsFish() || b.kind === 'black' || (b.hp < 110 && Math.random() < 0.55)) {
      b.state = 'flee';
      b.t = 12;
      if (this.threat === b) this.endThreat(true);
      g.audio?.growl(b.x, b.z, 0.8);
    } else if (this.threat && this.threat !== b) {
      // one bear after you at a time: a second one, hurt, makes off
      b.state = 'flee';
      b.t = 12;
      g.audio?.growl(b.x, b.z, 0.8);
    } else if (b.state === 'roam' || b.state === 'fish' || b.state === 'stalk' || b.state === 'alert') {
      this.threat = b;
      b.state = 'charge';
      b.t = 10;
      b.bluff = false;
      g.audio?.growl(b.x, b.z, 1, true);
      g.hud?.banner('CHARGE!', 'danger');
    }
  }

  // A whistler arrow shrieking past sends a bear running, fish or no fish.
  scareOff(b) {
    const g = this.game;
    if (b.dead || b.state === 'flee' || b.state === 'gone') return;
    b.state = 'flee';
    b.t = 14;
    g.audio?.growl(b.x, b.z, 0.7);
    if (this.threat === b) this.endThreat(true);
    g.hud?.toast('The whistler sent the bear running', 'good');
    g.jobs?.onEvent('scareOff');
  }

  // The banner when a bear goes down.
  downBanner(b) {
    return KIND[b.kind].down;
  }

  // Bear spray in front of the player.
  spray() {
    const g = this.game;
    const P = g.player;
    if (g.state.gear.spray <= 0) return;
    g.state.gear.spray--;
    g.audio?.spray();
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    for (let i = 0; i < 40; i++) {
      const s = 2 + Math.random() * 8;
      g.effects.soft.emit(P.pos.x + fx * 0.8, P.pos.y + 1.3, P.pos.z + fz * 0.8, fx * s + (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 1.5, fz * s + (Math.random() - 0.5) * 2, 1.4, 0.3, 2.2, 0.95, 0.55, 0.35, 0.5, 0.5, 1.2);
    }
    for (const b of this.bears) {
      if (b.dead) continue;
      const dx = b.x - P.pos.x;
      const dz = b.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.abs(angleDiff(Math.atan2(-fx, -fz), Math.atan2(-dx, -dz)));
      if (d < 10 && ang < 0.8) {
        b.state = 'flee';
        b.t = 14;
        g.audio?.growl(b.x, b.z, 0.9);
        if (this.threat === b) this.endThreat(true);
        g.hud?.toast('The bear spray worked!', 'good');
      }
    }
  }

  move(b, desired, dt) {
    const W = this.world;
    b.yaw = dampAngle(b.yaw, desired, b.state === 'charge' ? 5 : 2.5, dt);
    b.speed = damp(b.speed, b.targetSpeed, b.state === 'charge' ? 2.5 : 2, dt);
    const nx = b.x + Math.sin(b.yaw) * b.speed * dt;
    const nz = b.z + Math.cos(b.yaw) * b.speed * dt;
    if (b.speed > 0.05 && W.inBounds(nx, nz, 30)) {
      const w = W.waterAt(nx, nz);
      const slope = W.slopeAt(nx, nz);
      const charging = b.state === 'charge' || b.state === 'attack';
      if ((!w || w.depth < b.cfg.wade || charging) && (slope < b.cfg.maxSlope || charging)) {
        const r = this.game.colliders.resolve(nx, nz, 0.6, b.y, 1.5);
        b.x = r.x;
        b.z = r.z;
      } else b.speed *= 0.5;
    }
  }

  render(dt) {
    const W = this.world;
    const herds = this.game.wildlife.herds;
    for (const b of this.bears) {
      if (!b.visible) continue;
      const herd = herds[KIND[b.kind].herd];
      const C = b.cfg;
      const water = W.waterAt(b.x, b.z);
      const ground = W.heightAt(b.x, b.z);
      b.y = water ? Math.max(ground, water.level - 0.8) : ground;
      b.head = damp(b.head, b.headT, 4, dt);
      b.stand = damp(b.stand, b.standT, 5, dt);
      b.phase += dt * (b.speed * 1.1 + (b.speed > 0.1 ? 1 : 0));
      if (b.phase > 6283.185307) b.phase -= 6283.185307;
      const amp = clamp(b.speed / C.walk, 0, 1) * 0.5 + clamp((b.speed - C.walk) / (C.run - C.walk), 0, 1) * 0.5;
      b.amp = damp(b.amp, b.dead ? 0 : amp, 6, dt);
      W.normalAt(b.x, b.z, _n);
      _nv.set(_n.x, _n.y, _n.z);
      _q2.setFromUnitVectors(UP, _nv);
      _q.setFromAxisAngle(UP, b.yaw);
      // stand on the hind legs: pitch up around the rear
      const standAng = b.stand * 1.15;
      _e.set(-standAng, 0, b.dead ? Math.min(1, (b.deadT = (b.deadT || 0) + dt) * 2) * 1.45 : 0, 'XYZ');
      _q.multiply(new THREE.Quaternion().setFromEuler(_e));
      const q = _q2.multiply(_q);
      const lift = Math.sin(standAng) * 0.9 * b.scale;
      const back = (1 - Math.cos(standAng)) * 0.9 * b.scale;
      _v.set(b.x - Math.sin(b.yaw) * back, b.y + lift * 0.55 - (b.dead ? 0.35 : 0), b.z - Math.cos(b.yaw) * back);
      _s.setScalar(b.scale);
      _m.compose(_v, q, _s);
      herd.push(_m, b.phase, b.amp + (b.lunge > 0 ? 0.6 : 0), b.head, 0.2);
    }
  }

  // Remove a claimed bear; it comes back much later.
  remove(b) {
    b.state = 'gone';
    b.t = 600;
    b.visible = false;
  }
}
