// Draws the app icon (a flame-painted salmon leaping over an Alaskan sunset)
// on a canvas in headless Chromium and writes opaque RGB PNGs:
//   assets/icons/icon-{1024,512,192,180}.png
//   ios/RubenHotrodFishing/Assets.xcassets/AppIcon.appiconset/icon-1024.png
// Usage: node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

// ------------------------------------------------------------ PNG (RGB, no alpha)
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (w * 3 + 1) + 1 + x * 3;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ drawing (runs in the page)
function draw(S) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const rand = (() => {
    let a = 1234567;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  // sky
  const sky = g.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, '#16213f');
  sky.addColorStop(0.32, '#4b2f63');
  sky.addColorStop(0.62, '#e0583c');
  sky.addColorStop(0.86, '#ffb24e');
  sky.addColorStop(1, '#ffd98a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 1024);
  // stars
  for (let i = 0; i < 70; i++) {
    const y = rand() * 300;
    g.fillStyle = `rgba(255,255,255,${(0.25 + rand() * 0.6) * (1 - y / 320)})`;
    g.beginPath();
    g.arc(rand() * 1024, y, 1 + rand() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // aurora ribbon
  g.save();
  g.globalCompositeOperation = 'screen';
  for (let k = 0; k < 3; k++) {
    const ag = g.createLinearGradient(0, 60, 0, 330);
    ag.addColorStop(0, 'rgba(90,255,170,0)');
    ag.addColorStop(0.55, `rgba(90,255,170,${0.18 - k * 0.04})`);
    ag.addColorStop(1, 'rgba(90,255,170,0)');
    g.fillStyle = ag;
    g.beginPath();
    g.moveTo(-20, 250 + k * 18);
    for (let x = -20; x <= 1044; x += 32) g.lineTo(x, 190 + k * 22 + Math.sin(x * 0.009 + k) * 60 + Math.sin(x * 0.023) * 16);
    for (let x = 1044; x >= -20; x -= 32) g.lineTo(x, 60 + k * 24 + Math.sin(x * 0.009 + k + 0.4) * 50);
    g.closePath();
    g.fill();
  }
  g.restore();
  // sun
  const sun = g.createRadialGradient(512, 640, 10, 512, 640, 250);
  sun.addColorStop(0, 'rgba(255,248,200,1)');
  sun.addColorStop(0.5, 'rgba(255,214,120,0.95)');
  sun.addColorStop(0.72, 'rgba(255,160,70,0.35)');
  sun.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(512, 640, 250, 0, Math.PI * 2);
  g.fill();

  // mountains: jagged ridge lines with snow caps
  function ridge(base, peaks, color, snow) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(-10, 1024);
    g.lineTo(-10, base);
    for (const [x, y] of peaks) g.lineTo(x, y);
    g.lineTo(1034, base);
    g.lineTo(1034, 1024);
    g.closePath();
    g.fill();
    if (!snow) return;
    g.fillStyle = snow;
    for (let i = 1; i < peaks.length - 1; i++) {
      const [px, py] = peaks[i];
      const [ax, ay] = peaks[i - 1];
      const [bx, by] = peaks[i + 1];
      if (py > ay || py > by) continue;
      const k = 0.3;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + (bx - px) * k, py + (by - py) * k);
      g.lineTo(px + (bx - px) * k * 0.55, py + (by - py) * k * 0.75 + 10);
      g.lineTo(px + (ax - px) * k * 0.5, py + (ay - py) * k * 0.8 + 14);
      g.lineTo(px + (ax - px) * k, py + (ay - py) * k);
      g.closePath();
      g.fill();
    }
  }
  ridge(640, [[0, 560], [90, 470], [170, 530], [260, 400], [340, 500], [420, 455], [500, 540], [600, 430], [690, 380], [780, 480], [860, 420], [950, 500], [1024, 470]], '#5a4a78', 'rgba(255,236,230,0.92)');
  ridge(700, [[0, 610], [120, 560], [220, 640], [300, 590], [390, 650], [470, 620], [560, 670], [650, 600], [760, 560], [840, 620], [930, 580], [1024, 620]], '#2c2a4e', 'rgba(230,220,235,0.7)');
  // lake
  const lake = g.createLinearGradient(0, 700, 0, 1024);
  lake.addColorStop(0, '#f59a52');
  lake.addColorStop(0.08, '#7a4a6a');
  lake.addColorStop(0.45, '#23284a');
  lake.addColorStop(1, '#0d1328');
  g.fillStyle = lake;
  g.fillRect(0, 700, 1024, 324);
  // sun glitter on the water
  for (let i = 0; i < 26; i++) {
    const y = 712 + i * i * 0.42;
    const w = 150 - i * 4 + rand() * 40;
    g.fillStyle = `rgba(255,${200 - i * 3},${120 - i * 2},${0.75 - i * 0.025})`;
    g.fillRect(512 - w / 2 + (rand() - 0.5) * 30, y, w, 3 + i * 0.25);
  }
  // spruce silhouettes along both shores
  function spruce(x, y, h, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y - h);
    const tiers = 6;
    for (let t = 1; t <= tiers; t++) {
      const ty = y - h + (h * t) / tiers;
      const tw = (h * 0.34 * t) / tiers + 4;
      g.lineTo(x + tw, ty);
      g.lineTo(x + tw * 0.45, ty - 2);
    }
    g.lineTo(x + 3, y);
    g.lineTo(x - 3, y);
    for (let t = tiers; t >= 1; t--) {
      const ty = y - h + (h * t) / tiers;
      const tw = (h * 0.34 * t) / tiers + 4;
      g.lineTo(x - tw * 0.45, ty - 2);
      g.lineTo(x - tw, ty);
    }
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < 16; i++) {
    const x = i * 18 + rand() * 10 - 20;
    spruce(x, 712 + rand() * 8, 70 + rand() * 90 + (16 - i) * 6, '#10152c');
  }
  for (let i = 0; i < 16; i++) {
    const x = 1044 - i * 18 - rand() * 10;
    spruce(x, 712 + rand() * 8, 70 + rand() * 90 + (16 - i) * 6, '#10152c');
  }

  // splash crown where the fish left the water
  g.save();
  g.translate(300, 790);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(0, 0, 120, 22, 0, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI + (i / 8) * Math.PI;
    const r0 = 100;
    const x = Math.cos(a) * r0;
    g.beginPath();
    g.moveTo(x - 10, 0);
    g.quadraticCurveTo(x * 1.1, -60 - rand() * 50, x * 1.25 + (rand() - 0.5) * 10, -95 - rand() * 60);
    g.quadraticCurveTo(x * 1.05, -40, x + 10, 0);
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 170;
    g.beginPath();
    g.arc(Math.cos(a) * r, -Math.abs(Math.sin(a)) * r * 0.9 - 30, 4 + rand() * 9, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // droplet trail following the arc
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = 330 + t * 150 + (rand() - 0.5) * 40;
    const y = 740 - t * 170 + (rand() - 0.5) * 40;
    g.beginPath();
    g.arc(x, y, 3 + rand() * 6, 0, Math.PI * 2);
    g.fill();
  }

  // fishing line from the upper right to the fish's mouth
  const mouth = { x: 512 + Math.cos(-0.42) * 300 * 1.02, y: 470 + Math.sin(-0.42) * 300 * 1.02 };
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(1040, 60);
  g.quadraticCurveTo(900, 240, mouth.x + 6, mouth.y - 4);
  g.stroke();

  // ------------------------------------------------ the salmon
  g.save();
  g.translate(512, 470);
  g.rotate(-0.42);
  g.scale(1.02, 1.02);
  const body = new Path2D();
  body.moveTo(300, 0);
  body.bezierCurveTo(262, -74, 120, -124, -40, -112);
  body.bezierCurveTo(-150, -104, -228, -62, -268, -24);
  body.lineTo(-372, -118);
  body.bezierCurveTo(-340, -40, -340, 40, -372, 118);
  body.lineTo(-268, 24);
  body.bezierCurveTo(-228, 62, -150, 98, -40, 104);
  body.bezierCurveTo(120, 112, 262, 72, 300, 0);
  body.closePath();
  // fins behind the body
  g.fillStyle = '#2f4f63';
  g.beginPath();
  g.moveTo(-10, -108);
  g.quadraticCurveTo(-60, -196, -150, -178);
  g.quadraticCurveTo(-120, -140, -128, -98);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-100, 96);
  g.quadraticCurveTo(-150, 168, -205, 150);
  g.quadraticCurveTo(-180, 118, -196, 82);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-196, -64);
  g.quadraticCurveTo(-215, -104, -236, -96);
  g.lineTo(-226, -52);
  g.closePath();
  g.fill();
  // dark outline
  g.lineJoin = 'round';
  g.strokeStyle = '#141c2c';
  g.lineWidth = 22;
  g.stroke(body);
  // body shading: dark steel back to a bright belly
  const bg = g.createLinearGradient(0, -120, 0, 110);
  bg.addColorStop(0, '#2e5568');
  bg.addColorStop(0.38, '#6f98a8');
  bg.addColorStop(0.62, '#e4edf0');
  bg.addColorStop(1, '#ffffff');
  g.fillStyle = bg;
  g.fill(body);
  g.save();
  g.clip(body);
  // spots on the back and tail
  g.fillStyle = 'rgba(20,34,44,0.75)';
  for (let i = 0; i < 38; i++) {
    const x = -340 + rand() * 520;
    const y = -110 + rand() * 70 + (x < -260 ? rand() * 120 : 0);
    g.beginPath();
    g.ellipse(x, y, 5 + rand() * 5, 4 + rand() * 4, rand(), 0, Math.PI * 2);
    g.fill();
  }
  // hot rod flames licking back from the gills
  const fl = new Path2D();
  fl.moveTo(175, -62);
  fl.bezierCurveTo(90, -70, 20, -60, -70, -86);
  fl.bezierCurveTo(-10, -52, 20, -40, 30, -34);
  fl.bezierCurveTo(-60, -40, -150, -34, -232, -62);
  fl.bezierCurveTo(-150, -8, -60, -6, 10, -4);
  fl.bezierCurveTo(-70, 6, -160, 22, -250, 10);
  fl.bezierCurveTo(-160, 50, -60, 46, 30, 30);
  fl.bezierCurveTo(-20, 50, -70, 66, -130, 70);
  fl.bezierCurveTo(-40, 86, 60, 70, 175, 58);
  fl.bezierCurveTo(200, 20, 200, -30, 175, -62);
  fl.closePath();
  const fg = g.createLinearGradient(180, 0, -250, 0);
  fg.addColorStop(0, '#fff27a');
  fg.addColorStop(0.35, '#ffb21e');
  fg.addColorStop(0.7, '#ff5a1a');
  fg.addColorStop(1, '#d11f14');
  g.strokeStyle = '#7de2ff';
  g.lineWidth = 12;
  g.stroke(fl);
  g.strokeStyle = '#6b0f0a';
  g.lineWidth = 5;
  g.stroke(fl);
  g.fillStyle = fg;
  g.fill(fl);
  // glossy highlight along the back
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(250, -48);
  g.bezierCurveTo(150, -96, 20, -104, -120, -88);
  g.stroke();
  g.restore();
  // pectoral fin over the flames
  g.fillStyle = '#35566a';
  g.strokeStyle = '#141c2c';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(150, 38);
  g.quadraticCurveTo(90, 100, 40, 104);
  g.quadraticCurveTo(80, 60, 96, 30);
  g.closePath();
  g.fill();
  g.stroke();
  // gill arc
  g.strokeStyle = '#1d2a38';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(250, 0, 82, Math.PI * 0.72, Math.PI * 1.28);
  g.stroke();
  // mouth
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(298, 4);
  g.quadraticCurveTo(272, 20, 240, 22);
  g.stroke();
  // eye
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(236, -20, 19, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#10141c';
  g.beginPath();
  g.arc(240, -20, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(244, -24, 4, 0, Math.PI * 2);
  g.fill();
  // lure hooked in the jaw
  g.fillStyle = '#f0c030';
  g.strokeStyle = '#141c2c';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(292, 26, 16, 9, 0.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  // vignette
  const vg = g.createRadialGradient(512, 512, 380, 512, 512, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, 1024, 1024);

  // scale down with high quality resampling
  const out = {};
  for (const s of S) {
    const d = document.createElement('canvas');
    d.width = d.height = s;
    const dg = d.getContext('2d');
    dg.imageSmoothingEnabled = true;
    dg.imageSmoothingQuality = 'high';
    // step down by halves for smooth small sizes
    let src = c;
    let cur = 1024;
    while (cur / 2 >= s * 1.5) {
      const h = document.createElement('canvas');
      h.width = h.height = cur / 2;
      const hg = h.getContext('2d');
      hg.imageSmoothingQuality = 'high';
      hg.drawImage(src, 0, 0, cur / 2, cur / 2);
      src = h;
      cur /= 2;
    }
    dg.drawImage(src, 0, 0, s, s);
    const px = dg.getImageData(0, 0, s, s).data;
    let bin = '';
    for (let i = 0; i < px.length; i += 8192) bin += String.fromCharCode.apply(null, px.subarray(i, i + 8192));
    out[s] = btoa(bin);
  }
  return out;
}

const sizes = [1024, 512, 192, 180];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
const data = await page.evaluate(draw, sizes);
await browser.close();

mkdirSync('assets/icons', { recursive: true });
const iosDir = 'ios/RubenHotrodFishing/Assets.xcassets/AppIcon.appiconset';
mkdirSync(iosDir, { recursive: true });
for (const s of sizes) {
  const png = encodePNG(s, s, Buffer.from(data[s], 'base64'));
  writeFileSync(`assets/icons/icon-${s}.png`, png);
  if (s === 1024) writeFileSync(`${iosDir}/icon-1024.png`, png);
  console.log('wrote icon', s, (png.length / 1024).toFixed(0) + ' KB');
}
