// Procedural Web Audio: ambience (wind, river, ocean, rain), wildlife calls,
// fishing and rifle sound effects, the hot rod's V8 and a plucked-guitar
// folk soundtrack. Everything is synthesised; no audio files.

const PENTA = [0, 2, 4, 7, 9];

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
    this.nextBird = 3;
    this.nextCall = 20;
    this.music = { next: 0, bar: 0, beat: 0, chord: 0, rest: 0, mode: 'day', tension: 0 };
  }

  // Must be called from a user gesture (tap/click).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.mus = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.mus.connect(this.master);
    this.setVolumes(this.volume, this.musicVolume);
    // iOS unlock with a silent buffer
    const b = ctx.createBuffer(1, 1, sr);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    ctx.resume();

    // noise buffers
    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(3, 'brown');
    this.pink = this.makeNoise(3, 'pink');
    // echo for gunshots (mountain slapback)
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

    this.buildAmbience();
    this.buildPlucks();
    this.ready = true;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
  }

  setVolumes(v, m) {
    this.volume = v;
    this.musicVolume = m;
    if (!this.ctx) return;
    this.master.gain.value = v;
    this.mus.gain.value = m * 0.55;
    this.sfx.gain.value = 1;
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

  // ---------------------------------------------------------------- ambience
  buildAmbience() {
    const ctx = this.ctx;
    const loop = (buf, type, freq, q, gain) => {
      const src = this.noiseSource(buf);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(this.amb);
      src.start(0, Math.random() * 1.5);
      return { src, f, g };
    };
    this.wind = loop(this.pink, 'bandpass', 500, 0.6, 0.0);
    this.river = loop(this.white, 'bandpass', 900, 0.5, 0.0);
    this.riverLow = loop(this.brown, 'lowpass', 300, 0.7, 0.0);
    this.ocean = loop(this.brown, 'lowpass', 500, 0.5, 0.0);
    this.rainN = loop(this.white, 'highpass', 2500, 0.4, 0.0);
    this.falls = loop(this.pink, 'lowpass', 1400, 0.4, 0.0);
  }

  // ---------------------------------------------------------------- plucks
  buildPlucks() {
    this.plucks = new Map();
  }

  // Karplus-Strong plucked string, generated on first use and cached.
  pluckBuffer(midi) {
    let buf = this.plucks.get(midi);
    if (buf) return buf;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const len = Math.floor(sr * 1.7);
    buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      prev = prev * 0.5 + w * 0.5; // slightly darker pick
      d[i] = prev;
    }
    const decay = 0.9965 + Math.min(0.0025, (80 - midi) * 0.00005);
    for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
    this.plucks.set(midi, buf);
    return buf;
  }

  pluck(midi, when, vel = 0.5, pan = 0) {
    if (!this.ready) return;
    const buf = this.pluckBuffer(Math.max(28, Math.min(88, Math.round(midi))));
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vel;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g);
    g.connect(p);
    p.connect(this.mus);
    s.start(when);
    s.stop(when + 1.7);
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
    const s = this.noiseSource(buf || this.white, false);
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
    s.start(t, Math.random() * 1.5);
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

  // ------------------------------------------------------------- UI / fishing
  click() {
    this.tone('sine', 1200, 0.05, 0.08, { f2: 900 });
  }
  tick(n) {
    this.tone('square', n === 1 ? 880 : 1320, 0.06, 0.07);
  }
  whoosh() {
    this.noise(0.45, 0.35, { freq: 2600, f2: 380, q: 1.2, attack: 0.02 });
    // line whizz off the spool
    this.noise(0.7, 0.12, { type: 'highpass', freq: 3500, q: 0.5, when: 0.15 });
  }
  plop(v = 0.5) {
    this.tone('sine', 650, 0.12, 0.25 * v, { f2: 140 });
    this.noise(0.12, 0.12 * v, { freq: 1500, q: 1 });
  }
  splash(v = 0.6, x, z) {
    let pan = 0;
    let vol = v;
    if (x !== undefined) {
      const s = this.spatial(x, z, 90);
      pan = s.pan;
      vol *= s.vol;
      if (vol < 0.01) return;
    }
    this.noise(0.35 + v * 0.4, 0.45 * vol, { type: 'lowpass', freq: 3500, f2: 400, q: 0.7, pan });
    this.noise(0.2, 0.2 * vol, { freq: 900, q: 2, pan });
  }
  bite() {
    this.plop(1);
    this.noise(0.4, 0.3, { type: 'lowpass', freq: 2500, f2: 300 });
  }
  snag() {
    this.tone('triangle', 180, 0.18, 0.25, { f2: 90 });
    this.noise(0.12, 0.15, { freq: 600, q: 1.5 });
  }
  chime() {
    const notes = [76, 79, 84];
    notes.forEach((m, i) => this.tone('sine', 440 * Math.pow(2, (m - 69) / 12), 0.9, 0.12, { when: i * 0.07 }));
  }
  fishOn(legend) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const riff = legend ? [52, 55, 57, 59, 62, 64] : [52, 55, 57];
    riff.forEach((m, i) => this.pluck(m, t + i * 0.09, 0.7));
    this.tone('sawtooth', 110, 0.25, 0.05, { f2: 220 });
  }
  fanfare(big) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const seq = big ? [55, 59, 62, 67, 71, 74, 79] : [55, 59, 62, 67];
    seq.forEach((m, i) => this.pluck(m, t + i * 0.1, 0.6, (i % 2 ? 0.3 : -0.3)));
    this.pluck(43, t, 0.5);
  }
  cash() {
    this.tone('square', 1568, 0.08, 0.08);
    this.tone('sine', 2093, 0.7, 0.12, { when: 0.08 });
    this.tone('sine', 2637, 0.6, 0.08, { when: 0.08 });
    this.noise(0.15, 0.1, { freq: 5000, q: 2, when: 0.05 });
  }
  snap() {
    this.noise(0.08, 0.6, { type: 'highpass', freq: 2500, q: 0.7 });
    this.tone('triangle', 900, 0.4, 0.2, { f2: 120 });
  }
  reel(on, speed = 0.5) {
    this.reelOn = on;
    this.reelSpeed = speed;
  }
  stopReel() {
    this.reelOn = false;
    this.reelScream(false);
  }
  reelScream(on) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (on && !this.scream) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 1750;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2300;
      f.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.05);
      o.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      o.start();
      lfo.start();
      this.scream = { o, lfo, g };
    } else if (!on && this.scream) {
      const s = this.scream;
      s.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      s.o.stop(ctx.currentTime + 0.3);
      s.lfo.stop(ctx.currentTime + 0.3);
      this.scream = null;
    }
  }
  creak(amount) {
    this.creakAmt = amount;
  }

  // ----------------------------------------------------------- rifle & hunting
  gunshot(x, z) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = this.noiseSource(this.white, false);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(6000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 1.1, 0.4);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    g.connect(this.echo);
    s.start(t);
    s.stop(t + 0.5);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const og = ctx.createGain();
    this.env(og, t, 0.002, 0.9, 0.35);
    o.connect(og);
    og.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.45);
    void x;
    void z;
  }
  bolt() {
    this.noise(0.05, 0.25, { freq: 3000, q: 4, when: 0.05 });
    this.noise(0.05, 0.22, { freq: 2200, q: 4, when: 0.22 });
    this.noise(0.05, 0.25, { freq: 2600, q: 4, when: 0.42 });
  }
  reloadSound() {
    for (let i = 0; i < 4; i++) this.noise(0.04, 0.2, { freq: 2800 + i * 200, q: 5, when: 0.3 + i * 0.3 });
    this.noise(0.06, 0.25, { freq: 2000, q: 3, when: 1.6 });
  }
  dryFire() {
    this.noise(0.03, 0.25, { freq: 3500, q: 6 });
  }
  hit(x, z) {
    const s = this.spatial(x, z, 400);
    this.noise(0.15, 0.4 * Math.max(0.2, s.vol), { type: 'lowpass', freq: 600, pan: s.pan, when: Math.min(0.5, s.d / 340) });
  }
  spray() {
    this.noise(1.4, 0.45, { type: 'highpass', freq: 1800, q: 0.4, attack: 0.05 });
  }

  // ------------------------------------------------------------------ bears
  growl(x, z, intensity = 0.7, roar = false) {
    if (!this.ready) return;
    const sp = this.spatial(x, z, 160);
    if (sp.vol < 0.01) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = roar ? 1.6 : 1.0;
    const s = this.noiseSource(this.brown, false);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(roar ? 180 : 120, t);
    if (roar) f1.frequency.linearRampToValueAtTime(420, t + dur * 0.6);
    f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = roar ? 700 : 450;
    f2.gain.value = 10;
    const am = ctx.createOscillator();
    am.frequency.value = roar ? 28 : 18;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    am.connect(amg);
    amg.connect(g.gain);
    const g2 = ctx.createGain();
    this.env(g2, t, 0.15, intensity * sp.vol * (roar ? 3.2 : 2.2), dur);
    const p = ctx.createStereoPanner();
    p.pan.value = sp.pan;
    s.connect(f1);
    f1.connect(f2);
    f2.connect(g);
    g.connect(g2);
    g2.connect(p);
    p.connect(this.sfx);
    s.start(t);
    am.start(t);
    s.stop(t + dur + 0.2);
    am.stop(t + dur + 0.2);
    if (roar) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(160, t + dur * 0.5);
      o.frequency.linearRampToValueAtTime(80, t + dur);
      const of = ctx.createBiquadFilter();
      of.type = 'lowpass';
      of.frequency.value = 600;
      const og = ctx.createGain();
      this.env(og, t, 0.1, 0.25 * sp.vol, dur);
      o.connect(of);
      of.connect(og);
      og.connect(p);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
  huff(x, z) {
    const sp = this.spatial(x, z, 80);
    if (sp.vol < 0.01) return;
    this.noise(0.18, 0.5 * sp.vol, { freq: 350, q: 1.2, pan: sp.pan, buf: this.brown });
    this.noise(0.18, 0.4 * sp.vol, { freq: 300, q: 1.2, pan: sp.pan, buf: this.brown, when: 0.28 });
  }
  swipe() {
    this.noise(0.25, 0.6, { freq: 1500, f2: 300, q: 0.8 });
    this.tone('sine', 80, 0.3, 0.6, { f2: 40 });
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
    const sp = this.spatial(x, z, 300);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 5; i++) this.tone('sine', 2600 - i * 80, 0.09, 0.05 * sp.vol, { f2: 3200, pan: sp.pan, when: i * 0.11, dest: this.amb });
  }
  raven(x, z) {
    const sp = this.spatial(x, z, 250);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 2; i++) {
      const o = this.tone('sawtooth', 420, 0.22, 0.05 * sp.vol, { f2: 360, pan: sp.pan, when: i * 0.35, dest: this.amb });
      void o;
    }
  }
  gull(x, z) {
    const sp = this.spatial(x, z, 200);
    if (sp.vol < 0.02) return;
    this.tone('triangle', 1300, 0.28, 0.06 * sp.vol, { f2: 850, pan: sp.pan, dest: this.amb });
    this.tone('triangle', 1250, 0.2, 0.05 * sp.vol, { f2: 900, pan: sp.pan, when: 0.3, dest: this.amb });
  }
  loon(x, z) {
    if (!this.ready) return;
    const sp = this.spatial(x, z, 600);
    if (sp.vol < 0.02) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(560, t);
    o.frequency.linearRampToValueAtTime(880, t + 0.8);
    o.frequency.linearRampToValueAtTime(820, t + 1.6);
    o.frequency.linearRampToValueAtTime(700, t + 2.6);
    const v = ctx.createOscillator();
    v.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 12;
    v.connect(vg);
    vg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * sp.vol, t + 0.4);
    g.gain.linearRampToValueAtTime(0.07 * sp.vol, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const p = ctx.createStereoPanner();
    p.pan.value = sp.pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.amb);
    o.start(t);
    v.start(t);
    o.stop(t + 2.9);
    v.stop(t + 2.9);
  }
  wolf() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = Math.random() * 1.6 - 0.8;
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = k ? 'triangle' : 'sine';
      const b = 380 * (k ? 2 : 1);
      o.frequency.setValueAtTime(b, t);
      o.frequency.linearRampToValueAtTime(b * 1.75, t + 1.0);
      o.frequency.linearRampToValueAtTime(b * 1.6, t + 2.6);
      o.frequency.linearRampToValueAtTime(b * 1.1, t + 3.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(k ? 0.012 : 0.045, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g);
      g.connect(p);
      p.connect(this.amb);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 3.6);
    }
  }
  goose() {
    for (let i = 0; i < 3; i++) this.tone('square', 330 + Math.random() * 40, 0.12, 0.018, { f2: 300, when: i * 0.45 + Math.random() * 0.2, dest: this.amb, pan: Math.random() - 0.5 });
  }
  quack(x, z) {
    const sp = this.spatial(x, z, 120);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 3; i++) this.tone('sawtooth', 520, 0.11, 0.03 * sp.vol, { f2: 380, when: i * 0.18, pan: sp.pan, dest: this.amb });
  }
  flap(x, z) {
    const sp = this.spatial(x, z, 60);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 5; i++) this.noise(0.05, 0.1 * sp.vol, { freq: 800, q: 0.8, when: i * 0.08, pan: sp.pan });
  }
  whale(x, z) {
    const sp = this.spatial(x, z, 900);
    if (sp.vol < 0.02) return;
    this.noise(1.2, 0.25 * sp.vol, { freq: 600, q: 0.6, attack: 0.1, pan: sp.pan });
  }

  // Steller sea lions hauled out: deep, rolling barks.
  seaLion(x, z) {
    const sp = this.spatial(x, z, 280);
    if (sp.vol < 0.02) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 170 + Math.random() * 40;
      this.tone('sawtooth', f, 0.24, 0.045 * sp.vol, { f2: f * 0.62, pan: sp.pan, when: i * 0.34, dest: this.amb });
      this.noise(0.22, 0.03 * sp.vol, { type: 'bandpass', freq: 520, q: 1.4, pan: sp.pan, when: i * 0.34, dest: this.amb });
    }
  }
  // Sandhill cranes: a far-carrying rolling bugle.
  crane(x, z) {
    const sp = this.spatial(x, z, 520);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 7; i++) this.tone('square', 700 + (i % 2) * 70, 0.085, 0.022 * sp.vol, { f2: 610, pan: sp.pan, when: i * 0.095, dest: this.amb });
  }
  // Black-billed magpie: harsh chatter.
  magpie(x, z) {
    const sp = this.spatial(x, z, 170);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 6; i++) this.noise(0.055, 0.05 * sp.vol, { type: 'bandpass', freq: 2500 + Math.random() * 500, q: 3, pan: sp.pan, when: i * 0.085, dest: this.amb });
  }
  // Belted kingfisher: a dry, loud rattle.
  kingfisher(x, z) {
    const sp = this.spatial(x, z, 230);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 10; i++) this.tone('square', 2300 + Math.random() * 400, 0.028, 0.02 * sp.vol, { pan: sp.pan, when: i * 0.05, dest: this.amb });
  }
  // A beaver slapping its tail on the water before diving.
  tailSlap(x, z) {
    const sp = this.spatial(x, z, 320);
    if (sp.vol < 0.02) return;
    this.noise(0.14, 0.3 * sp.vol, { type: 'lowpass', freq: 1100, q: 0.7, pan: sp.pan });
    this.tone('sine', 120, 0.16, 0.12 * sp.vol, { f2: 55, pan: sp.pan });
  }
  // Arctic ground squirrel alarm call ("sik-sik").
  squeak(x, z) {
    const sp = this.spatial(x, z, 100);
    if (sp.vol < 0.02) return;
    for (let i = 0; i < 2; i++) this.tone('sine', 3300, 0.06, 0.045 * sp.vol, { f2: 2500, pan: sp.pan, when: i * 0.13, dest: this.amb });
  }
  // Orca blow: a short sharp exhale.
  orcaBlow(x, z) {
    const sp = this.spatial(x, z, 700);
    if (sp.vol < 0.02) return;
    this.noise(0.5, 0.2 * sp.vol, { freq: 900, q: 0.7, attack: 0.02, pan: sp.pan });
  }

  // -------------------------------------------------------------- footsteps
  step(surface, water, sprint) {
    if (!this.ready) return;
    const v = sprint ? 0.2 : 0.14;
    if (water && water.depth > 0.1) {
      this.noise(0.18, v * 1.4, { type: 'lowpass', freq: 2200, f2: 500, q: 0.8 });
      return;
    }
    switch (surface) {
      case -1: // wooden deck
        this.tone('triangle', 140 + Math.random() * 30, 0.08, v * 0.9, { f2: 90 });
        this.noise(0.04, v * 0.5, { freq: 900, q: 1 });
        break;
      case 4: // sand
      case 5: // gravel
      case 9: // road
        this.noise(0.09, v, { freq: 2600 + Math.random() * 800, q: 0.9 });
        break;
      case 3: // snow
        this.noise(0.12, v * 0.9, { freq: 1200, q: 0.7 });
        break;
      case 2: // rock
        this.noise(0.05, v * 0.9, { freq: 1800, q: 1.4 });
        break;
      default:
        this.noise(0.08, v * 0.7, { type: 'lowpass', freq: 1400, q: 0.5 });
    }
  }

  // ---------------------------------------------------------------- car
  // Glacier calving: a sharp crack rolling into thunder, heard with the delay
  // of the distance.
  iceCrack(x, z) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 1400);
    if (s.vol < 0.01) return;
    const when = Math.min(2.5, s.d / 343);
    const v = s.vol;
    this.noise(0.22, 0.9 * v, { type: 'highpass', freq: 1800, q: 0.7, pan: s.pan, when });
    this.noise(0.7, 0.7 * v, { freq: 700, f2: 160, q: 0.8, pan: s.pan, when: when + 0.04 });
    this.noise(3.0, 0.6 * v, { type: 'lowpass', freq: 340, f2: 60, q: 0.6, buf: this.brown, pan: s.pan, attack: 0.2, when: when + 0.1 });
  }

  // The slab hitting the lake: a deep boom, rumble and the crash of water.
  iceBoom(x, z, size = 1) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 1600);
    if (s.vol < 0.01) return;
    const when = Math.min(3, s.d / 343);
    const v = s.vol * Math.min(1.3, 0.6 + size * 0.5);
    this.tone('sine', 55, 1.8, 0.9 * v, { f2: 24, attack: 0.01, pan: s.pan, when });
    this.noise(3.8, 0.8 * v, { type: 'lowpass', freq: 520, f2: 70, q: 0.5, buf: this.brown, pan: s.pan, attack: 0.05, when });
    this.noise(1.8, 0.65 * v, { type: 'lowpass', freq: 4200, f2: 450, q: 0.7, pan: s.pan, attack: 0.02, when: when + 0.05 });
  }

  thud(v) {
    this.tone('sine', 70, 0.35, 0.6 * v, { f2: 35 });
    this.noise(0.2, 0.4 * v, { type: 'lowpass', freq: 900 });
  }
  horn() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // the classic "ah-ooga" klaxon
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(390, t + 0.35);
    o.frequency.setValueAtTime(390, t + 0.45);
    o.frequency.linearRampToValueAtTime(300, t + 0.75);
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 3);
    }
    ws.curve = curve;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.05);
    g.gain.setValueAtTime(0.28, t + 0.38);
    g.gain.linearRampToValueAtTime(0.12, t + 0.44);
    g.gain.linearRampToValueAtTime(0.3, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(ws);
    ws.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 0.9);
  }
  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lope = ctx.createOscillator();
    lope.frequency.value = 6;
    const lopeG = ctx.createGain();
    lopeG.gain.value = 0.35;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    f.Q.value = 3;
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i / 256) - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    ws.curve = curve;
    const am = ctx.createGain();
    am.gain.value = 0.65;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const rumble = this.noiseSource(this.brown);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 180;
    const rg = ctx.createGain();
    rg.gain.value = 0.2;
    o1.connect(f);
    o2.connect(f);
    f.connect(ws);
    ws.connect(am);
    lope.connect(lopeG);
    lopeG.connect(am.gain);
    am.connect(g);
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(g);
    g.connect(this.sfx);
    o1.start();
    o2.start();
    lope.start();
    rumble.start();
    this.engine = { o1, o2, lope, f, g, rg, rumble };
    this.tone('sawtooth', 60, 0.6, 0.12, { f2: 140 });
  }
  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0.0001, t, 0.2);
    for (const n of [e.o1, e.o2, e.lope, e.rumble]) n.stop(t + 1);
    this.engine = null;
  }
  updateEngine(rpm, throttle, dist, occupied) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const fire = rpm / 15; // V8 firing frequency
    e.o1.frequency.setTargetAtTime(fire, t, 0.04);
    e.o2.frequency.setTargetAtTime(fire * 0.5, t, 0.04);
    e.lope.frequency.setTargetAtTime(rpm / 130, t, 0.1);
    e.f.frequency.setTargetAtTime(220 + rpm * 0.18 + throttle * 700, t, 0.05);
    const near = Math.max(0, 1 - dist / 90);
    const vol = (occupied ? 0.16 + throttle * 0.14 : 0.09) * near;
    e.g.gain.setTargetAtTime(Math.max(0.0001, vol), t, 0.08);
    e.rg.gain.setTargetAtTime(0.25 + throttle * 0.3, t, 0.1);
  }

  // ------------------------------------------------------------- per frame
  update(dt, g) {
    if (!this.ready || !g.world) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cam = g.camera;
    const dir = cam.getWorldDirection(this._d || (this._d = cam.position.clone()));
    this.listener.x = cam.position.x;
    this.listener.y = cam.position.y;
    this.listener.z = cam.position.z;
    this.listener.heading = Math.atan2(dir.x, -dir.z);
    const W = g.world;
    const px = cam.position.x;
    const pz = cam.position.z;
    const inMenu = g.menuOpen || !g.started;
    const duck = inMenu ? 0.35 : 1;

    // river & falls proximity
    let riverV = 0;
    let fallsV = 0;
    if (W.inBounds(px, pz)) {
      const k = W.cellIndex(px, pz);
      const rd = W.riverD[k];
      if (rd < 150) {
        const s = W.riverS[k];
        const w = W.riverWidth(s);
        const grad = W.riverGradient(s);
        riverV = Math.max(0, 1 - Math.max(0, rd - w) / 120) * (0.35 + Math.min(1, grad * 20) * 0.65);
        if (W.fallsS > 0) {
          const fd = Math.abs(s - W.fallsS);
          fallsV = Math.max(0, 1 - Math.hypot(fd, Math.max(0, rd - w)) / 220);
        }
      }
    }
    const coast = W.inBounds(px, pz) ? W.coastD[W.cellIndex(px, pz)] : 0;
    const oceanV = Math.max(0, 1 - Math.max(0, coast) / 350);
    const altitude = cam.position.y;
    const windV = 0.12 + Math.min(0.5, Math.max(0, altitude - 60) / 400) + g.env.weather.rain * 0.2;
    const rainV = g.env.weather.rain;
    const set = (node, v, tc = 0.3) => node.g.gain.setTargetAtTime(v * duck, t, tc);
    set(this.river, riverV * 0.2);
    set(this.riverLow, riverV * 0.25);
    set(this.falls, fallsV * 0.5);
    this.ocean.g.gain.setTargetAtTime(oceanV * (0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.5))) * duck, t, 0.4);
    set(this.wind, windV * 0.35);
    this.wind.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.13) * 160 + Math.sin(t * 0.47) * 60, t, 0.5);
    set(this.rainN, rainV * 0.22);

    if (!inMenu) {
      // birds by day, calls by night
      this.nextBird -= dt;
      const night = g.env.night;
      if (this.nextBird <= 0) {
        this.nextBird = 2 + Math.random() * 6;
        if (night < 0.5 && Math.random() < 0.8) this.birdChirp();
      }
      this.nextCall -= dt;
      if (this.nextCall <= 0) {
        this.nextCall = 18 + Math.random() * 30;
        if (night > 0.6 && Math.random() < 0.5) this.wolf();
        else if (Math.random() < 0.3) this.goose();
      }
      // reel ratchet clicks
      if (this.reelOn) {
        this.reelT -= dt;
        if (this.reelT <= 0) {
          this.reelT = 0.045 - Math.min(0.02, (this.reelSpeed || 0) * 0.02);
          this.noise(0.012, 0.06, { freq: 4200, q: 6 });
        }
      }
      if (this.creakAmt > 0.05 && Math.random() < dt * 4) this.noise(0.25, 0.08 * this.creakAmt, { freq: 280, q: 5, buf: this.brown });
    }
    this.updateMusic(dt, g);
  }

  // ----------------------------------------------------------------- music
  updateMusic(dt, g) {
    const M = this.music;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const threat = g.bears && g.bears.threat && g.bears.threat.state === 'charge';
    M.tension += ((threat ? 1 : 0) - M.tension) * Math.min(1, dt * 2);
    if (now < M.next - 0.05) return;
    const night = g.env.night > 0.5;
    const bpm = threat ? 150 : night ? 64 : 76;
    const beat = 60 / bpm;
    if (M.next < now) M.next = now + 0.05;
    const t = M.next;
    M.next += beat / 2;
    if (threat) {
      // pounding drums and a low drone
      if (M.beat % 2 === 0) this.tone('sine', 72, 0.25, 0.5, { f2: 38, dest: this.mus, when: t - now });
      if (M.beat % 4 === 3) this.noise(0.12, 0.25, { type: 'lowpass', freq: 900, dest: this.mus, when: t - now });
      if (M.beat % 8 === 0) this.pluck(40, t, 0.6);
      M.beat++;
      return;
    }
    // rests between songs
    if (M.rest > 0) {
      M.rest -= beat / 2;
      return;
    }
    const prog = night ? [[52, 55, 59], [48, 52, 55], [43, 47, 50], [50, 54, 57]] : [[43, 47, 50], [50, 54, 57], [52, 55, 59], [48, 52, 55]];
    const chord = prog[M.chord % prog.length];
    const step = M.beat % 8;
    const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
    const v = night ? 0.28 : 0.34;
    if (step === 0) this.pluck(chord[0] - 12, t, v * 1.1);
    this.pluck(chord[pattern[step]] + (step % 4 === 1 ? 12 : 0), t, v * (step % 2 ? 0.7 : 0.9), step % 2 ? 0.25 : -0.25);
    // melody on the pentatonic scale over the top
    if (Math.random() < (night ? 0.18 : 0.3) && step % 2 === 0) {
      const root = 55 + 12;
      const deg = PENTA[Math.floor(Math.random() * PENTA.length)];
      this.pluck(root + deg + (Math.random() < 0.3 ? 12 : 0), t + beat * 0.25, v * 0.7, 0.1);
    }
    M.beat++;
    if (M.beat % 8 === 0) {
      M.chord++;
      M.bar++;
      if (M.bar % 16 === 0) M.rest = 24 + Math.random() * 30; // silence between songs
    }
  }
}
