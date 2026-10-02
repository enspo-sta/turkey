// Headless driving test for the cars: builds the world in Node, stubs the
// canvas the models paint their textures on, and drives each car with a
// simple path-following driver. Prints acceleration, top speed on a road,
// braking distance and off-road crawl speed.
// Usage: node tools/cartest.mjs
import * as THREE from 'three';
import { generateWorld } from '../src/world/worldgen.js';
import { Colliders } from '../src/world/colliders.js';

// a canvas that accepts every drawing call and does nothing
const ctx2d = new Proxy(
  {},
  {
    get: (t, k) => {
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => ((t[k] = v), true),
  }
);
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

const { HotRod } = await import('../src/entities/hotrod.js');
const { RaceCar } = await import('../src/entities/racecar.js');
const W = await generateWorld();
const game = { world: W, colliders: new Colliders(), time: 0, env: { night: 0, weather: { rain: 0 } }, hud: { toast() {} }, audio: null, effects: null, boat: null };
const state = { gear: { engine: 2, tires: 1 } };

function input(ctrl) {
  return {
    held: (n) => (n === 'gas' ? ctrl.gas : n === 'brake' ? ctrl.brake : false),
    key: () => false,
    stick: { active: true, x: ctrl.steer || 0 },
    readLook: () => ({ dx: 0, dy: 0 }),
    lookTouch: { id: null },
    mouseDown: false,
  };
}

// steer toward a point a little ahead on the road's centre line
function follow(car, road, s) {
  const look = road.path.sample(Math.min(road.path.length, s + 12 + Math.abs(car.speed) * 0.6));
  const want = Math.atan2(look.x - car.pos.x, look.z - car.pos.z);
  let d = want - car.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  // yaw decreases when steering right (positive input)
  return Math.max(-1, Math.min(1, -d * 2.5));
}

function nearestS(road, x, z) {
  let best = 0;
  let bd = 1e9;
  for (let s = 0; s <= road.path.length; s += 2) {
    const p = road.path.sample(s);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return { s: best, d: bd };
}

function run(Car, name, careful = 0) {
  const car = new Car(game);
  car.occupied = true;
  const road = W.roads.find((r) => r.id === 'river');
  const p0 = road.path.sample(60);
  car.place(p0.x, p0.z, Math.atan2(p0.tx, p0.tz));
  const dt = 1 / 60;
  let t = 0;
  let t100 = null;
  let top = 0;
  let s = 60;
  const ctrl = { gas: true, brake: false, steer: 0 };
  let offRoad = 0;
  while (t < 60 && s < road.path.length - 40) {
    ctrl.steer = follow(car, road, s);
    // a careful driver lifts and brakes for the bends ahead
    if (careful) {
      let need = 1e9;
      for (let k = 10; k <= 120; k += 10) {
        const a = road.path.sample(Math.min(road.path.length, s + k));
        const b = road.path.sample(Math.min(road.path.length, s + k + 8));
        const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)), Math.cos(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz))));
        const R = 8 / Math.max(1e-3, turn);
        const vmax = Math.sqrt(careful * R);
        // what we could still brake down to over k metres
        need = Math.min(need, Math.sqrt(vmax * vmax + 2 * 20 * k));
      }
      ctrl.gas = car.speed < need - 1;
      ctrl.brake = car.speed > need + 2;
    }
    car.update(dt, input(ctrl), state);
    game.time += dt;
    t += dt;
    const n = nearestS(road, car.pos.x, car.pos.z);
    s = n.s;
    if (n.d > 6) offRoad++;
    const kmh = car.speed * 3.6;
    if (t100 === null && kmh >= 100) t100 = t;
    top = Math.max(top, kmh);
  }
  const avg = (s - 60) / t;
  // braking from where it is to a stop
  let brakeDist = 0;
  const v0 = car.speed * 3.6;
  ctrl.gas = false;
  ctrl.brake = true;
  careful = 0;
  let tb = 0;
  while (car.speed > 0.5 && tb < 20) {
    const px = car.pos.x;
    const pz = car.pos.z;
    ctrl.steer = follow(car, road, nearestS(road, car.pos.x, car.pos.z).s);
    car.update(dt, input(ctrl), state);
    brakeDist += Math.hypot(car.pos.x - px, car.pos.z - pz);
    tb += dt;
  }
  // off the road: the forest floor beside the clearing
  const off = new Car(game);
  off.occupied = true;
  off.place(-20, 180, 1.2);
  ctrl.gas = true;
  ctrl.brake = false;
  ctrl.steer = 0;
  let offTop = 0;
  for (let i = 0; i < 300; i++) {
    off.update(dt, input(ctrl), state);
    offTop = Math.max(offTop, off.speed * 3.6);
  }
  console.log(
    `${name.padEnd(9)} 0-100 km/h ${t100 ? t100.toFixed(1) + ' s' : 'never'} | top on the River Road ${top.toFixed(0)} km/h | average ${(avg * 3.6).toFixed(0)} km/h over ${(s - 60).toFixed(0)} m in ${t.toFixed(0)} s | off the road ${offRoad} frames | braking from ${v0.toFixed(0)} km/h: ${brakeDist.toFixed(0)} m in ${tb.toFixed(1)} s | forest floor ${offTop.toFixed(0)} km/h`
  );
}

run(HotRod, 'hot rod');
run(RaceCar, 'race car');
run(HotRod, 'rod, care', 60);
run(RaceCar, 'F1, care', 90);
