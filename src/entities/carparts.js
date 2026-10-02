// Geometry and texture helpers for the cars: lofted smooth panels with
// their own texture coordinates, tubes along curves, coil springs, tyres
// with tread and sidewall coordinates, and small canvas textures.
import * as THREE from 'three';

// A smooth skin through a row of sections. Each section is a list of
// [x, y, z] points, all with the same count. uv(i, j) gives the texture
// coordinate of point j in section i (default: along the ring, then along
// the sections). closed joins the last point of each ring to the first.
export function loft(sections, { closed = false, uv = null, flip = false } = {}) {
  const ns = sections.length;
  const np = sections[0].length;
  const pos = new Float32Array(ns * np * 3);
  const uvs = new Float32Array(ns * np * 2);
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < np; j++) {
      const p = sections[i][j];
      const k = i * np + j;
      pos[k * 3] = p[0];
      pos[k * 3 + 1] = p[1];
      pos[k * 3 + 2] = p[2];
      const t = uv ? uv(i, j) : [j / (np - 1), i / (ns - 1)];
      uvs[k * 2] = t[0];
      uvs[k * 2 + 1] = t[1];
    }
  }
  const idx = [];
  const cols = closed ? np : np - 1;
  for (let i = 0; i < ns - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * np + j;
      const b = i * np + ((j + 1) % np);
      const c = (i + 1) * np + j;
      const d = (i + 1) * np + ((j + 1) % np);
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A flat fan closing a ring of points (the end of a lofted panel).
export function capRing(ring, { flip = false, uv = [0.98, 0.98] } = {}) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of ring) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= ring.length;
  cy /= ring.length;
  cz /= ring.length;
  const pos = [];
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j];
    const b = ring[(j + 1) % ring.length];
    if (flip) pos.push(cx, cy, cz, b[0], b[1], b[2], a[0], a[1], a[2]);
    else pos.push(cx, cy, cz, a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const u = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < u.length; i += 2) {
    u[i] = uv[0];
    u[i + 1] = uv[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  g.computeVertexNormals();
  return g;
}

// A round tube through points (a header pipe, a hose, a wire).
export function tube(points, r, { radial = 8, tubular = 0, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'catmullrom',
    tension
  );
  const n = tubular || Math.max(8, Math.round(curve.getLength() / 0.03));
  return new THREE.TubeGeometry(curve, n, r, radial, closed);
}

// A coil spring between a and b: turns of wire of radius wire round a coil
// of radius R.
export function coil(a, b, R, wire, turns, { radial = 6 } = {}) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const axis = B.clone().sub(A);
  const len = axis.length();
  axis.normalize();
  const side = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = side.clone().cross(axis).normalize();
  const v = axis.clone().cross(u).normalize();
  class Helix extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) {
      const ang = t * turns * Math.PI * 2;
      return out
        .copy(A)
        .addScaledVector(axis, t * len)
        .addScaledVector(u, Math.cos(ang) * R)
        .addScaledVector(v, Math.sin(ang) * R);
    }
  }
  return new THREE.TubeGeometry(new Helix(), Math.round(turns * 18), wire, radial, false);
}

// A lathe around the x axis (wheels, hubs, buckets): profile points are
// [radius, x]; v runs along the profile by length, u around.
export function latheX(profile, seg = 32, { u0 = 0, u1 = 1 } = {}) {
  let total = 0;
  const lens = [0];
  for (let i = 1; i < profile.length; i++) {
    total += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
    lens.push(total);
  }
  const np = profile.length;
  const pos = new Float32Array((seg + 1) * np * 3);
  const uvs = new Float32Array((seg + 1) * np * 2);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let j = 0; j < np; j++) {
      const k = i * np + j;
      const r = profile[j][0];
      pos[k * 3] = profile[j][1];
      pos[k * 3 + 1] = c * r;
      pos[k * 3 + 2] = s * r;
      uvs[k * 2] = u0 + (u1 - u0) * (i / seg);
      uvs[k * 2 + 1] = total ? lens[j] / total : 0;
    }
  }
  const idx = [];
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < np - 1; j++) {
      const a = i * np + j;
      const b = a + 1;
      const c2 = (i + 1) * np + j;
      const d = c2 + 1;
      // the profile runs out from the axis: face away from it
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A tyre on the x axis: rim radius rr, outer radius r, width w. Its
// section is a rounded square (a superellipse) cut off at the beads; the
// outer face (whitewall, lettering) is +x. Texture v runs from the inner
// bead (0) over the tread (0.36 to 0.64) to the outer bead (1).
export function tyreGeometry(r, w, rr, { seg = 40, n = 4.2, steps = 30 } = {}) {
  const hw = w / 2;
  const rc = rr + (r - rr) * 0.42;
  const hh = r - rc;
  const e = 2 / n;
  const pw = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);
  const d = Math.asin(Math.min(1, Math.pow((rc - rr) / hh, n / 2)));
  const P = [];
  for (let i = 0; i <= steps; i++) {
    const th = Math.PI + d - (i / steps) * (Math.PI + 2 * d);
    P.push([rc + hh * pw(Math.sin(th), e), hw * pw(Math.cos(th), e)]);
  }
  P[0][0] = rr;
  P[steps][0] = rr;
  const g = latheX(P, seg);
  // texture v: the sidewalls and the tread each get their own share
  const lens = [0];
  for (let i = 1; i < P.length; i++) lens.push(lens[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const flat = r - (r - rr) * 0.1;
  let a = P.findIndex((p) => p[0] >= flat);
  let b = P.length - 1 - [...P].reverse().findIndex((p) => p[0] >= flat);
  if (a < 1) a = 1;
  if (b > P.length - 2) b = P.length - 2;
  const map = (j) => {
    const L = lens[j];
    if (j <= a) return (L / lens[a]) * 0.36;
    if (j >= b) return 0.64 + ((L - lens[b]) / (lens[P.length - 1] - lens[b])) * 0.36;
    return 0.36 + ((L - lens[a]) / (lens[b] - lens[a])) * 0.28;
  };
  const uv = g.attributes.uv.array;
  const np = P.length;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < np; j++) uv[(i * np + j) * 2 + 1] = map(j);
  return g;
}

// ------------------------------------------------------------ textures
export function canvasTexture(w, h, draw, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Tyre texture: u runs round the tyre, v across from the inner bead (0)
// over the tread (0.36 to 0.64) to the outer bead (1). Rubber with a
// moulded tread, and on the outer sidewall an optional white band, a
// coloured ring and white lettering.
export function tyreTexture({ whitewall = 0, ring = null, letters = '', tread = 'street', ribs = 4 } = {}) {
  return canvasTexture(1024, 256, (g, W, H) => {
    // the canvas is upside down to the texture: v = 1 is the top row
    const Y = (v) => (1 - v) * H;
    g.fillStyle = '#1b1b1c';
    g.fillRect(0, 0, W, H);
    // faint moulding rings on the sidewalls
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2;
    for (const v of [0.1, 0.2, 0.8, 0.9]) {
      g.beginPath();
      g.moveTo(0, Y(v));
      g.lineTo(W, Y(v));
      g.stroke();
    }
    const t0 = Y(0.64);
    const t1 = Y(0.36);
    g.fillStyle = '#222224';
    g.fillRect(0, t0, W, t1 - t0);
    if (tread === 'slick') {
      // scrubbed rubber, a little marbled
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.04})`;
        g.fillRect(Math.random() * W, t0 + Math.random() * (t1 - t0), 2 + Math.random() * 10, 1 + Math.random() * 2);
      }
    } else {
      // circumferential grooves
      g.fillStyle = '#070707';
      for (let i = 1; i < ribs; i++) g.fillRect(0, t0 + ((t1 - t0) * i) / ribs - 2, W, 4);
      // blocks: sipes across every rib, offset rib to rib
      const blocks = 72;
      for (let b = 0; b < blocks; b++) {
        for (let i = 0; i < ribs; i++) {
          const x = ((b + (i % 2) * 0.5) / blocks) * W;
          const y0 = t0 + ((t1 - t0) * i) / ribs;
          g.fillRect(x, y0, 3, (t1 - t0) / ribs);
        }
        // the shoulder lugs
        const x = (b / blocks) * W;
        g.fillRect(x, t0 - 8, 7, 11);
        g.fillRect(x + W / blocks / 2, t1 - 3, 7, 11);
      }
    }
    if (whitewall) {
      g.fillStyle = '#efebe2';
      g.fillRect(0, Y(0.92), W, whitewall * H);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(0, Y(0.92) + whitewall * H - 2, W, 2);
    }
    if (ring) {
      g.fillStyle = ring;
      g.fillRect(0, Y(0.9), W, 0.035 * H);
    }
    if (letters) {
      g.fillStyle = '#ece8de';
      g.font = `700 ${Math.round(H * 0.07)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let k = 0; k < 2; k++) {
        g.save();
        g.translate(W * (0.25 + k * 0.5), Y(0.78));
        // seen from outside the letters run against u, tops outward
        g.rotate(Math.PI);
        g.fillText(letters, 0, 0);
        g.restore();
      }
    }
  });
}

// Paint over every vertex of a geometry with one texture coordinate (a part
// that wears the plain body colour of a painted texture).
export function plainUv(geo, u = 0.985, v = 0.985) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    a[i * 2] = u;
    a[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return geo;
}

// Bake per-vertex colour onto a geometry (for parts merged into a vertex
// coloured mesh without the ModelBuilder's jitter).
export function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Merge geometries with the same attributes (position, normal, uv and
// optionally colour) into one indexed geometry.
export function merge(geos) {
  const list = geos.map((g) => (g.index ? g : indexed(g)));
  const hasUv = list.every((g) => g.attributes.uv);
  const hasCol = list.every((g) => g.attributes.color);
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const uv = hasUv ? new Float32Array(nv * 2) : null;
  const col = hasCol ? new Float32Array(nv * 3) : null;
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), ov * 3);
    nrm.set(g.attributes.normal.array.subarray(0, n * 3), ov * 3);
    if (uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), ov * 2);
    if (col) col.set(g.attributes.color.array.subarray(0, n * 3), ov * 3);
    const I = g.index.array;
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = I[i] + ov;
    ov += n;
    oi += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function indexed(g) {
  const n = g.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Place a geometry: translate, rotate (Euler xyz) and scale in one go.
export function placed(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ' } = {}) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order));
  const s = Array.isArray(scale) ? new THREE.Vector3(...scale) : new THREE.Vector3(scale, scale, scale);
  m.compose(new THREE.Vector3(...pos), q, s);
  geo.applyMatrix4(m);
  // a mirrored part turns its triangles inside out: wind them back
  if (s.x * s.y * s.z < 0 && geo.index) {
    const I = geo.index.array;
    for (let i = 0; i < I.length; i += 3) {
      const t = I[i + 1];
      I[i + 1] = I[i + 2];
      I[i + 2] = t;
    }
  }
  return geo;
}
