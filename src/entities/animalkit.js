// Organic shapes for the animals and birds: bodies, necks, heads, legs,
// tails, antlers and wings lofted from cross-sections along a spine, with
// smooth normals shared between neighbouring faces. The result is one
// indexed geometry per model (a vertex is drawn once however many faces
// meet at it), carrying the same limb ids and pivots as ModelBuilder's, so
// animatedMaterial moves its legs, head, tail and wings as before.
//
// A loft's ring is a superellipse across the spine: `r: [half-width,
// half-height above, half-height below]` (a number for a round section),
// `e` its squareness (2 an ellipse, more a rounded box, less a diamond).
// Rings are framed by parallel transport along the spine, so a curving
// neck or a tail does not twist. Ends close with a rounded cap, a point
// or nothing.
import * as THREE from 'three';

const smooth01 = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// 0..1 from a position: the same at a vertex for every face that meets
// there, so a colour varies smoothly over a surface
function hashTone(x, y, z) {
  let h = Math.imul(Math.round(x * 1000) | 0, 73856093) ^ Math.imul(Math.round(y * 1000) | 0, 19349663) ^ Math.imul(Math.round(z * 1000) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

// smooth value noise in 3D (cheap, for coat patterns made at load time)
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => hashTone(a * 0.37, b * 0.37, c * 0.37);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
export const noise3 = vnoise;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export { rgb as toRgb, smooth01 };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// The detail models are built at: 1 for animals near the camera; less
// inside lowDetail, for a herd seen from far off, where fewer points round
// each ring and fewer rings make the same shape, markings and limbs from
// about a third of the triangles
let DETAIL = 1;
export function lowDetail(build) {
  const d = DETAIL;
  DETAIL = 0.5;
  try {
    return build();
  } finally {
    DETAIL = d;
  }
}
const segs = (n) => (DETAIL === 1 ? n : Math.max(4, 2 * Math.round((n * DETAIL) / 2)));

export class OrganicBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.limb = [];
    this.piv = [];
    this.idx = [];
  }

  // Append one part: positions (flat), triangle indices into them, a
  // colour per vertex (flat), and o.limb / o.pivot. Normals are worked out
  // from the part's own faces (smooth across them), then o.colorFn(p, n,
  // base) may change each vertex's colour (markings, pale undersides).
  part(P, I, C, o = {}) {
    const n = P.length / 3;
    const base = this.pos.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const N = g.attributes.normal.array;
    const jitter = o.jitter ?? 0.05;
    const pv = o.pivot || [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let c = [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]];
      if (o.colorFn) c = o.colorFn([x, y, z], [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], c);
      const k = 1 + (hashTone(x, y, z) - 0.5) * 2 * jitter;
      this.pos.push(x, y, z);
      this.nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      this.col.push(c[0] * k, c[1] * k, c[2] * k);
      this.limb.push(o.limb || 0);
      this.piv.push(pv[0], pv[1], pv[2]);
    }
    for (const t of I) this.idx.push(base + t);
    g.dispose();
    return this;
  }

  // A lofted shape along rings ({ c: centre, r, e, col }); see the top.
  // o.seg: points round a ring; o.cap0 / o.cap1: 'round' (the default),
  // 'point', 'flat' or 'open'; o.capLen0 / o.capLen1 how far a cap stands
  // out (default: the ring's half-width); o.up: the spine's up for the
  // first ring; o.matrix: placed by it before its normals are worked out.
  loft(rings, o = {}) {
    const seg = segs(o.seg ?? 12);
    // rounded caps: two more rings closing in like a dome (one in low detail)
    const rs = rings.map((r) => ({ ...r }));
    const cap0 = o.cap0 ?? 'round';
    const cap1 = o.cap1 ?? 'round';
    const C = rs.map((r) => V(r.c));
    const tang = (i) => {
      const a = C[Math.max(0, i - 1)];
      const b = C[Math.min(C.length - 1, i + 1)];
      return b.clone().sub(a).normalize();
    };
    // frames by parallel transport
    const T = [], R = [], U = [];
    let up = V(o.up || [0, 1, 0]);
    for (let i = 0; i < rs.length; i++) {
      const t = tang(i);
      let r;
      if (i === 0) {
        r = new THREE.Vector3().crossVectors(up, t);
        if (r.lengthSq() < 1e-8) r = new THREE.Vector3().crossVectors(V([0, 0, 1]), t);
        if (r.lengthSq() < 1e-8) r = new THREE.Vector3().crossVectors(V([1, 0, 0]), t);
        r.normalize();
      } else {
        const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], t);
        r = R[i - 1].clone().applyQuaternion(q).normalize();
        // keep it square to the new tangent
        r.addScaledVector(t, -r.dot(t)).normalize();
      }
      T.push(t);
      R.push(r);
      U.push(new THREE.Vector3().crossVectors(t, r).normalize());
    }
    const half = (r) => (Array.isArray(r) ? [r[0], r[1], r[2] ?? r[1]] : [r, r, r]);
    const P = [], I = [], CC = [];
    const ringAt = (c, t, rr, uu, rad, e, col, rot) => {
      const [rx, ryT, ryB] = half(rad);
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2 + rot;
        const cs = Math.cos(th), sn = Math.sin(th);
        const fx = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / e);
        const fy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
        const x = fx * rx, y = fy * (sn >= 0 ? ryT : ryB);
        P.push(c.x + rr.x * x + uu.x * y, c.y + rr.y * x + uu.y * y, c.z + rr.z * x + uu.z * y);
        CC.push(col[0], col[1], col[2]);
      }
    };
    const baseCol = rgb(o.color ?? 0xffffff);
    const ringCol = (r) => (r.col !== undefined ? rgb(r.col) : baseCol);
    const rot = o.rot0 ?? 0;
    // the rings, with dome rings before the first and after the last
    const list = [];
    const domeRings = (i, dir, kind, len) => {
      const r = rs[i];
      const [rx, ryT, ryB] = half(r.r);
      const L = len ?? Math.max(rx, (ryT + ryB) / 2) * 0.9;
      if (kind !== 'round') return [];
      const out = [];
      for (const a of DETAIL === 1 ? [0.55, 0.85] : [0.7]) {
        const s = Math.cos((a * Math.PI) / 2);
        out.push({ c: C[i].clone().addScaledVector(T[i], dir * L * Math.sin((a * Math.PI) / 2)), t: T[i], r: R[i], u: U[i], rad: [rx * s, ryT * s, ryB * s], e: r.e ?? 2, col: ringCol(r) });
      }
      return dir < 0 ? out.reverse() : out;
    };
    list.push(...domeRings(0, -1, cap0, o.capLen0));
    for (let i = 0; i < rs.length; i++) list.push({ c: C[i], t: T[i], r: R[i], u: U[i], rad: rs[i].r, e: rs[i].e ?? 2, col: ringCol(rs[i]) });
    list.push(...domeRings(rs.length - 1, 1, cap1, o.capLen1));
    for (const L of list) ringAt(L.c, L.t, L.r, L.u, L.rad, L.e, L.col, rot);
    const nR = list.length;
    for (let i = 0; i < nR - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = (i + 1) * seg + k, d = (i + 1) * seg + ((k + 1) % seg);
        I.push(a, b, c, b, d, c);
      }
    }
    // the tips
    const tip = (i, dir, kind, len) => {
      if (kind === 'open') return;
      const L0 = list[i];
      const r = half(L0.rad);
      const out = kind === 'flat' ? 0 : kind === 'round' ? Math.max(r[0], (r[1] + r[2]) / 2) * 0.12 : len ?? Math.max(r[0], (r[1] + r[2]) / 2);
      const p = L0.c.clone().addScaledVector(L0.t, dir * out);
      const ti = P.length / 3;
      P.push(p.x, p.y, p.z);
      CC.push(L0.col[0], L0.col[1], L0.col[2]);
      for (let k = 0; k < seg; k++) {
        const a = i * seg + k, b = i * seg + ((k + 1) % seg);
        if (dir < 0) I.push(ti, b, a);
        else I.push(ti, a, b);
      }
    };
    tip(0, -1, cap0, o.capLen0);
    tip(nR - 1, 1, cap1, o.capLen1);
    if (o.matrix) {
      const v = new THREE.Vector3();
      for (let i = 0; i < P.length; i += 3) {
        v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(o.matrix);
        P[i] = v.x;
        P[i + 1] = v.y;
        P[i + 2] = v.z;
      }
      if (o.matrix.determinant() < 0) for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
    }
    return this.part(P, I, CC, o);
  }

  // A tube along points with a radius at each (a number or [w, hTop,
  // hBottom]); `sub` extra rings between points on a smooth curve through
  // them (Catmull-Rom), so legs, tails, necks and antler tines bend
  // smoothly.
  tube(points, radii, o = {}) {
    const sub = DETAIL === 1 ? o.sub ?? 0 : 0;
    const pts = points.map(V);
    const rad = (i) => (Array.isArray(radii) ? radii[i] : radii);
    const cols = o.cols;
    const rings = [];
    const lerpR = (a, b, t) => {
      if (Array.isArray(a) || Array.isArray(b)) {
        const A = Array.isArray(a) ? a : [a, a, a];
        const B = Array.isArray(b) ? b : [b, b, b];
        return [A[0] + (B[0] - A[0]) * t, (A[1] ?? A[0]) + ((B[1] ?? B[0]) - (A[1] ?? A[0])) * t, (A[2] ?? A[1] ?? A[0]) + ((B[2] ?? B[1] ?? B[0]) - (A[2] ?? A[1] ?? A[0])) * t];
      }
      return a + (b - a) * t;
    };
    for (let i = 0; i < pts.length; i++) {
      rings.push({ c: [pts[i].x, pts[i].y, pts[i].z], r: rad(i), e: o.e, col: cols ? cols[i] : undefined });
      if (i < pts.length - 1 && sub > 0) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let s = 1; s <= sub; s++) {
          const t = s / (sub + 1);
          const t2 = t * t, t3 = t2 * t;
          const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          const cc = cols ? mixRgb(rgb(cols[i]), rgb(cols[i + 1]), t) : undefined;
          rings.push({ c: [f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z)], r: lerpR(rad(i), rad(i + 1), t), e: o.e, col: cc });
        }
      }
    }
    return this.loft(rings, o);
  }

  // An ellipsoid: centre, half-sizes [x, y, z], o.rot (Euler) and o.rings
  // along its z.
  ellipsoid(c, r, o = {}) {
    const m = DETAIL === 1 ? o.rings ?? 6 : Math.max(3, Math.round((o.rings ?? 6) * 0.6));
    const rings = [];
    for (let i = 1; i < m; i++) {
      const a = -Math.PI / 2 + (i / m) * Math.PI;
      const s = Math.cos(a);
      rings.push({ c: [0, 0, Math.sin(a) * r[2]], r: [r[0] * s, r[1] * s, r[1] * s] });
    }
    const M = new THREE.Matrix4().compose(V(c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))), V([1, 1, 1]));
    // from the last ring to the pole
    const len = r[2] * (1 - Math.cos(Math.PI / m));
    return this.loft(rings, { seg: o.seg ?? 10, ...o, cap0: 'point', cap1: 'point', capLen0: len, capLen1: len, matrix: M });
  }

  // A thin plate shaped by an outline in its own x (along) and z (across)
  // and a thickness, bent by o.matrix: ears, fins, flukes, a beaver's tail.
  plate(outline, thick, o = {}) {
    const rings = outline.map(([x, w, zc = 0]) => ({ c: [x, 0, zc], r: [w, thick, thick], e: o.e ?? 2.4 }));
    return this.loft(rings, { seg: o.seg ?? 8, up: [0, 1, 0], cap0: 'point', cap1: 'point', capLen0: thick, capLen1: thick, ...o });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLimb', new THREE.Float32BufferAttribute(this.limb, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.built = true;
    return g;
  }
}

// Shading helpers for colorFn: a pale belly blending in below `y0..y1`, a
// darker back above `b0..b1`, colours by height or by the way a face looks.
export function countershade(base, belly, y0, y1, back = 1, b0 = 1e9, b1 = 1e9) {
  const B = rgb(base);
  const L = belly != null ? rgb(belly) : null;
  return (p, n, c) => {
    let out = c;
    const tone = (c[0] + c[1] + c[2]) / Math.max(1e-4, B[0] + B[1] + B[2]);
    if (L) out = mixRgb(out, [L[0] * tone, L[1] * tone, L[2] * tone], 1 - smooth01((p[1] - y0) / Math.max(1e-4, y1 - y0)));
    if (back !== 1) {
      const f = 1 + (back - 1) * smooth01((p[1] - b0) / Math.max(1e-4, b1 - b0));
      out = [out[0] * f, out[1] * f, out[2] * f];
    }
    return out;
  };
}

// Several colour functions one after another
export function chain(...fns) {
  return (p, n, c) => fns.reduce((acc, f) => (f ? f(p, n, acc) : acc), c);
}
