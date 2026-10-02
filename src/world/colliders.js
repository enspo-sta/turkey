// Static collision world: circles (trunks, rocks, posts) in a spatial hash and
// oriented boxes (buildings, vehicles), plus raised walkable decks (docks,
// pier, bridge, platforms) that override the terrain height.

const CELL = 10;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.boxes = [];
    this.decks = [];
  }

  key(ix, iz) {
    return ix * 100003 + iz;
  }

  addCircle(x, z, r, tag = 'solid') {
    const c = { x, z, r, tag };
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL);
    const j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
    }
    return c;
  }

  // Oriented box centred at (x,z), half extents hx (local x), hz (local z), yaw rot.
  addBox(x, z, hx, hz, rot = 0, yMin = -1e9, yMax = 1e9, tag = 'solid') {
    const b = { x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), yMin, yMax, tag };
    b.radius = Math.sqrt(hx * hx + hz * hz);
    this.boxes.push(b);
    return b;
  }

  removeBox(b) {
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  // Take out every circle in the box x0..x1, z0..z1 that test(c) picks
  // (trees felled for a track after the forest has grown). Returns them.
  removeCircles(x0, z0, x1, z1, test) {
    const gone = new Set();
    for (let i = Math.floor(x0 / CELL) - 1; i <= Math.floor(x1 / CELL) + 1; i++) {
      for (let j = Math.floor(z0 / CELL) - 1; j <= Math.floor(z1 / CELL) + 1; j++) {
        const k = this.key(i, j);
        const arr = this.grid.get(k);
        if (!arr) continue;
        const keep = arr.filter((c) => {
          if (c.x < x0 || c.x > x1 || c.z < z0 || c.z > z1 || !test(c)) return true;
          gone.add(c);
          return false;
        });
        if (keep.length !== arr.length) this.grid.set(k, keep);
      }
    }
    return [...gone];
  }

  // Walkable raised surface: oriented rectangle with a flat top height.
  addDeck(x, z, hx, hz, rot, top, opts = {}) {
    const d = { x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, ...opts };
    this.decks.push(d);
    return d;
  }

  // Deck height at (x,z) if standing on one (within stepUp of the given y), else null.
  deckAt(x, z, y = Infinity, stepUp = 1.2) {
    let best = null;
    for (const d of this.decks) {
      const dx = x - d.x;
      const dz = z - d.z;
      // rotate into deck space (rot is yaw around +y)
      const lx = dx * d.cos - dz * d.sin;
      const lz = dx * d.sin + dz * d.cos;
      if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz) {
        let top = d.top;
        if (d.slope) top += lz * d.slope;
        if (top <= y + stepUp && (best === null || top > best)) best = top;
      }
    }
    return best;
  }

  // Pushes a circle (x,z,radius) out of all colliders. Returns {x, z, hit}.
  resolve(x, z, radius, y = 0, height = 1.8) {
    let hit = false;
    const i0 = Math.floor((x - radius - 3) / CELL);
    const i1 = Math.floor((x + radius + 3) / CELL);
    const j0 = Math.floor((z - radius - 3) / CELL);
    const j1 = Math.floor((z + radius + 3) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this.grid.get(this.key(i, j));
        if (!arr) continue;
        for (const c of arr) {
          // over the top of it (a boat over a rock on the bottom)
          if (c.top !== undefined && y > c.top) continue;
          const dx = x - c.x;
          const dz = z - c.z;
          const rr = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const push = rr - d;
            x += (dx / d) * push;
            z += (dz / d) * push;
            hit = c;
          }
        }
      }
    }
    for (const b of this.boxes) {
      if (y + height < b.yMin || y > b.yMax) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > (b.radius + radius) ** 2) continue;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      const cx = Math.max(-b.hx, Math.min(b.hx, lx));
      const cz = Math.max(-b.hz, Math.min(b.hz, lz));
      let ox = lx - cx;
      let oz = lz - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 < radius * radius) {
        let nlx;
        let nlz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nlx = cx + (ox / d) * radius;
          nlz = cz + (oz / d) * radius;
        } else {
          // centre inside the box: push out along the shallowest axis
          const px = b.hx - Math.abs(lx);
          const pz = b.hz - Math.abs(lz);
          if (px < pz) {
            nlx = Math.sign(lx || 1) * (b.hx + radius);
            nlz = lz;
          } else {
            nlx = lx;
            nlz = Math.sign(lz || 1) * (b.hz + radius);
          }
        }
        // back to world space
        x = b.x + nlx * b.cos + nlz * b.sin;
        z = b.z - nlx * b.sin + nlz * b.cos;
        hit = b;
      }
    }
    return { x, z, hit };
  }

  // Nearby circle colliders (for animal avoidance and arrows)
  circlesNear(x, z, r) {
    const out = [];
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL);
    const j1 = Math.floor((z + r) / CELL);
    const seen = new Set();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this.grid.get(this.key(i, j));
        if (!arr) continue;
        for (const c of arr) {
          if (seen.has(c)) continue;
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }
}
