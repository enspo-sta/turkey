// Strange things in the woods, on no map: ten oddities in the forests a short
// walk off the roads. Walking up to one finds it (a line on the screen, and it
// is kept in the Journal with a rumour for each one still out there); some can
// be opened, answered or knocked on, and three of them give you something: a
// tinfoil hat, a Santa hat and a paint job for the hot rod. buildOddities()
// adds the pieces through the Props helpers; Oddities runs the finding, the
// ringing payphone, the humming, the gnome who will not stay put and the
// fairy ring's luck.
import * as THREE from 'three';
import { ModelBuilder, jitterGeometry } from '../util/builder.js';
import { mulberry32 } from '../util/math.js';

// Where they stand (picked in dense forest 40 to 140 m from a road, well
// away from the places, on gentle ground), what you read when you find one
// and the rumour the Journal gives for one still out there.
export const ODDITIES = [
  { id: 'fridge', name: 'The fridge in the woods', x: 128, z: 368, find: 'A fridge, humming away in the middle of the forest. There is no plug.', rumour: 'Something hums in the spruce east of the Trading Post.' },
  { id: 'fairyring', name: 'The fairy ring', x: 170, z: 8, find: 'A perfect ring of red toadstools. Step inside if you feel lucky.', rumour: 'Toadstools grow in a perfect circle in the woods north-west of Moose Lake.' },
  { id: 'ufo', name: 'The crash site', x: 812, z: -118, find: 'A flying saucer, nose down in the moss. It is still warm.', rumour: 'Hunters saw green lights come down in the trees north of Steaming Springs.' },
  { id: 'stickhut', name: "Bigfoot's hut", x: 86, z: 812, find: 'Something big built this out of whole trees. The fish bones are fresh.', rumour: 'Big footprints lead into the forest south-west of Mosquito Flats.' },
  { id: 'rustbucket', name: "Ruben's first car", x: -196, z: 554, find: "Ruben's first hot rod, with a spruce growing through the engine. He swears he will fix it one day.", rumour: 'Ruben once lost a car in the woods south-west of the Trading Post. He says it is still there.' },
  { id: 'payphone', name: 'The payphone', x: -592, z: 494, find: 'A payphone on a pole, deep in the woods. It rings.', rumour: 'A phone rings in the forest north-east of Halibut Pier, and nobody knows why.' },
  { id: 'stones', name: 'The standing stones', x: -166, z: -664, find: 'Nine old stones in a ring in the forest. They are warm, even at night.', rumour: 'Old stones stand in a ring in the forest south-west of Glacier Lake.' },
  { id: 'xmastree', name: 'The Christmas tree', x: 638, z: 92, find: 'A Christmas tree, decorated and lit, in the middle of summer. There is a present under it.', rumour: 'Somebody keeps Christmas all year in the woods west of Steaming Springs.' },
  { id: 'gnome', name: 'The gnome', x: 452, z: -382, find: 'A garden gnome with a fishing rod. Did he not stand somewhere else?', rumour: 'A little fisherman in a red hat wanders the forest south-west of Caribou Tundra.' },
  { id: 'fairydoor', name: 'The door in the tree', x: 116, z: -262, find: 'A tiny door at the foot of an old spruce. Somebody lives here.', rumour: 'One old spruce south-east of Bear Falls has a door in it. Knock after dark.' },
];

// Where the gnome may stand (he moves every day), round his own spot.
const GNOME_SPOTS = [
  [0, 0],
  [34, 18],
  [-26, 30],
  [12, -38],
];

// What the payphone says when you answer it.
const CALLS = [
  'Hello? Is this the Trading Post? Do you sell bug dope?',
  'Gus? Gus, is that you? ... Wrong number.',
  'This is the Mosquito Flats mosquito. We have been trying to reach you about your blood.',
  'Hello? We are calling about your hot rod\'s extended warranty.',
  'Heavy breathing. Then, very politely: "Are you fishing near my hut?"',
  'Moose Lake weather: moose, then more moose, clearing by evening.',
  'Static, and somebody far away reeling in a very big fish.',
];

const RUST = 0x5e3a24;

export function oddityAvoid() {
  const out = ODDITIES.map((o) => ({ x: o.x, z: o.z, r: o.id === 'stones' ? 9 : o.id === 'ufo' ? 8 : 6 }));
  const g = ODDITIES.find((o) => o.id === 'gnome');
  for (const [dx, dz] of GNOME_SPOTS) out.push({ x: g.x + dx, z: g.z + dz, r: 2.5 });
  return out;
}

function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}

// The yaw that turns an oddity's front (+z) toward the nearest road.
function towardRoad(P, x, z) {
  const r = P.nearestRoad(x, z);
  return r ? Math.atan2(r.x - x, r.z - z) : 0;
}

export function buildOddities(P) {
  const W = P.world;
  const rand = mulberry32(4242);
  // the oddities' own glow: lamps, lights, runes and toadstool spots,
  // brighter as night falls (see Props.update)
  P.oddGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  // light that is there only after dark (the fairy ring's), faded in by
  // Props.update
  P.oddNightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
  const spots = {};
  for (const o of ODDITIES) {
    const yaw = towardRoad(P, o.x, o.z);
    const to = frame(o.x, o.z, yaw);
    const g = W.heightAt(o.x, o.z);
    const gy = (lx, lz) => W.heightAt(...to(lx, lz)) - g;
    const b = new ModelBuilder();
    const glow = new ModelBuilder();
    const night = new ModelBuilder();
    const ctx = { P, W, o, yaw, to, g, gy, b, glow, night, rand };
    BUILD[o.id](ctx);
    if (b.parts.length) P.addMesh(b.build(), o.x, g, o.z, yaw);
    if (glow.parts.length) P.addMesh(glow.build(), o.x, g, o.z, yaw, P.oddGlowMat, { shadow: false });
    if (night.parts.length) P.addMesh(night.build(), o.x, g, o.z, yaw, P.oddNightMat, { shadow: false });
    spots[o.id] = { x: o.x, z: o.z, y: g, yaw, to };
  }
  P.oddities = spots;
}

// A rough standing stone of unit size: an icosphere pushed out toward a
// box, narrowing toward the top, its surface knocked about.
function menhir(rand) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 2;
    const y = p.getY(i) * 2;
    const z = p.getZ(i) * 2;
    const taper = 1 - 0.11 * (y + 1);
    p.setXYZ(i, Math.sign(x) * Math.abs(x) ** 0.55 * 0.5 * taper, Math.sign(y) * Math.abs(y) ** 0.8 * 0.5, Math.sign(z) * Math.abs(z) ** 0.55 * 0.5 * taper);
  }
  return jitterGeometry(g, 0.1, rand);
}

const BUILD = {
  // A rounded old fridge, yellowed and rusting from the foot up, moss on
  // its top, its cord running off into the moss to no socket at all.
  fridge({ P, b, to, yaw, o, rand }) {
    const WHITE = 0xdcd8c6;
    // (upright, so the rust strips on its sides lie on them)
    b.box(0.82, 1.42, 0.7, { pos: [0, 0.75, 0], color: WHITE, jitter: 0.02 });
    b.add(new THREE.CylinderGeometry(0.35, 0.35, 0.82, 16, 1, false, 0, Math.PI), { pos: [0, 1.46, 0], rot: [0, 0, Math.PI / 2], color: WHITE, jitter: 0.02 });
    // the door's seam, the chrome handle and the badge
    b.box(0.84, 0.015, 0.02, { pos: [0, 1.12, 0.351], color: 0x9a9a92, jitter: 0 });
    b.box(0.05, 0.36, 0.05, { pos: [0.33, 1.2, 0.39], color: 0xc8cccc, jitter: 0 });
    b.box(0.22, 0.05, 0.012, { pos: [-0.2, 1.62, 0.352], color: 0xb8a060, jitter: 0 });
    // rust: a ragged band up from the foot on the three faces you see, spots
    // and a streak down from the handle
    for (const [face, n] of [
      ['front', 9],
      ['left', 7],
      ['right', 7],
    ]) {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const h = 0.08 + rand() * 0.2;
        const c = rand() < 0.5 ? 0x7a3a1c : 0x8a4a22;
        if (face === 'front') b.box(0.84 / n + 0.005, h, 0.012, { pos: [-0.42 + t * 0.84, h / 2 + 0.02, 0.352], color: c, jitter: 0.05 });
        else b.box(0.012, h, 0.7 / n + 0.005, { pos: [(face === 'left' ? -1 : 1) * 0.412, h / 2 + 0.02, -0.35 + t * 0.7], color: c, jitter: 0.05 });
      }
    }
    for (let i = 0; i < 6; i++) b.box(0.03 + rand() * 0.05, 0.02 + rand() * 0.04, 0.012, { pos: [-0.35 + rand() * 0.6, 0.35 + rand() * 1.1, 0.353], color: 0x8a4a22, jitter: 0.05 });
    b.box(0.025, 0.3, 0.012, { pos: [0.33, 0.88, 0.353], color: 0x8a5a32, jitter: 0 });
    // the feet, and moss on the top
    for (const sx of [-0.34, 0.34]) for (const sz of [-0.28, 0.28]) b.cyl(0.03, 0.03, 0.06, 6, { pos: [sx, 0.02, sz], color: 0x2a2a2a });
    b.sphere(0.3, 9, 4, { pos: [-0.08, 1.78, -0.06], scale: [1.15, 0.22, 0.95], color: 0x4f7a2e, jitter: 0.1 });
    b.sphere(0.14, 7, 3, { pos: [0.24, 1.74, 0.12], scale: [1, 0.3, 1], color: 0x5f8a36, jitter: 0.1 });
    // the cord, into nothing
    const pts = [
      [0.2, 0.18, -0.36],
      [0.35, 0.03, -0.9],
      [0.1, 0.02, -1.6],
      [0.45, 0.02, -2.3],
    ];
    for (let i = 0; i + 1 < pts.length; i++) b.beam(pts[i], pts[i + 1], 0.012, 4, { color: 0x1a1a1a });
    b.box(0.06, 0.03, 0.05, { pos: [0.45, 0.03, -2.33], color: 0x1a1a1a });
    const [x, z] = to(0, 0);
    P.colliders.addBox(x, z, 0.45, 0.4, yaw, -1e9, P.world.heightAt(o.x, o.z) + 1.85);
    const [ix, iz] = to(0, 1.1);
    P.interactions.push({ id: 'odd:fridge', x: ix, z: iz, r: 1.8 });
  },

  // Toadstools in a perfect ring: red caps with white spots that glow a
  // little at night.
  fairyring({ b, glow, night, gy, rand }) {
    const R = 2.6;
    const n = 23;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      const x = Math.cos(a) * (R + (rand() - 0.5) * 0.15);
      const z = Math.sin(a) * (R + (rand() - 0.5) * 0.15);
      const y = gy(x, z);
      const h = 0.12 + rand() * 0.12;
      const r = 0.08 + rand() * 0.07;
      b.cyl(r * 0.35, r * 0.45, h, 7, { pos: [x, y + h / 2, z], color: 0xeee8d8 });
      b.add(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [x, y + h - r * 0.15, z], scale: [1, 0.75, 1], color: 0xc4261c, jitter: 0.05 });
      for (let k = 0; k < 3; k++) {
        const sa = rand() * Math.PI * 2;
        const sr = r * (0.3 + rand() * 0.45);
        glow.sphere(r * 0.2, 5, 3, { pos: [x + Math.cos(sa) * sr, y + h - r * 0.15 + Math.sqrt(Math.max(0, r * r - sr * sr)) * 0.75, z + Math.sin(sa) * sr], color: 0xe8f4c8, jitter: 0 });
      }
    }
    // a faint ring of light in the grass after dark
    night.torus(R, 0.07, 4, 48, { pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.25], color: 0x9aff7a, jitter: 0 });
    // and a few small pale ones inside
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const d = 0.4 + rand() * 1.4;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const y = gy(x, z);
      b.cyl(0.012, 0.016, 0.07, 5, { pos: [x, y + 0.035, z], color: 0xeee8d8 });
      b.add(new THREE.SphereGeometry(0.035, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [x, y + 0.065, z], scale: [1, 0.7, 1], color: 0xe8dcc0, jitter: 0.05 });
    }
  },

  // A flying saucer nose down in a crater of torn moss, its hatch open on
  // its side, a ring of green lights, scorched spruce leaning away.
  ufo({ P, b, glow, gy, to, o, rand }) {
    const tilt = 0.32;
    const m = new THREE.Matrix4().makeRotationX(tilt).setPosition(0, 0.65, 0);
    // the crater's rim of thrown earth and stones
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
      const r = 3.3 + rand() * 0.9;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      b.sphere(0.5 + rand() * 0.35, 9, 5, { pos: [x, gy(x, z) - 0.12, z], scale: [1.4, 0.55, 1.1], rot: [0, -a, 0], color: [0x4a3a2a, 0x5a4632, 0x3e3226][i % 3], jitter: 0.1 });
    }
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const r = 2.8 + rand() * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      b.dodeca(0.18 + rand() * 0.2, { pos: [x, gy(x, z) + 0.05, z], scale: [1, 0.7, 1], color: 0x7a786e, jitter: 0.08 });
    }
    // scorched, torn earth over the crater's floor, following the ground
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 3.0;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      b.sphere(0.7 + rand() * 0.5, 8, 3, { pos: [x, gy(x, z) - 0.02, z], scale: [1, 0.06, 1], color: i % 3 ? 0x2a2218 : 0x3a2e20, jitter: 0.1 });
    }
    // the saucer: two shallow domes, the rim, a glass dome on top
    b.add(new THREE.SphereGeometry(2.5, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), { matrix: m, pos: [0, 0, 0], scale: [1, 0.28, 1], color: 0xb8bcc4, smooth: true, jitter: 0 });
    b.add(new THREE.SphereGeometry(2.5, 28, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { matrix: m, pos: [0, 0, 0], scale: [1, 0.22, 1], color: 0x8a8e96, smooth: true, jitter: 0 });
    b.add(new THREE.TorusGeometry(2.5, 0.08, 6, 36), { matrix: m, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: 0x6a6e76, jitter: 0 });
    b.add(new THREE.SphereGeometry(0.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), { matrix: m, pos: [0, 0.6, 0], color: 0x2a4a3a, smooth: true, jitter: 0 });
    // the hatch in its underside on the right, open on a green glow, its
    // door let down as a ramp to the moss (the lower dome's surface is 0.36
    // under the rim's plane at 1.9 m out, sloping up 14 degrees outward)
    glow.add(new THREE.BoxGeometry(0.85, 0.02, 0.75), { matrix: m, pos: [1.9, -0.39, 0], rot: [0, 0, 0.25], color: 0x7aff9a, jitter: 0 });
    b.add(new THREE.BoxGeometry(0.95, 0.03, 0.85), { matrix: m, pos: [1.9, -0.375, 0], rot: [0, 0, 0.25], color: 0x2a2e2a, jitter: 0 });
    b.add(new THREE.BoxGeometry(0.9, 0.05, 0.8), { matrix: m, pos: [2.68, -0.47, 0], rot: [0, 0, -0.43], color: 0x9aa0a8, jitter: 0 });
    // the lights round the rim
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      glow.add(new THREE.SphereGeometry(0.13, 6, 4), { matrix: m, pos: [Math.cos(a) * 2.52, 0.02, Math.sin(a) * 2.52], color: i % 2 ? 0x7aff9a : 0xb0ffc8, jitter: 0 });
    }
    // scorched spruce leaning away from the impact: black trunks with the
    // stubs of their branches
    for (let i = 0; i < 4; i++) {
      const a = 0.6 + i * 1.5 + rand() * 0.4;
      const x = Math.cos(a) * 5.4;
      const z = Math.sin(a) * 5.4;
      const g0 = gy(x, z);
      const top = [x + Math.cos(a) * 2.6, g0 + 5.4, z + Math.sin(a) * 2.6];
      b.beam([x, g0 - 0.2, z], top, 0.2, 7, { r2: 0.04, color: 0x1e1a16, jitter: 0.1 });
      for (let k = 0; k < 6; k++) {
        const t = 0.25 + k * 0.12;
        const p = [x + (top[0] - x) * t, g0 + (top[1] - g0) * t, z + (top[2] - z) * t];
        const ba = rand() * Math.PI * 2;
        const len = 0.5 - t * 0.35;
        b.beam(p, [p[0] + Math.cos(ba) * len, p[1] - 0.1, p[2] + Math.sin(ba) * len], 0.035, 4, { r2: 0.01, color: 0x1e1a16 });
      }
    }
    P.colliders.addCircle(...to(0, 0), 2.6).hi = 1.8;
    const [ix, iz] = to(3.0, 0);
    P.interactions.push({ id: 'odd:ufo', x: ix, z: iz, r: 2.0 });
    // a thin wisp from the crater
    const [sx, sz] = to(0.6, -0.4);
    P.smokePoints.push(new THREE.Vector3(sx, P.world.heightAt(o.x, o.z) + 1.0, sz));
  },

  // Whole young trees leaned into a cone with a way in, spruce boughs laid
  // over them, a bed of moss inside, fish bones by the door and a trail of
  // very big footprints.
  stickhut({ P, b, gy, to, rand }) {
    const n = 36;
    // (the way in faces the road, local +z)
    const door = (a) => Math.abs(((a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.32;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      if (door(a)) continue;
      const r = 2.2 + rand() * 0.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const len = 4.2 + rand() * 1.2;
      const top = [Math.cos(a) * 0.25, 3.6 + rand() * 0.5, Math.sin(a) * 0.25];
      const dir = [top[0] - x, top[1] - gy(x, z), top[2] - z];
      const l = Math.hypot(...dir);
      const end = [x + (dir[0] / l) * len, gy(x, z) + (dir[1] / l) * len, z + (dir[2] / l) * len];
      b.beam([x, gy(x, z) - 0.2, z], end, 0.07 + rand() * 0.05, 5, { r2: 0.025, color: rand() < 0.5 ? 0x5a4632 : 0x6a5640 });
    }
    // spruce boughs laid flat on the lower half, needles still on, their
    // tips up the slope of the poles (60 degrees)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      if (door(a)) continue;
      const h = 0.6 + rand() * 1.3;
      const r = 2.5 - h * 0.57;
      b.cone(0.55, 1.6, 6, { pos: [Math.cos(a) * r, gy(Math.cos(a) * 2, Math.sin(a) * 2) + h, Math.sin(a) * r], rot: [0, -a, 0.51], scale: [0.35, 1, 1], color: rand() < 0.5 ? 0x24402a : 0x2e4a2c, jitter: 0.08 });
    }
    b.sphere(1.3, 10, 5, { pos: [0, gy(0, 0) + 0.05, 0], scale: [1, 0.18, 1], color: 0x3a5a26, jitter: 0.08 });
    // fish bones by the way in
    for (let i = 0; i < 5; i++) {
      const x = -0.7 + rand() * 1.4;
      const z = 2.6 + rand() * 0.9;
      const y = gy(x, z) + 0.025;
      const ry = rand() * Math.PI;
      b.box(0.5, 0.025, 0.025, { pos: [x, y, z], rot: [0, ry, 0], color: 0xf2ece0, jitter: 0 });
      for (let k = -3; k <= 3; k++) b.box(0.015, 0.015, 0.18 - Math.abs(k) * 0.02, { pos: [x + Math.cos(ry) * k * 0.055, y, z - Math.sin(ry) * k * 0.055], rot: [0, ry, 0], color: 0xf2ece0, jitter: 0 });
      b.cone(0.07, 0.14, 4, { pos: [x + Math.cos(ry) * 0.29, y + 0.02, z - Math.sin(ry) * 0.29], rot: [0, ry, Math.PI / 2], color: 0xe8e0cc });
      b.cone(0.06, 0.1, 3, { pos: [x - Math.cos(ry) * 0.29, y + 0.02, z + Math.sin(ry) * 0.29], rot: [0, ry, -Math.PI / 2], color: 0xe8e0cc });
    }
    // footprints: a left and a right, 1.4 m apart, off into the trees
    for (let i = 0; i < 9; i++) {
      const z = 3.8 + i * 1.4;
      const x = (i % 2 ? 0.3 : -0.3) + Math.sin(i * 0.5) * 0.6;
      const y = gy(x, z) + 0.01;
      b.sphere(0.2, 8, 2, { pos: [x, y, z], scale: [0.7, 0.05, 1.3], color: 0x2a2018, jitter: 0.05 });
      for (let k = 0; k < 5; k++) b.sphere(0.045, 5, 2, { pos: [x - 0.1 + k * 0.05, y, z - 0.31 + Math.abs(k - 2) * 0.02], scale: [1, 0.3, 1.2], color: 0x2a2018, jitter: 0.05 });
    }
    P.colliders.addCircle(...to(0, 0), 2.0).hi = 4.0;
  },

  // An old hot rod, rusted through, sunk to its axles, moss on the roof and
  // a spruce growing up through the engine.
  rustbucket({ P, b, gy, to, yaw, rand }) {
    const y0 = -0.12;
    b.box(1.7, 0.35, 3.6, { pos: [0, y0 + 0.55, 0], color: 0x5e3a24, surf: 'concrete', jitter: 0.04 });
    // the cab and its roof, the empty window holes
    b.box(1.5, 0.75, 1.4, { pos: [0, y0 + 1.1, -0.6], color: 0x5a3422, surf: 'concrete' });
    b.box(1.56, 0.08, 1.5, { pos: [0, y0 + 1.5, -0.6], color: 0x5a2a14 });
    b.box(1.45, 0.08, 1.4, { pos: [0, y0 + 1.56, -0.6], color: 0x4a7a2a, jitter: 0.08 });
    for (const sx of [-0.76, 0.76]) b.box(0.02, 0.4, 0.9, { pos: [sx, y0 + 1.15, -0.55], color: 0x14100c, jitter: 0 });
    b.box(1.3, 0.4, 0.02, { pos: [0, y0 + 1.15, 0.11], color: 0x14100c, jitter: 0 });
    // the hood, open, the grille and the headlights, one fallen
    b.box(1.2, 0.05, 1.3, { pos: [0, y0 + 1.3, 1.15], rot: [-0.9, 0, 0], color: RUST, surf: 'concrete' });
    b.box(1.0, 0.55, 0.08, { pos: [0, y0 + 0.75, 1.82], color: 0x4a2a18 });
    for (let k = 0; k < 7; k++) b.box(0.04, 0.5, 0.04, { pos: [-0.42 + k * 0.14, y0 + 0.75, 1.86], color: 0x8a6a4a, jitter: 0 });
    b.cyl(0.13, 0.13, 0.12, 10, { pos: [-0.62, y0 + 0.95, 1.7], rot: [Math.PI / 2, 0, 0], color: 0x8a7a6a });
    b.cyl(0.13, 0.13, 0.12, 10, { pos: [0.75, y0 + 0.1, 2.1], rot: [Math.PI / 2 - 0.6, 0, 0.4], color: 0x8a7a6a });
    // fenders and the flat tyres sunk in the moss
    for (const sx of [-0.92, 0.92]) {
      for (const sz of [-1.15, 1.2]) {
        b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14, 1, false, 0, Math.PI), { pos: [sx, y0 + 0.4, sz], rot: [0, 0, Math.PI / 2], color: RUST, surf: 'concrete' });
        b.torus(0.33, 0.13, 6, 14, { pos: [sx, y0 + 0.2, sz], rot: [0, Math.PI / 2, 0], scale: [1, 0.8, 1], color: 0x1c1a18 });
      }
    }
    // rust in patches, dark and pale, and holes rusted right through: on
    // the body between the fenders and on the cab's sides
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const cab = k >= 4;
        const pz = cab ? -1.15 + rand() * 1.1 : -0.6 + rand() * 1.2;
        const py = cab ? y0 + 0.8 + rand() * 0.15 : y0 + 0.45 + rand() * 0.15;
        const hole = rand() < 0.25;
        b.box(0.012, 0.07 + rand() * 0.1, 0.12 + rand() * 0.25, { pos: [sd * ((cab ? 0.751 : 0.851) + (hole ? 0.002 : 0)), py, pz], color: hole ? 0x140e0a : rand() < 0.5 ? 0x3a2214 : 0x8a5a36, jitter: 0.06 });
      }
    }
    // and on the hood's top
    for (let k = 0; k < 5; k++) b.box(0.15 + rand() * 0.25, 0.012, 0.1 + rand() * 0.2, { pos: [-0.5 + rand() * 1.0, y0 + 0.731, 0.8 + rand() * 0.9], color: rand() < 0.5 ? 0x3a2214 : 0x8a5a36, jitter: 0.06 });
    // faded flames still on the side
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) b.box(0.01, 0.12, 0.5 - k * 0.08, { pos: [sd * 0.855, y0 + 0.62 + k * 0.03, 1.0 - k * 0.2], rot: [0.25, 0, 0], color: k % 2 ? 0xb06a2a : 0x9a4a1a, jitter: 0 });
    }
    // the spruce through the engine
    b.cyl(0.08, 0.12, 2.6, 7, { pos: [0.1, y0 + 1.6, 1.25], color: 0x4a3626, surf: 'log' });
    for (let k = 0; k < 4; k++) b.cone(0.9 - k * 0.18, 1.0, 8, { pos: [0.1, y0 + 2.0 + k * 0.55, 1.25], color: 0x2a4a2a, jitter: 0.06 });
    const [x, z] = to(0, 0);
    P.colliders.addBox(x, z, 1.0, 2.0, yaw, -1e9, P.world.heightAt(x, z) + 1.6);
    const [ix, iz] = to(1.6, -0.6);
    P.interactions.push({ id: 'odd:rustbucket', x: ix, z: iz, r: 2.2 });
    void gy;
  },

  // A payphone on a pole, the phone book on its chain.
  payphone({ P, b, glow, to }) {
    b.cyl(0.08, 0.1, 2.6, 8, { pos: [0, 1.2, -0.12], color: 0x5a4a38, surf: 'log' });
    b.box(0.48, 0.68, 0.26, { pos: [0, 1.4, 0.06], color: 0x7a7e84, surf: 'metal', surfScale: 0.3 });
    b.box(0.56, 0.06, 0.34, { pos: [0, 1.78, 0.06], color: 0x2a5aa8 });
    b.box(0.4, 0.12, 0.012, { pos: [0, 1.66, 0.195], color: 0x2a5aa8, jitter: 0 });
    // the keypad, the coin slot, the handset in its cradle and its cord
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(0.05, 0.04, 0.012, { pos: [0.05 + c * 0.06, 1.42 - r * 0.055, 0.195], color: 0xd8d8d0, jitter: 0 });
    b.box(0.08, 0.012, 0.012, { pos: [-0.12, 1.55, 0.195], color: 0x1a1a1a, jitter: 0 });
    b.box(0.07, 0.36, 0.08, { pos: [-0.2, 1.4, 0.22], color: 0x1e1e1e });
    for (const dy of [-0.18, 0.18]) b.box(0.09, 0.08, 0.12, { pos: [-0.2, 1.4 + dy, 0.24], color: 0x1e1e1e });
    b.beam([-0.2, 1.2, 0.22], [-0.12, 1.08, 0.24], 0.012, 4, { color: 0x1e1e1e });
    b.box(0.2, 0.26, 0.06, { pos: [0.1, 0.95, 0.22], rot: [0.2, 0, 0.1], color: 0xd8c050 });
    b.beam([0.1, 1.08, 0.2], [0.05, 1.18, 0.2], 0.008, 4, { color: 0x888888 });
    glow.box(0.36, 0.08, 0.01, { pos: [0, 1.66, 0.2], color: 0xb8d8ff, jitter: 0 });
    P.colliders.addCircle(...to(0, 0), 0.35).hi = 2.6;
    const [ix, iz] = to(0, 0.8);
    P.interactions.push({ id: 'odd:payphone', x: ix, z: iz, r: 1.8 });
  },

  // Nine standing stones and a flat one in the middle, runes on three that
  // glow blue at night.
  stones({ P, b, glow, gy, to, rand }) {
    const R = 5.2;
    // three runes, as strokes in a 0.2 m box: fehu, algiz and thurisaz
    const RUNES = [
      [
        [0, -0.1, 0, 0.1],
        [0, 0.03, 0.08, 0.09],
        [0, -0.03, 0.08, 0.03],
      ],
      [
        [0, -0.1, 0, 0.1],
        [0, 0.02, -0.07, 0.1],
        [0, 0.02, 0.07, 0.1],
      ],
      [
        [0, -0.1, 0, 0.1],
        [0, 0.06, 0.06, 0],
        [0.06, 0, 0, -0.06],
      ],
    ];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const y = gy(x, z);
      const h = 2.0 + rand() * 1.0;
      const w = 1.0 + rand() * 0.35;
      const d = 0.5 + rand() * 0.2;
      const fallen = i === 7;
      const runes = i % 3 === 0;
      // broad face to the middle (local z points out from it); the rune
      // stones stand straight
      const lean = runes ? 0 : 0.08;
      const rot = fallen ? [Math.PI / 2 - 0.15, a, 0] : [(rand() - 0.5) * lean, -a + Math.PI / 2, (rand() - 0.5) * lean];
      const yc = fallen ? y + 0.25 : y + h / 2 - 0.2;
      b.add(menhir(rand), { pos: [x, yc, z], rot, scale: [w, h, d], color: rand() < 0.5 ? 0x7a786e : 0x6e6c64, surf: 'concrete', surfScale: 1.4, jitter: 0.05 });
      if (fallen) continue;
      // its broad faces stand 0.45 of its depth out from the middle
      const face = 0.45 * d;
      // lichen on the outer face, a few patches
      for (let k = 0; k < 3; k++) {
        const ly = yc - h * 0.25 + rand() * h * 0.45;
        const lx = (rand() - 0.5) * w * 0.5;
        b.sphere(0.1 + rand() * 0.06, 6, 4, { pos: [x + Math.cos(a) * face - Math.sin(a) * lx, ly, z + Math.sin(a) * face + Math.cos(a) * lx], rot: [0, -a + Math.PI / 2, 0], scale: [1.3, 1, 0.2], color: 0x7a8466, jitter: 0.1 });
      }
      if (runes) {
        // three runes down each broad face, toward the middle and away
        const off = face + 0.05;
        for (const sd of [-1, 1]) {
          const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2 + (sd < 0 ? Math.PI : 0)).setPosition(x + sd * Math.cos(a) * off, yc, z + sd * Math.sin(a) * off);
          RUNES.forEach((glyph, k) => {
            for (const [x0, y0, x1, y1] of glyph) {
              const len = Math.hypot(x1 - x0, y1 - y0);
              glow.add(new THREE.BoxGeometry(len + 0.035, 0.035, 0.01), { matrix: m, pos: [(x0 + x1) / 2, (y0 + y1) / 2 + (1 - k) * 0.27, 0], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)], color: 0x7ac8ff, jitter: 0 });
            }
          });
        }
      }
      P.colliders.addCircle(...to(x, z), 0.55).hi = h - 0.2;
    }
    b.add(menhir(rand), { pos: [0, gy(0, 0) + 0.1, 0], rot: [0, 0.3, 0], scale: [1.8, 0.45, 1.15], color: 0x6a685e, surf: 'concrete', surfScale: 1.4, jitter: 0.05 });
    P.colliders.addCircle(...to(0, 0), 0.8).hi = 0.45;
  },

  // A spruce dressed for Christmas: baubles, a garland, lights and a star,
  // and presents under it.
  xmastree({ P, b, glow, gy, to, rand }) {
    const y = gy(0, 0);
    b.cyl(0.14, 0.18, 1.2, 8, { pos: [0, y + 0.5, 0], color: 0x4a3626, surf: 'log' });
    const tiers = [
      [1.7, 1.6, 0.9],
      [1.35, 1.5, 1.9],
      [1.0, 1.35, 2.8],
      [0.65, 1.2, 3.6],
    ];
    for (const [r, h, yy] of tiers) b.cone(r, h, 12, { pos: [0, y + yy, 0], color: 0x24482a, jitter: 0.06 });
    // (the tree's radius at a height: the widest tier there)
    const rAt = (yy) => Math.max(0, ...tiers.map(([r, h, c]) => (yy >= c - h / 2 && yy <= c + h / 2 ? (r * (c + h / 2 - yy)) / h : 0)));
    const COLS = [0xc4261c, 0xd8b030, 0x2a6aa8, 0xe8e4da];
    for (let i = 0; i < 26; i++) {
      const yy = 0.3 + rand() * 3.4;
      const r = rAt(yy);
      if (r < 0.2) continue;
      const a = rand() * Math.PI * 2;
      b.sphere(0.07, 8, 6, { pos: [Math.cos(a) * (r + 0.03), y + yy - 0.06, Math.sin(a) * (r + 0.03)], color: COLS[i % 4], smooth: true, jitter: 0 });
    }
    // the garland along the skirt of each tier
    for (const [, h, c] of tiers) {
      const yy = c - h / 2 + 0.16;
      b.torus(rAt(yy) + 0.02, 0.03, 4, 28, { pos: [0, y + yy, 0], rot: [Math.PI / 2 + (rand() - 0.5) * 0.08, 0, 0], color: 0xd8b030, jitter: 0 });
    }
    // the lights, round and down the tree on its branches, and the star on top
    const LIGHT = [0xff5a4a, 0xffd23a, 0x5ab0ff, 0x8aff7a];
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const yy = 0.35 + t * 3.45;
      const r = rAt(yy) + 0.03;
      const a = t * Math.PI * 9;
      glow.sphere(0.04, 4, 3, { pos: [Math.cos(a) * r, y + yy, Math.sin(a) * r], color: LIGHT[i % 4], jitter: 0 });
    }
    glow.cone(0.16, 0.3, 5, { pos: [0, y + 4.35, 0], color: 0xffe27a, jitter: 0 });
    glow.cone(0.16, 0.3, 5, { pos: [0, y + 4.15, 0], rot: [Math.PI, 0, 0], color: 0xffe27a, jitter: 0 });
    // presents, out in front of the lowest branches
    for (const [x, z, s, c, r] of [
      [1.05, 1.45, 0.4, 0xc4261c, 0xd8b030],
      [-0.95, 1.5, 0.32, 0x2a6a3a, 0xe8e4da],
      [0.15, 1.85, 0.5, 0x2a5aa8, 0xc4261c],
    ]) {
      const py = gy(x, z);
      b.box(s, s * 0.8, s, { pos: [x, py + s * 0.4, z], rot: [0, 0.4, 0], color: c });
      b.box(s + 0.01, s * 0.8 + 0.01, 0.06, { pos: [x, py + s * 0.4, z], rot: [0, 0.4, 0], color: r, jitter: 0 });
      b.box(0.06, s * 0.8 + 0.01, s + 0.01, { pos: [x, py + s * 0.4, z], rot: [0, 0.4, 0], color: r, jitter: 0 });
      b.sphere(0.06, 6, 4, { pos: [x, py + s * 0.82, z], color: r, jitter: 0 });
    }
    P.colliders.addCircle(...to(0, 0), 1.4).hi = 4.4;
    const [ix, iz] = to(0.2, 2.2);
    P.interactions.push({ id: 'odd:xmastree', x: ix, z: iz, r: 1.8 });
  },

  // The gnome is a separate mesh: he moves (see Oddities.place).
  gnome({ P, o, W }) {
    const b = new ModelBuilder();
    b.cyl(0.13, 0.17, 0.28, 10, { pos: [0, 0.22, 0], color: 0x2a5aa8 });
    // boots, a belt with its buckle
    for (const sx of [-0.07, 0.07]) b.box(0.1, 0.07, 0.16, { pos: [sx, 0.04, 0.03], color: 0x2a1a10 });
    b.cyl(0.152, 0.152, 0.035, 10, { pos: [0, 0.2, 0], color: 0x3a2618 });
    b.box(0.05, 0.04, 0.02, { pos: [0, 0.2, 0.15], color: 0xd8b040, jitter: 0 });
    // the face, the nose, the white beard down his front
    b.sphere(0.11, 10, 8, { pos: [0, 0.44, 0.02], color: 0xe8b090, smooth: true });
    b.sphere(0.035, 6, 4, { pos: [0, 0.43, 0.13], color: 0xd88a70 });
    b.cone(0.11, 0.24, 8, { pos: [0, 0.32, 0.09], rot: [Math.PI - 0.3, 0, 0], color: 0xf2efe8 });
    b.cone(0.12, 0.34, 10, { pos: [0, 0.66, -0.02], rot: [-0.18, 0, 0], color: 0xc4261c });
    // his arm, the rod and its line with a red float
    b.cyl(0.04, 0.04, 0.14, 6, { pos: [0.15, 0.24, 0.06], rot: [0.9, 0, 0], color: 0x2a5aa8 });
    b.beam([0.16, 0.2, 0.14], [0.3, 0.95, 0.45], 0.008, 4, { color: 0x3a2618 });
    b.beam([0.3, 0.95, 0.45], [0.36, 0.0, 0.62], 0.002, 3, { color: 0xd8d8d8 });
    b.sphere(0.03, 6, 4, { pos: [0.36, 0.05, 0.62], color: 0xc4261c });
    const g = W.heightAt(o.x, o.z);
    const m = P.addMesh(b.build(), o.x, g, o.z, 0);
    m.scale.setScalar(1.25);
    m.matrixAutoUpdate = true;
    P.gnome = m;
  },

  // An old spruce with a tiny door at its foot, two lit windows, a lantern
  // on a hook, a doormat and a path of pebbles.
  fairydoor({ P, b, glow, gy, to, rand }) {
    const y = gy(0, 0);
    b.cyl(0.62, 0.95, 14, 12, { pos: [0, y + 6.6, -0.9], color: 0x4a3626, surf: 'log', surfScale: 0.8 });
    // roots spreading out, clear of the doorway (local +z)
    for (const a of [0.75, -0.75, 1.75, -1.75, 2.7, -2.7, Math.PI].map((d) => Math.PI / 2 + d)) {
      b.strut([Math.cos(a) * 0.5, y + 0.6, -0.9 + Math.sin(a) * 0.5], [Math.cos(a) * 1.7, y - 0.15, -0.9 + Math.sin(a) * 1.7], 0.3, 0.22, { color: 0x4a3626 });
    }
    for (let k = 0; k < 5; k++) b.cone(3.2 - k * 0.5, 2.6, 10, { pos: [0, y + 9.0 + k * 1.5, -0.9], color: 0x22402a, jitter: 0.05 });
    // the door: an arch of planks, a frame, a brass knob, on the bark (the
    // trunk's front edge is 0.94 m out from its middle at the foot)
    const dz = -0.9 + 0.97;
    b.box(0.36, 0.34, 0.06, { pos: [0, y + 0.17, dz], color: 0x2e5a3a, surf: 'batten', surfScale: 0.25 });
    b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12, 1, false, -Math.PI / 2, Math.PI), { pos: [0, y + 0.34, dz], rot: [Math.PI / 2, 0, 0], color: 0x2e5a3a });
    b.add(new THREE.TorusGeometry(0.2, 0.025, 4, 12, Math.PI), { pos: [0, y + 0.34, dz + 0.01], color: 0x6a4a2a, jitter: 0 });
    b.sphere(0.018, 6, 4, { pos: [0.11, y + 0.18, dz + 0.04], color: 0xd8b040 });
    // two round windows, lit at night, on the bark either side, and the
    // lantern
    const wz = -0.9 + 0.87;
    for (const sx of [-0.34, 0.34]) {
      b.torus(0.07, 0.015, 4, 10, { pos: [sx, y + 0.42, wz + 0.005], color: 0x6a4a2a, jitter: 0 });
      glow.cyl(0.06, 0.06, 0.01, 10, { pos: [sx, y + 0.42, wz], rot: [Math.PI / 2, 0, 0], color: 0xffc870, jitter: 0 });
    }
    b.box(0.015, 0.1, 0.015, { pos: [0.24, y + 0.62, dz + 0.02], color: 0x2a2a2a, jitter: 0 });
    b.box(0.05, 0.07, 0.05, { pos: [0.24, y + 0.53, dz + 0.04], color: 0x2a2a2a });
    glow.box(0.035, 0.05, 0.035, { pos: [0.24, y + 0.53, dz + 0.04], color: 0xffd890, jitter: 0 });
    b.box(0.3, 0.01, 0.16, { pos: [0, y + 0.01, dz + 0.12], color: 0x8a5a3a, jitter: 0.04 });
    for (let k = 0; k < 7; k++) {
      const pz = dz + 0.3 + k * 0.16;
      const px = Math.sin(k * 1.3) * 0.06;
      b.sphere(0.04 + rand() * 0.02, 5, 3, { pos: [px, gy(px, pz) + 0.01, pz], scale: [1, 0.4, 1], color: 0xb8b4aa });
    }
    // a tiny mailbox on a twig
    b.box(0.01, 0.18, 0.01, { pos: [-0.3, y + 0.09, dz + 0.2], color: 0x4a3626, jitter: 0 });
    b.box(0.06, 0.05, 0.08, { pos: [-0.3, y + 0.2, dz + 0.2], color: 0xc4261c });
    P.colliders.addCircle(...to(0, -0.9), 1.0).hi = 14;
    const [ix, iz] = to(0, 0.5);
    P.interactions.push({ id: 'odd:fairydoor', x: ix, z: iz, r: 1.6 });
  },
};

// ---------------------------------------------------------------- runtime
export class Oddities {
  constructor(game) {
    this.game = game;
    this.ringT = 0;
    this.ringing = false;
    this.answered = false;
    this.humT = 0;
    this.gnomeDay = -1;
    this.checkT = 0;
  }

  get found() {
    const s = this.game.state;
    if (!s.flags.odd) s.flags.odd = {};
    return s.flags.odd;
  }

  count() {
    return ODDITIES.filter((o) => this.found[o.id]).length;
  }

  // Where the gnome stands today.
  gnomeSpot() {
    const o = ODDITIES.find((x) => x.id === 'gnome');
    const day = this.game.env.day;
    const [dx, dz] = GNOME_SPOTS[(day * 7 + 3) % GNOME_SPOTS.length];
    return { x: o.x + dx, z: o.z + dz };
  }

  place() {
    const g = this.game;
    const m = g.props.gnome;
    if (!m) return;
    const s = this.gnomeSpot();
    const y = g.world.heightAt(s.x, s.z);
    m.position.set(s.x, y, s.z);
    // facing the way he came
    m.rotation.y = (g.env.day * 1.7) % (Math.PI * 2);
  }

  update(dt) {
    const g = this.game;
    if (!g.started || !g.props.oddities) return;
    if (this.gnomeDay !== g.env.day) {
      this.gnomeDay = g.env.day;
      this.place();
    }
    const P = g.player;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      // finding one: walk up to it
      for (const o of ODDITIES) {
        const at = o.id === 'gnome' ? this.gnomeSpot() : o;
        const d = Math.hypot(at.x - P.pos.x, at.z - P.pos.z);
        const r = o.id === 'stones' || o.id === 'ufo' ? 11 : o.id === 'gnome' ? 5 : 8;
        // on foot: driving past or gliding over does not count
        if (d < r && !this.found[o.id] && P.mode === 'foot') this.find(o);
      }
    }
    // the payphone rings while you are near it, until you answer
    const ph = g.props.oddities.payphone;
    const dp = Math.hypot(ph.x - P.pos.x, ph.z - P.pos.z);
    if (dp > 60) {
      this.ringing = false;
      this.answered = false;
    } else if (dp < 45 && !this.answered) this.ringing = true;
    if (this.ringing) {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 3.2;
        g.audio?.phoneRing?.(ph.x, ph.z);
      }
    }
    // the fridge and the saucer hum
    this.humT -= dt;
    if (this.humT <= 0) {
      this.humT = 2.4;
      for (const id of ['fridge', 'ufo']) {
        const s = g.props.oddities[id];
        if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 30) g.audio?.hum?.(s.x, s.z, id === 'ufo' ? 1 : 0);
      }
    }
    // the fairy ring: step inside for four hours of luck (four minutes of
    // play by day: time to reach Moose Lake and cast), once a day
    const fr = g.props.oddities.fairyring;
    if (Math.hypot(fr.x - P.pos.x, fr.z - P.pos.z) < 2.1 && P.mode === 'foot') {
      const f = this.found;
      if (f.luckDay !== g.env.day) {
        f.luckDay = g.env.day;
        g.env.luckUntil = g.env.day * 24 + g.env.time + 4;
        g.audio?.fairy?.();
        g.hud.toast('The air goes still and smells of honey. You feel lucky: the fish will bite better for the next four hours.', 'good', 6);
      }
    }
  }

  find(o) {
    const g = this.game;
    this.found[o.id] = g.env.day || 1;
    const n = this.count();
    g.audio?.chime?.();
    g.hud.toast(`${o.find} (strange things found: ${n} of ${ODDITIES.length})`, 'good', 7);
    g.onEvent?.({ type: 'strange', count: n });
    g.save?.();
  }

  // The action an oddity offers, or null: { label, icon, act }.
  action(id) {
    const g = this.game;
    const s = g.state;
    const f = this.found;
    switch (id) {
      case 'fridge':
        return {
          label: 'OPEN',
          icon: 'hand',
          act: () => {
            if (!f.fridgeOpened) {
              f.fridgeOpened = true;
              s.addMoney(40);
              g.audio?.cash?.();
              g.hud.toast('Cold air, a salmon labelled GUS, DO NOT EAT, and an envelope marked FRIDGE MONEY: $40.', 'good', 7);
            } else g.hud.toast('Just the salmon labelled GUS, DO NOT EAT. You close the door.', '', 5);
            g.save?.();
          },
        };
      case 'ufo':
        return {
          label: 'LOOK INSIDE',
          icon: 'hand',
          act: () => {
            if (!s.wardrobe.includes('hat:tinfoil')) {
              s.wardrobe.push('hat:tinfoil');
              g.audio?.chime?.();
              g.hud.toast('Blinking lights, a smell of fish heads, and on the pilot\'s seat a hat of tinfoil. It is in your wardrobe now.', 'good', 7);
            } else g.hud.toast('The lights blink. Somebody has been eating fish heads in here.', '', 5);
            g.save?.();
          },
        };
      case 'xmastree':
        return {
          label: 'OPEN PRESENT',
          icon: 'hand',
          act: () => {
            if (!s.wardrobe.includes('hat:santa')) {
              s.wardrobe.push('hat:santa');
              g.audio?.chime?.();
              g.hud.toast('A Santa hat, and a tag: "To Ruben, for being good. Mostly." It is in your wardrobe now.', 'good', 7);
            } else g.hud.toast('The other presents are labelled "Not until Christmas".', '', 5);
            g.save?.();
          },
        };
      case 'rustbucket':
        return {
          label: 'LOOK',
          icon: 'hand',
          act: () => {
            if (!s.gear.paints.includes('rust')) {
              s.gear.paints.push('rust');
              g.audio?.chime?.();
              g.hud.toast('Under the moss the old flames still show. The garage at the Trading Post can paint yours to match: Barn-find Rust, free.', 'good', 7);
            } else g.hud.toast('Ruben\'s first hot rod. One day.', '', 4);
            g.save?.();
          },
        };
      case 'payphone':
        return {
          label: this.ringing ? 'ANSWER' : 'PICK UP',
          icon: 'hand',
          act: () => {
            if (this.ringing) {
              this.ringing = false;
              this.answered = true;
              f.calls = (f.calls || 0) + 1;
              g.hud.toast(CALLS[(f.calls - 1) % CALLS.length], '', 7);
            } else g.hud.toast('A dial tone, and very faintly, somebody reeling.', '', 5);
          },
        };
      case 'fairydoor': {
        // after dark: when its windows are lit
        const night = g.env.night > 0.5;
        return {
          label: 'KNOCK',
          icon: 'hand',
          act: () => {
            g.audio?.knock?.();
            if (!night) g.hud.toast('No answer. The windows are dark. Try after dark.', '', 5);
            else if (!f.fairyCoins) {
              f.fairyCoins = true;
              s.addMoney(77);
              g.audio?.fairy?.();
              g.hud.toast('A tiny voice: "Go away, we are sleeping!" Seventy-seven tiny coins roll out under the door: $77.', 'good', 7);
            } else g.hud.toast('A tiny voice: "We said GO AWAY."', '', 5);
            g.save?.();
          },
        };
      }
      default:
        return null;
    }
  }
}
