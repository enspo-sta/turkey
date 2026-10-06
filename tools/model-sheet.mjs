// A sheet of the animal models alone: each model built from
// src/entities/animalmodels.js, lit by a plain sun and sky over a grey
// ground and framed by its own size, in a grid of tiles. Much quicker than
// posing each one in the game, for working on the models.
// Usage: node tools/model-sheet.mjs out.png [names] [--pose=rest|flight]
//   [--tile=420x300] [--view=0.95,0.42,1] (the direction the camera looks from)
//   [--detail=near|far] (far: the low detail drawn for a herd far off)
//   names: comma-separated model functions without "Model" (moose,eagle),
//   or "all" (the default). The rest pose shows a bird's folded wings, the
//   flight pose its open ones (see animatedMaterial).
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const out = process.argv[2] || 'tools/out/model-sheet.png';
const names = (process.argv.slice(3).find((a) => !a.startsWith('--')) || 'all').split(',');
const pose = (process.argv.find((a) => a.startsWith('--pose=')) || '--pose=rest').slice(7);
const tile = (process.argv.find((a) => a.startsWith('--tile=')) || '--tile=420x300').slice(7).split('x').map(Number);
const view = (process.argv.find((a) => a.startsWith('--view=')) || '--view=0.95,0.42,1').slice(7).split(',').map(Number);
const detail = (process.argv.find((a) => a.startsWith('--detail=')) || '--detail=near').slice(9);

const entry = `
import * as THREE from 'three';
import * as M from ${JSON.stringify(resolve('src/entities/animalmodels.js'))};
import { lowDetail } from ${JSON.stringify(resolve('src/entities/animalkit.js'))};
const want = ${JSON.stringify(names)};
const pose = ${JSON.stringify(pose)};
const list = Object.keys(M).filter((k) => k.endsWith('Model') && (want[0] === 'all' || want.includes(k.slice(0, -5))));
const W = ${tile[0]}, H = ${tile[1]}, COLS = Math.min(4, list.length), ROWS = Math.ceil(list.length / COLS);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W * COLS, H * ROWS);
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const info = [];
list.forEach((k, i) => {
  const geo = ${JSON.stringify(detail)} === 'far' ? lowDetail(() => M[k]()) : M[k]();
  // the limbs' rest or flight pose, as the shader would place them: open
  // wings hidden at rest, folded ones in flight, and in flight a walking
  // bird's legs trailing (limbs 10, 11), a long neck stretched forward (12)
  // and the head on it carried to its end, level (13)
  const limb = geo.attributes.aLimb;
  if (limb) {
    const p = geo.attributes.position, piv = geo.attributes.aPivot, nr = geo.attributes.normal;
    const nk = geo.userData.neck || [0, 0, 0];
    for (let v = 0; v < p.count; v++) {
      const L = limb.getX(v);
      const hide = pose === 'rest' ? L > 6.5 && L < 8.5 : L > 8.5 && L < 9.5;
      if (hide) p.setXYZ(v, piv.getX(v), piv.getY(v), piv.getZ(v));
      if (pose !== 'flight' || L < 9.5) continue;
      if (L > 12.5) {
        const c = Math.cos(1.15), s = Math.sin(1.15);
        p.setXYZ(v, p.getX(v), p.getY(v) + c * nk[1] - s * nk[2] - nk[1], p.getZ(v) + s * nk[1] + c * nk[2] - nk[2]);
        continue;
      }
      const a = L < 11.5 ? 1.35 : 1.15;
      const c = Math.cos(a), s = Math.sin(a);
      const y = p.getY(v) - piv.getY(v), z = p.getZ(v) - piv.getZ(v);
      p.setXYZ(v, p.getX(v), piv.getY(v) + c * y - s * z, piv.getZ(v) + s * y + c * z);
      const ny = nr.getY(v), nz = nr.getZ(v);
      nr.setXYZ(v, nr.getX(v), c * ny - s * nz, s * ny + c * nz);
    }
  }
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = new THREE.Vector3(), c = new THREE.Vector3();
  b.getSize(s); b.getCenter(c);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4e4);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x5a5444, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x8a8a7a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = Math.min(0, b.min.y) - 0.002;
  scene.add(ground);
  const R = Math.max(s.x, s.y, s.z) * 0.62 + 0.05;
  const cam = new THREE.PerspectiveCamera(30, W / H, R * 0.05, R * 40);
  const dir = new THREE.Vector3(${view[0]}, ${view[1]}, ${view[2]}).normalize();
  cam.position.copy(c).addScaledVector(dir, R / Math.sin((15 * Math.PI) / 180));
  cam.lookAt(c);
  const x = (i % COLS) * W, y = (ROWS - 1 - Math.floor(i / COLS)) * H;
  renderer.setViewport(x, y, W, H);
  renderer.setScissor(x, y, W, H);
  renderer.render(scene, cam);
  info.push(k.slice(0, -5) + ' ' + tris + ' triangles, ' + geo.attributes.position.count + ' vertices, ' + s.x.toFixed(2) + ' x ' + s.y.toFixed(2) + ' x ' + s.z.toFixed(2) + ' m');
});
window.__sheet = { url: renderer.domElement.toDataURL('image/png'), info, cols: COLS, names: list.map((k) => k.slice(0, -5)) };
`;
const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
const res = await esbuild.build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'error' });
const html = join(dir, 'sheet.html');
writeFileSync(html, `<!doctype html><html><body style="margin:0"><script>${res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('file://' + html);
await page.waitForFunction(() => window.__sheet, null, { timeout: 120000 }).catch(() => {});
const sheet = await page.evaluate(() => window.__sheet);
await browser.close();
if (!sheet) {
  console.log('no sheet', errs.join('\n'));
  process.exit(1);
}
writeFileSync(out, Buffer.from(sheet.url.split(',')[1], 'base64'));
console.log(sheet.info.join('\n'));
console.log('wrote', out, errs.length ? 'errors: ' + errs.join(' | ') : '');
