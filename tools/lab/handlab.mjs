// Build and screenshot the hand lab: node tools/lab/handlab.mjs [out.png] [look-json]
import * as esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const out = process.argv[2] || 'tools/out/handlab.png';
const look = process.argv[3] || '{}';
const r = await esbuild.build({ entryPoints: ['tools/lab/handlab.js'], bundle: true, write: false, format: 'iife' });
writeFileSync('tools/lab/handlab.html', `<!doctype html><html><body style="margin:0"><script>${r.outputFiles[0].text}</script></body></html>`);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + process.cwd() + '/tools/lab/handlab.html#' + encodeURIComponent(look));
await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
