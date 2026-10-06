// The music: songs for the hours and the weather, played by a little band
// made of the library's instruments (kit.js): a steel-string guitar picked
// and strummed, a bass, a felt piano, a glockenspiel, brushes and drums,
// with a whistle playing the tunes and a soft pad under the slow ones (those
// two played live, oscillators shaped as the instruments are). A song plays
// through, then the music rests a while and the place is heard on its own.
// When a fish is on, a driving fight theme takes over, fuller the harder
// the fish pulls; a bear coming brings timpani, toms and a racing
// heartbeat; and short stingers mark the moments: a catch, a trophy, a
// legend, a new species, the one that got away.
//
// Songs are written as music is: chords as Roman numerals in the song's key
// (I major, vi minor, "I.V" two to a bar), tunes as scale degrees with
// their lengths in eighth notes ("5:3 3:1" a dotted quarter and an eighth),
// and an arrangement saying who plays what in each section.

// How loud each instrument's notes are at full velocity (see LEVEL in
// audio.js): the drums' quiet ones (brushes, hat, shaker) under the rest.
export const INSTRUMENTS = {
  guitar: -21,
  bass: -21,
  glock: -25,
  piano: -21,
  kick: -22,
  brush: -29,
  snare: -24,
  hat: -32,
  shaker: -31,
  tom: -23,
  rim: -28,
  swell: -27,
  crash: -26,
  timp: -21,
  heart: -23,
};

// The stingers that are cues rather than music (see Music.sting).
const CUES = new Set(['chime', 'perfect', 'streak']);

// Each stinger's own gain, so each sits at its loudness against the rest
// (measured with tools/sound-sheet.mjs: a legend's fanfare loudest, a
// perfect hook set's ping the quietest).
const STINGS = { chime: 1.2, perfect: 1.25, streak: 1, catch: 0.7, big: 0.73, legend: 0.92, new: 0.87, lost: 0.87, goal: 0.74, frenzy: 0.92, fishOn: 0.8 };

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const pc = (m) => ((m % 12) + 12) % 12;

// A chord from a Roman numeral in the song's key (tonic: a MIDI note):
// major in capitals, minor in small letters, o diminished, 7 or maj7 a
// seventh, sus a suspended fourth, /n a bass note on the scale's nth.
function chordOf(tok, tonic, mode) {
  const m = /^([b#]?)([ivIV]+)(o)?(maj7|7|sus)?(?:\/([b#]?)(\d))?$/.exec(tok);
  if (!m) throw new Error('music: bad chord ' + tok);
  const [, acc, rn, dim, ext, bacc, bdeg] = m;
  const sc = SCALES[mode];
  const sh = (a) => (a === 'b' ? -1 : a === '#' ? 1 : 0);
  const root = tonic + sc[ROMAN[rn.toLowerCase()] - 1] + sh(acc);
  const minor = rn === rn.toLowerCase();
  let tones = dim ? [0, 3, 6] : minor ? [0, 3, 7] : [0, 4, 7];
  if (ext === 'sus') tones = [0, 5, 7];
  if (ext === '7') tones = [...tones, 10];
  if (ext === 'maj7') tones = [...tones, 11];
  const bass = bdeg ? tonic + sc[+bdeg - 1] + sh(bacc) : root;
  return { root, tones, bass, name: tok };
}

// Every bar's chords, one for each eighth: "I IV I.V" is three bars, the
// last I for two beats then V for two.
function barsOf(str, tonic, mode) {
  return str
    .trim()
    .split(/\s+/)
    .map((b) => {
      const halves = b.split('.').map((t) => chordOf(t, tonic, mode));
      const each = [];
      for (let e = 0; e < 8; e++) each.push(halves[Math.min(halves.length - 1, Math.floor((e * halves.length) / 8))]);
      return each;
    });
}

// A tune: notes as scale degrees with lengths in eighths ("5:3 3:1 6:2";
// 1' an octave up, 7, an octave down, b3 flat, #4 sharp, r a rest), | between
// bars (only for reading). Returns its notes as [start, length, MIDI note]
// in eighths, and its length.
function tuneOf(str, tonic, mode) {
  const notes = [];
  let t = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, d] = tok.split(':');
    const len = Number(d || 1);
    if (n !== 'r') {
      const m = /^([b#]?)(\d)([',]*)$/.exec(n);
      if (!m) throw new Error('music: bad note ' + tok);
      let midi = tonic + SCALES[mode][Number(m[2]) - 1] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
      for (const c of m[3]) midi += c === "'" ? 12 : -12;
      notes.push([t, len, midi]);
    }
    t += len;
  }
  return { notes, len: t };
}

// The notes of a chord between lo and hi, lowest first; with bass, its
// bass note first (the lowest one at or above lo).
function voicing(ch, lo, hi, bass = true) {
  const out = [];
  if (bass) {
    let b = ch.bass;
    while (b < lo) b += 12;
    while (b >= lo + 12) b -= 12;
    out.push(b);
  }
  const start = bass ? out[0] + 1 : lo;
  for (let m = start; m <= hi; m++) if (ch.tones.some((t) => pc(m - ch.root - t) === 0)) out.push(m);
  return out;
}
// the chord's root (or its slash bass) in [lo, lo + 12)
const low = (m, lo) => {
  while (m < lo) m += 12;
  while (m >= lo + 12) m -= 12;
  return m;
};

// ------------------------------------------------------------ the songs
// Each: its tempo, key (the tonic as a MIDI note, for the chords), mode,
// swing (how late the off-beat eighths fall, as a share of an eighth), the
// tune's tonic (the register it is played in), how much of it goes to the
// hall, its chords and tunes by section, and its form: the sections in
// order with who plays what (see PARTS). gain lifts a quiet song (a piano
// alone) to sit as loud as the others.
const SONGS = {
  // Hotrod Landing: the day's theme. A folk tune over a picked guitar.
  landing: {
    bpm: 92,
    key: 55,
    mode: 'major',
    swing: 0.12,
    tonic: 67,
    wet: 0.22,
    chords: {
      intro: 'I IV I V',
      A: 'I IV I V vi IV I.V I',
      B: 'IV I ii V IV I vi.V I',
      end: 'I IV V I',
    },
    tunes: {
      A: '5:3 3:1 5:2 6:2 | 1\':4 6:2 5:2 | 3:2 5:1 3:1 2:2 1:2 | 2:6 r:2 | 3:3 1:1 3:2 5:2 | 6:4 5:2 4:2 | 3:2 2:2 1:2 2:2 | 1:6 r:2',
      B: '6:2 1\':2 6:2 5:2 | 5:4 3:2 5:2 | 4:2 6:2 2:2 4:2 | 5:6 r:2 | 6:2 1\':1 6:1 5:2 4:2 | 3:2 5:2 1\':4 | 7:2 6:2 5:2 2:2 | 1\':6 r:2',
    },
    form: [
      { sec: 'intro', parts: { gtr: 'travis' } },
      { sec: 'A', parts: { gtr: 'travis', bass: 'root5', drum: 'brush', lead: 'whistle' } },
      { sec: 'A', parts: { gtr: 'travis', bass: 'root5', drum: 'brush', lead: 'glock', keys: 'piano' } },
      { sec: 'B', parts: { gtr: 'strum', bass: 'walk', drum: 'brush2', lead: 'whistle', keys: 'piano' } },
      { sec: 'A', parts: { gtr: 'travis', bass: 'root5', drum: 'brush2', lead: 'whistle', bell: 'answer' } },
      { sec: 'end', parts: { gtr: 'travis', bass: 'root5', drum: 'soft' }, last: true },
    ],
  },
  // Kenai Trail: an upbeat strum for the road and the busy middle of the day.
  trail: {
    bpm: 104,
    key: 50,
    mode: 'major',
    swing: 0.16,
    tonic: 74,
    wet: 0.18,
    chords: {
      intro: 'I IV I V',
      A: 'I I IV I V IV I.V I',
      B: 'IV I ii V IV I ii.V I',
      end: 'IV V I I',
    },
    tunes: {
      A: '1:1 2:1 3:2 5:2 3:2 | 2:2 1:2 6,:2 1:2 | 4:2 3:1 2:1 4:2 6:2 | 5:6 r:2 | 5:2 6:1 5:1 3:2 2:2 | 4:2 6:2 5:2 4:2 | 3:2 1:2 2:2 7,:2 | 1:6 r:2',
      B: '6:3 5:1 4:2 6:2 | 5:4 3:2 1:2 | 2:3 3:1 4:2 2:2 | 3:4 2:4 | 6:3 1\':1 6:2 5:2 | 5:2 3:2 5:2 1\':2 | 2\':2 1\':2 7:2 6:2 | 1\':6 r:2',
    },
    form: [
      { sec: 'intro', parts: { gtr: 'strum', drum: 'soft' } },
      { sec: 'A', parts: { gtr: 'strum', bass: 'root5', drum: 'brush2', lead: 'whistle' } },
      { sec: 'B', parts: { gtr: 'strum', bass: 'walk', drum: 'brush2', lead: 'glock', keys: 'piano' } },
      { sec: 'A', parts: { gtr: 'travis', bass: 'root5', drum: 'brush2', lead: 'whistle', bell: 'answer' } },
      { sec: 'end', parts: { gtr: 'strum', bass: 'root5', drum: 'brush' }, last: true },
    ],
  },
  // Morning on the River: piano and glockenspiel, waking up.
  morning: {
    bpm: 76,
    gain: 1.55,
    key: 50,
    mode: 'major',
    swing: 0,
    tonic: 74,
    wet: 0.3,
    chords: {
      intro: 'I V vi IV',
      A: 'I V vi IV I V IV V',
      end: 'I V IV I',
    },
    tunes: {
      A: '3:2 2:1 1:1 3:4 | 2:2 1:1 7,:1 2:4 | 1:2 7,:1 6,:1 1:2 3:2 | 2:6 r:2 | 5:2 3:1 5:1 6:4 | 5:2 3:2 2:4 | 1:2 2:2 3:2 5:2 | 2:8',
    },
    form: [
      { sec: 'intro', parts: { keys: 'morning' } },
      { sec: 'A', parts: { keys: 'morning', lead: 'glock', drum: 'soft' } },
      { sec: 'A', parts: { keys: 'morning', gtr: 'arp', bass: 'pedal', lead: 'whistle', drum: 'soft' } },
      { sec: 'end', parts: { keys: 'morning', bass: 'pedal' }, last: true },
    ],
  },
  // Evening Light: picked guitar, a pad and the whistle, the sun going down.
  evening: {
    bpm: 84,
    key: 55,
    mode: 'major',
    swing: 0.08,
    tonic: 67,
    wet: 0.3,
    chords: {
      intro: 'vi IV I V',
      A: 'vi IV I V vi IV ii III',
      end: 'vi IV V vi',
    },
    tunes: {
      A: '6:3 5:1 6:2 7:2 | 1\':4 7:2 6:2 | 5:3 3:1 5:2 1\':2 | 2\':6 r:2 | 3\':2 2\':2 1\':2 7:2 | 6:4 5:2 3:2 | 1\':2 6:2 4:2 6:2 | #5:4 7:4',
    },
    form: [
      { sec: 'intro', parts: { gtr: 'arp', keys: 'pad' } },
      { sec: 'A', parts: { gtr: 'arp', keys: 'pad', lead: 'whistle' } },
      { sec: 'A', parts: { gtr: 'arp', keys: 'pad', bass: 'root5', drum: 'brush', lead: 'guitar' } },
      { sec: 'end', parts: { gtr: 'arp', keys: 'pad' }, last: true },
    ],
  },
  // Northern Lights: the felt piano alone, late at night.
  night: {
    bpm: 64,
    gain: 1.4,
    key: 60,
    mode: 'major',
    swing: 0,
    tonic: 72,
    wet: 0.42,
    chords: {
      intro: 'vi vi/5 IV III',
      A: 'vi vi/5 IV III ii vi III vi',
      end: 'IV III vi vi',
    },
    tunes: {
      A: '1\':4 7:2 6:2 | 7:4 6:2 5:2 | 6:4 5:2 4:2 | #5:6 r:2 | 4:4 3:2 2:2 | 3:4 1:2 6,:2 | 7,:4 #5,:2 7,:2 | 6,:8',
    },
    form: [
      { sec: 'intro', parts: { keys: 'nocturne' } },
      { sec: 'A', parts: { keys: 'nocturne', lead: 'piano' } },
      { sec: 'A', parts: { keys: 'nocturne', lead: 'piano', pad: 'pad' } },
      { sec: 'end', parts: { keys: 'nocturne', pad: 'pad' }, last: true },
    ],
  },
  // Cabin Window: rain on the roof, a slow piano and the guitar.
  rain: {
    bpm: 70,
    key: 50,
    mode: 'major',
    swing: 0,
    tonic: 74,
    wet: 0.36,
    chords: {
      intro: 'I iii IV iv',
      A: 'I iii IV iv I vi ii V',
      end: 'IV iv I I',
    },
    tunes: {
      A: '3:4 2:2 1:2 | 3:4 5:4 | 6:4 5:2 4:2 | b6:4 5:4 | 5:2 3:2 1:4 | 2:2 3:2 6,:4 | 2:4 3:2 4:2 | 3:4 2:4',
    },
    form: [
      { sec: 'intro', parts: { keys: 'piano', gtr: 'arp' } },
      { sec: 'A', parts: { keys: 'piano', gtr: 'arp', lead: 'piano', drum: 'soft' } },
      { sec: 'A', parts: { keys: 'pad', gtr: 'arp', bass: 'pedal', lead: 'whistle', drum: 'soft' } },
      { sec: 'end', parts: { keys: 'piano', gtr: 'arp' }, last: true },
    ],
  },
  // Fish On!: the fight. It loops while the fish is on; how much of the
  // band plays follows how hard the fish is pulling (see Music.level).
  fight: {
    bpm: 132,
    key: 64,
    mode: 'minor',
    swing: 0,
    tonic: 76,
    wet: 0.12,
    loop: true,
    chords: { A: 'i i VI VII i i VI V' },
    tunes: { A: '1:1 3:1 4:1 5:1 7:2 5:1 4:1 | 5:4 r:4 | 3:1 4:1 5:1 6:1 1\':2 6:1 5:1 | 4:4 2:4 | 1:1 3:1 4:1 5:1 7:2 1\':2 | 7:2 5:2 4:2 3:2 | 3:2 1:2 6,:2 1:2 | #7,:4 2:4' },
    form: [{ sec: 'A', parts: { gtr: 'chop', bass: 'drive', drum: 'rock', lead: 'riff' } }],
  },
  // A bear: low, close and getting closer.
  bear: {
    bpm: 120,
    key: 50,
    mode: 'minor',
    swing: 0,
    tonic: 62,
    wet: 0.2,
    loop: true,
    chords: { A: 'i bII i bII' },
    tunes: {},
    form: [{ sec: 'A', parts: { bass: 'pulse', drum: 'danger', keys: 'cluster' } }],
  },
};

// Which songs for which time of day and weather.
const MOODS = {
  day: ['landing', 'trail'],
  drive: ['trail', 'landing'],
  morning: ['morning', 'landing'],
  evening: ['evening'],
  night: ['night'],
  rain: ['rain'],
};

// Each song worked out once: its bars and tunes as notes.
const BUILT = {};
function built(name) {
  if (BUILT[name]) return BUILT[name];
  const S = SONGS[name];
  const secs = {};
  for (const [sec, str] of Object.entries(S.chords)) {
    const bars = barsOf(str, S.key, S.mode);
    const tune = S.tunes[sec] ? tuneOf(S.tunes[sec], S.tonic, S.mode) : null;
    if (tune && tune.len !== bars.length * 8) throw new Error(`music: ${name} ${sec} tune is ${tune.len} eighths, not ${bars.length * 8}`);
    secs[sec] = { bars, tune };
  }
  BUILT[name] = { ...S, name, secs };
  return BUILT[name];
}

// ------------------------------------------------------------ the parts
// Each part plays its instrument for one eighth note of a bar: M the music,
// c the chord now, e the eighth (0 to 7), t its time, s the song playing.
const PARTS = {
  gtr: {
    // Travis picking: the thumb alternating the bass on the beats, the
    // fingers between, a pinch on the one.
    travis(M, c, e, t, s) {
      const b1 = low(c.bass, 40);
      const b2 = low(c.root + 7, 43);
      const top = voicing(c, 55, 69, false);
      const T = (i) => top[clamp(i, 0, top.length - 1)];
      const thumb = [b1, 0, b2, 0, b1, 0, b2, 0][e];
      if (thumb) M.note('guitar', thumb, { at: t, vel: 0.62, pan: -0.25, dur: 1.1 });
      const finger = [top.length - 1, 1, -1, 2, -1, top.length - 1, -1, 1][e];
      if (finger >= 0) M.note('guitar', T(finger), { at: t + 0.004, vel: e === 0 ? 0.5 : 0.42, pan: -0.2, dur: 0.9 });
    },
    // A strum: down, down-up, up, down-up.
    strum(M, c, e, t, s) {
      const dir = ['D', 0, 'D', 'U', 0, 'U', 'D', 'U'][e];
      if (!dir) return;
      const notes = voicing(c, 40, 67);
      const list = dir === 'D' ? notes : notes.slice(-4).reverse();
      const vel = dir === 'D' ? (e === 0 ? 0.5 : 0.42) : 0.3;
      list.forEach((m, i) => M.note('guitar', m, { at: t + i * (dir === 'D' ? 0.014 : 0.01), vel: vel * (0.9 + 0.2 * Math.random()), pan: -0.28 + i * 0.04, dur: 0.75 }));
    },
    // Broken chords, up and down.
    arp(M, c, e, t, s) {
      const notes = voicing(c, 43, 74);
      const i = [0, 1, 2, 3, 4, 3, 2, 1][e];
      M.note('guitar', notes[i % notes.length], { at: t, vel: e === 0 ? 0.5 : 0.36, pan: -0.25, dur: 1.2 });
    },
    // The fight: power chords stabbed on the off-beats, damped short.
    chop(M, c, e, t, s) {
      if (M.level < 0.3) return;
      if (e % 2 === 0 && e !== 0) return;
      const r = low(c.root, 40);
      for (const [i, m] of [r, r + 7, r + 12].entries()) M.note('guitar', m, { at: t + i * 0.006, vel: e === 0 ? 0.55 : 0.42, pan: -0.3, dur: 0.16 });
    },
  },
  bass: {
    root5(M, c, e, t, s, nx) {
      if (e === 0) M.note('bass', low(c.bass, 31), { at: t, vel: 0.75, dur: 1.2 });
      else if (e === 4) M.note('bass', low(c.root + 7, 31), { at: t, vel: 0.6, dur: 1.0 });
      else if (e === 7 && nx && nx.root !== c.root && Math.random() < 0.45) M.note('bass', low(nx.bass, 31) - 1 + (Math.random() < 0.5 ? 0 : 3), { at: t, vel: 0.5, dur: 0.3 });
    },
    walk(M, c, e, t, s, nx) {
      if (e % 2) return;
      const r = low(c.bass, 31);
      const third = c.tones[1];
      const m = [r, r + third, r + 7, nx ? low(nx.bass, 31) + (nx.bass > c.bass ? -1 : 1) : r + 5][e / 2];
      M.note('bass', m, { at: t, vel: e === 0 ? 0.72 : 0.58, dur: 0.55 });
    },
    drive(M, c, e, t, s) {
      const r = low(c.root, 28);
      M.note('bass', e === 7 && M.level > 0.5 ? r + 12 : r, { at: t, vel: e % 2 ? 0.55 : 0.72, dur: 0.22 });
    },
    pulse(M, c, e, t, s) {
      const r = low(c.root, 26);
      M.note('bass', e % 2 ? r + 1 : r, { at: t, vel: (e % 2 ? 0.45 : 0.6) * (0.6 + 0.4 * M.danger), dur: 0.24 });
    },
    pedal(M, c, e, t, s) {
      if (e === 0 || (e === 4 && c !== s.chordAt0)) M.note('bass', low(c.bass, 31), { at: t, vel: 0.55, dur: s.barLen * (e === 0 ? 1 : 0.5) });
    },
  },
  drum: {
    brush(M, c, e, t, s) {
      if (e === 2 || e === 6) M.drum('brush', t, 0.7);
      if (e === 0) M.drum('kick', t, 0.5);
      if (e === 5 && Math.random() < 0.5) M.drum('kick', t, 0.3);
      M.drum('shaker', t, e % 2 ? 0.34 : 0.2, 0.4);
    },
    brush2(M, c, e, t, s) {
      if (e === 2 || e === 6) M.drum('brush', t, 0.75);
      if (e === 0) M.drum('kick', t, 0.6);
      if (e === 3) M.drum('kick', t, 0.35);
      if (e === 4) M.drum('kick', t, 0.45);
      M.drum('shaker', t, e % 2 ? 0.38 : 0.26, 0.4);
      if (e === 7 && s.bar % 2 === 1) M.drum('rim', t, 0.35, 0.1);
    },
    soft(M, c, e, t, s) {
      if (e % 2) M.drum('shaker', t, 0.24, 0.4);
    },
    // The fight: the hat always; kick and snare once it pulls; crashes and
    // tom fills when it fights hard.
    rock(M, c, e, t, s) {
      const L = M.level;
      M.drum('hat', t, e % 2 ? 0.32 : 0.5, 0.35);
      if (e === 0 || e === 4) M.drum('kick', t, 0.75);
      if (L > 0.6 && e === 5) M.drum('kick', t, 0.5);
      if (L > 0.3 && (e === 2 || e === 6)) M.drum('snare', t, 0.7, 0.1);
      if (L > 0.6 && e === 0 && s.bar % 4 === 0) M.drum('crash', t, 0.6, 0.2);
      if (L > 0.6 && s.bar % 4 === 3 && e >= 6) {
        const h = s.eighth / 2;
        M.drum('tom', t, 0.6, 0.3, 1);
        M.drum('tom', t + h, 0.5, 0.3, e === 6 ? 1 : 0);
      }
    },
    // The bear: timpani, a tom, a heart racing, a cymbal swelling.
    danger(M, c, e, t, s) {
      const D = M.danger;
      if (e === 0) M.drum('timp', t, 0.6 + 0.35 * D);
      if (e === 3 && D > 0.6) M.drum('timp', t, 0.4);
      if (e === 4) M.drum('tom', t, 0.45 + 0.2 * D, -0.2, 0);
      if (e === 0 || (D > 0.6 && e === 4)) M.drum('heart', t, 0.8);
      if (e === 1 && s.bar % 2 === 1) M.drum('swell', t, 0.5 + 0.3 * D, 0.15);
    },
  },
  keys: {
    // block chords, soft, on the one and the three
    piano(M, c, e, t, s) {
      if (e !== 0 && e !== 4) return;
      for (const [i, m] of voicing(c, 50, 70, false).entries()) M.note('piano', m, { at: t + i * 0.008, vel: e === 0 ? 0.32 : 0.24, dur: 1.6 });
    },
    // the left hand rolling under the night's tune: 1, 5, 10, 5
    nocturne(M, c, e, t, s) {
      const r = low(c.bass, 48);
      const third = c.tones[1];
      const m = [r, r + 7, r + 12 + third, r + 7 + 12, r + 12, r + 7, r + 12 + third, r + 7][e];
      M.note('piano', m, { at: t, vel: e === 0 ? 0.42 : 0.3, dur: 1.8, pan: -0.1 });
    },
    // the morning's broken chords, rising and falling
    morning(M, c, e, t, s) {
      const notes = voicing(c, 50, 79);
      const i = [0, 2, 1, 3, 2, 4, 3, 5][e];
      M.note('piano', notes[i % notes.length], { at: t, vel: e === 0 ? 0.4 : 0.3, dur: 1.5, pan: 0.05 });
    },
    // a slow pad under the chords
    pad(M, c, e, t, s) {
      if (e === 0 || (e === 4 && c !== s.chordAt0)) M.pad(voicing(c, 55, 71, false), t, s.barLen * (e === 0 && c === s.chordAt4 ? 1 : 0.5));
    },
    // the bear: a low cluster on the piano, now and then
    cluster(M, c, e, t, s) {
      if (e === 0 && s.bar % 2 === 0) for (const m of [low(c.root, 48), low(c.root, 48) + 1]) M.note('piano', m, { at: t, vel: 0.45 * M.danger, dur: 2 });
    },
  },
  pad: {
    pad(M, c, e, t, s) {
      PARTS.keys.pad(M, c, e, t, s);
    },
  },
  bell: {
    // the glockenspiel answering the tune at the end of every other bar
    answer(M, c, e, t, s) {
      if (s.bar % 2 !== 1 || e < 6) return;
      const top = voicing(c, 79, 93, false);
      M.note('glock', top[e === 6 ? top.length - 1 : Math.max(0, top.length - 2)], { at: t, vel: 0.32, pan: 0.35 });
    },
  },
};

// ------------------------------------------------------------ the music
export class Music {
  constructor(A) {
    this.A = A;
    this.ctx = null;
    this.song = null;
    this.layer = null;
    this.rest = 4;
    this.level = 0;
    this.danger = 0;
    this.mode = 'songs';
    this.count = {};
  }

  start(ctx) {
    this.ctx = ctx;
    const A = this.A;
    // the songs on a gain of their own and the fight or the bear each on
    // its own (see begin), all to the music's bus, the dry sound and some
    // to the hall
    this.out = ctx.createGain();
    this.out.connect(A.mus);
    this.songOut = ctx.createGain();
    this.songOut.connect(this.out);
    this.hall = ctx.createConvolver();
    this.hallSend = ctx.createGain();
    this.hallSend.gain.value = 0.22;
    this.out.connect(this.hallSend);
    this.hallSend.connect(this.hall);
    this.hall.connect(A.mus);
    // the whistle's tone: a near-pure flute with a breath of its octave
    this.waves = {
      whistle: ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.09, 0.035, 0.012])),
      pad: ctx.createPeriodicWave(new Float32Array(9), new Float32Array([0, 1, 0.42, 0.24, 0.14, 0.08, 0.05, 0.03, 0.02])),
    };
  }

  setHall(buf) {
    if (this.hall) this.hall.buffer = buf;
  }

  // Start the music over, as at the start of a game.
  reset() {
    this.stopSong(0.05);
    this.stopLayer(0.05);
    this.rest = 4;
    this.mode = 'songs';
    this.count = {};
  }

  // ---------------------------------------------------------- playing notes
  // A note on one of the library's instruments: the take nearest the note,
  // shifted to it. dest: the stingers' bus, or the song's (or the layer's)
  // gain.
  note(inst, midi, { at, vel = 0.5, pan = 0, dur = 0, dest = null } = {}) {
    const A = this.A;
    const k = A.kit[inst];
    if (!k) return;
    const i = A.takeOf(k, -1, midi);
    const rate = Math.pow(2, (midi - k.keys[i]) / 12);
    A.play(inst, { take: i, rate, gain: vel * (0.92 + Math.random() * 0.16), pan, at: at + rand(-0.004, 0.004), dest: dest || this.dest, dur });
  }

  drum(name, at, vel, pan = 0, take = -1) {
    this.A.play(name, { take, gain: vel * (0.9 + Math.random() * 0.2), pan, at: at + rand(-0.003, 0.003), dest: this.dest, rate: 0.98 + Math.random() * 0.04 });
  }

  // The whistle: a flute-like tone, its breath chiffing at the start of
  // each note, a vibrato that comes in as a long note is held.
  whistle(midi, at, dur, vel = 0.5, dest = null) {
    const ctx = this.ctx;
    const f = hz(midi);
    const o = ctx.createOscillator();
    o.setPeriodicWave(this.waves.whistle);
    o.frequency.setValueAtTime(f * 0.985, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.035);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.3;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, at);
    vg.gain.linearRampToValueAtTime(0, at + Math.min(0.25, dur * 0.5));
    vg.gain.linearRampToValueAtTime(f * 0.006, at + Math.min(0.6, dur));
    vib.connect(vg);
    vg.connect(o.frequency);
    const g = ctx.createGain();
    const peak = 0.075 * vel;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.03);
    g.gain.linearRampToValueAtTime(peak * 0.85, at + 0.12);
    g.gain.setValueAtTime(peak * 0.85, at + Math.max(0.12, dur - 0.06));
    g.gain.linearRampToValueAtTime(0, at + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = 0.15;
    o.connect(g);
    g.connect(p);
    p.connect(dest || this.dest);
    // the breath: a puff at the start, a little all through (looped, so a
    // long note keeps it to the end)
    const n = this.A.noiseSource(this.A.white, true);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = f * 2;
    nf.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, at);
    ng.gain.linearRampToValueAtTime(peak * 0.5, at + 0.01);
    ng.gain.linearRampToValueAtTime(peak * 0.06, at + 0.07);
    ng.gain.setValueAtTime(peak * 0.06, at + Math.max(0.07, dur - 0.05));
    ng.gain.linearRampToValueAtTime(0, at + dur);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(p);
    const end = at + dur + 0.05;
    o.start(at);
    vib.start(at);
    n.start(at, Math.random() * 1.5);
    o.stop(end);
    vib.stop(end);
    n.stop(end);
  }

  // A soft pad: each note two voices a little apart, through a lowpass,
  // swelling in and fading out.
  pad(notes, at, dur) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const v = 0.022;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + Math.min(0.7, dur * 0.4));
    g.gain.setValueAtTime(v, at + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, at + dur + 0.6);
    lp.connect(g);
    g.connect(this.dest);
    for (const m of notes) {
      for (const [det, pan] of [
        [-6, -0.45],
        [6, 0.45],
      ]) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.waves.pad);
        o.frequency.value = hz(m);
        o.detune.value = det;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(p);
        p.connect(lp);
        o.start(at);
        o.stop(at + dur + 0.7);
      }
    }
  }

  // ------------------------------------------------------------ the songs
  // A song begun at time t (on the songs' gain, or as the fight's or the
  // bear's layer).
  begin(name, t, layer = false) {
    const S = built(name);
    const eighth = 30 / S.bpm;
    this.count[name] = (this.count[name] || 0) + 1;
    // a layer gets a gain of its own, so the one it takes over from fades
    // out on its own under it
    let out = this.songOut;
    if (layer) {
      out = this.ctx.createGain();
      out.connect(this.out);
    }
    const s = { S, name, out, si: 0, bar: 0, e: 0, t, eighth, barLen: eighth * 8, chordAt0: null, chordAt4: null };
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(layer ? 1 : (this.songGain || 1) * (S.gain || 1), t);
    this.hallSend.gain.setTargetAtTime(S.wet, t, 0.5);
    if (layer) this.layer = s;
    else this.song = s;
    return s;
  }

  stopSong(fade = 0.6) {
    if (!this.song || !this.ctx) {
      this.song = null;
      return;
    }
    const t = this.ctx.currentTime;
    const g = this.songOut.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    this.song = null;
  }

  stopLayer(fade = 0.4) {
    const L = this.layer;
    this.layer = null;
    if (!L || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = L.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    // let it go once its notes have rung out
    this.A.afterSound((fade + 4) * 1000, () => L.out.disconnect());
  }

  // The song for now: by the hour and the weather (and the road), not the
  // one just played if there is another.
  choose(g) {
    const env = g.env;
    const h = env.time;
    let mood = 'day';
    if (env.weather.rain > 0.45) mood = 'rain';
    else if (h >= 22 || h < 4.5) mood = 'night';
    else if (h < 9) mood = 'morning';
    else if (h >= 18.5) mood = 'evening';
    else if (g.player?.mode === 'drive' || g.player?.mode === 'boat') mood = 'drive';
    const list = MOODS[mood];
    let pick = list[0];
    let best = Infinity;
    for (const n of list) {
      const c = (this.count[n] || 0) + (n === this.lastSong ? 10 : 0);
      if (c < best) {
        best = c;
        pick = n;
      }
    }
    this.lastSong = pick;
    return pick;
  }

  // Play the eighth note s is at, and move it on. Returns false when the
  // song has ended.
  step(s) {
    const S = s.S;
    const F = S.form[s.si];
    const sec = S.secs[F.sec];
    const chords = sec.bars[s.bar];
    const c = chords[s.e];
    s.chordAt0 = chords[0];
    s.chordAt4 = chords[4];
    // the next bar's first chord (for a bass walking to it)
    const nextSec = S.form[s.si + 1] || (S.loop ? S.form[0] : null);
    const nxBar = s.bar + 1 < sec.bars.length ? sec.bars[s.bar + 1] : nextSec ? S.secs[nextSec.sec].bars[0] : null;
    const nx = nxBar ? nxBar[0] : null;
    // swing: the off-beat eighths a little late
    const t = s.t + (s.e % 2 ? S.swing * s.eighth : 0);
    this.dest = s.out;
    for (const [part, style] of Object.entries(F.parts)) {
      if (part !== 'lead') PARTS[part]?.[style]?.(this, c, s.e, t, s, nx);
    }
    // the tune
    if (F.parts.lead && sec.tune) {
      const at8 = s.bar * 8 + s.e;
      for (const [start, len, midi] of sec.tune.notes) {
        if (start !== at8) continue;
        this.lead(F.parts.lead, midi, t, len * s.eighth);
      }
    }
    // on
    s.e++;
    s.t += s.eighth;
    if (s.e === 8) {
      s.e = 0;
      s.bar++;
      if (s.bar >= sec.bars.length) {
        s.bar = 0;
        s.si++;
        if (s.si >= S.form.length) {
          if (S.loop) s.si = 0;
          else {
            // the last chord, held
            this.finale(S, sec.bars[sec.bars.length - 1][7], s.t);
            return false;
          }
        }
      }
    }
    return true;
  }

  // The tune on its instrument.
  lead(kind, midi, t, len) {
    if (kind === 'whistle') this.whistle(midi, t, Math.max(0.12, len * 0.94), 0.55);
    else if (kind === 'glock') this.note('glock', midi < 74 ? midi + 12 : midi, { at: t, vel: 0.5, pan: 0.3 });
    else if (kind === 'piano') this.note('piano', midi, { at: t, vel: 0.5, dur: Math.max(0.5, len * 1.4), pan: 0.08 });
    else if (kind === 'guitar') this.note('guitar', midi - 12, { at: t, vel: 0.55, pan: 0.2, dur: Math.max(0.4, len * 1.2) });
    else if (kind === 'riff') {
      // the fight's riff: on the glockenspiel when it fights hard, the
      // whistle doubling it when it fights its hardest
      if (this.level > 0.6) this.note('glock', midi + 12 > 98 ? midi : midi + 12, { at: t, vel: 0.45, pan: 0.3 });
      if (this.level > 0.85) this.whistle(midi, t, Math.max(0.1, len * 0.9), 0.5);
    }
  }

  // A song's last chord, let ring.
  finale(S, c, t) {
    const notes = voicing(c, 40, 67);
    notes.forEach((m, i) => this.note('guitar', m, { at: t + i * 0.02, vel: 0.42, pan: -0.25, dur: 2 }));
    this.note('bass', low(c.bass, 31), { at: t, vel: 0.6, dur: 2 });
    this.note('glock', voicing(c, 79, 91, false).pop() || 84, { at: t + 0.05, vel: 0.3, pan: 0.3 });
  }

  // ------------------------------------------------------------ each frame
  update(dt, g, radioOn) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // what the music should be doing
    const F = g.fishing;
    const fighting = F && (F.state === 'fight' || F.state === 'landing') && F.fight;
    const threat = g.bears?.threat;
    const ts = threat?.state;
    const dangerNow = ts === 'charge' || ts === 'attack' ? 1 : ts === 'alert' || ts === 'bluffstop' ? 0.55 : threat ? 0.35 : 0;
    this.danger += (dangerNow - this.danger) * Math.min(1, dt * 2);
    const mode = dangerNow > 0 ? 'bear' : fighting ? 'fight' : radioOn ? 'quiet' : 'songs';
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === 'bear' || mode === 'fight') {
        this.stopSong(0.5);
        if (!this.layer || this.layer.name !== mode) {
          this.stopLayer(0.3);
          this.begin(mode, now + 0.08, true);
        }
      } else {
        this.stopLayer(mode === 'songs' ? 1.2 : 0.4);
        if (mode === 'quiet') this.stopSong(1);
        // after a fight or a bear, the place on its own for a while
        this.rest = Math.max(this.rest, mode === 'songs' ? rand(10, 18) : 0);
      }
    }
    // how hard the fish fights: the line's strain, a run, a fresh fish
    if (fighting) {
      const f = F.fight;
      const tn = (f.tension || 0) / Math.max(1, F.rod().maxTension);
      const want = clamp(0.2 + tn * 0.65 + (f.state === 'run' ? 0.2 : 0) + (f.state === 'jump' ? 0.25 : 0) + (f.stamina ?? 1) * 0.15 + (f.fish?.legend ? 0.15 : 0), 0, 1);
      this.level += (want - this.level) * Math.min(1, dt * (want > this.level ? 3 : 0.8));
      if (!Number.isFinite(this.level)) this.level = 0;
    } else this.level = Math.max(0, this.level - dt * 0.5);
    // songs come and go
    const quietMenu = g.menuOpen ? 0.6 : 1;
    if (quietMenu !== this.songGain && this.song) {
      this.songOut.gain.setTargetAtTime(quietMenu * (this.song.S.gain || 1), now, 0.3);
    }
    this.songGain = quietMenu;
    if (this.mode === 'songs' && !this.song) {
      this.rest -= dt;
      if (this.rest <= 0 && g.world) this.begin(this.choose(g), now + 0.1);
    }
    // what falls within the next quarter of a second (after a pause, the
    // time lost is skipped, not caught up)
    if (this.layer) this.schedule(this.layer, now);
    if (this.song) this.schedule(this.song, now);
  }

  schedule(s, now) {
    if (s.t < now - 0.2) s.t = now + 0.05;
    let n = 0;
    while (s.t < now + 0.25 && n++ < 16) {
      if (!this.step(s)) {
        if (s === this.song) {
          this.song = null;
          this.rest = rand(25, 55);
        } else if (s === this.layer) this.stopLayer(1);
        break;
      }
    }
  }

  // ------------------------------------------------------------ the moments
  // The hook set: a hit on the bass and a power chord, and the fight starts.
  fishOn(legend) {
    if (!this.ctx || !this.A.kit.guitar) return;
    const t = this.ctx.currentTime + 0.02;
    const D = this.ctx.createGain();
    D.gain.value = STINGS.fishOn;
    D.connect(this.A.sting);
    this.A.afterSound(4000, () => D.disconnect());
    for (const [i, m] of [40, 47, 52, 55].entries()) this.note('guitar', m, { at: t + i * 0.01, vel: 0.6, pan: -0.25, dur: 0.6, dest: D });
    this.note('bass', 28, { at: t, vel: 0.8, dur: 0.8, dest: D });
    this.stingDrum('kick', t, 0.8, D);
    this.stingDrum('crash', t, legend ? 0.6 : 0.35, D);
    if (legend) {
      this.stingDrum('timp', t, 0.9, D);
      this.stingDrum('timp', t + 0.18, 0.7, D);
    }
  }

  stingDrum(name, at, vel, dest = this.A.sting) {
    this.A.play(name, { gain: vel, at, dest, verb: 0.15 });
  }

  // Duck the songs under a stinger for a while.
  duck(secs) {
    const t = this.ctx.currentTime;
    for (const o of [this.songOut, this.layer?.out]) {
      if (!o) continue;
      const g = o.gain;
      const v = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(v, t);
      g.linearRampToValueAtTime(v * 0.35, t + 0.08);
      g.setValueAtTime(v * 0.35, t + secs);
      g.linearRampToValueAtTime(o === this.songOut ? (this.songGain || 1) * (this.song?.S.gain || 1) : 1, t + secs + 0.8);
    }
  }

  // A stinger for a moment, through a gain of its own (STINGS). Returns
  // false if the instruments are not baked yet (the caller then plays
  // something simpler).
  sting(kind) {
    const A = this.A;
    if (!this.ctx || !A.kit.glock || !A.kit.guitar) return false;
    const t = this.ctx.currentTime + 0.03;
    const D = this.ctx.createGain();
    D.gain.value = STINGS[kind] ?? 1;
    // the short cues (a chime, a ping for a clean hook set or a run of
    // catches) are the game talking, not music, and stay up when the music
    // is turned down; the rest follow the music's volume
    D.connect(CUES.has(kind) ? A.cue : A.sting);
    this.A.afterSound(6000, () => D.disconnect());
    const glock = (m, at, vel = 0.5, pan = 0.3) => this.note('glock', m, { at, vel, pan, dest: D });
    const strum = (notes, at, vel = 0.5) => notes.forEach((m, i) => this.note('guitar', m, { at: at + i * 0.016, vel, pan: -0.25 + i * 0.05, dur: 1.4, dest: D }));
    const G = [43, 50, 55, 59, 62, 67];
    const C = [48, 52, 55, 60, 64];
    const Dm = [50, 57, 62, 66];
    switch (kind) {
      case 'chime':
        [76, 79, 84].forEach((m, i) => glock(m, t + i * 0.07, 0.55));
        return true;
      case 'perfect':
        glock(88, t, 0.55, 0.2);
        glock(95, t + 0.06, 0.45, 0.4);
        this.stingDrum('rim', t, 0.5, D);
        return true;
      case 'streak':
        glock(84, t, 0.5);
        glock(91, t + 0.09, 0.5);
        glock(96, t + 0.18, 0.45);
        return true;
      case 'catch':
        this.duck(1.2);
        strum(G, t, 0.45);
        this.note('bass', 31, { at: t, vel: 0.6, dur: 1.2, dest: D });
        [79, 83, 86].forEach((m, i) => glock(m, t + 0.05 + i * 0.09, 0.5));
        this.stingDrum('kick', t, 0.5, D);
        return true;
      case 'big':
        this.duck(2);
        strum(G, t, 0.5);
        strum(C, t + 0.34, 0.45);
        strum(G, t + 0.68, 0.55);
        this.note('bass', 31, { at: t, vel: 0.65, dur: 0.4, dest: D });
        this.note('bass', 36, { at: t + 0.34, vel: 0.6, dur: 0.4, dest: D });
        this.note('bass', 31, { at: t + 0.68, vel: 0.7, dur: 1.4, dest: D });
        glock(86, t, 0.45);
        glock(88, t + 0.34, 0.45);
        glock(91, t + 0.68, 0.55);
        this.stingDrum('crash', t + 0.68, 0.5, D);
        this.stingDrum('kick', t, 0.6, D);
        this.stingDrum('kick', t + 0.68, 0.7, D);
        return true;
      case 'legend': {
        this.duck(3.6);
        // a timpani roll swelling into the fanfare
        for (let i = 0; i < 7; i++) this.stingDrum('timp', t + i * 0.065, 0.35 + i * 0.08, D);
        const s = t + 0.5;
        this.stingDrum('crash', s, 0.7, D);
        this.stingDrum('kick', s, 0.8, D);
        strum(G, s, 0.55);
        this.note('bass', 31, { at: s, vel: 0.75, dur: 0.6, dest: D });
        this.whistle(67, s, 0.3, 0.7, D);
        this.whistle(74, s + 0.3, 0.3, 0.7, D);
        this.whistle(79, s + 0.6, 0.9, 0.75, D);
        strum(C, s + 0.6, 0.5);
        this.note('bass', 36, { at: s + 0.6, vel: 0.7, dur: 0.6, dest: D });
        strum(Dm, s + 1.2, 0.5);
        this.note('bass', 38, { at: s + 1.2, vel: 0.7, dur: 0.6, dest: D });
        this.whistle(78, s + 1.2, 0.3, 0.7, D);
        this.whistle(79, s + 1.5, 1.4, 0.8, D);
        strum(G, s + 1.5, 0.6);
        this.note('bass', 31, { at: s + 1.5, vel: 0.8, dur: 2, dest: D });
        this.stingDrum('crash', s + 1.5, 0.75, D);
        this.stingDrum('kick', s + 1.5, 0.8, D);
        [79, 83, 86, 91, 95].forEach((m, i) => glock(m, s + 1.5 + i * 0.07, 0.45));
        return true;
      }
      case 'new':
        // a discovery: the glockenspiel climbing over a held chord
        this.duck(1.8);
        [72, 76, 79, 84, 88, 91].forEach((m, i) => glock(m, t + i * 0.065, 0.42 + i * 0.03, -0.2 + i * 0.1));
        for (const m of [48, 60, 64, 67]) this.note('piano', m, { at: t, vel: 0.35, dur: 2, dest: D });
        return true;
      case 'lost':
        // the one that got away: four notes falling
        this.duck(1.6);
        [59, 58, 57, 56].forEach((m, i) => this.note('guitar', m, { at: t + i * 0.26, vel: i === 3 ? 0.5 : 0.42, pan: -0.15, dur: i === 3 ? 1.4 : 0.3, dest: D }));
        this.note('bass', 28, { at: t + 0.78, vel: 0.5, dur: 1.4, dest: D });
        return true;
      case 'goal':
        this.duck(1.5);
        strum(C, t, 0.45);
        [72, 76, 79, 84].forEach((m, i) => glock(m, t + i * 0.08, 0.5));
        this.note('bass', 36, { at: t, vel: 0.6, dur: 1.2, dest: D });
        this.stingDrum('crash', t + 0.24, 0.35, D);
        return true;
      case 'frenzy':
        this.duck(1.4);
        for (let i = 0; i < 8; i++) this.stingDrum('shaker', t + i * 0.06, 0.3 + i * 0.05, D);
        [79, 81, 83, 86, 88, 91].forEach((m, i) => glock(m, t + 0.12 + i * 0.06, 0.45));
        this.stingDrum('kick', t + 0.5, 0.7, D);
        this.stingDrum('crash', t + 0.5, 0.4, D);
        return true;
      default:
        return false;
    }
  }
}

// (for tools/sound-sheet.mjs and the tests: every song by name, and a song
// worked out into bars and notes, which checks its tunes fill their bars)
export const SONG_NAMES = Object.keys(SONGS);
export { built as buildSong };
