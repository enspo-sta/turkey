// Shooting stars and fireballs. A meteor is a grain of comet dust hitting
// the air at tens of kilometres a second and burning up some 100 km above
// the ground; a few times a week here a bigger lump comes in as a fireball,
// bright enough to light the land, and drops a meteorite in the woods: cold,
// black-crusted, heavy for its size. The sonic boom arrives long after the
// light. Find the stone (the map shows where to look) and the Trading Post
// buys it.
import * as THREE from 'three';
import { ModelBuilder } from '../util/builder.js';
import { canvasTexture } from '../entities/carparts.js';
import { smoothstep } from '../util/math.js';

// What can come down, how often, and what the Trading Post pays a kilo.
export const METEORITES = {
  iron: { name: 'Iron meteorite', p: 0.55, perKg: 220, crust: 0x2a2622, inside: 0xb8b4ac, note: 'Nickel and iron from the core of a shattered asteroid. Cut and etched, it shows criss-cross crystals that only grow over millions of years of slow cooling in space.' },
  stone: { name: 'Stony meteorite', p: 0.35, perKg: 160, crust: 0x1f1c1a, inside: 0x8a8378, note: 'A chondrite: little stone beads older than the Earth, 4.6 billion years old, from the dust the planets were made of.' },
  pallasite: { name: 'Pallasite', p: 0.1, perKg: 900, crust: 0x2b2420, inside: 0xc8a640, note: 'Olive-green crystals of olivine set in iron, from where an asteroid’s metal core met its rocky mantle. One of the rarest stones there is.' },
};

const vert = /* glsl */ `
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const frag = /* glsl */ `
uniform vec3 uHead;
uniform vec3 uTail;
uniform float uAlpha;
varying float vT;
void main() {
  // bright at the head, fading back along the train
  float a = pow(vT, 2.2) * uAlpha;
  gl_FragColor = vec4(mix(uTail, uHead, vT), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// One streak: a thin ribbon from tail to head on the sky, turned to face the
// eye.
class Streak {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    this.uniforms = { uHead: { value: new THREE.Color() }, uTail: { value: new THREE.Color() }, uAlpha: { value: 0 } };
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -8;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.active = false;
  }

  start(from, to, dur, { width = 1, head = 0xffffff, tail = 0x9ad0ff, bright = 1 } = {}) {
    this.from = from.clone().normalize();
    this.to = to.clone().normalize();
    this.dur = dur;
    this.t = 0;
    this.width = width;
    this.bright = bright;
    this.uniforms.uHead.value.set(head);
    this.uniforms.uTail.value.set(tail);
    this.active = true;
    this.mesh.visible = true;
  }

  update(dt, eye) {
    if (!this.active) return;
    this.t += dt;
    const u = this.t / this.dur;
    if (u >= 1) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    const R = 2600;
    // the head runs along the great circle, the train grows behind it
    const head = _a.copy(this.from).lerp(this.to, Math.min(1, u * 1.05)).normalize();
    const tail = _b.copy(this.from).lerp(this.to, Math.max(0, u * 1.05 - 0.35 - u * 0.2)).normalize();
    const side = _c.crossVectors(head.clone().sub(tail), head).normalize().multiplyScalar(this.width * 2.2);
    const p = this.mesh.geometry.attributes.position;
    const tw = side.clone().multiplyScalar(0.35);
    p.setXYZ(0, tail.x * R - tw.x, tail.y * R - tw.y, tail.z * R - tw.z);
    p.setXYZ(1, tail.x * R + tw.x, tail.y * R + tw.y, tail.z * R + tw.z);
    p.setXYZ(2, head.x * R - side.x, head.y * R - side.y, head.z * R - side.z);
    p.setXYZ(3, head.x * R + side.x, head.y * R + side.y, head.z * R + side.z);
    p.needsUpdate = true;
    this.mesh.position.copy(eye);
    // flares up, then fades as it burns out
    this.uniforms.uAlpha.value = this.bright * smoothstep(0, 0.12, u) * (1 - smoothstep(0.75, 1, u));
  }
}

function rockTexture(kind) {
  const K = METEORITES[kind];
  return canvasTexture(256, 128, (g, W, H) => {
    g.fillStyle = '#' + K.crust.toString(16).padStart(6, '0');
    g.fillRect(0, 0, W, H);
    // the fusion crust: black glaze with flow lines and thumbprint dimples
    for (let i = 0; i < 140; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(Math.random() * W, Math.random() * H, 4 + Math.random() * 12, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // flecks of metal showing through
    for (let i = 0; i < 90; i++) {
      g.fillStyle = kind === 'pallasite' && Math.random() < 0.5 ? 'rgba(160,190,60,0.8)' : 'rgba(200,200,190,0.55)';
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
}

export class Meteors {
  constructor(game) {
    this.game = game;
    this.streaks = [new Streak(game.scene), new Streak(game.scene), new Streak(game.scene)];
    this.nextT = 8;
    this.flash = 0;
    this.boomAt = 0;
    this.group = new THREE.Group();
    this.group.name = 'meteorite';
    game.scene.add(this.group);
    this.rock = null;
    this.glintT = 0;
  }

  // The fireball's stone, where it lies (from the save), or none.
  restore(fall) {
    // free the last stone's scar, rock and texture
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    });
    this.group.clear();
    this.rock = null;
    if (!fall || fall.found) return;
    const g = this.game;
    const y = g.world.heightAt(fall.x, fall.z);
    const b = new ModelBuilder();
    // a dark scar of ploughed-up ground and the stone at its end
    b.cyl(1.1, 1.4, 0.06, 18, { pos: [0, 0.02, 0], scale: [1, 1, 0.7], color: 0x4a3a28, jitter: 0.15 });
    b.cyl(0.55, 0.7, 0.08, 14, { pos: [0, 0.03, 0.2], scale: [1, 1, 0.8], color: 0x6a5238, jitter: 0.1 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.dodeca(0.06 + Math.random() * 0.05, { pos: [Math.cos(a) * 1.3, 0.04, Math.sin(a) * 0.95], color: 0x4a3a28, jitter: 0.2 });
    }
    const scar = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    scar.receiveShadow = true;
    const stone = new THREE.IcosahedronGeometry(0.1 * Math.cbrt(fall.kg), 2);
    const p = stone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.18 * Math.sin(p.getX(i) * 40 + p.getZ(i) * 25) * Math.cos(p.getY(i) * 31);
      p.setXYZ(i, p.getX(i) * k * 1.25, p.getY(i) * k * 0.8, p.getZ(i) * k);
    }
    stone.computeVertexNormals();
    const rock = new THREE.Mesh(stone, new THREE.MeshStandardMaterial({ map: rockTexture(fall.kind), roughness: 0.5, metalness: fall.kind === 'stone' ? 0.15 : 0.55 }));
    rock.position.set(0, 0.1, 0.25);
    rock.rotation.set(0.3, fall.x, 0.2);
    rock.castShadow = true;
    this.group.add(scar, rock);
    this.group.position.set(fall.x, y, fall.z);
    this.group.rotation.y = fall.yaw || 0;
    this.rock = rock;
  }

  // A meteor shooting across a random patch of sky.
  shoot(bright = 1) {
    const s = this.streaks.find((k) => !k.active) || this.streaks[0];
    const az = Math.random() * Math.PI * 2;
    const el = 0.35 + Math.random() * 0.9;
    const from = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    // most fall away from the radiant, mostly downward
    const az2 = az + (Math.random() - 0.5) * 1.2;
    const len = 0.1 + Math.random() * 0.25;
    const el2 = Math.max(0.12, el - len * (0.6 + Math.random() * 0.6));
    const to = new THREE.Vector3(Math.sin(az2) * Math.cos(el2), Math.sin(el2), -Math.cos(az2) * Math.cos(el2));
    s.start(from, to, 0.35 + Math.random() * 0.7, { width: 0.6 + bright * 0.6, bright: 0.7 + 0.5 * Math.random() });
  }

  // A fireball, coming down toward a spot on the map: its light ends low
  // over the horizon in that direction.
  fireball(target) {
    const g = this.game;
    const eye = g.camera.position;
    const dx = target.x - eye.x;
    const dz = target.z - eye.z;
    const az = Math.atan2(dx, -dz);
    const from = new THREE.Vector3(Math.sin(az + 0.6) * Math.cos(0.75), Math.sin(0.75), -Math.cos(az + 0.6) * Math.cos(0.75));
    const to = new THREE.Vector3(Math.sin(az) * Math.cos(0.1), Math.sin(0.1), -Math.cos(az) * Math.cos(0.1));
    const s = this.streaks[0];
    s.start(from, to, 2.6, { width: 4, head: 0xd8ffd0, tail: 0xffa040, bright: 1.6 });
    this.flash = 1;
    // the boom comes much later than the light
    this.boomAt = g.time + 5 + Math.hypot(dx, dz) / 343;
  }

  // Pick a landing spot for a fireball's stone: dry land, not too steep,
  // a few hundred metres off, inside the map.
  pickFall(eye, rand = Math.random) {
    const W = this.game.world;
    for (let k = 0; k < 60; k++) {
      const a = rand() * Math.PI * 2;
      const r = 250 + rand() * 650;
      const x = eye.x + Math.sin(a) * r;
      const z = eye.z + Math.cos(a) * r;
      if (!W.inBounds(x, z, 80)) continue;
      const w = W.waterAt(x, z);
      if (w && w.depth > -0.3) continue;
      if (W.slopeAt(x, z) > 0.35) continue;
      if (W.roadD[W.cellIndex(x, z)] < 12) continue;
      // not into a tree, a rock or anything built
      if (this.game.colliders.circlesNear(x, z, 3.5).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2.2)) continue;
      return { x, z };
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    const env = g.env;
    const eye = g.camera.position;
    const s = g.state;
    for (const k of this.streaks) k.update(dt, eye);
    // the land lit up by a fireball, briefly
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 0.45);
    // (the environment adds it to the sky light when it sets that)
    env.fireFlash = this.flash;
    if (this.boomAt && g.time >= this.boomAt) {
      this.boomAt = 0;
      g.audio?.boom?.();
    }
    if (!g.started) return;
    // ordinary shooting stars: one every half a minute or so on a dark
    // night, fewer under cloud
    const dark = env.night * (1 - smoothstep(0.5, 0.9, env.weather.cloud));
    if (dark > 0.6) {
      this.nextT -= dt;
      if (this.nextT <= 0) {
        this.nextT = 12 + Math.random() * 40;
        this.shoot(Math.random() < 0.15 ? 1.6 : 1);
        // a fireball some nights, at most one stone waiting at a time
        const n = env.spaceWeather.nightOf(env);
        const fall = s.meteorite;
        const due = n >= 2 && (!fall || fall.found) && !s.flags['fireball' + n] && Math.sin(n * 91.7) > -0.2 && Math.random() < 0.18;
        if (due && g.player.mode !== 'glide') {
          const spot = this.pickFall(eye);
          if (spot) this.dropStone(spot, n);
        }
      }
    }
    // a glint off the stone's metal when you are close and looking
    if (this.rock && g.player.mode === 'foot') {
      const d = Math.hypot(this.group.position.x - g.player.pos.x, this.group.position.z - g.player.pos.z);
      this.glintT -= dt;
      if (d < 30 && this.glintT <= 0) {
        this.glintT = 2.5 + Math.random() * 2;
        g.effects?.sparkle?.(this.group.position.x, this.group.position.y + 0.2, this.group.position.z, 2);
      }
    }
  }

  dropStone(spot, night) {
    const g = this.game;
    const s = g.state;
    const r = Math.random();
    const kind = r < METEORITES.pallasite.p ? 'pallasite' : r < METEORITES.pallasite.p + METEORITES.stone.p ? 'stone' : 'iron';
    const kg = +(0.4 + Math.random() * Math.random() * 3.6).toFixed(2);
    // the map shows a search circle round it, not the spot itself
    const off = Math.random() * 70;
    const oa = Math.random() * Math.PI * 2;
    s.meteorite = { x: spot.x, z: spot.z, kind, kg, yaw: Math.random() * 6.28, cx: spot.x + Math.sin(oa) * off, cz: spot.z + Math.cos(oa) * off, r: 110, night, found: false };
    s.flags['fireball' + night] = true;
    this.fireball(spot);
    this.restore(s.meteorite);
    const eye = g.camera.position;
    const az = (Math.atan2(spot.x - eye.x, -(spot.z - eye.z)) * 180) / Math.PI;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const dir = dirs[Math.round(((az + 360) % 360) / 45) % 8];
    g.announcer?.say('fireball', { sub: `IT CAME DOWN TO THE ${dir.toUpperCase()}`, kind: 'legend' });
    g.hud?.toast(`A fireball! Something came down to the ${dir}, about ${Math.round(Math.hypot(spot.x - eye.x, spot.z - eye.z) / 100) * 100} m away. The map shows where to look`, 'good', 8);
    g.save?.();
  }

  // Close enough to pick it up?
  near(P) {
    const f = this.game.state.meteorite;
    if (!f || f.found || !this.rock) return false;
    return Math.hypot(f.x - P.x, f.z - P.z) < 2.6;
  }

  pickUp() {
    const g = this.game;
    const s = g.state;
    const f = s.meteorite;
    if (!f || f.found) return;
    f.found = true;
    const K = METEORITES[f.kind];
    const pay = Math.round(K.perKg * f.kg);
    s.addMoney(pay);
    (s.sky.meteorites || (s.sky.meteorites = [])).push({ kind: f.kind, kg: f.kg, day: g.env.day, pay });
    this.restore(null);
    g.audio?.cash();
    g.announcer?.say('meteorite', { sub: K.name.toUpperCase(), kind: 'legend' });
    g.hud?.toast(`${K.name}, ${f.kg} kg: heavy for its size, with a black fusion crust. The Trading Post wires you ${'$'}${pay}. ${K.note}`, 'money', 10);
    g.onEvent?.({ type: 'meteorite' });
    g.save?.();
  }
}


