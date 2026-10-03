// The announcer: a voice that calls the big moments ("FISH ON!", "IT THREW
// THE HOOK!", "NEW SPECIES! NORTHERN PIKE!") with a banner to match. The
// voice is the game's own: every line and name recorded with a natural
// neural voice and shipped with the game (voice.js), so it sounds the same on
// every device. Settings can switch to one of the device's own voices
// instead (the most natural English ones, never the novelty voices) or turn
// the announcer off; the banners show either way.

import { LINES } from './lines.js';
import { Voice } from './voice.js';

// Apple's novelty and robotic voices (and the Eloquence family, which sounds
// like a 1990s synthesiser), by name.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Fred|Good News|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Princess|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
// Voices known to sound natural: Apple's (iPhone, iPad, Mac), Google's
// (Android, Chrome) and Microsoft's online voices (Edge, Windows).
const NATURAL = /^(Ava|Evan|Zoe|Nathan|Tom|Allison|Susan|Samantha|Aaron|Nicky|Daniel|Arthur|Martha|Karen|Catherine|Gordon|Lee|Moira|Tessa|Rishi|Serena|Alex|Google (US|UK) English|Microsoft (Aria|Jenny|Guy|Andrew|Brian|Christopher|Eric|Emma|Michelle|Roger|Steffan|Sonia|Ryan|Libby|Natasha|William))/i;
const MALE = /^(Evan|Nathan|Tom|Aaron|Daniel|Arthur|Gordon|Lee|Rishi|Alex|Google UK English Male|Microsoft (Guy|Andrew|Brian|Christopher|Eric|Roger|Steffan|Ryan|William))/i;

function voiceScore(v) {
  if (!/^en([-_]|$)/i.test(v.lang || '') || NOVELTY.test(v.name)) return 0;
  let s = 10;
  // a voice the device downloaded in its best quality
  if (/premium|enhanced|natural|neural/i.test(v.name)) s += 100;
  if (NATURAL.test(v.name)) s += 60;
  if (/^en[-_]US/i.test(v.lang)) s += 8;
  else if (/^en[-_](GB|AU|IE|CA|NZ)/i.test(v.lang)) s += 6;
  if (v.localService) s += 4;
  // an announcer's voice, all else equal
  if (MALE.test(v.name)) s += 5;
  return s;
}

// "FISH ON! NORTHERN PIKE!" reads as "Fish on! Northern pike!": capitals
// make some device voices spell words out.
function sentenceCase(text) {
  return text.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\bi\b/g, 'I');
}

function pick(list) {
  let sum = 0;
  for (const [, w] of list) sum += w;
  let r = Math.random() * sum;
  for (const [text, w] of list) {
    r -= w;
    if (r <= 0) return text;
  }
  return list[0][0];
}

export class Announcer {
  constructor(game) {
    this.game = game;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.clips = new Voice(game.audio);
    this.voice = null;
    this.lastAt = -10;
    this.lastKey = null;
    if (this.synth) {
      this.pickVoice();
      // voices arrive late on some browsers
      try {
        this.synth.addEventListener?.('voiceschanged', () => this.pickVoice());
      } catch (e) {
        /* older engines */
      }
    }
  }

  // The game's own voice unless Settings picked one of the device's.
  get gameVoice() {
    return !this.game.state?.settings?.voiceName;
  }

  // Every English device voice worth hearing, best first. Novelty voices are
  // left out: Apple ships robots and gags (Fred, Zarvox, Bad News) and an old
  // synthesiser family (Eddy, Flo, Grandpa) beside its natural voices, and
  // Fred used to be the announcer here.
  goodVoices() {
    const voices = this.synth?.getVoices ? this.synth.getVoices() : [];
    const out = [];
    for (const v of voices) {
      const sc = voiceScore(v);
      if (sc > 0) out.push([sc, v]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return out.map((x) => x[1]);
  }

  // The device voice to use when Settings picked one (or when a line has no
  // recording): the one picked, else the best there is.
  pickVoice() {
    const good = this.goodVoices();
    if (!good.length) {
      // the device's default English voice
      this.voice = null;
      return;
    }
    const want = this.game.state?.settings?.voiceName;
    this.voice = (want && good.find((v) => v.name === want)) || good[0];
  }

  // Settings: the next voice, said aloud so you can hear it. The game's own
  // comes first, then the device's good ones.
  nextVoice() {
    const st = this.game.state?.settings;
    const names = [null, ...this.goodVoices().map((v) => v.name)];
    const now = st?.voiceName || null;
    const i = names.indexOf(now);
    const next = names[(i + 1) % names.length];
    if (st) st.voiceName = next;
    if (next) this.pickVoice();
    // (the tap that got here lets the sound start)
    this.game.audio?.unlock();
    this.unlock();
    this.lastKey = null;
    this.speak('FISH ON!', 'sample', 'A BEAUTIFUL KING SALMON!');
    return this.voiceName;
  }

  get voiceName() {
    if (this.gameVoice) return 'Game voice';
    return this.voice ? this.voice.name.replace(/\s*\(.*\)\s*$/, '') + (/premium|enhanced|natural|neural/i.test(this.voice.name) ? ' (enhanced)' : '') : 'Device default';
  }

  // Speech needs a first touch on iOS: an empty line spoken inside the tap
  // that starts the game opens the way for the rest. The game's voice needs
  // the sound started, and its most heard lines decoded ahead: a moment
  // after the tap, not in it, as the first line is a cast and a bite away.
  unlock() {
    if (this.game.audio?.ready && !this.warmed) {
      this.warmed = true;
      setTimeout(() => this.clips.warm(['FISH ON!', 'FISH ON! FISH ON!', 'HOOKED UP!', 'GOT ONE!', 'NICE FISH!', 'LANDED!', "IT'S A BIG ONE!", "IT'S JUMPING!", 'TOO SLOW!', 'TOO EARLY!', 'PERFECT CAST!']), 1500);
    }
    if (!this.synth || this.unlocked) return;
    this.unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch (e) {
      /* no speech */
    }
  }

  get lines() {
    return LINES;
  }

  get voiceOn() {
    return this.game.state?.settings?.announcer !== false;
  }

  // Shout a line: key picks from the lines above; sub is a second line under
  // the banner (the species name); kind styles the banner.
  say(key, { sub = null, kind = 'good', banner = true, place = null } = {}) {
    const g = this.game;
    const list = LINES[key];
    if (!list) return;
    const text = pick(list);
    if (banner) g.hud?.banner(text, kind, sub, place);
    this.speak(text, key, sub);
  }

  speak(text, key, sub = null) {
    // (the sample in Settings plays with the voice off too)
    if (!this.voiceOn && key !== 'sample') return;
    const now = performance.now() / 1000;
    // a new line cuts off the last one, but the same line twice in a row
    // within a moment is just noise
    if (key === this.lastKey && now - this.lastAt < 1.5) return;
    this.lastKey = key;
    this.lastAt = now;
    const vol = this.game.state?.settings?.volume ?? 0.8;
    if (this.gameVoice && this.game.audio?.ready && this.clips.has(text)) {
      try {
        this.synth?.cancel();
      } catch (e) {
        /* no speech */
      }
      // (the game's sound is already at the volume setting)
      this.clips.say(text, sub, 1.1).then((ok) => {
        if (!ok) this.speakDevice(sub ? `${text} ${sub}` : text, vol);
      });
      return;
    }
    this.speakDevice(sub ? `${text} ${sub}` : text, vol);
    this.hintBetterVoice(key);
  }

  // One of the device's own voices, through its speech synthesis.
  speakDevice(text, vol) {
    if (!this.synth) return;
    // voices arrive late on some browsers, the saved choice with the save
    const want = this.game.state?.settings?.voiceName;
    if (!this.voice || (want && this.voice.name !== want)) this.pickVoice();
    try {
      this.clips.stop();
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(sentenceCase(text));
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang || 'en-US';
      // the voice as it was recorded, a touch quicker for the excitement
      u.pitch = 1;
      u.rate = 1.04;
      u.volume = Math.min(1, vol * 1.15);
      this.synth.speak(u);
    } catch (e) {
      /* no speech */
    }
  }

  // An iPhone or iPad ships only its compact voices, which sound flat; the
  // natural ones (Enhanced, Premium) are a free download. Say so once, the
  // first time the announcer speaks with a compact device voice on one.
  hintBetterVoice(key) {
    const g = this.game;
    const flags = g.state?.flags;
    if (!flags || flags.voiceHint || key === 'sample' || !this.voiceOn || this.gameVoice) return;
    // an iPhone or iPad (an iPad's Safari can say it is a Mac: it has touch)
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const v = this.voice;
    if (!ios || (v && /premium|enhanced/i.test(`${v.name} ${v.voiceURI}`))) return;
    flags.voiceHint = true;
    setTimeout(
      () =>
        g.hud?.toast(
          'For a more natural device voice, download a better one: iPhone Settings, Accessibility, Spoken Content, Voices, English, and pick one marked Enhanced or Premium. Or go back to the game\'s own voice under Settings, Voice',
          'good',
          10
        ),
      3500
    );
  }

  stop() {
    this.clips.stop();
    try {
      this.synth?.cancel();
    } catch (e) {
      /* no speech */
    }
  }
}
