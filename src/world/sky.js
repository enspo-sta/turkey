// Sky dome (gradient, sun, moon, clouds, stars, aurora), lights, fog and the
// day/night cycle. Colours are keyed by sun elevation.
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { clamp, lerp, smoothstep, DEG } from '../util/math.js';

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
varying vec3 vDir;

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

  // stars
  if (uNight > 0.01 && h > -0.02) {
    vec3 p = d * 260.0;
    vec3 cell = floor(p);
    float r = hash13(cell);
    if (r > 0.9955) {
      vec3 c = cell + 0.5 + (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
      float s = smoothstep(0.42, 0.0, length(p - c)) * (r - 0.9955) / 0.0045;
      float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 30.0) + r * 91.0);
      col += vec3(0.9, 0.95, 1.0) * s * uNight * tw * 1.6 * smoothstep(0.0, 0.15, h);
    }
    // milky band
    float band = exp(-pow(dot(d, normalize(vec3(0.6, 0.2, -0.77))) * 3.2, 2.0));
    col += vec3(0.05, 0.06, 0.09) * band * uNight * texture2D(uCloudTex, d.xz * 1.8).b;
  }

  // moon
  float md = dot(d, uMoonDir);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99955, 0.99975, md) * uNight * 1.4;
  col += vec3(0.15, 0.2, 0.3) * pow(max(md, 0.0), 120.0) * uNight * 0.6;

  // aurora borealis: curtains in the northern sky
  if (uAurora > 0.01 && h > 0.0) {
    float az = atan(d.x, -d.z);
    float north = smoothstep(-0.3, 0.5, -d.z);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float curtain = texture2D(uCloudTex, vec2(az * 0.22 + fi * 0.31 + uTime * 0.004, 0.2 + fi * 0.13)).r;
      float wave = sin(az * (7.0 + fi * 3.0) + curtain * 7.0 + uTime * (0.25 + fi * 0.07)) * 0.5 + 0.5;
      float base = 0.16 + fi * 0.05 + curtain * 0.1;
      float el = h - base;
      float v = smoothstep(-0.015, 0.02, el) * exp(-max(el, 0.0) * (5.0 + fi * 2.0));
      float streak = texture2D(uCloudTex, vec2(az * 3.0 + fi, uTime * 0.02)).g;
      v *= 0.35 + 0.65 * wave * (0.6 + 0.8 * streak);
      vec3 c = mix(vec3(0.15, 1.0, 0.5), vec3(0.55, 0.25, 0.95), smoothstep(0.02, 0.28, el));
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
    vec3 cc = mix(uCloudShade, uCloudLit, lit * (0.6 + 0.4 * n));
    cc += uGlow * pow(sdc, 8.0) * 0.6 * (1.0 - cov * 0.5);
    col = mix(col, cc, cov * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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
    ground: 0x3a3440,
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
    ground: 0x5a5a58,
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
    ground: 0x6a7278,
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
    ground: 0x6a7278,
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
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

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
    this.time += dt * this.timeScale * (isNight ? 3 : 1);
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
    u.uAurora.value = this.night * (1 - overcast) * (0.7 + 0.3 * Math.sin(u.uTime.value * 0.05));

    // light: sun by day, moon by night
    const lightI = lerpKey(e, 'lightI');
    lerpKey(e, 'light', this.sun.color);
    if (e > -2) this.lightDir.copy(this.sunDir);
    else this.lightDir.copy(this.moonDir);
    if (this.lightDir.y < 0.08) {
      this.lightDir.y = 0.08;
      this.lightDir.normalize();
    }
    this.sun.intensity = lightI * (1 - overcast * 0.55);
    lerpKey(e, 'hemiSky', this.hemi.color);
    lerpKey(e, 'hemiGround', this.hemi.groundColor);
    this.hemi.intensity = lerpKey(e, 'hemiI') * (1 + overcast * 0.1);

    lerpKey(e, 'fog', this.fog.color);
    if (overcast > 0) this.fog.color.lerp(_fogGrey.copy(FOG_GREY).multiplyScalar(0.3 + 0.7 * smoothstep(-6, 20, e)), overcast * 0.6);
    this.fog.density = this.fogBase * (1 + w.rain * 1.6 + overcast * 0.4);

    // the light shines from its position toward the origin
    this.sun.position.copy(this.lightDir);

    this.sky.position.copy(focus);
    if (Math.abs(e - this.lastEnvElevation) > 2.5) this.envDirty = true;
  }

  get isNight() {
    return this.night > 0.5;
  }
}
