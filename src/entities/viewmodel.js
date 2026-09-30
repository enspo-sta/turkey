// First-person held items rendered in an overlay scene: the fishing rod (with
// shader bend and spinning reel), the bolt-action rifle, and the catch pose.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { makeFishModel } from './fishmodels.js';
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

function buildRod() {
  const b = new ModelBuilder();
  // butt and cork grip
  b.cyl(0.016, 0.016, 0.05, 8, { pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0], color: 0x222222 });
  b.cyl(0.016, 0.018, 0.34, 10, { pos: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: 0xc9a46e, jitter: 0.04 });
  b.cyl(0.013, 0.013, 0.12, 8, { pos: [0, 0, -0.2], rot: [Math.PI / 2, 0, 0], color: 0x1a1a1a });
  b.cyl(0.015, 0.015, 0.1, 10, { pos: [0, 0, -0.31], rot: [Math.PI / 2, 0, 0], color: 0xc9a46e });
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
      color: i === segs - 1 ? 0xf0f0f0 : 0x8e1a14,
      jitter: 0.02,
      hseg: 3,
    });
    // guide with gold wrap
    if (i > 0) {
      b.cyl(r0 * 1.6, r0 * 1.6, 0.02, 6, { pos: [0, 0, za], rot: [Math.PI / 2, 0, 0], color: 0xd4a93a, jitter: 0 });
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

function buildHand(color = 0x6a4a2e) {
  const b = new ModelBuilder();
  b.box(0.075, 0.085, 0.1, { pos: [0, 0, 0], color });
  b.box(0.03, 0.03, 0.06, { pos: [-0.04, 0.02, -0.04], rot: [0, 0.3, 0], color });
  // flannel sleeve
  b.cyl(0.055, 0.062, 0.34, 8, { pos: [0.03, -0.06, 0.22], rot: [1.25, 0, 0], color: 0xb2261e });
  b.cyl(0.063, 0.063, 0.04, 8, { pos: [0.03, -0.1, 0.33], rot: [1.25, 0, 0], color: 0x1a1a1a });
  return b.build();
}

// Bare hand and flannel sleeve for holding up a catch. Built in the fish
// rig's frame (x right, y up, z toward the camera) with the grip point at the
// origin: side 1 grips the tail wrist, side -1 cradles the belly.
function buildFishArm(side) {
  const b = new ModelBuilder();
  const skin = 0xd9a27c;
  const crease = 0xbf8662;
  if (side > 0) {
    // fist closed around the tail wrist, knuckles toward the camera
    b.box(0.068, 0.084, 0.07, { pos: [0, 0, 0], color: skin });
    for (let i = 0; i < 4; i++) b.box(0.064, 0.019, 0.024, { pos: [-0.004, 0.031 - i * 0.021, 0.04], color: i % 2 ? skin : crease });
    // thumb hooked over the top
    b.box(0.052, 0.022, 0.028, { pos: [-0.026, 0.05, 0.016], rot: [0, 0, 0.22], color: skin });
  } else {
    // flat palm under the belly, fingers reaching round the far side
    b.box(0.1, 0.03, 0.085, { pos: [0, -0.004, 0], color: skin });
    for (let i = 0; i < 4; i++) b.box(0.02, 0.052, 0.02, { pos: [-0.036 + i * 0.024, 0.02, -0.042], color: i % 2 ? crease : skin });
    // thumb along the near side
    b.box(0.022, 0.046, 0.022, { pos: [0.046, 0.018, 0.036], rot: [0, 0, -0.3], color: skin });
  }
  // forearm running down and out of view toward the camera
  const dir = side > 0 ? [0.3, -0.62, 0.72] : [-0.36, -0.58, 0.72];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const at = (t) => [(dir[0] / n) * t, (dir[1] / n) * t, (dir[2] / n) * t];
  b.beam(at(0.02), at(0.1), 0.03, 12, { r2: 0.034, color: skin, smooth: true });
  b.beam(at(0.09), at(0.13), 0.049, 14, { r2: 0.05, color: 0x3a1a14, smooth: true });
  // flannel sleeve with dark check bands
  for (let i = 0; i < 7; i++) {
    const t0 = 0.13 + i * 0.07;
    b.beam(at(t0), at(t0 + 0.07), 0.051 + i * 0.004, 14, { r2: 0.055 + i * 0.004, color: i % 2 ? 0x7a1812 : 0xb2261e, smooth: true });
  }
  return b.build();
}

function buildRifle() {
  const b = new ModelBuilder();
  const wood = 0x6e3f1f;
  const steel = 0x2a2c30;
  // stock
  b.box(0.045, 0.1, 0.3, { pos: [0, -0.045, 0.3], color: wood });
  b.box(0.045, 0.05, 0.12, { pos: [0, 0.0, 0.14], rot: [0.25, 0, 0], color: wood });
  b.box(0.05, 0.13, 0.03, { pos: [0, -0.05, 0.455], color: 0x1a1a1a });
  // forearm
  b.box(0.05, 0.045, 0.42, { pos: [0, -0.005, -0.2], color: wood });
  // receiver & barrel
  b.box(0.038, 0.04, 0.22, { pos: [0, 0.03, 0.03], color: steel });
  b.cyl(0.011, 0.012, 0.62, 8, { pos: [0, 0.035, -0.4], rot: [Math.PI / 2, 0, 0], color: steel });
  b.cyl(0.014, 0.014, 0.03, 8, { pos: [0, 0.035, -0.71], rot: [Math.PI / 2, 0, 0], color: 0x151515 });
  // scope
  b.cyl(0.018, 0.018, 0.26, 12, { pos: [0, 0.09, -0.02], rot: [Math.PI / 2, 0, 0], color: 0x151515 });
  b.cyl(0.026, 0.02, 0.07, 12, { pos: [0, 0.09, -0.17], rot: [Math.PI / 2, 0, 0], color: 0x151515 });
  b.cyl(0.02, 0.024, 0.06, 12, { pos: [0, 0.09, 0.13], rot: [Math.PI / 2, 0, 0], color: 0x151515 });
  b.box(0.012, 0.03, 0.02, { pos: [0, 0.062, -0.06], color: 0x151515 });
  b.box(0.012, 0.03, 0.02, { pos: [0, 0.062, 0.06], color: 0x151515 });
  b.cyl(0.008, 0.008, 0.025, 8, { pos: [0.024, 0.09, -0.02], rot: [0, 0, Math.PI / 2], color: 0x151515 });
  // trigger guard
  b.torus(0.025, 0.004, 4, 10, { pos: [0, -0.03, 0.1], rot: [0, Math.PI / 2, 0], arc: Math.PI, color: steel });
  // sling swivel
  b.torus(0.012, 0.003, 4, 8, { pos: [0, -0.05, -0.3], rot: [0, Math.PI / 2, 0], color: steel });
  const rifle = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }));
  const bolt = new ModelBuilder();
  bolt.beam([0, 0, 0], [0.05, -0.02, 0.01], 0.005, 5, { color: 0xb0b0b0 });
  bolt.sphere(0.012, 8, 6, { pos: [0.05, -0.02, 0.01], color: 0x1a1a1a });
  const boltMesh = new THREE.Mesh(bolt.build(), rifle.material);
  boltMesh.position.set(0.02, 0.04, 0.08);
  return { rifle, bolt: boltMesh };
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
    this.rodPivot.add(this.rod);
    this.reel = buildReel();
    this.reel.position.set(0, -0.012, -0.2);
    this.rodPivot.add(this.reel);
    const handMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.handMat = handMat;
    this.rodHand = new THREE.Mesh(buildHand(), handMat);
    this.rodHand.position.set(0.0, -0.02, 0.02);
    this.rodPivot.add(this.rodHand);
    this.root.add(this.rodRig);
    this.rodBase = new THREE.Vector3(0.24, -0.3, -0.46);

    // rifle rig
    const r = buildRifle();
    this.rifleRig = new THREE.Group();
    this.rifleRig.add(r.rifle, r.bolt);
    this.bolt = r.bolt;
    const lh = new THREE.Mesh(buildHand(), handMat);
    lh.position.set(-0.01, -0.05, -0.28);
    lh.rotation.set(0, 0.2, 0.3);
    lh.scale.set(0.9, 0.9, 0.9);
    this.rifleRig.add(lh);
    const rh = new THREE.Mesh(buildHand(), handMat);
    rh.position.set(0.02, -0.06, 0.16);
    rh.scale.set(0.9, 0.9, 0.9);
    this.rifleRig.add(rh);
    this.root.add(this.rifleRig);
    this.rifleBase = new THREE.Vector3(0.2, -0.25, -0.42);
    this.muzzleLocal = new THREE.Vector3(0, 0.035, -0.73);

    // held fish
    this.fishRig = new THREE.Group();
    this.root.add(this.fishRig);
    this.fishModel = null;
    this.fishHands = [new THREE.Mesh(buildFishArm(1), handMat), new THREE.Mesh(buildFishArm(-1), handMat)];
    for (const h of this.fishHands) this.fishRig.add(h);

    this.tool = 'rod';
    this.shown = 'rod';
    this.switchT = 1;
    this.raise = 1;
    this.visible = true;
    this.scoped = false;
    this.swayX = 0;
    this.swayY = 0;
    this.recoilT = 1;
    this.boltT = 1;
    this.reloadT = 1;
    this.castT = -1;
    this.reelSpin = 0;
    this.rodPose = { pitch: 0.34, side: 0, bendX: 0, bendY: 0, reeling: 0, shake: 0 };
    this.rodPoseTarget = { ...this.rodPose };
    this.fishT = 0;
    this.rifleRig.visible = false;
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

  setScoped(on) {
    this.scoped = on;
  }

  // Cast animation: starts the wind-up and whip.
  cast() {
    this.castT = 0;
  }

  recoil() {
    this.recoilT = 0;
    this.boltT = -0.25;
  }

  reload() {
    this.reloadT = 0;
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

  muzzleWorld(out = new THREE.Vector3()) {
    this.rifleRig.updateWorldMatrix(true, false);
    out.copy(this.muzzleLocal).applyMatrix4(this.rifleRig.matrixWorld).applyMatrix4(this.game.camera.matrixWorld);
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
    this.sun.intensity = env.sun.intensity * 0.85;
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
    this.rifleRig.visible = this.shown === 'rifle' && !this.scoped && !showFish && this.visible;

    // ---- rod
    if (this.rodRig.visible) {
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
      this.reelSpin += dt * P.reeling * 18;
      this.reel.userData.handle.rotation.x = this.reelSpin;
    }

    // ---- rifle
    if (this.rifleRig.visible || this.shown === 'rifle') {
      this.recoilT = Math.min(1, this.recoilT + dt * 5);
      this.boltT = Math.min(1, this.boltT + dt * 1.6);
      this.reloadT = Math.min(1, this.reloadT + dt * 0.5);
      const rk = this.recoilT < 1 ? Math.sin(this.recoilT * Math.PI) * (1 - this.recoilT) : 0;
      const rl = this.reloadT < 1 ? Math.sin(this.reloadT * Math.PI) : 0;
      this.rifleRig.position.set(
        this.rifleBase.x + this.swayX + bobX,
        this.rifleBase.y + bob + this.swayY - lowered + breathe - rl * 0.18,
        this.rifleBase.z + rk * 0.12
      );
      this.rifleRig.rotation.set(rk * 0.35 - rl * 0.5, 0.04, rl * 0.6);
      // bolt: lift and pull back
      const bt = this.boltT;
      if (bt > 0 && bt < 1) {
        const lift = Math.sin(Math.min(1, bt * 2) * Math.PI) * 1.2;
        const pull = Math.sin(bt * Math.PI) * 0.06;
        this.bolt.rotation.z = lift;
        this.bolt.position.z = 0.08 + pull;
      } else {
        this.bolt.rotation.z = 0;
        this.bolt.position.z = 0.08;
      }
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
