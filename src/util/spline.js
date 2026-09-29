// Centripetal-ish Catmull-Rom path through 2D control points, resampled at an
// even arc-length step. Used for the river, roads and coastline.

export class Path2D {
  // points: [[x, z], ...]; step: resample spacing in meters
  constructor(points, step = 4) {
    const dense = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(2, Math.ceil(segLen / (step * 0.5)));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push(catmull(p0, p1, p2, p3, t));
      }
    }
    dense.push(points[n - 1].slice());

    // cumulative length of the dense polyline
    const cum = [0];
    for (let i = 1; i < dense.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    const count = Math.max(2, Math.round(total / step) + 1);
    this.length = total;
    this.x = new Float32Array(count);
    this.z = new Float32Array(count);
    this.s = new Float32Array(count); // distance along the path in meters
    let j = 0;
    for (let i = 0; i < count; i++) {
      const d = (i / (count - 1)) * total;
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      const segL = cum[j + 1] - cum[j] || 1;
      const t = (d - cum[j]) / segL;
      this.x[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t;
      this.z[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t;
      this.s[i] = d;
    }
    this.count = count;
    // unit tangents
    this.tx = new Float32Array(count);
    this.tz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(count - 1, i + 1);
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
  }

  // Sample position and tangent at distance d (meters) along the path.
  sample(d) {
    const u = Math.min(Math.max(d / this.length, 0), 1) * (this.count - 1);
    const i = Math.min(Math.floor(u), this.count - 2);
    const t = u - i;
    const x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    const z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    return { x, z, tx: tx / l, tz: tz / l };
  }

  // Brute-force nearest point (fine for occasional queries; grids are precomputed elsewhere).
  nearest(px, pz) {
    let best = Infinity;
    let bestS = 0;
    let bestI = 0;
    for (let i = 0; i < this.count - 1; i++) {
      const ax = this.x[i];
      const az = this.z[i];
      const bx = this.x[i + 1];
      const bz = this.z[i + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz || 1;
      let t = ((px - ax) * abx + (pz - az) * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + abx * t - px;
      const cz = az + abz * t - pz;
      const d2 = cx * cx + cz * cz;
      if (d2 < best) {
        best = d2;
        bestS = this.s[i] + (this.s[i + 1] - this.s[i]) * t;
        bestI = i;
      }
    }
    return { d: Math.sqrt(best), s: bestS, i: bestI };
  }
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
