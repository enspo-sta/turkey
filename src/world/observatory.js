// The Tundra Observatory: a small dome on the open tundra above the
// treeline, far from any lights, where the sky is darkest. Inside the dome
// a half-metre telescope (see ui/screens.js for what it shows); beside it a
// six-metre radio dish that hears pulsars, Jupiter's storms and the Big
// Bang's afterglow through any cloud; a deck with two reclining chairs
// facing north-west, where the skyline is lowest, for watching the sky and
// the aurora; a notice board with the
// night's almanac; a weather mast and an all-sky meteor camera. The dome
// turns and opens its shutter at night, the telescope and the dish point at
// what they are looking at, and the lamps are red, as at every observatory,
// so eyes stay used to the dark.
//
// Everything is added after the world is made: the trees and shrubs on the
// site are felled the way the race car's clearing is (world/pitstop.js), so
// the rest of the forest stays exactly as it was.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { makeSignTexture } from '../util/textures.js';
import { ROAD_HALF } from './worldgen.js';
import { frame, groundRange } from './buildings.js';
import { smoothstep, damp, segDist } from '../util/math.js';
import { eqVector, altAz } from './astro.js';
import { almanac, almanacLines, upcomingNight } from '../gameplay/tonight.js';

export const OBSERVATORY = { x: 656, z: -449 };

const R = 3.1; // dome radius
const SLIT = 0.55; // half the slit's width
const DRUM = 2.7; // drum height
const WHITE = 0xe9e7e1;
const CONCRETE = 0x9a968c;
const STEEL = 0x56606a;
const DARK = 0x24282c;
const WOOD = 0x7a5a3c;
const WOOD_DARK = 0x4e3826;
const DEG = Math.PI / 180;

// Panel seams on the dome: meridians and three rings.
function domeTexture() {
  return canvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = '#f4f2ec';
    g.fillRect(0, 0, W, H);
    // weathering: faint streaks running down from the top
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * W;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(120,120,110,0)');
      grad.addColorStop(1, 'rgba(120,120,110,0.12)');
      g.fillStyle = grad;
      g.fillRect(x, H * Math.random() * 0.5, 1 + Math.random() * 3, H);
    }
    g.strokeStyle = 'rgba(90,92,96,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo((i / 8) * W, 0);
      g.lineTo((i / 8) * W, H);
      g.stroke();
    }
    for (const v of [0.3, 0.55, 0.78]) {
      g.beginPath();
      g.moveTo(0, v * H);
      g.lineTo(W, v * H);
      g.stroke();
    }
    // rivets along the seams
    g.fillStyle = 'rgba(70,72,76,0.6)';
    for (let i = 0; i <= 8; i++) for (let y = 4; y < H; y += 14) g.fillRect((i / 8) * W - 1, y, 2, 2);
  });
}

// The board's printed sheet: the night's almanac.
function drawBoard(g, W, H, A) {
  g.fillStyle = '#1c2a3a';
  g.fillRect(0, 0, W, H);
  // the pinned sheet
  g.fillStyle = '#f2efe6';
  g.fillRect(28, 26, W - 56, H - 52);
  g.fillStyle = '#1c2a3a';
  g.font = '800 46px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('TUNDRA OBSERVATORY · TONIGHT', 54, 44);
  g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillStyle = '#7a2e22';
  g.fillText(A.date + ' · sunset 22:00 · dark 23:00 to 04:00 · sunrise 05:00', 54, 98);
  g.fillStyle = '#20262c';
  let y = 146;
  const wrap = (text, x, maxW, lh) => {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) {
        g.fillText(line, x, y);
        y += lh;
        line = w;
      } else line = t;
    }
    if (line) g.fillText(line, x, y);
    y += lh;
  };
  for (const [k, v] of almanacLines(A)) {
    g.font = '800 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText(k.toUpperCase(), 54, y);
    g.font = '500 28px "Barlow Condensed", "Arial Narrow", sans-serif';
    wrap(v, 230, W - 300, 32);
    y += 8;
  }
  // a drawing pin in each corner
  for (const [x, yy] of [
    [40, 38],
    [W - 40, 38],
    [40, H - 38],
    [W - 40, H - 38],
  ]) {
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(x, yy, 7, 0, Math.PI * 2);
    g.fill();
  }
}

// The slit's shutter: a band across the slit following the dome, from
// angle a0 to a1 over the top (0 at the front of the spring line).
function band(a0, a1, r, w, steps = 18) {
  const pos = [];
  const nrm = [];
  const idx = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const y = Math.sin(a);
    const z = Math.cos(a);
    for (const x of [-w, w]) {
      pos.push(x, y * r, z * r);
      nrm.push(0, y, z);
    }
    if (i < steps) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export class Observatory {
  constructor(game) {
    this.game = game;
    const W = game.world;
    const P = game.props;
    const C = game.colliders;
    this.group = new THREE.Group();
    this.group.name = 'observatory';
    const site = OBSERVATORY;
    // the front faces the road
    const road = P.nearestRoad(site.x, site.z);
    let dx = road.x - site.x;
    let dz = road.z - site.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    this.yaw = Math.atan2(dx, dz);
    const f = frame(site.x, site.z, this.yaw);
    this.f = f;
    // where everything stands: offsets east and south of the dome
    const at = (ex, ez) => ({ x: site.x + ex, z: site.z + ez });
    this.deckAt = at(0, -7.6);
    this.dishAt = at(-5.5, 10.5);
    this.hutAt = at(6.2, -1.2);
    this.mastAt = at(5.2, 6.4);
    this.camAt = at(2.8, 7.2);
    const [bx, bz] = f.to(2.3, 7.4);
    this.boardAt = { x: bx, z: bz };
    // the parking bay beside the road, on the observatory's side
    const park = { x: road.x - dx * (ROAD_HALF + 2), z: road.z - dz * (ROAD_HALF + 2), yaw: Math.atan2(road.tx, road.tz), roadX: road.x, roadZ: road.z, side: { x: -dx, z: -dz } };
    this.park = park;
    this.clear(road);

    // ---------------------------------------------------------- the dome
    const gr = groundRange(W, f, -3.6, 3.6, -3.6, 4.6);
    const floor = gr.hi + 0.35;
    this.floor = floor;
    const b = new ModelBuilder();
    const base = gr.lo - 0.4;
    b.cyl(R + 0.25, R + 0.35, floor - base, 24, { pos: [0, (floor + base) / 2 - floor, 0], color: CONCRETE, surf: 'concrete' });
    b.cyl(R - 0.08, R - 0.08, DRUM, 32, { pos: [0, DRUM / 2, 0], color: WHITE, surf: 'metal', jitter: 0.02 });
    // the ring the dome turns on, and the drum's top rail
    b.torus(R - 0.05, 0.09, 6, 40, { pos: [0, DRUM, 0], rot: [Math.PI / 2, 0, 0], color: 0x8e9296 });
    // the door with its frame, a red lamp over it and the steps up
    b.box(1.16, 2.16, 0.16, { pos: [0, 1.08, R - 0.02], color: 0x8e9296 });
    b.box(1.0, 2.04, 0.1, { pos: [0, 1.04, R + 0.04], color: 0x3c5268 });
    b.box(0.05, 0.22, 0.06, { pos: [-0.38, 1.05, R + 0.11], color: 0xb8b8b0 });
    b.box(0.86, 0.5, 0.03, { pos: [0, 1.62, R + 0.1], color: 0x2f4458 });
    const steps = Math.max(1, Math.round((floor - W.heightAt(...f.to(0, R + 1.6))) / 0.19));
    const rise = (floor - W.heightAt(...f.to(0, R + 1.6))) / steps;
    for (let i = 0; i < steps; i++) {
      const top = -rise * i;
      b.box(1.5, Math.max(0.2, top - (base - floor)), 0.32, { pos: [0, (top + base - floor) / 2, R + 0.35 + i * 0.32], color: CONCRETE, surf: 'concrete' });
    }
    // a little sign beside the door
    const dome = P.addMesh(b.build(), site.x, floor, site.z, this.yaw);
    dome.removeFromParent();
    this.group.add(dome);
    // the red lamp over the door (night lights are red at observatories)
    this.redMat = new THREE.MeshBasicMaterial({ color: 0x1a0606, toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.redMat);
    lamp.position.set(0, 2.32, R + 0.16);
    const lampHood = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
    lampHood.position.set(0, 2.42, R + 0.16);
    const lampGroup = new THREE.Group();
    lampGroup.add(lamp, lampHood);
    lampGroup.position.set(site.x, floor, site.z);
    lampGroup.rotation.y = this.yaw;
    this.group.add(lampGroup);
    // the dome itself: two halves with the slit between, the shutter that
    // closes it and the strip down the back, turning together
    this.dome = new THREE.Group();
    this.dome.position.set(site.x, floor + DRUM, site.z);
    this.dome.rotation.y = this.yaw;
    this.domeAz = this.yaw;
    const domeMat = new THREE.MeshStandardMaterial({ map: domeTexture(), roughness: 0.32, metalness: 0.2, side: THREE.DoubleSide });
    const k = (R - SLIT) / R;
    for (const side of [-1, 1]) {
      const geo = new THREE.SphereGeometry(R, 24, 12, side < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI, 0, Math.PI / 2);
      geo.scale(k, 1, 1);
      geo.translate(side * SLIT, 0, 0);
      const m = new THREE.Mesh(geo, domeMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.dome.add(m);
      // the half's flat end over the slit edge: a lip
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 5, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.5 }));
      lip.rotation.y = Math.PI / 2;
      lip.position.x = side * SLIT;
      this.dome.add(lip);
    }
    const back = new THREE.Mesh(band(100 * DEG, 182 * DEG, R + 0.01, SLIT + 0.06), domeMat);
    this.dome.add(back);
    this.shutter = new THREE.Mesh(band(-2 * DEG, 101 * DEG, R + 0.05, SLIT + 0.1), domeMat);
    this.shutter.castShadow = true;
    this.dome.add(this.shutter);
    this.shutterOpen = 0;
    // inside: dim red working light on the far wall
    this.innerMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, side: THREE.BackSide, toneMapped: false });
    const inner = new THREE.Mesh(new THREE.SphereGeometry(R - 0.12, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.innerMat);
    this.dome.add(inner);
    // the telescope on its fork, turning with the dome
    this.scope = new THREE.Group();
    this.scope.position.set(0, -1.05, 0);
    const sb = new ModelBuilder();
    sb.cyl(0.24, 0.24, 2.05, 22, { pos: [0, 0, 0.35], rot: [Math.PI / 2, 0, 0], color: 0xf2f2ee, jitter: 0 });
    sb.cyl(0.26, 0.26, 0.24, 22, { pos: [0, 0, 1.3], rot: [Math.PI / 2, 0, 0], color: 0x1c1c1c, jitter: 0 });
    sb.cyl(0.27, 0.27, 0.16, 22, { pos: [0, 0, -0.62], rot: [Math.PI / 2, 0, 0], color: 0x2a2a2a, jitter: 0 });
    sb.cyl(0.05, 0.05, 0.5, 10, { pos: [0.2, 0.26, 0.6], rot: [Math.PI / 2, 0, 0], color: 0x1c1c1c });
    sb.box(0.08, 0.08, 0.2, { pos: [0, -0.06, -0.78], color: 0x1c1c1c });
    const tube = new THREE.Mesh(sb.build({ flat: false }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }));
    tube.castShadow = true;
    this.tube = new THREE.Group();
    this.tube.add(tube);
    const fb = new ModelBuilder();
    fb.cyl(0.26, 0.32, 1.65, 16, { pos: [0, -0.82 - 0.3, 0], color: 0x3a4a5a });
    fb.box(0.8, 0.12, 0.3, { pos: [0, -0.3, 0], color: 0x3a4a5a });
    for (const s of [-1, 1]) fb.box(0.1, 0.52, 0.26, { pos: [s * 0.36, -0.06, 0], color: 0x3a4a5a });
    const fork = new THREE.Mesh(fb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }));
    this.scope.add(fork, this.tube);
    this.dome.add(this.scope);
    this.group.add(this.dome);
    C.addCircle(site.x, site.z, R + 0.3, 'building');
    // the steps are walkable: a sloping deck from the door down to the ground
    {
      const L = steps * 0.32;
      const drop = floor - W.heightAt(...f.to(0, R + 1.6));
      const [sx, sz] = f.to(0, R + 0.19 + L / 2);
      C.addDeck(sx, sz, 0.75, L / 2, this.yaw, floor - drop / 2, { slope: -drop / L });
    }

    // --------------------------------------------------------- the hut
    {
      const h = this.hutAt;
      const hyaw = this.yaw;
      const hf = frame(h.x, h.z, hyaw);
      const hg = groundRange(W, hf, -1.8, 1.8, -1.6, 1.6);
      const hb = new ModelBuilder();
      const hbase = hg.lo - 0.3;
      const htop = hg.hi + 0.25;
      hb.box(3.7, htop - hbase, 3.3, { pos: [0, (htop + hbase) / 2 - htop, 0], color: CONCRETE, surf: 'concrete' });
      hb.box(3.5, 2.4, 3.1, { pos: [0, 1.2, 0], color: 0x7a2e22, surf: 'batten' });
      // corner trim, door, window and the flat roof sloping back
      for (const [x, z] of [
        [-1.75, -1.55],
        [1.75, -1.55],
        [-1.75, 1.55],
        [1.75, 1.55],
      ])
        hb.box(0.12, 2.4, 0.12, { pos: [x, 1.2, z], color: 0xe8e2d4 });
      hb.box(0.9, 1.95, 0.08, { pos: [-0.9, 0.98, 1.58], color: 0x5a3a26, surf: 'plank' });
      hb.box(1.0, 0.75, 0.06, { pos: [0.75, 1.45, 1.57], color: 0xe8e2d4 });
      hb.box(0.86, 0.62, 0.06, { pos: [0.75, 1.45, 1.59], color: 0x141a20 });
      hb.box(3.9, 0.12, 3.6, { pos: [0, 2.5, -0.05], rot: [-0.06, 0, 0], color: 0x70767c, surf: 'metal' });
      // a solar panel and the radio's antenna mast on the roof
      hb.box(1.4, 0.05, 0.9, { pos: [0.6, 2.75, -0.4], rot: [-0.55, 0, 0], color: 0x1d2a44 });
      hb.box(0.06, 0.4, 0.06, { pos: [0.6, 2.58, -0.75], color: 0x8a8a8a });
      hb.cyl(0.03, 0.03, 2.2, 6, { pos: [-1.3, 3.6, -1.2], color: 0x9a9a9a });
      hb.cyl(0.05, 0.05, 0.3, 6, { pos: [-1.3, 4.7, -1.2], color: 0xd8d8d8 });
      // steps to the door
      hb.box(1.2, Math.max(0.2, htop - W.heightAt(...hf.to(-0.9, 2.1))), 0.6, { pos: [-0.9, -(htop - W.heightAt(...hf.to(-0.9, 2.1))) / 2, 1.95], color: CONCRETE, surf: 'concrete' });
      const hut = P.addMesh(hb.build(), h.x, htop, h.z, hyaw);
      hut.removeFromParent();
      this.group.add(hut);
      // the window glows red at night
      this.hutWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.6), this.redMat);
      const [wx, wz] = hf.to(0.75, 1.625);
      this.hutWindow.position.set(wx, htop + 1.45, wz);
      this.hutWindow.rotation.y = hyaw;
      this.group.add(this.hutWindow);
      C.addBox(h.x, h.z, 1.85, 1.65, hyaw, -1e9, htop + 2.8, 'building');
    }

    // ------------------------------------------------------ the radio dish
    {
      const d = this.dishAt;
      const y = W.heightAt(d.x, d.z);
      const db = new ModelBuilder();
      db.cyl(1.05, 1.3, 1.6, 8, { pos: [0, 0.5, 0], color: CONCRETE, surf: 'concrete' });
      db.cyl(0.95, 0.95, 0.3, 24, { pos: [0, 1.45, 0], color: STEEL });
      const base = P.addMesh(db.build(), d.x, y, d.z, 0);
      base.removeFromParent();
      this.group.add(base);
      // turning on its turntable (azimuth), tipping in its yoke (elevation)
      this.dishAz = new THREE.Group();
      this.dishAz.position.set(d.x, y + 1.6, d.z);
      const yb = new ModelBuilder();
      yb.cyl(0.85, 0.9, 0.3, 20, { pos: [0, 0.15, 0], color: 0xc8ccd0 });
      for (const s of [-1, 1]) {
        yb.box(0.22, 2.0, 0.6, { pos: [s * 1.1, 1.25, 0], color: 0xc8ccd0 });
        yb.strut([s * 1.1, 0.3, 0.5], [s * 0.4, 0.3, 0.2], 0.12, 0.12, { color: 0xb0b4b8 });
      }
      yb.box(2.4, 0.26, 0.7, { pos: [0, 0.4, 0], color: 0xb8bcc0 });
      // the receiver's cabinet on the turntable
      yb.box(0.6, 0.7, 0.45, { pos: [0, 0.85, -0.6], color: 0xd8d8d0 });
      const yoke = new THREE.Mesh(yb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }));
      yoke.castShadow = true;
      this.dishAz.add(yoke);
      this.dishEl = new THREE.Group();
      this.dishEl.position.set(0, 2.15, 0);
      // the paraboloid: 6 m across, focus 2.2 m in front of the vertex
      const F = 2.2;
      const prof = [];
      for (let i = 0; i <= 14; i++) {
        const r = (3 * i) / 14;
        prof.push(new THREE.Vector2(Math.max(0.001, r), (r * r) / (4 * F)));
      }
      const pg = new THREE.LatheGeometry(prof, 40);
      pg.rotateX(Math.PI / 2);
      pg.translate(0, 0, 0.45);
      const dish = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0xdfe2e4, roughness: 0.42, metalness: 0.25, side: THREE.DoubleSide }));
      dish.castShadow = true;
      dish.receiveShadow = true;
      const rb = new ModelBuilder();
      // the back frame: a hub, ribs out to the rim and a rim ring
      rb.cyl(0.42, 0.5, 0.5, 12, { pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0], color: 0xb8bcc0 });
      const rim = (a, back = 0) => [Math.cos(a) * 3, Math.sin(a) * 3, 0.45 + 9 / (4 * F) - back];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const p = rim(a, 0.06);
        rb.strut([Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.2], [p[0] * 0.97, p[1] * 0.97, p[2] - 0.05], 0.07, 0.12, { color: 0xb8bcc0 });
      }
      rb.torus(3.0, 0.05, 5, 48, { pos: [0, 0, 0.45 + 9 / (4 * F)], color: 0xc8ccd0 });
      // four legs holding the feed at the focus
      const focus = [0, 0, 0.45 + F];
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        rb.beam(rim(a), focus, 0.035, 6, { color: 0xe0e0dc });
      }
      rb.cyl(0.16, 0.22, 0.42, 12, { pos: [0, 0, focus[2] - 0.12], rot: [Math.PI / 2, 0, 0], color: 0xe8e8e0 });
      rb.cone(0.16, 0.25, 12, { pos: [0, 0, focus[2] - 0.45], rot: [-Math.PI / 2, 0, 0], color: 0x9aa0a6 });
      // the counterweight behind the axis
      rb.box(1.4, 0.7, 0.6, { pos: [0, 0, -0.55], color: 0x6a7076 });
      for (const s of [-1, 1]) rb.cyl(0.12, 0.12, 0.3, 10, { pos: [s * 1.1, 0, 0], rot: [0, 0, Math.PI / 2], color: 0x40464c });
      const frameMesh = new THREE.Mesh(rb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }));
      frameMesh.castShadow = true;
      this.dishEl.add(dish, frameMesh);
      this.dishAz.add(this.dishEl);
      this.group.add(this.dishAz);
      this.dishYaw = 0;
      this.dishAlt = 0.6;
      C.addCircle(d.x, d.z, 1.35, 'building');
    }

    // --------------------------------------------- the stargazing deck
    // The chairs face north-west, toward the aurora: due north and east a
    // ridge stands 20 to 34 degrees high from here, while to the north-west
    // the skyline is only 8 to 12 degrees up.
    {
      const d = this.deckAt;
      const faceAz = 305 * DEG;
      const dyaw = -faceAz;
      this.deckYaw = dyaw;
      const df = frame(d.x, d.z, dyaw);
      const dg = groundRange(W, df, -2.4, 2.4, -1.6, 1.6);
      const top = dg.hi + 0.3;
      this.deckTop = top;
      const kb = new ModelBuilder();
      kb.box(4.8, 0.08, 3.2, { pos: [0, -0.04, 0], color: 0x8a6a48, surf: 'deck' });
      for (const [x, z] of [
        [-2.2, -1.4],
        [2.2, -1.4],
        [-2.2, 1.4],
        [2.2, 1.4],
        [0, -1.4],
        [0, 1.4],
      ])
        kb.box(0.14, top - dg.lo + 0.3, 0.14, { pos: [x, -(top - dg.lo + 0.3) / 2, z], color: WOOD_DARK });
      // two reclining chairs facing the deck's -z side, a small table
      // with a red lantern between them
      for (const cx of [-1.15, 1.15]) {
        kb.box(0.62, 0.05, 0.85, { pos: [cx, 0.36, -0.15], rot: [0.12, 0, 0], color: WOOD, surf: 'plank' });
        for (let i = 0; i < 5; i++) kb.box(0.11, 0.95, 0.03, { pos: [cx - 0.24 + i * 0.12, 0.72, 0.42], rot: [-0.85, 0, 0], color: WOOD, surf: 'plank' });
        kb.box(0.64, 0.05, 0.06, { pos: [cx, 0.98, 0.6], rot: [-0.85, 0, 0], color: WOOD_DARK });
        for (const s of [-1, 1]) {
          kb.box(0.08, 0.04, 0.95, { pos: [cx + s * 0.38, 0.55, -0.05], color: WOOD });
          kb.box(0.06, 0.55, 0.06, { pos: [cx + s * 0.36, 0.27, -0.45], color: WOOD_DARK });
          kb.box(0.06, 0.45, 0.06, { pos: [cx + s * 0.36, 0.22, 0.35], color: WOOD_DARK });
        }
        // a wool blanket folded on the seat
        kb.box(0.5, 0.06, 0.35, { pos: [cx, 0.42, -0.3], rot: [0.12, 0, 0], color: cx < 0 ? 0x7a2e2e : 0x2e4a6a });
      }
      kb.cyl(0.25, 0.25, 0.04, 14, { pos: [0, 0.5, -0.2], color: WOOD });
      kb.cyl(0.04, 0.04, 0.5, 6, { pos: [0, 0.25, -0.2], color: WOOD_DARK });
      // a thermos and two mugs
      kb.cyl(0.05, 0.05, 0.26, 10, { pos: [-0.08, 0.65, -0.2], color: 0x3a6a4a });
      kb.cyl(0.035, 0.03, 0.08, 8, { pos: [0.1, 0.56, -0.12], color: 0xe8e2d4 });
      kb.cyl(0.035, 0.03, 0.08, 8, { pos: [0.12, 0.56, -0.3], color: 0xc0392b });
      // a rail along the back
      kb.box(4.8, 0.08, 0.08, { pos: [0, 0.9, 1.55], color: WOOD_DARK });
      for (const x of [-2.35, -0.8, 0.8, 2.35]) kb.box(0.08, 0.9, 0.08, { pos: [x, 0.45, 1.55], color: WOOD_DARK });
      const deck = P.addMesh(kb.build(), d.x, top, d.z, dyaw);
      deck.removeFromParent();
      this.group.add(deck);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), this.redMat);
      const [lx, lz] = df.to(0.1, -0.32);
      lantern.position.set(lx, top + 0.6, lz);
      this.group.add(lantern);
      C.addDeck(d.x, d.z, 2.4, 1.6, dyaw, top);
      const [rx, rz] = df.to(0, 1.55);
      C.addBox(rx, rz, 2.4, 0.08, dyaw, top - 0.5, top + 1.0);
      // the chairs' seats, where you lie back, and the way they face
      this.chairs = [-1.15, 1.15].map((cx) => {
        const [x, z] = df.to(cx, -0.1);
        return { x, y: top, z, yaw: dyaw };
      });
    }

    // ------------------------------------------- mast, camera, board, sign
    {
      const m = this.mastAt;
      const y = W.heightAt(m.x, m.z);
      const mb = new ModelBuilder();
      mb.cyl(0.4, 0.45, 0.3, 8, { pos: [0, 0.1, 0], color: CONCRETE });
      mb.cyl(0.05, 0.06, 5.4, 8, { pos: [0, 2.9, 0], color: 0xb8bcc0 });
      mb.box(0.3, 0.4, 0.2, { pos: [0, 1.4, 0.1], color: 0xe8e8e0 });
      // three guy wires
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        mb.beam([Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6], [0, 4.2, 0], 0.008, 4, { color: 0x9a9a9a });
      }
      mb.box(0.6, 0.04, 0.04, { pos: [0, 5.5, 0], color: 0x9a9a9a });
      const mast = P.addMesh(mb.build(), m.x, y, m.z, 0);
      mast.removeFromParent();
      this.group.add(mast);
      // the anemometer's cups and the wind vane, turning in the wind
      this.cups = new THREE.Group();
      const cb = new ModelBuilder();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        cb.beam([0, 0, 0], [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], 0.008, 4, { color: 0x2a2a2a });
        cb.sphere(0.05, 8, 6, { pos: [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], scale: [1, 1, 0.6], rot: [0, -a, 0], color: 0x2a2a2a });
      }
      this.cups.add(new THREE.Mesh(cb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
      this.cups.position.set(m.x - 0.3, y + 5.62, m.z);
      this.vane = new THREE.Group();
      const vb = new ModelBuilder();
      vb.box(0.03, 0.03, 0.5, { pos: [0, 0, 0], color: 0x2a2a2a });
      vb.box(0.01, 0.16, 0.16, { pos: [0, 0, -0.26], color: 0x2a2a2a });
      vb.cone(0.03, 0.08, 6, { pos: [0, 0, 0.28], rot: [Math.PI / 2, 0, 0], color: 0x2a2a2a });
      this.vane.add(new THREE.Mesh(vb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
      this.vane.position.set(m.x + 0.3, y + 5.62, m.z);
      this.group.add(this.cups, this.vane);
      C.addCircle(m.x, m.z, 0.25, 'post');
      // the all-sky camera: a fisheye under a glass bubble, watching for
      // meteors all night
      const c = this.camAt;
      const cy = W.heightAt(c.x, c.z);
      const ab = new ModelBuilder();
      ab.cyl(0.06, 0.06, 1.3, 8, { pos: [0, 0.65, 0], color: 0x8a8a8a });
      ab.box(0.36, 0.3, 0.36, { pos: [0, 1.42, 0], color: 0xe8e8e0 });
      ab.cyl(0.13, 0.13, 0.06, 16, { pos: [0, 1.6, 0], color: 0x2a2a2a });
      const acam = P.addMesh(ab.build(), c.x, cy, c.z, 0);
      acam.removeFromParent();
      this.group.add(acam);
      // plain clear glass: a "transmission" material here made three.js
      // draw the whole scene a second time every frame the observatory was
      // anywhere in view, for a bubble 24 cm across
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.3, metalness: 0, depthWrite: false })
      );
      bubble.position.set(c.x, cy + 1.63, c.z);
      this.group.add(bubble);
      C.addCircle(c.x, c.z, 0.2, 'post');
      // the notice board facing the path, under its own little roof
      const B = this.boardAt;
      const by = W.heightAt(B.x, B.z);
      const nb = new ModelBuilder();
      for (const s of [-1, 1]) nb.box(0.1, 2.1, 0.1, { pos: [s * 0.78, 1.05, 0], color: WOOD_DARK });
      nb.box(1.7, 1.05, 0.06, { pos: [0, 1.45, -0.02], color: WOOD_DARK });
      nb.box(1.95, 0.06, 0.5, { pos: [0, 2.12, 0.05], rot: [0.25, 0, 0], color: 0x5a4a3a, surf: 'shingle' });
      const board = P.addMesh(nb.build(), B.x, by, B.z, this.yaw);
      board.removeFromParent();
      this.group.add(board);
      this.boardTex = canvasTexture(1024, 640, (g, Wd, Hd) => drawBoard(g, Wd, Hd, almanac(1)));
      this.boardNight = -1;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: this.boardTex, roughness: 0.85 }));
      const [sx, sz] = frame(B.x, B.z, this.yaw).to(0, 0.02);
      sheet.position.set(sx, by + 1.45, sz);
      sheet.rotation.y = this.yaw;
      this.group.add(sheet);
      C.addBox(B.x, B.z, 0.85, 0.12, this.yaw, -1e9, by + 2.2, 'post');
      // the sign at the road
      const sp = { x: park.x + park.side.x * 3.2 + Math.sin(park.yaw) * 3.5, z: park.z + park.side.z * 3.2 + Math.cos(park.yaw) * 3.5 };
      const syaw = Math.atan2(-park.side.x, -park.side.z);
      const sgy = W.heightAt(sp.x, sp.z);
      const gb = new ModelBuilder();
      for (const s of [-1, 1]) gb.box(0.14, 2.0, 0.14, { pos: [s * 1.1, 1.0, 0], color: WOOD_DARK });
      const sign = P.addMesh(gb.build(), sp.x, sgy, sp.z, syaw);
      sign.removeFromParent();
      this.group.add(sign);
      const st = makeSignTexture('TUNDRA OBSERVATORY', 'Dark sky site · red lights only', { width: 2.4, aspect: 2.4 / 0.85, bg: '#1c2a3a', fg: '#f3e9cf' });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 0.06), [
        new THREE.MeshStandardMaterial({ color: 0x1c2a3a }),
        new THREE.MeshStandardMaterial({ color: 0x1c2a3a }),
        new THREE.MeshStandardMaterial({ color: 0x1c2a3a }),
        new THREE.MeshStandardMaterial({ color: 0x1c2a3a }),
        new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }),
      ]);
      plate.position.set(sp.x, sgy + 1.55, sp.z);
      plate.rotation.y = syaw;
      plate.castShadow = true;
      this.group.add(plate);
      C.addCircle(sp.x - Math.cos(syaw) * 1.1, sp.z + Math.sin(syaw) * 1.1, 0.12, 'post');
      C.addCircle(sp.x + Math.cos(syaw) * 1.1, sp.z - Math.sin(syaw) * 1.1, 0.12, 'post');
    }
    this.group.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
    game.scene.add(this.group);

    // ------------------------------------- the place, its parking, its doors
    const [ix, iz] = f.to(0, R + 1.2);
    P.interactions.push({ id: 'scope', x: ix, z: iz, r: 2.2 });
    P.interactions.push({ id: 'radio', x: this.dishAt.x, z: this.dishAt.z, r: 3.6 });
    P.interactions.push({ id: 'board', x: this.boardAt.x + dx * 0.9, z: this.boardAt.z + dz * 0.9, r: 2.0 });
    P.interactions.push({ id: 'chair', x: this.deckAt.x, z: this.deckAt.z, r: 2.6, y: this.deckTop });
    const [px, pz] = f.to(0, 6);
    W.places.push({
      id: 'observatory',
      name: 'Tundra Observatory',
      kind: 'observatory',
      x: px,
      z: pz,
      y: W.heightAt(px, pz),
      face: Math.atan2(-(site.x - px), -(site.z - pz)),
      blurb: 'A telescope dome and a radio dish under the darkest sky in Kenai Country. Look through the telescope, listen to pulsars, check what is up tonight on the board, and lie back on the deck to watch the stars and the northern lights.',
      bearRisk: 0.15,
    });
    P.layout.parking.observatory = park;
    this.pointAt = null;
  }

  // Fell what grows on the site and on the path from the road.
  clear(road) {
    const g = this.game;
    const S = g.scatter;
    const site = OBSERVATORY;
    const spots = [
      [site.x, site.z, 9],
      [this.deckAt.x, this.deckAt.z, 4.5],
      [this.dishAt.x, this.dishAt.z, 5.5],
      [this.hutAt.x, this.hutAt.z, 4],
      [this.mastAt.x, this.mastAt.z, 3.2],
      [this.camAt.x, this.camAt.z, 1.5],
      [this.boardAt.x, this.boardAt.z, 2.5],
    ];
    const inSite = (x, z) => spots.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r) || segDist(x, z, site.x, site.z, road.x, road.z).d < 2.5;
    for (const t of Object.values(S.types)) {
      for (let i = 0; i < t.count; i++) if (inSite(t.x[i], t.z[i])) t.x[i] = 1e6;
    }
    g.colliders.removeCircles(site.x - 30, site.z - 30, site.x + 30, site.z + 30, (c) => (c.tag === 'tree' || c.tag === 'rock' || c.tag === 'shrub') && inSite(c.x, c.z));
    S.lastPos.set(1e9, 0, 0);
  }

  // Point the telescope (and the dome's slit) at a world direction, or
  // null to let it wander.
  aim(dir) {
    this.pointAt = dir ? dir.clone() : null;
  }

  // Point the dish at a world direction, or null.
  aimDish(dir) {
    this.dishAt3 = dir ? dir.clone() : null;
  }

  update(dt) {
    const g = this.game;
    const env = g.env;
    const dist = Math.hypot(g.camera.position.x - OBSERVATORY.x, g.camera.position.z - OBSERVATORY.z);
    const near = dist < 900;
    // the telescope and the dish stay on their last target until you leave
    if (dist > 300) this.pointAt = this.dishAt3 = null;
    // the red lamps
    const n = env.night;
    this.redMat.color.setRGB(0.1 + 1.6 * n, 0.02 + 0.08 * n, 0.02 + 0.06 * n);
    this.innerMat.color.setRGB(0.05 + 0.22 * n, 0.04 + 0.02 * n, 0.045 + 0.02 * n);
    // the board: the coming night's almanac
    const night = upcomingNight(env);
    if (near && night !== this.boardNight) {
      this.boardNight = night;
      const A = almanac(night);
      const c = this.boardTex.image;
      drawBoard(c.getContext('2d'), c.width, c.height, A);
      this.boardTex.needsUpdate = true;
    }
    if (!near) return;
    // the wind turns the cups and the vane
    this.cups.rotation.y += dt * (4 + env.weather.cloud * 6 + env.weather.rain * 8);
    this.vane.rotation.y = Math.sin(g.time * 0.11) * 0.4 + 0.8;
    // the shutter opens once it is dark and the sky is not overcast
    const open = n > 0.55 && env.weather.cloud < 0.85 ? 1 : 0;
    this.shutterOpen = damp(this.shutterOpen, open, 0.6, dt);
    this.shutter.rotation.x = -1.78 * this.shutterOpen;
    // where the telescope looks: the screen's pick, else Vega or Capella
    let dir = this.pointAt;
    if (!dir) {
      const M = env.uniforms.uEq.value;
      const v = eqVector(279.23, 38.78, (this._v ||= new THREE.Vector3())).applyMatrix3(M);
      dir = v.y > 0.3 ? v : eqVector(79.17, 45.99, v).applyMatrix3(M);
    }
    const { alt, az } = altAz(dir);
    if (this.shutterOpen > 0.5) {
      const want = Math.PI - az * DEG;
      let d = want - this.domeAz;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.domeAz += Math.sign(d) * Math.min(Math.abs(d), dt * 0.18);
      this.tubeAlt = damp(this.tubeAlt ?? 0.8, Math.max(0.15, Math.min(1.45, alt * DEG)), 0.8, dt);
    } else this.tubeAlt = damp(this.tubeAlt ?? 0.8, 1.45, 0.5, dt);
    this.dome.rotation.y = this.domeAz;
    this.tube.rotation.x = -this.tubeAlt;
    // the dish: on its source, else the Sun by day and the zenith by night
    let dd = this.dishAt3;
    if (!dd) dd = env.sunElevation > 3 ? env.sunDir : (this._up ||= new THREE.Vector3(0.05, 1, 0.3).normalize());
    const da = altAz(dd);
    const wy = Math.PI - da.az * DEG;
    let e = wy - this.dishYaw;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    this.dishYaw += Math.sign(e) * Math.min(Math.abs(e), dt * 0.25);
    this.dishAlt = damp(this.dishAlt, Math.max(0.17, Math.min(1.5, da.alt * DEG)), 0.6, dt);
    this.dishAz.rotation.y = this.dishYaw;
    this.dishEl.rotation.x = -this.dishAlt;
  }

  // Close enough to read the board, use the telescope, the dish or a chair?
  chairNear(P) {
    let best = null;
    let bd = 1e9;
    for (const c of this.chairs) {
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
}
