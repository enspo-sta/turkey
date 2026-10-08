// The visitor from the sky. On a clear night the observatory's dust-trail
// model calls a meteor outburst: the Kappa Cygnids, a minor shower known for
// slow, bright meteors, pouring out of Cygnus high overhead. Watch it
// through the telescope and among the meteors comes a light that is far too
// slow, and turns: a craft coming in, glowing with the heat of the air it
// rams. It comes down in the forest west of the observatory, about 700 m
// away, and lays the trees flat round it the way the blast at Tunguska did
// in 1908. Go there and you find a pod, scorched and still ticking as it
// cools, and its pilot hiding behind it: Zib, small, three-eyed, with long
// ears whose tips glow, who greets you in prime numbers. Zib can come with
// you: it floats at your shoulder, rides in the hot rod's passenger seat,
// feels the fish coming before they bite and squeaks when a bear is near.
// Ask it to wait and it waits; get far away and it blinks back to you.
//
// The story's state is in GameState.visitor: { stage, follow, wait, at }.
// stage: null or 'due' (the outburst is coming), 'down' (the craft is down,
// Zib hiding), 'met' (you have said hello), 'friend' (Zib has come along
// at least once). follow: Zib is with you. wait: where it waits.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { sphere, ellipsoid, cone, placed, frameAt, blend, carve, meshSDFSteps } from '../util/sdfmesh.js';
import { clearGrass, restoreGrass } from '../world/worldtex.js';
import { ROAD_HALF } from '../world/worldgen.js';
import { smoothstep, damp, clamp, mulberry32 } from '../util/math.js';

export const CRASH = { x: -6, z: -154 };
const SAUCER = { x: 812, z: -118 };
// the radiant of the Kappa Cygnids, in the sky above the observatory
// (azimuth from north toward east, elevation), late in the evening
const RADIANT = { az: (70 * Math.PI) / 180, el: (72 * Math.PI) / 180 };

// how long the craft takes from the top of the sky to the ground
const F_DUR = 11;
const SKIN = 0x8fd8c6;
const BELLY = 0xdaf4ea;
const SPOT = 0x5fb3a8;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _v2 = new THREE.Vector2();

function dirFromAzEl(az, el, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

function glowTex(inner = 'rgba(255,255,255,1)', mid = 'rgba(150,255,235,0.45)') {
  return canvasTexture(
    64,
    64,
    (g, W, H) => {
      const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      r.addColorStop(0, inner);
      r.addColorStop(0.3, mid);
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    },
    { srgb: false }
  );
}

// A cloud of soft puffs for the falling craft's trail: one draw for all of
// them, each puff with its own size (in metres) and opacity, instead of a
// sprite and a draw each.
function puffCloud(n, map, color, additive) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, color: { value: new THREE.Color(color) }, scale: { value: 500 } },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      uniform float scale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = alpha > 0.0 ? size * scale / max(0.001, -mv.z) : 0.0;
        vA = alpha;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      varying float vA;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(color * t.rgb, t.a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

function smokeTex() {
  return canvasTexture(
    64,
    64,
    (g, W, H) => {
      const rnd = mulberry32(5);
      for (let i = 0; i < 9; i++) {
        const x = W * (0.3 + rnd() * 0.4);
        const y = H * (0.3 + rnd() * 0.4);
        const r = W * (0.18 + rnd() * 0.16);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.32)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
    },
    { srgb: true }
  );
}

// The ground round the crash: scorched black at the middle, streaked out
// toward the edge, fading to nothing.
function scorchTex() {
  return canvasTexture(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    const r0 = g.createRadialGradient(cx, cy, 0, cx, cy, W / 2);
    r0.addColorStop(0, 'rgba(18,14,12,0.95)');
    r0.addColorStop(0.35, 'rgba(36,28,22,0.85)');
    r0.addColorStop(0.7, 'rgba(60,48,36,0.35)');
    r0.addColorStop(1, 'rgba(60,48,36,0)');
    g.fillStyle = r0;
    g.fillRect(0, 0, W, H);
    // streaks blown outward
    const rnd = mulberry32(19);
    g.strokeStyle = 'rgba(20,16,14,0.45)';
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const l0 = W * (0.12 + rnd() * 0.1);
      const l1 = W * (0.3 + rnd() * 0.18);
      g.lineWidth = 1 + rnd() * 4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0);
      g.lineTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1);
      g.stroke();
    }
  });
}

// ------------------------------------------------------------ Zib
// Zib's body: a soft pear, a paler belly, three sockets for its eyes in a
// row and a small smile, sculpted as a distance field (util/sdfmesh.js) in
// its own frame: the middle of its bottom at the origin, facing +z.
function zibBodySDF() {
  const body = blend([
    [ellipsoid(0, 0.33, 0, 0.25, 0.27, 0.23), 0],
    [ellipsoid(0, 0.12, 0.01, 0.2, 0.15, 0.19), 0.12],
    // two stubby arms
    [cone([0.2, 0.26, 0.03], [0.31, 0.16, 0.1], 0.05, 0.035), 0.05],
    [cone([-0.2, 0.26, 0.03], [-0.31, 0.16, 0.1], 0.05, 0.035), 0.05],
    // the roots of the ears
    [ellipsoid(0.13, 0.55, -0.02, 0.06, 0.05, 0.045), 0.06],
    [ellipsoid(-0.13, 0.55, -0.02, 0.06, 0.05, 0.045), 0.06],
  ]);
  return carve(body, [
    [sphere(0, 0.41, 0.22, 0.05), 0.02],
    [sphere(0.1, 0.39, 0.2, 0.04), 0.02],
    [sphere(-0.1, 0.39, 0.2, 0.04), 0.02],
    // the smile
    [placed(ellipsoid(0, 0, 0, 0.055, 0.009, 0.03), frameAt([0, 0.28, 0.225], [0, 0, 0])), 0.01],
  ]);
}

function* zibBodySteps() {
  const g = yield* meshSDFSteps(zibBodySDF(), [-0.4, -0.06, -0.3], [0.4, 0.64, 0.32], 0.012);
  // skin: mint with darker spots, a pale belly
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(SKIN);
  const belly = new THREE.Color(BELLY);
  const spot = new THREE.Color(SPOT);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const b = smoothstep(0.05, 0.16, z) * (1 - smoothstep(0.24, 0.34, y)) * (1 - smoothstep(0.08, 0.16, Math.abs(x)));
    c.copy(skin).lerp(belly, b);
    const sp = Math.sin(x * 37 + Math.sin(y * 23) * 2) * Math.sin(y * 31 + z * 19) * Math.sin(z * 29 + x * 13);
    if (sp > 0.45 && b < 0.3) c.lerp(spot, 0.7);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

class Zib {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'zib';
    this.group.visible = false;
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.0, emissive: 0x1a3a34, emissiveIntensity: 0.35 });
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.skinMat);
    this.body.castShadow = true;
    this.inner.add(this.body);
    // the three eyes: glossy black, each with a spark of light
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.06, metalness: 0.1 });
    const spark = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.eyes = [];
    for (const [x, y, z, r] of [
      [0, 0.41, 0.205, 0.045],
      [0.1, 0.39, 0.185, 0.035],
      [-0.1, 0.39, 0.185, 0.035],
    ]) {
      const e = new THREE.Group();
      e.position.set(x, y, z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), eyeMat);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 8, 6), spark);
      hi.position.set(r * 0.35, r * 0.4, r * 0.75);
      e.add(ball, hi);
      this.inner.add(e);
      this.eyes.push(e);
    }
    // the ears: long, floppy, each tip a glowing bead
    this.tipMat = new THREE.MeshBasicMaterial({ color: 0x7ff8e8, toneMapped: false });
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.14, 0.57, -0.02);
      const b = new ModelBuilder();
      b.beam([0, 0, 0], [s * 0.1, 0.17, -0.02], 0.035, 10, { r2: 0.022, color: SKIN, smooth: true, jitter: 0 });
      b.beam([s * 0.1, 0.17, -0.02], [s * 0.21, 0.24, 0.0], 0.022, 10, { r2: 0.014, color: SKIN, smooth: true, jitter: 0 });
      b.sphere(0.022, 10, 8, { pos: [s * 0.1, 0.17, -0.02], color: SKIN, smooth: true, jitter: 0 });
      const ear = new THREE.Mesh(b.build({ flat: false }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x1a3a34, emissiveIntensity: 0.35 }));
      ear.castShadow = true;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.tipMat);
      tip.position.set(s * 0.215, 0.245, 0.0);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x7ff8e8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8, toneMapped: false }));
      halo.scale.set(0.22, 0.22, 1);
      halo.position.copy(tip.position);
      pivot.add(ear, tip, halo);
      this.inner.add(pivot);
      this.ears.push({ pivot, halo, s });
    }
    // the soft light it floats on
    this.under = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(200,255,250,0.9)', 'rgba(90,220,210,0.35)'), color: 0x9ff6ea, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, toneMapped: false }));
    this.under.scale.set(0.8, 0.8, 1);
    this.under.position.set(0, -0.12, 0);
    this.group.add(this.under);
    this.sculpt = zibBodySteps();
    this.blinkT = 2;
    this.blinking = 0;
    this.mood = 'calm';
    this.moodT = 0;
    this.wave = 0;
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    game.scene.add(this.group);
  }

  // Sculpt the body a few milliseconds at a time.
  sculptStep(budget = 3, shared = false) {
    if (!this.sculpt) return true;
    // (shared: within what is left of the frame's sculpting budget, see
    // main.js; a call on demand takes what it asks for)
    const g = this.game;
    if (shared && g.sculptLeft === undefined) shared = false;
    const ms = shared ? Math.min(budget, g.sculptLeft) : budget;
    if (ms <= 0) return false;
    const t0 = performance.now();
    let r = this.sculpt.next();
    while (!r.done && performance.now() - t0 < ms) r = this.sculpt.next();
    if (shared) g.sculptLeft -= performance.now() - t0;
    if (!r.done) return false;
    this.body.geometry.dispose();
    this.body.geometry = r.value;
    this.sculpt = null;
    return true;
  }

  setMood(m, t = 2) {
    this.mood = m;
    this.moodT = t;
  }

  // Look at a point, float, flap the ears, blink.
  animate(dt, time, lookAt) {
    // floating: a slow bob and a little sway
    this.inner.position.y = Math.sin(time * 2.1) * 0.05;
    this.inner.rotation.z = Math.sin(time * 1.3) * 0.06 + clamp(-this.vel.x * 0.02, -0.25, 0.25) * 0;
    // turn toward what it looks at
    if (lookAt) {
      const want = Math.atan2(lookAt.x - this.pos.x, lookAt.z - this.pos.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 4);
    }
    this.group.rotation.y = this.yaw;
    // blinking: all three together, now and then
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = 0.14;
      this.blinkT = 2.5 + Math.random() * 4;
    }
    let lid = 1;
    if (this.blinking > 0) {
      this.blinking -= dt;
      lid = 0.12 + Math.abs(this.blinking / 0.07 - 1) * 0.88;
    }
    for (const e of this.eyes) e.scale.set(1, Math.max(0.1, lid), 1);
    // the ears: swinging, perking up when excited
    this.moodT = Math.max(0, this.moodT - dt);
    if (this.moodT <= 0 && this.mood !== 'calm') this.mood = 'calm';
    const excite = this.mood === 'calm' ? 0 : 1;
    for (const E of this.ears) {
      E.pivot.rotation.z = E.s * (-0.15 - excite * 0.25) + Math.sin(time * (2.4 + excite * 6) + E.s) * (0.12 + excite * 0.1);
      E.pivot.rotation.x = Math.sin(time * 1.7 + E.s * 2) * 0.12 - excite * 0.2;
    }
    // the tips' colour: calm aqua, gold when a fish is coming, red for a
    // bear, white for joy
    const col = this.mood === 'fish' ? 0xffd25a : this.mood === 'bear' ? 0xff4a3a : this.mood === 'joy' ? 0xffffff : this.mood === 'sad' ? 0x6a8cff : 0x7ff8e8;
    this.tipMat.color.set(col);
    const pulse = this.mood === 'calm' ? 0.75 + Math.sin(time * 2) * 0.15 : 0.7 + Math.abs(Math.sin(time * 9)) * 0.6;
    for (const E of this.ears) {
      E.halo.material.color.set(col);
      E.halo.material.opacity = pulse;
    }
    this.under.material.opacity = 0.45 + Math.sin(time * 2.1) * 0.12;
    // waving with the right arm when it greets you: the whole body wiggles
    if (this.wave > 0) {
      this.wave -= dt;
      this.inner.rotation.z += Math.sin(time * 14) * 0.1;
    }
  }
}

// ------------------------------------------------------------ the pod
function podGeometry() {
  // a seed: blunt nose, widest a third of the way back, a long tapering
  // tail, slightly flattened
  const prof = [
    [0, 0],
    [0.32, 0.08],
    [0.56, 0.3],
    [0.7, 0.62],
    [0.72, 0.95],
    [0.64, 1.4],
    [0.48, 1.9],
    [0.28, 2.3],
    [0.1, 2.55],
    [0, 2.62],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    40
  );
  g.scale(1, 1, 0.82);
  return g;
}

export class Visitor {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'visitor';
    game.scene.add(this.group);
    this.site = null;
    this.zib = null;
    this.fall = null;
    this.smoke = [];
    this.warnT = 0;
    this.sniffT = 0;
    this.interaction = null;
  }

  get state() {
    return this.game.state.visitor || null;
  }

  stage() {
    return this.state?.stage || 'due';
  }

  get following() {
    return !!(this.state && this.state.follow && this.zib);
  }

  // After a load: the crash site and Zib where the story left them (or
  // none of it, for a new game).
  restore() {
    const st = this.state;
    if (st && st.stage === 'falling') st.stage = 'due';
    if (!st || st.stage === 'due' || !st.stage) {
      this.teardown();
      return;
    }
    this.buildSite();
    this.spawnZib();
    // (riding in the car when the last game ended: back in the world first,
    // so the place set below is a place in the world)
    this.detach();
    const Z = this.zib;
    if (st.follow) {
      const P = this.game.player.pos;
      Z.pos.set(P.x + 1.2, P.y + 1.1, P.z + 1.2);
    } else if (st.wait) {
      Z.pos.set(st.wait.x, this.game.world.heightAt(st.wait.x, st.wait.z) + 0.9, st.wait.z);
    } else this.hideZib();
  }

  // ------------------------------------------------------------ the outburst
  // On a clear dark night, until it has happened.
  showerOn() {
    const g = this.game;
    const env = g.env;
    return this.stage() === 'due' && env.night > 0.55 && env.weather.cloud < 0.75;
  }

  // The Tonight board's line about meteors.
  meteorLine() {
    if (this.stage() !== 'due') return null;
    return 'Meteor outburst expected: the Kappa Cygnids, slow and bright, pouring out of Cygnus high overhead. Watch through the telescope on the first clear dark night';
  }

  // The telescope screen calls this when you watch the outburst, and
  // startFall when the show ends.
  watched() {
    this.game.onEvent?.({ type: 'shower' });
  }

  startFall() {
    const g = this.game;
    if (this.fall || this.stage() !== 'due') return;
    const st = (g.state.visitor = g.state.visitor || {});
    st.stage = 'falling';
    // from high over the observatory's east, out of the radiant, across the
    // sky to the crash site in the forest to the west
    const W = g.world;
    const to = new THREE.Vector3(CRASH.x, W.heightAt(CRASH.x, CRASH.z) + 0.5, CRASH.z);
    const eye = g.camera.position.clone();
    const rad = dirFromAzEl(RADIANT.az, RADIANT.el);
    // (8.5 km out: inside the camera's 9 km reach from the first frame)
    const from = eye.clone().addScaledVector(rad, 8500);
    from.y = Math.max(from.y, 7000);
    this.fall = { t: 0, dur: F_DUR, from, to, eye, last: from.clone(), boomAt: 0, trail: [], trailT: 0 };
    this.buildFallFX();
    g.audio?.craft?.(F_DUR);
    g.hud.toast('There! Low over the trees, and slowing: it is coming down', 'good', 5);
  }

  buildFallFX() {
    const F = this.fall;
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,240,1)', 'rgba(255,170,80,0.55)'), color: 0xffe8c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    head.renderOrder = 5;
    this.group.add(head);
    F.head = head;
    // a wider, softer glow round it
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,200,140,0.7)', 'rgba(255,110,40,0.25)'), color: 0xffa060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    glow.renderOrder = 4;
    this.group.add(glow);
    F.glow = glow;
    // the trail: glowing puffs and smoke, 70 of each, in two clouds
    const tex = glowTex('rgba(255,210,150,0.9)', 'rgba(255,120,60,0.35)');
    const smoke = smokeTex();
    F.glowPts = puffCloud(70, tex, 0xffb070, true);
    F.smokePts = puffCloud(70, smoke, 0x8a8a8e, false);
    this.group.add(F.glowPts, F.smokePts);
    F.trail = [];
    for (let i = 0; i < 140; i++) F.trail.push({ i: i >> 1, glow: !(i % 2), life: 0, max: 1, size: 0, p: new THREE.Vector3() });
  }

  // The craft's place on its way down, at u (0 to 1): fast and high at
  // first, slowing hard in the thick air low down, weaving as it fights for
  // control.
  fallPoint(u, out) {
    const F = this.fall;
    const k = 1 - Math.pow(1 - u, 2.2);
    out.lerpVectors(F.from, F.to, k);
    // it drops more steeply at the end
    out.y = F.to.y + (F.from.y - F.to.y) * Math.pow(1 - k, 1.6);
    // weaving: a flying thing, not a stone
    const side = _c.set(F.to.z - F.from.z, 0, -(F.to.x - F.from.x)).normalize();
    const weave = Math.sin(u * 9.5) * 380 * (1 - u) * u * 4 + Math.sin(u * 23) * 60 * (1 - u);
    out.addScaledVector(side, weave);
    return out;
  }

  updateFall(dt) {
    const g = this.game;
    const F = this.fall;
    F.t += dt;
    const u = Math.min(1, F.t / F.dur);
    const p = this.fallPoint(u, _a);
    // the head: brightest high up where it is fastest, a ball of plasma
    const d = p.distanceTo(g.camera.position);
    F.head.position.copy(p);
    const size = d * 0.07 * (1 + 0.3 * Math.sin(F.t * 31) * Math.sin(F.t * 17));
    F.head.scale.set(size, size, 1);
    F.head.material.opacity = 0.95 * (1 - smoothstep(0.95, 1, u));
    F.glow.position.copy(p);
    F.glow.scale.set(size * 3.2, size * 3.2, 1);
    F.glow.material.opacity = 0.55 * (1 - smoothstep(0.95, 1, u));
    // the trail: glowing, then smoke drifting in the light of the head
    // a puff every 20 ms of the fall, spread evenly along the way it came
    // this frame, so the trail never breaks up
    F.trailT += dt;
    const n = Math.floor(F.trailT / 0.02);
    if (n > 0 && u < 0.97) {
      F.trailT -= n * 0.02;
      for (let k = 0; k < Math.min(n, 12); k++) {
        const T = F.trail.find((x) => x.life <= 0);
        if (!T) break;
        T.life = T.glow ? 0.9 : 3.2;
        T.max = T.life;
        T.p.copy(F.last).lerp(p, (k + 1) / Math.min(n, 12));
        T.size = d * (T.glow ? 0.055 : 0.04);
      }
      F.last.copy(p);
    }
    const GA = F.glowPts.geometry.attributes;
    const SA = F.smokePts.geometry.attributes;
    for (const T of F.trail) {
      const A = T.glow ? GA : SA;
      if (T.life > 0) T.life -= dt;
      if (T.life <= 0) {
        A.alpha.array[T.i] = 0;
        continue;
      }
      const k = T.life / T.max;
      A.position.array[T.i * 3] = T.p.x;
      A.position.array[T.i * 3 + 1] = T.p.y;
      A.position.array[T.i * 3 + 2] = T.p.z;
      A.size.array[T.i] = T.size * (T.glow ? 0.6 + k * 0.4 : 1.6 - k * 0.8);
      A.alpha.array[T.i] = T.glow ? k * 0.8 : k * 0.35;
    }
    for (const A of [GA, SA]) A.position.needsUpdate = A.size.needsUpdate = A.alpha.needsUpdate = true;
    // a puff's size is in metres: pixels a metre at a metre's distance
    const scale = g.renderer.getDrawingBufferSize(_v2).y / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
    F.glowPts.material.uniforms.scale.value = scale;
    F.smokePts.material.uniforms.scale.value = scale;
    // the land lights up as it comes in low
    g.env.fireFlash = Math.max(g.env.fireFlash || 0, smoothstep(0.55, 0.95, u) * 0.6);
    // your eyes follow it
    const P = g.player;
    if (P.mode === 'foot') {
      const dir = _b.subVectors(p, g.camera.position).normalize();
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.asin(clamp(dir.y, -1, 1));
      let dy = yaw - P.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      P.yaw += dy * Math.min(1, dt * 3);
      P.pitch += (clamp(pitch, -0.3, 1.2) - P.pitch) * Math.min(1, dt * 3);
    }
    if (u >= 1 && !F.down) {
      F.down = true;
      this.impact();
    }
    // after the impact: the boom comes later, the trail fades
    if (F.down) {
      F.after = (F.after || 0) + dt;
      const a = F.after;
      if (F.flash) {
        const k = 1 - smoothstep(0.3, 3.2, a);
        const sz = 170 * (0.4 + 0.6 * Math.min(1, a * 4));
        F.flash.scale.set(sz, sz, 1);
        F.flash.material.opacity = k;
        const fk = smoothstep(0.5, 2, a) * (1 - smoothstep(10, 13, a));
        const fs = 55 * (0.85 + 0.15 * Math.sin(a * 13) * Math.sin(a * 7));
        F.fire.scale.set(fs, fs * 0.8, 1);
        F.fire.material.opacity = 0.55 * fk;
      }
      for (const Q of F.plume || []) {
        const t = Math.max(0, a - Q.delay);
        Q.s.position.y += Q.v * dt * (t > 0 ? 1 : 0);
        const sz = Q.size * (1 + t * 0.5);
        Q.s.scale.set(sz, sz, 1);
        Q.s.material.opacity = t > 0 ? 0.55 * smoothstep(0, 0.6, t) * (1 - smoothstep(4, 12, t)) : 0;
        // lit orange from below at first
        Q.s.material.color.setRGB(0.54 + 0.4 * (1 - smoothstep(0, 4, t)), 0.48 + 0.15 * (1 - smoothstep(0, 4, t)), 0.42);
      }
      // keep watching where it came down for a moment
      const P = g.player;
      if (P.mode === 'foot' && a < 4) {
        const dir = _b.set(CRASH.x - g.camera.position.x, 0, CRASH.z - g.camera.position.z).normalize();
        const yaw = Math.atan2(-dir.x, -dir.z);
        let dy = yaw - P.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        P.yaw += dy * Math.min(1, dt * 3);
        P.pitch += (0.04 - P.pitch) * Math.min(1, dt * 3);
      }
      if (F.boomAt && g.time >= F.boomAt) {
        F.boomAt = 0;
        g.audio?.boom?.();
        g.player.shake = Math.min(1, (g.player.shake || 0) + 0.25);
      }
      if (F.after > 13 && !F.boomAt) this.clearFall();
    }
  }

  // Take the fall's glow, trail, flash and plume out of the sky.
  clearFall() {
    const F = this.fall;
    this.fall = null;
    if (!F) return;
    const gone = [F.head, F.glow, F.flash, F.fire, F.glowPts, F.smokePts, ...(F.plume || []).map((Q) => Q.s)];
    const maps = new Set();
    for (const s of gone) {
      if (!s) continue;
      this.group.remove(s);
      const m = s.material;
      const map = m.map || (m.uniforms && m.uniforms.map && m.uniforms.map.value);
      if (map) maps.add(map);
      m.dispose();
      if (s.isPoints) s.geometry.dispose();
    }
    for (const t of maps) t.dispose();
  }

  impact() {
    const g = this.game;
    const F = this.fall;
    const st = g.state.visitor;
    st.stage = 'down';
    st.at = { day: g.env.day, time: g.env.time };
    F.head.visible = false;
    F.glow.visible = false;
    // the flash over the trees, and a plume of dust and smoke that climbs
    // into the night, lit from below
    const y0 = g.world.heightAt(CRASH.x, CRASH.z);
    // (light in the air: it glows over the hills between, so no depth test)
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,240,1)', 'rgba(255,190,110,0.5)'), color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false, toneMapped: false }));
    flash.position.set(CRASH.x, y0 + 6, CRASH.z);
    this.group.add(flash);
    F.flash = flash;
    // then a red glow over the trees where it burns, for a while
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,190,110,0.9)', 'rgba(255,90,30,0.3)'), color: 0xff8a40, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false, toneMapped: false }));
    fire.position.set(CRASH.x, y0 + 10, CRASH.z);
    this.group.add(fire);
    F.fire = fire;
    F.plume = [];
    const smk = smokeTex();
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smk, color: 0x8a7a6a, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      sp.position.set(CRASH.x + (Math.random() - 0.5) * 6, y0 + 2 + Math.random() * 4, CRASH.z + (Math.random() - 0.5) * 6);
      this.group.add(sp);
      F.plume.push({ s: sp, v: 4 + Math.random() * 5, size: 8 + Math.random() * 8, delay: i * 0.25 });
    }
    g.env.fireFlash = 1;
    this.flash = 1;
    const dist = Math.hypot(CRASH.x - g.camera.position.x, CRASH.z - g.camera.position.z);
    // light is all but instant; the sound walks at 343 m a second
    F.boomAt = g.time + dist / 343;
    this.buildSite();
    this.spawnZib();
    this.hideZib();
    const az = (Math.atan2(CRASH.x - g.camera.position.x, -(CRASH.z - g.camera.position.z)) * 180) / Math.PI;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const dir = dirs[Math.round(((az + 360) % 360) / 45) % 8];
    g.announcer?.say('fireball', { sub: `IT CAME DOWN TO THE ${dir.toUpperCase()}`, kind: 'legend' });
    g.hud.toast(`A flash behind the trees to the ${dir}, about ${Math.round(dist / 100) * 100} m away. The boom will take ${Math.round(dist / 343)} seconds to reach you: sound is slow. The map shows where: Starfall Clearing`, 'good', 10);
    g.save?.();
  }

  // Back to before the outburst: the site gone, the trees standing again.
  teardown() {
    const g = this.game;
    this.clearFall();
    if (this.zib) {
      this.detach();
      g.scene.remove(this.zib.group);
      this.zib = null;
    }
    // Zib's button goes with Zib (a new one comes with the next Zib)
    if (this.interaction) {
      const list = g.props.interactions;
      const i = list.indexOf(this.interaction);
      if (i >= 0) list.splice(i, 1);
      this.interaction = null;
    }
    if (!this.site) return;
    this.group.remove(this.site);
    this.site = null;
    this.smoke = [];
    for (const [t, i, x] of this.felled || []) t.x[i] = x;
    this.felled = null;
    g.scatter.lastPos.set(1e9, 0, 0);
    // the logs and the pod stop blocking the way; the trees block it again
    const C = g.colliders;
    const SC = this.siteColliders;
    if (SC) {
      for (const b of SC.boxes) C.removeBox(b);
      const mine = new Set(SC.circles);
      C.removeCircles(CRASH.x - 30, CRASH.z - 30, CRASH.x + 30, CRASH.z + 30, (c) => mine.has(c));
      for (const c of SC.felled) C.addCircle(c.x, c.z, c.r, c.tag);
      this.siteColliders = null;
    }
    // the grass grows back over the scorched ground
    restoreGrass(g, this.grassUndo);
    this.grassUndo = null;
    delete g.props.layout.parking.crash;
    if (this.siteMesh) {
      this.siteMesh.parent?.remove(this.siteMesh);
      this.siteMesh = null;
    }
    const k = g.world.places.findIndex((p) => p.id === 'crash');
    if (k >= 0) g.world.places.splice(k, 1);
  }

  // ------------------------------------------------------------ the site
  buildSite() {
    if (this.site) return;
    const g = this.game;
    const W = g.world;
    const S = g.scatter;
    const C = g.colliders;
    const x0 = CRASH.x;
    const z0 = CRASH.z;
    const y0 = W.heightAt(x0, z0);
    const site = new THREE.Group();
    site.name = 'crash';
    this.group.add(site);
    // the trees within the blast are down: the forest's own are felled, and
    // trunks laid out radially, roots toward the middle, as at Tunguska
    this.felled = [];
    for (const t of Object.values(S.types)) {
      for (let i = 0; i < t.count; i++) {
        if (Math.hypot(t.x[i] - x0, t.z[i] - z0) < 24) {
          this.felled.push([t, i, t.x[i]]);
          t.x[i] = 1e6;
        }
      }
    }
    const SC = (this.siteColliders = { boxes: [], circles: [], felled: [] });
    SC.felled = C.removeCircles(x0 - 30, z0 - 30, x0 + 30, z0 + 30, (c) => (c.tag === 'tree' || c.tag === 'shrub' || c.tag === 'rock') && Math.hypot(c.x - x0, c.z - z0) < 24);
    S.lastPos.set(1e9, 0, 0);
    // the scorched ground: a disc that follows the land
    const rings = 10;
    const segs = 36;
    const R = 13;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let r = 0; r <= rings; r++) {
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = (r / rings) * R;
        const x = x0 + Math.cos(a) * rr;
        const z = z0 + Math.sin(a) * rr;
        // (on the ground, a little proud of it at the rim of thrown earth)
        const rim = 0.25 * Math.exp(-((rr - 6) * (rr - 6)) / 2.5);
        pos.push(x, W.heightAt(x, z) + 0.18 + rim, z);
        uv.push(0.5 + (Math.cos(a) * rr) / (2 * R), 0.5 + (Math.sin(a) * rr) / (2 * R));
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s;
        const b = a + segs + 1;
        // (turned to face up)
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    dg.setIndex(idx);
    dg.computeVertexNormals();
    const scorch = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: scorchTex(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    // the grass burnt off where the ground is scorched
    this.grassUndo = clearGrass(g, x0, z0, 9);
    scorch.receiveShadow = true;
    site.add(scorch);
    // the rim of thrown-up earth and clods, and the felled trunks
    const b = new ModelBuilder();
    const rnd = mulberry32(88);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = 4.5 + rnd() * 3.5;
      const x = x0 + Math.cos(a) * rr;
      const z = z0 + Math.sin(a) * rr;
      b.dodeca(0.1 + rnd() * 0.22, { pos: [x, W.heightAt(x, z) + 0.03, z], scale: [1.3, 0.5, 1], rot: [0, rnd() * 3, 0], color: rnd() < 0.5 ? 0x6a5236 : 0x54402a, jitter: 0.15 });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      const r0 = 8 + rnd() * 6;
      const len = 6 + rnd() * 7;
      const rad = 0.16 + rnd() * 0.14;
      const ax = x0 + Math.cos(a) * r0;
      const az = z0 + Math.sin(a) * r0;
      const bx = x0 + Math.cos(a) * (r0 + len);
      const bz = z0 + Math.sin(a) * (r0 + len);
      const ay = W.heightAt(ax, az) + rad;
      const by = W.heightAt(bx, bz) + rad * 0.6;
      const burnt = rnd() < 0.6;
      b.beam([ax, ay, az], [bx, by, bz], rad, 7, { r2: rad * 0.35, color: burnt ? 0x231c18 : 0x5a4232, jitter: 0.1, surf: 'log' });
      // the roots torn up at the trunk's foot, facing the blast
      b.dodeca(rad * 2.1, { pos: [ax - Math.cos(a) * 0.2, ay + rad * 0.4, az - Math.sin(a) * 0.2], scale: [0.6, 1, 1], rot: [0, -a, 0], color: 0x4a3828, jitter: 0.25 });
      // two broken branch stubs
      for (let k = 0; k < 2; k++) {
        const t = 0.45 + k * 0.25;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const py = ay + (by - ay) * t;
        b.beam([px, py, pz], [px + Math.sin(a + k) * 0.5, py + 0.45, pz - Math.cos(a + k) * 0.5], rad * 0.3, 5, { color: 0x2a221c, jitter: 0.1 });
      }
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      SC.boxes.push(C.addBox(mx, mz, rad + 0.1, len / 2, Math.atan2(bx - ax, bz - az), -1e9, Math.max(ay, by) + rad, 'log'));
    }
    this.siteMesh = g.props.addMesh(b.build(), 0, 0, 0, 0);
    // the pod, nose down at the middle, its hatch open
    const pod = new THREE.Group();
    const hull = new THREE.Mesh(
      podGeometry(),
      new THREE.MeshPhysicalMaterial({ color: 0x46566a, metalness: 0.85, roughness: 0.24, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620], emissive: 0xff5a1a, emissiveIntensity: 0 })
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    pod.add(hull);
    this.hullMat = hull.material;
    // the seams, glowing faintly
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x6ff0ff, toneMapped: false, transparent: true, opacity: 0.85 });
    for (const [y, r] of [
      [0.7, 0.705],
      [1.4, 0.645],
      [2.05, 0.41],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 40), seamMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.scale.set(1, 0.82, 1);
      pod.add(ring);
    }
    this.seamMat = seamMat;
    // three swept fins at the tail
    const fb = new ModelBuilder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      fb.box(0.03, 0.55, 0.32, { pos: [Math.cos(a) * 0.38, 2.0, Math.sin(a) * 0.32], rot: [0, -a, 0.35], color: 0x3a4656, jitter: 0 });
    }
    const fins = new THREE.Mesh(fb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.3 }));
    fins.castShadow = true;
    pod.add(fins);
    // the open hatch: a dark oval in the side, and its door on the ground
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x05080a }));
    hole.scale.set(0.8, 1.3, 1);
    hole.position.set(0, 1.15, 0.6);
    hole.rotation.x = -0.12;
    pod.add(hole);
    const inside = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(160,255,240,0.9)', 'rgba(60,200,200,0.3)'), color: 0x8ff8f0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false }));
    inside.scale.set(0.9, 1.1, 1);
    inside.position.set(0, 1.15, 0.5);
    pod.add(inside);
    // lying nose down in the bowl, tilted
    // (its nose at the local origin, the tail up its local y: tilt the tail
    // up 35 degrees out of the ground)
    pod.position.set(x0, y0 - 0.25, z0);
    pod.rotation.set(-0.96, 0.7, 0.12, 'YXZ');
    site.add(pod);
    const door = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshPhysicalMaterial({ color: 0x46566a, metalness: 0.85, roughness: 0.3, iridescence: 1, iridescenceIOR: 1.7, side: THREE.DoubleSide }));
    door.scale.set(0.85, 0.35, 1.1);
    door.position.set(x0 + 2.3, W.heightAt(x0 + 2.3, z0 + 1.4) + 0.05, z0 + 1.4);
    door.rotation.set(Math.PI, 0.4, 0.2);
    door.castShadow = true;
    site.add(door);
    SC.circles.push(C.addCircle(x0, z0, 1.6, 'pod'));
    this.pod = pod;
    // where Zib hides: behind the pod, away from the road
    this.hideAt = new THREE.Vector3(x0 - 2.2, y0 + 0.4, z0 - 1.8);
    // smoke from the hull
    const st = smokeTex();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: 0x6c6c70, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false;
      site.add(s);
      this.smoke.push({ s, life: (i / 16) * 7, max: 7 });
    }
    this.site = site;
    // the place on the map, known from the moment you saw the flash
    g.state.discovered.crash = true;
    if (!W.places.some((p) => p.id === 'crash')) {
      const px = x0 + 14;
      const pz = z0 + 10;
      W.places.push({
        id: 'crash',
        name: 'Starfall Clearing',
        kind: 'landmark',
        x: px,
        z: pz,
        y: W.heightAt(px, pz),
        face: Math.atan2(-(x0 - px), -(z0 - pz)),
        blurb: 'Something came down here out of the meteor shower and flattened the trees round it. Its pod lies in the scorched ground. Who flew it? Park on the River Road and walk in: about 120 m through the forest.',
        bearRisk: 0.2,
      });
    }
    const road = g.props.nearestRoad(x0, z0);
    if (road) {
      const dx = road.x - x0;
      const dz = road.z - z0;
      const dl = Math.hypot(dx, dz) || 1;
      g.props.layout.parking.crash = { x: road.x - (dx / dl) * (ROAD_HALF + 2), z: road.z - (dz / dl) * (ROAD_HALF + 2), yaw: Math.atan2(road.tx, road.tz), roadX: road.x, roadZ: road.z, side: { x: dx / dl, z: dz / dl } };
    }
  }

  spawnZib() {
    if (this.zib) return;
    this.zib = new Zib(this.game);
    this.interaction = { id: 'zib', x: 1e6, z: 1e6, r: 3.6 };
    this.game.props.interactions.push(this.interaction);
  }

  hideZib() {
    const Z = this.zib;
    if (!Z || !this.hideAt) return;
    Z.pos.copy(this.hideAt);
    Z.hidden = true;
  }

  // ------------------------------------------------------------ talking
  // What the button says beside Zib, and what it does.
  action() {
    const st = this.state;
    if (!st || !this.zib) return null;
    if (st.stage === 'down') return { label: 'SAY HELLO', icon: 'talk', act: () => this.hello() };
    if (st.follow) return { label: 'WAIT HERE', icon: 'hand', act: () => this.waitHere() };
    return { label: 'INVITE ALONG', icon: 'talk', act: () => this.invite() };
  }

  hello() {
    const g = this.game;
    const st = this.state;
    const Z = this.zib;
    st.stage = 'met';
    Z.hidden = false;
    Z.wave = 2.5;
    Z.setMood('joy', 4);
    g.audio?.chirp?.('hello');
    g.onEvent?.({ type: 'visitor' });
    g.screens.dialog(
      'Zib',
      'It chirps three notes, and the tips of its ears flash in time: one, two, three. You clap back: one, two, three. It wiggles all over. Then it flashes two, three, five, seven, eleven: the prime numbers, the kind of signal scientists expect any thinking creature to know. It points at itself and chirps "Zib". Its ship is broken, and home is a very long way off.',
      [
        ['Invite Zib along', 'good', () => this.invite()],
        ['Let it rest here', '', () => this.waitHere()],
      ]
    );
    g.save?.();
  }

  invite() {
    const g = this.game;
    const st = this.state;
    st.follow = true;
    st.wait = null;
    if (st.stage === 'met' || st.stage === 'down') st.stage = 'friend';
    this.zib.hidden = false;
    this.zib.setMood('joy', 2);
    g.audio?.chirp?.('happy');
    g.hud.toast('Zib comes along, floating at your shoulder. It rides in the hot rod, feels the fish coming and squeaks when a bear is near. Ask it to wait whenever you like', 'good', 7);
    g.save?.();
  }

  waitHere() {
    const g = this.game;
    const st = this.state;
    const Z = this.zib;
    st.follow = false;
    st.wait = { x: Z.pos.x, z: Z.pos.z };
    this.detach();
    Z.hidden = false;
    g.audio?.chirp?.('calm');
    g.hud.toast('Zib settles down to wait here. Come back for it any time', 'good', 4);
    g.save?.();
  }

  // ------------------------------------------------------------ riding
  attachTo(parent, local) {
    const Z = this.zib;
    if (Z.group.parent !== parent) {
      parent.add(Z.group);
      Z.riding = parent;
    }
    Z.group.position.set(local[0], local[1], local[2]);
    Z.group.rotation.set(0, 0, 0);
    Z.group.scale.setScalar(local[3] || 1);
  }

  detach() {
    const Z = this.zib;
    if (!Z || !Z.riding) return;
    const wp = Z.group.getWorldPosition(new THREE.Vector3());
    this.game.scene.add(Z.group);
    Z.group.position.copy(wp);
    Z.group.scale.setScalar(1);
    Z.riding = null;
  }

  // Off to the player in a blink: a flash where it was and where it lands.
  blinkTo(p) {
    const g = this.game;
    const Z = this.zib;
    g.effects?.sparkle?.(Z.pos.x, Z.pos.y, Z.pos.z, 3);
    Z.pos.copy(p);
    g.effects?.sparkle?.(p.x, p.y, p.z, 3);
    g.audio?.chirp?.('blink');
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const g = this.game;
    if (this.fall) this.updateFall(dt);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 0.6);
      g.env.fireFlash = Math.max(g.env.fireFlash || 0, this.flash);
    }
    // the shower in the real sky while it is on: a meteor every few
    // seconds out of Cygnus
    if (this.showerOn() && g.meteors) {
      this.showerT = (this.showerT || 0) - dt;
      if (this.showerT <= 0) {
        this.showerT = 1.2 + Math.random() * 3;
        this.radiantMeteor();
      }
    }
    if (!this.site) return;
    const cam = g.camera.position;
    const near = Math.hypot(cam.x - CRASH.x, cam.z - CRASH.z) < 900;
    // the hull cools over the first hours, the smoke thins over two days
    const st = this.state;
    const since = st && st.at ? (g.env.day - st.at.day) * 24 + (g.env.time - st.at.time) : 99;
    if (this.hullMat) this.hullMat.emissiveIntensity = 0.6 * (1 - smoothstep(0, 3, since));
    if (this.seamMat) this.seamMat.opacity = 0.55 + 0.3 * Math.sin(g.time * 1.3);
    const smokeK = 1 - smoothstep(6, 48, since);
    if (near && smokeK > 0) {
      for (const S of this.smoke) {
        S.life += dt;
        if (S.life > S.max) S.life -= S.max;
        const k = S.life / S.max;
        S.s.visible = true;
        S.s.position.set(CRASH.x + 0.6 + k * 2.2, g.world.heightAt(CRASH.x, CRASH.z) + 0.6 + k * 9, CRASH.z + 0.3 + k * 1.2);
        const sz = 1 + k * 5;
        S.s.scale.set(sz, sz, 1);
        S.s.material.opacity = smokeK * 0.38 * Math.sin(k * Math.PI);
      }
    } else for (const S of this.smoke) S.s.visible = false;
    if (this.zib) this.updateZib(dt);
  }

  radiantMeteor() {
    const M = this.game.meteors;
    const s = M.streaks.find((k) => !k.active);
    if (!s) return;
    // out of the radiant, on a great circle away from it
    const r = dirFromAzEl(RADIANT.az, RADIANT.el, new THREE.Vector3());
    const a = Math.random() * Math.PI * 2;
    const off = 0.15 + Math.random() * 0.5;
    const ax = new THREE.Vector3(0, 1, 0).cross(r).normalize();
    const ay = r.clone().cross(ax).normalize();
    const dir = ax.multiplyScalar(Math.cos(a)).add(ay.multiplyScalar(Math.sin(a)));
    const from = r.clone().addScaledVector(dir, off).normalize();
    const to = r.clone().addScaledVector(dir, off + 0.25 + Math.random() * 0.3).normalize();
    if (to.y < 0.08) return;
    // the Kappa Cygnids are slow: long, lingering trails
    s.start(from, to, 0.9 + Math.random() * 0.8, { width: 0.8 + Math.random() * 0.6, head: 0xfff4e0, tail: 0xffb070, bright: 0.8 + Math.random() * 0.6 });
  }

  updateZib(dt) {
    const g = this.game;
    const Z = this.zib;
    const st = this.state;
    const P = g.player;
    const cam = g.camera.position;
    const d = Math.hypot(Z.pos.x - P.pos.x, Z.pos.z - P.pos.z);
    // (with you it always keeps up: far off after a fast travel, it blinks
    // to you below instead of staying where it was)
    const visibleNear = st.follow || Z.riding || Math.hypot(cam.x - Z.pos.x, cam.z - Z.pos.z) < 600;
    if (!visibleNear) {
      Z.group.visible = false;
      return;
    }
    // its body is sculpted a little each frame when it first appears; it is
    // seen once that is done, but it keeps up with you from the start
    const ready = Z.sculptStep(3, true);
    Z.group.visible = ready;
    // ---- where it goes
    if (st.stage === 'down') {
      // hiding behind the pod, peeking out when you come near, and out
      // round its side, a little way toward you, when you are close
      const peek = d < 14 ? 1 : 0;
      const target = _a.copy(this.hideAt);
      target.y += peek * 0.5;
      if (d < 7) {
        const tx = P.pos.x - this.hideAt.x;
        const tz = P.pos.z - this.hideAt.z;
        const l = Math.hypot(tx, tz) || 1;
        target.x += (tx / l) * 1.4 + (tz / l) * 1.2;
        target.z += (tz / l) * 1.4 - (tx / l) * 1.2;
      }
      Z.pos.lerp(target, Math.min(1, dt * 2));
      if (peek && !Z.peeked) {
        Z.peeked = true;
        Z.setMood('joy', 2);
        g.audio?.chirp?.('peek');
        g.hud.toast('Something is peeking at you from behind the pod: three eyes, glowing ears', 'good', 5);
      }
      Z.vel.set(0, 0, 0);
    } else if (st.follow) {
      if ((P.mode === 'drive' || P.mode === 'boat') && (g.car || g.boat)) {
        // in the passenger seat, or on the boat's bow
        if (P.mode === 'drive') {
          if (g.car === g.hotrod) this.attachTo(g.car.body, [-0.32, 1.02, -0.5, 0.9]);
          else this.attachTo(g.car.body, [0, 1.15, -1.5, 0.8]);
        } else this.attachTo(g.boat.group || g.boat.mesh || g.scene, [0, 0.9, 1.6, 0.9]);
      } else {
        this.detach();
        // at your shoulder, a little behind, a little to the right (your
        // eyes: the camera when you fly, else your head)
        const eye = P.mode === 'glide' ? cam : _c.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
        const fwdX = -Math.sin(P.yaw);
        const fwdZ = -Math.cos(P.yaw);
        const tx = eye.x + -fwdZ * 1.1 - fwdX * 0.9;
        const tz = eye.z + fwdX * 1.1 - fwdZ * 0.9;
        const ground = g.world.heightAt(tx, tz);
        const ty = Math.max(ground + 0.7, eye.y - 0.75);
        const far = Math.hypot(tx - Z.pos.x, tz - Z.pos.z);
        if (far > 45) this.blinkTo(_a.set(tx, ty, tz));
        else {
          const ox = Z.pos.x;
          const oz = Z.pos.z;
          Z.pos.x = damp(Z.pos.x, tx, 2.6, dt);
          Z.pos.y = damp(Z.pos.y, ty, 3, dt);
          Z.pos.z = damp(Z.pos.z, tz, 2.6, dt);
          Z.vel.set((Z.pos.x - ox) / Math.max(dt, 1e-3), 0, (Z.pos.z - oz) / Math.max(dt, 1e-3));
        }
      }
    } else if (st.wait) {
      this.detach();
      const ty = g.world.heightAt(st.wait.x, st.wait.z) + 0.8;
      Z.pos.x = damp(Z.pos.x, st.wait.x, 2, dt);
      Z.pos.y = damp(Z.pos.y, ty, 2, dt);
      Z.pos.z = damp(Z.pos.z, st.wait.z, 2, dt);
    }
    // ---- what it watches: you, mostly
    Z.animate(dt, g.time, Z.riding ? null : P.pos);
    // the button beside it
    const I = this.interaction;
    if (I) {
      const wp = Z.riding ? Z.group.getWorldPosition(_b) : Z.pos;
      const usable = !Z.riding && P.mode === 'foot';
      I.x = usable ? wp.x : 1e6;
      I.z = usable ? wp.z : 1e6;
    }
    if (!st.follow) return;
    // ---- a bear: it squeaks and its ears go red
    this.warnT = Math.max(0, this.warnT - dt);
    for (const b of g.bears.bears) {
      if (b.dead || b.state === 'gone') continue;
      const bd = Math.hypot(b.x - P.pos.x, b.z - P.pos.z);
      const hostile = b.state === 'stalk' || b.state === 'alert' || b.state === 'charge' || b.state === 'attack';
      if ((bd < 45 && hostile) || bd < 28) {
        Z.setMood('bear', 3);
        if (this.warnT <= 0) {
          this.warnT = 25;
          g.audio?.chirp?.('warn');
          g.hud.toast(`Zib squeaks and tugs at your sleeve, ears red: a bear, ${Math.round(bd)} m away`, 'bad', 4);
        }
        break;
      }
    }
    // ---- a fish on its way to your line: the ears turn gold
    const F = g.fishing;
    const enc = F && F.encounter;
    if (enc && (enc.phase === 'approach' || enc.phase === 'nibble') && F.state === 'waiting') {
      Z.setMood('fish', 0.6);
      if (!this.sniffed) {
        this.sniffed = true;
        g.audio?.chirp?.('fish');
        if (!g.state.flags.zibFish) {
          g.state.flags.zibFish = true;
          g.hud.toast('Zib’s ears turn gold and point at the water: it can feel a fish coming before it bites', 'good', 6);
        }
      }
    } else this.sniffed = false;
    // ---- the old saucer in the woods north of Steaming Springs
    if (!g.state.flags.zibSaucer && Math.hypot(P.pos.x - SAUCER.x, P.pos.z - SAUCER.z) < 30) {
      g.state.flags.zibSaucer = true;
      Z.setMood('sad', 6);
      g.audio?.chirp?.('sad');
      g.hud.toast('Zib floats round and round the old saucer, then gives a long, low whistle. It knows this ship. Someone else came this way, a long time ago', 'good', 8);
    }
  }

  // Where Zib is, for the camera's list of subjects.
  photoSpot() {
    const Z = this.zib;
    if (!Z || !Z.group.visible || Z.hidden) return null;
    const p = Z.group.getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y + 0.35, z: p.z };
  }
}
