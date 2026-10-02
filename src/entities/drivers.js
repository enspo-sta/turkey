// Ruben at the wheel, dressed from the wardrobe: a flannel (or whatever he
// wears) torso and arms in the shirt's cloth, a head with his beard, hair
// and hat, and hands that grip the steering wheel and turn with it. For the
// race car he wears a race suit and a helmet instead.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { shirtTexture } from './cloth.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

function darker(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

// A smooth capsule-ish limb between two points: a tapered cylinder with a
// ball at each end, texture v along the limb in cloth tiles.
function limb(a, b, r0, r1, seg = 12) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 3, true);
  geo.translate(0, len / 2, 0);
  const uv = geo.attributes.uv.array;
  for (let i = 1; i < uv.length; i += 2) uv[i] *= len / 0.12;
  for (let i = 0; i < uv.length; i += 2) uv[i] *= 2.6;
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...a), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

// The torso as a lathe round its spine, flattened front to back: waist at
// the origin, the neck at the top. Texture u round the body, v up it.
function torsoGeometry() {
  const P = [
    [0.13, 0],
    [0.142, 0.06],
    [0.152, 0.16],
    [0.162, 0.26],
    [0.166, 0.33],
    [0.152, 0.39],
    [0.118, 0.43],
    [0.07, 0.456],
    [0.052, 0.47],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(P, 20);
  const uv = g.attributes.uv.array;
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] *= 7;
    uv[i + 1] *= 4;
  }
  g.scale(1.24, 1, 0.74);
  return g;
}

// Head, face, beard, hair and hat, built round the head's centre with the
// face toward +z.
export function headParts(b, c, at, { helmet = null } = {}) {
  const [hx, hy, hz] = at;
  const P = (x, y, z) => [hx + x, hy + y, hz + z];
  const skin = c.skin;
  const hair = c.hair;
  if (helmet) {
    // a full-face race helmet in the suit's colours, a dark visor and a
    // stripe over the crown
    b.sphere(0.135, 20, 14, { pos: P(0, 0.01, 0), scale: [0.92, 1, 1.02], color: helmet.shell, jitter: 0, smooth: true });
    b.sphere(0.137, 20, 14, { pos: P(0, 0.012, -0.004), scale: [0.3, 1, 1.02], color: helmet.stripe, jitter: 0, smooth: true });
    b.box(0.17, 0.05, 0.05, { pos: P(0, 0.012, 0.11), rot: [0.1, 0, 0], color: 0x161a20, jitter: 0 });
    b.cyl(0.115, 0.12, 0.05, 18, { pos: P(0, -0.13, -0.01), color: helmet.shell, jitter: 0, smooth: true });
    return;
  }
  b.sphere(0.1, 18, 14, { pos: P(0, 0, 0), scale: [0.92, 1.08, 1], color: skin, jitter: 0, smooth: true });
  // jaw and chin
  b.sphere(0.075, 14, 10, { pos: P(0, -0.052, 0.025), scale: [1, 0.8, 1], color: skin, jitter: 0, smooth: true });
  // nose, brows, eyes and ears
  b.sphere(0.018, 8, 6, { pos: P(0, -0.008, 0.1), scale: [0.9, 1.3, 1.1], color: darker(skin, 0.95), jitter: 0, smooth: true });
  for (const s of [-1, 1]) {
    b.sphere(0.012, 8, 6, { pos: P(s * 0.034, 0.018, 0.088), color: 0x1d1612, jitter: 0, smooth: true });
    b.box(0.03, 0.008, 0.012, { pos: P(s * 0.036, 0.04, 0.092), rot: [0, 0, s * -0.12], color: hair, jitter: 0 });
    b.sphere(0.024, 8, 6, { pos: P(s * 0.094, -0.004, -0.008), scale: [0.45, 1, 0.8], color: darker(skin, 0.93), jitter: 0, smooth: true });
  }
  // hair at the back and sides, under any hat
  b.sphere(0.104, 16, 12, { pos: P(0, 0.012, -0.016), scale: [0.95, 1.06, 1], color: hair, jitter: 0, smooth: true });
  // the beard
  const B = c.beard;
  if (B === 'full' || B === 'lumber') {
    const big = B === 'lumber' ? 1.25 : 1;
    b.sphere(0.08 * big, 14, 10, { pos: P(0, -0.07 - (big - 1) * 0.05, 0.035), scale: [1.08, 0.95 * big, 0.92], color: hair, jitter: 0.03, smooth: true });
    b.sphere(0.05, 10, 8, { pos: P(0, -0.03, 0.078), scale: [1.4, 0.45, 0.7], color: hair, jitter: 0, smooth: true });
    if (B === 'lumber') b.sphere(0.06, 12, 8, { pos: P(0, -0.19, 0.05), scale: [1, 1.3, 0.8], color: hair, jitter: 0.03, smooth: true });
  } else if (B === 'stache') {
    b.sphere(0.045, 10, 8, { pos: P(0, -0.034, 0.088), scale: [1.6, 0.42, 0.6], color: hair, jitter: 0, smooth: true });
    for (const s of [-1, 1]) b.sphere(0.016, 8, 6, { pos: P(s * 0.07, -0.05, 0.075), scale: [1, 1.6, 1], color: hair, jitter: 0, smooth: true });
  } else if (B === 'stubble') {
    b.sphere(0.077, 14, 10, { pos: P(0, -0.054, 0.027), scale: [1.02, 0.82, 1.01], color: darker(skin, 0.68), jitter: 0, smooth: true });
  }
  // the hat
  const H = c.hat;
  if (H.id === 'cap' || H.id === 'trucker') {
    b.sphere(0.108, 18, 10, { pos: P(0, 0.035, -0.006), scale: [0.96, 0.78, 1.02], color: H.color, jitter: 0, smooth: true });
    if (H.front) b.sphere(0.109, 18, 10, { pos: P(0, 0.036, 0.004), scale: [0.8, 0.74, 1], color: H.front, jitter: 0, smooth: true });
    // a curved peak
    b.cyl(0.095, 0.095, 0.008, 18, { pos: P(0, 0.052, 0.1), rot: [0.18, 0, 0], scale: [0.95, 1, 0.72], color: H.color, jitter: 0, smooth: true });
    b.sphere(0.012, 6, 4, { pos: P(0, 0.12, -0.004), color: H.color, jitter: 0, smooth: true });
  } else if (H.id === 'beanie') {
    b.sphere(0.112, 18, 12, { pos: P(0, 0.04, -0.004), scale: [0.98, 0.95, 1.02], color: H.color, jitter: 0, smooth: true });
    b.cyl(0.113, 0.113, 0.05, 18, { pos: P(0, 0.028, -0.004), scale: [0.98, 1, 1.02], color: darker(H.color, 0.85), jitter: 0, smooth: true });
    b.sphere(0.036, 10, 8, { pos: P(0, 0.155, -0.01), color: 0xe8e2d6, jitter: 0.08, smooth: true });
  } else if (H.id === 'bucket') {
    b.cyl(0.086, 0.106, 0.09, 18, { pos: P(0, 0.075, -0.004), color: H.color, jitter: 0, smooth: true });
    b.cyl(0.106, 0.16, 0.03, 20, { pos: P(0, 0.025, -0.004), color: H.color, jitter: 0, smooth: true, open: true });
  } else if (H.id === 'cowboy') {
    b.cyl(0.074, 0.094, 0.12, 18, { pos: P(0, 0.1, -0.004), scale: [1, 1, 1.15], color: H.color, jitter: 0, smooth: true });
    b.cyl(0.0955, 0.0955, 0.026, 18, { pos: P(0, 0.052, -0.004), scale: [1, 1, 1.15], color: 0x2a1a10, jitter: 0, smooth: true });
    // wide brim, curled up at the sides
    const brim = new THREE.CylinderGeometry(0.22, 0.22, 0.01, 28, 1);
    const p = brim.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.22, 2.2) * 0.06);
    }
    b.add(brim, { pos: P(0, 0.04, -0.004), scale: [1, 1, 0.86], color: H.color, jitter: 0, smooth: true });
  } else if (H.id === 'antler') {
    b.sphere(0.11, 18, 12, { pos: P(0, 0.035, -0.004), scale: [0.98, 0.85, 1.02], color: H.color, jitter: 0, smooth: true });
    for (const s of [-1, 1]) {
      b.beam(P(s * 0.08, 0.08, 0), P(s * 0.25, 0.17, -0.02), 0.018, 8, { r2: 0.014, color: H.horn, jitter: 0, smooth: true });
      b.sphere(0.07, 12, 8, { pos: P(s * 0.3, 0.22, -0.02), scale: [1.3, 0.35, 0.9], rot: [0, 0, s * 0.4], color: H.horn, jitter: 0.03, smooth: true });
      for (let k = 0; k < 3; k++) b.beam(P(s * (0.26 + k * 0.04), 0.24, -0.04 + k * 0.03), P(s * (0.28 + k * 0.05), 0.31, -0.02 + k * 0.03), 0.011, 6, { r2: 0.005, color: H.horn, jitter: 0, smooth: true });
    }
  } else if (H.id === 'tinfoil') {
    // crumpled by hand into a point: the jitter is the crinkle
    b.cyl(0.115, 0.12, 0.05, 9, { pos: P(0, 0.05, -0.004), color: H.color, jitter: 0.14 });
    b.cone(0.115, 0.24, 9, { pos: P(0, 0.19, -0.004), rot: [0.08, 0, -0.06], color: H.color, jitter: 0.16 });
  } else if (H.id === 'santa') {
    // a red point flopped back over the white fur band, and the bobble
    b.cone(0.105, 0.28, 16, { pos: P(0, 0.16, -0.05), rot: [-0.6, 0, 0], color: H.color, jitter: 0, smooth: true });
    b.torus(0.105, 0.03, 8, 20, { pos: P(0, 0.05, -0.004), rot: [Math.PI / 2, 0, 0], color: H.trim, jitter: 0.04, smooth: true });
    b.sphere(0.035, 10, 8, { pos: P(0, 0.25, -0.17), color: H.trim, jitter: 0.06, smooth: true });
  }
}

// A gloved or bare hand closed round a wheel rim, built along +x (the rim's
// tangent) with the palm toward -z.
function fistGeometry(c) {
  const b = new ModelBuilder();
  const palm = c.gloves === 'none' ? c.skin : c.glove;
  const fingers = c.gloves === 'leather' ? c.glove : c.skin;
  b.sphere(0.04, 12, 8, { pos: [0, 0, -0.012], scale: [1.15, 0.95, 0.8], color: palm, jitter: 0, smooth: true });
  for (let i = 0; i < 4; i++) {
    b.torus(0.02, 0.0105, 6, 10, { pos: [-0.033 + i * 0.022, 0, 0.004], rot: [0, Math.PI / 2, 0], arc: Math.PI * 1.3, color: fingers, jitter: 0, smooth: true });
  }
  b.beam([0.035, 0.012, -0.03], [0.05, 0.03, 0.012], 0.011, 6, { color: fingers, jitter: 0, smooth: true });
  return b.build();
}

export class Driver {
  // seat: the hip point; wheel: the steering wheel group (hands ride on it);
  // grip: the hands' places on the rim in the wheel's frame
  constructor({ hip, lean = 0.08, shoulder = 0.19, elbow, wheel = null, grip = [], suit = null, head = null }) {
    this.group = new THREE.Group();
    this.headAt = head;
    this.hip = hip;
    this.lean = lean;
    this.shoulderW = shoulder;
    this.elbowAt = elbow;
    this.wheel = wheel;
    this.grip = grip;
    this.suit = suit;
    this.clothMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    this.cloth = new THREE.Mesh(new THREE.BufferGeometry(), this.clothMat);
    this.head = new THREE.Mesh(new THREE.BufferGeometry(), this.skinMat);
    this.group.add(this.cloth, this.head);
    // forearms: unit cylinders stretched each frame from elbow to wrist
    const fa = new THREE.CylinderGeometry(0.036, 0.044, 1, 12, 1, true);
    fa.translate(0, 0.5, 0);
    const uv = fa.attributes.uv.array;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] *= 2.4;
      uv[i + 1] *= 2.6;
    }
    this.forearms = [new THREE.Mesh(fa, this.clothMat), new THREE.Mesh(fa, this.clothMat)];
    this.group.add(...this.forearms);
    this.hands = [new THREE.Mesh(new THREE.BufferGeometry(), this.skinMat), new THREE.Mesh(new THREE.BufferGeometry(), this.skinMat)];
    if (wheel) {
      for (let i = 0; i < 2; i++) {
        const g = grip[i];
        this.hands[i].position.set(g[0], g[1], g[2]);
        // along the rim's tangent there
        this.hands[i].rotation.z = Math.atan2(-g[0], g[1]);
        wheel.add(this.hands[i]);
      }
    }
    for (const m of [this.cloth, this.head, ...this.forearms, ...this.hands]) m.castShadow = true;
  }

  get visible() {
    return this.group.visible;
  }

  // the hands ride on the steering wheel, outside the group
  set visible(v) {
    this.group.visible = v;
    for (const h of this.hands) h.visible = v;
  }

  setLook(c) {
    const [x, y, z] = this.hip;
    const lean = this.lean;
    const top = [x, y + 0.44 * Math.cos(lean), z + 0.44 * Math.sin(lean)];
    // cloth: torso and upper arms in the shirt (or the race suit)
    const cb = new ModelBuilder({ uvs: true });
    const torso = torsoGeometry();
    torso.rotateX(lean);
    cb.add(torso, { pos: [x, y, z], color: 0xffffff, jitter: 0, smooth: true });
    const shoulders = [];
    for (const s of [1, -1]) {
      const sh = [x + s * this.shoulderW, top[1] - 0.035, top[2] - 0.01];
      shoulders.push(sh);
      cb.add(limb(sh, this.elbowAt(s), 0.05, 0.044), { color: 0xffffff, jitter: 0, smooth: true });
      const ball = new THREE.SphereGeometry(0.056, 12, 8);
      cb.add(ball, { pos: sh, color: 0xffffff, jitter: 0, smooth: true });
      const el = new THREE.SphereGeometry(0.045, 10, 8);
      cb.add(el, { pos: this.elbowAt(s), color: 0xffffff, jitter: 0, smooth: true });
    }
    this.cloth.geometry.dispose();
    this.cloth.geometry = cb.build();
    const tex = this.suit ? this.suit.texture : shirtTexture(c.shirt);
    if (this.clothMat.map !== tex) {
      this.clothMat.map = tex;
      this.clothMat.needsUpdate = true;
    }
    // head, neck and everything on them
    const hb = new ModelBuilder();
    const neck = [x, top[1] + 0.02, top[2] + 0.01];
    const headAt = this.headAt || [x, neck[1] + 0.21, neck[2] + 0.035];
    hb.beam(neck, [headAt[0], headAt[1] - 0.09, headAt[2] - 0.015], 0.048, 12, { color: this.suit ? this.suit.collar : c.skin, jitter: 0, smooth: true });
    if (!this.suit) {
      // a collar on the shirt
      hb.torus(0.058, 0.014, 6, 16, { pos: [x, neck[1] + 0.005, neck[2]], rot: [Math.PI / 2 - 0.2, 0, 0], color: c.shirt.band, jitter: 0, smooth: true });
    }
    headParts(hb, c, headAt, { helmet: this.suit ? this.suit.helmet : null });
    this.head.geometry.dispose();
    this.head.geometry = hb.build();
    // hands
    const fist = fistGeometry(this.suit ? { ...c, gloves: 'leather', glove: this.suit.glove } : c);
    for (const h of this.hands) {
      h.geometry.dispose();
      h.geometry = fist.clone();
    }
    fist.dispose();
    this.shoulders = shoulders;
  }

  // Stretch the forearms from the elbows to the hands, wherever the wheel
  // has turned them. Call after the wheel's matrices are current.
  pose(bodyMatrixInverse) {
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      _a.fromArray(this.elbowAt(s));
      this.hands[i].getWorldPosition(_b).applyMatrix4(bodyMatrixInverse);
      // stop at the wrist, short of the knuckles
      _b.sub(_a);
      const len = Math.max(0.05, _b.length() - 0.035);
      _b.normalize();
      const m = this.forearms[i];
      m.position.copy(_a);
      _q.setFromUnitVectors(_up, _b);
      m.quaternion.copy(_q);
      m.scale.set(1, len, 1);
    }
  }
}
