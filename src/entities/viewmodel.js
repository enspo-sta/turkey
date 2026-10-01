// First-person held items rendered in an overlay scene: the fishing rod (with
// shader bend and spinning reel), the longbow (limbs that bend with the draw,
// a string, a nocked arrow and both hands), and the catch pose.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { makeFishModel } from './fishmodels.js';
import { arrowGeometry } from '../gameplay/hunting.js';
import { ARROWS, lookColors } from '../gameplay/data.js';
import { clamp, damp, lerp } from '../util/math.js';

const ROD_LEN = 2.3;

function rodMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = uniforms.uBend;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uBend;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float s = clamp(-position.z / ${ROD_LEN.toFixed(2)}, 0.0, 1.0);
        float k = s * s * ${(ROD_LEN * 0.55).toFixed(3)};
        transformed.y -= uBend.y * k;
        transformed.x += uBend.x * k;
        transformed.z += (abs(uBend.y) + abs(uBend.x)) * k * s * 0.35;`
      );
  };
  return m;
}

// The rod you hold, in the colours of the rod you own (see RODS in data.js).
function buildRod(look = {}) {
  const L = { blank: 0x8e1a14, wrap: 0xd4a93a, grip: 0xc9a46e, tip: 0xf0f0f0, ...look };
  const b = new ModelBuilder();
  // butt and grip
  b.cyl(0.016, 0.016, 0.05, 8, { pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0], color: 0x222222 });
  b.cyl(0.016, 0.018, 0.34, 10, { pos: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: L.grip, jitter: 0.04 });
  b.cyl(0.013, 0.013, 0.12, 8, { pos: [0, 0, -0.2], rot: [Math.PI / 2, 0, 0], color: 0x1a1a1a });
  b.cyl(0.015, 0.015, 0.1, 10, { pos: [0, 0, -0.31], rot: [Math.PI / 2, 0, 0], color: L.grip });
  // blank in segments tapering to the tip
  const segs = 10;
  const z0 = -0.36;
  const len = ROD_LEN + z0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const r0 = 0.009 * (1 - t0) + 0.0022 * t0;
    const r1 = 0.009 * (1 - t1) + 0.0022 * t1;
    const za = z0 - len * t0;
    const zb = z0 - len * t1;
    b.cyl(r1, r0, za - zb, 6, {
      pos: [0, 0, (za + zb) / 2],
      rot: [-Math.PI / 2, 0, 0],
      color: i === segs - 1 ? L.tip : L.stripe && i % 2 ? L.stripe : L.blank,
      jitter: 0.02,
      hseg: 3,
    });
    // guide with gold wrap
    if (i > 0) {
      b.cyl(r0 * 1.6, r0 * 1.6, 0.02, 6, { pos: [0, 0, za], rot: [Math.PI / 2, 0, 0], color: L.wrap, jitter: 0 });
      const gs = 0.012 + (1 - t0) * 0.02;
      b.torus(gs, 0.0018, 4, 10, { pos: [0, -r0 - gs - 0.004, za], color: 0xcfcfcf, jitter: 0 });
    }
  }
  return b.build();
}

function buildReel() {
  const g = new THREE.Group();
  const b = new ModelBuilder();
  b.box(0.012, 0.07, 0.03, { pos: [0, -0.04, 0], color: 0x2a2a2a });
  b.cyl(0.028, 0.028, 0.05, 12, { pos: [0, -0.09, -0.012], rot: [Math.PI / 2, 0, 0], color: 0x3a3a3a });
  b.cyl(0.024, 0.02, 0.035, 12, { pos: [0, -0.09, -0.05], rot: [Math.PI / 2, 0, 0], color: 0xc8c8c8 });
  const body = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }));
  g.add(body);
  const hb = new ModelBuilder();
  hb.box(0.06, 0.006, 0.008, { pos: [0.03, 0, 0], color: 0x9a9a9a });
  hb.cyl(0.006, 0.006, 0.025, 6, { pos: [0.06, 0, 0.012], rot: [Math.PI / 2, 0, 0], color: 0x1a1a1a });
  const handle = new THREE.Mesh(hb.build(), body.material);
  handle.position.set(-0.03, -0.09, -0.012);
  handle.rotation.y = Math.PI / 2;
  const hp = new THREE.Group();
  hp.position.set(-0.032, -0.09, -0.012);
  handle.position.set(0, 0, 0);
  hp.add(handle);
  g.add(hp);
  g.userData.handle = hp;
  return g;
}

// The colour of sleeve band i: flannel checks alternate two colours, the
// loud shirts cycle through three.
function sleeve(c, i) {
  const S = c.shirt;
  if (S.alt) return [S.main, S.band, S.main, S.alt][i % 4];
  return i % 2 ? S.band : S.main;
}

function buildHand(c) {
  const b = new ModelBuilder();
  const color = c.glove;
  b.box(0.075, 0.085, 0.1, { pos: [0, 0, 0], color });
  b.box(0.03, 0.03, 0.06, { pos: [-0.04, 0.02, -0.04], rot: [0, 0.3, 0], color });
  // fingerless wool: the fingertips poke out
  if (c.gloves === 'wool') b.box(0.077, 0.03, 0.03, { pos: [0, 0.02, -0.052], color: c.skin });
  // sleeve and cuff
  b.cyl(0.055, 0.062, 0.34, 8, { pos: [0.03, -0.06, 0.22], rot: [1.25, 0, 0], color: c.shirt.main });
  b.cyl(0.0625, 0.0625, 0.05, 8, { pos: [0.03, -0.075, 0.27], rot: [1.25, 0, 0], color: c.shirt.band });
  b.cyl(0.063, 0.063, 0.04, 8, { pos: [0.03, -0.1, 0.33], rot: [1.25, 0, 0], color: c.shirt.alt ?? 0x1a1a1a });
  return b.build();
}

// Bare hand and flannel sleeve for holding up a catch. Built in the fish
// rig's frame (x right, y up, z toward the camera) with the grip point at the
// origin: side 1 grips the tail wrist, side -1 cradles the belly.
// Hand colours for the wardrobe's gloves: leather covers palm and fingers,
// fingerless wool the palm only.
function handColors(c) {
  const palm = c.gloves === 'none' ? c.skin : c.glove;
  const leather = c.gloves === 'leather';
  return { palm, finger: leather ? c.glove : c.skin, crease: leather ? c.glove : c.crease };
}

function buildFishArm(side, c) {
  const b = new ModelBuilder();
  const skin = c.skin;
  const h = handColors(c);
  if (side > 0) {
    // fist closed around the tail wrist, knuckles toward the camera
    b.box(0.068, 0.084, 0.07, { pos: [0, 0, 0], color: h.palm });
    for (let i = 0; i < 4; i++) b.box(0.064, 0.019, 0.024, { pos: [-0.004, 0.031 - i * 0.021, 0.04], color: i % 2 ? h.finger : h.crease });
    // thumb hooked over the top
    b.box(0.052, 0.022, 0.028, { pos: [-0.026, 0.05, 0.016], rot: [0, 0, 0.22], color: h.finger });
  } else {
    // flat palm under the belly, fingers reaching round the far side
    b.box(0.1, 0.03, 0.085, { pos: [0, -0.004, 0], color: h.palm });
    for (let i = 0; i < 4; i++) b.box(0.02, 0.052, 0.02, { pos: [-0.036 + i * 0.024, 0.02, -0.042], color: i % 2 ? h.crease : h.finger });
    // thumb along the near side
    b.box(0.022, 0.046, 0.022, { pos: [0.046, 0.018, 0.036], rot: [0, 0, -0.3], color: h.finger });
  }
  // forearm running down and out of view toward the camera
  const dir = side > 0 ? [0.3, -0.62, 0.72] : [-0.36, -0.58, 0.72];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const at = (t) => [(dir[0] / n) * t, (dir[1] / n) * t, (dir[2] / n) * t];
  b.beam(at(0.02), at(0.1), 0.03, 12, { r2: 0.034, color: skin, smooth: true });
  b.beam(at(0.09), at(0.13), 0.049, 14, { r2: 0.05, color: c.cuff, smooth: true });
  // the sleeve in bands of the shirt's colours
  for (let i = 0; i < 7; i++) {
    const t0 = 0.13 + i * 0.07;
    b.beam(at(t0), at(t0 + 0.07), 0.051 + i * 0.004, 14, { r2: 0.055 + i * 0.004, color: sleeve(c, i), smooth: true });
  }
  return b.build();
}

// Longbow along +y with the grip at the origin, the belly (facing the
// archer) toward +z. Yew shows its pale sapwood back and orange heartwood
// belly; ash is one pale colour. The limbs are split into short sections so
// the vertex shader can bend them smoothly.
const BOW_HALF = 0.86;
const GRIP = 0.075;
function buildBow(yew) {
  const b = new ModelBuilder();
  const back = yew ? 0xdcc9a0 : 0xcdb38a;
  const belly = yew ? 0xb0612e : 0xc2a070;
  const n = 14;
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const y0 = GRIP + (BOW_HALF - GRIP) * t0;
      const y1 = GRIP + (BOW_HALF - GRIP) * t1;
      const tm = (t0 + t1) / 2;
      const w = 0.031 * (1 - tm) + 0.012 * tm;
      const th = 0.031 * (1 - tm) + 0.011 * tm;
      const yc = (side * (y0 + y1)) / 2;
      const h = y1 - y0 + 0.0005;
      b.box(w, h, th * 0.36, { pos: [0, yc, -th * 0.32], color: back, jitter: 0.03 });
      b.cyl(w * 0.5, w * 0.5, h, 6, { pos: [0, yc, th * 0.14], scale: [1, 1, (th * 0.64) / w], color: belly, jitter: 0.03 });
    }
    // horn nock at the tip
    b.cone(0.0085, 0.05, 6, { pos: [0, side * (BOW_HALF + 0.018), 0.002], rot: [side > 0 ? 0 : Math.PI, 0, 0], color: 0xe9ddc2, jitter: 0.02 });
    b.cyl(0.0075, 0.0085, 0.012, 6, { pos: [0, side * (BOW_HALF - 0.012), 0.002], color: 0x2b2118, jitter: 0 });
  }
  // leather grip with a bound edge, and the arrow pass on the left
  b.cyl(0.02, 0.02, GRIP * 2, 10, { pos: [0, 0, 0.004], scale: [1, 1, 1.18], color: 0x3a2618, jitter: 0.05 });
  b.cyl(0.0205, 0.0205, 0.008, 10, { pos: [0, GRIP, 0.004], scale: [1, 1, 1.18], color: 0x1d130c, jitter: 0 });
  b.cyl(0.0205, 0.0205, 0.008, 10, { pos: [0, -GRIP, 0.004], scale: [1, 1, 1.18], color: 0x1d130c, jitter: 0 });
  b.box(0.014, 0.012, 0.034, { pos: [-0.024, GRIP + 0.006, 0.002], color: 0x5a3a22, jitter: 0.03 });
  return b.build();
}

function bowMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = uniforms.uBend;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBend;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float t = clamp((abs(position.y) - ${GRIP.toFixed(3)}) / ${(BOW_HALF - GRIP).toFixed(3)}, 0.0, 1.0);
        float k = t * t;
        transformed.z += uBend * k;
        transformed.y *= 1.0 - 0.07 * uBend * k;`
      );
  };
  return m;
}

// Where a bent limb's tip is, matching the shader above.
function bowTip(bend, side, out) {
  return out.set(0, side * (BOW_HALF - 0.015) * (1 - 0.07 * bend), bend + 0.002);
}

// Left hand closed round the grip, forearm and flannel sleeve running back
// toward the shoulder.
function buildBowArm(c) {
  const b = new ModelBuilder();
  const skin = c.skin;
  const h = handColors(c);
  b.box(0.05, 0.09, 0.05, { pos: [-0.008, -0.004, 0.024], color: h.palm });
  for (let i = 0; i < 4; i++) b.box(0.056, 0.02, 0.022, { pos: [-0.006, 0.03 - i * 0.021, -0.024], color: i % 2 ? h.crease : h.finger });
  b.box(0.022, 0.05, 0.024, { pos: [0.024, 0.02, 0.02], rot: [0, 0, -0.35], color: h.finger });
  const dir = [-0.42, -0.46, 0.78];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const at = (t, o = [0, 0, 0]) => [o[0] + (dir[0] / n) * t, o[1] + (dir[1] / n) * t, o[2] + (dir[2] / n) * t];
  const w = [-0.01, -0.02, 0.04];
  b.beam(at(0, w), at(0.12, w), 0.026, 12, { r2: 0.029, color: skin, smooth: true });
  b.beam(at(0.11, w), at(0.15, w), 0.042, 12, { r2: 0.043, color: c.cuff, smooth: true });
  for (let i = 0; i < 7; i++) {
    const t0 = 0.15 + i * 0.07;
    b.beam(at(t0, w), at(t0 + 0.07, w), 0.045 + i * 0.004, 12, { r2: 0.049 + i * 0.004, color: sleeve(c, i), smooth: true });
  }
  return b.build();
}

// Right hand hooking the string with three fingers, forearm back past the
// cheek toward the raised elbow.
function buildDrawArm(c) {
  const b = new ModelBuilder();
  const skin = c.skin;
  const h = handColors(c);
  for (let i = 0; i < 3; i++) b.box(0.02, 0.018, 0.05, { pos: [-0.004, 0.022 - i * 0.022, -0.004], color: i % 2 ? h.crease : h.finger });
  b.box(0.05, 0.07, 0.06, { pos: [0.022, 0.0, 0.036], color: h.palm });
  b.box(0.02, 0.02, 0.05, { pos: [0.036, 0.034, 0.012], rot: [0.3, 0, 0], color: h.finger });
  const dir = [0.42, -0.1, 0.9];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const at = (t, o) => [o[0] + (dir[0] / n) * t, o[1] + (dir[1] / n) * t, o[2] + (dir[2] / n) * t];
  const w = [0.03, -0.006, 0.06];
  b.beam(at(0, w), at(0.11, w), 0.025, 12, { r2: 0.028, color: skin, smooth: true });
  b.beam(at(0.1, w), at(0.14, w), 0.041, 12, { r2: 0.042, color: c.cuff, smooth: true });
  for (let i = 0; i < 6; i++) {
    const t0 = 0.14 + i * 0.07;
    b.beam(at(t0, w), at(t0 + 0.07, w), 0.044 + i * 0.004, 12, { r2: 0.048 + i * 0.004, color: sleeve(c, i), smooth: true });
  }
  return b.build();
}

const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _nk = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _sq = new THREE.Quaternion();

// Place a unit-height cylinder (along +y from its base) between a and b.
function stretch(mesh, a, b) {
  _tb.subVectors(b, a);
  const len = _tb.length();
  mesh.position.copy(a);
  _sq.setFromUnitVectors(_up, _tb.divideScalar(len || 1));
  mesh.quaternion.copy(_sq);
  mesh.scale.set(1, len, 1);
}

export class Viewmodel {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 30);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.position.set(0.5, 1, 0.3);
    this.scene.add(this.hemi, this.sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // rod rig
    this.rodUniforms = { uBend: { value: new THREE.Vector2() } };
    this.rodRig = new THREE.Group();
    this.rodPivot = new THREE.Group();
    this.rodRig.add(this.rodPivot);
    this.rod = new THREE.Mesh(buildRod(), rodMaterial(this.rodUniforms));
    this.rodId = 'classic';
    this.rodPivot.add(this.rod);
    this.reel = buildReel();
    this.reel.position.set(0, -0.012, -0.2);
    this.rodPivot.add(this.reel);
    const handMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.handMat = handMat;
    const look = lookColors(null);
    this.rodHand = new THREE.Mesh(buildHand(look), handMat);
    this.rodHand.position.set(0.0, -0.02, 0.02);
    this.rodPivot.add(this.rodHand);
    this.root.add(this.rodRig);
    this.rodBase = new THREE.Vector3(0.24, -0.3, -0.46);

    // longbow rig: bow, both hands, string halves and the nocked arrow
    this.bowUniforms = { uBend: { value: 0.16 } };
    const bowMat = bowMaterial(this.bowUniforms);
    this.bowRig = new THREE.Group();
    this.bowAsh = new THREE.Mesh(buildBow(false), bowMat);
    this.bowYew = new THREE.Mesh(buildBow(true), bowMat);
    this.bowYew.visible = false;
    this.bowArm = new THREE.Mesh(buildBowArm(look), handMat);
    this.drawArm = new THREE.Mesh(buildDrawArm(look), handMat);
    const stringMat = new THREE.MeshStandardMaterial({ color: 0xe6dfcc, roughness: 0.9 });
    const stringGeo = new THREE.CylinderGeometry(0.0013, 0.0013, 1, 4, 1, true);
    stringGeo.translate(0, 0.5, 0);
    this.stringTop = new THREE.Mesh(stringGeo, stringMat);
    this.stringBottom = new THREE.Mesh(stringGeo, stringMat);
    this.bowArrow = new THREE.Mesh(arrowGeometry(1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.bowRig.add(this.bowAsh, this.bowYew, this.bowArm, this.drawArm, this.stringTop, this.stringBottom, this.bowArrow);
    this.root.add(this.bowRig);
    this.drawPose = 0; // 0 lowered and canted, 1 raised to the eye
    this.stringDraw = 0; // how far the string is back, 0..1
    this.looseT = 1; // time since the last loose (1 = settled)
    this.stringWobble = 0;

    // held fish
    this.fishRig = new THREE.Group();
    this.root.add(this.fishRig);
    this.fishModel = null;
    this.fishHands = [new THREE.Mesh(buildFishArm(1, look), handMat), new THREE.Mesh(buildFishArm(-1, look), handMat)];
    for (const h of this.fishHands) this.fishRig.add(h);

    this.tool = 'rod';
    this.shown = 'rod';
    this.switchT = 1;
    this.raise = 1;
    this.visible = true;
    this.swayX = 0;
    this.swayY = 0;
    this.castT = -1;
    this.reelSpin = 0;
    this.rodPose = { pitch: 0.34, side: 0, bendX: 0, bendY: 0, reeling: 0, shake: 0 };
    this.rodPoseTarget = { ...this.rodPose };
    this.fishT = 0;
    this.bowRig.visible = false;
    this.fishRig.visible = false;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTool(tool) {
    if (tool === this.tool) return;
    this.tool = tool;
    this.switchT = 0;
  }

  // Dress the arms in the wardrobe's shirt, skin and gloves.
  applyLook(look) {
    const c = lookColors(look);
    const swap = (mesh, geo) => {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    };
    swap(this.rodHand, buildHand(c));
    swap(this.bowArm, buildBowArm(c));
    swap(this.drawArm, buildDrawArm(c));
    swap(this.fishHands[0], buildFishArm(1, c));
    swap(this.fishHands[1], buildFishArm(-1, c));
  }

  setBowWood(yew) {
    this.bowYew.visible = !!yew;
    this.bowAsh.visible = !yew;
  }

  // Cast animation: starts the wind-up and whip.
  cast() {
    this.castT = 0;
  }

  // The string snaps home and the bow jumps in the hand.
  loose(power) {
    this.looseT = 0;
    this.stringWobble = 0.02 + power * 0.03;
  }

  showFish(id, lengthCm) {
    this.hideFish();
    const m = makeFishModel(id);
    const L = lengthCm / 100;
    const vis = clamp(L, 0.32, 1.25);
    m.scale.setScalar(vis);
    this.fishModel = m;
    this.fishRig.add(m);
    this.fishRig.visible = true;
    this.fishT = 0;
    this.fishLen = vis;

  }

  hideFish() {
    if (this.fishModel) {
      this.fishRig.remove(this.fishModel);
      this.fishModel.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
      this.fishModel = null;
    }
    this.fishRig.visible = false;
  }

  // Rod tip position in world space.
  rodTipWorld(out = new THREE.Vector3()) {
    const b = this.rodUniforms.uBend.value;
    const k = ROD_LEN * 0.55;
    out.set(b.x * k, -b.y * k, -ROD_LEN + (Math.abs(b.x) + Math.abs(b.y)) * k * 0.35);
    this.rod.updateWorldMatrix(true, false);
    out.applyMatrix4(this.rod.matrixWorld);
    // overlay camera sits at the origin with identity rotation; map to world
    out.applyMatrix4(this.game.camera.matrixWorld);
    return out;
  }

  update(dt, ctx) {
    const game = this.game;
    this.camera.fov = game.camera.fov;
    this.camera.aspect = game.camera.aspect;
    this.camera.updateProjectionMatrix();
    // light from the world
    const env = game.env;
    this.hemi.color.copy(env.hemi.color);
    this.hemi.groundColor.copy(env.hemi.groundColor);
    this.hemi.intensity = env.hemi.intensity;
    this.sun.color.copy(env.sun.color);
    // the valley's mountain shade reaches the rod and hands too
    this.shadeT = (this.shadeT || 0) - dt;
    if (this.shadeT <= 0 && game.lighting) {
      this.shadeT = 0.4;
      const eye = game.camera.position;
      this.sunVisTarget = game.lighting.sunVisibility(eye.x, eye.y - 0.3, eye.z, env.lightDir);
    }
    this.sunVis = (this.sunVis ?? 1) + ((this.sunVisTarget ?? 1) - (this.sunVis ?? 1)) * Math.min(1, dt * 3);
    // and so does the shadow of a passing cloud
    this.sun.intensity = env.sun.intensity * 0.85 * this.sunVis * (1 - env.uniforms.uSunVeil.value);
    const ld = env.lightDir;
    // light direction into camera space
    const inv = game.camera.quaternion.clone().invert();
    this.sun.position.copy(ld).applyQuaternion(inv);
    this.scene.environment = game.scene.environment;

    // switching between tools
    this.switchT = Math.min(1, this.switchT + dt * 3.2);
    if (this.switchT < 0.5) this.raise = 1 - this.switchT * 2;
    else {
      this.shown = this.tool;
      this.raise = (this.switchT - 0.5) * 2;
    }
    const lowered = (1 - this.raise) * 0.55;

    // sway and bob
    this.swayX = damp(this.swayX, clamp(-ctx.lookDX * 1.5, -0.06, 0.06), 10, dt);
    this.swayY = damp(this.swayY, clamp(ctx.lookDY * 1.5, -0.06, 0.06), 10, dt);
    const bob = Math.sin(ctx.bobPhase) * 0.012 * ctx.bobAmt;
    const bobX = Math.cos(ctx.bobPhase * 0.5) * 0.014 * ctx.bobAmt;
    const breathe = Math.sin(game.time * 1.6) * 0.003;

    const showFish = !!this.fishModel;
    this.rodRig.visible = this.shown === 'rod' && !showFish && this.visible;
    this.bowRig.visible = this.shown === 'bow' && !showFish && this.visible;

    // ---- rod
    if (this.rodRig.visible) {
      // a new rod from the Trading Post: build it in its own colours
      const owned = game.state.rod();
      if (owned.id !== this.rodId) {
        this.rodId = owned.id;
        this.rod.geometry.dispose();
        this.rod.geometry = buildRod(owned.look);
      }
      const P = this.rodPose;
      const T = this.rodPoseTarget;
      P.pitch = damp(P.pitch, T.pitch, 8, dt);
      P.side = damp(P.side, T.side, 8, dt);
      P.bendX = damp(P.bendX, T.bendX, 10, dt);
      P.bendY = damp(P.bendY, T.bendY, 10, dt);
      P.shake = T.shake;
      let castPitch = 0;
      if (this.castT >= 0) {
        this.castT += dt;
        const t = this.castT;
        if (t < 0.28) castPitch = (t / 0.28) * 1.15; // wind back over the shoulder
        else if (t < 0.46) castPitch = 1.15 - ((t - 0.28) / 0.18) * 1.75; // whip forward
        else if (t < 0.9) castPitch = -0.6 + ((t - 0.46) / 0.44) * 0.6;
        else this.castT = -1;
        this.rodUniforms.uBend.value.y = t > 0.28 && t < 0.55 ? -0.35 : t < 0.28 ? 0.25 : 0;
      } else {
        this.rodUniforms.uBend.value.set(P.bendX, P.bendY);
      }
      const shake = P.shake ? (Math.sin(game.time * 43) + Math.sin(game.time * 27)) * 0.004 * P.shake : 0;
      this.rodRig.position.set(this.rodBase.x + this.swayX + bobX, this.rodBase.y + bob + this.swayY - lowered + breathe, this.rodBase.z);
      this.rodPivot.rotation.set(P.pitch + castPitch + shake, P.side * 0.55 + 0.06, -P.side * 0.25 + shake);
      // the handle turns only while you reel
      P.reeling = damp(P.reeling, T.reeling || 0, 12, dt);
      this.reelSpin += dt * P.reeling * 18;
      this.reel.userData.handle.rotation.x = this.reelSpin;
    }

    // ---- longbow
    if (this.bowRig.visible) {
      const H = game.hunting;
      const drawing = !!(H && H.drawing);
      const nocking = H ? H.nockT : 0;
      const hasArrow = game.state.totalArrows() > 0;
      // the nocked arrow wears its kind's colour
      if (this.bowArrowKind !== game.state.gear.arrow) {
        this.bowArrowKind = game.state.gear.arrow;
        this.bowArrow.material.color.setHex(ARROWS[this.bowArrowKind]?.tint ?? 0xffffff);
      }
      this.drawPose = damp(this.drawPose, drawing || (H && H.aiming) ? 1 : 0, drawing ? 9 : 5, dt);
      // the string follows the draw and snaps home on the loose with a buzz
      this.looseT = Math.min(1, this.looseT + dt * 2.5);
      if (drawing) this.stringDraw = H.draw;
      else this.stringDraw = Math.max(0, this.stringDraw - dt * 14);
      this.stringWobble *= Math.exp(-dt * 9);
      const buzz = Math.sin(this.looseT * 90) * this.stringWobble;
      const bend = 0.16 + 0.15 * this.stringDraw;
      this.bowUniforms.uBend.value = bend;
      // lowered and canted when idle, raised to the eye to draw; the bow
      // jumps forward a little on the loose, and trembles when a full draw is
      // held too long
      const u = this.drawPose;
      const kick = this.looseT < 1 ? Math.sin(this.looseT * Math.PI) * (1 - this.looseT) : 0;
      const tremble = H && H.fullT > 3 ? Math.sin(game.time * 23) * 0.0025 * Math.min(1, (H.fullT - 3) * 0.6) : 0;
      // at full draw the arrow lies right under the eye, the string at the
      // chin, the bow at arm's length a little to the right of the arrow
      this.bowRig.position.set(
        lerp(-0.02, 0.03, u) + this.swayX + bobX * (1 - u) + tremble,
        lerp(-0.3, -0.105, u) + bob * (1 - u * 0.7) + this.swayY - lowered + breathe * (1 - u * 0.5) + tremble * 0.7,
        lerp(-0.52, -0.66, u) - kick * 0.03
      );
      this.bowRig.rotation.set(lerp(0.25, 0, u) - kick * 0.12, lerp(0.3, 0, u), lerp(-0.75, -0.2, u) + kick * 0.05);
      // string from the tips to the nocking point
      const braceZ = bowTip(0.16, 1, _ta).z;
      _nk.set(0, 0.035, braceZ + (0.8 - braceZ) * this.stringDraw + buzz);
      stretch(this.stringTop, _nk, bowTip(bend, 1, _ta));
      stretch(this.stringBottom, _nk, bowTip(bend, -1, _ta));
      // after a loose the right hand fetches the next arrow from the quiver
      const p = nocking > 0 ? 1 - nocking / 0.75 : 1;
      const fetch = nocking > 0 ? Math.sin(p * Math.PI) : 0;
      this.bowArrow.visible = hasArrow && (nocking <= 0 || p > 0.55);
      this.bowArrow.position.set(-0.03, _nk.y - fetch * 0.25, _nk.z - 0.75 + fetch * 0.1);
      this.bowArrow.rotation.set(0, Math.PI, 0);
      this.drawArm.position.set(_nk.x + 0.004 + fetch * 0.12, _nk.y - 0.012 - fetch * 0.3, _nk.z + 0.01 + fetch * 0.05);
    }

    // ---- held fish
    if (showFish) {
      this.fishT += dt;
      const u = this.fishModel.userData.uniforms;
      u.uFlopT.value += dt;
      u.uFlop.value = 0.25 + Math.max(0, Math.sin(this.fishT * 1.7)) * 0.8;
      const rise = Math.min(1, this.fishT * 2.5);
      this.fishRig.position.set(0.02 + this.swayX, -0.62 + rise * 0.52 + bob, -0.72 - this.fishLen * 0.25);
      this.fishRig.rotation.set(0.1, 0, 0);
      this.fishModel.rotation.set(0, -Math.PI / 2, this.fishModel.userData.flat ? -1.2 : 0);
      this.fishModel.position.set(0, 0, 0);
      // one hand grips the tail wrist, the other cradles the belly; a small
      // fish only needs the one hand
      const L = this.fishLen;
      const small = L < 0.45;
      this.fishHands[0].position.set(L * (small ? 0.28 : 0.36), -0.004, 0);
      this.fishHands[1].visible = !small;
      this.fishHands[1].position.set(-L * 0.1, -0.02 - L * 0.1, 0.01);
    }
  }
}
