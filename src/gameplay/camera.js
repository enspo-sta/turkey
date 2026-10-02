// The camera: buy it at the Trading Post, raise it with the tool button,
// zoom in and snap moose, bears, eagles, whales and your best catches. Every
// species keeps its best picture in the photo album (Journal > Photos); the
// first good shot of a species sells to a magazine.
import * as THREE from 'three';
import { FISH, SPECIES_IDS } from './data.js';

const STORE_KEY = 'rubenHotrodFishing.photos.v1';
export const CAMERA_PRICE = 250;
export const ZOOMS = [1, 2, 4, 8];
const THUMB_W = 320;
const THUMB_H = 180;
const ROLL = 8;

// Everything the album has a page for. size is roughly how tall the
// animal stands in the picture, in metres; value is what the magazine pays
// for a three-star first shot.
export const PHOTO_SUBJECTS = {
  moose: { name: 'Moose', group: 'land', value: 40, size: 2.1 },
  caribou: { name: 'Caribou', group: 'land', value: 30, size: 1.3 },
  deer: { name: 'Sitka black-tailed deer', group: 'land', value: 25, size: 1.0 },
  sheep: { name: 'Dall sheep', group: 'land', value: 45, size: 1.0 },
  goat: { name: 'Mountain goat', group: 'land', value: 50, size: 1.05 },
  muskox: { name: 'Muskox', group: 'land', value: 50, size: 1.3 },
  wolf: { name: 'Gray wolf', group: 'land', value: 70, size: 0.9 },
  fox: { name: 'Red fox', group: 'land', value: 35, size: 0.5 },
  hare: { name: 'Snowshoe hare', group: 'land', value: 20, size: 0.4 },
  lynx: { name: 'Canada lynx', group: 'land', value: 90, size: 0.65 },
  porcupine: { name: 'Porcupine', group: 'land', value: 30, size: 0.4 },
  squirrel: { name: 'Red squirrel', group: 'land', value: 15, size: 0.25 },
  beaver: { name: 'Beaver', group: 'land', value: 40, size: 0.4 },
  bear: { name: 'Grizzly bear', group: 'land', value: 80, size: 1.4 },
  blackbear: { name: 'Black bear', group: 'land', value: 60, size: 1.0 },
  eagle: { name: 'Bald eagle', group: 'birds', value: 50, size: 1.2 },
  raven: { name: 'Common raven', group: 'birds', value: 15, size: 0.8 },
  gull: { name: 'Glaucous-winged gull', group: 'birds', value: 10, size: 0.8 },
  goose: { name: 'Canada goose', group: 'birds', value: 20, size: 0.9 },
  duck: { name: 'Mallard', group: 'birds', value: 15, size: 0.45 },
  loon: { name: 'Common loon', group: 'birds', value: 35, size: 0.5 },
  puffin: { name: 'Tufted puffin', group: 'birds', value: 45, size: 0.35 },
  ptarmigan: { name: 'Willow ptarmigan', group: 'birds', value: 30, size: 0.35 },
  swan: { name: 'Trumpeter swan', group: 'birds', value: 40, size: 0.9 },
  crane: { name: 'Sandhill crane', group: 'birds', value: 40, size: 1.1 },
  magpie: { name: 'Black-billed magpie', group: 'birds', value: 20, size: 0.45 },
  kingfisher: { name: 'Belted kingfisher', group: 'birds', value: 60, size: 0.3 },
  whale: { name: 'Humpback whale', group: 'sea', value: 90, size: 3.5 },
  orca: { name: 'Orca', group: 'sea', value: 100, size: 2.2 },
  otter: { name: 'Sea otter', group: 'sea', value: 45, size: 0.5 },
  sealion: { name: 'Steller sea lion', group: 'sea', value: 40, size: 1.0 },
  seal: { name: 'Harbor seal', group: 'sea', value: 30, size: 0.4 },
  geyser: { name: 'Old Faceful erupting', group: 'moments', value: 60, size: 14 },
  bigfoot: { name: 'Bigfoot (probably)', group: 'moments', value: 300, size: 2.6 },
};
for (const id of SPECIES_IDS) PHOTO_SUBJECTS['fish:' + id] = { name: FISH[id].name, group: 'fish', value: 0, size: 0.5 };

export const PHOTO_GROUPS = [
  ['land', 'Land animals'],
  ['birds', 'Birds'],
  ['sea', 'Sea mammals'],
  ['moments', 'Moments'],
  ['fish', 'Fish'],
];

const _v = new THREE.Vector3();

function loadAlbum() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && d.shots && Array.isArray(d.roll)) return d;
  } catch (e) {
    /* private mode or a broken store: start a fresh album */
  }
  return { shots: {}, roll: [] };
}

// Hills, and the grass close in front: the line of sight from a to b is
// blocked where the ground rises above it, and (with grass) where the grass
// the game draws round you does: up to 0.75 m in the densest grass, less
// where it is sparse, and shrinking from 16.5 m out to nothing at 28.5 m,
// as the grass field fades (see world/grass.js).
export function groundInTheWay(game, ax, ay, az, bx, by, bz, grass = true) {
  const W = game.world;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const D = Math.hypot(dx, dz);
  if (D < 1) return false;
  const near = Math.min(28, D - 1);
  for (let t = 1.5; t < near; t += 2) {
    const k = t / D;
    const x = ax + dx * k;
    const z = az + dz * k;
    const f = Math.min(1, Math.max(0, (t - 16.5) / 12));
    const fade = 1 - f * f * (3 - 2 * f);
    const tall = grass && W.grass && W.inBounds(x, z) ? (W.grass[W.cellIndex(x, z)] / 255) * 0.75 * fade : 0;
    if (W.heightAt(x, z) + tall > ay + dy * k) return true;
  }
  for (let i = 1; i < 10; i++) {
    const k = i / 10;
    if (W.heightAt(ax + dx * k, az + dz * k) > ay + dy * k + 0.3) return true;
  }
  return false;
}

// Tree crowns across a line of sight, from a to b. Each tree's collider
// carries its crown (see the tree helper in world/scatter.js): from lo to hi
// metres above the ground, cr metres round, a spruce's cone or a broadleaf's
// round crown; a bare snag is only its trunk, and a willow counts like a
// tree. A line under a birch's crown or over a tree's top is clear; a
// spruce's needles hide all the way out, while the outer fifth of a leafy
// crown lets the view through. A tree within near metres of b is the one
// the subject stands at, not one in front of it.
export function treesInTheWay(game, ax, ay, az, bx, by, bz, near = 1.5) {
  const C = game.colliders;
  const W = game.world;
  const dx = bx - ax;
  const dz = bz - az;
  const D = Math.hypot(dx, dz);
  if (D < 1) return false;
  const seen = new Set();
  for (let t = 0; t <= D; t += 6) {
    const px = ax + (dx / D) * t;
    const pz = az + (dz / D) * t;
    // 7 m reaches the widest crowns (a big coastal spruce's 6 m) between
    // steps
    for (const c of C.circlesNear(px, pz, 7)) {
      if ((c.tag !== 'tree' && c.tag !== 'shrub') || seen.has(c)) continue;
      seen.add(c);
      // how far along the line (from the eye itself for a tree just behind
      // it, whose branches can reach over you), how far off it, and how
      // high the line passes
      const along = ((c.x - ax) * dx + (c.z - az) * dz) / (D * D);
      if (along * D > D - near) continue;
      const u = Math.max(0, along);
      const off = Math.hypot(c.x - ax - dx * u, c.z - az - dz * u);
      if (off > 6.5) continue;
      const h = ay + (by - ay) * u - W.heightAt(c.x, c.z);
      if (h > (c.hi ?? 14)) continue;
      let reach = c.r + 0.15;
      if (c.cr && h >= c.lo) {
        const f = (h - c.lo) / (c.hi - c.lo);
        const k = c.cone ? 1 - f : Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
        reach = Math.max(reach, c.cr * k * (c.cone ? 1 : 0.8));
      }
      if (off < reach) return true;
    }
  }
  return false;
}

// Bushes, fireweed and ferns along the first 60 m of a line of sight: at a
// long zoom a bush a few metres off hides as much as a forest far away.
// Their height and radius at scale 1, as the models are built.
const PLANTS = [
  ['bush', 1.4, 0.9],
  ['fireweed', 1.45, 0.3],
  ['fern', 0.8, 0.9],
];
export function plantsInTheWay(game, ax, ay, az, bx, by, bz) {
  const T = game.scatter?.types;
  if (!T) return false;
  const dx = bx - ax;
  const dz = bz - az;
  const D = Math.hypot(dx, dz);
  const reach = Math.min(60, D - 1);
  if (reach < 1) return false;
  const mx = ax + (dx / D) * (reach / 2);
  const mz = az + (dz / D) * (reach / 2);
  for (const [name, h0, r0] of PLANTS) {
    const S = T[name];
    const hit =
      S &&
      S.someNear(mx, mz, reach / 2 + 2, (k) => {
        const px = S.x[k] - ax;
        const pz = S.z[k] - az;
        // how far along the line (not the one you stand in), how far off it
        const along = (px * dx + pz * dz) / D;
        if (along < 0.6 || along > reach) return false;
        if (Math.abs(px * dz - pz * dx) / D > S.scaleX(k) * r0 * 0.8) return false;
        // and whether the line passes under its top
        return ay + ((by - ay) * along) / D < S.y[k] + S.scaleY(k) * h0;
      });
    if (hit) return true;
  }
  return false;
}

// How much of a subject the eye at a can see: of three points up its middle
// (low, centre and high, size apart), how many have no hill, tree or bush
// in the way, 0 to 3. Grass counts for the centre and high points only: an
// animal with its legs in the grass is still a fine picture. Trees and
// bushes count within 300 m; beyond that the subject is out at sea or in
// the sky.
export function pointsInSight(game, ax, ay, az, bx, by, bz, size) {
  const far = Math.hypot(bx - ax, by - ay, bz - az) >= 300;
  let n = 0;
  for (const k of [-0.3, 0, 0.3]) {
    const y = by + k * size;
    if (groundInTheWay(game, ax, ay, az, bx, y, bz, k >= 0)) continue;
    if (!far && (treesInTheWay(game, ax, ay, az, bx, y, bz) || plantsInTheWay(game, ax, ay, az, bx, y, bz))) continue;
    n++;
  }
  return n;
}

export class PhotoCamera {
  constructor(game) {
    this.game = game;
    this.album = loadAlbum();
    this.zoomIndex = 1;
    this.focus = null;
    this.focusT = 0;
    this.busy = false;
  }

  get zoom() {
    return ZOOMS[this.zoomIndex];
  }

  owned() {
    return !!this.game.state.gear.camera;
  }

  persist() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.album));
      return true;
    } catch (e) {
      // the device ran out of room: drop the roll and try once more
      this.album.roll.length = 0;
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(this.album));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  // Wipe the album with the save (a new game).
  wipe() {
    this.album = { shots: {}, roll: [] };
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch (e) {
      /* nothing stored */
    }
  }

  count() {
    return Object.keys(this.album.shots).length;
  }

  // Everything that could be in the picture right now.
  subjects() {
    const g = this.game;
    const W = g.wildlife;
    const out = [];
    const add = (id, x, y, z, size) => {
      if (PHOTO_SUBJECTS[id]) out.push({ id, x, y, z, size: size ?? PHOTO_SUBJECTS[id].size });
    };
    for (const a of W.animals) if (!a.dead && a.alive !== false && a.visible !== false) add(a.species, a.x, a.y + a.cfg.height * a.scale * 0.55, a.z, a.cfg.height * a.scale);
    for (const b of g.bears.bears) if (!b.dead && b.state !== 'gone' && b.visible !== false) add(b.kind === 'black' ? 'blackbear' : 'bear', b.x, (b.y || 0) + 0.8, b.z);
    for (const b of W.birds) if (!(b.under > 0)) add(b.sp, b.x, b.y + 0.2, b.z);
    for (const w of W.whales) if (w.y > -1.6) add('whale', w.x, Math.max(0, w.y + 1), w.z);
    for (const o of W.orcas || []) if (o.y > -1.2 && o.x !== undefined) add('orca', o.x, Math.max(0, o.y + 0.8), o.z);
    for (const o of W.otters) add('otter', o.x, 0.15, o.z);
    for (const s of W.seaLions || []) add('sealion', s.x, (s.y ?? 0.5) + 0.4, s.z);
    for (const s of W.seals || []) if (s.up && (s.y ?? 0) > -0.9) add('seal', s.x, 0.2, s.z);
    for (const b of W.beavers || []) if (!(b.under > 0)) add('beaver', b.x, (b.lake ? b.lake.level : 0) + 0.15, b.z);
    // something big and hairy at the edge of the trees
    const B = g.bigfoot;
    if (B && B.active) add('bigfoot', B.pos.x, B.pos.y + 1.4, B.pos.z);
    // a moment in progress: the geyser blowing
    const m = this.moment;
    if (m && g.time < m.until) add(m.id, m.x, m.y, m.z);
    return out;
  }

  // The part of the screen a picture keeps: a 16:9 frame in the middle,
  // as fractions of the screen's width and height.
  crop() {
    const c = this.game.renderer.domElement;
    const sw = c.width || 1;
    const sh = c.height || 1;
    const k = Math.min((sw * 0.86) / THUMB_W, (sh * 0.64) / THUMB_H);
    return { fx: (THUMB_W * k) / sw, fy: (THUMB_H * k) / sh, k };
  }

  // The subject the shot would be of, with its star rating (0 to 3). Only
  // what lands inside the picture's frame counts.
  evaluate() {
    const g = this.game;
    const cam = g.camera;
    const eye = cam.position;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const { fx, fy } = this.crop();
    let best = null;
    for (const s of this.subjects()) {
      const dx = s.x - eye.x;
      const dy = s.y - eye.y;
      const dz = s.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.5 || d > 600) continue;
      _v.set(s.x, s.y, s.z).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > fx * 0.96 || Math.abs(_v.y) > fy * 0.96) continue;
      // how much of the picture's height it fills, and how far off centre
      const frac = s.size / (2 * d * tanHalf) / fy;
      const off = Math.max(Math.abs(_v.x) / fx, Math.abs(_v.y) / fy);
      // how much of it a hill, the grass, a tree or a bush hides
      const seen = pointsInSight(g, eye.x, eye.y, eye.z, s.x, s.y, s.z, s.size);
      if (!seen) continue;
      let stars = frac >= 0.2 ? 3 : frac >= 0.09 ? 2 : frac >= 0.035 ? 1 : 0;
      if (stars > 1 && off > 0.4) stars--;
      // partly hidden: a star less for each part, but something to show
      if (seen < 3 && stars) stars = Math.max(1, stars - (3 - seen));
      const score = frac * (1.4 - off) * (seen / 3);
      if (!best || score > best.score) best = { ...s, d, frac, off, stars, score, seen };
    }
    return best;
  }

  // Raise or lower the camera: the HUD shows the viewfinder while it is up.
  update(dt) {
    const g = this.game;
    const P = g.player;
    const active = P.mode === 'foot' && P.tool === 'camera' && !g.menuOpen && !g.hud.blocking;
    if (!active) {
      this.focus = null;
      return;
    }
    const input = g.input;
    if (input.pressed('secondary') || input.keyPressed('KeyZ') || input.keyPressed('Mouse2')) {
      this.zoomIndex = (this.zoomIndex + 1) % ZOOMS.length;
      g.audio?.tick(this.zoomIndex === 0 ? 0 : 1);
    }
    // what the viewfinder is on, a few times a second
    this.focusT -= dt;
    if (this.focusT <= 0) {
      this.focusT = 0.25;
      this.focus = this.evaluate();
    }
    if ((input.pressed('primary') || input.keyPressed('Space') || input.mouseActionPressed()) && !this.busy) this.snap();
  }

  // Take the picture: the next rendered frame is grabbed, shrunk and kept.
  snap(subjectOverride = null) {
    const g = this.game;
    this.busy = true;
    g.audio?.shutter?.();
    g.hud.flash?.();
    const subject = subjectOverride || this.evaluate();
    const hour = g.env.time;
    const day = g.env.day;
    const place = g.fishing.hotPlace ? g.fishing.hotPlace.name : null;
    g.onRendered = (canvas) => {
      this.busy = false;
      // every Bigfoot picture is blurry: it is the law
      const img = this.thumbnail(canvas, subject && subject.id === 'bigfoot' ? 2.2 : 0);
      if (!img) return;
      this.keep(img, subject, { hour, day, place });
    };
  }

  thumbnail(src, blur = 0) {
    try {
      const c = document.createElement('canvas');
      c.width = THUMB_W;
      c.height = THUMB_H;
      const ctx = c.getContext('2d');
      // ask before setting it: setting it where it is not supported makes
      // a plain property that then looks like support
      const filters = 'filter' in ctx;
      if (blur && filters) ctx.filter = `blur(${blur}px)`;
      // a 16:9 frame from the middle of the screen, about as tall as the
      // viewfinder, so the subject fills the picture as it filled the frame
      const sw = src.width;
      const sh = src.height;
      const k = Math.min((sw * 0.86) / THUMB_W, (sh * 0.64) / THUMB_H);
      const w = THUMB_W * k;
      const h = THUMB_H * k;
      if (blur && !filters) {
        // no canvas filters (older Safari): shrink and stretch back instead
        const t = document.createElement('canvas');
        t.width = Math.round(THUMB_W / (1 + blur * 1.6));
        t.height = Math.round(THUMB_H / (1 + blur * 1.6));
        t.getContext('2d').drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, t.width, t.height);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(t, 0, 0, THUMB_W, THUMB_H);
      } else ctx.drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, THUMB_W, THUMB_H);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      return null;
    }
  }

  // File the picture: the album keeps each species' best shot, the roll the
  // last few of everything else.
  keep(img, subject, when) {
    const g = this.game;
    const A = this.album;
    if (!subject || subject.stars <= 0) {
      A.roll.unshift({ img, ...when });
      A.roll.length = Math.min(A.roll.length, ROLL);
      this.persist();
      g.hud.toast(subject ? `Too far away to make out the ${PHOTO_SUBJECTS[subject.id].name.toLowerCase()}. Zoom in or get closer` : 'Nice view. Saved to the camera roll');
      return;
    }
    const info = PHOTO_SUBJECTS[subject.id];
    g.jobs?.onPhoto(subject.id, subject.stars);
    const old = A.shots[subject.id];
    const stars = '★'.repeat(subject.stars) + '☆'.repeat(3 - subject.stars);
    if (!old || subject.stars >= old.stars) {
      A.shots[subject.id] = { img, stars: subject.stars, dist: Math.round(subject.d || 0), ...when };
      const saved = this.persist();
      // the sale is kept in the save game, so a lost album never sells twice
      const sold = g.state.photoSold;
      if (!sold[subject.id]) {
        sold[subject.id] = subject.stars;
        // the magazine buys a first shot of anything that is not a fish
        const pay = info.value ? Math.round((info.value * subject.stars) / 3 / 5) * 5 : 0;
        if (pay > 0) g.state.addMoney(pay);
        g.hud.toast(`${stars} ${info.name}: new in the album${pay ? `. Alaska Outdoors buys it for $${pay}` : ''}`, 'good');
        const animals = Object.keys(sold).filter((id) => !id.startsWith('fish:') && PHOTO_SUBJECTS[id] && PHOTO_SUBJECTS[id].group !== 'moments').length;
        g.onEvent({ type: 'photo', id: subject.id, stars: subject.stars, animals });
      } else if (!old) g.hud.toast(`${stars} ${info.name}: back in the album`, 'good');
      else g.hud.toast(`${stars} ${info.name}: a better shot for the album`, 'good');
      if (!saved) g.hud.toast("This device's storage is full or blocked: the picture may not be kept", 'bad');
      if (subject.id === 'bigfoot') {
        g.announcer?.say('bigfoot', { sub: 'BLURRY, AS TRADITION DEMANDS', kind: 'legend' });
        g.onEvent({ type: 'bigfoot' });
      } else if (subject.stars === 3) g.announcer?.say('photo', { banner: false });
    } else {
      A.roll.unshift({ img, ...when });
      A.roll.length = Math.min(A.roll.length, ROLL);
      this.persist();
      g.hud.toast(`${stars} ${info.name}. The album already has a better one`);
    }
  }

  // A trophy shot of the fish in your hands (from the catch card).
  catchPhoto(info) {
    const f = FISH[info.species];
    const u = (info.weight - f.min) / Math.max(0.1, f.max - f.min);
    const stars = info.legend ? 3 : u > 0.6 ? 3 : u > 0.3 ? 2 : 1;
    this.snap({ id: 'fish:' + info.species, stars, d: 1 });
  }
}
