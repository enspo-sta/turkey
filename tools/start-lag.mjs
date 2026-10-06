// Start lag: how much work each frame of a game's first minute carries, in
// headless Chromium with the page's processor slowed down to stand in for a
// phone's (the browser's own CPU throttling: --throttle 4 makes all of the
// page's work take four times as long). The game is stepped frame by frame
// at a steady 1/60 s, as tools/perf-tour.mjs does (the software renderer
// here draws far too slowly to let the game run on its own clock), with the
// draw calls skipped: the title screen for --title seconds, then a game
// started as a tap starts it (the sound switched on at the same moment),
// then --secs seconds of play standing on the riverbank. Between frames the
// page is let go for what is left of the frame's 1/60 s, so the workers and
// messages run as they would. Every frame's own work is timed, with what in
// it was the sound being made ahead of time, finished sounds being handed to
// the browser, and Tesla's statue being carved (each part's own time, so a
// sound handed over from inside a baker's step is not counted twice).
// Reported: the frames over 16.7, 33 and 50 ms, the longest ones and what
// was in them, every hand-over that took over a millisecond, second by
// second from the tap, and when the sound was all made and handed over.
// --main makes the sound on the main thread (the page gets no workers), as
// builds before the sound's worker did.
// Usage: node tools/start-lag.mjs [--file path/to/index.html] [--throttle N]
//          [--title SECS] [--secs SECS] [--size WxH] [--json out.json] [--main]
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
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const FILE = opt('--file', 'dist/index.html');
const THROTTLE = +opt('--throttle', 4);
const TITLE = +opt('--title', 3);
const SECS = +opt('--secs', 45);
const [VW, VH] = opt('--size', '640x360').split('x').map(Number);
const JSON_OUT = opt('--json', null);
const MAIN = args.includes('--main');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
if (MAIN) await page.addInitScript(() => (window.Worker = undefined));
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
// stop the game's own loop and time the parts of each frame
await page.evaluate(() => {
  const g = __rhf.game;
  cancelAnimationFrame(g.raf);
  g.timer.update = () => {};
  g.timer.getDelta = () => 1 / 60;
  const gl = g.renderer.getContext();
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
  const L = (window.__lag = { cur: null });
  const A = g.audio;
  // Each part's own time: a part called inside another (a sound handed over
  // from inside a baker's step, as builds before the oven did) counts as
  // itself, not twice, and is named once.
  const open = [];
  const timed = (owner, key, slot, label) => {
    const f = owner && owner[key];
    if (typeof f !== 'function') return;
    owner[key] = function (...a) {
      // (what a hand-over hands over: named, or the next in line)
      const what = a[0] ?? this.order?.[0];
      const inner = { slot, child: 0 };
      const nested = open.some((o) => o.slot === slot);
      open.push(inner);
      const t0 = performance.now();
      let r;
      try {
        r = f.apply(this, a);
      } finally {
        const dt = performance.now() - t0;
        open.pop();
        if (open.length) open[open.length - 1].child += dt;
        if (L.cur) {
          L.cur[slot] += dt - inner.child;
          const note = label && !nested && dt > 1 ? label(what, r) : null;
          if (note) L.cur.notes.push(`${note} ${dt.toFixed(1)} ms`);
        }
      }
      return r;
    };
  };
  for (const [b, name] of [
    [A.ambience.bakery, 'ambience'],
    [A.bakery, 'library'],
  ]) {
    if (!b) continue;
    // making: the bakers' steps (the sound's worker makes none here)
    timed(b, 'step', 'make');
    if (typeof b.handOver === 'function') timed(b, 'handOver', 'hand', (n, r) => (r ? `${name} ${n} handed over` : null));
    else if (b.onDone) timed(b, 'onDone', 'hand', (n) => `${name} ${n} handed over`);
  }
  // builds with the library but no oven hand it over a sound a frame here
  // (and from inside the baker's step, through onDone)
  if (A.bakery && typeof A.bakery.handOver !== 'function') timed(A, 'kitBaked', 'hand', (n) => `library ${n} handed over`);
  if (g.tesla) timed(g.tesla, 'sculptStep', 'sculpt');
});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
// step n frames at a steady 1/60 s each
const run = (n, phase) =>
  page.evaluate(
    async ({ n, phase }) => {
      const g = __rhf.game;
      const L = window.__lag;
      const gl = g.renderer.getContext();
      const px = new Uint8Array(4);
      const out = [];
      for (let i = 0; i < n; i++) {
        // the software renderer catches up outside the timing
        g.renderer.setRenderTarget(null);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        L.cur = { make: 0, hand: 0, sculpt: 0, notes: [] };
        g.frame();
        const c = L.cur;
        L.cur = null;
        c.ms = performance.now() - t0;
        c.phase = phase;
        c.dpr = g.dpr;
        out.push(c);
        // the rest of the frame's time to the page (workers' messages, timers)
        await new Promise((r) => setTimeout(r, Math.max(0, 1000 / 60 - (performance.now() - t0))));
      }
      return out;
    },
    { n, phase }
  );
const title = await run(Math.round(TITLE * 60), 'title');
const tapMs = await page.evaluate(() => {
  const t = performance.now();
  __rhf.game.audio.unlock();
  __rhf.start(false);
  return performance.now() - t;
});
const game = [];
let soundDone = null;
for (let s = 0; s < SECS; s += 5) {
  const part = await run(Math.round(Math.min(5, SECS - s) * 60), 'game');
  game.push(...part);
  if (soundDone === null) {
    const done = await page.evaluate(() => {
      const A = __rhf.game.audio;
      const left = (b) => (b ? b.jobs.length + Object.keys(b.done || {}).length : 0);
      return left(A.ambience.bakery) + left(A.bakery) === 0;
    });
    if (done) soundDone = `by ${s + 5} s of play`;
  }
}
const stats = (list) => {
  const v = list.map((f) => f.ms).sort((a, b) => a - b);
  const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
  const sum = (k) => list.reduce((a, f) => a + f[k], 0);
  return {
    frames: list.length,
    meanMs: +(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2),
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    max: +q(1).toFixed(1),
    over16: list.filter((f) => f.ms > 16.7).length,
    over33: list.filter((f) => f.ms > 33.3).length,
    over50: list.filter((f) => f.ms > 50).length,
    makeMs: +sum('make').toFixed(0),
    handMs: +sum('hand').toFixed(0),
    sculptMs: +sum('sculpt').toFixed(0),
  };
};
const out = {
  file: FILE,
  throttle: THROTTLE,
  worker: !MAIN,
  tapMs: +tapMs.toFixed(0),
  title: stats(title),
  first10: stats(game.slice(0, 600)),
  s10to30: stats(game.slice(600, 1800)),
  after30: stats(game.slice(1800)),
  soundDone,
  bySecond: [],
  longest: [],
};
for (let k = 0; k * 60 < game.length; k++) {
  const w = game.slice(k * 60, k * 60 + 60);
  const mx = w.reduce((a, f) => Math.max(a, f.ms), 0);
  const extra = w.reduce((a, f) => a + f.make + f.hand + f.sculpt, 0);
  out.bySecond.push(`${k}s mean ${(w.reduce((a, f) => a + f.ms, 0) / w.length).toFixed(1)} max ${mx.toFixed(0)} sound+statue ${extra.toFixed(0)}`);
}
out.longest = game
  .map((f, i) => ({ ...f, i }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 12)
  .map((f) => `${(f.i / 60).toFixed(2)} s: ${f.ms.toFixed(1)} ms (making ${f.make.toFixed(1)}, hand-over ${f.hand.toFixed(1)}, statue ${f.sculpt.toFixed(1)})${f.notes.length ? ' ' + f.notes.join('; ') : ''}`);
// every hand-over over a millisecond, wherever it fell
out.handOvers = [...title.map((f, i) => [`title ${(i / 60).toFixed(2)} s`, f]), ...game.map((f, i) => [`${(i / 60).toFixed(2)} s`, f])].flatMap(([t, f]) => f.notes.map((n) => `${t}: ${n}`));
out.logs = logs;
console.log(JSON.stringify(out, null, 1));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
await browser.close();
