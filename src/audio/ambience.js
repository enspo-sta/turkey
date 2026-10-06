// The sound of the place: layered, directional and alive, changing with
// where you are, the weather and the time of day. All synthesised.
//
// Beds that loop under everything, each from its own baked texture (see
// bake.js): wind in two bands, its gusts the same gusts that bend the grass
// and the trees (fxGust in world/worldfx.js), leaves rustling in them where
// the forest is thick, a whistle round the high ground; a river's low roar,
// its rush and its babble of bubbles, heard from the river's side of you;
// the falls; the sea's wash; rain's hiss and patter, and drips from the
// trees during and after it.
//
// Events over them: waves breaking and the pebbles' hiss as they draw back,
// water lapping at the shore, distant thunder in a downpour, bees going by
// in the meadows, mosquitoes whining on the flats.
//
// And the birds, as birds sing: a few singers at a time, each on its own
// perch, singing its own species' song over and over and then moving on.
// Which species depends on the ground round you (forest, open meadow,
// tundra, the shore) and how many on the hour: a dawn chorus, a quieter
// midday, an evening chorus, owls and loons at night, few in the rain.
// Every sound from the world is placed: panned to its side, quieter and
// duller with distance (the air soaks up the highs), a little duller behind
// you, and sent to a reverb whose impulse is baked too.
//
// Inside the car the outside goes dull; under water, duller still.
import { FX } from '../world/worldfx.js';
import { SURF } from '../world/worldgen.js';
import { Bakery, stereoNoise, babble, patter, drips, rustle, drum, chatter, footsteps, impulse } from './bake.js';

// (older Safari makes no buffer below 22 050 samples a second)
const LO = 22050;
const MID = 22050;
const HI = 44100;

// All the beds together, against the rest of the mix (the effects and the
// music are set against the announcer's voice, see LEVEL in audio.js)
const BEDS = 0.8;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x, a, b) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// where the tundra is looked for round you: underfoot, and 20, 45 and 70 m
// out in eight directions
const TUNDRA_LOOK = [[0, 0]];
for (const r of [20, 45, 70]) for (let a = 0; a < 8; a++) TUNDRA_LOOK.push([Math.round(Math.cos((a * Math.PI) / 4) * r), Math.round(Math.sin((a * Math.PI) / 4) * r)]);
// up from a to b, down again from b to c
const bump = (x, a, b, c) => (x < b ? smooth(x, a, b) : 1 - smooth(x, b, c));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// The gust passing over (x, z) now: the same as fxGust in worldfx.js.
export function gustAt(x, z) {
  const w = FX.uFxWind.value;
  const t = FX.uFxTime.value;
  const along = x * w.x + z * w.y;
  const across = -x * w.y + z * w.x;
  const a = along * 0.07 + Math.sin(across * 0.011 + t * 0.07) * 1.7 - t * 0.75;
  let g = 0.5 + 0.5 * Math.sin(a);
  g = g * g * g;
  return g * (0.4 + 0.3 * (1 + Math.sin(across * 0.021 - along * 0.005 + t * 0.1))) * w.z;
}

// What sings where, and how often (relative): forest, open meadow and
// shrub, tundra and high ground, the shore.
const HABITAT = {
  forest: { varied: 3, hermit: 2.2, swainson: 2.2, robin: 1.2, chickadee: 2, woodpecker: 0.8, raven: 0.5, squirrel: 1.1 },
  open: { sparrow: 3, robin: 2.2, chickadee: 0.6, raven: 0.6, bee: 0.8 },
  tundra: { ptarmigan: 2.4, sparrow: 1, raven: 0.7 },
  shore: { gull: 3, eagle: 0.7, raven: 0.5, sparrow: 0.4 },
};
// how long a singer waits between songs (seconds), and how many songs
const GAP = {
  varied: [4, 16, 4, 9],
  hermit: [3, 6, 5, 10],
  swainson: [2.5, 5, 6, 12],
  robin: [1.2, 2.6, 8, 16],
  chickadee: [3, 8, 3, 7],
  sparrow: [6, 11, 4, 8],
  woodpecker: [9, 20, 2, 4],
  raven: [6, 15, 2, 5],
  squirrel: [10, 24, 1, 3],
  gull: [4, 10, 3, 7],
  ptarmigan: [8, 18, 2, 5],
  eagle: [10, 22, 2, 4],
  owl: [5, 10, 4, 9],
  loon: [16, 40, 2, 4],
  bee: [0, 0, 1, 1],
};
// singers that are birds of the night
const NIGHT = { owl: 1, loon: 1 };

export class Ambience {
  constructor(engine) {
    this.A = engine;
    this.ctx = null;
    this.bakery = new Bakery();
    // the textures, in the order they are wanted
    this.rates = { white: HI, pink: MID, brown: LO, babble: MID, rustle: MID, patter: MID, drips: MID, drum: MID, chatter: MID, steps: MID };
    this.bakery.add('pink', stereoNoise(5, 'pink', 12, MID));
    this.bakery.add('brown', stereoNoise(6, 'brown', 13, LO));
    this.bakery.add('white', stereoNoise(4, 'white', 11, HI));
    this.bakery.add('steps', footsteps(61, MID));
    this.bakery.add('babble', babble(8, 21, MID));
    this.bakery.add('rustle', rustle(6, 31, MID));
    this.bakery.add('patter', patter(5, 41, MID));
    this.bakery.add('drips', drips(6, 51, MID));
    this.bakery.add('drum', drum(71, MID));
    this.bakery.add('chatter', chatter(81, MID));
    this.bakery.onDone = (name, v) => this.baked(name, v);
    this.buffers = {};
    this.beds = {};
    this.here = { forest: 0, open: 0, tundra: 0, shore: 0, river: 0, riverFast: 0, falls: 0, sea: 0, lake: 0, flats: 0, ground: 0 };
    this.senseT = 0;
    this.singers = [];
    this.singT = 1;
    this.voices = 0;
    this.waveT = 4;
    this.lapT = 1;
    this.thunderT = 30;
    this.beeT = 15;
    this.stepLast = {};
    this.stepSide = 1;
    this.mozzies = null;
  }

  // Sounds made in advance, a little a frame, from the title screen on.
  bake(ms) {
    if (this.bakery.busy) this.bakery.step(ms);
  }

  baked(name, v) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const sr = this.rates[name];
    if (name === 'steps') {
      this.steps = {};
      for (const [k, list] of Object.entries(v)) this.steps[k] = list.map((d) => this.buffer([d], sr));
      delete this.bakery.done[name];
      return;
    }
    if (name === 'ir') {
      this.verb.buffer = this.buffer(v, ctx.sampleRate);
      delete this.bakery.done[name];
      return;
    }
    this.buffers[name] = this.buffer(Array.isArray(v) ? v : [v], sr);
    // the beds waiting for this texture start (or swap to it) now
    for (const b of Object.values(this.beds)) if (b.want === name) this.swap(b);
    // the arrays are in the buffer now
    delete this.bakery.done[name];
  }

  buffer(chs, sr) {
    const b = this.ctx.createBuffer(chs.length, chs[0].length, sr);
    chs.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  }

  // ------------------------------------------------------------ setting up
  start(ctx) {
    this.ctx = ctx;
    const A = this.A;
    // everything goes through the muffle (the car, the water) to the mix
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.4;
    this.muffle.connect(A.amb);
    this.out = ctx.createGain();
    this.out.connect(this.muffle);
    // the reverb: the impulse is made now, at the context's own rate
    this.verb = ctx.createConvolver();
    this.verbSend = ctx.createGain();
    this.verbOut = ctx.createGain();
    this.verbOut.gain.value = 0.55;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.verbOut);
    this.verbOut.connect(this.muffle);
    this.bakery.jobs.unshift({ name: 'ir', gen: impulse(1.5, 7, ctx.sampleRate) });
    // a bird's note: a whistle with a little of its octave and twelfth
    this.waves = {
      whistle: ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.12, 0.035])),
      reed: ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.5, 0.33, 0.2, 0.12])),
    };
    // the beds, silent until wanted. The low ones are band-passed rather
    // than low-passed: the deep rumble under them (below about 80 Hz) is
    // what a microphone hears in the wind, not an ear, and a phone's speaker
    // cannot play it; their body is kept, a little higher.
    const B = (name, want, type, freq, q, dir = false) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      f.connect(g);
      let p = null;
      if (dir) {
        p = ctx.createStereoPanner();
        g.connect(p);
        p.connect(this.out);
      } else g.connect(this.out);
      const bed = { name, want, f, g, p, src: null, on: 0, quiet: 0 };
      this.beds[name] = bed;
      return bed;
    };
    B('windLow', 'brown', 'bandpass', 260, 0.55);
    B('windHigh', 'pink', 'bandpass', 700, 0.55);
    B('whistle', 'pink', 'bandpass', 1300, 9);
    B('leaves', 'rustle', 'highpass', 1200, 0.5);
    B('riverLow', 'brown', 'bandpass', 210, 0.6, true);
    B('riverRush', 'pink', 'bandpass', 650, 0.45, true);
    B('babble', 'babble', 'highpass', 160, 0.5, true);
    B('falls', 'pink', 'lowpass', 2600, 0.4, true);
    B('fallsLow', 'brown', 'bandpass', 170, 0.6, true);
    B('sea', 'brown', 'bandpass', 380, 0.5, true);
    B('rain', 'white', 'highpass', 1700, 0.45);
    B('patter', 'patter', 'highpass', 800, 0.5);
    B('drips', 'drips', 'highpass', 250, 0.5);
    // what was baked before there was a context to give it to
    for (const [name, v] of Object.entries(this.bakery.done)) this.baked(name, v);
  }

  // A bed's loop: started when it is wanted and its texture is ready, let go
  // after a while of silence (a stopped source costs nothing).
  swap(bed) {
    const buf = this.buffers[bed.want];
    if (!buf || !bed.on) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(bed.f);
    s.start(ctx.currentTime, Math.random() * buf.duration);
    if (bed.src) {
      const old = bed.src;
      try {
        old.stop(ctx.currentTime + 0.05);
      } catch (e) {
        /* already stopped */
      }
    }
    bed.src = s;
  }

  set(name, v, tc = 0.3) {
    const bed = this.beds[name];
    if (!bed) return;
    const t = this.ctx.currentTime;
    if (v > 0.0005) {
      bed.quiet = 0;
      if (!bed.on) {
        bed.on = 1;
        this.swap(bed);
      }
    } else if (bed.on) {
      bed.quiet += this.dt || 0;
      if (bed.quiet > 3) {
        bed.on = 0;
        if (bed.src) bed.src.stop(t + 0.05);
        bed.src = null;
      }
    }
    if (Math.abs((bed.last ?? -1) - v) > 0.0004) {
      bed.g.gain.setTargetAtTime(v * BEDS, t, tc);
      bed.last = v;
    }
  }

  // ------------------------------------------------------------ the place
  // Where you are, a few times a second: the trees round you, the open
  // ground, the river, the falls, the sea, a lake shore, the flats.
  sense(g) {
    const W = g.world;
    const L = this.A.listener;
    const x = L.x;
    const z = L.z;
    const H = this.here;
    const inside = W.inBounds(x, z);
    H.ground = inside ? W.heightAt(x, z) : 0;
    if (inside) {
      let f = 0;
      let n = 0;
      for (const [dx, dz] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]]) {
        if (!W.inBounds(x + dx, z + dz)) continue;
        f += W.forest[W.cellIndex(x + dx, z + dz)];
        n++;
      }
      H.forest = smooth(f / Math.max(1, n) / 255, 0.15, 0.7);
      // the tundra by the ground round you, not the one patch underfoot (the
      // Caribou Tundra is tundra and grass in patches), and all high ground
      let t = 0;
      let m = 0;
      for (const [dx, dz] of TUNDRA_LOOK) {
        if (!W.inBounds(x + dx, z + dz)) continue;
        const s = W.surf[W.cellIndex(x + dx, z + dz)];
        if (s === SURF.TUNDRA || s === SURF.ROCK || s === SURF.SNOW) t++;
        m++;
      }
      H.tundra = Math.max(smooth(t / Math.max(1, m), 0.15, 0.55), smooth(H.ground, 160, 320));
    } else {
      H.forest = 0;
      H.tundra = 0;
    }
    // the river: how near, how fast, which way
    H.river = 0;
    H.riverFast = 0;
    if (inside) {
      const k = W.cellIndex(x, z);
      const rd = W.riverD[k];
      if (rd < 180) {
        const s = W.riverS[k];
        const w = W.riverWidth(s);
        const d = Math.max(0, rd - w * 0.5);
        H.river = Math.pow(clamp01(1 - d / 150), 1.6);
        H.riverFast = clamp01(W.riverGradient(s) * 25);
        H.riverNear = d;
        const p = W.river.sample(s);
        H.riverX = p.x;
        H.riverZ = p.z;
        H.riverY = W.riverLevel(s);
      }
    }
    // the falls
    H.falls = 0;
    if (W.fallsS > 0) {
      const fp = this.fallsAt || (this.fallsAt = W.river.sample(W.fallsS));
      const d = Math.hypot(fp.x - x, fp.z - z);
      H.falls = Math.pow(clamp01(1 - d / 340), 1.5);
      H.fallsX = fp.x;
      H.fallsZ = fp.z;
    }
    // the sea: how far the coast is, and which way it lies (down the slope
    // of the distance to it)
    const cd = (px, pz) => (W.inBounds(px, pz) ? W.coastD[W.cellIndex(px, pz)] : W.coastSDBrute(px, pz));
    const c0 = cd(x, z);
    H.sea = Math.pow(clamp01(1 - Math.max(0, c0) / 420), 1.4);
    if (H.sea > 0) {
      const gx = cd(x + 10, z) - cd(x - 10, z);
      const gz = cd(x, z + 10) - cd(x, z - 10);
      const l = Math.hypot(gx, gz) || 1;
      H.seaX = x - (gx / l) * Math.max(10, c0);
      H.seaZ = z - (gz / l) * Math.max(10, c0);
      H.shore = clamp01(1 - Math.max(0, c0) / 180);
    } else H.shore = 0;
    // a lake shore near enough to hear the water lap
    H.lake = 0;
    for (const lake of W.lakes) {
      const dx = x - lake.x;
      const dz = z - lake.z;
      if (dx * dx + dz * dz > (lake.r + 60) ** 2) continue;
      const sd = W.lakeSD(lake, x, z);
      const v = clamp01(1 - Math.abs(sd) / 30);
      if (v > H.lake) {
        H.lake = v;
        const l = Math.hypot(dx, dz) || 1;
        // the water's edge, toward the lake's middle
        H.lakeX = x - (dx / l) * Math.max(2, sd);
        H.lakeZ = z - (dz / l) * Math.max(2, sd);
        H.lakeY = lake.level;
      }
    }
    H.flats = g.areas?.near ? g.areas.near('flats', 90, 260) : 0;
    H.open = clamp01(1 - H.forest - H.tundra * 0.6 - H.shore * 0.5);
  }

  // ------------------------------------------------------------ each frame
  update(dt, g, duck) {
    if (!this.ctx) return;
    this.dt = dt;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const L = this.A.listener;
    const env = g.env;
    const w = env.weather;
    const H = this.here;
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.25;
      this.sense(g);
    }
    const P = g.player;
    const mode = P?.mode;
    const inCar = mode === 'drive' && g.car?.camMode === 'cockpit';
    const under = g.water?.viewLevel != null && g.camera.position.y < g.water.viewLevel;
    // the outside dulled in the car (windows up) and under water
    const mf = under ? 380 : inCar ? 900 : 20000;
    if (mf !== this.mfLast) {
      this.muffle.frequency.setTargetAtTime(mf, t, 0.15);
      this.mfLast = mf;
    }
    const k = duck * (under ? 0.6 : inCar ? 0.55 : 1);

    // ---- the wind, from the gusts that move the grass and trees round you
    const gust = gustAt(L.x, L.z);
    const glide = mode === 'glide' ? clamp01(g.glider.speed / 14) : 0;
    const height = Math.max(0, L.y - H.ground);
    const exposed = Math.max(H.tundra, smooth(L.y, 120, 420), H.shore * 0.6, smooth(height, 15, 120));
    const breeze = 0.35 + 0.65 * (FX.uFxWind.value.z - 0.6);
    const wind = clamp01((0.18 + exposed * 0.45) * breeze + gust * (0.5 + exposed * 0.5) + w.rain * 0.25);
    // the trees break the wind: under them it is mostly the leaves you hear
    const shelter = 1 - H.forest * 0.55;
    // (the low beds a little up since they lost their rumble: see start())
    this.set('windLow', (0.05 + wind * 0.28 * shelter + glide * 0.33) * k);
    this.set('windHigh', (0.01 + wind * wind * 0.16 * shelter + glide * 0.3) * k);
    this.beds.windHigh.f.frequency.setTargetAtTime(450 + wind * 900 + glide * 700, t, 0.4);
    this.set('whistle', exposed * gust * gust * 0.05 * k);
    this.beds.whistle.f.frequency.setTargetAtTime(1100 + gust * 500, t, 0.6);
    // leaves where the trees are, more in the gusts
    this.set('leaves', H.forest * (0.025 + gust * 0.16 + w.rain * 0.04) * k);
    // ---- water
    const rv = H.river;
    this.set('riverLow', rv * (0.15 + H.riverFast * 0.175) * k);
    this.set('riverRush', rv * (0.05 + H.riverFast * 0.12) * k);
    // the babble only close to the water
    this.set('babble', rv * smooth(30 - (H.riverNear ?? 99), 0, 25) * (0.18 + H.riverFast * 0.2) * k);
    this.set('falls', H.falls * 0.42 * k);
    this.set('fallsLow', H.falls * 0.32 * k);
    // the wash, as present at the shore as a river is on its bank
    this.set('sea', H.sea * (0.17 + 0.095 * Math.sin(t * 0.21)) * k);
    if (rv > 0.001) this.aim(this.beds.riverLow.p, H.riverX, H.riverZ, 0.55, this.beds.riverRush.p, this.beds.babble.p);
    if (H.falls > 0.001) this.aim(this.beds.falls.p, H.fallsX, H.fallsZ, 0.75, this.beds.fallsLow.p);
    if (H.sea > 0.001) this.aim(this.beds.sea.p, H.seaX, H.seaZ, 0.6);
    // ---- rain: the hiss, the patter, the trees dripping (after it too)
    const rain = w.rain;
    this.set('rain', rain * (0.05 + rain * 0.1) * k);
    this.set('patter', smooth(rain, 0.05, 0.6) * 0.16 * (1 - H.forest * 0.3) * (inCar ? 1.6 : 1) * duck);
    this.set('drips', Math.max(rain, w.wet * 0.6) * H.forest * 0.22 * k);
    // the reverb: thick under the trees, thin on the open tundra
    const verb = (0.35 + H.forest * 0.45 - H.tundra * 0.15) * (inCar || under ? 0.2 : 1);
    if (Math.abs((this.verbLast ?? -1) - verb) > 0.02) {
      this.verbOut.gain.setTargetAtTime(verb, t, 0.5);
      this.verbLast = verb;
    }

    const quiet = duck < 1 || !g.started;
    if (quiet) {
      // in a menu or on the title, the mosquitoes leave too
      this.mosquitoes(0, dt);
      return;
    }
    // ---- events
    this.waveT -= dt;
    if (this.waveT <= 0 && H.sea > 0.05) {
      this.waveT = rand(4.5, 9) * (1.3 - H.sea * 0.4);
      this.wave(H.seaX, H.seaZ, H.sea * k);
    }
    this.lapT -= dt;
    if (this.lapT <= 0) {
      this.lapT = rand(0.5, 1.8);
      if (H.lake > 0.05 && gust < 0.9) this.lap(H.lakeX, H.lakeY, H.lakeZ, H.lake * k);
      else if (rv > 0.4 && (H.riverNear ?? 99) < 12) this.lap(H.riverX, H.riverY, H.riverZ, rv * 0.6 * k);
    }
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rand(25, 70);
      if (rain > 0.7) this.thunder(k);
    }
    // mosquitoes on the flats, out of the wind and the rain, kept off by
    // bug dope
    const mozzie = H.flats * (1 - smooth(wind, 0.35, 0.7)) * (1 - smooth(rain, 0.1, 0.4)) * (1 - smooth(env.night, 0.7, 0.95)) * (g.bugDopeT > 0 ? 0.25 : 1) * (inCar ? 0 : 1);
    this.mosquitoes(mozzie * duck, dt);
    // ---- birds and other singers
    this.updateSingers(dt, g, wind, k);
  }

  // Pan beds toward a point (x, z); the nearer, the wider (the less panned).
  aim(p, x, z, amount, ...more) {
    if (!p) return;
    const L = this.A.listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    let rel = Math.atan2(dx, -dz) - L.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const pan = Math.sin(rel) * amount * smooth(d, 3, 40);
    const t = this.ctx.currentTime;
    for (const q of [p, ...more]) if (q) q.pan.setTargetAtTime(pan, t, 0.25);
  }

  // ------------------------------------------------------------ voices
  // A sound from a point in the world: panned to its side, quieter and
  // duller with distance and a little behind you, and some of it to the
  // reverb. Returns { in, t } to connect a sound to, or null if out of
  // earshot (or too much is already sounding).
  // ref: the distance within which it is at full loudness (a songbird's
  // song carries a few metres at that, a wolf's howl or a loon's wail a
  // hundred and more).
  voice(x, y, z, { range = 160, gain = 1, verb = 0.35, dur = 3, ref = 6 } = {}) {
    if (!this.ctx || this.voices > 9) return null;
    const ctx = this.ctx;
    const L = this.A.listener;
    const dx = x - L.x;
    const dy = y - L.y;
    const dz = z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > range) return null;
    let rel = Math.atan2(dx, -dz) - L.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const behind = Math.cos(rel) < 0 ? -Math.cos(rel) : 0;
    const att = gain * 1.8 * (ref / (ref + d)) * Math.sqrt(1 - d / range) * (1 - behind * 0.2);
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(1800, 16000 * Math.exp(-d / 260)) * (1 - behind * 0.35);
    const g = ctx.createGain();
    g.gain.value = att;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.sin(rel) * 0.85;
    const send = ctx.createGain();
    send.gain.value = verb * (0.5 + d / range);
    input.connect(lp);
    lp.connect(g);
    g.connect(p);
    p.connect(this.out);
    g.connect(send);
    send.connect(this.verbSend);
    this.voices++;
    const t = ctx.currentTime + 0.03;
    // let the chain go when the sound is over
    this.A.afterSound((dur + 0.6) * 1000, () => {
      this.voices--;
      for (const n of [input, lp, g, p, send]) n.disconnect();
    });
    return { in: input, t, d };
  }

  // A note: an oscillator (the whistle wave unless given) through the
  // frequencies given, evenly over the note, with a swell and a fade.
  // buzz: how much its loudness flutters, at buzzHz (a burry note).
  note(v, t, freqs, dur, amp, { wave = 'whistle', buzz = 0, buzzHz = 60, attack = 0.025, release = 0.3 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (this.waves[wave]) o.setPeriodicWave(this.waves[wave]);
    else o.type = wave;
    o.frequency.setValueAtTime(freqs[0], t);
    if (freqs.length > 1) {
      const step = dur / (freqs.length - 1);
      for (let i = 1; i < freqs.length; i++) o.frequency.linearRampToValueAtTime(freqs[i], t + step * i);
    }
    const g = ctx.createGain();
    const a = Math.min(attack, dur * 0.3);
    const r = Math.min(dur * release, 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    g.gain.setValueAtTime(amp, t + dur - r);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    let end = g;
    if (buzz > 0) {
      // loudness fluttering: a second gain swung by a slow oscillator
      const am = ctx.createGain();
      am.gain.value = 1 - buzz * 0.5;
      const m = ctx.createOscillator();
      m.frequency.value = buzzHz;
      const mg = ctx.createGain();
      mg.gain.value = buzz * 0.5;
      m.connect(mg);
      mg.connect(am.gain);
      g.connect(am);
      end = am;
      m.start(t);
      m.stop(t + dur + 0.05);
    }
    end.connect(v.in);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // Filtered noise from the engine's buffers: a breath, a splash, a hiss.
  hiss(v, t, dur, amp, { type = 'bandpass', freq = 1000, q = 1, f2 = null, buf = null, attack = 0.01 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.A.white;
    s.loop = dur > 1.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(v.in);
    s.start(t, Math.random() * 1.2);
    s.stop(t + dur + 0.05);
  }

  // A baked sample (the woodpecker, the squirrel).
  sample(v, t, name, amp, rate = 1) {
    const buf = this.buffers[name];
    if (!buf) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = amp;
    s.connect(g);
    g.connect(v.in);
    s.start(t);
  }

  // ------------------------------------------------------------ events
  // A wave breaking: the surge building, the crash, then the backwash
  // drawing the pebbles down with a hiss.
  wave(x, z, level) {
    // a breaking wave carries: full loudness out to 40 m
    const v = this.voice(x, 2, z, { range: 600, gain: 2.2 * level, verb: 0.15, dur: 7, ref: 40 });
    if (!v) return;
    const big = rand(0.6, 1.1);
    const t = v.t;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers.pink || this.A.pink;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2200 * big, t + 1.3);
    f.frequency.exponentialRampToValueAtTime(500, t + 4.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * big, t + 1.2);
    g.gain.setTargetAtTime(0, t + 1.45, 1.1);
    s.connect(f);
    f.connect(g);
    g.connect(v.in);
    s.start(t, Math.random() * 3);
    s.stop(t + 6);
    // the backwash
    this.hiss(v, t + 2.6, 2.6, 0.05 * big, { type: 'highpass', freq: 3200, q: 0.5, attack: 0.4, buf: this.buffers.white });
  }

  // Water lapping at the shore: a small slap and a plip.
  lap(x, y, z, level) {
    const v = this.voice(x, y + 0.2, z, { range: 60, gain: level * 0.9, verb: 0.2, dur: 0.5 });
    if (!v) return;
    this.hiss(v, v.t, rand(0.06, 0.14), 0.12, { freq: rand(450, 1100), q: 1.2 });
    if (Math.random() < 0.6) this.note(v, v.t + 0.02, [rand(650, 1000), rand(1100, 1500)], 0.03, 0.05, { wave: 'sine', attack: 0.003 });
  }

  // Thunder rolling in the distance: a dull peal or two, swelling and
  // dying away over several seconds.
  thunder(level) {
    const L = this.A.listener;
    const a = Math.random() * Math.PI * 2;
    const d = rand(900, 2500);
    const v = this.voice(L.x + Math.sin(a) * d, 400, L.z + Math.cos(a) * d, { range: 4000, gain: 1.4 * level, verb: 0.6, dur: 20, ref: 600 });
    if (!v) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers.brown || this.A.brown;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, v.t);
    f.frequency.exponentialRampToValueAtTime(140, v.t + 7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, v.t);
    // two or three rolls
    let t = v.t + Math.min(6, d / 343);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      g.gain.linearRampToValueAtTime(rand(0.5, 1) * 0.6, t + rand(0.15, 0.5));
      t += rand(0.8, 1.8);
      g.gain.linearRampToValueAtTime(0.12, t);
    }
    g.gain.linearRampToValueAtTime(0, t + 2.5);
    s.connect(f);
    f.connect(g);
    g.connect(v.in);
    s.start(v.t, Math.random() * 4);
    s.stop(t + 3);
  }

  // Two mosquitoes whining round your head, now one ear, now the other,
  // now right at it.
  mosquitoes(level, dt) {
    const ctx = this.ctx;
    if (level < 0.02) {
      if (this.mozzies) {
        const m = this.mozzies;
        this.mozzies = null;
        m.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        this.A.afterSound(1500, () => {
          for (const o of m.osc) o.stop();
          m.g.disconnect();
        });
      }
      return;
    }
    if (!this.mozzies) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      const osc = [];
      const parts = [];
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 560 + i * 70;
        const vib = ctx.createOscillator();
        vib.frequency.value = 7 + i * 2.5;
        const vg = ctx.createGain();
        vg.gain.value = 9;
        vib.connect(vg);
        vg.connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 2.5;
        const a = ctx.createGain();
        a.gain.value = 0;
        const p = ctx.createStereoPanner();
        o.connect(f);
        f.connect(a);
        a.connect(p);
        p.connect(g);
        o.start();
        vib.start();
        osc.push(o, vib);
        parts.push({ o, a, p, x: Math.random() * 2 - 1, near: Math.random(), t: 0 });
      }
      this.mozzies = { g, osc, parts };
    }
    const m = this.mozzies;
    const t = ctx.currentTime;
    m.g.gain.setTargetAtTime(level * 0.085, t, 0.4);
    for (const q of m.parts) {
      q.t -= dt;
      if (q.t > 0) continue;
      // a new place round the head, a new distance, a little pitch drift
      q.t = rand(0.4, 1.6);
      q.x = Math.max(-1, Math.min(1, q.x + rand(-0.9, 0.9)));
      q.near = Math.random();
      q.p.pan.setTargetAtTime(q.x, t, 0.35);
      q.a.gain.setTargetAtTime(0.15 + q.near * q.near * 0.85, t, 0.3);
      q.o.frequency.setTargetAtTime(520 + q.near * 140 + rand(-20, 20), t, 0.4);
    }
  }

  // ------------------------------------------------------------ singers
  // Keep a few singers about, as many as the hour and the weather allow,
  // each singing its song from its perch until it has sung enough.
  updateSingers(dt, g, wind, k) {
    const env = g.env;
    const h = env.time;
    const H = this.here;
    const night = env.night;
    // the dawn chorus, a quieter middle of the day, the evening chorus
    let day = 0.55 + 2.2 * bump(h, 3.5, 5.5, 8.5) + 1.2 * bump(h, 18, 20.5, 23);
    day *= (1 - smooth(night, 0.55, 0.85)) * (1 - 0.8 * smooth(env.weather.rain, 0.1, 0.6)) * (1 - 0.6 * smooth(wind, 0.5, 0.95));
    const want = Math.round(Math.min(4, day * 1.6 + night * 1.2));
    // singers too far away (you have moved on) stop
    const L = this.A.listener;
    this.singers = this.singers.filter((s) => s.left > 0 && Math.hypot(s.x - L.x, s.z - L.z) < 180);
    this.singT -= dt;
    if (this.singers.length < want && this.singT <= 0) {
      this.singT = rand(1, 4);
      const sp = this.choose(H, night, h);
      if (sp) this.singers.push(this.perch(sp, g));
    }
    for (const s of this.singers) {
      s.next -= dt;
      if (s.next > 0) continue;
      const G = GAP[s.sp];
      s.next = rand(G[0], G[1]);
      s.left--;
      this.sing(s, k);
    }
  }

  // A species for a new singer: by the ground round you and the hour.
  choose(H, night, h) {
    const w = {};
    const add = (hab, k) => {
      if (k <= 0.02) return;
      for (const [sp, v] of Object.entries(HABITAT[hab])) w[sp] = (w[sp] || 0) + v * k;
    };
    if (night > 0.6) {
      if (H.forest > 0.2) w.owl = 2 * H.forest;
      if (H.lake > 0.05 || H.river > 0.3) w.loon = 1.5;
    } else {
      add('forest', H.forest);
      add('open', H.open);
      add('tundra', H.tundra);
      add('shore', H.shore + H.sea * 0.5);
      // bees only on warm bright days
      if (w.bee) w.bee *= smooth(h, 9, 12) * (1 - smooth(h, 17, 20));
      // loons call at lakes in the evening too
      if (H.lake > 0.1 && (h > 19 || h < 6)) w.loon = 1;
    }
    let sum = 0;
    for (const v of Object.values(w)) sum += v;
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (const [sp, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) return sp;
    }
    return null;
  }

  // Where the new singer is: up a tree in the forest, low in the meadow,
  // out over the water for the gulls and the loons.
  perch(sp, g) {
    const L = this.A.listener;
    const W = g.world;
    const a = Math.random() * Math.PI * 2;
    let d = rand(14, 70);
    if (sp === 'gull' || sp === 'eagle') d = rand(40, 140);
    if (sp === 'loon') d = rand(60, 260);
    if (sp === 'bee') d = rand(3, 8);
    const x = L.x + Math.sin(a) * d;
    const z = L.z + Math.cos(a) * d;
    const ground = W.inBounds(x, z) ? W.heightAt(x, z) : 0;
    const up = sp === 'gull' || sp === 'eagle' ? rand(15, 40) : sp === 'ptarmigan' || sp === 'sparrow' || sp === 'bee' ? rand(0.3, 2) : sp === 'loon' ? 0.3 : rand(4, 16);
    const G = GAP[sp];
    // each singer its own pitch: birds of a kind differ
    return { sp, x, z, y: ground + up, next: rand(0.2, 2.5), left: Math.round(rand(G[2], G[3])), pitch: rand(0.92, 1.08), n: 0, a };
  }

  // Songs carry: a songbird sings at full loudness out to about 20 m (the
  // woodpecker's drumming 25 m, the ptarmigan's croak 30 m, a squirrel's
  // chatter 12 m), so the chorus stands above the wind and the leaves as it
  // does in a forest at dawn.
  sing(s, k) {
    const f = s.pitch;
    s.n++;
    switch (s.sp) {
      case 'varied': {
        // the varied thrush: one long ethereal buzzing whistle, each song at
        // a different pitch from the last
        const v = this.voice(s.x, s.y, s.z, { range: 260, gain: 0.9 * k, verb: 0.6, dur: 2.2, ref: 20 });
        if (!v) return;
        const notes = [2350, 2650, 2950, 3350, 3800, 4300];
        const p = notes[(s.n * 3 + Math.floor(s.pitch * 10)) % notes.length] * f;
        const dur = rand(1.2, 1.9);
        this.note(v, v.t, [p * 0.985, p, p * 1.008, p * 0.995], dur, 0.11, { buzz: 0.8, buzzHz: rand(48, 70), attack: 0.18, release: 0.4 });
        this.note(v, v.t + 0.01, [p * 1.497, p * 1.5, p * 1.51], dur * 0.95, 0.018, { buzz: 0.7, buzzHz: rand(48, 70), attack: 0.2, release: 0.4 });
        break;
      }
      case 'hermit': {
        // the hermit thrush: a long clear opening note, then a flute-like
        // flourish of quick notes above it
        const v = this.voice(s.x, s.y, s.z, { range: 200, gain: 0.8 * k, verb: 0.6, dur: 2, ref: 20 });
        if (!v) return;
        const base = (s.n % 3 === 0 ? 1950 : s.n % 3 === 1 ? 2350 : 2150) * f;
        this.note(v, v.t, [base, base * 1.01], 0.34, 0.1, { attack: 0.05 });
        let t = v.t + 0.38;
        const steps = [1.42, 1.62, 1.5, 1.9, 1.72, 2.1, 1.85, 2.3];
        const n = 6 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const q = base * steps[i % steps.length] * rand(0.98, 1.02);
          const d = rand(0.05, 0.08);
          this.note(v, t, [q, q * 1.08, q * 0.97], d, 0.07 * (1 - i / (n + 3)), { attack: 0.008 });
          // the second voice, a little apart
          if (i % 2) this.note(v, t, [q * 1.26, q * 1.3], d * 0.9, 0.025, { attack: 0.008 });
          t += d + 0.012;
        }
        break;
      }
      case 'swainson': {
        // Swainson's thrush: a spiral of flute-like whips climbing up
        const v = this.voice(s.x, s.y, s.z, { range: 200, gain: 0.8 * k, verb: 0.55, dur: 2.2, ref: 20 });
        if (!v) return;
        const n = 10 + Math.floor(Math.random() * 4);
        let t = v.t;
        for (let i = 0; i < n; i++) {
          const q = (1700 + (2700 * i) / n) * f * rand(0.97, 1.03);
          const d = 0.075 + rand(-0.01, 0.01);
          const amp = 0.08 * Math.sin(((i + 1) / (n + 1)) * Math.PI);
          this.note(v, t, [q * 0.9, q * 1.22, q * 1.02], d, amp + 0.01, { attack: 0.01 });
          t += d + 0.03;
        }
        break;
      }
      case 'robin': {
        // the American robin: a carol of two- and three-note phrases,
        // cheerily, cheer-up, cheerio
        const v = this.voice(s.x, s.y, s.z, { range: 180, gain: 0.75 * k, verb: 0.4, dur: 1.4, ref: 20 });
        if (!v) return;
        let t = v.t;
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          const q = rand(2050, 2800) * f;
          const d = rand(0.14, 0.22);
          this.note(v, t, [q * 0.85, q * 1.12, q * 1.02, q * 0.88], d, 0.09, { attack: 0.015 });
          t += d + rand(0.06, 0.1);
        }
        break;
      }
      case 'sparrow': {
        // the white-crowned sparrow: a clear whistle or two, a buzz, a trill
        const v = this.voice(s.x, s.y, s.z, { range: 170, gain: 0.75 * k, verb: 0.35, dur: 2.2, ref: 20 });
        if (!v) return;
        let t = v.t;
        this.note(v, t, [3300 * f, 3250 * f], 0.42, 0.08, { attack: 0.03 });
        t += 0.48;
        this.note(v, t, [4150 * f, 4100 * f], 0.26, 0.07, { attack: 0.02 });
        t += 0.3;
        this.note(v, t, [3700 * f, 3650 * f], 0.3, 0.07, { buzz: 0.9, buzzHz: 105, attack: 0.02 });
        t += 0.34;
        for (let i = 0; i < 5; i++) {
          const q = (4200 - i * 220) * f;
          this.note(v, t, [q * 1.05, q * 0.92], 0.055, 0.06, { attack: 0.006 });
          t += 0.07;
        }
        break;
      }
      case 'chickadee': {
        const v = this.voice(s.x, s.y, s.z, { range: 140, gain: 0.7 * k, verb: 0.4, dur: 1.6, ref: 20 });
        if (!v) return;
        if (Math.random() < 0.6) {
          // fee-bee: two pure whistles, the second a step lower
          this.note(v, v.t, [3950 * f, 3900 * f], 0.38, 0.08, { attack: 0.03 });
          this.note(v, v.t + 0.46, [3350 * f, 3300 * f, 3350 * f, 3280 * f], 0.34, 0.07, { attack: 0.03 });
        } else {
          // chick-a-dee-dee-dee
          this.note(v, v.t, [6500, 3200], 0.045, 0.06, { attack: 0.004 });
          this.note(v, v.t + 0.07, [4200, 3800], 0.05, 0.05, { attack: 0.004 });
          for (let i = 0; i < 3; i++) this.note(v, v.t + 0.15 + i * 0.17, [3500 * f, 3400 * f], 0.13, 0.05, { wave: 'reed', buzz: 0.5, buzzHz: 140, attack: 0.01 });
        }
        break;
      }
      case 'woodpecker': {
        const v = this.voice(s.x, s.y, s.z, { range: 220, gain: 0.9 * k, verb: 0.6, dur: 1.5, ref: 25 });
        if (v) this.sample(v, v.t, 'drum', 0.5, rand(0.9, 1.1));
        break;
      }
      case 'squirrel': {
        // a red squirrel scolding from a spruce
        const v = this.voice(s.x, s.y, s.z, { range: 120, gain: 0.8 * k, verb: 0.35, dur: 2, ref: 12 });
        if (v) this.sample(v, v.t, 'chatter', 0.35, rand(0.92, 1.08));
        break;
      }
      case 'raven': {
        this.raven(s.x, s.y, s.z, k);
        break;
      }
      case 'gull': {
        this.gull(s.x, s.y, s.z, k);
        break;
      }
      case 'eagle': {
        this.eagle(s.x, s.y, s.z, k);
        break;
      }
      case 'ptarmigan': {
        // the willow ptarmigan: a rattling, croaking go-back go-back
        const v = this.voice(s.x, s.y, s.z, { range: 220, gain: 0.8 * k, verb: 0.3, dur: 2.2, ref: 30 });
        if (!v) return;
        let t = v.t;
        let gap = 0.13;
        for (let i = 0; i < 9; i++) {
          this.note(v, t, [760 * f, 610 * f], 0.05, 0.06, { wave: 'reed', attack: 0.005 });
          t += gap;
          gap = Math.max(0.055, gap * 0.88);
        }
        this.note(v, t + 0.08, [690 * f, 820 * f, 600 * f], 0.22, 0.07, { wave: 'reed', attack: 0.01 });
        this.note(v, t + 0.38, [690 * f, 820 * f, 600 * f], 0.22, 0.06, { wave: 'reed', attack: 0.01 });
        break;
      }
      case 'owl': {
        // the great horned owl: hoo, h'hoo, hoo, hoo, low and soft
        const v = this.voice(s.x, s.y, s.z, { range: 320, gain: 1.1 * k, verb: 0.75, dur: 3, ref: 40 });
        if (!v) return;
        const q = 360 * f;
        const pat = [[0, 0.34], [0.52, 0.16], [0.72, 0.36], [1.32, 0.48], [2.0, 0.5]];
        for (const [o, d] of pat) {
          this.note(v, v.t + o, [q * 1.02, q, q * 0.95], d, 0.13, { wave: 'sine', attack: 0.06, release: 0.5 });
          this.hiss(v, v.t + o, d, 0.012, { type: 'lowpass', freq: 600, q: 0.5, attack: 0.05 });
        }
        break;
      }
      case 'loon': {
        this.loonCall(s.x, s.y, s.z, k, s.n % 2 === 0 ? 'wail' : 'tremolo');
        break;
      }
      case 'bee': {
        this.bee(s, k);
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------ calls
  // (also used for the animals the world places: see AudioEngine)
  raven(x, y, z, k = 1) {
    // a deep croak or two (kraa, kraa), throaty and rough: the library's
    // (a voice through a throat's resonances, see kit.js) once it is made
    const A = this.A;
    if (A.kit?.croak) {
      const v = this.voice(x, y, z, { range: 280, gain: k, verb: 0.5, dur: 2.2, ref: 30 });
      if (!v) return;
      const n = 1 + Math.floor(Math.random() * 3);
      const r = rand(0.92, 1.08);
      for (let i = 0; i < n; i++) A.play('croak', { at: v.t + i * rand(0.42, 0.55), dest: v.in, rate: r * rand(0.97, 1.03) });
      return;
    }
    const v = this.voice(x, y, z, { range: 280, gain: 3.3 * k, verb: 0.5, dur: 1.6, ref: 30 });
    if (!v) return;
    const n = 1 + Math.floor(Math.random() * 3);
    const f0 = rand(300, 380);
    for (let i = 0; i < n; i++) {
      const t = v.t + i * rand(0.42, 0.55);
      // the croak's body: the sawtooth through two throat resonances
      const ctx = this.ctx;
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(f0, t);
      src.frequency.linearRampToValueAtTime(f0 * 1.05, t + 0.08);
      src.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.32);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.03);
      g.gain.setTargetAtTime(0, t + 0.22, 0.05);
      for (const [fr, q] of [[900, 4], [2100, 5]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fr;
        bp.Q.value = q;
        src.connect(bp);
        bp.connect(g);
      }
      g.connect(v.in);
      src.start(t);
      src.stop(t + 0.45);
      this.hiss(v, t, 0.3, 0.025, { freq: 1500, q: 1.5 });
    }
  }

  gull(x, y, z, k = 1) {
    // a glaucous-winged gull: the long call, kee-ow, then a laughing ha-ha-ha
    const v = this.voice(x, y, z, { range: 260, gain: 1.6 * k, verb: 0.3, dur: 2.4, ref: 30 });
    if (!v) return;
    const f0 = rand(1250, 1500);
    this.note(v, v.t, [f0 * 1.15, f0, f0 * 0.66], 0.32, 0.06, { wave: 'reed', attack: 0.02 });
    let t = v.t + 0.42;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.note(v, t, [f0 * 0.9, f0 * 0.82], 0.11, 0.05, { wave: 'reed', attack: 0.01 });
      t += 0.16;
    }
  }

  eagle(x, y, z, k = 1) {
    // the bald eagle: a thin, high chittering, kleek-kik-ik-ik-ik
    const v = this.voice(x, y, z, { range: 380, gain: 1.4 * k, verb: 0.45, dur: 1.6, ref: 50 });
    if (!v) return;
    let t = v.t;
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const q = (i === 0 ? 3300 : 3000 - i * 40) * rand(0.97, 1.03);
      this.note(v, t, [q, q * 0.84], i === 0 ? 0.16 : 0.08, 0.06 * (1 - i / (n + 2)), { buzz: 0.25, buzzHz: 90, attack: 0.008 });
      t += i === 0 ? 0.22 : rand(0.08, 0.12);
    }
  }

  // The common loon: the wail, rising and falling across the water, or
  // the quavering tremolo.
  loonCall(x, y, z, k = 1, kind = 'wail') {
    const v = this.voice(x, y, z, { range: 900, gain: 1.25 * k, verb: 0.9, dur: 3.5, ref: 120 });
    if (!v) return;
    if (kind === 'wail') {
      const o = this.note(v, v.t, [560, 880, 860, 820, 700], 2.7, 0.067, { wave: 'whistle', attack: 0.4, release: 0.3 });
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = this.ctx.createGain();
      vg.gain.value = 10;
      vib.connect(vg);
      vg.connect(o.frequency);
      vib.start(v.t);
      vib.stop(v.t + 2.8);
    } else {
      // (louder than the wail: the tremolo's flutter takes half of it away)
      const o = this.note(v, v.t, [1050, 1100, 1060], 2.0, 0.11, { wave: 'whistle', buzz: 0.95, buzzHz: 9, attack: 0.1 });
      const fm = this.ctx.createOscillator();
      fm.frequency.value = 9;
      const fg = this.ctx.createGain();
      fg.gain.value = 120;
      fm.connect(fg);
      fg.connect(o.frequency);
      fm.start(v.t);
      fm.stop(v.t + 2.1);
    }
  }

  // A wolf pack howling: two or three voices, each its own pitch, rising,
  // holding and falling, round the hills.
  wolves(k = 1) {
    const L = this.A.listener;
    const a = Math.random() * Math.PI * 2;
    const d = rand(250, 700);
    const x = L.x + Math.sin(a) * d;
    const z = L.z + Math.cos(a) * d;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const v = this.voice(x + rand(-20, 20), L.y + 10, z + rand(-20, 20), { range: 1200, gain: 2.2 * k, verb: 0.9, dur: 9, ref: 150 });
      if (!v) return;
      const f0 = rand(330, 460) * (i ? rand(1.1, 1.35) : 1);
      const t = v.t + i * rand(0.6, 1.6);
      const o = this.note(v, t, [f0, f0 * 1.7, f0 * 1.68, f0 * 1.6, f0 * 1.1], rand(3.2, 4.2), 0.06, { wave: 'whistle', attack: 0.5, release: 0.35 });
      const vib = this.ctx.createOscillator();
      vib.frequency.value = rand(4.5, 5.5);
      const vg = this.ctx.createGain();
      vg.gain.value = f0 * 0.012;
      vib.connect(vg);
      vg.connect(o.frequency);
      vib.start(t);
      vib.stop(t + 4.5);
      // a breathy edge to the howl
      this.hiss(v, t + 0.3, 3.2, 0.008, { freq: f0 * 3, q: 3, attack: 0.5 });
    }
  }

  // A bee going by: a buzz passing from one side to the other, its pitch
  // falling as it passes.
  bee(s, k) {
    const ctx = this.ctx;
    const v = this.voice(s.x, s.y, s.z, { range: 20, gain: 1.2 * k, verb: 0.1, dur: 3.2 });
    if (!v) return;
    const dur = rand(1.6, 2.8);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = rand(200, 250);
    o.frequency.setValueAtTime(f0 * 1.05, v.t);
    o.frequency.linearRampToValueAtTime(f0 * 0.95, v.t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, v.t);
    g.gain.linearRampToValueAtTime(0.06, v.t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, v.t + dur);
    const p = ctx.createStereoPanner();
    const side = Math.random() < 0.5 ? -1 : 1;
    p.pan.setValueAtTime(-0.9 * side, v.t);
    p.pan.linearRampToValueAtTime(0.9 * side, v.t + dur);
    o.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(v.in);
    o.start(v.t);
    o.stop(v.t + dur + 0.05);
  }

  // ------------------------------------------------------------ footsteps
  // One of the baked steps for the ground underfoot (never the same one
  // twice running), a little higher or lower, left foot then right.
  step(surface, water, sprint) {
    if (!this.ctx || !this.steps) return false;
    let name = 'grass';
    if (water && water.depth > 0.08) name = 'water';
    else {
      switch (surface) {
        case -1:
          name = 'deck';
          break;
        case SURF.FOREST:
          name = 'forest';
          break;
        case SURF.ROCK:
          name = 'rock';
          break;
        case SURF.SNOW:
          name = 'snow';
          break;
        case SURF.SAND:
          name = 'sand';
          break;
        case SURF.GRAVEL:
          name = 'gravel';
          break;
        case SURF.TUNDRA:
          name = 'tundra';
          break;
        case SURF.ICE:
          name = 'ice';
          break;
        case SURF.MUD:
          name = 'mud';
          break;
        case SURF.ROAD:
          name = 'road';
          break;
        default:
          name = 'grass';
      }
    }
    const bank = this.steps[name];
    if (!bank) return false;
    let i = Math.floor(Math.random() * bank.length);
    if (i === this.stepLast[name]) i = (i + 1) % bank.length;
    this.stepLast[name] = i;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = bank[i];
    s.playbackRate.value = rand(0.92, 1.08) * (sprint ? 1.06 : 1);
    const g = ctx.createGain();
    g.gain.value = (sprint ? 0.32 : 0.23) * rand(0.85, 1.1);
    const p = ctx.createStereoPanner();
    this.stepSide = -this.stepSide;
    p.pan.value = this.stepSide * 0.08;
    s.connect(g);
    g.connect(p);
    // footsteps are yours: not muffled, not far away
    p.connect(this.A.sfx);
    s.start(t);
    return true;
  }
}
