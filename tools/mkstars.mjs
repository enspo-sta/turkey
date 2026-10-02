// Packs the night sky for the game into src/world/skydata.js: the stars
// to magnitude 5.6 that rise over southern Alaska, the constellation stick
// figures, their names, the named bright stars and the Milky Way's outline.
// Source: the d3-celestial package (BSD licence, Olaf Frohn), whose stars
// come from the Extended Hipparcos Compilation (XHIP). Positions are J2000.
// Usage: node tools/mkstars.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'node_modules/d3-celestial/data/';
const read = (f) => JSON.parse(readFileSync(dir + f, 'utf8'));
// GeoJSON longitude is right ascension in degrees, folded to -180..180
const ra = (lon) => (lon < 0 ? lon + 360 : lon);
const MIN_DEC = -42;

// ---- stars: ra 0..360 -> uint16, dec -> int16 (x 360), mag, B-V
const stars = read('stars.6.json').features.filter((f) => f.properties.mag <= 5.6 && f.geometry.coordinates[1] > MIN_DEC);
stars.sort((a, b) => a.properties.mag - b.properties.mag);
const sb = Buffer.alloc(stars.length * 6);
stars.forEach((f, i) => {
  const [lon, lat] = f.geometry.coordinates;
  sb.writeUInt16LE(Math.round((ra(lon) / 360) * 65535), i * 6);
  sb.writeInt16LE(Math.round(lat * 360), i * 6 + 2);
  sb.writeUInt8(Math.round((f.properties.mag + 2) * 30), i * 6 + 4);
  const bv = parseFloat(f.properties.bv);
  sb.writeInt8(Math.round(Math.max(-0.5, Math.min(2.4, isNaN(bv) ? 0.6 : bv)) * 50), i * 6 + 5);
});

// ---- constellation lines and names, for those that rise here
const consNames = Object.fromEntries(read('constellations.json').features.map((f) => [f.id, f]));
const lines = [];
const cons = [];
for (const f of read('constellations.lines.json').features) {
  const polys = f.geometry.coordinates;
  if (!polys.some((p) => p.some((q) => q[1] > -30))) continue;
  for (const p of polys) lines.push(p.map(([lon, lat]) => [Math.round(ra(lon) * 100), Math.round(lat * 100)]));
  const c = consNames[f.id];
  if (c) {
    const [lon, lat] = c.geometry.coordinates;
    cons.push({ id: f.id, name: c.properties.en || c.properties.name, ra: +ra(lon).toFixed(2), dec: +lat.toFixed(2), rank: +c.properties.rank });
  }
}
// flat int16 list: count, then the points of each polyline
const lineData = [];
for (const l of lines) {
  lineData.push(l.length);
  for (const [r, d] of l) lineData.push(r - 18000, d);
}
const lb = Buffer.alloc(lineData.length * 2);
lineData.forEach((v, i) => lb.writeInt16LE(v, i * 2));

// ---- named stars
const names = read('starnames.json');
const want = [
  [11767, 'the pole star: the sky turns around it'],
  [65378, 'with Alcor beside it, an old eyesight test'],
  [65477, ''],
  [95947, 'gold and blue in a telescope'],
  [68756, 'the pole star when the pyramids were built'],
  [14576, 'the demon star: it dims every 2.9 days'],
  [10826, ''],
  [17702, 'brightest of the Pleiades'],
  [91262, ''],
  [102098, ''],
  [97649, ''],
  [24608, ''],
  [69673, ''],
  [21421, ''],
  [27989, ''],
  [24436, ''],
  [37279, ''],
  [32349, ''],
  [36850, ''],
  [37826, ''],
  [49669, ''],
  [65474, ''],
  [80763, ''],
  [113368, ''],
  [15863, ''],
  [677, ''],
  [9884, ''],
  [3179, ''],
  [54061, ''],
  [53910, ''],
  [67301, ''],
  [62956, ''],
  [72607, ''],
  [87833, ''],
  [100453, ''],
  [107315, ''],
  [113963, ''],
  [113881, ''],
  [86032, ''],
  [72105, ''],
  [76267, ''],
  [28360, ''],
  [25428, ''],
  [25336, ''],
  [26311, ''],
  [26727, ''],
  [25930, ''],
  [57632, ''],
  [50583, ''],
  [746, ''],
  [116727, 'the pole star in about AD 4000'],
  [105199, ''],
];
const byHip = Object.fromEntries(read('stars.6.json').features.map((f) => [f.id, f]));
const named = [];
for (const [hip, note] of want) {
  const s = byHip[hip];
  const n = names[hip];
  if (!s || !n) continue;
  const [lon, lat] = s.geometry.coordinates;
  named.push({ name: n.name, desig: `${n.desig} ${n.c}`, ra: +ra(lon).toFixed(3), dec: +lat.toFixed(3), mag: s.properties.mag, ...(note ? { note } : {}) });
}

// ---- the Milky Way: five nested brightness outlines, simplified
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let dmax = 0;
  let idx = 0;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > tol) return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
  return [pts[0], pts[pts.length - 1]];
}
const mw = [];
for (const f of read('mw.json').features) {
  const level = +f.id.replace('ol', '');
  for (const poly of f.geometry.coordinates) {
    for (const ringRaw of poly) {
      // unwrap the longitude so a ring never jumps across the fold
      let prev = null;
      const ring = ringRaw.map(([lon, lat]) => {
        let x = ra(lon);
        if (prev !== null) {
          while (x - prev > 180) x -= 360;
          while (prev - x > 180) x += 360;
        }
        prev = x;
        return [x, lat];
      });
      if (!ring.some((q) => q[1] > -45)) continue;
      // a closed ring: simplify the two halves either side of its far point
      let far = 0;
      let fd = -1;
      ring.forEach((q, i) => {
        const d = Math.hypot(q[0] - ring[0][0], q[1] - ring[0][1]);
        if (d > fd) {
          fd = d;
          far = i;
        }
      });
      const s = [...simplify(ring.slice(0, far + 1), 0.3).slice(0, -1), ...simplify(ring.slice(far), 0.3)];
      if (s.length < 3) continue;
      mw.push({ level, pts: s });
    }
  }
}
const mwData = [];
for (const r of mw) {
  mwData.push(r.level, r.pts.length);
  for (const [x, y] of r.pts) mwData.push(Math.round(x * 50), Math.round(y * 50));
}
const mb = Buffer.alloc(mwData.length * 2);
mwData.forEach((v, i) => mb.writeInt16LE(v, i * 2));

const out = `// The night sky over southern Alaska, packed by tools/mkstars.mjs from the
// d3-celestial package (BSD licence, Olaf Frohn); its stars come from the
// Extended Hipparcos Compilation (Anderson and Francis 2012). Do not edit.
// STARS: ${stars.length} stars to magnitude 5.6, brightest first, 6 bytes each:
// right ascension (uint16 of a full turn), declination (int16, 1/360 degree),
// magnitude ((mag + 2) * 30) and colour index (B-V * 50).
export const STARS = '${sb.toString('base64')}';
// LINES: the constellation figures as polylines: a count, then right
// ascension (centidegrees - 18000) and declination (centidegrees) pairs.
export const LINES = '${lb.toString('base64')}';
export const CONSTELLATIONS = ${JSON.stringify(cons)};
export const NAMED = ${JSON.stringify(named)};
// MILKY_WAY: outlines of five brightness levels: level, count, then right
// ascension and declination pairs in fiftieths of a degree.
export const MILKY_WAY = '${mb.toString('base64')}';
`;
writeFileSync('src/world/skydata.js', out);
console.log(`stars ${stars.length}, line points ${lineData.length / 2}, constellations ${cons.length}, named ${named.length}, milky way rings ${mw.length}; ${(out.length / 1024).toFixed(1)} KB`);
