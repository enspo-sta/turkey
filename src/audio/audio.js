// The game's sound: the place (ambience.js), a library of sounds made ahead
// of time (kit.js: the player's actions, the animals, the engines and the
// instruments), the music (music.js), and the mix that brings them
// together. Everything is synthesised; the one exception is the announcer's
// voice (voice.js).
//
// The mix: the effects, the interface, the place, the music and its
// stingers, and the voice, each on its own bus; the place, the music and
// the stingers dip while the announcer talks. Every baked sound plays at the
// loudness it is meant to have (LEVEL): kit.js measures each take as it
// bakes it, so a short click and a long splash sit where they should against
// each other whatever their shapes. At the end a low cut (the rumble small
// speakers cannot play), a gentle compressor that holds the mix together,
// and a limiter that keeps the loudest moments from clipping.
import { Ambience } from './ambience.js';
import { Oven } from './oven.js';
import { Music, INSTRUMENTS } from './music.js';

// How loud each baked sound plays at a gain of 1: its loudest 0.2 seconds,
// frequencies weighted as the loudness standard ITU-R BS.1770 weights them,
// in dB below full scale, before the volume setting and the mix. The
// interface quietest, the player's own actions above it, a roar, a big
// splash and the klaxon loudest. Animals are as loud as this at about the
// distance each carries at full voice (see Ambience.voice); engines at full
// throttle from the driver's seat.
const LEVEL = {
  click: -33,
  tick: -34.5,
  slide: -35,
  coins: -28,
  till: -26,
  cast: -28,
  plop: -29,
  nibble: -35.5,
  bite: -25,
  reelClick: -36,
  reelWhir: -41,
  drag: -27,
  creak: -31,
  hookset: -27,
  splashS: -27,
  splashM: -24,
  splashL: -20,
  snap: -22,
  flop: -29,
  lift: -30,
  twang: -23.5,
  whistler: -29,
  hitGame: -22,
  hitWood: -21,
  hitRock: -22,
  hitGround: -28,
  shutter: -28,
  growl: -18,
  roar: -12,
  huff: -19,
  swipe: -19,
  spray: -24,
  geese: -20,
  quacks: -21,
  cranes: -22,
  rattle: -22,
  croak: -23,
  chakker: -22,
  barks: -17,
  sik: -21,
  blow: -19,
  flaps: -20,
  slap: -17,
  scuff: -33,
  gust: -26.5,
  thud: -21,
  klaxon: -19.5,
  crack: -16,
  v8: -19,
  twoStroke: -22,
  v6: -19,
  ...INSTRUMENTS,
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rand = (a, b) => a + Math.random() * (b - a);

// a tenth of a second of silence (8 kHz, 16-bit), for playbackSession
const SILENT_WAV = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.musicVolume = 0.55;
    this.listener = { x: 0, y: 0, z: 0, heading: 0 };
    this.reelOn = false;
    this.reelT = 0;
    this.stepCount = 0;
    // the ambience's textures and the library's sounds are made from the
    // page's start, in the sound's worker where there is one (oven.js), the
    // ambience's first
    this.ambience = new Ambience(this);
    this.bakery = new Oven('library');
    this.bakery.onReady = (name, v) => this.kitBaked(name, v);
    // the music's hall, made ahead at the two usual rates as the
    // ambience's reverb is (see unlock)
    if (this.bakery.inWorker) for (const sr of [48000, 44100]) this.bakery.first('hall:' + sr, 'impulse', [1.8, 17, sr, 0.35]);
    this.kit = {};
    this.music = new Music(this);
    this.wolfT = 90;
    this.engineIdle = 0;
  }

  // On an iPhone, a page's sound follows the ring/silent switch unless the
  // page is playing media: with the switch on silent, the game was mute.
  // Safari 17 and later take the page's word for it (an audio session of
  // type playback); older ones need a media element playing, here a tenth
  // of a second of silence on a loop, started by the same tap.
  // Not in the iPhone app: it sets its own audio session (ambient: the
  // game mixes with the player's music and follows the silent switch, like
  // most iOS games, see ios/RubenHotrodFishing/AppDelegate.swift), and the
  // page asking for playback there would overrule it.
  playbackSession() {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store) return;
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch (e) {
      /* not this browser */
    }
    if (navigator.audioSession || !/iPhone|iPad|iPod/.test(navigator.userAgent || '')) return;
    if (!this.silentEl) {
      const a = document.createElement('audio');
      a.setAttribute('playsinline', '');
      a.setAttribute('x-webkit-airplay', 'deny');
      a.loop = true;
      a.preload = 'auto';
      a.src = SILENT_WAV;
      this.silentEl = a;
    }
    if (this.silentEl.paused) {
      const p = this.silentEl.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // Must be called from a user gesture (tap/click).
  unlock() {
    this.playbackSession();
    if (this.ctx) {
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // a device that cannot give the game a sound context plays on without
    // sound, and never stops a game from starting
    let ctx;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      return;
    }
    try {
      this.build(ctx);
    } catch (e) {
      console.warn('sound could not start', e);
      this.ctx = null;
      this.ready = false;
      try {
        ctx.close();
      } catch (e2) {
        /* gone already */
      }
    }
  }

  // The sound's graph, built on the first tap.
  build(ctx) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    // the end of the chain: the low cut, the compressor, the limiter
    this.master = ctx.createGain();
    this.lowCut = ctx.createBiquadFilter();
    this.lowCut.type = 'highpass';
    this.lowCut.frequency.value = 28;
    this.lowCut.Q.value = 0.6;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.25;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(this.lowCut);
    this.lowCut.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    // the buses
    this.sfx = ctx.createGain();
    this.ui = ctx.createGain();
    this.amb = ctx.createGain();
    this.mus = ctx.createGain();
    // the stingers: the musical ones (a catch's fanfare, the fish on), which
    // follow the music's volume, and the short cues (a chime, a ping),
    // which do not
    this.sting = ctx.createGain();
    this.cue = ctx.createGain();
    // the place, the music and the stingers go through one more gain, which
    // dips while the announcer talks (see voice.js); the voice has its own
    this.bed = ctx.createGain();
    this.voiceOut = ctx.createGain();
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this.amb.connect(this.bed);
    this.mus.connect(this.bed);
    this.sting.connect(this.bed);
    this.cue.connect(this.bed);
    this.bed.connect(this.master);
    this.voiceOut.connect(this.master);
    this.setVolumes(this.volume, this.musicVolume);
    // iOS unlock with a silent buffer
    const b = ctx.createBuffer(1, 1, sr);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    ctx.resume().catch(() => {});

    // noise buffers
    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(3, 'brown');
    this.pink = this.makeNoise(3, 'pink');
    // mountain slapback echo for loud sounds (the horn, a roar)
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = 0.42;
    this.echoFb = ctx.createGain();
    this.echoFb.gain.value = 0.38;
    this.echoLp = ctx.createBiquadFilter();
    this.echoLp.type = 'lowpass';
    this.echoLp.frequency.value = 1200;
    this.echo.connect(this.echoLp);
    this.echoLp.connect(this.echoFb);
    this.echoFb.connect(this.echo);
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0.5;
    this.echoLp.connect(this.echoOut);
    this.echoOut.connect(this.sfx);

    this.ambience.start(ctx);
    this.music.start(ctx);
    // the music's hall: its reverb's impulse at the context's own rate,
    // handed over now if it is made (in the tap's frame, a long one anyway),
    // else made before the rest of the library; one at another rate is let go
    const hall = 'hall:' + sr;
    for (const n of [...Object.keys(this.bakery.done), ...this.bakery.jobs.map((j) => j.name)]) if (n.startsWith('hall:') && n !== hall) this.bakery.drop(n);
    if (!this.bakery.handOver(hall)) this.bakery.first(hall, 'impulse', [1.8, 17, sr, 0.35]);
    // (the rest made before there was a context is handed over a sound a
    // frame, see update)
    this.ready = true;
  }

  suspend() {
    if (this.silentEl) this.silentEl.pause();
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  // fn once ms of the sound's own time has passed: a timer that waits on
  // while the sound is stopped (the app in the background), so letting a
  // sound's nodes go never cuts it off when the app comes back.
  afterSound(ms, fn) {
    const end = this.ctx.currentTime + ms / 1000;
    const check = () => {
      const left = end - this.ctx.currentTime;
      if (left > 0.05) setTimeout(check, left * 1000 + 50);
      else fn();
    };
    setTimeout(check, ms);
  }

  resume() {
    if (this.ctx) this.playbackSession();
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
  }

  setVolumes(v, m) {
    this.volume = v;
    this.musicVolume = m;
    if (!this.ctx) return;
    this.master.gain.value = v;
    this.mus.gain.value = m * 0.9;
    this.sfx.gain.value = 1;
    this.ui.gain.value = 1;
    // the stingers' levels were set at the default music volume (0.55)
    // and move with it as the music does
    this.sting.gain.value = m / 0.55;
    this.cue.gain.value = 1;
    this.amb.gain.value = 0.9;
  }

  makeNoise(seconds, kind) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    return buf;
  }

  noiseSource(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  // ------------------------------------------------------------ the library
  // A sound of the library is baked: its takes become buffers (the arrays
  // are let go), each with the gain that brings it to its LEVEL.
  // (true once handed over; false while there is no context to make the
  // buffers in: the sound waits)
  kitBaked(name, v) {
    if (!this.ctx) return false;
    if (name.startsWith('hall:')) {
      // (one made at another rate is let go)
      if (+name.slice(5) === this.ctx.sampleRate) this.music.setHall(this.buffer(v, this.ctx.sampleRate));
      return true;
    }
    const level = LEVEL[name] ?? -26;
    this.kit[name] = {
      bufs: v.list.map((chs) => this.buffer(chs, v.rate)),
      keys: v.keys,
      norm: v.loud.map((l) => Math.pow(10, (level - l) / 20)),
      last: -1,
    };
    return true;
  }

  buffer(chs, sr) {
    const b = this.ctx.createBuffer(chs.length, chs[0].length, sr);
    chs.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  }

  has(name) {
    return !!this.kit[name];
  }

  // Which take: the one nearest `key` (an instrument's note, an engine's
  // speed), the one asked for, or any but the last one played.
  takeOf(k, take, key) {
    if (key != null && k.keys) {
      let best = 0;
      for (let i = 1; i < k.keys.length; i++) if (Math.abs(k.keys[i] - key) < Math.abs(k.keys[best] - key)) best = i;
      return best;
    }
    if (take >= 0) return Math.min(take, k.bufs.length - 1);
    let i = Math.floor(Math.random() * k.bufs.length);
    if (i === k.last && k.bufs.length > 1) i = (i + 1) % k.bufs.length;
    k.last = i;
    return i;
  }

  // Play a sound of the library: gain against its LEVEL, rate (1 as made),
  // panned, at `when` seconds from now (or at the context time `at`), into
  // dest (the effects unless given), some of it to the place's reverb.
  // Returns { s, g } (the source and its gain), or null if it is not baked
  // yet.
  play(name, { gain = 1, rate = 1, pan = 0, when = 0, at = 0, dest = null, take = -1, key = null, verb = 0, dur = 0 } = {}) {
    const k = this.kit[name];
    if (!k || !this.ready || gain <= 0) return null;
    const ctx = this.ctx;
    const i = this.takeOf(k, take, key);
    const s = ctx.createBufferSource();
    s.buffer = k.bufs[i];
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * k.norm[i];
    s.connect(g);
    let end = g;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      end = p;
    }
    end.connect(dest || this.sfx);
    if (verb > 0 && this.ambience.verbSend) {
      const v = ctx.createGain();
      v.gain.value = verb;
      g.connect(v);
      v.connect(this.ambience.verbSend);
    }
    const t = at || ctx.currentTime + when;
    s.start(t);
    // a long take cut short (a note let ring only so long)
    if (dur > 0) {
      g.gain.setValueAtTime(gain * k.norm[i], t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
      s.stop(t + dur + 0.1);
    }
    return { s, g };
  }

  // A sound from a point in the world, through the effects: panned to its
  // side, quieter and duller with distance (full loudness within ref
  // metres) and a little behind you, as late as sound travels that far, and
  // some of it to the place's reverb. Returns { in, t, d } to play into, or
  // null out of earshot.
  spot(x, z, { y = null, range = 160, ref = 8, gain = 1, verb = 0.3, dur = 3, late = true } = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const L = this.listener;
    const dx = x - L.x;
    const dy = (y ?? L.y) - L.y;
    const dz = z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > range) return null;
    let rel = Math.atan2(dx, -dz) - L.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const behind = Math.cos(rel) < 0 ? -Math.cos(rel) : 0;
    const att = gain * (ref / (ref + Math.max(0, d - ref * 0.25))) * Math.sqrt(1 - d / range) * (1 - behind * 0.2);
    if (att < 0.004) return null;
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(1500, 16000 * Math.exp(-d / 220)) * (1 - behind * 0.35);
    const g = ctx.createGain();
    g.gain.value = att;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.sin(rel) * 0.85 * clamp(d / 4, 0, 1);
    input.connect(lp);
    lp.connect(g);
    g.connect(p);
    p.connect(this.sfx);
    if (this.ambience.verbSend && verb > 0) {
      const send = ctx.createGain();
      send.gain.value = verb * (0.6 + d / range);
      g.connect(send);
      send.connect(this.ambience.verbSend);
      // (let go with the rest, after the sound's late start from afar)
      this.afterSound((dur + 1 + d / 343) * 1000, () => send.disconnect());
    }
    this.afterSound((dur + 1 + d / 343) * 1000, () => {
      for (const n of [input, lp, g, p]) n.disconnect();
    });
    return { in: input, t: ctx.currentTime + 0.02 + (late ? Math.min(3, d / 343) : 0), d };
  }

  // A sound of the library from a point in the world (see spot).
  playAt(name, x, z, o = {}) {
    const sp = this.spot(x, z, o);
    if (!sp) return null;
    return this.play(name, { gain: o.vol ?? 1, rate: o.rate ?? 1, take: o.take ?? -1, at: sp.t, dest: sp.in });
  }

  // An animal's call from a point in the world, through the sound of the
  // place (Ambience.voice: dulled in the car and under water, in the
  // place's reverb). ref: how far it carries at full voice.
  call(name, x, z, { y = null, range = 300, ref = 20, gain = 1, verb = 0.45, rate = 1, take = -1 } = {}) {
    if (!this.ready || !this.kit[name]) return false;
    const A = this.ambience;
    const k = this.kit[name];
    const dur = k.bufs[0].duration / rate + 0.5;
    const v = A.voice(x, y ?? this.listener.y + 2, z, { range, gain: gain / 1.8, verb, dur, ref });
    if (!v) return false;
    this.play(name, { at: v.t, dest: v.in, rate, take });
    return true;
  }

  // ------------------------------------------------------------ primitives
  env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }

  tone(type, freq, dur, vol, { f2 = null, attack = 0.005, dest = this.sfx, pan = 0, when = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noise(dur, vol, { type = 'bandpass', freq = 1000, q = 1, f2 = null, buf = null, dest = this.sfx, pan = 0, attack = 0.003, when = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    // the noise buffer is two seconds long: loop it for anything longer
    const src = buf || this.white;
    const loop = dur > 1.4;
    const s = this.noiseSource(src, loop);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(dest);
    // a start somewhere in the buffer, early enough that a sound that does
    // not loop never runs off its end
    const room = loop ? 1.5 : Math.max(0, Math.min(1.5, src.duration - dur - attack - 0.06));
    s.start(t, Math.random() * room);
    s.stop(t + attack + dur + 0.05);
    return g;
  }

  // Pan and gain for a world position relative to the listener.
  spatial(x, z, range = 120) {
    const L = this.listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, -dz);
    let rel = bearing - L.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const pan = Math.sin(rel) * 0.85;
    const vol = Math.max(0, 1 - d / range) ** 1.6;
    return { pan, vol, d };
  }

  // A looping sound of the library held while wanted (the reel's gears,
  // the drag, the rod's creak): started on first use, its gain and speed
  // eased toward v and rate.
  hold(id, name, v, rate = 1, tc = 0.06) {
    const k = this.kit[name];
    if (!k || !this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    let h = (this.holds ||= {})[id];
    if (!h) {
      if (v <= 0.001) return;
      const s = ctx.createBufferSource();
      s.buffer = k.bufs[0];
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(this.sfx);
      s.start(t, Math.random() * s.buffer.duration);
      h = this.holds[id] = { s, g, v: 0, rate: 1, quiet: 0 };
    }
    if (Math.abs(h.v - v) > 0.003) {
      h.g.gain.setTargetAtTime(v * k.norm[0], t, tc);
      h.v = v;
    }
    if (Math.abs(h.rate - rate) > 0.01) {
      h.s.playbackRate.setTargetAtTime(rate, t, 0.05);
      h.rate = rate;
    }
  }

  // Let a held loop go after a while of silence (a stopped source costs
  // nothing).
  releaseHolds(dt) {
    if (!this.holds) return;
    for (const id in this.holds) {
      const h = this.holds[id];
      h.quiet = h.v <= 0.001 ? h.quiet + dt : 0;
      if (h.quiet > 2) {
        h.s.stop();
        h.g.disconnect();
        delete this.holds[id];
      }
    }
  }

  // ---------------------------------------------------------- the interface
  click() {
    if (this.play('click', { dest: this.ui, rate: rand(0.97, 1.03) })) return;
    this.tone('sine', 1200, 0.05, 0.08, { f2: 900, dest: this.ui });
  }
  tick(n) {
    if (this.play('tick', { dest: this.ui, take: n === 1 ? 0 : 1 })) return;
    this.tone('sine', n === 1 ? 880 : 1320, 0.06, 0.06, { dest: this.ui });
  }
  // a menu sliding open or shut
  slide(open = true) {
    if (!this.play('slide', { dest: this.ui, take: open ? 0 : 1 })) this.click();
  }
  chime() {
    if (this.music.sting('chime')) return;
    const notes = [76, 79, 84];
    notes.forEach((m, i) => this.tone('sine', 440 * Math.pow(2, (m - 69) / 12), 0.9, 0.1, { when: i * 0.07, dest: this.ui }));
  }
  cash() {
    if (this.play('till', { dest: this.ui })) return;
    this.tone('sine', 2093, 0.7, 0.1, { when: 0.08, dest: this.ui });
  }
  // money counted out: the catch card's bonus
  coins(v = 1, when = 0) {
    this.play('coins', { dest: this.ui, gain: v, rate: rand(0.96, 1.04), when });
  }

  // ---------------------------------------------------------------- fishing
  // The cast: the rod's swish and the line peeling off.
  whoosh() {
    if (this.play('cast', { verb: 0.15, rate: rand(0.96, 1.04) })) return;
    this.noise(0.45, 0.3, { freq: 2600, f2: 380, q: 1.2, attack: 0.02 });
  }
  plop(v = 0.5) {
    if (this.play('plop', { gain: clamp(v * 1.4, 0.15, 1.2), rate: rand(0.92, 1.1), verb: 0.12 })) return;
    this.tone('sine', 650, 0.12, 0.2 * v, { f2: 140 });
  }
  // a fish mouthing the lure
  nibble() {
    if (!this.play('nibble', { rate: rand(0.9, 1.15) })) this.plop(0.25);
  }
  splash(v = 0.6, x, z) {
    const name = v < 0.4 ? 'splashS' : v < 0.75 ? 'splashM' : 'splashL';
    const rate = rand(0.92, 1.08);
    if (x !== undefined) {
      if (this.kit[name]) {
        this.playAt(name, x, z, { range: 260, ref: 10 + v * 15, vol: 0.6 + v * 0.5, rate, verb: 0.35, dur: 1.6 });
        return;
      }
      const s = this.spatial(x, z, 90);
      if (s.vol < 0.01) return;
      this.noise(0.35 + v * 0.4, 0.4 * v * s.vol, { type: 'lowpass', freq: 3500, f2: 400, q: 0.7, pan: s.pan });
      return;
    }
    if (this.play(name, { gain: 0.7 + v * 0.4, rate, verb: 0.2 })) return;
    this.noise(0.35 + v * 0.4, 0.4 * v, { type: 'lowpass', freq: 3500, f2: 400, q: 0.7 });
  }
  bite() {
    if (this.play('bite', { verb: 0.15 })) return;
    this.plop(1);
  }
  // The lure caught on the bottom or the bank: the line jerking taut on it.
  snag() {
    if (this.play('hookset', { gain: 0.6, rate: 0.8 })) {
      this.play('hitWood', { gain: 0.35, rate: 0.6, when: 0.1 });
      return;
    }
    this.tone('triangle', 180, 0.18, 0.2, { f2: 90 });
  }
  // The hook set on a fish: the rod's sweep, then the music's hit.
  fishOn(legend) {
    this.play('hookset');
    this.music.fishOn(!!legend);
  }
  // A clean hook set, right on the bite.
  perfect() {
    this.music.sting('perfect');
  }
  // Well played: a jump bowed to, a run of catches.
  nice() {
    this.music.sting('streak');
  }
  // A feeding frenzy starting.
  frenzy() {
    this.music.sting('frenzy');
  }
  // The catch: a stinger by what it was (true or false for the old callers:
  // a big one or a plain one).
  fanfare(kind = 'catch') {
    if (kind === true) kind = 'big';
    else if (!kind) kind = 'catch';
    this.music.sting(kind);
    this.play('lift', { gain: 0.8, when: 0.05 });
    // and in the hand it flaps
    this.play('flop', { gain: 0.8, rate: rand(0.9, 1.1), when: 0.75 });
  }
  // The fish got away.
  lost() {
    this.music.sting('lost');
  }
  snap() {
    if (!this.play('snap', { verb: 0.1 })) this.noise(0.08, 0.5, { type: 'highpass', freq: 2500, q: 0.7 });
  }
  // a fish flapping in the hand
  flop() {
    this.play('flop', { rate: rand(0.9, 1.1) });
  }
  reel(on, speed = 0.5) {
    this.reelOn = on;
    this.reelSpeed = speed;
  }
  stopReel() {
    this.reelOn = false;
    this.reelScream(false);
    // the rod straightens (a snap at full strain left it creaking)
    this.creakAmt = 0;
  }
  reelScream(on) {
    this.screamOn = on;
  }
  creak(amount) {
    this.creakAmt = amount;
  }

  // The reel, the drag, the rod's creak and the line singing, each frame:
  // the clicks of the handle quicker as you crank and slower under load,
  // the gears turning under them, the drag ratcheting as fast as the fish
  // takes line, the rod creaking and the line singing near breaking.
  updateTackle(dt, g) {
    const fishing = g.fishing;
    const fight = fishing?.state === 'fight' ? fishing.fight : null;
    const load = fight ? clamp(this.reelSpeed || 0, 0, 1) : 0;
    if (this.reelOn) {
      this.reelT -= dt;
      if (this.reelT <= 0) {
        this.reelT = 1 / (19 - 8 * load) + rand(-0.004, 0.004);
        if (!this.play('reelClick', { gain: rand(0.75, 1.05), rate: rand(0.95, 1.06) - load * 0.08 })) this.noise(0.012, 0.05, { freq: 4200, q: 6 });
      }
    }
    this.hold('whir', 'reelWhir', this.reelOn ? 1 : 0, 1.05 - load * 0.3, 0.05);
    // the drag: as fast as line goes out
    let drag = 0;
    let dragRate = 1;
    if (this.screamOn && fight) {
      drag = 1;
      dragRate = clamp(0.75 + (fight.stamina ?? 1) * 0.45 + Math.min(0.3, (fight.power || 0) * 0.003), 0.6, 1.6);
    } else if (this.screamOn) drag = 1;
    this.hold('drag', 'drag', drag, dragRate, drag ? 0.03 : 0.08);
    // the rod (or the bow) creaking
    const c = clamp(this.creakAmt || 0, 0, 1);
    this.hold('creak', 'creak', c > 0.04 ? 0.35 + c * 0.65 : 0, 0.9 + c * 0.25, 0.1);
    // the line singing, near breaking
    const tNorm = fight ? (fight.tension || 0) / Math.max(1, fishing.rod().maxTension) : 0;
    this.lineSing(fight ? clamp((tNorm - 0.8) / 0.2, 0, 1) : 0, tNorm);
  }

  // The line humming in the wind of the pull: a thin high whine, rising
  // with the strain.
  lineSing(v, tNorm) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!this.sing) {
      if (v <= 0.01) return;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 900;
      const wob = ctx.createOscillator();
      wob.frequency.value = 7.5;
      const wg = ctx.createGain();
      wg.gain.value = 14;
      wob.connect(wg);
      wg.connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(bp);
      bp.connect(g);
      g.connect(this.sfx);
      o.start(t);
      wob.start(t);
      this.sing = { o, wob, g, v: 0, quiet: 0 };
    }
    const s = this.sing;
    if (Math.abs(s.v - v) > 0.01) {
      s.g.gain.setTargetAtTime(v * 0.012, t, 0.08);
      s.o.frequency.setTargetAtTime(850 + tNorm * 500, t, 0.1);
      s.v = v;
    }
    s.quiet = v <= 0.01 ? s.quiet + 1 : 0;
    if (s.quiet > 180) {
      s.o.stop();
      s.wob.stop();
      s.g.disconnect();
      this.sing = null;
    }
  }

  // ------------------------------------------------------------- longbow
  // The string's twang: the limbs and string, the release's click and the
  // arrow leaving.
  twang(power = 1) {
    if (this.play('twang', { gain: 0.6 + power * 0.45, rate: 0.96 + power * 0.08, verb: 0.15 })) return;
    this.tone('triangle', 92 + power * 30, 0.32, 0.3 + power * 0.2, { f2: 70 });
  }
  // A mosquito right by your ear.
  buzz() {
    if (!this.ready) return;
    this.tone('sawtooth', 620, 1.1, 0.02, { f2: 560, pan: Math.random() - 0.5 });
    this.tone('sawtooth', 640, 0.9, 0.014, { f2: 700, when: 0.2, pan: Math.random() - 0.5 });
  }
  // The ground rumbling before the geyser blows.
  rumble(x, z) {
    const s = this.spatial(x, z, 220);
    if (s.vol < 0.02) return;
    this.noise(3.2, 0.3 * s.vol, { type: 'lowpass', freq: 90, f2: 160, pan: s.pan });
  }
  // The geyser: a roaring hiss that dies away.
  geyser(x, z) {
    const s = this.spatial(x, z, 500);
    if (s.vol < 0.02) return;
    this.noise(8.5, 0.4 * s.vol, { type: 'bandpass', freq: 1400, q: 0.6, f2: 700, pan: s.pan, attack: 0.3 });
    this.noise(6, 0.3 * s.vol, { type: 'lowpass', freq: 260, pan: s.pan, attack: 0.2 });
  }
  // ---------------------------------------- strange things in the woods
  // A held tone: fades in, holds and fades out, so hums laid end to end
  // run on without a seam.
  drone(type, freq, dur, vol, { pan = 0, dest = this.sfx, fade = 0.3, f2 = null } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.linearRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + fade);
    g.gain.setValueAtTime(vol, t + dur - fade);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // The payphone's bell: two bursts of a hammer on a bell.
  phoneRing(x, z) {
    const sp = this.spatial(x, z, 60);
    if (sp.vol < 0.02) return;
    for (const w of [0, 0.55]) {
      for (let i = 0; i < 8; i++) {
        this.tone('sine', 1250, 0.09, 0.07 * sp.vol, { pan: sp.pan, when: w + i * 0.05 });
        this.tone('sine', 2950, 0.06, 0.03 * sp.vol, { pan: sp.pan, when: w + i * 0.05 });
      }
    }
  }
  // A hum for 2.7 seconds (called every 2.4): the fridge's compressor (kind
  // 0) or the saucer's throb (kind 1).
  hum(x, z, kind = 0) {
    const sp = this.spatial(x, z, 30);
    if (sp.vol < 0.02) return;
    const o = { pan: sp.pan, dest: this.amb };
    if (kind) {
      this.drone('sine', 66, 2.7, 0.07 * sp.vol, { ...o, f2: 60 });
      this.drone('triangle', 220, 2.7, 0.018 * sp.vol, { ...o, f2: 236 });
      this.tone('sine', 1760, 0.5, 0.012 * sp.vol, { ...o, f2: 2350, when: 0.9 });
    } else {
      this.drone('sawtooth', 50, 2.7, 0.012 * sp.vol, o);
      this.drone('sine', 100, 2.7, 0.035 * sp.vol, o);
    }
  }
  // The fairies: a sparkle of high bells.
  fairy() {
    if (!this.ready) return;
    const notes = [84, 88, 91, 96, 91, 95, 100];
    if (this.kit.glock) {
      notes.forEach((m, i) => this.music.note('glock', m, { at: this.ctx.currentTime + i * 0.07, vel: 0.5, pan: i % 2 ? 0.4 : -0.4, dest: this.cue }));
    } else notes.forEach((m, i) => this.tone('sine', 440 * Math.pow(2, (m - 69) / 12), 0.7, 0.05, { when: i * 0.06, pan: i % 2 ? 0.4 : -0.4 }));
    this.noise(1.2, 0.025, { type: 'highpass', freq: 6000, q: 0.5, attack: 0.1 });
  }
  // Three small knocks on a tiny wooden door.
  knock() {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) {
      if (!this.play('hitWood', { gain: 0.8, rate: 1.35 + i * 0.02, when: i * 0.18 })) this.tone('triangle', 420, 0.07, 0.2, { f2: 260, when: i * 0.18 });
    }
  }
  // A camera shutter: the release, the mirror, the curtain and the winder.
  shutter() {
    if (this.play('shutter', { dest: this.ui })) return;
    this.noise(0.03, 0.3, { freq: 4200, q: 3 });
  }
  // A whistler arrow: a breathy shriek rising and falling as it flies.
  whistle() {
    if (this.play('whistler', { verb: 0.3 })) return;
    this.tone('sine', 2100, 0.45, 0.06, { f2: 3300, attack: 0.04 });
  }
  // An arrow landing: a wet thump in game, a knock in wood, a click on
  // stone, a dull thud in the ground.
  arrowHit(x, z, kind = 'ground') {
    const name = { game: 'hitGame', wood: 'hitWood', rock: 'hitRock' }[kind] || 'hitGround';
    if (this.kit[name]) {
      this.playAt(name, x, z, { range: 200, ref: 12, rate: rand(0.94, 1.06), verb: 0.4, dur: 0.8 });
      return;
    }
    const s = this.spatial(x, z, 180);
    if (s.vol < 0.02) return;
    this.noise(0.1, 0.25 * s.vol, { type: 'lowpass', freq: 380, pan: s.pan, when: Math.min(0.5, s.d / 340) });
  }
  // Bear spray: the can's jet.
  spray() {
    if (this.play('spray')) return;
    this.noise(1.4, 0.4, { type: 'highpass', freq: 1800, q: 0.4, attack: 0.05 });
  }

  // ------------------------------------------------------------------ bears
  growl(x, z, intensity = 0.7, roar = false) {
    if (!this.ready) return;
    const name = roar ? 'roar' : 'growl';
    if (this.kit[name]) {
      const sp = this.spot(x, z, { range: 260, ref: 14, gain: 0.45 + intensity * 0.6, verb: 0.4, dur: 2.5 });
      if (!sp) return;
      this.play(name, { at: sp.t, dest: sp.in, rate: rand(0.94, 1.04) });
      // a roar rings back off the hills
      if (roar && this.echo) {
        const e = this.ctx.createGain();
        e.gain.value = 0.25 * intensity;
        sp.in.connect(e);
        e.connect(this.echo);
        this.afterSound(3000, () => e.disconnect());
      }
      return;
    }
    const sp = this.spatial(x, z, 160);
    if (sp.vol < 0.01) return;
    this.noise(roar ? 1.6 : 1.0, 0.5 * intensity * sp.vol, { freq: roar ? 300 : 150, q: 2, buf: this.brown, pan: sp.pan, attack: 0.15 });
  }
  huff(x, z) {
    if (this.kit.huff) {
      this.playAt('huff', x, z, { range: 120, ref: 8, rate: rand(0.94, 1.06), verb: 0.25, dur: 1 });
      return;
    }
    const sp = this.spatial(x, z, 80);
    if (sp.vol < 0.01) return;
    this.noise(0.18, 0.45 * sp.vol, { freq: 350, q: 1.2, pan: sp.pan, buf: this.brown });
  }
  swipe() {
    if (this.play('swipe')) return;
    this.noise(0.25, 0.5, { freq: 1500, f2: 300, q: 0.8 });
    this.tone('sine', 80, 0.3, 0.5, { f2: 40 });
  }

  // ------------------------------------------------------------- wildlife
  birdChirp(x, z) {
    const sp = x === undefined ? { pan: Math.random() * 1.6 - 0.8, vol: 0.5 + Math.random() * 0.5 } : this.spatial(x, z, 150);
    if (sp.vol < 0.02) return;
    const base = 2200 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 5);
    const kind = Math.random();
    for (let i = 0; i < n; i++) {
      const f = kind < 0.5 ? base * (1 + (i % 2) * 0.25) : base * (1.3 - i * 0.06);
      this.tone('sine', f, 0.07 + Math.random() * 0.05, 0.035 * sp.vol, { f2: f * (kind < 0.5 ? 0.8 : 1.2), pan: sp.pan, when: i * 0.12, dest: this.amb });
    }
  }
  eagle(x, z) {
    if (this.ambience.ctx) return this.ambience.eagle(x, this.listener.y + 25, z);
  }
  raven(x, z) {
    if (this.ambience.ctx) return this.ambience.raven(x, this.listener.y + 8, z);
  }
  gull(x, z) {
    if (this.ambience.ctx) return this.ambience.gull(x, this.listener.y + 12, z);
  }
  loon(x, z) {
    if (!this.ready) return;
    if (this.ambience.ctx) return this.ambience.loonCall(x, this.game.world?.heightAt?.(x, z) ?? 0, z, 1, Math.random() < 0.6 ? 'wail' : 'tremolo');
  }
  wolf() {
    if (!this.ready) return;
    if (this.ambience.ctx) return this.ambience.wolves();
  }
  // Geese going over: a skein honking somewhere overhead.
  goose() {
    if (!this.ready) return;
    const L = this.listener;
    const a = Math.random() * Math.PI * 2;
    const d = rand(60, 140);
    this.call('geese', L.x + Math.sin(a) * d, L.z + Math.cos(a) * d, { y: L.y + rand(40, 80), range: 700, ref: 90, verb: 0.4, rate: rand(0.95, 1.05) });
  }
  quack(x, z) {
    this.call('quacks', x, z, { range: 200, ref: 18, rate: rand(0.94, 1.06), verb: 0.35 });
  }
  flap(x, z) {
    this.call('flaps', x, z, { range: 90, ref: 8, rate: rand(0.9, 1.1), verb: 0.25 });
  }
  whale(x, z) {
    this.call('blow', x, z, { y: 0.5, range: 1100, ref: 120, take: Math.floor(Math.random() * 2), verb: 0.5 });
  }
  // Steller sea lions hauled out: deep, rough barks.
  seaLion(x, z) {
    this.call('barks', x, z, { range: 450, ref: 50, rate: rand(0.92, 1.06), verb: 0.4 });
  }
  // Sandhill cranes: a far-carrying rolling bugle.
  crane(x, z) {
    this.call('cranes', x, z, { y: this.listener.y + 20, range: 900, ref: 150, rate: rand(0.96, 1.04), verb: 0.5 });
  }
  // Black-billed magpie: harsh chatter.
  magpie(x, z) {
    this.call('chakker', x, z, { y: this.listener.y + 4, range: 220, ref: 20, rate: rand(0.94, 1.06), verb: 0.4 });
  }
  // Belted kingfisher: a dry, loud rattle.
  kingfisher(x, z) {
    this.call('rattle', x, z, { y: this.listener.y + 3, range: 320, ref: 35, rate: rand(0.95, 1.05), verb: 0.4 });
  }
  // A beaver slapping its tail on the water before diving.
  tailSlap(x, z) {
    this.call('slap', x, z, { y: 0.2, range: 450, ref: 40, rate: rand(0.92, 1.08), verb: 0.5 });
  }
  // Arctic ground squirrel alarm call ("sik-sik").
  squeak(x, z) {
    this.call('sik', x, z, { y: this.listener.y, range: 160, ref: 15, rate: rand(0.95, 1.08), verb: 0.25 });
  }
  // Orca blow: a short sharp exhale.
  orcaBlow(x, z) {
    this.call('blow', x, z, { y: 0.5, range: 900, ref: 90, take: 2 + Math.floor(Math.random() * 2), verb: 0.5 });
  }

  // -------------------------------------------------------------- footsteps
  step(surface, water, sprint) {
    if (!this.ready) return;
    // the baked footsteps for the ground (until they are baked, these)
    if (this.ambience.step(surface, water, sprint)) return;
    const v = sprint ? 0.16 : 0.11;
    if (water && water.depth > 0.1) {
      this.noise(0.18, v * 1.4, { type: 'lowpass', freq: 2200, f2: 500, q: 0.8 });
      return;
    }
    this.noise(0.08, v * 0.7, { type: 'lowpass', freq: 1400, q: 0.5 });
  }

  // ----------------------------------------------------------- the world
  // Glacier calving: a sharp crack rolling into thunder, heard with the delay
  // of the distance.
  iceCrack(x, z) {
    if (!this.ready) return;
    if (this.kit.crack) {
      const sp = this.spot(x, z, { range: 1800, ref: 260, verb: 0.6, dur: 5 });
      if (sp) this.play('crack', { at: sp.t, dest: sp.in, rate: rand(0.85, 1.05) });
      return;
    }
    const s = this.spatial(x, z, 1400);
    if (s.vol < 0.01) return;
    this.noise(0.22, 0.8 * s.vol, { type: 'highpass', freq: 1800, q: 0.7, pan: s.pan, when: Math.min(2.5, s.d / 343) });
  }

  // The slab hitting the lake: a deep boom, the crash of water and the
  // rumble rolling away.
  iceBoom(x, z, size = 1) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 1600);
    if (s.vol < 0.01) return;
    const when = Math.min(3, s.d / 343);
    const v = s.vol * Math.min(1.3, 0.6 + size * 0.5);
    this.tone('sine', 55, 1.8, 0.7 * v, { f2: 24, attack: 0.01, pan: s.pan, when });
    const sp = this.spot(x, z, { range: 2000, ref: 300, gain: Math.min(1.3, 0.6 + size * 0.5), verb: 0.6, dur: 6 });
    if (sp && this.kit.splashL) {
      this.play('splashL', { at: sp.t, dest: sp.in, rate: 0.45 });
      this.play('crack', { at: sp.t + 0.1, dest: sp.in, rate: 0.55, gain: 0.5 });
      return;
    }
    this.noise(3.8, 0.7 * v, { type: 'lowpass', freq: 520, f2: 70, q: 0.5, buf: this.brown, pan: s.pan, attack: 0.05, when });
  }

  thud(v) {
    if (this.play('thud', { gain: clamp(v, 0.1, 1.2), rate: rand(0.92, 1.08) })) return;
    this.tone('sine', 70, 0.35, 0.5 * v, { f2: 35 });
  }
  // A car door shutting.
  door() {
    if (this.play('thud', { gain: 0.36, rate: 1.25 })) {
      this.play('rim', { gain: 0.35, rate: 0.7, when: 0.01 });
      return;
    }
    this.tone('square', 200, 0.05, 0.04);
  }
  // A boat winched up its trailer: the ratchet clicking, the gears.
  winch() {
    if (!this.ready) return;
    for (let i = 0; i < 14; i++) this.play('reelClick', { gain: 1.15, rate: 0.55 + Math.random() * 0.05, when: i * 0.11 });
    this.play('slide', { gain: 1, rate: 0.45, when: 0.3 });
  }
  horn() {
    if (!this.ready) return;
    const h = this.play('klaxon');
    if (h) {
      const e = this.ctx.createGain();
      e.gain.value = 0.5;
      h.g.connect(e);
      e.connect(this.echo);
      this.afterSound(2500, () => e.disconnect());
      return;
    }
    this.tone('sawtooth', 300, 0.8, 0.12, { f2: 390 });
  }

  // ---------------------------------------------------------------- engines
  // An engine from the library's loops (three speeds each): the two nearest
  // the engine's speed play at once, each sped up or slowed to it and
  // crossfaded by how near it is, through a lowpass that opens with the
  // throttle (an engine pulling is brighter), with the intake's rush under
  // it. Built on first use; null until the loops are baked.
  engineVoice(kind) {
    const k = this.kit[kind];
    if (!k || !this.ready) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    out.connect(pan);
    pan.connect(this.sfx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.value = 1200;
    lp.connect(out);
    const layers = k.bufs.map((b, i) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(lp);
      s.start(t, Math.random() * b.duration);
      return { s, g, rpm: k.keys[i], norm: k.norm[i], w: -1, r: -1 };
    });
    const n = this.noiseSource(this.pink);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.Q.value = 0.8;
    nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    n.connect(nf);
    nf.connect(ng);
    ng.connect(out);
    n.start(t, Math.random() * 2);
    return { kind, out, pan, lp, layers, n, nf, ng, last: {} };
  }

  // Set an engine going at rpm with the throttle open so far, at loudness
  // vol (1: the driver's seat at full throttle), panned.
  driveEngine(e, rpm, throttle, vol, pan = 0) {
    const t = this.ctx.currentTime;
    e.hushed = false;
    const L = e.layers;
    let i = 0;
    while (i < L.length - 2 && rpm > L[i + 1].rpm) i++;
    const a = L[i];
    const b = L[i + 1];
    const x = clamp(Math.log(Math.max(1, rpm) / a.rpm) / Math.log(b.rpm / a.rpm), 0, 1);
    for (let j = 0; j < L.length; j++) {
      const l = L[j];
      const w = j === i ? Math.cos((x * Math.PI) / 2) : j === i + 1 ? Math.sin((x * Math.PI) / 2) : 0;
      if (Math.abs(w - l.w) > 0.01) {
        l.g.gain.setTargetAtTime(w * l.norm, t, 0.04);
        l.w = w;
      }
      const r = clamp(rpm / l.rpm, 0.3, 3);
      if (w > 0 && Math.abs(r - l.r) > 0.004) {
        l.s.playbackRate.setTargetAtTime(r, t, 0.03);
        l.r = r;
      }
    }
    this.engineSet(e, 'lp', e.lp.frequency, 600 + throttle * 3600 + rpm * 0.3, 0.06, 20, t);
    this.engineSet(e, 'ng', e.ng.gain, (0.02 + throttle * 0.1) * Math.min(1, rpm / 3000), 0.08, 0.002, t);
    this.engineSet(e, 'nf', e.nf.frequency, 400 + rpm * 0.3, 0.1, 15, t);
    this.engineSet(e, 'out', e.out.gain, Math.max(0, vol), 0.08, 0.002, t);
    this.engineSet(e, 'pan', e.pan.pan, clamp(pan, -1, 1), 0.1, 0.02, t);
  }

  // An engine's setting eased to v, if it moved more than eps since last set.
  engineSet(e, key, param, v, tc, eps, t) {
    if (Math.abs((e.last[key] ?? -1) - v) <= eps) return;
    param.setTargetAtTime(v, t, tc);
    e.last[key] = v;
  }

  stopVoice(e) {
    if (!e) return;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.15);
    for (const l of e.layers) l.s.stop(t + 1);
    e.n.stop(t + 1);
    this.afterSound(1500, () => e.out.disconnect());
  }

  // How an engine sounds from where you are: in it, or from outside at
  // distance d (full loudness within a few metres), panned to its side.
  // (One object, filled in on each call: read it at once.)
  heard(pos, dist, inside, range) {
    const h = (this.heardOut ||= { vol: 0, pan: 0 });
    h.vol = 0;
    h.pan = 0;
    if (inside) h.vol = 1;
    else if (dist <= range) {
      if (pos) {
        const L = this.listener;
        let rel = Math.atan2(pos.x - L.x, -(pos.z - L.z)) - L.heading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        h.pan = Math.sin(rel) * 0.8 * clamp(dist / 5, 0, 1);
      }
      h.vol = (5 / (5 + dist)) * Math.sqrt(1 - dist / range);
    }
    return h;
  }

  // The hot rod's V8: it cranks over and catches when the game starts or
  // you get in, idles while it is left a little, and is switched off after.
  startEngine() {
    if (!this.ready) return;
    this.engineIdle = 25;
    this.crank('v8');
  }
  stopEngine() {
    this.stopVoice(this.engine);
    this.engine = null;
    this.engineIdle = 0;
  }
  // The starter turning it over, then the engine catching with a blip.
  crank(kind) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.noise(0.13, 0.05, { type: 'bandpass', freq: 260, q: 2.5, when: i * 0.17, buf: this.brown });
      this.tone('triangle', 150, 0.12, 0.02, { f2: 175, when: i * 0.17 });
    }
    this.catchAt = t + 0.5;
    this.catchKind = kind;
  }
  updateEngine(rpm, throttle, dist, occupied) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (occupied && !this.wasIn) {
      if (this.engineIdle <= 0) this.crank('v8');
      this.engineIdle = 25;
    }
    this.wasIn = occupied;
    if (!occupied) this.engineIdle -= this.dt || 0;
    const running = occupied || this.engineIdle > 0;
    if (!running) {
      if (this.engine) {
        this.stopVoice(this.engine);
        this.engine = null;
      }
      return;
    }
    if (this.catchKind === 'v8' && now < this.catchAt) return;
    if (!this.engine) this.engine = this.engineVoice('v8');
    const e = this.engine;
    if (!e) return;
    // just caught: a blip of the throttle
    let r = occupied ? rpm : 850;
    if (this.catchKind === 'v8' && now < this.catchAt + 0.9) {
      const u = (now - this.catchAt) / 0.9;
      r = Math.max(r, 850 + 1500 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u));
    }
    const h = this.heard(this.game.hotrod?.pos, dist, occupied && dist === 0, 110);
    this.driveEngine(e, r, occupied ? throttle : 0.05, h.vol * (occupied ? 0.5 + throttle * 0.5 : 0.35), h.pan);
  }

  // The race car's turbocharged V6: a hard, high wail well above the hot
  // rod's burble, and the turbo's whistle over it. With nobody in it the
  // engine is off.
  updateRacer(rpm, throttle, dist, on) {
    if (!this.ready) return;
    if (!on) {
      if (this.racer) {
        this.stopVoice(this.racer);
        this.racer.whistle.stop(this.ctx.currentTime + 1);
        this.racer = null;
      }
      return;
    }
    const now = this.ctx.currentTime;
    if (this.catchKind === 'v6' && now < this.catchAt) return;
    if (!this.racer) {
      const e = this.engineVoice('v6');
      if (!e) return;
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 2600;
      const gw = ctx.createGain();
      gw.gain.value = 0;
      o.connect(gw);
      gw.connect(e.out);
      o.start();
      e.whistle = o;
      e.gw = gw;
      this.racer = e;
    }
    const e = this.racer;
    const h = this.heard(this.game.racer?.pos, dist, dist === 0, 260);
    this.driveEngine(e, Math.max(3800, rpm), throttle, h.vol * (0.45 + throttle * 0.55), h.pan);
    const t = this.ctx.currentTime;
    e.whistle.frequency.setTargetAtTime(2400 + rpm * 0.2, t, 0.12);
    e.gw.gain.setTargetAtTime(throttle * 0.006, t, 0.1);
  }

  // The starter's whine, then the engine catches with a bark.
  racerStart() {
    if (!this.ready) return;
    this.tone('triangle', 90, 0.55, 0.05, { f2: 700 });
    this.catchAt = this.ctx.currentTime + 0.55;
    this.catchKind = 'v6';
  }

  // A race car has no horn: two pips on the team radio instead.
  radioBeep() {
    this.tone('sine', 1250, 0.07, 0.04);
    this.tone('sine', 1250, 0.07, 0.04, { when: 0.14 });
  }

  // A tarp dragged off something.
  tarpPull() {
    this.noise(0.7, 0.1, { type: 'bandpass', freq: 400, q: 0.8, f2: 1600 });
  }

  // The engine bought at the Trading Post: a rev to hear it.
  rev() {
    if (!this.ready || !this.kit.v8) return;
    const ctx = this.ctx;
    const k = this.kit.v8;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = k.bufs[1];
    s.loop = true;
    const base = k.keys[1];
    s.playbackRate.setValueAtTime(900 / base, t);
    s.playbackRate.linearRampToValueAtTime(900 / base, t + 0.1);
    s.playbackRate.exponentialRampToValueAtTime(5200 / base, t + 0.55);
    s.playbackRate.exponentialRampToValueAtTime(900 / base, t + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(4200, t + 0.5);
    lp.frequency.linearRampToValueAtTime(900, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(k.norm[1] * 0.6, t + 0.08);
    g.gain.setValueAtTime(k.norm[1] * 0.6, t + 1.4);
    g.gain.linearRampToValueAtTime(0, t + 1.8);
    s.connect(lp);
    lp.connect(g);
    g.connect(this.ui);
    s.start(t);
    s.stop(t + 1.9);
  }

  // The outboard: a buzzy two-stroke that rises with the throttle. rpm 0
  // silences it.
  updateOutboard(rpm, throttle, dist, on) {
    if (!this.ready) return;
    if (!rpm) {
      if (this.outboard) {
        this.stopVoice(this.outboard);
        this.outboard = null;
      }
      return;
    }
    if (!this.outboard) this.outboard = this.engineVoice('twoStroke');
    const e = this.outboard;
    if (!e) return;
    const h = this.heard(this.game.boat?.pos, dist, on && dist === 0, 160);
    this.driveEngine(e, Math.max(700, rpm), throttle, h.vol * (on ? 0.45 + throttle * 0.55 : 0.3), h.pan);
  }

  // -------------------------------------------------------------- climbing
  // A shoe or a hand on the granite.
  climbTick(v = 0.5) {
    if (this.play('scuff', { gain: 0.5 + v * 0.7, rate: rand(0.9, 1.1) })) return;
    this.noise(0.09, 0.14 * v, { freq: 2400, q: 1.4, attack: 0.004 });
  }
  // A hand in the chalk bag, and a clap of dust.
  chalk() {
    if (!this.ready) return;
    this.noise(0.18, 0.08, { freq: 1200, q: 0.8, attack: 0.02, when: 0.25 });
    this.noise(0.08, 0.13, { type: 'highpass', freq: 2500, q: 0.7, when: 0.75 });
  }
  // Coming off: a scrape down the rock, then the rope taking your weight.
  climbFall() {
    if (!this.ready) return;
    if (this.kit.scuff) {
      for (let i = 0; i < 3; i++) this.play('scuff', { gain: 1, rate: 0.75 + i * 0.1, when: i * 0.08 });
      this.play('thud', { gain: 0.35, rate: 0.9, when: 0.45 });
      return;
    }
    this.noise(0.25, 0.22, { freq: 1600, f2: 500, q: 1, attack: 0.005 });
    this.tone('sine', 110, 0.25, 0.22, { f2: 70, when: 0.45 });
  }

  // The paraglider's wing filling as you run off the edge.
  gust() {
    if (this.play('gust', { verb: 0.2 })) return;
    this.noise(1.1, 0.25, { freq: 400, f2: 1400, q: 0.7, attack: 0.4 });
  }

  // ------------------------------------------------------- the night sky
  // The Tesla coil: the spark gap's buzz under the crackle of the sparks,
  // for dur seconds (see world/tesla.js).
  coil(x, z, dur = 6) {
    const sp = this.spatial(x, z, 70);
    if (sp.vol < 0.02) return;
    const o = { pan: sp.pan };
    this.drone('sawtooth', 120, dur, 0.03 * sp.vol, { ...o, fade: 0.08 });
    this.drone('square', 240, dur, 0.01 * sp.vol, { ...o, fade: 0.08 });
    for (let i = 0; i < dur * 16; i++) {
      this.noise(0.02 + Math.random() * 0.05, (0.05 + Math.random() * 0.14) * sp.vol, { type: 'highpass', freq: 2500 + Math.random() * 3500, q: 0.7, pan: sp.pan, when: Math.random() * dur });
    }
  }
  // A single loud snap, a spark striking the earthed ball.
  zap(x, z) {
    const sp = this.spatial(x, z, 70);
    if (sp.vol < 0.02) return;
    this.noise(0.05, 0.2 * sp.vol, { type: 'highpass', freq: 1800, q: 0.6, pan: sp.pan });
    this.noise(0.12, 0.07 * sp.vol, { type: 'bandpass', freq: 900, q: 1.2, pan: sp.pan, when: 0.01 });
  }

  // Zib's voice: little glides and trills (see gameplay/visitor.js).
  chirp(kind = 'happy') {
    if (!this.ready) return;
    const n = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const t = (m, m2, when, dur = 0.12, vol = 0.06) => this.tone('sine', n(m), dur, vol, { f2: n(m2), when, attack: 0.01 });
    if (kind === 'hello') {
      t(81, 84, 0);
      t(84, 88, 0.18);
      t(88, 93, 0.36, 0.2);
    } else if (kind === 'happy') {
      for (let i = 0; i < 5; i++) t(86 + (i % 2) * 4, 90 + (i % 2) * 3, i * 0.07, 0.07, 0.045);
    } else if (kind === 'peek') {
      t(88, 92, 0, 0.1, 0.045);
      t(92, 86, 0.14, 0.12, 0.035);
    } else if (kind === 'warn') {
      for (let i = 0; i < 6; i++) t(96, 94, i * 0.09, 0.06, 0.06);
    } else if (kind === 'fish') {
      t(84, 91, 0, 0.18, 0.045);
    } else if (kind === 'sad') {
      t(84, 72, 0, 0.9, 0.05);
      t(79, 67, 0.95, 0.9, 0.045);
    } else if (kind === 'blink') {
      this.noise(0.25, 0.05, { type: 'highpass', freq: 4000, f2: 9000, q: 0.5 });
      t(96, 100, 0.02, 0.1, 0.035);
    } else {
      t(84, 81, 0, 0.16, 0.045);
    }
  }
  // The craft coming in: a roar rising out of the sky and dying away, with
  // the crackle of the air it burns through.
  craft(dur = 11) {
    if (!this.ready) return;
    this.noise(dur, 0.16, { type: 'lowpass', freq: 70, f2: 240, q: 0.6, buf: this.brown, attack: dur * 0.6 });
    this.noise(dur * 0.8, 0.05, { type: 'bandpass', freq: 600, f2: 1600, q: 0.8, attack: dur * 0.5 });
    for (let i = 0; i < 26; i++) this.noise(0.04, 0.035 + Math.random() * 0.05, { type: 'highpass', freq: 2500, q: 0.6, when: dur * (0.4 + Math.random() * 0.6) });
  }

  // On top.
  cheer() {
    this.music.sting('goal');
  }

  // A fireball's sonic boom, minutes after the light: a double crack from
  // far off rolling into thunder.
  boom() {
    if (!this.ready) return;
    this.tone('sine', 48, 1.6, 0.4, { f2: 26, attack: 0.02 });
    if (this.kit.crack) {
      this.play('crack', { gain: 0.65, rate: 0.6, verb: 0.5 });
      this.play('crack', { gain: 0.54, rate: 0.55, when: 0.22, verb: 0.5 });
      return;
    }
    this.noise(4.5, 0.3, { type: 'lowpass', freq: 260, f2: 50, q: 0.5, buf: this.brown, attack: 0.3, when: 0.3 });
  }

  // The radio telescope's loudspeaker: each source's signal turned into
  // sound. listen(id) tunes in (null switches off); update() keeps the
  // pulses coming. The music rests while it plays.
  listen(id) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.radioId = id;
    this.radioT = 0.2;
    // the receiver's own hiss under everything
    if (!this.radioHiss) {
      const s = this.noiseSource(this.pink, true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      s.connect(f).connect(g).connect(this.sfx);
      s.start();
      this.radioHiss = { s, f, g };
    }
    const H = this.radioHiss;
    const level = { pulsar: 0.05, crab: 0.04, jupiter: 0.03, sun: 0.07, hydrogen: 0.06, cmb: 0.12 }[id] ?? 0;
    H.g.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.15);
    H.f.frequency.setTargetAtTime(id === 'hydrogen' ? 1420 : id === 'cmb' ? 3000 : 1800, t, 0.1);
    H.f.Q.setTargetAtTime(id === 'hydrogen' ? 3 : 0.4, t, 0.1);
    // the Crab pulsar: a steady buzz of 29.6 pulses a second
    if (id === 'crab' && !this.crab) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 29.6;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.11, t, 0.2);
      o.connect(f).connect(g).connect(this.sfx);
      o.start();
      this.crab = { o, g };
    } else if (id !== 'crab' && this.crab) {
      const c = this.crab;
      c.g.gain.setTargetAtTime(0.0001, t, 0.08);
      c.o.stop(t + 0.5);
      this.crab = null;
    }
  }

  updateRadio(dt) {
    const id = this.radioId;
    this.radioT -= dt;
    if (this.radioT > 0) return;
    if (id === 'pulsar') {
      // one pulse every 0.714 seconds, its high notes arriving a moment
      // before the low ones (the gas between the stars slows low
      // frequencies), each a little brighter or dimmer than the last
      this.radioT += 0.714519;
      this.radioPulse = (this.radioPulse || 0) + 1;
      const v = 0.16 + Math.random() * 0.12;
      this.noise(0.05, v, { freq: 2600, f2: 650, q: 2.2, attack: 0.002 });
      this.tone('triangle', 180, 0.05, v * 0.25, { f2: 90 });
    } else if (id === 'jupiter') {
      // long swells like waves on a beach, and now and then a burst of pops
      this.radioT = 1.2 + Math.random() * 2.6;
      this.noise(1.4 + Math.random(), 0.1 + Math.random() * 0.08, { type: 'lowpass', freq: 1600, f2: 450, q: 0.6, attack: 0.5 });
      if (Math.random() < 0.45) {
        this.radioPulse = (this.radioPulse || 0) + 1;
        const n = 5 + Math.floor(Math.random() * 12);
        let w = 0.3 + Math.random();
        for (let i = 0; i < n; i++) {
          this.noise(0.008, 0.16 + Math.random() * 0.1, { freq: 2800 + Math.random() * 1200, q: 2.5, when: w });
          w += 0.02 + Math.random() * 0.05;
        }
      }
    } else if (id === 'sun') {
      // a radio burst from a flare: a roar sweeping down the dial
      this.radioT = 3 + Math.random() * 7;
      this.radioPulse = (this.radioPulse || 0) + 1;
      const v = 0.08 + Math.random() * 0.12;
      this.noise(0.9 + Math.random() * 0.8, v, { freq: 3400, f2: 280, q: 2.6, attack: 0.05 });
      if (Math.random() < 0.3) this.noise(3, v * 0.7, { freq: 900, f2: 300, q: 1.5, attack: 0.6, when: 0.6 });
    } else if (id === 'cmb') {
      // static, and the odd crackle
      this.radioT = 0.2 + Math.random() * 1.5;
      this.noise(0.01, 0.12, { type: 'highpass', freq: 2500, q: 0.7 });
    } else this.radioT = 1;
  }

  // ------------------------------------------------------------- per frame
  update(dt, g) {
    this.dt = dt;
    // Where there is no worker to make the ambience's sounds and the
    // library (oven.js), they are made here a little each frame, from the
    // title screen on: the title screen can spare more time, for both at
    // once; in a game the library waits for the ambience, and they share
    // less. (With a worker these do nothing.)
    if (!g.started) {
      this.ambience.bake(2);
      this.bakery.step(2);
    } else if (this.ambience.bakery.busy) this.ambience.bake(1.2);
    else if (this.bakery.busy) this.bakery.step(1.2);
    if (!this.ready) return;
    // finished sounds become buffers, one of each kind a frame (all at once
    // would hold a frame up)
    this.ambience.bakery.handOver();
    this.bakery.handOver();
    if (!g.world) return;
    const cam = g.camera;
    const dir = cam.getWorldDirection(this._d || (this._d = cam.position.clone()));
    this.listener.x = cam.position.x;
    this.listener.y = cam.position.y;
    this.listener.z = cam.position.z;
    this.listener.heading = Math.atan2(dir.x, -dir.z);
    const inMenu = g.menuOpen || !g.started;
    const duck = inMenu ? 0.35 : 1;
    // the place: wind, water, rain, birds and the rest (see ambience.js)
    this.ambience.update(dt, g, duck);

    if (!inMenu) {
      // wolves, now and then, on a night away from the towns
      this.wolfT -= dt;
      if (this.wolfT <= 0) {
        this.wolfT = 70 + Math.random() * 120;
        if (g.env.night > 0.6 && Math.random() < 0.5) this.wolf();
      }
      this.updateTackle(dt, g);
    } else {
      this.hold('whir', 'reelWhir', 0);
      this.hold('drag', 'drag', 0);
      this.hold('creak', 'creak', 0);
      if (this.sing) this.lineSing(0, 0);
      // the engines hush under a menu: the game stops updating them there,
      // and one left at full throttle would roar on under the pause menu
      for (const e of [this.engine, this.racer, this.outboard]) {
        if (!e || e.hushed) continue;
        e.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
        e.last.out = -1;
        e.hushed = true;
      }
    }
    this.releaseHolds(dt);
    if (this.radioId) this.updateRadio(dt);
    this.updateMusic(dt, g);
  }

  // ----------------------------------------------------------------- music
  updateMusic(dt, g) {
    this.music.update(dt, g, !!this.radioId);
  }

  // Start the music over: the first song, as at the start of a game.
  musicReset() {
    this.music.reset();
  }
}
