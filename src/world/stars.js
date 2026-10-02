// The night sky's points of light: 2,560 real stars to magnitude 5.6 in
// their true colours, and the five planets a person can see without a
// telescope, all turning with the sidereal clock (world/astro.js). Faint
// stars give way to moonlight and twilight, everything dims and twinkles
// near the horizon, and clouds cover what is behind them. Also the Milky
// Way as a texture for the sky shader, from its outline.
import * as THREE from 'three';
import { STARS, MILKY_WAY } from './skydata.js';
import { eqVector, PLANETS } from './astro.js';

function bytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// A star's colour from its B-V colour index: its temperature (Ballesteros
// 2012), then the colour of a glowing body at that temperature, a little
// washed out the way the eye sees stars.
export function starColor(bv) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = T / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = [r, g, b].map((v) => Math.max(0, Math.min(255, v)) / 255);
  // halfway to white
  return c.map((v) => 0.5 + 0.5 * v);
}

const vert = /* glsl */ `
attribute float aMag;
attribute vec3 aColor;
attribute float aSeed;
uniform mat3 uEq;
uniform float uTime;
uniform float uNight;
uniform float uLimit;
uniform float uScale;
uniform float uCloudCover;
uniform sampler2D uCloudTex;
uniform vec3 uMoonPos;
uniform float uMoonSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 d = uEq * position;
  float h = d.y;
  // light from the star relative to the faintest the eye can see now
  float fl = pow(10.0, -0.4 * (aMag - uLimit));
  // thicker air near the horizon dims and twinkles
  float air = 1.0 / max(0.06, h + 0.03);
  float ext = exp(-0.11 * (air - 1.0));
  float tw = 1.0 + (0.1 + 0.4 * (1.0 - smoothstep(0.0, 0.45, h))) * sin(uTime * (6.0 + aSeed * 13.0) + aSeed * 71.0);
  // the clouds the sky shader draws over this star
  float cov = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.09);
    float n1 = texture2D(uCloudTex, uv * 0.11 - vec2(uTime * 0.0012, uTime * 0.0006)).r;
    float n2 = texture2D(uCloudTex, uv * 0.31 - vec2(uTime * 0.002, uTime * 0.001)).g;
    float n = n1 * 0.7 + n2 * 0.3;
    float thr = 0.72 - uCloudCover * 0.46;
    cov = smoothstep(thr, thr + 0.16, n) * smoothstep(0.0, 0.1, h);
  }
  float a = uNight * ext * (1.0 - cov * 0.98) * smoothstep(-0.01, 0.03, h);
  // nothing shines through the Moon
  if (dot(d, uMoonPos) > uMoonSize - 0.00005) a = 0.0;
  vAlpha = clamp(a * min(1.0, fl * 0.9) * tw, 0.0, 1.0);
  vColor = aColor * (1.0 + 0.6 * clamp(log2(max(fl, 1.0)) / 9.0, 0.0, 1.0));
  gl_PointSize = uScale * clamp(1.3 + log2(max(fl, 0.08)) * 0.5, 1.1, 7.5);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(d * 3000.0, 1.0);
  gl_Position = p.xyww;
  // too faint to draw at all: off the screen
  if (vAlpha < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  float a = (exp(-r2 * 6.0) + exp(-r2 * 1.8) * 0.22) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Starfield {
  constructor(uniforms) {
    const raw = bytes(STARS);
    const n = raw.length / 6;
    const dv = new DataView(raw.buffer);
    const total = n + PLANETS.length;
    const pos = new Float32Array(total * 3);
    const mag = new Float32Array(total);
    const col = new Float32Array(total * 3);
    const seed = new Float32Array(total);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const ra = (dv.getUint16(i * 6, true) / 65535) * 360;
      const dec = dv.getInt16(i * 6 + 2, true) / 360;
      eqVector(ra, dec, v).toArray(pos, i * 3);
      mag[i] = dv.getUint8(i * 6 + 4) / 30 - 2;
      const c = starColor(dv.getInt8(i * 6 + 5) / 50);
      col.set(c, i * 3);
      seed[i] = ((i * 7919) % 997) / 997;
    }
    PLANETS.forEach((p, k) => {
      col.set(p.color, (n + k) * 3);
      mag[n + k] = 9;
      seed[n + k] = 0.02;
    });
    this.count = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uEq: uniforms.uEq,
      uTime: uniforms.uTime,
      uNight: uniforms.uNight,
      uCloudCover: uniforms.uCloudCover,
      uCloudTex: uniforms.uCloudTex,
      uMoonPos: uniforms.uMoonPos,
      uMoonSize: uniforms.uMoonSize,
      uLimit: { value: 6 },
      uScale: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -9;
    this.points.name = 'stars';
  }

  // The planets where they are tonight (right ascension and declination of
  // date, magnitudes from their phase and distance).
  setPlanets(planets) {
    const g = this.points.geometry;
    const pos = g.attributes.position;
    const mag = g.attributes.aMag;
    const v = new THREE.Vector3();
    planets.forEach((p, k) => {
      eqVector(p.ra, p.dec, v);
      pos.setXYZ(this.count + k, v.x, v.y, v.z);
      mag.setX(this.count + k, p.mag);
    });
    pos.needsUpdate = true;
    mag.needsUpdate = true;
  }
}

// The Milky Way as a map of the whole sky (right ascension across, from 0h
// at the left; declination up), drawn from its five nested outlines and
// softened. The sky shader looks it up through the sidereal rotation.
export function milkyWayTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const raw = bytes(MILKY_WAY);
  const dv = new DataView(raw.buffer);
  const n = raw.length / 2;
  const rings = {};
  let i = 0;
  while (i < n) {
    const level = dv.getInt16(i * 2, true);
    const count = dv.getInt16(i * 2 + 2, true);
    i += 2;
    const pts = [];
    for (let k = 0; k < count; k++) {
      pts.push([dv.getInt16(i * 2, true) / 50, dv.getInt16(i * 2 + 2, true) / 50]);
      i += 2;
    }
    (rings[level] || (rings[level] = [])).push(pts);
  }
  g.globalCompositeOperation = 'lighter';
  for (const level of Object.keys(rings).sort()) {
    g.fillStyle = 'rgba(255,255,255,0.19)';
    for (const off of [-W, 0, W]) {
      g.beginPath();
      for (const pts of rings[level]) {
        pts.forEach(([ra, dec], k) => {
          const x = (ra / 360) * W + off;
          const y = ((90 - dec) / 180) * H;
          if (k) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.closePath();
      }
      g.fill('evenodd');
    }
  }
  // soften: three box blurs across and down
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const a = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) a[p] = d[p * 4];
  const tmp = new Float32Array(W * H);
  const R = 3;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = -R; x <= R; x++) s += a[y * W + ((x + W) % W)];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = s / (2 * R + 1);
        s += a[y * W + ((x + R + 1) % W)] - a[y * W + ((x - R + W) % W)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -R; y <= R; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = s / (2 * R + 1);
        s += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x];
      }
    }
  }
  // fine mottling: dust lanes and star clouds
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let p = 0; p < W * H; p++) {
    const v = a[p] * (0.82 + 0.36 * rnd());
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = Math.min(255, v);
    d[p * 4 + 3] = 255;
  }
  g.globalCompositeOperation = 'source-over';
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
