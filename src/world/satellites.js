// Satellites after dark. Some evenings the International Space Station
// crosses the sky from west to east: 400 km up it is still in sunshine long
// after sunset down here, brighter than any star, until it slides into
// Earth's shadow and fades out in mid-sky, going orange as the sunlight
// reaching it passes through the air at the edge of the Earth. Its orbit is
// tilted 51.6 degrees to the equator, so it never comes further north than
// that: from here, 8 degrees further north, it always passes low through
// the southern sky, never more than about 20 degrees up. Fainter satellites
// in polar orbits drift over in any direction. Passes take a minute or so
// of real time (the game's clock would rush them past in seconds).
import * as THREE from 'three';
import { smoothstep } from '../util/math.js';
import { compass } from './astro.js';

const R_EARTH = 6371;
const DEG = Math.PI / 180;

function hash(n) {
  let x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Tonight's pass of the space station, if there is one: the game hour it
// rises, where it rises and sets (west to east through the south), how
// high it climbs and where.
export function issPass(night) {
  if (night < 1 || hash(night) > 0.62) return null;
  // (only in the hours either side of dusk and dawn: deeper in the night
  // it is in Earth's shadow down here in the south)
  const morning = hash(night + 0.5) < 0.3;
  const t0 = morning ? 3.0 + hash(night + 0.7) * 0.6 : 22.95 + hash(night + 0.9) * 0.65;
  const az0 = 235 + hash(night + 1.3) * 60;
  const az1 = 65 + hash(night + 1.7) * 60;
  const azm = 165 + hash(night + 1.9) * 30;
  const top = 9 + hash(night + 2.1) * 12;
  return { t0: t0 % 24, az0, az1, azm, top, dur: 70 };
}

export function passText(p) {
  const h = Math.floor(p.t0);
  const m = Math.floor((p.t0 - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}, rising in the ${compass(p.az0)}, up to ${Math.round(p.top)}° high in the ${compass(p.azm)}, setting in the ${compass(p.az1)}`;
}

const dirAt = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));

const vert = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  gl_PointSize = aSize;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  if (aAlpha < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = (exp(-dot(c, c) * 22.0) + 0.35 * exp(-dot(c, c) * 6.0)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Satellites {
  constructor(game) {
    this.game = game;
    this.n = 4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.n), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.n * 3).fill(1), 3));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = -8;
    game.scene.add(this.points);
    // slot 0 is the space station, the rest are passing satellites
    this.sats = Array.from({ length: this.n }, () => null);
    this.nextSat = 20;
    this.night = -1;
    this.pass = null;
    this.passT = -1;
    this.watched = 0;
    this.issDir = new THREE.Vector3();
    this.issVisible = false;
  }

  // Sunlight on something at height km above the ground in world direction
  // v: 1 in full sun, 0 in Earth's shadow, a soft orange edge between.
  sunlit(v, km) {
    const S = this.game.env.sunDir;
    const alt = Math.asin(Math.max(-1, Math.min(1, v.y)));
    const r = R_EARTH + km;
    const rho = Math.sqrt(r * r - (R_EARTH * Math.cos(alt)) ** 2) - R_EARTH * Math.sin(alt);
    // from the Earth's centre, the observer is straight up
    const px = v.x * rho;
    const py = R_EARTH + v.y * rho;
    const pz = v.z * rho;
    const along = px * S.x + py * S.y + pz * S.z;
    if (along >= 0) return 1;
    const off = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - along * along));
    return smoothstep(R_EARTH - 30, R_EARTH + 60, off);
  }

  update(dt) {
    const g = this.game;
    const env = g.env;
    const eye = g.camera.position;
    const night = env.spaceWeather.nightOf(env);
    if (night !== this.night) {
      this.night = night;
      this.pass = issPass(night);
      this.passT = -1;
      this.announced = false;
    }
    const pos = this.points.geometry.attributes.position;
    const alpha = this.points.geometry.attributes.aAlpha;
    const size = this.points.geometry.attributes.aSize;
    const col = this.points.geometry.attributes.aColor;
    this.points.position.copy(eye);
    const dpr = g.renderer.getPixelRatio();
    // ---- the space station
    const P = this.pass;
    this.issVisible = false;
    if (P && g.started) {
      // tell the player at dusk
      if (!this.announced && env.time > 21.3 && env.time < 22.9 && (P.t0 > 12 || P.t0 < 1)) {
        this.announced = true;
        g.hud?.toast(`The space station passes over tonight at ${passText(P)}`, 'good', 7);
      }
      const t = env.time;
      if (this.passT < 0 && Math.abs(t - P.t0) < 0.08 && !g.menuOpen) this.passT = 0;
      if (this.passT >= 0) {
        this.passT += dt;
        const u = this.passT / P.dur;
        if (u >= 1) this.passT = -2;
        else {
          // fastest overhead, slow near the horizons
          const s = 0.5 + (0.5 * Math.sin(1.25 * (2 * u - 1))) / Math.sin(1.25);
          const A = dirAt(P.az0, 4);
          const B = dirAt(P.az1, 4);
          const mid = dirAt(P.azm ?? 180, P.top);
          const v = s < 0.5 ? A.clone().lerp(mid, s * 2).normalize() : mid.clone().lerp(B, s * 2 - 1).normalize();
          const lit = this.sunlit(v, 420);
          const a = lit * smoothstep(0.02, 0.12, v.y) * smoothstep(0.2, 0.6, env.night) * (1 - env.weather.cloud * 0.6);
          pos.setXYZ(0, v.x * 2800, v.y * 2800, v.z * 2800);
          alpha.setX(0, a);
          // brighter than any star: a bigger, fuller point
          size.setX(0, (9 + 4 * v.y) * dpr);
          // going orange at the edge of the shadow
          col.setXYZ(0, 1, 0.75 + 0.22 * lit, 0.45 + 0.5 * lit);
          this.issDir.copy(v);
          this.issVisible = a > 0.3;
          // watched: the view on it for a couple of seconds
          if (this.issVisible && g.player.mode !== 'drive') {
            const look = g.camera.getWorldDirection(new THREE.Vector3());
            if (look.dot(v) > Math.cos(25 * DEG)) this.watched += dt;
            if (this.watched > 2 && !this.counted) {
              this.counted = true;
              const sky = g.state.sky;
              sky.iss = (sky.iss || 0) + 1;
              g.announcer?.say('iss', { sub: 'ROUND THE EARTH EVERY 92 MINUTES', kind: 'good' });
              g.onEvent?.({ type: 'iss' });
            }
          }
        }
      }
      if (this.passT < 0) alpha.setX(0, 0);
    } else alpha.setX(0, 0);
    if (this.passT < 0) {
      this.watched = 0;
      this.counted = false;
    }
    // ---- passing satellites, faint and steady
    const dark = env.night * (1 - env.weather.cloud);
    this.nextSat -= dt;
    if (this.nextSat <= 0 && dark > 0.5) {
      this.nextSat = 40 + Math.random() * 90;
      const k = 1 + this.sats.slice(1).findIndex((x) => !x);
      if (k > 0) {
        const az0 = Math.random() * 360;
        this.sats[k] = { az0, az1: az0 + 140 + Math.random() * 80, top: 30 + Math.random() * 55, t: 0, dur: 80 + Math.random() * 70, km: 500 + Math.random() * 700 };
      }
    }
    for (let k = 1; k < this.n; k++) {
      const S = this.sats[k];
      if (!S) {
        alpha.setX(k, 0);
        continue;
      }
      S.t += dt;
      const u = S.t / S.dur;
      if (u >= 1) {
        this.sats[k] = null;
        alpha.setX(k, 0);
        continue;
      }
      const s = 0.5 + (0.5 * Math.sin(1.1 * (2 * u - 1))) / Math.sin(1.1);
      const A = dirAt(S.az0, 6);
      const B = dirAt(S.az1 % 360, 6);
      const mid = dirAt((S.az0 + (S.az1 - S.az0) / 2) % 360, S.top);
      const v = s < 0.5 ? A.clone().lerp(mid, s * 2).normalize() : mid.clone().lerp(B, s * 2 - 1).normalize();
      pos.setXYZ(k, v.x * 2800, v.y * 2800, v.z * 2800);
      alpha.setX(k, 0.55 * this.sunlit(v, S.km) * smoothstep(0.05, 0.2, v.y) * dark);
      size.setX(k, 2.4 * dpr);
      col.setXYZ(k, 0.95, 0.97, 1);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
    size.needsUpdate = true;
    col.needsUpdate = true;
  }
}
