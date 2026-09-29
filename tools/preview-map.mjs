// Node tool: generates the world and writes a shaded-relief PNG for layout checks.
// Usage: node tools/preview-map.mjs [size] [out.png]
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateWorld } from '../src/world/worldgen.js';
import { renderMapRGBA, worldToMap } from '../src/world/maprender.js';

const size = Number(process.argv[2] || 800);
const outPath = process.argv[3] || 'tools/out/map.png';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const t0 = performance.now();
const world = await generateWorld(1337, (f, l) => process.stdout.write(`  ${Math.round(f * 100)}% ${l}\n`));
console.log('generated in', Math.round(performance.now() - t0), 'ms');
const img = renderMapRGBA(world, size);

function dot(x, z, r, c) {
  const [px, py] = worldToMap(x, z, size);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const X = Math.round(px + dx);
      const Y = Math.round(py + dy);
      if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
      const o = (Y * size + X) * 4;
      img[o] = c[0];
      img[o + 1] = c[1];
      img[o + 2] = c[2];
    }
}
for (const road of world.roads) {
  const P = road.path;
  for (let i = 0; i < P.count; i++) dot(P.x[i], P.z[i], 1, road.bridgeMask[i] ? [255, 0, 0] : [240, 220, 160]);
}
for (const p of world.places) dot(p.x, p.z, 5, p.kind === 'fishing' ? [255, 120, 0] : [255, 255, 255]);
mkdirSync('tools/out', { recursive: true });
writeFileSync(outPath, png(size, size, img));
console.log('wrote', outPath);
console.log(
  'lakes',
  world.lakes.map((l) => `${l.id}:${l.level.toFixed(1)}`).join(' '),
  'falls s',
  world.fallsS.toFixed(0),
  'river len',
  world.river.length.toFixed(0)
);
console.log('bridges', JSON.stringify(world.bridges.map((b) => ({ road: b.road, deck: b.deck.toFixed(1) }))));
for (const p of world.places) console.log(p.id, p.x, p.z, 'y=', p.y.toFixed(1), 'water', JSON.stringify(world.waterAt(p.x, p.z)));
let mn = Infinity;
let mx = -Infinity;
for (const v of world.h) {
  mn = Math.min(mn, v);
  mx = Math.max(mx, v);
}
console.log('height range', mn.toFixed(1), mx.toFixed(1));
