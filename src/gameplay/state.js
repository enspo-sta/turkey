// Persistent game state (money, gear, cooler, journal, challenges) with
// localStorage save/load and challenge evaluation.
import { CHALLENGES, SPECIES_IDS, COOLERS, RODS } from './data.js';

const SAVE_KEY = 'rubenHotrodFishing.save.v1';
const SETTINGS_KEY = 'rubenHotrodFishing.settings.v1';

function storage() {
  try {
    const s = window.localStorage;
    const k = '__rhf_test';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch (e) {
    return null;
  }
}

// Inside the iOS app, saves are also handed to the native side, which keeps
// its own copy and restores it into web storage on launch.
function mirror(key, value) {
  try {
    const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store;
    if (h) h.postMessage({ key, value });
  } catch (e) {
    /* not running inside the app */
  }
}

export class GameState {
  constructor() {
    this.listeners = [];
    this.reset();
    this.settings = { quality: null, volume: 0.8, music: 0.55, sens: 1, invert: false, haptics: true, showFps: false, autoQuality: true };
    this.loadSettings();
  }

  reset() {
    this.money = 150;
    this.cooler = [];
    this.trophies = [];
    this.journal = {};
    this.legends = {};
    this.hunted = {};
    this.gear = {
      rod: 'classic',
      rods: ['classic'],
      lure: 'spinner',
      lures: ['spinner'],
      scope: false,
      ammo: 20,
      mag: 4,
      spray: 1,
      medkit: 1,
      cooler: 0,
      engine: 0,
      tires: 0,
      paint: 'flame',
      paints: ['flame'],
    };
    this.discovered = { landing: true, post: false };
    this.challenges = {};
    this.stats = { casts: 0, perfects: 0, caught: 0, released: 0, snapped: 0, bearsSurvived: 0, bearsKilled: 0, hunted: 0, earned: 0 };
    this.time = 6.5;
    this.day = 1;
    this.player = null;
    this.car = null;
    this.health = 100;
    this.started = false;
    this.salmonRun = null;
  }

  on(fn) {
    this.listeners.push(fn);
  }

  rod() {
    return RODS.find((r) => r.id === this.gear.rod) || RODS[0];
  }

  coolerCap() {
    return COOLERS[this.gear.cooler].cap;
  }

  coolerFull() {
    return this.cooler.length >= this.coolerCap();
  }

  addMoney(v) {
    this.money = Math.max(0, Math.round(this.money + v));
    if (v > 0) this.stats.earned += v;
  }

  speciesCaughtCount() {
    return SPECIES_IDS.filter((id) => this.journal[id]).length;
  }

  // Record a catch in the journal. Returns flags for the catch card.
  recordCatch(fish) {
    const j = this.journal[fish.species] || { count: 0, best: 0, bestLen: 0 };
    const isNew = j.count === 0;
    const isBest = fish.weight > j.best;
    j.count++;
    if (isBest) {
      j.best = fish.weight;
      j.bestLen = fish.length;
    }
    this.journal[fish.species] = j;
    this.stats.caught++;
    let legendNew = false;
    if (fish.legend && !this.legends[fish.legend]) {
      this.legends[fish.legend] = { weight: fish.weight, day: this.day };
      legendNew = true;
    }
    return { isNew, isBest: isBest && !isNew, legendNew };
  }

  // Evaluate challenge progress for an event. Returns newly completed challenges.
  event(ev) {
    const done = [];
    const complete = (id) => {
      if (this.challenges[id]) return;
      const c = CHALLENGES.find((x) => x.id === id);
      if (!c) return;
      this.challenges[id] = true;
      this.addMoney(c.reward);
      done.push(c);
    };
    switch (ev.type) {
      case 'catch': {
        const f = ev.fish;
        complete('first');
        if (f.species === 'sockeye') complete('sockeye');
        if (f.species === 'king' && f.weight >= 15) complete('king');
        if (f.species === 'pike') complete('pike');
        if (f.species === 'char') complete('char');
        if (f.species === 'halibut' && f.weight >= 40) complete('halibut');
        if (f.legend) complete('legend');
        const n = this.speciesCaughtCount();
        if (n >= 10) complete('ten');
        if (n >= SPECIES_IDS.length) complete('journal');
        break;
      }
      case 'sell':
        if (ev.count > 0) complete('sell');
        break;
      case 'perfect':
        complete('perfect');
        break;
      case 'buy':
        if (ev.kind === 'lure') complete('lure');
        break;
      case 'discover':
        if (ev.id === 'falls') complete('falls');
        break;
      case 'bearSurvived':
        complete('bear');
        break;
      case 'hunt':
        if (ev.animal === 'caribou') complete('caribou');
        if (ev.animal === 'moose') complete('moose');
        break;
      default:
        break;
    }
    for (const fn of this.listeners) fn(ev, done);
    return done;
  }

  currentChallenge() {
    return CHALLENGES.find((c) => !this.challenges[c.id]) || null;
  }

  // ---- persistence ----------------------------------------------------
  toJSON() {
    return {
      v: 1,
      money: this.money,
      cooler: this.cooler,
      trophies: this.trophies,
      journal: this.journal,
      legends: this.legends,
      hunted: this.hunted,
      gear: this.gear,
      discovered: this.discovered,
      challenges: this.challenges,
      stats: this.stats,
      time: this.time,
      day: this.day,
      player: this.player,
      car: this.car,
      health: this.health,
      started: this.started,
    };
  }

  save() {
    const s = storage();
    if (!s) return false;
    try {
      const json = JSON.stringify(this.toJSON());
      s.setItem(SAVE_KEY, json);
      mirror(SAVE_KEY, json);
      return true;
    } catch (e) {
      return false;
    }
  }

  hasSave() {
    const s = storage();
    if (!s) return false;
    try {
      const raw = s.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!d.started;
    } catch (e) {
      return false;
    }
  }

  load() {
    const s = storage();
    if (!s) return false;
    try {
      const raw = s.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return false;
      this.reset();
      Object.assign(this, {
        money: d.money ?? this.money,
        cooler: d.cooler || [],
        trophies: d.trophies || [],
        journal: d.journal || {},
        legends: d.legends || {},
        hunted: d.hunted || {},
        discovered: { ...this.discovered, ...(d.discovered || {}) },
        challenges: d.challenges || {},
        stats: { ...this.stats, ...(d.stats || {}) },
        time: d.time ?? this.time,
        day: d.day ?? 1,
        player: d.player || null,
        car: d.car || null,
        health: d.health ?? 100,
        started: !!d.started,
      });
      this.gear = { ...this.gear, ...(d.gear || {}) };
      return true;
    } catch (e) {
      return false;
    }
  }

  wipe() {
    const s = storage();
    if (s) {
      try {
        s.removeItem(SAVE_KEY);
      } catch (e) {
        /* ignore */
      }
    }
    mirror(SAVE_KEY, null);
    this.reset();
  }

  saveSettings() {
    const s = storage();
    if (!s) return;
    try {
      const json = JSON.stringify(this.settings);
      s.setItem(SETTINGS_KEY, json);
      mirror(SETTINGS_KEY, json);
    } catch (e) {
      /* ignore */
    }
  }

  loadSettings() {
    const s = storage();
    if (!s) return;
    try {
      const raw = s.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch (e) {
      /* ignore */
    }
  }
}
