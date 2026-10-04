// Hand-placed structures: where they stand (the layout), the bridges, the
// trailhead signs and the campfires, with the buildings themselves in
// world/buildings.js (Ruben's cabin, the Trading Post, the lighthouse and its
// keeper's house, the pier, the docks, the Bear Falls platform and the
// lookout) and the strange things in the woods in world/oddities.js. Each registers colliders, walkable decks and interaction points,
// and the static meshes merge into a few draws (mergeStatic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelBuilder } from '../util/builder.js';
import { makeSignTexture } from '../util/textures.js';
import { ROAD_HALF } from './worldgen.js';
import { buildAreas, areaAvoid } from './areas.js';
import { buildSecret, secretAvoid } from './secret.js';
import { makeFinishTextures, finishMaterial, ensureFinishAttributes } from './finish.js';
import { buildCabin, buildMailbox, buildTradingPost, buildLighthouse, lighthouseSpot, buildPier, buildDock, buildFallsPlatform, buildLookout, signPosts } from './buildings.js';
import { cabinSite, postSite } from './sites.js';
import { buildOddities, oddityAvoid } from './oddities.js';
import { smoothstep } from '../util/math.js';

// how high above the ground the darkening at the foot of a model reaches (m)
const GROUND_SHADE_H = 1.6;

const LOG = 0x7a5534;
const STEEL = 0x3e6b5a;
const CONCRETE = 0x9a968c;

export class Props {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.colliders = game.colliders;
    this.group = new THREE.Group();
    this.group.name = 'props';
    // wood, shingles, stone and metal on the parts that ask for them (see
    // world/finish.js); plain colour on the rest
    this.finishTex = makeFinishTextures();
    this.mat = finishMaterial(this.finishTex);
    this.metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x2a3036, toneMapped: false });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
    this.interactions = [];
    this.fires = [];
    this.smokePoints = [];
    // lit windows, lamps and fires that draw moths at night
    this.nightLights = [];
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
    out.push({ x: L.cabin.x, z: L.cabin.z, r: 14 });
    out.push({ x: L.outhouse.x, z: L.outhouse.z, r: 3 });
    out.push({ x: L.post.x, z: L.post.z, r: 22 });
    for (const b of W.bridges) {
      out.push({ x: b.x0, z: b.z0, r: 10 }, { x: b.x1, z: b.z1, r: 10 }, { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: 12 });
    }
    for (const p of W.places) if (p.dock) out.push({ x: p.dock.x0, z: p.dock.z0, r: 8 });
    out.push({ x: L.falls.x, z: L.falls.z, r: 8 });
    out.push({ x: L.lookout.x, z: L.lookout.z, r: 8 });
    out.push({ x: L.light.x, z: L.light.z, r: 20 });
    // the tower stands on the highest dry ground near its place, the
    // keeper's house beside it
    const lt = lighthouseSpot(W, L.light);
    out.push({ x: lt.x, z: lt.z, r: 9 }, { x: lt.keeper.x, z: lt.keeper.z, r: 10 });
    for (const pk of Object.values(L.parking)) out.push({ x: pk.x, z: pk.z, r: 7 });
    for (const fr of L.fires) out.push({ x: fr.x, z: fr.z, r: 4 });
    out.push(...areaAvoid(W));
    out.push(...secretAvoid());
    out.push(...oddityAvoid());
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
    // the cabin above Hotrod Landing and the Trading Post by the junction
    // (see world/sites.js: the world has levelled their yards)
    L.cabin = cabinSite(W);
    const landing = W.place('landing');
    const d = { x: -Math.sin(landing.face), z: -Math.cos(landing.face) }; // toward water
    const r = { x: -d.z, z: d.x };
    L.outhouse = { x: L.cabin.x - d.x * 12 - r.x * 9, z: L.cabin.z - d.z * 12 - r.z * 9, yaw: L.cabin.yaw };
    L.post = postSite(W);
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
      // (at the wreck the stand is out on her deck: park by the beach)
      const ax = p.parkX ?? p.x;
      const az = p.parkZ ?? p.z;
      const n = this.nearestRoad(ax, az);
      if (!n) continue;
      // parking bay beside the road, on the side facing the place
      let sx = ax - n.x;
      let sz = az - n.z;
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
    buildCabin(this, L.cabin, L.outhouse);
    buildMailbox(this, L.cabin);
    buildTradingPost(this, L.post);
    for (const b of this.world.bridges) this.buildBridge(b);
    for (const p of this.world.places) if (p.dock) (p.dock.pier ? buildPier(this, p) : buildDock(this, p));
    buildFallsPlatform(this, L.falls);
    buildLighthouse(this, L.light);
    buildLookout(this, L.lookout);
    this.buildSigns(L);
    this.buildCampfires(L.fires);
    this.buildGlacierProps();
    buildAreas(this, L);
    buildSecret(this);
    buildOddities(this);
    this.mergeStatic();
    return this.group;
  }

  // Merge the static meshes that share a material into one mesh per 160 m
  // cell: far fewer draw calls in the view and in both shadow cascades.
  mergeStatic() {
    const keep = new Set([this.lantern, this.flag, this.beam, ...(this.bobbers || [])]);
    this.groundShade(keep);
    const groups = new Map();
    for (const m of [...this.group.children]) {
      // signs carry one material per face: merging them would draw nothing
      if (!m.isMesh || keep.has(m) || m.matrixAutoUpdate || Array.isArray(m.material)) continue;
      const g = m.geometry;
      const key = [
        m.material.uuid,
        m.castShadow ? 1 : 0,
        Math.floor(m.position.x / 160),
        Math.floor(m.position.z / 160),
        Object.keys(g.attributes).sort().join(','),
        g.index ? 'i' : 'n',
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const first = list[0];
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'props-merged';
      for (const m of list) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      for (const g of geos) g.dispose();
      this.group.add(mesh);
    }
  }

  // Darker where things meet the ground: the soil, the shade and the light
  // the ground cannot bounce back under them, baked into the vertex colours
  // of every static model with vertex colours (glass and lamps have none).
  // Worked out in world space on a copy of each geometry, since one geometry
  // can stand in several places.
  groundShade(keep) {
    const W = this.world;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    const box = new THREE.Box3();
    for (const m of this.group.children) {
      if (!m.isMesh || keep.has(m) || m.matrixAutoUpdate || !m.material || Array.isArray(m.material)) continue;
      if (!m.material.vertexColors || m.material.transparent) continue;
      const src = m.geometry;
      if (!src.attributes.color || !src.attributes.position) continue;
      m.updateMatrix();
      // the highest ground under the model: vertices well above it need no work
      if (!src.boundingBox) src.computeBoundingBox();
      box.copy(src.boundingBox).applyMatrix4(m.matrix);
      if (box.max.x - box.min.x > 400 || box.max.z - box.min.z > 400) continue;
      let top = -Infinity;
      for (const [x, z] of [
        [box.min.x, box.min.z],
        [box.max.x, box.min.z],
        [box.min.x, box.max.z],
        [box.max.x, box.max.z],
        [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2],
      ]) {
        top = Math.max(top, W.heightAt(x, z));
      }
      if (box.min.y > top + GROUND_SHADE_H) continue;
      const geo = src.clone();
      const pos = geo.attributes.position;
      const col = geo.attributes.color;
      const nrm = geo.attributes.normal;
      nm.getNormalMatrix(m.matrix);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
        if (v.y > top + GROUND_SHADE_H) continue;
        let k = 0.68 + 0.32 * smoothstep(-0.1, GROUND_SHADE_H, v.y - W.heightAt(v.x, v.z));
        // a face turned up to the open sky (a deck, a table top, a log's
        // top) is not shaded by the ground: only sides and undersides are
        if (nrm) k += (1 - k) * Math.max(0, n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize().y);
        if (k >= 0.999) continue;
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
      m.geometry = geo;
    }
  }

  addMesh(geo, x, y, z, yaw, mat = this.mat, { shadow = true } = {}) {
    // every mesh in a finish material carries the finish attributes, so
    // they all merge together
    if (mat.userData.finish) ensureFinishAttributes(geo);
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
    b.box(hw * 2 + 0.4, 0.5, len, { pos: [0, -0.3, 0], color: 0x55524c, surf: 'concrete' });
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
    for (const s of [-1, 1]) b.box(hw * 2 + 2, 5, 3, { pos: [0, -2.9, s * (len / 2 - 0.5)], color: CONCRETE, surf: 'concrete' });
    const riverBed = this.world.heightAt(cx, cz);
    const pierH = deck - riverBed + 2;
    b.box(2.2, pierH, 2.2, { pos: [0, -pierH / 2, 0], color: CONCRETE, surf: 'concrete' });
    this.addMesh(b.build(), cx, deck, cz, yaw);
    // colliders: truss walls and walkable deck
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const side of [-1, 1]) {
      const ox = side * (hw + 0.1);
      this.colliders.addBox(cx + ox * c, cz - ox * s, 0.25, len / 2, yaw, deck - 1, deck + 6);
    }
    this.colliders.addDeck(cx, cz, hw, len / 2 + 0.5, yaw, deck + 0.08, { bridge: true });
    // the middle pier, solid below the deck: the boat goes round it
    this.colliders.addBox(cx, cz, 1.1, 1.1, yaw, -50, deck - 0.6);
  }

  // ---------------------------------------------------------- glacier lake
  buildGlacierProps() {
    const p = this.world.place('glacier');
    const d = { x: -Math.sin(p.face), z: -Math.cos(p.face) };
    const x = p.x + d.z * 5 - d.x * 1;
    const z = p.z - d.x * 5 - d.z * 1;
    // a kayak pulled up on the shore: its cockpit, the deck lines and the
    // paddle beside it
    const b = new ModelBuilder();
    b.sphere(1, 14, 6, { pos: [0, 0.3, 0], scale: [0.45, 0.3, 2.3], color: 0xc9731c });
    b.sphere(1, 12, 4, { pos: [0, 0.56, 0.1], scale: [0.25, 0.06, 0.45], color: 0x1a1a1a });
    b.torus(1, 0.03, 4, 18, { pos: [0, 0.58, 0.1], rot: [Math.PI / 2, 0, 0], scale: [0.27, 0.47, 1], color: 0x2a2a2a, jitter: 0 });
    for (const sz of [-1.2, 1.2]) b.box(0.5, 0.02, 0.02, { pos: [0, 0.55, sz], color: 0x222222, jitter: 0 });
    b.beam([0.75, 0.04, -1.0], [0.62, 0.04, 1.1], 0.017, 5, { color: 0x2a2a2a });
    for (const [ex, ez] of [
      [0.76, -1.1],
      [0.61, 1.2],
    ]) b.box(0.15, 0.015, 0.42, { pos: [ex, 0.05, ez], rot: [0, 0.06, 0], color: 0xe2b42a });
    this.addMesh(b.build(), x, this.world.heightAt(x, z) + 0.05, z, p.face + 0.4);
    this.colliders.addCircle(x, z, 1.0).hi = 0.6;
  }

  // ------------------------------------------------------------- signs
  addSign(text, sub, x, y, z, yaw, w, h, opts = {}) {
    // the board is plain wood, merged with the other boards nearby; the
    // painted face is one more draw, just proud of its front
    if (!this.signBack) this.signBack = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), this.signBack);
    board.position.set(x, y, z);
    board.rotation.y = yaw;
    board.castShadow = true;
    board.updateMatrix();
    board.matrixAutoUpdate = false;
    this.group.add(board);
    // (the picture in the board's own shape and about 100 texels a metre)
    const mat = new THREE.MeshStandardMaterial({ map: makeSignTexture(text, sub, { ...opts, aspect: w / h, width: w }), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.set(x + Math.sin(yaw) * 0.043, y, z + Math.cos(yaw) * 0.043);
    face.rotation.y = yaw;
    face.updateMatrix();
    face.matrixAutoUpdate = false;
    this.group.add(face);
    return face;
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
      springs: ['Steaming Springs', 'Trout · Geyser · Hot pool'],
      flats: ['Mosquito Flats', 'Pike · Sheefish · Bring bug dope'],
      wreck: ['Shipwreck Cove', 'Rockfish · Lingcod · Wolf eel'],
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
      signPosts(post, 2.9, 2.3);
      this.addMesh(post.build(), x, y, z, yaw);
      this.addSign(title, sub, x, y + 1.75, z, yaw, 2.9, 1.1);
      this.colliders.addBox(x, z, 1.4, 0.15, yaw);
    }
    // junction signpost at the Trading Post
    const jx = -60 + 9;
    const jz = 428 - 7;
    const jy = W.heightAt(jx, jz);
    const pole = new ModelBuilder();
    pole.cyl(0.11, 0.13, 3.9, 9, { pos: [0, 1.8, 0], color: 0x7a5a3a, surf: 'log' });
    pole.cone(0.13, 0.22, 9, { pos: [0, 3.86, 0], color: 0x5a4a3a });
    this.addMesh(pole.build(), jx, jy, jz, 0);
    this.colliders.addCircle(jx, jz, 0.2).hi = 4.0;
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
      // a log seat and a stump
      b.cyl(0.25, 0.25, 1.8, 9, { pos: [0, 0.22, 2.0], rot: [0, 0.3, Math.PI / 2], color: LOG, surf: 'log' });
      b.cyl(0.24, 0.24, 0.02, 9, { pos: [Math.cos(0.3) * 0.91, 0.22, 2.0 - Math.sin(0.3) * 0.91], rot: [0, 0.3, Math.PI / 2], color: 0xc9a46a, jitter: 0 });
      b.cyl(0.24, 0.24, 0.02, 9, { pos: [-Math.cos(0.3) * 0.91, 0.22, 2.0 + Math.sin(0.3) * 0.91], rot: [0, 0.3, Math.PI / 2], color: 0xc9a46a, jitter: 0 });
      b.cyl(0.26, 0.3, 0.45, 9, { pos: [-1.9, 0.2, -0.6], color: 0x6a4a30, surf: 'log' });
      b.cyl(0.26, 0.26, 0.02, 9, { pos: [-1.9, 0.43, -0.6], color: 0xc9a46a, jitter: 0 });
      this.addMesh(b.build(), x, y, z, 0);
      this.colliders.addCircle(x, z, 0.9).hi = 0.6;
      this.fires.push({ x, y, z, id });
      this.nightLights.push(new THREE.Vector3(x, y + 1.4, z));
    }
  }

  // Night-time glow, flag waving, bobbing boats, lighthouse beam.
  update(dt, t, env) {
    const night = env.night;
    // window glass: dark by day (the rooms are darker than outside), warm
    // lamplight through it at night
    const glow = night;
    this.glowMat.color.setRGB(0.13 + glow * 1.43, 0.15 + glow * 0.99, 0.17 + glow * 0.42);
    this.lampMat.color.setRGB(0.3 + night * 2.2, 0.28 + night * 1.9, 0.22 + night * 1.2);
    // the strange things' own lights: toadstool spots, runes, the saucer
    if (this.oddGlowMat) this.oddGlowMat.color.setScalar(0.45 + night * 1.5);
    if (this.oddNightMat) {
      this.oddNightMat.opacity = night * 0.6;
      this.oddNightMat.visible = night > 0.02;
    }
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
