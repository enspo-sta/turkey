// Headless screenshot harness. Loads dist/index.html in Chromium (SwiftShader
// WebGL), waits for the game, runs optional scripted steps and saves PNGs.
// Usage: node tools/shot.mjs <scenario.json|inline-json> [outdir]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const arg = process.argv[2] || '{}';
const scenario = arg.trim().startsWith('{') || arg.trim().startsWith('[') ? JSON.parse(arg) : JSON.parse(readFileSync(arg, 'utf8'));
const outDir = process.argv[3] || 'tools/out';
mkdirSync(outDir, { recursive: true });

const width = scenario.width || 1280;
const height = scenario.height || 720;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(process.env.SHOT_FLAGS ? process.env.SHOT_FLAGS.split(' ') : [])],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: scenario.dpr || 1,
  hasTouch: !!scenario.touch,
  isMobile: !!scenario.mobile,
  userAgent: scenario.ua,
  // frozen CSS animations, so banners and toasts show in the pictures
  reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
});
const page = await context.newPage();
// A locked pointer gets a steady stream of mouse events from the headless
// browser, and while a slow software draw holds the page they pile up in
// both processes (gigabytes in a minute) and slow everything down: no
// pointer lock unless the scenario is about it.
if (!scenario.pointerLock) await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
const url = 'file://' + resolve(scenario.file || 'dist/index.html') + (scenario.hash ? '#' + scenario.hash : '');
const t0 = Date.now();
await page.goto(url, { timeout: scenario.timeout || 120000 });
try {
  await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: scenario.timeout || 120000 });
} catch (e) {
  console.log('TIMEOUT waiting for ready');
}
console.log('ready after', Date.now() - t0, 'ms');
const steps = scenario.steps || [{ wait: 1500 }, { shot: 'default' }];
for (const s of steps) {
  if (s.eval) {
    try {
      const r = await page.evaluate(s.eval);
      if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
    } catch (e) {
      console.log('eval error:', e.message);
    }
  }
  // evaluate to a data URL and save it as a file (debug images)
  if (s.saveEval) {
    try {
      const url = await page.evaluate(s.saveEval);
      const b64 = String(url).split(',')[1] || '';
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${outDir}/${s.file}`, Buffer.from(b64, 'base64'));
      console.log('saved', s.file);
    } catch (e) {
      console.log('saveEval error:', e.message);
    }
  }
  // resize the page (a phone turned, another device)
  if (s.viewport) {
    await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] });
    console.log('viewport', s.viewport.join(' by '));
  }
  if (s.wait) await page.waitForTimeout(s.wait);
  // reload the page (to continue from a save) and wait for the game again
  if (s.reload) {
    // (loading the game can take longer than the default 30 s in software)
    await page.reload({ timeout: scenario.timeout || 120000 });
    try {
      await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: scenario.timeout || 120000 });
      console.log('reloaded');
    } catch (e) {
      console.log('TIMEOUT waiting for ready after reload');
    }
  }
  // wait until something in the page holds (a fade over, a show ended);
  // polled on a timer, as a headless page draws few frames
  if (s.waitFor) {
    try {
      await page.waitForFunction(s.waitFor, null, { timeout: s.timeout || 60000, polling: 250 });
    } catch (e) {
      console.log('waitFor timed out:', s.waitFor);
    }
  }
  if (s.tap) await page.touchscreen.tap(s.tap[0], s.tap[1]);
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  // real taps and clicks on the centre of an element, found by CSS selector
  if (s.tapSel || s.clickSel) {
    const sel = s.tapSel || s.clickSel;
    const box = await page.evaluate((q) => {
      const el = document.querySelector(q);
      if (!el) return null;
      // like a player would, scroll it into view first
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, sel);
    if (!box || !box.w) console.log('no element or not visible:', sel);
    else {
      if (s.tapSel) await page.touchscreen.tap(box.x, box.y);
      else await page.mouse.click(box.x, box.y);
      console.log(`${s.tapSel ? 'tapped' : 'clicked'} ${sel} at ${Math.round(box.x)},${Math.round(box.y)}`);
    }
  }
  if (s.key) await page.keyboard.press(s.key);
  if (s.keydown) await page.keyboard.down(s.keydown);
  if (s.keyup) await page.keyboard.up(s.keyup);
  if (s.shot) {
    // the software renderer runs at about one frame a second, too slow for
    // the game's two terrain chunks a frame after a jump: finish the ground
    // around the camera and wait for two frames that show it
    if (!s.noSettle) {
      try {
        await page.evaluate(async () => {
          const r = window.__rhf;
          if (!r || !r.settle || !r.game) return;
          r.settle();
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        });
      } catch (e) {
        console.log('settle error:', e.message);
      }
    }
    try {
      // a name ending in .jpg saves a compressed JPEG (for docs), anything else a PNG
      const jpg = s.shot.endsWith('.jpg');
      await page.screenshot({ path: jpg ? `${outDir}/${s.shot}` : `${outDir}/${s.shot}.png`, type: jpg ? 'jpeg' : 'png', quality: jpg ? s.quality || 84 : undefined, timeout: s.shotTimeout || 900000 });
      console.log('shot', s.shot);
    } catch (e) {
      console.log('SHOT FAILED', s.shot, e.message.split('\n')[0]);
      console.log(logs.slice(-40).join('\n'));
      break;
    }
  }
}
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
