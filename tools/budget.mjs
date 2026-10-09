// The frame budget: how many draw calls and triangles the High preset asks
// of the device at ten fixed views, against the budget in
// tools/budget.json. Draw calls are the measured main cost of a frame (the
// processor's work per call), and both counts are the same on any machine,
// unlike times: a feature that adds to them has to fit the budget, or the
// budget is raised on purpose (--update) and the reason given in the commit.
// Exits with code 1 when a view is over budget by more than the margin.
// Usage: node tools/budget.mjs [build.html] [--update]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--')) || 'dist/index.html';
const UPDATE = args.includes('--update');
const BUDGET = 'tools/budget.json';

// [name, set-up code (g: the game)], as in tools/same-frame.mjs
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
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  Element.prototype.requestPointerLock = () => Promise.resolve();
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(async () => {
  __rhf.start(false);
  const g = __rhf.game;
  if (g.raf) cancelAnimationFrame(g.raf);
  g.start = () => {};
  g.state.settings.autoQuality = false;
  g.adaptResolution = () => {};
  g.setQuality('high');
  g.bears.directorT = 1e9;
  g.env.timeScale = 0;
  g.hud.show(false);
  const S = g.scientists;
  for (let i = 0; i < 600 && S && (S.queue?.length || S.workers?.length); i++) await new Promise((r) => setTimeout(r, 100));
  g.tesla.finishSculpt?.();
});

const now = {};
for (const [name, setup] of VIEWS) {
  now[name] = await page.evaluate((setup) => {
    const g = __rhf.game;
    g.env.weather.cloud = 0.2;
    g.env.weather.cloudTarget = 0.2;
    g.env.weather.rain = 0;
    g.env.weather.rainTarget = 0;
    new Function('g', setup)(g);
    __rhf.settle && __rhf.settle();
    const t = performance.now();
    const real = performance.now;
    performance.now = () => t;
    for (let i = 0; i < 12; i++) {
      g.dt = 1 / 60;
      g.time += 1 / 60;
      for (const s of g.systems) s.update?.(1 / 60, g);
      g.updateWorld(1 / 60);
      g.render();
    }
    g.renderer.info.autoReset = false;
    g.renderer.info.reset();
    g.render();
    const out = { calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles };
    g.renderer.info.autoReset = true;
    performance.now = real;
    return out;
  }, setup);
}
await browser.close();

if (UPDATE || !existsSync(BUDGET)) {
  const margin = 0.03;
  writeFileSync(BUDGET, JSON.stringify({ note: 'Draw calls and triangles of one High frame at each view (tools/budget.mjs). Raise only on purpose.', margin, views: now }, null, 1) + '\n');
  console.log(`budget written to ${BUDGET}`);
  for (const [k, v] of Object.entries(now)) console.log(`${k.padEnd(16)} ${String(v.calls).padStart(5)} calls ${String(v.triangles).padStart(9)} triangles`);
  process.exit(errors.length ? 1 : 0);
}
const budget = JSON.parse(readFileSync(BUDGET, 'utf8'));
let over = 0;
for (const [k, v] of Object.entries(now)) {
  const b = budget.views[k];
  if (!b) {
    console.log(`${k}: no budget`);
    over++;
    continue;
  }
  const lim = (x) => Math.floor(x * (1 + budget.margin));
  const bad = v.calls > lim(b.calls) || v.triangles > lim(b.triangles);
  if (bad) over++;
  const d = (a, c) => `${a - c >= 0 ? '+' : ''}${(((a - c) / c) * 100).toFixed(1)}%`;
  console.log(`${bad ? 'OVER' : 'ok  '} ${k.padEnd(16)} ${String(v.calls).padStart(5)} calls (budget ${b.calls}, ${d(v.calls, b.calls)}) ${String(v.triangles).padStart(9)} triangles (budget ${b.triangles}, ${d(v.triangles, b.triangles)})`);
}
if (errors.length) console.log('page errors:', errors.join(' | '));
console.log(over ? `BUDGET: ${over} views over` : 'BUDGET: every view within budget');
if (over || errors.length) process.exitCode = 1;
