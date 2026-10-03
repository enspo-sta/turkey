// Times loading and the first frames after pressing New game, and counts the
// shaders built after loading (each one a stall on a phone).
// Usage: node tools/first-frame.mjs [path/to/index.html]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const file = resolve(process.argv[2] || 'dist/index.html');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
// no pointer lock (see tools/shot.mjs)
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const t0 = Date.now();
await page.goto('file://' + file);
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 600000, polling: 500 });
console.log(`file ${file}`);
console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.evaluate(() => cancelAnimationFrame(__rhf.game.raf));
const t = (label, fn) =>
  page.evaluate(
    ([label, fn]) => {
      const t0 = performance.now();
      let err = '';
      try {
        new Function(fn)();
      } catch (e) {
        err = ' ERROR ' + e.message;
      }
      return `${label}: ${(performance.now() - t0).toFixed(0)} ms, programs ${__rhf.game.renderer.info.programs.length}${err}`;
    },
    [label, fn]
  );
console.log(await t('title frame 1', '__rhf.game.frame()'));
console.log(await t('title frame 2', '__rhf.game.frame()'));
console.log(await t('start game', 'cancelAnimationFrame(__rhf.game.raf); __rhf.session.startGame(false); cancelAnimationFrame(__rhf.game.raf);'));
for (let i = 1; i <= 6; i++) console.log(await t('game frame ' + i, '__rhf.game.frame()'));
await browser.close();
