// Tables for the report: each night's Kp, space station pass, Moon and tide.
import { kpForNight, KP_WORDS } from '../src/world/spaceweather.js';
import { issPass, passText } from '../src/world/satellites.js';
import { almanac } from '../src/gameplay/tonight.js';
import { dateLabel } from '../src/world/astro.js';
const rows = [];
for (let n = 1; n <= 14; n++) {
  const A = almanac(n);
  const p = issPass(n);
  rows.push({ night: n, date: dateLabel(n), kp: kpForNight(n), kpWords: KP_WORDS[kpForNight(n)], iss: p ? passText(p) : null, moon: `${A.moon.name}, ${Math.round(A.moon.illum * 100)}%`, tide: A.tide.spring ? 'spring' : A.tide.neap ? 'neap' : 'between', highs: A.tide.highs, planets: A.planets.filter((x) => x.up).map((x) => x.name) });
}
console.log(JSON.stringify(rows, null, 1));
