// ModelBuilder: composes three.js primitives with transforms and vertex colours
// into one merged BufferGeometry (one draw call per model). Flat parts are
// shaded face by face; round parts (cylinders, spheres, tori and beams of six
// sides or more, cones of eight or more) keep their smooth normals unless a
// part says `smooth: false`. Colour varies a little: on a flat part one tone
// per face (a quad's two triangles share it), on a smooth part tone by tone
// across its surface, so neither splits along a diagonal.
// Optional per-part "limb" ids and pivots drive vertex-shader animation.
// A part with `surf` (a finish name from world/finish.js: 'plank', 'log',
// 'shingle' and so on) also carries that finish and its own surface
// coordinates in metres, worked out face by face in the part's own frame
// before it is placed: across and up a wall, across and along a floor or a
// roof (`surfSwap` turns them a quarter turn, `surfScale` scales them).
import * as THREE from 'three';
import { FINISH_ID } from '../world/finish.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

let seed = 12345;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const smooth01 = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// 0..1 from a position to the millimetre: the same for every triangle that
// meets at a vertex, so a smooth part's tone changes smoothly
function hashTone(x, y, z) {
  let h = Math.imul(Math.round(x * 1000) | 0, 73856093) ^ Math.imul(Math.round(y * 1000) | 0, 19349663) ^ Math.imul(Math.round(z * 1000) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

// Cylinders, spheres and tori of six sides or more and cones of eight or
// more are meant to look round: they keep their smooth normals. Fewer sides
// are meant as prisms (a square post, a five-sided far trunk).
function roundEnough(geo) {
  const q = geo.parameters;
  if (!q) return false;
  switch (geo.type) {
    case 'CylinderGeometry':
      return q.radialSegments >= 6;
    case 'ConeGeometry':
      return q.radialSegments >= 8;
    case 'SphereGeometry':
      return q.widthSegments >= 6;
    case 'TorusGeometry':
      return q.radialSegments >= 6;
    default:
      return false;
  }
}

// Two triangles in a row that share an edge and face the same way: the two
// halves of one quad
function sameQuad(p, a, b) {
  let shared = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const u = a + i * 3;
      const v = b + j * 3;
      if (Math.abs(p[u] - p[v]) < 1e-6 && Math.abs(p[u + 1] - p[v + 1]) < 1e-6 && Math.abs(p[u + 2] - p[v + 2]) < 1e-6) shared++;
    }
  }
  if (shared !== 2) return false;
  const n = (o) => {
    const e1x = p[o + 3] - p[o], e1y = p[o + 4] - p[o + 1], e1z = p[o + 5] - p[o + 2];
    const e2x = p[o + 6] - p[o], e2y = p[o + 7] - p[o + 1], e2z = p[o + 8] - p[o + 2];
    const x = e1y * e2z - e1z * e2y, y = e1z * e2x - e1x * e2z, z = e1x * e2y - e1y * e2x;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  const na = n(a);
  const nb = n(b);
  return na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] > 0.9995;
}

export class ModelBuilder {
  constructor({ limbs = false, uvs = false } = {}) {
    this.parts = [];
    this.limbs = limbs;
    this.uvs = uvs;
  }

  add(geo, o = {}) {
    // round parts and a whole model from another builder keep their normals
    // unless told not to
    if (o.smooth === undefined && (geo.userData.built || roundEnough(geo))) o = { ...o, smooth: true };
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    geo.dispose();
    _p.fromArray(o.pos || [0, 0, 0]);
    const r = o.rot || [0, 0, 0];
    _e.set(r[0], r[1], r[2], o.order || 'XYZ');
    _q.setFromEuler(_e);
    const sc = o.scale ?? 1;
    if (Array.isArray(sc)) _s.fromArray(sc);
    else _s.set(sc, sc, sc);
    _m.compose(_p, _q, _s);
    if (o.matrix) _m.premultiply(o.matrix);
    const local = o.surf ? g.attributes.position.array.slice() : null;
    g.applyMatrix4(_m);

    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    if (Array.isArray(o.color)) _c.setRGB(o.color[0], o.color[1], o.color[2]);
    else _c.set(o.color ?? 0xffffff);
    const jitter = o.jitter ?? 0.06;
    // a part that brings its own vertex colours keeps them (keepColors); a
    // part with a finish takes one tone all over (its finish is its
    // texture: a tone per triangle would split a wall corner to corner)
    const own = o.keepColors && g.attributes.color ? g.attributes.color.array : null;
    const whole = o.surf ? 1 + (rnd() - 0.5) * 2 * jitter : 0;
    const smooth = !!o.smooth;
    const pa = g.attributes.position.array;
    let quad = 0;
    for (let t = 0; t < count; t += 3) {
      // a flat part: one tone per face, shared by a quad's two halves
      let f = whole;
      if (!f && !smooth) {
        if (quad && t >= 3 && sameQuad(pa, (t - 3) * 3, t * 3)) {
          f = quad;
          quad = 0;
        } else {
          f = quad = 1 + (rnd() - 0.5) * 2 * jitter;
        }
      }
      for (let v = 0; v < 3 && t + v < count; v++) {
        const i = (t + v) * 3;
        // a smooth part: a tone per vertex position
        const k = f || 1 + (hashTone(pa[i], pa[i + 1], pa[i + 2]) - 0.5) * 2 * jitter;
        col[i] = (own ? own[i] : _c.r) * k;
        col[i + 1] = (own ? own[i + 1] : _c.g) * k;
        col[i + 2] = (own ? own[i + 2] : _c.b) * k;
      }
    }
    // optional vertical gradient (darker at the bottom), useful for foliage
    if (o.gradient) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const pos = g.attributes.position.array;
      const h = Math.max(1e-4, bb.max.y - bb.min.y);
      for (let i = 0; i < count; i++) {
        const t = (pos[i * 3 + 1] - bb.min.y) / h;
        const f = 1 - o.gradient * (1 - t);
        col[i * 3] *= f;
        col[i * 3 + 1] *= f;
        col[i * 3 + 2] *= f;
      }
    }
    // countershading, as on most animals: a lighter belly blending in below a
    // part's `belly` height ([colour, height 0..1, softness]), a darker (or,
    // above 1, a lighter grizzled) back toward its top (`back`), and an
    // `under` colour for faces looking down (a bird's pale wing undersides)
    if (o.belly || o.back) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const pos = g.attributes.position.array;
      const h = Math.max(1e-4, bb.max.y - bb.min.y);
      const bc = o.belly ? new THREE.Color(o.belly[0]) : null;
      for (let i = 0; i < count; i++) {
        const t = (pos[i * 3 + 1] - bb.min.y) / h;
        let r = col[i * 3];
        let gg = col[i * 3 + 1];
        let bl = col[i * 3 + 2];
        if (bc) {
          const below = o.belly[1] ?? 0.35;
          const soft = o.belly[2] ?? 0.12;
          const f = 1 - smooth01((t - below + soft) / (2 * soft));
          // the belly keeps the part's own small tone variation
          const tone = (r + gg + bl) / Math.max(1e-4, _c.r + _c.g + _c.b);
          r += (bc.r * tone - r) * f;
          gg += (bc.g * tone - gg) * f;
          bl += (bc.b * tone - bl) * f;
        }
        if (o.back) {
          const f = 1 + (o.back - 1) * smooth01((t - 0.55) / 0.45);
          r *= f;
          gg *= f;
          bl *= f;
        }
        col[i * 3] = r;
        col[i * 3 + 1] = gg;
        col[i * 3 + 2] = bl;
      }
    }
    if (o.under) {
      const uc = new THREE.Color(o.under);
      const pos = g.attributes.position.array;
      for (let t = 0; t + 2 < count; t += 3) {
        const a = t * 3;
        const e1x = pos[a + 3] - pos[a], e1y = pos[a + 4] - pos[a + 1], e1z = pos[a + 5] - pos[a + 2];
        const e2x = pos[a + 6] - pos[a], e2y = pos[a + 7] - pos[a + 1], e2z = pos[a + 8] - pos[a + 2];
        const ny = e1z * e2x - e1x * e2z;
        const l = Math.hypot(e1y * e2z - e1z * e2y, ny, e1x * e2y - e1y * e2x) || 1;
        if (ny / l > -0.5) continue;
        for (let v = 0; v < 3; v++) {
          const i = (t + v) * 3;
          const tone = (col[i] + col[i + 1] + col[i + 2]) / Math.max(1e-4, _c.r + _c.g + _c.b);
          col[i] = uc.r * tone;
          col[i + 1] = uc.g * tone;
          col[i + 2] = uc.b * tone;
        }
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.limbs) {
      const limb = new Float32Array(count).fill(o.limb || 0);
      const piv = new Float32Array(count * 3);
      const pv = o.pivot || [0, 0, 0];
      for (let i = 0; i < count; i++) {
        piv[i * 3] = pv[0];
        piv[i * 3 + 1] = pv[1];
        piv[i * 3 + 2] = pv[2];
      }
      g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 1));
      g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    }
    if (this.uvs && !g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (o.surf) {
      const id = FINISH_ID[o.surf];
      if (!id) throw new Error('unknown finish ' + o.surf);
      g.userData.surf = id;
      g.userData.surfUv = this.surfCoords(local, count, o);
    } else if (g.attributes.surf) {
      // a part built by another builder brings its finishes vertex by vertex
      g.userData.surfArr = g.attributes.surf.array;
      g.userData.surfUv = g.attributes.surfUv.array;
    }
    // mark whether this part keeps its normals (round parts, and a whole
    // model from another builder, whose flat parts are flat already)
    g.userData.smooth = smooth;
    // foliage lit as one soft volume rather than facet by facet (see build)
    g.userData.volume = o.volume || null;
    this.parts.push(g);
    return this;
  }

  // Surface coordinates for a part's finish, face by face from its own
  // frame: a face looking up or down takes x and z, one looking along x
  // takes z and y, the rest x and y.
  surfCoords(p, count, o) {
    const uv = new Float32Array(count * 2);
    const k = o.surfScale ?? 1;
    const ou = o.surfOffset ? o.surfOffset[0] : 0;
    const ov = o.surfOffset ? o.surfOffset[1] : 0;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = t * 3;
      const e1x = p[a + 3] - p[a];
      const e1y = p[a + 4] - p[a + 1];
      const e1z = p[a + 5] - p[a + 2];
      const e2x = p[a + 6] - p[a];
      const e2y = p[a + 7] - p[a + 1];
      const e2z = p[a + 8] - p[a + 2];
      const nx = Math.abs(e1y * e2z - e1z * e2y);
      const ny = Math.abs(e1z * e2x - e1x * e2z);
      const nz = Math.abs(e1x * e2y - e1y * e2x);
      for (let v = 0; v < 3; v++) {
        const i = a + v * 3;
        let su;
        let sv;
        if (ny >= nx && ny >= nz) {
          su = p[i];
          sv = p[i + 2];
        } else if (nx >= nz) {
          su = p[i + 2];
          sv = p[i + 1];
        } else {
          su = p[i];
          sv = p[i + 1];
        }
        if (o.surfSwap) [su, sv] = [sv, su];
        uv[(t + v) * 2] = (su + ou) * k;
        uv[(t + v) * 2 + 1] = (sv + ov) * k;
      }
    }
    return uv;
  }

  box(w, h, d, o) {
    return this.add(new THREE.BoxGeometry(w, h, d), o);
  }
  cyl(rTop, rBot, h, seg, o = {}) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, o.hseg || 1, !!o.open), o);
  }
  cone(r, h, seg, o) {
    return this.add(new THREE.ConeGeometry(r, h, seg), o);
  }
  sphere(r, ws, hs, o) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), o);
  }
  ico(r, detail, o) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), o);
  }
  dodeca(r, o) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), o);
  }
  torus(R, r, rs, ts, o = {}) {
    return this.add(new THREE.TorusGeometry(R, r, rs, ts, o.arc ?? Math.PI * 2), o);
  }
  lathe(points, seg, o) {
    return this.add(new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), seg), o);
  }
  // Cylinder between two points
  beam(a, b, r, seg, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(o.r2 ?? r, r, len, seg, 1, false);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, { ...o, pos: [0, 0, 0], rot: [0, 0, 0], matrix: m });
  }
  // Box between two points (e.g. truss members, planks)
  strut(a, b, w, h, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(w, len, h);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, { ...o, pos: [0, 0, 0], rot: [0, 0, 0], matrix: m });
  }

  build({ flat = true } = {}) {
    let total = 0;
    for (const p of this.parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const limb = this.limbs ? new Float32Array(total) : null;
    const piv = this.limbs ? new Float32Array(total * 3) : null;
    const uv = this.uvs ? new Float32Array(total * 2) : null;
    const anySurf = this.parts.some((p) => p.userData.surf || p.userData.surfArr);
    const surf = anySurf ? new Float32Array(total) : null;
    const surfUv = anySurf ? new Float32Array(total * 2) : null;
    let o = 0;
    for (const p of this.parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      if (p.attributes.normal && (!flat || p.userData.smooth) && !p.userData.volume) nrm.set(p.attributes.normal.array, o * 3);
      else computeFlatNormals(p.attributes.position.array, nrm, o * 3, n);
      if (p.userData.volume) volumeNormals(p.attributes.position.array, nrm, o * 3, n, p.userData.volume);
      if (limb) {
        limb.set(p.attributes.aLimb.array, o);
        piv.set(p.attributes.aPivot.array, o * 3);
      }
      if (uv && p.attributes.uv) uv.set(p.attributes.uv.array.subarray(0, n * 2), o * 2);
      if (surf && p.userData.surf) {
        surf.fill(p.userData.surf, o, o + n);
        surfUv.set(p.userData.surfUv, o * 2);
      } else if (surf && p.userData.surfArr) {
        surf.set(p.userData.surfArr, o);
        surfUv.set(p.userData.surfUv, o * 2);
      }
      o += n;
      p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (limb) {
      g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 1));
      g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    }
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (surf) {
      g.setAttribute('surf', new THREE.BufferAttribute(surf, 1));
      g.setAttribute('surfUv', new THREE.BufferAttribute(surfUv, 2));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.built = true;
    this.parts = [];
    return g;
  }
}

// Foliage normals that make a crown light as one soft volume, as a real
// crown of many small leaves does, instead of as a few big facets: a conifer
// faces out from its trunk and a little up (`axis` [x, z], `up`), a leafy
// crown out from its centre (`centre` [x, y, z]), keeping `k` of each
// facet's own direction. Every distance version of a tree gets the same, so
// it does not change its lighting as it is swapped for a nearer one.
function volumeNormals(src, dst, off, count, v) {
  const k = v.k ?? 0;
  for (let i = 0; i < count; i++) {
    const a = i * 3;
    let x;
    let y;
    let z;
    if (v.axis) {
      const dx = src[a] - v.axis[0];
      const dz = src[a + 2] - v.axis[1];
      const l = Math.hypot(dx, dz);
      x = l > 1e-4 ? dx / l : 0;
      y = v.up ?? 0.75;
      z = l > 1e-4 ? dz / l : 0;
    } else {
      x = src[a] - v.centre[0];
      y = (src[a + 1] - v.centre[1]) * (v.squash ?? 1);
      z = src[a + 2] - v.centre[2];
    }
    let l = Math.hypot(x, y, z) || 1;
    x = x / l + dst[off + a] * k;
    y = y / l + dst[off + a + 1] * k;
    z = z / l + dst[off + a + 2] * k;
    l = Math.hypot(x, y, z) || 1;
    dst[off + a] = x / l;
    dst[off + a + 1] = y / l;
    dst[off + a + 2] = z / l;
  }
}

function computeFlatNormals(src, dst, off, count) {
  for (let i = 0; i < count; i += 3) {
    const a = i * 3;
    const ax = src[a];
    const ay = src[a + 1];
    const az = src[a + 2];
    const e1x = src[a + 3] - ax;
    const e1y = src[a + 4] - ay;
    const e1z = src[a + 5] - az;
    const e2x = src[a + 6] - ax;
    const e2y = src[a + 7] - ay;
    const e2z = src[a + 8] - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (let v = 0; v < 3; v++) {
      dst[off + a + v * 3] = nx;
      dst[off + a + v * 3 + 1] = ny;
      dst[off + a + v * 3 + 2] = nz;
    }
  }
}

// Smooth normals across the seams of an indexed geometry: a lathe, loft or
// cylinder repeats its first column of vertices at the end, and normals
// computed from the faces then crease along that line. Vertices at one
// position average their normals when these are within the given angle
// (cosine), so a real edge, like a cylinder's rim, stays sharp.
export function smoothSeams(geo, cosLimit = 0.5) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  if (!nrm) return geo;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const i of g) {
      v.fromBufferAttribute(nrm, i);
      sum.set(0, 0, 0);
      for (const j of g) {
        w.fromBufferAttribute(nrm, j);
        if (v.dot(w) >= cosLimit) sum.add(w);
      }
      sum.normalize();
      out.push(i, sum.x, sum.y, sum.z);
    }
  }
  for (let k = 0; k < out.length; k += 4) nrm.setXYZ(out[k], out[k + 1], out[k + 2], out[k + 3]);
  nrm.needsUpdate = true;
  return geo;
}

// Randomly displaces vertices of an indexed geometry (before toNonIndexed) for organic shapes.
// Its normals follow the new shape (a smooth part uses them; a flat one is
// shaded face by face anyway).
export function jitterGeometry(geo, amount, rand = Math.random) {
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) {
      d = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount];
      map.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  if (geo.index) {
    geo.computeVertexNormals();
    smoothSeams(geo);
  }
  return geo;
}
