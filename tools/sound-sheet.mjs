// Sound sheet: every sound effect, animal call, engine and the music of a
// build, played one at a time in headless Chromium and recorded from the mix
// (the last node before the speakers: the limiter, or the compressor in older
// builds), with the place's own sound and the music silenced (but for the
// music's own takes). Each take is written as a WAV file at the context's
// rate (16-bit stereo) with its loudness and peak, so two builds can be
// compared by ear, by measure (tools/sound-measure.mjs) and by eye. A take a
// build cannot play (a sound it does not have) records silence.
// The game's loop is stopped and the sound driven on a steady clock of its
// own, 30 times a second, as tools/audio-tour.mjs does.
// Usage: node tools/sound-sheet.mjs [outdir] [--file path/to/index.html] [--only=id,id] [--music=SECS]
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
const fi = args.indexOf('--file');
const FILE = fi >= 0 ? args[fi + 1] : 'dist/index.html';
const outDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--file') || 'tools/out/sound-sheet';
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const MUSIC = +((args.find((a) => a.startsWith('--music=')) || '').slice(8) || 40);
mkdirSync(outDir, { recursive: true });

// [id, what it is, the code that plays it (A is the sound engine, g the
// game, P a point 12 m to the listener's right, F one 40 m ahead), seconds]
const TAKES = [
  ['voice', 'The announcer (the loudness the rest is set against)', 'g.announcer.say("fishOn", { banner: false })', 2],
  ['ui-click', 'A button pressed', 'A.click()', 1],
  ['menu', 'A menu sliding open, then shut (a click each in builds before the slide)', 'A.slide ? A.slide(true) : A.click(); setTimeout(()=>(A.slide ? A.slide(false) : A.click()),700)', 1.6],
  ['nibble', 'A fish mouthing the lure', 'A.nibble()', 1],
  ['ui-tick', 'The casting meter\'s ticks', 'A.tick(1); setTimeout(()=>A.tick(2),350)', 1.2],
  ['cast', 'A cast: the rod\'s swish and the line off the spool', 'A.whoosh()', 1.6],
  ['lure-plop', 'The lure landing', 'A.plop(0.7)', 1],
  ['bite', 'A fish taking the lure', 'A.bite()', 1.2],
  ['fish-on', 'Fish on (hooked)', 'A.fishOn(false)', 1.8],
  ['fish-on-legend', 'A legendary fish on', 'A.fishOn(true)', 2.2],
  ['reel', 'Reeling in for two seconds', 'A.reel(true,0.6); setTimeout(()=>A.reel(false),2000)', 2.6],
  ['drag', 'The drag giving line as a fish runs', 'A.reelScream(true); setTimeout(()=>A.reelScream(false),1800)', 2.4],
  ['creak', 'The rod bending under load', 'A.creak(0.9); setTimeout(()=>A.creak(0),2200)', 2.6],
  ['splash-small', 'A small fish splashing', 'A.splash(0.35)', 1.4],
  ['splash-big', 'A big fish jumping and crashing back', 'A.splash(1)', 2],
  ['snag', 'The lure snagged', 'A.snag()', 1],
  ['line-snap', 'The line breaking', 'A.snap()', 1.4],
  ['catch', 'A catch', 'A.fanfare(false)', 2.4],
  ['catch-big', 'A trophy catch', 'A.fanfare(true)', 3],
  ['catch-legend', 'A legendary catch', 'A.fanfare("legend")', 4.4],
  ['catch-new', 'A new species', 'A.fanfare("new")', 2.6],
  ['lost', 'The one that got away', 'A.lost()', 2.6],
  ['perfect', 'A perfect hook set', 'A.perfect()', 1],
  ['goal', 'A goal reached', 'A.cheer()', 2.2],
  ['frenzy', 'A feeding frenzy starting', 'A.music.sting("frenzy")', 2],
  ['flop', 'A fish flapping in the hand', 'A.flop()', 1.2],
  ['cash', 'Selling the catch', 'A.cash()', 1.6],
  ['coins', 'A bonus counted out in coins on the catch card', 'A.coins(0.9)', 1.2],
  ['chime', 'An objective done', 'A.chime()', 1.6],
  ['shutter', 'The camera', 'A.shutter()', 1],
  ['bow', 'The longbow loosed', 'A.twang(1)', 1.4],
  ['whistler', 'A whistler arrow in flight', 'A.whistle()', 1.4],
  ['arrow-game', 'An arrow striking game', 'A.arrowHit(P.x,P.z,"game")', 1],
  ['arrow-wood', 'An arrow striking wood', 'A.arrowHit(P.x,P.z,"wood")', 1],
  ['arrow-rock', 'An arrow striking rock', 'A.arrowHit(P.x,P.z,"rock")', 1],
  ['growl', 'A grizzly growling', 'A.growl(P.x,P.z,0.8,false)', 1.8],
  ['roar', 'A grizzly roaring as it charges', 'A.growl(P.x,P.z,1,true)', 2.4],
  ['huff', 'A bear huffing', 'A.huff(P.x,P.z)', 1.2],
  ['swipe', 'A bear\'s swipe', 'A.swipe()', 1.2],
  ['spray', 'Bear spray', 'A.spray()', 1.8],
  ['goose', 'Canada geese', 'A.goose()', 2.2],
  ['duck', 'A mallard quacking', 'A.quack(P.x,P.z)', 1.4],
  ['crane', 'A sandhill crane\'s bugle', 'A.crane(F.x,F.z)', 1.6],
  ['magpie', 'A magpie\'s chatter', 'A.magpie(P.x,P.z)', 1.2],
  ['kingfisher', 'A kingfisher\'s rattle', 'A.kingfisher(P.x,P.z)', 1.2],
  ['sea-lion', 'Steller sea lions barking', 'A.seaLion(F.x,F.z)', 2.2],
  ['squirrel-alarm', 'A ground squirrel\'s alarm', 'A.squeak(P.x,P.z)', 1],
  ['tail-slap', 'A beaver\'s tail slap', 'A.tailSlap(F.x,F.z)', 1.2],
  ['whale', 'A humpback blowing', 'A.whale(F.x,F.z)', 2],
  ['orca', 'An orca blowing', 'A.orcaBlow(F.x,F.z)', 1.4],
  ['flap', 'Wings flapping', 'A.flap(P.x,P.z)', 1],
  ['eagle', 'A bald eagle', 'A.eagle(F.x,F.z)', 2],
  ['raven', 'A raven', 'A.raven(F.x,F.z)', 2],
  ['gull', 'A gull', 'A.gull(F.x,F.z)', 2.6],
  ['loon', 'A loon', 'A.loon(F.x,F.z)', 3.6],
  ['loon-wail', "A loon's wail", 'A.ambience.loonCall(F.x, g.world.heightAt(F.x,F.z), F.z, 1, "wail")', 3.6],
  ['loon-tremolo', "A loon's tremolo", 'A.ambience.loonCall(F.x, g.world.heightAt(F.x,F.z), F.z, 1, "tremolo")', 3.6],
  ['wolves', 'Wolves howling', 'A.wolf()', 6],
  ['engine', 'The hot rod: idle, revving and back', 'A.startEngine(); let k=0; const iv=setInterval(()=>{k++; const u=k/30; const rpm=u<1?800:u<2.5?800+(u-1)*2800:u<3.5?5000-(u-2.5)*4200:800; A.updateEngine(rpm,u>1&&u<2.5?1:0.1,0,true); if(u>4.2){clearInterval(iv); A.stopEngine();}},33)', 5.2],
  ['outboard', 'The outboard: idle, full throttle and back', 'let k=0; const iv=setInterval(()=>{k++; const u=k/30; const rpm=u<1?900:u<2.5?900+(u-1)*3600:u<3.5?6300-(u-2.5)*5400:900; A.updateOutboard(rpm,u>1&&u<2.5?1:0.1,0,true); if(u>4.2){clearInterval(iv); A.updateOutboard(0,0,0,false);}},33)', 5.2],
  ['racer', 'The race car: a start and a run up the gears', 'A.racerStart(); let k=0; const iv=setInterval(()=>{k++; const u=k/30; const rpm=u<1?3000:3000+((u-1)%1.2)/1.2*9000; A.updateRacer(rpm,u>1?1:0.1,0,u<4.4); if(u>4.6){clearInterval(iv);}},33)', 5.4],
  ['horn', 'The hot rod\'s horn', 'A.horn()', 2],
  ['door', 'The car door', 'A.door()', 1],
  ['rev', 'The new engine revved at the Trading Post', 'A.rev()', 2.2],
  ['winch', 'The boat winched onto its trailer', 'A.winch()', 2.2],
  ['gust', 'The paraglider\'s wing filling', 'A.gust()', 1.8],
  ['thud', 'A heavy thud', 'A.thud(1)', 1.2],
  ['ice-crack', 'The glacier calving', 'A.iceCrack(F.x,F.z)', 3.6],
  ['ice-boom', 'The ice hitting the lake', 'A.iceBoom(F.x,F.z,1)', 4],
  ['climb', 'Climbing: holds, chalk, a fall', 'A.climbTick(0.7); setTimeout(()=>A.climbTick(0.6),400); setTimeout(()=>A.chalk(),800); setTimeout(()=>A.climbFall(),2000)', 3.2],
  ['boom', 'A sonic boom', 'A.boom()', 5],
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.addInitScript(() => (Element.prototype.requestPointerLock = () => Promise.resolve()));
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') logs.push('console ' + m.text().slice(0, 200));
});
await page.goto('file://' + resolve(FILE));
await page.waitForFunction(() => window.__rhf && window.__rhf.ready, null, { timeout: 300000 });
await page.evaluate(() => {
  const gl = __rhf.game.renderer.getContext();
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) if (gl[f]) gl[f] = () => {};
  __rhf.start(false);
  const g = __rhf.game;
  const A = g.audio;
  A.unlock();
  A.ambience.bakery.finish();
  if (A.bakery) A.bakery.finish();
  g.bears.directorT = 9999;
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
  // (the last node before the speakers, whatever the build calls it)
  const last = A.limiter || A.comp;
  last.disconnect();
  last.connect(proc);
  proc.connect(ctx.destination);
  window.__sr = ctx.sampleRate;
  // a quiet, still place: the forest by the landing at 11, no wind to speak of
  const p = g.world.place('landing');
  g.player.place(p.x, p.z, 0);
  g.env.setTime(11);
  const w = g.env.weather;
  w.cloud = w.cloudTarget = 0.2;
  w.rain = w.rainTarget = 0;
  w.timer = 9999;
  __rhf.settle();
  cancelAnimationFrame(g.raf);
  g.start = () => {};
  for (let i = 0; i < 3; i++) {
    g.dt = 1 / 30;
    g.player.applyCamera(g.camera);
    g.updateWorld(1 / 30);
  }
  window.__tick = setInterval(() => {
    try {
      g.camera.updateMatrixWorld();
      g.audio.update(1 / 30, g);
    } catch (e) {
      window.__tickErr = String(e && e.message);
    }
  }, 1000 / 30);
});

const record = (code, secs, { music = false, threat = false, hour = 11, rain = 0, fight = false } = {}) =>
  page.evaluate(
    async ({ code, secs, music, threat, hour, rain, fight }) => {
      const g = __rhf.game;
      const A = g.audio;
      g.env.setTime(hour);
      g.env.weather.rain = rain;
      // (the sky's own update, which would set it, is stopped with the loop)
      g.env.night = hour > 22 || hour < 4 ? 1 : 0;
      // the game's own volumes, but only what is being taken: the place's
      // beds and singers stopped (its calls still sound, through the same
      // channel as in the game), and the music's player stopped but for the
      // music's takes (some effects are played on the music's channel)
      A.setVolumes(0.8, 0.55);
      const Am = A.ambience;
      if (!Am.__update) Am.__update = Am.update;
      Am.update = function () {};
      for (const b of Object.values(Am.beds || {})) {
        b.g.gain.cancelScheduledValues(0);
        b.g.gain.value = 0;
        b.last = 0;
      }
      Am.singers = [];
      if (Am.mosquitoes) Am.mosquitoes(0, 1);
      A.wolfT = 1e9;
      if (!A.__updateMusic) A.__updateMusic = A.updateMusic;
      A.updateMusic = music ? A.__updateMusic : function () {};
      // each music take from the start of a song
      if (A.musicReset) A.musicReset();
      else if (A.music) Object.assign(A.music, { next: 0, rest: 0, bar: 0, beat: 0, chord: 0 });
      if (A.music && typeof A.music.rest === 'number') A.music.rest = 0;
      g.bears.threat = threat ? { state: 'charge' } : null;
      // a fish on the line, pulling harder and harder, running in the middle
      let fightIv = null;
      if (fight) {
        const F = g.fishing;
        F.state = 'fight';
        F.fight = { tension: 0, state: 'swim', stamina: 1, power: 40, fish: { legend: null } };
        const max = F.rod().maxTension;
        const t0 = performance.now();
        fightIv = setInterval(() => {
          const u = Math.min(1, (performance.now() - t0) / 1000 / secs);
          F.fight.tension = max * (0.15 + 0.8 * u);
          F.fight.stamina = 1 - u * 0.7;
          F.fight.state = u > 0.45 && u < 0.6 ? 'run' : 'swim';
        }, 100);
      }
      await new Promise((r) => setTimeout(r, 600));
      const L = A.listener;
      const P = { x: L.x + Math.cos(L.heading) * 12, z: L.z + Math.sin(L.heading) * 12 };
      const F = { x: L.x + Math.sin(L.heading) * 40, z: L.z - Math.cos(L.heading) * 40 };
      const R = window.__rec;
      R.L = [];
      R.R = [];
      R.on = true;
      try {
        new Function('A', 'g', 'P', 'F', code)(A, g, P, F);
      } catch (e) {
        window.__tickErr = 'take: ' + e.message;
      }
      await new Promise((r) => setTimeout(r, secs * 1000));
      R.on = false;
      g.bears.threat = null;
      if (fightIv) {
        clearInterval(fightIv);
        g.fishing.state = 'idle';
        g.fishing.fight = null;
      }
      g.env.weather.rain = 0;
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
      const Lc = join(R.L);
      const Rc = join(R.R);
      let s = 0;
      let pk = 0;
      for (const x of [Lc, Rc]) {
        for (let i = 0; i < x.length; i++) {
          s += x[i] * x[i];
          const a = x[i] < 0 ? -x[i] : x[i];
          if (a > pk) pk = a;
        }
      }
      const sr = window.__sr;
      const n = Lc.length;
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        pcm[i * 2] = Math.max(-32767, Math.min(32767, Lc[i] * 32767));
        pcm[i * 2 + 1] = Math.max(-32767, Math.min(32767, Rc[i] * 32767));
      }
      const head = new DataView(new ArrayBuffer(44));
      const str = (o, t) => [...t].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      head.setUint32(4, 36 + pcm.byteLength, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      head.setUint32(16, 16, true);
      head.setUint16(20, 1, true);
      head.setUint16(22, 2, true);
      head.setUint32(24, sr, true);
      head.setUint32(28, sr * 4, true);
      head.setUint16(32, 4, true);
      head.setUint16(34, 16, true);
      str(36, 'data');
      head.setUint32(40, pcm.byteLength, true);
      const bytes = new Uint8Array(44 + pcm.byteLength);
      bytes.set(new Uint8Array(head.buffer), 0);
      bytes.set(new Uint8Array(pcm.buffer), 44);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      const err = window.__tickErr || null;
      window.__tickErr = null;
      return { rms: Math.sqrt(s / Math.max(1, 2 * n)), peak: pk, secs: n / sr, err, wav: btoa(bin) };
    },
    { code, secs, music, threat, hour, rain, fight }
  );

const results = [];
const db = (x) => (20 * Math.log10(Math.max(1e-6, x))).toFixed(1);
const save = (id, label, r) => {
  writeFileSync(`${outDir}/${id}.wav`, Buffer.from(r.wav, 'base64'));
  delete r.wav;
  results.push({ id, label, ...r });
  console.log(`${id.padEnd(16)} RMS ${db(r.rms)} dB, peak ${db(r.peak)} dB, ${r.secs.toFixed(1)} s${r.err ? ' | ERROR ' + r.err : ''}`);
};
for (const [id, label, code, secs] of TAKES) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  save(id, label, await record(code, secs));
}
// the music: a stretch of each hour's song, in the rain, during a fight and
// with a bear charging
for (const [id, label, opt] of [
  ['music-day', 'The music by day', { music: true, hour: 11 }],
  ['music-morning', 'The music in the morning', { music: true, hour: 6.5 }],
  ['music-evening', 'The music in the evening', { music: true, hour: 20 }],
  ['music-night', 'The music at night', { music: true, hour: 23.5 }],
  ['music-rain', 'The music in the rain', { music: true, hour: 14, rain: 0.9 }],
  ['music-fight', 'The music while a fish fights, pulling harder and harder', { music: true, hour: 11, fight: true }],
  ['music-bear', 'The music while a bear charges', { music: true, hour: 11, threat: true }],
]) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  save(id, label, await record('', id === 'music-bear' ? Math.min(MUSIC, 12) : id === 'music-fight' ? Math.min(MUSIC, 24) : MUSIC, opt));
}
writeFileSync(`${outDir}/sound-sheet.json`, JSON.stringify({ file: FILE, results, logs }, null, 1));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
