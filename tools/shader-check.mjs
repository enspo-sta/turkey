// Every shader program the game builds, built without an error: the
// development build (which checks each program as it is first used; the
// release build skips the check) at High, Medium and Low, with everything
// in the world and the hands compiled and drawn once at each (the game's own
// precompile and warm-up draw), then frames at morning, sunset, night and in
// rain. Reports programs that failed and every error or warning printed.
// Usage: node build.mjs --dev, copy dist/index.html aside, node build.mjs, then
// node tools/shader-check.mjs path/to/dev/index.html
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const file = resolve(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
const msgs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text().slice(0, 600)}`);
});
page.on('pageerror', (e) => msgs.push('[pageerror] ' + e.message));
const t0 = Date.now();
await page.goto('file://' + file);
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 900000, polling: 1000 });
console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const res = await page.evaluate(async () => {
  const g = __rhf.game;
  const s = __rhf.session;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  __rhf.start(false);
  await wait(3000);
  cancelAnimationFrame(g.raf);
  g.state.settings.autoQuality = false;
  const we = g.env.weather;
  we.timer = 1e9;
  const out = [];
  for (const q of ['high', 'medium', 'low', 'high']) {
    g.setQuality(q);
    try {
      await s.precompile();
      s.warmDraw();
    } catch (e) {
      out.push(`${q}: precompile or warm-up failed: ${e.message}`);
    }
    for (const t of [8, 21.6, 0.5, 13]) {
      g.env.setTime(t);
      for (let i = 0; i < 3; i++) g.frame();
    }
    we.cloud = we.cloudTarget = 1;
    we.rain = we.rainTarget = 1;
    for (let i = 0; i < 3; i++) g.frame();
    we.cloud = we.cloudTarget = 0.2;
    we.rain = we.rainTarget = 0;
    for (let i = 0; i < 2; i++) g.frame();
    out.push(`${q}: ${g.renderer.info.programs.length} programs so far`);
  }
  const bad = g.renderer.info.programs
    .filter((p) => p.diagnostics && !p.diagnostics.runnable)
    .map((p) => `${p.name}: ${(p.diagnostics.programLog || '').slice(0, 300)} | ${(p.diagnostics.vertexShader?.log || '').slice(0, 300)} | ${(p.diagnostics.fragmentShader?.log || '').slice(0, 300)}`);
  return { out, bad, programs: g.renderer.info.programs.length, names: g.renderer.info.programs.map((p) => p.name) };
});
for (const l of res.out) console.log(l);
console.log(`programs ${res.programs}; failed ${res.bad.length}`);
for (const b of res.bad) console.log('FAILED ' + b);
const names = {};
for (const n of res.names) names[n] = (names[n] || 0) + 1;
console.log('by name: ' + Object.entries(names).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`${msgs.length} errors or warnings printed`);
const seen = new Set();
for (const m of msgs) {
  const key = m.slice(0, 160);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(m);
}
await browser.close();
