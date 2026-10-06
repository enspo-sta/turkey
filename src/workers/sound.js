// The sound's worker: the ambience's textures, the library's sounds and the
// reverbs' impulses made off the main thread, so a frame never waits for
// them (see audio/oven.js). It is built on its own and carried in the game's
// script as text (build.mjs).
import { ambienceJobs, impulse } from '../audio/bake.js';
import { kitJobs } from '../audio/kit.js';

const LISTS = { ambience: ambienceJobs, library: kitJobs };
const MAKERS = { impulse };
const queue = [];
let going = false;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'list') for (const j of LISTS[m.group]()) queue.push({ group: m.group, name: j.name, gen: j.gen });
  // an impulse asked for jumps the queue: it is wanted the moment the sound starts
  else if (m.type === 'first') queue.unshift({ group: m.group, name: m.name, gen: MAKERS[m.maker](...m.args) });
  else if (m.type === 'drop') {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].group === m.group && (m.all || queue[i].name === m.name)) queue.splice(i, 1);
  }
  if (!going && queue.length) {
    going = true;
    setTimeout(next, 0);
  }
};

// One job at a time, whole; between jobs the messages waiting are read.
function next() {
  const j = queue.shift();
  if (!j) {
    going = false;
    return;
  }
  try {
    const t0 = performance.now();
    let r = j.gen.next();
    while (!r.done) r = j.gen.next();
    const bufs = new Set();
    collect(r.value, bufs);
    // the arrays' memory is handed over, not copied (ms: how long it took,
    // for tools/bake-cost.mjs)
    self.postMessage({ group: j.group, name: j.name, value: r.value, ms: performance.now() - t0 }, [...bufs]);
  } catch (err) {
    self.postMessage({ group: j.group, name: j.name, error: String(err && err.message ? err.message : err) });
    return;
  }
  setTimeout(next, 0);
}

function collect(v, out) {
  if (!v || typeof v !== 'object') return;
  if (ArrayBuffer.isView(v)) out.add(v.buffer);
  else if (Array.isArray(v)) for (const x of v) collect(x, out);
  else for (const k in v) collect(v[k], out);
}
