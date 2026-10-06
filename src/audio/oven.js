// The sounds made ahead of time: the ambience's textures (bake.js), the
// library's sounds (kit.js) and the reverbs' impulses. Where the browser can
// start a worker they are made there, off the main thread, so no frame ever
// waits for them and the first minute of a game on a phone is as smooth as
// the rest (made on the main thread a little each frame, they took over a
// second of a desktop processor's time out of that first minute, and longer
// on a phone). The worker starts with the page and has most of it made
// before the first tap. Where there is no worker, or a tool wants everything
// at once (finish), they are made here instead, a little a frame (bake.js's
// Bakery).
// Either way a finished sound waits in `done` until its owner hands it to the
// browser (handOver, a sound a frame): making its buffers is the one part
// that has to happen on the main thread.
import { Bakery, ambienceJobs, impulse } from './bake.js';
import { kitJobs } from './kit.js';

const LISTS = { ambience: ambienceJobs, library: kitJobs };
const MAKERS = { impulse };

let worker = null;
let noWorker = false;
const ovens = {};

function hire() {
  if (worker || noWorker) return worker;
  let src = null;
  try {
    src = typeof __SOUND_WORKER__ === 'string' ? __SOUND_WORKER__ : null;
  } catch (e) {
    src = null;
  }
  if (!src || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    noWorker = true;
    return null;
  }
  try {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e) => {
      if (e.data.error) lose();
      else ovens[e.data.group]?.receive(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      lose();
    };
  } catch (e) {
    worker = null;
    noWorker = true;
  }
  return worker;
}

// Everything is made: the worker is let go (what it holds is freed; a job
// asked for later, such as an impulse at an unusual rate, is made here).
function retire() {
  if (!worker || Object.values(ovens).some((o) => o.jobs.length)) return;
  worker.terminate();
  worker = null;
}

// The worker failed: what it had not finished is made here instead.
function lose() {
  noWorker = true;
  try {
    worker?.terminate();
  } catch (e) {
    /* gone already */
  }
  worker = null;
  for (const o of Object.values(ovens)) o.takeBack();
}

export class Oven {
  constructor(group) {
    this.group = group;
    // made, waiting to be handed over: name -> value, in the order they came
    this.done = {};
    this.order = [];
    // the owner's hand-over: (name, value) -> true once given to the
    // browser, false to keep it for later (no sound context yet)
    this.onReady = null;
    this.bakery = null;
    ovens[group] = this;
    const list = LISTS[group]();
    if (hire()) {
      // what is still to come, by name (the worker makes its own generators)
      this.jobs = list.map((j) => ({ name: j.name }));
      worker.postMessage({ type: 'list', group });
    } else this.here(list);
  }

  get inWorker() {
    return !this.bakery;
  }

  get busy() {
    return this.jobs.length > 0;
  }

  // The jobs made here, on the main thread, a little a frame (step).
  here(list) {
    this.bakery = new Bakery();
    for (const j of list) this.bakery.add(j.name, j.gen);
    this.bakery.onDone = (name, v) => {
      delete this.bakery.done[name];
      this.keep(name, v);
    };
    // (the same list: what is still to come, wherever it is made)
    this.jobs = this.bakery.jobs;
  }

  // A job before the rest (an impulse, made at the rate asked for).
  first(name, maker, args) {
    if (name in this.done || this.jobs.some((j) => j.name === name)) return;
    if (this.inWorker && worker) {
      this.jobs.unshift({ name, maker, args });
      worker.postMessage({ type: 'first', group: this.group, name, maker, args });
      return;
    }
    // (the worker gone: made here)
    if (!this.bakery) this.here([]);
    this.jobs.unshift({ name, maker, args, gen: MAKERS[maker](...args) });
  }

  // A job (or a finished sound) not wanted after all.
  drop(name) {
    if (name in this.done) {
      delete this.done[name];
      this.order = this.order.filter((n) => n !== name);
    }
    const i = this.jobs.findIndex((j) => j.name === name);
    if (i < 0) return;
    this.jobs.splice(i, 1);
    if (this.inWorker && worker) worker.postMessage({ type: 'drop', group: this.group, name });
  }

  // From the worker: a finished job.
  receive(m) {
    const i = this.jobs.findIndex((j) => j.name === m.name);
    if (i < 0) return; // dropped, or made here after all
    this.jobs.splice(i, 1);
    this.keep(m.name, m.value);
    retire();
  }

  keep(name, v) {
    this.done[name] = v;
    this.order.push(name);
  }

  // Make within ms of this frame (here only: the worker waits for no frame).
  step(ms) {
    if (this.bakery && this.bakery.busy) this.bakery.step(ms);
  }

  // Hand the next finished sound (or the one named) to the owner. True if
  // one was handed over.
  handOver(name = null) {
    const n = name ?? this.order[0];
    if (n === undefined || !(n in this.done) || !this.onReady) return false;
    if (!this.onReady(n, this.done[n])) return false;
    delete this.done[n];
    const i = this.order.indexOf(n);
    if (i >= 0) this.order.splice(i, 1);
    return true;
  }

  // Everything still to come made now, here, and handed over (for tools and
  // tests, which want the sound whole at once).
  finish() {
    this.takeBack();
    this.bakery.finish();
    while (this.handOver()) {
      /* one by one */
    }
  }

  // What the worker has not finished, made here instead.
  takeBack() {
    if (!this.inWorker) return;
    const want = this.jobs.slice();
    if (worker) worker.postMessage({ type: 'drop', group: this.group, all: true });
    const gens = new Map(LISTS[this.group]().map((j) => [j.name, j.gen]));
    this.here([]);
    for (const j of want) this.bakery.jobs.push({ name: j.name, maker: j.maker, args: j.args, gen: j.maker ? MAKERS[j.maker](...j.args) : gens.get(j.name) });
  }
}
