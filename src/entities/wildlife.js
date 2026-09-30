// Wildlife: grazing and fleeing game animals, birds (soaring eagles, ravens,
// gulls, geese V-formations, ducks and loons on lakes, puffins, ptarmigan),
// whales and sea otters in the bay, and fish jumping at hotspots and falls.
import * as THREE from 'three';
import {
  mooseModel,
  caribouModel,
  deerModel,
  sheepModel,
  bearModel,
  wolfModel,
  foxModel,
  hareModel,
  eagleModel,
  ravenModel,
  gullModel,
  gooseModel,
  duckModel,
  loonModel,
  puffinModel,
  ptarmiganModel,
  whaleModel,
  otterModel,
  AnimatedHerd,
} from './animalmodels.js';
import { makeFishModel } from './fishmodels.js';
import { mulberry32, clamp, damp, dampAngle, angleDiff, lerp, randRange, smoothstep } from '../util/math.js';
import { HALF, SURF } from '../world/worldgen.js';
import { GAME } from '../gameplay/data.js';

const SPECIES = {
  moose: { walk: 1.3, run: 8.5, flee: 36, height: 2.1, len: 2.6, body: 0.75, head: 0.4, wade: 1.25, maxSlope: 0.7, count: 7, gait: 1.3 },
  caribou: { walk: 1.4, run: 12, flee: 70, height: 1.3, len: 1.8, body: 0.5, head: 0.25, wade: 0.5, maxSlope: 0.8, count: 16, herd: true, gait: 1.7 },
  deer: { walk: 1.2, run: 11, flee: 42, height: 1.0, len: 1.3, body: 0.36, head: 0.18, wade: 0.4, maxSlope: 0.8, count: 10, gait: 1.9 },
  sheep: { walk: 1.0, run: 7, flee: 85, height: 0.95, len: 1.2, body: 0.34, head: 0.17, wade: 0.2, maxSlope: 1.9, count: 8, herd: true, gait: 1.9 },
  wolf: { walk: 1.8, run: 10, flee: 60, height: 0.9, len: 1.3, body: 0.3, head: 0.15, wade: 0.5, maxSlope: 0.9, count: 4, herd: true, gait: 2.0 },
  fox: { walk: 1.6, run: 8, flee: 24, height: 0.45, len: 0.8, body: 0.15, head: 0.08, wade: 0.2, maxSlope: 0.9, count: 5, gait: 3.2 },
  hare: { walk: 1.4, run: 9, flee: 12, height: 0.35, len: 0.4, body: 0.1, head: 0.06, wade: 0.1, maxSlope: 0.9, count: 12, gait: 4.0, hop: true },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = { x: 0, y: 1, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const _nv = new THREE.Vector3();

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    this.group.name = 'wildlife';
    game.scene.add(this.group);
    this.rand = mulberry32(4242);
    this.animals = [];
    this.herds = {
      moose: new AnimatedHerd(mooseModel(true), 12),
      caribou: new AnimatedHerd(caribouModel(true), 20),
      deer: new AnimatedHerd(deerModel(true), 14),
      sheep: new AnimatedHerd(sheepModel(), 12),
      wolf: new AnimatedHerd(wolfModel(), 6),
      fox: new AnimatedHerd(foxModel(), 6, { shadow: false }),
      hare: new AnimatedHerd(hareModel(), 14, { shadow: false }),
      bear: new AnimatedHerd(bearModel(), 10),
      eagle: new AnimatedHerd(eagleModel(), 6),
      raven: new AnimatedHerd(ravenModel(), 6),
      gull: new AnimatedHerd(gullModel(), 14),
      goose: new AnimatedHerd(gooseModel(), 12),
      duck: new AnimatedHerd(duckModel(), 12, { shadow: false }),
      loon: new AnimatedHerd(loonModel(), 6, { shadow: false }),
      puffin: new AnimatedHerd(puffinModel(), 8, { shadow: false }),
      ptarmigan: new AnimatedHerd(ptarmiganModel(), 10, { shadow: false }),
      whale: new AnimatedHerd(whaleModel(), 3, { shadow: false }),
      otter: new AnimatedHerd(otterModel(), 6, { shadow: false }),
    };
    for (const h of Object.values(this.herds)) this.group.add(h.mesh);
    this.birds = [];
    this.whales = [];
    this.otters = [];
    this.jumpers = [];
    this.jumperModels = {};
    this.gooseT = 60 + Math.random() * 60;
    this.fallsJumpT = 1;
    this.spawnAnimals();
    this.spawnBirds();
    this.spawnMarine();
  }

  // --------------------------------------------------------------- spawning
  findSpots(pred, count, minSep = 60, tries = 30000) {
    const W = this.world;
    const out = [];
    for (let i = 0; i < tries && out.length < count; i++) {
      const x = (this.rand() - 0.5) * (2 * HALF - 120);
      const z = (this.rand() - 0.5) * (2 * HALF - 120);
      if (!pred(x, z)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < minSep)) continue;
      out.push({ x, z });
    }
    return out;
  }

  spawnAnimals() {
    const W = this.world;
    const dry = (x, z) => !W.waterAt(x, z);
    const surf = (x, z) => W.surfaceAt(x, z);
    const h = (x, z) => W.heightAt(x, z);
    const moose = W.lakeById.moose;
    const habitats = {
      moose: (x, z) => {
        const k = W.cellIndex(x, z);
        const nearLake = Math.hypot(x - moose.x, z - moose.z) < moose.r + 90;
        const nearRiver = W.riverD[k] < 110 && h(x, z) < 40;
        return (nearLake || nearRiver) && dry(x, z) && W.slopeAt(x, z) < 0.35;
      },
      caribou: (x, z) => surf(x, z) === SURF.TUNDRA && x > 300 && z < -150 && z > -1000 && W.slopeAt(x, z) < 0.35 && dry(x, z),
      deer: (x, z) => {
        const k = W.cellIndex(x, z);
        const f = W.forest[k] / 255;
        return f > 0.15 && f < 0.75 && h(x, z) < 90 && dry(x, z) && W.slopeAt(x, z) < 0.5;
      },
      sheep: (x, z) => h(x, z) > 150 && W.slopeAt(x, z) > 0.5 && W.slopeAt(x, z) < 1.4 && surf(x, z) !== SURF.ICE && Math.hypot(x - 650, z + 520) < 700,
      wolf: (x, z) => surf(x, z) === SURF.TUNDRA && x > 350 && z < -150 && dry(x, z),
      fox: (x, z) => surf(x, z) === SURF.GRASS && dry(x, z) && h(x, z) < 60,
      hare: (x, z) => (surf(x, z) === SURF.GRASS || surf(x, z) === SURF.FOREST) && dry(x, z) && h(x, z) < 80,
    };
    for (const [sp, cfg] of Object.entries(SPECIES)) {
      if (cfg.herd) {
        const groups = sp === 'caribou' ? 2 : 1;
        const per = Math.ceil(cfg.count / groups);
        const centers = this.findSpots(habitats[sp], groups, 250);
        for (const c of centers) {
          const herd = { x: c.x, z: c.z, tx: c.x, tz: c.z, t: 0 };
          for (let i = 0; i < per; i++) {
            const a = this.rand() * Math.PI * 2;
            const r = 4 + this.rand() * 18;
            this.addAnimal(sp, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, herd);
          }
        }
      } else {
        const spots = this.findSpots(habitats[sp], cfg.count, sp === 'hare' ? 40 : 120);
        for (const s of spots) this.addAnimal(sp, s.x, s.z, null);
      }
    }
    this.habitats = habitats;
  }

  addAnimal(species, x, z, herd) {
    const cfg = SPECIES[species];
    const a = {
      species,
      cfg,
      x,
      z,
      y: this.world.heightAt(x, z),
      homeX: x,
      homeZ: z,
      yaw: this.rand() * Math.PI * 2,
      speed: 0,
      targetSpeed: 0,
      state: 'idle',
      t: this.rand() * 3,
      tx: x,
      tz: z,
      hp: GAME[species] ? GAME[species].hp : 30,
      dead: false,
      herd,
      phase: this.rand() * 10,
      amp: 0,
      head: 0,
      scale: 0.9 + this.rand() * 0.2,
      tilt: new THREE.Quaternion(),
      checkT: 0,
      alive: true,
      huntable: !!GAME[species],
    };
    this.animals.push(a);
    return a;
  }

  spawnBirds() {
    const W = this.world;
    const r = this.rand;
    // soaring eagles over the river and bay, plus one perched near the landing
    for (let i = 0; i < 3; i++) {
      const p = W.river.sample(W.river.length * (0.15 + i * 0.33));
      this.birds.push({ sp: 'eagle', mode: 'soar', cx: p.x, cz: p.z, R: 40 + r() * 40, ang: r() * 6.28, alt: 45 + r() * 35, speed: 9, x: p.x, y: 80, z: p.z, yaw: 0, flap: 0, callT: 10 + r() * 20 });
    }
    const pier = W.place('pier');
    this.birds.push({ sp: 'eagle', mode: 'soar', cx: pier.x - 30, cz: pier.z + 40, R: 55, ang: 0, alt: 55, speed: 9, x: pier.x, y: 60, z: pier.z, yaw: 0, flap: 0, callT: 15 });
    const snags = this.game.scatter.snags;
    if (snags.length) {
      const landing = W.place('landing');
      snags.sort((a, b) => Math.hypot(a.x - landing.x, a.z - landing.z) - Math.hypot(b.x - landing.x, b.z - landing.z));
      const s = snags[0];
      this.birds.push({ sp: 'eagle', mode: 'perch', x: s.x, y: s.y, z: s.z, px: s.x, py: s.y, pz: s.z, yaw: r() * 6.28, flap: 0, callT: 20 });
    }
    // ravens roaming around the player
    for (let i = 0; i < 4; i++) this.birds.push({ sp: 'raven', mode: 'wander', x: 0, y: 60, z: 0, yaw: 0, speed: 10, flap: 1, tx: 0, ty: 50, tz: 0, t: 0, callT: 5 + r() * 20, init: true });
    // gulls around the pier
    for (let i = 0; i < 10; i++) {
      this.birds.push({
        sp: 'gull',
        mode: i < 3 ? 'swim' : 'circle',
        cx: pier.x - 20 + (r() - 0.5) * 80,
        cz: pier.z + 20 + (r() - 0.5) * 80,
        R: 12 + r() * 25,
        ang: r() * 6.28,
        alt: 6 + r() * 14,
        speed: 7 + r() * 3,
        x: pier.x,
        y: 10,
        z: pier.z,
        yaw: 0,
        flap: 0.7,
        callT: 3 + r() * 12,
      });
    }
    // ducks and loons on lakes
    for (const lake of W.lakes) {
      const nd = lake.id === 'moose' ? 7 : 3;
      for (let i = 0; i < nd; i++) this.addWaterBird('duck', lake);
      for (let i = 0; i < 2; i++) this.addWaterBird('loon', lake);
    }
    // puffins zipping over the bay
    for (let i = 0; i < 6; i++) {
      this.birds.push({ sp: 'puffin', mode: 'circle', cx: pier.x - 80 + (r() - 0.5) * 60, cz: pier.z + 90 + (r() - 0.5) * 60, R: 25 + r() * 30, ang: r() * 6.28, alt: 1.5 + r() * 2, speed: 13, x: 0, y: 2, z: 0, yaw: 0, flap: 1.2, callT: 999 });
    }
    // ptarmigan on the tundra
    const pts = this.findSpots((x, z) => W.surfaceAt(x, z) === SURF.TUNDRA && !W.waterAt(x, z), 8, 50);
    for (const p of pts) this.birds.push({ sp: 'ptarmigan', mode: 'ground', x: p.x, y: W.heightAt(p.x, p.z), z: p.z, yaw: r() * 6.28, flap: 0, callT: 999 });
  }

  addWaterBird(sp, lake) {
    const r = this.rand;
    for (let t = 0; t < 40; t++) {
      const a = r() * Math.PI * 2;
      const d = r() * this.world.lakeRadius(lake, a) * 0.75;
      const x = lake.x + Math.cos(a) * d;
      const z = lake.z + Math.sin(a) * d;
      const w = this.world.waterAt(x, z);
      if (!w || w.depth < 1) continue;
      this.birds.push({ sp, mode: 'swim', lake, x, y: lake.level, z, yaw: r() * 6.28, tx: x, tz: z, t: r() * 5, flap: 0, callT: 20 + r() * 40, diveT: 30 + r() * 60, under: 0 });
      return;
    }
  }

  spawnMarine() {
    const W = this.world;
    const pier = W.place('pier');
    for (let i = 0; i < 2; i++) {
      this.whales.push({ x: pier.x - 250 - i * 200, z: pier.z + 300 + i * 150, yaw: 1.2 + i, t: i * 17, phase: 'under', speed: 2.2, y: -8, pitch: 0, fluke: 0, breach: false });
    }
    for (let i = 0; i < 5; i++) {
      const d = pier.dock;
      const x = d.x1 + (this.rand() - 0.5) * 50;
      const z = d.z1 + (this.rand() - 0.5) * 50;
      this.otters.push({ x, z, yaw: this.rand() * 6.28, t: this.rand() * 10, roll: 0 });
    }
  }

  // ------------------------------------------------------------ interaction
  threatPos() {
    const g = this.game;
    if (g.player.mode === 'drive') return { x: g.hotrod.pos.x, z: g.hotrod.pos.z, loud: 1.3 + Math.abs(g.hotrod.speed) / 20 };
    const run = g.player.speed > 5 ? 1.35 : g.player.speed > 1 ? 1.0 : 0.75;
    return { x: g.player.pos.x, z: g.player.pos.z, loud: run };
  }

  // Scare everything within radius (gunshots, horn).
  scare(x, z, radius) {
    for (const a of this.animals) {
      if (a.dead) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < radius) this.startFlee(a, x, z);
    }
    for (const b of this.birds) {
      if (Math.hypot(b.x - x, b.z - z) < radius * 0.6) this.flush(b);
    }
  }

  startFlee(a, fx, fz) {
    if (a.dead) return;
    a.state = 'flee';
    a.t = 5 + this.rand() * 4;
    a.fleeX = fx;
    a.fleeZ = fz;
    if (a.herd) {
      for (const o of this.animals) {
        if (o.herd === a.herd && !o.dead && o.state !== 'flee') {
          o.state = 'flee';
          o.t = 5 + this.rand() * 4;
          o.fleeX = fx;
          o.fleeZ = fz;
        }
      }
    }
  }

  flush(b) {
    if (b.mode === 'swim' || b.mode === 'ground' || b.mode === 'perch') {
      b.mode = 'takeoff';
      b.t = 0;
      b.vy = 4;
      b.flap = 1.3;
      const a = Math.random() * Math.PI * 2;
      b.tx = b.x + Math.cos(a) * 80;
      b.tz = b.z + Math.sin(a) * 80;
      this.game.audio?.flap(b.x, b.z);
      if (b.sp === 'duck') this.game.audio?.quack(b.x, b.z);
    }
  }

  // Ray test against huntable animals. Returns nearest {animal, zone, dist}.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null;
    const test = (a, cx, cy, cz, r, zone) => {
      const lx = cx - ox;
      const ly = cy - oy;
      const lz = cz - oz;
      const t = lx * dx + ly * dy + lz * dz;
      if (t < 0 || t > maxDist) return;
      const px = lx - dx * t;
      const py = ly - dy * t;
      const pz = lz - dz * t;
      const d2 = px * px + py * py + pz * pz;
      if (d2 < r * r && (!best || t < best.dist)) best = { animal: a, zone, dist: t };
    };
    const all = this.game.bears ? this.animals.concat(this.game.bears.bears) : this.animals;
    for (const a of all) {
      if (!a.huntable || !a.visible) continue;
      const c = a.cfg;
      const fx = Math.sin(a.yaw);
      const fz = Math.cos(a.yaw);
      const s = a.scale;
      const standing = a.stand || 0;
      const bodyY = a.y + c.height * 0.72 * s + standing * c.len * 0.3;
      test(a, a.x + fx * c.len * 0.18 * s, bodyY, a.z + fz * c.len * 0.18 * s, c.body * s, 'vital');
      test(a, a.x - fx * c.len * 0.25 * s, bodyY - 0.05, a.z - fz * c.len * 0.25 * s, c.body * 0.95 * s, 'body');
      const hy = a.y + c.height * s * (standing ? 1.4 : 0.95) - (a.head || 0) * c.height * 0.4;
      test(a, a.x + fx * c.len * 0.62 * s * (1 - standing * 0.6), hy, a.z + fz * c.len * 0.62 * s * (1 - standing * 0.6), c.head * s * 1.2, 'head');
    }
    return best;
  }

  damage(a, amount, zone, fromX, fromZ) {
    if (a.dead) return false;
    a.hp -= amount;
    if (a.hp <= 0) {
      a.dead = true;
      a.state = 'dead';
      a.speed = 0;
      a.deadT = 0;
      return true;
    }
    this.startFlee(a, fromX, fromZ);
    return false;
  }

  removeAnimal(a) {
    // respawn somewhere else in its habitat, out of sight, after a while
    a.dead = false;
    a.hp = GAME[a.species] ? GAME[a.species].hp : 30;
    a.state = 'gone';
    a.t = 240 + this.rand() * 240;
  }

  respawn(a) {
    const p = this.game.player.pos;
    const spots = this.findSpots((x, z) => this.habitats[a.species](x, z) && Math.hypot(x - p.x, z - p.z) > 400, 1, 1, 6000);
    if (spots.length) {
      a.x = spots[0].x;
      a.z = spots[0].z;
      a.homeX = a.x;
      a.homeZ = a.z;
    }
    a.state = 'idle';
    a.t = 2;
  }

  // Fish leaping out of the water at (x,y,z).
  jumpFish(x, y, z, kind, up = null) {
    if (this.jumpers.length >= 5) return;
    const cam = this.game.camera.position;
    if (Math.hypot(cam.x - x, cam.z - z) > 180) return;
    const species = kind === 'ocean' ? 'coho' : kind === 'moose' ? 'rainbow' : kind === 'glacier' ? 'char' : this.game.state.salmonRun ? 'sockeye' : Math.random() < 0.5 ? 'pink' : 'coho';
    let m = this.jumperModels[species]?.find((q) => !q.parent);
    if (!m) {
      m = makeFishModel(species);
      m.scale.setScalar(species === 'rainbow' || species === 'char' ? 0.55 : 0.65);
      (this.jumperModels[species] = this.jumperModels[species] || []).push(m);
    }
    this.group.add(m);
    const yaw = Math.random() * Math.PI * 2;
    this.jumpers.push({ m, x, y, z, yaw, t: 0, dur: 0.9 + Math.random() * 0.3, h: 0.7 + Math.random() * 0.7, up, splashed: false });
    this.game.effects.splash(x, y, z, 0.5);
    this.game.audio?.splash(0.35, x, z);
  }

  // ----------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    if (g.paused && g.started) return;
    const W = this.world;
    const cam = g.camera.position;
    const threat = this.threatPos();
    for (const h of Object.values(this.herds)) h.begin();

    // herd leaders drift
    const herdsSeen = new Set();
    for (const a of this.animals) {
      if (a.herd && !herdsSeen.has(a.herd)) {
        herdsSeen.add(a.herd);
        const hd = a.herd;
        hd.t -= dt;
        if (hd.t <= 0) {
          hd.t = 20 + this.rand() * 25;
          for (let i = 0; i < 10; i++) {
            const nx = hd.x + (this.rand() - 0.5) * 160;
            const nz = hd.z + (this.rand() - 0.5) * 160;
            if (this.habitats[a.species](nx, nz)) {
              hd.tx = nx;
              hd.tz = nz;
              break;
            }
          }
        }
        hd.x = damp(hd.x, hd.tx, 0.03, dt);
        hd.z = damp(hd.z, hd.tz, 0.03, dt);
      }
    }

    for (const a of this.animals) {
      if (a.state === 'gone') {
        a.t -= dt;
        a.visible = false;
        if (a.t <= 0) this.respawn(a);
        continue;
      }
      const dx = a.x - cam.x;
      const dz = a.z - cam.z;
      const dCam = Math.sqrt(dx * dx + dz * dz);
      a.visible = dCam < 460;
      if (!a.visible) continue;
      if (!a.dead && dCam < 700) this.think(a, dt, threat);
      this.render(a, dt);
    }
    if (g.bears) g.bears.render(dt);
    this.updateBirds(dt, cam, threat);
    this.updateMarine(dt, cam);
    this.updateJumpers(dt);
    for (const h of Object.values(this.herds)) h.end();
  }

  think(a, dt, threat) {
    const W = this.world;
    const c = a.cfg;
    const tdx = a.x - threat.x;
    const tdz = a.z - threat.z;
    const td = Math.sqrt(tdx * tdx + tdz * tdz);
    const flee = c.flee * threat.loud;
    a.t -= dt;
    if (a.state !== 'flee' && td < flee) this.startFlee(a, threat.x, threat.z);
    let desiredYaw = a.yaw;
    switch (a.state) {
      case 'idle':
        a.targetSpeed = 0;
        a.headT = 0;
        if (a.t <= 0) {
          a.state = this.rand() < 0.55 ? 'graze' : 'wander';
          a.t = a.state === 'graze' ? 3 + this.rand() * 6 : 6 + this.rand() * 8;
          this.pickTarget(a);
        }
        break;
      case 'graze':
        a.targetSpeed = 0;
        a.headT = a.species === 'sheep' || a.species === 'wolf' ? 0.6 : 1;
        if (a.t <= 0) {
          a.state = 'idle';
          a.t = 1 + this.rand() * 3;
        }
        break;
      case 'wander': {
        a.headT = 0;
        const wx = a.tx - a.x;
        const wz = a.tz - a.z;
        const wd = Math.hypot(wx, wz);
        desiredYaw = Math.atan2(wx, wz);
        a.targetSpeed = wd > 2 ? c.walk : 0;
        if (wd < 2 || a.t <= 0) {
          a.state = 'idle';
          a.t = 1 + this.rand() * 4;
        }
        break;
      }
      case 'flee': {
        a.headT = 0;
        const fx = a.x - a.fleeX;
        const fz = a.z - a.fleeZ;
        desiredYaw = Math.atan2(fx, fz) + Math.sin(a.phase * 0.2) * 0.3;
        a.targetSpeed = c.run;
        if (a.t <= 0 && td > flee * 1.8) {
          a.state = 'idle';
          a.t = 2 + this.rand() * 3;
          a.homeX = a.x;
          a.homeZ = a.z;
        }
        break;
      }
      default:
        break;
    }
    // steering around obstacles: probe ahead occasionally
    a.checkT -= dt;
    if (a.targetSpeed > 0 && a.checkT <= 0) {
      a.checkT = 0.3;
      const look = Math.max(4, a.speed * 0.8);
      let ok = this.canWalk(a, a.x + Math.sin(desiredYaw) * look, a.z + Math.cos(desiredYaw) * look);
      if (!ok) {
        for (const off of [0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI]) {
          const y2 = desiredYaw + off;
          if (this.canWalk(a, a.x + Math.sin(y2) * look, a.z + Math.cos(y2) * look)) {
            a.avoid = off;
            ok = true;
            break;
          }
        }
        if (!ok) a.avoid = Math.PI;
      } else a.avoid = damp(a.avoid || 0, 0, 2, 0.3);
    }
    desiredYaw += a.avoid || 0;
    a.yaw = dampAngle(a.yaw, desiredYaw, a.state === 'flee' ? 4 : 2, dt);
    a.speed = damp(a.speed, a.targetSpeed, a.state === 'flee' ? 3 : 2, dt);
    const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
    const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
    if (a.speed > 0.05) {
      if (this.canWalk(a, nx, nz)) {
        a.x = nx;
        a.z = nz;
      } else a.speed *= 0.5;
    }
    // keep near home when calm
    if (a.herd && a.state !== 'flee') {
      a.homeX = a.herd.x;
      a.homeZ = a.herd.z;
    }
  }

  canWalk(a, x, z) {
    const W = this.world;
    if (!W.inBounds(x, z, 40)) return false;
    const c = a.cfg;
    const w = W.waterAt(x, z);
    if (w && w.depth > c.wade) return false;
    const slope = W.slopeAt(x, z);
    if (slope > c.maxSlope) return false;
    const road = W.roadD[W.cellIndex(x, z)];
    if (a.state !== 'flee' && road < 6 && this.rand() < 0.7) return false;
    return true;
  }

  pickTarget(a) {
    const r = a.herd ? 25 : 90;
    for (let i = 0; i < 8; i++) {
      const x = a.homeX + (this.rand() - 0.5) * 2 * r;
      const z = a.homeZ + (this.rand() - 0.5) * 2 * r;
      if (this.canWalk(a, x, z)) {
        a.tx = x;
        a.tz = z;
        return;
      }
    }
    a.tx = a.homeX;
    a.tz = a.homeZ;
  }

  render(a, dt) {
    const W = this.world;
    const c = a.cfg;
    const herd = this.herds[a.species];
    const water = W.waterAt(a.x, a.z);
    const ground = W.heightAt(a.x, a.z);
    a.y = water ? Math.max(ground, water.level - c.height * 0.55) : ground;
    a.head = damp(a.head, a.headT || 0, 3, dt);
    const gaitSpeed = a.speed * c.gait;
    a.phase += dt * (gaitSpeed + (a.speed > 0.1 ? 1.5 : 0));
    let amp = clamp(a.speed / c.walk, 0, 1) * 0.55 + clamp((a.speed - c.walk) / (c.run - c.walk), 0, 1) * 0.5;
    if (c.hop && a.speed > 0.2) amp = 1;
    a.amp = damp(a.amp, amp, 6, dt);
    // tilt to the slope
    W.normalAt(a.x, a.z, _n);
    _nv.set(_n.x, _n.y, _n.z);
    _q2.setFromUnitVectors(UP, _nv);
    _q.setFromAxisAngle(UP, a.yaw);
    if (a.dead) {
      a.deadT = (a.deadT || 0) + dt;
      const fall = Math.min(1, a.deadT * 2.2);
      _e.set(0, 0, fall * 1.45, 'XYZ');
      _q.multiply(new THREE.Quaternion().setFromEuler(_e));
    }
    const q = _q2.multiply(_q);
    const bob = c.hop && a.speed > 0.2 ? Math.abs(Math.sin(a.phase * 1.0)) * 0.15 : 0;
    const deadDrop = a.dead ? -c.height * 0.3 * Math.min(1, (a.deadT || 0) * 2) : 0;
    _v.set(a.x, a.y + bob + deadDrop, a.z);
    _s.setScalar(a.scale);
    _m.compose(_v, q, _s);
    herd.push(_m, a.phase, a.dead ? 0 : a.amp, a.head, a.species === 'wolf' || a.species === 'fox' ? 0.5 : 0);
  }

  // ------------------------------------------------------------------ birds
  updateBirds(dt, cam, threat) {
    const W = this.world;
    const g = this.game;
    this.gooseT -= dt;
    if (this.gooseT <= 0) {
      this.gooseT = 150 + Math.random() * 150;
      this.spawnGeese();
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      const d = Math.hypot(b.x - cam.x, b.z - cam.z);
      b.callT -= dt;
      switch (b.mode) {
        case 'soar': {
          b.ang += (b.speed / b.R) * dt;
          const gy = W.inBounds(b.cx, b.cz) ? W.heightAt(b.cx, b.cz) : 0;
          const nx = b.cx + Math.cos(b.ang) * b.R;
          const nz = b.cz + Math.sin(b.ang) * b.R;
          b.yaw = Math.atan2(nx - b.x, nz - b.z);
          b.x = nx;
          b.z = nz;
          b.y = damp(b.y, Math.max(gy, 0) + b.alt, 0.5, dt);
          b.bank = 0.35;
          b.flapT = (b.flapT || 0) - dt;
          if (b.flapT <= 0) b.flapT = 6 + Math.random() * 8;
          b.flap = b.flapT < 1.2 ? 0.9 : 0.05;
          if (b.callT <= 0) {
            b.callT = 15 + Math.random() * 25;
            if (d < 250) g.audio?.eagle(b.x, b.z);
          }
          // occasionally drift the circle along the river
          b.cx += Math.sin(b.ang * 0.1) * dt * 0.8;
          break;
        }
        case 'perch':
          b.flap = 0;
          b.bank = 0;
          if (d < 28) {
            b.mode = 'takeoff';
            b.t = 0;
            b.vy = 3;
            b.tx = b.x + 60;
            b.tz = b.z + 40;
            g.audio?.flap(b.x, b.z);
            g.audio?.eagle(b.x, b.z);
          }
          break;
        case 'takeoff': {
          b.t += dt;
          const tx = b.tx - b.x;
          const tz = b.tz - b.z;
          b.yaw = dampAngle(b.yaw, Math.atan2(tx, tz), 3, dt);
          const sp = b.sp === 'ptarmigan' ? 14 : 9;
          b.x += Math.sin(b.yaw) * sp * dt;
          b.z += Math.cos(b.yaw) * sp * dt;
          b.y += (b.sp === 'ptarmigan' ? 3 : 5) * dt;
          b.flap = 1.3;
          if (b.t > (b.sp === 'ptarmigan' ? 4 : 6)) {
            if (b.sp === 'eagle') {
              b.mode = 'soar';
              b.cx = b.x;
              b.cz = b.z;
              b.R = 45;
              b.ang = 0;
              b.alt = 50;
              b.speed = 9;
            } else if (b.sp === 'duck' || b.sp === 'loon' || b.sp === 'gull') {
              b.mode = 'land';
              b.t = 0;
            } else if (b.sp === 'ptarmigan') {
              b.mode = 'land';
              b.t = 0;
            }
          }
          break;
        }
        case 'land': {
          b.t += dt;
          b.flap = 0.6;
          let targetY;
          if (b.lake) {
            // pick a new spot on the lake
            if (!b.landSpot) {
              const lake = b.lake;
              for (let k = 0; k < 20; k++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * W.lakeRadius(lake, a) * 0.7;
                const x = lake.x + Math.cos(a) * r;
                const z = lake.z + Math.sin(a) * r;
                if (Math.hypot(x - cam.x, z - cam.z) > 40) {
                  b.landSpot = { x, z };
                  break;
                }
              }
              b.landSpot = b.landSpot || { x: lake.x, z: lake.z };
            }
            targetY = b.lake.level;
          } else {
            b.landSpot = b.landSpot || { x: b.x + Math.sin(b.yaw) * 30, z: b.z + Math.cos(b.yaw) * 30 };
            targetY = W.heightAt(b.landSpot.x, b.landSpot.z);
          }
          const tx = b.landSpot.x - b.x;
          const tz = b.landSpot.z - b.z;
          const dist = Math.hypot(tx, tz);
          b.yaw = dampAngle(b.yaw, Math.atan2(tx, tz), 3, dt);
          const sp = Math.min(10, dist * 0.8 + 2);
          b.x += Math.sin(b.yaw) * sp * dt;
          b.z += Math.cos(b.yaw) * sp * dt;
          b.y = damp(b.y, targetY + Math.min(dist * 0.25, 20), 1.5, dt);
          if (dist < 1.5) {
            b.mode = b.lake ? 'swim' : b.sp === 'gull' ? 'circle' : 'ground';
            b.y = targetY;
            b.landSpot = null;
            if (b.lake) g.effects.ripples.add(b.x, b.y, b.z, 1.2, 1.2);
          }
          break;
        }
        case 'swim': {
          b.t -= dt;
          b.flap = 0;
          const level = b.lake ? b.lake.level : 0;
          if (b.t <= 0) {
            b.t = 4 + Math.random() * 8;
            b.tx = b.x + (Math.random() - 0.5) * 20;
            b.tz = b.z + (Math.random() - 0.5) * 20;
            const w = W.waterAt(b.tx, b.tz);
            if (!w || w.depth < 0.8) {
              b.tx = b.x;
              b.tz = b.z;
            }
          }
          const tx = (b.tx ?? b.x) - b.x;
          const tz = (b.tz ?? b.z) - b.z;
          if (Math.hypot(tx, tz) > 0.5) {
            b.yaw = dampAngle(b.yaw, Math.atan2(tx, tz), 1, dt);
            b.x += Math.sin(b.yaw) * 0.5 * dt;
            b.z += Math.cos(b.yaw) * 0.5 * dt;
          }
          b.y = level + Math.sin(g.time * 2 + b.x) * 0.02 - 0.05;
          // loons dive
          if (b.sp === 'loon') {
            b.diveT -= dt;
            if (b.under > 0) {
              b.under -= dt;
              b.y = level - 2;
              if (b.under <= 0) {
                b.x += (Math.random() - 0.5) * 30;
                b.z += (Math.random() - 0.5) * 30;
                const w = W.waterAt(b.x, b.z);
                if (!w || w.depth < 1) {
                  b.x = b.lake.x;
                  b.z = b.lake.z;
                }
                g.effects.ripples.add(b.x, level, b.z, 1.5, 1.4);
              }
            } else if (b.diveT <= 0) {
              b.diveT = 40 + Math.random() * 60;
              b.under = 8 + Math.random() * 8;
              g.effects.ripples.add(b.x, level, b.z, 1.5, 1.4);
            }
            const t = g.env.time;
            if (b.callT <= 0) {
              b.callT = 25 + Math.random() * 40;
              if ((t > 19 || t < 7) && d < 600) g.audio?.loon(b.x, b.z);
            }
          } else if (b.sp === 'duck' && b.callT <= 0) {
            b.callT = 12 + Math.random() * 25;
            if (d < 100) g.audio?.quack(b.x, b.z);
          }
          if (b.sp !== 'gull' && Math.hypot(b.x - threat.x, b.z - threat.z) < (b.sp === 'loon' ? 15 : 22) && b.under <= 0) this.flush(b);
          break;
        }
        case 'ground': {
          b.flap = 0;
          b.y = W.heightAt(b.x, b.z);
          if (Math.hypot(b.x - threat.x, b.z - threat.z) < 12) this.flush(b);
          break;
        }
        case 'circle': {
          b.ang += (b.speed / b.R) * dt;
          const nx = b.cx + Math.cos(b.ang) * b.R;
          const nz = b.cz + Math.sin(b.ang) * b.R;
          b.yaw = Math.atan2(nx - b.x, nz - b.z);
          b.x = nx;
          b.z = nz;
          b.y = damp(b.y, b.alt + Math.sin(b.ang * 3) * 1.5, 1, dt);
          b.bank = 0.4;
          b.flap = b.sp === 'puffin' ? 1.3 : Math.sin(b.ang * 2) > 0.3 ? 0.8 : 0.1;
          if (b.callT <= 0) {
            b.callT = 6 + Math.random() * 14;
            if (b.sp === 'gull' && d < 160) g.audio?.gull(b.x, b.z);
          }
          break;
        }
        case 'wander': {
          if (b.init) {
            b.init = false;
            b.x = cam.x + (Math.random() - 0.5) * 300;
            b.z = cam.z + (Math.random() - 0.5) * 300;
            b.y = W.heightAt(clamp(b.x, -HALF, HALF), clamp(b.z, -HALF, HALF)) + 40;
          }
          b.t -= dt;
          if (b.t <= 0 || Math.hypot(b.tx - b.x, b.tz - b.z) < 8) {
            b.t = 8 + Math.random() * 10;
            b.tx = cam.x + (Math.random() - 0.5) * 400;
            b.tz = cam.z + (Math.random() - 0.5) * 400;
            b.ty = (W.inBounds(b.tx, b.tz) ? W.heightAt(b.tx, b.tz) : 0) + 20 + Math.random() * 30;
          }
          b.yaw = dampAngle(b.yaw, Math.atan2(b.tx - b.x, b.tz - b.z), 1.2, dt);
          b.x += Math.sin(b.yaw) * b.speed * dt;
          b.z += Math.cos(b.yaw) * b.speed * dt;
          b.y = damp(b.y, b.ty, 0.6, dt);
          b.flap = 0.9;
          b.bank = 0.2;
          if (b.callT <= 0) {
            b.callT = 8 + Math.random() * 20;
            if (d < 200) g.audio?.raven(b.x, b.z);
          }
          break;
        }
        case 'formation': {
          b.x += Math.sin(b.yaw) * b.speed * dt;
          b.z += Math.cos(b.yaw) * b.speed * dt;
          b.flap = 1.0;
          b.bank = 0;
          b.life -= dt;
          if (b.leader && b.callT <= 0) {
            b.callT = 3 + Math.random() * 4;
            if (d < 500) g.audio?.goose();
          }
          if (b.life <= 0) {
            this.birds.splice(i, 1);
            continue;
          }
          break;
        }
        default:
          break;
      }
      if (d > 700 || b.under > 0) continue;
      b.phase = (b.phase || Math.random() * 10) + dt * (b.sp === 'puffin' ? 22 : b.sp === 'duck' || b.sp === 'ptarmigan' ? 16 : b.sp === 'eagle' ? 5 : 8);
      const herd = this.herds[b.sp];
      _e.set(0, b.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      if (b.bank) _q.multiply(_q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -b.bank * 0.8));
      _v.set(b.x, b.y, b.z);
      _s.setScalar(1);
      _m.compose(_v, _q, _s);
      herd.push(_m, b.phase, 0, 0, b.flap);
    }
  }

  spawnGeese() {
    const cam = this.game.camera.position;
    const a = Math.random() * Math.PI * 2;
    const sx = cam.x - Math.sin(a) * 600;
    const sz = cam.z - Math.cos(a) * 600;
    const yaw = a + (Math.random() - 0.5) * 0.4;
    const y = Math.max(80, cam.y + 70);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 ? 1 : -1;
      const back = row * 3.2;
      const lat = side * row * 2.6;
      const x = sx - Math.sin(yaw) * back + Math.cos(yaw) * lat;
      const z = sz - Math.cos(yaw) * back - Math.sin(yaw) * lat;
      this.birds.push({ sp: 'goose', mode: 'formation', x, y: y + Math.random() * 0.5, z, yaw, speed: 14, flap: 1, life: 95, callT: 2 + Math.random() * 3, leader: i === 0, phase: i * 0.4 });
    }
  }

  // ----------------------------------------------------------------- marine
  updateMarine(dt, cam) {
    const g = this.game;
    const W = this.world;
    for (const w of this.whales) {
      w.t += dt;
      w.x += Math.sin(w.yaw) * w.speed * dt;
      w.z += Math.cos(w.yaw) * w.speed * dt;
      // stay in deep water in the bay
      const csd = W.inBounds(w.x, w.z) ? W.coastAt(w.x, w.z) : W.coastSDBrute(w.x, w.z);
      if (csd > -220 || Math.abs(w.x) > 3000 || Math.abs(w.z) > 3000) w.yaw += dt * 0.25;
      else w.yaw += Math.sin(w.t * 0.05) * dt * 0.05;
      const d = Math.hypot(w.x - cam.x, w.z - cam.z);
      if (w.phase === 'under') {
        w.y = -8;
        w.pitch = 0;
        if (w.t > 18 + Math.random() * 0.5) {
          w.phase = Math.random() < 0.22 ? 'breach' : 'surface';
          w.t = 0;
        }
      } else if (w.phase === 'surface') {
        const t = w.t;
        if (t < 2) w.y = lerp(-6, -1.1, t / 2);
        else if (t < 7) w.y = -1.1 + Math.sin(t * 1.3) * 0.12;
        else if (t < 11) {
          const u = (t - 7) / 4;
          w.y = -1.1 - u * 4;
          w.pitch = u * 0.9;
          w.fluke = u;
        } else {
          w.phase = 'under';
          w.t = 0;
          w.fluke = 0;
        }
        if (t > 2.2 && !w.blown) {
          w.blown = true;
          this.spout(w);
          if (d < 900) g.audio?.whale(w.x, w.z);
        }
        if (t > 10.5) w.blown = false;
      } else if (w.phase === 'breach') {
        const t = w.t;
        if (t < 1.4) {
          const u = t / 1.4;
          w.y = lerp(-10, 4.5, u);
          w.pitch = -1.1 * (1 - u * 0.3);
        } else if (t < 2.8) {
          const u = (t - 1.4) / 1.4;
          w.y = lerp(4.5, -9, u * u);
          w.pitch = -0.8 + u * 1.9;
          w.roll = u * 1.4;
          if (!w.splashed && u > 0.45) {
            w.splashed = true;
            for (let k = 0; k < 4; k++) g.effects.splash(w.x + (Math.random() - 0.5) * 8, 0, w.z + (Math.random() - 0.5) * 8, 2.5);
            if (d < 900) g.audio?.splash(1, w.x, w.z);
          }
        } else {
          w.phase = 'under';
          w.t = 0;
          w.roll = 0;
          w.splashed = false;
        }
      }
      if (d > 2600 || w.phase === 'under') continue;
      _e.set(w.pitch || 0, w.yaw, w.roll || 0, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(w.x, w.y, w.z);
      _s.setScalar(1);
      _m.compose(_v, _q, _s);
      this.herds.whale.push(_m, g.time, 0, 0, w.fluke || 0.2);
    }
    for (const o of this.otters) {
      o.t += dt;
      o.x += Math.sin(o.yaw) * 0.2 * dt;
      o.z += Math.cos(o.yaw) * 0.2 * dt;
      o.yaw += Math.sin(o.t * 0.2) * dt * 0.2;
      const w = W.waterAt(o.x, o.z);
      if (!w || w.depth < 2) o.yaw += dt * 1.5;
      const d = Math.hypot(o.x - cam.x, o.z - cam.z);
      if (d > 300) continue;
      o.roll = Math.sin(o.t * 0.15) > 0.97 ? o.roll + dt * 6 : o.roll;
      _e.set(0, o.yaw, Math.PI + o.roll, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(o.x, Math.sin(o.t * 1.6) * 0.05 + 0.02, o.z);
      _s.setScalar(1);
      _m.compose(_v, _q, _s);
      this.herds.otter.push(_m, o.t * 2, 0, 0.3, 0.3);
    }
  }

  spout(w) {
    const g = this.game;
    const fx = Math.sin(w.yaw) * 1.8;
    const fz = Math.cos(w.yaw) * 1.8;
    for (let i = 0; i < 40; i++) {
      g.effects.soft.emit(w.x + fx, 0.8, w.z + fz, (Math.random() - 0.5) * 1.2, 7 + Math.random() * 4, (Math.random() - 0.5) * 1.2, 1.8, 0.8, 3.5, 0.92, 0.95, 0.97, 0.5, 5, 0.8);
    }
  }

  // ---------------------------------------------------------------- jumpers
  updateJumpers(dt) {
    const g = this.game;
    const W = this.world;
    // Bear Falls: salmon leaping up the falls
    const cam = g.camera.position;
    this.fallsJumpT -= dt;
    if (this.fallsJumpT <= 0 && W.fallsS > 0) {
      this.fallsJumpT = 1.2 + Math.random() * 1.8;
      const p = W.river.sample(W.fallsS + 2.5);
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d < 170) {
        const w = W.riverWidth(W.fallsS) * 0.7;
        const off = (Math.random() - 0.5) * w;
        const x = p.x - p.tz * off;
        const z = p.z + p.tx * off;
        this.jumpFish(x, W.riverLevel(W.fallsS + 2.5), z, 'river', { tx: p.tx, tz: p.tz, dy: W.fallsDrop });
      }
    }
    for (let i = this.jumpers.length - 1; i >= 0; i--) {
      const j = this.jumpers[i];
      j.t += dt;
      const u = j.t / j.dur;
      if (u >= 1) {
        if (!j.up) this.game.effects.splash(j.x, j.y, j.z, 0.45);
        this.group.remove(j.m);
        this.jumpers.splice(i, 1);
        continue;
      }
      let x = j.x;
      let z = j.z;
      let y;
      if (j.up) {
        // leap upstream against the falls
        const back = -u * 2.2;
        x = j.x - j.up.tx * back;
        z = j.z - j.up.tz * back;
        y = j.y + (j.up.dy * 0.75 + 1.2) * Math.sin(u * Math.PI * 0.85);
        j.m.rotation.set(0, Math.atan2(-j.up.tx, -j.up.tz), 0);
        j.m.rotateX(-0.9 + u * 0.8);
      } else {
        y = j.y + j.h * 4 * u * (1 - u) - 0.1;
        x = j.x + Math.sin(j.yaw) * u * 1.2;
        z = j.z + Math.cos(j.yaw) * u * 1.2;
        j.m.rotation.set(0, j.yaw, 0);
        j.m.rotateX(-(u - 0.5) * 2.4);
      }
      j.m.position.set(x, y, z);
      const un = j.m.userData.uniforms;
      un.uFlopT.value += dt;
      un.uFlop.value = 1;
    }
  }
}
