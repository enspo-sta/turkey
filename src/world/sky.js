// Sky dome (gradient, sun, moon, clouds, stars, aurora), lights, fog and the
// day/night cycle. Colours are keyed by sun elevation.
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { clamp, lerp, smoothstep, DEG } from '../util/math.js';
import { gameDate, skyAt, skyMatrix, eqVector, SITE } from './astro.js';
import { Starfield, milkyWayTexture } from './stars.js';
import { SpaceWeather } from './spaceweather.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uGlow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform float uNight;
uniform float uAurora;
uniform float uTime;
uniform float uRainbow;
uniform float uSunVeil;
uniform sampler2D uCloudTex;
uniform sampler2D uMilkyWay;
uniform mat3 uEq;
uniform vec3 uMoonPos;
uniform vec3 uMoonSun;
uniform vec3 uMoonUp;
uniform float uMoonSize;
uniform float uAuroraReach;
uniform float uAuroraRed;
varying vec3 vDir;

// The Moon's near side as seen from here: the dark seas (maria) where old
// lava flooded the great basins, and Tycho's bright young crater. p is the
// disc from -1 to 1, x toward the west on the sky, y toward celestial north.
float moonAlbedo(vec2 p) {
  float a = 1.0;
  a -= 0.3 * smoothstep(0.28, 0.0, length(p - vec2(-0.32, 0.42)));
  a -= 0.28 * smoothstep(0.17, 0.0, length(p - vec2(0.18, 0.4)));
  a -= 0.3 * smoothstep(0.2, 0.0, length(p - vec2(0.33, 0.12)));
  a -= 0.28 * smoothstep(0.11, 0.0, length(p - vec2(0.68, 0.3)));
  a -= 0.22 * smoothstep(0.14, 0.0, length(p - vec2(0.55, -0.12)));
  a -= 0.2 * smoothstep(0.17, 0.0, length(p - vec2(-0.12, -0.3)));
  a -= 0.25 * smoothstep(0.42, 0.0, length((p - vec2(-0.62, 0.12)) * vec2(1.0, 0.7)));
  a -= 0.18 * smoothstep(0.1, 0.0, length(p - vec2(-0.42, -0.38)));
  a += 0.22 * smoothstep(0.06, 0.0, length(p - vec2(-0.12, -0.72)));
  return a;
}

// Hue from violet (0) to red (1).
vec3 spectrum(float x) {
  float hue = (1.0 - x) * 0.78;
  return clamp(abs(fract(hue + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hc = max(h, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hc, 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.18, h));

  float sd = dot(d, uSunDir);
  float sdc = max(sd, 0.0);
  float horizonBoost = 1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.35, abs(h)));
  col += uGlow * (pow(sdc, 5.0) * 0.45 + pow(sdc, 48.0) * 0.8) * horizonBoost;
  float disc = smoothstep(0.99925, 0.99965, sd);
  col += uSunColor * disc * 7.0 * smoothstep(-0.03, 0.02, uSunDir.y) * (1.0 - 0.6 * uSunVeil);

  // the Milky Way: our own galaxy seen edge-on from inside, looked up in
  // the sky's own frame so it turns with the stars (the stars themselves
  // are points drawn over the sky: world/stars.js)
  if (uNight > 0.01 && h > -0.02) {
    vec3 e = transpose(uEq) * d;
    vec2 muv = vec2(atan(e.y, e.x) / 6.2831853, 0.5 + asin(clamp(e.z, -1.0, 1.0)) / 3.1415927);
    float mw = texture2D(uMilkyWay, muv).r;
    float moonUp = smoothstep(-0.05, 0.1, uMoonPos.y);
    col += vec3(0.075, 0.08, 0.1) * mw * uNight * smoothstep(0.0, 0.2, h) * (1.0 - 0.55 * moonUp);
  }

  // the Moon where it really is, lit from where the Sun really is: its
  // phase, the seas on its face, a faint earthshine on the dark side
  float md = dot(d, uMoonPos);
  if (md > uMoonSize - 0.0002 && h > -0.03) {
    vec3 right = normalize(cross(uMoonPos, uMoonUp));
    vec3 o = d - uMoonPos * md;
    float R = sqrt(1.0 - uMoonSize * uMoonSize);
    vec2 mp = vec2(dot(o, right), dot(o, uMoonUp)) / R;
    float rr = dot(mp, mp);
    if (rr < 1.0) {
      vec3 n = right * mp.x + uMoonUp * mp.y - uMoonPos * sqrt(1.0 - rr);
      float lit = smoothstep(-0.04, 0.12, dot(n, uMoonSun));
      float edge = smoothstep(1.0, 0.94, rr);
      vec3 mc = vec3(0.95, 0.93, 0.88) * moonAlbedo(mp) * (lit * 1.5 + 0.035 * uNight);
      col = mix(col, col * (1.0 - 0.9 * uNight * edge) + mc * (0.45 + 0.55 * uNight), edge);
    }
  }
  col += vec3(0.15, 0.2, 0.3) * pow(max(md, 0.0), 160.0) * uNight * 0.6 * smoothstep(-0.05, 0.05, uMoonPos.y) * (0.25 + 0.75 * smoothstep(-0.2, 0.6, dot(uMoonPos, -uMoonSun)));

  // aurora borealis: curtains in the northern sky
  // in a geomagnetic storm the curtains reach overhead and south, with red
  // oxygen glow high above the green
  // (the azimuth jumps from pi to -pi in the south: the texture lookups go
  // round a whole number of times, and their filtering is told how fast the
  // azimuth really changes, so no seam shows when a storm reaches south)
  float az = atan(d.x, -d.z);
  float dax = dFdx(az);
  float day = dFdy(az);
  dax -= 6.2831853 * floor(dax / 6.2831853 + 0.5);
  day -= 6.2831853 * floor(day / 6.2831853 + 0.5);
  if (uAurora > 0.01 && h > 0.0) {
    float north = smoothstep(-0.3 - uAuroraReach * 1.2, 0.5 - uAuroraReach * 0.7, -d.z);
    vec3 acc = vec3(0.0);
    const float K1 = 0.31830989;
    const float K2 = 3.0239439;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float curtain = textureGrad(uCloudTex, vec2(az * K1 + fi * 0.31 + uTime * 0.004, 0.2 + fi * 0.13), vec2(dax * K1, 0.0), vec2(day * K1, 0.0)).r;
      float wave = sin(az * (7.0 + fi * 3.0) + curtain * 7.0 + uTime * (0.25 + fi * 0.07)) * 0.5 + 0.5;
      float base = (0.16 + fi * 0.05 + curtain * 0.1) * (1.0 + uAuroraReach * 0.8);
      float el = h - base;
      float v = smoothstep(-0.015, 0.02, el) * exp(-max(el, 0.0) * (5.0 + fi * 2.0));
      float streak = textureGrad(uCloudTex, vec2(az * K2 + fi, uTime * 0.02), vec2(dax * K2, 0.0), vec2(day * K2, 0.0)).g;
      v *= 0.35 + 0.65 * wave * (0.6 + 0.8 * streak);
      vec3 c = mix(vec3(0.15, 1.0, 0.5), mix(vec3(0.55, 0.25, 0.95), vec3(0.95, 0.2, 0.3), uAuroraRed), smoothstep(0.02, 0.28, el));
      acc += c * v;
    }
    col += acc * uAurora * north * 0.9;
  }

  // a rainbow opposite the sun as a shower passes: the primary bow at 42
  // degrees (red outside), a fainter secondary at 51 with the colours
  // reversed, brighter sky inside the bow and a darker band between them
  if (uRainbow > 0.001 && h > -0.02) {
    float ang = degrees(acos(clamp(dot(d, -uSunDir), -1.0, 1.0)));
    float p1 = (ang - 40.3) / 2.2;
    float p2 = (54.0 - ang) / 3.4;
    vec3 bow = spectrum(clamp(p1, 0.0, 1.0)) * smoothstep(-0.25, 0.15, p1) * (1.0 - smoothstep(0.85, 1.25, p1));
    bow += spectrum(clamp(p2, 0.0, 1.0)) * smoothstep(-0.25, 0.15, p2) * (1.0 - smoothstep(0.85, 1.25, p2)) * 0.4;
    float inside = 1.0 - smoothstep(38.0, 41.0, ang);
    float band = smoothstep(42.0, 43.5, ang) * (1.0 - smoothstep(49.0, 50.5, ang));
    float k = uRainbow * smoothstep(-0.02, 0.06, h);
    vec3 light = uSunColor * 0.12;
    col = col * (1.0 + k * (0.08 * inside - 0.06 * band)) + bow * light * k;
  }

  // clouds
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.09);
    float n1 = texture2D(uCloudTex, uv * 0.11 - vec2(uTime * 0.0012, uTime * 0.0006)).r;
    float n2 = texture2D(uCloudTex, uv * 0.31 - vec2(uTime * 0.002, uTime * 0.001)).g;
    float n = n1 * 0.7 + n2 * 0.3;
    float thr = 0.72 - uCloudCover * 0.46;
    float cov = smoothstep(thr, thr + 0.16, n);
    // the cloud whose shadow the player stands in, over the sun
    cov = max(cov, uSunVeil * smoothstep(0.985 + 0.012 * (1.0 - n), 0.9985, sd));
    cov *= smoothstep(0.0, 0.1, h);
    float lit = 0.5 + 0.5 * pow(sdc, 3.0);
    // thin edges let the light through, thick cores go grey underneath
    vec3 cc = mix(uCloudShade, uCloudLit, lit * (1.0 - 0.45 * smoothstep(thr + 0.05, thr + 0.4, n)));
    cc += uGlow * pow(sdc, 8.0) * 0.6 * (1.0 - cov * 0.5);
    col = mix(col, cc, cov * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef TONE_MAPPING
    // fine noise against banding where the colour goes straight to the 8-bit screen (Medium and Low; High's finish does its own)
    gl_FragColor.rgb += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  #endif
}`;

// Keyframes by sun elevation in degrees. Colours are sRGB hex.
const KEYS = [
  {
    e: -18,
    zenith: 0x040814,
    horizon: 0x0c1528,
    ground: 0x070a12,
    glow: 0x000000,
    sun: 0x000000,
    light: 0x6f86b8,
    lightI: 0.2,
    hemiSky: 0x223458,
    hemiGround: 0x08090e,
    hemiI: 0.32,
    fog: 0x0b1322,
    cloudLit: 0x1a2236,
    cloudShade: 0x0a0e18,
  },
  {
    e: -6,
    zenith: 0x0f1d44,
    horizon: 0x3c4d78,
    ground: 0x141a2a,
    glow: 0x6a3a40,
    sun: 0x000000,
    light: 0x8098c8,
    lightI: 0.28,
    hemiSky: 0x3c4c74,
    hemiGround: 0x121319,
    hemiI: 0.45,
    fog: 0x2e3a5a,
    cloudLit: 0x5a4a66,
    cloudShade: 0x202840,
  },
  {
    e: 1,
    zenith: 0x355a92,
    horizon: 0xe8a070,
    ground: 0x3a3532,
    glow: 0xff7a3a,
    sun: 0xff9a50,
    light: 0xff9a60,
    lightI: 1.3,
    hemiSky: 0x8a90b0,
    hemiGround: 0x3a2e28,
    hemiI: 0.75,
    fog: 0xc89a88,
    cloudLit: 0xffb080,
    cloudShade: 0x5a5070,
  },
  {
    e: 8,
    zenith: 0x3d6db0,
    horizon: 0xd8c8b8,
    ground: 0x56573f,
    glow: 0xffb070,
    sun: 0xffd8a0,
    light: 0xffd2a0,
    lightI: 2.2,
    hemiSky: 0xa8bcd8,
    hemiGround: 0x4a4636,
    hemiI: 0.9,
    fog: 0xbcc4cc,
    cloudLit: 0xfff0e0,
    cloudShade: 0x8890a4,
  },
  {
    e: 25,
    zenith: 0x3a74c4,
    horizon: 0xc4d8ea,
    ground: 0x5e6448,
    glow: 0xfff0d0,
    sun: 0xfff4e0,
    light: 0xfff2e2,
    lightI: 2.8,
    hemiSky: 0xbcd4f0,
    hemiGround: 0x56603c,
    hemiI: 1.0,
    fog: 0xbdd0e0,
    cloudLit: 0xffffff,
    cloudShade: 0xa4b0c2,
  },
  {
    e: 60,
    zenith: 0x326ec4,
    horizon: 0xbcd4ec,
    ground: 0x60664a,
    glow: 0xfff4e0,
    sun: 0xffffff,
    light: 0xffffff,
    lightI: 3.0,
    hemiSky: 0xc0d8f4,
    hemiGround: 0x58623e,
    hemiI: 1.05,
    fog: 0xbcd0e2,
    cloudLit: 0xffffff,
    cloudShade: 0xa8b4c6,
  },
];

const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _grey = new THREE.Color();
const _fogGrey = new THREE.Color();
const _hemiGrey = new THREE.Color();
const GREY = new THREE.Color(0x8a939c);
const FOG_GREY = new THREE.Color(0x7d868f);

function lerpKey(e, field, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  if (typeof a[field] === 'number' && field.endsWith('I')) return lerp(a[field], b[field], t);
  _ca.set(a[field]);
  _cb.set(b[field]);
  return out.copy(_ca).lerp(_cb, t);
}

export class Environment {
  constructor(scene, cloudTex) {
    this.scene = scene;
    this.time = 7.0; // hours
    this.day = 1;
    this.timeScale = 1 / 60; // game hours per real second (1 real minute = 1 hour)
    this.weather = { rain: 0, rainTarget: 0, cloud: 0.35, cloudTarget: 0.35, timer: 120, wet: 0 };
    this.rainbow = 0;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.sunElevation = 0;
    this.night = 0;

    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir },
      uMoonDir: { value: this.moonDir },
      uSunColor: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uCloudCover: { value: 0.35 },
      uNight: { value: 0 },
      uAurora: { value: 0 },
      uTime: { value: 0 },
      uRainbow: { value: 0 },
      uSunVeil: { value: 0 },
      uCloudTex: { value: cloudTex },
      uMilkyWay: { value: milkyWayTexture() },
      uEq: { value: new THREE.Matrix3() },
      uMoonPos: { value: new THREE.Vector3(0, -1, 0) },
      uMoonSun: { value: new THREE.Vector3(0, -1, 0) },
      uMoonUp: { value: new THREE.Vector3(0, 1, 0) },
      // the disc a little bigger than the real half degree, to show its phase
      uMoonSize: { value: Math.cos(0.62 * DEG) },
      uAuroraReach: { value: 0 },
      uAuroraRed: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.skyMaterial = mat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
    // drawn after everything solid, at the far plane: its shader then runs
    // only on the pixels where sky is seen, not under the whole view (the
    // stars, meteors and other see-through things still come after it)
    this.sky.renderOrder = 1000;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    // the real night sky: stars and planets, turning with the sidereal clock
    this.starfield = new Starfield(this.uniforms);
    scene.add(this.starfield.points);
    this.astro = null;
    this.astroKey = '';
    this.moonUp = 0;
    this.spaceWeather = new SpaceWeather();

    // sun (or moon) with two shadow cascades fitted to the view: sharp
    // shadows up close, softer tree shadows out to the shadow distance
    this.sun = new SunLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.45;
    this.sun.shadow.radius = 1.6;
    scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight(0xbcd4f0, 0x56603c, 1.0);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xbdd0e0, 0.0003);
    scene.fog = this.fog;
    this.fogBase = 0.0003;

    // horizon colour copy for water reflections
    this.horizon = this.uniforms.uHorizon.value;
    this.zenith = this.uniforms.uZenith.value;
    this.sunColor = this.uniforms.uSunColor.value;
    this.envDirty = true;
    this.lastEnvElevation = -999;
    this.update(0, new THREE.Vector3());
  }

  setShadowQuality(size, distance = 260) {
    if (size <= 0) {
      this.sun.castShadow = false;
      return;
    }
    this.sun.castShadow = true;
    this.sun.shadow.camera.far = distance;
    // the offset along the normal that keeps surfaces from shadowing
    // themselves, as small as each map's texel allows: it also shortens every
    // shadow (by 0.45 / tan of the sun's height before), and took the shadows
    // of stones and logs away altogether
    this.sun.shadow.normalBias = size >= 2048 ? 0.28 : 0.42;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  // Advance time. Nights pass three times faster.
  advance(dt) {
    const isNight = this.time >= 22 || this.time < 4.5;
    // lying back in a deck chair at the observatory, the night slows down to
    // a game hour every two minutes, so the sky can be watched turning
    this.time += dt * this.timeScale * (this.stargazing ? 0.5 : isNight ? 3 : 1);
    if (this.time >= 24) {
      this.time -= 24;
      this.day++;
    }
  }

  setTime(h) {
    this.time = ((h % 24) + 24) % 24;
    this.envDirty = true;
  }

  computeSun() {
    const t = this.time;
    // daylight from 5:00 to 22:00, peak 13:30 at 50 degrees (Alaskan summer)
    let el;
    if (t >= 5 && t <= 22) el = 50 * Math.sin((Math.PI * (t - 5)) / 17);
    else {
      const tn = t > 22 ? t - 22 : t + 2; // 0..7 hours of night
      el = -16 * Math.sin((Math.PI * tn) / 7);
    }
    // azimuth from NE at sunrise through S to NW at sunset (degrees from north, clockwise)
    const az = (40 + ((t - 5 + 24) % 24) * (280 / 17)) * DEG;
    const e = el * DEG;
    this.sunDir.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize();
    const maz = az + Math.PI;
    const me = Math.max(8, 30 - Math.abs(el)) * DEG;
    this.moonDir.set(Math.sin(maz) * Math.cos(me), Math.sin(me), -Math.cos(maz) * Math.cos(me)).normalize();
    this.sunElevation = el;
  }

  update(dt, focus) {
    this.computeSun();
    const e = this.sunElevation;
    const u = this.uniforms;
    u.uTime.value += dt;
    lerpKey(e, 'zenith', u.uZenith.value);
    lerpKey(e, 'horizon', u.uHorizon.value);
    lerpKey(e, 'ground', u.uGround.value);
    lerpKey(e, 'glow', u.uGlow.value);
    lerpKey(e, 'sun', u.uSunColor.value);
    lerpKey(e, 'cloudLit', u.uCloudLit.value);
    lerpKey(e, 'cloudShade', u.uCloudShade.value);

    // weather drift
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = 150 + Math.random() * 260;
      const r = Math.random();
      if (r < 0.22) {
        w.rainTarget = 0.6 + Math.random() * 0.4;
        w.cloudTarget = 0.85;
      } else if (r < 0.55) {
        w.rainTarget = 0;
        w.cloudTarget = 0.45 + Math.random() * 0.25;
      } else {
        w.rainTarget = 0;
        w.cloudTarget = 0.15 + Math.random() * 0.25;
      }
    }
    w.rain += (w.rainTarget - w.rain) * Math.min(1, dt * 0.05);
    w.cloud += (w.cloudTarget - w.cloud) * Math.min(1, dt * 0.04);
    u.uCloudCover.value = w.cloud;
    // the ground soaks up a shower in half a minute and dries over a few
    // minutes, faster in the sun
    if (!(w.wet >= 0)) w.wet = 0;
    if (w.rain > 0.15) w.wet = Math.min(1, w.wet + dt * 0.035 * w.rain);
    else w.wet = Math.max(0, w.wet - dt * (0.0035 + 0.004 * (1 - smoothstep(0.5, 0.95, w.cloud))));
    // a rainbow needs light rain in the air and the sun out behind you
    const showers = smoothstep(0.02, 0.1, w.rain) * (1 - smoothstep(0.3, 0.55, w.rain));
    const target = showers * (1 - smoothstep(0.62, 0.8, w.cloud)) * smoothstep(1, 6, e) * (1 - smoothstep(34, 41, e));
    this.rainbow += (target - this.rainbow) * Math.min(1, dt * 0.5);
    u.uRainbow.value = this.rainbow;

    const overcast = smoothstep(0.5, 0.95, w.cloud);
    // darken & desaturate under rain
    if (overcast > 0) {
      const grey = _grey.copy(GREY).multiplyScalar(0.25 + 0.75 * smoothstep(-6, 20, e));
      u.uZenith.value.lerp(grey, overcast * 0.7);
      u.uHorizon.value.lerp(grey, overcast * 0.55);
      u.uCloudLit.value.lerp(grey, overcast * 0.6);
      u.uCloudShade.value.multiplyScalar(1 - overcast * 0.35);
    }

    this.night = 1 - smoothstep(-10, -2, e);
    u.uNight.value = this.night;
    this.updateSky(dt);
    // the aurora follows the night's space weather (world/spaceweather.js)
    const aw = this.spaceWeather.update(this, dt);
    u.uAurora.value = this.night * (1 - overcast) * aw.strength;
    u.uAuroraReach.value = aw.reach;
    u.uAuroraRed.value = aw.red;

    // light: sun by day, moon by night: the Moon where the sky draws it when
    // it is up (its shadows and its path on the lakes line up with it)
    const lightI = lerpKey(e, 'lightI');
    lerpKey(e, 'light', this.sun.color);
    if (e > -2) this.lightDir.copy(this.sunDir);
    else if (this.moonUp > 0.02) this.lightDir.copy(u.uMoonPos.value);
    else this.lightDir.copy(this.moonDir);
    if (this.lightDir.y < 0.08) {
      this.lightDir.y = 0.08;
      this.lightDir.normalize();
    }
    // moonlit nights are brighter than moonless ones
    const moonK = e > -2 ? 1 : 0.35 + 0.9 * this.moonUp;
    // under a grey sky the light is soft and shadowless: little sun, weak
    // shadows, more and greyer light from the whole sky
    this.sun.intensity = lightI * (1 - overcast * 0.85) * moonK;
    // the switch from the Sun to the Moon happens in near darkness, just
    // after sunset (those minutes really are shadowless), not in one jump
    this.sun.intensity *= 0.1 + 0.9 * smoothstep(0.5, 2.5, Math.abs(e + 2));
    this.sun.shadow.intensity = 1 - 0.7 * overcast;
    lerpKey(e, 'hemiSky', this.hemi.color);
    lerpKey(e, 'hemiGround', this.hemi.groundColor);
    if (overcast > 0) {
      for (const c of [this.hemi.color, this.hemi.groundColor]) {
        const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
        c.lerp(_hemiGrey.setRGB(l, l, l), overcast * 0.7);
      }
    }
    this.overcast = overcast;
    // (and a fireball lights up the land for a moment: world/meteors.js)
    this.hemi.intensity = lerpKey(e, 'hemiI') * (1 + overcast * 0.35) + (this.fireFlash || 0) * 1.4 * this.night;

    lerpKey(e, 'fog', this.fog.color);
    if (overcast > 0) this.fog.color.lerp(_fogGrey.copy(FOG_GREY).multiplyScalar(0.3 + 0.7 * smoothstep(-6, 20, e)), overcast * 0.6);
    this.fog.density = this.fogBase * (1 + w.rain * 1.6 + overcast * 0.4);

    // the light shines from its position toward the origin
    this.sun.position.copy(this.lightDir);

    this.sky.position.copy(focus);
    this.starfield.points.position.copy(focus);
    if (Math.abs(e - this.lastEnvElevation) > 2.5) this.envDirty = true;
  }

  // The real sky for this game day and hour: the sidereal rotation every
  // frame, the Sun, Moon and planets once a game minute.
  updateSky() {
    const u = this.uniforms;
    const key = this.day * 1440 + Math.floor(this.time * 60);
    if (key !== this.astroKey) {
      this.astroKey = key;
      this.date = gameDate(this.day, this.time);
      this.astro = skyAt(this.date);
      this.starfield.setPlanets(this.astro.planets);
      this.astroHours = this.time;
    }
    const A = this.astro;
    // the sky turns 1.0027 times as fast as the clock
    let dh = this.time - this.astroHours;
    if (dh < -12) dh += 24;
    const lst = A.lst + dh * 1.00273791;
    skyMatrix(lst, u.uEq.value);
    this.lst = lst;
    const M = u.uEq.value;
    eqVector(A.moon.ra, A.moon.dec, u.uMoonPos.value).applyMatrix3(M);
    eqVector(A.sun.ra, A.sun.dec, u.uMoonSun.value).applyMatrix3(M);
    const m = u.uMoonPos.value;
    const pole = new THREE.Vector3(0, Math.sin(SITE.lat * DEG), -Math.cos(SITE.lat * DEG));
    u.uMoonUp.value.copy(pole).addScaledVector(m, -pole.dot(m)).normalize();
    // how much moonlight there is: up, and how full
    this.moonUp = smoothstep(-0.03, 0.15, m.y) * A.moon.illum;
    // faint stars drown in moonlight and twilight
    this.starfield.uniforms.uLimit.value = 6.0 - 1.6 * this.moonUp - 2.5 * (1 - this.night);
  }

  get isNight() {
    return this.night > 0.5;
  }
}
