// Measures the takes of tools/sound-sheet.mjs (or any 16-bit PCM WAV files)
// and draws each one's spectrogram. For every file: its loudness as heard
// (its loudest 0.2 seconds, frequencies weighted as the loudness standard
// ITU-R BS.1770 weights them: the same measure the game's sound library
// levels its sounds by, see src/audio/kit.js), its loudness over the whole
// take as that standard measures a programme, its level (RMS of the part
// that sounds, and peak, in dB below full scale), its crest factor (peak
// over RMS: how punchy or squashed), its brightness (the spectral centroid),
// how noise-like it is (spectral flatness: 0 a pure tone, 1 white noise), the
// share of its energy in five bands, samples at full scale, and clicks (a
// sudden jump between two samples far above what the signal does round it;
// those on the recorder's block edges counted apart, see below).
// The spectrogram is a PNG: time across, 0 to 12 kHz up (on a square-root
// scale, so the lows have room), brightness the level over a 70 dB range.
// Usage: node tools/sound-measure.mjs dir [dir2] [--png]
//   one dir: a table of its takes; two dirs: the takes they share side by
//   side; --png also writes each take's spectrogram next to it.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loudness, BQ } from '../src/audio/kit.js';

// Loudness over the whole take as the standard measures a programme
// (ITU-R BS.1770, "integrated"): the same weighting, in blocks of 0.4 s a
// tenth of a second apart, the silent blocks (below -70) and then the quiet
// ones (more than 10 below the rest) left out. For the music and the
// ambience, which go on; the loudest 0.2 seconds suits a single sound.
function integrated(chs, sr) {
  const n = chs[0].length;
  const z = new Float64Array(n);
  for (const c of chs) {
    const shelf = new BQ('hs', 1682, 0.7072, sr, 4);
    const low = new BQ('hp', 38.1, 0.5003, sr);
    for (let i = 0; i < n; i++) {
      const y = low.run(shelf.run(c[i]));
      z[i] += y * y;
    }
  }
  const S = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) S[i + 1] = S[i] + z[i];
  const w = Math.floor(0.4 * sr);
  const hop = Math.floor(0.1 * sr);
  const blocks = [];
  for (let s = 0; s + w <= n; s += hop) blocks.push((S[s + w] - S[s]) / w);
  const L = (m) => -0.691 + 10 * Math.log10(Math.max(1e-12, m));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const abs = blocks.filter((m) => L(m) > -70);
  if (!abs.length) return -70;
  const gate = L(mean(abs)) - 10;
  const rel = abs.filter((m) => L(m) > gate);
  return L(mean(rel));
}

const args = process.argv.slice(2);
const dirs = args.filter((a) => !a.startsWith('--'));
const PNG = args.includes('--png');

export function readWav(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file: ' + file);
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    else if (id === 'data') data = b.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('need 16-bit PCM: ' + file);
  const n = Math.floor(data.length / 2 / fmt.ch);
  const chs = [];
  for (let c = 0; c < fmt.ch; c++) chs.push(new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chs[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { sr: fmt.sr, chs };
}

// an in-place radix-2 FFT
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// power spectra of overlapping Hann-windowed frames of the mono mix
function frames(x, sr, N = 2048, hop = 512) {
  const out = [];
  const w = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let s = 0; s + N <= x.length; s += hop) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * w[i];
    fft(re, im);
    const P = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k];
    out.push(P);
  }
  return { out, N, hop, df: sr / N };
}

export function measure(file) {
  const { sr, chs } = readWav(file);
  const n = chs[0].length;
  const mono = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < n; i++) mono[i] += c[i] / chs.length;
  let peak = 0;
  let full = 0;
  let dc = 0;
  for (const c of chs) {
    for (let i = 0; i < n; i++) {
      const a = Math.abs(c[i]);
      if (a > peak) peak = a;
      if (a > 0.995) full++;
      dc += c[i];
    }
  }
  dc /= n * chs.length;
  // the part that sounds: 10 ms blocks within 50 dB of the loudest block
  const blk = Math.floor(sr * 0.01);
  const blocks = [];
  for (let s = 0; s + blk <= n; s += blk) {
    let e = 0;
    for (let i = s; i < s + blk; i++) e += mono[i] * mono[i];
    blocks.push(e / blk);
  }
  const top = Math.max(1e-12, ...blocks);
  const live = blocks.filter((e) => e > top * 1e-5);
  const rms = Math.sqrt(live.reduce((a, e) => a + e, 0) / Math.max(1, live.length));
  // clicks: a jump between neighbouring samples more than 8 times the
  // typical jump of the 5 ms round it, and above -40 dB. One that falls on
  // the edge of the browser's 128-sample render block is counted apart
  // (glitches): the recorder in tools/sound-sheet.mjs runs on the page's
  // busy main thread and now and then misses a block, which leaves a step
  // in the recording that was never in the sound.
  let clicks = 0;
  let glitches = 0;
  const win = Math.floor(sr * 0.005);
  const d = new Float32Array(n);
  for (let i = 1; i < n; i++) d[i] = Math.abs(mono[i] - mono[i - 1]);
  // (running sums, so the typical jump round each sample is a subtraction)
  const S = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) S[i + 1] = S[i] + d[i];
  for (let i = win; i < n - win; i++) {
    const local = (S[i + win] - S[i - win]) / (2 * win);
    if (d[i] > 0.01 && d[i] > local * 8) {
      // (where the jump is largest, close by: the detector can fire a few
      // samples early, on the steep side of it)
      let j = i;
      for (let k = Math.max(1, i - 8); k <= Math.min(n - 1, i + 8); k++) if (d[k] > d[j]) j = k;
      if (j % 128 <= 1) glitches++;
      else clicks++;
      i += win;
    }
  }
  const F = frames(mono, sr);
  let cen = 0;
  let tot = 0;
  let flat = 0;
  let fl = 0;
  const bandEdges = [0, 80, 300, 3000, 10000, sr / 2];
  const bands = [0, 0, 0, 0, 0];
  for (const P of F.out) {
    let e = 0;
    let c = 0;
    let lg = 0;
    let m = 0;
    for (let k = 1; k < P.length; k++) {
      const f = k * F.df;
      e += P[k];
      c += P[k] * f;
      lg += Math.log(P[k] + 1e-20);
      m += P[k];
      for (let b = 0; b < 5; b++) if (f >= bandEdges[b] && f < bandEdges[b + 1]) bands[b] += P[k];
    }
    if (e > 1e-9) {
      cen += c;
      tot += e;
      flat += (Math.exp(lg / (P.length - 1)) / (m / (P.length - 1))) * e;
      fl += e;
    }
  }
  const bt = bands.reduce((a, b) => a + b, 0) || 1;
  const dB = (x) => 20 * Math.log10(Math.max(1e-9, x));
  const lg = loudness(chs, sr);
  let lr;
  while (!(lr = lg.next()).done);
  return {
    file: basename(file),
    secs: n / sr,
    loudDb: +lr.value.toFixed(1),
    lufsI: +integrated(chs, sr).toFixed(1),
    rmsDb: +dB(rms).toFixed(1),
    peakDb: +dB(peak).toFixed(1),
    crestDb: +(dB(peak) - dB(rms)).toFixed(1),
    centroidHz: Math.round(tot ? cen / tot : 0),
    flatness: +(fl ? flat / fl : 0).toFixed(3),
    bands: bands.map((b) => +((100 * b) / bt).toFixed(1)),
    fullScale: full,
    clicks,
    glitches,
    dc: +dc.toFixed(4),
    F,
    sr,
  };
}

// --------------------------------------------------------------- PNG
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function png(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// a dark ramp: near black, deep blue, cyan, pale yellow
const RAMP = [
  [16, 18, 22],
  [26, 40, 92],
  [40, 120, 160],
  [86, 182, 194],
  [217, 200, 120],
  [250, 245, 220],
];
const color = (v) => {
  const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const u = x - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * u));
};

export function spectrogram(m, out, { W = 640, H = 220, fmax = 12000 } = {}) {
  const { F } = m;
  const cols = F.out.length;
  const rgb = Buffer.alloc(W * H * 3);
  let top = 1e-12;
  for (const P of F.out) for (const v of P) if (v > top) top = v;
  for (let x = 0; x < W; x++) {
    const P = F.out[Math.min(cols - 1, Math.floor((x / W) * cols))] || new Float64Array(F.N / 2);
    for (let y = 0; y < H; y++) {
      // square-root frequency scale, the highs at the top
      const u = 1 - y / (H - 1);
      const f = u * u * fmax;
      const k = Math.min(P.length - 1, Math.max(1, Math.round(f / F.df)));
      const db = 10 * Math.log10((P[k] + 1e-20) / top);
      const [r, gg, b] = color((db + 70) / 70);
      const o = (y * W + x) * 3;
      rgb[o] = r;
      rgb[o + 1] = gg;
      rgb[o + 2] = b;
    }
  }
  writeFileSync(out, png(W, H, rgb));
}

const row = (m) =>
  `${m.loudDb.toFixed(1).padStart(6)} ${m.lufsI.toFixed(1).padStart(6)} ${m.rmsDb.toFixed(1).padStart(6)} ${m.peakDb.toFixed(1).padStart(6)} ${m.crestDb.toFixed(1).padStart(5)} ${String(m.centroidHz).padStart(6)} ${m.flatness.toFixed(2).padStart(5)} ${m.bands.map((b) => b.toFixed(0).padStart(3)).join('')} ${String(m.fullScale).padStart(4)} ${String(m.clicks).padStart(3)} ${String(m.glitches).padStart(3)}`;
const HEAD = '  loud  integ    RMS   peak crest centr  flat sub low mid  hi air  full clk gli';

// (run as a command, not when another tool imports the measures)
const MAIN = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (MAIN && dirs.length) {
  const list = (d) => readdirSync(d).filter((f) => f.endsWith('.wav')).sort();
  const out = {};
  if (dirs.length === 1) {
    console.log('take'.padEnd(18) + HEAD);
    for (const f of list(dirs[0])) {
      const m = measure(join(dirs[0], f));
      if (PNG) spectrogram(m, join(dirs[0], f.replace(/\.wav$/, '.png')));
      delete m.F;
      out[f] = m;
      console.log(f.replace(/\.wav$/, '').padEnd(18) + row(m));
    }
    writeFileSync(join(dirs[0], 'measure.json'), JSON.stringify(out, null, 1));
  } else {
    console.log('take'.padEnd(18) + 'before:' + HEAD.slice(7) + '  | after:' + HEAD.slice(7));
    for (const f of list(dirs[0])) {
      if (!existsSync(join(dirs[1], f))) continue;
      const a = measure(join(dirs[0], f));
      const b = measure(join(dirs[1], f));
      if (PNG) {
        spectrogram(a, join(dirs[0], f.replace(/\.wav$/, '.png')));
        spectrogram(b, join(dirs[1], f.replace(/\.wav$/, '.png')));
      }
      delete a.F;
      delete b.F;
      out[f] = { before: a, after: b };
      console.log(f.replace(/\.wav$/, '').padEnd(18) + row(a) + '  |' + row(b));
    }
    writeFileSync(join(dirs[1], 'compare.json'), JSON.stringify(out, null, 1));
  }
}
