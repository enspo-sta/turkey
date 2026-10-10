// The frame-rate optimisations against the picture, in one page: the game
// is brought to the same moment at each of several views, and that very
// moment is drawn again with the optimisations on, then with each one off in
// turn, then with all of them off, and every picture is read back pixel by
// pixel. Nothing moves between the drawings, so any differing pixel is the
// optimisation's own doing (two builds loaded one after the other never
// start from quite the same moment: the fish, for one, are placed while the
// sounds are still being made in the background).
// The optimisations, each with its switch:
// - shadow batches: casters drawn into the sun's shadow map together
//   (src/world/shadowbatch.js);
// - terrain blocks: far ground chunks drawn four at a time
//   (src/world/terrain.js);
// - grass early out: tufts with nothing to show, or wholly outside the view,
//   skip their work (src/world/grass.js);
// - one matrix update: the view reuses the places of things worked out for
//   the water's reflection just before (src/game.js);
// - clear in pass: the world's buffer (or the screen), the finish's buffers
//   and the reflection's faces each cleared inside the pass that draws into
//   them (src/world/post.js, src/game.js, src/world/water.js);
// - atlas hygiene: the sun's shadow map's pass doing only what it needs
//   (src/world/shadowbatch.js, src/world/sky.js, src/world/worldfx.js), and
//   each of its parts on its own: preupload, the stand-ins' matrices sent
//   before the map is bound; atlas r8, a colour image of one byte that the
//   casters do not write; batch weld, each stand-in's places kept once;
// - shadow twins: the plants' shadows drawn by twins with each of their
//   places once and instance buffers of their own, and no draw made of a
//   plant's level, a reflection's copy or a kind of drift with nothing in it
//   (src/world/scatter.js, src/world/shadowbatch.js, src/world/floaters.js).
// --quality draws at a preset of its own (low, medium or high; by default the
// one the game starts with).
// Usage: node tools/same-frame.mjs [build.html] [outdir] [--size WxH] [--dpr N] [--quality name] [--only=view,view]
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
const plain = args.filter((a, i) => !a.startsWith('--') && !['--size', '--dpr', '--quality'].includes(args[i - 1]));
const [FILE = 'dist/index.html', OUT = 'tools/out/same-frame'] = plain;
const [VW, VH] = opt('--size', '640x360').split('x').map(Number);
const DPR = +opt('--dpr', 1);
const QUALITY = opt('--quality', '');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

// [name, set-up code (g: the game)]
const VIEWS = [
  ['landing', "g.env.setTime(14); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face); g.player.pitch=0.02;"],
  ['landing-back', "g.env.setTime(14); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+2.6); g.player.pitch=-0.1;"],
  ['meadow-low', "g.env.setTime(9); const p=g.world.place('landing'); g.player.place(p.x+30,p.z+30,0.7); g.player.pitch=-0.35;"],
  ['road', "g.env.setTime(14); const r=g.world.roads[0]; const q=r.path.sample(r.path.length*0.3); g.player.place(q.x,q.z,Math.atan2(-q.tx,-q.tz));"],
  ['tesla', "g.env.setTime(16); g.tesla.finishSculpt(); const p=g.world.place('tesla'); g.player.place(p.x,p.z,p.face);"],
  ['evening', "g.env.setTime(19.6); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+1.2); g.player.pitch=0.05;"],
  ['mountains', "g.env.setTime(12); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face+3.6); g.player.pitch=0.12;"],
  ['night', "g.env.setTime(23.5); g.env.weather.cloud=0.05; const p=g.world.place('observatory'); g.player.place(p.x,p.z,p.face); g.player.pitch=0.3;"],
  ['observatory-day', "g.env.setTime(10); const p=g.world.place('observatory'); g.player.place(p.x,p.z,p.face+0.6); g.player.pitch=0.05;"],
  ['hotrod-low-sun', "g.env.setTime(18.2); const c=g.hotrod; g.player.place(c.pos.x+6,c.pos.z+5,Math.atan2(6,5)); g.player.pitch=-0.12;"],
].filter(([n]) => !ONLY.length || ONLY.includes(n));

// the drawings of each view: all on, all on again, each off in turn, all off
const RUNS = ['on', 'on again', 'shadow batches off', 'terrain blocks off', 'grass early out off', 'one matrix update off', 'clear in pass off', 'atlas hygiene off', 'preupload off', 'atlas r8 off', 'batch weld off', 'shadow twins off', 'all off'];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
await page.addInitScript(() => {
  Element.prototype.requestPointerLock = () => Promise.resolve();
  // the game's own loop never runs: the frames are stepped here
  let rhf;
  Object.defineProperty(window, '__rhf', {
    configurable: true,
    get: () => rhf,
    set: (v) => {
      rhf = v;
      if (v && v.game) v.game.start = () => {};
    },
  });
});
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(m.text().slice(0, 300));
});
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(async (Q) => {
  __rhf.start(false);
  const g = __rhf.game;
  if (g.raf) cancelAnimationFrame(g.raf);
  g.start = () => {};
  g.state.settings.autoQuality = false;
  g.adaptResolution = () => {};
  g.bears.directorT = 1e9;
  g.env.timeScale = 0;
  g.hud.show(false);
  const S = g.scientists;
  for (let i = 0; i < 600 && S && (S.queue?.length || S.workers?.length); i++) await new Promise((r) => setTimeout(r, 100));
  g.tesla.finishSculpt?.();
  // (the preset's shaders are built by the frames drawn below, not by the
  // game's warm-up draw at the change, which would come in between)
  if (Q) {
    const changed = g.onPostChanged;
    g.onPostChanged = null;
    g.setQuality(Q);
    g.onPostChanged = changed;
  }
}, QUALITY);

const quality = await page.evaluate(() => __rhf.game.qualityName);
console.log(`quality ${quality}`);
const out = { file: FILE, size: `${VW}x${VH}`, dpr: DPR, quality, views: {}, logs };
for (const [name, setup] of VIEWS) {
  const r = await page.evaluate(
    ({ setup, RUNS }) => {
      const g = __rhf.game;
      g.env.weather.cloud = 0.2;
      g.env.weather.cloudTarget = 0.2;
      g.env.weather.rain = 0;
      g.env.weather.rainTarget = 0;
      new Function('g', setup)(g);
      __rhf.settle && __rhf.settle();
      const gl = g.renderer.getContext();
      const DRAWS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'];
      const real = Object.fromEntries(DRAWS.map((f) => [f, gl[f]]));
      for (const f of DRAWS) gl[f] = () => {};
      // the clock stands still: work spread over frames by time is done the
      // same way however busy the machine is
      const now = performance.now;
      const t = now.call(performance);
      performance.now = () => t;
      const frames = 30;
      const dt = 1 / 60;
      for (let i = 0; i < frames; i++) {
        // the last six frames are drawn (and fill the water's reflection)
        if (i === frames - 6) for (const f of DRAWS) gl[f] = real[f];
        g.dt = dt;
        g.time += dt;
        g.sharedUniforms.uTime.value = g.time;
        for (const s of g.systems) s.update?.(dt, g);
        g.updateWorld(dt);
        if (i < frames - 1) g.render();
      }
      // the switches
      const grassMats = [g.grass.grass.material, g.grass.flowers.material];
      const set = (run) => {
        const off = (k) => run === 'all off' || run === k + ' off';
        g.shadowBatch.enabled = !off('shadow batches');
        g.terrain.blocksOn = !off('terrain blocks');
        g.terrain.showBlocks();
        for (const m of grassMats) {
          const want = !off('grass early out');
          if (('EARLY_OUT' in m.defines) !== want) {
            if (want) m.defines.EARLY_OUT = '';
            else delete m.defines.EARLY_OUT;
            m.needsUpdate = true;
          }
        }
        // the clears; the reflection's latest face is drawn again, so that
        // its clear is compared too (nothing has moved since, so the face
        // comes out as it was)
        const inPass = !off('clear in pass');
        g.post.clearInPass = g.water.clearInPass = inPass;
        const probe = g.water.probe;
        if (probe) {
          probe.next = (probe.next + probe.faces.length - 1) % probe.faces.length;
          probe.update(g.renderer, g.scene, probe.camera.position, 1, inPass);
        }
        // the shadow map's pass (a map made anew, by the game or by
        // three.js, is drawn in the same render that uses it)
        const hygiene = !off('atlas hygiene');
        g.shadowBatch.preupload = hygiene && !off('preupload');
        g.shadowBatch.setWeld(hygiene && !off('batch weld'));
        g.env.setLeanShadowMap(hygiene && !off('atlas r8'));
        // the plants' shadows by their twins, and nothing drawn that has
        // nothing in it
        const twins = !off('shadow twins');
        g.scatter.setShadowTwins(twins);
        g.floaters.setSkipEmpty(twins);
        // (the reflection has just worked out every place, and nothing has
        // moved since: on, the view reuses them)
        g.matricesFresh = !off('one matrix update');
      };
      const pics = {};
      const calls = {};
      for (const run of RUNS) {
        set(run);
        g.renderer.info.autoReset = false;
        g.renderer.info.reset();
        g.render();
        calls[run] = g.renderer.info.render.calls;
        g.renderer.info.autoReset = true;
        g.renderer.setRenderTarget(null);
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = '';
        for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
        pics[run] = { w, h, data: btoa(s) };
      }
      set('on');
      performance.now = now;
      return { pics, calls };
    },
    { setup, RUNS }
  );
  const base = Buffer.from(r.pics.on.data, 'base64');
  const { w, h } = r.pics.on;
  const res = {};
  for (const run of RUNS) {
    const px = Buffer.from(r.pics[run].data, 'base64');
    let differ = 0;
    let maxd = 0;
    for (let i = 0; i < w * h; i++) {
      const d = Math.max(Math.abs(base[i * 4] - px[i * 4]), Math.abs(base[i * 4 + 1] - px[i * 4 + 1]), Math.abs(base[i * 4 + 2] - px[i * 4 + 2]));
      if (d) {
        differ++;
        maxd = Math.max(maxd, d);
      }
    }
    res[run] = { differ, maxDiff: maxd, calls: r.calls[run] };
    if (run === 'on' || run === 'all off' || differ) writeFileSync(`${OUT}/${name}-${run.replace(/ /g, '-')}.png`, png(w, h, px));
  }
  out.views[name] = { pixels: w * h, runs: res };
  console.log(`${name.padEnd(16)} ` + RUNS.slice(1).map((k) => `${k}: ${res[k].differ} px`).join(', ') + ` | draw calls on ${res.on.calls}, all off ${res['all off'].calls}`);
}
await browser.close();
writeFileSync(`${OUT}/same-frame.json`, JSON.stringify(out, null, 1));
if (logs.length) console.log('logs', JSON.stringify(logs));

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
