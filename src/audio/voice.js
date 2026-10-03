// The announcer's own voice: every line and name it says, spoken by a
// neural speech model and shipped with the game as small MP3s (see
// tools/voice). A clip is decoded the first time it is needed and kept while
// it is in use (decoded sound is large: about 190 KB a second); the wind,
// water and music dip a little while the voice talks.
import { CLIPS, VOICE_INFO } from './voice-clips.js';
import { voiceKey } from './voicekey.js';

const KEEP = 28; // decoded clips kept at once
const GAP = 0.12; // seconds between a line and the name after it
const DUCK = 0.56; // the beds and music while talking (-5 dB)

export { VOICE_INFO };

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map(); // key -> AudioBuffer, oldest first
    this.pending = new Map();
    this.sources = [];
    this.serial = 0;
    this.endsAt = 0;
  }

  has(text) {
    return Object.prototype.hasOwnProperty.call(CLIPS, voiceKey(text));
  }

  allKeys() {
    return Object.keys(CLIPS);
  }

  // The clip for the name after a line: the name itself, or the fish at the
  // end of a personal best ("4.2 KG KING SALMON" -> "king salmon").
  subKey(sub) {
    if (!sub) return null;
    const k = voiceKey(sub);
    if (CLIPS[k]) return k;
    const fish = k.replace(/^[\d.,]+\s*kg\s+/, '');
    return CLIPS[fish] ? fish : null;
  }

  decode(key) {
    const have = this.buffers.get(key);
    if (have) {
      // most recently used goes last
      this.buffers.delete(key);
      this.buffers.set(key, have);
      return Promise.resolve(have);
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const ctx = this.audio.ctx;
    const bin = atob(CLIPS[key]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // (the callback form: older Safari has no promise from decodeAudioData)
    const p = new Promise((res, rej) => ctx.decodeAudioData(bytes.buffer, res, rej)).then(
      (buf) => {
        this.pending.delete(key);
        this.buffers.set(key, buf);
        while (this.buffers.size > KEEP) this.buffers.delete(this.buffers.keys().next().value);
        return buf;
      },
      (e) => {
        this.pending.delete(key);
        throw e;
      }
    );
    this.pending.set(key, p);
    return p;
  }

  // Decode the lines heard most, in the background, so the first FISH ON!
  // is not a moment late.
  warm(texts) {
    if (!this.audio.ctx) return;
    for (const t of texts) {
      const k = voiceKey(t);
      if (CLIPS[k]) this.decode(k).catch(() => {});
    }
  }

  // Say a line, then the name after it if there is a clip for it; a new line
  // cuts off the last one. Resolves false if it could not play.
  async say(line, sub, gain = 1) {
    const A = this.audio;
    if (!A.ready || !A.ctx) return false;
    const serial = ++this.serial;
    const keys = [voiceKey(line)];
    const sk = this.subKey(sub);
    if (sk) keys.push(sk);
    let bufs;
    try {
      bufs = await Promise.all(keys.map((k) => this.decode(k)));
    } catch (e) {
      return false;
    }
    // a newer line came in while these decoded
    if (serial !== this.serial) return true;
    this.stop();
    const ctx = A.ctx;
    let t = ctx.currentTime + 0.02;
    const out = A.voiceOut;
    out.gain.setValueAtTime(gain, ctx.currentTime);
    for (const b of bufs) {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(out);
      s.start(t);
      this.sources.push(s);
      t += b.duration + GAP;
    }
    this.endsAt = t - GAP;
    this.duck(ctx.currentTime, this.endsAt);
    return true;
  }

  duck(from, to) {
    const g = this.audio.bed?.gain;
    if (!g) return;
    g.cancelScheduledValues(from);
    g.setValueAtTime(g.value, from);
    g.linearRampToValueAtTime(DUCK, from + 0.08);
    g.setValueAtTime(DUCK, to);
    g.linearRampToValueAtTime(1, to + 0.45);
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch (e) {
        /* already done */
      }
    }
    this.sources.length = 0;
    const A = this.audio;
    if (A.ctx && A.bed && this.endsAt > A.ctx.currentTime) {
      const g = A.bed.gain;
      const now = A.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(1, now + 0.3);
      this.endsAt = 0;
    }
  }

  get speaking() {
    return !!this.audio.ctx && this.audio.ctx.currentTime < this.endsAt;
  }
}
