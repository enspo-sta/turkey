// Where things are in the real sky over the Kenai Peninsula: the game's
// calendar and clock as a real date, the turning of the sky (local sidereal
// time), and the Sun, Moon and planets from astronomy-engine (MIT licence,
// Don Cross). Pure calculation, no rendering.
//
// Day 1 of the game is 20 August 2026; the clock is Alaska Daylight Time
// (eight hours behind universal time). The site is near Homer, 59.65 N,
// 151.5 W. The game's own sun follows a simplified summer day (world/sky.js);
// the stars, planets and Moon follow the real sky for the date and hour.
import * as THREE from 'three';
import { Body, Equator, Observer, MakeTime, SiderealTime, Illumination, MoonPhase, JupiterMoons, GeoVector } from 'astronomy-engine';

export const SITE = { lat: 59.65, lon: -151.5 };
const DAY1_UTC = Date.UTC(2026, 7, 20, 8, 0, 0);
const OBS = new Observer(SITE.lat, SITE.lon, 40);
const DEG = Math.PI / 180;

export function gameDate(day, hours) {
  return new Date(DAY1_UTC + ((day - 1) * 24 + hours) * 3600e3);
}

export function dateLabel(day) {
  const d = new Date(DAY1_UTC + (day - 1) * 86400e3);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Local sidereal time in hours: which right ascension is on the meridian.
export function siderealHours(date) {
  return (((SiderealTime(MakeTime(date)) + SITE.lon / 15) % 24) + 24) % 24;
}

// A direction on the sky (right ascension and declination in degrees) as a
// unit vector in the equatorial frame: x toward 0h, y toward 6h, z north.
export function eqVector(raDeg, decDeg, out = new THREE.Vector3()) {
  const r = raDeg * DEG;
  const d = decDeg * DEG;
  return out.set(Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d));
}

// The rotation from the equatorial frame to the game world (x east, y up,
// z south) at local sidereal time lst hours.
export function skyMatrix(lst, out = new THREE.Matrix3()) {
  const th = lst * 15 * DEG;
  const ph = SITE.lat * DEG;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const cp = Math.cos(ph);
  const sp = Math.sin(ph);
  // world = B * Rz(-lst) * eq: B takes the meridian point of the equator to
  // south-and-up, east to east and the pole to north-and-up
  const B = [
    [0, 1, 0],
    [cp, 0, sp],
    [sp, 0, -cp],
  ];
  const R = [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
  const m = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.push(B[i][0] * R[0][j] + B[i][1] * R[1][j] + B[i][2] * R[2][j]);
  return out.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
}

// Altitude and azimuth (degrees, azimuth from north through east) of a
// world direction.
export function altAz(v) {
  return { alt: Math.asin(Math.max(-1, Math.min(1, v.y))) / DEG, az: ((Math.atan2(v.x, -v.z) / DEG) + 360) % 360 };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compass(az) {
  return COMPASS[Math.round(az / 45) % 8];
}

export const PLANETS = [
  { id: 'mercury', body: Body.Mercury, name: 'Mercury', color: [1.0, 0.92, 0.82] },
  { id: 'venus', body: Body.Venus, name: 'Venus', color: [1.0, 0.98, 0.9] },
  { id: 'mars', body: Body.Mars, name: 'Mars', color: [1.0, 0.62, 0.42] },
  { id: 'jupiter', body: Body.Jupiter, name: 'Jupiter', color: [1.0, 0.94, 0.84] },
  { id: 'saturn', body: Body.Saturn, name: 'Saturn', color: [1.0, 0.9, 0.7] },
];

// Everything the sky needs at one moment: the planets, the Sun and the Moon
// as right ascension and declination (degrees, of date), their brightness,
// the Moon's phase.
export function skyAt(date) {
  const t = MakeTime(date);
  const eq = (b) => {
    const e = Equator(b, t, OBS, true, true);
    return { ra: e.ra * 15, dec: e.dec, dist: e.dist };
  };
  const planets = PLANETS.map((p) => {
    const e = eq(p.body);
    const il = Illumination(p.body, t);
    return { ...p, ...e, mag: il.mag, phase: il.phase_fraction, ringTilt: il.ring_tilt ?? 0 };
  });
  const sun = eq(Body.Sun);
  const moon = eq(Body.Moon);
  const mil = Illumination(Body.Moon, t);
  moon.phaseAngle = MoonPhase(t); // 0 new, 90 first quarter, 180 full
  moon.illum = mil.phase_fraction;
  moon.km = moon.dist * 149597870.7;
  return { date, lst: siderealHours(date), planets, sun, moon };
}

// The tide the Moon raises on the coast here, from about -1 (low water) to
// 1 (high): high water comes about five hours after the Moon crosses the
// meridian and again half a lunar day later (12 hours 25 minutes), the
// range is biggest (spring tides) a day or so after new and full Moon, when
// the Sun pulls in line with the Moon, and smallest (neap tides) after the
// quarters, and the two high waters of a day are unequal while the Moon
// stands far north or south of the celestial equator.
const TIDE_LAG = 72 * DEG;
export function lunarTide(date) {
  const t = MakeTime(date);
  const e = Equator(Body.Moon, t, OBS, true, true);
  const H = (siderealHours(date) - e.ra) * 15 * DEG;
  const age = MoonPhase(t) * DEG - 0.3;
  const range = 0.75 + 0.25 * Math.cos(2 * age);
  const d = Math.sin(e.dec * DEG);
  return { height: range * Math.cos(2 * (H - TIDE_LAG)) + 0.35 * d * Math.cos(H - TIDE_LAG), range };
}

// Jupiter's four big moons as seen from here: offsets in Jupiter radii,
// x toward celestial east, y toward north; behind tells which are farther
// than the planet (hidden when inside its disc).
export function jupiterMoonsView(date) {
  const t = MakeTime(date);
  const j = GeoVector(Body.Jupiter, t, true);
  const u = new THREE.Vector3(j.x, j.y, j.z).normalize();
  const north = new THREE.Vector3(0, 0, 1).addScaledVector(u, -u.z).normalize();
  const east = new THREE.Vector3().crossVectors(north, u).normalize();
  const R = 71492 / 149597870.7;
  const m = JupiterMoons(t);
  return ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
    const v = new THREE.Vector3(m[id].x, m[id].y, m[id].z);
    return { id, name: id[0].toUpperCase() + id.slice(1), x: v.dot(east) / R, y: v.dot(north) / R, behind: v.dot(u) > 0 };
  });
}
