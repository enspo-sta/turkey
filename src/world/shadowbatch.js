// The sun's shadow map in fewer draw calls. Everything that casts a shadow
// is drawn into the shadow map with the same depth-only material, so meshes
// can go there together: a stand-in made of exactly their triangles, drawn
// in their place while the shadow map is drawn and never in the view. Each
// part keeps its own vertices (each place once: see weld) and is placed by
// its own matrix, worked out as three.js works it out for a mesh of its own
// (the light's view times the part's place, in double precision, then
// rounded once), so the shadow map comes out the same to the bit. Two kinds:
// - in the world (addStatic): the parts of a site that never move, in cells
//   (each cell's stand-in is left out of a cascade it does not reach);
// - on a moving thing (addRigid): the parts of a car that keep still on it,
//   moved with it.
// Each frame, just before the shadow map is drawn, every part is checked:
// one that does not cast this frame (hidden, out of the view's layers, too
// small to see, see detailcull.js) is left out of its stand-in, whose
// triangles are put together again; one that has moved (on its own) leaves
// its stand-in for good and casts on its own again. So the shadow map gets
// the same triangles as before, in fewer calls.
// Each cascade of the map is also drawn with only the casters whose shadows
// can fall where the view reads that cascade (see Reach).
import * as THREE from 'three';
import { casterDepthMaterial } from './worldfx.js';

const _m = new THREE.Matrix4();
const _mv = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _view = new THREE.Frustum();
const _sphere = new THREE.Sphere();
// how much lower than the lowest ground, lake or sea bed anything the
// shadows fall on can be (a terrain chunk's skirt glimpsed through a crack)
const FLOOR_PAD = 10;
// how many numbers the cascades' receivers are worked out from (see
// Reach.update)
const KEY = 60;
// the side a material's shadow is drawn with, as three.js chooses it
const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };

// The side this material casts with, or null if its depth needs more than
// the plain depth material (a cut-out, a displacement, clipping).
function castSide(m) {
  if (!m || !m.visible || m.wireframe) return null;
  if (m.alphaToCoverage) return null;
  if (m.alphaTest > 0 && (m.map || m.alphaMap)) return null;
  if (m.displacementMap && m.displacementScale !== 0) return null;
  if (m.clippingPlanes && m.clippingPlanes.length) return null;
  return m.shadowSide !== null && m.shadowSide !== undefined ? m.shadowSide : SHADOW_SIDE[m.side];
}

// The index ranges a mesh draws (its groups, with their materials' side), or
// null if it cannot go into a stand-in.
function ranges(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return null;
  if (o.customDepthMaterial || o.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow) return null;
  const g = o.geometry;
  if (!g || !g.attributes.position || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return null;
  // (positions copied as they are: plain 32-bit floats only)
  const P = g.attributes.position;
  if (P.normalized || P.itemSize !== 3 || !((P.isInterleavedBufferAttribute ? P.data.array : P.array) instanceof Float32Array)) return null;
  if (g.isInstancedBufferGeometry) return null;
  const count = g.index ? g.index.count : g.attributes.position.count;
  const dr = g.drawRange;
  const lo = Math.max(0, dr.start);
  const hi = Math.min(count, dr.count === Infinity ? count : dr.start + dr.count);
  const out = [];
  if (Array.isArray(o.material)) {
    for (const gr of g.groups) {
      const m = o.material[gr.materialIndex];
      if (!m || !m.visible) continue;
      const side = castSide(m);
      if (side === null) return null;
      const s = Math.max(lo, gr.start);
      const e = Math.min(hi, gr.start + gr.count);
      if (e > s) out.push({ side, start: s, end: e });
    }
  } else {
    const side = castSide(o.material);
    if (side === null) return null;
    if (hi > lo) out.push({ side, start: lo, end: hi });
  }
  return out.length ? out : null;
}

// What of a part's materials decides how it casts, as one number: a change
// (hidden, another side, a cut-out added) takes the part out of its stand-in.
function castKey(o) {
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  let h = 0;
  for (const m of ms) {
    if (!m) continue;
    const sh = m.shadowSide === null || m.shadowSide === undefined ? 3 : m.shadowSide;
    const cut = m.alphaTest > 0 && (m.map || m.alphaMap) ? 1 : 0;
    const k = (m.visible ? 1 : 0) + 2 * m.side + 8 * sh + 32 * cut + 64 * (m.wireframe ? 1 : 0) + 128 * (m.alphaToCoverage ? 1 : 0) + 256 * (m.displacementMap && m.displacementScale !== 0 ? 1 : 0) + 512 * (m.clippingPlanes && m.clippingPlanes.length ? 1 : 0);
    h = (h * 1031 + k) | 0;
  }
  return h;
}

export class ShadowBatcher {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'shadowBatches';
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;
    game.scene.add(this.group);
    this.batches = [];
    // every part in a stand-in: object -> its record
    this.members = new Map();
    // every part ever put in a stand-in, by its number
    this.parts = [];
    // each part's matrix for each cascade, a row of four texels each
    this.matrices = null;
    this.stamp = 0;
    this.loaded = -1;
    this.shadow = null;
    this.material = this.depthMaterial();
    // (always on in the game; tools/same-frame.mjs turns it off to check the
    // picture is the same without it)
    this.enabled = true;
    // The shadow map's pass doing only what it needs, on in the game (off,
    // for comparing, as before): the parts' matrices sent before the map is
    // bound (see preload), and each part's places kept once (see weld; to
    // switch it, setWeld).
    this.preupload = true;
    this.weld = true;
    // The materials of what is drawn only into the shadow map (the plants'
    // shadow twins, see Scatter.setShadowTwins): hidden, so the view never
    // draws it, and shown only while the shadow map is drawn. The view still
    // goes past it first, and three.js sends a mesh's instances to the
    // graphics chip as it goes past, hidden material or not: so they are
    // sent before the map is bound, not at its draw in the map's pass.
    this.shadowOnly = [];
    // Each cascade drawn with only the casters whose shadows can reach what
    // the view reads it for (see Reach): on in the game (off, for comparing,
    // every caster in a cascade's box is drawn into it, as before). This is
    // the objects' half, tested by three.js through the cascades' frustums;
    // the plants' twins have their own (Scatter.setReceiverCull).
    this.receiverCull = true;
    this.reach = new Reach(lowestGround(game));
    this.hook();
    // three.js makes a new shadow map when a lost graphics context comes
    // back: hooked again then
    game.renderer.domElement.addEventListener('webglcontextrestored', () => this.hook());
  }

  hook() {
    const game = this.game;
    const shadowMap = game.renderer.shadowMap;
    const draw = shadowMap.render.bind(shadowMap);
    shadowMap.render = (lights, scene, camera) => {
      // (what is drawn only into the shadow map, shown for it alone)
      for (const m of this.shadowOnly) m.visible = true;
      try {
        // (only the sun's cascades, drawn with the plain depth material)
        const shadow = lights.length === 1 ? lights[0].shadow : null;
        if (!shadowMap.enabled || !shadow || !shadow.getCamera || lights[0].isPointLight || shadowMap.type === THREE.VSMShadowMap || scene !== game.scene) return draw(lights, scene, camera);
        // (whether three.js draws the map this frame)
        const drawn = (shadowMap.autoUpdate || shadowMap.needsUpdate) && (shadow.autoUpdate || shadow.needsUpdate);
        if (!this.enabled) return this.cascades(draw, drawn, lights, scene, camera);
        this.shadow = shadow;
        const used = this.before(camera);
        try {
          // (only with a stand-in in it)
          if (this.preupload && used.length && drawn) this.preload(lights[0], camera);
          this.cascades(draw, drawn, lights, scene, camera);
        } finally {
          this.after(used);
        }
      } finally {
        for (const m of this.shadowOnly) m.visible = false;
      }
    };
  }

  // The map drawn by three.js (draw), each cascade with only the casters
  // whose shadows can reach what the view reads it for, when that is on (see
  // Reach): three.js asks the shadow for each cascade's frustum just before
  // it goes through the scene for that cascade, and gets one that tests a
  // caster as before and then, if it would be drawn, whether its shadow can
  // reach. The plants' twins are split for the cascades before the frame
  // (prepare); again here only if the map is drawn for another view.
  cascades(draw, drawn, lights, scene, camera) {
    const sc = this.game.scatter;
    if (!drawn || !(this.receiverCull || (sc.receiverCull && sc.shadowTwins))) return draw(lights, scene, camera);
    const light = lights[0];
    const shadow = light.shadow;
    const reach = this.reach;
    const ok = reach.update(shadow, light, camera, this.game.renderer.capabilities.maxTextureSize);
    sc.reachTwins(ok ? reach : null);
    if (!ok) return draw(lights, scene, camera);
    reach.objects = this.receiverCull;
    reach.cut[0] = reach.cut[1] = 0;
    // (the shadow's own method put back after, as it was)
    const own = Object.prototype.hasOwnProperty.call(shadow, 'getFrustum');
    const base = shadow.getFrustum;
    shadow.getFrustum = (i) => reach.frustum(i, base.call(shadow, i));
    try {
      draw(lights, scene, camera);
    } finally {
      if (own) shadow.getFrustum = base;
      else delete shadow.getFrustum;
    }
  }

  // Before the frame is drawn (Game.draw): the cascades worked out for the
  // view, and the plants' twins split for them (see Scatter.reachTwins), so
  // that what changed in their buffers is sent as the view goes past them,
  // before the shadow map is bound (see shadowOnly). Only when three.js will
  // draw the map: otherwise the cascades it keeps are left as they are.
  prepare(camera) {
    const game = this.game;
    const sc = game.scatter;
    const sun = game.env.sun;
    const shadow = sun.shadow;
    const sm = game.renderer.shadowMap;
    if (!sc.receiverCull || !sc.shadowTwins || !sm.enabled || !sun.castShadow || !sun.visible) return;
    if (!(sm.autoUpdate || sm.needsUpdate) || !(shadow.autoUpdate || shadow.needsUpdate)) return;
    // (the view and the light as three.js will find them: worked out again
    // as it will, unless the reflection has just done it for the view to
    // reuse, see Game.render)
    if (game.scene.matrixWorldAutoUpdate) {
      camera.updateMatrixWorld();
      sun.updateMatrixWorld();
    }
    sc.reachTwins(this.reach.update(shadow, sun, camera, game.renderer.capabilities.maxTextureSize) ? this.reach : null);
  }

  // The depth material three.js draws shadows with, but each vertex placed
  // by its own part's matrix from the texture. Which cascade is being drawn
  // comes in the stand-in's own matrix, which three.js sends with every draw
  // (see load).
  depthMaterial() {
    const m = casterDepthMaterial(new THREE.MeshDepthMaterial());
    m.name = 'shadowBatchDepth';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPartMatrices = this.matrixUniform = { value: null };
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute float partIndex;\nuniform highp sampler2D uPartMatrices;\nvoid main() {')
        .replace(
          '#include <project_vertex>',
          `int partRow = int(modelViewMatrix[3][0] + 0.5) + int(partIndex + 0.5);
          mat4 partMatrix = mat4(
            texelFetch(uPartMatrices, ivec2(0, partRow), 0),
            texelFetch(uPartMatrices, ivec2(1, partRow), 0),
            texelFetch(uPartMatrices, ivec2(2, partRow), 0),
            texelFetch(uPartMatrices, ivec2(3, partRow), 0));
          vec4 mvPosition = vec4( transformed, 1.0 );
          mvPosition = partMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`
        );
      if (this.matrices) this.matrixUniform.value = this.matrices;
    };
    m.customProgramCacheKey = () => 'shadowBatch';
    return m;
  }

  // Before the shadow map is bound: the cascades worked out (three.js works
  // them out again just after, to the same values: they depend only on the
  // light, the view and the map's size), every part's matrix filled in, and
  // the texture sent to the graphics chip now. Sent at the first stand-in's
  // draw instead, inside the shadow map's pass, it may make a phone's
  // graphics chip end the pass to copy it in, the half-drawn map written out
  // to memory and read back in after.
  preload(light, camera) {
    const shadow = this.shadow;
    // (a map larger than the graphics chip allows is made smaller by
    // three.js first, the cascades with it: left to the draws then)
    const max = this.game.renderer.capabilities.maxTextureSize;
    const ext = shadow.getFrameExtents();
    if (shadow.mapSize.x * ext.x > max || shadow.mapSize.y * ext.y > max) return;
    shadow.updateMatrices(light, camera);
    this.fill();
    // (until the stand-ins' shader is built, in the first shadow map they
    // are drawn into, three.js sends the texture itself at that draw)
    if (this.matrixUniform) this.game.renderer.initTexture(this.matrices);
  }

  // Before a stand-in is drawn into a cascade: the cascade's first row
  // passed on in the stand-in's own matrix (the matrices filled in first,
  // once a frame, if preload has not).
  load(object, shadowCamera) {
    const shadow = this.shadow;
    const cascades = shadow.getViewportCount();
    if (this.loaded !== this.stamp) this.fill();
    let c = 0;
    while (c < cascades && shadow.getCamera(c) !== shadowCamera) c++;
    object.modelViewMatrix.identity();
    object.modelViewMatrix.elements[12] = c * this.parts.length;
  }

  // Every part's matrix for every cascade, once a frame (the cascades'
  // cameras are set by then), marked to be sent to the graphics chip.
  fill() {
    const shadow = this.shadow;
    const cascades = shadow.getViewportCount();
    const n = this.parts.length;
    this.loaded = this.stamp;
    const rows = Math.max(1, cascades * n);
    if (!this.matrices || this.matrices.image.height < rows) {
      if (this.matrices) this.matrices.dispose();
      const t = new THREE.DataTexture(new Float32Array(rows * 16), 4, rows, THREE.RGBAFormat, THREE.FloatType);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.name = 'shadowBatchMatrices';
      this.matrices = t;
      if (this.matrixUniform) this.matrixUniform.value = t;
    }
    const data = this.matrices.image.data;
    for (let c = 0; c < cascades; c++) {
      const inv = shadow.getCamera(c).matrixWorldInverse;
      for (let i = 0; i < n; i++) {
        const rec = this.parts[i];
        if (rec.moved || !rec.casting) continue;
        // as three.js does for a mesh of its own (WebGLShadowMap)
        _mv.multiplyMatrices(inv, rec.o.matrixWorld);
        data.set(_mv.elements, (c * n + i) * 16);
      }
    }
    this.matrices.needsUpdate = true;
  }

  // The still parts under `root`, in cells of `cell` metres.
  addStatic(root, cell = 100) {
    root.updateMatrixWorld(true);
    const cells = new Map();
    root.traverse((o) => {
      if (this.members.has(o) || !o.castShadow) return;
      const r = ranges(o);
      if (!r) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = `${Math.floor(_v.x / cell)},${Math.floor(_v.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(o);
    });
    for (const list of cells.values()) this.addBatch(null, list);
  }

  // The parts of a moving thing (a car) that keep still on it.
  addRigid(root) {
    root.updateMatrixWorld(true);
    const list = [];
    root.traverse((o) => {
      if (this.members.has(o) || !o.castShadow) return;
      if (ranges(o)) list.push(o);
    });
    if (list.length > 1) this.addBatch(root, list);
  }

  addBatch(frame, objects) {
    const B = { frame, parts: [], meshes: new Map(), dirty: true, welded: null, unwelded: null, rawCount: 0 };
    // each part's places, each kept once (base: where its first one goes),
    // and where its vertices as they are would go (rawBase), for the weld
    // switched off
    let verts = 0;
    const kept = [];
    for (const o of objects) {
      const w = weld(o.geometry.attributes.position);
      const rec = { o, batch: B, index: this.parts.length, geo: o.geometry, version: -1, mat: o.material, key: castKey(o), rel: new THREE.Matrix4(), ranges: null, moved: false, casting: false, base: verts, remap: w.remap, rawBase: B.rawCount };
      this.relative(rec, rec.rel);
      rec.version = this.version(o.geometry);
      rec.ranges = ranges(o);
      verts += w.count;
      B.rawCount += w.remap.length;
      kept.push(w.position);
      B.parts.push(rec);
      this.parts.push(rec);
      this.members.set(o, rec);
    }
    // every part's own places and its number: when parts come and go only
    // the list of triangles is put together again
    const pos = new Float32Array(verts * 3);
    const part = new Float32Array(verts);
    const sphere = new THREE.Box3();
    B.parts.forEach((rec, j) => {
      const p = kept[j];
      pos.set(p, rec.base * 3);
      part.fill(rec.index, rec.base, rec.base + p.length / 3);
      for (let i = 0; i < p.length; i += 3) sphere.expandByPoint(_v.fromArray(p, i).applyMatrix4(rec.rel));
    });
    B.welded = { position: new THREE.BufferAttribute(pos, 3), part: new THREE.BufferAttribute(part, 1) };
    // the bounds of all the parts where they stand, in the batch's frame
    // (for leaving a stand-in out of a cascade it does not reach; a place
    // met again changes neither the box nor the farthest)
    B.sphere = sphere.getBoundingSphere(new THREE.Sphere());
    let r2 = 0;
    B.parts.forEach((rec, j) => {
      const p = kept[j];
      for (let i = 0; i < p.length; i += 3) r2 = Math.max(r2, B.sphere.center.distanceToSquared(_v.fromArray(p, i).applyMatrix4(rec.rel)));
    });
    B.sphere.radius = Math.sqrt(r2);
    this.batches.push(B);
  }

  // The places the batch's stand-ins are drawn over: each kept once, or
  // with the weld off every part's vertices as they are, every corner of
  // every triangle its own (made from the kept ones when first asked for,
  // the same to the bit).
  vertices(B) {
    if (this.weld) return B.welded;
    if (!B.unwelded) {
      const n = B.rawCount;
      const pos = new Float32Array(n * 3);
      const part = new Float32Array(n);
      const src = B.welded.position.array;
      for (const rec of B.parts) {
        const map = rec.remap;
        for (let i = 0; i < map.length; i++) {
          const k = rec.rawBase + i;
          const s = (rec.base + map[i]) * 3;
          pos[k * 3] = src[s];
          pos[k * 3 + 1] = src[s + 1];
          pos[k * 3 + 2] = src[s + 2];
          part[k] = rec.index;
        }
      }
      B.unwelded = { position: new THREE.BufferAttribute(pos, 3), part: new THREE.BufferAttribute(part, 1) };
    }
    return B.unwelded;
  }

  // The weld switched (for comparing): each stand-in's geometry made again
  // over the other places, the old one given back to the graphics chip; the
  // lists of triangles are written again at the next shadow map.
  setWeld(on) {
    if (on === this.weld) return;
    this.weld = on;
    for (const B of this.batches) {
      const v = this.vertices(B);
      for (const mesh of B.meshes.values()) {
        const old = mesh.geometry;
        mesh.geometry = standIn(B, v, old.index.count);
        old.dispose();
      }
      // (the vertices as they are kept only while in use)
      if (on) B.unwelded = null;
      B.dirty = true;
    }
  }

  version(g) {
    let v = g.index ? g.index.version : 0;
    v += g.attributes.position.version * 1000;
    return v;
  }

  // the part's matrix in its batch's frame (the world, or the car)
  relative(rec, out) {
    const f = rec.batch.frame;
    if (!f) return out.copy(rec.o.matrixWorld);
    return out.multiplyMatrices(_inv.copy(f.matrixWorld).invert(), rec.o.matrixWorld);
  }

  // Whether the part casts this frame, as three.js would decide it.
  casts(o, layers) {
    if (!o.castShadow || !o.layers.test(layers)) return false;
    for (let q = o; q; q = q.parent) {
      if (!q.visible) return false;
      if (q === this.game.scene) return true;
    }
    return false;
  }

  // Before the shadow map: each batch's stand-ins brought up to date and
  // shown, its parts' own casting switched off. Returns what to switch back.
  before(camera) {
    this.stamp++;
    // (nothing made anew each frame: the list is kept, and a change in what
    // casts is found part by part)
    const off = this._off || (this._off = []);
    off.length = 0;
    const layers = camera.layers;
    for (const B of this.batches) {
      let changed = false;
      let n = 0;
      for (const rec of B.parts) {
        if (rec.moved) continue;
        const o = rec.o;
        // a part that has moved on its own, or been changed, leaves for good
        if (o.geometry !== rec.geo || o.material !== rec.mat || this.version(o.geometry) !== rec.version || castKey(o) !== rec.key) {
          this.release(rec);
          continue;
        }
        this.relative(rec, _m);
        if (!matricesEqual(_m, rec.rel, B.frame ? 1e-5 : 0)) {
          this.release(rec);
          continue;
        }
        rec.casting = this.casts(o, layers);
        if (rec.casting !== rec.wasCasting) {
          rec.wasCasting = rec.casting;
          changed = true;
        }
        if (rec.casting) n++;
      }
      if (B.dirty || changed) this.build(B);
      B.dirty = false;
      // a stand-in is only worth it for two or more parts
      const use = n >= 2;
      for (const mesh of B.meshes.values()) {
        mesh.visible = use && mesh.userData.count > 0;
        if (mesh.visible && B.frame) mesh.matrixWorld.copy(B.frame.matrixWorld);
      }
      if (!use) continue;
      for (const rec of B.parts) {
        if (rec.moved || !rec.casting) continue;
        rec.o.castShadow = false;
        off.push(rec.o);
      }
    }
    this.group.visible = true;
    return off;
  }

  after(off) {
    this.group.visible = false;
    for (const o of off) o.castShadow = true;
  }

  release(rec) {
    rec.moved = true;
    rec.batch.dirty = true;
    this.members.delete(rec.o);
    // (the part, its old geometry and material are not held on to: a bust
    // swapping its geometry lets the old one go)
    rec.o = rec.geo = rec.mat = null;
  }

  // The batch's stand-ins (one for each side its parts cast with): the
  // casting parts' triangles, over the batch's vertices. Each stand-in keeps
  // one list of triangles, room for all its parts, rewritten in place (a new
  // buffer each time would be left behind on the graphics chip).
  build(B) {
    const bySide = new Map();
    for (const rec of B.parts) {
      for (const r of rec.ranges) {
        if (!bySide.has(r.side)) bySide.set(r.side, { all: 0, list: [] });
        const e = bySide.get(r.side);
        e.all += r.end - r.start;
        if (!rec.moved && rec.casting) e.list.push([rec, r]);
      }
    }
    for (const [side, { all, list }] of bySide) {
      let mesh = B.meshes.get(side);
      if (!mesh) {
        // (the material is never drawn: the shadow map draws with its depth
        // material, which takes its side from this one, flipped as three.js
        // flips it)
        const g = standIn(B, this.vertices(B), all);
        mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: side === THREE.BackSide ? THREE.FrontSide : side === THREE.FrontSide ? THREE.BackSide : THREE.DoubleSide, colorWrite: false }));
        mesh.customDepthMaterial = this.material;
        mesh.onBeforeShadow = (renderer, object, camera, shadowCamera) => this.load(object, shadowCamera);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.name = 'shadowBatch';
        B.meshes.set(side, mesh);
        this.group.add(mesh);
      }
      const index = mesh.geometry.index;
      const idx = index.array;
      let io = 0;
      for (const [rec, r] of list) {
        const src = rec.o.geometry.index ? rec.o.geometry.index.array : null;
        if (this.weld) {
          // (each vertex by the place kept for it)
          const base = rec.base;
          const map = rec.remap;
          for (let k = r.start; k < r.end; k++) idx[io++] = base + map[src ? src[k] : k];
        } else {
          const base = rec.rawBase;
          for (let k = r.start; k < r.end; k++) idx[io++] = base + (src ? src[k] : k);
        }
      }
      mesh.geometry.setDrawRange(0, io);
      index.clearUpdateRanges();
      if (io > 0) {
        index.addUpdateRange(0, io);
        index.needsUpdate = true;
      }
      mesh.userData.count = io;
    }
  }
}

// What each cascade of the sun's shadow map is read for, and whether a
// caster's shadow can reach it. The view reads cascade i for what it shows
// between two of its depths (three.js's cascade data: the first cascade
// from the camera to the end of its fade into the next, the next from the
// start of that fade to the shadows' end), and within its four sides: that
// slice is the cascade's receivers. A caster inside a cascade's box whose
// shadow cannot fall on its slice draws texels into it that nothing reads.
// A shadow falls along the light, so the caster's sphere is swept along it
// down to the lowest anything it falls on can be (the lowest ground, lake or
// sea bed of the whole world, under the playable square and the far ring
// alike: see lowestGround), and the caster is left out of the cascade when
// both ends of the sweep lie wholly outside the same side of the slice.
// The sphere is grown first by what lets a receiver read a texel off its
// own place: the offset along its normal (the shadow's normalBias), the
// filter's reach (radius 1.6 texels, three.js reads it in the atlas's
// width) and the 2x2 texels each tap compares, with room to spare: four
// texels in all. So every texel left out is one nothing reads, and the
// picture is the same to the bit; the shadow map itself is not (texels no
// fragment reads stay clear). The sun is never lower than 4.6 degrees (see
// Environment.update): its sweeps are long then, and little is left out.
// Worked out once for each view and light (update), and read by the
// cascades' frustums (frustum) and the plants' twins (Scatter.reachTwins).
export class Reach {
  constructor(floor) {
    this.floor = floor;
    // what it was last worked out from (see update; next: this time's), and
    // how many times that has changed: the twins keep the count they were
    // split for
    this.key = new Float64Array(KEY);
    this.next = new Float64Array(KEY);
    this.version = 0;
    this.ok = false;
    this.camera = null;
    this.shadow = null;
    // for each cascade: the planes round its slice (x, y, z, w; the view's
    // four sides and one or two depths), how many, how much a caster's
    // sphere is grown, and the planes of the cascade's own box
    this.planes = [];
    this.count = [];
    this.pad = [];
    this.box = [];
    // the way the light goes
    this.dx = 0;
    this.dy = -1;
    this.dz = 0;
    // the frustums three.js is given for the cascades (see frustum), whether
    // they test objects (ShadowBatcher.receiverCull), and how many casters
    // each left out of its cascade in the last map (for tools)
    this.frustums = [];
    this.objects = true;
    this.cut = [0, 0];
  }

  // For the view `camera` and the sun `light` with its `shadow`, as three.js
  // will find them when it draws the map. Whether the cull can be used:
  // not when three.js would make the map smaller than its size (its
  // cascades would then differ from those worked out here).
  update(shadow, light, camera, maxTexture) {
    const k = this.next;
    const lw = light.matrixWorld.elements;
    k.set(camera.matrixWorld.elements, 0);
    k.set(camera.matrixWorldInverse.elements, 16);
    k.set(camera.projectionMatrix.elements, 32);
    k[48] = lw[12];
    k[49] = lw[13];
    k[50] = lw[14];
    k[51] = camera.near;
    k[52] = camera.far;
    k[53] = shadow.camera.near;
    k[54] = shadow.camera.far;
    k[55] = shadow.mapSize.x;
    k[56] = shadow.mapSize.y;
    k[57] = shadow.radius;
    k[58] = shadow.normalBias;
    k[59] = maxTexture;
    let same = this.version > 0 && this.camera === camera && this.shadow === shadow;
    for (let i = 0; same && i < KEY; i++) same = k[i] === this.key[i];
    if (same) return this.ok;
    this.key.set(k);
    this.version++;
    this.camera = camera;
    this.shadow = shadow;
    const ext = shadow.getFrameExtents();
    this.ok = !!shadow._cascadeData && shadow.mapSize.x * ext.x <= maxTexture && shadow.mapSize.y * ext.y <= maxTexture;
    if (!this.ok) return false;
    // (three.js works them out again just before it draws the map, to the
    // same values: they depend only on these)
    shadow.updateMatrices(light, camera);
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _view.setFromProjectionMatrix(_pm, camera.coordinateSystem, camera.reversedDepth);
    // a point's depth in the view (what the shaders compare with the
    // cascades' depths) is -z in the view's space: planes of equal depth,
    // their distances in metres
    const m = camera.matrixWorldInverse.elements;
    const len = Math.hypot(m[2], m[6], m[10]);
    const fx = m[2] / len;
    const fy = m[6] / len;
    const fz = m[10] / len;
    const fw = m[14] / len;
    _v.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    this.dx = _v.x;
    this.dy = _v.y;
    this.dz = _v.z;
    const cascades = shadow.getViewportCount();
    for (let c = 0; c < cascades; c++) {
      if (!this.planes[c]) {
        this.planes[c] = new Float64Array(24);
        this.box[c] = new Float64Array(24);
        this.frustums[c] = new CascadeFrustum(this, c);
      }
      const P = this.planes[c];
      let p = 0;
      for (let j = 0; j < 4; j++, p += 4) setPlane(P, p, _view.planes[j]);
      const cd = shadow._cascadeData[c];
      // read up to the end of the cascade (its fade included)
      P.set([fx, fy, fz, fw + cd.y / len], p);
      p += 4;
      // and from its start (the first from anywhere in front of the camera)
      if (cd.x > -1e9) {
        P.set([-fx, -fy, -fz, -fw - cd.x / len], p);
        p += 4;
      }
      this.count[c] = p / 4;
      const sc = shadow.getCamera(c);
      this.pad[c] = Math.abs(shadow.normalBias) + (4 * (sc.right - sc.left)) / shadow.mapSize.x + 0.01;
      const B = shadow.getFrustum(c).planes;
      for (let j = 0; j < 6; j++) setPlane(this.box[c], j * 4, B[j]);
    }
    return true;
  }

  // Whether a caster in the sphere (x, y, z, r) can cast a shadow that
  // cascade c is read for.
  reaches(c, x, y, z, r) {
    const rr = r + this.pad[c];
    // (a light along the horizon or from below: kept)
    const down = -this.dy;
    if (!(down > 1e-3)) return true;
    const L = Math.max(0, (y + rr - this.floor) / down);
    const ex = x + this.dx * L;
    const ey = y + this.dy * L;
    const ez = z + this.dz * L;
    const P = this.planes[c];
    for (let j = 0, n = this.count[c] * 4; j < n; j += 4) {
      if (P[j] * x + P[j + 1] * y + P[j + 2] * z + P[j + 3] < -rr && P[j] * ex + P[j + 1] * ey + P[j + 2] * ez + P[j + 3] < -rr) return false;
    }
    return true;
  }

  // Whether the sphere meets cascade c's box (as three.js tests a sphere).
  inBox(c, x, y, z, r) {
    const B = this.box[c];
    for (let j = 0; j < 24; j += 4) if (B[j] * x + B[j + 1] * y + B[j + 2] * z + B[j + 3] < -r) return false;
    return true;
  }

  // The frustum three.js is given for cascade c, over the cascade's own
  // (base, whose planes it shares).
  frustum(c, base) {
    const f = this.frustums[c];
    f.base = base;
    f.planes = base.planes;
    return f;
  }
}

function setPlane(out, o, plane) {
  out[o] = plane.normal.x;
  out[o + 1] = plane.normal.y;
  out[o + 2] = plane.normal.z;
  out[o + 3] = plane.constant;
}

// A cascade's frustum as three.js tests the casters against it: its box as
// before (its own planes, and every other test of three.js's), and then,
// for a caster that meets it, whether its shadow can reach the cascade's
// receivers, by the same sphere three.js has just tested (an object's own,
// as a herd's round this frame's animals, or else its geometry's, placed in
// the world). Each cascade's has its number, for the plants' twins.
class CascadeFrustum extends THREE.Frustum {
  constructor(reach, cascade) {
    super();
    this.reach = reach;
    this.cascade = cascade;
    this.base = null;
  }

  intersectsObject(o) {
    if (!this.base.intersectsObject(o)) return false;
    const reach = this.reach;
    if (!reach.objects) return true;
    _sphere.copy(o.boundingSphere !== undefined ? o.boundingSphere : o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    const c = _sphere.center;
    if (reach.reaches(this.cascade, c.x, c.y, c.z, _sphere.radius)) return true;
    reach.cut[this.cascade]++;
    return false;
  }
}

// The lowest anything the sun's shadows fall on can be: the lowest ground,
// lake or sea bed of the playable square and of the far ring round it, and
// a little lower still (see FLOOR_PAD).
function lowestGround(game) {
  let y = Infinity;
  for (const H of [game.world.h, game.farTerrain?.userData.grid?.H]) {
    if (!H) continue;
    for (let i = 0; i < H.length; i++) if (H[i] < y) y = H[i];
  }
  return Number.isFinite(y) ? y - FLOOR_PAD : -1e4;
}

// A stand-in's geometry: the batch's places, and a list of triangles with
// room for all its parts (rewritten in place, see build).
function standIn(B, v, count) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', v.position);
  g.setAttribute('partIndex', v.part);
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(count), 1));
  g.boundingSphere = B.sphere;
  return g;
}

// A part's places, each kept once: the same three 32-bit floats, to the bit
// (welded within a tolerance, a corner would move by a hair, and the shadow
// with it). The stand-ins' depth drawing reads only a vertex's place and its
// part's number, the same for the whole part, so vertices at one place are
// one and the same to it. Built models come with three vertices to every
// triangle (builder.js), each place repeated in every triangle that meets
// there: a part keeps a third to a fifth of them, and the shadow map shades
// each place once, not once for each of its triangles (the plants' shadow
// twins are welded the same way: see scatter.js). Returns the places kept,
// in the order first met, and for each vertex the number of the place kept
// for it.
export function weld(p) {
  const n = p.count;
  const all = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    all[i * 3] = p.getX(i);
    all[i * 3 + 1] = p.getY(i);
    all[i * 3 + 2] = p.getZ(i);
  }
  const bits = new Uint32Array(all.buffer);
  // the places kept, found again by a table of at least twice their number
  let size = 16;
  while (size < n * 2) size *= 2;
  const mask = size - 1;
  const slot = new Int32Array(size).fill(-1);
  const kept = new Uint32Array(n * 3);
  const remap = n <= 65536 ? new Uint16Array(n) : new Uint32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = bits[i * 3];
    const y = bits[i * 3 + 1];
    const z = bits[i * 3 + 2];
    let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
    h = (h ^ (h >>> 16)) & mask;
    for (;;) {
      const s = slot[h];
      if (s < 0) {
        slot[h] = count;
        kept[count * 3] = x;
        kept[count * 3 + 1] = y;
        kept[count * 3 + 2] = z;
        remap[i] = count++;
        break;
      }
      if (kept[s * 3] === x && kept[s * 3 + 1] === y && kept[s * 3 + 2] === z) {
        remap[i] = s;
        break;
      }
      h = (h + 1) & mask;
    }
  }
  return { position: new Float32Array(kept.buffer, 0, count * 3), remap, count };
}

// (on a car a part's matrix is worked out again from the car's every frame,
// which rounds a little differently as the car moves: a part that keeps
// within a hair of its place stays, for the stand-in's bounds; it is drawn
// by its own matrix all the same)
function matricesEqual(a, b, eps) {
  const x = a.elements;
  const y = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > eps * (i >= 12 ? 100 : 1)) return false;
  return true;
}
