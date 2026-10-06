// The game's sound library: what the player does (the cast, the lure, the
// reel, the drag, splashes, the bow, the camera, the till), what the animals
// say, the engines, and the instruments of the music, all synthesised ahead
// of time as sample arrays, a little each frame (see bake.js), from the title
// screen on. Each is a small physical model rather than a bare waveform:
//  - water is bubbles, each a short ringing tone that rises as the bubble
//    nears the surface, and droplets falling back;
//  - clicks, coins, bells and knocks are struck metal and wood: sums of
//    decaying partials at the object's own frequencies;
//  - strings are plucked in a delay line, the guitar's body shaping them;
//  - the felt piano is its partials, slightly stretched as a real string's
//    are, three strings a note drifting against each other;
//  - voices (the bear, geese, ducks, cranes, sea lions) are a pulsing source
//    through the throat's resonances;
//  - engines are their cylinders firing in order, each pulse ringing in the
//    exhaust.
// Several takes of most sounds, so nothing repeats exactly, and each take's
// loudness is measured as it is made, so the game can play every sound at
// the loudness it means it to have, whatever its shape. Every loop over
// samples stops now and then (a yield) so the baking never holds a frame up
// for long. No Web Audio here: AudioEngine turns the arrays into buffers once
// the sound is unlocked.
import { mulberry, normalise, seamless } from './bake.js';

const TAU = Math.PI * 2;
// samples per second: the instruments and bright sounds, and the rest
// (older Safari makes no buffer below 22 050)
export const HI = 32000;
export const LO = 22050;

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const buf = (secs, sr) => new Float32Array(Math.max(1, Math.floor(secs * sr)));

// ------------------------------------------------------------ filters
// A two-pole filter from the Audio EQ Cookbook: lp, hp, bp (0 dB at its
// peak), peak, ls and hs (shelves).
// (coefficients and state in typed arrays: a plain field that holds a
// whole number one moment and a fraction the next makes every write slow.
// A tiny value, its sign flipping every sample, rides on the input: in
// silence a filter's state otherwise dies away into numbers so small, the
// subnormals, that a desktop processor works on them a hundred times
// slower. At -500 dB it is far below hearing.)
export class BQ {
  constructor(type, f, q, sr, db = 0) {
    this.c = new Float64Array(5);
    this.z = new Float64Array(5);
    this.z[4] = 1e-25;
    this.set(type, f, q, sr, db);
  }

  set(type, f, q, sr, db = 0) {
    const w = (TAU * Math.min(Math.max(f, 5), sr * 0.45)) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const al = sw / (2 * q);
    const A = Math.pow(10, db / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = b0;
      a0 = 1 + al;
      a1 = -2 * cw;
      a2 = 1 - al;
    } else if (type === 'hp') {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = b0;
      a0 = 1 + al;
      a1 = -2 * cw;
      a2 = 1 - al;
    } else if (type === 'bp') {
      b0 = al;
      b1 = 0;
      b2 = -al;
      a0 = 1 + al;
      a1 = -2 * cw;
      a2 = 1 - al;
    } else if (type === 'peak') {
      b0 = 1 + al * A;
      b1 = -2 * cw;
      b2 = 1 - al * A;
      a0 = 1 + al / A;
      a1 = -2 * cw;
      a2 = 1 - al / A;
    } else {
      const sq = 2 * Math.sqrt(A) * al;
      if (type === 'ls') {
        b0 = A * (A + 1 - (A - 1) * cw + sq);
        b1 = 2 * A * (A - 1 - (A + 1) * cw);
        b2 = A * (A + 1 - (A - 1) * cw - sq);
        a0 = A + 1 + (A - 1) * cw + sq;
        a1 = -2 * (A - 1 + (A + 1) * cw);
        a2 = A + 1 + (A - 1) * cw - sq;
      } else {
        b0 = A * (A + 1 + (A - 1) * cw + sq);
        b1 = -2 * A * (A - 1 + (A + 1) * cw);
        b2 = A * (A + 1 + (A - 1) * cw - sq);
        a0 = A + 1 - (A - 1) * cw + sq;
        a1 = 2 * (A - 1 - (A + 1) * cw);
        a2 = A + 1 - (A - 1) * cw - sq;
      }
    }
    const c = this.c;
    c[0] = b0 / a0;
    c[1] = b1 / a0;
    c[2] = b2 / a0;
    c[3] = a1 / a0;
    c[4] = a2 / a0;
  }

  run(x) {
    const c = this.c;
    const z = this.z;
    z[4] = -z[4];
    x += z[4];
    const y = c[0] * x + c[1] * z[0] + c[2] * z[1] - c[3] * z[2] - c[4] * z[3];
    z[1] = z[0];
    z[0] = x;
    z[3] = z[2];
    z[2] = y;
    return y;
  }
}

// Work done since the bake last stopped, in samples (roughly, times the
// filters run on each): the helpers below add theirs and stop (yield) once
// it passes WORK, so a step of the bake stays short however its work is
// split. Their sample loops are plain functions run a slice at a time: a
// loop inside a generator runs several times slower.
let work = 0;
const WORK = 8192;
function* pace(n) {
  work += n;
  if (work >= WORK) {
    work = 0;
    yield;
  }
}
const SLICE = 2048;

// Run a whole array through a chain of filters ([type, f, q, db] each).
function eqRun(d, i0, i1, fs) {
  for (let i = i0; i < i1; i++) {
    let x = d[i];
    for (let j = 0; j < fs.length; j++) x = fs[j].run(x);
    d[i] = x;
  }
}
function* eq(d, sr, chain) {
  const fs = chain.map(([t, f, q, db]) => new BQ(t, f, q, sr, db || 0));
  for (let i = 0; i < d.length; i += SLICE) {
    const i1 = Math.min(d.length, i + SLICE);
    eqRun(d, i, i1, fs);
    yield* pace((i1 - i) * fs.length);
  }
}

// How loud a take sounds at its loudest: its frequencies weighted as the
// loudness standard (ITU-R BS.1770) weights them, a shelf of +4 dB above
// about 1.7 kHz and the lows rolled off below 40 Hz, then the energy over its
// loudest 0.2 seconds (the ear sums a short sound over about that long), in
// dB below full scale. tools/sound-measure.mjs measures recordings the same
// way.
function weighRun(c, z, i0, i1, shelf, low) {
  for (let i = i0; i < i1; i++) {
    const y = low.run(shelf.run(c[i]));
    z[i] += y * y;
  }
}
function windowRun(z, i0, i1, w, st) {
  let s = st.s;
  let best = st.best;
  for (let i = i0; i < i1; i++) {
    s += z[i];
    if (i >= w) s -= z[i - w];
    if (s > best) best = s;
  }
  st.s = s;
  st.best = best;
}
export function* loudness(chs, sr) {
  const n = chs[0].length;
  const z = new Float64Array(n);
  for (const c of chs) {
    const shelf = new BQ('hs', 1682, 0.7072, sr, 4);
    const low = new BQ('hp', 38.1, 0.5003, sr);
    for (let i = 0; i < n; i += SLICE) {
      const i1 = Math.min(n, i + SLICE);
      weighRun(c, z, i, i1, shelf, low);
      yield* pace((i1 - i) * 2);
    }
  }
  const w = Math.max(1, Math.floor(0.2 * sr));
  const st = { s: 0, best: 0 };
  for (let i = 0; i < n; i += SLICE * 4) {
    const i1 = Math.min(n, i + SLICE * 4);
    windowRun(z, i, i1, w, st);
    yield* pace((i1 - i) >> 1);
  }
  return -0.691 + 10 * Math.log10(Math.max(1e-12, st.best / w));
}

// ------------------------------------------------------------ sources
// A struck partial: a sine at f (gliding to f2 over its life), from t0,
// dying away with time constant tau (seconds to fall to 1/e), amplitude a.
function partialRun(d, s, i0, i1, st) {
  let p = st.p;
  let e = st.e;
  let fr = st.fr;
  const { k, df, w, top } = st;
  for (let i = i0; i < i1; i++) {
    p += w * fr;
    fr += df;
    if (fr < top) d[s + i] += Math.sin(p) * e * (i < 12 ? i / 12 : 1);
    e *= k;
  }
  st.p = p;
  st.e = e;
  st.fr = fr;
}
function* partial(d, sr, t0, f, tau, a, f2 = f, ph = 0) {
  const s = Math.max(0, Math.floor(t0 * sr));
  const n = Math.min(d.length - s, Math.floor(tau * 7 * sr));
  const top = sr * 0.48;
  if (n <= 0 || f >= top) return;
  const st = { p: ph, e: a, fr: f, k: Math.exp(-1 / (tau * sr)), df: (f2 - f) / n, w: TAU / sr, top };
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    partialRun(d, s, i, i1, st);
    yield* pace(i1 - i);
  }
}

// The same for a long partial at a fixed frequency, by recursion (much
// cheaper than a sine a sample): the piano's and the bells' partials.
function ringRun(d, s, i0, i1, st) {
  let y1 = st.y1;
  let y2 = st.y2;
  let e = st.e;
  const { c, k, at } = st;
  for (let i = i0; i < i1; i++) {
    const y = c * y1 - y2;
    y2 = y1;
    y1 = y;
    d[s + i] += y * e * (i < at ? 0.5 - 0.5 * Math.cos((Math.PI * i) / at) : 1);
    e *= k;
  }
  st.y1 = y1;
  st.y2 = y2;
  st.e = e;
}
function* ring(d, sr, t0, f, tau, a, ph = 0, attack = 0.002) {
  const s = Math.max(0, Math.floor(t0 * sr));
  const n = Math.min(d.length - s, Math.floor(tau * 7 * sr));
  if (n <= 0 || f >= sr * 0.48) return;
  const w = (TAU * f) / sr;
  const st = { y1: Math.sin(ph - w), y2: Math.sin(ph - 2 * w), e: a, c: 2 * Math.cos(w), k: Math.exp(-1 / (tau * sr)), at: Math.max(1, Math.floor(attack * sr)) };
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    ringRun(d, s, i, i1, st);
    yield* pace((i1 - i) >> 1);
  }
}

// A burst of noise through a filter sweeping from f to f2, with an attack
// and a decay (curve: how far it falls, e^-curve, by the end).
function burstRun(d, s, i0, i1, st, rnd) {
  const { bq, type, f, f2, q, sr, n, at, tail, curve, amp, brown, sweep } = st;
  let b = st.b;
  for (let i = i0; i < i1; i++) {
    if (sweep && (i & 31) === 0) bq.set(type, f * Math.pow(f2 / f, i / n), q, sr);
    let w = rnd() * 2 - 1;
    if (brown) {
      b = (b + 0.02 * w) / 1.02;
      w = b * 3.5;
    }
    let env = i < at ? i / at : Math.exp((-curve * (i - at)) / Math.max(1, n - at));
    if (i > n - tail) env *= (n - i) / tail;
    d[s + i] += bq.run(w) * env * amp;
  }
  st.b = b;
}
function* burst(d, sr, rnd, t0, dur, amp, o = {}) {
  const { type = 'lp', f = 2000, f2 = f, q = 0.7, attack = 0.002, curve = 3, brown = false } = o;
  const s = Math.max(0, Math.floor(t0 * sr));
  const n = Math.min(d.length - s, Math.floor(dur * sr));
  if (n <= 0) return;
  const st = { bq: new BQ(type, f, q, sr), type, f, f2, q, sr, n, at: Math.max(1, attack * sr), tail: Math.min(64, n >> 2), curve, amp, brown, sweep: f2 !== f, b: 0 };
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    burstRun(d, s, i, i1, st, rnd);
    yield* pace((i1 - i) * 2);
  }
}

// An air bubble forming in water: a tone at f0 rising as the bubble nears
// the surface (by `rise` over its life), ringing a few hundredths of a
// second (bigger, lower bubbles ring longer).
function* bubble(d, sr, t0, f0, amp, rise = 0.6, tau = null) {
  const T = tau ?? 0.01 + 11 / f0;
  yield* partial(d, sr, t0, f0, T, amp, f0 * (1 + rise));
}

// A short mono sound (the generator fn writes it from time 0 into a scratch
// `len` seconds long) placed at t0 into L and R, panned with equal power.
function* place(L, R, sr, t0, len, pan, fn) {
  const s = Math.max(0, Math.floor(t0 * sr));
  const n = Math.min(L.length - s, Math.floor(len * sr));
  if (n <= 0) return;
  const tmp = new Float32Array(n);
  yield* fn(tmp);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    L[s + i] += tmp[i] * gl;
    R[s + i] += tmp[i] * gr;
  }
}

// A short fade in and out (`out` seconds, longer for an instrument's note,
// so a ringing string dies away rather than stops) so nothing starts or
// ends with a click.
function edges(chs, sr, out = 0.02) {
  const fin = Math.min(Math.floor(sr * 0.0015), 32);
  const fout = Math.floor(sr * out);
  for (const c of chs) {
    for (let i = 0; i < fin && i < c.length; i++) c[i] *= i / fin;
    for (let i = 0; i < fout && i < c.length; i++) c[c.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fout);
  }
}

function mix(d, s, t0, sr, g = 1) {
  const o = Math.floor(t0 * sr);
  for (let i = 0; i < s.length && o + i < d.length; i++) d[o + i] += s[i] * g;
}

// ------------------------------------------------------------ the interface
// A soft wooden tock (a key, a tab), a lighter tick (the casting meter),
// a sheet sliding (menus), and coins and the till.
function* uiClick(rnd, sr) {
  const d = buf(0.14, sr);
  const f = 1050 * (0.94 + 0.12 * rnd());
  yield* partial(d, sr, 0, f, 0.016, 1);
  yield* partial(d, sr, 0, f * 2.71, 0.007, 0.42);
  yield* partial(d, sr, 0, f * 4.3, 0.004, 0.22);
  yield* burst(d, sr, rnd, 0, 0.005, 0.35, { type: 'hp', f: 2600 });
  return [d];
}

function* uiTick(rnd, sr, v) {
  const d = buf(0.12, sr);
  const f = (v % 2 ? 2350 : 1760) * (0.97 + 0.06 * rnd());
  yield* partial(d, sr, 0, f, 0.02, 1);
  yield* partial(d, sr, 0, f * 2.76, 0.008, 0.35);
  yield* burst(d, sr, rnd, 0, 0.004, 0.3, { type: 'hp', f: 3000 });
  return [d];
}

function* uiSlide(rnd, sr, v) {
  const d = buf(0.24, sr);
  yield* burst(d, sr, rnd, 0, 0.2, 0.7, { type: 'bp', f: v ? 1500 : 900, f2: v ? 900 : 1500, q: 1.1, attack: 0.05, curve: 2.5 });
  yield* partial(d, sr, 0.16, 820, 0.014, 0.35);
  return [d];
}

// A small coin: a thin disc, its partials far from harmonic.
function* coin(d, sr, rnd, t0, amp) {
  const f = 2900 + rnd() * 2200;
  for (const [r, tau, a] of [
    [1, 0.18, 1],
    [1.59, 0.12, 0.6],
    [2.14, 0.09, 0.45],
    [2.65, 0.07, 0.3],
  ])
    yield* ring(d, sr, t0, f * r, tau * (0.6 + rnd() * 0.6), amp * a, rnd() * TAU, 0.0005);
  yield* burst(d, sr, rnd, t0, 0.004, amp * 0.6, { type: 'hp', f: 4000 });
}

function* coins(rnd, sr) {
  const d = buf(0.7, sr);
  const n = 4 + Math.floor(rnd() * 4);
  let t = 0;
  for (let i = 0; i < n; i++) {
    yield* coin(d, sr, rnd, t, 0.5 + rnd() * 0.5);
    t += 0.03 + rnd() * 0.06;
  }
  return [d];
}

// The till: the drawer's clunk, the bell, the coins.
function* till(rnd, sr) {
  const d = buf(1.4, sr);
  yield* burst(d, sr, rnd, 0, 0.05, 0.9, { type: 'lp', f: 900, brown: true, curve: 4 });
  yield* partial(d, sr, 0, 210, 0.04, 0.6);
  yield* partial(d, sr, 0.01, 640, 0.02, 0.3);
  // the bell: a small hand bell's partials
  const b = 2350 * (0.97 + 0.06 * rnd());
  for (const [r, tau, a] of [
    [1, 0.75, 1],
    [2.32, 0.42, 0.45],
    [4.25, 0.22, 0.28],
    [6.63, 0.12, 0.15],
  ])
    yield* ring(d, sr, 0.06, b * r, tau, 0.7 * a, rnd() * TAU, 0.001);
  let t = 0.14;
  for (let i = 0; i < 6; i++) {
    yield* coin(d, sr, rnd, t, 0.25 + rnd() * 0.25);
    t += 0.025 + rnd() * 0.05;
  }
  return [d];
}

// ------------------------------------------------------------ the cast
// The rod: air torn by the tip as it whips forward, rising and falling
// fast; then the line peeling off the spool, coil after coil, slowing as
// the lure flies.
function* cast(rnd, sr, v) {
  const d = buf(1.25, sr);
  const T = 0.26 + rnd() * 0.06;
  const N = Math.floor(T * sr);
  const bq = new BQ('bp', 500, 1.4, sr);
  for (let i = 0; i < N; i++) {
    if ((i & 1023) === 1023) yield;
    const u = i / N;
    if ((i & 15) === 0) bq.set('bp', 350 + 2900 * Math.pow(Math.sin(Math.PI * u), 2), 1.4 + u, sr);
    d[i] += bq.run(rnd() * 2 - 1) * Math.pow(Math.sin(Math.PI * u), 2.5) * 1.1;
  }
  // a faint whistle off the tip, at the whip's fastest
  yield* partial(d, sr, T * 0.35, 1800 + rnd() * 400, 0.05, 0.08, 2500);
  // the line off the spool: a zip of coils, fast then slower
  const z0 = Math.floor(T * 0.6 * sr);
  const zN = Math.floor(0.85 * sr);
  const zf = new BQ('bp', 3600 + v * 300, 2.2, sr);
  let ph = 0;
  for (let i = 0; i < zN && z0 + i < d.length; i++) {
    if ((i & 1023) === 1023) yield;
    const u = i / zN;
    ph += (TAU * (85 - 55 * u)) / sr;
    const s = 0.5 + 0.5 * Math.sin(ph);
    const am = 0.35 + 0.65 * s * s * s;
    d[z0 + i] += zf.run(rnd() * 2 - 1) * am * 0.32 * Math.exp(-u * 2.6) * Math.min(1, i / (0.02 * sr));
  }
  return [d];
}

// The lure landing: the slap of the surface, the bubble it drags down
// ringing up, a few smaller ones, a little spray.
function* plop(rnd, sr) {
  const d = buf(0.5, sr);
  yield* burst(d, sr, rnd, 0, 0.004, 0.5, { type: 'hp', f: 1800 });
  yield* bubble(d, sr, 0.003, 620 + rnd() * 320, 1, 0.9 + rnd() * 0.5, 0.03 + rnd() * 0.015);
  const k = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) yield* bubble(d, sr, 0.008 + rnd() * 0.07, 900 + rnd() * 1700, 0.12 + rnd() * 0.22, 0.5);
  yield* burst(d, sr, rnd, 0.002, 0.08, 0.22, { type: 'bp', f: 2600, q: 0.8 });
  return [d];
}

// A fish mouthing the lure: a tiny plip.
function* nibble(rnd, sr) {
  const d = buf(0.2, sr);
  yield* bubble(d, sr, 0, 1200 + rnd() * 700, 0.9, 0.5, 0.012);
  yield* burst(d, sr, rnd, 0, 0.003, 0.2, { type: 'hp', f: 2500 });
  return [d];
}

// The float pulled under: a gulp of air dragged down, the water swirling
// shut over it.
function* bite(rnd, sr) {
  const d = buf(0.7, sr);
  yield* bubble(d, sr, 0, 260 + rnd() * 110, 1, 1.6, 0.07);
  yield* bubble(d, sr, 0.03, 520 + rnd() * 200, 0.4, 1.2, 0.04);
  yield* burst(d, sr, rnd, 0.01, 0.42, 0.45, { type: 'bp', f: 700, f2: 380, q: 1.3, attack: 0.04, curve: 3 });
  for (let i = 0; i < 6; i++) yield* bubble(d, sr, 0.05 + rnd() * 0.3, 700 + rnd() * 1300, 0.08 + rnd() * 0.12, 0.6);
  return [d];
}

// A splash, from a small fish's flick (size 0) to a big one crashing back
// (size 1): the crack of the broken surface, the body of water thrown up
// and falling, the cloud of bubbles it drives down, and drops raining back.
function* splash(rnd, sr, size) {
  const dur = 0.4 + size * 1.0;
  const L = buf(dur, sr);
  const R = buf(dur, sr);
  const rL = mulberry(Math.floor(rnd() * 1e9));
  const rR = mulberry(Math.floor(rnd() * 1e9));
  for (const [d, r] of [
    [L, rL],
    [R, rR],
  ]) {
    // the crack
    yield* burst(d, sr, r, 0, 0.012 + size * 0.01, 0.7, { type: 'hp', f: 1100 - size * 500, curve: 2 });
    // the body: rumbling at first, hissing as it rains back
    yield* burst(d, sr, r, 0.002, dur * 0.85, 0.75 + size * 0.2, { type: 'lp', f: 3800 + size * 2000, f2: 700, q: 0.6, attack: 0.004, curve: 3.2 });
    if (size > 0.5) yield* partial(d, sr, 0, 75 + rnd() * 20, 0.06, 0.5 * size);
  }
  // the bubbles
  const nb = Math.floor(18 + 110 * size);
  for (let i = 0; i < nb; i++) {
    const t = -Math.log(1 - rnd() * 0.98) * (0.05 + 0.12 * size);
    const f0 = Math.exp(Math.log(380 - 120 * size) + rnd() * Math.log(7.5));
    const a = (0.06 + rnd() * 0.18) * Math.exp(-t * 3);
    const rise = 0.4 + rnd() * 0.8;
    yield* place(L, R, sr, t, 0.012 * 7 + 77 / f0, rnd() * 1.4 - 0.7, function* (d) {
      yield* bubble(d, sr, 0, f0, a, rise);
    });
  }
  // drops falling back
  const nd = Math.floor(4 + 34 * size);
  for (let i = 0; i < nd; i++) {
    const t = 0.08 + rnd() * dur * 0.75;
    const a = (0.05 + rnd() * 0.12) * (1 - (t / dur) * 0.6);
    const f0 = 1300 + rnd() * 2400;
    const tau = 0.008 + rnd() * 0.006;
    yield* place(L, R, sr, t, tau * 7 + 0.01, rnd() * 1.6 - 0.8, function* (d) {
      yield* bubble(d, sr, 0, f0, a, 0.35, tau);
      yield* burst(d, sr, rnd, 0, 0.006, a * 0.6, { type: 'hp', f: 3000 });
    });
  }
  return [L, R];
}

// ------------------------------------------------------------ the reel
// A spinning reel's click as the handle turns: a small steel ratchet
// (partials far from harmonic, dying in a few thousandths of a second) and
// the dull tick of the body.
function* reelClick(rnd, sr) {
  const d = buf(0.05, sr);
  const f = 3000 * (0.92 + 0.16 * rnd());
  yield* partial(d, sr, 0, f, 0.004, 1);
  yield* partial(d, sr, 0, f * 1.57, 0.003, 0.6);
  yield* partial(d, sr, 0, f * 2.42, 0.002, 0.35);
  yield* partial(d, sr, 0, 860 + rnd() * 120, 0.006, 0.3);
  yield* burst(d, sr, rnd, 0, 0.002, 0.3, { type: 'hp', f: 4000 });
  return [d];
}

// The gears turning under the clicks (a loop).
function* reelWhir(rnd, sr) {
  const n = Math.floor(0.6 * sr);
  const f = Math.floor(0.08 * sr);
  const d = new Float32Array(n + f);
  const bq = new BQ('bp', 1250, 1.3, sr);
  for (let i = 0; i < d.length; i++) {
    if ((i & 1023) === 1023) yield;
    const am = 0.55 + 0.45 * Math.sin((TAU * 48 * i) / sr);
    d[i] = bq.run(rnd() * 2 - 1) * am * 0.8 + Math.sin((TAU * 192 * i) / sr) * 0.05;
  }
  return [yield* seamless(d, n, 0.08, sr)];
}

// The drag giving line: its washers slipping and the click spring
// ratcheting a couple of hundred times a second (a loop, played faster as
// the fish runs harder).
function* drag(rnd, sr) {
  const n = Math.floor(0.5 * sr);
  const f = Math.floor(0.06 * sr);
  const d = new Float32Array(n + f);
  const rate = 190;
  for (let k = 0, t = 0; t < (n + f) / sr - 0.01; k++) {
    const a = (k % 2 ? 0.6 : 1) * (0.8 + rnd() * 0.4);
    yield* partial(d, sr, t, 3500 + rnd() * 300, 0.0022, a);
    yield* partial(d, sr, t, 5900 + rnd() * 400, 0.0015, a * 0.5);
    t += (1 / rate) * (0.9 + rnd() * 0.2);
  }
  yield* burst(d, sr, rnd, 0, (n + f) / sr, 0.18, { type: 'bp', f: 2800, q: 1.6, attack: 0.001, curve: 0.01 });
  return [yield* seamless(d, n, 0.06, sr)];
}

// The rod creaking under load: the blank's fibres and the reel seat
// slipping and catching, each slip ringing in the rod (a loop).
function* creak(rnd, sr) {
  const n = Math.floor(1.2 * sr);
  const f = Math.floor(0.1 * sr);
  const d = new Float32Array(n + f);
  let t = 0;
  while (t < (n + f) / sr - 0.03) {
    const a = 0.4 + rnd() * 0.6;
    yield* partial(d, sr, t, 380 + rnd() * 60, 0.018, a);
    yield* partial(d, sr, t, 930 + rnd() * 120, 0.011, a * 0.55);
    yield* partial(d, sr, t, 1760 + rnd() * 200, 0.007, a * 0.3);
    // slips come in clusters
    t += rnd() < 0.7 ? 0.012 + rnd() * 0.02 : 0.06 + rnd() * 0.14;
  }
  return [yield* seamless(d, n, 0.1, sr)];
}

// The line parting: the crack, the broken end whipping back through the
// air, the spool spinning free and slowing.
function* snap(rnd, sr) {
  const d = buf(1.0, sr);
  yield* burst(d, sr, rnd, 0, 0.004, 1, { type: 'hp', f: 3000, curve: 2 });
  yield* partial(d, sr, 0.001, 980 + rnd() * 100, 0.06, 0.6, 860);
  yield* partial(d, sr, 0.001, 1960 + rnd() * 200, 0.04, 0.3, 1700);
  yield* burst(d, sr, rnd, 0.01, 0.34, 0.55, { type: 'bp', f: 3600, f2: 600, q: 1.2, attack: 0.01, curve: 3 });
  let t = 0.05;
  let gap = 1 / 130;
  while (t < 0.9) {
    yield* partial(d, sr, t, 3100 + rnd() * 300, 0.003, 0.35 * Math.exp(-(t - 0.05) * 3));
    t += gap;
    gap *= 1.05;
  }
  return [d];
}

// Setting the hook: a short hard sweep of the rod and the line coming taut.
function* hookset(rnd, sr) {
  const d = buf(0.4, sr);
  const T = 0.16;
  const N = Math.floor(T * sr);
  const bq = new BQ('bp', 700, 1.6, sr);
  for (let i = 0; i < N; i++) {
    if ((i & 1023) === 1023) yield;
    const sn = Math.sin((Math.PI * i) / N);
    if ((i & 15) === 0) bq.set('bp', 600 + 3000 * sn * sn, 1.8, sr);
    d[i] += bq.run(rnd() * 2 - 1) * sn * sn * 1.1;
  }
  yield* partial(d, sr, T * 0.8, 150 + rnd() * 20, 0.03, 0.6);
  yield* partial(d, sr, T * 0.8, 2400 + rnd() * 300, 0.006, 0.3);
  return [d];
}

// A fish flapping on the bank or in the hand: wet slaps, and water
// dripping off it.
function* flop(rnd, sr) {
  const d = buf(0.9, sr);
  let t = 0;
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    yield* burst(d, sr, rnd, t, 0.035, 0.9 - i * 0.2, { type: 'lp', f: 2400, q: 0.7, attack: 0.001, curve: 4 });
    yield* partial(d, sr, t, 170 + rnd() * 40, 0.025, 0.5);
    for (let k = 0; k < 3; k++) yield* bubble(d, sr, t + 0.06 + rnd() * 0.2, 1600 + rnd() * 1800, 0.06, 0.3, 0.008);
    t += 0.14 + rnd() * 0.12;
  }
  return [d];
}

// The fish lifted out: water streaming off it, drops falling.
function* lift(rnd, sr) {
  const d = buf(0.9, sr);
  yield* burst(d, sr, rnd, 0, 0.5, 0.35, { type: 'bp', f: 1900, q: 0.8, attack: 0.03, curve: 3 });
  for (let i = 0; i < 18; i++) {
    const t = rnd() * 0.75;
    yield* bubble(d, sr, t, 1200 + rnd() * 2600, 0.12 * (1 - t), 0.35, 0.008 + rnd() * 0.008);
  }
  return [d];
}

// ------------------------------------------------------------ the bow
function* twang(rnd, sr) {
  const d = buf(0.8, sr);
  yield* partial(d, sr, 0, 72 + rnd() * 10, 0.05, 0.8);
  const f = 120 + rnd() * 20;
  for (let h = 1; h <= 6; h++) yield* partial(d, sr, 0, f * h, 0.16 / h, 0.5 / h, f * h * 0.985);
  yield* partial(d, sr, 0, 390 + rnd() * 60, 0.03, 0.4);
  yield* partial(d, sr, 0, 880 + rnd() * 120, 0.015, 0.25);
  yield* burst(d, sr, rnd, 0, 0.006, 0.4, { type: 'hp', f: 2000 });
  yield* burst(d, sr, rnd, 0.012, 0.36, 0.32, { type: 'bp', f: 2700, f2: 850, q: 1.1, attack: 0.02, curve: 3 });
  return [d];
}

// A whistler arrow: a breathy whistle rising and falling as it passes.
function* whistler(rnd, sr) {
  const d = buf(1.4, sr);
  const N = d.length;
  const bq = new BQ('bp', 2500, 22, sr);
  let p = 0;
  for (let i = 0; i < N; i++) {
    if ((i & 1023) === 1023) yield;
    const u = i / N;
    const f = 2350 + 1000 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 300 * u;
    if ((i & 15) === 0) bq.set('bp', f, 22, sr);
    p += (TAU * f) / sr;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.5);
    d[i] = (bq.run(rnd() * 2 - 1) * 3 + Math.sin(p) * 0.25) * env;
  }
  return [d];
}

// An arrow striking: game (a wet thud), wood (a knock, the shaft
// quivering), rock (a clack and a skitter) or the ground (a dull thud and
// dirt).
function* hitGame(rnd, sr) {
  const d = buf(0.3, sr);
  yield* burst(d, sr, rnd, 0, 0.09, 1, { type: 'lp', f: 520, q: 0.7, brown: true, curve: 4 });
  yield* partial(d, sr, 0, 85 + rnd() * 15, 0.04, 0.8);
  yield* burst(d, sr, rnd, 0.004, 0.03, 0.18, { type: 'bp', f: 1700, q: 1 });
  return [d];
}
function* hitWood(rnd, sr) {
  const d = buf(0.6, sr);
  const f = 480 * (0.9 + 0.2 * rnd());
  yield* partial(d, sr, 0, f, 0.04, 1);
  yield* partial(d, sr, 0, f * 2.4, 0.02, 0.55);
  yield* partial(d, sr, 0, f * 4.9, 0.01, 0.3);
  yield* burst(d, sr, rnd, 0, 0.004, 0.5, { type: 'hp', f: 2500 });
  yield* partial(d, sr, 0.005, 206, 0.14, 0.18);
  yield* partial(d, sr, 0.005, 214, 0.14, 0.18);
  return [d];
}
function* hitRock(rnd, sr) {
  const d = buf(0.35, sr);
  const f = 2300 * (0.9 + 0.2 * rnd());
  yield* partial(d, sr, 0, f, 0.009, 1);
  yield* partial(d, sr, 0, f * 1.71, 0.006, 0.6);
  yield* partial(d, sr, 0, f * 2.63, 0.004, 0.35);
  yield* burst(d, sr, rnd, 0, 0.003, 0.6, { type: 'hp', f: 3500 });
  for (let i = 0; i < 3; i++) {
    const t = 0.05 + rnd() * 0.15;
    yield* partial(d, sr, t, f * (1.1 + rnd() * 0.6), 0.004, 0.25 * rnd());
  }
  return [d];
}
function* hitGround(rnd, sr) {
  const d = buf(0.35, sr);
  yield* burst(d, sr, rnd, 0, 0.08, 1, { type: 'lp', f: 650, q: 0.7, brown: true, curve: 4 });
  for (let i = 0; i < 10; i++) yield* burst(d, sr, rnd, rnd() * 0.07, 0.004, 0.12 + rnd() * 0.1, { type: 'hp', f: 3000 });
  return [d];
}

// ------------------------------------------------------------ the camera
// The release, the mirror slapping up, the curtain, and the winder.
function* shutter(rnd, sr) {
  const d = buf(0.5, sr);
  yield* partial(d, sr, 0, 4100, 0.003, 0.7);
  yield* partial(d, sr, 0, 6200, 0.002, 0.4);
  yield* partial(d, sr, 0.012, 140, 0.02, 0.6);
  yield* burst(d, sr, rnd, 0.012, 0.016, 0.5, { type: 'bp', f: 1800, q: 1 });
  yield* partial(d, sr, 0.075, 5200, 0.0025, 0.55);
  yield* burst(d, sr, rnd, 0.075, 0.004, 0.3, { type: 'hp', f: 3500 });
  const s = Math.floor(0.16 * sr);
  const n = Math.floor(0.24 * sr);
  const bq = new BQ('bp', 2000, 3, sr);
  for (let i = 0; i < n && s + i < d.length; i++) {
    if ((i & 1023) === 1023) yield;
    const u = i / n;
    if ((i & 31) === 0) bq.set('bp', 1900 + 900 * u, 3, sr);
    const am = 0.5 + 0.5 * Math.sin((TAU * 90 * i) / sr);
    d[s + i] += bq.run(rnd() * 2 - 1) * am * 0.4 * Math.sin(Math.PI * u);
  }
  return [d];
}

// ------------------------------------------------------------ the player
// A climbing shoe on granite: the rubber squeaking as it bites, the grit
// crunching under it.
function* scuff(rnd, sr) {
  const d = buf(0.25, sr);
  const f = 2300 + rnd() * 1500;
  yield* partial(d, sr, 0.005, f, 0.012, 0.35, f * (0.8 + rnd() * 0.15));
  yield* burst(d, sr, rnd, 0, 0.09, 0.8, { type: 'bp', f: 2600 + rnd() * 800, q: 0.9, attack: 0.01, curve: 3 });
  for (let i = 0; i < 6; i++) yield* burst(d, sr, rnd, rnd() * 0.08, 0.003, 0.2 + rnd() * 0.2, { type: 'hp', f: 4000 });
  return [d];
}

// A rush of air: the wing filling overhead as you run off the edge.
function* gust(rnd, sr) {
  const d = buf(1.4, sr);
  yield* burst(d, sr, rnd, 0, 1.3, 0.9, { type: 'bp', f: 320, f2: 1300, q: 0.7, attack: 0.4, curve: 3 });
  yield* burst(d, sr, rnd, 0.25, 0.8, 0.35, { type: 'hp', f: 2400, attack: 0.25, curve: 3 });
  // the cloth snapping taut
  yield* burst(d, sr, rnd, 0.42, 0.06, 0.6, { type: 'lp', f: 900, brown: true, attack: 0.003, curve: 4 });
  yield* partial(d, sr, 0.42, 95 + rnd() * 15, 0.05, 0.5, 70);
  return [d];
}

// Bear spray: the can's valve opening with a pop and a hard, fluttering
// jet of propellant.
function* spray(rnd, sr) {
  const d = buf(1.5, sr);
  yield* burst(d, sr, rnd, 0, 0.012, 0.8, { type: 'hp', f: 1500, curve: 2 });
  const n = Math.floor(1.35 * sr);
  const bq = new BQ('bp', 3200, 0.55, sr);
  let flut = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 1023) === 1023) yield;
    const u = i / n;
    if ((i & 63) === 0) flut = 0.75 + 0.25 * rnd();
    const env = Math.min(1, i / (0.03 * sr)) * (u > 0.8 ? (1 - u) / 0.2 : 1);
    d[i + 200] += bq.run(rnd() * 2 - 1) * env * flut * 0.9;
  }
  return [d];
}

// ------------------------------------------------------------ voices
// A voice: a train of pulses from the throat (its pitch wandering a little
// from one to the next, every other one weaker for a rough voice), breath
// noise, through the throat's and mouth's resonances (formants). o.f0(u)
// and o.amp(u) over the sound (u 0 to 1), o.forms(u) the formants as
// [frequency, bandwidth, gain].
function breathRun(src, i0, i1, st, rnd, amp, n, k) {
  let av = st.av;
  for (let i = i0; i < i1; i++) {
    if ((i & 31) === 0) av = amp(i / n) * k;
    src[i] += (rnd() * 2 - 1) * av;
  }
  st.av = av;
}
function filterRun(d, i0, i1, bq) {
  for (let i = i0; i < i1; i++) d[i] = bq.run(d[i]);
}
function formRun(src, out, i0, i1, st, forms, n) {
  let F = st.F;
  const { bqs, sr } = st;
  for (let i = i0; i < i1; i++) {
    if ((i & 63) === 0) {
      F = forms(i / n);
      for (let j = 0; j < bqs.length; j++) bqs[j].set('bp', F[j][0], Math.max(0.5, F[j][0] / F[j][1]), sr);
    }
    let y = 0;
    for (let j = 0; j < bqs.length; j++) y += bqs[j].run(src[i]) * F[j][2];
    out[i] = y;
  }
  st.F = F;
}
function pulsesRun(src, n, sr, secs, rnd, o) {
  const { f0, amp, jitter = 0.03, rough = 0, shimmer = 0.1 } = o;
  let t = 0;
  let k = 0;
  while (t < secs) {
    const u = t / secs;
    const f = Math.max(20, f0(u)) * (1 + (rnd() * 2 - 1) * jitter);
    const a = amp(u) * (1 + (rnd() * 2 - 1) * shimmer) * (k % 2 && rough ? 1 - rough : 1);
    const i0 = Math.floor(t * sr);
    for (let j = -3; j <= 3; j++) {
      const i = i0 + j;
      if (i >= 0 && i < n) src[i] += a * SPIKE[j + 3];
    }
    t += 1 / f;
    k++;
  }
}
const SPIKE = [-3, -2, -1, 0, 1, 2, 3].map((j) => 0.5 + 0.5 * Math.cos((Math.PI * j) / 4));
function* voice(rnd, sr, secs, o) {
  const n = Math.floor(secs * sr);
  const src = new Float32Array(n);
  const { amp, forms, breath = 0.1, tilt = 3500 } = o;
  // the pulses (each a short smoothed spike, so they are not too bright)
  pulsesRun(src, n, sr, secs, rnd, o);
  yield* pace(n);
  // breath, as loud as the voice (worked out every 32 samples), and the
  // source tilted down (a real throat's pulses are soft)
  const bst = { av: 0 };
  const lp = new BQ('lp', tilt, 0.7, sr);
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    breathRun(src, i, i1, bst, rnd, amp, n, breath * 0.35);
    filterRun(src, i, i1, lp);
    yield* pace((i1 - i) * 2);
  }
  // the resonances, in parallel, moving with the sound
  const out = new Float32Array(n);
  const F = forms(0);
  const st = { F, bqs: F.map(([f, bw]) => new BQ('bp', f, f / bw, sr)), sr };
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    formRun(src, out, i, i1, st, forms, n);
    yield* pace((i1 - i) * st.bqs.length);
  }
  return out;
}

// envelopes over a sound: rise in a, hold, fall over the last r (as shares)
const env3 = (a, r) => (u) => (u < a ? Math.sin((Math.PI / 2) * (u / a)) : u > 1 - r ? Math.max(0, (1 - u) / r) : 1);

// The grizzly: a deep rumbling growl, a roar opening up, a hard huff.
function* growl(rnd, sr) {
  const secs = 1.1 + rnd() * 0.4;
  const f = 58 + rnd() * 14;
  const e = env3(0.15, 0.3);
  const v = yield* voice(rnd, sr, secs, {
    f0: (u) => f * (1 + 0.12 * Math.sin(u * 9)),
    amp: (u) => e(u) * (0.75 + 0.25 * Math.sin(u * TAU * 7)),
    forms: () => [
      [310, 90, 1],
      [820, 130, 0.6],
      [1850, 220, 0.22],
      [2900, 300, 0.1],
    ],
    jitter: 0.07,
    rough: 0.45,
    breath: 0.55,
    tilt: 2200,
  });
  return [v];
}
function* roar(rnd, sr) {
  const secs = 1.7 + rnd() * 0.3;
  const v = yield* voice(rnd, sr, secs, {
    f0: (u) => 90 + 70 * Math.sin(Math.PI * Math.min(1, u * 1.3)) - 15 * u,
    amp: env3(0.18, 0.35),
    forms: (u) => {
      const o = Math.sin(Math.PI * Math.min(1, u * 1.4));
      return [
        [300 + 360 * o, 110, 1],
        [880 + 450 * o, 160, 0.7],
        [2000 + 300 * o, 260, 0.3],
        [3000, 320, 0.12],
      ];
    },
    jitter: 0.06,
    rough: 0.35,
    breath: 0.5,
    tilt: 2800,
  });
  const d = buf(secs, sr);
  mix(d, v, 0, sr);
  yield* burst(d, sr, rnd, 0.05, secs * 0.9, 0.22, { type: 'bp', f: 1200, q: 0.9, attack: 0.3, curve: 2 });
  return [d];
}
function* huff(rnd, sr) {
  const d = buf(0.7, sr);
  for (const [t, a] of [
    [0, 1],
    [0.3, 0.7],
  ]) {
    const s = buf(0.22, sr);
    yield* burst(s, sr, rnd, 0, 0.2, a, { type: 'bp', f: 420, q: 1.6, attack: 0.02, curve: 3.5 });
    yield* burst(s, sr, rnd, 0, 0.18, a * 0.5, { type: 'bp', f: 1150, q: 2, attack: 0.02, curve: 3.5 });
    yield* partial(s, sr, 0, 70, 0.05, a * 0.4);
    mix(d, s, t, sr);
  }
  return [d];
}
// A bear's paw swiping past: the air torn, then the blow landing.
function* swipe(rnd, sr) {
  const d = buf(0.7, sr);
  yield* burst(d, sr, rnd, 0, 0.22, 0.9, { type: 'bp', f: 500, f2: 1900, q: 1.1, attack: 0.12, curve: 2.5 });
  yield* burst(d, sr, rnd, 0.18, 0.12, 1, { type: 'lp', f: 420, q: 0.8, brown: true, attack: 0.002, curve: 4 });
  yield* partial(d, sr, 0.18, 68 + rnd() * 10, 0.07, 0.9, 48);
  return [d];
}

// Canada geese: a flock's honks, each breaking up into its top register
// (ha-ronk), two or three birds at once.
function* geese(rnd, sr) {
  const secs = 1.8;
  const d = buf(secs, sr);
  const birds = 2 + Math.floor(rnd() * 2);
  const e = env3(0.08, 0.25);
  for (let b = 0; b < birds; b++) {
    const p = 0.9 + rnd() * 0.25;
    let t = rnd() * 0.25;
    const k = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < k && t < secs - 0.3; i++) {
      const len = 0.2 + rnd() * 0.06;
      const v = yield* voice(rnd, sr, len, {
        f0: (u) => (u < 0.28 ? 300 : 520 - 50 * (u - 0.28)) * p,
        amp: e,
        forms: () => [
          [640 * p, 80, 1],
          [1180 * p, 110, 0.9],
          [2650 * p, 200, 0.35],
        ],
        jitter: 0.02,
        rough: 0.15,
        breath: 0.12,
        tilt: 4500,
      });
      mix(d, v, t, sr, 0.9 - b * 0.15);
      t += len + 0.12 + rnd() * 0.18;
    }
  }
  return [d];
}

// A mallard hen's decrescendo: QUACK quack quack quack, each shorter and
// softer.
function* quacks(rnd, sr) {
  const secs = 1.6;
  const d = buf(secs, sr);
  const k = 4 + Math.floor(rnd() * 3);
  const e = env3(0.06, 0.4);
  let t = 0;
  for (let i = 0; i < k; i++) {
    const len = 0.17 - i * 0.015;
    const g = 1 - i * 0.13;
    const v = yield* voice(rnd, sr, len, {
      f0: (u) => 255 - 70 * u - i * 6,
      amp: e,
      forms: () => [
        [880, 120, 1],
        [1560, 150, 1],
        [2450, 220, 0.55],
        [3500, 300, 0.2],
      ],
      jitter: 0.03,
      rough: 0.3,
      breath: 0.3,
      tilt: 4200,
    });
    mix(d, v, t, sr, g);
    t += len + 0.05 + i * 0.008;
  }
  return [d];
}

// Sandhill cranes: the rolling bugle (garoo-a-a-a), a pair calling together.
function* cranes(rnd, sr) {
  const secs = 1.5;
  const d = buf(secs, sr);
  const e = env3(0.08, 0.3);
  for (const [p, t0, g] of [
    [1, 0, 1],
    [1.19, 0.08 + rnd() * 0.06, 0.7],
  ]) {
    const v = yield* voice(rnd, sr, 1.25, {
      f0: (u) => (520 + 140 * Math.sin(Math.PI * Math.min(1, u * 1.8)) - 60 * u) * p,
      amp: (u) => e(u) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(u * TAU * 34), 1.5)),
      forms: () => [
        [720 * p, 110, 1],
        [1500 * p, 160, 0.6],
        [2700 * p, 260, 0.25],
      ],
      jitter: 0.02,
      rough: 0.1,
      breath: 0.08,
      tilt: 5000,
    });
    mix(d, v, t0, sr, g);
  }
  return [d];
}

// A common raven's croak: a deep, rough kraa, rising a little and falling.
function* croak(rnd, sr) {
  const secs = 0.36 + rnd() * 0.08;
  const f = 290 + rnd() * 80;
  const v = yield* voice(rnd, sr, secs, {
    f0: (u) => f * (1 + 0.06 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.18 * u),
    amp: env3(0.1, 0.45),
    forms: () => [
      [820, 140, 1],
      [1750, 220, 0.75],
      [2900, 320, 0.3],
    ],
    jitter: 0.06,
    rough: 0.5,
    breath: 0.45,
    tilt: 3800,
  });
  return [v];
}

// A belted kingfisher's dry rattle.
function* rattle(rnd, sr) {
  const d = buf(1.3, sr);
  let t = 0;
  let gap = 1 / 15;
  while (t < 1.15) {
    const a = 0.6 + rnd() * 0.4;
    yield* burst(d, sr, rnd, t, 0.012, a, { type: 'bp', f: 3600 + rnd() * 800, q: 1.4, attack: 0.001, curve: 3 });
    yield* partial(d, sr, t, 3150 + rnd() * 250, 0.004, a * 0.5);
    t += gap;
    gap = Math.max(1 / 21, gap * 0.985);
  }
  return [d];
}

// A black-billed magpie's harsh chatter (chak chak chak).
function* chakker(rnd, sr) {
  const d = buf(1.0, sr);
  const k = 5 + Math.floor(rnd() * 3);
  const e = env3(0.1, 0.5);
  for (let i = 0; i < k; i++) {
    const f = 880 + rnd() * 120;
    const v = yield* voice(rnd, sr, 0.05, {
      f0: () => f,
      amp: e,
      forms: () => [
        [1650, 260, 1],
        [2950, 360, 0.8],
        [4300, 500, 0.4],
      ],
      jitter: 0.08,
      rough: 0.4,
      breath: 0.9,
      tilt: 6000,
    });
    mix(d, v, i * 0.115 + rnd() * 0.01, sr, 1 - i * 0.05);
  }
  return [d];
}

// Steller sea lions: deep, rough barks, two to four.
function* barks(rnd, sr) {
  const secs = 2.0;
  const d = buf(secs, sr);
  const k = 2 + Math.floor(rnd() * 3);
  const e = env3(0.12, 0.45);
  let t = 0;
  for (let i = 0; i < k && t < secs - 0.35; i++) {
    const len = 0.28 + rnd() * 0.1;
    const f = 130 + rnd() * 40;
    const v = yield* voice(rnd, sr, len, {
      f0: (u) => f * (1.15 - 0.3 * u),
      amp: e,
      forms: () => [
        [480, 120, 1],
        [1050, 160, 0.7],
        [2300, 250, 0.3],
      ],
      jitter: 0.08,
      rough: 0.5,
      breath: 0.5,
      tilt: 3000,
    });
    mix(d, v, t, sr, 1 - i * 0.1);
    t += len + 0.12 + rnd() * 0.15;
  }
  return [d];
}

// An arctic ground squirrel's alarm: sik-sik.
function* sik(rnd, sr) {
  const d = buf(0.45, sr);
  for (const t of [0, 0.13 + rnd() * 0.03]) {
    yield* partial(d, sr, t, 6200 + rnd() * 500, 0.018, 1, 3900);
    yield* partial(d, sr, t, 3100, 0.012, 0.15, 2500);
  }
  return [d];
}

// A whale's blow: the roar of breath out through the blowhole, the lungs'
// low boom under it. An orca's is shorter and sharper.
function* blow(rnd, sr, v) {
  const orca = v >= 2;
  const secs = orca ? 0.8 : 1.6;
  const d = buf(secs, sr);
  yield* burst(d, sr, rnd, 0, secs * 0.85, 0.9, { type: 'lp', f: orca ? 900 : 450, q: 0.6, brown: true, attack: 0.03, curve: 3 });
  yield* burst(d, sr, rnd, 0, secs * 0.75, orca ? 0.7 : 0.45, { type: 'bp', f: orca ? 1700 : 1500, q: 0.6, attack: 0.02, curve: 3.5 });
  if (!orca) yield* partial(d, sr, 0, 52 + rnd() * 8, 0.3, 0.4);
  return [d];
}

// Wings beating: a heavy bird taking off.
function* flaps(rnd, sr) {
  const d = buf(0.7, sr);
  for (let i = 0; i < 5; i++) {
    const t = i * (0.11 + rnd() * 0.02);
    yield* burst(d, sr, rnd, t, 0.07, 1 - i * 0.12, { type: 'lp', f: 950, q: 0.8, brown: true, attack: 0.012, curve: 3 });
    yield* burst(d, sr, rnd, t, 0.05, 0.35, { type: 'bp', f: 1600, q: 1, attack: 0.01, curve: 3 });
  }
  return [d];
}

// A beaver's tail slapping the water.
function* slap(rnd, sr) {
  const d = buf(0.8, sr);
  yield* burst(d, sr, rnd, 0, 0.014, 1, { type: 'hp', f: 1200, curve: 2 });
  yield* partial(d, sr, 0, 210 + rnd() * 40, 0.022, 0.8);
  yield* burst(d, sr, rnd, 0.005, 0.5, 0.5, { type: 'lp', f: 3200, f2: 700, q: 0.6, curve: 3 });
  for (let i = 0; i < 30; i++) yield* bubble(d, sr, -Math.log(1 - rnd() * 0.97) * 0.07, 350 + rnd() * 1800, 0.06 + rnd() * 0.1, 0.6);
  return [d];
}

// ------------------------------------------------------------ the world
// A heavy knock to the car or the boat: the body's thump, the panels
// ringing a moment, loose things rattling.
function* thud(rnd, sr) {
  const d = buf(0.8, sr);
  yield* partial(d, sr, 0, 70 + rnd() * 12, 0.09, 1, 42);
  yield* burst(d, sr, rnd, 0, 0.1, 0.8, { type: 'lp', f: 700, q: 0.7, brown: true, attack: 0.001, curve: 4 });
  for (let i = 0; i < 5; i++) yield* partial(d, sr, 0.002, 180 + rnd() * 700, 0.03 + rnd() * 0.05, 0.15 + rnd() * 0.15);
  for (let i = 0; i < 6; i++) yield* burst(d, sr, rnd, 0.03 + rnd() * 0.25, 0.01, 0.08 + rnd() * 0.1, { type: 'bp', f: 1500 + rnd() * 2500, q: 2 });
  return [d];
}

// Ice giving way, or a sonic boom far off: the crack, the crackle of it
// running on, and its thunder rolling round the valley (played slower for a
// bigger one).
function* crack(rnd, sr) {
  const secs = 3.6;
  const L = buf(secs, sr);
  const R = buf(secs, sr);
  const rolls = [];
  for (let i = 0; i < 4; i++) rolls.push([0.15 + rnd() * 2.2, 0.4 + rnd() * 0.6]);
  for (const [d, r] of [
    [L, mulberry(Math.floor(rnd() * 1e9))],
    [R, mulberry(Math.floor(rnd() * 1e9))],
  ]) {
    yield* burst(d, sr, r, 0, 0.03, 1, { type: 'hp', f: 1400, curve: 2.5 });
    yield* burst(d, sr, r, 0.004, 0.25, 0.6, { type: 'bp', f: 2200, f2: 500, q: 0.8, attack: 0.002, curve: 3 });
    for (let i = 0; i < 26; i++) {
      const t = -Math.log(1 - r() * 0.95) * 0.18;
      yield* burst(d, sr, r, t, 0.006 + r() * 0.012, (0.2 + r() * 0.4) * Math.exp(-t * 3), { type: 'bp', f: 700 + r() * 2600, q: 1.3 });
    }
    // the rumble, swelling in rolls
    yield* burst(d, sr, r, 0.02, secs - 0.05, 0.75, { type: 'lp', f: 420, f2: 90, q: 0.6, brown: true, attack: 0.12, curve: 2.6 });
  }
  // (the swell of the rolls worked out every 32 samples)
  const gains = new Float32Array((L.length >> 5) + 1);
  for (let j = 0; j < gains.length; j++) {
    const t = (j * 32) / sr;
    let g = 0.55;
    for (const [at, a] of rolls) g += a * Math.exp(-((t - at) * (t - at)) / 0.09);
    gains[j] = g;
  }
  for (const d of [L, R]) {
    for (let i = 0; i < d.length; i += SLICE) {
      const i1 = Math.min(d.length, i + SLICE);
      for (let k = i; k < i1; k++) d[k] *= gains[k >> 5];
      yield* pace(i1 - i);
    }
  }
  return [L, R];
}

// ------------------------------------------------------------ engines
// A loop of an engine at one speed: its cylinders firing in order, each
// pulse of exhaust ringing in the pipe of its bank, the cylinders a little
// unlike one another (the lumpy idle of a big V8), with the hiss and
// clatter of the rest. Exactly whole cycles, so it loops without a seam.
function* engineLoop(rnd, sr, rpm, o) {
  const { cyl, perRev, banks, pipe, pipe2, tau, noise, lump, secs = 0.8 } = o;
  // firings a second, and the length of the loop in whole engine cycles
  const fire = (rpm / 60) * perRev;
  const cycleT = cyl / fire;
  const cycles = Math.max(1, Math.round(secs / cycleT));
  const n = Math.round(cycles * cycleT * sr);
  const d = new Float32Array(n);
  // each cylinder's own strength (the lump), the same every cycle
  const own = Array.from({ length: cyl }, () => 1 + (rnd() * 2 - 1) * lump);
  const pulse = new Float32Array(Math.floor(Math.min(cycleT, tau * 7) * sr) + 1);
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < cyl; k++) {
      const t = c * cycleT + (k / fire) * (1 + (rnd() * 2 - 1) * 0.004);
      const a = own[k] * (0.9 + rnd() * 0.2);
      const bank = banks ? banks[k] : k % 2;
      const pf = bank ? pipe2 : pipe;
      pulse.fill(0);
      yield* partial(pulse, sr, 0, pf, tau, a);
      yield* partial(pulse, sr, 0, pf * 2.7, tau * 0.5, a * 0.35);
      yield* burst(pulse, sr, rnd, 0, 0.003, a * noise, { type: 'lp', f: 2600 });
      const s = Math.floor(t * sr);
      for (let i = 0; i < pulse.length; i++) d[(s + i) % n] += pulse[i];
      yield;
    }
  }
  return [d];
}

// The hot rod's cross-plane V8 (firing 1-8-4-3-6-5-7-2: each bank fires
// unevenly, the burble), the outboard's two-stroke twin, the race car's V6.
const V8 = { cyl: 8, perRev: 4, banks: [0, 1, 1, 0, 1, 0, 0, 1], pipe: 165, pipe2: 182, tau: 0.011, noise: 0.5, lump: 0.16 };
const TWO = { cyl: 2, perRev: 2, banks: [0, 1], pipe: 760, pipe2: 820, tau: 0.006, noise: 0.9, lump: 0.08 };
const V6 = { cyl: 6, perRev: 3, banks: [0, 1, 0, 1, 0, 1], pipe: 380, pipe2: 410, tau: 0.007, noise: 0.6, lump: 0.04 };

// The klaxon (ah-ooga): the diaphragm buzzing faster as the motor spins
// up, through the horn's resonances.
function* klaxon(rnd, sr) {
  const secs = 0.95;
  const n = Math.floor(secs * sr);
  const d = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 2047) === 2047) yield;
    const t = i / sr;
    const f = t < 0.35 ? 250 + (150 * t) / 0.35 : t < 0.45 ? 400 : 400 - (100 * (t - 0.45)) / 0.3;
    p += f / sr;
    // a pulse with its edges softened (a buzzing diaphragm)
    const ph = p - Math.floor(p);
    d[i] = Math.tanh((ph < 0.25 ? 1 : -0.33) * 3) * 0.6;
  }
  yield* eq(d, sr, [
    ['peak', 850, 2.5, 12],
    ['peak', 1900, 3.5, 9],
    ['peak', 3100, 4, 6],
    ['lp', 4500, 0.7],
    ['hp', 180, 0.7],
  ]);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if ((i & 2047) === 2047) yield;
    const t = i / sr;
    const env = t < 0.04 ? t / 0.04 : t < 0.38 ? 1 : t < 0.44 ? 0.45 : t < 0.5 ? 1 : Math.max(0, Math.exp(-(t - 0.5) * 9));
    out[i] = Math.tanh(d[i] * 2) * env;
  }
  return [out];
}

// ------------------------------------------------------------ instruments
// A steel-string guitar's note: a delay line one period long, filled with
// a pluck's noise (darker for a soft pluck, shaped by where along the
// string it was plucked), going round and round through a little loss and
// smoothing (the extended Karplus-Strong string), then the body's
// resonances.
function stringRun(d, i0, i1, st) {
  const { line, N, rho, C } = st;
  let { w, prev, apx, apy } = st;
  for (let i = i0; i < i1; i++) {
    const y = line[w];
    d[i] = y;
    const v = rho * 0.5 * (y + prev);
    prev = y;
    const ap = C * v + apx - C * apy;
    apx = v;
    apy = ap;
    line[w] = ap;
    w = w + 1 === N ? 0 : w + 1;
  }
  st.w = w;
  st.prev = prev;
  st.apx = apx;
  st.apy = apy;
}
function* guitar(rnd, sr, midi, o = {}) {
  const { dur = 1.8, bright = 0.55, pick = 0.17, bass = false } = o;
  const f0 = midiHz(midi);
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  const P = sr / f0;
  const N = Math.floor(P - 0.6);
  const frac = P - N - 0.5;
  const C = (1 - frac) / (1 + frac);
  const t60 = bass ? 2.6 : 6.5 * Math.pow(2, -(midi - 40) / 17);
  const rho = Math.min(0.99995, Math.pow(10, -3 / (t60 * f0)) / Math.cos((Math.PI * f0) / sr));
  // the pluck
  const line = new Float32Array(N);
  let lp = 0;
  const a = 0.18 + 0.7 * bright;
  for (let i = 0; i < N; i++) {
    lp += a * (rnd() * 2 - 1 - lp);
    line[i] = lp;
  }
  const M = Math.max(1, Math.round(pick * N));
  const ex = Float32Array.from(line);
  for (let i = M; i < N; i++) line[i] = ex[i] - ex[i - M];
  let mean = 0;
  for (let i = 0; i < N; i++) mean += line[i] / N;
  let mx = 1e-9;
  for (let i = 0; i < N; i++) {
    line[i] -= mean;
    mx = Math.max(mx, Math.abs(line[i]));
  }
  for (let i = 0; i < N; i++) line[i] /= mx;
  // round and round
  const st = { line, N, rho, C, w: 0, prev: 0, apx: 0, apy: 0 };
  for (let i = 0; i < n; i += SLICE) {
    const i1 = Math.min(n, i + SLICE);
    stringRun(d, i, i1, st);
    yield* pace(i1 - i);
  }
  // the body
  if (bass)
    yield* eq(d, sr, [
      ['peak', 72, 1.4, 5],
      ['peak', 180, 1.6, 2],
      ['lp', 2600, 0.7],
    ]);
  else
    yield* eq(d, sr, [
      ['peak', 104, 1.8, 6],
      ['peak', 208, 2.2, 4],
      ['peak', 410, 1.4, 2],
      ['peak', 720, 1.2, -3],
      ['peak', 2600, 0.9, 2.5],
      ['hs', 6500, 0.7, -6],
    ]);
  // the fingertip
  yield* burst(d, sr, rnd, 0, 0.004, bass ? 0.04 : 0.06, { type: 'hp', f: 3000 });
  return [d];
}

// A felt piano's note: its partials, a little sharp of harmonic as a stiff
// string's are, the higher ones fainter and quicker to die (felt over the
// hammers), the lowest from three strings drifting a little apart. Twelve
// partials at most: under the felt the next is 40 dB down.
function* piano(rnd, sr, midi, o = {}) {
  const { dur = 2.8, soft = 0.6 } = o;
  const f0 = midiHz(midi);
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  const B = 0.00007 * Math.pow(2, ((midi - 48) / 12) * 0.9);
  const K = Math.min(12, Math.floor(6500 / f0));
  const T1 = 2.6 * Math.pow(2, -(midi - 48) / 16);
  for (let k = 1; k <= K; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    const ak = Math.pow(k, -1.15) * Math.exp(-(k - 1) / (3 + 7 * (1 - soft)));
    const tau = T1 / (1 + 0.32 * Math.pow(k - 1, 1.15));
    if (k <= 3) {
      for (const c of [-0.7, 0, 0.8]) yield* ring(d, sr, 0, fk * Math.pow(2, c / 1200), tau * (1 + c * 0.1), ak / 3, rnd() * TAU, 0.004);
    } else yield* ring(d, sr, 0, fk, tau, ak, rnd() * TAU, 0.003);
  }
  yield* burst(d, sr, rnd, 0, 0.03, 0.05, { type: 'lp', f: 600 });
  yield* eq(d, sr, [
    ['lp', 4200 - soft * 1200, 0.6],
    ['peak', 300, 1, 1.5],
  ]);
  return [d];
}

// A glockenspiel's bar: its partials at a free bar's ratios.
function* glock(rnd, sr, midi) {
  const f0 = midiHz(midi);
  const d = buf(1.2, sr);
  for (const [r, tau, a] of [
    [1, 0.42, 1],
    [2.76, 0.12, 0.32],
    [5.4, 0.05, 0.14],
    [8.93, 0.025, 0.06],
  ])
    yield* ring(d, sr, 0, f0 * r, tau, a, rnd() * TAU, 0.0008);
  yield* burst(d, sr, rnd, 0, 0.003, 0.15, { type: 'hp', f: 5000 });
  return [d];
}

// The drums: a kick, a brushed snare, a tighter snare, a hi-hat, a shaker,
// two toms, a rim click, a cymbal swelling up, a crash, a timpani and a
// heartbeat.
function* kick(rnd, sr) {
  const d = buf(0.45, sr);
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    if ((i & 2047) === 2047) yield;
    const t = i / sr;
    const f = 46 + 90 * Math.exp(-t * 28);
    p += (TAU * f) / sr;
    d[i] += Math.sin(p) * Math.exp(-t * 9) * Math.min(1, i / 16);
  }
  yield* burst(d, sr, rnd, 0, 0.004, 0.25, { type: 'hp', f: 2000 });
  return [d];
}
function* brush(rnd, sr) {
  const d = buf(0.35, sr);
  yield* burst(d, sr, rnd, 0, 0.3, 0.7, { type: 'bp', f: 4200, q: 0.6, attack: 0.025, curve: 3.5 });
  yield* burst(d, sr, rnd, 0, 0.004, 0.3, { type: 'hp', f: 1500 });
  yield* partial(d, sr, 0, 200, 0.03, 0.15);
  return [d];
}
function* snare(rnd, sr) {
  const d = buf(0.3, sr);
  yield* partial(d, sr, 0, 192, 0.035, 0.7, 175);
  yield* partial(d, sr, 0, 335, 0.025, 0.35);
  yield* burst(d, sr, rnd, 0, 0.2, 0.85, { type: 'hp', f: 1700, attack: 0.001, curve: 4 });
  return [d];
}
function* hat(rnd, sr) {
  const d = buf(0.09, sr);
  yield* burst(d, sr, rnd, 0, 0.06, 0.8, { type: 'hp', f: 7000, attack: 0.0005, curve: 4 });
  for (const f of [6100, 8200, 9700]) yield* partial(d, sr, 0, f, 0.01, 0.1);
  return [d];
}
function* shaker(rnd, sr) {
  const d = buf(0.12, sr);
  yield* burst(d, sr, rnd, 0, 0.1, 0.8, { type: 'bp', f: 6200, q: 1, attack: 0.025, curve: 4 });
  return [d];
}
function* tom(rnd, sr, v) {
  const d = buf(0.6, sr);
  const f1 = v ? 210 : 140;
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    if ((i & 2047) === 2047) yield;
    const t = i / sr;
    const f = f1 * (0.62 + 0.38 * Math.exp(-t * 14));
    p += (TAU * f) / sr;
    d[i] += Math.sin(p) * Math.exp(-t * 6) * Math.min(1, i / 16);
  }
  yield* burst(d, sr, rnd, 0, 0.05, 0.3, { type: 'lp', f: 900 });
  return [d];
}
function* rim(rnd, sr) {
  const d = buf(0.08, sr);
  yield* partial(d, sr, 0, 1750, 0.012, 1);
  yield* partial(d, sr, 0, 3150, 0.006, 0.5);
  yield* burst(d, sr, rnd, 0, 0.003, 0.4, { type: 'hp', f: 3000 });
  return [d];
}
function* swell(rnd, sr) {
  const d = buf(1.6, sr);
  const bq = new BQ('hp', 3200, 0.7, sr);
  for (let i = 0; i < d.length; i++) {
    if ((i & 2047) === 2047) yield;
    const u = i / d.length;
    d[i] = bq.run(rnd() * 2 - 1) * Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1) * 0.8;
  }
  return [d];
}
function* crash(rnd, sr) {
  const d = buf(2.2, sr);
  yield* burst(d, sr, rnd, 0, 2.1, 0.75, { type: 'hp', f: 3200, attack: 0.002, curve: 4 });
  for (const f of [3900, 5300, 7200, 8900, 11300]) yield* ring(d, sr, 0, f * (0.97 + rnd() * 0.06), 0.4 + rnd() * 0.3, 0.05, rnd() * TAU, 0.001);
  return [d];
}
function* timp(rnd, sr) {
  const d = buf(1.8, sr);
  const f = 73;
  for (const [r, tau, a] of [
    [1, 0.7, 1],
    [1.5, 0.45, 0.45],
    [1.98, 0.35, 0.3],
    [2.44, 0.25, 0.15],
  ])
    yield* ring(d, sr, 0, f * r, tau, a, rnd() * TAU, 0.004);
  yield* burst(d, sr, rnd, 0, 0.08, 0.3, { type: 'lp', f: 400 });
  return [d];
}
function* heart(rnd, sr) {
  const d = buf(0.6, sr);
  for (const [t, a] of [
    [0, 1],
    [0.26, 0.65],
  ]) {
    yield* partial(d, sr, t, 52, 0.06, a);
    yield* partial(d, sr, t, 104, 0.03, a * 0.3);
    yield* burst(d, sr, rnd, t, 0.05, a * 0.2, { type: 'lp', f: 300 });
  }
  return [d];
}

// ------------------------------------------------------------ the jobs
// Each sound: its name, its rate, how many takes, and how to make one (or,
// for an instrument, the notes to make: the music plays the nearest and
// shifts it a semitone or so). In the order they are wanted: the interface
// first (the title screen has buttons), then fishing, then the music, then
// the rest.
const range = (a, b, step) => {
  const out = [];
  for (let m = a; m <= b; m += step) out.push(m);
  return out;
};

// loops: no fades at their ends (they join without a seam)
const LOOPS = new Set(['reelWhir', 'drag', 'creak', 'v8', 'twoStroke', 'v6']);

const SOUNDS = [
  ['click', LO, 3, uiClick],
  ['tick', LO, 2, uiTick],
  ['slide', LO, 2, uiSlide],
  ['cast', LO, 3, cast],
  ['plop', LO, 4, plop],
  ['nibble', LO, 3, nibble],
  ['bite', LO, 3, bite],
  ['reelClick', LO, 6, reelClick],
  ['reelWhir', LO, 1, reelWhir],
  ['drag', LO, 1, drag],
  ['creak', LO, 1, creak],
  ['hookset', LO, 2, hookset],
  ['splashS', LO, 2, (r, s) => splash(r, s, 0.12)],
  ['splashM', LO, 2, (r, s) => splash(r, s, 0.5)],
  ['splashL', LO, 2, (r, s) => splash(r, s, 1)],
  ['snap', LO, 2, snap],
  ['flop', LO, 3, flop],
  ['lift', LO, 2, lift],
  ['coins', HI, 3, coins],
  ['till', HI, 2, till],
  ['guitar', LO, range(40, 76, 3), (r, s, m) => guitar(r, s, m, { dur: 1.5 })],
  ['bass', LO, range(28, 46, 3), (r, s, m) => guitar(r, s, m, { bass: true, bright: 0.25, pick: 0.28, dur: 1.6 })],
  ['glock', HI, range(72, 96, 4), glock],
  ['kick', LO, 2, kick],
  ['brush', HI, 2, brush],
  ['snare', HI, 2, snare],
  ['hat', HI, 2, hat],
  ['shaker', HI, 2, shaker],
  ['tom', LO, 2, tom],
  ['rim', HI, 1, rim],
  ['swell', HI, 1, swell],
  ['crash', HI, 1, crash],
  ['timp', LO, 1, timp],
  ['heart', LO, 1, heart],
  ['piano', LO, range(48, 84, 4), (r, s, m) => piano(r, s, m, { dur: 2.2 })],
  ['twang', LO, 3, twang],
  ['whistler', LO, 1, whistler],
  ['hitGame', LO, 2, hitGame],
  ['hitWood', LO, 2, hitWood],
  ['hitRock', LO, 2, hitRock],
  ['hitGround', LO, 2, hitGround],
  ['shutter', LO, 2, shutter],
  ['growl', LO, 2, growl],
  ['roar', LO, 2, roar],
  ['huff', LO, 2, huff],
  ['swipe', LO, 2, swipe],
  ['spray', LO, 1, spray],
  ['geese', LO, 2, geese],
  ['quacks', LO, 2, quacks],
  ['cranes', LO, 2, cranes],
  ['rattle', LO, 2, rattle],
  ['croak', LO, 3, croak],
  ['chakker', LO, 2, chakker],
  ['barks', LO, 2, barks],
  ['sik', LO, 2, sik],
  ['blow', LO, 4, blow],
  ['flaps', LO, 2, flaps],
  ['slap', LO, 2, slap],
  ['scuff', LO, 3, scuff],
  ['gust', LO, 1, gust],
  ['thud', LO, 2, thud],
  ['klaxon', LO, 1, klaxon],
  ['v8', LO, [900, 2200, 4200], (r, s, rpm) => engineLoop(r, s, rpm, V8)],
  ['twoStroke', LO, [1100, 2800, 5200], (r, s, rpm) => engineLoop(r, s, rpm, TWO)],
  ['v6', LO, [4000, 7500, 11000], (r, s, rpm) => engineLoop(r, s, rpm, V6)],
  ['crack', LO, 1, crack],
];

// a seed from a name, so each sound is the same every time the game runs
const seedOf = (name) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
};

// The jobs for the Bakery: each returns { rate, list, keys, loud } (keys:
// the notes or speeds of an instrument's or an engine's takes; loud: each
// take's loudness, see loudness()).
export function kitJobs() {
  return SOUNDS.map(([name, sr, takes, make]) => ({
    name,
    gen: (function* () {
      const rnd = mulberry(seedOf(name));
      const keys = Array.isArray(takes) ? takes : null;
      const count = keys ? keys.length : takes;
      const list = [];
      const loud = [];
      for (let v = 0; v < count; v++) {
        const chs = yield* make(rnd, sr, keys ? keys[v] : v);
        yield* normalise(chs, 0.9);
        if (!LOOPS.has(name)) edges(chs, sr, keys ? 0.25 : 0.02);
        loud.push(yield* loudness(chs, sr));
        list.push(chs);
        yield;
      }
      return { rate: sr, list, keys, loud };
    })(),
  }));
}
