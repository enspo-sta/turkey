// How hungry the fish are right now. Fish feed hardest at dawn and dusk,
// when a front rolls in and with rain on the water; they sulk deep under a
// bright midday sun and go quiet at night. On the salt water the tide
// matters most: moving water feeds the bottom fish, slack water does not.
import { clamp } from '../util/math.js';
import { lunarTide, gameDate } from '../world/astro.js';

export const BITE_LEVELS = [
  { id: 'slow', label: 'SLOW', min: 0 },
  { id: 'fair', label: 'FAIR', min: 0.85 },
  { id: 'good', label: 'GOOD', min: 1.25 },
  { id: 'hot', label: 'HOT', min: 1.8 },
];

// The tide, raised by the real Moon (see world/astro.js): two high waters a
// lunar day, spring tides after new and full Moon and neap tides after the
// quarters. flow above zero: the tide is coming in; near 1 or -1 at full
// run. Worked out once every two game minutes.
const _tide = { key: null, v: null };
export function tideAt(day, hour) {
  const key = Math.round(((day - 1) * 24 + hour) * 30);
  if (_tide.key === key) return _tide.v;
  const now = lunarTide(gameDate(day, hour));
  const a = lunarTide(gameDate(day, hour - 0.1));
  const b = lunarTide(gameDate(day, hour + 0.1));
  // the fastest the height can change: twice the Moon's 14.5 degrees an hour
  const flow = clamp((b.height - a.height) / 0.2 / (0.506 * Math.max(0.75, now.range)), -1, 1);
  _tide.key = key;
  _tide.v = { height: now.height, flow, range: now.range, spring: now.range > 0.92, neap: now.range < 0.58 };
  return _tide.v;
}

// The part of the day that decides the bite.
export function partOfDay(hour, night) {
  if (hour >= 4.5 && hour < 8.5) return 'dawn';
  if (hour >= 19 && hour < 22.5) return 'dusk';
  if (night) return 'night';
  if (hour >= 11 && hour < 16) return 'midday';
  return 'day';
}

// The bite at a time and in a weather. water is the kind of water being
// fished ('river', 'ocean' or a lake id), for the tide.
export function biteOutlook(env, water = null) {
  const hour = env.time;
  const w = env.weather;
  const tod = partOfDay(hour, env.night > 0.5);
  const reasons = [];
  let k = 1;
  if (tod === 'dawn') {
    k *= 1.6;
    reasons.push('Dawn bite');
  } else if (tod === 'dusk') {
    k *= 1.5;
    reasons.push('Evening rise');
  } else if (tod === 'night') {
    k *= 0.72;
    reasons.push(water === 'ocean' ? 'Night: slow, but the dogfish come in close' : 'Night: slow, but the burbot prowl');
  } else if (tod === 'midday' && w.cloud < 0.45 && w.rain < 0.08) {
    k *= 0.7;
    reasons.push('Bright midday sun: the fish sulk deep');
  }
  // a front coming in: the clouds or the rain are building
  const front = w.cloudTarget - w.cloud > 0.2 || w.rainTarget - w.rain > 0.25;
  // and the other side of it: the rain is easing off under a clearing sky
  const clearing = w.rain > 0.08 && w.rainTarget < w.rain - 0.15;
  if (front) {
    k *= 1.45;
    reasons.push('A front is rolling in');
  }
  if (w.rain > 0.6) {
    k *= 1.1;
    reasons.push('Pouring rain');
  } else if (w.rain > 0.08) {
    k *= 1.3;
    reasons.push('Rain on the water');
  } else if (w.cloud > 0.6) {
    k *= 1.15;
    reasons.push('Grey sky: the fish are bolder');
  } else if (w.cloud < 0.25 && tod === 'day') {
    k *= 0.85;
    reasons.push('Bluebird sky');
  }
  if (clearing) {
    k *= 0.85;
    reasons.push('Clearing behind the rain');
  }
  let tide = null;
  if (water === 'ocean') {
    tide = tideAt(env.day, hour);
    const f = Math.abs(tide.flow);
    if (f > 0.6) {
      k *= tide.spring ? 1.45 : 1.35;
      reasons.push(tide.spring ? `Spring tide ${tide.flow > 0 ? 'flooding' : 'ebbing'} hard` : tide.flow > 0 ? 'Flood tide running' : 'Ebb tide running');
    } else if (f < 0.25) {
      k *= 0.7;
      reasons.push(tide.height > 0 ? 'Slack high tide' : 'Slack low tide');
    }
  }
  // four hours of luck from the fairy ring (see world/oddities.js)
  if (env.luckUntil && env.day * 24 + hour < env.luckUntil) {
    k *= 1.5;
    reasons.push('Fairy luck');
  }
  k = clamp(k, 0.4, 3);
  let level = BITE_LEVELS[0];
  for (const L of BITE_LEVELS) if (k >= L.min) level = L;
  if (!reasons.length) reasons.push('An ordinary day on the water');
  return { k, level, reasons, tod, rain: w.rain, cloud: w.cloud, front, tide };
}

// Species that keep their own hours: each one's share of the bites given
// the outlook. Keys are a part of the day, 'rain', 'cloud' or 'tide'.
export const MOODS = {
  pink: { dawn: 1.4, rain: 1.3 },
  sockeye: { dawn: 1.5, rain: 1.3 },
  coho: { dawn: 1.3, rain: 1.5, cloud: 1.2 },
  king: { dawn: 1.6, dusk: 1.3, midday: 0.6 },
  chum: { rain: 1.4, dusk: 1.2 },
  rainbow: { dusk: 1.5, cloud: 1.3, midday: 0.7 },
  dolly: { dawn: 1.2, rain: 1.2 },
  grayling: { day: 1.3, midday: 1.5, night: 0.4 },
  char: { dawn: 1.3, cloud: 1.2 },
  laker: { dawn: 1.4, dusk: 1.2 },
  pike: { day: 1.3, midday: 1.6, dawn: 0.8 },
  burbot: { night: 1.5, dusk: 1.2 },
  halibut: { tide: 1.6 },
  lingcod: { tide: 1.4, dusk: 1.2 },
  yelloweye: { tide: 1.2, dawn: 1.2 },
  cod: { tide: 1.3 },
  steelhead: { rain: 1.6, cloud: 1.2, midday: 0.7 },
  cutthroat: { dusk: 1.3, tide: 1.2 },
  whitefish: { day: 1.2 },
  kokanee: { dawn: 1.5 },
  blackrock: { tide: 1.3, day: 1.1 },
  quillback: { tide: 1.2 },
  greenling: { day: 1.2 },
  flounder: { tide: 1.4 },
  sculpin: { day: 1.1 },
  dogfish: { night: 1.6, dusk: 1.4 },
  skate: { tide: 1.5, night: 1.3 },
  salmonshark: { dawn: 1.3, tide: 1.3 },
  blackfish: { cloud: 1.3, rain: 1.2 },
  sheefish: { dusk: 1.6, cloud: 1.2 },
  wolfeel: { tide: 1.5, night: 1.4 },
};

export function speciesMood(id, out) {
  const m = MOODS[id];
  if (!m) return 1;
  let k = m[out.tod] || 1;
  if (m.rain && out.rain > 0.08) k *= m.rain;
  if (m.cloud && out.cloud > 0.6) k *= m.cloud;
  if (m.tide && out.tide && Math.abs(out.tide.flow) > 0.6) k *= m.tide;
  return k;
}

const WORDS = { dawn: 'dawn', dusk: 'dusk', night: 'night', midday: 'midday', day: 'daytime', rain: 'rain', cloud: 'grey skies', tide: 'running tide' };

// The best time for a species, in a word or two ('dawn', 'running tide').
export function bestTime(id) {
  const m = MOODS[id];
  if (!m) return '';
  let best = null;
  let bk = 1.15;
  for (const [key, v] of Object.entries(m)) {
    if (v > bk) {
      bk = v;
      best = key;
    }
  }
  return best ? WORDS[best] : '';
}
