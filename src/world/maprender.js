// Renders the world into an RGBA image: hill-shaded terrain colours with water.
// Used by the in-game map screen and by the Node preview tool.
import { HALF, SIZE } from './worldgen.js';
import { clamp } from '../util/math.js';

export function renderMapRGBA(world, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const step = SIZE / size;
  const lx = -0.6;
  const ly = 0.55;
  const lz = -0.55;
  const ll = Math.hypot(lx, ly, lz);
  const n = { x: 0, y: 1, z: 0 };
  for (let py = 0; py < size; py++) {
    const z = -HALF + (py + 0.5) * step;
    for (let px = 0; px < size; px++) {
      const x = -HALF + (px + 0.5) * step;
      const k = world.cellIndex(x, z);
      let r = world.color[k * 3] / 255;
      let g = world.color[k * 3 + 1] / 255;
      let b = world.color[k * 3 + 2] / 255;
      world.normalAt(x, z, n);
      const d = (n.x * lx + n.y * ly + n.z * lz) / ll;
      const shade = clamp(0.45 + d * 0.75, 0.25, 1.25);
      r *= shade;
      g *= shade;
      b *= shade;
      const w = world.waterAt(x, z);
      if (w) {
        const depth = clamp(w.depth / 12, 0, 1);
        let wr = 0.24;
        let wg = 0.47;
        let wb = 0.58;
        if (w.kind === 'glacier') {
          wr = 0.36;
          wg = 0.68;
          wb = 0.72;
        } else if (w.kind === 'ocean') {
          wr = 0.12;
          wg = 0.3;
          wb = 0.42;
        }
        const t = 0.55 + depth * 0.4;
        r = r * (1 - t) + wr * t;
        g = g * (1 - t) + wg * t;
        b = b * (1 - t) + wb * t;
      }
      const o = (py * size + px) * 4;
      out[o] = clamp(r * 255, 0, 255);
      out[o + 1] = clamp(g * 255, 0, 255);
      out[o + 2] = clamp(b * 255, 0, 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

// Converts world coordinates to map pixel coordinates.
export function worldToMap(x, z, size) {
  return [((x + HALF) / SIZE) * size, ((z + HALF) / SIZE) * size];
}
