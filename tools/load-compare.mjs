// Load time of two or more builds, taken in turns in a balanced order (as
// tools/perf-compare.mjs does for frame times): for each run, a fresh
// browser opens the build at 320x180 and the page itself notes when the game
// is ready (polled every 5 ms in the page, not by the test's slower polling),
// then New game and the first frames after it are timed, with the shader
// programs built after loading counted.
// Usage: node tools/load-compare.mjs old/index.html dist/index.html [--rounds 6] [--out dir]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fitRounds, balancedOrders, t95 } from './perf-stats.mjs';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const opt = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};
const builds = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const rounds = +opt('--rounds', 6);
const outDir = resolve(opt('--out', 'tools/out/load-compare'));
mkdirSync(outDir, { recursive: true });
const k = builds.length;
const orders = balancedOrders(k, rounds);
const runs = [];

async function one(file) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = () => Promise.resolve();
    const iv = setInterval(() => {
      if (window.__rhf && window.__rhf.ready) {
        window.__readyAt = performance.now();
        clearInterval(iv);
      }
    }, 5);
  });
  let err = '';
  page.on('pageerror', (e) => (err = e.message));
  await page.goto('file://' + resolve(file));
  await page.waitForFunction(() => window.__readyAt, null, { timeout: 600000, polling: 250 });
  const r = await page.evaluate(() => {
    const g = __rhf.game;
    cancelAnimationFrame(g.raf);
    const out = { ready: window.__readyAt, programsReady: g.renderer.info.programs.length, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0 };
    const t0 = performance.now();
    __rhf.session.startGame(false);
    cancelAnimationFrame(g.raf);
    out.start = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 3; i++) g.frame();
    out.frames3 = performance.now() - t1;
    out.programsAfter = g.renderer.info.programs.length - out.programsReady;
    return out;
  });
  await browser.close();
  if (err) r.error = err;
  return r;
}

const t0 = Date.now();
for (let rd = 0; rd < rounds; rd++) {
  for (let s = 0; s < k; s++) {
    const b = orders[rd][s];
    try {
      const r = await one(builds[b]);
      runs.push({ round: rd + 1, slot: s, build: b, ...r });
      console.log(`round ${rd + 1}, place ${s + 1}: build ${b} ready ${r.ready.toFixed(0)} ms, start ${r.start.toFixed(0)} ms, 3 frames ${r.frames3.toFixed(0)} ms, programs ${r.programsReady} + ${r.programsAfter}, heap ${r.heap.toFixed(0)} MB${r.error ? ' ERROR ' + r.error : ''}`);
    } catch (e) {
      console.log(`round ${rd + 1}, place ${s + 1}: build ${b} failed: ${e.message.split('\n')[0]}`);
    }
  }
}
const whole = runs.filter((x) => runs.filter((y) => y.round === x.round).length === k);
const summary = { builds, rounds, runs, fits: {} };
const sign = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0);
for (const key of ['ready', 'start', 'frames3']) {
  const f = fitRounds(
    whole.map((x) => ({ round: x.round, slot: x.slot, build: x.build, value: x[key] })),
    builds.map((_, i) => i)
  );
  summary.fits[key] = f;
  for (let b = 0; b < k; b++) {
    const v = whole.filter((x) => x.build === b).map((x) => x[key]);
    console.log(`${key} build ${b}: mean ${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(0)} ms over ${v.length} runs`);
  }
  if (f) for (const e of f.builds) console.log(`${key}: build ${e.name} against build 0: ${sign(e.diff)} ms (95% interval ${sign(e.lo)} to ${sign(e.hi)}, ${f.df} degrees of freedom, t ${t95(f.df).toFixed(2)})`);
}
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
console.log(`${((Date.now() - t0) / 60000).toFixed(0)} min; wrote ${outDir}/summary.json`);
