// The solar system along the Lighthouse Road, at one to 7.5 billion (after
// the Sweden Solar System, the world's largest scale model): the Sun at the
// Trading Post end as a ball 19 cm across, Earth a grain of sand 20 m down
// the road, Neptune 600 m away. Each body has a sign and its model at true
// scale on a little post (most of them are specks: that is the point). The
// trees at each sign are felled after the forest has grown, so the rest of
// it stays as it was.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { ROAD_HALF } from './worldgen.js';
import { WALK, SCALE } from '../gameplay/skytargets.js';

const AU_KM = 149597870.7;
const START = 16; // metres along the road to the Sun
const COLS = 3;
const CW = 512;
const CH = 360;

const COLORS = {
  sun: ['#ffd36a', '#ff8a1a'],
  mercury: ['#c8bfb4', '#7d746a'],
  venus: ['#fff2cc', '#d8b878'],
  earth: ['#6ab0ff', '#2a6a3a'],
  mars: ['#ff9a6a', '#a8442a'],
  jupiter: ['#f0d8b0', '#b08050'],
  saturn: ['#f4e2b0', '#c0a060'],
  uranus: ['#bff0f0', '#6ab8c8'],
  neptune: ['#7aa6ff', '#2a4ab0'],
};

// How long light takes from the Sun, in words.
function lightTime(au) {
  const s = (au * AU_KM) / 299792.458;
  if (s < 60) return `${s.toFixed(1)} seconds`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)} minutes`;
  const h = Math.floor(m / 60);
  return `${h} hours ${Math.round(m - h * 60)} minutes`;
}

// A model's true size at the walk's scale, in words.
function modelSize(km) {
  const mm = (km / SCALE) * 1e6;
  if (mm >= 10) return `${(mm / 10).toFixed(1)} cm`;
  if (mm >= 1) return `${mm.toFixed(1)} mm`;
  return `${mm.toFixed(2)} mm`;
}

function drawSign(g, x0, y0, w) {
  const [c1, c2] = COLORS[w.id];
  g.fillStyle = '#13233a';
  g.fillRect(x0, y0, CW, CH);
  g.strokeStyle = '#e8d8a8';
  g.lineWidth = 8;
  g.strokeRect(x0 + 8, y0 + 8, CW - 16, CH - 16);
  // a few stars
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 40; i++) g.fillRect(x0 + 20 + ((i * 97) % (CW - 40)), y0 + 20 + ((i * 53) % (CH - 40)), 2, 2);
  // the body
  const r = w.id === 'sun' ? 70 : 46;
  const cx = x0 + 100;
  const cy = y0 + 150;
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  if (w.id === 'saturn') {
    g.strokeStyle = 'rgba(240,220,170,0.9)';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(cx, cy, r * 1.7, r * 0.42, -0.35, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#f3e9cf';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = '800 60px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText(w.name.replace('The ', '').toUpperCase(), x0 + 196, y0 + 40);
  g.font = '600 30px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillStyle = '#ffcc3a';
  const dist = w.au ? `${Math.round((w.au * AU_KM * 1000) / SCALE)} m from the Sun` : 'The centre of it all';
  g.fillText(dist, x0 + 196, y0 + 112);
  g.fillStyle = '#d8e4f0';
  g.fillText(`Model: ${modelSize(w.km)} across`, x0 + 196, y0 + 152);
  if (w.au) g.fillText(`Sunlight takes ${lightTime(w.au)}`, x0 + 196, y0 + 192);
  else g.fillText('Real size: 1.39 million km', x0 + 196, y0 + 192);
  g.font = '600 24px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillStyle = 'rgba(232,216,168,0.85)';
  g.fillText('SOLAR SYSTEM WALK · 1 : 7,500,000,000', x0 + 30, y0 + CH - 58);
}

export class SolarWalk {
  constructor(game) {
    this.game = game;
    const W = game.world;
    const C = game.colliders;
    const road = W.roads.find((r) => r.id === 'light');
    this.group = new THREE.Group();
    this.group.name = 'solarwalk';
    this.signs = [];
    if (!road) return;
    const P = road.path;
    const atlas = canvasTexture(CW * COLS, CH * Math.ceil(WALK.length / COLS), (g) => {
      WALK.forEach((w, i) => drawSign(g, (i % COLS) * CW, Math.floor(i / COLS) * CH, w));
    });
    const rows = Math.ceil(WALK.length / COLS);
    const posts = new ModelBuilder();
    const models = new ModelBuilder();
    const boards = [];
    for (const [i, w] of WALK.entries()) {
      const metres = (w.au * AU_KM * 1000) / SCALE;
      const s = Math.min(P.length - 5, START + metres);
      const p = P.sample(s);
      // the roadside away from anything built, on firm dry ground
      // (trees and rocks do not count: they are felled)
      const built = (x, z) => {
        if (C.circlesNear(x, z, 1.5).some((c) => c.tag !== 'tree' && c.tag !== 'rock' && c.tag !== 'shrub' && Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) return true;
        for (const b of C.boxes) {
          const dx = x - b.x;
          const dz = z - b.z;
          if (dx * dx + dz * dz > (b.radius + 1.5) ** 2) continue;
          const lx = dx * b.cos - dz * b.sin;
          const lz = dx * b.sin + dz * b.cos;
          if (Math.abs(lx) < b.hx + 1.2 && Math.abs(lz) < b.hz + 1.2) return true;
        }
        return false;
      };
      let spot = null;
      for (const side of [1, -1]) {
        const nx = -p.tz * side;
        const nz = p.tx * side;
        const x = p.x + nx * (ROAD_HALF + 1.8);
        const z = p.z + nz * (ROAD_HALF + 1.8);
        const wet = W.waterAt(x, z);
        if (!built(x, z) && !(wet && wet.depth > 0.05)) {
          spot = { x, z, nx, nz };
          break;
        }
      }
      if (!spot) {
        const nx = -p.tz;
        const nz = p.tx;
        spot = { x: p.x + nx * (ROAD_HALF + 1.8), z: p.z + nz * (ROAD_HALF + 1.8), nx, nz };
      }
      const y = W.heightAt(spot.x, spot.z);
      // the sign faces the road
      const yaw = Math.atan2(-spot.nx, -spot.nz);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(spot.x, y, spot.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
      for (const sx of [-0.62, 0.62]) posts.box(0.1, 1.9, 0.1, { pos: [sx, 0.95, -0.05], color: 0x4a3a2a, matrix: m });
      posts.box(1.36, 0.94, 0.05, { pos: [0, 1.38, -0.1], color: 0x2a3036, matrix: m });
      posts.box(1.44, 0.06, 0.18, { pos: [0, 1.88, -0.08], color: 0x4a3a2a, matrix: m });
      // the model on its post in front of the sign, under a glass cover
      posts.cyl(0.05, 0.06, 1.05, 8, { pos: [0.95, 0.52, 0.35], color: 0x5a5a5a, matrix: m });
      posts.cyl(0.14, 0.14, 0.04, 14, { pos: [0.95, 1.06, 0.35], color: 0x3a3a3a, matrix: m });
      const rr = Math.max(0.0012, ((w.km / SCALE) * 1000) / 2);
      // (the Sun is drawn glowing, below)
      if (w.id !== 'sun') models.sphere(rr, 16, 12, { pos: [0.95, 1.09 + rr, 0.35], color: parseInt(COLORS[w.id][0].slice(1), 16), matrix: m, jitter: 0 });
      if (w.id === 'saturn') models.torus(rr * 2, rr * 0.25, 4, 24, { pos: [0.95, 1.09 + rr, 0.35], rot: [Math.PI / 2 - 0.45, 0, 0], color: 0xf0dca0, matrix: m, jitter: 0 });
      // the board's face from the atlas
      const pg = new THREE.PlaneGeometry(1.3, 0.88);
      const u0 = (i % COLS) / COLS;
      const v1 = 1 - Math.floor(i / COLS) / rows;
      const uv = pg.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / COLS, v1 - (1 - uv.getY(k)) / rows);
      pg.translate(0, 1.38, -0.07);
      pg.applyMatrix4(m);
      boards.push(pg);
      C.addCircle(spot.x + Math.cos(yaw) * 0.62, spot.z - Math.sin(yaw) * 0.62, 0.1, 'post');
      C.addCircle(spot.x - Math.cos(yaw) * 0.62, spot.z + Math.sin(yaw) * 0.62, 0.1, 'post');
      this.signs.push({ ...w, x: spot.x, z: spot.z, y, model: new THREE.Vector3(0.95, 1.09 + rr, 0.35).applyMatrix4(m) });
    }
    this.clear();
    const postMesh = new THREE.Mesh(posts.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    const modelMesh = new THREE.Mesh(models.build({ flat: false }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x000000 }));
    // the Sun glows a little
    const sunGeo = new THREE.SphereGeometry(Math.max(0.0012, ((WALK[0].km / SCALE) * 1000) / 2), 24, 16);
    const sunMesh = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: 0xffc04a, toneMapped: false }));
    sunMesh.position.copy(this.signs[0].model);
    const boardGeo = mergeBoards(boards);
    const boardMesh = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85 }));
    boardMesh.receiveShadow = true;
    this.group.add(postMesh, modelMesh, sunMesh, boardMesh);
    game.scene.add(this.group);
    this.near = null;
    this.toastT = 0;
  }

  // Fell what grows at the signs.
  clear() {
    const g = this.game;
    const S = g.scatter;
    const near = (x, z) => this.signs.some((s) => Math.hypot(x - s.x, z - s.z) < 2.6);
    for (const t of Object.values(S.types)) for (let i = 0; i < t.count; i++) if (near(t.x[i], t.z[i])) t.x[i] = 1e6;
    for (const s of this.signs) g.colliders.removeCircles(s.x - 4, s.z - 4, s.x + 4, s.z + 4, (c) => (c.tag === 'tree' || c.tag === 'rock' || c.tag === 'shrub') && Math.hypot(c.x - s.x, c.z - s.z) < 2.6);
    S.lastPos.set(1e9, 0, 0);
  }

  update(dt) {
    const g = this.game;
    if (!g.started || !this.signs.length) return;
    const P = g.player.mode === 'drive' ? g.car.pos : g.player.pos;
    this.toastT -= dt;
    let at = null;
    for (const s of this.signs) if (Math.hypot(s.x - P.x, s.z - P.z) < 7) at = s;
    if (!at || at === this.near) {
      if (!at) this.near = null;
      return;
    }
    this.near = at;
    const walk = g.state.sky.walk;
    const fresh = !walk[at.id];
    if (!fresh && this.toastT > 0) return;
    this.toastT = 6;
    walk[at.id] = g.env.day;
    const n = WALK.filter((w) => walk[w.id]).length;
    g.hud.toast(`${at.name}: ${at.fact}${fresh ? ` (${n} of ${WALK.length})` : ''}`, fresh ? 'good' : '', 7);
    if (fresh) {
      g.audio?.chime();
      if (at.id === 'sun' && n === 1) setTimeout(() => g.hud.hint('A scale model of the solar system: the planets are spread down this road, Neptune 600 m away', 6), 2500);
      g.onEvent?.({ type: 'solarwalk', id: at.id, count: n });
      g.save?.();
    }
  }
}

function mergeBoards(geos) {
  let n = 0;
  let ni = 0;
  for (const g of geos) {
    n += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const idx = new Uint32Array(ni);
  let o = 0;
  let oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    for (let k = 0; k < g.index.count; k++) idx[oi + k] = g.index.array[k] + o;
    o += g.attributes.position.count;
    oi += g.index.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
