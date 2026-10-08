// Insects around the player, animated entirely on the graphics processor like
// the grass: each kind lives in a square patch that wraps around the camera,
// shows only where its habitat is (flowers, water, wet ground) and at its
// time of day, and flies its own looping path with flapping wings.
//   butterflies over flowers and meadows by day (Canadian tiger swallowtail,
//   Arctic fritillary, margined white, mourning cloak), bumblebees on the fireweed,
//   dragonflies darting over shallow water, mosquito swarms at dusk and moths
//   round the lit windows, pier lamps and campfires at night. Balsam poplar
//   (cottonwood) fluff drifts on the breeze over the rivers by day.
import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// Body along +z (head forward), wings out along x. aWing: 0 body, 1 right
// wing, -1 left wing. The colour attribute holds weights for the species'
// three colours: body, wing base and wing accent (or head, for dragonflies).
function insectGeometry(kind) {
  const pos = [];
  const wing = [];
  const col = [];
  const W = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const tri = (a, b, c, w, ca = 0, cb = 0, cc = 0) => {
    pos.push(...a, ...b, ...c);
    wing.push(w, w, w);
    col.push(...W[ca], ...W[cb], ...W[cc]);
  };
  // a slim diamond body; front, sides and rear pick their own colour
  const body = (len, r, front = 0, side = 0, rear = 0) => {
    const f = [0, 0, len * 0.5];
    const b = [0, 0, -len * 0.5];
    const sd = [[r, 0, 0], [0, r, 0], [-r, 0, 0], [0, -r, 0]];
    for (let i = 0; i < 4; i++) {
      const p = sd[i];
      const q = sd[(i + 1) % 4];
      tri(f, p, q, 0, front, side, side);
      tri(b, q, p, 0, rear, side, side);
    }
  };
  if (kind === 'butterfly') {
    body(0.05, 0.006);
    for (const s of [1, -1]) {
      // forewing (two triangles out to a pointed tip) and a rounded
      // hindwing with a short tail; margins carry the accent colour
      tri([0, 0, 0.012], [s * 0.034, 0, 0.034], [s * 0.062, 0, 0.036], s, 1, 1, 2);
      tri([0, 0, 0.012], [s * 0.062, 0, 0.036], [s * 0.058, 0, 0.004], s, 1, 2, 2);
      tri([0, 0, 0.012], [s * 0.058, 0, 0.004], [s * 0.016, 0, -0.002], s, 1, 2, 1);
      tri([0, 0, -0.002], [s * 0.05, 0, -0.006], [s * 0.04, 0, -0.03], s, 1, 2, 2);
      tri([0, 0, -0.002], [s * 0.04, 0, -0.03], [s * 0.014, 0, -0.05], s, 1, 2, 2);
    }
  } else if (kind === 'bee') {
    // dark head and tail with a yellow band, smoky wings
    body(0.022, 0.009, 0, 1, 0);
    for (const s of [1, -1]) tri([0, 0.004, 0.004], [s * 0.022, 0.006, 0.006], [s * 0.02, 0.006, -0.006], s, 2, 2, 2);
  } else if (kind === 'dragonfly') {
    body(0.075, 0.004, 1, 0, 0);
    for (const s of [1, -1]) {
      tri([0, 0, 0.022], [s * 0.052, 0, 0.03], [s * 0.052, 0, 0.018], s, 2, 2, 2);
      tri([0, 0, 0.01], [s * 0.048, 0, 0.012], [s * 0.048, 0, 0.0], s, 2, 2, 2);
    }
  } else if (kind === 'fluff') {
    // a seed tuft: three crossed wisps
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const c = Math.cos(a) * 0.012;
      const sn = Math.sin(a) * 0.012;
      tri([-c, -0.008, -sn], [c, -0.008, sn], [0, 0.012, 0], 0, 0, 0, 1);
      tri([-c, 0.008, -sn], [0, -0.012, 0], [c, 0.008, sn], 0, 0, 0, 1);
    }
  } else {
    // mosquito or moth: a small body with a pair of wings
    const size = kind === 'moth' ? 1 : 0.35;
    body(0.028 * size, 0.005 * size, 1, 0, 0);
    for (const s of [1, -1]) {
      tri([0, 0, 0.004 * size], [s * 0.03 * size, 0, 0.0], [s * 0.022 * size, 0, -0.018 * size], s, 2, 2, 2);
      if (kind === 'moth') tri([0, 0, -0.002], [s * 0.022, 0, -0.018], [s * 0.008, 0, -0.022], s, 2, 1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Per kind: flight path, wing beat, where it lives, colours.
// The patches are small so the insects stay near the player, where they
// are big enough on screen to see; sizes are a little larger than life.
const KINDS = {
  butterfly: { count: 90, radius: 20, scale: 2.0, beat: 11, habitat: 'flowers' },
  bee: { count: 60, radius: 12, scale: 2.4, beat: 60, habitat: 'fireweed' },
  dragonfly: { count: 120, radius: 26, scale: 2.2, beat: 34, habitat: 'water' },
  mosquito: { count: 240, radius: 12, scale: 2.6, beat: 70, habitat: 'swarm' },
  moth: { count: 64, radius: 0, scale: 1.4, beat: 18, habitat: 'lights' },
  fluff: { count: 110, radius: 20, scale: 1.6, beat: 0, habitat: 'rivers' },
};

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aWing;
attribute vec4 aSeed; // patch x, patch z, habitat threshold (moths: light), random
uniform vec2 uCam;
uniform float uR;
uniform float uTime;
uniform float uActive;
uniform float uScale;
uniform float uBeat;
uniform float uKind; // 0 butterfly, 1 bee, 2 dragonfly, 3 mosquito, 4 moth, 5 fluff
uniform vec2 uWind;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uWater;
uniform vec2 uWorldMin;
uniform float uUvScale;
uniform float uUvOffset;
uniform vec3 uLights[8];
uniform vec3 uLit;
uniform vec3 uColA[4];
uniform vec3 uColB[4];
uniform vec3 uColC[4];
varying vec3 vColor;

vec3 pathAt(float t, vec4 s) {
  float k = uKind;
  if (k < 0.5) {
    // butterfly: loose loops with sudden changes of height
    return vec3(sin(t * 0.61 + s.w * 6.0) * 1.6 + sin(t * 1.7) * 0.4, 0.75 + sin(t * 0.83 + s.w * 3.0) * 0.45 + abs(sin(t * 2.3)) * 0.2, cos(t * 0.47 + s.w * 5.0) * 1.6 + cos(t * 1.3) * 0.4);
  } else if (k < 1.5) {
    // bee: quick hops from flower to flower
    float hop = floor(t * 0.5);
    float f = fract(t * 0.5);
    vec2 a = vec2(sin(hop * 12.9 + s.w * 7.0), cos(hop * 7.3 + s.w * 3.0)) * 0.9;
    vec2 b = vec2(sin((hop + 1.0) * 12.9 + s.w * 7.0), cos((hop + 1.0) * 7.3 + s.w * 3.0)) * 0.9;
    float m = smoothstep(0.55, 0.85, f);
    vec2 p = mix(a, b, m);
    return vec3(p.x + sin(t * 9.0) * 0.03, 0.55 + sin(m * 3.1416) * 0.35 + sin(t * 7.0) * 0.02, p.y);
  } else if (k < 2.5) {
    // dragonfly: hover, then dart to a new spot
    float hop = floor(t * 0.33 + s.w);
    float f = fract(t * 0.33 + s.w);
    vec2 a = vec2(sin(hop * 5.1 + s.w * 9.0), cos(hop * 3.7 + s.w * 4.0)) * 3.5;
    vec2 b = vec2(sin((hop + 1.0) * 5.1 + s.w * 9.0), cos((hop + 1.0) * 3.7 + s.w * 4.0)) * 3.5;
    vec2 p = mix(a, b, smoothstep(0.7, 0.8, f));
    return vec3(p.x + sin(t * 3.0) * 0.05, 0.7 + sin(t * 0.9 + s.w) * 0.25, p.y);
  } else if (k < 3.5) {
    // mosquito: a dancing column at head height, dark against the evening sky
    return vec3(sin(t * 3.1 + s.w * 40.0) * 0.6, 2.2 + sin(t * 2.3 + s.w * 17.0) * 0.7, cos(t * 2.7 + s.w * 29.0) * 0.6);
  }
  if (k < 4.5) {
    // moth: circling a light
    float a = t * 1.9 + s.w * 6.28;
    return vec3(cos(a) * (0.5 + sin(t * 0.7) * 0.2), sin(t * 2.3 + s.w * 5.0) * 0.35, sin(a) * (0.5 + cos(t * 0.9) * 0.2));
  }
  // fluff: floating at its own height, rising and sinking on the air
  return vec3(sin(t * 0.3 + s.w * 9.0) * 0.6, 0.5 + fract(s.w * 5.3) * 2.6 + sin(t * 0.45 + s.w * 4.0) * 0.4, cos(t * 0.27 + s.w * 7.0) * 0.6);
}

void main() {
  vec2 wp;
  float show = 1.0;
  float ground = 0.0;
  if (uKind > 3.5 && uKind < 4.5) {
    // moths belong to the lights, not to a patch
    vec3 L = uLights[int(aSeed.z + 0.5)];
    wp = L.xz;
    ground = L.y;
    show = step(fract(aSeed.w * 3.7), uActive);
  } else {
    float size = 2.0 * uR;
    vec2 base = uCam - uR;
    // fluff rides the wind; the patch wraps it round the player
    vec2 drift = uKind > 4.5 ? uWind * uTime : vec2(0.0);
    wp = base + mod(aSeed.xy + drift - base, size);
    vec2 tuv = (wp - uWorldMin) * uUvScale + uUvOffset;
    vec4 m = texture2D(uMask, tuv);
    vec4 w = texture2D(uWater, tuv);
    float h = texture2D(uHeight, tuv).r;
    float depth = w.r - h;
    float dens;
    if (uKind < 0.5) dens = m.g * 1.2 + m.r * 0.25 - m.a * 0.4;
    else if (uKind < 1.5) dens = m.g * 1.4;
    else if (uKind < 2.5) dens = smoothstep(-0.8, 0.1, depth) * (1.0 - smoothstep(1.2, 3.5, depth)) * (1.0 - w.a) * 1.3;
    else if (uKind < 3.5) dens = (m.a * 0.6 + step(-2.0, depth) * 0.6) * (1.0 - w.a);
    else dens = (smoothstep(-6.0, -1.0, depth) * 0.9 + m.a * 0.15) * (1.0 - w.a);
    // fewer of them in cloud and light rain: activity thins the habitat
    show *= step(aSeed.z, dens * uActive);
    show *= 1.0 - smoothstep(uR * 0.6, uR * 0.95, length(wp - uCam));
    ground = (uKind > 1.5 && uKind < 2.5) || uKind > 4.5 ? max(h, w.r) : h;
  }
  float t = uTime * (0.9 + fract(aSeed.w * 13.7) * 0.3) + aSeed.w * 97.0;
  vec3 c = pathAt(t, aSeed);
  vec3 c2 = pathAt(t + 0.05, aSeed);
  vec3 vel = c2 - c;
  float yaw = atan(vel.x, vel.z);
  // wings: beat, with glides for the butterflies
  float beat = sin(t * uBeat);
  float glide = uKind < 0.5 ? smoothstep(0.2, 0.7, sin(t * 0.9 + aSeed.w * 4.0)) : 0.0;
  float flap = mix(beat * 0.95 + 0.25, 0.18, glide);
  if (uKind > 1.5 && uKind < 2.5) flap = beat * 0.2;
  vec3 p = position * uScale;
  if (aWing != 0.0) {
    float an = flap * aWing;
    p = vec3(p.x * cos(an), abs(p.x) * sin(abs(an)) * sign(flap), p.z);
  }
  // pitch nose up slightly while climbing
  float cy = cos(yaw);
  float sy = sin(yaw);
  p = vec3(p.x * cy + p.z * sy, p.y + p.z * clamp(vel.y * 8.0, -0.4, 0.4), -p.x * sy + p.z * cy);
  p *= show;
  vec3 world = vec3(wp.x, ground, wp.y) + c + p;
  // colours: each insect is one of four species in its kind's palette
  int sp = int(floor(fract(aSeed.w * 7.31) * 3.999));
  vColor = (uColA[sp] * color.r + uColB[sp] * color.g + uColC[sp] * color.b) * uLit;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const lin = (hex) => new THREE.Color(hex);

// Per species: body, wing base and wing accent (dragonflies: body, head,
// wings; bees: head and tail, band, wings).
const PALETTES = {
  // Canadian tiger swallowtail, Arctic fritillary, margined white, mourning cloak
  butterfly: [
    [0x1a1612, 0xf2cf3a, 0x17120c],
    [0x2a1a10, 0xe08a2a, 0x3a1c0a],
    [0x3a3a36, 0xf4f2e8, 0xa8aaa0],
    [0x1a0e0c, 0x4a1a1e, 0xeedc88],
  ],
  // bumblebees: yellow-banded and orange-belted
  bee: [
    [0x17130c, 0xe6b52a, 0xb8bcc0],
    [0x17130c, 0xd8862a, 0xb8bcc0],
    [0x17130c, 0xe6b52a, 0xb8bcc0],
    [0x17130c, 0xf0d060, 0xb8bcc0],
  ],
  // darners (blue and green) and a red meadowhawk
  dragonfly: [
    [0x2a6ac8, 0x1a3a70, 0xd0dde4],
    [0x3a9a4a, 0x1a4a2a, 0xd0dde4],
    [0xb8301c, 0x5a1a10, 0xe0d8d4],
    [0x3a78d0, 0x1a3a70, 0xd0dde4],
  ],
  mosquito: [
    [0x18160f, 0x2a2822, 0x5a5a54],
    [0x18160f, 0x2a2822, 0x5a5a54],
    [0x18160f, 0x2a2822, 0x5a5a54],
    [0x18160f, 0x2a2822, 0x5a5a54],
  ],
  fluff: [
    [0xf4f2ea, 0xf4f2ea, 0xfbfaf6],
    [0xeeece2, 0xeeece2, 0xf8f6ee],
    [0xf4f2ea, 0xf4f2ea, 0xfbfaf6],
    [0xe8e6dc, 0xe8e6dc, 0xf4f2ea],
  ],
  moth: [
    [0xb8a888, 0xa89878, 0xe0d8c0],
    [0x9a8a6a, 0x8a7a60, 0xd0c4a8],
    [0xc8bca0, 0xa89880, 0xeee6d4],
    [0x9a8a6a, 0x8a7a60, 0xd8ccb0],
  ],
};

export class Insects {
  constructor(game) {
    this.game = game;
    const wt = game.wtex;
    this.group = new THREE.Group();
    this.group.name = 'insects';
    this.time = { value: 0 };
    this.cam = { value: new THREE.Vector2() };
    this.lit = { value: new THREE.Color(1, 1, 1) };
    // moths are lit by the window, lamp or fire they circle
    this.mothLit = { value: new THREE.Color(1, 1, 1) };
    this.layers = {};
    // moths share out the eight lit windows, pier lamps and campfires
    // nearest the player (refreshed now and then in update)
    this.allLights = (game.props && game.props.nightLights) || [];
    const lights = [];
    for (let i = 0; i < 8; i++) lights.push(new THREE.Vector3(0, -500, 0));
    this.lights = lights;
    this.lightT = 0;
    const nLights = 8;
    let kindIndex = 0;
    for (const [kind, K] of Object.entries(KINDS)) {
      const geo = insectGeometry(kind);
      const ig = new THREE.InstancedBufferGeometry();
      ig.setAttribute('position', geo.attributes.position);
      ig.setAttribute('aWing', geo.attributes.aWing);
      ig.setAttribute('color', geo.attributes.color);
      const seeds = new Float32Array(K.count * 4);
      const rand = mulberry32(900 + kindIndex * 31);
      for (let i = 0; i < K.count; i++) {
        seeds[i * 4] = rand() * 2 * Math.max(1, K.radius);
        seeds[i * 4 + 1] = rand() * 2 * Math.max(1, K.radius);
        seeds[i * 4 + 2] = rand() * 0.9 + 0.05;
        seeds[i * 4 + 3] = rand();
      }
      if (kind === 'moth') for (let i = 0; i < K.count; i++) seeds[i * 4 + 2] = i % nLights;
      // a swarm: mosquitoes share a few anchors
      if (kind === 'mosquito') {
        for (let i = 0; i < K.count; i++) {
          const s = Math.floor(i / 30);
          const r2 = mulberry32(1300 + s);
          seeds[i * 4] = r2() * 2 * K.radius;
          seeds[i * 4 + 1] = r2() * 2 * K.radius;
          seeds[i * 4 + 2] = r2() * 0.9 + 0.05;
        }
      }
      ig.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      ig.instanceCount = K.count;
      const pal = PALETTES[kind];
      const uniforms = {
        uCam: this.cam,
        uR: { value: K.radius },
        uTime: this.time,
        uActive: { value: 0 },
        uScale: { value: K.scale },
        uBeat: { value: K.beat },
        uKind: { value: kindIndex },
        uWind: { value: new THREE.Vector2(0.32, 0.17) },
        uHeight: { value: wt.height },
        uMask: { value: wt.mask },
        uWater: { value: game.wtex.water },
        uWorldMin: { value: wt.worldMin },
        uUvScale: { value: wt.uvScale },
        uUvOffset: { value: wt.uvOffset },
        uLights: { value: lights },
        uLit: kind === 'moth' ? this.mothLit : this.lit,
        uColA: { value: pal.map((p) => lin(p[0])) },
        uColB: { value: pal.map((p) => lin(p[1])) },
        uColC: { value: pal.map((p) => lin(p[2])) },
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        vertexColors: true,
        fog: true,
      });
      const mesh = new THREE.Mesh(ig, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.name = `insects-${kind}`;
      this.group.add(mesh);
      this.layers[kind] = mesh;
      kindIndex++;
    }
  }

  update(dt) {
    const g = this.game;
    // (kept within an hour: a clock that grew all day would leave the wing
    // beats too few digits to move smoothly; the swarms reset once an hour)
    this.time.value = (this.time.value + dt) % 3600;
    const cam = g.camera.position;
    this.cam.value.set(cam.x, cam.z);
    const env = g.env;
    const e = env.sunElevation;
    const rain = env.weather ? env.weather.rain : 0;
    const dry = 1 - Math.min(1, rain * 3);
    const day = e > 6 ? 1 : 0;
    // colour follows the light: full by day, dim at dusk, faint at night
    const light = Math.max(0.12, Math.min(1, (e + 6) / 20));
    this.lit.value.setRGB(light, light * 0.98, light * 0.95);
    const glow = env.night;
    this.mothLit.value.setRGB(light + (1.1 - light) * glow, light * 0.98 + (0.86 - light * 0.98) * glow, light * 0.95 + (0.58 - light * 0.95) * glow);
    const active = {
      butterfly: day * dry * (env.weather && env.weather.cloud > 0.8 ? 0.5 : 1),
      bee: day * dry,
      dragonfly: day * dry,
      // dusk everywhere, and all day long at Mosquito Flats without bug dope
      mosquito: Math.max(e > -8 && e < 10 ? dry : 0, g.areas ? g.areas.near('flats', 120, 260) * dry * ((g.bugDopeT || 0) > 0 ? 0.2 : 1) : 0),
      moth: env.night > 0.5 ? 1 : 0,
      fluff: day * dry,
    };
    for (const [kind, mesh] of Object.entries(this.layers)) {
      const a = active[kind];
      mesh.visible = a > 0.01 && g.player.mode === 'foot';
      mesh.material.uniforms.uActive.value = a;
    }
    // the eight lights nearest the player get the moths
    this.lightT -= dt;
    if (this.lightT <= 0 && this.allLights.length) {
      this.lightT = 4;
      const sorted = this.allLights
        .map((L) => ({ L, d: (L.x - cam.x) ** 2 + (L.z - cam.z) ** 2 }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < 8; i++) this.lights[i].copy(sorted[i % sorted.length].L);
    }
  }
}
