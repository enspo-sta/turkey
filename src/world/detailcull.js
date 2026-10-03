// Small parts far away: a mesh that would cover less than about a pixel of
// the screen is left out of the frame (and out of the shadow map), and comes
// back before it grows past one, so nothing that can be seen goes missing.
// The game keeps its own say over `visible`: the culling only clears and
// sets the mesh's main layer.
import * as THREE from 'three';

const _v = new THREE.Vector3();
// the culling hides below this many pixels across and shows again above the
// second (a margin, so a part at the edge does not flicker)
const HIDE_PX = 1;
const SHOW_PX = 1.25;

export class DetailCull {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.next = 0;
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
  }

  // Every plain mesh under `root` no bigger than maxR metres round its middle
  // (the big ones show from anywhere).
  add(root, maxR = 6) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.frustumCulled === false) return;
      const it = { o, geo: null, r: 0, c: null, hidden: false };
      if (!this.measure(it) || it.r > maxR) return;
      this.items.push(it);
    });
  }

  // the bounding sphere in world units (again whenever the geometry changes)
  measure(it) {
    const geo = it.o.geometry;
    it.geo = geo;
    if (!geo.attributes.position) {
      it.r = 0;
      return false;
    }
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    it.r = geo.boundingSphere.radius * it.o.matrixWorld.getMaxScaleOnAxis();
    it.c = geo.boundingSphere.center;
    return it.r > 0;
  }

  // A quarter of the parts a frame, or all of them after a jump of the camera.
  update() {
    const items = this.items;
    const n = items.length;
    if (!n) return;
    const g = this.game;
    const cam = g.camera;
    const H = g.renderer.domElement.height || 1;
    // pixels across for 1 m at 1 m away
    const k = H / Math.tan((cam.fov * Math.PI) / 360);
    const jumped = this.lastCam.distanceToSquared(cam.position) > 400;
    this.lastCam.copy(cam.position);
    const count = jumped ? n : Math.min(n, Math.max(48, Math.ceil(n / 4)));
    for (let c = 0; c < count; c++) {
      const it = items[this.next];
      this.next = (this.next + 1) % n;
      const o = it.o;
      if (o.geometry !== it.geo) this.measure(it);
      if (!(it.r > 0)) continue;
      _v.copy(it.c).applyMatrix4(o.matrixWorld);
      const px = (it.r * k) / Math.max(_v.distanceTo(cam.position), 0.001);
      const hide = px < (it.hidden ? SHOW_PX : HIDE_PX);
      if (hide === it.hidden) continue;
      it.hidden = hide;
      if (hide) o.layers.disable(0);
      else o.layers.enable(0);
    }
  }

  // Everything back (for drawing the whole world once, see Session.warmDraw);
  // the next updates hide what is small again.
  reset() {
    for (const it of this.items) {
      if (!it.hidden) continue;
      it.hidden = false;
      it.o.layers.enable(0);
    }
    this.lastCam.set(1e9, 0, 0);
  }
}
