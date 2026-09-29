// Vegetation and rocks: deterministic placement from the world's density
// fields, rendered with per-type instanced meshes. Instances are re-bucketed
// into near/far LODs around the camera with CPU frustum culling.
import * as THREE from 'three';
import { ModelBuilder, jitterGeometry } from '../util/builder.js';
import { mulberry32, lerp, clamp, smoothstep } from '../util/math.js';
import { HALF, SIZE, ROAD_HALF, SURF } from './worldgen.js';

const CELL = 50;
const GRID = Math.ceil(SIZE / CELL);

function spruceNear() {
  const b = new ModelBuilder();
  b.cyl(0.11, 0.22, 2.4, 5, { pos: [0, 1.2, 0], color: 0x4a3322 });
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = lerp(2.25, 0.6, t);
    const h = lerp(2.7, 1.7, t);
    const y = 1.5 + i * 1.32;
    const col = i % 2 ? 0x1d3a24 : 0x264a2c;
    b.cone(r, h, 7, { pos: [0, y + h / 2, 0], rot: [0, i * 0.9, 0], color: col, gradient: 0.45, jitter: 0.1 });
  }
  b.cone(0.28, 1.3, 5, { pos: [0, 1.5 + layers * 1.32 + 0.4, 0], color: 0x2c5232 });
  return b.build();
}

function spruceFar() {
  // five-sided open cone: 5 triangles per distant tree
  const b = new ModelBuilder();
  b.add(new THREE.ConeGeometry(2.1, 11.2, 5, 1, true), { pos: [0, 5.5, 0], color: 0x21422a, gradient: 0.35, jitter: 0.04 });
  return b.build();
}

function birchNear() {
  const b = new ModelBuilder();
  b.cyl(0.09, 0.16, 5.4, 6, { pos: [0, 2.7, 0], color: 0xdcd8cc, jitter: 0.12 });
  b.cyl(0.165, 0.165, 0.18, 6, { pos: [0, 1.4, 0], color: 0x2a2622 });
  b.cyl(0.14, 0.14, 0.12, 6, { pos: [0, 3.1, 0], color: 0x2a2622 });
  b.beam([0, 3.6, 0], [0.9, 4.8, 0.3], 0.05, 4, { color: 0xcfcabc });
  b.beam([0, 4.1, 0], [-0.8, 5.2, -0.4], 0.05, 4, { color: 0xcfcabc });
  const blobs = [
    [0, 6.4, 0, 1.7],
    [0.9, 5.4, 0.4, 1.3],
    [-0.9, 5.6, -0.3, 1.25],
    [0.2, 5.1, -0.9, 1.1],
    [-0.3, 7.3, 0.2, 1.1],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = jitterGeometry(new THREE.IcosahedronGeometry(r, 0), r * 0.35, mulberry32((x * 13 + y * 7) | 0));
    b.add(g, { pos: [x, y, z], color: 0x6a8c36, gradient: 0.35, jitter: 0.12 });
  }
  return b.build();
}

function birchFar() {
  // octahedron canopy on a thin triangular trunk: 11 triangles
  const b = new ModelBuilder();
  b.add(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 3, 1, true), { pos: [0, 2.2, 0], color: 0xd8d4c8 });
  b.add(new THREE.OctahedronGeometry(2.2, 0), { pos: [0, 6.0, 0], scale: [1, 1.15, 1], color: 0x668834, gradient: 0.25 });
  return b.build();
}

function bushGeo() {
  const b = new ModelBuilder();
  const blobs = [
    [0, 0.7, 0, 0.95],
    [0.7, 0.5, 0.3, 0.7],
    [-0.6, 0.55, -0.2, 0.75],
    [0.1, 0.45, -0.7, 0.6],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = jitterGeometry(new THREE.IcosahedronGeometry(r, 0), r * 0.4, mulberry32((x * 31 + z * 17 + 5) | 0));
    b.add(g, { pos: [x, y, z], color: 0xffffff, gradient: 0.4, jitter: 0.12 });
  }
  return b.build();
}

function rockGeo(seed, detail = 1) {
  const b = new ModelBuilder();
  const g = jitterGeometry(new THREE.DodecahedronGeometry(1, detail), detail ? 0.45 : 0.3, mulberry32(seed));
  b.add(g, { pos: [0, 0.35, 0], scale: [1, 0.72, 1], color: 0xffffff, jitter: 0.1 });
  return b.build();
}

function snagGeo() {
  const b = new ModelBuilder();
  b.cyl(0.1, 0.24, 9, 5, { pos: [0, 4.5, 0], color: 0x8a8378, jitter: 0.08 });
  b.beam([0, 5.5, 0], [1.4, 6.6, 0.2], 0.06, 4, { color: 0x7d766c });
  b.beam([0, 6.8, 0], [-1.2, 7.6, 0.5], 0.05, 4, { color: 0x7d766c });
  b.beam([0, 7.8, 0], [0.3, 8.8, -1.0], 0.045, 4, { color: 0x7d766c });
  return b.build();
}

// Material with gentle wind sway for tall vegetation.
function swayMaterial(uniforms, amount) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sw = sin(uTime * 1.2 + ip.x * 0.05 + ip.y * 0.07) + 0.35 * sin(uTime * 2.7 + ip.x * 0.3);
        float hh = max(position.y - 1.0, 0.0);
        transformed.x += sw * ${amount.toFixed(4)} * hh * hh;
        transformed.z += sw * ${(amount * 0.6).toFixed(4)} * hh * hh;`
      );
  };
  return mat;
}

class ScatterType {
  constructor(name, lods, opts) {
    this.name = name;
    this.lods = lods; // [{geo, material, maxDist, capacity, shadow}]
    this.maxDist = lods[lods.length - 1].maxDist;
    this.opts = opts;
    this.list = []; // raw instances during generation
    this.meshes = lods.map((l) => {
      const m = new THREE.InstancedMesh(l.geo, l.material, l.capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = !!l.shadow;
      m.receiveShadow = !!l.receive;
      if (opts.tint) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(l.capacity * 3), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      m.name = `${name}-lod`;
      return m;
    });
  }

  add(x, y, z, rot, scale, tint, sx = 1, sz = 1, tilt = 0) {
    this.list.push({ x, y, z, rot, scale, tint, sx, sz, tilt });
  }

  finalize() {
    const n = this.list.length;
    this.count = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.m = new Float32Array(n * 12); // 3x4 affine
    this.tint = new Float32Array(n * 3);
    const cells = Array.from({ length: GRID * GRID }, () => []);
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    this.list.forEach((it, i) => {
      this.x[i] = it.x;
      this.y[i] = it.y;
      this.z[i] = it.z;
      e.set(it.tilt ? it.tilt * Math.cos(it.rot * 3.1) : 0, it.rot, it.tilt ? it.tilt * Math.sin(it.rot * 2.3) : 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y, it.z);
      scl.set(it.scale * it.sx, it.scale, it.scale * it.sz);
      mat.compose(pos, q, scl);
      const el = mat.elements;
      this.m.set([el[0], el[1], el[2], el[4], el[5], el[6], el[8], el[9], el[10], el[12], el[13], el[14]], i * 12);
      const t = it.tint || [1, 1, 1];
      this.tint[i * 3] = t[0];
      this.tint[i * 3 + 1] = t[1];
      this.tint[i * 3 + 2] = t[2];
      const ci = clamp(Math.floor((it.x + HALF) / CELL), 0, GRID - 1);
      const cj = clamp(Math.floor((it.z + HALF) / CELL), 0, GRID - 1);
      cells[cj * GRID + ci].push(i);
    });
    this.cells = cells.map((a) => Int32Array.from(a));
    this.list = null;
  }
}

export class Scatter {
  constructor(world, colliders, sharedUniforms) {
    this.world = world;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'scatter';
    this.uniforms = sharedUniforms;
    this.distScale = 1;
    const sway = swayMaterial(sharedUniforms, 0.0016);
    const swayBirch = swayMaterial(sharedUniforms, 0.0022);
    const plain = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.types = {
      spruce: new ScatterType(
        'spruce',
        [
          { geo: spruceNear(), material: sway, maxDist: 115, capacity: 2000, shadow: true },
          { geo: spruceFar(), material: plain, maxDist: 720, capacity: 12000 },
        ],
        { tint: true }
      ),
      birch: new ScatterType(
        'birch',
        [
          { geo: birchNear(), material: swayBirch, maxDist: 95, capacity: 1000, shadow: true },
          { geo: birchFar(), material: plain, maxDist: 560, capacity: 5000 },
        ],
        { tint: true }
      ),
      bush: new ScatterType('bush', [{ geo: bushGeo(), material: plain, maxDist: 160, capacity: 4000, shadow: false }], {
        tint: true,
      }),
      rock: new ScatterType(
        'rock',
        [
          { geo: rockGeo(3), material: plain, maxDist: 90, capacity: 2500, shadow: true, receive: true },
          { geo: rockGeo(3, 0), material: plain, maxDist: 360, capacity: 4000 },
        ],
        { tint: true }
      ),
      snag: new ScatterType('snag', [{ geo: snagGeo(), material: plain, maxDist: 500, capacity: 400, shadow: true }], {
        tint: false,
      }),
    };
    for (const t of Object.values(this.types)) for (const m of t.meshes) this.group.add(m);

    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3(0, 0, 1);
    this.frustum = new THREE.Frustum();
    this.projCam = new THREE.PerspectiveCamera();
    this.sphere = new THREE.Sphere();
    this.snags = [];
  }

  generate(avoid = []) {
    const W = this.world;
    const rand = mulberry32(W.seed * 3 + 1);
    const T = this.types;
    const blocked = (x, z, r) => {
      for (const a of avoid) {
        const dx = x - a.x;
        const dz = z - a.z;
        if (dx * dx + dz * dz < (a.r + r) ** 2) return true;
      }
      return false;
    };
    const water = (x, z) => {
      const w = W.waterAt(x, z);
      return w && w.depth > -0.2;
    };

    // trees on a jittered 5 m grid
    for (let gz = -HALF + 2; gz < HALF - 2; gz += 5) {
      for (let gx = -HALF + 2; gx < HALF - 2; gx += 5) {
        const x = gx + rand() * 5;
        const z = gz + rand() * 5;
        const k = W.cellIndex(x, z);
        const forest = W.forest[k] / 255;
        const lone = W.surf[k] === SURF.GRASS ? 0.012 : 0;
        if (rand() > forest * 0.52 + lone) continue;
        if (W.roadD[k] < ROAD_HALF + 3.5) continue;
        if (water(x, z) || blocked(x, z, 3)) continue;
        const y = W.heightAt(x, z);
        const low = y < 70;
        const birchN = W.n2.noise(x * 0.006 + 7, z * 0.006 - 3);
        const isBirch = low && (birchN > 0.25 || rand() < 0.08);
        const rot = rand() * Math.PI * 2;
        if (isBirch) {
          const s = 0.75 + rand() * 0.55;
          const autumn = rand() < 0.14;
          const tint = autumn ? [1.3, 1.0, 0.45] : [0.8 + rand() * 0.2, 0.82 + rand() * 0.2, 0.78 + rand() * 0.2];
          T.birch.add(x, y - 0.15, z, rot, s, tint);
          this.colliders.addCircle(x, z, 0.22 * s);
        } else {
          const s = 0.5 + rand() * 0.85 + (rand() < 0.1 ? 0.35 : 0);
          const v = 0.8 + rand() * 0.35;
          T.spruce.add(x, y - 0.2, z, rot, s, [v, v * (0.95 + rand() * 0.1), v * (0.9 + rand() * 0.15)]);
          this.colliders.addCircle(x, z, 0.3 * s);
        }
      }
    }

    // bushes, willows along water and dwarf shrubs on the tundra
    for (let gz = -HALF + 3; gz < HALF - 3; gz += 7) {
      for (let gx = -HALF + 3; gx < HALF - 3; gx += 7) {
        const x = gx + rand() * 7;
        const z = gz + rand() * 7;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (st === SURF.ROAD || st === SURF.SNOW || st === SURF.ICE || st === SURF.MUD || st === SURF.SAND) continue;
        if (W.roadD[k] < ROAD_HALF + 2.5) continue;
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0.04;
        if (rd < rw + 30 && rd > rw + 3) p = 0.4;
        if (st === SURF.TUNDRA) p = 0.18;
        if (st === SURF.FOREST) p = 0.12;
        if (st === SURF.ROCK) p = 0.02;
        if (rand() > p) continue;
        if (water(x, z) || blocked(x, z, 2)) continue;
        const y = W.heightAt(x, z);
        let tint;
        if (st === SURF.TUNDRA) tint = rand() < 0.5 ? [0.62, 0.26, 0.12] : [0.45, 0.36, 0.17];
        else if (rand() < 0.12) tint = [0.55, 0.45, 0.16];
        else tint = [0.2 + rand() * 0.06, 0.3 + rand() * 0.08, 0.11 + rand() * 0.04];
        const s = st === SURF.TUNDRA ? 0.45 + rand() * 0.35 : 0.7 + rand() * 0.7;
        T.bush.add(x, y - 0.1, z, rand() * 6.28, s, tint, 1 + rand() * 0.4, 1 + rand() * 0.4);
      }
    }

    // rocks and boulders
    for (let gz = -HALF + 4; gz < HALF - 4; gz += 9) {
      for (let gx = -HALF + 4; gx < HALF - 4; gx += 9) {
        const x = gx + rand() * 9;
        const z = gz + rand() * 9;
        const k = W.cellIndex(x, z);
        const st = W.surf[k];
        if (W.roadD[k] < ROAD_HALF + 2) continue;
        const slope = W.slopeAt(x, z);
        const rd = W.riverD[k];
        const rw = rd < 200 ? W.riverWidth(W.riverS[k]) : 0;
        let p = 0.015 + smoothstep(0.4, 1.2, slope) * 0.25;
        if (st === SURF.TUNDRA) p += 0.06;
        if (st === SURF.GRAVEL && rd < rw + 12) p += 0.2;
        if (st === SURF.SNOW || st === SURF.ICE) p = 0.02;
        if (rand() > p) continue;
        if (blocked(x, z, 2)) continue;
        const y = W.heightAt(x, z);
        const big = rand() < 0.12;
        const s = big ? 1.6 + rand() * 1.8 : 0.35 + rand() * 0.9;
        const g = 0.75 + rand() * 0.3;
        const tint = [g * 0.4, g * 0.4, g * 0.41];
        T.rock.add(x, y - 0.25 * s, z, rand() * 6.28, s, tint, 0.8 + rand() * 0.6, 0.8 + rand() * 0.6, 0.25);
        if (s > 0.6) this.colliders.addCircle(x, z, s * 0.85);
      }
    }

    // dead snags near water (eagle perches)
    for (let i = 0; i < 1400; i++) {
      const s = rand() * W.river.length;
      const p = W.river.sample(s);
      const side = rand() < 0.5 ? -1 : 1;
      const d = W.riverWidth(s) + 8 + rand() * 30;
      const x = p.x - p.tz * side * d;
      const z = p.z + p.tx * side * d;
      if (rand() > 0.09) continue;
      if (!W.inBounds(x, z, 10) || water(x, z) || blocked(x, z, 3)) continue;
      const k = W.cellIndex(x, z);
      if (W.roadD[k] < ROAD_HALF + 4) continue;
      const y = W.heightAt(x, z);
      const sc = 0.8 + rand() * 0.5;
      T.snag.add(x, y - 0.2, z, rand() * 6.28, sc, null);
      this.colliders.addCircle(x, z, 0.25 * sc);
      this.snags.push({ x, y: y + 8.6 * sc, z });
    }

    for (const t of Object.values(T)) t.finalize();
  }

  // Rebuild visible instance lists when the camera moved or turned enough.
  update(camera, force = false) {
    const pos = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const moved = pos.distanceTo(this.lastPos) > 7;
    const turned = dir.dot(this.lastDir) < Math.cos(0.2);
    if (!force && !moved && !turned) return false;
    this.lastPos.copy(pos);
    this.lastDir.copy(dir);

    const pc = this.projCam;
    pc.fov = Math.min(170, camera.fov + 34);
    pc.aspect = camera.aspect * 1.1;
    pc.near = 0.5;
    pc.far = 1200;
    pc.position.copy(camera.position);
    pc.quaternion.copy(camera.quaternion);
    pc.updateProjectionMatrix();
    pc.updateMatrixWorld(true);
    const m = new THREE.Matrix4().multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(m);

    const cx = pos.x;
    const cz = pos.z;
    for (const t of Object.values(this.types)) {
      const lods = t.lods;
      const meshes = t.meshes;
      const counts = new Array(lods.length).fill(0);
      const maxD = t.maxDist * this.distScale;
      const maxD2 = maxD * maxD;
      const i0 = clamp(Math.floor((cx - maxD + HALF) / CELL), 0, GRID - 1);
      const i1 = clamp(Math.floor((cx + maxD + HALF) / CELL), 0, GRID - 1);
      const j0 = clamp(Math.floor((cz - maxD + HALF) / CELL), 0, GRID - 1);
      const j1 = clamp(Math.floor((cz + maxD + HALF) / CELL), 0, GRID - 1);
      const lodD2 = lods.map((l) => (l.maxDist * this.distScale) ** 2);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const list = t.cells[j * GRID + i];
          if (list.length === 0) continue;
          const ccx = -HALF + (i + 0.5) * CELL;
          const ccz = -HALF + (j + 0.5) * CELL;
          const ddx = ccx - cx;
          const ddz = ccz - cz;
          const cd2 = ddx * ddx + ddz * ddz;
          if (cd2 > (maxD + CELL) ** 2) continue;
          const near = cd2 < 70 * 70;
          if (!near) {
            this.sphere.center.set(ccx, t.y[list[0]] + 8, ccz);
            this.sphere.radius = CELL * 0.75 + 25;
            if (!this.frustum.intersectsSphere(this.sphere)) continue;
          }
          for (let q = 0; q < list.length; q++) {
            const idx = list[q];
            const dx = t.x[idx] - cx;
            const dz = t.z[idx] - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 > maxD2) continue;
            let lod = 0;
            while (lod < lods.length - 1 && d2 > lodD2[lod]) lod++;
            const mesh = meshes[lod];
            const c = counts[lod];
            if (c >= lods[lod].capacity) continue;
            const arr = mesh.instanceMatrix.array;
            const o = c * 16;
            const s = idx * 12;
            const M = t.m;
            arr[o] = M[s];
            arr[o + 1] = M[s + 1];
            arr[o + 2] = M[s + 2];
            arr[o + 3] = 0;
            arr[o + 4] = M[s + 3];
            arr[o + 5] = M[s + 4];
            arr[o + 6] = M[s + 5];
            arr[o + 7] = 0;
            arr[o + 8] = M[s + 6];
            arr[o + 9] = M[s + 7];
            arr[o + 10] = M[s + 8];
            arr[o + 11] = 0;
            arr[o + 12] = M[s + 9];
            arr[o + 13] = M[s + 10];
            arr[o + 14] = M[s + 11];
            arr[o + 15] = 1;
            if (mesh.instanceColor) {
              const ca = mesh.instanceColor.array;
              ca[c * 3] = t.tint[idx * 3];
              ca[c * 3 + 1] = t.tint[idx * 3 + 1];
              ca[c * 3 + 2] = t.tint[idx * 3 + 2];
            }
            counts[lod] = c + 1;
          }
        }
      }
      for (let l = 0; l < meshes.length; l++) {
        const mesh = meshes[l];
        mesh.count = counts[l];
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, counts[l] * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.clearUpdateRanges();
          mesh.instanceColor.addUpdateRange(0, counts[l] * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
    return true;
  }

  stats() {
    const out = {};
    for (const [k, t] of Object.entries(this.types)) out[k] = { total: t.count, drawn: t.meshes.map((m) => m.count) };
    return out;
  }
}
