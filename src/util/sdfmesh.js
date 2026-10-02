// Sculpting with distance fields: a shape is a function giving, for any
// point, its distance to the surface (negative inside). Simple shapes
// (balls, eggs, tapered tubes, rounded boxes) join with a smooth minimum,
// so an arm grows out of a shoulder the way it does in clay, and the result
// is turned into triangles by surface nets: one vertex in each little cube
// of a grid that the surface passes through, joined into quads, with
// normals from the field's own slope. Used for the bronze statue of Tesla
// and the visitor from the sky.
//
// Every shape carries a bounding ball (fn.b = [x, y, z, r]), so a join can
// skip the shapes that are too far away to change the answer, and the
// mesher samples finely only near the surface: that keeps a figure of
// fifty shapes to a few hundred milliseconds.
import * as THREE from 'three';

const withBall = (fn, b) => {
  fn.b = b;
  return fn;
};

// ------------------------------------------------------------ primitives
export function sphere(cx, cy, cz, r) {
  return withBall((x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r, [cx, cy, cz, r]);
}

// An egg: a sphere stretched to radii rx, ry, rz (a close estimate of the
// distance, good for meshing).
export function ellipsoid(cx, cy, cz, rx, ry, rz) {
  const ix = 1 / rx;
  const iy = 1 / ry;
  const iz = 1 / rz;
  return withBall(
    (x, y, z) => {
      const px = (x - cx) * ix;
      const py = (y - cy) * iy;
      const pz = (z - cz) * iz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(px * px * ix * ix + py * py * iy * iy + pz * pz * iz * iz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    },
    [cx, cy, cz, Math.max(rx, ry, rz)]
  );
}

// A tube from a to b whose radius runs from ra to rb, rounded at both ends.
export function cone(a, b, ra, rb) {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return withBall(
    (x, y, z) => {
      const pax = x - a[0];
      const pay = y - a[1];
      const paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy;
      const qy = pay * l2 - bay * yy;
      const qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    },
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.sqrt(l2) / 2 + Math.max(ra, rb)]
  );
}

// A box of half sizes hx, hy, hz with its edges rounded by r.
export function roundBox(cx, cy, cz, hx, hy, hz, r) {
  return withBall(
    (x, y, z) => {
      const qx = Math.abs(x - cx) - hx + r;
      const qy = Math.abs(y - cy) - hy + r;
      const qz = Math.abs(z - cz) - hz + r;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    [cx, cy, cz, Math.hypot(hx, hy, hz)]
  );
}

// A ring in the plane across y: radius R, thickness r.
export function torus(cx, cy, cz, R, r) {
  return withBall((x, y, z) => Math.hypot(Math.hypot(x - cx, z - cz) - R, y - cy) - r, [cx, cy, cz, R + r]);
}

// A shape placed by a matrix (turning and moving only): the point is taken
// back into the shape's own frame.
export function placed(fn, matrix) {
  const inv = new THREE.Matrix4().copy(matrix).invert();
  const e = inv.elements;
  const out = (x, y, z) => fn(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
  if (fn.b) {
    const c = new THREE.Vector3(fn.b[0], fn.b[1], fn.b[2]).applyMatrix4(matrix);
    out.b = [c.x, c.y, c.z, fn.b[3]];
  }
  return out;
}

// A frame at a point, turned by Euler angles (radians, 'XYZ').
export function frameAt(pos, rot = [0, 0, 0], order = 'XYZ') {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)), new THREE.Vector3(1, 1, 1));
}

// ------------------------------------------------------------ combining
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

function ballOf(fns) {
  const bs = fns.map((f) => f.b).filter(Boolean);
  if (bs.length !== fns.length || !bs.length) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const b of bs) {
    cx += b[0];
    cy += b[1];
    cz += b[2];
  }
  cx /= bs.length;
  cy /= bs.length;
  cz /= bs.length;
  let r = 0;
  for (const b of bs) r = Math.max(r, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3]);
  return [cx, cy, cz, r];
}

// Join shapes: [fn, k] pairs, each blended into what came before with its
// own softness k (0 for a hard join). A shape whose bounding ball is
// further than the answer so far plus its softness cannot change it, and
// is skipped.
export function blend(parts) {
  const fns = parts.map((p) => p[0]);
  const ks = parts.map((p) => p[1]);
  const balls = fns.map((f) => f.b || null);
  const n = parts.length;
  const out = (x, y, z) => {
    let d = fns[0](x, y, z);
    for (let i = 1; i < n; i++) {
      const b = balls[i];
      const k = ks[i];
      if (b) {
        const dx = x - b[0];
        const dy = y - b[1];
        const dz = z - b[2];
        const lim = d + k + b[3];
        if (lim > 0 && dx * dx + dy * dy + dz * dz >= lim * lim) continue;
      }
      d = smin(d, fns[i](x, y, z), k);
    }
    return d;
  };
  out.b = ballOf(fns);
  return out;
}

// Carve shapes out: each [fn, k] is taken away with softness k.
export function carve(base, cuts) {
  const out = (x, y, z) => {
    let d = base(x, y, z);
    for (const [fn, k] of cuts) {
      const b = fn.b;
      if (b) {
        // a cut further away than the surface plus its softness changes nothing
        const lim = -d + k + b[3];
        const dx = x - b[0];
        const dy = y - b[1];
        const dz = z - b[2];
        if (lim > 0 && dx * dx + dy * dy + dz * dz >= lim * lim) continue;
        if (lim <= 0) continue;
      }
      d = smax(d, -fn(x, y, z), k);
    }
    return d;
  };
  out.b = base.b;
  return out;
}

// A shape kept inside a box, so its mesh closes where the box cuts it.
export function boxed(fn, lo, hi) {
  const b = roundBox((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2, 0.002);
  const out = (x, y, z) => Math.max(fn(x, y, z), b(x, y, z));
  out.b = b.b;
  return out;
}

// ------------------------------------------------------------ meshing
// Surface nets over the box lo..hi with grid step h. The grid is cut into
// blocks of 4 x 4 x 4 cells; a block is sampled finely only when the field
// at its middle says the surface may pass through it. Returns an indexed
// BufferGeometry, its normals from the slope of the sampled field.
export function meshSDF(sdf, lo, hi, h) {
  const it = meshSDFSteps(sdf, lo, hi, h);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// The same, a little at a time: a generator that yields every so often, so
// a mesh can be built over many frames without a hitch.
export function* meshSDFSteps(sdf, lo, hi, h) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz).fill(NaN);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const X = (i) => lo[0] + i * h;
  const Y = (j) => lo[1] + j * h;
  const Z = (k) => lo[2] + k * h;
  const C = 4;
  const half = (C * h * Math.sqrt(3)) / 2;
  const far = [];
  let blocks = 0;
  for (let k0 = 0; k0 < nz - 1; k0 += C) {
    for (let j0 = 0; j0 < ny - 1; j0 += C) {
      for (let i0 = 0; i0 < nx - 1; i0 += C) {
        const i1 = Math.min(i0 + C, nx - 1);
        const j1 = Math.min(j0 + C, ny - 1);
        const k1 = Math.min(k0 + C, nz - 1);
        const d = sdf(X((i0 + i1) / 2), Y((j0 + j1) / 2), Z((k0 + k1) / 2));
        if (Math.abs(d) > half * 1.3 + h) {
          far.push(i0, j0, k0, i1, j1, k1, d);
          continue;
        }
        if (++blocks % 8 === 0) yield;
        // near: every point of the block and a ring of one round it (for
        // the slope at its edge)
        for (let k = Math.max(0, k0 - 1); k <= Math.min(nz - 1, k1 + 1); k++) {
          for (let j = Math.max(0, j0 - 1); j <= Math.min(ny - 1, j1 + 1); j++) {
            for (let i = Math.max(0, i0 - 1); i <= Math.min(nx - 1, i1 + 1); i++) {
              const q = id(i, j, k);
              if (F[q] !== F[q]) F[q] = sdf(X(i), Y(j), Z(k));
            }
          }
        }
      }
    }
  }
  // the far blocks only need the right side of the surface
  for (let f = 0; f < far.length; f += 7) {
    if (f % 1400 === 1393) yield;
    const v = far[f + 6];
    for (let k = far[f + 2]; k <= far[f + 5]; k++) {
      for (let j = far[f + 1]; j <= far[f + 4]; j++) {
        for (let i = far[f]; i <= far[f + 3]; i++) {
          const q = id(i, j, k);
          if (F[q] !== F[q]) F[q] = v;
        }
      }
    }
  }
  yield;
  // a vertex in every cell the surface crosses: the mean of the crossings
  // on its twelve edges
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const v = new Float32Array(8);
  for (let k = 0; k + 1 < nz; k++) {
    if ((k & 3) === 3) yield;
    for (let j = 0; j + 1 < ny; j++) {
      for (let i = 0; i + 1 < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e];
          const b = EDGES[e + 1];
          const va = v[a];
          const vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cell[cid(i, j, k)] = pos.length / 3;
        pos.push(X(i) + (sx / n) * h, Y(j) + (sy / n) * h, Z(k) + (sz / n) * h);
      }
    }
  }
  yield;
  // a quad across every grid edge the surface crosses, from the four cells
  // round that edge, turned to face outward
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    if ((k & 3) === 3) yield;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const in0 = F[id(i, j, k)] < 0;
        if (in0 !== F[id(i + 1, j, k)] < 0) quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)], !in0);
        if (in0 !== F[id(i, j + 1, k)] < 0) quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], cell[cid(i, j, k - 1)], !in0);
        if (in0 !== F[id(i, j, k + 1)] < 0) quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)], !in0);
      }
    }
  }
  yield;
  // normals: the slope of the sampled field, interpolated within the cell
  const nrm = new Float32Array(pos.length);
  const at = (i, j, k) => F[id(Math.max(0, Math.min(nx - 1, i)), Math.max(0, Math.min(ny - 1, j)), Math.max(0, Math.min(nz - 1, k)))];
  for (let p = 0; p < pos.length; p += 3) {
    if (p % 6000 === 5997) yield;
    const fx = (pos[p] - lo[0]) / h;
    const fy = (pos[p + 1] - lo[1]) / h;
    const fz = (pos[p + 2] - lo[2]) / h;
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(ny - 2, Math.floor(fy));
    const k = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let c = 0; c < 8; c++) {
      const ci = i + (c & 1);
      const cj = j + ((c >> 1) & 1);
      const ck = k + ((c >> 2) & 1);
      const w = (c & 1 ? tx : 1 - tx) * ((c >> 1) & 1 ? ty : 1 - ty) * ((c >> 2) & 1 ? tz : 1 - tz);
      gx += w * (at(ci + 1, cj, ck) - at(ci - 1, cj, ck));
      gy += w * (at(ci, cj + 1, ck) - at(ci, cj - 1, ck));
      gz += w * (at(ci, cj, ck + 1) - at(ci, cj, ck - 1));
    }
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[p] = gx / l;
    nrm[p + 1] = gy / l;
    nrm[p + 2] = gz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return g;
}
