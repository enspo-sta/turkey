// Space weather for the aurora. The northern lights are electrons from the
// solar wind, steered by Earth's magnetic field down into the upper air,
// where they make oxygen glow green (about 100 to 200 km up) and, in big
// storms, red (above 200 km), and nitrogen violet at the lower edge. How
// stirred up the field is, is measured by the planetary K index, Kp, from 0
// (quiet) to 9 (a great storm). Each night here gets its own Kp; through the
// night the aurora brightens and fades in substorms.
import { clamp, smoothstep, lerp } from '../util/math.js';

// Kp for game night n (the evening of day n and the small hours after it),
// the same every time: quiet nights are common, storms rare.
export function kpForNight(n) {
  let x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  x -= Math.floor(x);
  // the first two nights are kind to a newcomer
  if (n === 1) return 4;
  if (n === 2) return 2;
  const table = [
    [0.18, 1],
    [0.38, 2],
    [0.58, 3],
    [0.74, 4],
    [0.86, 5],
    [0.94, 6],
    [0.98, 7],
    [1.01, 8],
  ];
  return table.find(([p]) => x < p)[1];
}

export const KP_WORDS = ['quiet', 'quiet', 'quiet', 'unsettled', 'active', 'minor storm', 'moderate storm', 'strong storm', 'severe storm', 'extreme storm'];

export class SpaceWeather {
  constructor() {
    this.kp = 3;
    this.night = -1;
    this.burst = 0;
    this.burstT = 30;
    this.t = 0;
  }

  // Which night it is: the evening of the day, or the small hours of the next.
  nightOf(env) {
    return env.time < 12 ? env.day - 1 : env.day;
  }

  update(env, dt) {
    const n = this.nightOf(env);
    if (n !== this.night) {
      this.night = n;
      this.kp = kpForNight(Math.max(1, n));
    }
    this.t += dt;
    // substorms: every few minutes the curtains flare up for a while
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 50 + Math.random() * 120;
      this.burst = 1;
    }
    this.burst = Math.max(0, this.burst - dt / 25);
    const kp = this.kp;
    const base = kp <= 1 ? 0.15 : lerp(0.35, 1.2, clamp((kp - 2) / 6, 0, 1));
    const wave = 0.65 + 0.35 * Math.sin(this.t * 0.05) * Math.sin(this.t * 0.013 + 1);
    return {
      kp,
      strength: base * wave * (1 + 0.6 * this.burst * smoothstep(2, 5, kp)),
      reach: smoothstep(3.5, 7.5, kp),
      red: smoothstep(5, 8, kp),
    };
  }
}
