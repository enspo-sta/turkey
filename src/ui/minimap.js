// A small map that is always on screen: the land round you turning with your
// view (forward is up), with the water and roads of the full map, the places
// you know, your hot rod, the current goal and a charging grizzly. It zooms
// out while you drive, redraws about fifteen times a second into a small
// canvas, and opens the full map when tapped.
import { SIZE, HALF } from '../world/worldgen.js';

const FOOT_VIEW = 320; // metres across on foot
const DRIVE_VIEW = 760; // and while driving

export class Minimap {
  constructor(game, button, canvas, north, getGoal) {
    this.game = game;
    this.button = button;
    this.canvas = canvas;
    this.north = north;
    this.getGoal = getGoal;
    this.ctx = canvas.getContext('2d');
    this.view = FOOT_VIEW;
    this.t = 0;
    this.px = 1;
    this.image = null;
    this.last = { x: 1e9, z: 1e9, h: 1e9, v: 0 };
  }

  // The full map image (terrain, water, roads) from the map screen.
  setImage(img) {
    this.image = img;
    this.last.x = 1e9;
  }

  resize() {
    const r = this.button.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(40, Math.round(r.width * dpr));
    // (hidden, as at load, it measures nothing: sized again once it shows)
    this.sized = r.width > 0;
    if (px !== this.px) {
      this.px = px;
      this.canvas.width = this.canvas.height = px;
      this.last.x = 1e9;
    }
  }

  update(dt, heading) {
    this.t -= dt;
    this.pulse = (this.pulse || 0) + dt;
    const g = this.game;
    const driving = g.player.mode === 'drive';
    const target = driving ? DRIVE_VIEW : FOOT_VIEW;
    this.view += (target - this.view) * Math.min(1, dt * 2.5);
    if (this.t > 0) return;
    this.t = 1 / 15;
    if (!this.image || this.button.offsetParent === null) return;
    if (!this.sized) this.resize();
    const focus = driving ? g.car.pos : g.player.mode === 'boat' ? g.boat.pos : g.player.pos;
    const moved = Math.abs(focus.x - this.last.x) + Math.abs(focus.z - this.last.z);
    const turned = Math.abs(heading - this.last.h);
    const threat = g.bears && g.bears.threat;
    // nothing changed: skip the redraw (a charging bear always redraws)
    if (moved < 0.4 && turned < 0.01 && Math.abs(this.view - this.last.v) < 1 && !threat) return;
    this.last.x = focus.x;
    this.last.z = focus.z;
    this.last.h = heading;
    this.last.v = this.view;
    this.draw(focus.x, focus.z, heading);
  }

  draw(fx, fz, heading) {
    const g = this.game;
    const ctx = this.ctx;
    const S = this.px;
    const c = S / 2;
    const img = this.image;
    const perM = S / this.view; // canvas pixels per metre
    const imgPerM = img.width / SIZE; // map image pixels per metre
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#123040';
    ctx.fillRect(0, 0, S, S);
    // the map turned so that where you look is up
    ctx.translate(c, c);
    ctx.rotate(-heading);
    const k = perM / imgPerM;
    ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -(fx + HALF) * imgPerM, -(fz + HALF) * imgPerM);
    ctx.restore();

    const cs = Math.cos(-heading);
    const sn = Math.sin(-heading);
    const R = c - 4;
    // world position to canvas, optionally held at the rim when far away
    const at = (x, z, clampToRim) => {
      const dx = (x - fx) * perM;
      const dy = (z - fz) * perM;
      let u = dx * cs - dy * sn;
      let v = dx * sn + dy * cs;
      const d = Math.hypot(u, v);
      if (d > R) {
        if (!clampToRim) return null;
        u *= R / d;
        v *= R / d;
      }
      return [c + u, c + v, d > R];
    };
    const dot = (p, r, fill, stroke) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = Math.max(1, S / 90);
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };
    const unit = S / 118;
    const s = g.state;
    const goal = this.getGoal();
    for (const p of g.world.places) {
      const known = s.discovered[p.id];
      if (!known && p.id !== goal) continue;
      const q = at(p.x, p.z, p.id === goal);
      if (!q) continue;
      if (p.id === goal) {
        // the goal: a pulsing diamond, held at the rim when far off
        const r = (4.2 + Math.sin(this.pulse * 5) * 0.8) * unit;
        ctx.save();
        ctx.translate(q[0], q[1]);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#7fd6e8';
        ctx.strokeStyle = '#0c1a20';
        ctx.lineWidth = 1.5 * unit;
        ctx.fillRect(-r / 1.4, -r / 1.4, (r * 2) / 1.4, (r * 2) / 1.4);
        ctx.strokeRect(-r / 1.4, -r / 1.4, (r * 2) / 1.4, (r * 2) / 1.4);
        ctx.restore();
      } else dot(q, 3 * unit, '#f4ead6', '#1a1208');
    }
    // the cars you are not in: the hot rod red, the race car, once found,
    // in its aurora green
    const inCar = g.player.mode === 'drive' ? g.car : null;
    if (inCar !== g.hotrod) {
      const q = at(g.hotrod.pos.x, g.hotrod.pos.z, true);
      if (q) dot(q, 3.6 * unit, '#e8452c', '#1a0804');
    }
    if (g.racer && g.state.flags.racer && inCar !== g.racer) {
      const q = at(g.racer.pos.x, g.racer.pos.z, true);
      if (q) dot(q, 3.6 * unit, '#3dff9a', '#0b1a3a');
    }
    // where a fireball's stone came down
    const fall = g.state.meteorite;
    if (fall && !fall.found) {
      const q = at(fall.cx, fall.cz, true);
      if (q) {
        ctx.save();
        ctx.setLineDash([3 * unit, 2.5 * unit]);
        ctx.lineWidth = 1.4 * unit;
        ctx.strokeStyle = '#ffd36a';
        ctx.beginPath();
        ctx.arc(q[0], q[1], q[2] ? 4 * unit : Math.max(4 * unit, fall.r * perM), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    // the boat, moored or anchored somewhere
    const B = g.boat;
    if (B && B.owned && B.where === 'water' && g.player.mode !== 'boat') {
      const q = at(B.pos.x, B.pos.z, true);
      if (q) dot(q, 3.2 * unit, '#f2efe6', '#2d6fb0');
    }
    const threat = g.bears && g.bears.threat;
    if (threat) {
      const q = at(threat.x, threat.z, true);
      if (q) dot(q, (3.8 + Math.abs(Math.sin(this.pulse * 8)) * 1.6) * unit, '#ff3a2a', '#ffffff');
    }
    // you: an arrow pointing the way you face
    ctx.save();
    ctx.translate(c, c);
    ctx.beginPath();
    ctx.moveTo(0, -7 * unit);
    ctx.lineTo(5 * unit, 6 * unit);
    ctx.lineTo(0, 3 * unit);
    ctx.lineTo(-5 * unit, 6 * unit);
    ctx.closePath();
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    ctx.lineWidth = 1.6 * unit;
    ctx.strokeStyle = '#2a1204';
    ctx.stroke();
    ctx.restore();
    // north on the rim
    if (this.north) {
      const a = -heading;
      const r = 0.5 - 0.09;
      this.north.style.left = `${(0.5 + Math.sin(a) * r) * 100}%`;
      this.north.style.top = `${(0.5 - Math.cos(a) * r) * 100}%`;
    }
  }
}
