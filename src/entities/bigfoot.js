// Bigfoot. Very rarely, at dawn or dusk, something big and hairy strolls
// along the edge of the forest a long way off, and is gone again. Get a
// picture: the radio show pays well, and the magazine even better.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { clamp, wrapAngle } from '../util/math.js';
import { treesInTheWay, plantsInTheWay } from '../gameplay/camera.js';

const FUR = 0x3a2a1e;
const FUR_DARK = 0x2a1d14;
const SKIN = 0x5a4434;

function limb(len, r0, r1, color) {
  const b = new ModelBuilder();
  b.cyl(r1, r0, len, 7, { pos: [0, -len / 2, 0], color, jitter: 0.12 });
  b.sphere(r1 * 1.1, 6, 5, { pos: [0, -len, 0.02], color, jitter: 0.12 });
  return b.build();
}

export class Bigfoot {
  constructor(game) {
    this.game = game;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const g = new THREE.Group();
    const body = new ModelBuilder();
    // a barrel chest, broad shoulders, a pointed head sunk on them
    body.sphere(0.5, 10, 8, { pos: [0, 1.75, 0], scale: [1.15, 1.35, 0.85], color: FUR, jitter: 0.12 });
    body.sphere(0.42, 9, 7, { pos: [0, 1.25, 0], scale: [1, 1.1, 0.85], color: FUR_DARK, jitter: 0.12 });
    body.sphere(0.27, 8, 7, { pos: [0, 2.42, 0.06], scale: [1, 1.25, 1], color: FUR, jitter: 0.12 });
    body.box(0.26, 0.16, 0.08, { pos: [0, 2.36, 0.27], color: SKIN });
    body.box(0.22, 0.05, 0.05, { pos: [0, 2.46, 0.3], color: FUR_DARK });
    g.add(new THREE.Mesh(body.build(), mat));
    const mk = (geo, x, y, z) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    // long arms that swing to the knees, short thick legs
    this.armL = mk(limb(1.15, 0.13, 0.1, FUR), -0.58, 2.0, 0);
    this.armR = mk(limb(1.15, 0.13, 0.1, FUR), 0.58, 2.0, 0);
    this.legL = mk(limb(1.05, 0.17, 0.13, FUR_DARK), -0.24, 1.05, 0);
    this.legR = mk(limb(1.05, 0.17, 0.13, FUR_DARK), 0.24, 1.05, 0);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.visible = false;
    game.scene.add(g);
    this.group = g;
    this.active = false;
    this.cooldown = 240;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.t = 0;
    this.phase = 0;
    this.seen = false;
  }

  // Dawn or dusk, on foot, with forest about.
  eligible() {
    const g = this.game;
    const t = g.env.time;
    const twilight = (t > 4.5 && t < 7.5) || (t > 19.5 && t < 22.8);
    return twilight && g.started && !g.menuOpen && g.player.mode === 'foot' && !g.player.boat;
  }

  spawn() {
    const g = this.game;
    const W = g.world;
    const P = g.player;
    for (let k = 0; k < 30; k++) {
      // to one side of where you look, far enough to be a blur
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = P.yaw + Math.PI + side * (0.35 + Math.random() * 0.5);
      const d = 85 + Math.random() * 50;
      const x = P.pos.x - Math.sin(a + Math.PI) * d;
      const z = P.pos.z - Math.cos(a + Math.PI) * d;
      if (!W.inBounds(x, z, 40) || W.waterAt(x, z) || W.slopeAt(x, z) > 0.5) continue;
      if (W.forest && W.forest[W.cellIndex(x, z)] < 60) continue;
      // somewhere you could actually see it from: no hill in between
      const eyeY = P.pos.y + 1.7;
      const y = W.heightAt(x, z) + 1.4;
      let hidden = false;
      for (let i = 1; i < 12 && !hidden; i++) {
        const t = i / 12;
        hidden = W.heightAt(P.pos.x + (x - P.pos.x) * t, P.pos.z + (z - P.pos.z) * t) > eyeY + (y - eyeY) * t + 0.3;
      }
      // and no tree or bush in front of it either
      if (hidden || treesInTheWay(g, P.pos.x, eyeY, P.pos.z, x, y, z) || plantsInTheWay(g, P.pos.x, eyeY, P.pos.z, x, y, z)) continue;
      this.pos.set(x, W.heightAt(x, z), z);
      // stroll across your view, a little away from you
      const away = Math.atan2(x - P.pos.x, z - P.pos.z);
      this.yaw = away + side * 1.25;
      this.t = 0;
      this.active = true;
      this.seen = false;
      this.group.visible = true;
      return true;
    }
    return false;
  }

  update(dt) {
    const g = this.game;
    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && this.eligible() && Math.random() < dt / 200) {
        // a long rest after a sighting; nowhere to walk this time: try again soon
        this.cooldown = this.spawn() ? 600 + Math.random() * 600 : 20;
      }
      return;
    }
    const W = g.world;
    const P = g.player.pos;
    this.t += dt;
    const d = Math.hypot(this.pos.x - P.x, this.pos.z - P.z);
    // too close for comfort: it lopes off
    const fleeing = d < 45;
    if (fleeing) this.yaw += wrapAngle(Math.atan2(this.pos.x - P.x, this.pos.z - P.z) - this.yaw) * Math.min(1, dt * 3);
    const speed = fleeing ? 6 : 1.6;
    const nx = this.pos.x + Math.sin(this.yaw) * speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * speed * dt;
    if (!W.waterAt(nx, nz) && W.inBounds(nx, nz, 20)) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else this.yaw += Math.PI * 0.5;
    this.pos.y = W.heightAt(this.pos.x, this.pos.z);
    this.phase += dt * speed * 2.2;
    const sw = Math.sin(this.phase);
    this.legL.rotation.x = sw * 0.55;
    this.legR.rotation.x = -sw * 0.55;
    this.armL.rotation.x = -sw * 0.7;
    this.armR.rotation.x = sw * 0.7;
    this.group.position.set(this.pos.x, this.pos.y + Math.abs(Math.cos(this.phase)) * 0.06, this.pos.z);
    this.group.rotation.y = this.yaw;
    // a minute at most, and gone once it is far enough into the trees
    if (this.t > 60 || d > 260) {
      this.active = false;
      this.group.visible = false;
    }
  }
}
