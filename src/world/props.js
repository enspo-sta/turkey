// Hand-placed structures: Ruben's cabin, the Trading Post, bridge, docks, the
// halibut pier, Bear Falls platform, lighthouse, lookout, signs and campfires.
// Each registers colliders, walkable decks and interaction points.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { makeSignTexture, makeAlaskaFlagTexture } from '../util/textures.js';
import { mulberry32, clamp, lerp } from '../util/math.js';
import { ROAD_HALF } from './worldgen.js';

const WOOD = 0x6b4a2e;
const WOOD_DARK = 0x4a3220;
const WOOD_LIGHT = 0x8a6a45;
const LOG = 0x7a5534;
const STONE = 0x77726a;
const ROOF_GREEN = 0x2f4a3a;
const ROOF_GREY = 0x4a4e52;
const BARN_RED = 0x8a2f22;
const WHITE = 0xe8e4da;
const STEEL = 0x3e6b5a;
const CONCRETE = 0x9a968c;
const RED = 0xb02a1e;

// Local-to-world helper for a prop origin with a yaw.
function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x,
    z,
    yaw,
    // local (lx, lz) -> world
    to(lx, lz) {
      return [x + lx * c + lz * s, z - lx * s + lz * c];
    },
  };
}

function gable(b, w, h, depth, o) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  b.add(geo, o);
}

export class Props {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.colliders = game.colliders;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 });
    this.metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x2a3036, toneMapped: false });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
    this.interactions = [];
    this.fires = [];
    this.smokePoints = [];
    this.beam = null;
    this.parking = {};
    this.avoid = [];
  }

  // Areas the vegetation scatter should leave clear (call before generate).
  reserveAreas() {
    const W = this.world;
    const out = [];
    for (const p of W.places) out.push({ x: p.x, z: p.z, r: p.kind === 'service' ? 26 : 12 });
    this.layout = this.computeLayout();
    const L = this.layout;
    out.push({ x: L.cabin.x, z: L.cabin.z, r: 12 });
    out.push({ x: L.outhouse.x, z: L.outhouse.z, r: 3 });
    out.push({ x: L.post.x, z: L.post.z, r: 22 });
    for (const b of W.bridges) {
      out.push({ x: b.x0, z: b.z0, r: 10 }, { x: b.x1, z: b.z1, r: 10 }, { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: 12 });
    }
    for (const p of W.places) if (p.dock) out.push({ x: p.dock.x0, z: p.dock.z0, r: 8 });
    out.push({ x: L.falls.x, z: L.falls.z, r: 8 });
    out.push({ x: L.lookout.x, z: L.lookout.z, r: 8 });
    out.push({ x: L.light.x, z: L.light.z, r: 20 });
    for (const pk of Object.values(L.parking)) out.push({ x: pk.x, z: pk.z, r: 7 });
    for (const fr of L.fires) out.push({ x: fr.x, z: fr.z, r: 4 });
    this.avoid = out;
    return out;
  }

  // Nearest point on any road to (x,z): {x, z, tx, tz, elev}
  nearestRoad(x, z) {
    let best = null;
    for (const road of this.world.roads) {
      const n = road.path.nearest(x, z);
      if (!best || n.d < best.d) {
        const p = road.path.sample(n.s);
        const i = Math.min(road.elev.length - 1, Math.round(n.s / (road.path.length / (road.path.count - 1))));
        best = { d: n.d, x: p.x, z: p.z, tx: p.tx, tz: p.tz, elev: road.elev[i], road: road.id, s: n.s };
      }
    }
    return best;
  }

  computeLayout() {
    const W = this.world;
    const L = { parking: {} };
    const landing = W.place('landing');
    const d = { x: -Math.sin(landing.face), z: -Math.cos(landing.face) }; // toward water
    const r = { x: -d.z, z: d.x };
    L.cabin = { x: landing.x - d.x * 17 + r.x * 7, z: landing.z - d.z * 17 + r.z * 7, yaw: Math.atan2(d.x, d.z) };
    L.outhouse = { x: L.cabin.x - d.x * 12 - r.x * 9, z: L.cabin.z - d.z * 12 - r.z * 9, yaw: L.cabin.yaw };
    const post = W.place('post');
    // put the store south-east of the junction, facing it
    const jx = -60;
    const jz = 428;
    L.post = { x: post.x + 16, z: post.z + 24 };
    L.post.yaw = Math.atan2(jx - L.post.x, jz - L.post.z);
    const falls = W.place('falls');
    const fd = { x: -Math.sin(falls.face), z: -Math.cos(falls.face) };
    L.falls = { x: falls.x - fd.x * 7 - fd.z * 9, z: falls.z - fd.z * 7 + fd.x * 9, yaw: Math.atan2(fd.x, fd.z) };
    const tundra = W.place('tundra');
    L.lookout = { x: tundra.x + 6, z: tundra.z - 10, yaw: 0.6 };
    const light = W.place('lighthouse');
    L.light = { x: light.x, z: light.z };
    L.fires = ['landing', 'bend', 'falls', 'glacier'].map((id) => {
      const p = W.place(id);
      const d = { x: -Math.sin(p.face), z: -Math.cos(p.face) };
      return { id, x: p.x - d.x * 5.5 + d.z * 3, z: p.z - d.z * 5.5 - d.x * 3 };
    });
    for (const p of W.places) {
      const n = this.nearestRoad(p.x, p.z);
      if (!n) continue;
      // parking bay beside the road, on the side facing the place
      let sx = p.x - n.x;
      let sz = p.z - n.z;
      const l = Math.hypot(sx, sz) || 1;
      sx /= l;
      sz /= l;
      L.parking[p.id] = {
        x: n.x + sx * (ROAD_HALF + 2.0),
        z: n.z + sz * (ROAD_HALF + 2.0),
        yaw: Math.atan2(n.tx, n.tz),
        roadX: n.x,
        roadZ: n.z,
        side: { x: sx, z: sz },
      };
    }
    return L;
  }

  build() {
    const L = this.layout || this.computeLayout();
    this.buildCabin(L.cabin, L.outhouse);
    this.buildTradingPost(L.post);
    for (const b of this.world.bridges) this.buildBridge(b);
    for (const p of this.world.places) if (p.dock) (p.dock.pier ? this.buildPier(p) : this.buildDock(p));
    this.buildFallsPlatform(L.falls);
    this.buildLighthouse(L.light);
    this.buildLookout(L.lookout);
    this.buildSigns(L);
    this.buildCampfires(L.fires);
    this.buildGlacierProps();
    return this.group;
  }

  addMesh(geo, x, y, z, yaw, mat = this.mat, { shadow = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    this.group.add(m);
    return m;
  }

  groundMax(f, hx, hz) {
    let mx = -Infinity;
    for (let i = -1; i <= 1; i += 0.5) {
      for (let j = -1; j <= 1; j += 0.5) {
        const [x, z] = f.to(i * hx, j * hz);
        mx = Math.max(mx, this.world.heightAt(x, z));
      }
    }
    return mx;
  }

  // ---------------------------------------------------------------- cabin
  buildCabin(c, oh) {
    const f = frame(c.x, c.z, c.yaw);
    const base = this.groundMax(f, 4.5, 4.5) + 0.35;
    const b = new ModelBuilder();
    const W = 7;
    const D = 6;
    const H = 2.8;
    // foundation and floor
    b.box(W + 0.6, 1.8, D + 0.6, { pos: [0, -0.9, 0], color: STONE, jitter: 0.12 });
    b.box(W + 0.4, 0.25, D + 0.4, { pos: [0, 0.12, 0], color: WOOD_DARK });
    // log walls
    const logs = 9;
    for (let i = 0; i < logs; i++) {
      const y = 0.4 + i * 0.3;
      const off = i % 2 ? 0.25 : 0;
      b.cyl(0.17, 0.17, W + 0.7 + off, 7, { pos: [0, y, D / 2], rot: [0, 0, Math.PI / 2], color: LOG, jitter: 0.1 });
      b.cyl(0.17, 0.17, W + 0.7 + off, 7, { pos: [0, y, -D / 2], rot: [0, 0, Math.PI / 2], color: LOG, jitter: 0.1 });
      b.cyl(0.17, 0.17, D + 0.7 - off, 7, { pos: [W / 2, y + 0.15, 0], rot: [Math.PI / 2, 0, 0], color: LOG, jitter: 0.1 });
      b.cyl(0.17, 0.17, D + 0.7 - off, 7, { pos: [-W / 2, y + 0.15, 0], rot: [Math.PI / 2, 0, 0], color: LOG, jitter: 0.1 });
    }
    // gables and roof
    gable(b, W - 0.1, 1.9, 0.3, { pos: [0, H + 0.35, D / 2 - 0.05], color: WOOD_LIGHT });
    gable(b, W - 0.1, 1.9, 0.3, { pos: [0, H + 0.35, -D / 2 + 0.05], color: WOOD_LIGHT });
    const roofAng = Math.atan2(1.9, W / 2);
    const slope = Math.hypot(W / 2, 1.9) + 0.7;
    b.box(slope, 0.16, D + 2.2, { pos: [-W / 4 - 0.15, H + 0.35 + 0.95 + 0.1, 0.5], rot: [0, 0, roofAng], color: ROOF_GREEN });
    b.box(slope, 0.16, D + 2.2, { pos: [W / 4 + 0.15, H + 0.35 + 0.95 + 0.1, 0.5], rot: [0, 0, -roofAng], color: ROOF_GREEN });
    b.box(0.3, 0.2, D + 2.2, { pos: [0, H + 0.35 + 1.95, 0.5], color: 0x22382b });
    // chimney
    b.box(0.9, 5.2, 0.9, { pos: [W / 2 - 1.1, 2.6, -D / 2 + 1.2], color: STONE, jitter: 0.15 });
    b.box(1.05, 0.25, 1.05, { pos: [W / 2 - 1.1, 5.25, -D / 2 + 1.2], color: 0x5a5650 });
    // porch
    b.box(W + 0.4, 0.2, 2.3, { pos: [0, 0.25, D / 2 + 1.35], color: WOOD });
    for (const px of [-W / 2, -W / 6, W / 6, W / 2]) b.cyl(0.09, 0.1, 2.5, 6, { pos: [px, 1.5, D / 2 + 2.3], color: LOG });
    b.box(W + 0.6, 0.12, 0.25, { pos: [0, 2.72, D / 2 + 2.3], color: LOG });
    b.box(W + 0.4, 0.08, 0.08, { pos: [0, 1.0, D / 2 + 2.3], color: LOG });
    // door and frame
    b.box(1.1, 2.05, 0.08, { pos: [0.8, 1.35, D / 2 + 0.2], color: 0x7a2b1c });
    b.box(1.3, 0.14, 0.12, { pos: [0.8, 2.42, D / 2 + 0.2], color: WOOD_DARK });
    b.sphere(0.05, 6, 4, { pos: [1.2, 1.3, D / 2 + 0.27], color: 0xd9b23a });
    // window frames
    for (const wx of [-1.9]) {
      b.box(1.2, 1.0, 0.1, { pos: [wx, 1.55, D / 2 + 0.2], color: WOOD_DARK });
      b.box(0.9, 0.12, 0.3, { pos: [wx, 1.0, D / 2 + 0.3], color: WOOD_DARK });
    }
    b.box(0.1, 1.0, 1.2, { pos: [W / 2 + 0.2, 1.55, 0.3], color: WOOD_DARK });
    // moose antlers over the door
    for (const s of [-1, 1]) {
      b.beam([0.8, 2.75, D / 2 + 0.35], [0.8 + s * 0.35, 2.95, D / 2 + 0.4], 0.04, 5, { color: 0xd8ccb0 });
      b.box(0.55, 0.06, 0.35, { pos: [0.8 + s * 0.6, 3.1, D / 2 + 0.42], rot: [0.3, 0, s * 0.5], color: 0xd8ccb0 });
    }
    // bench and firewood
    b.box(1.8, 0.08, 0.45, { pos: [-2, 0.75, D / 2 + 0.7], color: WOOD_LIGHT });
    b.box(0.08, 0.4, 0.4, { pos: [-2.8, 0.55, D / 2 + 0.7], color: WOOD_DARK });
    b.box(0.08, 0.4, 0.4, { pos: [-1.2, 0.55, D / 2 + 0.7], color: WOOD_DARK });
    const rand = mulberry32(8);
    for (let i = 0; i < 18; i++) {
      const row = Math.floor(i / 6);
      b.cyl(0.13, 0.13, 0.8, 6, {
        pos: [-W / 2 - 0.8, 0.35 + row * 0.25, -2 + (i % 6) * 0.27 + (row % 2) * 0.12],
        rot: [0, 0, Math.PI / 2 + (rand() - 0.5) * 0.2],
        color: 0x9a7650,
      });
    }
    // canoe on sawhorses beside the cabin
    b.box(0.5, 0.7, 0.08, { pos: [W / 2 + 2.2, 0.35, -1.5], color: WOOD_DARK });
    b.box(0.5, 0.7, 0.08, { pos: [W / 2 + 2.2, 0.35, 1.5], color: WOOD_DARK });
    b.sphere(1, 10, 6, { pos: [W / 2 + 2.2, 0.85, 0], scale: [0.42, 0.28, 2.4], color: 0xc0331f });
    const geo = b.build();
    this.addMesh(geo, c.x, base, c.z, c.yaw);
    // glowing windows (night)
    const wg = new ModelBuilder();
    wg.box(0.95, 0.75, 0.06, { pos: [-1.9, 1.55, D / 2 + 0.26], color: 0xffffff, jitter: 0 });
    wg.box(0.06, 0.75, 0.95, { pos: [W / 2 + 0.26, 1.55, 0.3], color: 0xffffff, jitter: 0 });
    this.addMesh(wg.build(), c.x, base, c.z, c.yaw, this.glowMat, { shadow: false });
    this.colliders.addBox(c.x, c.z, W / 2 + 0.4, D / 2 + 0.4, c.yaw);
    const [px, pz] = f.to(0, D / 2 + 1.4);
    this.colliders.addDeck(px, pz, W / 2 + 0.2, 1.15, c.yaw, base + 0.35);
    const [ix, iz] = f.to(0.8, D / 2 + 1.6);
    this.interactions.push({ id: 'cabin', label: 'Sleep', x: ix, z: iz, r: 2.6 });
    const [cx, cz] = f.to(W / 2 - 1.1, -D / 2 + 1.2);
    this.smokePoints.push(new THREE.Vector3(cx, base + 5.5, cz));
    this.cabinBase = base;

    // outhouse with a crescent moon
    const of = frame(oh.x, oh.z, oh.yaw);
    const ob = this.groundMax(of, 1, 1);
    const o = new ModelBuilder();
    o.box(1.3, 2.2, 1.3, { pos: [0, 1.1, 0], color: WOOD });
    o.box(1.6, 0.12, 1.7, { pos: [0, 2.3, 0.1], rot: [0.15, 0, 0], color: ROOF_GREY });
    o.box(0.8, 1.8, 0.05, { pos: [0, 0.95, 0.67], color: WOOD_LIGHT });
    o.torus(0.09, 0.025, 4, 8, { pos: [0, 1.6, 0.7], arc: Math.PI, rot: [0, 0, -Math.PI / 2], color: 0x1a120a });
    this.addMesh(o.build(), oh.x, ob, oh.z, oh.yaw);
    this.colliders.addBox(oh.x, oh.z, 0.7, 0.7, oh.yaw);

    // mailbox at the road
    const road = this.nearestRoad(c.x, c.z);
    if (road) {
      const side = { x: c.x - road.x, z: c.z - road.z };
      const l = Math.hypot(side.x, side.z) || 1;
      const mx = road.x + (side.x / l) * (ROAD_HALF + 1.4);
      const mz = road.z + (side.z / l) * (ROAD_HALF + 1.4);
      const m = new ModelBuilder({ uvs: true });
      m.box(0.1, 1.1, 0.1, { pos: [0, 0.55, 0], color: WOOD_DARK });
      m.box(0.45, 0.4, 0.6, { pos: [0, 1.2, 0], color: 0x2a4a8a });
      m.box(0.04, 0.25, 0.05, { pos: [0.25, 1.35, 0.2], color: RED });
      const yaw = Math.atan2(road.x - mx, road.z - mz);
      this.addMesh(m.build(), mx, this.world.heightAt(mx, mz), mz, yaw);
      this.addSign('RUBEN', '', mx, this.world.heightAt(mx, mz) + 1.2, mz, yaw + Math.PI / 2, 0.5, 0.18);
    }
  }

  // ---------------------------------------------------------- trading post
  buildTradingPost(c) {
    const f = frame(c.x, c.z, c.yaw);
    const base = this.groundMax(f, 8, 7) + 0.4;
    const b = new ModelBuilder();
    const W = 13;
    const D = 9;
    b.box(W + 0.6, 2.2, D + 0.6, { pos: [0, -1.1, 0], color: STONE });
    b.box(W, 4.4, D, { pos: [0, 2.2, 0], color: BARN_RED, jitter: 0.04 });
    // vertical boards
    for (let i = -6; i <= 6; i++) b.box(0.06, 4.4, 0.05, { pos: [i, 2.2, D / 2 + 0.02], color: 0x6a2418 });
    // false front
    b.box(W + 0.4, 2.6, 0.3, { pos: [0, 5.6, D / 2], color: BARN_RED });
    b.box(W + 0.8, 0.25, 0.5, { pos: [0, 6.95, D / 2], color: WOOD_DARK });
    // roof
    const roofAng = Math.atan2(2.2, W / 2);
    const slope = Math.hypot(W / 2, 2.2) + 0.6;
    b.box(slope, 0.18, D + 0.8, { pos: [-W / 4, 4.4 + 1.1 + 0.1, 0], rot: [0, 0, roofAng], color: ROOF_GREY });
    b.box(slope, 0.18, D + 0.8, { pos: [W / 4, 4.4 + 1.1 + 0.1, 0], rot: [0, 0, -roofAng], color: ROOF_GREY });
    gable(b, W, 2.2, 0.2, { pos: [0, 4.4, -D / 2], color: BARN_RED });
    // porch
    b.box(W + 1, 0.22, 3, { pos: [0, 0.2, D / 2 + 1.5], color: WOOD });
    for (let i = 0; i < 6; i++) {
      const px = -W / 2 + (i * W) / 5;
      b.cyl(0.11, 0.12, 3.4, 6, { pos: [px, 1.9, D / 2 + 2.85], color: WOOD_LIGHT });
    }
    b.box(W + 1.2, 0.14, 3.4, { pos: [0, 3.65, D / 2 + 1.55], rot: [0.12, 0, 0], color: ROOF_GREY });
    b.box(W + 1, 0.08, 0.08, { pos: [0, 1.1, D / 2 + 2.85], color: WOOD_LIGHT });
    // doors & windows
    b.box(2.0, 2.5, 0.1, { pos: [0, 1.5, D / 2 + 0.06], color: 0x3a2416 });
    b.box(0.06, 2.5, 0.12, { pos: [0, 1.5, D / 2 + 0.1], color: WOOD_LIGHT });
    for (const wx of [-4.2, 4.2]) {
      b.box(2.2, 1.6, 0.12, { pos: [wx, 2.0, D / 2 + 0.08], color: WOOD_LIGHT });
    }
    // barrels, crates, tires
    const rand = mulberry32(21);
    for (let i = 0; i < 4; i++) b.cyl(0.38, 0.38, 1.0, 10, { pos: [-W / 2 + 0.6 + i * 0.85, 0.8, D / 2 + 2.2], color: 0x5a3a20 });
    for (let i = 0; i < 5; i++) {
      const s = 0.6 + rand() * 0.3;
      b.box(s, s, s, { pos: [W / 2 - 0.8 - (i % 3) * 0.9, 0.3 + s / 2 + Math.floor(i / 3) * 0.7, D / 2 + 2.1], rot: [0, rand(), 0], color: 0x9a7a50 });
    }
    for (let i = 0; i < 4; i++) b.torus(0.42, 0.16, 6, 12, { pos: [W / 2 + 1.4, 0.18 + i * 0.3, -2], rot: [Math.PI / 2, 0, 0], color: 0x1c1c1c });
    // ice chest
    b.box(1.6, 1.3, 0.8, { pos: [-W / 2 - 1.2, 0.65, 2.5], color: WHITE });
    b.box(1.64, 0.3, 0.84, { pos: [-W / 2 - 1.2, 1.1, 2.5], color: 0x2a6aa8 });
    this.addMesh(b.build(), c.x, base, c.z, c.yaw);
    // window glow
    const wg = new ModelBuilder();
    for (const wx of [-4.2, 4.2]) wg.box(1.9, 1.3, 0.05, { pos: [wx, 2.0, D / 2 + 0.16], color: 0xffffff, jitter: 0 });
    this.addMesh(wg.build(), c.x, base, c.z, c.yaw, this.glowMat, { shadow: false });
    // big sign on the false front
    const [sx, sz] = f.to(0, D / 2 + 0.2);
    this.addSign('Kenai Trading Post', 'FISH  ·  FUEL  ·  AMMO  ·  TACKLE', sx, base + 5.6, sz, c.yaw, 11, 2.2);
    const [ix2, iz2] = f.to(-W / 2 - 0.7, 2.5);
    this.addSign('ICE', '', ix2, base + 1.1, iz2 + 0, c.yaw, 1.2, 0.35);
    this.colliders.addBox(c.x, c.z, W / 2 + 0.3, D / 2 + 0.3, c.yaw);
    const [px, pz] = f.to(0, D / 2 + 1.5);
    this.colliders.addDeck(px, pz, W / 2 + 0.5, 1.5, c.yaw, base + 0.31);
    const [dx, dz] = f.to(0, D / 2 + 1.6);
    this.interactions.push({ id: 'post', label: 'Trade', x: dx, z: dz, r: 3.4 });
    this.postBase = base;

    // retro gas pump and flagpole out front
    const [gx, gz] = f.to(-W / 2 + 1, D / 2 + 6.5);
    const gy = this.world.heightAt(gx, gz);
    const g = new ModelBuilder();
    g.box(1.6, 0.2, 1.0, { pos: [0, 0.1, 0], color: CONCRETE });
    g.box(0.65, 1.7, 0.5, { pos: [0, 1.05, 0], color: 0xc4261c });
    g.box(0.5, 0.45, 0.06, { pos: [0, 1.35, 0.26], color: WHITE });
    g.sphere(0.28, 10, 8, { pos: [0, 2.15, 0], color: WHITE, smooth: true });
    g.beam([0.33, 1.2, 0], [0.55, 0.6, 0.1], 0.03, 5, { color: 0x111111 });
    this.addMesh(g.build(), gx, gy, gz, c.yaw);
    this.colliders.addBox(gx, gz, 0.6, 0.5, c.yaw);
    const [fx, fz] = f.to(W / 2 + 1.5, D / 2 + 5);
    const fy = this.world.heightAt(fx, fz);
    const pole = new ModelBuilder();
    pole.cyl(0.05, 0.08, 9, 6, { pos: [0, 4.5, 0], color: 0xd0d0d0 });
    pole.sphere(0.12, 6, 4, { pos: [0, 9.05, 0], color: 0xd9b23a });
    this.addMesh(pole.build(), fx, fy, fz, 0, this.metalMat);
    this.colliders.addCircle(fx, fz, 0.15);
    const flagGeo = new THREE.PlaneGeometry(2.2, 1.4, 12, 4);
    flagGeo.translate(1.1, 0, 0);
    const flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshStandardMaterial({ map: makeAlaskaFlagTexture(), side: THREE.DoubleSide, roughness: 0.9 })
    );
    flag.position.set(fx, fy + 8.2, fz);
    flag.castShadow = true;
    this.group.add(flag);
    this.flag = flag;
    this.flagBase = flagGeo.attributes.position.array.slice();
  }

  // ------------------------------------------------------------ bridge
  buildBridge(br) {
    const dx = br.x1 - br.x0;
    const dz = br.z1 - br.z0;
    const len = Math.hypot(dx, dz) + 8;
    const yaw = Math.atan2(dx, dz); // local +z along the span
    const cx = (br.x0 + br.x1) / 2;
    const cz = (br.z0 + br.z1) / 2;
    const deck = br.deck;
    const b = new ModelBuilder();
    const hw = 4.6;
    b.box(hw * 2 + 0.4, 0.5, len, { pos: [0, -0.3, 0], color: 0x55524c });
    const panels = Math.max(4, Math.round(len / 6));
    const pl = len / panels;
    for (const side of [-1, 1]) {
      const x = side * (hw + 0.1);
      b.box(0.35, 0.45, len, { pos: [x, 0.25, 0], color: STEEL });
      b.box(0.35, 0.4, len - pl * 2 + 0.3, { pos: [x, 5.6, 0], color: STEEL });
      for (let i = 0; i <= panels; i++) {
        const z = -len / 2 + i * pl;
        const inner = i > 0 && i < panels;
        if (inner) b.box(0.25, 5.4, 0.25, { pos: [x, 2.9, z], color: STEEL });
      }
      for (let i = 0; i < panels; i++) {
        const z0 = -len / 2 + i * pl;
        const z1 = z0 + pl;
        if (i === 0) b.strut([x, 0.3, z0], [x, 5.6, z1], 0.28, 0.28, { color: STEEL });
        else if (i === panels - 1) b.strut([x, 5.6, z0], [x, 0.3, z1], 0.28, 0.28, { color: STEEL });
        else if (i < panels / 2) b.strut([x, 5.6, z0], [x, 0.3, z1], 0.2, 0.2, { color: STEEL });
        else b.strut([x, 0.3, z0], [x, 5.6, z1], 0.2, 0.2, { color: STEEL });
      }
      // guard rail
      b.box(0.12, 0.12, len, { pos: [side * (hw - 0.25), 0.95, 0], color: 0xb0b0a8 });
    }
    for (let i = 1; i < panels; i++) {
      const z = -len / 2 + i * pl;
      b.box(hw * 2 + 0.3, 0.3, 0.3, { pos: [0, 5.65, z], color: STEEL });
    }
    // abutments
    for (const s of [-1, 1]) b.box(hw * 2 + 2, 5, 3, { pos: [0, -2.9, s * (len / 2 - 0.5)], color: CONCRETE, jitter: 0.08 });
    const riverBed = this.world.heightAt(cx, cz);
    const pierH = deck - riverBed + 2;
    b.box(2.2, pierH, 2.2, { pos: [0, -pierH / 2, 0], color: CONCRETE });
    this.addMesh(b.build(), cx, deck, cz, yaw);
    // colliders: truss walls and walkable deck
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const side of [-1, 1]) {
      const ox = side * (hw + 0.1);
      this.colliders.addBox(cx + ox * c, cz - ox * s, 0.25, len / 2, yaw, deck - 1, deck + 6);
    }
    this.colliders.addDeck(cx, cz, hw, len / 2 + 0.5, yaw, deck + 0.08, { bridge: true });
  }

  // ------------------------------------------------------------ docks
  buildDock(p) {
    const d = p.dock;
    const dx = d.x1 - d.x0;
    const dz = d.z1 - d.z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const cx = (d.x0 + d.x1) / 2;
    const cz = (d.z0 + d.z1) / 2;
    const b = new ModelBuilder();
    const n = Math.floor(len / 0.32);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      b.box(d.width, 0.08, len / n - 0.04, { pos: [0, -0.04, z], color: i % 3 ? WOOD_LIGHT : WOOD, jitter: 0.08 });
    }
    for (const side of [-1, 1]) b.box(0.15, 0.2, len, { pos: [side * (d.width / 2 - 0.08), -0.18, 0], color: WOOD_DARK });
    const f = frame(cx, cz, yaw);
    for (let i = 0; i <= Math.floor(len / 3); i++) {
      const z = -len / 2 + i * 3;
      for (const side of [-1, 1]) {
        const [wx, wz] = f.to(side * (d.width / 2 - 0.1), z);
        const g = this.world.heightAt(wx, wz);
        const h = d.top - g + 0.6;
        b.cyl(0.11, 0.12, h, 6, { pos: [side * (d.width / 2 - 0.1), -h / 2 + 0.3, z], color: WOOD_DARK });
      }
    }
    // a bench and a rod holder at the end
    b.box(1.5, 0.08, 0.4, { pos: [0, 0.45, len / 2 - 1.5], color: WOOD });
    b.box(0.08, 0.45, 0.35, { pos: [-0.6, 0.22, len / 2 - 1.5], color: WOOD_DARK });
    b.box(0.08, 0.45, 0.35, { pos: [0.6, 0.22, len / 2 - 1.5], color: WOOD_DARK });
    this.addMesh(b.build(), cx, d.top, cz, yaw);
    this.colliders.addDeck(cx, cz, d.width / 2, len / 2, yaw, d.top);
    // small rowboat tied alongside
    const [bx, bz] = f.to(d.width / 2 + 1.2, len / 2 - 5);
    const lvl = this.world.lakeById[p.water] ? this.world.lakeById[p.water].level : 0;
    this.buildRowboat(bx, lvl - 0.2, bz, yaw);
  }

  buildRowboat(x, y, z, yaw) {
    const b = new ModelBuilder();
    b.sphere(1, 10, 6, { pos: [0, 0.2, 0], scale: [0.75, 0.42, 2.0], color: 0x2c5a7a });
    b.box(1.2, 0.06, 0.3, { pos: [0, 0.45, 0.3], color: WOOD_LIGHT });
    b.box(1.2, 0.06, 0.3, { pos: [0, 0.45, -0.8], color: WOOD_LIGHT });
    b.beam([0.5, 0.5, 0], [1.5, 0.25, -1.2], 0.03, 4, { color: WOOD_LIGHT });
    const m = this.addMesh(b.build(), x, y, z, yaw);
    m.userData.bob = { y, phase: x * 0.1 };
    this.bobbers = this.bobbers || [];
    this.bobbers.push(m);
  }

  buildPier(p) {
    const d = p.dock;
    const dx = d.x1 - d.x0;
    const dz = d.z1 - d.z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const cx = (d.x0 + d.x1) / 2;
    const cz = (d.z0 + d.z1) / 2;
    const f = frame(cx, cz, yaw);
    const b = new ModelBuilder();
    const n = Math.floor(len / 0.34);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      b.box(d.width, 0.1, len / n - 0.04, { pos: [0, -0.05, z], color: i % 4 ? 0x8a7458 : 0x6a5842, jitter: 0.08 });
    }
    const posts = Math.floor(len / 4);
    for (let i = 0; i <= posts; i++) {
      const z = -len / 2 + i * 4;
      for (const side of [-1, 1]) {
        const lx = side * (d.width / 2 + 0.1);
        const [wx, wz] = f.to(lx, z);
        const g = Math.min(this.world.heightAt(wx, wz), 0);
        const h = d.top - g + 0.2;
        b.cyl(0.2, 0.22, h, 7, { pos: [lx, -h / 2 + 0.1, z], color: 0x3d3226 });
        b.cyl(0.09, 0.09, 1.1, 6, { pos: [lx, 0.55, z], color: WOOD_DARK });
      }
    }
    for (const side of [-1, 1]) {
      b.box(0.1, 0.1, len, { pos: [side * (d.width / 2 + 0.1), 1.05, 0], color: WOOD_LIGHT });
      b.box(0.08, 0.08, len, { pos: [side * (d.width / 2 + 0.1), 0.55, 0], color: WOOD_LIGHT });
    }
    // bait shack at the end
    const ez = len / 2 - 3;
    b.box(3.2, 2.5, 2.6, { pos: [-d.width / 2 + 1.4, 1.25, ez - 4], color: 0x3f6a8a });
    b.box(3.6, 0.15, 3.2, { pos: [-d.width / 2 + 1.4, 2.6, ez - 4], rot: [0.12, 0, 0], color: ROOF_GREY });
    // fish cleaning table
    b.box(1.8, 0.1, 0.8, { pos: [d.width / 2 - 0.8, 0.95, ez - 8], color: WHITE });
    b.box(0.1, 0.9, 0.7, { pos: [d.width / 2 - 1.5, 0.45, ez - 8], color: WOOD_DARK });
    b.box(0.1, 0.9, 0.7, { pos: [d.width / 2 - 0.1, 0.45, ez - 8], color: WOOD_DARK });
    // crab pots
    for (let i = 0; i < 3; i++) b.box(0.9, 0.5, 0.9, { pos: [d.width / 2 - 0.7, 0.25 + i * 0.5, -len / 2 + 6], rot: [0, i * 0.3, 0], color: 0x2f5a3a });
    // lamp posts
    for (let i = 1; i < 4; i++) {
      const z = -len / 2 + (i * len) / 4;
      b.cyl(0.07, 0.09, 3.6, 6, { pos: [d.width / 2 + 0.1, 1.8, z], color: 0x222222 });
      b.box(0.5, 0.08, 0.08, { pos: [d.width / 2 - 0.1, 3.6, z], color: 0x222222 });
    }
    this.addMesh(b.build(), cx, d.top, cz, yaw);
    const lamps = new ModelBuilder();
    for (let i = 1; i < 4; i++) {
      const z = -len / 2 + (i * len) / 4;
      lamps.sphere(0.18, 8, 6, { pos: [d.width / 2 - 0.3, 3.45, z], color: 0xffffff, jitter: 0 });
    }
    this.addMesh(lamps.build(), cx, d.top, cz, yaw, this.lampMat, { shadow: false });
    this.colliders.addDeck(cx, cz, d.width / 2 + 0.1, len / 2, yaw, d.top);
    for (const side of [-1, 1]) {
      const [wx, wz] = f.to(side * (d.width / 2 + 0.35), 0);
      this.colliders.addBox(wx, wz, 0.2, len / 2 - 1.5, yaw, d.top - 1, d.top + 2);
    }
    const [shx, shz] = f.to(-d.width / 2 + 1.4, ez - 4);
    this.colliders.addBox(shx, shz, 1.7, 1.4, yaw, d.top - 1, d.top + 3);
    const [tx, tz] = f.to(d.width / 2 - 0.8, ez - 8);
    this.colliders.addBox(tx, tz, 0.95, 0.45, yaw, d.top - 1, d.top + 1.5);
    const [sx, sz] = f.to(-d.width / 2 + 1.4, ez - 2.65);
    this.addSign('Bait & Tackle', '', sx, d.top + 2.1, sz, yaw, 2.6, 0.55);
    // fishing skiff moored alongside
    const [bx, bz] = f.to(d.width / 2 + 3.2, -len / 2 + 30);
    const boat = new ModelBuilder();
    boat.sphere(1, 12, 6, { pos: [0, 0.45, 0], scale: [1.5, 0.75, 4.2], color: WHITE });
    boat.box(2.4, 0.2, 5.6, { pos: [0, 0.95, -0.3], color: 0x2a4a6a });
    boat.box(1.6, 1.4, 1.8, { pos: [0, 1.7, 0.6], color: WHITE });
    boat.box(1.7, 0.1, 1.9, { pos: [0, 2.45, 0.6], color: 0x2a4a6a });
    boat.box(1.5, 0.6, 0.05, { pos: [0, 1.95, 1.52], color: 0x223344 });
    boat.cyl(0.04, 0.04, 2.2, 5, { pos: [0, 3.5, 0.2], color: 0x222222 });
    const bm = this.addMesh(boat.build(), bx, -0.2, bz, yaw);
    bm.userData.bob = { y: -0.2, phase: 1.3 };
    this.bobbers = this.bobbers || [];
    this.bobbers.push(bm);
    this.colliders.addCircle(bx, bz, 1.6);
  }

  // ---------------------------------------------------- Bear Falls platform
  buildFallsPlatform(c) {
    const f = frame(c.x, c.z, c.yaw);
    const g = this.groundMax(f, 3.2, 2.2);
    const top = g + 2.4;
    const b = new ModelBuilder();
    b.box(6.4, 0.18, 4.4, { pos: [0, -0.09, 0], color: WOOD });
    for (const [x, z] of [
      [-3, -2],
      [3, -2],
      [-3, 2],
      [3, 2],
    ]) {
      const [wx, wz] = f.to(x, z);
      const h = top - this.world.heightAt(wx, wz) + 0.3;
      b.cyl(0.14, 0.16, h, 6, { pos: [x, -h / 2, z], color: WOOD_DARK });
      b.cyl(0.07, 0.07, 1.1, 5, { pos: [x, 0.55, z], color: WOOD_DARK });
    }
    b.box(6.4, 0.09, 0.09, { pos: [0, 1.05, 2.15], color: WOOD_LIGHT });
    b.box(0.09, 0.09, 4.4, { pos: [3.15, 1.05, 0], color: WOOD_LIGHT });
    b.box(0.09, 0.09, 4.4, { pos: [-3.15, 1.05, 0], color: WOOD_LIGHT });
    // ramp down the back
    const rampLen = 6.4;
    const rampDrop = top - this.world.heightAt(...f.to(0, -2.2 - rampLen));
    const ang = Math.atan2(rampDrop, rampLen);
    b.box(1.5, 0.14, Math.hypot(rampLen, rampDrop), { pos: [0, -rampDrop / 2, -2.2 - rampLen / 2], rot: [-ang, 0, 0], color: WOOD });
    this.addMesh(b.build(), c.x, top, c.z, c.yaw);
    this.colliders.addDeck(c.x, c.z, 3.2, 2.2, c.yaw, top);
    const [rx, rz] = f.to(0, -2.2 - rampLen / 2);
    // sloped deck: height rises toward the platform (+z local)
    this.colliders.addDeck(rx, rz, 0.8, rampLen / 2, c.yaw, top - rampDrop / 2, { slope: rampDrop / rampLen });
    for (const side of [-1, 1]) {
      const [wx, wz] = f.to(side * 3.25, 0);
      this.colliders.addBox(wx, wz, 0.1, 2.2, c.yaw, top - 0.5, top + 1.2);
    }
    const [wx, wz] = f.to(0, 2.25);
    this.colliders.addBox(wx, wz, 3.2, 0.1, c.yaw, top - 0.5, top + 1.2);
    this.fallsPlatform = { x: c.x, z: c.z, top };
  }

  // ---------------------------------------------------------- lighthouse
  buildLighthouse(c) {
    const W = this.world;
    // find the highest dry point nearby on the headland
    let best = { x: c.x, z: c.z, h: W.heightAt(c.x, c.z) };
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      for (const r of [6, 14, 22]) {
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        const h = W.heightAt(x, z);
        if (h > best.h && W.coastAt(x, z) > 8) best = { x, z, h };
      }
    }
    const g = best.h;
    const b = new ModelBuilder();
    b.cyl(3.2, 3.4, 1.2, 12, { pos: [0, 0.2, 0], color: CONCRETE });
    b.cyl(1.7, 2.4, 14, 14, { pos: [0, 7.8, 0], color: WHITE, jitter: 0.02 });
    b.cyl(1.78, 1.9, 2.2, 14, { pos: [0, 10.2, 0], color: RED, jitter: 0.02 });
    b.cyl(2.3, 2.3, 0.25, 14, { pos: [0, 14.9, 0], color: 0x2a2a2a });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.cyl(0.04, 0.04, 1.0, 4, { pos: [Math.cos(a) * 2.2, 15.5, Math.sin(a) * 2.2], color: 0x2a2a2a });
    }
    b.torus(2.2, 0.05, 4, 20, { pos: [0, 16.0, 0], rot: [Math.PI / 2, 0, 0], color: 0x2a2a2a });
    b.cyl(1.5, 1.5, 0.2, 12, { pos: [0, 17.8, 0], color: 0x2a2a2a });
    b.cone(1.7, 1.5, 12, { pos: [0, 18.6, 0], color: RED });
    b.sphere(0.2, 6, 4, { pos: [0, 19.45, 0], color: 0x2a2a2a });
    // keeper's house
    b.box(6, 3, 5, { pos: [7, 1.5, 1], color: WHITE });
    b.box(6.6, 0.2, 3.4, { pos: [7, 3.6, 2.4], rot: [0.55, 0, 0], color: RED });
    b.box(6.6, 0.2, 3.4, { pos: [7, 3.6, -0.4], rot: [-0.55, 0, 0], color: RED });
    b.box(1, 2, 0.1, { pos: [7, 1, 3.55], color: 0x2a4a6a });
    this.addMesh(b.build(), best.x, g, best.z, 0.4);
    const lantern = new ModelBuilder();
    lantern.cyl(1.4, 1.4, 1.8, 12, { pos: [0, 16.8, 0], color: 0xffffff, jitter: 0 });
    this.lantern = this.addMesh(lantern.build(), best.x, g, best.z, 0.4, new THREE.MeshBasicMaterial({ color: 0x556070, toneMapped: false }), { shadow: false });
    this.colliders.addCircle(best.x, best.z, 3.0);
    const hx = best.x + 7 * Math.cos(0.4) + 1 * Math.sin(0.4);
    const hz = best.z - 7 * Math.sin(0.4) + 1 * Math.cos(0.4);
    this.colliders.addBox(hx, hz, 3.1, 2.6, 0.4);
    // rotating beam, visible at night
    const beamGeo = new THREE.ConeGeometry(9, 180, 16, 1, true);
    beamGeo.translate(0, -90, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(best.x, g + 16.8, best.z);
    this.group.add(beam);
    this.beam = beam;
    this.lighthousePos = new THREE.Vector3(best.x, g, best.z);
  }

  // ------------------------------------------------------ tundra lookout
  buildLookout(c) {
    const f = frame(c.x, c.z, c.yaw);
    const g = this.groundMax(f, 2.5, 2.5);
    const top = g + 4.2;
    const b = new ModelBuilder();
    b.box(4.4, 0.2, 4.4, { pos: [0, -0.1, 0], color: WOOD });
    for (const [x, z] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ]) {
      const [wx, wz] = f.to(x, z);
      const h = top - this.world.heightAt(wx, wz) + 0.2;
      b.cyl(0.13, 0.16, h, 6, { pos: [x, -h / 2, z], color: WOOD_DARK });
      b.cyl(0.07, 0.07, 1.8, 5, { pos: [x, 0.9, z], color: WOOD_DARK });
    }
    for (const [x, z, w, d] of [
      [0, 2.1, 4.2, 0.08],
      [2.1, 0, 0.08, 4.2],
      [-2.1, 0, 0.08, 4.2],
    ]) b.box(w, 0.08, d, { pos: [x, 1.05, z], color: WOOD_LIGHT });
    b.box(4.8, 0.12, 4.8, { pos: [0, 1.85, 0], color: ROOF_GREY });
    const rampLen = 9;
    const rampDrop = top - this.world.heightAt(...f.to(0, -2.2 - rampLen));
    const ang = Math.atan2(rampDrop, rampLen);
    b.box(1.4, 0.14, Math.hypot(rampLen, rampDrop), { pos: [0, -rampDrop / 2, -2.2 - rampLen / 2], rot: [-ang, 0, 0], color: WOOD });
    this.addMesh(b.build(), c.x, top, c.z, c.yaw);
    this.colliders.addDeck(c.x, c.z, 2.2, 2.2, c.yaw, top);
    const [rx, rz] = f.to(0, -2.2 - rampLen / 2);
    this.colliders.addDeck(rx, rz, 0.75, rampLen / 2, c.yaw, top - rampDrop / 2, { slope: rampDrop / rampLen });
    for (const [x, z, hx, hz] of [
      [0, 2.15, 2.2, 0.1],
      [2.15, 0, 0.1, 2.2],
      [-2.15, 0, 0.1, 2.2],
    ]) {
      const [wx, wz] = f.to(x, z);
      this.colliders.addBox(wx, wz, hx, hz, c.yaw, top - 0.5, top + 1.2);
    }
  }

  // ---------------------------------------------------------- glacier lake
  buildGlacierProps() {
    const p = this.world.place('glacier');
    const d = { x: -Math.sin(p.face), z: -Math.cos(p.face) };
    const x = p.x + d.z * 5 - d.x * 1;
    const z = p.z - d.x * 5 - d.z * 1;
    const b = new ModelBuilder();
    b.sphere(1, 10, 6, { pos: [0, 0.3, 0], scale: [0.45, 0.3, 2.3], color: 0xc9731c });
    this.addMesh(b.build(), x, this.world.heightAt(x, z) + 0.05, z, p.face + 0.4);
    this.colliders.addCircle(x, z, 1.0);
  }

  // ------------------------------------------------------------- signs
  addSign(text, sub, x, y, z, yaw, w, h) {
    const tex = makeSignTexture(text, sub);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const geo = new THREE.BoxGeometry(w, h, 0.08);
    // only the front face shows the painted text; the rest is plain wood
    if (!this.signBack) this.signBack = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
    const plain = this.signBack;
    const mesh = new THREE.Mesh(geo, [plain, plain, plain, plain, mat, plain]);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return mesh;
  }

  buildSigns(L) {
    const W = this.world;
    const nice = {
      landing: ['Hotrod Landing', 'Ruben’s cabin'],
      bend: ['Salmon Bend', 'Sockeye · Silvers'],
      falls: ['Bear Falls', 'Kings · Bears! Stay alert'],
      glacier: ['Glacier Lake', 'Char · Lake trout'],
      moose: ['Moose Lake', 'Northern pike'],
      pier: ['Halibut Pier', 'Halibut · Lingcod · Rockfish'],
      tundra: ['Caribou Tundra', 'Hunting area'],
      lighthouse: ['Kachemak Light', 'Whale watching'],
    };
    for (const [id, [title, sub]] of Object.entries(nice)) {
      const pk = L.parking[id];
      if (!pk) continue;
      // stand the sign just past the parking bay
      const x = pk.x + pk.side.x * 4.4;
      const z = pk.z + pk.side.z * 4.4;
      const y = W.heightAt(x, z);
      const yaw = Math.atan2(-pk.side.x, -pk.side.z);
      const post = new ModelBuilder();
      post.box(0.14, 2.3, 0.14, { pos: [-1.2, 1.15, 0], color: WOOD_DARK });
      post.box(0.14, 2.3, 0.14, { pos: [1.2, 1.15, 0], color: WOOD_DARK });
      this.addMesh(post.build(), x, y, z, yaw);
      this.addSign(title, sub, x, y + 1.75, z, yaw, 2.9, 1.1);
      this.colliders.addBox(x, z, 1.4, 0.15, yaw);
    }
    // junction signpost at the Trading Post
    const jx = -60 + 9;
    const jz = 428 - 7;
    const jy = W.heightAt(jx, jz);
    const pole = new ModelBuilder();
    pole.box(0.18, 3.6, 0.18, { pos: [0, 1.8, 0], color: WOOD_DARK });
    this.addMesh(pole.build(), jx, jy, jz, 0);
    this.colliders.addCircle(jx, jz, 0.2);
    const arrows = [
      ['↑ Salmon Bend · Bear Falls', 3.25, -0.2, 'river'],
      ['↗ Moose Lake · Tundra', 2.85, 0.2, 'tundra'],
      ['← Halibut Pier', 2.45, 0.1, 'coast'],
      ['↘ Kachemak Light', 2.05, -0.1, 'light'],
    ];
    for (const [t, h, yawOff] of arrows) this.addSign(t, '', jx, jy + h, jz, 0.5 + yawOff, 2.8, 0.36);
  }

  // ------------------------------------------------------------ campfires
  buildCampfires(list) {
    const W = this.world;
    for (const { id, x, z } of list) {
      const y = W.heightAt(x, z);
      const b = new ModelBuilder();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.dodeca(0.22, { pos: [Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75], color: 0x6a665e, jitter: 0.15 });
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.beam([Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [0, 0.45, 0], 0.07, 5, { color: 0x3a2618 });
      }
      // log seat
      b.cyl(0.25, 0.25, 1.8, 7, { pos: [0, 0.22, 2.0], rot: [0, 0.3, Math.PI / 2], color: LOG });
      this.addMesh(b.build(), x, y, z, 0);
      this.colliders.addCircle(x, z, 0.9);
      this.fires.push({ x, y, z, id });
    }
  }

  // Night-time glow, flag waving, bobbing boats, lighthouse beam.
  update(dt, t, env) {
    const night = env.night;
    const glow = 0.15 + 0.85 * night;
    this.glowMat.color.setRGB(0.16 + glow * 1.4, 0.14 + glow * 1.0, 0.12 + glow * 0.45);
    this.lampMat.color.setRGB(0.3 + night * 2.2, 0.28 + night * 1.9, 0.22 + night * 1.2);
    if (this.lantern) this.lantern.material.color.setRGB(0.35 + night * 2.5, 0.38 + night * 2.2, 0.42 + night * 1.4);
    if (this.beam) {
      this.beam.rotation.y = t * 0.6;
      this.beam.material.opacity = night * 0.16;
      this.beam.visible = night > 0.05;
    }
    if (this.flag) {
      const pos = this.flag.geometry.attributes.position;
      const base = this.flagBase;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(t * 5 + x * 2.2) * 0.12 * x * 0.5;
      }
      pos.needsUpdate = true;
      this.flag.rotation.y = 1.2 + Math.sin(t * 0.3) * 0.25;
    }
    if (this.bobbers) {
      for (const m of this.bobbers) {
        const bb = m.userData.bob;
        m.position.y = bb.y + Math.sin(t * 1.3 + bb.phase) * 0.06;
        m.rotation.z = Math.sin(t * 1.1 + bb.phase) * 0.03;
        m.updateMatrix();
      }
    }
  }
}
