// Chunked terrain with distance LODs and skirts, plus a coarse ring of distant
// mountains outside the playable square.
import * as THREE from 'three';
import { N, CS, HALF, CELLS } from './worldgen.js';
import { smoothstep, clamp } from '../util/math.js';
import { fxPatch } from './worldfx.js';

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

// Ground material: vertex colours from the world, a large-scale variation
// map, and per-surface detail (rock layers on cliff faces, pebbles on gravel
// bars and river beds, sand and snow ripples, needles on the forest floor)
// with bump lighting from the same patterns. Under water the pattern sways
// with the waves above it, like refraction.
export function makeTerrainMaterial(detailTex, matTex, surfaceTex) {
  detailTex.repeat.set(1 / 6.5, 1 / 6.5);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex });
  mat.userData.fx = 'canopy puddles';
  const extra = { uMat: { value: matTex }, uSurf: { value: surfaceTex }, uSnowLine: { value: 300 } };
  // a plain function: the reflection copy (reflectionMaterial) shares it and
  // must be patched with its own flags
  mat.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTWorld;\nvarying vec3 vTNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTWorld = position;\nvTNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uMat;
        uniform sampler2D uSurf;
        uniform float uSnowLine;
        varying vec3 vTWorld;
        varying vec3 vTNormal;
        float tHeight = 0.0;
        vec3 tBump( vec3 surfPos, vec3 surfNorm, float h ) {
          vec3 sx = dFdx( surfPos );
          vec3 sy = dFdy( surfPos );
          vec3 r1 = cross( sy, surfNorm );
          vec3 r2 = cross( surfNorm, sx );
          float det = dot( sx, r1 );
          vec2 dh = vec2( dFdx( h ), dFdy( h ) );
          vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
          vec3 bumped = normalize( abs( det ) * surfNorm - grad + surfNorm * 1e-6 );
          // never tip the surface more than about 50 degrees from its geometry
          return normalize( mix( surfNorm, bumped, clamp( dot( bumped, surfNorm ) * 2.0 - 0.3, 0.0, 1.0 ) ) );
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          // top-down variation map; it would stretch into streaks on steep
          // faces, where the projected rock layers take over instead
          vec4 dA = texture2D( map, vMapUv );
          vec4 dB = texture2D( map, vMapUv * 0.137 + vec2(0.31, 0.71) );
          float detail = dA.r * 0.55 + dB.g * 0.45;
          float flatness = smoothstep( 0.55, 0.85, normalize( vTNormal ).y );
          diffuseColor.rgb *= mix( 1.0, 0.7 + detail * 0.6, flatness );
        #endif
        {
          vec3 tn = normalize( vTNormal );
          vec4 sw = vec4( 0.0 );
          vec2 p = vTWorld.xz;
          #ifdef USE_FOG
            sw = texture2D( uSurf, ( vTWorld.xz - uFxWorld.xy ) * uFxWorld.z + uFxWorld.w );
            if ( vTWorld.y < uFxWaterMax ) {
              float below = fxWaterAt( vTWorld.xz ).x - vTWorld.y;
              if ( below > 0.0 ) p += ( texture2D( uFxWaves, vTWorld.xz / 7.0 ).rg * 2.0 - 1.0 ) * min( below, 3.0 ) * 0.05;
            }
          #endif
          float steep = 1.0 - smoothstep( 0.62, 0.86, tn.y );
          float wR = clamp( max( sw.r, steep ), 0.0, 1.0 );
          // pebbles only where there is real gravel, not where the blurred
          // map bleeds a little of it into the meadow beside a path
          float wG = smoothstep( 0.2, 0.55, sw.g ) * ( 1.0 - wR );
          float wB = sw.b * ( 1.0 - wR * 0.6 );
          float wA = sw.a * ( 1.0 - wR ) * ( 1.0 - wG );
          // rock layers projected onto the cliff faces
          vec2 bw = abs( tn.xz ) + 0.001;
          bw /= bw.x + bw.y;
          float rk = texture2D( uMat, vec2( vTWorld.z, vTWorld.y ) * 0.11 ).r * bw.x + texture2D( uMat, vec2( vTWorld.x, vTWorld.y ) * 0.11 ).r * bw.y;
          rk = mix( texture2D( uMat, p * 0.09 ).r, rk, steep );
          float pb = texture2D( uMat, p * 0.36 ).g;
          float sd = texture2D( uMat, p * 0.3 ).b;
          float ff = texture2D( uMat, p * 0.45 ).a;
          float tone = mix( 1.0, 0.5 + rk * 0.95, wR );
          tone *= mix( 1.0, 0.42 + pb * 1.05, wG );
          tone *= mix( 1.0, 0.8 + sd * 0.4, wB );
          tone *= mix( 1.0, 0.58 + ff * 0.8, wA );
          diffuseColor.rgb *= tone;
          // stones vary a little in colour, warm to cool
          diffuseColor.rgb *= mix( vec3( 1.0 ), mix( vec3( 1.06, 1.0, 0.92 ), vec3( 0.92, 0.98, 1.06 ), fract( pb * 7.3 ) ), wG * step( 0.2, pb ) );
          // bands of paler and darker rock across the big mountain faces
          float band = sin( vTWorld.y * 0.075 + texture2D( uMat, vTWorld.xz * 0.0031 ).r * 5.0 );
          diffuseColor.rgb *= mix( 1.0, 0.84 + 0.22 * smoothstep( -0.4, 0.6, band ), wR * smoothstep( 90.0, 180.0, vTWorld.y ) );
          // snow on the high ground: lower on north faces, shed by cliffs,
          // with a ragged edge where rock pokes through
          float sBig = texture2D( map, vTWorld.xz * 0.0019 + vec2( 0.13, 0.57 ) ).g * 2.0 - 1.0;
          float sRag = texture2D( uMat, vTWorld.xz * 0.021 ).r - 0.5;
          float snowLine = uSnowLine + sBig * 70.0 + sRag * 26.0 + tn.z * 45.0;
          float snow = smoothstep( snowLine - 10.0, snowLine + 14.0, vTWorld.y );
          // high up, glaciers and snowfields cling to steeper ground
          float high = smoothstep( 600.0, 1300.0, vTWorld.y );
          snow *= smoothstep( 0.4 - high * 0.2, 0.62 - high * 0.25, tn.y + rk * 0.08 );
          snow = clamp( snow - rk * wR * 0.35 * ( 1.0 - snow ), 0.0, 1.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.95 ) * ( 0.93 + sRag * 0.14 ), snow );
          // fade the bumps with distance and at grazing views, where screen
          // derivatives of the pattern blow up
          float fade = 1.0 - smoothstep( 35.0, 110.0, length( vViewPosition ) );
          fade *= smoothstep( 0.06, 0.3, abs( dot( tn, normalize( cameraPosition - vTWorld ) ) ) );
          tHeight = ( rk * wR * 0.09 + pb * wG * 0.035 + sd * wB * 0.012 + ff * wA * 0.018 ) * fade * ( 1.0 - snow * 0.85 );
          #if defined( USE_FOG ) && defined( FX_PUDDLES )
            // puddles after rain in the flat hollows of tracks, gravel and
            // bare ground, growing the longer it rains; bare ground shines
            // when wet, grass and tundra stay matte
            if ( uFxWet > 0.02 ) {
              fxWetGloss = clamp( wR + wG + wB * 0.6 + wA * 0.3 + snow, 0.0, 1.0 );
              float pn = texture2D( uFxCloudTex, p * 0.09 + vec2( 0.37, 0.61 ) ).g;
              float site = clamp( wG * 1.3 + ( 1.0 - wR - wB - wA ) * 0.5, 0.0, 1.0 ) * smoothstep( 0.965, 0.992, tn.y ) * ( 1.0 - snow );
              // fewer (but still whole) puddles in the meadows than on roads
              float lvl = 0.66 - 0.12 * uFxWet + ( 1.0 - site ) * 0.14;
              fxPuddle = smoothstep( lvl, lvl + 0.03, pn ) * smoothstep( 0.1, 0.3, site ) * smoothstep( 0.05, 0.4, uFxWet ) * ( 1.0 - smoothstep( 120.0, 260.0, length( vViewPosition ) ) );
              diffuseColor.rgb *= 1.0 - 0.25 * fxPuddle;
              tHeight *= 1.0 - fxPuddle;
            }
          #endif
        }`
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = tBump( - vViewPosition, normal, tHeight );');
    fxPatch(shader, this);
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
  for (let v = -R; v < -NEAR; v += 100) coords.push(v);
  for (let v = -NEAR; v <= NEAR; v += 40) coords.push(v);
  for (let v = NEAR + 100; v <= R; v += 100) coords.push(v);
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
        c = mixc(c, snow, smoothstep(390, 470, e + nz * 60) * (1 - smoothstep(1.1, 1.8, slope)));
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
  // the height grid, reused for the distant part of the lighting maps
  mesh.userData.grid = { coords, H };
  return mesh;
}

// Coarse single-mesh copy of the playable terrain (12.5 m grid) for the water
// reflection probe, which only renders objects on `layer`.
export function buildReflectionTerrain(world, material, layer) {
  const step = 4;
  const n = Math.floor(CELLS / step) + 1;
  const h = world.h;
  const col = world.color;
  const vert = (i, j, pos, nor, clr, uv, v) => {
    const gi = Math.min(i * step, N - 1);
    const gj = Math.min(j * step, N - 1);
    const k = gj * N + gi;
    const x = -HALF + gi * CS;
    const z = -HALF + gj * CS;
    pos[v * 3] = x;
    pos[v * 3 + 1] = h[k];
    pos[v * 3 + 2] = z;
    const il = Math.max(gi - step, 0);
    const ir = Math.min(gi + step, N - 1);
    const ju = Math.max(gj - step, 0);
    const jd = Math.min(gj + step, N - 1);
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
  };
  const group = new THREE.Group();
  group.name = 'reflectionTerrain';
  const B = 32; // cells per chunk side (400 m)
  for (let cj = 0; cj < n - 1; cj += B) {
    for (let ci = 0; ci < n - 1; ci += B) {
      const w = Math.min(B, n - 1 - ci) + 1;
      const d = Math.min(B, n - 1 - cj) + 1;
      const pos = new Float32Array(w * d * 3);
      const nor = new Float32Array(w * d * 3);
      const clr = new Float32Array(w * d * 3);
      const uv = new Float32Array(w * d * 2);
      for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) vert(ci + i, cj + j, pos, nor, clr, uv, j * w + i);
      const idx = [];
      for (let j = 0; j < d - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i;
          const b = a + 1;
          const c = a + w;
          const e = c + 1;
          idx.push(a, c, b, b, c, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(clr, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(layer);
      group.add(mesh);
    }
  }
  return group;
}
