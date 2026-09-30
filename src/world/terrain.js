// Chunked terrain with distance LODs and skirts, plus a coarse ring of distant
// mountains outside the playable square.
import * as THREE from 'three';
import { N, CS, HALF, CELLS } from './worldgen.js';
import { smoothstep, clamp } from '../util/math.js';

const CHUNK = 64;
const CHUNKS = CELLS / CHUNK;
const LOD_STEP = [1, 2, 4, 8];
const LOD_DIST = [165, 400, 820];

// sRGB byte -> linear float lookup
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function makeTerrainMaterial(detailTex) {
  detailTex.repeat.set(1 / 6.5, 1 / 6.5);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 dA = texture2D( map, vMapUv );
        vec4 dB = texture2D( map, vMapUv * 0.137 + vec2(0.31, 0.71) );
        float detail = dA.r * 0.55 + dB.g * 0.45;
        diffuseColor.rgb *= 0.62 + detail * 0.76;
      #endif`
    );
  };
  return mat;
}

export class Terrain {
  constructor(world, material) {
    this.world = world;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.indexCache = new Map();
    this.chunks = [];
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        this.group.add(mesh);
        this.chunks.push({
          cx,
          cz,
          lod: -1,
          geos: [],
          mesh,
          x0: -HALF + cx * CHUNK * CS,
          z0: -HALF + cz * CHUNK * CS,
          x1: -HALF + (cx + 1) * CHUNK * CS,
          z1: -HALF + (cz + 1) * CHUNK * CS,
        });
      }
    }
    this.lodBias = 1;
  }

  // Build every chunk at its LOD for a camera position (used at load time).
  prime(camX, camZ) {
    this.update(camX, camZ, true);
  }

  update(camX, camZ, force = false) {
    let built = 0;
    for (const c of this.chunks) {
      const dx = Math.max(c.x0 - camX, 0, camX - c.x1);
      const dz = Math.max(c.z0 - camZ, 0, camZ - c.z1);
      const d = Math.sqrt(dx * dx + dz * dz) / this.lodBias;
      let lod = 3;
      for (let i = 0; i < LOD_DIST.length; i++) {
        const hyst = c.lod === i ? 20 : c.lod === i + 1 ? -20 : 0;
        if (d < LOD_DIST[i] + hyst) {
          lod = i;
          break;
        }
      }
      if (lod !== c.lod) {
        // limit geometry builds per frame to keep frames smooth
        if (!c.geos[lod] && !force && built >= 2 && c.lod >= 0) continue;
        if (!c.geos[lod]) {
          c.geos[lod] = this.buildGeo(c, LOD_STEP[lod]);
          built++;
        }
        c.mesh.geometry = c.geos[lod];
        c.mesh.visible = true;
        c.lod = lod;
      }
    }
  }

  indexFor(step) {
    if (this.indexCache.has(step)) return this.indexCache.get(step);
    const segs = CHUNK / step;
    const vps = segs + 1;
    const main = vps * vps;
    const idx = [];
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * vps + i;
        const b = a + 1;
        const c = a + vps;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // skirts: edge vertex lists (main) and their skirt copies
    const edges = [];
    const top = [];
    const bottom = [];
    const left = [];
    const right = [];
    for (let i = 0; i < vps; i++) top.push(i);
    for (let i = 0; i < vps; i++) bottom.push(segs * vps + i);
    for (let j = 0; j < vps; j++) left.push(j * vps);
    for (let j = 0; j < vps; j++) right.push(j * vps + segs);
    edges.push(top, bottom, left, right);
    let s = main;
    for (const e of edges) {
      for (let q = 0; q < e.length - 1; q++) {
        const m0 = e[q];
        const m1 = e[q + 1];
        const s0 = s + q;
        const s1 = s + q + 1;
        idx.push(m0, s0, m1, m1, s0, s1);
        idx.push(m0, m1, s0, m1, s1, s0);
      }
      s += e.length;
    }
    const attr = new THREE.BufferAttribute(main + 4 * vps > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    this.indexCache.set(step, attr);
    return attr;
  }

  buildGeo(chunk, step) {
    const W = this.world;
    const h = W.h;
    const col = W.color;
    const segs = CHUNK / step;
    const vps = segs + 1;
    const total = vps * vps + vps * 4;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const clr = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const gi0 = chunk.cx * CHUNK;
    const gj0 = chunk.cz * CHUNK;
    let v = 0;
    const put = (gi, gj, dy) => {
      const k = gj * N + gi;
      const x = -HALF + gi * CS;
      const z = -HALF + gj * CS;
      pos[v * 3] = x;
      pos[v * 3 + 1] = h[k] + dy;
      pos[v * 3 + 2] = z;
      const st = step > 2 ? 2 : 1;
      const il = Math.max(gi - st, 0);
      const ir = Math.min(gi + st, N - 1);
      const ju = Math.max(gj - st, 0);
      const jd = Math.min(gj + st, N - 1);
      const dx = (h[gj * N + ir] - h[gj * N + il]) / ((ir - il) * CS);
      const dz = (h[jd * N + gi] - h[ju * N + gi]) / ((jd - ju) * CS);
      const l = Math.sqrt(dx * dx + 1 + dz * dz);
      nor[v * 3] = -dx / l;
      nor[v * 3 + 1] = 1 / l;
      nor[v * 3 + 2] = -dz / l;
      clr[v * 3] = LIN[col[k * 3]];
      clr[v * 3 + 1] = LIN[col[k * 3 + 1]];
      clr[v * 3 + 2] = LIN[col[k * 3 + 2]];
      uv[v * 2] = x;
      uv[v * 2 + 1] = z;
      v++;
    };
    for (let j = 0; j < vps; j++) for (let i = 0; i < vps; i++) put(gi0 + i * step, gj0 + j * step, 0);
    const edgeDepth = (isWorldEdge) => (isWorldEdge ? -60 : -(2 + step * 1.6));
    const last = gi0 + segs * step;
    const lastJ = gj0 + segs * step;
    for (let i = 0; i < vps; i++) put(gi0 + i * step, gj0, edgeDepth(chunk.cz === 0));
    for (let i = 0; i < vps; i++) put(gi0 + i * step, lastJ, edgeDepth(chunk.cz === CHUNKS - 1));
    for (let j = 0; j < vps; j++) put(gi0, gj0 + j * step, edgeDepth(chunk.cx === 0));
    for (let j = 0; j < vps; j++) put(last, gj0 + j * step, edgeDepth(chunk.cx === CHUNKS - 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(this.indexFor(step));
    g.computeBoundingSphere();
    return g;
  }
}

// Distant mountains and far shore beyond the playable square.
export function buildFarTerrain(world, material) {
  // denser near the playable square so nearby slopes stay smooth
  const coords = [];
  const R = 6400;
  const NEAR = HALF + 700;
  for (let v = -R; v < -NEAR; v += 200) coords.push(v);
  for (let v = -NEAR; v <= NEAR; v += 50) coords.push(v);
  for (let v = NEAR + 200; v <= R; v += 200) coords.push(v);
  // make sure the square edge lines exist exactly
  const n = coords.length;
  const pos = [];
  const col = [];
  const nor = [];
  const uv = [];
  const hAt = (x, z) => {
    if (Math.abs(x) <= HALF && Math.abs(z) <= HALF) return world.heightAt(clamp(x, -HALF, HALF), clamp(z, -HALF, HALF));
    return world.farHeight(x, z);
  };
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = hAt(coords[i], coords[j]);
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = coords[i];
      const z = coords[j];
      const e = H[j * n + i];
      pos.push(x, e, z);
      const il = Math.max(i - 1, 0);
      const ir = Math.min(i + 1, n - 1);
      const ju = Math.max(j - 1, 0);
      const jd = Math.min(j + 1, n - 1);
      const dx = (H[j * n + ir] - H[j * n + il]) / (coords[ir] - coords[il]);
      const dz = (H[jd * n + i] - H[ju * n + i]) / (coords[jd] - coords[ju]);
      const l = Math.sqrt(dx * dx + 1 + dz * dz);
      nor.push(-dx / l, 1 / l, -dz / l);
      const slope = Math.sqrt(dx * dx + dz * dz);
      const nz = world.n1.noise(x * 0.002, z * 0.002);
      let c;
      if (e < -0.5) c = [0.36, 0.34, 0.27];
      else if (e < 4) c = [0.72, 0.66, 0.52];
      else {
        const forest = [0.2, 0.3, 0.16];
        const tundra = [0.5, 0.46, 0.3];
        const rock = [0.42, 0.41, 0.4];
        const snow = [0.95, 0.96, 0.98];
        c = forest.slice();
        const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        c = mixc(c, tundra, smoothstep(140, 240, e + nz * 40));
        c = mixc(c, rock, smoothstep(0.5, 0.9, slope));
        c = mixc(c, snow, smoothstep(330, 420, e + nz * 60) * (1 - smoothstep(1.1, 1.8, slope)));
      }
      col.push(LIN[Math.round(c[0] * 255)], LIN[Math.round(c[1] * 255)], LIN[Math.round(c[2] * 255)]);
      uv.push(x, z);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const inside = coords[i] >= -HALF && coords[i + 1] <= HALF && coords[j] >= -HALF && coords[j + 1] <= HALF;
      if (inside) continue;
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'farTerrain';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
