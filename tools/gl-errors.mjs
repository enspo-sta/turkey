// Which draw calls the browser rejects (a WebGL error such as
// GL_INVALID_OPERATION, after which the call draws nothing): the same steps as
// tools/shader-check.mjs (High, Medium and Low, each with the game's
// precompile and warm-up draw, then morning, sunset, night, noon and rain),
// with gl.getError() read after every draw. Each rejected draw is reported
// with its object's path in the scene, its material, the pass and the step.
// Usage: node build.mjs --dev, copy dist/index.html aside, node build.mjs, then
// node tools/gl-errors.mjs path/to/dev/index.html
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const file = resolve(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
await page.goto('file://' + file);
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 900000, polling: 1000 });
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
  const r = g.renderer;
  const gl = r.getContext();
  const found = new Map();
  let state = '';
  const orig = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    while (gl.getError() !== gl.NO_ERROR);
    const ret = orig.apply(this, arguments);
    const e = gl.getError();
    if (e !== gl.NO_ERROR) {
      let path = object.name || object.type;
      for (let p = object.parent; p; p = p.parent) path = (p.name || p.type) + '/' + path;
      const key = path + ' | ' + material.type + (material.name ? ' ' + material.name : '') + (scene === null ? ' (shadow pass)' : '') + ' | err ' + e;
      const f = found.get(key) || { n: 0, states: new Set() };
      f.n++;
      f.states.add(state);
      found.set(key, f);
    }
    return ret;
  };
  for (const q of ['high', 'medium', 'low', 'high']) {
    g.setQuality(q);
    try {
      await s.precompile();
      state = q + ' warm-up';
      s.warmDraw();
    } catch (e) {}
    for (const t of [8, 21.6, 0.5, 13]) {
      g.env.setTime(t);
      state = q + ' ' + t + 'h';
      for (let i = 0; i < 3; i++) g.frame();
    }
    we.cloud = we.cloudTarget = 1;
    we.rain = we.rainTarget = 1;
    state = q + ' rain';
    for (let i = 0; i < 3; i++) g.frame();
    we.cloud = we.cloudTarget = 0.2;
    we.rain = we.rainTarget = 0;
    for (let i = 0; i < 2; i++) g.frame();
  }
  r.renderBufferDirect = orig;
  return [...found.entries()].map(([k, v]) => `${v.n}x ${k} | ${[...v.states].join(', ')}`);
});
console.log(res.length ? res.join('\n') : 'no rejected draws');
await browser.close();
