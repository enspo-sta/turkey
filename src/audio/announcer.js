// The announcer: an arcade voice that shouts the big moments ("FISH ON!",
// "IT THREW THE HOOK!", "NEW SPECIES! NORTHERN PIKE!") with a banner to
// match. The voice is the device's own speech synthesis, pitched down and
// hyped up; with the voice off in Settings, or no speech on the device, the
// banners still show.

const LINES = {
  fishOn: [['FISH ON!', 5], ['FISH ON! FISH ON!', 2], ['HOOKED UP!', 1], ['GOT ONE!', 1]],
  bigOne: [["IT'S A BIG ONE!", 3], ['MONSTER ON THE LINE!', 1], ['HOLD ON TIGHT!', 1]],
  jump: [["IT'S JUMPING!", 2], ['LOOK AT IT GO!', 1], ['AIRBORNE!', 1]],
  threwHook: [['IT THREW THE HOOK!', 1]],
  hookOff: [['OH NO, THE HOOK CAME OFF!', 2], ['OH NO! IT SHOOK THE HOOK!', 1]],
  snap: [['SNAP! THE LINE BROKE!', 2], ['OH NO! IT BROKE OFF!', 1]],
  spooled: [['SPOOLED! IT TOOK ALL YOUR LINE!', 1]],
  gotAway: [['IT GOT AWAY!', 1]],
  missed: [['TOO SLOW!', 2], ['MISSED IT!', 1]],
  early: [['TOO EARLY!', 1]],
  perfect: [['PERFECT CAST!', 1]],
  backlash: [["BIRD'S NEST!", 1]],
  landed: [['NICE FISH!', 3], ['LANDED!', 2], ['WHAT A CATCH!', 1], ['BEAUTIFUL!', 1]],
  newSpecies: [['NEW SPECIES!', 1]],
  best: [['PERSONAL BEST!', 1]],
  legend: [['LEGENDARY!', 1]],
  bite: [['THE BITE IS ON!', 1]],
  eagle: [['AN EAGLE STOLE IT!', 1]],
  bear: [['LOOK OUT!', 1]],
  bullseye: [['BULLSEYE!', 1]],
  photo: [['WHAT A SHOT!', 2], ['FRAME IT!', 1]],
  treasure: [['TREASURE!', 1]],
  glider: [['A PARAGLIDER!', 1]],
  key: [['A SECRET KEY!', 1]],
  jobDone: [['CHA-CHING!', 2], ['JOB DONE!', 1]],
  bigfoot: [['BIGFOOT?!', 1]],
};

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

  // An English voice, a deep one where the device has it.
  pickVoice() {
    const voices = this.synth.getVoices ? this.synth.getVoices() : [];
    if (!voices.length) return;
    const prefer = ['Fred', 'Daniel', 'Alex', 'Aaron', 'Arthur', 'Ralph', 'Google UK English Male', 'Google US English', 'Microsoft Guy', 'Microsoft David'];
    for (const name of prefer) {
      const v = voices.find((x) => x.name.startsWith(name) && /^en/i.test(x.lang));
      if (v) {
        this.voice = v;
        return;
      }
    }
    this.voice = voices.find((x) => /^en[-_]US/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang)) || null;
  }

  // Speech needs a first touch on iOS: an empty line spoken inside the tap
  // that starts the game opens the way for the rest.
  unlock() {
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
    this.speak(sub ? `${text} ${sub}` : text, key);
  }

  speak(text, key) {
    if (!this.synth || !this.voiceOn) return;
    const now = performance.now() / 1000;
    // a new line cuts off the last one, but the same line twice in a row
    // within a moment is just noise
    if (key === this.lastKey && now - this.lastAt < 1.5) return;
    this.lastKey = key;
    this.lastAt = now;
    try {
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text.toLowerCase());
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang || 'en-US';
      // an arcade announcer: low, fast and loud
      u.pitch = 0.75;
      u.rate = 1.12;
      u.volume = Math.min(1, (this.game.state?.settings?.volume ?? 0.8) * 1.15);
      this.synth.speak(u);
    } catch (e) {
      /* no speech */
    }
  }

  stop() {
    try {
      this.synth?.cancel();
    } catch (e) {
      /* no speech */
    }
  }
}
