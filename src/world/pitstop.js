// The race car's hiding place: a clearing at the end of an old logging
// track off the River Road. The car waits under a tarp, its spare slicks
// stacked in their warming blankets, a tool chest and a pit board beside it.
// The trees on the track and in the clearing are felled after the forest has
// grown, so the rest of the forest stays exactly as it was.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { tyreGeometry, tyreTexture, canvasTexture } from '../entities/carparts.js';
import { segDist, clamp, lerp } from '../util/math.js';

export const PITSTOP = {
  x: 43,
  z: 224,
  // nose toward the track, ready to drive out
  yaw: -2.214,
  track: [
    [-79, 162],
    [-55, 172],
    [-30, 184],
    [-6, 193],
    [14, 203],
    [30, 214],
    [42, 223],
  ],
};

function trackDist(x, z) {
  const T = PITSTOP.track;
  let d = 1e9;
  for (let i = 0; i < T.length - 1; i++) d = Math.min(d, segDist(x, z, T[i][0], T[i][1], T[i + 1][0], T[i + 1][1]).d);
  return d;
}

const inClearing = (x, z) => Math.hypot(x - PITSTOP.x, z - PITSTOP.z) < 10 || trackDist(x, z) < 2.9;

// Fell everything on the track and in the clearing: hide the scattered
// trees, shrubs and plants there and take their trunks out of the way.
export function clearPitstop(game) {
  const S = game.scatter;
  for (const t of Object.values(S.types)) {
    for (let i = 0; i < t.count; i++) if (inClearing(t.x[i], t.z[i])) t.x[i] = 1e6;
  }
  let x0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let z1 = -1e9;
  for (const [x, z] of PITSTOP.track) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  game.colliders.removeCircles(x0 - 12, z0 - 12, x1 + 12, z1 + 12, (c) => (c.tag === 'tree' || c.tag === 'rock' || c.tag === 'shrub') && inClearing(c.x, c.z));
  S.lastPos.set(1e9, 0, 0);
}

function tarpTexture() {
  return canvasTexture(512, 512, (g, W, H) => {
    g.fillStyle = '#58624a';
    g.fillRect(0, 0, W, H);
    let seed = 11;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    // faded patches and dirt
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(170,176,140,0.12)' : 'rgba(40,36,24,0.14)';
      g.beginPath();
      g.ellipse(r() * W, r() * H, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // the weave
    g.globalAlpha = 0.12;
    g.fillStyle = '#000';
    for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.globalAlpha = 1;
    // hemmed edge with grommets
    g.strokeStyle = '#3f4634';
    g.lineWidth = 10;
    g.strokeRect(6, 6, W - 12, H - 12);
    for (let i = 0; i < 9; i++) {
      for (const [x, y] of [
        [16 + i * ((W - 32) / 8), 16],
        [16 + i * ((W - 32) / 8), H - 16],
        [16, 16 + i * ((H - 32) / 8)],
        [W - 16, 16 + i * ((H - 32) / 8)],
      ]) {
        g.fillStyle = '#b8b4a4';
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#20231b';
        g.beginPath();
        g.arc(x, y, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    // spruce needles and a few birch leaves fallen on it
    for (let i = 0; i < 900; i++) {
      const x = r() * W;
      const y = r() * H;
      const a = r() * Math.PI;
      g.strokeStyle = r() < 0.7 ? 'rgba(110,80,40,0.8)' : 'rgba(60,70,30,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(200,170,60,0.9)' : 'rgba(170,120,40,0.9)';
      g.beginPath();
      g.ellipse(r() * W, r() * H, 5, 3, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// A sheet laid over the car: the car's own shape as a height field in its
// frame, then a cloth relaxed over it that sags between the high points and
// hangs to the ground at its edges.
function tarpGeometry(car) {
  const cell = 0.06;
  const X = 1.42;
  const Z = 3.35;
  const nx = Math.round((2 * X) / cell) + 1;
  const nz = Math.round((2 * Z) / cell) + 1;
  const Hh = new Float32Array(nx * nz).fill(-1);
  car.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(car.group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const visible = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  car.group.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const ix = Math.round((v.x + X) / cell);
      const iz = Math.round((v.z + Z) / cell);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const k = iz * nx + ix;
      if (v.y > Hh[k]) Hh[k] = v.y;
    }
  });
  // fill the gaps between vertices: a max filter
  let D = Hh;
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(D);
    for (let iz = 1; iz < nz - 1; iz++) {
      for (let ix = 1; ix < nx - 1; ix++) {
        const k = iz * nx + ix;
        out[k] = Math.max(D[k], D[k - 1], D[k + 1], D[k - nx], D[k + nx]);
      }
    }
    D = out;
  }
  // relax the cloth: never through the car, hanging under its own weight,
  // pinned to the ground round the edge
  const C = new Float32Array(nx * nz);
  for (let k = 0; k < C.length; k++) C[k] = Math.max(0.02, D[k] + 0.035);
  const sag = 0.0035;
  for (let it = 0; it < 90; it++) {
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const k = iz * nx + ix;
        if (ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1) {
          C[k] = 0.015;
          continue;
        }
        const avg = (C[k - 1] + C[k + 1] + C[k - nx] + C[k + nx]) / 4 - sag;
        C[k] = Math.max(D[k] + 0.035, avg, 0.015);
      }
    }
  }
  // wrinkles
  const geo = new THREE.PlaneGeometry(2 * X, 2 * Z, nx - 1, nz - 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const ix = clamp(Math.round((x + X) / cell), 0, nx - 1);
    const iz = clamp(Math.round((z + Z) / cell), 0, nz - 1);
    const h = C[iz * nx + ix];
    const wr = 0.012 * Math.sin(x * 9 + z * 3.1) * Math.sin(z * 5.3 - x * 2) * Math.min(1, h * 3);
    p.setY(i, h + wr);
  }
  geo.computeVertexNormals();
  return geo;
}

function boardTexture(lines, bg = '#101114', fg = '#ffd23a') {
  return canvasTexture(256, 160, (g, W, H) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((t, i) => {
      g.font = `800 ${i ? 44 : 64}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillText(t, W / 2, H * (lines.length === 1 ? 0.5 : 0.32 + i * 0.4));
    });
  });
}

function signTexture() {
  return canvasTexture(256, 128, (g, W, H) => {
    g.fillStyle = '#7a5a3a';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) {
      g.fillStyle = `rgba(0,0,0,${0.05 + 0.08 * Math.abs(Math.sin(y * 0.7))})`;
      g.fillRect(0, y, W, 1);
    }
    g.fillStyle = '#efe6d0';
    g.font = '700 46px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(W / 2, H * 0.42);
    g.rotate(-0.04);
    g.fillText('KEEP OUT', 0, 0);
    g.restore();
    g.font = '600 22px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('track closed', W / 2, H * 0.78);
  });
}

function rutTexture() {
  return canvasTexture(64, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(52,40,28,0)');
    gr.addColorStop(0.25, 'rgba(52,40,28,0.85)');
    gr.addColorStop(0.75, 'rgba(52,40,28,0.85)');
    gr.addColorStop(1, 'rgba(52,40,28,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // old tread prints across the rut
    g.fillStyle = 'rgba(25,18,12,0.35)';
    for (let y = 0; y < H; y += 10) g.fillRect(W * 0.22, y, W * 0.56, 3);
  }, { repeat: true });
}

export class Pitstop {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'pitstop';
    this.pull = -1;
    const W = game.world;
    const P = PITSTOP;
    const c = Math.cos(P.yaw);
    const s = Math.sin(P.yaw);
    // the car's frame: lx across (left +), lz along (front +)
    const at = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c];
    const gy = (x, z) => W.heightAt(x, z);

    // ---- the ruts of the old track, laid on the ground
    const ruts = [];
    const T = P.track;
    const samples = [];
    for (let i = 0; i < T.length - 1; i++) {
      const [ax, az] = T[i];
      const [bx, bz] = T[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(L / 0.6);
      for (let k = i ? 1 : 0; k <= n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    // a gentle smoothing so the ruts curve with the track
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < samples.length - 1; i++) {
        samples[i] = [(samples[i - 1][0] + samples[i][0] * 2 + samples[i + 1][0]) / 4, (samples[i - 1][1] + samples[i][1] * 2 + samples[i + 1][1]) / 4];
      }
    }
    // start a few metres off the road: the gravel wipes them out there
    const first = 8;
    for (const off of [-0.78, 0.78]) {
      const pos = [];
      const uv = [];
      let len = 0;
      for (let i = first; i < samples.length; i++) {
        const [x, z] = samples[i];
        const n = samples[Math.min(samples.length - 1, i + 1)];
        const p = samples[Math.max(0, i - 1)];
        let tx = n[0] - p[0];
        let tz = n[1] - p[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const ox = -tz;
        const oz = tx;
        if (i > first) len += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
        for (const w of [-0.2, 0.2]) {
          const px = x + ox * (off + w);
          const pz = z + oz * (off + w);
          pos.push(px, gy(px, pz) + 0.035, pz);
          uv.push(w < 0 ? 0 : 1, len / 1.2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const idx = [];
      for (let i = 0; i < pos.length / 6 - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      g.setIndex(idx);
      g.computeVertexNormals();
      ruts.push(g);
    }
    const rutMat = new THREE.MeshStandardMaterial({
      map: rutTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const g of ruts) {
      const m = new THREE.Mesh(g, rutMat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.group.add(m);
    }

    // ---- props round the car, in the car's frame
    const b = new ModelBuilder();
    const put = (lx, lz) => {
      const [x, z] = at(lx, lz);
      return [x, gy(x, z), z];
    };
    // tool chest on castors, red with drawer lines
    {
      const [x, y, z] = put(-2.2, -1.6);
      const rot = [0, P.yaw + 0.3, 0];
      b.box(0.72, 0.9, 0.46, { pos: [x, y + 0.54, z], rot, color: 0x9a2a22, jitter: 0 });
      for (let k = 0; k < 6; k++) b.box(0.74, 0.012, 0.47, { pos: [x, y + 0.2 + k * 0.13, z], rot, color: 0x3a0806, jitter: 0 });
      b.box(0.76, 0.03, 0.5, { pos: [x, y + 1.0, z], rot, color: 0x1a1a1a, jitter: 0 });
      for (const [dx, dz] of [
        [-0.3, -0.18],
        [0.3, -0.18],
        [-0.3, 0.18],
        [0.3, 0.18],
      ]) {
        const q = new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot[1]);
        b.cyl(0.045, 0.045, 0.03, 10, { pos: [x + q.x, y + 0.05, z + q.z], rot: [0, rot[1], Math.PI / 2], color: 0x111111, jitter: 0, smooth: true });
      }
    }
    // a red jerry can and a folding stool
    {
      const [x, y, z] = put(-2.1, 0.2);
      b.box(0.17, 0.46, 0.34, { pos: [x, y + 0.23, z], rot: [0, P.yaw + 1.2, 0], color: 0xa8201a, jitter: 0 });
      b.box(0.04, 0.05, 0.16, { pos: [x, y + 0.49, z], rot: [0, P.yaw + 1.2, 0], color: 0x1a1a1a, jitter: 0 });
    }
    {
      const [x, y, z] = put(2.3, -2.2);
      b.box(0.42, 0.04, 0.42, { pos: [x, y + 0.45, z], rot: [0, 0.4, 0], color: 0x2b3a5a, jitter: 0 });
      for (const k of [-1, 1]) {
        b.beam([x + k * 0.18, y, z - 0.18], [x - k * 0.18, y + 0.45, z + 0.18], 0.012, 6, { color: 0x9a9a9a, jitter: 0, smooth: true });
        b.beam([x + k * 0.18, y, z + 0.18], [x - k * 0.18, y + 0.45, z - 0.18], 0.012, 6, { color: 0x9a9a9a, jitter: 0, smooth: true });
      }
    }
    // the pit board's pole, its sign post by the road
    const board = put(1.8, 3.6);
    b.beam([board[0], board[1], board[2]], [board[0], board[1] + 1.25, board[2]], 0.02, 8, { color: 0x6a6a6a, jitter: 0, smooth: true });
    const signAt = [-74.5, 0, 167.5];
    signAt[1] = gy(signAt[0], signAt[2]);
    b.box(0.1, 1.6, 0.1, { pos: [signAt[0], signAt[1] + 0.8, signAt[2]], color: 0x4a3420, jitter: 0.05 });
    const propMesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }));
    propMesh.castShadow = true;
    propMesh.receiveShadow = true;
    this.group.add(propMesh);
    // the boards themselves
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), new THREE.MeshStandardMaterial({ map: boardTexture(['BOX BOX', 'P1 +0.4']), roughness: 0.5, side: THREE.DoubleSide }));
    pb.position.set(board[0], board[1] + 1.12, board[2]);
    pb.rotation.y = P.yaw + Math.PI * 0.85;
    this.group.add(pb);
    const sg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.04), [
      ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 })),
      new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }),
    ]);
    sg.position.set(signAt[0], signAt[1] + 1.35, signAt[2]);
    // facing the road, a little askew
    sg.rotation.set(0, Math.atan2(-79 - signAt[0], 162 - signAt[2]) + 0.25, 0.05);
    sg.castShadow = true;
    this.group.add(sg);

    // ---- spare slicks in stacks, the top ones in their warming blankets
    const tyreGeo = tyreGeometry(0.36, 0.33, 0.229, { n: 5 });
    tyreGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ map: tyreTexture({ tread: 'slick', ring: '#f2d22e', letters: 'MEDIUM' }), roughness: 0.85 });
    const blanket = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.95 });
    for (const [lx, lz, n] of [
      [-2.0, 1.4, 3],
      [-2.7, 0.9, 2],
    ]) {
      const [x, y, z] = put(lx, lz);
      for (let k = 0; k < n; k++) {
        const t = new THREE.Mesh(tyreGeo, k === n - 1 ? blanket : tyreMat);
        t.position.set(x, y + 0.165 + k * 0.33, z);
        t.rotation.y = k * 0.7;
        if (k === n - 1) t.scale.set(1.04, 1.02, 1.04);
        t.castShadow = true;
        t.receiveShadow = true;
        this.group.add(t);
      }
    }
    game.scene.add(this.group);

    this.tarpMat = new THREE.MeshStandardMaterial({ map: tarpTexture(), roughness: 0.92, side: THREE.DoubleSide });
    this.tarp = null;
    this.pile = new THREE.Mesh(this.pileGeometry(), this.tarpMat);
    const pp = put(-1.9, -3.4);
    this.pile.position.set(pp[0], pp[1] + 0.06, pp[2]);
    this.pile.rotation.y = P.yaw + 0.5;
    this.pile.castShadow = true;
    this.pile.visible = false;
    this.group.add(this.pile);
  }

  pileGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.18 * Math.sin(x * 7 + z * 3) * Math.cos(y * 5 - z * 4) + 0.1 * Math.sin(z * 11);
      p.setXYZ(i, x * k * 1.05, Math.max(-0.1, y * k) * 0.3, z * k * 0.7);
    }
    g.computeVertexNormals();
    return g;
  }

  // Cover the car (where it stands now, at the site) unless it was found.
  cover(car, found) {
    if (!this.tarp) {
      this.tarp = new THREE.Mesh(tarpGeometry(car), this.tarpMat);
      this.tarp.castShadow = true;
      this.tarp.receiveShadow = true;
      this.group.add(this.tarp);
    }
    car.group.updateMatrixWorld(true);
    this.tarp.matrixAutoUpdate = true;
    this.tarp.position.copy(car.group.position);
    this.tarp.quaternion.copy(car.group.quaternion);
    this.tarp.scale.set(1, 1, 1);
    this.tarp.visible = !found;
    this.pile.visible = !!found;
    this.pull = -1;
  }

  // Off it comes: dragged back over the tail and dropped beside the car.
  reveal() {
    this.pull = 0;
  }

  update(dt) {
    if (this.pull < 0 || !this.tarp) return;
    this.pull += dt;
    const t = Math.min(1, this.pull / 1.1);
    const back = new THREE.Vector3(Math.sin(PITSTOP.yaw), 0, Math.cos(PITSTOP.yaw)).multiplyScalar(-1);
    const car = this.game.racer;
    this.tarp.position.copy(car.group.position).addScaledVector(back, t * t * 3.2);
    this.tarp.position.y += Math.sin(t * Math.PI) * 0.5 - t * 0.4;
    this.tarp.scale.set(lerp(1, 0.45, t), lerp(1, 0.4, t), lerp(1, 0.25, t));
    if (t >= 1) {
      this.tarp.visible = false;
      this.pile.visible = true;
      this.pull = -1;
    }
  }
}
