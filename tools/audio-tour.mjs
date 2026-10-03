// Sound tour: plays the game in headless Chromium at a set of places, hours
// and weathers, records what comes out of the mix (after the compressor)
// for a few seconds at each, and reports the loudness (RMS and peak, left
// and right), the balance of lows, mids and highs, and what was sounding.
// Writes each recording as a WAV file (22 050 Hz, 16-bit stereo) to listen
// to. The pictures are not drawn (draw calls skipped) so the game runs at
// full speed.
// Usage: node tools/audio-tour.mjs [outdir] [--secs N] [--only=id,id]
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && isNaN(+a)) || 'tools/out/audio';
const si = args.indexOf('--secs');
const SECS = si >= 0 ? +args[si + 1] : 7;
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
// no pointer lock: the headless browser floods a locked pointer with mouse
// events, which pile up while a frame is being stepped (see tools/shot.mjs)
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') logs.push('console ' + m.text().slice(0, 200));
});
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(() => {
  const gl = __rhf.game.renderer.getContext();
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
  __rhf.start(false);
  const g = __rhf.game;
  const A = g.audio;
  A.unlock();
  A.ambience.bakery.finish();
  A.setVolumes(0.8, 0);
  g.bears.directorT = 9999;
  // the recorder: after the compressor, before the speakers
  const ctx = A.ctx;
  const proc = ctx.createScriptProcessor(4096, 2, 2);
  window.__rec = { on: false, L: [], R: [] };
  proc.onaudioprocess = (e) => {
    const R = window.__rec;
    const a = e.inputBuffer.getChannelData(0);
    const b = e.inputBuffer.getChannelData(1);
    e.outputBuffer.getChannelData(0).set(a);
    e.outputBuffer.getChannelData(1).set(b);
    if (!R.on) return;
    R.L.push(new Float32Array(a));
    R.R.push(new Float32Array(b));
  };
  A.comp.disconnect();
  A.comp.connect(proc);
  proc.connect(ctx.destination);
  window.__sr = ctx.sampleRate;
});

// The software renderer draws a frame every few seconds at times (it builds
// its graphics programs as it goes), and the sound is updated once a frame:
// so the game's own loop is stopped here and the sound driven on a steady
// clock of its own, 30 times a second, with the world settled once per
// scene. What is heard is what the game would play; only the picture is
// left out.
await page.evaluate(() => {
  const g = __rhf.game;
  cancelAnimationFrame(g.raf);
  g.start = () => {};
  window.__tick = setInterval(() => {
    try {
      g.camera.updateMatrixWorld();
      g.audio.update(1 / 30, g);
    } catch (e) {
      window.__tickErr = String(e && e.message);
    }
  }, 1000 / 30);
});

const SCENES = [
  ['forest-dawn', 'A spruce forest at dawn: the chorus', "const p=g.world.place('landing'); const W=g.world; let best=null; for(let r=40;r<500&&!best;r+=20) for(let a=0;a<24;a++){const x=p.x+Math.cos(a/24*6.283)*r, z=p.z+Math.sin(a/24*6.283)*r; if(!W.inBounds(x,z)) continue; if(W.forest[W.cellIndex(x,z)]>200 && !W.waterAt(x,z) && W.riverD[W.cellIndex(x,z)]>200){best={x,z};break;}} g.player.place(best.x,best.z,0); g.env.setTime(5.6); w.cloud=0.2; w.rain=0; w.wet=0;"],
  ['meadow-noon', 'An open meadow at midday, a breeze', "const p=g.world.place('moose'); g.player.place(p.x+40,p.z-30,0); g.env.setTime(12.5); w.cloud=0.3; w.rain=0; w.wet=0;"],
  ['river', 'Beside the river at Salmon Bend', "const p=g.world.place('bend'); g.player.place(p.x,p.z,p.face); g.env.setTime(10); w.cloud=0.3; w.rain=0; w.wet=0;"],
  ['falls', 'Bear Falls, close to', "const W=g.world; const f=W.river.sample(W.fallsS+12); g.player.place(f.x+12,f.z,1.6); g.env.setTime(14); w.cloud=0.3; w.rain=0; w.wet=0;"],
  ['coast', 'The shore by Halibut Pier, waves breaking', "const p=g.props.layout.parking.pier; g.player.place(p.x,p.z,0); g.env.setTime(15); w.cloud=0.4; w.rain=0; w.wet=0;"],
  ['rain-forest', 'Heavy rain in the forest, thunder', "const p=g.world.place('landing'); g.player.place(p.x+60,p.z+60,0); g.env.setTime(16); w.cloud=0.95; w.rain=0.9; w.wet=1; g.audio.ambience.thunderT=1.5;"],
  ['tundra-wind', 'Wind on the high tundra', "const p=g.world.place('tundra'); g.player.place(p.x,p.z,0); g.env.setTime(13); w.cloud=0.5; w.rain=0; w.wet=0;"],
  ['flats', 'Mosquito Flats in the evening', "const p=g.world.place('flats'); g.player.place(p.x,p.z,0); g.env.setTime(19.5); w.cloud=0.2; w.rain=0; w.wet=0;"],
  ['night', 'Night in the forest: an owl, a loon, wolves', "const p=g.world.place('landing'); const W=g.world; let best=null; for(let r=40;r<500&&!best;r+=20) for(let a=0;a<24;a++){const x=p.x+Math.cos(a/24*6.283)*r, z=p.z+Math.sin(a/24*6.283)*r; if(!W.inBounds(x,z)) continue; if(W.forest[W.cellIndex(x,z)]>200 && !W.waterAt(x,z)){best={x,z};break;}} g.player.place(best.x,best.z,0); g.env.setTime(1.5); w.cloud=0.1; w.rain=0; w.wet=0; g.audio.wolfT=2;"],
  ['footsteps', 'Footsteps: the forest floor, gravel, snow and boards', "const p=g.world.place('landing'); const W=g.world; let best=null; for(let r=40;r<500&&!best;r+=20) for(let a=0;a<24;a++){const x=p.x+Math.cos(a/24*6.283)*r, z=p.z+Math.sin(a/24*6.283)*r; if(!W.inBounds(x,z)) continue; if(W.forest[W.cellIndex(x,z)]>200 && !W.waterAt(x,z) && W.riverD[W.cellIndex(x,z)]>200){best={x,z};break;}} g.player.place(best.x,best.z,0); g.env.setTime(11); w.cloud=0.3; w.rain=0; w.wet=0; window.__steps=[1,1,1,1,1,1,5,5,5,5,5,5,3,3,3,3,-1,-1,-1,-1];"],
];

const results = [];
for (const [id, label, setup] of SCENES) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  const r = await page.evaluate(
    async ({ setup, secs }) => {
      const g = __rhf.game;
      const w = g.env.weather;
      w.cloudTarget = undefined;
      new Function('g', 'w', setup)(g, w);
      w.cloudTarget = w.cloud;
      w.rainTarget = w.rain;
      w.timer = 9999;
      __rhf.settle();
      // the player's camera and the world brought to the new place (the
      // loop that would do it is stopped)
      for (let i = 0; i < 3; i++) {
        g.dt = 1 / 30;
        g.player.applyCamera(g.camera);
        g.updateWorld(1 / 30);
      }
      const A = g.audio;
      // the singers start afresh in each place
      A.ambience.singers = [];
      A.ambience.singT = 0;
      A.ambience.senseT = 0;
      // a few seconds for the place to be heard and the first singers to
      // settle on their perches
      await new Promise((res) => setTimeout(res, 3500));
      const frames0 = g.menuFrame;
      const R = window.__rec;
      R.L = [];
      R.R = [];
      R.on = true;
      const heard = new Set();
      const t0 = performance.now();
      // a footstep every 0.45 s from the list, when the scene has one
      const steps = window.__steps;
      window.__steps = null;
      let si = 0;
      const stepper = steps
        ? setInterval(() => {
            if (si < steps.length) A.step(steps[si++], null, false);
          }, 450)
        : null;
      let mozzies = false;
      while (performance.now() - t0 < secs * 1000) {
        await new Promise((res) => setTimeout(res, 250));
        for (const s of A.ambience.singers) heard.add(s.sp);
        if (A.ambience.mozzies) mozzies = true;
      }
      if (stepper) clearInterval(stepper);
      R.on = false;
      const frames = g.menuFrame - frames0;
      const join = (parts) => {
        const n = parts.reduce((a, p) => a + p.length, 0);
        const o = new Float32Array(n);
        let k = 0;
        for (const p of parts) {
          o.set(p, k);
          k += p.length;
        }
        return o;
      };
      const L = join(R.L);
      const Rr = join(R.R);
      const stats = (x) => {
        let s = 0;
        let pk = 0;
        for (let i = 0; i < x.length; i++) {
          s += x[i] * x[i];
          pk = Math.max(pk, Math.abs(x[i]));
        }
        return { rms: Math.sqrt(s / Math.max(1, x.length)), peak: pk };
      };
      // the balance of lows, mids and highs: energy in crude bands, from
      // one-pole filters
      const bands = (x, sr) => {
        let lp1 = 0;
        let lp2 = 0;
        let lo = 0;
        let mid = 0;
        let hi = 0;
        const a1 = 1 - Math.exp((-2 * Math.PI * 300) / sr);
        const a2 = 1 - Math.exp((-2 * Math.PI * 3000) / sr);
        for (let i = 0; i < x.length; i++) {
          lp1 += (x[i] - lp1) * a1;
          lp2 += (x[i] - lp2) * a2;
          lo += lp1 * lp1;
          mid += (lp2 - lp1) * (lp2 - lp1);
          hi += (x[i] - lp2) * (x[i] - lp2);
        }
        const t = lo + mid + hi || 1;
        return { lo: lo / t, mid: mid / t, hi: hi / t };
      };
      // 22 050 Hz, 16-bit stereo WAV
      const sr = window.__sr;
      const step = sr / 22050;
      const n = Math.floor(L.length / step);
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        const j = Math.floor(i * step);
        pcm[i * 2] = Math.max(-32767, Math.min(32767, L[j] * 32767));
        pcm[i * 2 + 1] = Math.max(-32767, Math.min(32767, Rr[j] * 32767));
      }
      const head = new DataView(new ArrayBuffer(44));
      const str = (o, s) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      head.setUint32(4, 36 + pcm.byteLength, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      head.setUint32(16, 16, true);
      head.setUint16(20, 1, true);
      head.setUint16(22, 2, true);
      head.setUint32(24, 22050, true);
      head.setUint32(28, 22050 * 4, true);
      head.setUint16(32, 4, true);
      head.setUint16(34, 16, true);
      str(36, 'data');
      head.setUint32(40, pcm.byteLength, true);
      const bytes = new Uint8Array(44 + pcm.byteLength);
      bytes.set(new Uint8Array(head.buffer), 0);
      bytes.set(new Uint8Array(pcm.buffer), 44);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      const H = A.ambience.here;
      return {
        L: stats(L),
        R: stats(Rr),
        bands: bands(L, sr),
        heard: [...heard],
        here: Object.fromEntries(['forest', 'open', 'tundra', 'shore', 'river', 'falls', 'sea', 'lake', 'flats'].map((k) => [k, +(H[k] || 0).toFixed(2)])),
        beds: Object.entries(A.ambience.beds)
          .filter(([, b]) => b.on && (b.last || 0) > 0.002)
          .map(([k, b]) => `${k} ${b.last.toFixed(3)}`),
        voices: A.ambience.voices,
        mozzies,
        fps: +(frames / secs).toFixed(0),
        tickErr: window.__tickErr || null,
        wav: btoa(bin),
      };
    },
    { setup, secs: SECS }
  );
  writeFileSync(`${outDir}/${id}.wav`, Buffer.from(r.wav, 'base64'));
  delete r.wav;
  results.push({ id, label, ...r });
  const db = (x) => (20 * Math.log10(Math.max(1e-6, x))).toFixed(1);
  console.log(`${id.padEnd(12)} RMS ${db(r.L.rms)}/${db(r.R.rms)} dB, peak ${db(Math.max(r.L.peak, r.R.peak))} dB | lo ${(r.bands.lo * 100).toFixed(0)}% mid ${(r.bands.mid * 100).toFixed(0)}% hi ${(r.bands.hi * 100).toFixed(0)}% | ${r.tickErr ? 'ERROR ' + r.tickErr + ' | ' : ''}singers ${r.heard.join(',') || '-'}${r.mozzies ? ' | mosquitoes' : ''}\n             beds: ${r.beds.join(', ')}\n             here: ${JSON.stringify(r.here)}`);
}
writeFileSync(`${outDir}/audio-tour.json`, JSON.stringify({ results, logs }, null, 1));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
