// The sky guide: the constellations' figures and names, the bright stars'
// names and the planets, drawn over the real night sky when you look up at a
// dark sky (Settings > Sky guide), and always from the observatory's deck
// chairs. Figures and names from d3-celestial (world/skydata.js).
import * as THREE from 'three';
import { LINES, CONSTELLATIONS, NAMED } from '../world/skydata.js';
import { eqVector } from '../world/astro.js';
import { smoothstep } from '../util/math.js';

function int16s(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Int16Array(u.buffer);
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();

export class SkyGuide {
  constructor(game) {
    this.game = game;
    const c = document.createElement('canvas');
    c.className = 'skyguide';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    document.getElementById('stage').appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    // the figures as polylines of directions in the equatorial frame
    const d = int16s(LINES);
    this.lines = [];
    let i = 0;
    while (i < d.length) {
      const n = d[i++];
      if (!n || i + n * 2 > d.length) break;
      const pts = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const ra = (d[i++] + 18000) / 100;
        const dec = d[i++] / 100;
        eqVector(ra, dec, _v).toArray(pts, k * 3);
      }
      this.lines.push(pts);
    }
    this.labels = CONSTELLATIONS.map((c2) => ({ name: c2.name, v: eqVector(c2.ra, c2.dec, new THREE.Vector3()) }));
    this.stars = NAMED.map((s) => ({ name: s.name, mag: s.mag, v: eqVector(s.ra, s.dec, new THREE.Vector3()) }));
    this.alpha = 0;
    this.drawn = false;
    this.forced = false;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.dpr = dpr;
  }

  // On screen: [x, y] in canvas pixels, or null behind the eye or under
  // the horizon.
  project(v, cam, W, H) {
    // (not in the last few degrees over the horizon, where the hills are)
    if (v.y < 0.06) return null;
    if (v.dot(_f) < 0.08) return null;
    _p.copy(v).multiplyScalar(1000).add(cam.position).project(cam);
    if (Math.abs(_p.x) > 1.3 || Math.abs(_p.y) > 1.3) return null;
    return [(_p.x * 0.5 + 0.5) * W, (-_p.y * 0.5 + 0.5) * H];
  }

  update(dt) {
    const g = this.game;
    const env = g.env;
    const P = g.player;
    const cam = g.camera;
    cam.getWorldDirection(_f);
    const on = g.state?.settings?.skyGuide !== false;
    const lookingUp = _f.y > 0.3;
    let want = 0;
    if (g.started && !g.menuOpen) {
      if (this.forced) want = 1;
      else if (on && P.mode === 'foot' && P.tool !== 'camera' && lookingUp) want = 0.8;
    }
    want *= smoothstep(0.45, 0.85, env.night) * (1 - smoothstep(0.55, 0.9, env.weather.cloud));
    this.alpha += (want - this.alpha) * Math.min(1, dt * 3);
    if (this.alpha < 0.01) {
      if (this.drawn) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawn = false;
      }
      return;
    }
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * (this.dpr || 1)) || !this.dpr) this.resize();
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const k = this.dpr;
    // nothing moved (lying still under a slowly turning sky): keep the
    // last drawing
    const q = cam.quaternion;
    // (the sky turns 15 degrees an hour: a 200th of an hour is about a pixel)
    const key = [q.x * 5000, q.y * 5000, q.z * 5000, q.w * 5000, cam.position.x * 50, cam.position.y * 50, cam.position.z * 50, env.lst * 200, this.alpha * 100, cam.fov * 20, W, H].map(Math.round).join(',');
    if (key === this.key && this.drawn) return;
    this.key = key;
    ctx.clearRect(0, 0, W, H);
    this.drawn = true;
    const M = env.uniforms.uEq.value;
    const a = this.alpha;
    // the figures
    ctx.strokeStyle = `rgba(150,190,255,${0.32 * a})`;
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    for (const pts of this.lines) {
      let pen = false;
      for (let i = 0; i < pts.length; i += 3) {
        _v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix3(M);
        const q = this.project(_v, cam, W, H);
        if (!q) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
        pen = true;
      }
    }
    ctx.stroke();
    // the constellations' names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(12 * k)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = `rgba(160,195,255,${0.55 * a})`;
    for (const L of this.labels) {
      _v.copy(L.v).applyMatrix3(M);
      const q = this.project(_v, cam, W, H);
      if (q) ctx.fillText(L.name.toUpperCase().split('').join(String.fromCharCode(8202)), q[0], q[1]);
    }
    // the bright stars' names
    ctx.textAlign = 'left';
    ctx.font = `500 ${Math.round(13 * k)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = `rgba(255,240,210,${0.7 * a})`;
    for (const S of this.stars) {
      _v.copy(S.v).applyMatrix3(M);
      const q = this.project(_v, cam, W, H);
      if (q) ctx.fillText(S.name, q[0] + 7 * k, q[1] - 6 * k);
    }
    // the planets and the Moon
    const A = env.astro;
    if (A) {
      ctx.font = `700 ${Math.round(14 * k)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle = `rgba(255,214,120,${0.85 * a})`;
      for (const p of A.planets) {
        eqVector(p.ra, p.dec, _v).applyMatrix3(M);
        const q = this.project(_v, cam, W, H);
        if (!q) continue;
        ctx.strokeStyle = `rgba(255,214,120,${0.6 * a})`;
        ctx.beginPath();
        ctx.arc(q[0], q[1], 7 * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(p.name, q[0] + 10 * k, q[1] + 10 * k);
      }
      _v.copy(env.uniforms.uMoonPos.value);
      const q = this.project(_v, cam, W, H);
      if (q) ctx.fillText('Moon', q[0] + 16 * k, q[1] + 16 * k);
    }
  }
}
