// Which planets the observatory can show on each game day: highest altitude
// with the Sun at least 12 degrees away (as the telescope requires), by day and in the game's night.
import { Body, Equator, Horizon, Observer, MakeTime, AngleFromSun, Illumination } from 'astronomy-engine';
const OBS = new Observer(59.65, -151.5, 40);
const DAY1 = Date.UTC(2026, 7, 20, 8, 0, 0);
const P = { Mercury: Body.Mercury, Venus: Body.Venus, Mars: Body.Mars, Jupiter: Body.Jupiter, Saturn: Body.Saturn };
for (let day = 1; day <= 61; day += 3) {
  const row = [];
  for (const [name, b] of Object.entries(P)) {
    let bestDay = -90, bestNight = -90;
    for (let h = 0; h < 24; h += 0.25) {
      const t = MakeTime(new Date(DAY1 + ((day - 1) * 24 + h) * 3600e3));
      const e = Equator(b, t, OBS, true, true);
      const hz = Horizon(t, OBS, e.ra, e.dec, 'normal');
      const elong = AngleFromSun(b, t);
      if (elong < 12) continue;
      const night = h >= 22.5 || h < 4.5;
      if (night) bestNight = Math.max(bestNight, hz.altitude);
      else bestDay = Math.max(bestDay, hz.altitude);
    }
    const t0 = MakeTime(new Date(DAY1 + (day - 1) * 24 * 3600e3));
    row.push(`${name.slice(0, 3)} d${bestDay.toFixed(0).padStart(3)} n${bestNight.toFixed(0).padStart(3)} m${Illumination(b, t0).mag.toFixed(1)}`);
  }
  console.log(`day ${String(day).padStart(2)} ${new Date(DAY1 + (day - 1) * 864e5).toISOString().slice(0, 10)}  ${row.join(' | ')}`);
}
