// Frame-time tour: loads the built game in headless Chromium, starts a new
// game and steps it frame by frame at a fixed 1/60 s along a scripted tour
// (standing and turning, walking, driving a road, the busy sites), timing
// the three parts of every frame (gameplay, world, draw submission). The
// headless browser draws with software, thousands of times slower than a
// phone's graphics chip, so the draw calls themselves are skipped (every
// other part of drawing runs: culling, sorting, shaders, uniforms, buffers,
// shadow and post passes) and counted; the render time here is the CPU side
// of drawing. A CPU profile and an allocation profile of the whole tour
// show where the time and the garbage come from. The software renderer is
// let catch up before each frame (outside the timing), so a frame never pays
// for work queued before it.
// Usage: node tools/perf-tour.mjs [out.json] [--frames N] [--noprofile] [--draw] [--tally]
//          [--size WxH] [--dpr N] [--file path/to/index.html]
// --size and --dpr set the page's size and pixel ratio (the culling of small
// parts depends on how many pixels the view has; 844x390 at 2 is an iPhone
// on its side); --file loads another build (an older one, to compare).
// --tally lists the draw calls of one frame in the middle of each segment by
// the scene's top-level groups (and the pass: shadows, reflection, view).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const outFile = args.find((a, i) => a.endsWith('.json') && args[i - 1] !== '--file') || 'tools/out/perf-tour.json';
const fi = args.indexOf('--frames');
const FRAMES = fi >= 0 ? +args[fi + 1] : 120;
const profile = !args.includes('--noprofile');
const draw = args.includes('--draw');
const tally = args.includes('--tally');

const zi = args.indexOf('--size');
const [VW, VH] = zi >= 0 ? args[zi + 1].split('x').map(Number) : [320, 180];
const di = args.indexOf('--dpr');
const DPR = di >= 0 ? +args[di + 1] : 1;
const fl = args.indexOf('--file');
const FILE = fl >= 0 ? args[fl + 1] : 'dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
// no pointer lock: the headless browser floods a locked pointer with mouse
// events, which pile up while a frame is being stepped (see tools/shot.mjs)
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 180000 });
console.log(`loaded and warmed up in ${(await page.evaluate(() => performance.now() / 1000)).toFixed(1)} s`);
await page.evaluate(() => __rhf.start(false));
await page.waitForTimeout(1500);
// time three.js's check of each new shader (it waits for the compile to
// finish) and name the program it waited on
await page.evaluate(() => {
  const r = __rhf.game.renderer;
  const gl = r.getContext();
  window.__shaderWaits = [];
  // the first question three.js asks about a new program waits for its
  // compile: the error log in a debug build, the uniforms in a release build
  for (const f of ['getProgramInfoLog', 'getProgramParameter']) {
    const orig = gl[f].bind(gl);
    gl[f] = (p, a) => {
      const t0 = performance.now();
      const out = orig(p, a);
      const dt = performance.now() - t0;
      if (dt > 2) {
        const P = r.info.programs.find((x) => x.program === p);
        window.__shaderWaits.push(`${dt.toFixed(0)} ms ${P ? P.name || '(unnamed)' : '?'} ${P ? P.cacheKey.slice(0, 120).replace(/\n/g, ' ') : ''}`);
      }
      return out;
    };
  }
});
// skip the pixels: the draw calls become no-ops (and are counted by three.js)
if (!draw)
  await page.evaluate(() => {
    const gl = __rhf.game.renderer.getContext();
    for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
  });

// The tour, run inside the page: each segment places the player for every
// frame and steps the game by hand.
const run = async (name, setup, perFrame, n = FRAMES) =>
  page.evaluate(
    ({ name, setup, perFrame, n, tally }) => {
      const g = __rhf.game;
      const S = __rhf.session;
      const dt = 1 / 60;
      new Function('g', 'S', setup)(g, S);
      const step = new Function('g', 'S', 'i', 'n', perFrame);
      const rec = { game: [], world: [], render: [], total: [], calls: [], tris: [] };
      // shader programs compiled during the segment (each one a stall on a phone)
      const compiled = [];
      let progs = g.renderer.info.programs.length;
      const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      // The software renderer can fall far behind (the real frames drawn
      // before the tour, the clears and resolves of every frame), and a call
      // that finds its queue full waits for all of it: let it catch up
      // before each frame, outside the timing, so a frame's time is its own.
      const gl = g.renderer.getContext();
      const px = new Uint8Array(4);
      const drain = () => {
        g.renderer.setRenderTarget(null);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let i = 0; i < n; i++) {
        drain();
        step(g, S, i, n);
        g.dt = dt;
        g.time += dt;
        g.sharedUniforms.uTime.value = g.time;
        const t0 = performance.now();
        for (const s of g.systems) s.update?.(dt, g);
        const t1 = performance.now();
        g.updateWorld(dt);
        const t2 = performance.now();
        g.renderer.info.autoReset = false;
        g.renderer.info.reset();
        // one frame's draw calls by owner and pass
        let undo = null;
        if (tally && i === (n >> 1)) {
          const R = g.renderer;
          const orig = R.renderBufferDirect;
          const counts = new Map();
          R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            const rt = R.getRenderTarget();
            const pass = !rt ? 'screen' : rt === g.post?.worldTarget ? 'view' : rt.isWebGLCubeRenderTarget ? 'cube' : material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadow' : rt.depthTexture && !rt.texture ? 'shadow' : 'target';
            let top = object;
            const chain = [];
            while (top.parent && top.parent !== g.scene && top.parent !== scene) {
              chain.push(top);
              top = top.parent;
            }
            const second = chain.length ? chain[chain.length - 1] : null;
            const key = pass + ' | ' + (top.name || top.type) + (second && second.name ? '/' + second.name : '') + ' [' + material.type + (material.name ? ' ' + material.name : '') + ']';
            counts.set(key, (counts.get(key) || 0) + 1);
            return orig.apply(this, arguments);
          };
          undo = () => {
            R.renderBufferDirect = orig;
            window.__tally = window.__tally || [];
            window.__tally.push(name + ':\n' + [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => String(v).padStart(5) + '  ' + k).join('\n'));
          };
        }
        g.render();
        if (undo) undo();
        const t3 = performance.now();
        g.renderer.info.autoReset = true;
        for (const s of g.systems) s.postRender?.(dt, g);
        rec.game.push(t1 - t0);
        rec.world.push(t2 - t1);
        rec.render.push(t3 - t2);
        rec.total.push(t3 - t0);
        rec.calls.push(g.renderer.info.render.calls);
        rec.tris.push(g.renderer.info.render.triangles);
        const P = g.renderer.info.programs;
        if (P.length > progs) {
          // name the objects drawn with each new program
          const users = new Map();
          const look = (root) =>
            root.traverse((o) => {
              const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
              for (const m of ms) {
                const cp = g.renderer.properties.get(m).currentProgram;
                if (!cp) continue;
                const path = [];
                for (let q = o; q && q !== root; q = q.parent) path.unshift(q.name || q.type);
                if (!users.has(cp)) users.set(cp, []);
                users.get(cp).push(path.slice(0, 3).join('/') + ' [' + m.type + (m.name ? ' ' + m.name : '') + ']');
              }
            });
          look(g.scene);
          if (g.viewmodel) look(g.viewmodel.scene);
          for (let k = progs; k < P.length; k++) compiled.push(`#${i} ${P[k].name} (${(t3 - t2).toFixed(0)} ms frame) used by ${[...new Set(users.get(P[k]) || ['? ' + P[k].cacheKey.slice(0, 160).replace(/\n/g, ' ')])].slice(0, 4).join(', ')}`);
          progs = P.length;
        }
      }
      const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const st = (a) => {
        const s = [...a].sort((x, y) => x - y);
        const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
      };
      return { name, frames: n, game: st(rec.game), world: st(rec.world), render: st(rec.render), total: st(rec.total), calls: st(rec.calls), tris: st(rec.tris), heapGrowthKB: Math.round((heap1 - heap0) / 1024), compiled, worst: rec.total.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([t, i]) => `#${i} ${t.toFixed(1)} ms (game ${rec.game[i].toFixed(1)}, world ${rec.world[i].toFixed(1)}, render ${rec.render[i].toFixed(1)})`) };
    },
    { name, setup, perFrame, n, tally }
  );

const SEG = [
  [
    'landing: turning on the spot',
    "g.env.setTime(14); const p=g.world.place('landing'); g.player.place(p.x,p.z,p.face); __rhf.settle();",
    'g.player.yaw += (Math.PI*2)/n; g.player.pitch = 0.05;',
  ],
  [
    'forest walk',
    "const p=g.world.place('landing'); g.player.place(p.x+30,p.z+30,0.7); window.__w={x:p.x+30,z:p.z+30};",
    'const W=window.__w; W.x -= Math.sin(0.7)*0.09; W.z -= Math.cos(0.7)*0.09; g.player.place(W.x, W.z, 0.7);',
  ],
  [
    'driving a road',
    "const r=g.world.roads[0]; window.__r={road:r, s:r.path.length*0.2}; const q=r.path.sample(window.__r.s); g.player.place(q.x,q.z,Math.atan2(-q.tx,-q.tz));",
    'const R=window.__r; R.s += 0.45; const q=R.road.path.sample(R.s % R.road.path.length); g.player.place(q.x,q.z,Math.atan2(-q.tx,-q.tz));',
  ],
  [
    'Bear Falls and the Tesla memorial',
    "g.tesla.finishSculpt(); const p=g.world.place('tesla'); g.player.place(p.x,p.z,p.face); __rhf.settle();",
    'g.player.yaw += (Math.PI*2)/n;',
  ],
  [
    'the observatory at night',
    "g.env.setTime(23.5); g.env.weather.cloud=0.05; const p=g.world.place('observatory'); g.player.place(p.x,p.z,p.face); __rhf.settle();",
    'g.player.yaw += (Math.PI*2)/n; g.player.pitch = 0.4;',
  ],
];

const cdp = profile ? await page.context().newCDPSession(page) : null;
if (cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Profiler.start');
  // every allocation is sampled, the short-lived garbage included
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
}
const results = [];
for (const [name, setup, perFrame] of SEG) {
  const r = await run(name, setup, perFrame);
  results.push(r);
  console.log(`${name}: total mean ${r.total.mean} p95 ${r.total.p95} max ${r.total.max} ms | game ${r.game.mean} world ${r.world.mean} render ${r.render.mean} | calls ${r.calls.p50} tris ${Math.round(r.tris.p50 / 1000)}k | heap +${r.heapGrowthKB} KB`);
  for (const w of r.worst) console.log('   ', w);
  const waits = await page.evaluate(() => window.__shaderWaits.splice(0));
  if (waits.length) console.log('    waited on shader compiles:\n      ' + waits.join('\n      '));
  if (r.compiled.length) console.log('    shaders compiled:', r.compiled.join('; '));
  if (tally) console.log(await page.evaluate(() => (window.__tally || []).splice(0).join('\n')));
}
let top = [];
let alloc = [];
if (cdp) {
  const { profile: prof } = await cdp.send('Profiler.stop');
  // self time per function (and per file), from the samples
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dts = prof.timeDeltas;
  for (let i = 0; i < prof.samples.length; i++) {
    const n = byId.get(prof.samples[i]);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.split('/').pop() : ''}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dts[i] || 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms ${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`);
  const { profile: hp } = await cdp.send('HeapProfiler.stopSampling');
  const sites = new Map();
  const walk = (n, stack) => {
    const cf = n.callFrame;
    const here = `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.split('/').pop() : ''}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    const self = n.selfSize || 0;
    if (self) sites.set(here, (sites.get(here) || 0) + self);
    for (const c of n.children || []) walk(c, stack);
  };
  walk(hp.head, []);
  alloc = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${(v / 1024).toFixed(0).padStart(8)} KB  ${k}`);
  console.log('\nTop self time (whole tour):');
  for (const l of top) console.log(l);
  console.log('\nTop allocation sites (sampled):');
  for (const l of alloc) console.log(l);
}
writeFileSync(outFile, JSON.stringify({ results, top, alloc, logs }, null, 1));
console.log('\nwrote', outFile, logs.length ? logs.join('\n') : '');
await browser.close();
