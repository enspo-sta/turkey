// Surface finishes for the buildings and other structures: lap boards,
// board and batten, log bark, shingles, fieldstone, corrugated metal, deck
// boards and concrete. Each is a seamless grey pattern 2 m across, drawn once
// at load (by a worker, while the world is generated) and packed four to a
// texture (one per channel), so the props keep their one material and their
// merged draws. A ModelBuilder part with
// `surf: 'plank'` (and so on) carries the finish and its own surface
// coordinates in metres (see util/builder.js); finishMaterial() draws it as
// a brightness pattern with a matching bump that fades with distance.
import * as THREE from 'three';
import { fxPatch } from './worldfx.js';
import { FINISHES, FINISH_ID } from './finishids.js';

export { FINISHES, FINISH_ID };

// texels per 2 m tile
const SIZE = 512;
const TILE = 2;

// ------------------------------------------------------------- patterns
// The finishes drawn into two RGBA images size texels square, four patterns
// in each (red, green, blue and alpha): [Uint8Array, Uint8Array]. One
// function with nothing from outside it, so a worker can run it from its
// source text (see prepareFinishes).
export function drawFinishes(size) {
  const TILE = 2;
  // ---------------------------------------------------------------- noise
  function hash(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Value noise that repeats every px cells across and py cells up.
  function vnoise(x, y, px, py, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const a = hash(x0, y0, seed);
    const b = hash(x1, y0, seed);
    const c = hash(x0, y1, seed);
    const d = hash(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y, px, py, seed, oct = 4) {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    let n = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * vnoise(x * f, y * f, px * f, py * f, seed + o * 17);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const frac = (v) => v - Math.floor(v);
  // distance from v to the nearest whole multiple of p, wrapping
  const seam = (v, p) => {
    const f = frac(v / p);
    return Math.min(f, 1 - f) * p;
  };
  // a joint line of half-width w (m), its edge eased over about a texel
  // either side (a hard edge here drew jagged, crawling lines)
  const line = (d, w) => {
    const t = Math.min(1, Math.max(0, (d - w + 0.002) / 0.004));
    return 1 - t * t * (3 - 2 * t);
  };

  // ------------------------------------------------------------- patterns
  // Each takes the position in the tile in metres (u across, v up; both
  // 0..2) and gives a value round 0.5: brightness and height together.

  // Lap siding: boards 0.2 m tall, each lapping over the one below, with
  // staggered end joints and grain along the boards. Each board's lower edge
  // stands proud and catches the light; the top of the board below sits in
  // its shadow.
  function plank(u, v) {
    const b = Math.floor(v / 0.2);
    const fv = frac(v / 0.2);
    let s = 0.5 + (hash(b, 3, 11) - 0.5) * 0.16;
    s += (fbm((u / TILE) * 6, (v / TILE) * 90, 6, 90, 5, 3) - 0.5) * 0.22;
    s -= Math.max(0, (fv - 0.86) / 0.14) * 0.3;
    if (fv < 0.1) s += 0.05;
    for (let k = 0; k < 2; k++) {
      const ju = frac(hash(b, k, 13) * 0.5 + k * 0.5) * TILE;
      s -= 0.28 * line(seam(u - ju, TILE), 0.007);
    }
    return s;
  }

  // Board and batten: boards a third of a metre wide standing on end, a
  // narrow batten over each joint, grain running up.
  function batten(u, v) {
    const b = Math.floor(u / (TILE / 6));
    const fu = frac(u / (TILE / 6));
    let s = 0.5 + (hash(b, 7, 21) - 0.5) * 0.14;
    s += (fbm((u / TILE) * 90, (v / TILE) * 5, 90, 5, 9, 3) - 0.5) * 0.2;
    const edge = Math.min(fu, 1 - fu);
    if (edge < 0.085) s += 0.08;
    else if (edge < 0.11) s -= 0.26;
    return s;
  }

  // Bark and the checks of an old log, along its length (v).
  function log(u, v) {
    let s = 0.5 + (fbm((u / TILE) * 48, (v / TILE) * 4, 48, 4, 31, 4) - 0.5) * 0.45;
    s += (vnoise((u / TILE) * 160, (v / TILE) * 10, 160, 10, 33) - 0.5) * 0.12;
    // long checks
    const c = Math.floor((u / TILE) * 9);
    const cu = (c + 0.2 + hash(c, 1, 35) * 0.6) / 9;
    if (Math.abs(u / TILE - cu) < 0.0025 && hash(c, Math.floor((v / TILE) * 3), 37) > 0.35) s -= 0.3;
    // a knot now and then
    for (let k = 0; k < 3; k++) {
      const kx = hash(k, 2, 39) * TILE;
      const ky = hash(k, 3, 39) * TILE;
      const dx = Math.min(Math.abs(u - kx), TILE - Math.abs(u - kx)) / 0.03;
      const dy = Math.min(Math.abs(v - ky), TILE - Math.abs(v - ky)) / 0.05;
      const d = dx * dx + dy * dy;
      if (d < 1) s -= (1 - d) * 0.35;
    }
    return s;
  }

  // Cedar shingles: rows 0.25 m apart, shingles of mixed widths, each row's
  // butt throwing a shadow on the row below.
  const SHINGLE_ROWS = (() => {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const cuts = [];
      let x = hash(r, 0, 41) * 0.3;
      while (x < TILE + 0.3) {
        cuts.push(x % TILE);
        x += 0.13 + hash(r, cuts.length, 43) * 0.22;
      }
      rows.push(cuts.sort((a, b) => a - b));
    }
    return rows;
  })();
  function shingle(u, v) {
    const r = Math.floor(v / 0.25) % 8;
    const fv = frac(v / 0.25);
    const cuts = SHINGLE_ROWS[r];
    let i = 0;
    while (i < cuts.length && cuts[i] <= u) i++;
    const id = i % cuts.length;
    let s = 0.5 + (hash(r, id, 45) - 0.5) * 0.24;
    s += (fbm((u / TILE) * 40, (v / TILE) * 6, 40, 6, 47, 3) - 0.5) * 0.18;
    // the shadow under the butt of the row above (at the top of this one)
    if (fv > 0.82) s -= ((fv - 0.82) / 0.18) * 0.35;
    // and its butt edge catching the light at the bottom
    if (fv < 0.06) s += 0.06;
    let gap = 1;
    for (const c of cuts) gap = Math.min(gap, seam(u - c, TILE));
    s -= 0.3 * line(gap, 0.008);
    return s;
  }

  // Fieldstone laid in rough courses: stones of mixed size in mortar.
  const STONES = (() => {
    const nx = 6;
    const ny = 8;
    const pts = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        pts.push({ x: ((i + 0.5 + (j % 2) * 0.5 + (hash(i, j, 51) - 0.5) * 0.5) / nx) * TILE, y: ((j + 0.5 + (hash(i, j, 53) - 0.5) * 0.35) / ny) * TILE, k: hash(i, j, 55) });
      }
    }
    return pts;
  })();
  function stone(u, v) {
    let d1 = 1e9;
    let d2 = 1e9;
    let k = 0;
    // the two nearest stones lie in this course or the next ones, within two
    // columns (the stones keep near their own cell)
    const ci = Math.floor((u / TILE) * 6);
    const cj = Math.floor((v / TILE) * 8);
    for (let dj = -2; dj <= 2; dj++) {
      const j = (((cj + dj) % 8) + 8) % 8;
      for (let di = -2; di <= 2; di++) {
        const p = STONES[j * 6 + ((((ci + di) % 6) + 6) % 6)];
        let dx = Math.abs(u - p.x);
        let dy = Math.abs(v - p.y);
        if (dx > TILE / 2) dx = TILE - dx;
        if (dy > TILE / 2) dy = TILE - dy;
        // flatter stones: a course is wider than it is tall
        const d = Math.sqrt(dx * dx * 0.5625 + dy * dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          k = p.k;
        } else if (d < d2) d2 = d;
      }
    }
    const gap = d2 - d1;
    if (gap < 0.018) return 0.16 + (fbm((u / TILE) * 60, (v / TILE) * 60, 60, 60, 57, 2) - 0.5) * 0.1;
    let s = 0.46 + (k - 0.5) * 0.3 + Math.min(0.08, gap * 0.9);
    s += (fbm((u / TILE) * 24, (v / TILE) * 24, 24, 24, 59, 4) - 0.5) * 0.25;
    return s;
  }

  // Corrugated metal: 26 ridges to 2 m, sheets lapping every 10 ridges, rows
  // of screws, and streaks of rust running down.
  function metal(u, v) {
    const r = (u / TILE) * 26;
    let s = 0.5 + Math.sin(r * Math.PI * 2) * 0.22;
    if (seam(r, 10) < 0.05) s -= 0.18;
    const streak = fbm((u / TILE) * 30, (v / TILE) * 2, 30, 2, 61, 3);
    s -= Math.max(0, streak - 0.55) * 0.9;
    s += (vnoise((u / TILE) * 120, (v / TILE) * 120, 120, 120, 63) - 0.5) * 0.06;
    if (seam(v, 0.6) < 0.012 && seam(r - 0.25, 4) < 0.12) s -= 0.35;
    return s;
  }

  // Deck boards 0.14 m wide with gaps, staggered butt joints and nails.
  function deck(u, v) {
    const n = 14;
    const b = Math.floor((v / TILE) * n);
    const fv = frac((v / TILE) * n);
    let s = 0.5 + (hash(b, 5, 71) - 0.5) * 0.18;
    s += (fbm((u / TILE) * 5, (v / TILE) * 120, 5, 120, 73, 3) - 0.5) * 0.22;
    if (fv < 0.07) s -= 0.4;
    const ju = hash(b, 9, 75) * TILE;
    const dj = seam(u - ju, TILE);
    if (dj < 0.007) s -= 0.3 * line(dj, 0.005);
    else if (dj < 0.04 && Math.abs(fv - 0.32) < 0.07) s -= 0.25;
    else if (dj < 0.04 && Math.abs(fv - 0.72) < 0.07) s -= 0.25;
    return s;
  }

  // Concrete: speckle, blotches of damp and a crack or two.
  function concrete(u, v) {
    let s = 0.5 + (fbm((u / TILE) * 6, (v / TILE) * 6, 6, 6, 81, 4) - 0.5) * 0.3;
    s += (vnoise((u / TILE) * 180, (v / TILE) * 180, 180, 180, 83) - 0.5) * 0.18;
    const crack = Math.abs(fbm((u / TILE) * 3, (v / TILE) * 3, 3, 3, 85, 4) - 0.5);
    s -= 0.3 * line(crack, 0.006);
    return s;
  }

  const PATTERNS = [plank, batten, log, shingle, stone, metal, deck, concrete];
  const out = [];
  for (let t = 0; t < 2; t++) {
    const data = new Uint8Array(size * size * 4);
    for (let ch = 0; ch < 4; ch++) {
      const fn = PATTERNS[t * 4 + ch];
      for (let y = 0; y < size; y++) {
        const v = ((y + 0.5) / size) * TILE;
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) / size) * TILE;
          data[(y * size + x) * 4 + ch] = Math.round(clamp01(fn(u, v)) * 255);
        }
      }
    }
    out.push(data);
  }
  return out;
}


// Drawing the patterns takes about half a second, so a worker draws them
// while the world is generated (prepareFinishes, called as loading starts);
// the textures start a flat grey (no finish) and take the patterns when they
// arrive. Without workers (node, the tests' scripts) they are drawn at once.
let drawn = null;
let drawing = null;
const waiting = [];

export function prepareFinishes(size = SIZE) {
  if (drawn || drawing || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  try {
    const src = `onmessage = (e) => { const r = (${drawFinishes.toString()})(e.data); postMessage(r, [r[0].buffer, r[1].buffer]); };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    drawing = new Worker(url);
    drawing.onmessage = (e) => {
      drawn = e.data;
      drawing.terminate();
      URL.revokeObjectURL(url);
      for (const fill of waiting.splice(0)) fill(drawn);
    };
    drawing.onerror = () => {
      // draw them here instead
      drawing = null;
      drawn = drawFinishes(size);
      for (const fill of waiting.splice(0)) fill(drawn);
    };
    drawing.postMessage(size);
  } catch (e) {
    drawing = null;
  }
}

// The finishes as two textures, four patterns in each.
export function makeFinishTextures(size = SIZE) {
  const out = [];
  for (let t = 0; t < 2; t++) {
    const tex = new THREE.DataTexture(new Uint8Array(size * size * 4).fill(128), size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    out.push(tex);
  }
  const fill = (data) => {
    out.forEach((tex, i) => {
      tex.image.data.set(data[i]);
      tex.needsUpdate = true;
    });
  };
  if (drawn) fill(drawn);
  else if (drawing) waiting.push(fill);
  else {
    drawn = drawFinishes(size);
    fill(drawn);
  }
  return { a: out[0], b: out[1] };
}

// The props material with the finishes: plain where a part has none.
export function finishMaterial(tex, { roughness = 0.86, metalness = 0, key = 'finish' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  mat.userData.finish = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFinishA = { value: tex.a };
    shader.uniforms.uFinishB = { value: tex.b };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float surf;
        attribute vec2 surfUv;
        varying float vSurf;
        varying vec2 vSurfUv;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSurf = surf;
        vSurfUv = surfUv;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uFinishA;
        uniform sampler2D uFinishB;
        varying float vSurf;
        varying vec2 vSurfUv;
        float fHeight = 0.0;
        float fId = 0.0;
        vec3 fBump( vec3 surfPos, vec3 surfNorm, float h ) {
          vec3 sx = dFdx( surfPos );
          vec3 sy = dFdy( surfPos );
          vec3 r1 = cross( sy, surfNorm );
          vec3 r2 = cross( surfNorm, sx );
          float det = dot( sx, r1 );
          vec2 dh = vec2( dFdx( h ), dFdy( h ) );
          vec3 bumped = normalize( abs( det ) * surfNorm - sign( det ) * ( dh.x * r1 + dh.y * r2 ) + surfNorm * 1e-6 );
          return normalize( mix( surfNorm, bumped, clamp( dot( bumped, surfNorm ) * 2.0 - 0.3, 0.0, 1.0 ) ) );
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // both textures every time: no texture reads inside a branch
          vec2 st = vSurfUv * ${(1 / TILE).toFixed(3)};
          vec4 ta = texture2D( uFinishA, st );
          vec4 tb = texture2D( uFinishB, st );
          fId = floor( vSurf + 0.5 );
          if ( fId > 0.5 ) {
            float p = fId < 1.5 ? ta.r : fId < 2.5 ? ta.g : fId < 3.5 ? ta.b : fId < 4.5 ? ta.a : fId < 5.5 ? tb.r : fId < 6.5 ? tb.g : fId < 7.5 ? tb.b : tb.a;
            float dist = length( vViewPosition );
            diffuseColor.rgb *= max( 0.2, 1.0 + ( p - 0.5 ) * mix( 1.15, 0.55, smoothstep( 40.0, 140.0, dist ) ) );
            fHeight = p * 0.014 * ( 1.0 - smoothstep( 10.0, 35.0, dist ) );
          }
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // corrugated metal has a sheen the wood has not
        if ( fId > 5.5 && fId < 6.5 ) roughnessFactor *= 0.62;`
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = fBump( - vViewPosition, normal, fHeight );');
    fxPatch(shader, mat);
  };
  mat.customProgramCacheKey = () => key + '|fx:';
  return mat;
}

// Give a geometry drawn with a finish material the finish attributes it
// lacks (none), so it merges with the parts that have them.
export function ensureFinishAttributes(geo) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.surf) geo.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!geo.attributes.surfUv) geo.setAttribute('surfUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
