// The secret, on no map and no compass:
// - Gus's cache on a western summit: his paraglider in a stuff sack on a
//   gear box, a windsock and a sign. From the valley (Hotrod Landing, the
//   Trading Post, Glacier Lake and most places) a tin mirror on the box
//   glints in the sun now and then, and after dark a lantern on the
//   windsock's pole glows high on the mountain.
// - Cairns on the hard upper half of the way up from Bear Falls.
// - A grotto on a ledge that no path reaches, only a glide from the summit:
//   Gus's camp under an orange tarp, a lantern on a post (it glows at night,
//   seen from the summit) and a tin with the key.
// - Gus's chest on a stone shelf behind Bear Falls, hidden by the water.
// buildSecret() adds the pieces through the Props helpers; Secret runs the
// windsock, the glint, the lantern and what has been taken or opened.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { mulberry32 } from '../util/math.js';
import { SECRET } from './layout.js';
import { FX } from './worldfx.js';

// Gus's notes, found with the paraglider and the key, and what was in his
// chest: shown when found and kept in the journal.
export const GUS_NOTES = [
  { flag: 'glider', where: 'With the paraglider on the summit', text: "Too old for this. My camp is on the ledge to the south, under the orange tarp. Mind the first step. — Gus" },
  { flag: 'key', where: 'With the key in the grotto', text: "My chest sits behind the bears' waterfall, where the water hides it. — Gus" },
  { flag: 'treasure', where: 'In the chest behind Bear Falls', text: "$5,000 in gold nuggets and Gus's Golden Spoon. Don't spend it all on bug dope. — Gus" },
];

const WOOD = 0x6b4a2e;
const WOOD_DARK = 0x4a3220;
const ROCK = 0x5e5a54;
const ROCK_DARK = 0x423f3a;
const BRASS = 0xd8b048;

function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    to(lx, lz) {
      return [x + lx * c + lz * s, z - lx * s + lz * c];
    },
  };
}

// Bear Falls' own frame: x across the river (+ toward the west bank), z
// downstream from the lip; bot is the pool's surface.
export function fallsFrame(W) {
  if (!(W.fallsS > 0)) return null;
  const p = W.river.sample(W.fallsS);
  const rx = -p.tz;
  const rz = p.tx;
  return {
    bot: W.riverLevel(W.fallsS + 0.01),
    // a mesh turned by yaw has its +z downstream
    yaw: Math.atan2(p.tx, p.tz),
    to: (lx, lz) => [p.x + rx * lx + p.tx * lz, p.z + rz * lx + p.tz * lz],
  };
}

// Where the shelf behind the falls runs and the chest stands: from the west
// bank (x 12) along the foot of the cliff to just past the middle, half a
// metre above the pool and inside the falling water's back sheet (which
// hangs about 1.9 m out at head height).
const SHELF = { x0: -1.6, x1: 12.4, z: 0.55, half: 0.7, rise: 0.5 };
const CHEST_AT = { x: 0.2, z: 0.25 };

export function secretSpots(W) {
  const F = fallsFrame(W);
  let chest = null;
  if (F) {
    const [x, z] = F.to(CHEST_AT.x, CHEST_AT.z);
    chest = { x, z, y: F.bot + SHELF.rise, yaw: F.yaw };
  }
  return { cache: SECRET.cache, grotto: SECRET.grotto, ledge: SECRET.ledge, chest, falls: F };
}

// Ground the vegetation should leave clear.
export function secretAvoid() {
  const out = [
    { x: SECRET.cache.x, z: SECRET.cache.z, r: 9 },
    { x: SECRET.grotto.x, z: SECRET.grotto.z, r: 9 },
  ];
  for (const [x, z] of SECRET.cairns) out.push({ x, z, r: 2.5 });
  return out;
}

// A mesh that changes at play time stays out of the static merge.
function live(m) {
  m.matrixAutoUpdate = true;
  return m;
}

export function buildSecret(P) {
  const W = P.world;
  const rand = mulberry32(4471);
  const S = (P.secret = {});

  // ------------------------------------------------ Gus's cache on the summit
  {
    const { x, z } = SECRET.cache;
    const y = W.heightAt(x, z);
    // everything faces south, toward the ledge
    const f = frame(x, z, 0);
    const box = new ModelBuilder();
    box.box(1.1, 0.6, 0.72, { pos: [0, 0.3, 0], color: WOOD });
    box.box(1.14, 0.08, 0.76, { pos: [0, 0.62, 0], color: WOOD_DARK });
    for (const sx of [-1, 1]) box.box(0.05, 0.62, 0.78, { pos: [sx * 0.52, 0.31, 0], color: 0x3a3a38 });
    // stones on the lid against the wind, and the tin mirror that glints
    box.dodeca(0.13, { pos: [-0.38, 0.72, 0.2], scale: [1, 0.6, 1], color: ROCK });
    box.box(0.22, 0.02, 0.16, { pos: [0.36, 0.67, -0.18], rot: [0.3, 0.4, 0], color: 0xd8dce0 });
    const [bx, bz] = f.to(0.3, 0.6);
    const by = W.heightAt(bx, bz);
    P.addMesh(box.build(), bx, by, bz, 0.25);
    P.colliders.addBox(bx, bz, 0.6, 0.42, 0.25, by - 1, by + 0.7);
    S.glint = new THREE.Vector3(bx, by + 0.9, bz);
    // the paraglider in its red stuff sack, on the box
    const bag = new ModelBuilder();
    bag.sphere(0.42, 10, 8, { pos: [0, 0.32, 0], scale: [1.25, 0.72, 0.85], color: 0xd8322a });
    bag.box(0.9, 0.05, 0.1, { pos: [0, 0.52, 0.05], color: 0x1c1c1c });
    bag.torus(0.09, 0.025, 5, 10, { pos: [0.5, 0.36, 0], rot: [0, Math.PI / 2, 0], color: 0xe8b830 });
    S.bag = live(P.addMesh(bag.build(), bx, by + 0.66, bz, 0.25));
    S.cache = { x: bx, z: bz, y: by };
    P.interactions.push({ id: 'glider', label: 'Take', x: bx, z: bz, r: 2.6, y: by });
    // the windsock on its pole
    const [wx, wz] = f.to(-2.2, -0.8);
    const wy = W.heightAt(wx, wz);
    const pole = new ModelBuilder();
    pole.cyl(0.04, 0.06, 4.6, 6, { pos: [0, 2.3, 0], color: 0x9a9a96 });
    for (let i = 0; i < 3; i++) pole.beam([0, 0, 0], [Math.cos(i * 2.1) * 1.6, -4.2, Math.sin(i * 2.1) * 1.6], 0.01, 3, { pos: [0, 4.4, 0], color: 0x333333 });
    // a lantern hung on the pole: it glows after dark
    pole.beam([0.04, 3.3, 0], [0.32, 3.3, 0], 0.015, 4, { color: 0x333333 });
    pole.beam([0.32, 3.3, 0], [0.32, 3.12, 0], 0.005, 3, { color: 0x222222 });
    pole.cyl(0.07, 0.09, 0.2, 6, { pos: [0.32, 3.02, 0], color: 0x2a2a28 });
    pole.cyl(0.055, 0.055, 0.14, 6, { pos: [0.32, 3.04, 0], color: 0xffd890 });
    P.addMesh(pole.build(), wx, wy, wz, 0);
    S.lanterns = [new THREE.Vector3(wx + 0.32, wy + 3.04, wz)];
    // (hi: how tall it stands, for the paraglider)
    P.colliders.addCircle(wx, wz, 0.12, 'solid').hi = 4.6;
    const sock = new ModelBuilder();
    // bands of orange and white, narrowing downwind (+z)
    for (let i = 0; i < 5; i++) {
      const r0 = 0.34 - i * 0.045;
      const r1 = r0 - 0.045;
      sock.cyl(r1, r0, 0.36, 10, { pos: [0, 0, 0.18 + i * 0.36], rot: [Math.PI / 2, 0, 0], color: i % 2 ? 0xf2f0ea : 0xff6a14, jitter: 0.02 });
    }
    sock.torus(0.34, 0.02, 4, 12, { pos: [0, 0, 0], color: 0x9a9a96 });
    S.sock = live(P.addMesh(sock.build(), wx, wy + 4.5, wz, 0, P.mat, { shadow: false }));
    S.sockBase = new THREE.Vector3(wx, wy + 4.5, wz);
    // the sign, as Gus wrote it
    const [sx, sz] = f.to(1.9, -1.0);
    const sy = W.heightAt(sx, sz);
    const post = new ModelBuilder();
    post.box(0.1, 1.5, 0.1, { pos: [0, 0.75, 0], color: WOOD_DARK });
    P.addMesh(post.build(), sx, sy, sz, Math.PI);
    P.addSign("GUS'S LAUNCH", 'No refunds · Mind the first step', sx, sy + 1.45, sz, Math.PI, 1.5, 0.62);
  }

  // ------------------------------------------------ cairns on the way up
  for (const [x, z] of SECRET.cairns) {
    const c = new ModelBuilder();
    let y0 = 0;
    for (let i = 0; i < 5; i++) {
      const r = 0.32 - i * 0.05;
      c.dodeca(r, { pos: [(rand() - 0.5) * 0.06, y0 + r * 0.45, (rand() - 0.5) * 0.06], scale: [1.2, 0.5, 1.0], rot: [0, rand() * 3, 0], color: i % 2 ? ROCK : 0x6e6a62, jitter: 0.15 });
      y0 += r * 0.85;
    }
    P.addMesh(c.build(), x, W.heightAt(x, z) - 0.05, z, rand() * 6);
    P.colliders.addCircle(x, z, 0.3, 'rock').hi = 1.3;
  }

  // ------------------------------------------------ the grotto on the ledge
  // A shallow hollow in the rock face. Its floor climbs toward the back, so
  // the camp and the key sit in the front half, where you can stand; the
  // mouth looks north, to the summit you glide from.
  {
    const G = SECRET.grotto;
    const f = frame(G.x, G.z, G.yaw);
    const ground = (lx, lz) => W.heightAt(...f.to(lx, lz));
    const rocks = new ModelBuilder();
    const add = (lx, lz, y, r, sc = [1, 1, 1]) => rocks.dodeca(r, { pos: [lx, y, lz], scale: sc, rot: [rand() * 3, rand() * 3, rand() * 3], color: rand() < 0.5 ? ROCK : ROCK_DARK, jitter: 0.2 });
    const base = ground(0, 0);
    // side walls from the mouth (+z) back to the rock face (-z)
    for (const sd of [-1, 1]) {
      for (let lz = 1.6; lz >= -1.3; lz -= 0.95) {
        const gy = ground(sd * 2.0, lz) - base;
        add(sd * (2.0 + rand() * 0.2), lz, gy + 0.7, 0.85 + rand() * 0.2, [0.9, 1.1, 1]);
        add(sd * (1.95 + rand() * 0.2), lz, gy + 1.9, 0.75 + rand() * 0.2, [0.9, 1.0, 1]);
        P.colliders.addCircle(...f.to(sd * 2.05, lz), 0.62, 'rock').hi = 3;
      }
    }
    // the back
    for (let lx = -1.5; lx <= 1.5; lx += 1.0) {
      const gy = ground(lx, -1.6) - base;
      add(lx, -1.7, gy + 0.6, 0.8, [1, 1.1, 0.8]);
      add(lx, -1.65, gy + 1.8, 0.75, [1, 1, 0.8]);
      P.colliders.addCircle(...f.to(lx, -1.75), 0.55, 'rock').hi = 3;
    }
    // the roof: big flat slabs stepping down toward the mouth with the floor,
    // on a third course of rocks along each wall
    const floorAt = (lz) => Math.max(ground(-1.8, lz), ground(0, lz), ground(1.8, lz)) - base;
    for (const sd of [-1, 1]) for (let lz = 1.6; lz >= -1.3; lz -= 0.95) add(sd * 1.9, lz, floorAt(lz) + 2.75, 0.7, [0.9, 0.9, 1.1]);
    let roofFront = 0;
    for (let lz = -1.5; lz <= 1.9; lz += 0.85) {
      roofFront = floorAt(lz) + 3.05;
      rocks.dodeca(1.5, { pos: [(rand() - 0.5) * 0.3, roofFront, lz], scale: [1.6, 0.36, 0.7], rot: [0, rand() * 0.4, 0], color: ROCK_DARK, jitter: 0.16 });
    }
    const [gx, gz] = f.to(0, 0);
    const gm = P.addMesh(rocks.build(), gx, base, gz, G.yaw);
    gm.name = 'grotto';
    // Gus's camp: a mat, a pot, and the tin with the key on a flat stone
    const camp = new ModelBuilder();
    // his sleeping mat, rolled up, and a blackened pot
    camp.cyl(0.11, 0.11, 0.62, 10, { pos: [1.2, ground(1.2, 0.5) - base + 0.1, 0.5], rot: [0, 0, Math.PI / 2], color: 0x2c4a6a });
    camp.cyl(0.13, 0.11, 0.18, 8, { pos: [-0.9, ground(-0.9, 1.0) - base + 0.07, 1.0], color: 0x3a3a3a });
    const KEY_AT = { x: 0.6, z: -0.35 };
    const stoneY = ground(KEY_AT.x, KEY_AT.z) - base;
    camp.dodeca(0.42, { pos: [KEY_AT.x, stoneY + 0.12, KEY_AT.z], scale: [1.3, 0.45, 1.0], color: ROCK, jitter: 0.1 });
    camp.box(0.32, 0.14, 0.22, { pos: [KEY_AT.x, stoneY + 0.34, KEY_AT.z], color: 0x6a7a6a });
    P.addMesh(camp.build(), gx, base, gz, G.yaw);
    const [kx, kz] = f.to(KEY_AT.x, KEY_AT.z);
    const ky = base + stoneY + 0.43;
    const key = new ModelBuilder();
    key.torus(0.05, 0.014, 5, 12, { pos: [-0.09, 0, 0], rot: [Math.PI / 2, 0, 0], color: BRASS, jitter: 0 });
    key.box(0.13, 0.018, 0.022, { pos: [0.03, 0, 0], color: BRASS, jitter: 0 });
    key.box(0.02, 0.018, 0.035, { pos: [0.08, 0, 0.022], color: BRASS, jitter: 0 });
    key.box(0.02, 0.018, 0.025, { pos: [0.05, 0, 0.018], color: BRASS, jitter: 0 });
    if (!P.brassMat) P.brassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 });
    S.key = live(P.addMesh(key.build(), kx, ky, kz, G.yaw + 0.6, P.brassMat, { shadow: false }));
    S.keySpot = { x: kx, z: kz, y: ky };
    P.interactions.push({ id: 'key', label: 'Take', x: kx, z: kz, r: 2.1, y: ky - 0.4 });
    // Gus's orange tarp over the mouth on two poles: the speck of colour you
    // look for from the summit
    const tarp = new ModelBuilder();
    const tz = 2.25;
    const ty = roofFront - 0.35;
    tarp.box(3.0, 0.03, 1.5, { pos: [0, ty - 0.22, tz + 0.55], rot: [-0.3, 0, 0], color: 0xff6a14, jitter: 0 });
    for (const sd of [-1, 1]) tarp.beam([sd * 1.4, ground(sd * 1.4, tz + 1.2) - base - 0.1, tz + 1.2], [sd * 1.4, ty - 0.42, tz + 1.2], 0.03, 5, { color: WOOD_DARK });
    P.addMesh(tarp.build(), gx, base, gz, G.yaw);
    for (const sd of [-1, 1]) P.colliders.addCircle(...f.to(sd * 1.4, tz + 1.2), 0.08, 'solid').hi = ty - 0.42 - (ground(sd * 1.4, tz + 1.2) - base - 0.1);

    // Gus's lantern on a crooked post at the mouth's east corner: it glows
    // after dark, a warm speck high on the cliff seen from the valley
    const [px, pz] = f.to(-3.0, 2.2);
    const py = W.heightAt(px, pz);
    const post = new ModelBuilder();
    post.beam([0, 0, 0], [0.1, 2.15, 0.05], 0.05, 5, { color: WOOD_DARK });
    post.beam([0.1, 2.1, 0.05], [0.55, 2.2, 0.1], 0.035, 4, { color: WOOD_DARK });
    post.beam([0.55, 2.2, 0.1], [0.55, 1.98, 0.1], 0.006, 3, { color: 0x222222 });
    post.cyl(0.08, 0.1, 0.22, 6, { pos: [0.55, 1.87, 0.1], color: 0x2a2a28 });
    post.cyl(0.06, 0.06, 0.16, 6, { pos: [0.55, 1.89, 0.1], color: 0xffd890 });
    P.addMesh(post.build(), px, py - 0.1, pz, G.yaw, P.mat, { shadow: false });
    P.colliders.addCircle(px, pz, 0.12, 'solid').hi = 2.2;
    // the glass of the lantern, turned with the post
    const c = Math.cos(G.yaw);
    const sn = Math.sin(G.yaw);
    S.lanterns.push(new THREE.Vector3(px + 0.55 * c + 0.1 * sn, py - 0.1 + 1.89, pz - 0.55 * sn + 0.1 * c));
  }

  // ------------------------------------------------ the shelf behind Bear Falls
  const F = fallsFrame(W);
  if (F) {
    const top = F.bot + SHELF.rise;
    // flat stones along the foot of the cliff, a little uneven
    const n = Math.round(SHELF.x1 - SHELF.x0);
    for (let i = 0; i < n; i++) {
      const lx = SHELF.x0 + (i + 0.5) * ((SHELF.x1 - SHELF.x0) / n);
      const [x, z] = F.to(lx, SHELF.z + (rand() - 0.5) * 0.12);
      const st = new ModelBuilder();
      st.box(1.08, 0.24, SHELF.half * 2, { pos: [0, -0.12, 0], rot: [(rand() - 0.5) * 0.05, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.05], color: rand() < 0.5 ? 0x55524c : 0x4a4742, jitter: 0.12 });
      // a boulder under each slab, down into the pool
      st.dodeca(0.55, { pos: [0, -0.75, 0.15], scale: [1, 1.1, 0.9], color: 0x3a3934, jitter: 0.2 });
      P.addMesh(st.build(), x, top, z, F.yaw);
    }
    const [cx, cz] = F.to((SHELF.x0 + SHELF.x1) / 2, SHELF.z);
    P.colliders.addDeck(cx, cz, (SHELF.x1 - SHELF.x0) / 2, SHELF.half, F.yaw, top);
    // the chest in a niche of rocks at the foot of the cliff (behind it, so
    // you see it as you come along the shelf)
    const [chx, chz] = F.to(CHEST_AT.x, CHEST_AT.z);
    const niche = new ModelBuilder();
    for (const sd of [-1, 1]) {
      niche.dodeca(0.55, { pos: [sd * 0.85, 0.35, -0.6], scale: [0.7, 1.2, 0.8], color: 0x3e3c38, jitter: 0.2 });
      niche.dodeca(0.45, { pos: [sd * 0.7, 1.1, -0.65], scale: [0.8, 1.0, 0.8], color: 0x45423d, jitter: 0.2 });
    }
    niche.dodeca(0.8, { pos: [0, 1.7, -0.7], scale: [1.4, 0.5, 0.8], color: 0x3a3833, jitter: 0.2 });
    P.addMesh(niche.build(), chx, top, chz, F.yaw);
    const chest = new ModelBuilder();
    chest.box(0.95, 0.5, 0.58, { pos: [0, 0.25, 0], color: 0x3e2a18 });
    for (const sx of [-0.4, 0.4]) chest.box(0.06, 0.52, 0.6, { pos: [sx, 0.26, 0], color: 0x2a2a2a });
    chest.box(0.14, 0.16, 0.05, { pos: [0, 0.38, 0.3], color: BRASS });
    P.addMesh(chest.build(), chx, top, chz, F.yaw);
    // the lid turns on its back edge when the chest is opened
    const lid = new ModelBuilder();
    lid.box(0.99, 0.14, 0.62, { pos: [0, 0.07, 0.31], color: 0x4a3220 });
    for (const sx of [-0.4, 0.4]) lid.box(0.06, 0.16, 0.64, { pos: [sx, 0.07, 0.31], color: 0x2a2a2a });
    const [hx, hz] = F.to(CHEST_AT.x, CHEST_AT.z - 0.29);
    S.lid = live(P.addMesh(lid.build(), hx, top + 0.5, hz, F.yaw));
    S.lidYaw = F.yaw;
    // gold inside, seen once it is open
    const gold = new ModelBuilder();
    for (let i = 0; i < 14; i++) gold.dodeca(0.06 + rand() * 0.04, { pos: [(rand() - 0.5) * 0.7, 0.42 + rand() * 0.06, (rand() - 0.5) * 0.36], color: 0xf0c040, jitter: 0.1 });
    if (!P.goldMat) P.goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.95 });
    S.gold = live(P.addMesh(gold.build(), chx, top, chz, F.yaw, P.goldMat, { shadow: false }));
    S.chest = { x: chx, z: chz, y: top };
    P.colliders.addBox(chx, chz, 0.5, 0.32, F.yaw, top - 1, top + 0.65);
    P.interactions.push({ id: 'goldchest', label: 'Open', x: chx, z: chz, r: 2.4, y: top });
  }
}

// ------------------------------------------------------------- at play
// A soft round spot for the glint and the lantern's glow.
function glowTexture(warm) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, warm ? 'rgba(255,214,140,1)' : 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, warm ? 'rgba(255,170,70,0.55)' : 'rgba(255,250,230,0.6)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (!warm) {
    // the four points of a glint
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(30, 2, 4, 60);
    g.fillRect(2, 30, 60, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Secret {
  constructor(game) {
    this.game = game;
    this.S = game.props.secret || {};
    this.t = 0;
    const sprite = (warm, size) => {
      const m = new THREE.SpriteMaterial({ map: glowTexture(warm), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false, toneMapped: false });
      const s = new THREE.Sprite(m);
      s.scale.set(size, size, 1);
      s.renderOrder = 5;
      s.visible = false;
      game.scene.add(s);
      return s;
    };
    if (this.S.glint) {
      this.glint = sprite(false, 0.028);
      this.glint.position.copy(this.S.glint);
    }
    // a glow for each of Gus's lanterns: on the summit and at the grotto
    this.glows = (this.S.lanterns || []).map((p) => {
      const s = sprite(true, 0.02);
      s.position.copy(p);
      return s;
    });
  }

  // How much of the light gets through the haze over a distance.
  haze(d) {
    const f = this.game.scene.fog;
    if (f && f.isFogExp2) return Math.exp(-((f.density * d) ** 2));
    return 1;
  }

  update(dt) {
    const g = this.game;
    const S = this.S;
    const fl = g.state.flags;
    this.t += dt;
    if (S.bag) S.bag.visible = !fl.glider;
    if (S.key) S.key.visible = !fl.key;
    if (S.lid) {
      // open: tipped back on its hinge
      const want = fl.treasure ? -1.9 : 0;
      S.lid.rotation.set(0, S.lidYaw, 0);
      S.lid.rotateX(want);
    }
    if (S.gold) S.gold.visible = !!fl.treasure;
    const cam = g.camera.position;
    // the windsock swings round to point downwind and flutters
    if (S.sock) {
      const w = FX.uFxWind.value;
      const yaw = Math.atan2(w.x, w.y) + Math.sin(this.t * 1.7) * 0.12 + Math.sin(this.t * 4.3) * 0.05;
      S.sock.rotation.set(0.25 + Math.sin(this.t * 2.9) * 0.06, yaw, 0, 'YXZ');
    }
    // the glint: a flash every few seconds while the sun is out, seen from
    // afar (close by you see the box itself)
    if (this.glint) {
      const d = cam.distanceTo(this.glint.position);
      const sun = THREE.MathUtils.smoothstep(g.env.sunElevation, 2, 10) * (1 - Math.min(1, g.env.weather.cloud * 0.8));
      const ph = (this.t * 0.37) % 1;
      const flash = Math.exp(-((ph - 0.5) ** 2) / 0.0025) + 0.35 * Math.exp(-((ph - 0.56) ** 2) / 0.0008);
      const a = flash * sun * THREE.MathUtils.smoothstep(d, 90, 200) * this.haze(d);
      this.glint.visible = a > 0.02 && g.started;
      this.glint.material.opacity = Math.min(1, a);
    }
    // Gus's lanterns after dark: warm specks high on the mountain
    const dark = THREE.MathUtils.smoothstep(g.env.night, 0.3, 0.7);
    for (let i = 0; i < this.glows.length; i++) {
      const s = this.glows[i];
      const d = cam.distanceTo(s.position);
      const a = dark * (0.75 + 0.25 * Math.sin(this.t * 5.3 + i) * Math.sin(this.t * 3.1 + i * 2)) * this.haze(d);
      s.visible = a > 0.02 && g.started;
      // a little bigger and brighter far off, so a valley away it still shows
      s.material.opacity = Math.min(1, a * (d > 400 ? 1.35 : 1));
      s.scale.setScalar(d < 40 ? 0.05 : d > 400 ? 0.027 : 0.02);
    }
  }
}
