// Busts of famous scientists on granite plinths all over Kenai Country, each
// by a place their work belongs to (see scientistdata.js), with a bronze
// plaque on the front to read. The busts are sculpted from their looks by
// a worker while the title is up (world/bustcore.js, workers/sculpt.js), so
// no frame waits for them; where no worker can be had, the nearest is
// sculpted a little at a time on the main thread instead.
//
// Cheap to draw: the 34 plinths are one mesh and the plaques another, with
// every plaque's lettering in one texture; the busts share two materials,
// and the culling of small parts leaves out the ones too far away to see.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { ROAD_HALF } from './worldgen.js';
import { frame, groundRange } from './buildings.js';
import { clearGrass } from './worldtex.js';
import { graniteTex } from './tesla.js';
import { SCIENTISTS, GROUPS } from './scientistdata.js';
import { bustArraysSteps, packBust } from './bustcore.js';

// the busts at a little under life size, on plinths that put their eyes a
// little under yours
const SCALE = 0.85;
const TOP = 1.16;
// beyond this a bust (about 30 pixels tall on a phone) is drawn from its
// lighter copy; the margin keeps it from switching back and forth
const COARSE_AT = 22;
const COARSE_MARGIN = 2;
// what is cleared round a plinth: trees, shrubs and stones, and the grass
const FELL = 2.8;
const FELLABLE = new Set(['tree', 'shrub', 'rock']);
// the plaques' lettering: one texture, a cell each
const COLS = 6;
const ROWS = 6;
const ATLAS_W = 2048;
const ATLAS_H = 1024;
// plinth tints, granite from three quarries
const TINTS = [0xf4f0ec, 0xf8e4da, 0xd6d4d2];

function dropArray() {
  this.array = null;
}

// Packed arrays (see packBust) as geometry. Unless kept, the arrays are let
// go once they are on the graphics chip (a bust never changes); a lost and
// restored graphics context then needs the bust sculpted again (see
// Scientists.restored).
function bustGeometry(a, keep = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(a.color, 3, true));
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  g.computeBoundingSphere();
  if (!keep) for (const at of [g.attributes.position, g.attributes.normal, g.attributes.color, g.index]) at.onUpload(dropArray);
  return g;
}

// A stand-in until the bust is sculpted, in the same formats (the drawing
// set up for it while loading then fits the bust).
function placeholder() {
  const s = new THREE.OctahedronGeometry(0.05);
  const pos = s.attributes.position.array;
  const n = pos.length / 3;
  const index = new Uint32Array(n);
  for (let i = 0; i < n; i++) index[i] = i;
  return bustGeometry(packBust({ position: new Float32Array(pos), normal: new Float32Array(s.attributes.normal.array), color: new Float32Array(n * 3).fill(0.3), index }), true);
}

// The lettering of every plaque: a cell each, bronze with raised letters.
function plaqueAtlas() {
  return canvasTexture(ATLAS_W, ATLAS_H, (g, W, H) => {
    const cw = W / COLS;
    const ch = H / ROWS;
    SCIENTISTS.forEach((s, i) => {
      const x0 = (i % COLS) * cw;
      const y0 = Math.floor(i / COLS) * ch;
      const grd = g.createLinearGradient(x0, y0, x0 + cw, y0 + ch);
      grd.addColorStop(0, '#6a4e2c');
      grd.addColorStop(1, '#43311c');
      g.fillStyle = grd;
      g.fillRect(x0, y0, cw, ch);
      g.strokeStyle = '#b08a52';
      g.lineWidth = 6;
      g.strokeRect(x0 + 8, y0 + 8, cw - 16, ch - 16);
      g.lineWidth = 2;
      g.strokeRect(x0 + 16, y0 + 16, cw - 32, ch - 32);
      const text = (str, y, size, weight, color) => {
        let px = size;
        g.font = `${weight} ${px}px Georgia, "Times New Roman", serif`;
        // shrink a long line to fit inside the border
        while (g.measureText(str).width > cw - 52 && px > 10) {
          px -= 1;
          g.font = `${weight} ${px}px Georgia, "Times New Roman", serif`;
        }
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(str, x0 + cw / 2 + 2, y0 + y + 2);
        g.fillStyle = color;
        g.fillText(str, x0 + cw / 2, y0 + y);
      };
      text(s.name.toUpperCase(), ch * 0.34, 30, 700, '#ecd29a');
      text(s.years, ch * 0.56, 22, 600, '#dcbf86');
      text(s.line, ch * 0.76, 20, 500, '#d0b07a');
    });
  });
}

export class Scientists {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'scientists';
    this.sites = [];
    this.byId = {};
    this.workers = [];
    this.queue = [];
    this.fallback = false;
    this.sculpting = null;
    this.done = 0;
    for (const s of SCIENTISTS) this.site(s);
    this.buildPlinths();
    this.buildPlaques();
    this.buildBusts();
    game.scene.add(this.group);
    this.startSculpting();
    // a phone can take the graphics context away (in the background, short
    // of memory) and give it back: three.js then uploads everything again
    game.renderer.domElement.addEventListener('webglcontextrestored', () => this.restored());
  }

  // ------------------------------------------------------------ placing
  anchor(G) {
    const g = this.game;
    const W = g.world;
    const L = g.props.layout;
    let at = null;
    let toward = null;
    if (G.place) {
      const p = W.place(G.place);
      at = { x: p.x, z: p.z };
      const k = L.parking[G.place];
      if (k) toward = k;
    } else if (G.parking) {
      at = { x: L.parking[G.parking].x, z: L.parking[G.parking].z };
      const p = W.place(G.parking);
      // up from the shore, away from the water
      if (p) toward = { x: 2 * at.x - p.x, z: 2 * at.z - p.z };
    } else if (G.point === 'cabin') {
      at = { x: L.cabin.x, z: L.cabin.z };
      const land = W.place('landing');
      // into the trees behind the cabin, away from the landing
      toward = { x: 2 * at.x - land.x, z: 2 * at.z - land.z };
    } else {
      const sign = g.solarwalk.signs.find((s) => s.id === G.point);
      at = { x: sign.x, z: sign.z };
      const road = g.props.nearestRoad(sign.x, sign.z);
      if (road) toward = { x: 2 * sign.x - road.x, z: 2 * sign.z - road.z };
    }
    const bearing = toward ? Math.atan2(toward.x - at.x, toward.z - at.z) : 0;
    return { x: at.x, z: at.z, bearing };
  }

  // Whether a plinth can stand at x, z: dry, gentle ground off the roads,
  // clear of buildings, decks, posts, things to use, parking, the places
  // themselves and the other busts.
  fits(x, z, G) {
    const g = this.game;
    const W = g.world;
    const C = g.colliders;
    const P = g.props;
    if (!W.inBounds(x, z, 12)) return false;
    if (W.heightAt(x, z) < 1.2) return false;
    for (const [dx, dz] of [[0, 0], [2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2]]) if (W.waterAt(x + dx, z + dz)) return false;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0], [0, 1.1]]) {
      const y = W.heightAt(x + dx, z + dz);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    if (hi - lo > 0.32 || W.slopeAt(x, z) > 0.42) return false;
    if (G.forest && W.forest[W.cellIndex(x, z)] < 80) return false;
    const road = P.nearestRoad(x, z);
    if (road && road.d < ROAD_HALF + 2.4) return false;
    for (const d of [[0, 0], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]]) if (C.deckAt(x + d[0], z + d[1]) !== null) return false;
    for (const b of C.boxes) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > (b.radius + 3) ** 2) continue;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      const ox = Math.max(0, Math.abs(lx) - b.hx);
      const oz = Math.max(0, Math.abs(lz) - b.hz);
      if (ox * ox + oz * oz < 1.8 * 1.8) return false;
    }
    for (const c of C.circlesNear(x, z, 4)) {
      if (FELLABLE.has(c.tag)) continue;
      if (Math.hypot(c.x - x, c.z - z) < c.r + 1.5) return false;
    }
    for (const it of P.interactions) if (Math.hypot(it.x - x, it.z - z) < (it.r || 2) + 2.5) return false;
    for (const k of Object.values(P.layout.parking)) if (Math.hypot(k.x - x, k.z - z) < 7) return false;
    for (const p of W.places) if (Math.hypot(p.x - x, p.z - z) < 5) return false;
    for (const s of this.sites) if (Math.hypot(s.x - x, s.z - z) < 6) return false;
    return true;
  }

  // The first spot that fits on rings out from the group's middle, starting
  // on the side people arrive from and working round both ways.
  site(s) {
    const G = GROUPS[s.at];
    const A = this.anchor(G);
    let spot = null;
    for (let r = G.r0; r <= G.r1 && !spot; r += 1.5) {
      const step = Math.min(0.35, 2.4 / r);
      const n = Math.ceil(Math.PI / step);
      for (let k = 0; k <= n && !spot; k++) {
        for (const side of k ? [1, -1] : [1]) {
          const a = A.bearing + side * k * step;
          const x = A.x + Math.sin(a) * r;
          const z = A.z + Math.cos(a) * r;
          if (this.fits(x, z, G)) {
            spot = { x, z };
            break;
          }
        }
      }
    }
    if (!spot) return;
    const g = this.game;
    const W = g.world;
    // facing the middle of the group's place
    const yaw = Math.atan2(A.x - spot.x, A.z - spot.z);
    const f = frame(spot.x, spot.z, yaw);
    const gr = groundRange(W, f, -0.36, 0.36, -0.36, 0.36, 0.18);
    const site = { s, x: spot.x, z: spot.z, yaw, f, base: gr.hi, low: gr.lo, mesh: null, ready: false };
    site.top = site.base + TOP;
    this.sites.push(site);
    this.byId[s.id] = site;
    this.clear(site);
    // the plinth to walk round, and the plaque to read from in front of it
    g.colliders.addCircle(site.x, site.z, 0.42, 'post');
    const [ix, iz] = f.to(0, 1.05);
    g.props.interactions.push({ id: 'bust:' + s.id, x: ix, z: iz, r: 2.3, y: W.heightAt(ix, iz) });
  }

  // Fell what grows round the plinth, and the grass under it.
  clear(site) {
    const g = this.game;
    const S = g.scatter;
    const R2 = FELL * FELL;
    for (const t of Object.values(S.types)) {
      for (let i = 0; i < t.count; i++) {
        const dx = t.x[i] - site.x;
        const dz = t.z[i] - site.z;
        if (dx * dx + dz * dz < R2) t.x[i] = 1e6;
      }
    }
    g.colliders.removeCircles(site.x - FELL, site.z - FELL, site.x + FELL, site.z + FELL, (c) => FELLABLE.has(c.tag) && (c.x - site.x) ** 2 + (c.z - site.z) ** 2 < R2);
    clearGrass(g, site.x, site.z, 1.3);
    S.lastPos.set(1e9, 0, 0);
  }

  // ------------------------------------------------------------ building
  // Every plinth in one mesh: a slab set into the ground, a tapering shaft
  // and a capstone, in granite with its grain the same size on every face.
  buildPlinths() {
    const parts = [];
    const sq = (w) => (w / 2) * Math.SQRT2;
    this.sites.forEach((site, i) => {
      const b = new ModelBuilder({ uvs: true });
      const color = TINTS[i % TINTS.length];
      const depth = site.base - site.low + 0.35;
      b.add(new THREE.BoxGeometry(0.66, 0.16 + depth, 0.66).translate(0, 0.16 - (0.16 + depth) / 2, 0), { color, jitter: 0 });
      const shaft = new THREE.CylinderGeometry(sq(0.44), sq(0.5), 0.9, 4, 1);
      shaft.rotateY(Math.PI / 4);
      shaft.translate(0, 0.16 + 0.45, 0);
      b.add(shaft, { color, jitter: 0 });
      b.add(new THREE.BoxGeometry(0.56, 0.1, 0.56).translate(0, TOP - 0.05, 0), { color, jitter: 0 });
      const geo = b.build();
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let k = 0; k < pos.count; k++) {
        const ax = Math.abs(nrm.getX(k));
        const ay = Math.abs(nrm.getY(k));
        const az = Math.abs(nrm.getZ(k));
        // a different patch of the grain for each plinth
        const o = i * 0.37;
        if (ay >= ax && ay >= az) uv.setXY(k, pos.getX(k) / 1.2 + o, pos.getZ(k) / 1.2);
        else if (ax >= az) uv.setXY(k, pos.getZ(k) / 1.2 + o, pos.getY(k) / 1.2);
        else uv.setXY(k, pos.getX(k) / 1.2 + o, pos.getY(k) / 1.2);
      }
      geo.rotateY(site.yaw);
      geo.translate(site.x, site.base, site.z);
      parts.push(geo);
    });
    if (!parts.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: graniteTex(), vertexColors: true, roughness: 0.34, metalness: 0.05 });
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.name = 'scientist-plinths';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    for (const p of parts) p.dispose();
  }

  // Every plaque in one mesh, each showing its own cell of the lettering,
  // on the shaft's sloping front face.
  buildPlaques() {
    const parts = [];
    const slope = Math.atan2(0.03, 0.9);
    const y = 0.66;
    const zf = (0.5 - (0.06 * (y - 0.16)) / 0.9) / 2 + 0.004;
    for (const site of this.sites) {
      const i = SCIENTISTS.indexOf(site.s);
      const geo = new THREE.PlaneGeometry(0.36, 0.18);
      const u0 = (i % COLS) / COLS;
      const v1 = 1 - Math.floor(i / COLS) / ROWS;
      const v0 = v1 - 1 / ROWS;
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / COLS, v0 + uv.getY(k) / ROWS);
      geo.rotateX(-slope);
      geo.translate(0, y, zf);
      geo.rotateY(site.yaw);
      geo.translate(site.x, site.base, site.z);
      parts.push(geo);
    }
    if (!parts.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: plaqueAtlas(), roughness: 0.45, metalness: 0.55 });
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.name = 'scientist-plaques';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    for (const p of parts) p.dispose();
  }

  // A mesh for each bust, waiting for its sculpture.
  buildBusts() {
    // weathered bronze (its green verdigris is not a metal)
    this.bronze = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35 });
    this.marble = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });
    const stand = placeholder();
    for (const site of this.sites) {
      const mesh = new THREE.Mesh(stand, site.s.look.finish === 'marble' ? this.marble : this.bronze);
      mesh.name = 'bust-' + site.s.id;
      mesh.position.set(site.x, site.top, site.z);
      mesh.rotation.y = site.yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      site.mesh = mesh;
      this.group.add(mesh);
    }
  }

  // ------------------------------------------------------------ sculpting
  // Nearest the start of the game first (or in the order already queued).
  startSculpting(fresh = true) {
    const g = this.game;
    const start = g.world.place('landing');
    if (fresh) this.queue = this.sites.slice().sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
    let src = null;
    try {
      src = typeof __SCULPT_WORKER__ === 'string' ? __SCULPT_WORKER__ : null;
    } catch (e) {
      src = null;
    }
    if (src && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        // one or two, leaving the phone a core or more for the game
        const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
        for (let i = 0; i < n; i++) {
          const w = new Worker(url);
          w.onmessage = (e) => this.receive(w, e.data);
          w.onerror = (e) => {
            e.preventDefault?.();
            this.lost(w);
          };
          this.workers.push(w);
          this.feed(w);
        }
        return;
      } catch (e) {
        for (const w of this.workers) w.terminate();
        this.workers = [];
      }
    }
    this.fallback = true;
  }

  feed(w) {
    const site = this.queue.shift();
    w.busy = site || null;
    if (!site) {
      w.terminate();
      this.workers = this.workers.filter((x) => x !== w);
      return;
    }
    w.postMessage({ id: site.s.id, look: site.s.look, scale: SCALE });
  }

  receive(w, d) {
    const site = this.byId[d.id];
    if (site && !site.ready) {
      if (d.error) this.queue.push(site);
      else this.finish(site, d.fine, d.coarse);
    }
    // a worker that fails every time leaves the rest to the main thread
    if (d.error) this.lost(w);
    else this.feed(w);
  }

  lost(w) {
    if (w.busy && !w.busy.ready && !this.queue.includes(w.busy)) this.queue.unshift(w.busy);
    w.busy = null;
    w.terminate();
    this.workers = this.workers.filter((x) => x !== w);
    if (!this.workers.length && this.queue.length) this.fallback = true;
  }

  finish(site, fine, coarse) {
    // the light copy keeps its arrays (a few MB for all of them), so a
    // restored context can draw it at once
    site.fine = bustGeometry(fine);
    if (site.coarse) site.coarse.dispose();
    site.coarse = bustGeometry(coarse, true);
    site.near = null;
    site.mesh.geometry = site.coarse;
    site.mesh.visible = true;
    site.ready = true;
    this.done++;
    this.lodT = 0;
  }

  update() {
    this.updateDetail();
    this.sculptHere();
  }

  // The fine bust close up, the light one further off: a few times a
  // second, or at once after a jump.
  updateDetail() {
    const c = this.game.camera.position;
    const jumped = this.lastCam && this.lastCam.distanceToSquared(c) > 400;
    this.lodT = (this.lodT || 0) - 1;
    if (this.lodT > 0 && !jumped) return;
    this.lodT = 8;
    this.lastCam = (this.lastCam || new THREE.Vector3()).copy(c);
    for (const site of this.sites) {
      if (!site.ready) continue;
      const d = Math.hypot(site.x - c.x, site.top - c.y, site.z - c.z);
      const near = site.near ? d < COARSE_AT + COARSE_MARGIN : d < COARSE_AT;
      if (near === site.near) continue;
      site.near = near;
      site.mesh.geometry = near ? site.fine : site.coarse;
    }
  }

  // The graphics context was lost and is back: the fine busts let their
  // arrays go, so they show their light copies while they are sculpted again.
  restored() {
    const c = this.game.camera.position;
    for (const site of this.sites) {
      if (!site.ready) continue;
      site.fine?.dispose();
      site.fine = null;
      site.mesh.geometry = site.coarse;
      site.near = false;
      site.ready = false;
      this.done--;
      if (!this.queue.includes(site)) this.queue.push(site);
    }
    this.queue.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    if (!this.workers.length && !this.fallback) this.startSculpting(false);
  }

  // Without a worker: the nearest bust within a walk, a little a frame.
  sculptHere() {
    if (!this.fallback || (!this.queue.length && !this.sculpting)) return;
    const g = this.game;
    if (!this.sculpting) {
      const c = g.camera.position;
      let best = null;
      let bd = 260;
      for (const s of this.queue) {
        const d = Math.hypot(s.x - c.x, s.z - c.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) return;
      this.queue = this.queue.filter((s) => s !== best);
      this.sculpting = { site: best, it: this.both(best.s.look) };
    }
    // within what is left of the frame's sculpting budget (see main.js)
    const ms = Math.min(2, g.sculptLeft ?? 2);
    if (ms <= 0) return;
    const t0 = performance.now();
    let r;
    try {
      r = this.sculpting.it.next();
      while (!r.done && performance.now() - t0 < ms) r = this.sculpting.it.next();
    } catch (e) {
      // a bust that cannot be sculpted stays on its plinth unmade, rather
      // than stopping every frame after it
      this.sculpting = null;
      return;
    }
    if (g.sculptLeft !== undefined) g.sculptLeft -= performance.now() - t0;
    if (!r.done) return;
    this.finish(this.sculpting.site, r.value.fine, r.value.coarse);
    this.sculpting = null;
  }

  // Both copies of a bust, a little at a time.
  *both(look) {
    const fine = packBust(yield* bustArraysSteps(look, SCALE));
    const coarse = packBust(yield* bustArraysSteps(look, SCALE, true));
    return { fine, coarse };
  }

  // Every bust at once (for tests and pictures).
  finishAll() {
    const rest = [...this.queue];
    // the ones the workers had in hand too
    for (const w of this.workers) {
      if (w.busy && !w.busy.ready) rest.push(w.busy);
      w.terminate();
    }
    this.workers = [];
    if (this.sculpting) rest.unshift(this.sculpting.site);
    this.queue = [];
    this.sculpting = null;
    for (const site of rest) {
      if (site.ready) continue;
      const it = this.both(site.s.look);
      let r = it.next();
      while (!r.done) r = it.next();
      this.finish(site, r.value.fine, r.value.coarse);
    }
  }

  // Where a bust stands (for the Journal and tests).
  where(id) {
    const site = this.byId[id];
    return site ? { x: site.x, z: site.z, y: site.top } : null;
  }
}
