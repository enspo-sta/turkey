// The announcer: a voice that calls the big moments ("FISH ON!", "IT THREW
// THE HOOK!", "NEW SPECIES! NORTHERN PIKE!") with a banner to match. The
// voice is the device's own speech synthesis: the most natural English voice
// it has (an enhanced or premium voice where one is installed), at its own
// pitch, never one of the novelty voices. Settings can pick another one or
// turn it off; with no speech on the device the banners still show.

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
  racer: [['A FORMULA ONE CAR!', 1]],
  speed: [['FLAT OUT!', 2], ['WHAT A SPEED!', 1]],
  fireball: [['A FIREBALL!', 2], ['LOOK AT THE SKY!', 1]],
  meteorite: [['A METEORITE!', 2], ['A PIECE OF SPACE!', 1]],
  iss: [['THE SPACE STATION!', 1]],
  storm: [['NORTHERN LIGHTS!', 1]],
  scope: [['NEW IN THE SKY LOG!', 1]],
  planets: [['ALL FIVE BRIGHT PLANETS!', 1]],
  topout: [['TOPPED OUT!', 2], ['WHAT A CLIMB!', 1], ['ON TOP OF THE WORLD!', 1]],
};

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
// make some voices spell words out.
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

  // Every English voice worth hearing, best first. Novelty voices are left
  // out: Apple ships robots and gags (Fred, Zarvox, Bad News) and an old
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

  // Settings: the next good voice, said aloud so you can hear it.
  nextVoice() {
    const good = this.goodVoices();
    if (!good.length) return null;
    const i = this.voice ? good.findIndex((v) => v.name === this.voice.name) : -1;
    this.voice = good[(i + 1) % good.length];
    const st = this.game.state?.settings;
    if (st) st.voiceName = this.voice.name;
    this.lastKey = null;
    this.speak('FISH ON! A BEAUTIFUL KING SALMON!', 'sample');
    return this.voice.name;
  }

  get voiceName() {
    return this.voice ? this.voice.name.replace(/\s*\(.*\)\s*$/, '') + (/premium|enhanced|natural|neural/i.test(this.voice.name) ? ' (enhanced)' : '') : 'Device default';
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
    // (the sample in Settings plays with the voice off too)
    if (!this.synth || (!this.voiceOn && key !== 'sample')) return;
    // voices arrive late on some browsers, the saved choice with the save
    if (!this.voice || (this.game.state?.settings?.voiceName && this.voice.name !== this.game.state.settings.voiceName)) this.pickVoice();
    const now = performance.now() / 1000;
    // a new line cuts off the last one, but the same line twice in a row
    // within a moment is just noise
    if (key === this.lastKey && now - this.lastAt < 1.5) return;
    this.lastKey = key;
    this.lastAt = now;
    try {
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(sentenceCase(text));
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang || 'en-US';
      // the voice as it was recorded, a touch quicker for the excitement
      u.pitch = 1;
      u.rate = 1.04;
      u.volume = Math.min(1, (this.game.state?.settings?.volume ?? 0.8) * 1.15);
      this.synth.speak(u);
    } catch (e) {
      /* no speech */
    }
    this.hintBetterVoice(key);
  }

  // An iPhone or iPad ships only its compact voices, which sound flat; the
  // natural ones (Enhanced, Premium) are a free download. Say so once, the
  // first time the announcer speaks with a compact voice on one.
  hintBetterVoice(key) {
    const g = this.game;
    const flags = g.state?.flags;
    if (!flags || flags.voiceHint || key === 'sample' || !this.voiceOn) return;
    // an iPhone or iPad (an iPad's Safari can say it is a Mac: it has touch)
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const v = this.voice;
    if (!ios || (v && /premium|enhanced/i.test(`${v.name} ${v.voiceURI}`))) return;
    flags.voiceHint = true;
    setTimeout(
      () =>
        g.hud?.toast(
          'For a more natural announcer, download a better voice: iPhone Settings, Accessibility, Spoken Content, Voices, English, and pick one marked Enhanced or Premium. Then choose it in the game under Settings, Voice',
          'good',
          10
        ),
      3500
    );
  }

  stop() {
    try {
      this.synth?.cancel();
    } catch (e) {
      /* no speech */
    }
  }
}
