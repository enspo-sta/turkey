// The observatory's almanac: what the coming night holds over the Kenai
// Peninsula. The Moon and the planets come from the real sky for the game's
// date (world/astro.js; the game's clock is Alaska Daylight Time, so a real
// rise or set time reads straight off it), the aurora from the night's space
// weather, the space station from its pass list. The Sun keeps the game's own
// summer day: down at 22:00, dark from about 23:00 to 04:00, up at 05:00.
import { Body, Equator, Horizon, Observer, MakeTime, SearchRiseSet, MoonPhase, Illumination } from 'astronomy-engine';
import { SITE, gameDate, dateLabel, compass, lunarTide } from '../world/astro.js';
import { kpForNight, KP_WORDS } from '../world/spaceweather.js';
import { issPass, passText } from '../world/satellites.js';

const OBS = new Observer(SITE.lat, SITE.lon, 40);

// The night to come: this evening's, or the one under way in the small hours.
export function upcomingNight(env) {
  return env.time < 5 ? env.day - 1 : env.day;
}

export function clock(h) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.floor((t - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function phaseName(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a < 11 || a >= 349) return 'New Moon';
  if (a < 79) return 'Waxing crescent';
  if (a < 101) return 'First quarter';
  if (a < 169) return 'Waxing gibbous';
  if (a < 191) return 'Full Moon';
  if (a < 259) return 'Waning gibbous';
  if (a < 281) return 'Last quarter';
  return 'Waning crescent';
}

// Game hours from the start of game day `day` to a real moment.
function hoursOf(day, time) {
  return (time.date.getTime() - gameDate(day, 0).getTime()) / 3600e3;
}

function altAzOf(body, date) {
  const t = MakeTime(date);
  const e = Equator(body, t, OBS, true, true);
  const h = Horizon(t, OBS, e.ra, e.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}

const PLANET_BODIES = [
  ['mercury', 'Mercury', Body.Mercury],
  ['venus', 'Venus', Body.Venus],
  ['mars', 'Mars', Body.Mars],
  ['jupiter', 'Jupiter', Body.Jupiter],
  ['saturn', 'Saturn', Body.Saturn],
];

// Everything about night n (the evening of game day n and the small hours
// after it).
export function almanac(n) {
  const night = Math.max(1, n);
  const dusk = gameDate(night, 22);
  // the Moon: phase at midnight, and when it is up between noon and noon
  const mid = MakeTime(gameDate(night, 24));
  const phase = MoonPhase(mid);
  const illum = Illumination(Body.Moon, mid).phase_fraction;
  const from = MakeTime(gameDate(night, 12));
  const rise = SearchRiseSet(Body.Moon, OBS, +1, from, 1);
  const set = SearchRiseSet(Body.Moon, OBS, -1, from, 1);
  const moonAtDusk = altAzOf(Body.Moon, dusk).alt > 0;
  const moon = {
    phase,
    name: phaseName(phase),
    illum,
    rise: rise ? hoursOf(night, rise) : null,
    set: set ? hoursOf(night, set) : null,
    upAtDusk: moonAtDusk,
  };
  // the planets through the night: highest point and where
  const hours = [];
  for (let h = 22.5; h <= 28.5; h += 0.5) hours.push(h);
  const planets = PLANET_BODIES.map(([id, name, body]) => {
    let best = { alt: -90 };
    for (const h of hours) {
      const p = altAzOf(body, gameDate(night, h));
      if (p.alt > best.alt) best = { ...p, h };
    }
    const mag = Illumination(body, MakeTime(gameDate(night, 24))).mag;
    return { id, name, mag, alt: best.alt, az: best.az, h: best.h, up: best.alt > 3 };
  });
  // high water over the night and the next morning (from 18:00 to 12:00)
  const highs = [];
  let prev2 = lunarTide(gameDate(night, 17.5)).height;
  let prev = lunarTide(gameDate(night, 17.75)).height;
  for (let h = 18; h <= 36; h += 0.25) {
    const cur = lunarTide(gameDate(night, h)).height;
    if (prev > prev2 && prev >= cur) highs.push(h - 0.25);
    prev2 = prev;
    prev = cur;
  }
  const range = lunarTide(gameDate(night, 24)).range;
  const tide = { highs, range, spring: range > 0.92, neap: range < 0.58 };
  const kp = kpForNight(night);
  const iss = issPass(night);
  return {
    night,
    date: dateLabel(night),
    moon,
    planets,
    tide,
    kp,
    kpWords: KP_WORDS[kp],
    iss,
    issText: iss ? passText(iss) : null,
  };
}

// The almanac as lines of text, for the notice board and the screen.
export function almanacLines(A) {
  const lines = [];
  const m = A.moon;
  let moonLine = `${m.name}, ${Math.round(m.illum * 100)}% lit`;
  if (m.rise !== null && m.set !== null) {
    if (m.rise < m.set) moonLine += `: up from ${clock(m.rise)} to ${clock(m.set)}`;
    else moonLine += `: sets ${clock(m.set)}, rises ${clock(m.rise)}`;
  } else if (m.rise !== null) moonLine += `: rises ${clock(m.rise)}`;
  else if (m.set !== null) moonLine += `: sets ${clock(m.set)}`;
  lines.push(['Moon', moonLine]);
  const up = A.planets.filter((p) => p.up);
  lines.push([
    'Planets',
    up.length
      ? up.map((p) => `${p.name} ${Math.round(p.alt)}° up in the ${compass(p.az)} around ${clock(p.h)}`).join('; ')
      : 'None well placed tonight. The telescope finds the bright ones by day',
  ]);
  lines.push(['Aurora', `Kp ${A.kp}, ${A.kpWords}${A.kp >= 5 ? ': the lights may reach overhead and turn red at the top' : A.kp >= 4 ? ': good chances to the north' : A.kp >= 3 ? ': a glow low in the north' : ': faint if any'}`]);
  lines.push(['Space station', A.issText ? `Visible pass at ${A.issText}` : 'No visible pass tonight']);
  const T = A.tide;
  if (T) lines.push(['Tide', `High water ${T.highs.map(clock).join(' and ')}. ${T.spring ? 'Spring tides: the Sun and Moon pull in line, the biggest range and the strongest currents' : T.neap ? 'Neap tides: the Sun and Moon pull at right angles, a small range' : 'Between spring and neap tides'}. Bottom fish feed on the running tide`]);
  lines.push(['Meteors', 'A shooting star every half minute or so after dark. A fireball some nights; its stone can be found']);
  return lines;
}
