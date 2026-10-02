// The Granite Tors: two towers of granite on a meadow off the Tundra Road,
// like the tors in the hills near Fairbanks. A tor is what is left when the
// softer rock round a body of granite weathers away: frost opens the joints
// in the granite into stacked blocks and rounds their corners, and the
// blocks stand up out of the land. The big tor is four blocks high (about
// 18 m), the little one two (about 6 m).
//
// The Kenai Climbing Club keeps four top ropes on them, each in its own
// colour: First Steps (5.4) on the little tor; Tundra Stroll (5.5) up the
// south face of the big tor, Ptarmigan Crack (5.8) up its north face and
// Raven's Roof (5.10) under the overhang on its east face. The grades are
// the ones American climbers use: 5 means a climb that needs a rope, and the
// number after the point how hard it is. The holds are chalked white, as
// they are where people climb. Climbing itself is in gameplay/climbing.js.
//
// Like the observatory, everything is added after the world is made, and
// the trees on the site are felled, so the forest elsewhere is untouched.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { makeSignTexture } from '../util/textures.js';
import { ROAD_HALF } from './worldgen.js';
import { mulberry32, smoothstep, segDist } from '../util/math.js';

export const TORS = { x: 350, z: -275 };
const DEG = Math.PI / 180;

// The routes. face: the compass bearing the face looks toward, in the tor's
// own frame (the tor is turned by its yaw). u: where the route runs across
// the face (metres right of the face's middle, looking at it). mix: the
// kinds of hold and how often each turns up; reach: the gap between holds.
export const ROUTES = [
  { id: 'steps', name: 'First Steps', grade: '5.4', tor: 'little', face: 200, u: 0.2, rope: 0xffc93a, mix: { jug: 0.7, edge: 0.3 }, reach: [0.5, 0.6], seed: 3 },
  { id: 'stroll', name: 'Tundra Stroll', grade: '5.5', tor: 'big', face: 180, u: -0.6, rope: 0x3a9cff, mix: { jug: 0.5, edge: 0.42, sloper: 0.08 }, reach: [0.55, 0.68], seed: 11 },
  { id: 'crack', name: 'Ptarmigan Crack', grade: '5.8', tor: 'big', face: 0, u: 0.5, rope: 0x4ccf5a, mix: { edge: 0.42, jug: 0.24, pocket: 0.17, crimp: 0.17 }, reach: [0.6, 0.76], seed: 23, crack: true },
  { id: 'roof', name: "Raven's Roof", grade: '5.10', tor: 'big', face: 90, u: 0.3, rope: 0xff4a36, mix: { crimp: 0.34, edge: 0.24, sloper: 0.2, pocket: 0.12, jug: 0.1 }, reach: [0.68, 0.86], seed: 37 },
];

// How well each kind of hold is held: how fast it tires the fingers (see
// gameplay/climbing.js), and how big it is drawn.
export const HOLDS = {
  jug: { name: 'jug', drain: 0.35 },
  edge: { name: 'edge', drain: 1.0 },
  pocket: { name: 'pocket', drain: 1.25 },
  sloper: { name: 'sloper', drain: 1.5 },
  crimp: { name: 'crimp', drain: 1.8 },
  anchor: { name: 'the top', drain: 0.3 },
};

// The blocks of each tor: half sizes, the corner radius, where the block's
// middle stands (east, up, south of the tor's foot) and its own small turn.
const TOR_DEFS = {
  big: {
    at: [0, 0],
    yaw: 12 * DEG,
    blocks: [
      { h: [5.2, 2.9, 4.1], r: 1.25, c: [0, 2.7, 0], yaw: 0.06, tilt: [0.02, -0.025], rough: 0.2 },
      { h: [4.5, 2.7, 3.7], r: 1.15, c: [-0.3, 8.05, 0.1], yaw: -0.07, tilt: [-0.03, 0.02], rough: 0.18 },
      { h: [4.3, 2.5, 3.3], r: 1.05, c: [1.0, 13.15, -0.1], yaw: 0.09, tilt: [0.025, 0.03], rough: 0.17 },
      { h: [2.3, 1.35, 2.1], r: 0.85, c: [0.6, 16.95, 0.35], yaw: -0.2, tilt: [-0.05, 0.04], rough: 0.12 },
    ],
  },
  little: {
    at: [-21, 15],
    yaw: -28 * DEG,
    blocks: [
      { h: [2.7, 1.9, 2.4], r: 0.85, c: [0, 1.75, 0], yaw: 0.1, tilt: [0.03, -0.02], rough: 0.14 },
      { h: [2.0, 1.5, 1.8], r: 0.7, c: [0.25, 5.05, -0.1], yaw: -0.12, tilt: [-0.04, 0.05], rough: 0.12 },
    ],
  },
};

// ------------------------------------------------------------ 3D noise
function hash3(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise3(x, y, z, s) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), ux), L(c(0, 1, 0), c(1, 1, 0), ux), uy), L(L(c(0, 0, 1), c(1, 0, 1), ux), L(c(0, 1, 1), c(1, 1, 1), ux), uy), uz);
}
function fbm3(x, y, z, s, oct = 3) {
  let a = 0;
  let w = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    a += w * vnoise3(x * f, y * f, z * f, s + i * 17);
    f *= 2.03;
    w *= 0.5;
  }
  return a / (1 - Math.pow(0.5, oct));
}

// Signed distance to a box of half sizes b with corners rounded by r.
function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - (bx - r);
  const qy = Math.abs(y) - (by - r);
  const qz = Math.abs(z) - (bz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// A weathered granite block: a rounded box, its faces bulging a little like
// a pillow, roughened by frost, with box-projected texture coordinates (in
// metres over two) and vertex colours that darken the foot and green the
// top with lichen. Seamless: built from a sphere pushed out to the shape.
function graniteBlock(hx, hy, hz, r, rough, seed, detail) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const n = pos.count;
  const big = Math.max(hx, hy, hz) * 1.3 + r;
  const sd = (x, y, z) => {
    // the pillow: faces swell toward their middles
    const bulge = 0.12 * r * (1 - Math.min(1, (x * x) / (hx * hx) + (z * z) / (hz * hz)));
    return sdRoundBox(x, y, z, hx, hy, hz, r) - bulge;
  };
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let lo = 0;
    let hi = big;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      if (sd(v.x * m, v.y * m, v.z * m) < 0) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    let x = v.x * t;
    let y = v.y * t;
    let z = v.z * t;
    // the outward direction of the smooth shape
    const e = 0.03;
    let nx = sd(x + e, y, z) - sd(x - e, y, z);
    let ny = sd(x, y + e, z) - sd(x, y - e, z);
    let nz = sd(x, y, z + e) - sd(x, y, z - e);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // frost-roughened: big lumps, small knobs, and the horizontal sheeting
    // joints granite splits along
    const lump = (fbm3(x * 0.42, y * 0.42, z * 0.42, seed) - 0.5) * 2;
    const knob = (fbm3(x * 1.6, y * 1.6, z * 1.6, seed + 5, 2) - 0.5) * 2;
    const sheet = -0.05 * Math.pow(Math.abs(Math.sin(y * 1.9 + lump * 0.8)), 8);
    // the bottom sits flat on the block below
    const flat = smoothstep(-hy * 0.55, -hy * 0.95, y);
    const d = (rough * (lump + 0.35 * knob) + sheet) * (1 - flat * 0.85);
    x += nx * d;
    y += ny * d;
    z += nz * d;
    pos.setXYZ(i, x, y, z);
    // texture: from the side the vertex mostly faces
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    if (ay >= ax && ay >= az) {
      uv[i * 2] = x / 2;
      uv[i * 2 + 1] = z / 2;
    } else if (ax >= az) {
      uv[i * 2] = z / 2;
      uv[i * 2 + 1] = y / 2;
    } else {
      uv[i * 2] = x / 2;
      uv[i * 2 + 1] = y / 2;
    }
    // colour: weathered paler on top, damp and darker at the foot, lichen
    // greening what faces the sky
    const top = smoothstep(0.3, 0.85, ny);
    const foot = smoothstep(-0.2, -0.95, y / hy);
    const stain = (fbm3(x * 0.3, y * 0.9, z * 0.3, seed + 9, 2) - 0.5) * 0.18;
    let cr = 1.0 + 0.05 * top - 0.22 * foot + stain;
    let cg = 1.0 + 0.07 * top - 0.2 * foot + stain;
    let cb = 1.0 - 0.02 * top - 0.18 * foot + stain;
    const lichen = top * smoothstep(0.45, 0.7, fbm3(x * 0.8, y * 0.8, z * 0.8, seed + 13, 2));
    cr = cr * (1 - lichen) + 0.82 * lichen;
    cg = cg * (1 - lichen) + 0.95 * lichen;
    cb = cb * (1 - lichen) + 0.55 * lichen;
    col[i * 3] = cr;
    col[i * 3 + 1] = cg;
    col[i * 3 + 2] = cb;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Granite: pinkish grey with black mica, white feldspar and glassy grey
// quartz grains, and crusts of map lichen, orange lichen and black lichen.
function graniteTexture() {
  return canvasTexture(
    512,
    512,
    (g, W, H) => {
      const rnd = mulberry32(77);
      g.fillStyle = '#9b918a';
      g.fillRect(0, 0, W, H);
      // soft mottling
      for (let i = 0; i < 260; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const r = 10 + rnd() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const tone = rnd() < 0.5 ? '160,148,140' : '128,120,116';
        gr.addColorStop(0, `rgba(${tone},0.35)`);
        gr.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // the crystals
      const grain = (n, color, s0, s1) => {
        g.fillStyle = color;
        for (let i = 0; i < n; i++) {
          const s = s0 + rnd() * (s1 - s0);
          g.save();
          g.translate(rnd() * W, rnd() * H);
          g.rotate(rnd() * Math.PI);
          g.fillRect(-s / 2, -s / 3, s, s * (0.4 + rnd() * 0.5));
          g.restore();
        }
      };
      grain(2600, 'rgba(232,222,214,0.55)', 2, 6);
      grain(1800, 'rgba(196,160,150,0.5)', 2, 7);
      grain(1500, 'rgba(150,152,158,0.55)', 2, 5);
      grain(2400, 'rgba(30,26,28,0.75)', 1, 3.5);
      // lichens
      const crust = (n, color, r0, r1) => {
        for (let i = 0; i < n; i++) {
          const x = rnd() * W;
          const y = rnd() * H;
          const r = r0 + rnd() * (r1 - r0);
          g.fillStyle = color;
          g.beginPath();
          for (let a = 0; a < Math.PI * 2; a += 0.5) {
            const rr = r * (0.7 + rnd() * 0.5);
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr;
            if (a === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.fill();
        }
      };
      crust(28, 'rgba(184,196,64,0.55)', 6, 18);
      crust(14, 'rgba(226,138,42,0.5)', 4, 11);
      crust(40, 'rgba(34,32,30,0.4)', 3, 9);
    },
    { repeat: true }
  );
}

// The route board at the foot of the tors.
function boardTexture() {
  return canvasTexture(1024, 640, (g, W, H) => {
    g.fillStyle = '#3c2a1a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#efe6d2';
    g.fillRect(24, 24, W - 48, H - 48);
    g.fillStyle = '#2a2e33';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = '800 64px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('GRANITE TORS', 56, 48);
    g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillStyle = '#5a4a3a';
    g.fillText('Kenai Climbing Club · top ropes fixed and checked every spring', 56, 120);
    let y = 182;
    for (const R of ROUTES) {
      g.fillStyle = '#' + R.rope.toString(16).padStart(6, '0');
      g.fillRect(56, y + 6, 46, 30);
      g.fillStyle = '#2a2e33';
      g.font = '800 40px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText(`${R.name}`, 122, y);
      g.font = '700 40px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText(R.grade, 560, y);
      g.font = '500 30px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillStyle = '#5a4a3a';
      g.fillText(R.tor === 'little' ? 'little tor' : `big tor, ${R.face === 180 ? 'south' : R.face === 0 ? 'north' : 'east'} face`, 680, y + 6);
      y += 64;
    }
    g.fillStyle = '#7a2e22';
    g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('Bring shoes, a harness and chalk (Kenai Trading Post).', 56, y + 14);
    g.fillText('Chalk up on good holds. Rest on the big ones. Lower off from the top.', 56, y + 52);
  });
}

export class Tors {
  constructor(game) {
    this.game = game;
    const W = game.world;
    const P = game.props;
    const C = game.colliders;
    this.group = new THREE.Group();
    this.group.name = 'tors';
    const site = TORS;
    this.road = P.nearestRoad(site.x, site.z);
    this.clear();

    // ------------------------------------------------------------ the rock
    const rockMat = new THREE.MeshStandardMaterial({ map: graniteTexture(), vertexColors: true, roughness: 0.88, metalness: 0 });
    this.rockMat = rockMat;
    this.tors = {};
    const meshes = [];
    for (const [id, T] of Object.entries(TOR_DEFS)) {
      const x = site.x + T.at[0];
      const z = site.z + T.at[1];
      // the foot: the lowest ground under the bottom block, so it never floats
      const b0 = T.blocks[0];
      let lo = Infinity;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        lo = Math.min(lo, W.heightAt(x + Math.cos(ang) * b0.h[0] * 0.9, z + Math.sin(ang) * b0.h[2] * 0.9));
      }
      const foot = lo - 0.25;
      const tor = { id, x, z, yaw: T.yaw, foot, blocks: [], group: new THREE.Group() };
      tor.group.position.set(x, foot, z);
      tor.group.rotation.y = T.yaw;
      // the blocks, each turned and placed, merged into one mesh a tor (one
      // draw instead of four)
      const parts = [];
      T.blocks.forEach((B, k) => {
        const detail = id === 'big' ? (k < 3 ? 13 : 10) : 10;
        const geo = graniteBlock(B.h[0], B.h[1], B.h[2], B.r, B.rough, (id === 'big' ? 100 : 200) + k * 7, detail);
        const M = new THREE.Matrix4().compose(new THREE.Vector3(B.c[0], B.c[1], B.c[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(B.tilt ? B.tilt[0] : 0, B.yaw, B.tilt ? B.tilt[1] : 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(M);
        parts.push(geo);
        tor.blocks.push({ ...B });
      });
      const m = new THREE.Mesh(mergeGeometries(parts), rockMat);
      m.castShadow = true;
      m.receiveShadow = true;
      tor.group.add(m);
      this.group.add(tor.group);
      tor.group.updateMatrixWorld(true);
      // for rays (placing the holds, lowering off) one unseen mesh a block,
      // so a ray tests only the blocks it passes near, not every triangle
      // of the tor
      for (const geo of parts) {
        geo.computeBoundingSphere();
        const rm = new THREE.Mesh(geo, rockMat);
        rm.matrixAutoUpdate = false;
        rm.matrixWorld.copy(tor.group.matrixWorld);
        meshes.push(rm);
      }
      // colliders: the bottom block, and the top of the tor to stand on
      const B0 = T.blocks[0];
      C.addBox(x, z, B0.h[0] + 0.15, B0.h[2] + 0.15, T.yaw + B0.yaw, -1e9, foot + B0.c[1] + B0.h[1], 'rock');
      this.tors[id] = tor;
    }
    this.rayMeshes = meshes;

    // ------------------------------------------------------ the routes
    this.raycaster = new THREE.Raycaster();
    this.routes = ROUTES.map((R) => this.buildRoute(R));
    const holdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const hb = new ModelBuilder();
    for (const r of this.routes) for (const h of r.holds) this.addHold(hb, h, r);
    const holds = new THREE.Mesh(hb.build(), holdMat);
    holds.castShadow = false;
    holds.receiveShadow = true;
    this.group.add(holds);
    this.addRopes();
    this.addTops();
    for (const r of this.routes) this.clearStand(r);
    this.addTalus(rockMat);
    this.addCrack();

    // --------------------------------------------- the foot of the tors
    this.addBoard();
    game.scene.add(this.group);

    // ------------------------------------- the place, its parking, its doors
    for (const r of this.routes) P.interactions.push({ id: 'climb:' + r.id, x: r.base.x, z: r.base.z, r: 1.9 });
    for (const r of this.routes) P.interactions.push({ id: 'lower:' + r.id, x: r.top.x, z: r.top.z, r: 1.7, y: r.top.y });
    const big = this.tors.big;
    const reg = this.register;
    P.interactions.push({ id: 'register', x: reg.x, z: reg.z, r: 1.6, y: reg.y });
    P.interactions.push({ id: 'sample', x: this.sampleAt.x, z: this.sampleAt.z, r: 1.5, y: this.sampleAt.y });
    const dx = this.road.x - site.x;
    const dz = this.road.z - site.z;
    const dl = Math.hypot(dx, dz) || 1;
    const px = site.x + (dx / dl) * 16;
    const pz = site.z + (dz / dl) * 16;
    W.places.push({
      id: 'tors',
      name: 'Granite Tors',
      kind: 'landmark',
      x: px,
      z: pz,
      y: W.heightAt(px, pz),
      face: Math.atan2(-(big.x - px), -(big.z - pz)),
      blurb: 'Two towers of granite on a meadow off the Tundra Road, with four top ropes fixed by the Kenai Climbing Club, from an easy first climb to an overhang. Climbing kit from the Trading Post. The view from the top is worth the pump.',
      bearRisk: 0.15,
    });
    const road = this.road;
    P.layout.parking.tors = { x: road.x - (dx / dl) * (ROAD_HALF + 2), z: road.z - (dz / dl) * (ROAD_HALF + 2), yaw: Math.atan2(road.tx, road.tz), roadX: road.x, roadZ: road.z, side: { x: dx / dl, z: dz / dl } };
  }

  // Fell what grows round the tors and on the path from the road.
  clear() {
    const g = this.game;
    const S = g.scatter;
    const site = TORS;
    const road = this.road;
    const inSite = (x, z) => Math.hypot(x - site.x, z - site.z) < 34 || Math.hypot(x - (site.x - 21), z - (site.z + 15)) < 14 || segDist(x, z, site.x, site.z, road.x, road.z).d < 3;
    for (const t of Object.values(S.types)) {
      // the low tundra plants may stay, but not trees, snags or big shrubs
      if (['blueberry', 'labradorTea', 'cottonGrass', 'horsetail', 'mushroom'].includes(t.name)) continue;
      for (let i = 0; i < t.count; i++) if (inSite(t.x[i], t.z[i])) t.x[i] = 1e6;
    }
    g.colliders.removeCircles(site.x - 60, site.z - 60, site.x + 60, site.z + 60, (c) => (c.tag === 'tree' || c.tag === 'rock' || c.tag === 'shrub') && inSite(c.x, c.z));
    S.lastPos.set(1e9, 0, 0);
  }

  // Where you stand when you top out: on the top's stand, clear of the
  // summit block and the walls round the edge, as nearly straight back from
  // the lip as it can be (up to 1.6 m back), else a little to one side
  // (straight back from some lips is the summit block itself).
  clearStand(r) {
    const C = this.game.colliders;
    if (!r.lip) return;
    const free = (x, z) => {
      if (C.deckAt(x, z, r.topY, 0.5) === null) return false;
      const q = C.resolve(x, z, 0.4, r.topY);
      return Math.hypot(q.x - x, q.z - z) < 1e-3;
    };
    for (const side of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.25, -1.25, 1.5, -1.5, 1.75, -1.75, 2, -2]) {
      for (let back = 1.6; back >= 0.55; back -= 0.05) {
        const x = r.lip.p.x - r.n.x * back + r.right.x * side;
        const z = r.lip.p.z - r.n.z * back + r.right.z * side;
        if (free(x, z)) {
          r.top.set(x, r.topY, z);
          return;
        }
      }
    }
    const q = C.resolve(r.top.x, r.top.z, 0.4, r.topY);
    r.top.set(q.x, r.topY, q.z);
  }

  // Where a ray from outside the tor along -n first meets the rock.
  hit(origin, dir) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = 30;
    const hits = this.raycaster.intersectObjects(this.rayMeshes, false);
    return hits[0] || null;
  }

  // A route's holds on the rock: a line of them from just over head height
  // at the foot to the top, alternating left and right of the line, with a
  // few more off to the sides for another way up.
  buildRoute(R) {
    const tor = this.tors[R.tor];
    const T = TOR_DEFS[R.tor];
    const rnd = mulberry32(R.seed * 97 + 5);
    // the face's outward direction and its "right" (as you look at it): the
    // tor's yaw turns a bearing in its own frame by minus the yaw, and a
    // bearing b looks toward (sin b, -cos b)
    const b = R.face * DEG - tor.yaw;
    const n = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
    const right = new THREE.Vector3(n.z, 0, -n.x);
    const up = new THREE.Vector3(0, 1, 0);
    const center = new THREE.Vector3(tor.x, tor.foot, tor.z);
    // the top: the highest block a climber stands on (the second from the
    // top of the big tor, the top of the little one)
    const topBlock = R.tor === 'big' ? T.blocks[2] : T.blocks[T.blocks.length - 1];
    const topY = tor.foot + topBlock.c[1] + topBlock.h[1];
    const holds = [];
    const at = (u, v) => {
      const o = center.clone().addScaledVector(n, 14).addScaledVector(right, u).addScaledVector(up, v);
      const h = this.hit(o, n.clone().negate());
      return h;
    };
    // the foot of the route: where the rope hangs to, a little out from the rock
    const g0 = at(R.u, 0.9) || at(R.u, 1.4);
    const base = g0 ? g0.point.clone().addScaledVector(n, 1.0) : center.clone().addScaledVector(n, 6);
    base.y = this.game.world.heightAt(base.x, base.z);
    const ground = base.y;
    let v = ground - tor.foot + 1.55;
    let side = rnd() < 0.5 ? -1 : 1;
    const kinds = Object.entries(R.mix);
    const kind = () => {
      let r = rnd();
      for (const [k, w] of kinds) {
        r -= w;
        if (r <= 0) return k;
      }
      return kinds[0][0];
    };
    const place = (u, vv, k, main) => {
      const h = at(u, vv);
      if (!h) return null;
      const nrm = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
      const hold = { p: h.point.clone(), n: nrm, kind: k, main, i: holds.length, route: R.id, u, v: vv };
      holds.push(hold);
      return hold;
    };
    // the start: two holds side by side
    place(R.u - 0.28, v, 'jug', true);
    let prev = place(R.u + 0.3, v + 0.05, 'jug', true);
    v += 0.05;
    const vTop = topY - tor.foot - 0.35;
    const lineU = (vv, off) => R.u + Math.sin(vv * 0.55 + R.seed) * 0.35 + off;
    for (let guard = 0; guard < 80 && prev; guard++) {
      side = -side;
      const step = R.reach[0] + rnd() * (R.reach[1] - R.reach[0]);
      const off = side * (0.2 + rnd() * 0.18) + (R.crack ? 0 : (rnd() - 0.5) * 0.2);
      // the next hold: up the line until it is a reach from the last one,
      // measured over the rock, so the holds close up where a ledge sets
      // the rock back or a bulge brings it out
      const goal = Math.hypot(step, lineU(v + step, off) - prev.u);
      let dv = step;
      for (let t = 0.12; t < step; t += 0.03) {
        const h = at(lineU(v + t, off), v + t);
        if (h && h.point.distanceTo(prev.p) >= goal) {
          dv = t;
          break;
        }
      }
      v += dv;
      if (v > vTop - 0.25) break;
      const u = lineU(v, off);
      // the hardest route rests only where the guidebook says it does
      let k = kind();
      if (R.id === 'roof' && Math.abs(v - (vTop * 0.55)) < 0.4) k = 'jug';
      prev = place(u, v, k, true) || prev;
      // another way up
      if (rnd() < 0.5) place(u + side * (0.5 + rnd() * 0.45), v + (rnd() - 0.4) * 0.35, rnd() < 0.5 ? 'crimp' : 'sloper', false);
    }
    // over a bulge the first hold on top is a jug: what climbers call a
    // thank-god hold
    for (let i = 2; i < holds.length; i++) {
      const h = holds[i];
      if (h.main && h.n.y > 0 && (holds[i - 1].n.y < -0.4 || holds[i - 2].n.y < -0.4)) {
        h.kind = 'jug';
        break;
      }
    }
    // the top: the lip, with the anchor's bolts over it, and a last hold
    // under it if the lip is a long way over the line
    const lip = place(R.u, vTop, 'anchor', true);
    if (lip && prev && lip.p.distanceTo(prev.p) > 1.1) place((prev.u + R.u) / 2, (prev.v + vTop) / 2, 'edge', true);
    // where you stand when you top out: on the top block, back from the lip
    const topStand = lip ? lip.p.clone().addScaledVector(n, -1.6) : center.clone().setY(topY);
    topStand.y = topY;
    return { ...R, holds, n, right, base, ground, top: topStand, lip, tor: R.tor, torObj: tor, topY };
  }

  // A hold: a knob, ledge or pocket of the rock where hands go, chalked.
  addHold(b, h, R) {
    const n = h.n;
    // the hold's frame: x along the face, y up the face, z out of it
    const zf = n.clone();
    let xf = new THREE.Vector3(0, 1, 0).cross(zf);
    if (xf.lengthSq() < 1e-4) xf.set(1, 0, 0);
    xf.normalize();
    const yf = zf.clone().cross(xf).normalize();
    const M = new THREE.Matrix4().makeBasis(xf, yf, zf);
    M.setPosition(h.p.x, h.p.y, h.p.z);
    const chalk = 0xe9e6de;
    const rock = 0xb2a69c;
    const k = h.kind;
    const rnd = mulberry32(h.i * 31 + R.seed);
    const add = (geo, pos, color, scale = 1) => {
      geo.scale(scale, scale, scale);
      geo.translate(pos[0], pos[1], pos[2]);
      geo.applyMatrix4(M);
      b.add(geo, { color, jitter: 0.08 });
    };
    if (k === 'jug' || k === 'anchor') {
      const g = new THREE.DodecahedronGeometry(0.11, 0);
      g.scale(1.45 + rnd() * 0.3, 0.7, 0.95);
      add(g, [0, 0, 0.05], h.main ? chalk : rock);
    } else if (k === 'edge') {
      const g = new THREE.BoxGeometry(0.24 + rnd() * 0.08, 0.04, 0.07);
      add(g, [0, 0, 0.03], h.main ? chalk : rock);
    } else if (k === 'crimp') {
      const g = new THREE.BoxGeometry(0.13 + rnd() * 0.05, 0.022, 0.035);
      add(g, [0, 0, 0.015], h.main ? chalk : rock);
    } else if (k === 'sloper') {
      const g = new THREE.SphereGeometry(0.1, 8, 5);
      g.scale(1.5, 0.75, 0.55);
      add(g, [0, 0, 0.02], h.main ? chalk : rock);
    } else if (k === 'pocket') {
      const g = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 10);
      g.rotateX(Math.PI / 2);
      add(g, [0, 0, 0.008], 0x2a2624);
      const t = new THREE.TorusGeometry(0.066, 0.016, 5, 12);
      add(t, [0, 0, 0.01], chalk);
    }
    // a smear of chalk on the rock round a hold people use
    if (h.main && k !== 'anchor') {
      const s = new THREE.CircleGeometry(0.13 + rnd() * 0.06, 9);
      s.scale(1.3, 0.8, 1);
      add(s, [0, -0.04, 0.012], 0xcfc9bf);
    }
    if (k === 'anchor') {
      // two bolts with hangers and chains, and the ring the rope runs through
      for (const sx of [-0.18, 0.18]) {
        const bolt = new THREE.CylinderGeometry(0.014, 0.014, 0.06, 6);
        bolt.rotateX(Math.PI / 2);
        add(bolt, [sx, 0.32, 0.03], 0x9aa0a6);
        const hanger = new THREE.BoxGeometry(0.045, 0.07, 0.012);
        add(hanger, [sx, 0.29, 0.058], 0xb8bcc0);
        for (let c = 0; c < 3; c++) {
          const link = new THREE.TorusGeometry(0.02, 0.005, 4, 8);
          if (c % 2) link.rotateY(Math.PI / 2);
          add(link, [sx * (1 - c * 0.25), 0.24 - c * 0.04, 0.07], 0xa8acb0);
        }
      }
      const ring = new THREE.TorusGeometry(0.035, 0.008, 5, 12);
      add(ring, [0, 0.11, 0.08], 0xc8ccd0);
    }
  }

  // The top ropes, one colour a route: from the anchor down the line of the
  // route to the foot, a little off the rock, and a coil at the bottom.
  addRopes() {
    const parts = [];
    const col = new THREE.Color();
    const paint = (geo, hex) => {
      col.set(hex);
      const n = geo.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.deleteAttribute('uv');
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    for (const r of this.routes) {
      if (!r.lip) continue;
      const pts = [r.lip.p.clone().addScaledVector(r.lip.n, 0.1).add(new THREE.Vector3(0, 0.12, 0))];
      const main = r.holds.filter((h) => h.main && h.kind !== 'anchor').sort((a, b) => b.v - a.v);
      for (let i = 0; i < main.length; i += 3) pts.push(main[i].p.clone().addScaledVector(main[i].n, 0.16));
      const foot = r.base.clone().addScaledVector(r.n, -0.4);
      foot.y = r.ground + 0.05;
      pts.push(foot);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      paint(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 6), 0.012, 5, false), r.rope);
      // the coil of slack on the ground
      const coil = new THREE.TorusGeometry(0.22, 0.03, 5, 18);
      coil.rotateX(Math.PI / 2);
      coil.scale(1, 0.6, 1);
      coil.translate(foot.x + r.right.x * 0.4, r.ground + 0.04, foot.z + r.right.z * 0.4);
      paint(coil, r.rope);
      r.ropePts = pts;
    }
    if (!parts.length) return;
    const ropes = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    ropes.castShadow = false;
    this.group.add(ropes);
  }

  // The tops: a stand on each, walls round its edge where no one should step
  // off, the summit register on the big tor (an old ammunition can, as on
  // real summits) and a loose flake of granite to take a sample of.
  addTops() {
    const C = this.game.colliders;
    for (const [id, T] of Object.entries(TOR_DEFS)) {
      const tor = this.tors[id];
      const B = id === 'big' ? T.blocks[2] : T.blocks[T.blocks.length - 1];
      const yaw = tor.yaw + B.yaw;
      const c = new THREE.Vector3(B.c[0], 0, B.c[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), tor.yaw);
      const cx = tor.x + c.x;
      const cz = tor.z + c.z;
      const top = tor.foot + B.c[1] + B.h[1] - 0.05;
      const hx = B.h[0] - B.r * 0.55;
      const hz = B.h[2] - B.r * 0.55;
      C.addDeck(cx, cz, hx, hz, yaw, top);
      // the edge: four low walls, just over knee height to a walker
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const to = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
      for (const [lx, lz, w, d] of [
        [0, -hz, hx, 0.1],
        [0, hz, hx, 0.1],
        [-hx, 0, 0.1, hz],
        [hx, 0, 0.1, hz],
      ]) {
        const [wx, wz] = to(lx, lz);
        C.addBox(wx, wz, w, d, yaw, top - 0.4, top + 1.6);
      }
      tor.deck = { x: cx, z: cz, hx, hz, yaw, top };
      if (id === 'big') {
        // the summit block on the stand
        const S4 = T.blocks[3];
        const c4 = new THREE.Vector3(S4.c[0], 0, S4.c[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), tor.yaw);
        C.addBox(tor.x + c4.x, tor.z + c4.z, S4.h[0] - 0.2, S4.h[2] - 0.2, tor.yaw + S4.yaw, top - 0.5, top + 3.5);
        // the register on the stand, out from the summit block toward the
        // south-east corner
        const [rx, rz] = to(hx * 0.62, hz * 0.62);
        const rb = new ModelBuilder();
        rb.box(0.34, 0.2, 0.18, { pos: [0, 0.1, 0], color: 0x4a5a3a });
        rb.box(0.36, 0.035, 0.2, { pos: [0, 0.21, 0], color: 0x3e4c30 });
        rb.box(0.06, 0.05, 0.02, { pos: [0.1, 0.17, 0.1], color: 0x9a9a90 });
        // stones holding it down
        rb.dodeca(0.09, { pos: [-0.24, 0.05, 0.05], color: 0x8c827a });
        rb.dodeca(0.07, { pos: [0.23, 0.04, -0.06], color: 0x968c84 });
        const reg = new THREE.Mesh(rb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 }));
        reg.position.set(rx, top, rz);
        reg.rotation.y = yaw + 0.4;
        this.group.add(reg);
        this.register = { x: rx, z: rz, y: top };
        // the flake: a loose slab of granite by the summit block, on the
        // first corner of the stand that is open rock (clear of the summit
        // block, the walls and the register)
        let [fx, fz] = to(-hx * 0.55, hz * 0.5);
        for (const [ax, az] of [
          [-0.6, 0.6],
          [-0.6, -0.6],
          [0.6, -0.6],
          [0, 0.62],
          [0, -0.62],
          [-0.62, 0],
          [0.62, 0],
        ]) {
          const [qx, qz] = to(hx * ax, hz * az);
          const q = C.resolve(qx, qz, 0.35, top);
          if (Math.hypot(q.x - qx, q.z - qz) < 1e-3 && Math.hypot(qx - rx, qz - rz) > 1) {
            fx = qx;
            fz = qz;
            break;
          }
        }
        const fb = new ModelBuilder();
        fb.dodeca(0.16, { pos: [0, 0.06, 0], scale: [1.6, 0.45, 1.1], color: 0xa0948c });
        fb.dodeca(0.09, { pos: [0.25, 0.04, 0.12], scale: [1.4, 0.5, 1], color: 0x968a82 });
        const flake = new THREE.Mesh(fb.build(), this.rockMat);
        flake.position.set(fx, top, fz);
        this.group.add(flake);
        this.flake = flake;
        this.sampleAt = { x: fx, z: fz, y: top };
      }
    }
  }

  // Blocks that fell off the tors long ago, half sunk in the moss.
  addTalus(mat) {
    const W = this.game.world;
    const C = this.game.colliders;
    const rnd = mulberry32(512);
    const b = new ModelBuilder({ uvs: true });
    let n = 0;
    for (let tries = 0; tries < 60 && n < 15; tries++) {
      const big = rnd() < 0.5;
      const tor = big ? this.tors.big : this.tors.little;
      const a = rnd() * Math.PI * 2;
      const d = (big ? 8.5 : 5) + rnd() * (big ? 9 : 6);
      const x = tor.x + Math.cos(a) * d;
      const z = tor.z + Math.sin(a) * d;
      // keep the foot of every route clear
      if (this.routes.some((r) => Math.hypot(r.base.x - x, r.base.z - z) < 4)) continue;
      const s = 0.45 + rnd() * rnd() * 1.4;
      const geo = graniteBlock(s * (1 + rnd() * 0.5), s * (0.6 + rnd() * 0.3), s * (0.9 + rnd() * 0.4), s * 0.45, s * 0.12, 300 + n * 11, 4);
      const y = W.heightAt(x, z) - s * 0.25;
      geo.rotateY(rnd() * Math.PI * 2);
      geo.translate(x, y, z);
      b.add(geo, { keepColors: true, jitter: 0, smooth: true });
      if (s > 0.6) C.addCircle(x, z, s * 0.9, 'rock');
      n++;
    }
    if (!n) return;
    const g = b.build({ flat: false });
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
  }

  // The crack Ptarmigan Crack follows: a dark line in the rock up the
  // north face, a ribbon laid on the surface.
  addCrack() {
    const r = this.route('crack');
    if (!r) return;
    const tor = r.torObj;
    const pts = [];
    const center = new THREE.Vector3(tor.x, tor.foot, tor.z);
    for (let v = r.ground - tor.foot + 0.3; v < r.topY - tor.foot - 0.2; v += 0.25) {
      const u = r.u + Math.sin(v * 0.55 + r.seed) * 0.35 + Math.sin(v * 2.1) * 0.05;
      const o = center.clone().addScaledVector(r.n, 14).addScaledVector(r.right, u).add(new THREE.Vector3(0, v, 0));
      const h = this.hit(o, r.n.clone().negate());
      if (h) pts.push({ p: h.point, n: h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize() });
    }
    if (pts.length < 2) return;
    const pos = [];
    const idx = [];
    pts.forEach((q, i) => {
      const side = new THREE.Vector3(0, 1, 0).cross(q.n).normalize();
      const w = 0.035 + 0.02 * Math.sin(i * 1.7);
      const a = q.p.clone().addScaledVector(q.n, 0.012).addScaledVector(side, -w);
      const c = q.p.clone().addScaledVector(q.n, 0.012).addScaledVector(side, w);
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
      if (i) {
        const k = (i - 1) * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 1, side: THREE.DoubleSide }));
    this.group.add(m);
  }

  // The board with the routes, and a sign at the road.
  addBoard() {
    const W = this.game.world;
    const site = TORS;
    const road = this.road;
    const dx = road.x - site.x;
    const dz = road.z - site.z;
    const dl = Math.hypot(dx, dz) || 1;
    // the board stands between the tors and the road, facing the road
    const bx = site.x + (dx / dl) * 11 + (dz / dl) * 4;
    const bz = site.z + (dz / dl) * 11 - (dx / dl) * 4;
    const yaw = Math.atan2(dx, dz);
    const by = W.heightAt(bx, bz);
    const b = new ModelBuilder();
    for (const s of [-0.95, 0.95]) b.box(0.12, 2.2, 0.12, { pos: [s, 1.1, 0], color: 0x5a4028 });
    b.box(2.2, 0.12, 0.5, { pos: [0, 2.3, -0.05], rot: [0.25, 0, 0], color: 0x4a3420 });
    const frameMesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    frameMesh.position.set(bx, by, bz);
    frameMesh.rotation.y = yaw;
    this.group.add(frameMesh);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.12), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.8 }));
    face.position.set(bx + Math.sin(yaw) * 0.07, by + 1.45, bz + Math.cos(yaw) * 0.07);
    face.rotation.y = yaw;
    this.group.add(face);
    this.game.colliders.addCircle(bx, bz, 0.25, 'post');
    this.boardAt = { x: bx, z: bz };
    // a sign at the road pointing the way
    const sx = road.x - (dx / dl) * (ROAD_HALF + 1.4) - (dz / dl) * 2.5;
    const sz = road.z - (dz / dl) * (ROAD_HALF + 1.4) + (dx / dl) * 2.5;
    const sy = W.heightAt(sx, sz);
    const sb = new ModelBuilder();
    sb.box(0.1, 1.7, 0.1, { pos: [0, 0.85, 0], color: 0x5a4028 });
    const post = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    post.position.set(sx, sy, sz);
    this.group.add(post);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshStandardMaterial({ map: makeSignTexture('Granite Tors', 'Climbing · 4 top ropes', { aspect: 1.5 / 0.42, width: 1.5 }), roughness: 0.8, side: THREE.DoubleSide }));
    plate.position.set(sx, sy + 1.45, sz);
    plate.rotation.y = Math.atan2(road.tx, road.tz) + Math.PI / 2;
    this.group.add(plate);
    this.game.colliders.addCircle(sx, sz, 0.12, 'post');
  }

  route(id) {
    return this.routes.find((r) => r.id === id) || null;
  }

  // The top a walker stands on, if any.
  deckAt(p) {
    for (const t of Object.values(this.tors)) {
      const d = t.deck;
      if (!d) continue;
      const lx = (p.x - d.x) * Math.cos(d.yaw) - (p.z - d.z) * Math.sin(d.yaw);
      const lz = (p.x - d.x) * Math.sin(d.yaw) + (p.z - d.z) * Math.cos(d.yaw);
      if (Math.abs(lx) < d.hx + 0.3 && Math.abs(lz) < d.hz + 0.3 && Math.abs(p.y - d.top) < 1.5) return t;
    }
    return null;
  }

  update() {
    // nothing moves here; the climbing is in gameplay/climbing.js
  }
}

