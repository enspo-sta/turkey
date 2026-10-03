// The same view with and without leaving out the small parts (see
// src/world/detailcull.js), compared pixel by pixel: the culling must not
// change the picture. Two views: the Coast Road and Hotrod Landing, at
// 640 by 360, the clock stopped between the two pictures.
// Usage: node tools/cull-compare.mjs [path/to/index.html]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = 640;
const H = 360;
const page = await browser.newPage({ viewport: { width: W, height: H } });
// no pointer lock (see tools/shot.mjs)
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
await page.goto('file://' + resolve(process.argv[2] || 'dist/index.html'));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(() => {
  __rhf.start(false);
  cancelAnimationFrame(__rhf.game.raf);
  __rhf.game.start = () => {};
});
for (const spot of ['road', 'landing']) {
  const res = await page.evaluate(async (spot) => {
    const g = __rhf.game;
    g.dpr = 1;
    g.renderer.setPixelRatio(1);
    g.resize();
    g.hud.show(false);
    if (spot === 'road') {
      const r = g.world.roads[0];
      const q = r.path.sample(r.path.length * 0.35);
      g.player.place(q.x, q.z, Math.atan2(-q.tx, -q.tz));
    } else {
      const p = g.world.place(spot);
      g.player.place(p.x, p.z, (p.face ?? 0) + 2.2);
    }
    g.env.setTime(14);
    g.env.weather.cloud = 0.2;
    g.env.weather.cloudTarget = 0.2;
    g.env.weather.rain = 0;
    g.env.weather.rainTarget = 0;
    __rhf.settle();
    const step = () => {
      g.timer.getDelta = () => 1 / 60;
      for (const s of g.systems) s.update?.(0, g);
      g.updateWorld(0);
      g.render();
    };
    for (let i = 0; i < 8; i++) step();
    const gl = g.renderer.getContext();
    const grab = () => {
      const R = g.renderer;
      R.info.autoReset = false;
      R.info.reset();
      g.render();
      const calls = R.info.render.calls;
      R.info.autoReset = true;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { px, w, h, calls };
    };
    // the clock stands still between the two pictures
    g.time = 100;
    g.sharedUniforms.uTime.value = 100;
    const a = grab();
    const items = g.detailCull.items;
    const hiddenN = items.filter((i) => i.hidden).length;
    g.detailCull.reset();
    const save = g.detailCull.update;
    g.detailCull.update = () => {};
    const b = grab();
    g.detailCull.update = save;
    let diff = 0;
    let maxd = 0;
    for (let i = 0; i < a.px.length; i += 4) {
      const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]));
      if (d > 24) diff++;
      if (d > maxd) maxd = d;
    }
    return `${spot}: ${hiddenN} of ${items.length} parts culled; calls ${a.calls} with, ${b.calls} without; pixels differing by more than 24 levels: ${diff} of ${a.w * a.h} (largest difference ${maxd})`;
  }, spot);
  console.log(res);
}
await browser.close();
