// Every check before a push: builds the game, runs the frame budget
// (tools/budget.mjs) and the regression scenarios (tools/shot.mjs, each with
// its own checks), and exits with code 1 when anything failed.
// Usage: node tools/check.mjs [--jobs N] [--only=name,name] [--no-budget] [--no-build] [--out dir]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const JOBS = +opt('--jobs', 3);
const OUT = opt('--out', 'tools/out/check');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
export const REGRESSION = ['fun', 'wardrobe', 'tesla', 'round-smoke', 'sites-draws', 'arms', 'catch', 'save', 'ui-check', 'mobile', 'layout-phone-small', 'voice-pick', 'bear', 'boat', 'climbing', 'secret-flight', 'eagle', 'graphics-adapt', 'sound-policy'];
mkdirSync(OUT, { recursive: true });

const run = (cmd, argv, log) =>
  new Promise((done) => {
    const t0 = Date.now();
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    p.on('close', (code) => {
      writeFileSync(log, text);
      done({ code, text, secs: Math.round((Date.now() - t0) / 1000) });
    });
  });

const results = [];
// (--no-build: two checks at once on the build already made)
if (!args.includes('--no-build')) {
  const b = await run('node', ['build.mjs'], `${OUT}/build.log`);
  console.log(`build: ${b.code === 0 ? 'ok' : 'FAILED'}`);
  if (b.code !== 0) process.exit(1);
}
if (!args.includes('--no-budget') && !ONLY.length) {
  const r = await run('node', ['tools/budget.mjs'], `${OUT}/budget.log`);
  const line = (r.text.match(/^BUDGET:.*$/m) || ['BUDGET: no result'])[0];
  console.log(`budget: ${r.code === 0 ? 'ok' : 'FAILED'} (${line.slice(8)})`);
  results.push({ name: 'budget', ok: r.code === 0, line });
}
const queue = REGRESSION.filter((n) => !ONLY.length || ONLY.includes(n));
const worker = async () => {
  while (queue.length) {
    const name = queue.shift();
    mkdirSync(`${OUT}/${name}`, { recursive: true });
    const r = await run('node', ['tools/shot.mjs', `tools/scenarios/${name}.json`, `${OUT}/${name}`], `${OUT}/${name}.log`);
    const line = (r.text.match(/^CHECKS .*$/m) || ['CHECKS none (the run ended early)'])[0];
    const failed = r.text.split('\n').filter((l) => l.startsWith('CHECK FAILED'));
    const ok = r.code === 0;
    results.push({ name, ok, line, failed, secs: r.secs });
    console.log(`${ok ? 'ok    ' : 'FAILED'} ${name} (${r.secs} s): ${line}`);
    for (const f of failed) console.log(`         ${f.slice(0, 300)}`);
  }
};
await Promise.all(Array.from({ length: JOBS }, worker));
const bad = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
console.log(bad.length ? `CHECK: ${bad.length} of ${results.length} failed: ${bad.map((r) => r.name).join(', ')}` : `CHECK: all ${results.length} passed`);
if (bad.length) process.exitCode = 1;
