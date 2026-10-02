// Climbing at the Granite Tors (world/tors.js) on a top rope: the rope runs
// from your harness up to the anchor at the top and down to the club's belay
// device, so a slip is a short drop onto the rope, not a fall.
//
// You climb with your hands: push the stick (or WASD, or the arrow keys)
// toward the next hold, or tap a hold, and the hand that can reach it goes
// there. Every hold tires your fingers at its own rate, a crimp most and a
// jug least, and the steeper the rock the faster (an overhang wears you out
// three times as fast as a slab). CHALK dries your fingers and buys back
// some grip; a big hold on rock that is not overhanging lets you rest. Run
// out of grip and you come off: the rope holds you, you hang, and you can
// CLIMB ON when you have your breath back or LOWER OFF to the ground. Reach
// the lip at the top and you are up: you stand on the top of the tor, with
// the register to sign and the view, and LOWER OFF from the anchor when you
// are done.
import * as THREE from 'three';
import { HOLDS } from '../world/tors.js';
import { clamp, damp, smoothstep } from '../util/math.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();

// how far apart the hands can be, and how far a hand reaches from the body
const SPAN = 1.38;
const REACH = 1.75;

export class Climbing {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.state = 'off';
    this.route = null;
    this.hands = [null, null];
    this.handPos = [new THREE.Vector3(), new THREE.Vector3()];
    this.body = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.grip = 100;
    this.moveRepeat = 0;
    this.chalkCool = 0;
    this.marks = null;
  }

  get state0() {
    return this.game.state;
  }

  // ------------------------------------------------------------ starting
  start(routeId) {
    const g = this.game;
    const r = g.tors.route(routeId);
    if (!r) return false;
    const s = g.state;
    if (!s.gear.climbing) {
      g.hud.toast('You need climbing shoes, a harness and chalk: the Trading Post sells a climbing kit', 'bad', 5);
      return false;
    }
    const P = g.player;
    g.fishing.cancel?.();
    g.hunting.reset?.();
    this.route = r;
    this.active = true;
    this.state = 'climb';
    this.prevTool = P.tool;
    P.mode = 'climb';
    P.tool = 'none';
    P.running = false;
    g.viewmodel.setTool('none');
    // the two start holds: the lowest two, left and right
    const start = r.holds.filter((h) => h.main).sort((a, b) => a.p.y - b.p.y).slice(0, 2);
    start.sort((a, b) => a.u - b.u);
    this.hands = [start[0], start[1]];
    for (let k = 0; k < 2; k++) this.handPos[k].copy(this.hands[k].p).addScaledVector(this.hands[k].n, 0.03);
    this.grip = 100;
    this.moving = null;
    this.chalkT = 0;
    this.chalkCool = 0;
    this.fallT = 0;
    this.hangDrop = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.startedAt = g.time;
    this.highest = 0;
    this.falls = 0;
    // the camera slides from your eyes to the rock
    this.blend = 0;
    this.from = { pos: g.camera.position.clone(), quat: g.camera.quaternion.clone() };
    this.updateBody(1);
    g.audio.climbTick?.(0.5);
    const first = !s.flags.climbedOnce;
    if (first) {
      s.flags.climbedOnce = true;
      g.hud.toast('Push the stick up, or tap a hold, to reach. CHALK when your grip runs low; rest on the big holds', 'good', 7);
    } else g.hud.toast(`${r.name} · ${r.grade}. Climb on!`, 'good', 3);
    return true;
  }

  // Back on your feet: at the foot of the route, or on the top.
  finish(where = 'foot') {
    const g = this.game;
    const P = g.player;
    const r = this.route;
    this.active = false;
    this.state = 'off';
    P.mode = 'foot';
    P.tool = this.prevTool || 'none';
    g.viewmodel.setTool(P.tool === 'camera' ? 'none' : P.tool);
    if (where === 'top') {
      // stand back from the lip, looking out at the view
      P.place(r.top.x, r.top.z);
      P.yaw = Math.atan2(-r.n.x, -r.n.z) + Math.PI;
      P.pitch = -0.12;
    } else {
      P.place(r.base.x + r.n.x * 0.6, r.base.z + r.n.z * 0.6);
      P.yaw = Math.atan2(r.n.x, r.n.z);
      P.pitch = 0.2;
    }
    this.hideMarks();
    g.viewmodel.setClimbHands?.(null);
  }

  // From the top: down the rope to the foot of the route.
  lowerFromTop(routeId) {
    const g = this.game;
    const r = g.tors.route(routeId);
    if (!r) return;
    this.route = r;
    this.active = true;
    this.state = 'lower';
    g.player.mode = 'climb';
    this.prevTool = g.player.tool;
    g.player.tool = 'none';
    g.viewmodel.setTool('none');
    this.hands = [null, null];
    this.body.copy(r.lip.p).addScaledVector(r.lip.n, 0.55);
    this.body.y = r.lip.p.y - 0.6;
    this.lookYaw = 0;
    this.lookPitch = -0.4;
    this.blend = 0;
    this.from = { pos: g.camera.position.clone(), quat: g.camera.quaternion.clone() };
    g.hud.toast('Lowering off. Lean back and walk down the rock', 'good', 3);
  }

  // ------------------------------------------------------------ the wall
  // The rock's outward direction where you are: from the holds in your
  // hands, kept from pointing straight up or down.
  wallNormal(out) {
    const h0 = this.hands[0];
    const h1 = this.hands[1];
    if (h0 && h1) out.copy(h0.n).add(h1.n);
    else out.copy(this.route.n);
    out.addScaledVector(this.route.n, 0.6);
    out.y = clamp(out.y, -0.55, 0.45);
    return out.normalize();
  }

  // How hard the rock leans: 0.65 on a slab, 1 when it is upright, up to 3
  // under a roof.
  steepness() {
    const n = this.wallNormal(_c);
    const y = n.y;
    if (y > 0.12) return 0.65;
    if (y > -0.08) return 1;
    return 1 + 2.6 * Math.min(1, -y / 0.55);
  }

  // How fast the fingers come back, a second, on the holds in your hands:
  // a jug, with something decent for the other hand, on rock that is not
  // overhanging is a rest, and the better the holds the faster. 0 when
  // you are not resting.
  restRate() {
    if (!this.hands[0] || !this.hands[1] || this.steepness() > 1) return 0;
    const d0 = HOLDS[this.hands[0].kind].drain;
    const d1 = HOLDS[this.hands[1].kind].drain;
    const q = 0.7 * Math.min(d0, d1) + 0.3 * Math.max(d0, d1);
    return 6 * clamp((0.75 - q) / 0.4, 0, 1);
  }

  // Where the body hangs: under the hands, out from the rock.
  updateBody(k) {
    const r = this.route;
    if (!this.hands[0] || !this.hands[1]) return;
    const n = this.wallNormal(_a);
    const mid = _b.copy(this.handPos[0]).add(this.handPos[1]).multiplyScalar(0.5);
    const target = _c.copy(mid).addScaledVector(UP, -0.62).addScaledVector(n, 0.5);
    // never lower than standing at the foot
    target.y = Math.max(target.y, r.ground + 1.0);
    if (k >= 1) this.body.copy(target);
    else this.body.lerp(target, k);
  }

  // Can hand k (0 left, 1 right) get to hold h with the other one where it is?
  reachable(h, k) {
    const other = this.hands[1 - k];
    const mine = this.hands[k];
    if (!other || h === mine) return false;
    if (h === other) return false;
    const d = h.p.distanceTo(other.p);
    if (d > SPAN) return false;
    const dy = h.p.y - other.p.y;
    if (dy > 1.3 || dy < -1.05) return false;
    // (standing up on the feet adds a little to the reach)
    if (h.p.distanceTo(_d.copy(this.body).addScaledVector(UP, 0.45)) > REACH) return false;
    // the left hand stays left of the right, more or less
    const u = this.faceU(h.p) - this.faceU(other.p);
    if (k === 0 && u > 0.35) return false;
    if (k === 1 && u < -0.35) return false;
    return true;
  }

  // Across the face: metres to the right, as you look at the rock.
  faceU(p) {
    return p.x * this.route.right.x + p.z * this.route.right.z;
  }

  // The holds either hand can get to now: [{ h, k }]
  options() {
    const out = [];
    if (!this.route || !this.hands[0]) return out;
    _d.copy(this.body).addScaledVector(UP, 0.45);
    for (const h of this.route.holds) {
      if (h.p.distanceTo(_d) > REACH + 0.2) continue;
      for (let k = 0; k < 2; k++) if (this.reachable(h, k)) out.push({ h, k });
    }
    return out;
  }

  // The best move toward a direction (u right, v up, on the face), judged
  // from the hand that would make it: the lower hand going up is a move up
  // even when the new hold is level with the other hand.
  pickToward(du, dv) {
    const opts = this.options();
    const l = Math.hypot(du, dv) || 1;
    du /= l;
    dv /= l;
    let best = null;
    let bestS = -1e9;
    for (const o of opts) {
      const from = this.hands[o.k].p;
      const ou = this.faceU(o.h.p) - this.faceU(from);
      const ov = o.h.p.y - from.y;
      const ol = Math.hypot(ou, ov) || 1;
      const c = (ou * du + ov * dv) / ol;
      if (c < 0.5) continue;
      // the hand on that side, or the lower one going up
      const lowK = this.hands[0].p.y < this.hands[1].p.y ? 0 : 1;
      let handPref = 0;
      if (Math.abs(du) > 0.6) handPref = (du > 0) === (o.k === 1) ? 0.4 : -0.3;
      else handPref = o.k === lowK ? 0.35 : 0;
      const s = c * 2 + handPref + Math.min(ov, 0.9) * 0.4 * Math.max(0, dv) - HOLDS[o.h.kind].drain * 0.22 - Math.abs(ol - 0.7) * 0.4 + (o.h.main ? 0.25 : 0) + (o.h.kind === 'anchor' ? 2 : 0);
      if (s > bestS) {
        bestS = s;
        best = o;
      }
    }
    return best;
  }

  // The move a tap on the screen means: the reachable hold drawn nearest it.
  pickAtScreen(x, y) {
    const g = this.game;
    const cam = g.camera;
    const W = g.renderer.domElement.clientWidth || window.innerWidth;
    const H = g.renderer.domElement.clientHeight || window.innerHeight;
    let best = null;
    let bestD = Math.min(W, H) * 0.16;
    for (const o of this.options()) {
      _a.copy(o.h.p).project(cam);
      if (_a.z > 1) continue;
      const sx = (_a.x * 0.5 + 0.5) * W;
      const sy = (-_a.y * 0.5 + 0.5) * H;
      // a hold is a small target: the natural hand gets the benefit
      const d = Math.hypot(sx - x, sy - y) - (o.k === (sx > W / 2 ? 1 : 0) ? 6 : 0);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  reach(o) {
    const k = o.k;
    const from = this.handPos[k].clone();
    const to = o.h.p.clone().addScaledVector(o.h.n, 0.03);
    const dist = from.distanceTo(to);
    this.moving = { k, h: o.h, from, to, t: 0, dur: 0.32 + dist * 0.36 };
    // the effort of the move itself
    this.grip -= (1.5 + 3.4 * dist) * this.steepness() * HOLDS[o.h.kind].drain;
    this.game.audio.climbTick?.(0.6);
  }

  // ------------------------------------------------------------ frame
  update(dt, input) {
    const g = this.game;
    if (!this.active) return;
    const r = this.route;
    this.blend = Math.min(1, this.blend + dt * 2.2);
    this.chalkCool = Math.max(0, this.chalkCool - dt);
    // looking round: drag, within what a neck allows
    const look = input.readLook();
    this.lookYaw = clamp(this.lookYaw - look.dx, -1.25, 1.25);
    this.lookPitch = clamp(this.lookPitch - look.dy, -1.0, 1.15);
    const mv = input.readMove();
    const tap = input.takeTap?.();

    this.climbOnCool = Math.max(0, (this.climbOnCool || 0) - dt);
    if (this.state === 'climb') {
      // tiring: the two holds, the steepness; a rest on a big hold
      const recover = this.restRate();
      if (!this.moving && this.chalkT <= 0) {
        const q = (HOLDS[this.hands[0].kind].drain + HOLDS[this.hands[1].kind].drain) / 2;
        this.grip += (recover > 0 ? recover : -1.45 * this.steepness() * q) * dt;
      }
      this.grip = Math.min(100, this.grip);
      // chalk up: a hand to the bag and back
      const wantChalk = input.pressed('primary') || input.keyPressed('Space') || input.keyPressed('KeyC');
      if (wantChalk && !this.moving && this.chalkT <= 0 && this.chalkCool <= 0) {
        this.chalkT = 1.1;
        this.chalkHand = this.hands[0].p.y < this.hands[1].p.y ? 0 : 1;
        g.audio.chalk?.();
      }
      if (this.chalkT > 0) {
        this.chalkT -= dt;
        if (this.chalkT <= 0) {
          this.grip = Math.min(100, this.grip + 16);
          this.chalkCool = 3.5;
          g.effects?.puff?.(this.handPos[this.chalkHand], 0xf2f0ea);
        }
      }
      // lowering off the wall
      if (input.pressed('secondary') || input.keyPressed('Escape') || input.keyPressed('KeyL')) {
        this.state = 'lower';
        this.hands = [null, null];
        this.moving = null;
        g.hud.toast('Lowering off', 'good', 2);
      }
      // reaching
      this.moveRepeat -= dt;
      if (this.state === 'climb' && !this.moving && this.chalkT <= 0) {
        let o = null;
        if (tap) o = this.pickAtScreen(tap.x, tap.y);
        else if (Math.hypot(mv.x, mv.y) > 0.5 && this.moveRepeat <= 0) {
          o = this.pickToward(mv.x, -mv.y);
          if (!o) {
            this.moveRepeat = 0.4;
            if (!this.nudged) {
              this.nudged = true;
              g.hud.toast('Nothing in reach that way: try another direction, or tap a hold', '', 3);
            }
          }
        }
        if (o) {
          this.reach(o);
          this.moveRepeat = 0.12;
        }
      }
      if (this.moving) {
        const M = this.moving;
        M.t += dt / M.dur;
        const t = Math.min(1, M.t);
        const e = t * t * (3 - 2 * t);
        // the hand comes off the rock and back on in an arc
        this.handPos[M.k].lerpVectors(M.from, M.to, e).addScaledVector(M.h.n, Math.sin(t * Math.PI) * 0.16);
        this.updateBody(dt * 6);
        if (M.t >= 1) {
          this.hands[M.k] = M.h;
          this.handPos[M.k].copy(M.to);
          this.moving = null;
          this.highest = Math.max(this.highest, M.h.p.y - r.ground);
          if (M.h.kind === 'anchor') this.topOut();
        }
      } else this.updateBody(dt * 4);
      if (this.grip <= 0 && this.state === 'climb') this.slip();
    } else if (this.state === 'fall' || this.state === 'hang') {
      this.fallT += dt;
      // the drop onto the rope, the stretch and the bounce
      const drop = 1.45 * (1 - Math.exp(-this.fallT * 7)) - 0.25 * Math.sin(Math.min(this.fallT, 1.2) * 9) * Math.exp(-this.fallT * 3);
      this.body.y = this.fallFrom - drop;
      this.body.y = Math.max(this.body.y, r.ground + 1.0);
      if (this.state === 'fall' && this.fallT > 0.9) this.state = 'hang';
      if (this.state === 'hang') {
        this.grip = Math.min(70, this.grip + 12 * dt);
        if ((input.pressed('primary') || input.keyPressed('Space')) && this.grip > 25 && this.climbOnCool <= 0) this.climbOn();
        else if (input.pressed('secondary') || input.keyPressed('Escape') || input.keyPressed('KeyL')) this.state = 'lower';
      }
    } else if (this.state === 'lower') {
      // down the rock at walking pace, leaning out on the rope
      const target = r.ground + 1.0;
      this.body.y = Math.max(target, this.body.y - dt * 2.1);
      const n = r.n;
      // follow the face out from the rock
      const o = _a.set(this.body.x, this.body.y, this.body.z).addScaledVector(n, 2.5);
      const h = g.tors.hit(o, _b.copy(n).negate());
      if (h) {
        const want = h.point.clone().addScaledVector(n, 0.75);
        this.body.x = damp(this.body.x, want.x, 6, dt);
        this.body.z = damp(this.body.z, want.z, 6, dt);
      }
      if (this.body.y <= target + 0.01) {
        this.finish('foot');
        g.hud.toast('Back on the ground', 'good', 2);
        return;
      }
    } else if (this.state === 'top') {
      this.topT += dt;
      if (this.topT > 1.6) {
        this.finish('top');
        return;
      }
    }
    // resting, as the grip meter shows it: on a big hold, still
    this.resting = this.state === 'climb' && !this.moving && this.chalkT <= 0 && this.grip < 100 && this.restRate() > 0;
    // the pump: hands shake when grip runs low
    this.shake = smoothstep(32, 6, this.grip) * (this.state === 'climb' ? 1 : 0);
    this.showMarks();
    g.viewmodel.setClimbHands?.(this.state === 'climb' ? this : null);
  }

  slip() {
    const g = this.game;
    this.state = 'fall';
    this.fallT = 0;
    this.fallFrom = this.body.y;
    this.falls++;
    this.hands = [null, null];
    this.moving = null;
    this.grip = 0;
    g.hud.banner('TAKE!', 'bad', 'The rope has you');
    g.audio.climbFall?.();
    g.player.shake = Math.min(1.2, (g.player.shake || 0) + 0.6);
  }

  // Back on the rock from hanging on the rope: the belayer takes you in to
  // the line (under a roof the rope swings you out, so you pull yourself
  // back in) and you take the two best holds near where you fell from.
  climbOn() {
    const r = this.route;
    const y0 = this.fallFrom;
    const near = r.holds
      .filter((h) => h.kind !== 'anchor' && h.p.y > y0 - 0.9 && h.p.y < y0 + 1.1)
      .map((h) => ({ h, s: HOLDS[h.kind].drain * 0.6 + Math.abs(h.p.y - (y0 + 0.4)) + (h.main ? 0 : 0.5) }))
      .sort((a, b) => a.s - b.s);
    let pair = null;
    for (const a of near) {
      const b = near.find((x) => x.h !== a.h && x.h.p.distanceTo(a.h.p) < SPAN * 0.9 && x.h.p.distanceTo(a.h.p) > 0.25);
      if (b) {
        pair = [a.h, b.h];
        break;
      }
    }
    if (!pair) {
      this.climbOnCool = 2;
      this.game.hud.toast('Nothing to grab here: LOWER OFF and start again', 'bad', 3);
      return;
    }
    pair.sort((a, b) => this.faceU(a.p) - this.faceU(b.p));
    this.hands = pair;
    for (let k = 0; k < 2; k++) this.handPos[k].copy(pair[k].p).addScaledVector(pair[k].n, 0.03);
    this.state = 'climb';
    this.moving = null;
    this.game.audio.climbTick?.(0.5);
  }

  topOut() {
    const g = this.game;
    const r = this.route;
    const s = g.state;
    this.state = 'top';
    this.topT = 0;
    s.climb = s.climb || { sent: {}, signed: false, sample: false };
    const first = !s.climb.sent[r.id];
    const secs = Math.round(g.time - this.startedAt);
    const prev = s.climb.sent[r.id];
    s.climb.sent[r.id] = { day: g.env.day, secs: prev ? Math.min(prev.secs, secs) : secs, falls: prev ? Math.min(prev.falls, this.falls) : this.falls };
    g.audio.cheer?.();
    g.hud.banner('TOPPED OUT!', 'legend', `${r.name} · ${r.grade}${this.falls ? '' : ' · no falls'}`);
    g.announcer?.say('topout', { banner: false });
    if (first) {
      const pay = { steps: 60, stroll: 90, crack: 150, roof: 260 }[r.id] || 80;
      s.addMoney(pay);
      g.hud.toast(`First ascent of ${r.name} for you: the climbing club's bounty board pays ${'$' + pay}`, 'money', 5);
    }
    g.onEvent?.({ type: 'climb', route: r.id, grade: r.grade, count: Object.keys(s.climb.sent).length, falls: this.falls });
    g.save?.();
  }

  // ------------------------------------------------------------ camera
  applyCamera(cam) {
    const g = this.game;
    const r = this.route;
    if (!r) return;
    const n = this.state === 'climb' ? this.wallNormal(_a) : _a.copy(r.n);
    // the eye: over the chest, out from the rock
    this.eye.copy(this.body).addScaledVector(UP, 0.22);
    if (this.shake > 0) {
      const t = g.time;
      this.eye.x += Math.sin(t * 41) * 0.006 * this.shake;
      this.eye.y += Math.sin(t * 37 + 1) * 0.006 * this.shake;
    }
    // looking at the rock where the hands are, a little up
    let look;
    if (this.state === 'climb' && this.hands[0] && this.hands[1]) look = _b.copy(this.handPos[0]).add(this.handPos[1]).multiplyScalar(0.5);
    else look = _b.copy(this.eye).addScaledVector(n, -1).addScaledVector(UP, this.state === 'lower' ? -0.5 : 0.35);
    const dir = _c.subVectors(look, this.eye).normalize();
    const yaw0 = Math.atan2(-dir.x, -dir.z);
    const pitch0 = Math.asin(clamp(dir.y, -1, 1));
    const yaw = yaw0 + this.lookYaw;
    const pitch = clamp(pitch0 + this.lookPitch, -1.35, 1.4);
    cam.position.copy(this.eye);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    // sliding in from where the eyes were when you stepped up to the rock
    if (this.blend < 1 && this.from) {
      const k = smoothstep(0, 1, this.blend);
      cam.position.lerpVectors(this.from.pos, this.eye, k);
      const q = this.from.quat.clone().slerp(cam.quaternion.clone(), k);
      cam.quaternion.copy(q);
    }
  }

  // ------------------------------------------------------------ marks
  // Faint rings on the holds in reach, brighter on the one the stick points at.
  showMarks() {
    const g = this.game;
    if (this.state !== 'climb' || this.moving) {
      this.hideMarks();
      return;
    }
    if (!this.marks) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.strokeStyle = 'rgba(255,255,255,0.95)';
      x.lineWidth = 6;
      x.beginPath();
      x.arc(32, 32, 24, 0, Math.PI * 2);
      x.stroke();
      const tex = new THREE.CanvasTexture(c);
      this.marks = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5, color: 0xfff3c8 }));
        m.scale.set(0.2, 0.2, 1);
        m.renderOrder = 5;
        m.visible = false;
        g.scene.add(m);
        this.marks.push(m);
      }
    }
    const opts = this.options();
    const seen = new Set();
    let i = 0;
    for (const o of opts) {
      if (seen.has(o.h) || i >= this.marks.length) continue;
      seen.add(o.h);
      const m = this.marks[i++];
      m.visible = true;
      m.position.copy(o.h.p).addScaledVector(o.h.n, 0.08);
      m.material.opacity = 0.32 + 0.12 * Math.sin(g.time * 3 + i);
      m.material.color.set(o.h.kind === 'anchor' ? 0x7cff8a : o.h.kind === 'jug' ? 0xd8ffe0 : 0xfff3c8);
    }
    for (; i < this.marks.length; i++) this.marks[i].visible = false;
  }

  hideMarks() {
    if (this.marks) for (const m of this.marks) m.visible = false;
  }

  // The hands in the eye's frame, for the first-person arms.
  handMatrix(k, cam, out) {
    const h = this.hands[k];
    const n = h ? h.n : this.route.n;
    const wallUp = _a.copy(UP).addScaledVector(n, -UP.dot(n)).normalize();
    const z = _b.copy(n);
    const x = _c.crossVectors(wallUp, z).normalize();
    _m.makeBasis(x, wallUp, z);
    _m.setPosition(this.handPos[k]);
    out.copy(cam.matrixWorldInverse).multiply(_m);
    return out;
  }
}
