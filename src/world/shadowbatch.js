// The sun's shadow map in fewer draw calls. Everything that casts a shadow
// is drawn into the shadow map with the same depth-only material, so meshes
// can go there together: a stand-in made of exactly their triangles, drawn
// in their place while the shadow map is drawn and never in the view. Each
// part keeps its own vertices and is placed by its own matrix, worked out
// as three.js works it out for a mesh of its own (the light's view times the
// part's place, in double precision, then rounded once), so the shadow map
// comes out the same to the bit. Two kinds:
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
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _mv = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
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
      // (only the sun's cascades, drawn with the plain depth material)
      const shadow = lights.length === 1 ? lights[0].shadow : null;
      if (!this.enabled || !shadowMap.enabled || !shadow || !shadow.getCamera || lights[0].isPointLight || shadowMap.type === THREE.VSMShadowMap || scene !== game.scene) return draw(lights, scene, camera);
      this.shadow = shadow;
      const used = this.before(camera);
      try {
        draw(lights, scene, camera);
      } finally {
        this.after(used);
      }
    };
  }

  // The depth material three.js draws shadows with, but each vertex placed
  // by its own part's matrix from the texture. Which cascade is being drawn
  // comes in the stand-in's own matrix, which three.js sends with every draw
  // (see load).
  depthMaterial() {
    const m = new THREE.MeshDepthMaterial();
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

  // Before a stand-in is drawn into a cascade: every part's matrix for every
  // cascade, once a frame (the cascades' cameras are set by then), and the
  // cascade's first row passed on in the stand-in's own matrix.
  load(object, shadowCamera) {
    const shadow = this.shadow;
    const cascades = shadow.getViewportCount();
    const n = this.parts.length;
    if (this.loaded !== this.stamp) {
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
    let c = 0;
    while (c < cascades && shadow.getCamera(c) !== shadowCamera) c++;
    object.modelViewMatrix.identity();
    object.modelViewMatrix.elements[12] = c * n;
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
    const B = { frame, parts: [], meshes: new Map(), dirty: true, position: null, part: null };
    let verts = 0;
    for (const o of objects) {
      const rec = { o, batch: B, index: this.parts.length, geo: o.geometry, version: -1, mat: o.material, key: castKey(o), rel: new THREE.Matrix4(), ranges: null, moved: false, casting: false, base: verts };
      this.relative(rec, rec.rel);
      rec.version = this.version(o.geometry);
      rec.ranges = ranges(o);
      verts += o.geometry.attributes.position.count;
      B.parts.push(rec);
      this.parts.push(rec);
      this.members.set(o, rec);
    }
    // every part's own vertices, as they are, and its number: when parts
    // come and go only the list of triangles is put together again
    const pos = new Float32Array(verts * 3);
    const part = new Float32Array(verts);
    const sphere = new THREE.Box3();
    for (const rec of B.parts) {
      const p = rec.o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = rec.base + i;
        pos[k * 3] = p.getX(i);
        pos[k * 3 + 1] = p.getY(i);
        pos[k * 3 + 2] = p.getZ(i);
        part[k] = rec.index;
        sphere.expandByPoint(_v.fromBufferAttribute(p, i).applyMatrix4(rec.rel));
      }
    }
    B.position = new THREE.BufferAttribute(pos, 3);
    B.part = new THREE.BufferAttribute(part, 1);
    // the bounds of all the parts where they stand, in the batch's frame
    // (for leaving a stand-in out of a cascade it does not reach)
    B.sphere = sphere.getBoundingSphere(new THREE.Sphere());
    let r2 = 0;
    for (const rec of B.parts) {
      const p = rec.o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) r2 = Math.max(r2, B.sphere.center.distanceToSquared(_v.fromBufferAttribute(p, i).applyMatrix4(rec.rel)));
    }
    B.sphere.radius = Math.sqrt(r2);
    this.batches.push(B);
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
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', B.position);
        g.setAttribute('partIndex', B.part);
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(all), 1));
        g.boundingSphere = B.sphere;
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
        const base = rec.base;
        for (let k = r.start; k < r.end; k++) idx[io++] = base + (src ? src[k] : k);
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
