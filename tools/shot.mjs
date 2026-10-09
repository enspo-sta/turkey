// Headless screenshot harness. Loads dist/index.html in Chromium (SwiftShader
// WebGL), waits for the game, runs optional scripted steps and saves PNGs.
// Usage: node tools/shot.mjs <scenario.json|inline-json> [outdir]
//
// Checks: an eval step with "expect" (an expression of r, the eval's
// result, run here in Node) fails when the expression is false or throws;
// a "check" step (an expression run in the page) fails when it is not
// true. "label" names either in the output. The run ends with a CHECKS line
// and exits with code 1 when any check failed or the page threw an error;
// with "strict": true in the scenario, also when a waitFor timed out, an
// element to tap was missing, an eval threw or a shot failed.
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
// a scenario's own script run before the page's (to imitate a browser that
// lacks an API, say)
if (scenario.init) await page.addInitScript({ content: scenario.init });
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
const checks = { passed: 0, failed: [] };
const problems = [];
const short = (v) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t && t.length > 300 ? t.slice(0, 300) + '…' : t;
};
const verdict = (label, ok, got, why) => {
  if (ok) {
    checks.passed++;
    console.log(`CHECK ok: ${label}`);
  } else {
    checks.failed.push(label);
    console.log(`CHECK FAILED: ${label}${why ? ` (${why})` : ''}; got ${short(got)}`);
  }
};
for (const s of steps) {
  if (s.eval) {
    try {
      const r = await page.evaluate(s.eval);
      if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
      if (s.expect) {
        let ok = false;
        let why = '';
        try {
          ok = !!new Function('r', `return (${s.expect});`)(r);
        } catch (e) {
          why = e.message;
        }
        verdict(s.label || s.expect, ok, r, why);
      }
    } catch (e) {
      console.log('eval error:', e.message);
      problems.push('eval error: ' + e.message.split('\n')[0]);
      if (s.expect) verdict(s.label || s.expect, false, null, 'the eval threw: ' + e.message.split('\n')[0]);
    }
  }
  if (s.check) {
    let r;
    let why = '';
    try {
      r = await page.evaluate(s.check);
    } catch (e) {
      why = e.message.split('\n')[0];
    }
    verdict(s.label || s.check, r === true, r, why);
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
      problems.push('waitFor timed out: ' + s.waitFor);
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
    if (!box || !box.w) {
      console.log('no element or not visible:', sel);
      problems.push('no element or not visible: ' + sel);
    }
    else {
      if (s.tapSel) await page.touchscreen.tap(box.x, box.y);
      else await page.mouse.click(box.x, box.y);
      console.log(`${s.tapSel ? 'tapped' : 'clicked'} ${sel} at ${Math.round(box.x)},${Math.round(box.y)}`);
    }
  }
  // a finger drag (a mouse drag on a scenario without touch) from x0,y0 to
  // x1,y1: an array, or an expression in the page that gives one (or null
  // when there is nothing to drag, or a sentence saying why it cannot)
  if (s.drag) {
    const d = typeof s.drag === 'string' ? await page.evaluate(s.drag) : s.drag;
    if (d === null) console.log('drag: not needed');
    else if (typeof d === 'string') console.log('drag:', d);
    else if (!Array.isArray(d) || d.length < 4) console.log('drag: no coordinates from', s.drag);
    else {
      const [x0, y0, x1, y1] = d;
      const n = s.dragSteps || 12;
      const at = (i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
      if (scenario.touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
        for (let i = 1; i <= n; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(x0, y0);
        await page.mouse.down();
        for (let i = 1; i <= n; i++) await page.mouse.move(at(i).x, at(i).y);
        await page.mouse.up();
      }
      console.log(`dragged from ${Math.round(x0)},${Math.round(y0)} to ${Math.round(x1)},${Math.round(y1)}`);
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
      problems.push('shot failed: ' + s.shot);
      console.log(logs.slice(-40).join('\n'));
      break;
    }
  }
}
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
const pageErrors = logs.filter((l) => l.startsWith('[pageerror]'));
const failedAll = checks.failed.length || pageErrors.length || (scenario.strict && problems.length);
console.log(
  `CHECKS ${checks.passed} passed, ${checks.failed.length} failed` +
    (pageErrors.length ? `; ${pageErrors.length} page errors` : '') +
    (scenario.strict && problems.length ? `; ${problems.length} problems: ${problems.join(' | ')}` : '')
);
if (failedAll) process.exitCode = 1;
