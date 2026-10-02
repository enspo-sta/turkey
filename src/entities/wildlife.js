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
  blackBearModel,
  goatModel,
  muskoxModel,
  porcupineModel,
  lynxModel,
  squirrelModel,
  beaverModel,
  orcaModel,
  seaLionModel,
  sealHeadModel,
  swanModel,
  craneModel,
  magpieModel,
  kingfisherModel,
  beaverLodgeGeometry,
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
  // black bears live in the bear system (src/gameplay/bears.js), which can make them charge
  blackbear: { walk: 1.1, run: 9, flee: 48, height: 1.0, len: 1.5, body: 0.42, head: 0.2, wade: 0.6, maxSlope: 0.8, count: 0, gait: 1.9 },
  goat: { walk: 0.8, run: 5, flee: 75, height: 1.05, len: 1.2, body: 0.34, head: 0.17, wade: 0.2, maxSlope: 2.4, count: 7, herd: true, gait: 2.0 },
  muskox: { walk: 0.8, run: 7, flee: 40, height: 1.3, len: 2.0, body: 0.6, head: 0.3, wade: 0.5, maxSlope: 0.6, count: 7, herd: true, gait: 1.4 },
  porcupine: { walk: 0.35, run: 0.9, flee: 6, height: 0.4, len: 0.7, body: 0.2, head: 0.1, wade: 0.1, maxSlope: 0.9, count: 5, gait: 3.4 },
  lynx: { walk: 1.2, run: 12, flee: 55, height: 0.65, len: 0.9, body: 0.2, head: 0.12, wade: 0.2, maxSlope: 1.0, count: 2, gait: 2.5 },
  squirrel: { walk: 1.0, run: 5.5, flee: 14, height: 0.2, len: 0.3, body: 0.08, head: 0.05, wade: 0.05, maxSlope: 0.9, count: 15, herd: true, gait: 6.5, colony: true },
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
const _q3 = new THREE.Quaternion();

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
      blackbear: new AnimatedHerd(blackBearModel(), 4),
      goat: new AnimatedHerd(goatModel(), 9),
      muskox: new AnimatedHerd(muskoxModel(), 9),
      porcupine: new AnimatedHerd(porcupineModel(), 6, { shadow: false }),
      lynx: new AnimatedHerd(lynxModel(), 3),
      squirrel: new AnimatedHerd(squirrelModel(), 16, { shadow: false }),
      beaver: new AnimatedHerd(beaverModel(), 3, { shadow: false }),
      orca: new AnimatedHerd(orcaModel(), 4, { shadow: false }),
      sealion: new AnimatedHerd(seaLionModel(), 8),
      seal: new AnimatedHerd(sealHeadModel(), 4, { shadow: false }),
      swan: new AnimatedHerd(swanModel(), 5, { shadow: false }),
      crane: new AnimatedHerd(craneModel(), 6),
      magpie: new AnimatedHerd(magpieModel(), 4, { shadow: false }),
      kingfisher: new AnimatedHerd(kingfisherModel(), 2, { shadow: false }),
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
      blackbear: (x, z) => {
        const f = W.forest[W.cellIndex(x, z)] / 255;
        return f > 0.45 && h(x, z) < 100 && dry(x, z) && W.slopeAt(x, z) < 0.6;
      },
      // mountain goats keep to the cliffs of Mount Ruben
      goat: (x, z) => h(x, z) > 160 && W.slopeAt(x, z) > 0.7 && W.slopeAt(x, z) < 2.2 && surf(x, z) !== SURF.ICE && Math.hypot(x + 700, z + 420) < 620,
      muskox: (x, z) => surf(x, z) === SURF.TUNDRA && x > 420 && z < -220 && W.slopeAt(x, z) < 0.3 && dry(x, z),
      porcupine: (x, z) => W.forest[W.cellIndex(x, z)] / 255 > 0.35 && dry(x, z) && h(x, z) < 110,
      lynx: (x, z) => {
        const f = W.forest[W.cellIndex(x, z)] / 255;
        return f > 0.15 && f < 0.6 && dry(x, z) && W.slopeAt(x, z) < 0.7;
      },
      squirrel: (x, z) => (surf(x, z) === SURF.TUNDRA || surf(x, z) === SURF.GRASS) && dry(x, z) && W.slopeAt(x, z) < 0.45 && W.roadD[W.cellIndex(x, z)] > 12,
    };
    for (const [sp, cfg] of Object.entries(SPECIES)) {
      if (cfg.herd) {
        const groups = sp === 'caribou' ? 2 : sp === 'squirrel' ? 3 : 1;
        const per = Math.ceil(cfg.count / groups);
        const centers = this.findSpots(habitats[sp], groups, 250);
        for (const c of centers) {
          const herd = { x: c.x, z: c.z, tx: c.x, tz: c.z, t: 0, colony: !!cfg.colony, x0: c.x, z0: c.z };
          for (let i = 0; i < per; i++) {
            const a = this.rand() * Math.PI * 2;
            const r = cfg.colony ? 2 + this.rand() * 9 : 4 + this.rand() * 18;
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
    // trumpeter swans on Moose Lake
    for (let i = 0; i < 3; i++) this.addWaterBird('swan', W.lakeById.moose);
    // sandhill cranes stalking the meadows by the lake and river flats
    const moose = W.lakeById.moose;
    const cr = this.findSpots(
      (x, z) => {
        const st = W.surfaceAt(x, z);
        const nearWet = Math.abs(W.lakeSD(moose, x, z)) < 90 || W.riverD[W.cellIndex(x, z)] < 70;
        return (st === SURF.GRASS || st === SURF.TUNDRA) && nearWet && !W.waterAt(x, z) && W.slopeAt(x, z) < 0.25 && W.roadD[W.cellIndex(x, z)] > 25;
      },
      2,
      200
    );
    for (const c of cr) {
      for (let i = 0; i < 3; i++) {
        const x = c.x + (r() - 0.5) * 14;
        const z = c.z + (r() - 0.5) * 14;
        this.birds.push({ sp: 'crane', mode: 'walk', home: { x: c.x, z: c.z }, x, y: W.heightAt(x, z), z, yaw: r() * 6.28, flap: 0, t: r() * 4, tx: x, tz: z, callT: 20 + r() * 40, speed: 0 });
      }
    }
    // black-billed magpies around the cabin at Hotrod Landing
    const cabin = this.game.props?.layout?.cabin || W.place('landing');
    for (let i = 0; i < 2; i++) {
      const x = cabin.x + (r() - 0.5) * 20;
      const z = cabin.z + (r() - 0.5) * 20;
      this.birds.push({ sp: 'magpie', mode: 'hop', home: { x: cabin.x, z: cabin.z }, x, y: W.heightAt(x, z), z, yaw: r() * 6.28, flap: 0, t: r() * 2, callT: 8 + r() * 20, hopT: 0 });
    }
    // a belted kingfisher working the river near the player
    this.birds.push({ sp: 'kingfisher', mode: 'patrol', x: 0, y: 30, z: 0, yaw: 0, flap: 1, t: 0, phaseK: 'fly', callT: 6, init: true });
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
    // a pod of orcas travelling the bay together
    this.orcas = [];
    const pod = { x: pier.x - 420, z: pier.z + 520, yaw: 0.6, t: 0 };
    for (let i = 0; i < 4; i++) {
      this.orcas.push({ pod, ox: (i - 1.5) * 9, oz: (i % 2) * 7 - 3, t: i * 1.6, y: -3, scale: i === 0 ? 1.15 : 0.8 + this.rand() * 0.2, blown: false });
    }
    this.orcaPod = pod;
    // Steller sea lions hauled out on a low rocky shore near the pier
    this.seaLions = [];
    const g = pier.dock ? { x: pier.dock.x0 - pier.dock.x1, z: pier.dock.z0 - pier.dock.z1 } : { x: 0, z: -1 };
    const gl = Math.hypot(g.x, g.z) || 1;
    // only about one spot in five hundred qualifies, so random tries could
    // miss them all and leave the bay without sea lions: gather every spot
    // on a ring round the pier, then pick one
    const spots = [];
    for (let ai = 0; ai < 180; ai++) {
      const a = (ai / 180) * Math.PI * 2;
      for (let d = 130; d <= 410; d += 5) {
        const x = pier.x + Math.cos(a) * d;
        const z = pier.z + Math.sin(a) * d;
        if (!W.inBounds(x, z, 30)) continue;
        const hh = W.heightAt(x, z);
        if (hh < 0.4 || hh > 2.8 || W.slopeAt(x, z) > 0.4) continue;
        // with the sea right next to it
        const sx = x - (g.x / gl) * 14;
        const sz = z - (g.z / gl) * 14;
        const w = W.waterAt(sx, sz);
        if (!w || w.kind !== 'ocean' || w.depth < 1) continue;
        spots.push({ x, z, sx, sz });
      }
    }
    const haul = spots.length ? spots[Math.floor(this.rand() * spots.length)] : null;
    if (haul) {
      this.haulOut = haul;
      for (let i = 0; i < 6; i++) {
        const x = haul.x + (this.rand() - 0.5) * 12;
        const z = haul.z + (this.rand() - 0.5) * 12;
        this.seaLions.push({ x, z, hx: x, hz: z, yaw: Math.atan2(haul.sx - x, haul.sz - z) + (this.rand() - 0.5) * 1.6, t: this.rand() * 10, head: 0, state: 'rest', scale: 0.85 + this.rand() * 0.35 });
      }
    }
    // harbour seals popping up around the pier and the river mouth
    this.seals = [];
    for (let i = 0; i < 3; i++) this.seals.push({ x: pier.x, z: pier.z, t: this.rand() * 20, up: false, yaw: 0, y: -2 });
    // beavers and their lodge on Moose Lake
    this.beavers = [];
    const lake = W.lakeById.moose;
    let lodge = null;
    for (let t = 0; t < 200 && !lodge; t++) {
      const a = this.rand() * Math.PI * 2;
      const r = W.lakeRadius(lake, a);
      const x = lake.x + Math.cos(a) * (r - 4);
      const z = lake.z + Math.sin(a) * (r - 4);
      const w = W.waterAt(x, z);
      const place = W.place('moose');
      if (w && w.depth > 0.3 && w.depth < 2.5 && Math.hypot(x - place.x, z - place.z) > 70) lodge = { x, z, a };
    }
    if (lodge) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const m = new THREE.Mesh(beaverLodgeGeometry(), mat);
      m.position.set(lodge.x, lake.level - 0.2, lodge.z);
      m.rotation.y = -lodge.a;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'beaverLodge';
      this.group.add(m);
      // its dome stands about a metre out of the water
      const lc = this.game.colliders?.addCircle(lodge.x, lodge.z, 2.6);
      if (lc) lc.top = lake.level + 1.0;
      for (let i = 0; i < 2; i++) this.beavers.push({ lake, x: lodge.x, z: lodge.z, yaw: this.rand() * 6.28, t: this.rand() * 10, under: 0, lodge, tx: lodge.x, tz: lodge.z });
    }
  }

  // ------------------------------------------------------------ interaction
  threatPos() {
    const g = this.game;
    if (g.player.mode === 'drive') return { x: g.car.pos.x, z: g.car.pos.z, loud: (g.car === g.racer ? 2.2 : 1.3) + Math.abs(g.car.speed) / 20 };
    if (g.player.mode === 'boat') return { x: g.boat.pos.x, z: g.boat.pos.z, loud: 1 + Math.abs(g.boat.speed) / 8 };
    const run = g.player.speed > 5 ? 1.35 : g.player.speed > 1 ? 1.0 : 0.75;
    return { x: g.player.pos.x, z: g.player.pos.z, loud: run };
  }

  // Scare everything within radius (a loosed arrow, the horn).
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
    if (a.species === 'squirrel' && a.state !== 'flee' && Math.random() < 0.5) this.game.audio?.squeak(a.x, a.z);
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
    if (b.mode === 'swim' || b.mode === 'ground' || b.mode === 'perch' || b.mode === 'walk' || b.mode === 'hop') {
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
    if (kind === 'hotpool') return;
    const species =
      kind === 'ocean'
        ? 'coho'
        : kind === 'moose' || kind === 'springs'
          ? 'rainbow'
          : kind === 'glacier'
            ? 'char'
            : kind === 'slough' || kind === 'slough2'
              ? Math.random() < 0.3
                ? 'sheefish'
                : 'pike'
              : this.game.state.salmonRun
                ? 'sockeye'
                : Math.random() < 0.5
                  ? 'pink'
                  : 'coho';
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

  // A bald eagle dives in and snatches a small fish. Returns false when no
  // eagle is around.
  swoopSteal(targetFn, onGrab) {
    const g = this.game;
    const P = g.player;
    const eagle = this.birds.find((b) => b.sp === 'eagle' && (b.mode === 'soar' || b.mode === 'perch'));
    if (!eagle) return false;
    // enter high over the water in front of the player so the whole dive
    // plays out on screen
    const front = P.yaw + Math.PI + (Math.random() < 0.5 ? 0.45 : -0.45);
    eagle.x = P.pos.x + Math.sin(front) * 85;
    eagle.z = P.pos.z + Math.cos(front) * 85;
    eagle.y = P.pos.y + 42;
    eagle.mode = 'swoop';
    eagle.t = 0;
    eagle.swoopTarget = targetFn;
    eagle.onGrab = onGrab;
    g.audio?.eagle(eagle.x, eagle.z);
    return true;
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
          const range = hd.colony ? 12 : 160;
          const bx = hd.colony ? hd.x0 : hd.x;
          const bz = hd.colony ? hd.z0 : hd.z;
          for (let i = 0; i < 10; i++) {
            const nx = bx + (this.rand() - 0.5) * range;
            const nz = bz + (this.rand() - 0.5) * range;
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
    this.updateMoreMarine(dt, cam);
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
    } else if (a.species === 'squirrel') {
      a.stand = damp(a.stand || 0, a.state === 'idle' ? 1 : 0, 6, dt);
      if (a.stand > 0.01) {
        _e.set(-1.15 * a.stand, 0, 0, 'XYZ');
        _q.multiply(_q3.setFromEuler(_e));
      }
    }
    const q = _q2.multiply(_q);
    const bob = (c.hop && a.speed > 0.2 ? Math.abs(Math.sin(a.phase * 1.0)) * 0.15 : 0) + (a.stand || 0) * 0.06;
    const deadDrop = a.dead ? -c.height * 0.3 * Math.min(1, (a.deadT || 0) * 2) : 0;
    _v.set(a.x, a.y + bob + deadDrop, a.z);
    _s.setScalar(a.scale);
    _m.compose(_v, q, _s);
    const wag = { wolf: 0.5, fox: 0.5, lynx: 0.25, squirrel: 0.6, porcupine: 0.2 }[a.species] || 0;
    herd.push(_m, a.phase, a.dead ? 0 : a.amp, a.head, wag);
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
        case 'swoop': {
          const tp = b.swoopTarget();
          const dx = tp.x - b.x;
          const dy = tp.y + 0.25 - b.y;
          const dz = tp.z - b.z;
          const dist = Math.hypot(dx, dy, dz);
          const k = Math.min(1, (28 * dt) / Math.max(dist, 0.01));
          b.yaw = Math.atan2(dx, dz);
          b.x += dx * k;
          b.y += dy * k;
          b.z += dz * k;
          b.flap = dist < 14 ? 1.4 : 0.05;
          b.bank = 0;
          b.t += dt;
          if (dist < 1.3 || b.t > 10) {
            b.mode = 'carry';
            b.t = 0;
            // climb away from the player, out over the water
            const P = g.player.pos;
            b.yaw = Math.atan2(b.x - P.x, b.z - P.z) + (Math.random() - 0.5) * 1.2;
            g.effects.splash(b.x, tp.y, b.z, 0.9);
            g.audio?.eagle(b.x, b.z);
            if (b.onGrab) b.onGrab(b);
            b.onGrab = null;
          }
          break;
        }
        case 'carry': {
          b.t += dt;
          b.y += 7 * dt;
          b.x += Math.sin(b.yaw) * 13 * dt;
          b.z += Math.cos(b.yaw) * 13 * dt;
          b.flap = 1.2;
          if (b.carried) {
            b.carried.position.set(b.x, b.y - 0.4, b.z);
            b.carried.rotation.set(0, b.yaw + Math.PI / 2, 0.25);
            b.carried.userData.uniforms.uFlopT.value += dt;
          }
          if (b.t > 9) {
            if (b.carried) {
              b.carried.parent?.remove(b.carried);
              b.carried.traverse((o) => {
                if (o.isMesh) o.material.dispose();
              });
              b.carried = null;
            }
            // resume circling from the current spot without a jump
            b.mode = 'soar';
            b.R = 50;
            b.ang = 0;
            b.cx = b.x - b.R;
            b.cz = b.z;
            b.speed = 9;
            b.alt = 55;
          }
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
            } else if (b.sp === 'duck' || b.sp === 'loon' || b.sp === 'gull' || b.sp === 'swan') {
              b.mode = 'land';
              b.t = 0;
            } else if (b.sp === 'ptarmigan' || b.sp === 'crane' || b.sp === 'magpie') {
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
            if (!b.landSpot) {
              // dry ground about 30 m ahead, turning a little either way if needed
              for (let k = 0; k < 9 && !b.landSpot; k++) {
                const a = b.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
                const x = b.x + Math.sin(a) * 30;
                const z = b.z + Math.cos(a) * 30;
                if (W.inBounds(x, z, 10) && !W.waterAt(x, z)) b.landSpot = { x, z };
              }
              b.landSpot = b.landSpot || { x: b.x + Math.sin(b.yaw) * 30, z: b.z + Math.cos(b.yaw) * 30 };
            }
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
            b.mode = b.lake ? 'swim' : b.sp === 'gull' ? 'circle' : b.sp === 'crane' ? 'walk' : b.sp === 'magpie' ? 'hop' : 'ground';
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
        case 'walk': {
          // cranes: slow deliberate steps, probing the ground
          b.t -= dt;
          if (b.t <= 0) {
            b.t = 3 + Math.random() * 6;
            const h = b.home || b;
            b.tx = h.x + (Math.random() - 0.5) * 40;
            b.tz = h.z + (Math.random() - 0.5) * 40;
            if (W.waterAt(b.tx, b.tz)) {
              b.tx = b.x;
              b.tz = b.z;
            }
          }
          const dx = b.tx - b.x;
          const dz = b.tz - b.z;
          const dd = Math.hypot(dx, dz);
          b.speed = damp(b.speed || 0, dd > 1 ? 0.55 : 0, 2, dt);
          if (dd > 0.5) b.yaw = dampAngle(b.yaw, Math.atan2(dx, dz), 1.5, dt);
          b.x += Math.sin(b.yaw) * b.speed * dt;
          b.z += Math.cos(b.yaw) * b.speed * dt;
          b.y = W.heightAt(b.x, b.z);
          b.flap = 0;
          b.bank = 0;
          b.amp = b.speed > 0.1 ? 0.7 : 0;
          b.head = b.speed < 0.1 ? 0.6 + Math.sin(g.time * 0.7 + b.x) * 0.3 : 0;
          if (b.callT <= 0) {
            b.callT = 25 + Math.random() * 40;
            g.audio?.crane(b.x, b.z);
          }
          if (Math.hypot(b.x - threat.x, b.z - threat.z) < 30) {
            this.flush(b);
            b.amp = 0;
            g.audio?.crane(b.x, b.z);
          }
          break;
        }
        case 'hop': {
          // magpies: short hops, a look around, now and then a flight to the roof
          b.hopT -= dt;
          b.flap = 0;
          b.bank = 0;
          const ground = W.heightAt(b.x, b.z);
          if (b.hopT <= 0) {
            b.hopT = 0.6 + Math.random() * 1.6;
            b.yaw += (Math.random() - 0.5) * 2.2;
            b.hop = 0.35;
            const h = b.home || b;
            if (Math.hypot(b.x - h.x, b.z - h.z) > 16) b.yaw = Math.atan2(h.x - b.x, h.z - b.z);
          }
          if (b.hop > 0) {
            b.hop -= dt;
            b.x += Math.sin(b.yaw) * 1.4 * dt;
            b.z += Math.cos(b.yaw) * 1.4 * dt;
            b.y = ground + Math.sin((1 - b.hop / 0.35) * Math.PI) * 0.18;
            b.flap = 0.4;
          } else b.y = ground;
          if (b.callT <= 0) {
            b.callT = 10 + Math.random() * 25;
            g.audio?.magpie(b.x, b.z);
          }
          if (Math.hypot(b.x - threat.x, b.z - threat.z) < 7) {
            this.flush(b);
            g.audio?.magpie(b.x, b.z);
          }
          break;
        }
        case 'patrol': {
          // kingfisher: flies the river near the player, hovers, plunges
          const P = g.player.pos;
          b.checkT = (b.checkT || 0) - dt;
          if (b.init || (b.checkT <= 0 && Math.hypot(b.x - P.x, b.z - P.z) > 260)) {
            b.checkT = 4;
            const near = W.river.nearest(P.x, P.z);
            // only follow the player when they are by the river
            if (!b.init && near.d > 300) break;
            b.init = false;
            b.s = near.s;
            const p = W.river.sample(b.s);
            b.x = p.x;
            b.z = p.z;
            b.y = W.riverLevel(b.s) + 5;
            b.dir = Math.random() < 0.5 ? 1 : -1;
            b.phaseK = 'fly';
            b.t = 0;
          }
          b.t += dt;
          const lvl = W.riverLevel(b.s);
          if (b.phaseK === 'fly') {
            b.s += b.dir * 9 * dt;
            if (b.s < 20 || b.s > W.river.length - 20) b.dir = -b.dir;
            const p = W.river.sample(b.s);
            const off = Math.sin(b.t * 0.7) * W.riverWidth(b.s) * 0.5;
            const nx = p.x - p.tz * off;
            const nz = p.z + p.tx * off;
            b.yaw = Math.atan2(nx - b.x, nz - b.z);
            b.x = nx;
            b.z = nz;
            b.y = damp(b.y, lvl + 3.5 + Math.sin(b.t * 2.1) * 0.8, 2, dt);
            b.flap = 1.3;
            b.bank = 0.1;
            if (b.t > 6 + Math.random() * 20) {
              b.phaseK = 'hover';
              b.t = 0;
            }
          } else if (b.phaseK === 'hover') {
            b.flap = 1.6;
            b.y = damp(b.y, lvl + 4.5, 2, dt);
            if (b.t > 1.8) {
              b.phaseK = 'dive';
              b.t = 0;
            }
          } else if (b.phaseK === 'dive') {
            b.flap = 0.1;
            b.y -= 16 * dt;
            if (b.y <= lvl) {
              b.y = lvl;
              g.effects.splash(b.x, lvl, b.z, 0.35);
              g.effects.ripples.add(b.x, lvl, b.z, 1.4, 1.2);
              g.audio?.plop(0.35);
              b.phaseK = 'rise';
              b.t = 0;
            }
          } else {
            b.flap = 1.4;
            b.y += 5 * dt;
            if (b.t > 1.2) {
              b.phaseK = 'fly';
              b.t = 0;
              g.audio?.kingfisher(b.x, b.z);
            }
          }
          if (b.callT <= 0) {
            b.callT = 12 + Math.random() * 18;
            g.audio?.kingfisher(b.x, b.z);
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
      const flapRate = { puffin: 22, duck: 16, ptarmigan: 16, eagle: 5, kingfisher: 24, magpie: 14, swan: 5, crane: b.mode === 'walk' ? 2.2 : 5 }[b.sp] || 8;
      b.phase = (b.phase || Math.random() * 10) + dt * flapRate;
      const herd = this.herds[b.sp];
      _e.set(0, b.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      if (b.bank) _q.multiply(_q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -b.bank * 0.8));
      _v.set(b.x, b.y, b.z);
      _s.setScalar(b.sp === 'eagle' ? 1.2 : 1);
      _m.compose(_v, _q, _s);
      herd.push(_m, b.phase, b.amp || 0, b.head || 0, b.flap);
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

  updateMoreMarine(dt, cam) {
    const g = this.game;
    const W = this.world;
    const threat = this.threatPos();
    // orcas: the pod cruises the bay; each animal surfaces in turn, the tall
    // dorsal fin slicing up, then rolls under again
    const pod = this.orcaPod;
    if (pod) {
      pod.t += dt;
      pod.x += Math.sin(pod.yaw) * 3.2 * dt;
      pod.z += Math.cos(pod.yaw) * 3.2 * dt;
      const csd = W.inBounds(pod.x, pod.z) ? W.coastAt(pod.x, pod.z) : W.coastSDBrute(pod.x, pod.z);
      if (csd > -160 || Math.abs(pod.x) > 3000 || Math.abs(pod.z) > 3000) pod.yaw += dt * 0.3;
      else pod.yaw += Math.sin(pod.t * 0.03) * dt * 0.06;
      const pc = Math.cos(pod.yaw);
      const ps = Math.sin(pod.yaw);
      for (const o of this.orcas) {
        o.t += dt;
        o.x = pod.x + o.ox * pc + o.oz * ps;
        o.z = pod.z - o.ox * ps + o.oz * pc;
        const cyc = o.t % 9;
        let y;
        let pitch;
        if (cyc < 3.2) {
          // arc through the surface
          const u = cyc / 3.2;
          y = -2.3 + Math.sin(u * Math.PI) * 2.0;
          pitch = -Math.cos(u * Math.PI) * 0.35;
          if (!o.blown && u > 0.25) {
            o.blown = true;
            if (Math.hypot(o.x - cam.x, o.z - cam.z) < 700) g.audio?.orcaBlow(o.x, o.z);
            for (let i = 0; i < 12; i++) {
              g.effects.soft.emit(o.x, 0.4, o.z, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 1.1, 0.5, 1.8, 0.92, 0.95, 0.97, 0.45, 3, 0.7);
            }
          }
        } else {
          y = -6;
          pitch = 0;
          o.blown = false;
        }
        o.y = y;
        if (y < -5 || Math.hypot(o.x - cam.x, o.z - cam.z) > 2200) continue;
        _e.set(pitch, pod.yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _v.set(o.x, o.y, o.z);
        _s.setScalar(o.scale);
        _m.compose(_v, _q, _s);
        this.herds.orca.push(_m, o.t * 2, 0, 0, 0.35);
      }
    }
    // sea lions: dozing on the rocks, heads up to bark; they slide into the
    // sea when someone comes close and haul out again later
    for (const l of this.seaLions) {
      l.t += dt;
      const d = Math.hypot(l.x - threat.x, l.z - threat.z);
      if (l.state === 'rest') {
        l.head = damp(l.head, Math.sin(l.t * 0.4 + l.hx) > 0.6 ? -0.35 : 0.25, 2, dt);
        if (Math.random() < dt * 0.02 && d < 400) g.audio?.seaLion(l.x, l.z);
        if (d < 32) {
          l.state = 'flee';
          l.t = 0;
          g.audio?.seaLion(l.x, l.z);
        }
        l.y = W.heightAt(l.x, l.z);
      } else if (l.state === 'flee') {
        const h = this.haulOut;
        const dx = h.sx - l.x;
        const dz = h.sz - l.z;
        l.yaw = dampAngle(l.yaw, Math.atan2(dx, dz), 4, dt);
        l.x += Math.sin(l.yaw) * 2.6 * dt;
        l.z += Math.cos(l.yaw) * 2.6 * dt;
        const w = W.waterAt(l.x, l.z);
        l.y = w ? Math.max(W.heightAt(l.x, l.z), -0.45) : W.heightAt(l.x, l.z);
        if (w && w.depth > 0.8) {
          l.state = 'sea';
          l.t = 0;
          g.effects.splash(l.x, 0, l.z, 0.8);
        }
      } else if (l.state === 'sea') {
        l.y = -0.35 + Math.sin(l.t * 1.3) * 0.08;
        if (l.t > 40 && d > 90) {
          l.state = 'rest';
          l.x = l.hx;
          l.z = l.hz;
        }
      }
      if (Math.hypot(l.x - cam.x, l.z - cam.z) > 500) continue;
      const tilt = l.state === 'sea' ? 0.25 : 0;
      _e.set(tilt, l.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(l.x, l.y, l.z);
      _s.setScalar(l.scale);
      _m.compose(_v, _q, _s);
      this.herds.sealion.push(_m, l.t, l.state === 'flee' ? 0.6 : 0, l.head, 0.2);
    }
    // harbour seals: a head pops up, looks around, sinks, pops up elsewhere
    const pier = W.place('pier');
    for (const sl of this.seals) {
      sl.t -= dt;
      if (sl.t <= 0) {
        sl.up = !sl.up;
        sl.t = sl.up ? 8 + Math.random() * 14 : 6 + Math.random() * 10;
        if (sl.up) {
          for (let k = 0; k < 20; k++) {
            const x = pier.x + (Math.random() - 0.5) * 240;
            const z = pier.z + (Math.random() - 0.5) * 240;
            const w = W.waterAt(x, z);
            if (w && w.depth > 3) {
              sl.x = x;
              sl.z = z;
              break;
            }
          }
          sl.yaw = Math.random() * Math.PI * 2;
          g.effects.ripples.add(sl.x, 0, sl.z, 1.2, 1.2);
        } else g.effects.ripples.add(sl.x, 0, sl.z, 1.4, 1.2);
      }
      sl.y = damp(sl.y, sl.up ? -0.05 : -1.5, 2.5, dt);
      if (sl.y < -1.2 || Math.hypot(sl.x - cam.x, sl.z - cam.z) > 400) continue;
      sl.yaw += Math.sin(g.time * 0.5 + sl.x) * dt * 0.4;
      _e.set(-0.25, sl.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(sl.x, sl.y, sl.z);
      _s.setScalar(1);
      _m.compose(_v, _q, _s);
      this.herds.seal.push(_m, 0, 0, 0, 0);
    }
    // beavers: swim patrols out from the lodge with a V of ripples; a slap
    // of the tail and a dive when you come too close
    for (const b of this.beavers) {
      b.t += dt;
      const lake = b.lake;
      if (b.under > 0) {
        b.under -= dt;
        if (b.under <= 0) {
          b.x = b.lodge.x + (Math.random() - 0.5) * 30;
          b.z = b.lodge.z + (Math.random() - 0.5) * 30;
          const w = W.waterAt(b.x, b.z);
          if (!w || w.depth < 0.8) {
            b.x = b.lodge.x;
            b.z = b.lodge.z;
          }
          g.effects.ripples.add(b.x, lake.level, b.z, 1.0, 1.0);
        }
        continue;
      }
      if (Math.hypot(b.tx - b.x, b.tz - b.z) < 2 || b.t > 25) {
        b.t = 0;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 10 + Math.random() * 60;
          const x = b.lodge.x + Math.cos(a) * r;
          const z = b.lodge.z + Math.sin(a) * r;
          const w = W.waterAt(x, z);
          if (w && w.depth > 1) {
            b.tx = x;
            b.tz = z;
            break;
          }
        }
      }
      b.yaw = dampAngle(b.yaw, Math.atan2(b.tx - b.x, b.tz - b.z), 1.2, dt);
      b.x += Math.sin(b.yaw) * 0.7 * dt;
      b.z += Math.cos(b.yaw) * 0.7 * dt;
      b.rip = (b.rip || 0) - dt;
      if (b.rip <= 0) {
        b.rip = 0.7;
        g.effects.ripples.add(b.x - Math.sin(b.yaw) * 0.4, lake.level, b.z - Math.cos(b.yaw) * 0.4, 0.8, 1.6);
      }
      if (Math.hypot(b.x - threat.x, b.z - threat.z) < 24) {
        b.under = 18 + Math.random() * 12;
        g.effects.splash(b.x, lake.level, b.z, 0.7);
        g.audio?.tailSlap(b.x, b.z);
        continue;
      }
      if (Math.hypot(b.x - cam.x, b.z - cam.z) > 350) continue;
      _e.set(0, b.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(b.x, lake.level - 0.08 + Math.sin(g.time * 2 + b.x) * 0.02, b.z);
      _s.setScalar(1);
      _m.compose(_v, _q, _s);
      this.herds.beaver.push(_m, b.t, 0, 0, 0.2 + Math.sin(g.time * 3) * 0.1);
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
