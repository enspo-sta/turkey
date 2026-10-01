// The three newer places and what makes them themselves:
// - Steaming Springs: a sinter geyser cone, a hot pool to soak in, steam
//   vents and mud pots round a warm trout pond.
// - Mosquito Flats: the World's Largest Mosquito, a boardwalk over the
//   muskeg to the slough, dead snags and a bug dope machine.
// - Shipwreck Cove: the Unsinkable II aground off the beach, with a
//   gangplank, a walkable deck, a wheelhouse and a sea chest, and sea stacks.
// buildAreas() adds the structures through the Props helpers; Areas runs
// the steam, the geyser and the mud pots at play time.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { makeSignTexture } from '../util/textures.js';
import { clamp, lerp, mulberry32 } from '../util/math.js';
import { GEYSER } from './layout.js';

const WOOD = 0x6b4a2e;
const WOOD_DARK = 0x4a3220;
const WOOD_LIGHT = 0x8a6a45;
const SINTER = 0xd8d2c0;

function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    to(lx, lz) {
      return [x + lx * c + lz * s, z - lx * s + lz * c];
    },
  };
}

// Places the vegetation should leave clear.
export function areaAvoid(W) {
  const out = [{ x: GEYSER.x, z: GEYSER.z, r: 9 }];
  const hp = W.lakeById.hotpool;
  if (hp) out.push({ x: hp.x, z: hp.z, r: hp.r + 6 });
  const fl = W.place('flats');
  if (fl) out.push({ x: fl.x, z: fl.z, r: 10 });
  const wr = W.place('wreck');
  if (wr) {
    out.push({ x: wr.x, z: wr.z, r: 12 });
    if (wr.wreckAt) out.push({ x: wr.wreckAt.x, z: wr.wreckAt.z, r: 16 });
  }
  return out;
}

// A painted sign on two posts.
function signBoard(P, title, sub, x, z, yaw, opts = {}) {
  const y = P.world.heightAt(x, z);
  const post = new ModelBuilder();
  post.box(0.14, 2.3, 0.14, { pos: [-1.2, 1.15, 0], color: WOOD_DARK });
  post.box(0.14, 2.3, 0.14, { pos: [1.2, 1.15, 0], color: WOOD_DARK });
  P.addMesh(post.build(), x, y, z, yaw);
  if (opts.bg || opts.fg) {
    const tex = makeSignTexture(title, sub, opts);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const plain = P.signBack || (P.signBack = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 }));
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.1, 0.08), [plain, plain, plain, plain, mat, plain]);
    m.position.set(x, y + 1.75, z);
    m.rotation.y = yaw;
    m.castShadow = true;
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    P.group.add(m);
  } else P.addSign(title, sub, x, y + 1.75, z, yaw, 2.9, 1.1);
  P.colliders.addBox(x, z, 1.4, 0.15, yaw);
}

// ------------------------------------------------------------ the springs
function buildSprings(P) {
  const W = P.world;
  const rand = mulberry32(77);
  P.steam = P.steam || [];
  P.mudPots = P.mudPots || [];
  // the geyser cone: layered sinter with orange runoff down its flanks
  const gy = W.heightAt(GEYSER.x, GEYSER.z);
  const b = new ModelBuilder();
  b.lathe(
    [
      [0.01, -0.4],
      [4.2, -0.4],
      [3.9, 0.1],
      [3.0, 0.5],
      [2.2, 0.95],
      [1.3, 1.45],
      [0.8, 1.7],
      [0.55, 1.62],
      [0.42, 1.2],
      [0.01, 1.1],
    ],
    16,
    { color: SINTER }
  );
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r0 = 0.75;
    const r1 = 3.6 + rand() * 0.5;
    b.beam([Math.cos(a) * r0, 1.55, Math.sin(a) * r0], [Math.cos(a) * r1, 0.05, Math.sin(a) * r1], 0.07 + rand() * 0.06, 4, { color: i % 3 === 0 ? 0xb0861e : 0xc4641e });
  }
  // terraces: shallow rimmed steps of sinter round the cone
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4.5 + rand() * 2.5;
    b.cyl(0.9 + rand() * 0.6, 1.0 + rand() * 0.6, 0.18, 10, { pos: [Math.cos(a) * r, -0.05, Math.sin(a) * r], color: i % 2 ? 0xe2dccb : 0xcfc7b0 });
  }
  P.addMesh(b.build(), GEYSER.x, gy, GEYSER.z, 0);
  P.colliders.addCircle(GEYSER.x, GEYSER.z, 2.4);
  P.geyser = { x: GEYSER.x, y: gy + 1.6, z: GEYSER.z };
  signBoard(P, 'Old Faceful', 'Erupts every minute or two · Stand back. No, further', GEYSER.x + 7, GEYSER.z + 5, 2.3);

  // the hot pool: a ring of stones, a bench, a towel on a rail and its sign
  const hp = W.lakeById.hotpool;
  if (hp) {
    const st = new ModelBuilder();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = W.lakeRadius(hp, a) + 0.6 + rand() * 0.4;
      st.dodeca(0.38 + rand() * 0.3, { pos: [Math.cos(a) * r, 0.1, Math.sin(a) * r], color: 0x6c665c, jitter: 0.2 });
    }
    P.addMesh(st.build(), hp.x, hp.level, hp.z, 0);
    // the side toward the springs pond
    const sp = W.lakeById.springs;
    const dx = (sp ? sp.x : hp.x - 1) - hp.x;
    const dz = (sp ? sp.z : hp.z) - hp.z;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const r = W.lakeRadius(hp, Math.atan2(uz, ux)) + 2.4;
    const bx = hp.x + ux * r;
    const bz = hp.z + uz * r;
    const yaw = Math.atan2(-ux, -uz);
    const bench = new ModelBuilder();
    bench.box(1.8, 0.08, 0.45, { pos: [0, 0.45, 0], color: WOOD_LIGHT });
    bench.box(0.1, 0.45, 0.4, { pos: [-0.75, 0.22, 0], color: WOOD_DARK });
    bench.box(0.1, 0.45, 0.4, { pos: [0.75, 0.22, 0], color: WOOD_DARK });
    // towel rail with a striped towel
    bench.box(0.06, 1.1, 0.06, { pos: [1.4, 0.55, 0.2], color: WOOD_DARK });
    bench.box(0.06, 1.1, 0.06, { pos: [2.4, 0.55, 0.2], color: WOOD_DARK });
    bench.box(1.06, 0.06, 0.06, { pos: [1.9, 1.08, 0.2], color: WOOD_DARK });
    for (let i = 0; i < 4; i++) bench.box(0.24, 0.6, 0.02, { pos: [1.55 + i * 0.24, 0.78, 0.23], color: i % 2 ? 0xe8e2d0 : 0xd2552a });
    P.addMesh(bench.build(), bx, W.heightAt(bx, bz), bz, yaw);
    P.colliders.addBox(bx, bz, 1.0, 0.3, yaw);
    P.interactions.push({ id: 'soak', label: 'Soak', x: hp.x + ux * (r - 1.2), z: hp.z + uz * (r - 1.2), r: 4.8 });
    const sx = hp.x + ux * (r + 2.2) - uz * 2.5;
    const sz = hp.z + uz * (r + 2.2) + ux * 2.5;
    signBoard(P, 'Hot pool', 'Soak at your own risk · No moose · No boiling your catch', sx, sz, yaw);
    P.steam.push({ x: hp.x, y: hp.level, z: hp.z, r: hp.r * 0.7, rate: 11, size: 2.2, a: 0.34 });
  }
  const sp = W.lakeById.springs;
  if (sp) {
    // warm water steams gently all over the pond
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      const r = sp.r * (0.15 + rand() * 0.5);
      P.steam.push({ x: sp.x + Math.cos(a) * r, y: sp.level, z: sp.z + Math.sin(a) * r, r: sp.r * 0.3, rate: 3, size: 2.8, a: 0.24 });
    }
  }
  // fumaroles: stone heaps that hiss steam, and two bubbling mud pots
  const vents = new ModelBuilder();
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = 14 + rand() * 18;
    const x = GEYSER.x + Math.cos(a) * r;
    const z = GEYSER.z + Math.sin(a) * r;
    const w = W.waterAt(x, z);
    if (w) continue;
    const y = W.heightAt(x, z);
    for (let k = 0; k < 5; k++) vents.dodeca(0.3 + rand() * 0.25, { pos: [x - GEYSER.x + (rand() - 0.5) * 1.2, y - gy + 0.1, z - GEYSER.z + (rand() - 0.5) * 1.2], color: k % 2 ? 0xbfae8a : 0x8e8676, jitter: 0.2 });
    P.steam.push({ x, y: y + 0.4, z, r: 0.4, rate: 5, size: 1.1, a: 0.34 });
  }
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 6;
    const x = GEYSER.x + Math.cos(a) * r;
    const z = GEYSER.z + Math.sin(a) * r;
    if (W.waterAt(x, z)) continue;
    const y = W.heightAt(x, z);
    vents.cyl(1.4, 1.55, 0.12, 14, { pos: [x - GEYSER.x, y - gy + 0.02, z - GEYSER.z], color: 0x6e665a });
    vents.cyl(1.1, 1.1, 0.13, 14, { pos: [x - GEYSER.x, y - gy + 0.04, z - GEYSER.z], color: 0x585248 });
    P.mudPots.push({ x, y: y + 0.12, z });
  }
  P.addMesh(vents.build(), GEYSER.x, gy, GEYSER.z, 0);
}

// ----------------------------------------------------------- the flats
function buildMosquito(P, x, z, yaw) {
  const W = P.world;
  const y = W.heightAt(x, z);
  const b = new ModelBuilder();
  // plinth and pole
  b.box(1.8, 0.9, 1.8, { pos: [0, 0.45, 0], color: 0x9a968c });
  b.cyl(0.12, 0.14, 3.2, 8, { pos: [0, 2.5, 0], color: 0x3a3a3a });
  const H = 4.4;
  const D = 0x2a2420;
  const S = 0x8a6a3a;
  // abdomen in brown and black bands, thorax, head
  for (let i = 0; i < 6; i++) b.sphere(0.5 - i * 0.04, 10, 8, { pos: [0, H + 0.12 - i * 0.07, -0.55 - i * 0.42], scale: [1, 0.86, 0.9], color: i % 2 ? D : S });
  b.sphere(0.62, 12, 10, { pos: [0, H + 0.3, 0.35], scale: [1, 0.95, 1.05], color: 0x4a3c30 });
  b.sphere(0.4, 10, 8, { pos: [0, H + 0.42, 1.1], color: 0x3a3028 });
  // big red compound eyes
  for (const sd of [-1, 1]) b.sphere(0.2, 10, 8, { pos: [sd * 0.24, H + 0.55, 1.3], color: 0xa01a10 });
  // the proboscis, long and thirsty
  b.beam([0, H + 0.3, 1.45], [0, H - 1.0, 3.1], 0.05, 5, { r2: 0.015, color: 0x161412 });
  // feathery antennae
  for (const sd of [-1, 1]) b.beam([sd * 0.12, H + 0.65, 1.38], [sd * 0.55, H + 1.5, 2.0], 0.03, 4, { color: 0x221c18 });
  // six long legs, bent at the knee
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z0 = 0.6 - k * 0.45;
      const knee = [sd * (1.3 + k * 0.15), H + 0.9, z0 + (k - 1) * 0.9];
      b.beam([sd * 0.35, H + 0.1, z0], knee, 0.05, 4, { color: D });
      b.beam(knee, [sd * (2.2 + k * 0.2), H - 1.4, z0 + (k - 1) * 1.6], 0.035, 4, { color: D });
    }
  }
  P.addMesh(b.build(), x, y, z, yaw);
  // glassy wings
  if (!P.wingMat) P.wingMat = new THREE.MeshStandardMaterial({ color: 0xc8dce6, transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const wb = new ModelBuilder();
  for (const sd of [-1, 1]) wb.box(2.6, 0.02, 0.85, { pos: [sd * 1.55, H + 0.75, 0.0], rot: [0, sd * 0.35, sd * 0.18], color: 0xffffff });
  P.addMesh(wb.build(), x, y, z, yaw, P.wingMat, { shadow: false });
  P.colliders.addBox(x, z, 0.95, 0.95, yaw);
}

function buildFlats(P, L) {
  const W = P.world;
  const p = W.place('flats');
  const pk = L.parking.flats;
  if (!p || !pk) return;
  const rand = mulberry32(1987);
  const side = pk.side;
  const perp = { x: -side.z, z: side.x };
  // the statue stands across the bay from the parking sign, facing the road
  const mx = pk.x + side.x * 6 + perp.x * 7;
  const mz = pk.z + side.z * 6 + perp.z * 7;
  const myaw = Math.atan2(-side.x, -side.z);
  buildMosquito(P, mx, mz, myaw);
  signBoard(P, "World's Largest Mosquito", "Alaska's unofficial state bird · Please do not feed", mx - side.x * 3.2 + perp.x * 0.5, mz - side.z * 3.2 + perp.z * 0.5, myaw, { bg: '#2e4a2a', fg: '#ffe9a8' });
  // the bug dope machine: a red box on legs
  const vx = mx + perp.x * 3.4;
  const vz = mz + perp.z * 3.4;
  const vy = W.heightAt(vx, vz);
  const vm = new ModelBuilder();
  vm.box(0.9, 1.6, 0.6, { pos: [0, 0.8, 0], color: 0xb02a1e });
  vm.box(0.6, 0.3, 0.05, { pos: [0, 1.25, 0.31], color: 0xf2e4b0 });
  vm.box(0.3, 0.12, 0.05, { pos: [0, 0.55, 0.31], color: 0x222222 });
  P.addMesh(vm.build(), vx, vy, vz, myaw);
  P.colliders.addBox(vx, vz, 0.45, 0.3, myaw);
  P.interactions.push({ id: 'bugdope', label: 'Bug dope', x: vx - side.x * 1.2, z: vz - side.z * 1.2, r: 2.4 });
  // the boardwalk across the muskeg to the dock on the slough
  if (p.dock) {
    const x0 = pk.x + side.x * 3.5;
    const z0 = pk.z + side.z * 3.5;
    const x1 = p.dock.x0;
    const z1 = p.dock.z0;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / 6));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const ax = lerp(x0, x1, t0);
      const az = lerp(z0, z1, t0);
      const bx = lerp(x0, x1, t1);
      const bz = lerp(z0, z1, t1);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      const seg = len / n;
      let top = -Infinity;
      for (let k = 0; k <= 4; k++) top = Math.max(top, W.heightAt(lerp(ax, bx, k / 4), lerp(az, bz, k / 4)));
      top += 0.45;
      const w = new ModelBuilder();
      const planks = Math.floor(seg / 0.3);
      for (let k = 0; k < planks; k++) w.box(1.6, 0.06, seg / planks - 0.03, { pos: [0, -0.03, -seg / 2 + (k + 0.5) * (seg / planks)], color: k % 4 ? WOOD_LIGHT : WOOD, jitter: 0.08 });
      for (const sd of [-1, 1]) for (const zz of [-seg / 2 + 0.3, seg / 2 - 0.3]) w.cyl(0.07, 0.08, 0.9, 5, { pos: [sd * 0.7, -0.45, zz], color: WOOD_DARK });
      P.addMesh(w.build(), cx, top, cz, yaw);
      P.colliders.addDeck(cx, cz, 0.85, seg / 2 + 0.05, yaw, top);
    }
  }
  // dead snags standing grey in the bog
  const snag = new ModelBuilder();
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < 9; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 25 + rand() * 90;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    if (W.waterAt(x, z) || W.roadDistance?.(x, z) < 8) continue;
    const y = W.heightAt(x, z);
    const h = 4 + rand() * 5;
    snag.beam([x - p.x, y - p.y, z - p.z], [x - p.x + (rand() - 0.5) * 0.4, y - p.y + h, z - p.z + (rand() - 0.5) * 0.4], 0.12 + rand() * 0.06, 5, { r2: 0.03, color: 0x8c8880 });
    for (let k = 0; k < 4; k++) {
      const by = y - p.y + h * (0.35 + k * 0.15);
      const ba = rand() * Math.PI * 2;
      snag.beam([x - p.x, by, z - p.z], [x - p.x + Math.cos(ba) * 0.9, by + 0.25, z - p.z + Math.sin(ba) * 0.9], 0.03, 3, { color: 0x7c7870 });
    }
    P.colliders.addCircle(x, z, 0.25);
    placed++;
  }
  if (placed) P.addMesh(snag.build(), p.x, p.y, p.z, 0);
}

// ------------------------------------------------------------ the wreck
// Hull sections, stern to bow: z, half beam at the deck, half width of the
// bottom, keel, chine and deck heights (metres, local to the hull).
const WRECK = [
  [-12, 3.0, 2.2, 0.4, 1.0, 4.2],
  [-8, 3.4, 2.6, 0.05, 0.6, 4.1],
  [-2, 3.5, 2.4, -0.2, 0.5, 4.1],
  [4, 3.3, 1.9, -0.1, 0.7, 4.3],
  [9, 2.6, 1.0, 0.2, 1.3, 4.7],
  [12, 1.5, 0.3, 0.8, 2.2, 5.1],
  [14, 0.1, 0.05, 1.8, 3.0, 5.4],
];

function hull(sections, inner, colorAt) {
  const pos = [];
  const col = [];
  const inset = inner ? 0.12 : 0;
  const pts = sections.map(([z, gw, bw, keel, chine, gun]) => [
    [-(gw - inset), gun, z],
    [-(bw - inset), chine + inset, z],
    [0, keel + inset, z],
    [bw - inset, chine + inset, z],
    [gw - inset, gun, z],
  ]);
  const c = new THREE.Color();
  const push = (p) => {
    pos.push(...p);
    c.set(colorAt(p, inner));
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    for (let k = 0; k < 4; k++) {
      const a = A[k];
      const b = A[k + 1];
      const d = B[k];
      const e = B[k + 1];
      if (inner) [a, d, b, b, d, e].forEach(push);
      else [a, b, d, b, e, d].forEach(push);
    }
  }
  const T = pts[0];
  const tri = (a, b, d) => (inner ? [a, b, d] : [a, d, b]).forEach(push);
  tri(T[0], T[1], T[2]);
  tri(T[0], T[2], T[4]);
  tri(T[2], T[3], T[4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildWreck(P) {
  const W = P.world;
  const p = W.place('wreck');
  if (!p || !p.wreckAt) return;
  const w = p.wreckAt;
  const rand = mulberry32(1987);
  // she rests on the bottom, bow up a little and listing to port
  const bed = Math.min(W.heightAt(w.x, w.z), -0.6);
  const baseY = bed - 0.35;
  const pitch = 0.05;
  const roll = 0.1;
  const b = new ModelBuilder();
  // rust below the old waterline, black topsides, a white band, rust streaks
  b.add(
    hull(WRECK, false, (q) => {
      const y = q[1];
      if (y < 1.6) return 0x5a2418;
      if (y > 3.75 && y < 3.95) return 0xd8d2c4;
      return Math.sin(q[2] * 1.7 + y * 0.6) > 0.82 ? 0x7a3a1c : 0x1e1e20;
    }),
    { keepColors: true, jitter: 0.1 }
  );
  b.add(hull(WRECK, true, () => 0x4a3a30), { keepColors: true });
  // deck planking, bulwark rails, hatch and a hole rusted through the side
  b.box(6.4, 0.12, 21, { pos: [0, 4.05, -0.5], color: 0x6a5a48 });
  for (let i = 0; i < WRECK.length - 1; i++) {
    const [z0, g0, , , , h0] = WRECK[i];
    const [z1, g1, , , , h1] = WRECK[i + 1];
    for (const sd of [-1, 1]) b.beam([sd * g0, h0 + 0.7, z0], [sd * g1, h1 + 0.7, z1], 0.07, 5, { color: 0x6a2a1a });
  }
  b.box(2.6, 0.5, 2.6, { pos: [0, 4.3, 3.2], color: 0x3a3a36 });
  b.box(2.0, 0.1, 2.0, { pos: [0, 4.56, 3.2], color: 0x101010 });
  b.box(0.1, 1.2, 1.8, { pos: [3.32, 2.2, -3], color: 0x0c0c0c });
  // the wheelhouse aft, white gone grey, with dark windows
  b.box(4.6, 2.5, 4.2, { pos: [0, 5.35, -6.2], color: 0xbab4a6 });
  b.box(5.0, 0.18, 4.6, { pos: [0, 6.68, -6.2], color: 0x5a2418 });
  for (let i = 0; i < 4; i++) b.box(0.8, 0.7, 0.06, { pos: [-1.5 + i, 5.9, -4.08], color: 0x1c2428 });
  for (const sd of [-1, 1]) b.box(0.06, 0.7, 2.4, { pos: [sd * 2.32, 5.9, -6.2], color: 0x1c2428 });
  // mast, boom and a tangle of rigging
  b.cyl(0.14, 0.18, 9, 8, { pos: [0, 8.5, 1.5], color: 0x4a3a2e });
  b.beam([0, 6.2, 1.5], [0, 5.4, 7.5], 0.09, 5, { color: 0x4a3a2e });
  for (const sd of [-1, 1]) b.beam([0, 12.8, 1.5], [sd * 3.2, 4.8, -1.0], 0.02, 3, { color: 0x222222 });
  b.beam([0, 12.8, 1.5], [0, 5.3, 12.5], 0.02, 3, { color: 0x222222 });
  // crab pots and a life ring
  for (let i = 0; i < 4; i++) b.box(0.9, 0.5, 0.9, { pos: [-2.2 + (i % 2) * 1.0, 4.36 + Math.floor(i / 2) * 0.5, 6.6 + rand() * 0.4], rot: [0, rand() * 0.6, 0], color: 0x2f5a3a });
  b.torus(0.38, 0.09, 6, 14, { pos: [2.36, 5.4, -5.0], rot: [0, Math.PI / 2, 0], color: 0xe86a1a });
  const f = frame(w.x, w.z, w.yaw);
  // rusty steel: a little metal, mostly rough
  if (!P.rustMat) P.rustMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25 });
  const m = P.addMesh(b.build(), w.x, baseY, w.z, w.yaw, P.rustMat);
  m.rotation.set(-pitch, w.yaw, roll, 'YXZ');
  m.updateMatrix();
  // the name on both bows
  const tex = makeSignTexture('Unsinkable II', 'Homer, Alaska', { bg: '#1e1e20', fg: '#e8e2d0' });
  const nameMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, transparent: false });
  for (const sd of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), nameMat);
    const [px, pz] = f.to(sd * 2.42, 9.6);
    plate.position.set(px, baseY + 4.0 + 9.6 * pitch, pz);
    plate.rotation.set(0, w.yaw + (sd > 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25), 0);
    P.group.add(plate);
  }
  // a walkable deck (bow up), and the hull and wheelhouse keep you aboard
  const deckTop = baseY + 4.12;
  P.colliders.addDeck(w.x, w.z, 3.1, 11.5, w.yaw, deckTop, { slope: pitch, wreck: true });
  const [hx, hz] = f.to(0, -6.2);
  P.colliders.addBox(hx, hz, 2.3, 2.1, w.yaw, deckTop - 1, deckTop + 3);
  P.wreckDeck = { x: w.x, z: w.z, yaw: w.yaw, top: deckTop };
  // the sea chest, wedged in the wheelhouse door
  const [cx, cz] = f.to(1.2, -3.6);
  const chest = new ModelBuilder();
  chest.box(0.9, 0.55, 0.55, { pos: [0, 0.28, 0], color: 0x5a3a1e });
  chest.box(0.94, 0.12, 0.59, { pos: [0, 0.58, 0], color: 0x4a2e16 });
  chest.box(0.96, 0.06, 0.06, { pos: [0, 0.4, 0.28], color: 0xc8a030 });
  chest.box(0.1, 0.14, 0.04, { pos: [0, 0.4, 0.3], color: 0xd8b040 });
  P.addMesh(chest.build(), cx, deckTop - 3.6 * pitch, cz, w.yaw + 0.2);
  P.interactions.push({ id: 'chest', label: 'Open', x: cx, z: cz, r: 2.2, y: deckTop });
  // the gangplank from the beach up to the bow
  const [bx, bz] = f.to(0, 10);
  const by = deckTop + 10 * pitch;
  const sx = p.x;
  const sz = p.z;
  const sy = W.heightAt(sx, sz);
  const len = Math.hypot(bx - sx, bz - sz);
  const gyaw = Math.atan2(bx - sx, bz - sz);
  const gx = (sx + bx) / 2;
  const gz = (sz + bz) / 2;
  const slope = (by - sy) / len;
  const plank = new ModelBuilder();
  const n = Math.floor(len / 0.4);
  for (let i = 0; i < n; i++) plank.box(1.3, 0.07, len / n - 0.05, { pos: [0, -0.03 + (i + 0.5 - n / 2) * (len / n) * slope, -len / 2 + (i + 0.5) * (len / n)], color: i % 3 ? WOOD_LIGHT : WOOD });
  for (const sd of [-1, 1]) plank.beam([sd * 0.7, 0.9 - (len / 2) * slope, -len / 2], [sd * 0.7, 0.9 + (len / 2) * slope, len / 2], 0.04, 4, { color: WOOD_DARK });
  P.addMesh(plank.build(), gx, (sy + by) / 2, gz, gyaw);
  P.colliders.addDeck(gx, gz, 0.75, len / 2, gyaw, (sy + by) / 2, { slope });
  // sea stacks off the cove, white with birds
  const g = W.coastGradient(p.x, p.z);
  for (let i = 0; i < 3; i++) {
    const d = 70 + i * 26 + rand() * 20;
    const a = (i - 1) * 0.45;
    const tx = -g.x * Math.cos(a) + g.z * Math.sin(a);
    const tz = -g.z * Math.cos(a) - g.x * Math.sin(a);
    const x = p.x + tx * d;
    const z = p.z + tz * d;
    const st = new ModelBuilder();
    const h = 9 + rand() * 9;
    let r = 3.6 + rand() * 2;
    for (let y = -4; y < h; y += 2.2) {
      st.dodeca(r, { pos: [(rand() - 0.5) * 0.8, y, (rand() - 0.5) * 0.8], scale: [1, 0.8, 1], color: y > h - 3 ? 0xd8d4c8 : 0x55524c, jitter: 0.18 });
      r *= 0.93;
    }
    st.cone(r * 1.3, 1.6, 8, { pos: [0, h + 0.4, 0], color: 0x5f7a3a });
    P.addMesh(st.build(), x, W.heightAt(x, z), z, rand() * 6);
  }
  signBoard(P, 'Shipwreck Cove', 'The Unsinkable II, 1987 · She sank in four feet of water', sx + g.x * 6 + g.z * 3, sz + g.z * 6 - g.x * 3, Math.atan2(-g.x, -g.z) + Math.PI);
}

export function buildAreas(P, L) {
  buildSprings(P);
  buildFlats(P, L);
  buildWreck(P);
}

// ------------------------------------------------------------- at play
// Steam over the warm water, the geyser's cycle and the mud pots.
export class Areas {
  constructor(game) {
    this.game = game;
    const P = game.props;
    this.steam = P.steam || [];
    this.mud = P.mudPots || [];
    this.geyser = P.geyser || null;
    this.cycle = 'rest';
    this.t = 20 + Math.random() * 30;
    this.acc = 0;
    this.erupting = 0;
    if (this.geyser) this.column = this.buildColumn();
  }

  // The water column: a tall flared tube of white water racing upward,
  // scaled by how hard the geyser is blowing.
  buildColumn() {
    const g = this.game;
    const geo = new THREE.CylinderGeometry(2.6, 0.45, 1, 18, 10, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: g.sharedUniforms.uTime,
        uNoise: { value: g.textures.waterNormal },
        uSun: g.env.uniforms.uSunColor,
        uNight: g.env.uniforms.uNight,
        uPower: { value: 0 },
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          vUv = uv;
          vec3 p = position;
          // the column sways and billows as it climbs
          p.x += sin(uTime * 3.1 + p.y * 0.5) * 0.25 * uv.y;
          p.z += cos(uTime * 2.3 + p.y * 0.4) * 0.25 * uv.y;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec3 uSun;
        uniform float uNight;
        uniform float uPower;
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          float n1 = texture2D(uNoise, vec2(vUv.x * 3.0, vUv.y * 1.2 - uTime * 1.8)).b;
          float n2 = texture2D(uNoise, vec2(vUv.x * 7.0 + 0.4, vUv.y * 2.6 - uTime * 3.1)).b;
          float body = smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.5);
          // solid low down, breaking into spray toward the top
          float top = 1.0 - smoothstep(0.55, 1.0, vUv.y);
          float a = (0.35 + body * 0.65) * mix(0.35, 1.0, top) * smoothstep(0.0, 0.5, vFacing) * uPower;
          a *= 1.0 - smoothstep(0.75, 1.0, vUv.y) * (1.0 - body);
          vec3 col = vec3(0.95, 0.97, 0.98) * (0.72 + 0.35 * clamp(length(uSun), 0.0, 1.5)) * mix(1.0, 0.3, uNight);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(this.geyser.x, this.geyser.y - 0.3, this.geyser.z);
    m.visible = false;
    m.renderOrder = 4;
    m.frustumCulled = false;
    m.name = 'geyser-column';
    g.scene.add(m);
    return m;
  }

  // How close the player is to a place, 1 within r, 0 beyond r2.
  near(id, r, r2) {
    const p = this.game.world.place(id);
    if (!p) return 0;
    const P = this.game.player.pos;
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    return 1 - clamp((d - r) / (r2 - r), 0, 1);
  }

  update(dt) {
    const g = this.game;
    if (!g.effects || !g.started) return;
    const cam = g.camera.position;
    const fx = g.effects.soft;
    // steam: only when someone is there to see it
    for (const s of this.steam) {
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d > 260) continue;
      s.acc = (s.acc || 0) + dt * s.rate;
      while (s.acc > 1) {
        s.acc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * s.r;
        const k = 0.9 + Math.random() * 0.08;
        fx.emit(s.x + Math.cos(a) * r, s.y + 0.2, s.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 3.2 + Math.random() * 2, s.size * 0.5, s.size * 2.4, k, k, k * 1.02, s.a || 0.26, -0.05, 0.4);
      }
    }
    // the mud pots blurp
    for (const m of this.mud) {
      if (Math.hypot(m.x - cam.x, m.z - cam.z) > 120) continue;
      if (Math.random() < dt * 1.6) {
        const a = Math.random() * 6.28;
        const r = Math.random() * 0.8;
        g.effects.ripples.add(m.x + Math.cos(a) * r, m.y, m.z + Math.sin(a) * r, 0.5, 0.8);
        fx.emit(m.x + Math.cos(a) * r, m.y + 0.05, m.z + Math.sin(a) * r, 0, 1.2, 0, 0.4, 0.15, 0.3, 0.42, 0.38, 0.32, 0.8, 6, 0);
        if (Math.random() < 0.3) g.audio?.plop?.(0.15);
      }
    }
    this.updateGeyser(dt);
  }

  // Rest, rumble, blow, sigh: Old Faceful every minute or two.
  updateGeyser(dt) {
    const G = this.geyser;
    if (!G) return;
    const g = this.game;
    const cam = g.camera.position;
    const d = Math.hypot(G.x - cam.x, G.z - cam.z);
    this.t -= dt;
    const fx = g.effects.soft;
    if (this.cycle === 'rest') {
      if (d < 300 && Math.random() < dt * 2) fx.emit(G.x, G.y, G.z, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 2.5, 0.4, 1.6, 0.94, 0.94, 0.96, 0.25, -0.1, 0.3);
      if (this.t <= 0) {
        this.cycle = 'rumble';
        this.t = 3.2;
        if (d < 160) {
          g.audio?.rumble?.(G.x, G.z);
          if (d < 60) g.hud?.toast('The ground rumbles under your boots…');
        }
      }
    } else if (this.cycle === 'rumble') {
      if (d < 200 && Math.random() < dt * 10) g.effects.ripples.add(G.x + (Math.random() - 0.5) * 2, G.y - 1.4, G.z + (Math.random() - 0.5) * 2, 1, 0.7);
      if (d < 40) g.player.shake = Math.max(g.player.shake || 0, 0.15);
      if (this.t <= 0) {
        this.cycle = 'blow';
        this.t = 9;
        if (d < 400) g.audio?.geyser?.(G.x, G.z);
        if (d < 30) {
          g.hud?.toast('Steamed like a dumpling. Maybe stand further back next time', 'bad');
          g.player.hurt?.(4, 0, 0);
        }
        g.photo && (g.photo.moment = { id: 'geyser', x: G.x, y: G.y + 10, z: G.z, until: g.time + 9 });
      }
    } else if (this.cycle === 'blow') {
      this.erupting = clamp(this.t / 9, 0, 1);
      if (this.column) {
        // up fast, holds, then sags back down as the pressure goes
        const age = 9 - this.t;
        const h = (age < 1.2 ? age / 1.2 : 1) * (this.t > 3 ? 1 : this.t / 3);
        this.column.visible = h > 0.02;
        this.column.scale.set(0.7 + 0.3 * h, 2 + 24 * h, 0.7 + 0.3 * h);
        this.column.material.uniforms.uPower.value = Math.min(1, h * 1.4);
      }
      if (d < 600) {
        const n = Math.floor(dt * 90);
        const power = this.t > 6 ? 1 : this.t / 6;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = Math.random() * 1.6;
          const up = (16 + Math.random() * 10) * (0.5 + 0.5 * power);
          fx.emit(G.x + Math.cos(a) * 0.3, G.y, G.z + Math.sin(a) * 0.3, Math.cos(a) * sp, up, Math.sin(a) * sp, 1.8 + Math.random() * 0.8, 0.5, 2.8, 0.96, 0.97, 1, 0.5, 9.8, 0.25);
        }
        // steam rolling off the top of the column
        if (Math.random() < dt * 14) fx.emit(G.x + (Math.random() - 0.5) * 3, G.y + 14 + Math.random() * 8, G.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5, 5, 3, 9, 0.95, 0.95, 0.97, 0.3, -0.1, 0.3);
        if (Math.random() < dt * 6) g.effects.splash(G.x + (Math.random() - 0.5) * 6, G.y - 1.2, G.z + (Math.random() - 0.5) * 6, 0.5);
      }
      if (this.t <= 0) {
        this.cycle = 'rest';
        this.erupting = 0;
        this.t = 70 + Math.random() * 60;
        if (this.column) this.column.visible = false;
      }
    }
  }
}
