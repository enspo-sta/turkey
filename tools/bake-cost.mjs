// Bake cost: what making the sound ahead of time (the ambience's textures and
// the sound library, see src/audio/bake.js and src/audio/kit.js) costs the
// frames it runs in, in a fresh page in headless Chromium, as a player meets
// it: the title screen first (its budget), then a game started. Each frame's
// baking is timed (the step calls the sound engine makes), with the frames
// it takes to finish, the longest frame's share and the whole time, and each
// single step (the longest ones named by their job, and the handing over of
// a finished sound to the sound engine apart); then the size of what was
// made (the buffers' samples, as the browser keeps them). The draw calls are
// skipped (as tools/perf-tour.mjs does): the software renderer draws a
// frame in seconds, and the bake would take hours of them.
// Usage: node tools/bake-cost.mjs [--file path/to/index.html] [--title SECS]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const fi = args.indexOf('--file');
const FILE = fi >= 0 ? args[fi + 1] : 'dist/index.html';
const ti = args.indexOf('--title');
const TITLE = ti >= 0 ? +args[ti + 1] : 3;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
// time every bake step from the very first frame
await page.addInitScript(() => {
  window.__bake = { frames: [], now: null };
  const wrap = (owner, key) => {
    const b = owner?.[key];
    if (!b || b.__timed) return;
    const step = b.step.bind(b);
    b.step = (ms) => {
      const t0 = performance.now();
      step(ms);
      const dt = performance.now() - t0;
      const f = window.__bake.now;
      if (f) f[key === 'bakery' && owner.ambience ? 'kit' : 'amb'] += dt;
    };
    b.__timed = true;
  };
  // every single step of every job, and every hand-over (onDone)
  window.__steps = [];
  const timeJobs = (b, who) => {
    if (!b) return;
    const seen = new WeakSet();
    const add = b.add.bind(b);
    const timeJob = (j) => {
      if (seen.has(j)) return;
      seen.add(j);
      const g = j.gen;
      j.gen = {
        next: () => {
          const t0 = performance.now();
          const r = g.next();
          window.__steps.push([who + ':' + j.name, performance.now() - t0]);
          return r;
        },
      };
    };
    b.jobs.forEach(timeJob);
    b.add = (name, gen) => add(name, gen);
    // jobs put in later (the reverbs' impulses) are timed as they come
    const push = b.jobs.push.bind(b.jobs);
    const unshift = b.jobs.unshift.bind(b.jobs);
    b.jobs.push = (...js) => { const n = push(...js); js.forEach(timeJob); return n; };
    b.jobs.unshift = (...js) => { const n = unshift(...js); js.forEach(timeJob); return n; };
    const done = b.onDone;
    if (done)
      b.onDone = (name, v) => {
        const t0 = performance.now();
        done(name, v);
        window.__steps.push([who + ':' + name + ' (handed over)', performance.now() - t0]);
      };
  };
  window.__wrapBake = () => {
    const A = window.__rhf?.game?.audio;
    if (!A) return false;
    timeJobs(A.ambience.bakery, 'ambience');
    timeJobs(A.bakery, 'library');
    wrap(A.ambience, 'bakery');
    wrap(A, 'bakery');
    return true;
  };
});
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.game && window.__rhf.game.audio, null, { timeout: 300000 });
// From here every animation frame is a frame record; the audio's own update
// (in the game's loop) calls the bakers.
await page.evaluate(() => {
  window.__wrapBake();
  const B = window.__bake;
  const tick = () => {
    if (B.now) B.frames.push(B.now);
    B.now = { amb: 0, kit: 0, phase: B.phase || 'loading' };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.waitForFunction(() => window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(() => {
  const gl = __rhf.game.renderer.getContext();
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
});
// the title screen, then the first tap (the sound starts) and a new game
await page.evaluate(() => (window.__bake.phase = 'title'));
await page.waitForTimeout(TITLE * 1000);
await page.evaluate(() => {
  window.__bake.phase = 'game';
  const A = __rhf.game.audio;
  A.unlock();
  __rhf.start(false);
});
const done = await page.waitForFunction(() => {
  const A = __rhf.game.audio;
  return !A.ambience.bakery.busy && !(A.bakery && A.bakery.busy);
}, null, { timeout: 600000, polling: 500 }).then(() => true, () => false);
const out = await page.evaluate(() => {
  const B = window.__bake;
  const A = __rhf.game.audio;
  const res = {};
  for (const kind of ['amb', 'kit']) {
    const fr = B.frames.filter((f) => f[kind] > 0);
    const v = fr.map((f) => f[kind]).sort((a, b) => a - b);
    const sum = v.reduce((a, b) => a + b, 0);
    const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
    res[kind] = { frames: v.length, totalMs: +sum.toFixed(1), meanMs: v.length ? +(sum / v.length).toFixed(2) : 0, p95Ms: +q(0.95).toFixed(2), maxMs: +q(1).toFixed(2), byPhase: {} };
    for (const ph of ['loading', 'title', 'game']) {
      const w = fr.filter((f) => f.phase === ph).map((f) => f[kind]);
      res[kind].byPhase[ph] = { frames: w.length, maxMs: w.length ? +Math.max(...w).toFixed(2) : 0 };
    }
  }
  // what was made: the library's buffers and the ambience's
  let kitSamples = 0;
  for (const k of Object.values(A.kit || {})) for (const b of k.bufs) kitSamples += b.length * b.numberOfChannels;
  let ambSamples = 0;
  for (const b of Object.values(A.ambience.buffers || {})) ambSamples += b.length * b.numberOfChannels;
  for (const list of Object.values(A.ambience.steps || {})) for (const b of list) ambSamples += b.length * b.numberOfChannels;
  res.kitMB = +((kitSamples * 4) / 1048576).toFixed(1);
  res.ambienceMB = +((ambSamples * 4) / 1048576).toFixed(1);
  res.sounds = Object.keys(A.kit || {}).length;
  // the longest single steps, by job, and every job's own total
  const S = window.__steps;
  res.longestSteps = [...S].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, ms]) => `${ms.toFixed(2)} ms ${n}`);
  const per = {};
  for (const [n, ms] of S) {
    const k = n.replace(' (handed over)', '');
    per[k] = per[k] || { steps: 0, ms: 0, max: 0 };
    per[k].steps++;
    per[k].ms += ms;
    per[k].max = Math.max(per[k].max, ms);
  }
  res.steps = S.length;
  res.stepsOver1ms = S.filter((s) => s[1] > 1).length;
  res.stepsOver4ms = S.filter((s) => s[1] > 4).length;
  res.slowestJobs = Object.entries(per).sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([n, v]) => `${n}: ${v.ms.toFixed(1)} ms in ${v.steps} steps, longest ${v.max.toFixed(2)}`);
  return res;
});
out.finished = done;
out.logs = logs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
