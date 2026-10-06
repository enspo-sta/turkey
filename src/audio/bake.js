// Sounds made ahead of time as plain sample arrays, a little each frame (see
// Bakery), from the title screen on: the beds of the ambience (stereo noise
// in three colours, a river's babble of bubbles, rain's patter, drips from
// the trees, leaves rustling), a woodpecker's drumming and a squirrel's
// chatter, a set of footsteps for every kind of ground, and the impulse
// response of the reverb. All of it synthesised; nothing is loaded. No Web
// Audio here: the arrays become AudioBuffers once the sound is unlocked.

// samples per second of everything baked (the context resamples)
export const SR = 44100;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A loop that joins without a click: made `fade` seconds too long, its end
// is blended into its start (equal power), and the extra cut off.
export function* seamless(ch, n, fade, sr) {
  const f = Math.floor(fade * sr);
  const out = new Float32Array(n);
  out.set(ch.subarray(0, n));
  for (let i = 0; i < f; i++) {
    if ((i & 2047) === 2047) yield;
    const w = i / f;
    out[i] = ch[i] * Math.sin(w * Math.PI * 0.5) + ch[n + i] * Math.cos(w * Math.PI * 0.5);
  }
  return out;
}

// Scale a set of channels so the loudest sample is `peak` (the loops are
// plain functions run a slice at a time: a loop inside a generator runs
// several times slower).
function peakRun(c, i0, i1, m) {
  for (let i = i0; i < i1; i++) {
    const a = c[i] < 0 ? -c[i] : c[i];
    if (a > m) m = a;
  }
  return m;
}
function scaleRun(c, i0, i1, k) {
  for (let i = i0; i < i1; i++) c[i] *= k;
}
export function* normalise(chs, peak = 0.9) {
  const S = 16384;
  let m = 1e-9;
  for (const c of chs) {
    for (let i = 0; i < c.length; i += S) {
      m = peakRun(c, i, Math.min(c.length, i + S), m);
      yield;
    }
  }
  const k = peak / m;
  for (const c of chs) {
    for (let i = 0; i < c.length; i += S) {
      scaleRun(c, i, Math.min(c.length, i + S), k);
      yield;
    }
  }
  return chs;
}

// ------------------------------------------------------------ noise
// Stereo noise, the two sides independent (so it is wide, not a point in
// the middle): white, pink (equal energy per octave: wind, surf) or brown
// (deeper still: rumble).
export function* stereoNoise(seconds, color, seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const fade = 0.25;
  const m = n + Math.floor(fade * sr);
  const chs = [];
  for (let c = 0; c < 2; c++) {
    const d = new Float32Array(m);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < m; i++) {
      if ((i & 2047) === 2047) yield;
      const w = rnd() * 2 - 1;
      if (color === 'white') d[i] = w * 0.5;
      else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    chs.push(yield* seamless(d, n, fade, sr));
  }
  return yield* normalise(chs, 0.8);
}

// ------------------------------------------------------------ water
// A river's babble: what you hear of moving water is mostly air bubbles,
// each ringing briefly at a pitch set by its size and rising as it nears
// the surface. Seventy a second over a soft hiss of water.
export function* babble(seconds, seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const count = Math.floor(seconds * 70);
  for (let b = 0; b < count; b++) {
    if (b % 3 === 2) yield;
    const t0 = Math.floor(rnd() * n);
    // more small, low bubbles than big bright ones
    const f0 = 260 + Math.pow(rnd(), 1.7) * 1500;
    const dur = 0.012 + rnd() * 0.05;
    const len = Math.floor(dur * sr);
    const amp = 0.05 + rnd() * rnd() * 0.5;
    const rise = 0.4 + rnd() * 1.8;
    const pan = rnd() * 2 - 1;
    const gl = Math.sqrt((1 - pan) / 2);
    const gr = Math.sqrt((1 + pan) / 2);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      ph += (2 * Math.PI * f0 * (1 + rise * u * u)) / sr;
      const v = Math.sin(ph) * Math.min(1, i / 25) * Math.exp(-u * 5) * amp;
      const k = (t0 + i) % n;
      L[k] += v * gl;
      R[k] += v * gr;
    }
  }
  // the hiss of the water under the bubbles
  for (const [c, s] of [[L, 1], [R, 2]]) {
    const r2 = mulberry(seed * 7 + s);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 2047) === 2047) yield;
      lp += (r2() * 2 - 1 - lp) * 0.25;
      lp2 += (lp - lp2) * 0.25;
      c[i] += lp2 * 0.09;
    }
  }
  return yield* normalise([L, R], 0.85);
}

// ------------------------------------------------------------ rain
// Rain's patter: hundreds of drops a second, each a tiny bright tick, some
// louder where they hit something hard.
export function* patter(seconds, seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const count = Math.floor(seconds * 420);
  for (let b = 0; b < count; b++) {
    if (b % 40 === 39) yield;
    const t0 = Math.floor(rnd() * n);
    const f = 1800 + rnd() * 5200;
    const len = Math.floor((0.002 + rnd() * 0.006) * sr);
    const amp = 0.04 + Math.pow(rnd(), 3) * 0.6;
    const pan = rnd() * 2 - 1;
    const gl = Math.sqrt((1 - pan) / 2);
    const gr = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < len; i++) {
      const u = i / len;
      // a click at the start, then a short ring
      const v = (i < 3 ? rnd() * 2 - 1 : Math.sin((2 * Math.PI * f * i) / sr)) * Math.exp(-u * 6) * amp;
      const k = (t0 + i) % n;
      L[k] += v * gl;
      R[k] += v * gr;
    }
  }
  return yield* normalise([L, R], 0.85);
}

// Drips from the trees: fewer, bigger drops, a plip with a rising pitch
// where one falls into a puddle, a tap where it lands on a leaf.
export function* drips(seconds, seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const count = Math.floor(seconds * 9);
  for (let b = 0; b < count; b++) {
    if (b % 4 === 3) yield;
    const t0 = Math.floor(rnd() * n);
    const pan = rnd() * 2 - 1;
    const gl = Math.sqrt((1 - pan) / 2);
    const gr = Math.sqrt((1 + pan) / 2);
    const amp = 0.15 + rnd() * 0.6;
    if (rnd() < 0.55) {
      const f0 = 600 + rnd() * 1100;
      const len = Math.floor((0.02 + rnd() * 0.04) * sr);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len;
        ph += (2 * Math.PI * f0 * (1 + 1.4 * u)) / sr;
        const v = Math.sin(ph) * Math.min(1, i / 20) * Math.exp(-u * 4) * amp;
        const k = (t0 + i) % n;
        L[k] += v * gl;
        R[k] += v * gr;
      }
    } else {
      const len = Math.floor(0.012 * sr);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (rnd() * 2 - 1 - lp) * 0.5;
        const v = lp * Math.exp((-i / len) * 5) * amp * 0.8;
        const k = (t0 + i) % n;
        L[k] += v * gl;
        R[k] += v * gr;
      }
    }
  }
  return yield* normalise([L, R], 0.8);
}

// ------------------------------------------------------------ leaves
// Leaves and needles moving in the wind: noise broken into many short
// overlapping bursts, the crackle of things brushing together, kept high.
export function* rustle(seconds, seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const fade = 0.3;
  const m = n + Math.floor(fade * sr);
  const chs = [];
  for (let c = 0; c < 2; c++) {
    const env = new Float32Array(m);
    const bursts = Math.floor((m / sr) * 160);
    for (let b = 0; b < bursts; b++) {
      if (b % 10 === 9) yield;
      const t0 = Math.floor(rnd() * m);
      const len = Math.floor((0.008 + rnd() * 0.04) * sr);
      const a = Math.pow(rnd(), 2);
      for (let i = 0; i < len && t0 + i < m; i++) {
        const u = i / len;
        env[t0 + i] += a * Math.sin(u * Math.PI);
      }
    }
    const d = new Float32Array(m);
    let lp = 0;
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < m; i++) {
      if ((i & 2047) === 2047) yield;
      const w = rnd() * 2 - 1;
      // high-passed (leaves are bright) and gently smoothed on top
      hp = 0.86 * (hp + w - prev);
      prev = w;
      lp += (hp - lp) * 0.6;
      d[i] = lp * Math.min(1.5, env[i]);
    }
    chs.push(yield* seamless(d, n, fade, sr));
  }
  return yield* normalise(chs, 0.8);
}

// ------------------------------------------------------------ animals
// A woodpecker drumming on a dead trunk: some twenty-five strikes in about
// a second, each a hard knock with the hollow ring of the wood.
export function* drum(seed, sr = SR) {
  const rnd = mulberry(seed);
  const n = Math.floor(1.3 * sr);
  const d = new Float32Array(n);
  // a hairy woodpecker: about 26 strikes a second, for about a second
  const strikes = 22 + Math.floor(rnd() * 6);
  const gap = 1 / (24 + rnd() * 3);
  const ring = 850 + rnd() * 450;
  for (let s = 0; s < strikes; s++) {
    if (s % 3 === 2) yield;
    const t0 = Math.floor((s * gap + rnd() * 0.004) * sr);
    const amp = (0.6 + rnd() * 0.4) * (1 - (0.35 * s) / strikes);
    const len = Math.floor(0.05 * sr);
    for (let i = 0; i < len && t0 + i < n; i++) {
      const u = i / len;
      const v = (i < 4 ? rnd() * 2 - 1 : 0) * 0.9 + Math.sin((2 * Math.PI * ring * i) / sr) * Math.exp(-u * 9) * 0.7 + Math.sin((2 * Math.PI * 190 * i) / sr) * Math.exp(-u * 6) * 0.5;
      d[t0 + i] += v * amp;
    }
  }
  return (yield* normalise([d], 0.9))[0];
}

// A red squirrel scolding from a spruce: a dry rattle of fast chirps.
export function* chatter(seed, sr = SR) {
  const rnd = mulberry(seed);
  const secs = 1.6;
  const n = Math.floor(secs * sr);
  const d = new Float32Array(n);
  let t = 0.02;
  let k = 0;
  while (t < secs - 0.08) {
    if (k++ % 4 === 3) yield;
    const t0 = Math.floor(t * sr);
    const len = Math.floor((0.018 + rnd() * 0.012) * sr);
    const f = 3200 + rnd() * 1600;
    const amp = 0.5 + rnd() * 0.5;
    for (let i = 0; i < len && t0 + i < n; i++) {
      const u = i / len;
      const v = (Math.sin((2 * Math.PI * f * (1 - 0.25 * u) * i) / sr) * 0.7 + (rnd() * 2 - 1) * 0.3) * Math.sin(u * Math.PI) * amp;
      d[t0 + i] += v;
    }
    // the rattle speeds up a little, then slows at the end
    t += 0.05 + rnd() * 0.012 + (t > secs * 0.7 ? 0.02 : 0);
  }
  return (yield* normalise([d], 0.85))[0];
}

// ------------------------------------------------------------ footsteps
// Each step is a heel, then the foot rolling onto the ground: what that
// sounds like depends on what it is made of. Six of each kind, so no two
// steps in a row are the same.
const STEP_LEN = 0.32;

function addNoise(d, rnd, t0, attack, decay, amp, lpK = 1, hpK = 0) {
  const SR = d.sr;
  const s = Math.floor(t0 * SR);
  const n = Math.floor((attack + decay * 4) * SR);
  let lp = 0;
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < n && s + i < d.length; i++) {
    const t = i / SR;
    const env = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    const w = rnd() * 2 - 1;
    lp += (w - lp) * lpK;
    let v = lp;
    if (hpK) {
      hp = hpK * (hp + v - prev);
      prev = v;
      v = hp;
    }
    d[s + i] += v * env * amp;
  }
}

function addGrains(d, rnd, t0, spread, count, fLo, fHi, durLo, durHi, amp) {
  const SR = d.sr;
  for (let g = 0; g < count; g++) {
    const s = Math.floor((t0 + Math.pow(rnd(), 1.4) * spread) * SR);
    const f = fLo + rnd() * (fHi - fLo);
    const len = Math.floor((durLo + rnd() * (durHi - durLo)) * SR);
    const a = amp * (0.3 + rnd() * 0.7);
    for (let i = 0; i < len && s + i < d.length; i++) {
      const u = i / len;
      d[s + i] += (Math.sin((2 * Math.PI * f * i) / SR) * 0.6 + (rnd() * 2 - 1) * 0.4) * Math.exp(-u * 5) * a;
    }
  }
}

function addTone(d, t0, f, decay, amp, f2 = f) {
  const SR = d.sr;
  const s = Math.floor(t0 * SR);
  const n = Math.floor(decay * 5 * SR);
  let ph = 0;
  for (let i = 0; i < n && s + i < d.length; i++) {
    const t = i / SR;
    const u = i / n;
    ph += (2 * Math.PI * (f + (f2 - f) * u)) / SR;
    d[s + i] += Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, i / 20) * amp;
  }
}

const STEPS = {
  // grass: a soft swish and the odd stalk snapping
  grass(d, rnd) {
    addNoise(d, rnd, 0, 0.012, 0.045, 0.5, 0.35);
    addNoise(d, rnd, 0.05, 0.03, 0.05, 0.35, 0.25);
    addGrains(d, rnd, 0.01, 0.1, 5, 2500, 5000, 0.002, 0.005, 0.12);
  },
  // forest floor: needles and duff, crackling, now and then a twig
  forest(d, rnd, v) {
    addNoise(d, rnd, 0, 0.008, 0.04, 0.45, 0.3);
    addGrains(d, rnd, 0.005, 0.13, 16, 1500, 4800, 0.002, 0.006, 0.22);
    if (v % 3 === 0) addTone(d, 0.03 + rnd() * 0.05, 2200 + rnd() * 1200, 0.006, 0.35, 1600);
  },
  // rock: the heel's click and a dull thud
  rock(d, rnd) {
    addNoise(d, rnd, 0, 0.001, 0.004, 0.9, 0.9);
    addTone(d, 0.001, 1700 + rnd() * 900, 0.008, 0.25);
    addTone(d, 0, 110 + rnd() * 40, 0.025, 0.5, 80);
    addNoise(d, rnd, 0.06, 0.004, 0.01, 0.25, 0.7);
  },
  // snow: a squeaky crunch, the crystals breaking
  snow(d, rnd) {
    addNoise(d, rnd, 0, 0.02, 0.06, 0.35, 0.4, 0.8);
    addGrains(d, rnd, 0.005, 0.16, 26, 900, 2600, 0.003, 0.008, 0.25);
    addTone(d, 0.04, 1100 + rnd() * 300, 0.03, 0.08, 1400);
  },
  // sand: a soft dry hiss
  sand(d, rnd) {
    addNoise(d, rnd, 0, 0.015, 0.06, 0.4, 0.6, 0.7);
    addGrains(d, rnd, 0.01, 0.1, 8, 4000, 7000, 0.001, 0.003, 0.06);
  },
  // gravel: stones grinding and knocking under the boot
  gravel(d, rnd) {
    addTone(d, 0, 140, 0.02, 0.35, 90);
    addGrains(d, rnd, 0.002, 0.14, 34, 1800, 6500, 0.002, 0.006, 0.32);
    addNoise(d, rnd, 0, 0.01, 0.05, 0.25, 0.7, 0.6);
  },
  // tundra: spongy moss with brittle lichen crackling in it
  tundra(d, rnd) {
    addNoise(d, rnd, 0, 0.02, 0.06, 0.55, 0.12);
    addGrains(d, rnd, 0.01, 0.12, 9, 3000, 5500, 0.0015, 0.004, 0.12);
  },
  // ice: a hard tick and a thin ring
  ice(d, rnd) {
    addNoise(d, rnd, 0, 0.001, 0.003, 0.8, 1);
    addTone(d, 0.001, 3200 + rnd() * 900, 0.02, 0.22);
    addNoise(d, rnd, 0.01, 0.01, 0.04, 0.15, 0.8, 0.9);
  },
  // mud: a wet suck and a pop as the boot comes out
  mud(d, rnd) {
    const SR = d.sr;
    const n = Math.floor(0.16 * SR);
    let lp = 0;
    let low = 0;
    let band = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      // a resonance gliding up (a state-variable filter): the mud closing
      // round the boot
      const f = 2 * Math.sin((Math.PI * (300 + 700 * u)) / SR);
      lp += (rnd() * 2 - 1 - lp) * 0.3;
      low += f * band;
      const high = lp - low - 0.25 * band;
      band += f * high;
      d[i] += band * Math.sin(u * Math.PI) * 0.5;
    }
    addTone(d, 0.18 + rnd() * 0.04, 260 + rnd() * 120, 0.012, 0.35, 520);
  },
  // the gravel road: a firmer, denser crunch
  road(d, rnd) {
    addTone(d, 0, 150, 0.02, 0.4, 95);
    addGrains(d, rnd, 0.002, 0.1, 40, 2000, 6000, 0.0015, 0.005, 0.28);
  },
  // boards: a hollow knock, the wood ringing under you
  deck(d, rnd, v) {
    addNoise(d, rnd, 0, 0.001, 0.005, 0.6, 0.8);
    addTone(d, 0, 170 + rnd() * 70, 0.05, 0.55, 150);
    addTone(d, 0.002, 620 + rnd() * 200, 0.012, 0.18);
    if (v % 4 === 1) addTone(d, 0.08, 420, 0.06, 0.04, 380);
  },
  // shallow water: a splash, a few bubbles
  water(d, rnd) {
    addNoise(d, rnd, 0, 0.01, 0.09, 0.6, 0.5, 0.5);
    for (let b = 0; b < 4; b++) addTone(d, 0.03 + rnd() * 0.15, 500 + rnd() * 900, 0.012, 0.18 * rnd(), 900 + rnd() * 1000);
  },
};

export function* footsteps(seed, sr = SR) {
  const rnd = mulberry(seed);
  const out = {};
  for (const [name, make] of Object.entries(STEPS)) {
    out[name] = [];
    for (let v = 0; v < 6; v++) {
      const d = new Float32Array(Math.floor(STEP_LEN * sr));
      // the helpers read the rate from the array
      d.sr = sr;
      make(d, rnd, v);
      // a short fade at the end, so nothing is cut off with a click
      const f = Math.floor(0.02 * sr);
      for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
      out[name].push((yield* normalise([d], 0.85))[0]);
      yield;
    }
  }
  return out;
}

// ------------------------------------------------------------ the reverb
// The sound of a big outdoor space: a few early echoes off the ground and
// the nearest trees, then a dense tail dying away, losing its highs as it
// goes (air and leaves soak them up). bright (0 to 1) keeps more of the
// highs, for a room rather than the woods: the music's hall.
export function* impulse(seconds, seed, sr = SR, bright = 0) {
  const rnd = mulberry(seed);
  const n = Math.floor(seconds * sr);
  const chs = [];
  for (let c = 0; c < 2; c++) {
    const d = new Float32Array(n);
    const taps = [0.011, 0.019, 0.027, 0.041, 0.057, 0.071];
    for (const t of taps) {
      const i = Math.floor((t + rnd() * 0.004) * sr);
      if (i < n) d[i] += (rnd() < 0.5 ? -1 : 1) * (0.5 - t * 4);
    }
    let lp = 0;
    for (let i = Math.floor(0.012 * sr); i < n; i++) {
      if ((i & 2047) === 2047) yield;
      const t = i / sr;
      // the tail grows darker as it fades
      const k = Math.max(0.04 + bright * 0.2, 0.85 * Math.exp(-t * 2.6 * (1 - bright * 0.6)));
      lp += (rnd() * 2 - 1 - lp) * k;
      d[i] += lp * Math.exp(-t * (6.9 / seconds)) * 0.55 * Math.min(1, t / 0.03);
    }
    chs.push(d);
  }
  return yield* normalise(chs, 0.9);
}

// ------------------------------------------------------------ the list
// The ambience's textures, in the order they are wanted, and the rate each is
// made at (see ambience.js; the sound's worker makes them from this list,
// see oven.js). Older Safari makes no buffer below 22 050 samples a second.
export const AMB_RATES = { white: 44100, pink: 22050, brown: 22050, babble: 22050, rustle: 22050, patter: 22050, drips: 22050, drum: 22050, chatter: 22050, steps: 22050 };
export function ambienceJobs() {
  const R = AMB_RATES;
  return [
    { name: 'pink', gen: stereoNoise(5, 'pink', 12, R.pink) },
    { name: 'brown', gen: stereoNoise(6, 'brown', 13, R.brown) },
    { name: 'white', gen: stereoNoise(4, 'white', 11, R.white) },
    { name: 'steps', gen: footsteps(61, R.steps) },
    { name: 'babble', gen: babble(8, 21, R.babble) },
    { name: 'rustle', gen: rustle(6, 31, R.rustle) },
    { name: 'patter', gen: patter(5, 41, R.patter) },
    { name: 'drips', gen: drips(6, 51, R.drips) },
    { name: 'drum', gen: drum(71, R.drum) },
    { name: 'chatter', gen: chatter(81, R.chatter) },
  ];
}

// ------------------------------------------------------------ the baker
// Runs the jobs above a little at a time, within a budget of milliseconds a
// frame, and hands each result to onDone.
export class Bakery {
  constructor() {
    this.jobs = [];
    this.done = {};
    this.onDone = null;
  }

  add(name, gen) {
    this.jobs.push({ name, gen });
  }

  get busy() {
    return this.jobs.length > 0;
  }

  step(ms) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < ms) {
      const j = this.jobs[0];
      const r = j.gen.next();
      if (!r.done) continue;
      this.jobs.shift();
      this.done[j.name] = r.value;
      if (this.onDone) this.onDone(j.name, r.value);
    }
  }

  // everything at once (tests)
  finish() {
    while (this.jobs.length) this.step(1e9);
  }
}
