// Ruben's '32-style hot rod: procedural model (blown V8, fat rear tyres,
// flames), arcade driving physics on the heightfield, cockpit and chase cams.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { clamp, damp, lerp, dampAngle, wrapAngle } from '../util/math.js';
import { HALF, SURF, ROAD_HALF } from '../world/worldgen.js';
import { ENGINES, TIRES, PAINTS, lookColors } from '../gameplay/data.js';

const WHEELBASE = 2.75;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qLook = new THREE.Quaternion();
const _qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _e = new THREE.Euler();
const TRACK = 1.56;
const REAR_R = 0.47;
const FRONT_R = 0.34;

function flameDecal(a, b) {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const draw = (color, scale, off) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H * 0.1);
    const tongues = 5;
    for (let i = 0; i < tongues; i++) {
      const y0 = H * (0.1 + (i / tongues) * 0.8);
      const y1 = H * (0.1 + ((i + 1) / tongues) * 0.8);
      const len = W * (0.45 + ((i * 37) % 11) / 22) * scale + off;
      const ym = (y0 + y1) / 2;
      g.bezierCurveTo(len * 0.45, y0 - 6, len * 0.85, ym - 16, len, ym - 4);
      g.bezierCurveTo(len * 0.75, ym + 6, len * 0.35, y1 - 2, 18 * scale, y1);
    }
    g.lineTo(0, H * 0.9);
    g.closePath();
    g.fill();
  };
  draw(b, 1.0, 0);
  draw(a, 0.74, -8);
  g.globalAlpha = 0.85;
  draw('#fff6c8', 0.42, -16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plateTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1a3a7a';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#1a3a7a';
  g.font = '700 22px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.fillText('ALASKA', 128, 34);
  g.font = '800 64px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText('RUBEN', 128, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ruben at the wheel: shirt, head, beard and hat from the wardrobe.
function buildDriver(c) {
  const rb = new ModelBuilder();
  const S = c.shirt;
  const X = 0.3;
  const Z = -0.52;
  rb.box(0.46, 0.5, 0.3, { pos: [X, 1.2, Z], color: S.main });
  // check bands, or the loud shirt's pattern
  for (let i = 0; i < 3; i++) rb.box(0.47, 0.04, 0.31, { pos: [X, 1.05 + i * 0.15, Z], color: S.alt && i === 1 ? S.alt : S.band });
  if (S.id === 'hivis') rb.box(0.47, 0.035, 0.31, { pos: [X, 1.32, Z], color: 0xe8ecee });
  rb.beam([0.12, 1.36, -0.45], [0.2, 1.18, 0.05], 0.05, 5, { color: S.main });
  rb.beam([0.48, 1.36, -0.45], [0.42, 1.18, 0.05], 0.05, 5, { color: S.main });
  // hands on the wheel
  rb.box(0.07, 0.06, 0.08, { pos: [0.2, 1.17, 0.07], color: c.glove });
  rb.box(0.07, 0.06, 0.08, { pos: [0.42, 1.17, 0.07], color: c.glove });
  // head, ears, hair at the back and sides
  rb.box(0.2, 0.2, 0.2, { pos: [X, 1.58, Z], color: c.skin });
  rb.box(0.03, 0.06, 0.05, { pos: [X - 0.11, 1.58, Z], color: c.skin });
  rb.box(0.03, 0.06, 0.05, { pos: [X + 0.11, 1.58, Z], color: c.skin });
  rb.box(0.21, 0.1, 0.05, { pos: [X, 1.62, Z - 0.09], color: c.hair });
  // the beard
  if (c.beard === 'full') rb.box(0.22, 0.16, 0.12, { pos: [X, 1.47, Z + 0.09], color: c.hair });
  else if (c.beard === 'lumber') {
    rb.box(0.24, 0.2, 0.14, { pos: [X, 1.45, Z + 0.1], color: c.hair });
    rb.box(0.16, 0.12, 0.1, { pos: [X, 1.32, Z + 0.12], color: c.hair });
  } else if (c.beard === 'stache') {
    rb.box(0.16, 0.035, 0.04, { pos: [X, 1.52, Z + 0.11], color: c.hair });
    rb.box(0.03, 0.07, 0.03, { pos: [X - 0.085, 1.49, Z + 0.11], color: c.hair });
    rb.box(0.03, 0.07, 0.03, { pos: [X + 0.085, 1.49, Z + 0.11], color: c.hair });
  } else if (c.beard === 'stubble') rb.box(0.205, 0.09, 0.04, { pos: [X, 1.5, Z + 0.085], color: (c.skin & 0xfefefe) >> 1 });
  // the hat
  const H = c.hat;
  if (H.id === 'cap' || H.id === 'trucker') {
    rb.box(0.24, 0.08, 0.24, { pos: [X, 1.7, Z], color: H.color });
    rb.box(0.2, 0.03, 0.16, { pos: [X, 1.67, Z + 0.16], color: H.color });
    if (H.front) rb.box(0.2, 0.07, 0.02, { pos: [X, 1.71, Z + 0.12], color: H.front });
  } else if (H.id === 'beanie') {
    rb.box(0.23, 0.12, 0.23, { pos: [X, 1.72, Z], color: H.color });
    rb.box(0.24, 0.04, 0.24, { pos: [X, 1.67, Z], color: 0xe8e2d6 });
    rb.box(0.06, 0.05, 0.06, { pos: [X, 1.8, Z], color: 0xe8e2d6 });
  } else if (H.id === 'bucket') {
    rb.box(0.22, 0.1, 0.22, { pos: [X, 1.72, Z], color: H.color });
    rb.box(0.32, 0.02, 0.32, { pos: [X, 1.67, Z], color: H.color });
  } else if (H.id === 'cowboy') {
    rb.box(0.2, 0.12, 0.2, { pos: [X, 1.74, Z], color: H.color });
    rb.box(0.44, 0.02, 0.36, { pos: [X, 1.68, Z], color: H.color });
    rb.box(0.21, 0.03, 0.21, { pos: [X, 1.7, Z], color: 0x2a1a10 });
  } else if (H.id === 'antler') {
    rb.box(0.23, 0.1, 0.23, { pos: [X, 1.71, Z], color: H.color });
    for (const sd of [-1, 1]) {
      rb.beam([X + sd * 0.1, 1.74, Z], [X + sd * 0.32, 1.86, Z - 0.02], 0.025, 5, { color: H.horn });
      rb.box(0.2, 0.025, 0.12, { pos: [X + sd * 0.36, 1.9, Z - 0.02], rot: [0, 0, sd * 0.35], color: H.horn });
      rb.beam([X + sd * 0.3, 1.88, Z], [X + sd * 0.34, 1.98, Z + 0.03], 0.018, 4, { color: H.horn });
    }
  } else rb.box(0.21, 0.05, 0.21, { pos: [X, 1.69, Z], color: c.hair });
  return rb.build();
}

function tireGeometry(r, w, seg = 18) {
  const inner = r * 0.62;
  const pts = [
    [inner, -w / 2],
    [r * 0.93, -w / 2],
    [r, -w / 2 + w * 0.18],
    [r, w / 2 - w * 0.18],
    [r * 0.93, w / 2],
    [inner, w / 2],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

export class HotRod {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'hotrod';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // world xz velocity
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vy = 0;
    this.airborne = false;
    this.lastGroundY = 0;
    this.wheelSpin = 0;
    this.throttle = 0;
    this.brake = 0;
    this.rpm = 800;
    this.gear = 1;
    this.camMode = 'cockpit';
    this.camYaw = 0;
    this.camPitch = -0.05;
    this.chasePos = new THREE.Vector3();
    this.occupied = false;
    this.shake = 0;
    this.lean = 0;
    this.squat = 0;
    this.lastImpact = 0;
    this.deepWarned = 0;
    this.buildModel();
    this.collider = game.colliders.addBox(0, 0, 0.95, 2.2, 0, -1e9, 1e9, 'car');
    this.headlight = new THREE.SpotLight(0xfff0d0, 0, 70, 0.55, 0.5, 1.2);
    this.headlight.castShadow = false;
    this.headlight.position.set(0, 1.0, 1.9);
    this.headlight.target.position.set(0, -1.5, 22);
    this.group.add(this.headlight, this.headlight.target);
  }

  buildModel() {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 1.0, roughness: 0.16 });
    const paint = new THREE.MeshStandardMaterial({ color: 0x8e0f14, metalness: 0.35, roughness: 0.26 });
    const dark = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.75 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2 });
    this.materials = { chrome, paint, dark, rubber, glass };
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);

    // ---- painted body: extruded '32 roadster side profile with rounded edges
    const shape = new THREE.Shape();
    shape.moveTo(0.86, 0.58);
    shape.lineTo(0.86, 1.06);
    shape.quadraticCurveTo(0.8, 1.13, 0.5, 1.14);
    shape.lineTo(-0.95, 1.12);
    shape.quadraticCurveTo(-1.45, 1.1, -1.62, 0.9);
    shape.quadraticCurveTo(-1.74, 0.74, -1.72, 0.6);
    shape.lineTo(-1.66, 0.56);
    shape.lineTo(0.8, 0.56);
    shape.closePath();
    const bodyWidth = 1.1;
    const tub = new THREE.ExtrudeGeometry(shape, {
      depth: bodyWidth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
      curveSegments: 8,
    });
    tub.rotateY(-Math.PI / 2);
    tub.translate(bodyWidth / 2, 0, 0);
    const pb = new ModelBuilder();
    pb.add(tub, { color: 0xffffff, jitter: 0, smooth: true });
    // grille shell with a rounded top
    pb.box(0.5, 0.56, 0.16, { pos: [0, 0.8, 1.86], color: 0xffffff, jitter: 0 });
    pb.cyl(0.25, 0.25, 0.16, 14, { pos: [0, 1.08, 1.86], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55], color: 0xffffff, jitter: 0, smooth: true });
    // frame horns and front crossmember in body colour
    for (const s of [-1, 1]) pb.box(0.08, 0.12, 0.5, { pos: [s * 0.36, 0.5, 1.75], color: 0xffffff, jitter: 0 });
    const paintMesh = new THREE.Mesh(pb.build(), paint);
    paintMesh.castShadow = true;
    body.add(paintMesh);
    this.bodyHalfWidth = bodyWidth / 2 + 0.05;

    // ---- chrome: grille surround, headlights, blower, valve covers, headers, bumpers
    const cb = new ModelBuilder();
    cb.box(0.56, 0.6, 0.05, { pos: [0, 0.8, 1.95], color: 0xffffff, jitter: 0 });
    cb.torus(0.27, 0.03, 5, 14, { pos: [0, 1.08, 1.95], arc: Math.PI, color: 0xffffff, jitter: 0 });
    for (const s of [-1, 1]) {
      cb.cyl(0.14, 0.12, 0.2, 12, { pos: [s * 0.48, 1.02, 1.88], rot: [Math.PI / 2, 0, 0], color: 0xffffff, jitter: 0 });
      cb.beam([s * 0.3, 0.72, 1.86], [s * 0.48, 0.96, 1.86], 0.025, 5, { color: 0xffffff, jitter: 0 });
      // valve covers on the V8
      cb.box(0.12, 0.1, 0.7, { pos: [s * 0.2, 1.1, 1.12], rot: [0, 0, s * 0.45], color: 0xffffff, jitter: 0 });
      // exhaust headers sweeping down to side pipes
      for (let i = 0; i < 4; i++) {
        const z = 0.86 + i * 0.16;
        cb.beam([s * 0.3, 0.94, z], [s * 0.56, 0.8, z - 0.05], 0.035, 5, { color: 0xffffff, jitter: 0 });
        cb.beam([s * 0.56, 0.8, z - 0.05], [s * 0.72, 0.5, 0.75], 0.035, 5, { color: 0xffffff, jitter: 0 });
      }
      cb.beam([s * 0.72, 0.5, 0.75], [s * 0.74, 0.47, -1.35], 0.06, 8, { color: 0xffffff, jitter: 0 });
      cb.cyl(0.075, 0.07, 0.18, 8, { pos: [s * 0.74, 0.47, -1.44], rot: [Math.PI / 2, 0, 0], color: 0xffffff, jitter: 0 });
    }
    // supercharger, carbs and scoop
    cb.box(0.34, 0.18, 0.54, { pos: [0, 1.3, 1.1], color: 0xffffff, jitter: 0 });
    for (const z of [0.98, 1.22]) cb.cyl(0.075, 0.085, 0.08, 10, { pos: [0, 1.43, z], color: 0xffffff, jitter: 0 });
    cb.box(0.28, 0.12, 0.5, { pos: [0, 1.53, 1.14], rot: [0.08, 0, 0], color: 0xffffff, jitter: 0 });
    cb.box(0.26, 0.1, 0.03, { pos: [0, 1.54, 1.39], color: 0x222222, jitter: 0 });
    // windshield frame
    cb.box(1.08, 0.05, 0.05, { pos: [0, 1.58, 0.47], color: 0xffffff, jitter: 0 });
    for (const s of [-1, 1]) cb.beam([s * 0.54, 1.16, 0.5], [s * 0.54, 1.58, 0.46], 0.022, 5, { color: 0xffffff, jitter: 0 });
    // nerf bars / rear bumper
    cb.box(1.3, 0.06, 0.06, { pos: [0, 0.55, -1.76], color: 0xffffff, jitter: 0 });
    // front axle springs and shocks
    cb.box(1.1, 0.05, 0.08, { pos: [0, 0.52, 1.72], color: 0xffffff, jitter: 0 });
    const chromeMesh = new THREE.Mesh(cb.build(), chrome);
    chromeMesh.castShadow = true;
    body.add(chromeMesh);

    // ---- dark / vertex coloured parts: frame, engine block, grille, interior, seat
    const db = new ModelBuilder();
    for (const s of [-1, 1]) db.box(0.1, 0.16, 3.7, { pos: [s * 0.42, 0.5, 0.05], color: 0x1c1c1c });
    db.box(1.3, 0.09, 0.14, { pos: [0, 0.34, 1.62], color: 0x222222 }); // dropped axle
    db.box(0.54, 0.46, 0.8, { pos: [0, 0.9, 1.12], color: 0xc2321e }); // V8 block
    db.box(0.3, 0.1, 0.66, { pos: [0, 1.17, 1.1], color: 0x2a2a2a }); // intake
    db.box(0.48, 0.66, 0.08, { pos: [0, 0.86, 1.94], color: 0x0c0c0c }); // grille
    for (let i = -3; i <= 3; i++) db.box(0.03, 0.62, 0.03, { pos: [i * 0.06, 0.86, 1.99], color: 0x8a8a8a });
    db.box(0.5, 0.5, 0.14, { pos: [0, 0.82, 1.7], color: 0x333333 }); // radiator
    db.box(1.2, 0.06, 1.3, { pos: [0, 0.66, -0.35], color: 0x2a1a14 }); // floor
    // tuck-and-roll seat
    db.box(1.12, 0.2, 0.55, { pos: [0, 0.8, -0.6], color: 0xe8dcc8 });
    db.box(1.12, 0.6, 0.18, { pos: [0, 1.05, -0.9], rot: [-0.15, 0, 0], color: 0xe8dcc8 });
    for (let i = -4; i <= 4; i++) db.box(0.02, 0.58, 0.02, { pos: [i * 0.12, 1.06, -0.8], rot: [-0.15, 0, 0], color: 0xb8a890 });
    // dashboard and gauges
    db.box(1.14, 0.18, 0.12, { pos: [0, 1.14, 0.42], color: 0x3a1a12 });
    for (const x of [0.42, 0.24, -0.1, -0.3]) db.cyl(0.055, 0.055, 0.02, 12, { pos: [x, 1.16, 0.355], rot: [Math.PI / 2, 0, 0], color: 0xf0ece0 });
    // steering column and wheel (left-hand drive: driver on +x)
    db.beam([0.3, 0.8, 0.55], [0.3, 1.14, 0.12], 0.025, 5, { color: 0x222222 });
    db.torus(0.19, 0.022, 6, 16, { pos: [0.3, 1.16, 0.1], rot: [1.15, 0, 0], color: 0x2a1a10 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      db.beam([0.3, 1.16, 0.1], [0.3 + Math.cos(a) * 0.18, 1.16 + Math.sin(a) * 0.07, 0.1 + Math.sin(a) * 0.16], 0.012, 4, {
        color: 0xb0b0b0,
      });
    }
    // gear shifter with a skull-ish knob
    db.beam([0, 0.7, 0.05], [0.02, 1.02, -0.02], 0.015, 4, { color: 0xb0b0b0 });
    db.sphere(0.04, 8, 6, { pos: [0.02, 1.05, -0.02], color: 0xe8e4d8 });
    // fuel tank and taillights
    db.cyl(0.2, 0.2, 1.0, 12, { pos: [0, 0.62, -1.62], rot: [0, 0, Math.PI / 2], color: 0x8e0f14 });
    for (const s of [-1, 1]) db.cyl(0.06, 0.06, 0.06, 10, { pos: [s * 0.52, 0.72, -1.72], rot: [Math.PI / 2, 0, 0], color: 0xff2010 });
    const darkMesh = new THREE.Mesh(db.build(), dark);
    darkMesh.castShadow = true;
    body.add(darkMesh);

    // flames decals on both sides of the cab and cowl
    this.flameMat = new THREE.MeshStandardMaterial({
      map: flameDecal('#ffd23a', '#ff5a1f'),
      transparent: true,
      metalness: 0.3,
      roughness: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(2.2, 0.46);
      const m = new THREE.Mesh(g, this.flameMat);
      // +x side faces +x; flames start at the front (+z) and lick backwards
      m.position.set(s * (this.bodyHalfWidth + 0.004), 0.86, -0.3);
      m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.scale.x = s > 0 ? 1 : -1;
      body.add(m);
    }

    // windshield glass
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.4), glass);
    ws.position.set(0, 1.37, 0.47);
    ws.rotation.x = -0.08;
    body.add(ws);

    // license plate
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }));
    plate.position.set(0, 0.72, -1.8);
    plate.rotation.y = Math.PI;
    body.add(plate);

    // headlight lenses (glow at night)
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0xd8d0b0, toneMapped: false });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), this.lensMat);
      l.position.set(s * 0.48, 1.02, 1.985);
      body.add(l);
    }

    // Ruben at the wheel (visible in chase cam), dressed from the wardrobe
    this.driver = new THREE.Mesh(buildDriver(lookColors(null)), dark);
    this.driver.castShadow = true;
    this.driver.visible = false;
    body.add(this.driver);

    // wheels
    this.wheels = [];
    const rearTire = tireGeometry(REAR_R, 0.4);
    const frontTire = tireGeometry(FRONT_R, 0.2);
    const rimGeo = (r, w) => {
      const g = new THREE.CylinderGeometry(r, r, w, 16);
      g.rotateZ(Math.PI / 2);
      return g;
    };
    const capGeo = new THREE.SphereGeometry(0.08, 10, 6);
    const defs = [
      { x: 0.8, z: -1.25, r: REAR_R, w: 0.4, front: false },
      { x: -0.8, z: -1.25, r: REAR_R, w: 0.4, front: false },
      { x: 0.72, z: 1.5, r: FRONT_R, w: 0.2, front: true },
      { x: -0.72, z: 1.5, r: FRONT_R, w: 0.2, front: true },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, d.r, d.z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = new THREE.Mesh(d.front ? frontTire : rearTire, rubber);
      tire.castShadow = true;
      spin.add(tire);
      const rim = new THREE.Mesh(rimGeo(d.r * 0.62, d.w * 0.9), chrome);
      spin.add(rim);
      const cap = new THREE.Mesh(capGeo, chrome);
      cap.position.x = Math.sign(d.x) * d.w * 0.46;
      cap.scale.set(0.5, 1, 1);
      spin.add(cap);
      // spokes so rotation reads clearly
      const spokeGeo = new THREE.BoxGeometry(d.w * 0.95, d.r * 1.1, 0.05);
      const spokes = new THREE.Mesh(spokeGeo, this.materials.chrome);
      spin.add(spokes);
      const sp2 = spokes.clone();
      sp2.rotation.x = Math.PI / 2;
      spin.add(sp2);
      this.group.add(pivot);
      this.wheels.push({ ...d, pivot, spin });
    }
    this.group.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
  }

  // Dress Ruben at the wheel from the wardrobe.
  setLook(look) {
    this.driver.geometry.dispose();
    this.driver.geometry = buildDriver(lookColors(look));
  }

  setPaint(id) {
    const p = PAINTS.find((q) => q.id === id) || PAINTS[0];
    this.materials.paint.color.set(p.base);
    this.flameMat.map?.dispose();
    this.flameMat.map = flameDecal(p.a, p.b);
    this.flameMat.needsUpdate = true;
    this.game.materials?.paintChanged?.();
  }

  place(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.vel.set(0, 0);
    this.airborne = false;
    this.vy = 0;
    const g = this.groundY();
    this.pos.y = g.y;
    this.pitch = g.pitch;
    this.roll = g.roll;
    this.lastGroundY = g.y;
    this.syncTransform();
  }

  groundAtPoint(x, z, refY) {
    const W = this.game.world;
    const t = W.heightAt(x, z);
    const d = this.game.colliders.deckAt(x, z, refY, 1.4);
    return d !== null && d > t - 0.6 ? Math.max(d, t) : t;
  }

  groundY() {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const pt = (lx, lz) => this.groundAtPoint(this.pos.x + lx * c + lz * s, this.pos.z - lx * s + lz * c, this.pos.y);
    const fl = pt(0.75, 1.5);
    const fr = pt(-0.75, 1.5);
    const rl = pt(0.78, -1.25);
    const rr = pt(-0.78, -1.25);
    const front = (fl + fr) / 2;
    const rear = (rl + rr) / 2;
    const left = (fl + rl) / 2;
    const right = (fr + rr) / 2;
    return {
      y: (front + rear) / 2,
      pitch: Math.atan2(front - rear, WHEELBASE),
      roll: Math.atan2(left - right, TRACK),
    };
  }

  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  // Driver-side door position for getting out.
  exitPoint(side = 1) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const lx = side * 1.7;
    const lz = -0.3;
    return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c };
  }

  update(dt, input, state) {
    const W = this.game.world;
    const eng = ENGINES[state.gear.engine] || ENGINES[0];
    const tires = TIRES[state.gear.tires] || TIRES[0];
    let throttle = 0;
    let brake = 0;
    let steerIn = 0;
    if (this.occupied) {
      throttle = input.held('gas') || input.key('KeyW') || input.key('ArrowUp') ? 1 : 0;
      brake = input.held('brake') || input.key('KeyS') || input.key('ArrowDown') || input.key('Space') ? 1 : 0;
      steerIn = input.stick.active ? input.stick.x * 1.25 : 0;
      if (input.key('KeyA') || input.key('ArrowLeft')) steerIn -= 1;
      if (input.key('KeyD') || input.key('ArrowRight')) steerIn += 1;
      steerIn = clamp(steerIn, -1, 1);
    }
    this.throttle = damp(this.throttle, throttle, 6, dt);
    this.brake = brake;

    // surface
    const k = W.cellIndex(this.pos.x, this.pos.z);
    const onRoad = W.roadD[k] < ROAD_HALF + 1.2 || this.onBridge;
    const surf = W.surf[k];
    let cap = eng.top;
    let grip = 7;
    if (!onRoad) {
      let f = 0.62;
      if (surf === SURF.GRAVEL || surf === SURF.SAND) f = 0.7;
      if (surf === SURF.TUNDRA) f = 0.6;
      if (surf === SURF.FOREST) f = 0.5;
      if (surf === SURF.ROCK) f = 0.42;
      if (surf === SURF.SNOW || surf === SURF.ICE) f = 0.38;
      if (surf === SURF.MUD) f = 0.35;
      f = lerp(f, 1, (tires.grip - 0.62) * 0.9);
      cap *= f;
      grip = 3.2 + tires.grip * 2.5;
    }
    // a boat on the trailer behind: a little slower
    if (this.towing) cap *= 0.82;
    const water = W.waterAt(this.pos.x, this.pos.z);
    if (water && water.depth > 0.35 && !this.onBridge) {
      cap = Math.min(cap, 4.5);
      grip = 2.2;
    }

    // longitudinal
    const fwd = this.forward();
    if (throttle > 0) {
      if (this.speed < -0.5) this.speed += 16 * dt;
      else this.speed += eng.accel * this.throttle * clamp(1 - this.speed / (cap + 0.01), -1, 1) * dt;
    }
    if (brake > 0) {
      if (this.speed > 0.6) this.speed -= 17 * dt;
      else this.speed = Math.max(this.speed - 6 * dt, -7);
    }
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (onRoad ? 0.9 : 2.2) * dt);
    if (this.speed > cap) this.speed = damp(this.speed, cap, 1.5, dt);
    // slope, except when parked: an empty car, or one crawling with no pedal
    // down, holds on its brake instead of rolling off down a bank
    const holding = !this.occupied || (!throttle && !brake && Math.abs(this.speed) < 1.5);
    if (holding) this.speed = damp(this.speed, 0, 6, dt);
    else this.speed -= 9.8 * Math.sin(this.pitch) * dt * 0.75;

    // steering
    const maxSteer = 0.58 * (1 - Math.min(0.62, Math.abs(this.speed) / 55));
    this.steer = damp(this.steer, steerIn * maxSteer, 7, dt);
    if (!this.airborne) {
      const yawRate = (this.speed * Math.tan(this.steer)) / WHEELBASE;
      this.yaw -= yawRate * dt;
    }

    // velocity with slip
    const dvx = fwd.x * this.speed;
    const dvz = fwd.z * this.speed;
    const g = this.airborne ? 0.3 : grip;
    this.vel.x += (dvx - this.vel.x) * Math.min(1, g * dt);
    this.vel.y += (dvz - this.vel.y) * Math.min(1, g * dt);
    const lateral = this.vel.x * Math.cos(this.yaw) - this.vel.y * Math.sin(this.yaw);
    this.slip = lateral;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.y * dt;
    const lim = HALF - 30;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) {
      nx = clamp(nx, -lim, lim);
      nz = clamp(nz, -lim, lim);
      this.speed *= 0.5;
    }

    // too deep or too steep: refuse
    const w2 = W.waterAt(nx, nz);
    const deckAhead = this.game.colliders.deckAt(nx, nz, this.pos.y, 1.4);
    if (w2 && w2.depth > 1.1 && deckAhead === null) {
      nx = this.pos.x;
      nz = this.pos.z;
      this.speed *= -0.2;
      this.vel.set(0, 0);
      if (this.game.time - this.deepWarned > 5 && this.occupied) {
        this.deepWarned = this.game.time;
        this.game.hud?.toast('Too deep for the hot rod');
      }
    }

    // collisions: three circles along the body
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    let pushX = 0;
    let pushZ = 0;
    let hit = null;
    this.game.colliders.removeBox(this.collider);
    for (const lz of [1.35, 0, -1.3]) {
      const cx = nx + lz * s;
      const cz = nz + lz * c;
      const r = this.game.colliders.resolve(cx, cz, 0.95, this.pos.y, 1.4);
      if (r.hit) {
        pushX += r.x - cx;
        pushZ += r.z - cz;
        hit = r.hit;
      }
    }
    this.game.colliders.boxes.push(this.collider);
    if (hit) {
      nx += pushX;
      nz += pushZ;
      const impact = Math.abs(this.speed);
      if (impact > 5 && this.game.time - this.lastImpact > 0.6) {
        this.lastImpact = this.game.time;
        this.shake = Math.min(1, impact / 20);
        this.game.audio?.thud(Math.min(1, impact / 25));
        this.game.effects?.dust(nx + s * 1.8, this.pos.y + 0.6, nz + c * 1.8, 8);
      }
      this.speed *= Math.max(0, 1 - dt * 14);
      const n = Math.hypot(pushX, pushZ) || 1;
      const vn = (this.vel.x * pushX + this.vel.y * pushZ) / n;
      if (vn < 0) {
        this.vel.x -= (pushX / n) * vn;
        this.vel.y -= (pushZ / n) * vn;
      }
    }
    // refuse cliffs: compare ground under the nose before and after the move
    const oldX = this.pos.x;
    const oldZ = this.pos.z;
    const gCur = this.pos.y;
    this.pos.x = nx;
    this.pos.z = nz;
    let gr = this.groundY();
    const horiz = Math.hypot(nx - oldX, nz - oldZ);
    if (!this.airborne && horiz > 1e-4 && (gr.y - gCur) / horiz > 0.95 && gr.y - gCur > 0.25) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
      this.speed *= -0.15;
      this.vel.set(0, 0);
      gr = this.groundY();
    }
    this.onBridge = this.game.colliders.deckAt(this.pos.x, this.pos.z, this.pos.y, 1.4) !== null;

    // vertical
    const groundVel = (gr.y - this.lastGroundY) / Math.max(dt, 1e-4);
    this.lastGroundY = gr.y;
    if (!this.airborne) {
      if (groundVel < -7 && Math.abs(this.speed) > 11 && this.vy > -1) {
        this.airborne = true;
      } else {
        this.pos.y = gr.y;
        this.vy = groundVel;
      }
    }
    if (this.airborne) {
      this.vy -= 19 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gr.y) {
        const land = -this.vy;
        this.pos.y = gr.y;
        this.airborne = false;
        this.vy = 0;
        if (land > 4) {
          this.shake = Math.min(1, land / 12);
          this.game.audio?.thud(Math.min(1, land / 14));
          this.game.effects?.dust(this.pos.x, this.pos.y, this.pos.z, 14);
        }
      }
    }
    const pitchT = this.airborne ? this.pitch * 0.98 : gr.pitch;
    this.pitch = damp(this.pitch, pitchT, this.airborne ? 2 : 12, dt);
    this.roll = damp(this.roll, this.airborne ? this.roll : gr.roll, 10, dt);

    // body dynamics
    const latAcc = Math.abs(this.speed) * ((this.speed * Math.tan(this.steer)) / WHEELBASE);
    this.lean = damp(this.lean, clamp(-latAcc * 0.012, -0.08, 0.08), 6, dt);
    this.squat = damp(this.squat, this.throttle * (this.speed < cap * 0.8 ? 0.03 : 0) - brake * 0.025, 5, dt);

    // wheels
    this.wheelSpin += (this.speed / REAR_R) * dt;
    const idle = this.occupied ? 0.004 * (1 - Math.min(1, Math.abs(this.speed) / 4)) : 0;
    for (const wdef of this.wheels) {
      const r = wdef.r;
      wdef.spin.rotation.x = (this.wheelSpin * REAR_R) / r;
      if (wdef.front) wdef.pivot.rotation.y = this.steer;
    }

    // engine
    const gears = [0, 9, 16, 25, 36, 60];
    const sp = Math.abs(this.speed);
    let gear = 1;
    while (gear < 4 && sp > gears[gear]) gear++;
    const lo = gears[gear - 1];
    const hi = gears[gear];
    const frac = clamp((sp - lo) / (hi - lo), 0, 1);
    const targetRpm = this.occupied ? 850 + frac * 4200 + this.throttle * 900 * (gear === 1 ? 1 : 0.4) : 0;
    this.rpm = damp(this.rpm, targetRpm, 6, dt);
    this.gear = gear;

    this.shake = Math.max(0, this.shake - dt * 2);
    this.syncTransform(idle);

    // headlights at night
    const night = this.game.env.night;
    this.headlight.intensity = this.occupied || night > 0.5 ? night * 60 : 0;
    const lv = 0.85 + night * 2.5;
    this.lensMat.color.setRGB(lv, lv * 0.95, lv * 0.8);

    // effects
    if (this.occupied && this.game.effects) {
      this.fxT = (this.fxT || 0) + dt;
      if (this.throttle > 0.5 && this.fxT > 0.09) {
        this.fxT = 0;
        for (const side of [-1, 1]) {
          const px = this.pos.x + side * 0.74 * c + -1.55 * s;
          const pz = this.pos.z - side * 0.74 * s + -1.55 * c;
          this.game.effects.exhaust(px, this.pos.y + 0.47, pz, -s, -c);
        }
      }
      if (!onRoad && sp > 6 && Math.random() < dt * 14) {
        const px = this.pos.x - 1.3 * s;
        const pz = this.pos.z - 1.3 * c;
        this.game.effects.dust(px, this.pos.y + 0.2, pz, 1);
      }
    }
    // keep the collision box on the car
    const cb = this.collider;
    cb.x = this.pos.x + 0.1 * s;
    cb.z = this.pos.z + 0.1 * c;
    cb.rot = this.yaw;
    cb.cos = Math.cos(this.yaw);
    cb.sin = Math.sin(this.yaw);
    cb.yMin = this.pos.y - 0.5;
    cb.yMax = this.pos.y + 1.6;
  }

  syncTransform(idle = 0) {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -this.pitch;
    this.group.rotation.z = this.roll;
    const t = this.game.time;
    this.body.rotation.z = this.lean + (idle ? Math.sin(t * 38) * idle : 0);
    this.body.rotation.x = -this.squat;
    this.body.position.y = idle ? Math.sin(t * 29) * idle * 2 : 0;
  }

  // Camera placement while driving. `look` is the player's extra look offset.
  applyCamera(cam, dt, input) {
    const look = input.readLook();
    this.camYaw -= look.dx;
    this.camPitch -= look.dy;
    this.camPitch = clamp(this.camPitch, -0.9, 0.6);
    // drift the free-look back to centre when not dragging
    if (Math.abs(look.dx) < 1e-5 && input.lookTouch.id === null && !input.mouseDown) {
      this.camYaw = damp(this.camYaw, 0, 1.5, dt);
      this.camPitch = damp(this.camPitch, this.camMode === 'cockpit' ? -0.05 : -0.12, 1.5, dt);
    }
    this.camYaw = clamp(this.camYaw, -2.2, 2.2);
    const sh = this.shake;
    const shx = sh ? Math.sin(this.game.time * 60) * 0.02 * sh : 0;
    const shy = sh ? Math.cos(this.game.time * 47) * 0.02 * sh : 0;
    this.group.updateMatrixWorld(true);
    if (this.camMode === 'cockpit') {
      this.driver.visible = false;
      const p = _v.set(0.3, 1.66, -0.5).applyMatrix4(this.body.matrixWorld);
      cam.position.copy(p);
      // heads keep the horizon steadier than the chassis: damp pitch and roll
      _e.set(this.pitch * 0.8 + this.camPitch + shy, this.yaw + Math.PI + this.camYaw + shx, -this.roll * 0.35, 'YXZ');
      cam.quaternion.setFromEuler(_e);
    } else {
      this.driver.visible = true;
      const dist = 7.2;
      const yaw = this.yaw + this.camYaw;
      const tx = this.pos.x - Math.sin(yaw) * dist;
      const tz = this.pos.z - Math.cos(yaw) * dist;
      let ty = this.pos.y + 2.6 - this.camPitch * 4;
      const gy = this.game.world.heightAt(tx, tz) + 0.8;
      if (ty < gy) ty = gy;
      const target = new THREE.Vector3(tx, ty, tz);
      if (this.chasePos.lengthSq() === 0 || this.chasePos.distanceTo(target) > 30) this.chasePos.copy(target);
      this.chasePos.lerp(target, 1 - Math.exp(-8 * dt));
      cam.position.copy(this.chasePos);
      cam.position.x += shx * 3;
      cam.position.y += shy * 3;
      const lookAt = new THREE.Vector3(this.pos.x + Math.sin(yaw) * 3, this.pos.y + 1.1, this.pos.z + Math.cos(yaw) * 3);
      cam.lookAt(lookAt);
    }
  }
}
