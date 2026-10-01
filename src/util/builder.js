// ModelBuilder: composes three.js primitives with transforms and vertex colours
// into one merged, flat-shaded BufferGeometry (one draw call per model).
// Optional per-part "limb" ids and pivots drive vertex-shader animation.
import * as THREE from 'three';

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

export class ModelBuilder {
  constructor({ limbs = false, uvs = false } = {}) {
    this.parts = [];
    this.limbs = limbs;
    this.uvs = uvs;
  }

  add(geo, o = {}) {
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
    g.applyMatrix4(_m);

    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    if (Array.isArray(o.color)) _c.setRGB(o.color[0], o.color[1], o.color[2]);
    else _c.set(o.color ?? 0xffffff);
    const jitter = o.jitter ?? 0.06;
    // a part that brings its own vertex colours keeps them (keepColors)
    const own = o.keepColors && g.attributes.color ? g.attributes.color.array : null;
    for (let t = 0; t < count; t += 3) {
      const f = 1 + (rnd() - 0.5) * 2 * jitter;
      for (let v = 0; v < 3 && t + v < count; v++) {
        const i = (t + v) * 3;
        col[i] = (own ? own[i] : _c.r) * f;
        col[i + 1] = (own ? own[i + 1] : _c.g) * f;
        col[i + 2] = (own ? own[i + 2] : _c.b) * f;
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
    // mark whether this part keeps smooth normals
    g.userData.smooth = !!o.smooth;
    this.parts.push(g);
    return this;
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
    let o = 0;
    for (const p of this.parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      if (p.attributes.normal && (!flat || p.userData.smooth)) nrm.set(p.attributes.normal.array, o * 3);
      else computeFlatNormals(p.attributes.position.array, nrm, o * 3, n);
      if (limb) {
        limb.set(p.attributes.aLimb.array, o);
        piv.set(p.attributes.aPivot.array, o * 3);
      }
      if (uv && p.attributes.uv) uv.set(p.attributes.uv.array.subarray(0, n * 2), o * 2);
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
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.parts = [];
    return g;
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

// Randomly displaces vertices of an indexed geometry (before toNonIndexed) for organic shapes.
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
  return geo;
}
