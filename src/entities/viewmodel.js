// First-person held items rendered in an overlay scene: the fishing rod (with
// shader bend and spinning reel), the longbow (limbs that bend with the draw,
// a string, a nocked arrow and both hands), and the catch pose.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { makeFishModel } from './fishmodels.js';
import { arrowGeometry } from '../gameplay/hunting.js';
import { ARROWS, lookColors } from '../gameplay/data.js';
import { addHand, addSleeve, handFrame, POSES } from './hands.js';
import { shirtTexture } from './cloth.js';
import { clamp, damp, lerp } from '../util/math.js';

const ROD_LEN = 2.3;

function rodMaterial(uniforms) {
  // a glossy painted blank, cork and wraps: barely metallic
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.12 });
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
      jitter: 0,
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
  // machined parts: no tone variation
  // the stem, thin along the rod so it passes between two fingers, up into
  // the reel seat
  b.box(0.011, 0.078, 0.008, { pos: [0, -0.036, 0], color: 0x2a2a2a, jitter: 0 });
  b.cyl(0.028, 0.028, 0.05, 12, { pos: [0, -0.09, -0.012], rot: [Math.PI / 2, 0, 0], color: 0x3a3a3a, jitter: 0 });
  b.cyl(0.024, 0.02, 0.035, 12, { pos: [0, -0.09, -0.05], rot: [Math.PI / 2, 0, 0], color: 0xc8c8c8, jitter: 0 });
  const body = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }));
  g.add(body);
  const hb = new ModelBuilder();
  hb.box(0.06, 0.006, 0.008, { pos: [0.03, 0, 0], color: 0x9a9a9a, jitter: 0 });
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

// The arms: a jointed hand (entities/hands.js) and a sleeve in the shirt's
// cloth (entities/cloth.js), as two meshes in one group per arm.
const v3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (d) => {
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
};
// where a closed fist holds its bar, and the hook of a drawing hand, in the
// hand's frame
const FIST = [0, -0.028, 0.072];
const HOOK = [0, -0.025, 0.128];

function armParts(build) {
  const hand = new ModelBuilder();
  const cloth = new ModelBuilder({ uvs: true });
  build(hand, cloth);
  return { hand: hand.build(), cloth: cloth.build() };
}

// A sleeve leaving the wrist W along direction d, bending by bend on its
// way out of view; with straight, it keeps to the forearm's line that far
// from the wrist, then turns smoothly into the bend; with reach, it runs on
// that much further at its full width (an arm held out further from the eye
// than usual, whose sleeve must still leave the view).
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function sleeveFrom(hand, cloth, c, W, d, bend = [0, 0, 0], { r0 = 0.046, r1 = 0.062, len = 0.48, straight = 0, reach = 0 } = {}) {
  const u = unit(d);
  const p0 = v3(W, u, 0.045);
  const p2 = v3(v3(W, u, len), bend);
  if (reach) {
    const pts = [p0, v3(v3(W, u, len * 0.45), bend, 0.4), p2];
    const shape = new THREE.CatmullRomCurve3(pts.map(vec), false, 'catmullrom', 0.4).getLength();
    addSleeve(cloth, hand, c, [...pts, v3(p2, u, reach)], r0, r1, { wrist: W, shape });
    return;
  }
  if (straight) {
    const q = v3(W, u, straight);
    const rest = len - straight;
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(vec(p0), vec(q)));
    path.add(new THREE.CubicBezierCurve3(vec(q), vec(v3(q, u, rest * 0.35)), vec(v3(v3(q, u, rest * 0.7), bend, 0.5)), vec(p2)));
    addSleeve(cloth, hand, c, path, r0, r1, { wrist: W });
    return;
  }
  addSleeve(cloth, hand, c, [p0, v3(v3(W, u, len * 0.45), bend, 0.4), p2], r0, r1, { wrist: W });
}

// The right hand on the rod at the reel seat, held as an angler holds a
// spinning rod: the grip lies across the palm (see POSES.rod), the fingers
// wrap under it with the reel's stem between the second and third, the thumb
// lies along the top toward the tip, the back of the hand faces out to the
// right, and the wrist is cocked back a little and bent a little toward the
// little finger, well inside its reach. The forearm then runs back to the
// lower right, out of the view. Rod pivot frame: the rod along -z.
const GRIP_DIAG = 0.7; // the grip's angle to the knuckles, as in POSES.rod (40 degrees)
const GRIP_ROLL = -0.17; // the back of the hand, turned down from facing right
const GRIP_ULNAR = 0.44; // the wrist's bend toward the little finger (25 degrees)
const GRIP_BACK = 0.35; // and back, toward the back of the hand (20 degrees)
// where the reel's stem passes between the fingers, in the right hand's own
// frame as handFrame takes it (the index toward +x; POSES and X() use the
// left hand's frame, the mirror image)
const ROD_STEM = [0.0054, -0.031, 0.0785];
function buildHand(c) {
  return armParts((hand, cloth) => {
    const sd = Math.sin(GRIP_DIAG);
    const cd = Math.cos(GRIP_DIAG);
    // the index's side forward and up, the back of the hand to the right
    const xh = new THREE.Vector3(-sd * Math.sin(GRIP_ROLL), sd * Math.cos(GRIP_ROLL), -cd);
    const yh = new THREE.Vector3(Math.cos(GRIP_ROLL), Math.sin(GRIP_ROLL), 0);
    const zh = new THREE.Vector3().crossVectors(xh, yh);
    // from the wrist toward the elbow: back along the hand's line, turned
    // toward the little finger's side and the back of the hand by the
    // wrist's two bends
    const fore = zh.clone().addScaledVector(xh, Math.tan(GRIP_ULNAR)).addScaledVector(yh, -Math.tan(GRIP_BACK)).normalize().negate();
    const X = addHand(hand, c, POSES.rod, handFrame(xh.toArray(), yh.toArray(), ROD_STEM, [0, 0, -0.2]), true);
    sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), fore.toArray(), [0.04, -0.27, 0.02], { straight: 0.13 });
  });
}

// Under the paraglider: a fist round a red brake toggle, the forearm down to
// the elbow below the view and the brake line up to the wing. Built in camera
// space with the toggle at the origin; side -1 is the left hand.
function buildGlideArm(side, c) {
  return armParts((hand, cloth) => {
    hand.cyl(0.014, 0.014, 0.12, 10, { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: 0xd8322a, jitter: 0, smooth: true });
    hand.beam([0, 0.012, 0], [side * 0.14, 2.4, -0.55], 0.0018, 3, { color: 0x222222, jitter: 0 });
    const X = addHand(hand, c, POSES.grip, handFrame([-1, 0, 0], [0, 0.4, 0.9], FIST, [0, 0, 0]), side > 0);
    sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [side * 0.25, -0.85, 0.45], [side * 0.05, 0, 0.04], { r0: 0.044, r1: 0.058 });
  });
}

// Climbing: a hand curled over a hold, in the hold's frame (y up the rock,
// z out of it toward the climber, the hold at the origin), the forearm down
// toward the body. side -1 is the left hand.
const HOLD = [0, -0.032, 0.1];
function buildClimbArm(side, c) {
  return armParts((hand, cloth) => {
    const X = addHand(hand, c, POSES.hold, handFrame([-1, 0, 0], [0, 0.18, 1], HOLD, [0, 0, 0.012]), side > 0);
    sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [side * 0.22, -0.82, 0.52], [side * 0.04, -0.04, 0.05], { r0: 0.044, r1: 0.06, len: 0.5 });
  });
}

// The catch held up: its usual place in front of the eye (x and y; the
// distance out grows with its length), the hold's tilt toward you, how much
// further out a big fish may be held so that all of it shows beside the
// catch card (see Viewmodel.fishFit), and how far the sleeves run on past
// their usual 48 cm so that they still leave the view when it is.
const FISH_AT = [0.02, -0.1];
const FISH_TILT = 0.1;
const FISH_FAR = 2.2;
const FISH_REACH = 1.5;

// Holding up a catch, in the fish rig's frame (x right, y up, z toward the
// camera) with the grip point at the origin: side 1 grips the tail wrist,
// side -1 cradles the belly.
function buildFishArm(side, c) {
  return armParts((hand, cloth) => {
    if (side > 0) {
      const X = addHand(hand, c, POSES.grip, handFrame([-1, 0, 0], [0, 0.5, 0.87], FIST, [0, 0, 0]), true);
      sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [0.3, -0.62, 0.72], [0.03, 0, 0.03], { reach: FISH_REACH });
    } else {
      const X = addHand(hand, c, POSES.cradle, handFrame([1, 0, 0], [0, -1, 0.05], [0, -0.0155, 0.045], [0, 0, 0]), false);
      sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [-0.36, -0.58, 0.72], [-0.03, 0, 0.03], { reach: FISH_REACH });
    }
  });
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

// Left hand closed round the bow's grip, the forearm and sleeve running back
// toward the shoulder.
function buildBowArm(c) {
  return armParts((hand, cloth) => {
    const X = addHand(hand, c, POSES.grip, handFrame([0, -1, 0], [-0.7, 0, 0.7], FIST, [0, 0, 0.02]), false);
    sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [-0.42, -0.46, 0.78], [0, -0.03, 0], { len: 0.55 });
  });
}

// Right hand hooking the string with three fingers, the forearm back past
// the cheek toward the raised elbow.
function buildDrawArm(c) {
  return armParts((hand, cloth) => {
    const X = addHand(hand, c, POSES.draw, handFrame([0, 1, 0], [0.9, 0, 0.3], HOOK, [0, 0, 0]), true);
    sleeveFrom(hand, cloth, c, X([0, 0, -0.012]), [0.42, -0.1, 0.9], [0.02, -0.02, 0], { len: 0.5 });
  });
}

const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _nk = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _sq = new THREE.Quaternion();
const _cm = new THREE.Matrix4();
const _cs = new THREE.Vector3();
const _cv = new THREE.Vector3();
const _invQ = new THREE.Quaternion();

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
    const handMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
    this.handMat = handMat;
    const look = lookColors(null);
    this.clothMat = new THREE.MeshStandardMaterial({ map: shirtTexture(look.shirt), vertexColors: true, roughness: 0.86 });
    this.rodHand = this.makeArm(buildHand(look));
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
    this.bowArm = this.makeArm(buildBowArm(look));
    this.drawArm = this.makeArm(buildDrawArm(look));
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

    // under the paraglider: hands on the brakes, risers up to the wing
    this.glideRig = new THREE.Group();
    this.glideHands = [this.makeArm(buildGlideArm(-1, look)), this.makeArm(buildGlideArm(1, look))];
    const risers = new ModelBuilder();
    for (const sd of [-1, 1]) {
      risers.beam([sd * 0.26, -0.3, 0.05], [sd * 0.5, 2.2, -0.3], 0.011, 4, { color: 0x1c2a4a, jitter: 0 });
      risers.beam([sd * 0.27, -0.3, 0.06], [sd * 0.62, 2.2, -0.12], 0.0025, 3, { color: 0x2a2a2a, jitter: 0 });
    }
    this.glideRisers = new THREE.Mesh(risers.build(), handMat);
    this.glideRig.add(this.glideHands[0], this.glideHands[1], this.glideRisers);
    this.glideRig.visible = false;
    this.root.add(this.glideRig);
    this.glidePull = [0, 0];

    // climbing: both hands on the rock (see gameplay/climbing.js)
    this.climbRig = new THREE.Group();
    this.climbHands = [this.makeArm(buildClimbArm(-1, look)), this.makeArm(buildClimbArm(1, look))];
    this.climbRig.add(this.climbHands[0], this.climbHands[1]);
    this.climbRig.visible = false;
    this.root.add(this.climbRig);
    this.climb = null;

    // held fish
    this.fishRig = new THREE.Group();
    this.root.add(this.fishRig);
    this.fishModel = null;
    this.fishHands = [this.makeArm(buildFishArm(1, look)), this.makeArm(buildFishArm(-1, look))];
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

  // The climber whose hands to show on the rock, or null.
  setClimbHands(climb) {
    this.climb = climb;
    // (off the rock the climbing hands go at once, not on the next frame)
    if (!climb) this.climbRig.visible = false;
  }

  setTool(tool) {
    if (tool === this.tool) return;
    this.tool = tool;
    this.switchT = 0;
  }

  // An arm: the hand and the sleeve, one group.
  makeArm(parts) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(parts.hand, this.handMat), new THREE.Mesh(parts.cloth, this.clothMat));
    return g;
  }

  // Dress the arms in the wardrobe's shirt, skin and gloves.
  applyLook(look) {
    // (the same look again, as on the tap that starts a game: nothing to do)
    const key = JSON.stringify(look ?? null);
    if (key === this.lookKey) return;
    this.lookKey = key;
    const c = lookColors(look);
    const swap = (group, parts) => {
      const [h, cl] = group.children;
      h.geometry.dispose();
      h.geometry = parts.hand;
      cl.geometry.dispose();
      cl.geometry = parts.cloth;
    };
    swap(this.rodHand, buildHand(c));
    swap(this.bowArm, buildBowArm(c));
    swap(this.drawArm, buildDrawArm(c));
    swap(this.fishHands[0], buildFishArm(1, c));
    swap(this.fishHands[1], buildFishArm(-1, c));
    swap(this.glideHands[0], buildGlideArm(-1, c));
    swap(this.glideHands[1], buildGlideArm(1, c));
    swap(this.climbHands[0], buildClimbArm(-1, c));
    swap(this.climbHands[1], buildClimbArm(1, c));
    const tex = shirtTexture(c.shirt);
    if (this.clothMat.map !== tex) {
      this.clothMat.map = tex;
      this.clothMat.needsUpdate = true;
    }
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
    m.rotation.set(0, -Math.PI / 2, m.userData.flat ? -1.2 : 0);
    // one hand grips the tail wrist, the other cradles the belly; a small
    // fish only needs the one hand
    const small = vis < 0.45;
    this.fishHands[0].position.set(vis * (small ? 0.28 : 0.36), -0.004, 0);
    this.fishHands[1].visible = !small;
    this.fishHands[1].position.set(-vis * 0.1, -0.02 - vis * 0.1, 0.01);
    // a box round the fish and the hands on it, tilted as it is held: its
    // corners keep all of it in view (see fishFit)
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    for (const h of this.fishHands) {
      if (!h.visible) continue;
      box.expandByPoint(_cv.copy(h.position).add(_ta.set(0.05, 0.04, 0.04)));
      box.expandByPoint(_cv.copy(h.position).sub(_ta.set(0.05, 0.08, 0.04)));
    }
    const tilt = new THREE.Euler(FISH_TILT, 0, 0);
    this.fishCorners = [];
    for (let i = 0; i < 8; i++) {
      this.fishCorners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyEuler(tilt));
    }
    this.fishModel = m;
    this.fishRig.add(m);
    this.fishRig.visible = true;
    this.fishT = 0;
    this.fishLen = vis;
    this.fishD0 = 0.72 + vis * 0.25;
    this.fishPose = null;
  }

  // Where to hold the catch up: the rig's x and y, and d, its distance out
  // in front of the eye, so that all of it shows inside one of the rooms
  // (rectangles in the view's -1..1 coordinates, y up; see HUD.measureCatch).
  // In the middle of the room that shows it biggest (of two as big, the one
  // it spills out of least, when it is too big even at FISH_FAR, then the
  // one nearer its usual place), at the usual distance or, when it is too
  // big for the room there, further out, at most FISH_FAR times as far.
  // Without rooms, its usual place.
  fishFit(rooms) {
    const d0 = this.fishD0;
    const best = this._fit || (this._fit = { x: 0, y: 0, d: 0 });
    best.x = FISH_AT[0];
    best.y = FISH_AT[1];
    best.d = d0;
    if (!rooms) return best;
    const ty = Math.tan((this.camera.fov * Math.PI) / 360);
    const tx = ty * this.camera.aspect;
    const u0 = FISH_AT[0] / (d0 * tx);
    const v0 = FISH_AT[1] / (d0 * ty);
    const f = this._fitTry || (this._fitTry = { x: 0, y: 0, d: 0, over: 0 });
    let bestD = Infinity;
    let bestOver = Infinity;
    let bestOff = Infinity;
    for (const room of rooms) {
      this.fishIn(room, d0, tx, ty, f);
      const over = Math.max(1, f.over);
      const off = Math.hypot((room.x0 + room.x1) / 2 - u0, (room.y0 + room.y1) / 2 - v0);
      if (f.d < bestD * 0.99 || (f.d < bestD * 1.01 && (over < bestOver - 0.01 || (over < bestOver + 0.01 && off < bestOff)))) {
        bestD = f.d;
        bestOver = over;
        bestOff = off;
        best.x = f.x;
        best.y = f.y;
        best.d = f.d;
      }
    }
    return best;
  }

  // The catch centred in one room (see fishFit).
  fishIn(room, d0, tx, ty, out) {
    const cu = (room.x0 + room.x1) / 2;
    const cv = (room.y0 + room.y1) / 2;
    let d = d0;
    let x = cu * d * tx;
    let y = cv * d * ty;
    for (let i = 0; i < 6; i++) {
      // further out if it is too big, nearer again if that overshot
      let b = this.fishSpan(x, y, d, tx, ty);
      const s = Math.max((b.u1 - b.u0) / (room.x1 - room.x0), (b.v1 - b.v0) / (room.y1 - room.y0));
      const nd = clamp(d * s, d0, d0 * FISH_FAR);
      x *= nd / d;
      y *= nd / d;
      d = nd;
      // then over to the middle
      b = this.fishSpan(x, y, d, tx, ty);
      x += (cu - (b.u0 + b.u1) / 2) * d * tx;
      y += (cv - (b.v0 + b.v1) / 2) * d * ty;
    }
    out.x = x;
    out.y = y;
    out.d = d;
    // how much bigger than the room it still is (1 or less: it fits)
    const b = this.fishSpan(x, y, d, tx, ty);
    out.over = Math.max((b.u1 - b.u0) / (room.x1 - room.x0), (b.v1 - b.v0) / (room.y1 - room.y0));
    return out;
  }

  // The catch's extent on the screen (-1..1) with the rig at x, y, -d.
  fishSpan(x, y, d, tx, ty) {
    const b = this._span || (this._span = { u0: 0, u1: 0, v0: 0, v1: 0 });
    b.u0 = b.v0 = Infinity;
    b.u1 = b.v1 = -Infinity;
    for (const p of this.fishCorners) {
      const z = d - p.z;
      const u = (x + p.x) / (z * tx);
      const v = (y + p.y) / (z * ty);
      if (u < b.u0) b.u0 = u;
      if (u > b.u1) b.u1 = u;
      if (v < b.v0) b.v0 = v;
      if (v > b.v1) b.v1 = v;
    }
    return b;
  }

  // The middle of the screen a photo keeps (see Photo.crop), a little inside
  // its edges.
  photoRoom() {
    const c = this.game.photo?.crop();
    if (!c) return null;
    const r = this._photoRoom || (this._photoRoom = [{ x0: 0, x1: 0, y0: 0, y1: 0 }]);
    const ax = c.fx * 0.9;
    const ay = c.fy * 0.88;
    r[0].x0 = -ax;
    r[0].x1 = ax;
    r[0].y0 = -ay;
    r[0].y1 = ay;
    return r;
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
    const inv = _invQ.copy(game.camera.quaternion).invert();
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
    const gliding = game.player.mode === 'glide';
    this.rodRig.visible = this.shown === 'rod' && !showFish && this.visible && !gliding;
    this.bowRig.visible = this.shown === 'bow' && !showFish && this.visible && !gliding;
    this.glideRig.visible = gliding && this.visible;

    // ---- climbing: each hand on its hold, in the eye's frame; the chalking
    // hand dips to the bag at the hip and back
    this.climbRig.visible = !!this.climb && this.visible;
    if (this.climbRig.visible) {
      const C = this.climb;
      const cam = game.camera;
      for (let k = 0; k < 2; k++) {
        const arm = this.climbHands[k];
        C.handMatrix(k, cam, _cm);
        _cm.decompose(arm.position, arm.quaternion, _cs);
        if (C.shake > 0) {
          arm.position.x += Math.sin(game.time * 38 + k * 2) * 0.004 * C.shake;
          arm.position.y += Math.sin(game.time * 45 + k) * 0.004 * C.shake;
        }
        if (C.chalkT > 0 && C.chalkHand === k) {
          const t = Math.sin((1 - C.chalkT / 1.1) * Math.PI);
          arm.position.lerp(_cv.set(k ? 0.16 : -0.16, -0.62, -0.32), t * 0.9);
        }
      }
    }

    // ---- the paraglider's brakes: pull the side you turn to, both to slow
    if (this.glideRig.visible) {
      const G = game.glider;
      const turn = G.turnIn || 0;
      const push = G.pushIn || 0;
      const brake = Math.max(0, -push);
      const pulls = [Math.max(0, -turn) * 0.13 + brake * 0.1 - Math.max(0, push) * 0.03, Math.max(0, turn) * 0.13 + brake * 0.1 - Math.max(0, push) * 0.03];
      // up at the top corners, nearer the middle on a squarer screen
      const z = -0.5;
      const hh = Math.tan((this.camera.fov * Math.PI) / 360) * -z;
      const x = Math.min(0.45, hh * this.camera.aspect * 0.72);
      for (let i = 0; i < 2; i++) {
        this.glidePull[i] = damp(this.glidePull[i], pulls[i], 7, dt);
        const sd = i ? 1 : -1;
        this.glideHands[i].position.set(sd * x + this.swayX * 0.5, hh * 0.62 - this.glidePull[i] + this.swayY * 0.5 + breathe, z);
        this.glideHands[i].rotation.set(0.1, sd * 0.2, -sd * 0.15);
      }
    }

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
      // held up clear of the catch card; for a trophy photo, which grabs the
      // next frame drawn, in the middle of the picture for that one frame
      // (under the flash)
      const photo = !!game.onRendered;
      const to = this.fishFit(photo ? this.photoRoom() : game.hud.catchRoom);
      const P = this.fishPose || (this.fishPose = { x: to.x, y: to.y, d: to.d });
      if (!photo) {
        P.x = damp(P.x, to.x, 6, dt);
        P.y = damp(P.y, to.y, 6, dt);
        P.d = damp(P.d, to.d, 6, dt);
      }
      const at = photo ? to : P;
      // raised from below the view
      const rise = Math.min(1, this.fishT * 2.5);
      this.fishRig.position.set(at.x + this.swayX, at.y - (1 - rise) * 0.52 * (at.d / this.fishD0) + bob, -at.d);
      this.fishRig.rotation.set(FISH_TILT, 0, 0);
    }
  }
}
