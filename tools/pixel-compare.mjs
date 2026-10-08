// Two builds, the same pictures: each build is loaded in headless Chromium
// with the same seed for every random number, placed at the same spots at
// the same hours, stepped through the same frames at a steady 1/60 s, and its
// finished picture (the finish, the first-person view and all) read back
// pixel by pixel. Reported for each view: how many pixels differ, by how much
// at most, and where most of them are. Run a build against itself first:
// some things still start where loading left them (the fish in the water are
// placed while the sounds are made in the background, and a few particles),
// and a build that makes new objects shifts the seeded random numbers for
// everything after (three.js draws four for every object's name), which
// moves what is painted at random, such as the observatory dome's panels. To
// prove an optimisation leaves the picture as it was, use
// tools/same-frame.mjs, which draws one moment with it on and off.
// The pictures are kept as PNG files (each build's, and a map of the
// differences) in the output folder.
// Usage: node tools/pixel-compare.mjs a.html b.html [outdir] [--size WxH] [--dpr N] [--only=view,view]
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const plain = args.filter((a, i) => !a.startsWith('--') && !['--size', '--dpr'].includes(args[i - 1]));
const [A, B, OUT = 'tools/out/pixel-compare'] = plain;
const [VW, VH] = opt('--size', '640x360').split('x').map(Number);
const DPR = +opt('--dpr', 1);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

// [name, set-up code (g: the game), frames to step before the picture]
const VIEWS = [
  ['landing', "g.env.setTime(14); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face); g.player.pitch=0.02;", 30],
  ['landing-back', "g.env.setTime(14); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+2.6); g.player.pitch=-0.1;", 30],
  ['meadow-low', "g.env.setTime(9); const p=g.world.place('landing'); g.player.place(p.x+30,p.z+30,0.7); g.player.pitch=-0.35;", 30],
  ['road', "g.env.setTime(14); const r=g.world.roads[0]; const q=r.path.sample(r.path.length*0.3); g.player.place(q.x,q.z,Math.atan2(-q.tx,-q.tz));", 30],
  ['tesla', "g.env.setTime(16); g.tesla.finishSculpt(); const p=g.world.place('tesla'); g.player.place(p.x,p.z,p.face);", 30],
  ['evening', "g.env.setTime(19.6); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+1.2); g.player.pitch=0.05;", 30],
  ['mountains', "g.env.setTime(12); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+3.6); g.player.pitch=0.12;", 30],
  ['night', "g.env.setTime(23.5); g.env.weather.cloud=0.05; const p=g.world.place('observatory'); g.player.place(p.x,p.z,p.face); g.player.pitch=0.3;", 30],
].filter(([n]) => !ONLY.length || ONLY.includes(n));

async function shoot(file) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = () => Promise.resolve();
    // the game's own loop never runs: the title screen would otherwise run
    // for as long as loading happened to take, and every clock in the world
    // (the wind, the fire, the water) would start each view somewhere else
    let rhf;
    Object.defineProperty(window, '__rhf', {
      configurable: true,
      get: () => rhf,
      set: (v) => {
        rhf = v;
        if (v && v.game) v.game.start = () => {};
      },
    });
    // every random number from one seed, the same in both builds
    let s = 0x2f6b3a1d;
    // (seeded again before each view, so what one view draws at random
    // does not depend on what happened before it)
    window.__seed = (n) => {
      s = n;
    };
    Math.random = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await page.goto('file://' + resolve(file));
  await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
  await page.evaluate(async () => {
    __rhf.start(false);
    const g = __rhf.game;
    if (g.raf) cancelAnimationFrame(g.raf);
    g.start = () => {};
    g.state.settings.autoQuality = false;
    g.adaptResolution = () => {};
    g.bears.directorT = 1e9;
    g.env.timeScale = 0;
    g.hud.show(false);
    // the busts are carved in workers: wait for all of them, so both builds
    // show the same ones
    const S = g.scientists;
    for (let i = 0; i < 600 && S && (S.queue?.length || S.workers?.length); i++) await new Promise((r) => setTimeout(r, 100));
    g.tesla.finishSculpt?.();
  });
  const pics = {};
  for (const [name, setup, frames] of VIEWS) {
    const r = await page.evaluate(
      async ({ setup, frames }) => {
        const g = __rhf.game;
        g.env.weather.cloud = 0.2;
        g.env.weather.cloudTarget = 0.2;
        g.env.weather.rain = 0;
        g.env.weather.rainTarget = 0;
        __seed(0x51ed + frames);
        new Function('g', setup)(g);
        __rhf.settle && __rhf.settle();
        const dt = 1 / 60;
        // the early frames move the game on without drawing (the software
        // renderer is slow); the last six are drawn, which also fills all
        // five faces of the water's reflection
        const gl = g.renderer.getContext();
        const DRAWS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'];
        const real = Object.fromEntries(DRAWS.map((f) => [f, gl[f]]));
        for (const f of DRAWS) gl[f] = () => {};
        // the clock stands still while the frames are stepped: work the game
        // spreads over frames by time (the trees round a new spot) is done
        // the same way however busy the machine is
        const now = performance.now;
        const t = now.call(performance);
        performance.now = () => t;
        for (let i = 0; i < frames; i++) {
          if (i === frames - 6) for (const f of DRAWS) gl[f] = real[f];
          g.dt = dt;
          g.time += dt;
          g.sharedUniforms.uTime.value = g.time;
          for (const s of g.systems) s.update?.(dt, g);
          g.updateWorld(dt);
          g.render();
          // (no waiting between frames: nothing that runs on its own, a
          // timer or a sound, can draw a random number in between; and the
          // picture is read straight after the last frame, before the page
          // shows it and the browser clears its buffer)
        }
        performance.now = now;
        g.renderer.setRenderTarget(null);
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // base64, in chunks
        let s = '';
        for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
        return { w, h, data: btoa(s) };
      },
      { setup, frames }
    );
    pics[name] = { w: r.w, h: r.h, px: Buffer.from(r.data, 'base64') };
  }
  await browser.close();
  return { pics, logs };
}

// a PNG from RGBA rows read bottom-up (as readPixels gives them)
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4);
  }
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const a = await shoot(A);
const b = await shoot(B);
const out = { a: A, b: B, size: `${VW}x${VH}`, dpr: DPR, views: {}, logs: { a: a.logs, b: b.logs } };
for (const [name] of VIEWS) {
  const pa = a.pics[name];
  const pb = b.pics[name];
  const { w, h } = pa;
  let differ = 0;
  let maxd = 0;
  const diff = Buffer.alloc(w * h * 4);
  // where the differences are: the picture in a 4 by 4 grid
  const grid = new Array(16).fill(0);
  for (let i = 0; i < w * h; i++) {
    const d = Math.max(Math.abs(pa.px[i * 4] - pb.px[i * 4]), Math.abs(pa.px[i * 4 + 1] - pb.px[i * 4 + 1]), Math.abs(pa.px[i * 4 + 2] - pb.px[i * 4 + 2]));
    if (d) {
      differ++;
      maxd = Math.max(maxd, d);
      const x = i % w;
      const y = h - 1 - Math.floor(i / w);
      grid[Math.min(3, Math.floor((y / h) * 4)) * 4 + Math.min(3, Math.floor((x / w) * 4))]++;
    }
    const v = Math.min(255, d * 16);
    diff[i * 4] = v;
    diff[i * 4 + 1] = d ? 0 : pa.px[i * 4 + 1] >> 2;
    diff[i * 4 + 2] = d ? 0 : pa.px[i * 4 + 2] >> 2;
    diff[i * 4 + 3] = 255;
  }
  writeFileSync(`${OUT}/${name}-a.png`, png(w, h, pa.px));
  writeFileSync(`${OUT}/${name}-b.png`, png(w, h, pb.px));
  writeFileSync(`${OUT}/${name}-diff.png`, png(w, h, diff));
  out.views[name] = { pixels: w * h, differ, share: +((differ / (w * h)) * 100).toFixed(3), maxDiff: maxd, grid };
  console.log(`${name.padEnd(14)} ${String(differ).padStart(7)} of ${w * h} pixels differ (${out.views[name].share}%), at most by ${maxd} of 255`);
}
writeFileSync(`${OUT}/pixel-compare.json`, JSON.stringify(out, null, 1));
if (a.logs.length || b.logs.length) console.log('logs', JSON.stringify(out.logs));
