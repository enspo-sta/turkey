// The houses and the places you visit most, in detail: Ruben's log cabin
// at Hotrod Landing with its porch, chimney and yard, the outhouse and the
// mailbox; the Kenai Trading Post with its porch, fuel island and weigh
// station; Kachemak Light and the keeper's house; Halibut Pier with its bait
// shack; the lake docks and their rowboats; the Bear Falls platform, the
// tundra lookout and the trailhead sign posts. The pieces are ModelBuilder
// parts with surface finishes (see world/finish.js) merged into the props'
// static meshes, so the detail costs triangles but no extra draws. Each
// building stands on its own ground: a stone foundation down to the lowest
// ground under it, steps down from its porch, and colliders, decks and
// interaction points to match (the cabin's and the Trading Post's yards are
// levelled by the world; see world/sites.js).
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { mulberry32 } from '../util/math.js';
import { ROAD_HALF } from './worldgen.js';
import { makeAlaskaFlagTexture } from '../util/textures.js';

export const WOOD = 0x6b4a2e;
export const WOOD_DARK = 0x4a3220;
export const WOOD_LIGHT = 0x8a6a45;
export const LOG = 0x7a5534;
export const LOG_END = 0xc9a46a;
export const STONE = 0x8a847a;
export const SHINGLE = 0x6e5a48;
export const CHINK = 0xcdc4ae;
export const TRIM = 0xe6dfcf;
export const IRON = 0x1e1e1e;
export const GLASS_FRAME = 0x3b2a1c;

// Local-to-world helper for a building's origin and yaw: local +z is its
// front.
export function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x,
    z,
    yaw,
    to(lx, lz) {
      return [x + lx * c + lz * s, z - lx * s + lz * c];
    },
  };
}

// The lowest and highest ground under a rectangle in a building's frame.
export function groundRange(W, f, x0, x1, z0, z1, step = 0.5) {
  let lo = Infinity;
  let hi = -Infinity;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const h = W.heightAt(...f.to(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz));
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return { lo, hi };
}

// A gable triangle w wide and h tall, depth thick, its base at its origin.
export function gable(b, w, h, depth, o) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  b.add(geo, o);
}

// Rafters along the two top edges of a gable in the plane z, under a roof
// whose underside runs down from (0, ridgeY) at rise over run each way: they
// close the gap between the gable's boards and the roof. out: how far past
// the gable's corners they run under the eaves.
export function gableRafters(b, { run, rise, ridgeY, z, w = 0.2, depth = 0.14, out = 0.25, color = WOOD_DARK, matrix }) {
  const ang = Math.atan2(rise, run);
  const k = Math.tan(ang);
  // the rafter's top half a centimetre up into the roof's boards, so no light
  // shows between them; each runs 0.1 m past the apex, inside the roof
  const drop = (w / 2 - 0.005) / Math.cos(ang);
  const sub = new ModelBuilder();
  for (const sx of [1, -1]) sub.strut([sx * (run + out), ridgeY - k * (run + out) - drop, z], [-sx * 0.1, ridgeY + k * 0.1 - drop, z], w, depth, { color });
  b.add(sub.build(), { keepColors: true, jitter: 0, matrix });
}

// Parts of a wall run (along x) left after cutting out openings that cross
// the band y0..y1: [[x0, x1], ...].
function runsAround(x0, x1, y0, y1, holes) {
  let runs = [[x0, x1]];
  for (const h of holes) {
    if (h.y1 <= y0 || h.y0 >= y1) continue;
    const next = [];
    for (const [a, c] of runs) {
      if (h.x1 <= a || h.x0 >= c) next.push([a, c]);
      else {
        if (h.x0 > a) next.push([a, h.x0]);
        if (h.x1 < c) next.push([h.x1, c]);
      }
    }
    runs = next;
  }
  return runs.filter(([a, c]) => c - a > 0.05);
}

// Parts for a side wall, built as if for a front wall (along local x, its
// outside toward +z) and then turned onto the side: sd = 1 the right side
// (outside +x) at x = at, sd = -1 the left (outside -x). Along the wall,
// +x of that frame runs to the back on the right side and to the front on
// the left. fn gets one builder per target (the main one, the glow).
export function onSide(sd, at, targets, fn) {
  const subs = targets.map(() => new ModelBuilder());
  fn(...subs);
  const m = new THREE.Matrix4().makeRotationY((sd * Math.PI) / 2).setPosition(sd * at, 0, 0);
  subs.forEach((sb, i) => {
    if (!sb.parts.length) return;
    const g = sb.build();
    g.applyMatrix4(m);
    targets[i].add(g, { keepColors: true, jitter: 0 });
  });
}

// A flat wall from a0 to a1 along local x (axis 'x', centred at depth at)
// or along local z (axis 'z', centred at x = at), y0 to y1, cut round its
// openings (holes: [{ x0, x1, y0, y1 }] along the wall): bands between the
// openings' heights, each split round the openings it crosses. The finish
// runs on across the pieces (coordinates from the wall's own origin), and
// the pieces share one tone, so no seam shows between them.
export function panelWall(b, { a0, a1, y0, y1, at, axis = 'x', thick = 0.2, holes = [], color, surf, surfScale, surfSwap, jitter = 0 }) {
  const ys = [y0, y1];
  for (const h of holes) for (const y of [h.y0, h.y1]) if (y > y0 && y < y1) ys.push(y);
  ys.sort((p, q) => p - q);
  for (let i = 0; i + 1 < ys.length; i++) {
    const lo = ys[i];
    const hi = ys[i + 1];
    if (hi - lo < 0.01) continue;
    for (const [r0, r1] of runsAround(a0, a1, lo + 0.001, hi - 0.001, holes)) {
      const m = (r0 + r1) / 2;
      const ym = (lo + hi) / 2;
      const o = { color, surf, surfScale, surfSwap, jitter, surfOffset: [m, ym] };
      if (axis === 'x') b.box(r1 - r0, hi - lo, thick, { ...o, pos: [m, ym, at] });
      else b.box(thick, hi - lo, r1 - r0, { ...o, pos: [at, ym, m] });
    }
  }
}

// A wall of logs along local x at depth z (its centre plane): rows of logs
// with chinking between, cut round the openings, the logs running out past
// the corners. holes: [{ x0, x1, y0, y1 }]. side: +1 if the wall's outside
// faces +z.
export function logWall(b, { x0, x1, z, y0 = 0, rows, rowH, r, holes = [], side = 1, over = 0.32, color = LOG, rand }) {
  for (let i = 0; i < rows; i++) {
    const y = y0 + r + i * rowH;
    for (const [a, c] of runsAround(x0 - over, x1 + over, y - r * 0.55, y + r * 0.55, holes)) {
      const len = c - a;
      const tone = 0.92 + rand() * 0.16;
      const col = new THREE.Color(color).multiplyScalar(tone);
      // an open log (its top end, turned, is at -x) and a disc of light end
      // grain on each sawn end, the disc's corners on the log's
      const rA = r * (0.95 + rand() * 0.08);
      const rC = r * (0.95 + rand() * 0.08);
      b.add(new THREE.CylinderGeometry(rA, rC, len, 10, 1, true), { pos: [(a + c) / 2, y, z], rot: [0, 0, Math.PI / 2], color: col.getHex(), surf: 'log', jitter: 0.05 });
      for (const [ex, er, cut] of [
        [a, rA, a > x0 - over + 0.01],
        [c, rC, c < x1 + over - 0.01],
      ]) {
        const dir = ex === a ? -1 : 1;
        b.add(new THREE.CircleGeometry(er + 0.002, 10), { pos: [ex + dir * 0.001, y, z], rot: [0, (dir * Math.PI) / 2, 0], color: cut ? 0xb89060 : LOG_END, jitter: 0.08 });
      }
    }
    // chinking between this row and the next, on the outside face
    if (i < rows - 1) {
      for (const [a, c] of runsAround(x0, x1, y + rowH * 0.35, y + rowH * 0.65, holes)) {
        b.box(c - a, rowH - r * 1.7, 0.05, { pos: [(a + c) / 2, y + rowH / 2, z + side * (r * 0.55)], color: CHINK, jitter: 0.04 });
      }
    }
  }
}

// The casing of an opening in a log wall (jambs, head and a sill) through
// the wall's thickness, the opening wx wide and wy tall with its bottom
// centre at (cx, y0) on a wall whose outside faces +z at depth z.
export function opening(b, { cx, y0, w, h, z, thick, sill = true, color = WOOD_LIGHT, side = 1 }) {
  const t = 0.08;
  b.box(t, h + t, thick, { pos: [cx - w / 2 - t / 2, y0 + h / 2, z], color, surf: 'plank', surfSwap: true });
  b.box(t, h + t, thick, { pos: [cx + w / 2 + t / 2, y0 + h / 2, z], color, surf: 'plank', surfSwap: true });
  b.box(w + t * 2, t * 1.4, thick, { pos: [cx, y0 + h + t * 0.7, z], color, surf: 'plank' });
  if (sill) b.box(w + t * 3.5, 0.07, thick + 0.12, { pos: [cx, y0 - 0.035, z + side * 0.06], color, surf: 'plank' });
}

// A window of four panes (or rows by cols) in an opening: the sash, its
// bars and the glass, which goes into the glow builder (lit at night).
export function windowPanes(b, glow, { cx, y0, w, h, z, side = 1, rows = 2, cols = 2, color = GLASS_FRAME }) {
  const f = 0.055;
  const zf = z + side * 0.025;
  b.box(w, f, 0.05, { pos: [cx, y0 + f / 2, zf], color });
  b.box(w, f, 0.05, { pos: [cx, y0 + h - f / 2, zf], color });
  // (the sides half a centimetre wider, tucked under the casing)
  b.box(f + 0.005, h, 0.05, { pos: [cx - w / 2 + f / 2 - 0.0025, y0 + h / 2, zf], color });
  b.box(f + 0.005, h, 0.05, { pos: [cx + w / 2 - f / 2 + 0.0025, y0 + h / 2, zf], color });
  for (let i = 1; i < cols; i++) b.box(0.035, h, 0.04, { pos: [cx - w / 2 + (w * i) / cols, y0 + h / 2, zf + side * 0.005], color });
  for (let j = 1; j < rows; j++) b.box(w, 0.035, 0.04, { pos: [cx, y0 + (h * j) / rows, zf + side * 0.005], color });
  glow.box(w - f, h - f, 0.02, { pos: [cx, y0 + h / 2, z], color: 0xffffff, jitter: 0 });
}

// A plank door with a Z brace, strap hinges and a latch, closed in its
// opening; hingeLeft puts the hinges on its left as you face it.
export function plankDoor(b, { cx, y0 = 0, w = 1.0, h = 2.05, z, side = 1, color = 0x7a2b1c, hingeLeft = true }) {
  const zf = z + side * 0.03;
  b.box(w, h, 0.06, { pos: [cx, y0 + h / 2, z], color, surf: 'batten', surfScale: 0.62 });
  // the Z brace
  b.box(w - 0.1, 0.12, 0.035, { pos: [cx, y0 + 0.35, zf + side * 0.015], color });
  b.box(w - 0.1, 0.12, 0.035, { pos: [cx, y0 + h - 0.35, zf + side * 0.015], color });
  const ang = Math.atan2(h - 0.7, w - 0.2);
  b.box(Math.hypot(h - 0.7, w - 0.2), 0.1, 0.035, { pos: [cx, y0 + h / 2, zf + side * 0.015], rot: [0, 0, hingeLeft ? ang : -ang], color });
  // strap hinges and the latch
  const hx = hingeLeft ? cx - w / 2 : cx + w / 2;
  const dir = hingeLeft ? 1 : -1;
  for (const hy of [y0 + 0.35, y0 + h - 0.35]) b.box(0.42, 0.045, 0.02, { pos: [hx + dir * 0.2, hy, zf + side * 0.035], color: IRON, jitter: 0 });
  b.box(0.05, 0.16, 0.03, { pos: [cx - dir * (w / 2 - 0.12), y0 + 1.0, zf + side * 0.04], color: IRON, jitter: 0 });
  b.sphere(0.035, 6, 4, { pos: [cx - dir * (w / 2 - 0.12), y0 + 1.0, zf + side * 0.075], color: 0xb08a3a });
}

// A railing along local x from x0 to x1 at depth z, standing on y0: posts
// at the ends, a top and a bottom rail and balusters between.
export function railX(b, x0, x1, z, y0, { h = 0.95, color = WOOD_LIGHT, gap = 0.16, posts = true } = {}) {
  const len = x1 - x0;
  if (len <= 0.05) return;
  b.box(len, 0.07, 0.09, { pos: [(x0 + x1) / 2, y0 + h, z], color, surf: 'plank' });
  b.box(len, 0.06, 0.06, { pos: [(x0 + x1) / 2, y0 + 0.14, z], color, surf: 'plank' });
  const n = Math.floor(len / gap);
  for (let i = 1; i < n; i++) b.box(0.04, h - 0.2, 0.04, { pos: [x0 + (len * i) / n, y0 + h / 2 + 0.07, z], color, jitter: 0.08 });
  if (posts) for (const x of [x0, x1]) b.box(0.1, h + 0.08, 0.1, { pos: [x, y0 + (h + 0.08) / 2, z], color, surf: 'plank', surfSwap: true });
}

// The same along local z at x.
export function railZ(b, z0, z1, x, y0, { h = 0.95, color = WOOD_LIGHT, gap = 0.16, posts = true } = {}) {
  const len = z1 - z0;
  if (len <= 0.05) return;
  // (built along x and turned, so the boards run along the rail on every face)
  b.box(len, 0.07, 0.09, { pos: [x, y0 + h, (z0 + z1) / 2], rot: [0, Math.PI / 2, 0], color, surf: 'plank' });
  b.box(len, 0.06, 0.06, { pos: [x, y0 + 0.14, (z0 + z1) / 2], rot: [0, Math.PI / 2, 0], color, surf: 'plank' });
  const n = Math.floor(len / gap);
  for (let i = 1; i < n; i++) b.box(0.04, h - 0.2, 0.04, { pos: [x, y0 + h / 2 + 0.07, z0 + (len * i) / n], color, jitter: 0.08 });
  if (posts) for (const z of [z0, z1]) b.box(0.1, h + 0.08, 0.1, { pos: [x, y0 + (h + 0.08) / 2, z], color, surf: 'plank', surfSwap: true });
}

// Steps down from a deck edge at local z0 (running out toward +z), centred
// on x, width w, from height top (local) to the ground found by groundY(lx,
// lz) (local heights). Adds the treads and stringers to b and a deck for
// each tread through P. Returns the foot's z.
export function stepsDown(P, f, b, base, { x = 0, z0, w = 1.5, top = 0, groundY, rise = 0.19, run = 0.29, color = WOOD, dir = 1 }) {
  // how far down: the ground a little way out, then again where the
  // steps will end
  let drop = top - groundY(x, z0 + dir * 0.6);
  let n = Math.max(1, Math.round(drop / rise));
  drop = top - groundY(x, z0 + dir * run * n);
  n = Math.max(1, Math.round(drop / rise));
  if (drop < 0.12) return z0;
  const rs = drop / n;
  for (let k = 1; k <= n; k++) {
    const ty = top - k * rs;
    const tz = z0 + dir * (k - 0.5) * run;
    b.box(w, 0.06, run + 0.02, { pos: [x, ty - 0.03, tz], color, surf: 'deck' });
    b.box(w, rs, 0.03, { pos: [x, ty + rs / 2, tz - dir * (run / 2)], color: WOOD_DARK });
    const [wx, wz] = f.to(x, tz);
    P.colliders.addDeck(wx, wz, w / 2, run / 2, f.yaw, base + ty);
  }
  // the stringers, from the deck edge down to the ground at the foot
  const footZ = z0 + dir * n * run;
  for (const sx of [x - w / 2 - 0.04, x + w / 2 + 0.04]) {
    b.strut([sx, top - 0.05, z0], [sx, top - drop - 0.12, footZ + dir * 0.05], 0.06, 0.24, { color: WOOD_DARK });
  }
  return footZ;
}

// A canoe lying upside down (stored that way), length l, along local z.
export function upturnedCanoe(b, { x, y, z, l = 4.8, w = 0.86, h = 0.36, color = 0xc0331f, yaw = 0 }) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const hull = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(hull, { pos: [0, 0, 0], scale: [w / 2, h, l / 2], color, matrix: m, jitter: 0.03 });
  // gunwales round the rim and the keel line
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([Math.cos(a) * (w / 2 + 0.015), -0.02, Math.sin(a) * (l / 2 + 0.01)]);
  }
  for (let i = 0; i < 16; i++) {
    const p0 = new THREE.Vector3(...pts[i]).applyMatrix4(m);
    const p1 = new THREE.Vector3(...pts[i + 1]).applyMatrix4(m);
    b.strut(p0.toArray(), p1.toArray(), 0.05, 0.05, { color: 0x6a4a2a });
  }
  const k0 = new THREE.Vector3(0, h + 0.005, -l / 2 + 0.25).applyMatrix4(m);
  const k1 = new THREE.Vector3(0, h + 0.005, l / 2 - 0.25).applyMatrix4(m);
  b.strut(k0.toArray(), k1.toArray(), 0.04, 0.03, { color: 0x8a2416 });
}

// A sawhorse: a beam on two splayed pairs of legs, along local x.
export function sawhorse(b, { x, y, z, len = 0.9, h = 0.7, yaw = 0 }) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const P = (px, py, pz) => new THREE.Vector3(px, py, pz).applyMatrix4(m).toArray();
  b.strut(P(-len / 2, h, 0), P(len / 2, h, 0), 0.1, 0.1, { color: WOOD_LIGHT, surf: 'plank', surfSwap: true });
  for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) {
    for (const sz of [-1, 1]) b.strut(P(sx, h - 0.04, 0), P(sx + (sx < 0 ? -0.08 : 0.08), 0, sz * 0.32), 0.06, 0.05, { color: WOOD_LIGHT });
  }
}

// A barrel with staves and two hoops.
export function barrel(b, { x, y, z, r = 0.32, h = 0.88, color = 0x6a4428 }) {
  b.cyl(r * 0.92, r * 0.92, h, 14, { pos: [x, y + h / 2, z], color, surf: 'batten', surfScale: 1.6 });
  b.cyl(r, r, h * 0.5, 14, { pos: [x, y + h / 2, z], color, surf: 'batten', surfScale: 1.6 });
  for (const hy of [0.12, h - 0.12]) b.torus(r * 0.94, 0.018, 4, 18, { pos: [x, y + hy, z], rot: [Math.PI / 2, 0, 0], color: 0x2a2826, jitter: 0 });
  b.cyl(r * 0.9, r * 0.9, 0.02, 14, { pos: [x, y + h + 0.005, z], color: 0x5a3a22, surf: 'plank' });
}

// A stack of split firewood: rows of pieces with their light ends out.
export function woodpile(b, { x, y, z, len, rows = 5, depth = 0.55, rand, yaw = 0 }) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const per = Math.floor(len / 0.2);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per; i++) {
      const px = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * (len / per);
      if (px > len / 2) continue;
      const py = 0.1 + r * 0.19;
      const rr = 0.085 + rand() * 0.025;
      const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.3));
      const mm = new THREE.Matrix4().makeTranslation(px, py, 0).multiply(rot).premultiply(m);
      const tone = 0.85 + rand() * 0.3;
      // open pieces with a disc of split end grain on each end, so the
      // pile reads from either side
      b.add(new THREE.CylinderGeometry(rr, rr, depth, 5, 1, true), { matrix: mm, color: new THREE.Color(0x6a4a30).multiplyScalar(tone).getHex(), surf: 'log', jitter: 0.06 });
      for (const sd of [1, -1]) {
        const e = new THREE.Matrix4().makeTranslation(px, py, sd * (depth / 2 + 0.001)).multiply(rot).premultiply(m);
        const disc = new THREE.CircleGeometry(rr + 0.002, 5).rotateX((-sd * Math.PI) / 2).rotateY(-Math.PI / 2);
        b.add(disc, { matrix: e, color: new THREE.Color(0xd8b07a).multiplyScalar(tone).getHex(), jitter: 0.05 });
      }
    }
  }
}

// ------------------------------------------------------------- the cabin
export function buildCabin(P, c, oh) {
  const Wd = P.world;
  const f = frame(c.x, c.z, c.yaw);
  const rand = mulberry32(8);
  const W = 7.2;
  const D = 6.2;
  const R = 0.17;
  const ROWS = 9;
  const ROWH = 0.32;
  const WALL = R + (ROWS - 1) * ROWH + R;
  const PORCH = 2.45;
  const zWall = D / 2;
  const zPorch = zWall + R + PORCH;
  // the floor stands clear of the ground under the walls; the porch, out
  // over the slope toward the river, stands on posts
  const gr = groundRange(Wd, f, -W / 2 - 0.2, W / 2 + 0.2, -D / 2 - 0.2, D / 2 + 0.2);
  const base = gr.hi + 0.35;
  const gy = (lx, lz) => Wd.heightAt(...f.to(lx, lz)) - base;
  const b = new ModelBuilder();
  const glow = new ModelBuilder();

  // fieldstone foundation down to the lowest ground, and the sill log
  const footY = gr.lo - base - 0.3;
  b.box(W + 0.3, -footY, D + 0.3, { pos: [0, footY / 2, 0], color: STONE, surf: 'stone', jitter: 0.05 });
  b.box(W + 0.42, 0.12, D + 0.42, { pos: [0, -0.03, 0], color: 0x5a5148, surf: 'concrete', jitter: 0.04 });

  // the openings: the door and a window in front, a window in each side
  // and a small one at the back
  const front = [
    { x0: 0.35, x1: 1.35, y0: 0, y1: 2.05 },
    { x0: -2.55, x1: -1.25, y0: 0.85, y1: 1.95 },
  ];
  const back = [{ x0: -2.25, x1: -1.45, y0: 1.0, y1: 1.8 }];
  // (side walls: along the turned frame of onSide, so the right one's
  // window is at z -0.8..0.5, the left one's at z 1.2..2.5, clear of the
  // woodpile)
  // (1.97: the casing's head reaches the first whole log over it)
  const right = [{ x0: -0.5, x1: 0.8, y0: 0.85, y1: 1.97 }];
  const left = [{ x0: 1.2, x1: 2.5, y0: 0.85, y1: 1.97 }];
  // front and back walls (logs along x)
  logWall(b, { x0: -W / 2, x1: W / 2, z: zWall, rows: ROWS, rowH: ROWH, r: R, holes: front, side: 1, rand });
  logWall(b, { x0: -W / 2, x1: W / 2, z: -zWall, rows: ROWS, rowH: ROWH, r: R, holes: back, side: -1, rand });
  // the side walls (logs along z), half a row higher where they cross, on a
  // squared sill beam each
  for (const sd of [1, -1]) {
    b.box(D + 0.2, 0.2, R * 2, { pos: [sd * (W / 2), 0.1, 0], rot: [0, Math.PI / 2, 0], color: LOG, surf: 'log', surfSwap: true });
    onSide(sd, W / 2, [b], (sb) => logWall(sb, { x0: -D / 2, x1: D / 2, z: 0, y0: ROWH / 2, rows: ROWS, rowH: ROWH, r: R, holes: sd > 0 ? right : left, side: 1, over: 0.3, rand }));
  }

  // the casings, windows and the door
  const thick = R * 2 + 0.06;
  opening(b, { cx: 0.85, y0: 0, w: 1.0, h: 2.05, z: zWall, thick, sill: false });
  plankDoor(b, { cx: 0.85, w: 1.0, h: 2.05, z: zWall + 0.02, hingeLeft: false });
  // a squared header log over the door, up to the next whole log
  b.box(1.36, 0.12, thick - 0.02, { pos: [0.85, 2.2, zWall], color: LOG, surf: 'log', surfSwap: true });
  const win = (cx, y0, w, h, z, side) => {
    opening(b, { cx, y0, w, h, z, thick, side });
    windowPanes(b, glow, { cx, y0, w, h, z: z - side * 0.02, side });
  };
  win(-1.9, 0.85, 1.3, 1.1, zWall, 1);
  win(-1.85, 1.0, 0.8, 0.8, -zWall, -1);
  // side windows, on the side walls
  for (const sd of [1, -1]) {
    const h = (sd > 0 ? right : left)[0];
    const cx = (h.x0 + h.x1) / 2;
    onSide(sd, W / 2, [b, glow], (sw, sg) => {
      opening(sw, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: 0, thick, side: 1 });
      windowPanes(sw, sg, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: -0.02, side: 1 });
    });
  }
  // shutters by the front window, green with a pine cut out
  for (const sx of [-1.9 - 0.95, -1.9 + 0.95]) {
    b.box(0.52, 1.2, 0.05, { pos: [sx, 1.4, zWall + R + 0.04], color: 0x2e5a3a, surf: 'batten', surfScale: 0.7 });
    b.cone(0.1, 0.26, 3, { pos: [sx, 1.62, zWall + R + 0.07], color: 0x152a1c, jitter: 0 });
  }
  // a flower box under it
  b.box(1.4, 0.2, 0.22, { pos: [-1.9, 0.72, zWall + R + 0.12], color: 0x5a3a22, surf: 'plank' });
  for (let i = 0; i < 9; i++) {
    b.sphere(0.06 + rand() * 0.03, 5, 4, { pos: [-2.5 + i * 0.15, 0.86 + rand() * 0.05, zWall + R + 0.12 + (rand() - 0.5) * 0.08], color: i % 3 === 0 ? 0xd8322a : i % 3 === 1 ? 0xf2c230 : 0x3a7a2a });
  }

  // gables of board and batten, a vent in each, and the ridge pole's end
  const rise = 2.0;
  const gw = W + R * 2;
  for (const sd of [1, -1]) {
    gable(b, gw, rise, 0.12, { pos: [0, WALL - 0.02, sd * (zWall + R - 0.06)], color: 0x7a5a3a, surf: 'batten' });
    b.box(0.5, 0.5, 0.06, { pos: [0, WALL + 0.75, sd * (zWall + R + 0.01)], color: WOOD_DARK });
    for (let k = 0; k < 4; k++) b.box(0.42, 0.04, 0.05, { pos: [0, WALL + 0.58 + k * 0.11, sd * (zWall + R + 0.04)], rot: [sd * 0.5, 0, 0], color: 0x2a1e14, jitter: 0 });
  }
  // the roof: cedar shingles on two slabs, the porch under its front
  const half = W / 2 + R;
  const ang = Math.atan2(rise, half);
  const over = 0.6;
  const slope = Math.hypot(half, rise) + over;
  const zb = -zWall - R - 0.5;
  const zf = zPorch + 0.3;
  const rl = zf - zb;
  const rz = (zf + zb) / 2;
  const ridgeY = WALL + rise + 0.1;
  for (const sd of [1, -1]) {
    const cx = sd * Math.cos(ang) * (slope / 2);
    const cy = ridgeY - Math.sin(ang) * (slope / 2);
    // shingles on top, the boards of the roof deck under them seen from
    // below (over the porch)
    // (surfScale -sd: the rows' butts face down the slope on both sides)
    b.box(slope, 0.08, rl, { pos: [cx + sd * Math.sin(ang) * 0.1, cy + Math.cos(ang) * 0.1, rz], rot: [0, 0, -sd * ang], color: SHINGLE, surf: 'shingle', surfSwap: true, surfScale: -sd, jitter: 0.03 });
    b.box(slope - 0.04, 0.06, rl - 0.04, { pos: [cx + sd * Math.sin(ang) * 0.03, cy + Math.cos(ang) * 0.03, rz], rot: [0, 0, -sd * ang], color: 0x8a6a48, surf: 'plank', surfSwap: true, jitter: 0.03 });
    // fascia along the eave and barge boards up the gable ends
    const ex = sd * Math.cos(ang) * slope;
    const ey = ridgeY - Math.sin(ang) * slope;
    b.box(rl + 0.08, 0.24, 0.06, { pos: [ex + sd * 0.03, ey + 0.02, rz], rot: [0, Math.PI / 2, 0], color: WOOD_LIGHT, surf: 'plank' });
    for (const zz of [zb - 0.03, zf + 0.03]) b.strut([ex, ey - 0.06, zz], [0, ridgeY + 0.06, zz], 0.24, 0.06, { color: WOOD_LIGHT });
  }
  b.box(0.34, 0.12, rl + 0.06, { pos: [0, ridgeY + 0.12, rz], color: 0x4a3a2c, surf: 'plank', surfSwap: true });
  for (const sd of [1, -1]) gableRafters(b, { run: half, rise, ridgeY, z: sd * (zWall + R - 0.06), color: WOOD_DARK });

  // the porch: a deck, its rim, posts down to the ground, an open truss
  // under the roof's front, railings and steps down
  const pz = (zWall + R + zPorch) / 2;
  const pw = W + R * 2 + 0.2;
  b.box(pw, 0.12, PORCH, { pos: [0, -0.06, pz], color: 0x8a6a48, surf: 'deck', surfSwap: true });
  b.box(pw + 0.06, 0.26, 0.06, { pos: [0, -0.17, zPorch + 0.03], color: WOOD_DARK, surf: 'plank' });
  for (const sd of [1, -1]) b.box(PORCH, 0.26, 0.06, { pos: [sd * (pw / 2 + 0.03), -0.17, pz], rot: [0, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  const postZ = zPorch - 0.12;
  const postXs = [-pw / 2 + 0.12, -W / 6, W / 6, pw / 2 - 0.12];
  const beamY = WALL - 0.3;
  for (const px of postXs) {
    const g0 = Math.min(-0.3, gy(px, postZ) - 0.1);
    b.cyl(0.115, 0.125, beamY - g0, 9, { pos: [px, (beamY + g0) / 2, postZ], color: LOG, surf: 'log' });
    // knee braces up to the beam
    for (const kd of [-1, 1]) if (Math.abs(px + kd * 0.6) < pw / 2) b.strut([px, beamY - 0.62, postZ], [px + kd * 0.6, beamY - 0.06, postZ], 0.08, 0.08, { color: LOG });
  }
  // the truss: tie beam, king post and struts to the barge boards
  b.box(pw + 0.3, 0.22, 0.2, { pos: [0, beamY + 0.05, postZ], color: LOG, surf: 'log', surfSwap: true });
  b.box(0.16, ridgeY - beamY - 0.2, 0.16, { pos: [0, (ridgeY + beamY) / 2 - 0.02, postZ], color: LOG });
  for (const sd of [1, -1]) b.strut([0, beamY + 0.3, postZ], [sd * 1.8, ridgeY - Math.tan(ang) * 1.8 - 0.1, postZ], 0.12, 0.12, { color: LOG });
  // under the deck where the ground falls away: skirting boards
  for (const [x0, x1] of [
    [-pw / 2, pw / 2],
  ]) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const sx0 = x0 + ((x1 - x0) * i) / n;
      const sx1 = x0 + ((x1 - x0) * (i + 1)) / n;
      const low = Math.min(gy(sx0, zPorch), gy(sx1, zPorch)) - 0.15;
      if (low < -0.3) b.box(sx1 - sx0 + 0.01, -0.3 - low, 0.04, { pos: [(sx0 + sx1) / 2, (-0.3 + low) / 2, zPorch - 0.02], color: 0x5a4430, surf: 'batten' });
    }
  }
  for (const sd of [1, -1]) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const z0 = zWall + R + (PORCH * i) / n;
      const z1 = zWall + R + (PORCH * (i + 1)) / n;
      const low = Math.min(gy(sd * pw / 2, z0), gy(sd * pw / 2, z1)) - 0.15;
      if (low < -0.3) b.box(0.04, -0.3 - low, z1 - z0 + 0.01, { pos: [sd * (pw / 2 - 0.02), (-0.3 + low) / 2, (z0 + z1) / 2], color: 0x5a4430, surf: 'batten', surfSwap: false });
    }
  }
  // railings: along the front either side of the steps, and down the sides
  const stepW = 1.5;
  railX(b, -pw / 2 + 0.12, -stepW / 2 - 0.1, postZ, 0);
  railX(b, stepW / 2 + 0.1, pw / 2 - 0.12, postZ, 0);
  railZ(b, zWall + R + 0.1, postZ, -pw / 2 + 0.12, 0, { posts: false });
  railZ(b, zWall + R + 0.1, postZ, pw / 2 - 0.12, 0, { posts: false });
  const footZ = stepsDown(P, f, b, base, { x: 0, z0: zPorch, w: stepW, top: 0, groundY: gy });

  // on the porch: a bench, a rocking chair, boots by the door, a rod and
  // a lantern; antlers over the door and a mat
  b.box(1.5, 0.06, 0.42, { pos: [-2.0, 0.46, zWall + R + 0.35], color: WOOD_LIGHT, surf: 'plank' });
  b.box(1.5, 0.42, 0.05, { pos: [-2.0, 0.78, zWall + R + 0.14], rot: [-0.12, 0, 0], color: WOOD_LIGHT, surf: 'plank' });
  for (const lx of [-2.65, -1.35]) b.box(0.07, 0.46, 0.38, { pos: [lx, 0.23, zWall + R + 0.35], color: WOOD_DARK });
  // the rocking chair
  {
    const rx = -0.4;
    const rz = zWall + R + 1.3;
    for (const sx of [-0.24, 0.24]) {
      b.strut([rx + sx, 0.12, rz - 0.38], [rx + sx, 0.04, rz], 0.04, 0.05, { color: WOOD_DARK });
      b.strut([rx + sx, 0.04, rz], [rx + sx, 0.12, rz + 0.38], 0.04, 0.05, { color: WOOD_DARK });
      b.box(0.04, 0.4, 0.04, { pos: [rx + sx, 0.3, rz + 0.18], color: WOOD_DARK });
      b.box(0.04, 0.95, 0.04, { pos: [rx + sx, 0.55, rz - 0.22], rot: [0.15, 0, 0], color: WOOD_DARK });
      b.box(0.06, 0.04, 0.5, { pos: [rx + sx, 0.66, rz], color: WOOD_LIGHT });
    }
    b.box(0.52, 0.05, 0.46, { pos: [rx, 0.5, rz], color: WOOD_LIGHT, surf: 'plank' });
    for (let k = 0; k < 4; k++) b.box(0.07, 0.62, 0.025, { pos: [rx - 0.15 + k * 0.1, 0.86, rz - 0.27], rot: [0.15, 0, 0], color: WOOD_LIGHT });
    // a red and black checked blanket over its back
    b.box(0.5, 0.45, 0.03, { pos: [rx, 0.95, rz - 0.31], rot: [0.15, 0, 0], color: 0xa02a20 });
  }
  for (const bx of [1.55, 1.75]) {
    b.box(0.12, 0.3, 0.12, { pos: [bx, 0.15, zWall + R + 0.22], color: 0x3a2a1c });
    b.box(0.12, 0.08, 0.28, { pos: [bx, 0.04, zWall + R + 0.3], color: 0x3a2a1c });
  }
  b.beam([2.3, 0.02, zWall + R + 0.15], [2.55, 2.6, zWall + R + 0.1], 0.012, 4, { color: 0x222222 });
  b.cyl(0.04, 0.04, 0.05, 8, { pos: [2.33, 0.45, zWall + R + 0.15], rot: [0, 0, Math.PI / 2], color: 0x888888 });
  b.box(1.0, 0.02, 0.6, { pos: [0.85, 0.01, zWall + R + 0.4], color: 0x8a2a24, jitter: 0.04 });
  for (const s of [-1, 1]) {
    b.beam([0.85, 2.38, zWall + R + 0.08], [0.85 + s * 0.38, 2.62, zWall + R + 0.16], 0.045, 5, { color: 0xd8ccb0 });
    b.box(0.6, 0.05, 0.4, { pos: [0.85 + s * 0.68, 2.82, zWall + R + 0.2], rot: [0.35, 0, s * 0.55], color: 0xd8ccb0 });
    for (let k = 0; k < 3; k++) b.cone(0.03, 0.18, 4, { pos: [0.85 + s * (0.5 + k * 0.16), 3.0 + k * 0.03, zWall + R + 0.24], color: 0xe2d8c0, jitter: 0 });
  }
  // a lantern on the wall by the door
  b.box(0.06, 0.25, 0.06, { pos: [1.68, 2.0, zWall + R + 0.05], color: IRON });
  b.cyl(0.08, 0.09, 0.2, 6, { pos: [1.68, 1.8, zWall + R + 0.14], color: IRON });
  glow.cyl(0.06, 0.06, 0.13, 6, { pos: [1.68, 1.8, zWall + R + 0.14], color: 0xffffff, jitter: 0 });

  // the stone chimney up the back wall
  const chX = 1.6;
  const chZ = -zWall - R - 0.48;
  const chG = Math.min(gy(chX, chZ), -0.2) - 0.2;
  b.box(1.35, 3.3 - chG, 0.95, { pos: [chX, (3.3 + chG) / 2, chZ], color: STONE, surf: 'stone' });
  b.box(0.95, 2.5, 0.75, { pos: [chX, 3.3 + 1.25, chZ - 0.08], color: STONE, surf: 'stone' });
  b.box(1.15, 0.14, 0.95, { pos: [chX, 5.87, chZ - 0.08], color: 0x5c574f, surf: 'concrete' });
  b.box(0.36, 0.3, 0.36, { pos: [chX, 6.08, chZ - 0.08], color: 0x2e2a26 });
  // a satellite dish on the roof (Ruben has his priorities)
  {
    const sx = 2.4;
    const sy = ridgeY - Math.tan(ang) * sx + 0.1;
    b.beam([sx, sy, -1.6], [sx, sy + 0.55, -1.6], 0.03, 5, { color: 0x888888 });
    b.cyl(0.42, 0.06, 0.12, 14, { pos: [sx + 0.08, sy + 0.72, -1.7], rot: [-0.7, 0, -0.5], color: 0xd8d8d0 });
    b.beam([sx + 0.08, sy + 0.72, -1.7], [sx + 0.2, sy + 0.95, -1.35], 0.012, 4, { color: 0x666666 });
  }

  // the yard: a woodpile under a lean-to on the left, a chopping block and
  // axe, a propane tank, a rain barrel at the back corner
  const lx = -W / 2 - R - 0.62;
  const lg = Math.min(gy(lx, -1.2), gy(lx, 1.0));
  for (const zz of [-2.6, 1.0]) {
    b.box(0.1, 2.25 - lg, 0.1, { pos: [lx - 0.48, (2.25 + lg) / 2, zz], color: WOOD_DARK });
  }
  b.box(1.6, 0.06, 4.1, { pos: [lx - 0.15, 2.18, -0.8], rot: [0, 0, 0.22], color: 0x6a6e70, surf: 'metal', surfSwap: true });
  woodpile(b, { x: lx - 0.05, y: lg, z: -0.8, len: 3.4, rows: 7, depth: 0.55, rand, yaw: -Math.PI / 2 });
  {
    const bx = -W / 2 - 2.1;
    const bz = 2.2;
    const by = gy(bx, bz);
    b.cyl(0.33, 0.36, 0.55, 10, { pos: [bx, by + 0.27, bz], color: 0x6a4a2e, surf: 'log' });
    b.cyl(0.32, 0.32, 0.02, 10, { pos: [bx, by + 0.555, bz], color: LOG_END });
    b.beam([bx + 0.05, by + 0.5, bz], [bx + 0.55, by + 1.05, bz + 0.25], 0.025, 5, { color: 0x9a7a50 });
    b.box(0.2, 0.09, 0.025, { pos: [bx + 0.06, by + 0.53, bz - 0.02], rot: [0, 0.45, 0.8], color: 0x4a4e52 });
    for (let k = 0; k < 6; k++) b.cyl(0.07, 0.07, 0.4, 5, { pos: [bx + (rand() - 0.5) * 1.2, by + 0.07, bz + 0.5 + rand() * 0.6], rot: [Math.PI / 2, rand() * 3, 0], color: 0x8a6a48, surf: 'log' });
  }
  {
    const tx = -W / 2 - 1.3;
    const tz = 3.6;
    const ty = gy(tx, tz);
    b.cyl(0.33, 0.33, 1.1, 12, { pos: [tx, ty + 0.62, tz], rot: [Math.PI / 2, 0, 0], color: 0xe8e6e0 });
    for (const s of [-1, 1]) b.sphere(0.33, 12, 6, { pos: [tx, ty + 0.62, tz + s * 0.55], scale: [1, 1, 0.45], color: 0xe8e6e0, smooth: true });
    for (const s of [-0.35, 0.35]) b.box(0.5, 0.3, 0.08, { pos: [tx, ty + 0.15, tz + s], color: 0x4a4e52 });
    b.cyl(0.07, 0.09, 0.1, 8, { pos: [tx, ty + 0.98, tz], color: 0xb08a3a });
  }
  barrel(b, { x: W / 2 + R + 0.42, y: gy(W / 2 + 0.6, -zWall + 0.4), z: -zWall + 0.4 });

  // the canoe upside down on sawhorses on the right
  {
    const cx = W / 2 + 2.6;
    const cz = -0.4;
    const cy = Math.max(gy(cx, cz - 1.2), gy(cx, cz + 1.2));
    for (const dz of [-1.2, 1.2]) sawhorse(b, { x: cx, y: cy, z: cz + dz, len: 1.0, h: 0.72 });
    upturnedCanoe(b, { x: cx, y: cy + 0.77, z: cz, l: 4.9 });
    b.box(0.16, 0.025, 1.6, { pos: [cx + 0.7, cy + 0.02, cz + 0.3], rot: [0, 0.3, 0], color: 0x9a7a50 });
  }
  // a fish rack toward the river with salmon drying
  {
    const fx = W / 2 + 3.4;
    const fz = zPorch + 2.6;
    const fy = Math.min(gy(fx - 1.4, fz), gy(fx + 1.4, fz));
    for (const sx of [-1.5, 1.5]) {
      b.strut([fx + sx, fy - 0.2, fz - 0.55], [fx + sx, fy + 2.0, fz], 0.08, 0.08, { color: 0x5a4632 });
      b.strut([fx + sx, fy - 0.2, fz + 0.55], [fx + sx, fy + 2.0, fz], 0.08, 0.08, { color: 0x5a4632 });
    }
    b.cyl(0.05, 0.05, 3.3, 6, { pos: [fx, fy + 1.98, fz], rot: [0, 0, Math.PI / 2], color: 0x6a5238, surf: 'log' });
    // split salmon drying over the pole: two dark red strips each, joined
    // at the tail where it hangs, of a few lengths
    for (let k = 0; k < 9; k++) {
      const sx = fx - 1.36 + k * 0.34;
      const l = 0.22 + rand() * 0.07;
      const tilt = (rand() - 0.5) * 0.1;
      const tone = 0.85 + rand() * 0.3;
      for (const sd of [1, -1]) {
        const col = new THREE.Color(sd > 0 ? 0x8a3420 : 0x6e2a1c).multiplyScalar(tone).getHex();
        b.sphere(1, 6, 4, { pos: [sx, fy + 1.92 - l, fz + sd * 0.03], scale: [0.055, l, 0.014], rot: [sd * 0.08, 0, tilt], color: col, jitter: 0.05 });
      }
      b.cone(0.035, 0.09, 4, { pos: [sx, fy + 1.95, fz], rot: [Math.PI, 0, 0], color: 0x3a3a32 });
    }
  }
  // the bear cache on its stilts behind the cabin, tin round the legs
  {
    const kx = -W / 2 - 2.6;
    const kz = -zWall - 3.4;
    const leg = 2.5;
    const top = Math.max(gy(kx, kz), gy(kx - 0.8, kz - 0.7), gy(kx + 0.8, kz + 0.7)) + leg;
    for (const [sx, sz] of [
      [-0.8, -0.7],
      [0.8, -0.7],
      [-0.8, 0.7],
      [0.8, 0.7],
    ]) {
      const g0 = gy(kx + sx, kz + sz) - 0.2;
      b.cyl(0.11, 0.13, top - g0, 8, { pos: [kx + sx, (top + g0) / 2, kz + sz], color: LOG, surf: 'log' });
      b.cyl(0.135, 0.135, 0.55, 8, { pos: [kx + sx, top - 1.0, kz + sz], color: 0xb8bcbe, surf: 'metal' });
      const [wx, wz] = f.to(kx + sx, kz + sz);
      P.colliders.addCircle(wx, wz, 0.18).hi = top - g0 + 2.2;
    }
    b.box(2.1, 0.12, 1.9, { pos: [kx, top + 0.06, kz], color: WOOD, surf: 'deck' });
    {
      // its body, up on the legs (for the paraglider)
      const [wx, wz] = f.to(kx, kz);
      P.colliders.addBox(wx, wz, 1.05, 0.95, c.yaw, base + top - 0.1, base + top + 2.35);
    }
    const cb = new ModelBuilder();
    logWall(cb, { x0: -0.85, x1: 0.85, z: 0.7, rows: 5, rowH: 0.26, r: 0.13, side: 1, over: 0.18, rand });
    logWall(cb, { x0: -0.85, x1: 0.85, z: -0.7, rows: 5, rowH: 0.26, r: 0.13, side: -1, over: 0.18, rand });
    const cg = cb.build();
    cg.translate(kx, top + 0.12, kz);
    b.add(cg, { keepColors: true, jitter: 0 });
    for (const sx of [-0.85, 0.85]) b.box(0.18, 1.3, 1.4, { pos: [kx + sx, top + 0.77, kz], color: LOG, surf: 'log', surfSwap: true });
    b.box(0.7, 0.9, 0.05, { pos: [kx, top + 0.62, kz + 0.84], color: 0x6a4a2a, surf: 'batten', surfScale: 0.6 });
    for (const sd of [1, -1]) {
      gable(b, 1.95, 0.75, 0.1, { pos: [kx, top + 1.42, kz + sd * 0.72], color: 0x7a5a3a, surf: 'batten' });
    }
    const ca = Math.atan2(0.75, 1.0);
    const cs = Math.hypot(1.0, 0.75) + 0.3;
    for (const sd of [1, -1]) b.box(cs, 0.08, 1.9, { pos: [kx + sd * Math.cos(ca) * (cs / 2), top + 2.22 - Math.sin(ca) * (cs / 2) + 0.05, kz], rot: [0, 0, -sd * ca], color: SHINGLE, surf: 'shingle', surfSwap: true, surfScale: -sd });
    // the ladder leaning on its platform
    const lz = kz + 1.6;
    const lgy = gy(kx, lz);
    for (const sx of [-0.22, 0.22]) b.strut([kx + sx, lgy, lz], [kx + sx, top + 0.3, kz + 0.98], 0.06, 0.06, { color: 0x8a6a48 });
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const ry = lgy + (top + 0.3 - lgy) * t;
      const rzz = lz + (kz + 0.98 - lz) * t;
      b.box(0.5, 0.04, 0.04, { pos: [kx, ry, rzz], color: 0x8a6a48 });
    }
  }

  P.addMesh(b.build(), c.x, base, c.z, c.yaw);
  P.addMesh(glow.build(), c.x, base, c.z, c.yaw, P.glowMat, { shadow: false });

  // lights for the moths, the chimney's smoke, the colliders and the bed
  for (const [x, z] of [
    [-1.9, zWall + 0.6],
    [1.68, zWall + 0.6],
  ]) {
    const [mx, mz] = f.to(x, z);
    P.nightLights.push(new THREE.Vector3(mx, base + 1.7, mz));
  }
  const [cx, cz] = f.to(chX, chZ - 0.08);
  P.smokePoints.push(new THREE.Vector3(cx, base + 6.2, cz));
  // the cabin as tall as its ridge, the chimney as tall as its cap (for the
  // paraglider)
  P.colliders.addBox(c.x, c.z, W / 2 + 0.35, D / 2 + 0.35, c.yaw, -1e9, base + ridgeY + 0.3);
  {
    const [x, z] = f.to(chX, chZ);
    P.colliders.addBox(x, z, 0.7, 0.5, c.yaw, -1e9, base + 6.25);
  }
  {
    const [x, z] = f.to(0, pz);
    P.colliders.addDeck(x, z, pw / 2, PORCH / 2 + 0.02, c.yaw, base);
  }
  // the railings (not the gap at the steps) and the porch posts
  const railBox = (x0, z0, x1, z1) => {
    const [x, z] = f.to((x0 + x1) / 2, (z0 + z1) / 2);
    P.colliders.addBox(x, z, Math.max(0.06, Math.abs(x1 - x0) / 2), Math.max(0.06, Math.abs(z1 - z0) / 2), c.yaw, base - 0.5, base + 1.1).glideTop = base + 1.0;
  };
  railBox(-pw / 2 + 0.12, postZ, -stepW / 2 - 0.1, postZ);
  railBox(stepW / 2 + 0.1, postZ, pw / 2 - 0.12, postZ);
  railBox(-pw / 2 + 0.12, zWall + R + 0.1, -pw / 2 + 0.12, postZ);
  railBox(pw / 2 - 0.12, zWall + R + 0.1, pw / 2 - 0.12, postZ);
  {
    // the bench and the rocking chair on the porch
    const [x, z] = f.to(-2.0, zWall + R + 0.35);
    P.colliders.addBox(x, z, 0.78, 0.25, c.yaw, base - 0.2, base + 1.0);
  }
  {
    const [x, z] = f.to(-W / 2 - 0.95, -0.8);
    P.colliders.addBox(x, z, 0.62, 2.0, c.yaw, -1e9, base + 2.4);
  }
  {
    // the roof over the porch, above head height (for the paraglider)
    const z0 = D / 2 + 0.35;
    const [x, z] = f.to(0, (z0 + zf) / 2);
    P.colliders.addBox(x, z, half + 0.55, (zf - z0) / 2, c.yaw, base + 2.7, base + ridgeY + 0.3);
  }
  for (const [x, z, r, hi] of [
    [-W / 2 - 2.1, 2.2, 0.36, 0.6],
    [-W / 2 - 1.3, 3.6, 0.4, 1.0],
    [W / 2 + R + 0.42, -zWall + 0.4, 0.34, 0.9],
  ]) {
    const [wx, wz] = f.to(x, z);
    P.colliders.addCircle(wx, wz, r).hi = hi;
  }
  {
    const [x, z] = f.to(W / 2 + 2.6, -0.4);
    P.colliders.addBox(x, z, 0.55, 2.5, c.yaw, -1e9, base + gy(W / 2 + 2.6, -0.4) + 1.2);
  }
  {
    const [x, z] = f.to(W / 2 + 3.4, zPorch + 2.6);
    P.colliders.addBox(x, z, 1.6, 0.4, c.yaw, -1e9, base + gy(W / 2 + 3.4, zPorch + 2.6) + 2.1);
  }
  const [ix, iz] = f.to(0.85, zWall + 1.0);
  P.interactions.push({ id: 'cabin', label: 'Sleep', x: ix, z: iz, r: 2.6 });
  P.cabinBase = base;
  P.cabinFoot = f.to(0, footZ);
  buildOuthouse(P, oh, rand);
}

// ------------------------------------------------------------ the outhouse
export function buildOuthouse(P, oh, rand = mulberry32(9)) {
  const Wd = P.world;
  const f = frame(oh.x, oh.z, oh.yaw);
  // set halfway into the hillside: tall footings at its front would stand
  // it on stilts
  const gr = groundRange(Wd, f, -0.75, 0.75, -0.75, 0.75);
  const base = (gr.lo + gr.hi) / 2 + 0.16;
  const b = new ModelBuilder();
  const BW = 1.3;
  const H = 2.25;
  const WALLC = 0x7a6450;
  // stone footings and a floor
  for (const [sx, sz] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ]) {
    const g0 = Wd.heightAt(...f.to(sx, sz)) - base - 0.1;
    b.box(0.32, -g0, 0.32, { pos: [sx, g0 / 2, sz], color: STONE, surf: 'stone' });
  }
  b.box(BW + 0.1, 0.1, BW + 0.1, { pos: [0, -0.05, 0], color: WOOD_DARK, surf: 'deck' });
  // corner posts and board walls; the roof slopes to the back
  for (const [sx, sz] of [
    [-BW / 2, -BW / 2],
    [BW / 2, -BW / 2],
    [-BW / 2, BW / 2],
    [BW / 2, BW / 2],
  ]) b.box(0.09, H, 0.09, { pos: [sx, H / 2, sz], color: WOOD_DARK });
  b.box(BW, H - 0.15, 0.04, { pos: [0, (H - 0.15) / 2, -BW / 2], color: WALLC, surf: 'batten', surfScale: 0.75 });
  for (const sd of [1, -1]) b.box(0.04, H, BW, { pos: [sd * BW / 2, H / 2, 0], color: WALLC, surf: 'batten', surfScale: 0.75 });
  b.box(BW, 0.25, 0.04, { pos: [0, H - 0.12, BW / 2], color: WALLC, surf: 'batten', surfScale: 0.75 });
  b.box(BW + 0.4, 0.06, BW + 0.55, { pos: [0, H + 0.08, 0.05], rot: [-0.16, 0, 0], color: 0x8a4a2e, surf: 'metal' });
  // the door with its crescent moon, a Z brace, hinges and a handle
  plankDoor(b, { cx: 0, w: BW - 0.12, h: H - 0.3, z: BW / 2 + 0.02, color: 0x8a7056, hingeLeft: true });
  b.torus(0.13, 0.04, 4, 10, { pos: [0, H - 0.6, BW / 2 + 0.066], arc: Math.PI, rot: [0, 0, -Math.PI / 2], color: 0x0c0806, jitter: 0 });
  // a vent pipe, a roll of paper on a nail, a sign
  b.cyl(0.05, 0.05, 0.9, 6, { pos: [0.35, H + 0.3, -0.3], color: 0x2a2a2a });
  b.cyl(0.06, 0.06, 0.1, 8, { pos: [BW / 2 + 0.07, 1.25, 0.3], rot: [0, 0, Math.PI / 2], color: 0xdedad0 });
  // a flat stone to step up on, where the ground in front is low
  const sg = Wd.heightAt(...f.to(0, BW / 2 + 0.45)) - base;
  if (sg < -0.22) b.box(0.7, -sg + 0.02, 0.42, { pos: [0, sg / 2 - 0.12, BW / 2 + 0.38], color: STONE, surf: 'stone', jitter: 0.06 });
  P.addMesh(b.build(), oh.x, base, oh.z, oh.yaw);
  if (sg < -0.22) {
    const [dx, dz] = f.to(0, BW / 2 + 0.38);
    P.colliders.addDeck(dx, dz, 0.35, 0.21, oh.yaw, base - 0.1);
  }
  const [sx, sz] = f.to(0, BW / 2 + 0.07);
  P.addSign("Ruben's Office", 'Knock first', sx, base + H - 0.1, sz, oh.yaw, 0.9, 0.3);
  P.colliders.addBox(oh.x, oh.z, 0.72, 0.72, oh.yaw);
}

// ------------------------------------------------------------ the mailbox
// Ruben's mailbox at the road: a rural box on a post with its flag up and
// his name on a board under it, facing the road.
export function buildMailbox(P, c) {
  const road = P.nearestRoad(c.x, c.z);
  if (!road) return;
  const sx = c.x - road.x;
  const sz = c.z - road.z;
  const l = Math.hypot(sx, sz) || 1;
  const mx = road.x + (sx / l) * (ROAD_HALF + 1.4);
  const mz = road.z + (sz / l) * (ROAD_HALF + 1.4);
  const my = P.world.heightAt(mx, mz);
  const yaw = Math.atan2(road.x - mx, road.z - mz);
  const BLUE = 0x2a4a8a;
  const b = new ModelBuilder();
  b.box(0.1, 1.2, 0.1, { pos: [0, 0.45, 0], color: WOOD_DARK, surf: 'plank', surfSwap: true });
  b.box(0.14, 0.05, 0.56, { pos: [0, 1.075, 0], color: WOOD_DARK, surf: 'plank', surfSwap: true });
  for (const s of [-1, 1]) b.strut([0, 0.8, 0], [0, 1.06, s * 0.22], 0.05, 0.04, { color: WOOD_DARK });
  // the box: flat sides under a round top, its door toward the road
  // (a hair shorter than the round top, so their ends do not fight)
  b.box(0.25, 0.13, 0.49, { pos: [0, 1.165, 0], color: BLUE, surf: 'metal', surfScale: 0.5 });
  b.cyl(0.125, 0.125, 0.5, 14, { pos: [0, 1.23, 0], rot: [Math.PI / 2, 0, 0], color: BLUE });
  b.cyl(0.128, 0.128, 0.02, 14, { pos: [0, 1.23, 0.255], rot: [Math.PI / 2, 0, 0], color: 0x34569a });
  b.box(0.256, 0.13, 0.018, { pos: [0, 1.165, 0.255], color: 0x34569a });
  b.box(0.05, 0.03, 0.04, { pos: [0, 1.31, 0.275], color: IRON, jitter: 0 });
  // the flag, up: there is mail going out
  b.box(0.016, 0.26, 0.025, { pos: [0.135, 1.27, -0.1], color: 0xc4261c, jitter: 0 });
  b.box(0.016, 0.1, 0.14, { pos: [0.135, 1.36, -0.04], color: 0xc4261c, jitter: 0 });
  b.cyl(0.02, 0.02, 0.02, 6, { pos: [0.135, 1.16, -0.1], rot: [0, 0, Math.PI / 2], color: IRON });
  P.addMesh(b.build(), mx, my, mz, yaw);
  P.addSign('RUBEN', '', mx + Math.sin(yaw) * 0.09, my + 0.82, mz + Math.cos(yaw) * 0.09, yaw, 0.46, 0.15);
}

// ------------------------------------------------------ the Trading Post
// The Kenai Trading Post by the junction, where you trade: a barn-red store
// with a false front and its big sign, display windows and double doors
// onto a covered porch, a stone basement where the ground drops away at
// the back, and the yard of a busy store: fuel pumps, the flag, a weigh
// station with the day's halibut, ice, propane, tires and the bins.
const BARN_RED = 0x7e3326;
const STORE_GREEN = 0x2e4a32;
const GREY_METAL = 0x8c9092;

export function buildTradingPost(P, c) {
  const Wd = P.world;
  const f = frame(c.x, c.z, c.yaw);
  const rand = mulberry32(21);
  const W = 13;
  const D = 9;
  const T = 0.2;
  const WALLH = 4.4;
  const PORCH = 3.0;
  const zF = D / 2;
  const zP = zF + PORCH;
  // the floor clears the ground under the walls and the porch (the yard in
  // front is levelled; see world/sites.js)
  const grB = groundRange(Wd, f, -W / 2 - 0.2, W / 2 + 0.2, -D / 2 - 0.2, D / 2 + 0.2);
  const grP = groundRange(Wd, f, -W / 2 - 0.5, W / 2 + 0.5, zF, zP);
  const base = Math.max(grB.hi + 0.3, grP.hi + 0.22);
  const gy = (lx, lz) => Wd.heightAt(...f.to(lx, lz)) - base;
  const b = new ModelBuilder();
  const glow = new ModelBuilder();

  // the stone basement down to the lowest ground and a concrete sill
  const footY = Math.min(grB.lo, grP.lo) - base - 0.3;
  b.box(W + 0.3, -footY, D + 0.3, { pos: [0, footY / 2, 0], color: STONE, surf: 'stone', jitter: 0.05 });
  b.box(W + 0.42, 0.14, D + 0.42, { pos: [0, -0.05, 0], color: 0x5a5148, surf: 'concrete', jitter: 0.04 });

  // ---- the walls: lap siding in front, board and batten round the rest
  const door = { x0: -0.95, x1: 0.95, y0: 0, y1: 2.95 };
  const winL = { x0: -5.0, x1: -2.4, y0: 0.85, y1: 2.75 };
  const winR = { x0: 2.4, x1: 5.0, y0: 0.85, y1: 2.75 };
  panelWall(b, { a0: -W / 2, a1: W / 2, y0: 0.02, y1: WALLH, at: zF - T / 2, thick: T, holes: [door, winL, winR], color: BARN_RED, surf: 'plank' });
  const winB = { x0: -3.6, x1: -2.4, y0: 1.3, y1: 2.5 };
  panelWall(b, { a0: -W / 2, a1: W / 2, y0: 0.02, y1: WALLH, at: -zF + T / 2, thick: T, holes: [winB], color: BARN_RED, surf: 'batten' });
  // side windows (in the turned frame of onSide: along the wall)
  const sideWins = [
    { x0: -2.6, x1: -1.4, y0: 1.2, y1: 2.6 },
    { x0: 0.8, x1: 2.0, y0: 1.2, y1: 2.6 },
  ];
  for (const sd of [1, -1]) {
    onSide(sd, W / 2 - T / 2, [b, glow], (sb, sg) => {
      panelWall(sb, { a0: -D / 2 + T, a1: D / 2 - T, y0: 0.02, y1: WALLH, at: 0, thick: T, holes: sideWins, color: BARN_RED, surf: 'batten' });
      for (const h of sideWins) {
        const cx = (h.x0 + h.x1) / 2;
        opening(sb, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: 0.02, thick: T + 0.06, color: TRIM, side: 1 });
        windowPanes(sb, sg, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: 0, side: 1, rows: 2, cols: 2, color: TRIM });
      }
    });
  }
  // corner boards, a frieze under the eaves and a dark base board
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box(0.24, WALLH - 0.05, 0.24, { pos: [sx * (W / 2 - 0.1), WALLH / 2 + 0.02, sz * (zF - 0.1)], color: TRIM, surf: 'plank', surfSwap: true });
    b.box(D - 0.1, 0.32, 0.06, { pos: [sx * (W / 2 + 0.02), WALLH - 0.2, 0], rot: [0, Math.PI / 2, 0], color: TRIM, surf: 'plank' });
    b.box(D - 0.1, 0.22, 0.06, { pos: [sx * (W / 2 + 0.02), 0.18, 0], rot: [0, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  }
  b.box(W - 0.1, 0.22, 0.06, { pos: [0, 0.18, -zF - 0.02], color: WOOD_DARK, surf: 'plank' });
  b.box(W - 0.1, 0.32, 0.06, { pos: [0, WALLH - 0.2, -zF - 0.02], color: TRIM, surf: 'plank' });
  // the back window
  {
    const cx = (winB.x0 + winB.x1) / 2;
    opening(b, { cx, y0: winB.y0, w: winB.x1 - winB.x0, h: winB.y1 - winB.y0, z: -zF + T / 2 - 0.02, thick: T + 0.06, color: TRIM, side: -1 });
    windowPanes(b, glow, { cx, y0: winB.y0, w: winB.x1 - winB.x0, h: winB.y1 - winB.y0, z: -zF + T / 2, side: -1, color: TRIM });
  }

  // ---- the front: display windows, double doors with a transom
  for (const h of [winL, winR]) {
    const cx = (h.x0 + h.x1) / 2;
    opening(b, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: zF - T / 2 + 0.03, thick: T + 0.08, color: TRIM, side: 1 });
    windowPanes(b, glow, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: zF - T / 2, side: 1, rows: 2, cols: 4, color: TRIM });
    // a trim strip under each window
    b.box(h.x1 - h.x0 + 0.24, 0.1, 0.06, { pos: [cx, h.y0 - 0.32, zF + 0.03], color: TRIM });
  }
  opening(b, { cx: 0, y0: 0, w: 1.9, h: 2.95, z: zF - T / 2 + 0.03, thick: T + 0.08, color: TRIM, sill: false, side: 1 });
  for (const sd of [-1, 1]) {
    // each leaf: a frame, a glass upper half (four panes), a panel below and
    // a push bar
    const lx = sd * 0.475;
    const zd = zF - T / 2 + 0.04;
    b.box(0.93, 0.1, 0.06, { pos: [lx, 0.05, zd], color: STORE_GREEN });
    b.box(0.93, 0.12, 0.06, { pos: [lx, 2.39, zd], color: STORE_GREEN });
    b.box(0.93, 0.14, 0.06, { pos: [lx, 1.05, zd], color: STORE_GREEN });
    for (const ex of [-1, 1]) b.box(0.1, 2.45, 0.06, { pos: [lx + ex * 0.415, 1.225, zd], color: STORE_GREEN });
    b.box(0.73, 0.9, 0.05, { pos: [lx, 0.55, zd], color: STORE_GREEN, surf: 'batten', surfScale: 0.5 });
    b.box(0.03, 1.2, 0.04, { pos: [lx, 1.72, zd + 0.01], color: STORE_GREEN });
    b.box(0.73, 0.03, 0.04, { pos: [lx, 1.72, zd + 0.01], color: STORE_GREEN });
    glow.box(0.73, 1.2, 0.02, { pos: [lx, 1.72, zd - 0.01], color: 0xffffff, jitter: 0 });
    b.box(0.5, 0.05, 0.06, { pos: [lx, 1.0, zd + 0.06], color: 0xb08a3a, jitter: 0 });
  }
  // the astragal where the leaves meet, the transom over the doors and the
  // bar between
  b.box(0.07, 2.45, 0.07, { pos: [0, 1.225, zF - T / 2 + 0.045], color: STORE_GREEN });
  b.box(1.9, 0.1, 0.1, { pos: [0, 2.5, zF - T / 2 + 0.04], color: TRIM });
  windowPanes(b, glow, { cx: 0, y0: 2.55, w: 1.9, h: 0.4, z: zF - T / 2, side: 1, rows: 1, cols: 3, color: TRIM });
  // a door mat
  b.box(1.6, 0.02, 0.7, { pos: [0, 0.01, zF + 0.4], color: 0x5a4632, jitter: 0.05 });

  // ---- the false front over the front wall, its cornice and brackets
  const FF = 7.0;
  const zFF = zF - 0.02;
  // (surfOffset: the siding's rows run on from one piece to the next)
  b.box(W + 0.3, FF - WALLH + 0.1, 0.24, { pos: [0, (FF + WALLH) / 2 - 0.05, zFF], color: BARN_RED, surf: 'plank', surfOffset: [0, (FF + WALLH) / 2 - 0.05] });
  b.box(6.8, 0.7, 0.24, { pos: [0, FF + 0.35, zFF], color: BARN_RED, surf: 'plank', surfOffset: [0, FF + 0.35] });
  for (const sd of [-1, 1]) b.box(1.0, 0.32, 0.24, { pos: [sd * 3.9, FF + 0.16, zFF], color: BARN_RED, surf: 'plank', surfOffset: [sd * 3.9, FF + 0.16] });
  // the cornice caps: main, shoulders and the raised centre
  const cap = (x, w, y) => {
    b.box(w + 0.3, 0.16, 0.5, { pos: [x, y + 0.08, zFF + 0.08], color: WOOD_DARK, surf: 'plank' });
    b.box(w + 0.2, 0.1, 0.38, { pos: [x, y - 0.05, zFF + 0.06], color: TRIM });
  };
  cap(-5.4, W / 2 - 4.4 + 0.3, FF);
  cap(5.4, W / 2 - 4.4 + 0.3, FF);
  for (const sd of [-1, 1]) cap(sd * 3.9, 1.0, FF + 0.32);
  cap(0, 6.8, FF + 0.7);
  // brackets under the cornice and a trim band under the sign
  for (let i = 0; i <= 10; i++) {
    const x = -W / 2 + 0.2 + (i * (W - 0.4)) / 10;
    if (Math.abs(x) < 3.4) continue;
    b.box(0.1, 0.24, 0.22, { pos: [x, FF - 0.12, zFF + 0.2], color: TRIM });
  }
  for (let i = 0; i < 7; i++) b.box(0.1, 0.3, 0.2, { pos: [-3.0 + i, FF + 0.45, zFF + 0.2], color: TRIM });
  b.box(W + 0.3, 0.12, 0.08, { pos: [0, 4.3, zFF + 0.14], color: TRIM });
  // the sign's own frame
  b.box(11.3, 0.1, 0.06, { pos: [0, 6.81, zFF + 0.15], color: TRIM });
  b.box(11.3, 0.1, 0.06, { pos: [0, 4.49, zFF + 0.15], color: TRIM });

  // ---- the roof: corrugated metal on a low gable, boards under the eaves
  const rise = 2.0;
  const half = W / 2 + 0.1;
  const ang = Math.atan2(rise, W / 2);
  const slope = Math.hypot(W / 2, rise) + 0.55;
  const zb = -zF - 0.45;
  const zf = zF - 0.15;
  const rl = zf - zb;
  const rz = (zf + zb) / 2;
  const ridgeY = WALLH + rise + 0.12;
  for (const sd of [1, -1]) {
    const cx = sd * Math.cos(ang) * (slope / 2);
    const cy = ridgeY - Math.sin(ang) * (slope / 2);
    b.box(slope, 0.06, rl, { pos: [cx + sd * Math.sin(ang) * 0.08, cy + Math.cos(ang) * 0.08, rz], rot: [0, 0, -sd * ang], color: GREY_METAL, surf: 'metal', surfSwap: true, jitter: 0.02 });
    b.box(slope - 0.05, 0.05, rl - 0.05, { pos: [cx + sd * Math.sin(ang) * 0.02, cy + Math.cos(ang) * 0.02, rz], rot: [0, 0, -sd * ang], color: 0x7a6248, surf: 'plank', surfSwap: true });
    const ex = sd * Math.cos(ang) * slope;
    const ey = ridgeY - Math.sin(ang) * slope;
    b.box(rl + 0.06, 0.22, 0.06, { pos: [ex + sd * 0.03, ey + 0.04, rz], rot: [0, Math.PI / 2, 0], color: TRIM, surf: 'plank' });
    b.strut([ex, ey - 0.04, zb - 0.03], [0, ridgeY + 0.06, zb - 0.03], 0.22, 0.06, { color: TRIM });
  }
  b.box(0.42, 0.1, rl + 0.04, { pos: [0, ridgeY + 0.1, rz], color: 0x6a6e70, surf: 'metal', jitter: 0.02 });
  // the gables: board and batten at the back, hidden by the false front in front
  gable(b, W, rise, T, { pos: [0, WALLH - 0.02, -zF + T / 2], color: BARN_RED, surf: 'batten' });
  gable(b, W, rise, T, { pos: [0, WALLH - 0.02, zF - T / 2 - 0.1], color: BARN_RED, surf: 'batten' });
  for (const z of [-zF + T / 2, zF - T / 2 - 0.1]) gableRafters(b, { run: W / 2, rise, ridgeY, z, color: TRIM });
  b.box(0.7, 0.55, 0.06, { pos: [0, WALLH + 0.85, -zF - 0.02], color: WOOD_DARK });
  for (let k = 0; k < 4; k++) b.box(0.6, 0.05, 0.06, { pos: [0, WALLH + 0.66 + k * 0.13, -zF - 0.05], rot: [-0.5, 0, 0], color: 0x2a1e14, jitter: 0 });
  // the stovepipe through the roof, its cap and a little smoke
  const spX = -3.5;
  const spZ = -1.5;
  const spY = ridgeY - Math.tan(ang) * Math.abs(spX);
  b.cyl(0.13, 0.13, 1.7, 10, { pos: [spX, spY + 0.7, spZ], color: 0x222222 });
  b.cyl(0.24, 0.24, 0.08, 10, { pos: [spX, spY + 0.05, spZ], color: 0x3a3a3a });
  b.cone(0.3, 0.2, 10, { pos: [spX, spY + 1.75, spZ], color: 0x2a2a2a });

  // ---- the porch: deck, posts and braces, a shed roof, rails and steps
  const pw = W + 1.0;
  const pz = (zF + zP) / 2;
  b.box(pw, 0.12, PORCH, { pos: [0, -0.06, pz], color: 0x8a6a48, surf: 'deck', surfSwap: true });
  b.box(pw + 0.06, 0.26, 0.06, { pos: [0, -0.17, zP + 0.03], color: WOOD_DARK, surf: 'plank' });
  for (const sd of [1, -1]) b.box(PORCH, 0.26, 0.06, { pos: [sd * (pw / 2 + 0.03), -0.17, pz], rot: [0, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  // skirting down to the ground where it falls away
  {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x0 = -pw / 2 + (pw * i) / n;
      const x1 = -pw / 2 + (pw * (i + 1)) / n;
      const low = Math.min(gy(x0, zP), gy(x1, zP)) - 0.15;
      if (low < -0.3) b.box(x1 - x0 + 0.01, -0.3 - low, 0.04, { pos: [(x0 + x1) / 2, (-0.3 + low) / 2, zP - 0.02], color: 0x5a4430, surf: 'batten' });
    }
    for (const sd of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const z0 = zF + i;
        const z1 = zF + i + 1;
        const low = Math.min(gy(sd * pw / 2, z0), gy(sd * pw / 2, z1)) - 0.15;
        if (low < -0.3) b.box(0.04, -0.3 - low, 1.01, { pos: [sd * (pw / 2 - 0.02), (-0.3 + low) / 2, (z0 + z1) / 2], color: 0x5a4430, surf: 'batten' });
      }
    }
  }
  const postZ = zP - 0.15;
  const beamY = 3.05;
  const postXs = [];
  for (let i = 0; i < 6; i++) postXs.push(-pw / 2 + 0.15 + (i * (pw - 0.3)) / 5);
  for (const px of postXs) {
    const g0 = Math.min(-0.3, gy(px, postZ) - 0.1);
    b.box(0.18, beamY - g0, 0.18, { pos: [px, (beamY + g0) / 2, postZ], color: WOOD, surf: 'plank', surfSwap: true });
    b.box(0.26, 0.12, 0.26, { pos: [px, 0.06, postZ], color: WOOD_DARK });
    for (const kd of [-1, 1]) if (Math.abs(px + kd * 0.55) < pw / 2) b.strut([px, beamY - 0.55, postZ], [px + kd * 0.55, beamY - 0.02, postZ], 0.08, 0.1, { color: WOOD });
  }
  b.box(pw + 0.2, 0.24, 0.2, { pos: [0, beamY + 0.12, postZ], color: WOOD, surf: 'plank' });
  // the shed roof from the wall down over the beam
  {
    const yWall = 3.85;
    const yBeam = beamY + 0.26;
    const run = postZ - zF;
    const pa = Math.atan2(yWall - yBeam, run);
    const len = Math.hypot(run, yWall - yBeam) + 0.45;
    const midZ = zF + (Math.cos(pa) * len) / 2;
    const midY = yWall - (Math.sin(pa) * len) / 2;
    b.box(pw + 0.4, 0.06, len, { pos: [0, midY + 0.07, midZ], rot: [pa, 0, 0], color: GREY_METAL, surf: 'metal', jitter: 0.02 });
    b.box(pw + 0.3, 0.05, len - 0.05, { pos: [0, midY + 0.01, midZ], rot: [pa, 0, 0], color: 0x7a6248, surf: 'plank' });
    const ez = zF + Math.cos(pa) * len;
    const ey = yWall - Math.sin(pa) * len;
    b.box(pw + 0.44, 0.2, 0.06, { pos: [0, ey + 0.02, ez + 0.02], color: TRIM, surf: 'plank' });
    b.box(pw + 0.4, 0.1, 0.12, { pos: [0, yWall + 0.06, zF + 0.04], color: TRIM });
  }
  // railings: the two ends and the front from the corners to the two middle
  // posts, the steps between those
  const midPost = postXs[3];
  const stepW = 2 * midPost - 0.3;
  railX(b, -pw / 2 + 0.15, -midPost, postZ, 0, { color: TRIM, posts: false });
  railX(b, midPost, pw / 2 - 0.15, postZ, 0, { color: TRIM, posts: false });
  for (const sd of [1, -1]) railZ(b, zF + 0.12, postZ, sd * (pw / 2 - 0.15), 0, { color: TRIM, posts: false });
  const footZ = stepsDown(P, f, b, base, { x: 0, z0: zP, w: stepW, top: 0, groundY: gy, color: 0x7a5a3c });
  // hand rails up the steps
  if (footZ > zP + 0.3) {
    for (const sd of [-1, 1]) {
      const hx = sd * (stepW / 2 + 0.05);
      const gF = gy(hx, footZ);
      b.strut([hx, 0.95, postZ], [hx, gF + 0.95, footZ], 0.06, 0.07, { color: TRIM });
      b.box(0.1, 1.0 - gF, 0.1, { pos: [hx, (1.0 + gF) / 2 - 0.02, footZ], color: TRIM });
    }
  }

  // ---- on the porch
  // a bench under the left window
  b.box(1.8, 0.06, 0.42, { pos: [-3.7, 0.46, zF + 0.5], color: WOOD_LIGHT, surf: 'plank' });
  b.box(1.8, 0.4, 0.05, { pos: [-3.7, 0.8, zF + 0.3], rot: [-0.1, 0, 0], color: WOOD_LIGHT, surf: 'plank' });
  for (const lx of [-4.5, -2.9]) b.box(0.07, 0.46, 0.38, { pos: [lx, 0.23, zF + 0.5], color: WOOD_DARK });
  // two rocking chairs under the right window
  for (const [rx, rot] of [
    [3.0, 0.25],
    [4.4, -0.2],
  ]) {
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(rx, 0, zF + 1.15);
    const Pt = (px, py, pz) => new THREE.Vector3(px, py, pz).applyMatrix4(m).toArray();
    for (const sx of [-0.24, 0.24]) {
      b.strut(Pt(sx, 0.12, -0.38), Pt(sx, 0.04, 0), 0.04, 0.05, { color: WOOD_DARK });
      b.strut(Pt(sx, 0.04, 0), Pt(sx, 0.12, 0.38), 0.04, 0.05, { color: WOOD_DARK });
      b.strut(Pt(sx, 0.08, 0.18), Pt(sx, 0.66, 0.18), 0.04, 0.04, { color: WOOD_DARK });
      b.strut(Pt(sx, 0.08, -0.22), Pt(sx, 1.02, -0.3), 0.04, 0.04, { color: WOOD_DARK });
      b.strut(Pt(sx, 0.66, -0.25), Pt(sx, 0.66, 0.25), 0.06, 0.04, { color: WOOD_LIGHT });
    }
    b.add(new THREE.BoxGeometry(0.52, 0.05, 0.46), { matrix: m, pos: [0, 0.5, 0], color: WOOD_LIGHT, surf: 'plank' });
    b.add(new THREE.BoxGeometry(0.46, 0.55, 0.03), { matrix: m, pos: [0, 0.82, -0.27], rot: [0.15, 0, 0], color: WOOD_LIGHT, surf: 'batten', surfScale: 0.5 });
  }
  // a small table between them with a coffee can
  b.cyl(0.25, 0.25, 0.04, 10, { pos: [3.7, 0.55, zF + 1.0], color: WOOD_DARK, surf: 'plank' });
  b.cyl(0.04, 0.05, 0.55, 6, { pos: [3.7, 0.27, zF + 1.0], color: WOOD_DARK });
  b.cyl(0.06, 0.06, 0.13, 8, { pos: [3.75, 0.64, zF + 0.98], color: 0xb02a1e });
  // barrels at the left end, a lantern on one
  for (const [bx, bz] of [
    [-6.3, zP - 0.75],
    [-5.6, zP - 0.6],
    [-6.25, zP - 1.45],
  ]) barrel(b, { x: bx, y: 0, z: bz });
  b.box(0.16, 0.24, 0.16, { pos: [-5.6, 1.02, zP - 0.6], color: IRON });
  glow.box(0.11, 0.16, 0.11, { pos: [-5.6, 1.02, zP - 0.6], color: 0xffffff, jitter: 0 });
  // a rod rack against the wall at the left end
  {
    const rx = -5.75;
    const rz = zF + 0.18;
    b.box(1.1, 0.08, 0.14, { pos: [rx, 1.5, rz], color: WOOD_DARK, surf: 'plank' });
    b.box(1.1, 0.12, 0.3, { pos: [rx, 0.08, rz + 0.08], color: WOOD_DARK, surf: 'plank' });
    for (let k = 0; k < 6; k++) {
      const x = rx - 0.45 + k * 0.18;
      const lean = (rand() - 0.5) * 0.06;
      b.beam([x, 0.12, rz + 0.12], [x + lean, 2.35 + rand() * 0.25, rz + 0.02], 0.012, 4, { color: k % 2 ? 0x1e1e1e : 0x3a2a1c, r2: 0.005 });
      b.cyl(0.04, 0.04, 0.05, 8, { pos: [x, 0.62, rz + 0.17], rot: [0, 0, Math.PI / 2], color: 0x9a9a9a });
    }
  }
  // crates stacked at the right end
  {
    const crates = [
      [6.15, 0, zF + 0.5, 0.7, 0.1],
      [6.15, 0.7, zF + 0.5, 0.6, -0.15],
      [6.25, 0, zF + 1.3, 0.62, 0.3],
      [5.45, 0, zF + 0.45, 0.55, 0.05],
    ];
    for (const [x, y, z, s, r] of crates) {
      b.box(s, s, s, { pos: [x, y + s / 2, z], rot: [0, r, 0], color: 0x9a7a50, surf: 'plank', surfScale: 0.7 });
      for (const sy of [0.08, s - 0.08]) b.box(s + 0.02, 0.06, s + 0.02, { pos: [x, y + sy, z], rot: [0, r, 0], color: 0x6a5032 });
    }
  }
  // the live bait cooler by the door, its sign over it
  b.box(0.8, 0.5, 0.48, { pos: [1.62, 0.29, zF + 0.32], color: 0xe8e4da });
  b.box(0.84, 0.1, 0.52, { pos: [1.62, 0.59, zF + 0.32], color: 0x2a6aa8 });
  b.box(0.2, 0.04, 0.04, { pos: [1.62, 0.5, zF + 0.58], color: 0x888888, jitter: 0 });
  // the notice board left of the door: cork, a frame and the flyers
  {
    const nx = -1.67;
    const nz = zF + 0.03;
    b.box(1.0, 0.8, 0.04, { pos: [nx, 1.62, nz], color: 0xa07a48, jitter: 0.03 });
    for (const [w, h, y, x] of [
      [1.08, 0.06, 2.05, 0],
      [1.08, 0.06, 1.19, 0],
      [0.06, 0.86, 1.62, -0.51],
      [0.06, 0.86, 1.62, 0.51],
    ]) b.box(w, h, 0.06, { pos: [nx + x, y, nz + 0.01], color: WOOD_DARK });
    const flyers = [0xf2f0e6, 0xf2d24a, 0x9ac8e8, 0xf0a8a0, 0xf2f0e6, 0xb8e0a0, 0xf2f0e6];
    for (let k = 0; k < flyers.length; k++) {
      const fx = nx - 0.33 + (k % 4) * 0.22 + (rand() - 0.5) * 0.04;
      const fy = 1.85 - Math.floor(k / 4) * 0.36 + (rand() - 0.5) * 0.05;
      b.box(0.16 + rand() * 0.04, 0.22 + rand() * 0.04, 0.01, { pos: [fx, fy, nz + 0.03], rot: [0, 0, (rand() - 0.5) * 0.12], color: flyers[k], jitter: 0.02 });
      b.sphere(0.012, 4, 3, { pos: [fx, fy + 0.1, nz + 0.04], color: k % 2 ? 0xc4261c : 0x2a6aa8, jitter: 0 });
    }
  }
  // moose antlers over the door
  for (const s of [-1, 1]) {
    b.beam([0, 3.2, zF + 0.06], [s * 0.42, 3.32, zF + 0.16], 0.045, 5, { color: 0xd8ccb0 });
    b.box(0.68, 0.06, 0.42, { pos: [s * 0.76, 3.4, zF + 0.2], rot: [0.35, 0, s * 0.42], color: 0xd8ccb0 });
    for (let k = 0; k < 4; k++) b.cone(0.03, 0.18, 4, { pos: [s * (0.55 + k * 0.15), 3.55 + k * 0.025, zF + 0.24], color: 0xe2d8c0, jitter: 0 });
  }
  b.box(0.36, 0.24, 0.08, { pos: [0, 3.2, zF + 0.04], color: WOOD_DARK, surf: 'plank' });
  // a king salmon mounted on a plaque right of the right window
  {
    const mx = 5.75;
    const my = 2.3;
    const mz = zF + 0.05;
    b.box(1.0, 0.42, 0.04, { pos: [mx, my, mz], color: WOOD_DARK, surf: 'plank' });
    b.sphere(1, 10, 6, { pos: [mx - 0.05, my, mz + 0.06], scale: [0.36, 0.11, 0.04], color: 0x8a98a0, jitter: 0.04 });
    b.sphere(1, 8, 4, { pos: [mx - 0.03, my - 0.035, mz + 0.065], scale: [0.3, 0.06, 0.035], color: 0xd8dcd8, jitter: 0.03 });
    b.cone(0.11, 0.16, 4, { pos: [mx + 0.38, my, mz + 0.06], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.25], color: 0x6a7880 });
    b.sphere(0.018, 5, 4, { pos: [mx - 0.32, my + 0.025, mz + 0.1], color: 0x111111, jitter: 0 });
  }
  // two lamps hanging from the porch roof, green enamel shades
  for (const lx of [-3.7, 3.7]) {
    b.cyl(0.008, 0.008, 0.5, 4, { pos: [lx, 3.45, zF + 1.5], color: 0x111111 });
    b.cone(0.2, 0.16, 10, { pos: [lx, 3.12, zF + 1.5], color: 0x2e5a3a });
    glow.sphere(0.07, 8, 6, { pos: [lx, 3.02, zF + 1.5], color: 0xffffff, jitter: 0 });
  }

  // ---- the left side: the ice chest, the propane cage and the bear-proof bin
  {
    const ix = -W / 2 - 1.15;
    const iz = 2.4;
    const iy = gy(ix, iz + 0.4) < gy(ix, iz - 0.4) ? gy(ix, iz - 0.4) : gy(ix, iz + 0.4);
    b.box(1.6, 1.2, 0.8, { pos: [ix, iy + 0.6, iz], color: 0xeef0ee, jitter: 0.02 });
    b.box(1.64, 0.14, 0.84, { pos: [ix, iy + 1.25, iz], color: 0x2a6aa8 });
    b.box(1.62, 0.1, 0.82, { pos: [ix, iy + 0.05, iz], color: 0x4a4e52 });
    for (const sx of [-0.4, 0.4]) b.box(0.3, 0.05, 0.05, { pos: [ix + sx, iy + 1.02, iz + 0.42], color: 0x888888, jitter: 0 });
    const [sx, sz] = f.to(ix, iz + 0.41);
    P.addSign('ICE', '', sx, base + iy + 0.62, sz, c.yaw, 1.1, 0.36, { bg: '#e8f0f4', fg: '#2a6aa8' });
    const [cx, cz] = f.to(ix, iz);
    P.colliders.addBox(cx, cz, 0.82, 0.42, c.yaw, -1e9, base + iy + 1.35);
  }
  {
    const cx = -W / 2 - 0.6;
    const cz = -1.4;
    const cy = Math.max(gy(cx, cz - 0.7), gy(cx, cz + 0.7));
    const H = 1.55;
    b.box(0.8, 0.08, 1.4, { pos: [cx, cy + 0.04, cz], color: 0x5a5e60 });
    b.box(0.8, 0.06, 1.4, { pos: [cx, cy + H, cz], color: 0x5a5e60 });
    for (const sx of [-0.38, 0.38]) for (const sz of [-0.68, 0.68]) b.box(0.05, H, 0.05, { pos: [cx + sx, cy + H / 2, cz + sz], color: 0x5a5e60 });
    for (let k = 1; k < 10; k++) b.box(0.025, H, 0.025, { pos: [cx - 0.39, cy + H / 2, cz - 0.68 + (k * 1.36) / 10], color: 0x6a6e70, jitter: 0 });
    for (const yy of [0.5, 1.0]) b.box(0.03, 0.03, 1.4, { pos: [cx - 0.39, cy + yy, cz], color: 0x6a6e70, jitter: 0 });
    for (let k = 0; k < 3; k++) {
      const tz = cz - 0.42 + k * 0.42;
      b.cyl(0.15, 0.15, 0.72, 10, { pos: [cx + 0.02, cy + 0.44, tz], color: 0xe8e6e0 });
      b.sphere(0.15, 10, 5, { pos: [cx + 0.02, cy + 0.8, tz], scale: [1, 0.6, 1], color: 0xe8e6e0, smooth: true });
      b.cyl(0.05, 0.05, 0.1, 6, { pos: [cx + 0.02, cy + 0.92, tz], color: 0xb08a3a });
    }
    const [wx, wz] = f.to(cx, cz);
    P.colliders.addBox(wx, wz, 0.42, 0.72, c.yaw, -1e9, base + cy + H + 0.05);
  }
  {
    const tx = -W / 2 - 0.75;
    const tz = 3.75;
    const ty = gy(tx, tz);
    b.box(0.62, 1.0, 0.62, { pos: [tx, ty + 0.5, tz], color: 0x2e4a32, surf: 'metal', surfScale: 0.6 });
    b.box(0.66, 0.08, 0.66, { pos: [tx, ty + 1.04, tz], color: 0x24382a });
    b.box(0.3, 0.04, 0.05, { pos: [tx, ty + 0.92, tz + 0.33], color: 0x888888, jitter: 0 });
    const [wx, wz] = f.to(tx, tz);
    P.colliders.addCircle(wx, wz, 0.42).hi = 1.1;
  }

  // ---- the right side: tires and the weigh station with the day's catch
  {
    const tx = W / 2 + 1.4;
    const tz = -2;
    const ty = gy(tx, tz);
    for (let i = 0; i < 4; i++) b.torus(0.42, 0.15, 6, 14, { pos: [tx, ty + 0.16 + i * 0.3, tz], rot: [Math.PI / 2, 0, (rand() - 0.5) * 0.3], color: 0x1c1c1c, jitter: 0.04 });
    b.torus(0.42, 0.15, 6, 14, { pos: [tx + 0.75, ty + 0.5, tz + 0.15], rot: [0.1, 0.3, 1.3], color: 0x222222, jitter: 0.04 });
    const [wx, wz] = f.to(tx + 0.2, tz);
    P.colliders.addCircle(wx, wz, 0.75).hi = 1.25;
  }
  {
    const wx = W / 2 + 2.4;
    const wz = 6.4;
    const wy = Math.min(gy(wx - 1.0, wz), gy(wx + 1.0, wz));
    const H = 3.0;
    for (const sx of [-1.0, 1.0]) {
      b.box(0.16, H + 0.4, 0.16, { pos: [wx + sx, wy + H / 2 - 0.2, wz], color: WOOD, surf: 'plank', surfSwap: true });
      b.strut([wx + sx, wy + H - 0.6, wz], [wx + sx * 0.45, wy + H - 0.05, wz], 0.08, 0.1, { color: WOOD });
    }
    b.box(2.4, 0.2, 0.18, { pos: [wx, wy + H, wz], color: WOOD, surf: 'plank' });
    // the scale on its chain, a hook, and a halibut hanging by the tail
    b.cyl(0.008, 0.008, 0.25, 4, { pos: [wx - 0.35, wy + H - 0.22, wz], color: 0x333333 });
    b.cyl(0.17, 0.17, 0.08, 14, { pos: [wx - 0.35, wy + H - 0.48, wz], rot: [Math.PI / 2, 0, 0], color: 0xd8d8d0 });
    b.cyl(0.13, 0.13, 0.01, 14, { pos: [wx - 0.35, wy + H - 0.48, wz + 0.045], rot: [Math.PI / 2, 0, 0], color: 0xf4f2ea, jitter: 0 });
    b.box(0.01, 0.11, 0.01, { pos: [wx - 0.35, wy + H - 0.45, wz + 0.052], rot: [0, 0, 0.6], color: 0xc4261c, jitter: 0 });
    b.cyl(0.012, 0.012, 0.2, 4, { pos: [wx - 0.35, wy + H - 0.62, wz], color: 0x666666 });
    const hy = wy + H - 0.78;
    // the tail (a fan), the body (dark side out, white side behind), fins and eyes
    b.cone(0.22, 0.26, 4, { pos: [wx - 0.35, hy - 0.08, wz], scale: [1, 1, 0.12], color: 0x5a4a32 });
    b.sphere(1, 12, 6, { pos: [wx - 0.35, hy - 0.86, wz], scale: [0.42, 0.66, 0.06], color: 0x5e4e34, jitter: 0.05 });
    b.sphere(1, 12, 6, { pos: [wx - 0.35, hy - 0.86, wz - 0.014], scale: [0.4, 0.64, 0.055], color: 0xe8e4da, jitter: 0.03 });
    for (const sx of [-1, 1]) b.box(0.04, 0.95, 0.02, { pos: [wx - 0.35 + sx * 0.43, hy - 0.86, wz], rot: [0, 0, sx * 0.08], color: 0x4a3c28 });
    for (const sx of [-0.06, 0.06]) b.sphere(0.03, 6, 4, { pos: [wx - 0.35 + sx, hy - 1.4, wz + 0.05], color: 0x1a1a14, jitter: 0 });
    // and a king salmon on the other hook
    b.cyl(0.012, 0.012, 0.3, 4, { pos: [wx + 0.45, wy + H - 0.25, wz], color: 0x666666 });
    b.cone(0.13, 0.18, 4, { pos: [wx + 0.45, wy + H - 0.48, wz], scale: [1, 1, 0.2], color: 0x5a6a72 });
    b.sphere(1, 10, 6, { pos: [wx + 0.45, wy + H - 0.98, wz], scale: [0.14, 0.45, 0.07], color: 0x8a98a0, jitter: 0.05 });
    b.sphere(1, 8, 4, { pos: [wx + 0.45, wy + H - 0.98, wz + 0.012], scale: [0.11, 0.42, 0.065], color: 0xd8dcd8, jitter: 0.03 });
    const [sx, sz] = f.to(wx, wz + 0.1);
    P.addSign('Weigh station', 'Brag here', sx, base + wy + H + 0.42, sz, c.yaw, 1.9, 0.6);
    for (const px of [-1.0, 1.0]) {
      const [cx, cz] = f.to(wx + px, wz);
      P.colliders.addCircle(cx, cz, 0.14).hi = H + 0.9;
    }
    const [fx, fz] = f.to(wx - 0.1, wz);
    P.colliders.addBox(fx, fz, 0.75, 0.15, c.yaw, base + wy + 0.6, base + wy + H + 0.9).glideTop = base + wy + H + 0.9;
  }

  // ---- out front: the fuel island, the flag and a picnic table
  {
    const ix = -W / 2 + 1.0;
    const iz = 12.0;
    const iy = Math.max(gy(ix - 1.8, iz), gy(ix + 1.8, iz), gy(ix, iz - 0.6), gy(ix, iz + 0.6));
    b.box(3.8, 0.18 + iy - Math.min(gy(ix - 1.8, iz), gy(ix + 1.8, iz)), 1.3, { pos: [ix, iy + 0.09 - (iy - Math.min(gy(ix - 1.8, iz), gy(ix + 1.8, iz))) / 2, iz], color: 0x9a968c, surf: 'concrete' });
    const top = iy + 0.18;
    for (const [px, col] of [
      [-0.95, 0xc4261c],
      [0.95, 0x2e6a3a],
    ]) {
      const x = ix + px;
      b.box(0.72, 0.12, 0.52, { pos: [x, top + 0.06, iz], color: 0x3a3a3a });
      b.box(0.62, 1.5, 0.44, { pos: [x, top + 0.87, iz], color: col, surf: 'metal', surfScale: 0.4 });
      b.box(0.66, 0.1, 0.48, { pos: [x, top + 1.66, iz], color: 0xe8e4da });
      for (const sd of [1, -1]) {
        b.box(0.48, 0.5, 0.02, { pos: [x, top + 1.2, iz + sd * 0.23], color: 0xe8e4da });
        b.box(0.34, 0.14, 0.02, { pos: [x, top + 1.3, iz + sd * 0.245], color: 0x1a1a1a });
        b.box(0.1, 0.06, 0.02, { pos: [x - 0.12, top + 1.08, iz + sd * 0.245], color: 0xd8a830 });
      }
      b.cyl(0.08, 0.1, 0.12, 10, { pos: [x, top + 1.77, iz], color: 0x3a3a3a });
      b.sphere(0.26, 12, 8, { pos: [x, top + 2.06, iz], color: 0xdedad0, smooth: true });
      b.torus(0.25, 0.035, 4, 16, { pos: [x, top + 2.06, iz], rot: [Math.PI / 2, 0, 0], color: col, jitter: 0 });
      // the hose down the side to the nozzle in its holster
      const hx = x + 0.33;
      b.beam([hx, top + 1.45, iz], [hx + 0.12, top + 0.75, iz + 0.05], 0.025, 5, { color: 0x111111 });
      b.beam([hx + 0.12, top + 0.75, iz + 0.05], [hx + 0.04, top + 1.05, iz + 0.1], 0.025, 5, { color: 0x111111 });
      b.box(0.08, 0.2, 0.08, { pos: [hx + 0.02, top + 1.12, iz + 0.12], rot: [0.3, 0, 0], color: 0x2a2a2a });
    }
    // bollards at the ends
    for (const sx of [-1.7, 1.7]) {
      b.cyl(0.08, 0.08, 1.0, 8, { pos: [ix + sx, top + 0.5, iz], color: 0xe2b42a });
      b.cyl(0.085, 0.085, 0.08, 8, { pos: [ix + sx, top + 0.75, iz], color: 0x1a1a1a, jitter: 0 });
    }
    const [wx, wz] = f.to(ix, iz);
    P.colliders.addBox(wx, wz, 1.9, 0.65, c.yaw, -1e9, base + top + 2.35);
  }
  // the flagpole: a concrete footing and a cleat; the flag itself waves
  // (see Props.update)
  const [fx, fz] = f.to(W / 2 + 1.5, zF + 5);
  const fy = Wd.heightAt(fx, fz);
  {
    const pole = new ModelBuilder();
    pole.cyl(0.05, 0.08, 9, 8, { pos: [0, 4.5, 0], color: 0xd0d0d0 });
    pole.sphere(0.12, 8, 6, { pos: [0, 9.05, 0], color: 0xd9b23a });
    pole.box(0.03, 0.12, 0.03, { pos: [0.07, 1.3, 0], color: 0x888888 });
    P.addMesh(pole.build(), fx, fy, fz, 0, P.metalMat);
    const foot = new ModelBuilder();
    foot.cyl(0.32, 0.36, 0.5, 12, { pos: [0, 0, 0], color: 0x9a968c, surf: 'concrete' });
    P.addMesh(foot.build(), fx, fy, fz, 0);
    // (hi: how tall it stands, for the paraglider)
    P.colliders.addCircle(fx, fz, 0.2).hi = 9.2;
    const flagGeo = new THREE.PlaneGeometry(2.2, 1.4, 12, 4);
    flagGeo.translate(1.1, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: makeAlaskaFlagTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(fx, fy + 8.2, fz);
    flag.castShadow = true;
    P.group.add(flag);
    P.flag = flag;
    P.flagBase = flagGeo.attributes.position.array.slice();
  }
  {
    const tx = W / 2 + 3.2;
    const tz = 11.5;
    const ty = Math.max(gy(tx - 0.9, tz), gy(tx + 0.9, tz), gy(tx, tz - 0.8), gy(tx, tz + 0.8));
    const m = new THREE.Matrix4().makeRotationY(0.35).setPosition(tx, ty, tz);
    const Pt = (px, py, pz) => new THREE.Vector3(px, py, pz).applyMatrix4(m).toArray();
    b.add(new THREE.BoxGeometry(1.9, 0.06, 0.78), { matrix: m, pos: [0, 0.75, 0], color: WOOD_LIGHT, surf: 'deck' });
    for (const sz of [-0.68, 0.68]) b.add(new THREE.BoxGeometry(1.9, 0.05, 0.28), { matrix: m, pos: [0, 0.44, sz], color: WOOD_LIGHT, surf: 'deck' });
    for (const sx of [-0.75, 0.75]) {
      b.strut(Pt(sx, -0.2, -0.75), Pt(sx, 0.75, 0.05), 0.07, 0.07, { color: WOOD });
      b.strut(Pt(sx, -0.2, 0.75), Pt(sx, 0.75, -0.05), 0.07, 0.07, { color: WOOD });
      b.strut(Pt(sx, 0.41, -0.85), Pt(sx, 0.41, 0.85), 0.08, 0.06, { color: WOOD });
    }
    const [wx, wz] = f.to(tx, tz);
    P.colliders.addBox(wx, wz, 1.0, 0.95, c.yaw + 0.35, -1e9, base + ty + 0.8);
  }

  // ---- the back: barn doors into the basement where the ground is low,
  // and the dumpster
  {
    const bx = 3.2;
    const bz = -zF - 0.15;
    const g0 = Math.max(gy(bx - 1.3, bz - 0.4), gy(bx + 1.3, bz - 0.4));
    if (g0 < -2.6) {
      const h = 2.2;
      for (const sd of [-1, 1]) {
        b.box(1.18, h, 0.06, { pos: [bx + sd * 0.6, g0 + h / 2, bz - 0.03], color: 0x6a2418, surf: 'batten', surfScale: 0.6 });
        b.strut([bx + sd * 1.1, g0 + 0.2, bz - 0.07], [bx + sd * 0.1, g0 + h - 0.2, bz - 0.07], 0.1, 0.03, { color: TRIM });
        b.box(1.0, 0.1, 0.03, { pos: [bx + sd * 0.6, g0 + 0.2, bz - 0.07], color: TRIM });
        b.box(1.0, 0.1, 0.03, { pos: [bx + sd * 0.6, g0 + h - 0.2, bz - 0.07], color: TRIM });
      }
      b.box(2.7, 0.18, 0.12, { pos: [bx, g0 + h + 0.09, bz - 0.04], color: WOOD_DARK, surf: 'plank' });
      b.box(2.9, 0.12, 0.7, { pos: [bx, g0 - 0.02, bz - 0.4], color: 0x9a968c, surf: 'concrete' });
    }
    const dx = -3.2;
    const dz = -zF - 1.7;
    const dy = Math.max(gy(dx - 0.95, dz - 0.6), gy(dx + 0.95, dz - 0.6), gy(dx - 0.95, dz + 0.6), gy(dx + 0.95, dz + 0.6));
    const lo = Math.min(gy(dx - 0.95, dz - 0.6), gy(dx + 0.95, dz - 0.6), gy(dx - 0.95, dz + 0.6), gy(dx + 0.95, dz + 0.6));
    b.box(1.9, 1.15 + dy - lo, 1.2, { pos: [dx, (dy + 1.15 + lo) / 2, dz], color: 0x2e5a3a, surf: 'metal', surfScale: 0.5 });
    b.box(1.96, 0.08, 1.26, { pos: [dx, dy + 1.2, dz - 0.03], rot: [0.08, 0, 0], color: 0x1e3a28 });
    for (const sx of [-0.98, 0.98]) b.box(0.05, 0.08, 0.9, { pos: [dx + sx, dy + 0.75, dz], color: 0x1e3a28 });
    const [wx, wz] = f.to(dx, dz);
    P.colliders.addBox(wx, wz, 1.0, 0.65, c.yaw, -1e9, base + dy + 1.3);
  }

  P.addMesh(b.build(), c.x, base, c.z, c.yaw);
  P.addMesh(glow.build(), c.x, base, c.z, c.yaw, P.glowMat, { shadow: false });

  // ---- signs, lights, smoke, colliders and the counter
  {
    const [sx, sz] = f.to(0, zFF + 0.17);
    P.addSign('Kenai Trading Post', 'FISH  ·  FUEL  ·  ARROWS  ·  TACKLE', sx, base + 5.65, sz, c.yaw, 11, 2.2);
  }
  {
    const [sx, sz] = f.to(1.67, zF + 0.05);
    P.addSign('Live bait', 'Crawlers · Herring', sx, base + 1.62, sz, c.yaw, 1.15, 0.42, { bg: '#e8e4da', fg: '#b02a1e' });
  }
  {
    const [sx, sz] = f.to(-0.475, zF - T / 2 + 0.11);
    P.addSign('Open', '', sx, base + 1.72, sz, c.yaw, 0.42, 0.16, { bg: '#b02a1e', fg: '#ffffff' });
  }
  for (const [x, y, z] of [
    [-3.7, 2.4, zF + 0.7],
    [3.7, 2.4, zF + 0.7],
    [-3.7, 2.9, zF + 1.5],
    [3.7, 2.9, zF + 1.5],
  ]) {
    const [mx, mz] = f.to(x, z);
    P.nightLights.push(new THREE.Vector3(mx, base + y, mz));
  }
  {
    const [sx, sz] = f.to(spX, spZ);
    P.smokePoints.push(new THREE.Vector3(sx, base + spY + 1.95, sz));
  }
  // the store (as tall as its false front), its porch roof for the glider,
  // the porch deck, the rails and the posts by the steps
  P.colliders.addBox(c.x, c.z, W / 2 + 0.3, D / 2 + 0.3, c.yaw, -1e9, base + FF + 0.9);
  {
    const [x, z] = f.to(0, (zF + 0.3 + zP + 0.4) / 2);
    P.colliders.addBox(x, z, pw / 2 + 0.2, (zP + 0.4 - zF - 0.3) / 2, c.yaw, base + 3.0, base + 3.95);
  }
  {
    const [x, z] = f.to(0, pz);
    P.colliders.addDeck(x, z, pw / 2, PORCH / 2 + 0.02, c.yaw, base);
  }
  const railBox = (x0, z0, x1, z1) => {
    const [x, z] = f.to((x0 + x1) / 2, (z0 + z1) / 2);
    P.colliders.addBox(x, z, Math.max(0.06, Math.abs(x1 - x0) / 2), Math.max(0.06, Math.abs(z1 - z0) / 2), c.yaw, base - 0.5, base + 1.1).glideTop = base + 1.0;
  };
  railBox(-pw / 2 + 0.15, postZ, -midPost, postZ);
  railBox(midPost, postZ, pw / 2 - 0.15, postZ);
  railBox(-pw / 2 + 0.15, zF + 0.12, -pw / 2 + 0.15, postZ);
  railBox(pw / 2 - 0.15, zF + 0.12, pw / 2 - 0.15, postZ);
  for (const px of [-midPost, midPost]) {
    const [x, z] = f.to(px, postZ);
    P.colliders.addCircle(x, z, 0.14).top = base + 3.3;
  }
  // the bench, the barrels, the crates, the cooler and the rod rack
  for (const [x, z, hx, hz, h] of [
    [-3.7, zF + 0.45, 0.92, 0.26, 1.0],
    [-6.0, zP - 1.0, 0.75, 0.75, 1.15],
    [6.0, zF + 0.85, 0.6, 0.8, 1.35],
    [1.62, zF + 0.32, 0.42, 0.26, 0.65],
    [-5.75, zF + 0.22, 0.55, 0.2, 2.4],
  ]) {
    const [wx, wz] = f.to(x, z);
    P.colliders.addBox(wx, wz, hx, hz, c.yaw, base - 0.2, base + h);
  }
  for (const [x, z] of [
    [3.0, zF + 1.15],
    [4.4, zF + 1.15],
  ]) {
    const [wx, wz] = f.to(x, z);
    P.colliders.addCircle(wx, wz, 0.32).top = base + 1.05;
  }
  const [ix, iz] = f.to(0, zF + 1.6);
  P.interactions.push({ id: 'post', label: 'Trade', x: ix, z: iz, r: 3.4 });
  P.postBase = base;
}

// ---------------------------------------------- Kachemak Light and its house
// The lighthouse on the highest dry ground of the headland, its concrete
// base down to the ground on the seaward side, a door and windows up the
// tower, a gallery with railings round the lantern; and the keeper's house
// beside it along the slope: white clapboard under a red roof, the front
// door at the ground on the uphill side and a walk-out basement toward the
// sea, a picket fence, a clothesline.
const KEEPER_WHITE = 0xdcd8ce;
const KEEPER_RED = 0x963a26;
const KEEPER_GREEN = 0x2e4a32;

// The highest dry point near the lighthouse's place on the headland, and
// where the keeper's house stands beside it (for the forest's clearings too).
export function lighthouseSpot(Wd, c) {
  let best = { x: c.x, z: c.z, h: Wd.heightAt(c.x, c.z) };
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    for (const r of [6, 14, 22]) {
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const h = Wd.heightAt(x, z);
      if (h > best.h && Wd.coastAt(x, z) > 8) best = { x, z, h };
    }
  }
  const [kx, kz] = frame(best.x, best.z, 0.4).to(0.5, 10.5);
  return { ...best, keeper: { x: kx, z: kz } };
}

export function buildLighthouse(P, c) {
  const Wd = P.world;
  const best = lighthouseSpot(Wd, c);
  const g = best.h;
  const yaw = 0.4;
  const f = frame(best.x, best.z, yaw);
  const b = new ModelBuilder();
  const glow = new ModelBuilder();
  // the base: down to the lowest ground round it
  let lo = g;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lo = Math.min(lo, Wd.heightAt(best.x + Math.cos(a) * 3.4, best.z + Math.sin(a) * 3.4));
  }
  const footY = lo - g - 0.3;
  b.cyl(3.2, 3.4, 0.8 - footY, 16, { pos: [0, (0.8 + footY) / 2, 0], color: 0x9a968c, surf: 'concrete' });
  b.cyl(3.25, 3.25, 0.08, 16, { pos: [0, 0.82, 0], color: 0x7a766e });
  // the tower, the red band, a door toward the house and windows up it
  b.cyl(1.7, 2.4, 14, 16, { pos: [0, 7.8, 0], color: 0xdedad0, surf: 'concrete', jitter: 0.02 });
  // (radius of the tower at height y above its base)
  const rAt = (y) => 2.4 - ((y - 0.8) / 14) * 0.7;
  b.cyl(rAt(11.3) + 0.02, rAt(9.1) + 0.02, 2.2, 16, { pos: [0, 10.2, 0], color: KEEPER_RED, surf: 'concrete', jitter: 0.02 });
  {
    const r = rAt(1.8) + 0.02;
    b.box(1.05, 2.15, 0.12, { pos: [0, 1.9, r], color: 0xd8d4ca });
    b.box(0.86, 1.95, 0.08, { pos: [0, 1.8, r + 0.04], color: KEEPER_GREEN, surf: 'batten', surfScale: 0.5 });
    b.box(1.3, 0.12, 0.42, { pos: [0, 3.0, r + 0.12], rot: [0.25, 0, 0], color: KEEPER_RED });
    b.sphere(0.035, 6, 4, { pos: [0.3, 1.75, r + 0.1], color: 0xb08a3a });
    // steps up to it from the ground
    const gd = Wd.heightAt(...f.to(0, 3.9)) - g;
    const n = Math.max(0, Math.round((0.82 - gd) / 0.19));
    for (let k = 0; k < n; k++) {
      const ty = 0.82 - ((k + 1) * (0.82 - gd)) / (n + 1);
      b.box(1.3, ty - gd + 0.15, 0.3, { pos: [0, (ty + gd - 0.15) / 2, 3.4 + k * 0.3], color: 0x9a968c, surf: 'concrete' });
    }
  }
  for (const [y, a] of [
    [4.6, 0],
    [8.2, Math.PI * 0.75],
    [11.8, -Math.PI * 0.5],
  ]) {
    const r = rAt(y);
    const m = new THREE.Matrix4().makeRotationY(a);
    b.add(new THREE.BoxGeometry(0.58, 0.92, 0.12), { matrix: m, pos: [0, y, r], color: 0xd8d4ca });
    b.add(new THREE.BoxGeometry(0.4, 0.74, 0.06), { matrix: m, pos: [0, y, r + 0.04], color: KEEPER_GREEN });
    glow.add(new THREE.BoxGeometry(0.32, 0.66, 0.04), { matrix: m, pos: [0, y, r + 0.06], color: 0xffffff, jitter: 0 });
  }
  // the gallery: corbels under its deck, balusters and two rails
  b.cyl(2.35, 2.25, 0.25, 20, { pos: [0, 14.9, 0], color: 0x2a2a2a });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.strut([Math.cos(a) * 1.65, 14.0, Math.sin(a) * 1.65], [Math.cos(a) * 2.2, 14.78, Math.sin(a) * 2.2], 0.1, 0.14, { color: 0x2a2a2a });
  }
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    b.box(0.04, 0.95, 0.04, { pos: [Math.cos(a) * 2.22, 15.5, Math.sin(a) * 2.22], rot: [0, -a, 0], color: 0x2a2a2a, jitter: 0 });
  }
  b.torus(2.22, 0.045, 4, 28, { pos: [0, 16.0, 0], rot: [Math.PI / 2, 0, 0], color: 0x2a2a2a, jitter: 0 });
  b.torus(2.22, 0.03, 4, 28, { pos: [0, 15.45, 0], rot: [Math.PI / 2, 0, 0], color: 0x2a2a2a, jitter: 0 });
  // the lantern room: its wall, astragals round the glass, the roof, a
  // ventilator ball and the lightning rod
  b.cyl(1.55, 1.55, 0.7, 16, { pos: [0, 15.4, 0], color: 0xdedad0, surf: 'concrete' });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(0.06, 1.85, 0.06, { pos: [Math.cos(a) * 1.43, 16.75, Math.sin(a) * 1.43], color: 0x1e1e1e, jitter: 0 });
  }
  b.torus(1.43, 0.04, 4, 20, { pos: [0, 16.75, 0], rot: [Math.PI / 2, 0, 0], color: 0x1e1e1e, jitter: 0 });
  b.cyl(1.55, 1.55, 0.2, 16, { pos: [0, 17.8, 0], color: 0x2a2a2a });
  b.cone(1.75, 1.5, 16, { pos: [0, 18.6, 0], color: KEEPER_RED, jitter: 0.03 });
  b.sphere(0.24, 10, 6, { pos: [0, 19.45, 0], color: 0x2a2a2a });
  b.cyl(0.02, 0.02, 1.1, 4, { pos: [0, 20.2, 0], color: 0x2a2a2a });
  P.addMesh(b.build(), best.x, g, best.z, yaw);
  P.addMesh(glow.build(), best.x, g, best.z, yaw, P.glowMat, { shadow: false });
  const lantern = new ModelBuilder();
  lantern.cyl(1.4, 1.4, 1.8, 12, { pos: [0, 16.8, 0], color: 0xffffff, jitter: 0 });
  P.lantern = P.addMesh(lantern.build(), best.x, g, best.z, yaw, new THREE.MeshBasicMaterial({ color: 0x556070, toneMapped: false }), { shadow: false });
  P.colliders.addCircle(best.x, best.z, 3.0).hi = 19;
  P.lighthousePos = new THREE.Vector3(best.x, g, best.z);

  buildKeeperHouse(P, f, g);

  // the rotating beam, seen at night
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
  P.group.add(beam);
  P.beam = beam;
}

// The keeper's house, 10.5 m along the slope from the tower (lf: the
// tower's frame, its +x uphill): its front faces uphill.
function buildKeeperHouse(P, lf, g) {
  const Wd = P.world;
  const [hx, hz] = lf.to(0.5, 10.5);
  const yaw = lf.yaw + Math.PI / 2;
  const f = frame(hx, hz, yaw);
  const rand = mulberry32(31);
  const W = 6.5;
  const D = 5;
  const WALLH = 2.7;
  // the floor a little above the ground along the front (uphill) wall
  let front = -Infinity;
  for (let i = 0; i <= 8; i++) front = Math.max(front, Wd.heightAt(...f.to(-W / 2 - 0.2 + ((W + 0.4) * i) / 8, D / 2 + 0.2)));
  const gr = groundRange(Wd, f, -W / 2 - 0.2, W / 2 + 0.2, -D / 2 - 0.2, D / 2 + 0.2);
  const base = Math.max(front + 0.3, gr.hi + 0.12);
  const gy = (lx, lz) => Wd.heightAt(...f.to(lx, lz)) - base;
  const b = new ModelBuilder();
  const glow = new ModelBuilder();
  const footY = gr.lo - base - 0.3;
  b.box(W + 0.3, -footY, D + 0.3, { pos: [0, footY / 2, 0], color: 0x8a847a, surf: 'stone', jitter: 0.05 });
  b.box(W + 0.4, 0.12, D + 0.4, { pos: [0, -0.04, 0], color: 0x6a645a, surf: 'concrete' });

  // walls of white clapboard round the windows and the door
  const T = 0.18;
  const door = { x0: -0.5, x1: 0.5, y0: 0, y1: 2.05 };
  const fw = [
    { x0: -2.5, x1: -1.5, y0: 0.9, y1: 2.15 },
    { x0: 1.5, x1: 2.5, y0: 0.9, y1: 2.15 },
  ];
  const bw = [
    { x0: -2.4, x1: -1.4, y0: 0.9, y1: 2.15 },
    { x0: -0.5, x1: 0.5, y0: 0.9, y1: 2.15 },
    { x0: 1.4, x1: 2.4, y0: 0.9, y1: 2.15 },
  ];
  const sw = [{ x0: -0.5, x1: 0.5, y0: 0.9, y1: 2.15 }];
  panelWall(b, { a0: -W / 2, a1: W / 2, y0: 0.02, y1: WALLH, at: D / 2 - T / 2, thick: T, holes: [door, ...fw], color: KEEPER_WHITE, surf: 'plank' });
  panelWall(b, { a0: -W / 2, a1: W / 2, y0: 0.02, y1: WALLH, at: -D / 2 + T / 2, thick: T, holes: bw, color: KEEPER_WHITE, surf: 'plank' });
  const win = (bb, gg, h, z, side) => {
    const cx = (h.x0 + h.x1) / 2;
    opening(bb, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z: z + side * 0.03, thick: T + 0.06, color: KEEPER_WHITE, side });
    windowPanes(bb, gg, { cx, y0: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, z, side, rows: 2, cols: 2, color: KEEPER_GREEN });
  };
  for (const h of fw) win(b, glow, h, D / 2 - T / 2, 1);
  for (const h of bw) win(b, glow, h, -D / 2 + T / 2, -1);
  for (const sd of [1, -1]) {
    onSide(sd, W / 2 - T / 2, [b, glow], (sb, sg) => {
      panelWall(sb, { a0: -D / 2 + T, a1: D / 2 - T, y0: 0.02, y1: WALLH, at: 0, thick: T, holes: sw, color: KEEPER_WHITE, surf: 'plank' });
      win(sb, sg, sw[0], 0, 1);
    });
  }
  // corner boards and the door
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.16, WALLH, 0.16, { pos: [sx * (W / 2 - 0.06), WALLH / 2, sz * (D / 2 - 0.06)], color: 0xdedad0, surf: 'plank', surfSwap: true });
  opening(b, { cx: 0, y0: 0, w: 1.0, h: 2.05, z: D / 2 - T / 2 + 0.03, thick: T + 0.06, color: KEEPER_WHITE, sill: false });
  plankDoor(b, { cx: 0, w: 1.0, h: 2.05, z: D / 2 - T / 2 + 0.02, color: KEEPER_GREEN, hingeLeft: true });
  // a hood over the door on two brackets, and a concrete step
  b.box(1.5, 0.08, 0.75, { pos: [0, 2.48, D / 2 + 0.36], rot: [0.3, 0, 0], color: KEEPER_RED, surf: 'metal' });
  for (const sx of [-0.62, 0.62]) b.strut([sx, 2.05, D / 2 + 0.02], [sx, 2.42, D / 2 + 0.58], 0.06, 0.06, { color: KEEPER_WHITE });
  b.box(1.4, 0.24, 0.8, { pos: [0, -0.15, D / 2 + 0.45], color: 0x9a968c, surf: 'concrete' });

  // the roof: red corrugated metal on a gable, ridge along the house
  const rise = 1.9;
  const ang = Math.atan2(rise, D / 2);
  const slope = Math.hypot(D / 2, rise) + 0.45;
  const ridgeY = WALLH + rise + 0.1;
  const rl = W + 0.6;
  for (const sd of [1, -1]) {
    const cz = sd * Math.cos(ang) * (slope / 2);
    const cy = ridgeY - Math.sin(ang) * (slope / 2);
    b.box(rl, 0.06, slope, { pos: [0, cy + Math.cos(ang) * 0.07, cz + sd * Math.sin(ang) * 0.07], rot: [sd * ang, 0, 0], color: KEEPER_RED, surf: 'metal', jitter: 0.02 });
    b.box(rl - 0.05, 0.05, slope - 0.05, { pos: [0, cy + Math.cos(ang) * 0.01, cz + sd * Math.sin(ang) * 0.01], rot: [sd * ang, 0, 0], color: 0xd8d4ca, surf: 'plank' });
    const ez = sd * Math.cos(ang) * slope;
    const ey = ridgeY - Math.sin(ang) * slope;
    b.box(rl + 0.06, 0.2, 0.06, { pos: [0, ey + 0.04, ez + sd * 0.03], color: 0xdedad0, surf: 'plank' });
    for (const xx of [-rl / 2 - 0.03, rl / 2 + 0.03]) b.strut([xx, ey - 0.03, ez], [xx, ridgeY + 0.06, 0], 0.06, 0.2, { color: 0xdedad0 });
  }
  b.box(rl + 0.04, 0.1, 0.36, { pos: [0, ridgeY + 0.1, 0], color: 0x7a2418, surf: 'metal' });
  for (const sd of [1, -1]) gable(b, D, rise, T, { pos: [sd * (W / 2 - T / 2), WALLH - 0.02, 0], rot: [0, Math.PI / 2, 0], color: KEEPER_WHITE, surf: 'plank' });
  for (const sd of [1, -1]) gableRafters(b, { run: D / 2, rise, ridgeY, z: 0, color: 0xdedad0, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(sd * (W / 2 - T / 2), 0, 0) });
  // a round vent in each gable
  for (const sd of [1, -1]) b.cyl(0.22, 0.22, 0.06, 12, { pos: [sd * (W / 2 + 0.01), WALLH + 0.85, 0], rot: [0, 0, Math.PI / 2], color: KEEPER_GREEN });
  // the brick chimney at the ridge
  b.box(0.7, 2.6, 0.6, { pos: [W / 2 - 1.1, ridgeY - 0.6, -0.2], color: 0x8a4a3a, surf: 'stone', surfScale: 0.6 });
  b.box(0.82, 0.12, 0.72, { pos: [W / 2 - 1.1, ridgeY + 0.75, -0.2], color: 0x5a5148 });
  b.box(0.22, 0.25, 0.22, { pos: [W / 2 - 1.1, ridgeY + 0.92, -0.2], color: 0x2a2a2a });

  // the basement toward the sea: a door and two small windows in the stone,
  // where there is the height for them
  const bz = -D / 2 - 0.15;
  const g0 = Math.max(gy(-0.7, bz - 0.5), gy(0.7, bz - 0.5));
  if (g0 < -2.3) {
    b.box(1.2, 2.15, 0.1, { pos: [0, g0 + 1.07, bz - 0.02], color: 0xd8d4ca });
    b.box(0.9, 1.95, 0.06, { pos: [0, g0 + 0.98, bz - 0.06], color: KEEPER_GREEN, surf: 'batten', surfScale: 0.5 });
    b.box(1.4, 0.14, 0.9, { pos: [0, g0 - 0.05, bz - 0.5], color: 0x9a968c, surf: 'concrete' });
    for (const sx of [-2.0, 2.0]) {
      const wy = Math.max(gy(sx, bz - 0.4) + 0.5, g0 + 1.2);
      if (wy + 0.6 > -0.3) continue;
      b.box(0.8, 0.6, 0.08, { pos: [sx, wy + 0.3, bz - 0.02], color: 0xd8d4ca });
      glow.box(0.66, 0.46, 0.04, { pos: [sx, wy + 0.3, bz - 0.06], color: 0xffffff, jitter: 0 });
    }
    const [lx, lz] = f.to(0, bz - 0.5);
    P.colliders.addDeck(lx, lz, 0.7, 0.45, yaw, base + g0 + 0.02);
  }

  // a picket fence round the front yard, a gate gap at the path
  const fz = D / 2 + 3.2;
  const picket = (x, z) => {
    const y = gy(x, z);
    b.box(0.08, 1.0, 0.03, { pos: [x, y + 0.42, z], color: 0xdedad0, jitter: 0.03 });
    b.cone(0.057, 0.08, 4, { pos: [x, y + 0.96, z], scale: [1, 1, 0.38], color: 0xdedad0, jitter: 0.03 });
  };
  const fenceRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 0.17));
    for (let i = 0; i <= n; i++) picket(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n);
    for (const ry of [0.25, 0.75]) b.strut([x0, gy(x0, z0) + ry, z0 - 0.03], [x1, gy(x1, z1) + ry, z1 - 0.03], 0.06, 0.04, { color: 0xdedad0 });
    for (const [px, pz] of [
      [x0, z0],
      [x1, z1],
    ]) {
      const y = gy(px, pz);
      b.box(0.1, 1.3, 0.1, { pos: [px, y + 0.5, pz], color: 0xdedad0, surf: 'plank', surfSwap: true });
    }
  };
  fenceRun(-W / 2 - 0.6, fz, -0.75, fz);
  fenceRun(0.75, fz, W / 2 + 0.6, fz);
  fenceRun(-W / 2 - 0.6, D / 2 + 0.3, -W / 2 - 0.6, fz);
  fenceRun(W / 2 + 0.6, D / 2 + 0.3, W / 2 + 0.6, fz);
  // a clothesline beside the house with the wash out
  {
    const cx = -W / 2 - 2.2;
    const z0 = -1.6;
    const z1 = 2.4;
    for (const zz of [z0, z1]) {
      const y = gy(cx, zz);
      b.box(0.08, 2.0, 0.08, { pos: [cx, y + 0.9, zz], color: 0x8a8a84 });
      b.box(0.08, 0.06, 0.7, { pos: [cx, y + 1.85, zz], rot: [Math.PI / 2, 0, 0], color: 0x8a8a84 });
    }
    const y0 = gy(cx, z0) + 1.82;
    const y1 = gy(cx, z1) + 1.82;
    b.strut([cx, y0, z0], [cx, y1, z1], 0.01, 0.01, { color: 0xdedad0 });
    const wash = [
      [0.4, 0.55, 0xd8322a],
      [0.6, 0.7, 0x3a5a8a],
      [0.45, 0.42, 0xdedad0],
      [0.35, 0.8, 0x4a6a3a],
    ];
    let zz = z0 + 0.4;
    for (const [w, h, col] of wash) {
      const t = (zz + w / 2 - z0) / (z1 - z0);
      const yy = y0 + (y1 - y0) * t - 0.03;
      b.box(0.02, h, w, { pos: [cx, yy - h / 2, zz + w / 2], rot: [rand() * 0.04, 0, 0], color: col, jitter: 0.04 });
      zz += w + 0.2;
    }
    for (const zz2 of [z0, z1]) {
      const [wx, wz] = f.to(cx, zz2);
      P.colliders.addCircle(wx, wz, 0.1).hi = 2.0;
    }
  }
  // a rain barrel at the front corner
  barrel(b, { x: W / 2 + 0.45, y: gy(W / 2 + 0.45, D / 2 - 0.4), z: D / 2 - 0.4, color: 0x3a5a6a });

  P.addMesh(b.build(), hx, base, hz, yaw);
  P.addMesh(glow.build(), hx, base, hz, yaw, P.glowMat, { shadow: false });
  P.keeperPos = { x: hx, z: hz, y: base, yaw };
  for (const [x, z] of [
    [-2.0, D / 2 + 0.6],
    [2.0, D / 2 + 0.6],
    [0, -D / 2 - 0.6],
  ]) {
    const [mx, mz] = f.to(x, z);
    P.nightLights.push(new THREE.Vector3(mx, base + 1.6, mz));
  }
  const [cx, cz] = f.to(W / 2 - 1.1, -0.2);
  P.smokePoints.push(new THREE.Vector3(cx, base + ridgeY + 1.1, cz));
  P.colliders.addBox(hx, hz, W / 2 + 0.2, D / 2 + 0.2, yaw, -1e9, base + ridgeY + 0.3);
  {
    // the chimney as tall as its pot (for the paraglider)
    const [x, z] = f.to(W / 2 - 1.1, -0.2);
    P.colliders.addBox(x, z, 0.45, 0.4, yaw, -1e9, base + ridgeY + 1.05);
  }
  {
    const [x, z] = f.to(0, D / 2 + 0.45);
    P.colliders.addDeck(x, z, 0.7, 0.4, yaw, base - 0.03);
  }
  const fenceBox = (x0, z0, x1, z1) => {
    const [x, z] = f.to((x0 + x1) / 2, (z0 + z1) / 2);
    const top = base + Math.max(gy(x0, z0), gy(x1, z1)) + 1.05;
    P.colliders.addBox(x, z, Math.max(0.06, Math.abs(x1 - x0) / 2), Math.max(0.06, Math.abs(z1 - z0) / 2), yaw, -1e9, top).glideTop = top;
  };
  fenceBox(-W / 2 - 0.6, fz, -0.75, fz);
  fenceBox(0.75, fz, W / 2 + 0.6, fz);
  fenceBox(-W / 2 - 0.6, D / 2 + 0.3, -W / 2 - 0.6, fz);
  fenceBox(W / 2 + 0.6, D / 2 + 0.3, W / 2 + 0.6, fz);
}

// ------------------------------------------------------------ Halibut Pier
// The pier from the beach out to deep water: a deck of planks on pile
// bents with caps and cross bracing, weed at the tide line, railings with
// rod holders, lamp posts, the blue bait shack with its service window,
// a fish cleaning table, crab pots, benches, a ladder and a life ring, gulls
// on the posts, and the skiff moored alongside.
const PIER_WOOD = 0x8a7458;
const PILE = 0x3d3226;

// A gull at rest, facing +z.
export function gull(b, x, y, z, yaw = 0) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  b.add(new THREE.SphereGeometry(1, 8, 5), { matrix: m, pos: [0, 0.14, 0], scale: [0.09, 0.09, 0.2], color: 0xf2f2ee, jitter: 0.02 });
  b.add(new THREE.SphereGeometry(1, 7, 5), { matrix: m, pos: [0, 0.25, 0.14], scale: [0.065, 0.065, 0.075], color: 0xf6f6f2, jitter: 0.02 });
  b.add(new THREE.ConeGeometry(0.018, 0.08, 4), { matrix: m, pos: [0, 0.24, 0.24], rot: [Math.PI / 2, 0, 0], color: 0xe2b42a, jitter: 0 });
  for (const sd of [-1, 1]) b.add(new THREE.BoxGeometry(0.03, 0.08, 0.3), { matrix: m, pos: [sd * 0.085, 0.17, -0.04], rot: [0, 0, sd * 0.25], color: 0x8a9298, jitter: 0.02 });
  b.add(new THREE.BoxGeometry(0.12, 0.03, 0.12), { matrix: m, pos: [0, 0.16, -0.22], color: 0x2a2a2a, jitter: 0 });
  for (const sd of [-1, 1]) b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), { matrix: m, pos: [sd * 0.03, 0.04, 0.02], color: 0xd8a830, jitter: 0 });
}

// A crab pot: a frame of bars, dark netting and a buoy on its line.
export function crabPot(b, x, y, z, rot, s = 0.9) {
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  const P = (px, py, pz) => new THREE.Vector3(px, py, pz).applyMatrix4(m).toArray();
  const h = s * 0.5;
  const e = s / 2;
  for (const [a, c] of [
    [[-e, 0, -e], [e, 0, -e]],
    [[-e, 0, e], [e, 0, e]],
    [[-e, 0, -e], [-e, 0, e]],
    [[e, 0, -e], [e, 0, e]],
    [[-e, h, -e], [e, h, -e]],
    [[-e, h, e], [e, h, e]],
    [[-e, h, -e], [-e, h, e]],
    [[e, h, -e], [e, h, e]],
    [[-e, 0, -e], [-e, h, -e]],
    [[e, 0, -e], [e, h, -e]],
    [[-e, 0, e], [-e, h, e]],
    [[e, 0, e], [e, h, e]],
  ]) b.strut(P(...a), P(...c), 0.03, 0.03, { color: 0x3a3a36, jitter: 0 });
  b.add(new THREE.BoxGeometry(s - 0.04, h - 0.03, s - 0.04), { matrix: m, pos: [0, h / 2, 0], color: 0x2f4a3a, jitter: 0.04 });
  b.add(new THREE.SphereGeometry(0.11, 8, 6), { matrix: m, pos: [e - 0.1, h + 0.11, e - 0.1], color: 0xe85a1e });
}

export function buildPier(P, p) {
  const Wd = P.world;
  const d = p.dock;
  const dx = d.x1 - d.x0;
  const dz = d.z1 - d.z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const f = frame(cx, cz, yaw);
  const rand = mulberry32(77);
  const hw = d.width / 2;
  const b = new ModelBuilder();
  // the deck in lengths between the bents, each a shade of its own
  const bents = Math.floor(len / 4);
  for (let i = 0; i < bents; i++) {
    const z0 = -len / 2 + i * 4;
    const z1 = i === bents - 1 ? len / 2 : z0 + 4;
    const tone = new THREE.Color(PIER_WOOD).multiplyScalar(0.9 + rand() * 0.18).getHex();
    b.box(d.width, 0.12, z1 - z0 - 0.01, { pos: [0, -0.06, (z0 + z1) / 2], color: tone, surf: 'deck', jitter: 0.02 });
  }
  // stringers under the deck, along it
  for (const sx of [-hw + 0.3, 0, hw - 0.3]) b.box(len, 0.28, 0.2, { pos: [sx, -0.26, 0], rot: [0, Math.PI / 2, 0], color: 0x4a3c2c, surf: 'plank' });
  // the bents: a pile each side, a cap across, cross bracing down to the
  // water and weed at the tide line
  for (let i = 0; i <= bents; i++) {
    const z = Math.min(len / 2 - 0.2, -len / 2 + i * 4);
    const bottoms = [];
    for (const side of [-1, 1]) {
      const lx = side * (hw + 0.1);
      const [wx, wz] = f.to(lx, z);
      const g = Math.min(Wd.heightAt(wx, wz), 0);
      const h = d.top - g + 0.2;
      b.cyl(0.2, 0.22, h, 9, { pos: [lx, -h / 2 + 0.1, z], color: PILE, surf: 'log', jitter: 0.05 });
      if (g < -0.3) b.cyl(0.235, 0.24, 0.9, 9, { pos: [lx, -d.top - 0.15, z], color: 0x26321e, jitter: 0.06 });
      b.cyl(0.09, 0.09, 1.1, 6, { pos: [lx, 0.55, z], color: WOOD_DARK, surf: 'plank' });
      bottoms.push(g);
    }
    b.box(d.width + 0.75, 0.3, 0.32, { pos: [0, -0.48, z], color: 0x4a3c2c, surf: 'plank' });
    const low = Math.max(-d.top + 0.6, Math.max(...bottoms) - d.top + 0.4);
    if (low < -1.2) {
      for (const sd of [-1, 1]) b.strut([sd * (hw + 0.1), -0.6, z + 0.12], [-sd * (hw + 0.1), low, z + 0.12], 0.12, 0.08, { color: 0x4a3c2c });
    }
  }
  // railings with rod holders on the top rail at each post
  for (const side of [-1, 1]) {
    const x = side * (hw + 0.1);
    b.box(len, 0.1, 0.1, { pos: [x, 1.05, 0], rot: [0, Math.PI / 2, 0], color: WOOD_LIGHT, surf: 'plank' });
    b.box(len, 0.08, 0.08, { pos: [x, 0.55, 0], rot: [0, Math.PI / 2, 0], color: WOOD_LIGHT, surf: 'plank' });
    for (let i = 1; i < bents; i += 2) {
      const z = -len / 2 + i * 4;
      b.cyl(0.03, 0.03, 0.26, 6, { pos: [x + side * 0.08, 1.05, z], rot: [-side * 0.35, 0, 0], color: 0x9a9a9a, jitter: 0 });
    }
  }
  // cleats along the edges
  for (let i = 1; i < bents; i += 3) {
    for (const side of [-1, 1]) {
      const z = -len / 2 + i * 4 + 2;
      b.box(0.08, 0.06, 0.32, { pos: [side * (hw - 0.15), 0.05, z], color: 0x2a2a2a, jitter: 0 });
      b.box(0.06, 0.08, 0.08, { pos: [side * (hw - 0.15), 0.02, z], color: 0x2a2a2a, jitter: 0 });
    }
  }
  // lamp posts down the right side, each a lantern on an arm
  for (let i = 1; i < 4; i++) {
    const z = -len / 2 + (i * len) / 4;
    b.cyl(0.07, 0.09, 3.6, 8, { pos: [hw + 0.1, 1.8, z], color: 0x222222 });
    b.box(0.5, 0.06, 0.06, { pos: [hw - 0.1, 3.6, z], color: 0x222222 });
    b.cyl(0.03, 0.03, 0.12, 6, { pos: [hw - 0.3, 3.52, z], color: 0x222222 });
    b.cone(0.24, 0.18, 8, { pos: [hw - 0.3, 3.65, z], color: 0x1e3a28 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.02, 0.32, 0.02, { pos: [hw - 0.3 + Math.cos(a) * 0.15, 3.42, z + Math.sin(a) * 0.15], color: 0x222222, jitter: 0 });
    }
    b.cyl(0.15, 0.17, 0.04, 8, { pos: [hw - 0.3, 3.26, z], color: 0x222222 });
  }

  // the bait shack: board and batten under a shed roof, a door at its
  // seaward end, a service window with its flap propped up toward the walk
  const ez = len / 2 - 3;
  const sx0 = -hw + 1.4;
  const sz0 = ez - 4;
  const SW = 3.2;
  const SD = 2.6;
  const SH = 2.5;
  {
    const sb = new ModelBuilder();
    const sg = new ModelBuilder();
    const BLUE = 0x3f6a8a;
    const T = 0.12;
    const door = { x0: 0.25, x1: 1.1, y0: 0, y1: 2.0 };
    panelWall(sb, { a0: -SW / 2, a1: SW / 2, y0: 0, y1: SH, at: SD / 2 - T / 2, thick: T, holes: [door], color: BLUE, surf: 'batten', surfScale: 0.8 });
    const bwin = { x0: -0.5, x1: 0.5, y0: 1.2, y1: 1.9 };
    panelWall(sb, { a0: -SW / 2, a1: SW / 2, y0: 0, y1: SH, at: -SD / 2 + T / 2, thick: T, holes: [bwin], color: BLUE, surf: 'batten', surfScale: 0.8 });
    const svc = { x0: -0.75, x1: 0.75, y0: 0.95, y1: 1.85 };
    onSide(1, SW / 2 - T / 2, [sb, sg], (wb, wg) => {
      panelWall(wb, { a0: -SD / 2 + T, a1: SD / 2 - T, y0: 0, y1: SH, at: 0, thick: T, holes: [svc], color: BLUE, surf: 'batten', surfScale: 0.8 });
      opening(wb, { cx: 0, y0: svc.y0, w: 1.5, h: 0.9, z: 0.03, thick: T + 0.06, color: TRIM, sill: false, side: 1 });
      // the counter, the flap propped up and its two props
      wb.box(1.7, 0.05, 0.4, { pos: [0, svc.y0 - 0.02, 0.18], color: WOOD_LIGHT, surf: 'plank' });
      wb.box(1.6, 0.05, 0.95, { pos: [0, svc.y1 + 0.32, 0.42], rot: [-0.75, 0, 0], color: BLUE, surf: 'batten', surfScale: 0.8 });
      for (const px of [-0.7, 0.7]) wb.strut([px, svc.y0 + 0.02, 0.32], [px, svc.y1 + 0.62, 0.72], 0.03, 0.03, { color: WOOD_DARK });
      // inside: a dim shelf of tackle behind the counter
      wg.box(1.45, 0.85, 0.02, { pos: [0, svc.y0 + 0.45, -0.2], color: 0xffffff, jitter: 0 });
      wb.box(1.4, 0.04, 0.2, { pos: [0, 1.45, -0.12], color: WOOD_DARK });
      for (let k = 0; k < 7; k++) wb.box(0.12, 0.16 + rand() * 0.08, 0.1, { pos: [-0.6 + k * 0.2, 1.55, -0.12], color: [0xd8322a, 0xf2c230, 0x2a6aa8, 0x3a7a2a][k % 4], jitter: 0.04 });
    });
    onSide(-1, SW / 2 - T / 2, [sb], (wb) => panelWall(wb, { a0: -SD / 2 + T, a1: SD / 2 - T, y0: 0, y1: SH, at: 0, thick: T, color: BLUE, surf: 'batten', surfScale: 0.8 }));
    for (const ccx of [-1, 1]) for (const ccz of [-1, 1]) sb.box(0.14, SH, 0.14, { pos: [ccx * (SW / 2 - 0.05), SH / 2, ccz * (SD / 2 - 0.05)], color: TRIM, surf: 'plank', surfSwap: true });
    opening(sb, { cx: (door.x0 + door.x1) / 2, y0: 0, w: door.x1 - door.x0, h: 2.0, z: SD / 2 - T / 2 + 0.03, thick: T + 0.06, color: TRIM, sill: false });
    plankDoor(sb, { cx: (door.x0 + door.x1) / 2, w: door.x1 - door.x0, h: 2.0, z: SD / 2 - T / 2 + 0.02, color: 0xe8e4da, hingeLeft: false });
    opening(sb, { cx: 0, y0: bwin.y0, w: 1.0, h: 0.7, z: -SD / 2 + T / 2 - 0.03, thick: T + 0.06, color: TRIM, side: -1 });
    windowPanes(sb, sg, { cx: 0, y0: bwin.y0, w: 1.0, h: 0.7, z: -SD / 2 + T / 2, side: -1, rows: 1, cols: 2, color: TRIM });
    // the shed roof, high over the door end
    const ra = Math.atan2(0.4, SD);
    const rlen = Math.hypot(SD, 0.4) + 0.6;
    sb.box(SW + 0.5, 0.06, rlen, { pos: [0, SH + 0.28, 0], rot: [-ra, 0, 0], color: 0x8c9092, surf: 'metal', jitter: 0.02 });
    sb.box(SW + 0.45, 0.05, rlen - 0.05, { pos: [0, SH + 0.22, 0], rot: [-ra, 0, 0], color: 0x7a6248, surf: 'plank' });
    sb.box(SW + 0.12, 0.42, 0.1, { pos: [0, SH + 0.21, SD / 2 - 0.05], color: BLUE, surf: 'batten', surfScale: 0.8 });
    sb.box(SW + 0.12, 0.05, 0.1, { pos: [0, SH + 0.03, -SD / 2 + 0.05], color: BLUE });
    // the side boards up to the roof: wedges, high at the door end, under
    // the roof's boards all along
    for (const ccx of [-1, 1]) {
      const wedge = new THREE.Shape();
      wedge.moveTo(-SD / 2, 0);
      wedge.lineTo(SD / 2, 0);
      wedge.lineTo(SD / 2, 0.39);
      wedge.closePath();
      const geo = new THREE.ExtrudeGeometry(wedge, { depth: 0.1, bevelEnabled: false });
      geo.translate(0, 0, -0.05);
      geo.rotateY(-Math.PI / 2);
      sb.add(geo, { pos: [ccx * (SW / 2 - 0.05), SH, 0], color: BLUE, surf: 'batten', surfScale: 0.8 });
    }
    // a lamp over the door, a life ring and a string of floats on the wall,
    // the bait cooler by the window
    sb.box(0.05, 0.22, 0.05, { pos: [0.68, 2.3, SD / 2 + 0.03], color: IRON });
    sb.cone(0.12, 0.1, 8, { pos: [0.68, 2.22, SD / 2 + 0.18], color: 0x1e3a28 });
    sg.sphere(0.05, 6, 4, { pos: [0.68, 2.14, SD / 2 + 0.18], color: 0xffffff, jitter: 0 });
    sb.torus(0.26, 0.07, 6, 14, { pos: [-0.7, 1.35, SD / 2 + 0.06], color: 0xe8541e, jitter: 0 });
    for (let k = 0; k < 4; k++) sb.box(0.06, 0.15, 0.15, { pos: [-0.7 + Math.cos((k * Math.PI) / 2) * 0.26, 1.35 + Math.sin((k * Math.PI) / 2) * 0.26, SD / 2 + 0.07], rot: [0, 0, (k * Math.PI) / 2], color: 0xdedad0, jitter: 0 });
    for (let k = 0; k < 3; k++) sb.sphere(0.13, 8, 6, { pos: [-SW / 2 - 0.08, 1.7 - k * 0.32, -0.6 + k * 0.1], color: [0xe85a1e, 0xf2c230, 0xe8e4da][k] });
    sb.box(0.8, 0.5, 0.5, { pos: [-0.95, 0.25, SD / 2 + 0.4], color: 0xe8e4da });
    sb.box(0.84, 0.08, 0.54, { pos: [-0.95, 0.54, SD / 2 + 0.4], color: 0x2a6aa8 });
    const g = sb.build();
    g.translate(sx0, 0, sz0);
    b.add(g, { keepColors: true, jitter: 0 });
    const gg = sg.build();
    gg.translate(sx0, 0, sz0);
    P.addMesh(gg, cx, d.top, cz, yaw, P.glowMat, { shadow: false });
    const [mx, mz] = f.to(sx0 + 0.68, sz0 + SD / 2 + 0.5);
    P.nightLights.push(new THREE.Vector3(mx, d.top + 2.1, mz));
  }
  // the fish cleaning table: a white board on a steel frame, a sink, a tap
  // and a bucket
  {
    const tx = hw - 0.8;
    const tz = ez - 8;
    b.box(1.8, 0.06, 0.8, { pos: [tx, 0.95, tz], color: 0xdedad0 });
    b.box(1.84, 0.12, 0.84, { pos: [tx, 0.86, tz], color: 0x9aa0a4 });
    for (const lx of [-0.8, 0.8]) for (const lz of [-0.34, 0.34]) b.box(0.05, 0.86, 0.05, { pos: [tx + lx, 0.43, tz + lz], color: 0x9aa0a4, jitter: 0 });
    b.box(1.7, 0.04, 0.7, { pos: [tx, 0.25, tz], color: 0x9aa0a4 });
    b.box(0.5, 0.08, 0.4, { pos: [tx + 0.55, 0.96, tz], color: 0x5a6064 });
    b.beam([tx + 0.75, 0.98, tz - 0.3], [tx + 0.75, 1.3, tz - 0.3], 0.02, 5, { color: 0xb8bcbe });
    b.beam([tx + 0.75, 1.3, tz - 0.3], [tx + 0.6, 1.28, tz - 0.1], 0.02, 5, { color: 0xb8bcbe });
    b.cyl(0.14, 0.12, 0.3, 10, { pos: [tx - 0.6, 0.15, tz + 0.6], color: 0xe8e4da });
  }
  // crab pots stacked near the beach end, benches facing out to sea
  crabPot(b, hw - 0.7, 0, -len / 2 + 6, 0.1);
  crabPot(b, hw - 0.75, 0.45, -len / 2 + 6.1, 0.4);
  crabPot(b, hw - 0.7, 0, -len / 2 + 7.05, -0.2);
  for (const bz of [-len / 2 + 22, -len / 2 + 46]) {
    b.box(1.6, 0.06, 0.42, { pos: [-hw + 0.45, 0.46, bz], rot: [0, Math.PI / 2, 0], color: WOOD_LIGHT, surf: 'plank' });
    for (const lz of [-0.65, 0.65]) b.box(0.38, 0.46, 0.07, { pos: [-hw + 0.45, 0.23, bz + lz], color: WOOD_DARK });
  }
  // a ladder down to the water at the end, a life ring on its post
  {
    const lz = len / 2 - 0.35;
    const lx = hw - 0.7;
    for (const sx of [-0.25, 0.25]) b.box(0.06, d.top + 1.3, 0.06, { pos: [lx + sx, (1.1 - d.top - 0.2) / 2, lz + 0.18], color: 0x9aa0a4, jitter: 0 });
    for (let k = 0; k < Math.floor(d.top / 0.3) + 2; k++) b.box(0.5, 0.04, 0.04, { pos: [lx, 0.3 - k * 0.3, lz + 0.18], color: 0x9aa0a4, jitter: 0 });
    b.box(0.1, 1.3, 0.1, { pos: [-hw + 0.5, 0.65, lz - 0.6], color: WOOD_DARK, surf: 'plank', surfSwap: true });
    b.torus(0.28, 0.07, 6, 14, { pos: [-hw + 0.5, 1.0, lz - 0.52], color: 0xe8541e, jitter: 0 });
  }
  // gulls on the posts
  for (const [gx, gz, gyaw] of [
    [hw + 0.1, -len / 2 + 12, 1.2],
    [-hw - 0.1, -len / 2 + 28, -2.0],
    [hw + 0.1, -len / 2 + 52, 2.6],
  ]) gull(b, gx, 1.1, gz, gyaw);
  P.addMesh(b.build(), cx, d.top, cz, yaw);

  // the lamps' globes glow at night
  const lamps = new ModelBuilder();
  for (let i = 1; i < 4; i++) {
    const z = -len / 2 + (i * len) / 4;
    lamps.sphere(0.13, 8, 6, { pos: [hw - 0.3, 3.42, z], color: 0xffffff, jitter: 0 });
    const [mx, mz] = f.to(hw - 0.3, z);
    P.nightLights.push(new THREE.Vector3(mx, d.top + 3.3, mz));
  }
  P.addMesh(lamps.build(), cx, d.top, cz, yaw, P.lampMat, { shadow: false });
  P.colliders.addDeck(cx, cz, hw + 0.1, len / 2, yaw, d.top);
  // the pilings, below the deck: the boat threads between them
  for (let i = 0; i <= bents; i++) {
    for (const side of [-1, 1]) {
      const [wx, wz] = f.to(side * (hw + 0.1), Math.min(len / 2 - 0.2, -len / 2 + i * 4));
      P.colliders.addBox(wx, wz, 0.25, 0.25, yaw, -50, d.top - 1.2);
    }
  }
  for (const side of [-1, 1]) {
    const [wx, wz] = f.to(side * (hw + 0.35), 0);
    // the rail stands 1.1 m; a glider just clearing it goes over
    P.colliders.addBox(wx, wz, 0.2, len / 2 - 1.5, yaw, d.top - 1, d.top + 2).glideTop = d.top + 1.15;
  }
  {
    const [shx, shz] = f.to(sx0, sz0);
    P.colliders.addBox(shx, shz, SW / 2 + 0.1, SD / 2 + 0.1, yaw, d.top - 1, d.top + SH + 0.6);
    const [kx, kz] = f.to(sx0 - 0.95, sz0 + SD / 2 + 0.4);
    P.colliders.addBox(kx, kz, 0.42, 0.27, yaw, d.top - 1, d.top + 0.6);
  }
  {
    const [tx, tz] = f.to(hw - 0.8, ez - 8);
    P.colliders.addBox(tx, tz, 0.95, 0.45, yaw, d.top - 1, d.top + 1.5);
    const [px, pz] = f.to(hw - 0.72, -len / 2 + 6.5);
    P.colliders.addBox(px, pz, 0.5, 0.95, yaw, d.top - 1, d.top + 1.0);
  }
  for (const bz of [-len / 2 + 22, -len / 2 + 46]) {
    const [wx, wz] = f.to(-hw + 0.45, bz);
    P.colliders.addBox(wx, wz, 0.22, 0.82, yaw, d.top - 1, d.top + 0.55);
  }
  const [sx, sz] = f.to(sx0, sz0 + SD / 2 + 0.07);
  P.addSign('Bait & Tackle', '', sx, d.top + 2.12, sz, yaw, 2.6, 0.55);

  // the fishing skiff moored alongside: a white hull with a blue sheer, a
  // cabin with its windows, rails, an outboard and the rods in their
  // holders
  const [bx, bz] = f.to(hw + 3.2, -len / 2 + 30);
  const boat = new ModelBuilder();
  boat.sphere(1, 14, 7, { pos: [0, 0.45, 0], scale: [1.5, 0.75, 4.2], color: 0xdedad0 });
  boat.box(2.6, 0.18, 6.4, { pos: [0, 0.9, -0.2], color: 0x2a4a6a });
  boat.box(2.3, 0.08, 5.6, { pos: [0, 1.0, -0.3], color: 0x9a8a70, surf: 'deck' });
  boat.box(1.6, 1.4, 1.8, { pos: [0, 1.7, 0.6], color: 0xdedad0 });
  boat.box(1.7, 0.1, 1.95, { pos: [0, 2.45, 0.55], color: 0x2a4a6a });
  boat.box(1.5, 0.55, 0.05, { pos: [0, 1.95, 1.52], color: 0x223344 });
  for (const sd of [-1, 1]) boat.box(0.05, 0.5, 1.4, { pos: [sd * 0.81, 1.95, 0.6], color: 0x223344 });
  boat.box(1.1, 0.8, 0.05, { pos: [0, 1.65, -0.32], color: 0x223344 });
  for (const sd of [-1, 1]) {
    boat.box(0.04, 0.04, 4.6, { pos: [sd * 1.12, 1.45, -0.2], color: 0xb8bcbe, jitter: 0 });
    for (let k = 0; k < 5; k++) boat.box(0.03, 0.45, 0.03, { pos: [sd * 1.12, 1.22, -2.4 + k * 1.1], color: 0xb8bcbe, jitter: 0 });
  }
  boat.box(0.5, 0.8, 0.45, { pos: [0, 1.25, -3.55], color: 0x1e1e1e });
  boat.box(0.12, 0.9, 0.18, { pos: [0, 0.6, -3.7], color: 0x2a2a2a });
  for (const sd of [-1, 1]) boat.beam([sd * 0.6, 2.5, 0.0], [sd * 1.4, 4.3, -1.2], 0.02, 4, { color: 0x1e1e1e, r2: 0.008 });
  boat.cyl(0.04, 0.04, 2.2, 5, { pos: [0, 3.5, 0.2], color: 0x222222 });
  boat.torus(0.22, 0.06, 6, 12, { pos: [0.83, 1.8, 0.1], rot: [0, Math.PI / 2, 0], color: 0xe8541e, jitter: 0 });
  const bm = P.addMesh(boat.build(), bx, -0.2, bz, yaw);
  bm.userData.bob = { y: -0.2, phase: 1.3 };
  P.bobbers = P.bobbers || [];
  P.bobbers.push(bm);
  // (its cabin's roof, for the paraglider)
  P.colliders.addCircle(bx, bz, 1.6).top = 2.3;
}

// ------------------------------------------------------------- lake docks
// A dock on the lake: plank lengths between pairs of posts, rim boards,
// cleats, a bench and a ladder at its end; and a rowboat tied alongside.
export function buildDock(P, p) {
  const Wd = P.world;
  const d = p.dock;
  const dx = d.x1 - d.x0;
  const dz = d.z1 - d.z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const f = frame(cx, cz, yaw);
  const rand = mulberry32(Math.round(len * 13));
  const hw = d.width / 2;
  const b = new ModelBuilder();
  const bays = Math.max(1, Math.floor(len / 3));
  for (let i = 0; i < bays; i++) {
    const z0 = -len / 2 + i * 3;
    const z1 = i === bays - 1 ? len / 2 : z0 + 3;
    const tone = new THREE.Color(WOOD_LIGHT).multiplyScalar(0.88 + rand() * 0.2).getHex();
    b.box(d.width, 0.08, z1 - z0 - 0.01, { pos: [0, -0.04, (z0 + z1) / 2], color: tone, surf: 'deck', jitter: 0.02 });
  }
  for (const side of [-1, 1]) b.box(len, 0.2, 0.15, { pos: [side * (hw - 0.08), -0.18, 0], rot: [0, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  for (let i = 0; i <= bays; i++) {
    const z = Math.min(len / 2 - 0.15, -len / 2 + i * 3);
    for (const side of [-1, 1]) {
      const [wx, wz] = f.to(side * (hw - 0.1), z);
      const g = Wd.heightAt(wx, wz);
      const h = d.top - g + 0.6;
      b.cyl(0.11, 0.12, h, 8, { pos: [side * (hw - 0.1), -h / 2 + 0.3, z], color: WOOD_DARK, surf: 'log' });
    }
    b.box(d.width + 0.2, 0.16, 0.18, { pos: [0, -0.3, z], color: WOOD_DARK, surf: 'plank' });
  }
  // cleats
  for (const t of [0.25, 0.75]) {
    for (const side of [-1, 1]) {
      const z = -len / 2 + len * t;
      b.box(0.07, 0.05, 0.28, { pos: [side * (hw - 0.12), 0.04, z], color: 0x2a2a2a, jitter: 0 });
      b.box(0.05, 0.07, 0.07, { pos: [side * (hw - 0.12), 0.02, z], color: 0x2a2a2a, jitter: 0 });
    }
  }
  // a bench at the end with its back to the shore, and a ladder into the lake
  b.box(1.5, 0.06, 0.4, { pos: [0, 0.45, len / 2 - 1.5], color: WOOD, surf: 'plank' });
  b.box(1.5, 0.36, 0.05, { pos: [0, 0.74, len / 2 - 1.72], rot: [-0.12, 0, 0], color: WOOD, surf: 'plank' });
  for (const lx of [-0.6, 0.6]) b.box(0.08, 0.45, 0.35, { pos: [lx, 0.22, len / 2 - 1.5], color: WOOD_DARK });
  {
    const lx = -hw + 0.45;
    for (const sx of [-0.22, 0.22]) b.box(0.05, 1.7, 0.05, { pos: [lx + sx, -0.15, len / 2 + 0.06], color: 0x9aa0a4, jitter: 0 });
    for (let k = 0; k < 5; k++) b.box(0.44, 0.035, 0.035, { pos: [lx, 0.25 - k * 0.3, len / 2 + 0.06], color: 0x9aa0a4, jitter: 0 });
  }
  P.addMesh(b.build(), cx, d.top, cz, yaw);
  P.colliders.addDeck(cx, cz, hw, len / 2, yaw, d.top);
  // too low to pass under: the boat moors alongside instead
  P.colliders.addBox(cx, cz, hw, len / 2, yaw, -50, d.top - 1.0);
  {
    const [x, z] = f.to(0, len / 2 - 1.55);
    P.colliders.addBox(x, z, 0.8, 0.28, yaw, d.top - 0.3, d.top + 0.95);
  }
  // the rowboat tied alongside
  const [bx, bz] = f.to(hw + 1.2, len / 2 - 5);
  const lvl = Wd.lakeById[p.water] ? Wd.lakeById[p.water].level : 0;
  buildRowboat(P, bx, lvl - 0.2, bz, yaw);
}

// An open rowboat: a hull with its inside, gunwales, two thwarts, the oars
// shipped along the seats. y is its waterline less 0.2 (it bobs from there).
export function buildRowboat(P, x, y, z, yaw) {
  const b = new ModelBuilder();
  const hull = () => new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull(), { pos: [0, 0.55, 0], scale: [0.75, 0.5, 2.0], color: 0x2c5a7a, jitter: 0.03 });
  // (mirrored: the inside faces in)
  b.add(hull(), { pos: [0, 0.56, 0], scale: [-0.71, 0.46, 1.95], color: 0x9aa8ae, jitter: 0.03 });
  b.torus(1, 0.035, 4, 24, { pos: [0, 0.57, 0], rot: [Math.PI / 2, 0, 0], scale: [0.74, 1.99, 1], color: 0x5a3a22, jitter: 0 });
  b.box(1.32, 0.05, 0.28, { pos: [0, 0.42, 0.35], color: WOOD_LIGHT, surf: 'plank' });
  b.box(1.0, 0.05, 0.28, { pos: [0, 0.4, -1.0], color: WOOD_LIGHT, surf: 'plank' });
  b.box(0.12, 0.04, 2.6, { pos: [0, 0.17, 0], color: 0x7a6248, surf: 'plank', surfSwap: true });
  for (const sd of [-1, 1]) {
    b.beam([sd * 0.3, 0.47, -1.15], [sd * 0.22, 0.47, 1.1], 0.022, 5, { color: WOOD_LIGHT });
    b.box(0.12, 0.02, 0.5, { pos: [sd * 0.21, 0.47, 1.25], rot: [0, -sd * 0.04, 0], color: WOOD_LIGHT });
    b.cyl(0.015, 0.015, 0.1, 4, { pos: [sd * 0.72, 0.62, 0.35], color: 0x888888, jitter: 0 });
  }
  const m = P.addMesh(b.build(), x, y, z, yaw);
  m.userData.bob = { y, phase: x * 0.1 };
  P.bobbers = P.bobbers || [];
  P.bobbers.push(m);
}

// Posts, braces and a railed deck shared by the Bear Falls platform and the
// tundra lookout: legs down to the ground with cross bracing on each face,
// a deck in planks with its rim, balusters round the sides named in rails.
function raisedDeck(P, f, b, top, { hx, hz, legs, rails, roofPosts = 0 }) {
  const Wd = P.world;
  b.box(hx * 2, 0.16, hz * 2, { pos: [0, -0.08, 0], color: WOOD, surf: 'deck', jitter: 0.02 });
  for (const sd of [1, -1]) {
    b.box(hx * 2 + 0.06, 0.24, 0.06, { pos: [0, -0.2, sd * (hz + 0.03)], color: WOOD_DARK, surf: 'plank' });
    b.box(hz * 2, 0.24, 0.06, { pos: [sd * (hx + 0.03), -0.2, 0], rot: [0, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  }
  const groundAt = (x, z) => Wd.heightAt(...f.to(x, z)) - top;
  for (const [x, z] of legs) {
    const g0 = groundAt(x, z) - 0.25;
    const h = -g0 + (roofPosts || 1.1);
    b.cyl(0.14, 0.16, h, 9, { pos: [x, g0 + h / 2, z], color: WOOD_DARK, surf: 'log' });
  }
  // X braces on each face between neighbouring legs, down to near the ground
  const n = legs.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = legs[i];
    const [bx, bz] = legs[(i + 1) % n];
    const low = Math.max(groundAt(ax, az), groundAt(bx, bz)) + 0.5;
    if (low > -0.8) continue;
    b.strut([ax, -0.35, az], [bx, low, bz], 0.07, 0.12, { color: WOOD_DARK });
    b.strut([bx, -0.35, bz], [ax, low, az], 0.07, 0.12, { color: WOOD_DARK });
    b.strut([ax, low, az], [bx, low, bz], 0.06, 0.1, { color: WOOD_DARK });
  }
  // railings with balusters
  for (const r of rails) {
    if (r === 'front') railX(b, -hx + 0.05, hx - 0.05, hz - 0.05, 0, { posts: false });
    if (r === 'back') railX(b, -hx + 0.05, hx - 0.05, -hz + 0.05, 0, { posts: false });
    if (r === 'left') railZ(b, -hz + 0.05, hz - 0.05, -hx + 0.05, 0, { posts: false });
    if (r === 'right') railZ(b, -hz + 0.05, hz - 0.05, hx - 0.05, 0, { posts: false });
    if (r === 'backL') railX(b, -hx + 0.05, -0.85, -hz + 0.05, 0, { posts: false });
    if (r === 'backR') railX(b, 0.85, hx - 0.05, -hz + 0.05, 0, { posts: false });
  }
}

// A ramp down from a deck's back edge (local z = z0, running toward -z) to
// the ground: planks with cleats, stringers and handrails. Returns its drop.
function rampDown(P, f, b, top, { z0, w, len }) {
  const Wd = P.world;
  const drop = top - Wd.heightAt(...f.to(0, z0 - len));
  const ang = Math.atan2(drop, len);
  const sl = Math.hypot(len, drop);
  const cy = -drop / 2;
  const cz = z0 - len / 2;
  b.box(w, 0.1, sl, { pos: [0, cy - 0.05, cz], rot: [-ang, 0, 0], color: WOOD, surf: 'deck' });
  for (const sd of [1, -1]) b.box(sl, 0.24, 0.06, { pos: [sd * (w / 2 + 0.03), cy - 0.12, cz], rot: [-ang, Math.PI / 2, 0], color: WOOD_DARK, surf: 'plank' });
  const cleats = Math.floor(sl / 0.4);
  for (let k = 1; k < cleats; k++) {
    const t = k / cleats;
    b.box(w - 0.1, 0.03, 0.05, { pos: [0, -drop * (1 - t) + 0.01, z0 - len * (1 - t)], color: WOOD_DARK, jitter: 0.04 });
  }
  for (const sd of [1, -1]) {
    const x = sd * (w / 2 + 0.08);
    b.strut([x, 0.95, z0], [x, -drop + 0.95, z0 - len], 0.06, 0.06, { color: WOOD_LIGHT, surf: 'plank', surfSwap: true });
    for (const t of [0.33, 0.66, 1.0]) b.box(0.08, 0.98, 0.08, { pos: [x, -drop * t + 0.47, z0 - len * t], color: WOOD_LIGHT });
  }
  return drop;
}

// ---------------------------------------------------- Bear Falls platform
export function buildFallsPlatform(P, c) {
  const Wd = P.world;
  const f = frame(c.x, c.z, c.yaw);
  const gr = groundRange(Wd, f, -3.2, 3.2, -2.2, 2.2);
  const top = gr.hi + 2.4;
  const b = new ModelBuilder();
  raisedDeck(P, f, b, top, {
    hx: 3.2,
    hz: 2.2,
    legs: [
      [-3, -2],
      [0, -2],
      [3, -2],
      [3, 2],
      [0, 2],
      [-3, 2],
    ],
    rails: ['front', 'left', 'right', 'backL', 'backR'],
  });
  // a bench at the back looking at the falls, and a sign at the rail
  b.box(1.8, 0.06, 0.42, { pos: [-1.9, 0.46, -1.6], color: WOOD_LIGHT, surf: 'plank' });
  b.box(1.8, 0.38, 0.05, { pos: [-1.9, 0.78, -1.82], rot: [-0.12, 0, 0], color: WOOD_LIGHT, surf: 'plank' });
  for (const lx of [-2.65, -1.15]) b.box(0.07, 0.46, 0.38, { pos: [lx, 0.23, -1.6], color: WOOD_DARK });
  for (const sx of [1.15, 2.55]) b.box(0.08, 1.25, 0.08, { pos: [sx, 0.62, 1.95], color: WOOD_DARK });
  const rampLen = 6.4;
  const rampDrop = rampDown(P, f, b, top, { z0: -2.2, w: 1.5, len: rampLen });
  P.addMesh(b.build(), c.x, top, c.z, c.yaw);
  {
    const [sx, sz] = f.to(1.85, 2.02);
    P.addSign('Bears fish here', 'Give them room · Stay on the platform', sx, top + 1.08, sz, c.yaw + Math.PI, 1.6, 0.55, { bg: '#2e4a2a', fg: '#ffe9a8' });
  }
  P.colliders.addDeck(c.x, c.z, 3.2, 2.2, c.yaw, top);
  const [rx, rz] = f.to(0, -2.2 - rampLen / 2);
  // sloped deck: height rises toward the platform (+z local)
  P.colliders.addDeck(rx, rz, 0.8, rampLen / 2, c.yaw, top - rampDrop / 2, { slope: rampDrop / rampLen });
  for (const side of [-1, 1]) {
    const [wx, wz] = f.to(side * 3.25, 0);
    P.colliders.addBox(wx, wz, 0.1, 2.2, c.yaw, top - 0.5, top + 1.2);
    const [bx, bz] = f.to(side * 2.05, -2.15);
    P.colliders.addBox(bx, bz, 1.15, 0.1, c.yaw, top - 0.5, top + 1.2);
  }
  const [wx, wz] = f.to(0, 2.25);
  P.colliders.addBox(wx, wz, 3.2, 0.1, c.yaw, top - 0.5, top + 1.2);
  {
    const [x, z] = f.to(-1.9, -1.65);
    P.colliders.addBox(x, z, 0.92, 0.25, c.yaw, top - 0.2, top + 1.0);
  }
  P.fallsPlatform = { x: c.x, z: c.z, top };
}

// ------------------------------------------------------ tundra lookout
export function buildLookout(P, c) {
  const Wd = P.world;
  const f = frame(c.x, c.z, c.yaw);
  const gr = groundRange(Wd, f, -2.5, 2.5, -2.5, 2.5);
  const top = gr.hi + 4.2;
  const b = new ModelBuilder();
  raisedDeck(P, f, b, top, {
    hx: 2.2,
    hz: 2.2,
    legs: [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ],
    rails: ['front', 'left', 'right', 'backL', 'backR'],
    // (up to the roof's underside over each corner, 0.5 m in from the eave)
    roofPosts: 2.16,
  });
  // the hip roof of shingles on its four posts, a cap on each hip and a
  // finial
  const R0 = 2.0;
  const eave = 2.5;
  const rise = 1.3;
  const lean = -(Math.PI / 2 - Math.atan2(rise, eave));
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Matrix4().makeRotationY((k * Math.PI) / 2);
    gable(b, eave * 2, Math.hypot(eave, rise), 0.07, { matrix: m, pos: [0, R0, eave], rot: [lean, 0, 0], color: SHINGLE, surf: 'shingle' });
    gable(b, eave * 2 - 0.1, Math.hypot(eave, rise) - 0.05, 0.04, { matrix: m, pos: [0, R0 - 0.06, eave - 0.03], rot: [lean, 0, 0], color: 0x8a6a48, surf: 'plank' });
    const cx = k === 0 || k === 3 ? 1 : -1;
    const cz = k < 2 ? 1 : -1;
    b.strut([cx * eave, R0 + 0.05, cz * eave], [0, R0 + rise + 0.05, 0], 0.08, 0.08, { color: 0x4a3a2c });
  }
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [2, 2],
    [-2, 2],
  ]) b.box(0.3, 0.12, 0.3, { pos: [x, R0 + 0.16, z], color: WOOD_DARK });
  b.cone(0.1, 0.4, 6, { pos: [0, R0 + rise + 0.25, 0], color: 0x2a2a2a });
  // a coin binocular viewer at the front rail, and a bench
  {
    const vx = 0.9;
    const vz = 1.6;
    b.cyl(0.05, 0.07, 1.1, 8, { pos: [vx, 0.55, vz], color: 0x3a6a5a });
    b.box(0.34, 0.2, 0.3, { pos: [vx, 1.2, vz], rot: [-0.15, 0, 0], color: 0x3a6a5a });
    for (const sx of [-0.08, 0.08]) {
      b.cyl(0.05, 0.05, 0.12, 8, { pos: [vx + sx, 1.24, vz + 0.19], rot: [Math.PI / 2 - 0.15, 0, 0], color: 0x1e1e1e });
      b.cyl(0.035, 0.035, 0.1, 8, { pos: [vx + sx, 1.2, vz - 0.19], rot: [Math.PI / 2 - 0.15, 0, 0], color: 0x1e1e1e });
    }
  }
  // (the bench clear of the top of the ramp)
  b.box(1.4, 0.06, 0.42, { pos: [-1.35, 0.46, -1.6], color: WOOD_LIGHT, surf: 'plank' });
  for (const lx of [-1.95, -0.75]) b.box(0.07, 0.46, 0.38, { pos: [lx, 0.23, -1.6], color: WOOD_DARK });
  const rampLen = 9;
  const rampDrop = rampDown(P, f, b, top, { z0: -2.2, w: 1.4, len: rampLen });
  P.addMesh(b.build(), c.x, top, c.z, c.yaw);
  P.colliders.addDeck(c.x, c.z, 2.2, 2.2, c.yaw, top);
  const [rx, rz] = f.to(0, -2.2 - rampLen / 2);
  P.colliders.addDeck(rx, rz, 0.75, rampLen / 2, c.yaw, top - rampDrop / 2, { slope: rampDrop / rampLen });
  for (const [x, z, hx, hz] of [
    [0, 2.15, 2.2, 0.1],
    [2.15, 0, 0.1, 2.2],
    [-2.15, 0, 0.1, 2.2],
    [-1.5, -2.15, 0.7, 0.1],
    [1.5, -2.15, 0.7, 0.1],
  ]) {
    const [wx, wz] = f.to(x, z);
    P.colliders.addBox(wx, wz, hx, hz, c.yaw, top - 0.5, top + 1.2);
  }
  for (const [x, z, hx, hz, h] of [
    [0.9, 1.6, 0.22, 0.22, 1.35],
    [-1.35, -1.6, 0.72, 0.25, 0.6],
  ]) {
    const [wx, wz] = f.to(x, z);
    P.colliders.addBox(wx, wz, hx, hz, c.yaw, top - 0.2, top + h);
  }
  // (its roof, for the paraglider: clear of a player standing on the deck)
  const [lx, lz] = f.to(0, 0);
  P.colliders.addBox(lx, lz, 2.5, 2.5, c.yaw, top + R0 + 0.02, top + R0 + rise + 0.3);
}

// ------------------------------------------------------------ sign posts
// Two peeled log posts for a painted board w wide, its top at y top, and a
// little shingled roof over it: the trailhead signs at every place.
export function signPosts(b, w, top) {
  const px = w / 2 - 0.25;
  for (const sx of [-px, px]) {
    b.cyl(0.085, 0.095, top + 0.42, 8, { pos: [sx, (top + 0.42) / 2 - 0.15, 0], color: 0x7a5a3a, surf: 'log' });
    b.cyl(0.08, 0.08, 0.012, 8, { pos: [sx, top + 0.28, 0], color: LOG_END, jitter: 0 });
  }
  b.box(w + 0.1, 0.1, 0.12, { pos: [0, top + 0.06, 0], color: WOOD_DARK, surf: 'plank' });
  const ra = 0.5;
  const rw = 0.36;
  for (const sd of [1, -1]) {
    b.box(w + 0.5, 0.05, rw, { pos: [0, top + 0.27 + Math.sin(ra) * 0.02, sd * Math.cos(ra) * (rw / 2 - 0.02)], rot: [sd * ra, 0, 0], color: SHINGLE, surf: 'shingle', surfScale: -sd * 0.7 });
  }
  b.box(w + 0.54, 0.05, 0.08, { pos: [0, top + 0.38, 0], color: 0x4a3a2c });
}
