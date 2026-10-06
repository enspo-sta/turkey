// Bake cost: what making the sound ahead of time (the ambience's textures,
// the sound library and the reverbs' impulses: src/audio/bake.js, kit.js,
// oven.js) costs, in a fresh page in headless Chromium, as a player meets
// it: the loading screen and the title screen first, then a game started.
// With the sound's worker (the default) the sounds are made off the main
// thread: reported are how long the worker took for each job and in all,
// when everything was made and when it was all handed to the browser, and
// what the main thread still pays (the hand-overs, a sound a frame, and the
// two reverbs at the tap). With --main the page gets no workers and the
// sounds are made on the main thread a little each frame, as builds before
// the worker did: reported then are each frame's making, its longest single
// steps (named by their job) and the hand-overs. Then the size of what was
// made (the buffers' samples, as the browser keeps them). The draw calls
// are skipped (as tools/perf-tour.mjs does): the software renderer draws a
// frame in seconds, and the bake would take hours of them.
// Usage: node tools/bake-cost.mjs [--file path/to/index.html] [--title SECS] [--main]
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
const MAIN = args.includes('--main');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
if (MAIN) await page.addInitScript(() => (window.Worker = undefined));
// time the bakers from the very first frame
await page.addInitScript(() => {
  window.__bake = { frames: [], now: null, steps: [], hands: [], worker: [], t0: performance.now() };
  window.__wrapBake = () => {
    const A = window.__rhf?.game?.audio;
    if (!A) return false;
    const B = window.__bake;
    for (const [b, who, slot] of [
      [A.ambience.bakery, 'ambience', 'amb'],
      [A.bakery, 'library', 'kit'],
    ]) {
      if (b.__timed) continue;
      b.__timed = true;
      // making on the main thread (with no worker), a frame's share
      const step = b.step.bind(b);
      b.step = (ms) => {
        const t0 = performance.now();
        step(ms);
        if (B.now) B.now[slot] += performance.now() - t0;
      };
      // and each single step of each job made here
      const seen = new WeakSet();
      const timeJob = (j) => {
        if (!j.gen || seen.has(j)) return;
        seen.add(j);
        const g = j.gen;
        j.gen = {
          next: () => {
            const t0 = performance.now();
            const r = g.next();
            B.steps.push([who + ':' + j.name, performance.now() - t0]);
            return r;
          },
        };
      };
      const watch = (list) => {
        list.forEach(timeJob);
        const push = list.push.bind(list);
        const unshift = list.unshift.bind(list);
        list.push = (...js) => {
          const n = push(...js);
          js.forEach(timeJob);
          return n;
        };
        list.unshift = (...js) => {
          const n = unshift(...js);
          js.forEach(timeJob);
          return n;
        };
      };
      if (!b.inWorker) watch(b.jobs);
      // the hand-overs: a finished sound to the browser
      const hand = b.handOver.bind(b);
      b.handOver = (name = null) => {
        const n = name ?? b.order[0];
        const t0 = performance.now();
        const r = hand(name);
        const dt = performance.now() - t0;
        if (r) {
          B.hands.push([who + ':' + n, dt, performance.now() - B.t0]);
          if (B.now) B.now.hand += dt;
        }
        return r;
      };
      // the worker's own time for each job
      const receive = b.receive.bind(b);
      b.receive = (m) => {
        B.worker.push([who + ':' + m.name, m.ms ?? 0, performance.now() - B.t0]);
        receive(m);
      };
    }
    return true;
  };
});
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.game && window.__rhf.game.audio && window.__wrapBake(), null, { timeout: 300000, polling: 10 });
// From here every animation frame is a frame record; the audio's own update
// (in the game's loop) calls the bakers.
await page.evaluate(() => {
  const B = window.__bake;
  const tick = () => {
    if (B.now) B.frames.push(B.now);
    B.now = { amb: 0, kit: 0, hand: 0, phase: B.phase || 'loading' };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.waitForFunction(() => window.__rhf.ready, null, { timeout: 300000 });
const readyAt = await page.evaluate(() => performance.now() - window.__bake.t0);
await page.evaluate(() => {
  const gl = __rhf.game.renderer.getContext();
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
});
// the title screen, then the first tap (the sound starts) and a new game
await page.evaluate(() => (window.__bake.phase = 'title'));
await page.waitForTimeout(TITLE * 1000);
const tap = await page.evaluate(() => {
  const B = window.__bake;
  B.phase = 'game';
  const A = __rhf.game.audio;
  const t0 = performance.now();
  A.unlock();
  B.unlockMs = performance.now() - t0;
  B.tapAt = t0 - B.t0;
  __rhf.start(false);
  return B.tapAt;
});
const done = await page
  .waitForFunction(
    () => {
      const A = __rhf.game.audio;
      const left = (b) => b.jobs.length + Object.keys(b.done).length;
      return left(A.ambience.bakery) + left(A.bakery) === 0;
    },
    null,
    { timeout: 600000, polling: 250 }
  )
  .then(
    () => true,
    () => false
  );
const out = await page.evaluate(() => {
  const B = window.__bake;
  const A = __rhf.game.audio;
  const res = { worker: A.bakery.inWorker };
  for (const kind of ['amb', 'kit', 'hand']) {
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
  res.unlockMs = +B.unlockMs.toFixed(1);
  res.tapAtMs = Math.round(B.tapAt);
  // the worker: each job's time, all of it, and when the last was made
  if (B.worker.length) {
    const tot = B.worker.reduce((a, w) => a + w[1], 0);
    res.workerMs = +tot.toFixed(0);
    res.workerJobs = B.worker.length;
    res.allMadeAtMs = Math.round(Math.max(...B.worker.map((w) => w[2])));
    res.slowestWorkerJobs = [...B.worker].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, ms]) => `${n}: ${ms.toFixed(1)} ms`);
  }
  // the hand-overs
  res.handOvers = B.hands.length;
  res.handOverMs = +B.hands.reduce((a, h) => a + h[1], 0).toFixed(1);
  res.allHandedAtMs = B.hands.length ? Math.round(Math.max(...B.hands.map((h) => h[2]))) : null;
  res.longestHandOvers = [...B.hands].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, ms]) => `${ms.toFixed(2)} ms ${n}`);
  // what was made: the library's buffers and the ambience's
  let kitSamples = 0;
  for (const k of Object.values(A.kit || {})) for (const b of k.bufs) kitSamples += b.length * b.numberOfChannels;
  let ambSamples = 0;
  for (const b of Object.values(A.ambience.buffers || {})) ambSamples += b.length * b.numberOfChannels;
  for (const list of Object.values(A.ambience.steps || {})) for (const b of list) ambSamples += b.length * b.numberOfChannels;
  res.kitMB = +((kitSamples * 4) / 1048576).toFixed(1);
  res.ambienceMB = +((ambSamples * 4) / 1048576).toFixed(1);
  res.sounds = Object.keys(A.kit || {}).length;
  // the main thread's single steps (with no worker), the longest named
  const S = B.steps;
  res.steps = S.length;
  res.stepsOver1ms = S.filter((s) => s[1] > 1).length;
  res.stepsOver4ms = S.filter((s) => s[1] > 4).length;
  res.longestSteps = [...S].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, ms]) => `${ms.toFixed(2)} ms ${n}`);
  return res;
});
out.readyAtMs = Math.round(readyAt);
out.finished = done;
out.logs = logs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
