// Where the observatory's targets are right now, whether the telescope or
// the dish can reach them, and the sky log they go into.
import * as THREE from 'three';
import { eqVector, altAz, compass } from '../world/astro.js';
import { TARGETS, RADIO } from './skytargets.js';
import { smoothstep } from '../util/math.js';

const DEG = Math.PI / 180;
const PLANET_IDS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// The radio sources' places on the sky (right ascension, declination in
// degrees); Jupiter and the Sun are where they are, the Big Bang's
// afterglow is everywhere (the dish just looks straight up).
const RADIO_SKY = {
  pulsar: [53.247, 54.579],
  crab: [83.633, 22.015],
  hydrogen: [305.0, 40.0],
};

// A target's direction in the game world, now.
export function skyDir(g, T, out = new THREE.Vector3()) {
  const env = g.env;
  const A = env.astro;
  const M = env.uniforms.uEq.value;
  if (T.id === 'sun') return out.copy(env.sunDir);
  if (T.id === 'moon') return out.copy(env.uniforms.uMoonPos.value);
  const pid = T.planet || (T.id === 'jupiter' ? 'jupiter' : null);
  if (pid) {
    const p = A.planets.find((x) => x.id === pid);
    return eqVector(p.ra, p.dec, out).applyMatrix3(M);
  }
  if (T.id === 'cmb') return out.set(0, 1, 0);
  const pos = RADIO_SKY[T.id] || [T.ra, T.dec];
  return eqVector(pos[0], pos[1], out).applyMatrix3(M);
}

// Degrees from the real Sun.
function fromSun(g, dir) {
  const A = g.env.astro;
  const s = eqVector(A.sun.ra, A.sun.dec, new THREE.Vector3()).applyMatrix3(g.env.uniforms.uEq.value);
  return Math.acos(Math.max(-1, Math.min(1, s.dot(dir)))) / DEG;
}

const where = (alt, az) => `${Math.round(alt)}° up in the ${compass(az)}`;

// Can the telescope show it now? { ok, why, alt, az, dir, where }
export function targetStatus(g, T) {
  const env = g.env;
  const dir = skyDir(g, T);
  const { alt, az } = altAz(dir);
  const res = { ok: false, alt, az, dir, where: where(alt, az), why: '' };
  const cloud = env.weather.cloud;
  if (T.id === 'sun') {
    if (env.sunElevation < 3) res.why = 'Below the horizon';
    else if (cloud > 0.85) res.why = 'Clouded out. The radio dish hears the Sun through cloud';
    else res.ok = true;
    return res;
  }
  if (alt < 0) res.why = 'Below the horizon now';
  else if (alt < 6) res.why = `Too low: ${Math.round(alt)}° over the hills`;
  else if (fromSun(g, dir) < 12) res.why = 'Too close to the Sun to point at safely';
  else if (T.when === 'dark' && env.night < 0.6) res.why = env.sunElevation > -2 ? 'Needs a dark sky: come back after 23:00' : 'Too light still: wait for full dark';
  else if (cloud > 0.85) res.why = 'Clouded out. Try the radio telescope';
  else res.ok = true;
  return res;
}

// Can the dish hear it now?
export function radioStatus(g, R) {
  const env = g.env;
  const dir = skyDir(g, R);
  const { alt, az } = altAz(dir);
  const res = { ok: false, alt, az, dir, where: R.id === 'cmb' ? 'Everywhere: the dish looks straight up' : where(alt, az), why: '' };
  if (R.id === 'sun') {
    if (env.sunElevation < 3) res.why = 'The Sun has set';
    else res.ok = true;
  } else if (alt < 5) res.why = 'Below the horizon now';
  else res.ok = true;
  return res;
}

// The day's light behind the eyepiece view: 0 at night, 1 in full day.
export function dayLight(env) {
  return smoothstep(-6, 6, env.sunElevation);
}

export function planetsSeen(sky) {
  return PLANET_IDS.filter((id) => sky.seen[id]).length;
}

// Log what the telescope shows: new objects pay the observatory's small
// bounty and count toward the challenges. Returns true when new.
export function logSeen(g, T) {
  const s = g.state;
  const sky = s.sky;
  if (sky.seen[T.id]) return false;
  sky.seen[T.id] = g.env.day;
  s.addMoney(20);
  g.audio?.chime();
  const count = Object.keys(sky.seen).length;
  const planets = planetsSeen(sky);
  if (planets === 5 && T.planet) g.announcer?.say('planets', { sub: 'MERCURY TO SATURN', kind: 'legend' });
  else g.announcer?.say('scope', { sub: T.name.toUpperCase(), kind: 'good' });
  g.hud?.toast(`${T.name} logged: ${count} of ${TARGETS.length} in the sky log. The observatory pays $20 for each new one`, 'money', 5);
  g.onEvent?.({ type: 'scope', id: T.id, count, planets });
  g.save?.();
  return true;
}

export function logHeard(g, R) {
  const s = g.state;
  const sky = s.sky;
  if (sky.heard[R.id]) return false;
  sky.heard[R.id] = g.env.day;
  s.addMoney(15);
  const count = Object.keys(sky.heard).length;
  g.hud?.toast(`${R.name} heard: ${count} of ${RADIO.length} radio sources logged (+$15)`, 'money', 4);
  g.onEvent?.({ type: 'radio', id: R.id, count });
  g.save?.();
  return true;
}
