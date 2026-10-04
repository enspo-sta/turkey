// Compares the frame times of two or more builds fairly. On the test machine
// a run's place in a sequence moves its average frame time by as much as
// half a millisecond (the machine speeds up and slows down over minutes),
// more than the differences worth finding, so one run of each build in a
// fixed order says little. Here the builds take turns over several rounds in
// a balanced order: every block of rounds is a Latin square, each build
// running once in every place of the round. Each run is one
// tools/perf-tour.mjs tour in its own browser. The result is each build's
// average frame and, against the first build, the difference with a 95%
// interval, read within rounds and with the place in the round taken out.
// Usage: node tools/perf-compare.mjs a/index.html b/index.html [c/index.html ...]
//          [--rounds N] [--frames N] [--size WxH] [--dpr N] [--out dir]
// --rounds defaults to three blocks (three times the number of builds); the
// frames (90 by default), size and pixel ratio go to each tour, whose JSON is
// kept in --out (tools/out/perf-compare by default) with a summary.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitRounds, balancedOrders, t95 } from './perf-stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flagged = new Set();
for (const f of ['--rounds', '--frames', '--size', '--dpr', '--out']) {
  const i = args.indexOf(f);
  if (i >= 0) flagged.add(i + 1);
}
const builds = args.filter((a, i) => !a.startsWith('--') && !flagged.has(i));
if (builds.length < 2) {
  console.log('Usage: node tools/perf-compare.mjs a/index.html b/index.html [more] [--rounds N] [--frames N] [--size WxH] [--dpr N] [--out dir]');
  process.exit(1);
}
for (const b of builds) {
  if (!existsSync(b)) {
    console.log('no such build:', b);
    process.exit(1);
  }
}
const k = builds.length;
const rounds = +opt('--rounds', 3 * k);
const frames = opt('--frames', '90');
const outDir = resolve(opt('--out', 'tools/out/perf-compare'));
mkdirSync(outDir, { recursive: true });
if (rounds % k) console.log(`note: ${rounds} rounds is not a whole number of blocks of ${k}, so the places are not quite balanced`);

// a short name for each build: its path from here, or its last three parts
// when it is elsewhere
const names = builds.map((b) => {
  const r = relative(process.cwd(), resolve(b));
  return r.startsWith('..') ? resolve(b).split(sep).slice(-3).join('/') : r;
});
const extra = [];
for (const f of ['--size', '--dpr']) if (opt(f)) extra.push(f, opt(f));

const runs = [];
const orders = balancedOrders(k, rounds);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const t0 = Date.now();
for (let r = 0; r < rounds; r++) {
  for (let s = 0; s < k; s++) {
    const b = orders[r][s];
    const json = `${outDir}/run-${r + 1}-${s + 1}.json`;
    // (never read an earlier run's results if this one fails)
    rmSync(json, { force: true });
    const p = spawnSync(process.execPath, [resolve(root, 'tools/perf-tour.mjs'), json, '--noprofile', '--frames', frames, '--file', resolve(builds[b]), ...extra], { cwd: root, encoding: 'utf8', timeout: 15 * 60 * 1000 });
    let res = null;
    try {
      res = JSON.parse(readFileSync(json, 'utf8')).results;
    } catch (e) {
      /* the tour did not finish */
    }
    if (p.status !== 0 || !res || !res.length) {
      console.log(`round ${r + 1} of ${rounds}, place ${s + 1}: ${names[b]} did not finish (${(p.stderr || p.stdout || '').trim().split('\n').pop()})`);
      continue;
    }
    const run = { round: r + 1, slot: s, build: b, value: mean(res.map((x) => x.total.mean)), draw: mean(res.map((x) => x.render.mean)) };
    runs.push(run);
    console.log(`round ${r + 1} of ${rounds}, place ${s + 1}: ${names[b]} ${run.value.toFixed(2)} ms a frame (drawing ${run.draw.toFixed(2)})`);
  }
}
// only rounds in which every build finished
const whole = runs.filter((x) => runs.filter((y) => y.round === x.round).length === k);
console.log(`\n${whole.length / k} whole rounds of ${rounds}, ${((Date.now() - t0) / 60000).toFixed(0)} min`);
const summary = { builds, rounds, frames, extra, runs, perBuild: [], fit: null, fitDraw: null };
for (let b = 0; b < k; b++) {
  const v = whole.filter((x) => x.build === b);
  if (!v.length) continue;
  const m = mean(v.map((x) => x.value));
  const sd = Math.sqrt(mean(v.map((x) => (x.value - m) ** 2)));
  summary.perBuild.push({ build: builds[b], runs: v.length, mean: m, draw: mean(v.map((x) => x.draw)) });
  console.log(`${names[b]}: ${v.length} runs, average frame ${m.toFixed(2)} ms (spread ${sd.toFixed(2)}), drawing ${mean(v.map((x) => x.draw)).toFixed(2)} ms; runs ${v.map((x) => x.value.toFixed(2)).join(', ')}`);
}
const sign = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
for (const [key, label] of [
  ['value', 'a frame'],
  ['draw', 'drawing'],
]) {
  const f = fitRounds(
    whole.map((x) => ({ round: x.round, slot: x.slot, build: x.build, value: x[key] })),
    builds.map((_, i) => i)
  );
  if (!f) {
    console.log('too few whole rounds to compare');
    break;
  }
  if (key === 'value') summary.fit = f;
  else summary.fitDraw = f;
  console.log(`\n${label === 'a frame' ? 'Against' : 'Drawing only, against'} ${names[0]}, within rounds and with the place in the round taken out (${f.df} degrees of freedom, t ${t95(f.df).toFixed(2)}):`);
  for (const e of f.builds) console.log(`  ${names[e.name]}: ${sign(e.diff)} ms ${label} (95% interval ${sign(e.lo)} to ${sign(e.hi)})${e.lo > 0 ? ', slower' : e.hi < 0 ? ', faster' : ', no clear difference'}`);
  if (key === 'value') for (const e of f.places) console.log(`  place ${e.place} in the round against place 1: ${sign(e.diff)} ms (95% interval ${sign(e.lo)} to ${sign(e.hi)})`);
}
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
console.log(`\nwrote ${relative(process.cwd(), outDir) || '.'}/summary.json`);
