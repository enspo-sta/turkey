// First-person hands and sleeves. A hand is jointed like a real one: a
// padded palm with the thumb's ball, four fingers of three bones each that
// bend at the knuckles, a thumb of three bones, knuckles and nails. A pose
// gives the joint angles (a fist round a rod grip, an open palm under a
// fish, three fingers hooked on a bow string). The sleeve is a tube of the
// shirt's cloth with soft folds, ending in a buttoned cuff, and the wrist
// and a little forearm show between cuff and hand.
//
// Hand frame: the wrist at the origin, the fingers along +z, the back of
// the hand up (+y). As built the thumb is toward -x, which makes a left
// hand; a right hand is its mirror image, thumb toward +x.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';

const FINGERS = [
  // knuckle across, along, bone lengths, radius
  { x: -0.0285, z: 0.083, L: [0.044, 0.027, 0.021], r: 0.0096 },
  { x: -0.0095, z: 0.087, L: [0.048, 0.03, 0.022], r: 0.0099 },
  { x: 0.0105, z: 0.084, L: [0.045, 0.028, 0.021], r: 0.0094 },
  { x: 0.0285, z: 0.077, L: [0.035, 0.021, 0.019], r: 0.0083 },
];

// Joint angles in radians. Fingers: [knuckle, middle, tip, spread]. The
// thumb is aimed: where its tip should rest, in the (left) hand's frame.
export const POSES = {
  // a fist closed round a bar (rod grip, brake toggle, fish tail)
  grip: { fingers: [[1.25, 1.45, 0.75, 0.05], [1.3, 1.5, 0.75, 0], [1.3, 1.5, 0.75, -0.05], [1.35, 1.45, 0.7, -0.12]], thumb: [-0.004, -0.052, 0.112] },
  // the rod hand: index finger out along the blank, feeling the line
  rod: { fingers: [[0.55, 0.5, 0.25, 0.08], [1.3, 1.5, 0.75, 0], [1.3, 1.5, 0.75, -0.05], [1.35, 1.45, 0.7, -0.12]], thumb: [-0.012, -0.04, 0.12] },
  // an open hand cupped under a belly
  cradle: { fingers: [[0.35, 0.4, 0.2, 0.06], [0.35, 0.42, 0.2, 0], [0.38, 0.42, 0.2, -0.06], [0.42, 0.45, 0.22, -0.13]], thumb: [-0.07, -0.022, 0.085] },
  // fingers curled over a hold on the rock, the thumb along the index
  hold: { fingers: [[0.78, 1.5, 0.55, 0.07], [0.82, 1.55, 0.55, 0], [0.82, 1.5, 0.55, -0.06], [0.88, 1.45, 0.5, -0.13]], thumb: [-0.03, -0.034, 0.088] },
  // three fingers hooked on the string, the little finger and thumb tucked
  draw: { fingers: [[0.3, 1.5, 0.6, 0.06], [0.28, 1.55, 0.6, 0], [0.32, 1.5, 0.6, -0.06], [1.2, 1.4, 0.8, -0.12]], thumb: [-0.012, -0.046, 0.075] },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

// The colours of a hand in a pair of gloves (or none).
export function handPalette(c) {
  const skin = c.skin;
  const leather = c.gloves === 'leather';
  const wool = c.gloves === 'wool';
  return {
    skin,
    back: leather || wool ? c.glove : skin,
    palm: leather || wool ? c.glove : mixHex(skin, 0xffe0d0, 0.15),
    // fingerless wool leaves the last two bones bare
    bone: (k) => (leather ? c.glove : wool && k === 0 ? c.glove : skin),
    knuckle: leather ? mixHex(c.glove, 0x000000, 0.2) : wool ? mixHex(c.glove, 0xffffff, 0.08) : mixHex(skin, 0xc0504a, 0.18),
    nail: leather ? null : mixHex(skin, 0xfff0ea, 0.55),
    crease: leather ? mixHex(c.glove, 0x000000, 0.35) : c.crease,
  };
}

// A nail on the back of a fingertip: up is the back of the finger, dir
// along it.
function nail(b, tip, dir, up, r, color) {
  const x = new THREE.Vector3().crossVectors(up, dir).normalize();
  const g = new THREE.SphereGeometry(1, 10, 6);
  g.scale(r * 0.8, r * 0.3, 0.0088);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, up, dir));
  b.add(g, { pos: [tip[0] - dir.x * 0.009 + up.x * r * 0.72, tip[1] - dir.y * 0.009 + up.y * r * 0.72, tip[2] - dir.z * 0.009 + up.z * r * 0.72], color, jitter: 0, smooth: true });
}

// A capsule between two points (a finger bone).
function capsule(b, a, e, r0, r1, color) {
  b.beam(a, e, r0, 12, { r2: r1, color, jitter: 0, smooth: true });
  b.add(new THREE.SphereGeometry(r1, 12, 8), { pos: e, color, jitter: 0, smooth: true });
}

// A squared-off ellipsoid (the palm): sphere points pushed toward a box.
function roundBox(w, h, d, n = 3.2) {
  const g = new THREE.SphereGeometry(1, 18, 12);
  const p = g.attributes.position;
  const e = 2 / n;
  for (let i = 0; i < p.count; i++) {
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
    p.setXYZ(i, f(p.getX(i)) * w, f(p.getY(i)) * h, f(p.getZ(i)) * d);
  }
  g.computeVertexNormals();
  return g;
}

// Build a posed hand into builder b, transformed by matrix M (hand frame
// to the rig's frame). Returns a function taking hand-frame points to the
// rig's frame.
export function addHand(b, c, pose, M, right = true) {
  const P = handPalette(c);
  const side = right ? -1 : 1;
  const X = (p) => _v.set(p[0] * side, p[1], p[2]).applyMatrix4(M).toArray();
  const local = new ModelBuilder();
  // palm: a padded block, the thumb's ball, the heel of the hand
  local.add(roundBox(0.043, 0.0155, 0.05), { pos: [0.001, 0, 0.042], color: P.back, jitter: 0, smooth: true });
  local.add(new THREE.SphereGeometry(0.02, 14, 10), { pos: [-0.021, -0.009, 0.03], scale: [1, 0.75, 1.35], color: P.palm, jitter: 0, smooth: true });
  local.add(new THREE.SphereGeometry(0.018, 12, 8), { pos: [0.018, -0.008, 0.02], scale: [1.2, 0.7, 1.2], color: P.palm, jitter: 0, smooth: true });
  // wrist
  local.add(new THREE.CylinderGeometry(0.027, 0.03, 0.05, 16, 1, true), { pos: [0, 0, -0.012], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.66], color: P.back === P.skin ? P.skin : P.back, jitter: 0, smooth: true });
  // fingers: bones from the knuckle, each bending further round
  FINGERS.forEach((F, i) => {
    const [mcp, pip, dip, spread] = pose.fingers[i];
    let p = [F.x, 0.002, F.z];
    // the knuckle
    local.add(new THREE.SphereGeometry(F.r * 1.18, 12, 8), { pos: p, color: P.knuckle, jitter: 0, smooth: true });
    const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, -spread);
    const axis = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, -spread);
    const bends = [mcp, pip, dip];
    for (let k = 0; k < 3; k++) {
      dir.applyAxisAngle(axis, bends[k]);
      const e = [p[0] + dir.x * F.L[k], p[1] + dir.y * F.L[k], p[2] + dir.z * F.L[k]];
      const r0 = F.r * (1 - 0.1 * k);
      const r1 = F.r * (1 - 0.1 * (k + 1));
      capsule(local, p, e, r0, r1, P.bone(k));
      if (k === 2 && P.nail) {
        // the nail on the back of the last bone, near its tip
        const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, mcp + pip + dip);
        nail(local, e, dir, up, r1, P.nail);
      }
      p = e;
    }
  });
  // thumb: its root in the ball of the hand, three bones curving to reach
  // the pose's target (round the front of a fist, along a fish's side)
  {
    const T = new THREE.Vector3(...pose.thumb);
    const base = new THREE.Vector3(-0.025, -0.011, 0.02);
    // the first bone leaves the palm forward, outward and a little down
    const d0 = new THREE.Vector3(-0.5, -0.32, 0.8).normalize();
    const L = [0.04, 0.032, 0.026];
    const p1 = base.clone().addScaledVector(d0, L[0]);
    // the last two bones bend toward the target, the tip landing on it
    const toT = T.clone().sub(p1);
    const reach = toT.length();
    const mid = p1.clone().addScaledVector(toT, L[1] / (L[1] + L[2]));
    // bow the middle joint out, away from the palm, when the reach is short
    const slack = Math.max(0, L[1] + L[2] - reach);
    const out = new THREE.Vector3().crossVectors(toT, new THREE.Vector3(0, 0, 1)).normalize();
    if (out.lengthSq() < 0.5) out.set(-1, 0, 0);
    if (out.x > 0) out.negate();
    mid.addScaledVector(out, slack * 0.55).addScaledVector(new THREE.Vector3(0, 1, 0), slack * 0.35);
    const pts = [base, p1, mid, T];
    for (let k = 0; k < 3; k++) {
      const a = pts[k].toArray();
      const e = pts[k + 1].toArray();
      const r0 = 0.0125 - 0.0012 * k;
      const r1 = 0.0118 - 0.0012 * (k + 1);
      capsule(local, a, e, r0, r1, k === 0 ? P.palm : P.bone(k - 1));
      if (k === 2 && P.nail) {
        const dir = pts[3].clone().sub(pts[2]).normalize();
        // the nail faces away from the palm's middle
        const away = new THREE.Vector3(pts[3].x + 0.02, pts[3].y + 0.04, pts[3].z).sub(new THREE.Vector3(0, -0.03, 0.06)).normalize();
        away.addScaledVector(dir, -away.dot(dir)).normalize();
        nail(local, e, dir, away, r1, P.nail);
      }
    }
  }
  const g = local.build();
  // a right hand is the mirror image: mirror and turn the triangles round
  if (right) {
    g.scale(-1, 1, 1);
    const pos = g.attributes.position.array;
    const nrm = g.attributes.normal.array;
    const col = g.attributes.color.array;
    for (let i = 0; i < pos.length; i += 9) {
      for (const arr of [pos, nrm, col]) {
        for (let k = 0; k < 3; k++) {
          const t = arr[i + 3 + k];
          arr[i + 3 + k] = arr[i + 6 + k];
          arr[i + 6 + k] = t;
        }
      }
    }
  }
  b.add(g, { matrix: M, keepColors: true, jitter: 0, smooth: true });
  return X;
}

// A sleeve along a path of points from the cuff back up the arm, radius
// r0 at the cuff growing to r1, with soft folds; texture coordinates in
// tiles of the shirt's cloth. Adds the cuff (with a button) and the bare
// wrist between the cuff and the hand.
export function addSleeve(cloth, skin, c, path, r0, r1, { cuff = true, bare = 0.04, wrist = null } = {}) {
  const pts = path.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const len = curve.getLength();
  const segs = Math.max(8, Math.round(len / 0.02));
  const radial = 20;
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const circ = Math.PI * (r0 + r1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // folds: shallow ripples round the arm, bunching near the cuff
      const fold = 1 + 0.06 * Math.sin(a * 3 + t * 9) * Math.exp(-t * 1.5) + 0.035 * Math.sin(a * 5 - t * 14) + 0.02 * Math.sin(t * 40 + a);
      const ca = Math.cos(a) * r * fold;
      const sa = Math.sin(a) * r * fold;
      pos.push(P.x + N.x * ca + B.x * sa, P.y + N.y * ca + B.y * sa, P.z + N.z * ca + B.z * sa);
      uv.push(((j / radial) * circ) / 0.12, (t * len) / 0.12);
      col.push(1, 1, 1);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  cloth.add(g, { keepColors: true, jitter: 0, smooth: true });
  const p0 = curve.getPointAt(0);
  const d0 = curve.getTangentAt(0);
  if (cuff) {
    // a turned-back cuff, a little wider, with a button on it
    const cg = new THREE.CylinderGeometry(r0 * 1.12, r0 * 1.12, 0.045, 20, 1, true);
    const uvs = cg.attributes.uv.array;
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] *= (2 * Math.PI * r0) / 0.12;
      uvs[i + 1] *= 0.045 / 0.12;
    }
    cg.translate(0, 0.0225, 0);
    _q.setFromUnitVectors(UP, d0);
    _m.compose(p0.clone().addScaledVector(d0, -0.006), _q, new THREE.Vector3(1, 1, 1));
    cloth.add(cg, { matrix: _m.clone(), color: 0xf0f0f0, jitter: 0, smooth: true });
    const side = frames.binormals[0].clone();
    const btn = new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10);
    btn.rotateX(Math.PI / 2);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    _m.compose(p0.clone().addScaledVector(d0, 0.02).addScaledVector(side, r0 * 1.13), _q, new THREE.Vector3(1, 1, 1));
    cloth.add(btn, { matrix: _m.clone(), color: 0x2a1a10, jitter: 0, smooth: true });
  }
  // the bare wrist reaching out of the cuff toward the hand
  if (bare > 0 && skin) {
    const a = wrist || p0.clone().addScaledVector(d0, -bare).toArray();
    skin.beam(a, p0.clone().addScaledVector(d0, 0.01).toArray(), 0.026, 14, { r2: 0.03, color: c.skin, jitter: 0, smooth: true });
  }
  return { start: p0, dir: d0 };
}

// The matrix from the hand frame to a rig: x_h and y_h are where the hand's
// x (across the knuckles toward the little finger of a left hand, the
// index of a right) and y (the back of the hand) point; the hand-frame point
// G lands on target.
export function handFrame(xh, yh, G, target) {
  const x = new THREE.Vector3(...xh).normalize();
  let y = new THREE.Vector3(...yh);
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const M = new THREE.Matrix4().makeBasis(x, y, z);
  const g = new THREE.Vector3(...G).applyMatrix4(M);
  M.setPosition(target[0] - g.x, target[1] - g.y, target[2] - g.z);
  return M;
}
